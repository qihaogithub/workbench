import * as fs from "fs";
import crypto from "crypto";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { resolvePagePresentation } from "@workbench/shared";
import type { AgentConfig } from "../../core/types";
import { aiMutationDeniedResult, assertAiMutationAllowed } from "./ai-mutation-policy";
import { logger } from "../../utils/logger";
import { resolveLiveWorkspaceMutationContext } from "../../workspace/workspace-mutation-authority";
import { isSafePageId, getPageDir, listPages } from "./workspace-page-utils";

const CANVAS_LAYOUT_FILENAME = ".canvas-layout.json";
const DEFAULT_PAGE_SIZE = { width: 375, height: 812 };
const DEFAULT_VIEWPORT_SIZE = { width: 1440, height: 900 };
const DEFAULT_INITIAL_COLUMNS = 3;
const DEFAULT_INITIAL_GAP = 40;
const DEFAULT_ARRANGE_GAP = 48;
const AUTO_LAYOUT_GRID_SIZE = 8;
const AUTO_LAYOUT_ROW_THRESHOLD_RATIO = 0.35;
const AUTO_LAYOUT_MAX_ROW_THRESHOLD = 180;
const AUTO_LAYOUT_COLUMN_ALIGN_THRESHOLD = 140;

interface PreviewSize {
  width?: number | string;
  height?: number | string;
}

interface CanvasPageData {
  id: string;
  name: string;
  order: number;
  previewSize?: PreviewSize;
}

interface CanvasPageLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  sizeMode?: "preview" | "custom";
  previewSizeKey?: string;
}

interface CanvasViewportState {
  x: number;
  y: number;
  zoom: number;
}

interface CanvasState {
  pages: Record<string, CanvasPageLayout>;
  viewport: CanvasViewportState;
  nodes?: unknown;
  layers?: unknown;
  hiddenKnowledgeDocumentIds?: string[];
  [key: string]: unknown;
}

interface StoredCanvasLayout {
  version: 1;
  projectId?: string;
  updatedAt: number;
  state: CanvasState;
}

interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

interface CanvasSectionSummary {
  id: string;
  title: string;
  bounds: CanvasPageLayout;
  parentId?: string;
  childCounts: { pages: number; nodes: number; sections: number };
}

interface CanvasSectionChild {
  kind: "page" | "node" | "section";
  id: string;
}

interface CanvasSectionRecord {
  id: string;
  kind: "section";
  layout: CanvasPageLayout;
  children: CanvasSectionChild[];
}

interface CanvasArrangeUnit {
  id: string;
  bounds: CanvasPageLayout;
  pageIds: string[];
  nodeIds: string[];
  sectionIds: string[];
}

type ArrangeMode = "preserveGroups" | "grid";
type CanvasOrderBy = "currentPosition" | "pageOrder";
type CanvasSizeMode = "preserve" | "preview";

const ArrangeCanvasPagesParams = Type.Object({
  mode: Type.Optional(
    Type.Union([Type.Literal("preserveGroups"), Type.Literal("grid")], {
      description:
        "preserveGroups keeps the current rough rows and groups; grid rebuilds a regular grid.",
    }),
  ),
  orderBy: Type.Optional(
    Type.Union([Type.Literal("currentPosition"), Type.Literal("pageOrder")], {
      description:
        "currentPosition keeps visual order from the saved canvas; pageOrder uses workspace-tree order.",
    }),
  ),
  sizeMode: Type.Optional(
    Type.Union([Type.Literal("preserve"), Type.Literal("preview")], {
      description:
        "preserve keeps saved canvas sizes; preview resets sizes from each page config.schema.json $demo.presentation.viewport.",
    }),
  ),
  pageIds: Type.Optional(
    Type.Array(
      Type.String({
        description:
          "Exact page IDs from listPages. Omit to arrange all pages.",
      }),
      { minItems: 1 },
    ),
  ),
  gap: Type.Optional(
    Type.Number({
      minimum: 8,
      maximum: 240,
      description: "Gap between pages in canvas coordinates. Defaults to 48.",
    }),
  ),
  columns: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 8,
      description: "Column count for grid mode. Defaults to 3.",
    }),
  ),
  viewportWidth: Type.Optional(
    Type.Number({
      minimum: 320,
      maximum: 7680,
      description:
        "Virtual viewport width used to compute the saved canvas viewport. Defaults to 1440.",
    }),
  ),
  viewportHeight: Type.Optional(
    Type.Number({
      minimum: 240,
      maximum: 4320,
      description:
        "Virtual viewport height used to compute the saved canvas viewport. Defaults to 900.",
    }),
  ),
});

type ArrangeCanvasPagesParams = Static<typeof ArrangeCanvasPagesParams>;

function getWorkingDir(config: AgentConfig): string | null {
  return config.workingDir ? path.resolve(config.workingDir) : null;
}

function getCanvasLayoutPath(workingDir: string): string {
  return path.join(workingDir, CANVAS_LAYOUT_FILENAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPreviewSize(
  workingDir: string,
  pageId: string,
): PreviewSize | undefined {
  const schemaPath = path.join(
    getPageDir(workingDir, pageId),
    "config.schema.json",
  );
  try {
    const parsed = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as unknown;
    const presentation = resolvePagePresentation(
      parsed as Record<string, unknown>,
    );
    return presentation ? { ...presentation.viewport } : undefined;
  } catch {
    return undefined;
  }
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseLayout(value: unknown): CanvasPageLayout | null {
  if (!isRecord(value)) return null;

  const x = readNumber(value, "x");
  const y = readNumber(value, "y");
  const width = readNumber(value, "width");
  const height = readNumber(value, "height");
  const zIndex = readNumber(value, "zIndex");
  const sizeMode =
    value.sizeMode === "preview" || value.sizeMode === "custom"
      ? value.sizeMode
      : undefined;
  const previewSizeKey =
    typeof value.previewSizeKey === "string" ? value.previewSizeKey : null;

  if (x === null || y === null || width === null || height === null)
    return null;
  if (width <= 0 || height <= 0) return null;

  return {
    x,
    y,
    width,
    height,
    ...(zIndex === null ? {} : { zIndex }),
    ...(sizeMode ? { sizeMode } : {}),
    ...(previewSizeKey ? { previewSizeKey } : {}),
  };
}

function parseCanvasState(value: unknown): CanvasState | null {
  if (!isRecord(value) || !isRecord(value.viewport) || !isRecord(value.pages)) {
    return null;
  }

  const viewportX = readNumber(value.viewport, "x");
  const viewportY = readNumber(value.viewport, "y");
  const zoom = readNumber(value.viewport, "zoom");
  if (viewportX === null || viewportY === null || zoom === null || zoom <= 0) {
    return null;
  }

  const pages: Record<string, CanvasPageLayout> = {};
  for (const [pageId, layoutValue] of Object.entries(value.pages)) {
    const layout = parseLayout(layoutValue);
    if (!layout || !isSafePageId(pageId)) return null;
    pages[pageId] = layout;
  }

  return {
    viewport: { x: viewportX, y: viewportY, zoom },
    pages,
    ...(value.nodes === undefined ? {} : { nodes: value.nodes }),
    ...(value.layers === undefined ? {} : { layers: value.layers }),
    ...(value.pageGroups === undefined ? {} : { pageGroups: value.pageGroups }),
    ...(value.sections === undefined ? {} : { sections: value.sections }),
    ...(Array.isArray(value.hiddenPageIds)
      ? {
          hiddenPageIds: value.hiddenPageIds.filter(
            (item): item is string => typeof item === "string",
          ),
        }
      : {}),
    ...(Array.isArray(value.hiddenKnowledgeDocumentIds)
      ? {
          hiddenKnowledgeDocumentIds: value.hiddenKnowledgeDocumentIds.filter(
            (item): item is string => typeof item === "string",
          ),
        }
      : {}),
  };
}

/** Agent output exposes only Section structure, never page/source content. */
function summarizeCanvasSections(state: CanvasState): CanvasSectionSummary[] {
  if (!isRecord(state.sections)) return [];
  const summaries: CanvasSectionSummary[] = [];
  const parents = new Map<string, string>();
  for (const [id, raw] of Object.entries(state.sections)) {
    if (!isRecord(raw) || !Array.isArray(raw.children)) continue;
    for (const child of raw.children) {
      if (
        isRecord(child) &&
        child.kind === "section" &&
        typeof child.id === "string"
      )
        parents.set(child.id, id);
    }
  }
  for (const [id, raw] of Object.entries(state.sections)) {
    if (
      !isRecord(raw) ||
      raw.id !== id ||
      raw.kind !== "section" ||
      typeof raw.title !== "string"
    )
      continue;
    const bounds = parseLayout(raw.layout);
    if (!bounds || !Array.isArray(raw.children)) continue;
    const childCounts = { pages: 0, nodes: 0, sections: 0 };
    for (const child of raw.children) {
      if (!isRecord(child)) continue;
      if (child.kind === "page") childCounts.pages += 1;
      if (child.kind === "node") childCounts.nodes += 1;
      if (child.kind === "section") childCounts.sections += 1;
    }
    summaries.push({
      id,
      title: raw.title.slice(0, 120),
      bounds,
      ...(parents.has(id) ? { parentId: parents.get(id) } : {}),
      childCounts,
    });
  }
  return summaries.sort((a, b) => a.id.localeCompare(b.id));
}

function parseCanvasSections(
  value: unknown,
): Record<string, CanvasSectionRecord> {
  if (!isRecord(value)) return {};
  const sections: Record<string, CanvasSectionRecord> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw) || raw.id !== id || raw.kind !== "section") continue;
    const layout = parseLayout(raw.layout);
    if (!layout || !Array.isArray(raw.children)) continue;
    const children = raw.children.flatMap((child): CanvasSectionChild[] => {
      if (!isRecord(child) || typeof child.id !== "string") return [];
      if (
        child.kind !== "page" &&
        child.kind !== "node" &&
        child.kind !== "section"
      )
        return [];
      return [{ kind: child.kind, id: child.id }];
    });
    sections[id] = { id, kind: "section", layout, children };
  }
  return sections;
}

function getCanvasNodeLayout(
  nodes: unknown,
  nodeId: string,
): CanvasPageLayout | undefined {
  if (!isRecord(nodes) || !isRecord(nodes[nodeId])) return undefined;
  return parseLayout(nodes[nodeId].layout) ?? undefined;
}

function expandCanvasBounds(
  current: CanvasPageLayout | undefined,
  layout: CanvasPageLayout,
): CanvasPageLayout {
  if (!current) return { ...layout };
  const left = Math.min(current.x, layout.x);
  const top = Math.min(current.y, layout.y);
  const right = Math.max(current.x + current.width, layout.x + layout.width);
  const bottom = Math.max(current.y + current.height, layout.y + layout.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Builds arrangeable atomic units so Agent layout never breaks Section internals. */
function collectCanvasArrangeUnits(
  state: CanvasState,
  selectedPageIds: Set<string>,
  includeAllRootSections: boolean,
): { units: CanvasArrangeUnit[]; partialSectionPageIds: string[] } {
  const sections = parseCanvasSections(state.sections);
  const parentSections = new Set<string>();
  for (const section of Object.values(sections)) {
    for (const child of section.children) {
      if (child.kind === "section") parentSections.add(child.id);
    }
  }
  const units: CanvasArrangeUnit[] = [];
  const groupedPageIds = new Set<string>();

  const collectRoot = (rootId: string): CanvasArrangeUnit | undefined => {
    let bounds: CanvasPageLayout | undefined;
    const pageIds: string[] = [];
    const nodeIds: string[] = [];
    const sectionIds: string[] = [];
    const visited = new Set<string>();
    const visit = (sectionId: string) => {
      if (visited.has(sectionId)) return;
      visited.add(sectionId);
      const section = sections[sectionId];
      if (!section) return;
      sectionIds.push(sectionId);
      bounds = expandCanvasBounds(bounds, section.layout);
      for (const child of section.children) {
        if (child.kind === "section") visit(child.id);
        if (child.kind === "page" && state.pages[child.id]) {
          pageIds.push(child.id);
          bounds = expandCanvasBounds(bounds, state.pages[child.id]);
        }
        if (child.kind === "node") {
          const nodeLayout = getCanvasNodeLayout(state.nodes, child.id);
          if (nodeLayout) {
            nodeIds.push(child.id);
            bounds = expandCanvasBounds(bounds, nodeLayout);
          }
        }
      }
    };
    visit(rootId);
    return bounds
      ? { id: `section:${rootId}`, bounds, pageIds, nodeIds, sectionIds }
      : undefined;
  };

  for (const sectionId of Object.keys(sections).sort()) {
    if (parentSections.has(sectionId)) continue;
    const unit = collectRoot(sectionId);
    if (!unit) continue;
    unit.pageIds.forEach((pageId) => groupedPageIds.add(pageId));
    const selectedCount = unit.pageIds.filter((pageId) =>
      selectedPageIds.has(pageId),
    ).length;
    if (includeAllRootSections || selectedCount === unit.pageIds.length)
      units.push(unit);
  }

  const partialSectionPageIds = Array.from(selectedPageIds).filter((pageId) => {
    if (!groupedPageIds.has(pageId)) return false;
    return !units.some((unit) => unit.pageIds.includes(pageId));
  });

  for (const pageId of selectedPageIds) {
    if (groupedPageIds.has(pageId)) continue;
    const layout = state.pages[pageId];
    if (layout)
      units.push({
        id: `page:${pageId}`,
        bounds: layout,
        pageIds: [pageId],
        nodeIds: [],
        sectionIds: [],
      });
  }
  return { units, partialSectionPageIds };
}

function translateCanvasSections(
  value: unknown,
  deltas: Map<string, { x: number; y: number }>,
): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([id, section]) => {
      const delta = deltas.get(id);
      if (!delta || !isRecord(section)) return [id, section];
      const layout = parseLayout(section.layout);
      return [
        id,
        layout
          ? {
              ...section,
              layout: {
                ...layout,
                x: layout.x + delta.x,
                y: layout.y + delta.y,
              },
            }
          : section,
      ];
    }),
  );
}

function translateCanvasNodes(
  value: unknown,
  deltas: Map<string, { x: number; y: number }>,
): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([id, node]) => {
      const delta = deltas.get(id);
      if (!delta || !isRecord(node)) return [id, node];
      const layout = parseLayout(node.layout);
      return [
        id,
        layout
          ? {
              ...node,
              layout: {
                ...layout,
                x: layout.x + delta.x,
                y: layout.y + delta.y,
              },
            }
          : node,
      ];
    }),
  );
}

function readStoredCanvasLayout(workingDir: string): StoredCanvasLayout | null {
  const layoutPath = getCanvasLayoutPath(workingDir);
  if (!fs.existsSync(layoutPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as unknown;
    if (!isRecord(parsed)) return null;

    const state = parseCanvasState(parsed.state);
    if (!state) return null;

    return {
      version: 1,
      projectId:
        typeof parsed.projectId === "string" ? parsed.projectId : undefined,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      state,
    };
  } catch {
    return null;
  }
}

function resolveCanvasPageSize(previewSize?: PreviewSize): {
  width: number;
  height: number;
} {
  const width =
    previewSize?.width != null
      ? Number.parseFloat(String(previewSize.width).replace(/px$/, ""))
      : DEFAULT_PAGE_SIZE.width;
  const height =
    previewSize?.height != null
      ? Number.parseFloat(String(previewSize.height).replace(/px$/, ""))
      : DEFAULT_PAGE_SIZE.height;

  return {
    width:
      Number.isFinite(width) && width > 0 ? width : DEFAULT_PAGE_SIZE.width,
    height:
      Number.isFinite(height) && height > 0 ? height : DEFAULT_PAGE_SIZE.height,
  };
}

function getCanvasPreviewSizeKey(previewSize?: PreviewSize): string {
  const size = resolveCanvasPageSize(previewSize);
  return `${size.width}x${size.height}`;
}

function withCanvasPageSizeMetadata(
  layout: CanvasPageLayout,
  previewSize: PreviewSize | undefined,
  fallbackSizeMode: "preview" | "custom",
): CanvasPageLayout {
  const previewSizeKey = getCanvasPreviewSizeKey(previewSize);
  const size = resolveCanvasPageSize(previewSize);
  const matchesPreview =
    Math.abs(layout.width - size.width) < 1 &&
    Math.abs(layout.height - size.height) < 1;
  const sizeMode =
    layout.sizeMode === "custom"
      ? "custom"
      : matchesPreview
        ? "preview"
        : fallbackSizeMode;
  return {
    ...layout,
    sizeMode,
    previewSizeKey,
  };
}

function snapToGrid(value: number): number {
  return Math.round(value / AUTO_LAYOUT_GRID_SIZE) * AUTO_LAYOUT_GRID_SIZE;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
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

function buildBaseLayout(
  pages: CanvasPageData[],
  currentLayout: Record<string, CanvasPageLayout>,
  sizeMode: CanvasSizeMode,
): Record<string, CanvasPageLayout> {
  const layout: Record<string, CanvasPageLayout> = {};
  let maxColWidth = 0;
  const pageSizes = pages.map((page) => {
    const size = resolveCanvasPageSize(page.previewSize);
    if (size.width > maxColWidth) maxColWidth = size.width;
    return size;
  });

  pages.forEach((page, index) => {
    const col = index % DEFAULT_INITIAL_COLUMNS;
    const row = Math.floor(index / DEFAULT_INITIAL_COLUMNS);
    const size = pageSizes[index];
    const existing = currentLayout[page.id];
    const existingLayout =
      existing && sizeMode !== "preview"
        ? withCanvasPageSizeMetadata(existing, page.previewSize, "custom")
        : undefined;

    layout[page.id] = {
      x: existing?.x ?? col * (maxColWidth + DEFAULT_INITIAL_GAP),
      y: existing?.y ?? row * (DEFAULT_PAGE_SIZE.height + DEFAULT_INITIAL_GAP),
      width: existingLayout?.width ?? size.width,
      height: existingLayout?.height ?? size.height,
      zIndex: existing?.zIndex ?? index,
      sizeMode: existingLayout?.sizeMode ?? "preview",
      previewSizeKey:
        existingLayout?.previewSizeKey ??
        getCanvasPreviewSizeKey(page.previewSize),
    };
  });

  return layout;
}

function computeAutoCanvasLayout(
  pages: CanvasPageData[],
  currentLayout: Record<string, CanvasPageLayout>,
  gap: number,
): Record<string, CanvasPageLayout> {
  if (pages.length === 0) return {};

  const items = pages
    .map((page, index) => ({
      page,
      index,
      layout: currentLayout[page.id],
    }))
    .filter(
      (
        item,
      ): item is {
        page: CanvasPageData;
        index: number;
        layout: CanvasPageLayout;
      } => Boolean(item.layout),
    )
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);

  const medianHeight = median(items.map((item) => item.layout.height));
  const rowThreshold = Math.min(
    AUTO_LAYOUT_MAX_ROW_THRESHOLD,
    Math.max(80, medianHeight * AUTO_LAYOUT_ROW_THRESHOLD_RATIO),
  );

  const rows: Array<{ items: typeof items; yValues: number[] }> = [];
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
      rowIndex > 0 ? previousArrangedY + previousArrangedHeight + gap : rowY;
    const y = Math.max(rowY, minY);

    previousArrangedY = y;
    previousArrangedHeight = maxHeight;
    return { items: rowItems, y };
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
      const minX = Number.isFinite(previousRight)
        ? previousRight + gap
        : alignedX;
      const x = Math.max(alignedX, minX);

      layout[item.page.id] = { ...item.layout, x, y: row.y };
      previousRight = x + item.layout.width;
      currentAnchors.push({ x, centerX: x + item.layout.width / 2 });
    });

    previousRowAnchors.splice(0, previousRowAnchors.length, ...currentAnchors);
  });

  return layout;
}

function getCanvasLayoutBounds(
  pages: Record<string, CanvasPageLayout>,
): CanvasBounds | null {
  const pageLayouts = Object.values(pages);
  if (pageLayouts.length === 0) return null;

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

function computeGridLayout(
  pages: CanvasPageData[],
  currentLayout: Record<string, CanvasPageLayout>,
  columns: number,
  gap: number,
  sizeMode: CanvasSizeMode,
): Record<string, CanvasPageLayout> {
  const existingBounds = getCanvasLayoutBounds(currentLayout);
  const startX = existingBounds?.minX ?? 0;
  const startY = existingBounds?.minY ?? 0;
  const pageLayouts = pages.map((page) => {
    const previewSize = resolveCanvasPageSize(page.previewSize);
    const existing = currentLayout[page.id];
    return sizeMode === "preview" || !existing
      ? {
          ...previewSize,
          sizeMode: "preview" as const,
          previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
        }
      : withCanvasPageSizeMetadata(existing, page.previewSize, "custom");
  });
  const maxColWidth = Math.max(...pageLayouts.map((size) => size.width));
  const layout: Record<string, CanvasPageLayout> = {};
  const rowHeights: number[] = [];

  pages.forEach((_page, index) => {
    const row = Math.floor(index / columns);
    const size = pageLayouts[index];
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height);
  });

  const rowYOffsets = rowHeights.reduce<number[]>((offsets, height, row) => {
    offsets[row] = row === 0 ? 0 : offsets[row - 1] + rowHeights[row - 1] + gap;
    return offsets;
  }, []);

  pages.forEach((page, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const size = pageLayouts[index];
    layout[page.id] = {
      x: startX + col * (maxColWidth + gap),
      y: startY + rowYOffsets[row],
      width: size.width,
      height: size.height,
      zIndex: index,
      sizeMode: size.sizeMode,
      previewSizeKey: size.previewSizeKey,
    };
  });

  return layout;
}

function computeFitCanvasViewport(
  pages: Record<string, CanvasPageLayout>,
  containerWidth: number,
  containerHeight: number,
): CanvasViewportState {
  const bounds = getCanvasLayoutBounds(pages);
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return { x: 40, y: 40, zoom: 0.5 };
  }

  const zoom =
    Math.min(containerWidth / bounds.width, containerHeight / bounds.height) *
    0.9;
  const clampedZoom = Math.min(Math.max(zoom, 0.05), 3);
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  return {
    x: containerWidth / 2 - centerX * clampedZoom,
    y: containerHeight / 2 - centerY * clampedZoom,
    zoom: clampedZoom,
  };
}

function orderPages(
  pages: CanvasPageData[],
  layout: Record<string, CanvasPageLayout>,
  orderBy: CanvasOrderBy,
): CanvasPageData[] {
  if (orderBy === "pageOrder")
    return [...pages].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    );

  return [...pages].sort((a, b) => {
    const layoutA = layout[a.id];
    const layoutB = layout[b.id];
    if (!layoutA && !layoutB)
      return a.order - b.order || a.id.localeCompare(b.id);
    if (!layoutA) return 1;
    if (!layoutB) return -1;
    return (
      layoutA.y - layoutB.y ||
      layoutA.x - layoutB.x ||
      a.order - b.order ||
      a.id.localeCompare(b.id)
    );
  });
}

function formatLayoutSummary(
  pages: CanvasPageData[],
  layout: Record<string, CanvasPageLayout>,
): string {
  return pages
    .map((page, index) => {
      const item = layout[page.id];
      return `${index + 1}. ${page.name} (${page.id}) x=${item.x}, y=${item.y}, w=${item.width}, h=${item.height}`;
    })
    .join("\n");
}

export function createArrangeCanvasPagesTool(
  config: AgentConfig,
): AgentTool<typeof ArrangeCanvasPagesParams> {
  return {
    name: "arrangeCanvasPages",
    label: "Arrange Canvas Pages",
    description:
      "Arrange page positions and sizes in the canvas workspace by writing the structured .canvas-layout.json state. " +
      "Use this for canvas layout requests, not for page tree order changes.",
    parameters: ArrangeCanvasPagesParams,
    execute: async (_toolCallId: string, args: ArrangeCanvasPagesParams) => {
      const workingDir = getWorkingDir(config);
      if (!workingDir) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: workingDir is required to arrange canvas pages.",
            },
          ],
          details: { error: "missing_working_dir" },
          isError: true,
        };
      }

      try {
        const workspacePages = listPages(workingDir);
        if (workspacePages.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: no pages found in the current workspace.",
              },
            ],
            details: { error: "no_pages" },
            isError: true,
          };
        }

        const allPages: CanvasPageData[] = workspacePages.map((page) => ({
          id: page.id,
          name: page.name,
          order: page.order,
          previewSize: readPreviewSize(workingDir, page.id),
        }));
        const requestedIds = args.pageIds
          ? Array.from(new Set(args.pageIds))
          : allPages.map((page) => page.id);
        const pageIdSet = new Set(allPages.map((page) => page.id));
        const missing = requestedIds.filter((pageId) => !pageIdSet.has(pageId));

        if (missing.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: these page IDs do not exist in the current workspace: ${missing.join(", ")}. Call listPages and retry with exact IDs.`,
              },
            ],
            details: { error: "page_not_found", missing },
            isError: true,
          };
        }

        const mode: ArrangeMode = args.mode ?? "preserveGroups";
        const sizeMode: CanvasSizeMode = args.sizeMode ?? "preserve";
        const orderBy: CanvasOrderBy =
          args.orderBy ?? (mode === "grid" ? "pageOrder" : "currentPosition");
        const gap = args.gap ?? DEFAULT_ARRANGE_GAP;
        const columns = args.columns ?? DEFAULT_INITIAL_COLUMNS;
        const viewportWidth = args.viewportWidth ?? DEFAULT_VIEWPORT_SIZE.width;
        const viewportHeight =
          args.viewportHeight ?? DEFAULT_VIEWPORT_SIZE.height;
        const stored = readStoredCanvasLayout(workingDir);
        const currentLayout = stored?.state.pages ?? {};
        const baseLayout = buildBaseLayout(allPages, currentLayout, sizeMode);
        const selectedIdSet = new Set(requestedIds);
        const selectedPages = orderPages(
          allPages.filter((page) => selectedIdSet.has(page.id)),
          baseLayout,
          orderBy,
        );
        const sectionSourcePages = Object.fromEntries(
          allPages.map((page) => [
            page.id,
            currentLayout[page.id] ?? baseLayout[page.id],
          ]),
        );
        const sectionSourceState: CanvasState = {
          ...(stored?.state ?? {}),
          pages: sectionSourcePages,
          viewport: stored?.state.viewport ?? { x: 40, y: 40, zoom: 0.5 },
        };
        const { units, partialSectionPageIds } = collectCanvasArrangeUnits(
          sectionSourceState,
          selectedIdSet,
          !args.pageIds,
        );
        if (partialSectionPageIds.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: selected pages belong to a Section and must be arranged as a complete Section unit: ${partialSectionPageIds.join(", ")}. Select all pages in that Section or omit pageIds.`,
              },
            ],
            details: {
              error: "partial_section_selection",
              pageIds: partialSectionPageIds,
            },
            isError: true,
          };
        }
        const unitPages: CanvasPageData[] = units.map((unit, index) => ({
          id: unit.id,
          name: unit.id,
          order: index,
        }));
        const unitBaseLayout = Object.fromEntries(
          units.map((unit) => [unit.id, unit.bounds]),
        );
        const arrangedUnits =
          mode === "grid"
            ? computeGridLayout(
                unitPages,
                unitBaseLayout,
                columns,
                gap,
                "preserve",
              )
            : computeAutoCanvasLayout(unitPages, unitBaseLayout, gap);
        const nextPages: Record<string, CanvasPageLayout> = { ...baseLayout };
        const sectionDeltas = new Map<string, { x: number; y: number }>();
        const nodeDeltas = new Map<string, { x: number; y: number }>();

        for (const unit of units) {
          const arranged = arrangedUnits[unit.id] ?? unit.bounds;
          const delta = {
            x: arranged.x - unit.bounds.x,
            y: arranged.y - unit.bounds.y,
          };
          for (const pageId of unit.pageIds) {
            const source = sectionSourcePages[pageId];
            if (source)
              nextPages[pageId] = {
                ...source,
                x: source.x + delta.x,
                y: source.y + delta.y,
              };
          }
          for (const sectionId of unit.sectionIds)
            sectionDeltas.set(sectionId, delta);
          for (const nodeId of unit.nodeIds) nodeDeltas.set(nodeId, delta);
        }
        const arrangedSelected = Object.fromEntries(
          selectedPages.map((page) => [page.id, nextPages[page.id]]),
        );

        const state: CanvasState = {
          ...(stored?.state ?? {}),
          pages: nextPages,
          ...(sectionDeltas.size > 0
            ? {
                sections: translateCanvasSections(
                  stored?.state.sections,
                  sectionDeltas,
                ),
              }
            : {}),
          ...(nodeDeltas.size > 0
            ? { nodes: translateCanvasNodes(stored?.state.nodes, nodeDeltas) }
            : {}),
          viewport: computeFitCanvasViewport(
            nextPages,
            viewportWidth,
            viewportHeight,
          ),
        };
        const storedLayout: StoredCanvasLayout = {
          version: 1,
          projectId: stored?.projectId,
          updatedAt: Date.now(),
          state,
        };
        const layoutPath = getCanvasLayoutPath(workingDir);
        const content = JSON.stringify(storedLayout, null, 2);
        const mutationDecision = assertAiMutationAllowed(config, CANVAS_LAYOUT_FILENAME, { content });
        if (!mutationDecision.allowed) return aiMutationDeniedResult(mutationDecision, CANVAS_LAYOUT_FILENAME);
        const liveWorkspace = resolveLiveWorkspaceMutationContext(workingDir);
        const receipt = liveWorkspace
          ? await (async () => {
              const previous = fs.readFileSync(layoutPath, "utf-8");
              const authorityState = await liveWorkspace.authority.getState(
                liveWorkspace.projectId,
                liveWorkspace.workspaceId,
              );
              return liveWorkspace.authority.mutate({
                mutationId: crypto.randomUUID(),
                projectId: liveWorkspace.projectId,
                workspaceId: liveWorkspace.workspaceId,
                sessionId: config.sessionId,
                baseRevision: authorityState.revision,
                actor: "ai",
                reason: "agent_canvas_arrange",
                operations: [
                  {
                    type: "put_text",
                    path: CANVAS_LAYOUT_FILENAME,
                    content,
                    expectedHash: crypto
                      .createHash("sha256")
                      .update(previous)
                      .digest("hex"),
                  },
                ],
              });
            })()
          : null;
        if (!liveWorkspace) {
          fs.writeFileSync(layoutPath, content, "utf-8");
        }

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Arranged ${selectedPages.length} canvas page${selectedPages.length === 1 ? "" : "s"} using ${mode} mode.`,
                `Saved layout to ${CANVAS_LAYOUT_FILENAME}.`,
                "",
                formatLayoutSummary(selectedPages, arrangedSelected),
              ].join("\n"),
            },
          ],
          details: {
            arranged: true,
            layoutPath: CANVAS_LAYOUT_FILENAME,
            receipt,
            mode,
            orderBy,
            sizeMode,
            pageIds: selectedPages.map((page) => page.id),
            pageCount: allPages.length,
            arrangedCount: selectedPages.length,
            viewport: state.viewport,
            pages: Object.fromEntries(
              selectedPages.map((page) => [page.id, arrangedSelected[page.id]]),
            ),
            sections: summarizeCanvasSections(state),
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error({ error: message }, "arrangeCanvasPages failed");
        return {
          content: [
            {
              type: "text" as const,
              text: `Error arranging canvas pages: ${message}`,
            },
          ],
          details: { error: message },
          isError: true,
        };
      }
    },
  };
}
