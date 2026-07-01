import type {
  CanvasPageData,
  CanvasPageLayout,
  CanvasViewportState,
} from "./types";

const DEFAULT_PAGE_SIZE = { width: 375, height: 812 };
const INITIAL_LAYOUT_COLUMNS = 3;
const INITIAL_LAYOUT_GAP = 40;
const AUTO_LAYOUT_GAP = 48;
const AUTO_LAYOUT_GRID_SIZE = 8;
const AUTO_LAYOUT_ROW_THRESHOLD_RATIO = 0.35;
const AUTO_LAYOUT_MAX_ROW_THRESHOLD = 180;
const AUTO_LAYOUT_COLUMN_ALIGN_THRESHOLD = 140;

export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

interface AutoCanvasLayoutOptions {
  currentLayout?: Record<string, CanvasPageLayout>;
}

interface FitViewportOptions {
  containerWidth: number;
  containerHeight: number;
  paddingRatio?: number;
  minZoom?: number;
  maxZoom?: number;
}

function parsePreviewDimension(
  value: string | number | undefined,
  fallback: number,
): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/px$/, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

export function resolveCanvasPageSize(
  previewSize?: CanvasPageData["previewSize"],
): { width: number; height: number } {
  return {
    width: parsePreviewDimension(previewSize?.width, DEFAULT_PAGE_SIZE.width),
    height: parsePreviewDimension(previewSize?.height, DEFAULT_PAGE_SIZE.height),
  };
}

export function getCanvasPreviewSizeKey(
  previewSize?: CanvasPageData["previewSize"],
): string {
  const size = resolveCanvasPageSize(previewSize);
  return `${size.width}x${size.height}`;
}

function isSameCanvasSize(
  layout: Pick<CanvasPageLayout, "width" | "height">,
  size: { width: number; height: number },
): boolean {
  return (
    Math.abs(layout.width - size.width) < 1 &&
    Math.abs(layout.height - size.height) < 1
  );
}

export function normalizeCanvasPageLayout(
  page: CanvasPageData,
  layout: CanvasPageLayout | undefined,
  fallbackLayout?: CanvasPageLayout,
): CanvasPageLayout {
  const size = resolveCanvasPageSize(page.previewSize);
  const previewSizeKey = getCanvasPreviewSizeKey(page.previewSize);
  const positionSource = layout ?? fallbackLayout;
  const baseLayout: CanvasPageLayout = {
    x: positionSource?.x ?? 0,
    y: positionSource?.y ?? 0,
    width: size.width,
    height: size.height,
    zIndex: positionSource?.zIndex,
    sizeMode: "preview",
    previewSizeKey,
  };

  if (!layout) {
    return baseLayout;
  }

  if (layout.sizeMode === "custom" && layout.previewSizeKey === previewSizeKey) {
    return layout;
  }

  if (layout.sizeMode === "preview" && layout.previewSizeKey === previewSizeKey) {
    return {
      ...layout,
      width: size.width,
      height: Math.max(layout.height, size.height),
      sizeMode: "preview",
      previewSizeKey,
    };
  }

  if (layout.sizeMode === undefined && isSameCanvasSize(layout, size)) {
    return {
      ...layout,
      sizeMode: "preview",
      previewSizeKey,
    };
  }

  if (
    layout.sizeMode === undefined &&
    Math.abs(layout.width - size.width) < 1 &&
    layout.height > size.height
  ) {
    return {
      ...layout,
      width: size.width,
      sizeMode: "preview",
      previewSizeKey,
    };
  }

  return baseLayout;
}

export function normalizeCanvasPageLayouts(
  pages: CanvasPageData[],
  savedLayout: Record<string, CanvasPageLayout>,
): Record<string, CanvasPageLayout> {
  const baseLayout = computeInitialCanvasLayout(pages);
  return Object.fromEntries(
    pages.map((page) => [
      page.id,
      normalizeCanvasPageLayout(page, savedLayout[page.id], baseLayout[page.id]),
    ]),
  );
}

export function resolveCanvasContentHeightLayout(
  page: CanvasPageData,
  layout: CanvasPageLayout,
  contentHeight: number,
  measuredWidth?: number,
): CanvasPageLayout | null {
  const size = resolveCanvasPageSize(page.previewSize);
  if (contentHeight <= size.height) {
    return null;
  }

  const previewSizeKey = getCanvasPreviewSizeKey(page.previewSize);
  const sourceWidth =
    measuredWidth && Number.isFinite(measuredWidth) && measuredWidth > 0
      ? measuredWidth
      : size.width;
  const isCurrentCustomSize =
    layout.sizeMode === "custom" && layout.previewSizeKey === previewSizeKey;
  const targetWidth = isCurrentCustomSize ? layout.width : size.width;
  const scale = targetWidth / sourceWidth;
  const nextHeight = contentHeight * scale;

  if (
    Math.abs(targetWidth - layout.width) < 1 &&
    Math.abs(nextHeight - layout.height) < 1
  ) {
    return null;
  }

  return {
    ...layout,
    width: targetWidth,
    height: nextHeight,
    sizeMode: isCurrentCustomSize ? "custom" : "preview",
    previewSizeKey,
  };
}

export function computeInitialCanvasLayout(
  pages: CanvasPageData[],
): Record<string, CanvasPageLayout> {
  const layout: Record<string, CanvasPageLayout> = {};
  let maxColWidth = 0;
  const pageSizes = pages.map((page) => {
    const size = resolveCanvasPageSize(page.previewSize);
    if (size.width > maxColWidth) maxColWidth = size.width;
    return size;
  });

  pages.forEach((page, index) => {
    const col = index % INITIAL_LAYOUT_COLUMNS;
    const row = Math.floor(index / INITIAL_LAYOUT_COLUMNS);
    const size = pageSizes[index];

    layout[page.id] = {
      x: col * (maxColWidth + INITIAL_LAYOUT_GAP),
      y: row * (DEFAULT_PAGE_SIZE.height + INITIAL_LAYOUT_GAP),
      width: size.width,
      height: size.height,
      zIndex: index,
      sizeMode: "preview",
      previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
    };
  });

  return layout;
}

export function computeAutoCanvasLayout(
  pages: CanvasPageData[],
  options: AutoCanvasLayoutOptions = {},
): Record<string, CanvasPageLayout> {
  if (pages.length === 0) {
    return {};
  }

  const items = pages
    .map((page, index) => {
      const fallbackSize = resolveCanvasPageSize(page.previewSize);
      const existing = options.currentLayout?.[page.id];

      return {
        page,
        index,
        layout: existing ?? {
          x: index * (fallbackSize.width + AUTO_LAYOUT_GAP),
          y: 0,
          width: fallbackSize.width,
          height: fallbackSize.height,
          zIndex: index,
          sizeMode: "preview",
          previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
        },
      };
    })
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);

  const medianHeight = median(items.map((item) => item.layout.height));
  const rowThreshold = Math.min(
    AUTO_LAYOUT_MAX_ROW_THRESHOLD,
    Math.max(80, medianHeight * AUTO_LAYOUT_ROW_THRESHOLD_RATIO),
  );

  const rows: Array<{
    items: typeof items;
    yValues: number[];
  }> = [];

  for (const item of items) {
    const matchingRow = rows.find((row) => {
      const rowY = median(row.yValues);
      return Math.abs(item.layout.y - rowY) <= rowThreshold;
    });

    if (matchingRow) {
      matchingRow.items.push(item);
      matchingRow.yValues.push(item.layout.y);
    } else {
      rows.push({ items: [item], yValues: [item.layout.y] });
    }
  }

  rows.sort((a, b) => median(a.yValues) - median(b.yValues));

  let previousArrangedY = 0;
  let previousArrangedHeight = 0;
  const arrangedRows = rows.map((row, rowIndex) => {
    const rowItems = [...row.items].sort(
      (a, b) => a.layout.x - b.layout.x || a.index - b.index,
    );
    const rowY = snapToGrid(median(row.yValues));
    const maxHeight = Math.max(...rowItems.map((item) => item.layout.height));
    const minY =
      rowIndex > 0
        ? previousArrangedY + previousArrangedHeight + AUTO_LAYOUT_GAP
        : rowY;
    const y = Math.max(rowY, minY);

    previousArrangedY = y;
    previousArrangedHeight = maxHeight;

    return {
      items: rowItems,
      y,
    };
  });

  const layout: Record<string, CanvasPageLayout> = {};
  const previousRowAnchors: Array<{ x: number; centerX: number }> = [];

  arrangedRows.forEach((row, rowIndex) => {
    let previousRight = -Infinity;
    const currentAnchors: Array<{ x: number; centerX: number }> = [];

    row.items.forEach((item) => {
      const snappedX = snapToGrid(item.layout.x);
      const nearestAnchor =
        rowIndex > 0
          ? findNearestAnchor(item.layout, previousRowAnchors)
          : undefined;
      const alignedX = nearestAnchor?.x ?? snappedX;
      const minX =
        Number.isFinite(previousRight) ? previousRight + AUTO_LAYOUT_GAP : alignedX;
      const x = Math.max(alignedX, minX);

      layout[item.page.id] = {
        ...item.layout,
        x,
        y: row.y,
      };

      previousRight = x + item.layout.width;
      currentAnchors.push({
        x,
        centerX: x + item.layout.width / 2,
      });
    });

    previousRowAnchors.splice(0, previousRowAnchors.length, ...currentAnchors);
  });

  return layout;
}

function snapToGrid(value: number): number {
  return Math.round(value / AUTO_LAYOUT_GRID_SIZE) * AUTO_LAYOUT_GRID_SIZE;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function findNearestAnchor(
  layout: CanvasPageLayout,
  anchors: Array<{ x: number; centerX: number }>,
): { x: number; centerX: number } | undefined {
  const centerX = layout.x + layout.width / 2;
  let nearest: { x: number; centerX: number } | undefined;
  let nearestDistance = Infinity;

  for (const anchor of anchors) {
    const distance = Math.abs(centerX - anchor.centerX);
    if (distance < nearestDistance) {
      nearest = anchor;
      nearestDistance = distance;
    }
  }

  return nearestDistance <= AUTO_LAYOUT_COLUMN_ALIGN_THRESHOLD
    ? nearest
    : undefined;
}

export function getCanvasLayoutBounds(
  pages: Record<string, CanvasPageLayout>,
): CanvasBounds | null {
  const pageLayouts = Object.values(pages);
  if (pageLayouts.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const page of pageLayouts) {
    minX = Math.min(minX, page.x);
    minY = Math.min(minY, page.y);
    maxX = Math.max(maxX, page.x + page.width);
    maxY = Math.max(maxY, page.y + page.height);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function computeFitCanvasViewport(
  pages: Record<string, CanvasPageLayout>,
  {
    containerWidth,
    containerHeight,
    paddingRatio = 0.9,
    minZoom = 0.05,
    maxZoom = 3,
  }: FitViewportOptions,
): CanvasViewportState | null {
  if (containerWidth === 0 || containerHeight === 0) {
    return null;
  }

  const bounds = getCanvasLayoutBounds(pages);
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return null;
  }

  const zoom = Math.min(
    containerWidth / bounds.width,
    containerHeight / bounds.height,
  ) * paddingRatio;
  const clampedZoom = Math.min(Math.max(zoom, minZoom), maxZoom);
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  return {
    x: containerWidth / 2 - centerX * clampedZoom,
    y: containerHeight / 2 - centerY * clampedZoom,
    zoom: clampedZoom,
  };
}
