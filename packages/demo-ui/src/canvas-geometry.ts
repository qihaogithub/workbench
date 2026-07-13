import type {
  CanvasPageLayout,
  CanvasViewportState,
  AlignmentGuide,
  CanvasDocumentNode,
} from "./types";
import { getCanvasDocumentEntries } from "./canvas-kernel";

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SNAP_THRESHOLD = 8; // 吸附阈值（px）

export const PAGE_GROUP_DIRECTORY_WIDTH = 160;
export const PAGE_GROUP_DIRECTORY_GAP = 8;
export const PAGE_GROUP_MIN_WIDTH = 100;
export const PAGE_GROUP_MIN_HEIGHT = 100;
export const PAGE_GROUP_EDGE_HIT_SIZE = 8;

interface AlignmentPoint {
  position: number;
  edgeType: "left" | "right" | "center-x" | "top" | "bottom" | "center-y";
}

export function getVisiblePageIds(
  pages: Record<string, CanvasPageLayout>,
  viewport: CanvasViewportState,
  containerWidth: number,
  containerHeight: number,
  buffer: number = 200,
): Set<string> {
  const visible = new Set<string>();
  if (containerWidth === 0 || containerHeight === 0) {
    for (const id of Object.keys(pages)) visible.add(id);
    return visible;
  }

  const vx = -viewport.x / viewport.zoom;
  const vy = -viewport.y / viewport.zoom;
  const vw = containerWidth / viewport.zoom;
  const vh = containerHeight / viewport.zoom;

  for (const [id, layout] of Object.entries(pages)) {
    if (
      layout.x + layout.width + buffer > vx &&
      layout.x - buffer < vx + vw &&
      layout.y + layout.height + buffer > vy &&
      layout.y - buffer < vy + vh
    ) {
      visible.add(id);
    }
  }
  return visible;
}

export function getCanvasLayoutSignature(
  layouts: Record<string, CanvasPageLayout>,
): string {
  return Object.entries(layouts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, layout]) =>
      [
        id,
        layout.x,
        layout.y,
        layout.width,
        layout.height,
        layout.zIndex ?? "",
      ].join(":"),
    )
    .join("|");
}

export function areStringListsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

export function getLayoutBounds(layouts: CanvasPageLayout[]): CanvasRect | null {
  if (layouts.length === 0) return null;
  const left = Math.min(...layouts.map((layout) => layout.x));
  const top = Math.min(...layouts.map((layout) => layout.y));
  const right = Math.max(...layouts.map((layout) => layout.x + layout.width));
  const bottom = Math.max(...layouts.map((layout) => layout.y + layout.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function sortDocumentNodesByLayout(
  nodes: CanvasDocumentNode[],
): CanvasDocumentNode[] {
  return [...nodes].sort((a, b) => {
    const yDiff = a.layout.y - b.layout.y;
    if (Math.abs(yDiff) > 1) return yDiff;
    return a.layout.x - b.layout.x;
  });
}

export function sortPageIdsByLayout(
  pageIds: string[],
  layouts: Record<string, CanvasPageLayout>,
): string[] {
  return [...pageIds].sort((a, b) => {
    const layoutA = layouts[a];
    const layoutB = layouts[b];
    if (!layoutA && !layoutB) return a.localeCompare(b);
    if (!layoutA) return 1;
    if (!layoutB) return -1;
    const yDiff = layoutA.y - layoutB.y;
    if (Math.abs(yDiff) > 1) return yDiff;
    const xDiff = layoutA.x - layoutB.x;
    if (Math.abs(xDiff) > 1) return xDiff;
    return a.localeCompare(b);
  });
}

export function rectsIntersect(a: CanvasRect, b: CanvasRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function getAlignmentPoints(layout: CanvasPageLayout): AlignmentPoint[] {
  return [
    { position: layout.x, edgeType: "left" },
    { position: layout.x + layout.width, edgeType: "right" },
    { position: layout.x + layout.width / 2, edgeType: "center-x" },
    { position: layout.y, edgeType: "top" },
    { position: layout.y + layout.height, edgeType: "bottom" },
    { position: layout.y + layout.height / 2, edgeType: "center-y" },
  ];
}

export function computeAlignment(
  movingLayout: CanvasPageLayout,
  otherLayouts: CanvasPageLayout[],
  isResizing: boolean,
  edge?: string,
): { layout: CanvasPageLayout; guides: AlignmentGuide[] } {
  const guides: AlignmentGuide[] = [];
  let snappedX: number | undefined;
  let snappedY: number | undefined;

  const movingPoints = getAlignmentPoints(movingLayout);

  for (const other of otherLayouts) {
    const otherPoints = getAlignmentPoints(other);

    // 水平对齐（X轴）
    for (const mp of movingPoints) {
      if (mp.edgeType === "center-x") {
        for (const op of otherPoints) {
          if (op.edgeType === "center-x") {
            const diff = Math.abs(mp.position - op.position);
            if (diff < SNAP_THRESHOLD) {
              snappedX = op.position - (movingLayout.x + movingLayout.width / 2);
              guides.push({
                type: "vertical",
                position: op.position,
                start: Math.min(movingLayout.y, other.y) - 10,
                end: Math.max(movingLayout.y + movingLayout.height, other.y + other.height) + 10,
              });
            }
          }
        }
      }
    }

    // 边缘对齐
    const leftRightPairs: [string, string][] = [
      ["left", "left"],
      ["left", "right"],
      ["right", "left"],
      ["right", "right"],
    ];
    for (const [mpType, opType] of leftRightPairs) {
      const mp = movingPoints.find((p) => p.edgeType === mpType);
      const op = otherPoints.find((p) => p.edgeType === opType);
      if (mp && op) {
        const diff = Math.abs(mp.position - op.position);
        if (diff < SNAP_THRESHOLD) {
          if (mpType === "left") {
            snappedX = op.position - movingLayout.x;
          } else {
            snappedX = op.position - (movingLayout.x + movingLayout.width);
          }
          guides.push({
            type: "vertical",
            position: op.position,
            start: Math.min(movingLayout.y, other.y) - 10,
            end: Math.max(movingLayout.y + movingLayout.height, other.y + other.height) + 10,
          });
        }
      }
    }

    // 垂直对齐（Y轴）
    for (const mp of movingPoints) {
      if (mp.edgeType === "center-y") {
        for (const op of otherPoints) {
          if (op.edgeType === "center-y") {
            const diff = Math.abs(mp.position - op.position);
            if (diff < SNAP_THRESHOLD) {
              snappedY = op.position - (movingLayout.y + movingLayout.height / 2);
              guides.push({
                type: "horizontal",
                position: op.position,
                start: Math.min(movingLayout.x, other.x) - 10,
                end: Math.max(movingLayout.x + movingLayout.width, other.x + other.width) + 10,
              });
            }
          }
        }
      }
    }

    // 上下边缘对齐
    const topBottomPairs: [string, string][] = [
      ["top", "top"],
      ["top", "bottom"],
      ["bottom", "top"],
      ["bottom", "bottom"],
    ];
    for (const [mpType, opType] of topBottomPairs) {
      const mp = movingPoints.find((p) => p.edgeType === mpType);
      const op = otherPoints.find((p) => p.edgeType === opType);
      if (mp && op) {
        const diff = Math.abs(mp.position - op.position);
        if (diff < SNAP_THRESHOLD) {
          if (mpType === "top") {
            snappedY = op.position - movingLayout.y;
          } else {
            snappedY = op.position - (movingLayout.y + movingLayout.height);
          }
          guides.push({
            type: "horizontal",
            position: op.position,
            start: Math.min(movingLayout.x, other.x) - 10,
            end: Math.max(movingLayout.x + movingLayout.width, other.x + other.width) + 10,
          });
        }
      }
    }
  }

  const result = { ...movingLayout };
  if (snappedX !== undefined) {
    result.x = result.x + snappedX;
  }
  if (snappedY !== undefined) {
    result.y = result.y + snappedY;
  }

  return { layout: result, guides };
}

export function detectPageGroupResizeEdge(
  localX: number,
  localY: number,
  width: number,
  height: number,
): string | null {
  const nearLeft = localX <= PAGE_GROUP_EDGE_HIT_SIZE;
  const nearRight = localX >= width - PAGE_GROUP_EDGE_HIT_SIZE;
  const nearTop = localY <= PAGE_GROUP_EDGE_HIT_SIZE;
  const nearBottom = localY >= height - PAGE_GROUP_EDGE_HIT_SIZE;

  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (nearTop) return "n";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  if (nearRight) return "e";
  return null;
}

export function resizePageGroupLayout(
  start: CanvasPageLayout,
  edge: string,
  dx: number,
  dy: number,
  aspectRatio: number,
): CanvasPageLayout {
  const clampedAspectRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : start.width / start.height;
  const isNorth = edge.includes("n");
  const isSouth = edge.includes("s");
  const isWest = edge.includes("w");
  const isEast = edge.includes("e");
  const clampWidth = (value: number) => Math.max(PAGE_GROUP_MIN_WIDTH, value);
  const clampHeight = (value: number) => Math.max(PAGE_GROUP_MIN_HEIGHT, value);
  let width = start.width;
  let height = start.height;

  if (isEast) width = clampWidth(start.width + dx);
  if (isWest) width = clampWidth(start.width - dx);
  if (isSouth) height = clampHeight(start.height + dy);
  if (isNorth) height = clampHeight(start.height - dy);

  if (Math.abs(width - start.width) / clampedAspectRatio > Math.abs(height - start.height)) {
    height = clampHeight(width / clampedAspectRatio);
  } else {
    width = clampWidth(height * clampedAspectRatio);
  }

  let x = start.x;
  let y = start.y;
  if (edge.includes("w")) {
    x = start.x + (start.width - width);
  }
  if (edge.includes("n")) {
    y = start.y + (start.height - height);
  }

  return { ...start, x, y, width, height };
}

export function getDocumentNodeKnowledgeIds(node: CanvasDocumentNode): string[] {
  return getCanvasDocumentEntries(node).map(
    (entry) => entry.knowledgeDocument.id,
  );
}
