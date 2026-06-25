import fs from "fs";
import path from "path";
import type {
  CanvasFreeNode,
  CanvasPageLayout,
  CanvasState,
} from "@opencode-workbench/shared/demo";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function parseLayout(value: unknown): CanvasPageLayout | null {
  if (!isRecord(value)) return null;

  const x = readNumber(value, "x");
  const y = readNumber(value, "y");
  const width = readNumber(value, "width");
  const height = readNumber(value, "height");
  const zIndex = readNumber(value, "zIndex");

  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
    ...(zIndex === null ? {} : { zIndex }),
  };
}

function parseCanvasNode(value: unknown): CanvasFreeNode | null {
  if (!isRecord(value)) return null;

  const id = readString(value, "id");
  const kind = readString(value, "kind");
  const title = readString(value, "title");
  const layout = parseLayout(value.layout);
  const createdAt = readNumber(value, "createdAt");
  const updatedAt = readNumber(value, "updatedAt");

  if (!id || !kind || !title || !layout || createdAt === null || updatedAt === null) {
    return null;
  }

  const base = { id, title, layout, createdAt, updatedAt };

  if (kind === "document") {
    const markdown = readString(value, "markdown");
    if (markdown === null) return null;
    return { ...base, kind, markdown };
  }

  if (kind === "image") {
    const src = readString(value, "src");
    const fileName = readString(value, "fileName");
    if (!src) return null;
    return { ...base, kind, src, ...(fileName ? { fileName } : {}) };
  }

  return null;
}

export function parseCanvasState(value: unknown): CanvasState | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value.viewport) || !isRecord(value.pages)) return null;

  const viewportX = readNumber(value.viewport, "x");
  const viewportY = readNumber(value.viewport, "y");
  const zoom = readNumber(value.viewport, "zoom");

  if (viewportX === null || viewportY === null || zoom === null || zoom <= 0) {
    return null;
  }

  const pages: Record<string, CanvasPageLayout> = {};
  for (const [pageId, layoutValue] of Object.entries(value.pages)) {
    const layout = parseLayout(layoutValue);
    if (!layout) return null;
    pages[pageId] = layout;
  }

  let nodes: Record<string, CanvasFreeNode> | undefined;
  if (isRecord(value.nodes)) {
    nodes = {};
    for (const [nodeId, nodeValue] of Object.entries(value.nodes)) {
      const node = parseCanvasNode(nodeValue);
      if (!node || node.id !== nodeId) return null;
      nodes[nodeId] = node;
    }
  }

  return {
    viewport: {
      x: viewportX,
      y: viewportY,
      zoom,
    },
    pages,
    ...(nodes ? { nodes } : {}),
  };
}

export function readCanvasStateFromWorkspace(workspacePath: string): CanvasState | undefined {
  const layoutPath = path.join(workspacePath, ".canvas-layout.json");
  if (!fs.existsSync(layoutPath)) return undefined;

  try {
    const parsed = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as unknown;
    if (!isRecord(parsed)) return undefined;
    return parseCanvasState(parsed.state) ?? undefined;
  } catch {
    return undefined;
  }
}
