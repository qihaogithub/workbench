import * as fs from 'fs';
import crypto from 'crypto';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { resolveLiveWorkspaceMutationContext } from '../../workspace/workspace-mutation-authority';

const WORKSPACE_TREE_FILENAME = 'workspace-tree.json';
const CANVAS_LAYOUT_FILENAME = '.canvas-layout.json';
const DEFAULT_PAGE_SIZE = { width: 375, height: 812 };
const DEFAULT_VIEWPORT_SIZE = { width: 1440, height: 900 };
const DEFAULT_INITIAL_COLUMNS = 3;
const DEFAULT_INITIAL_GAP = 40;
const DEFAULT_ARRANGE_GAP = 48;
const AUTO_LAYOUT_GRID_SIZE = 8;
const AUTO_LAYOUT_ROW_THRESHOLD_RATIO = 0.35;
const AUTO_LAYOUT_MAX_ROW_THRESHOLD = 180;
const AUTO_LAYOUT_COLUMN_ALIGN_THRESHOLD = 140;

interface WorkspacePage {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
}

interface WorkspaceTree {
  folders: unknown[];
  pages: WorkspacePage[];
}

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
  sizeMode?: 'preview' | 'custom';
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

type ArrangeMode = 'preserveGroups' | 'grid';
type CanvasOrderBy = 'currentPosition' | 'pageOrder';
type CanvasSizeMode = 'preserve' | 'preview';

const ArrangeCanvasPagesParams = Type.Object({
  mode: Type.Optional(Type.Union([
    Type.Literal('preserveGroups'),
    Type.Literal('grid'),
  ], {
    description: 'preserveGroups keeps the current rough rows and groups; grid rebuilds a regular grid.',
  })),
  orderBy: Type.Optional(Type.Union([
    Type.Literal('currentPosition'),
    Type.Literal('pageOrder'),
  ], {
    description: 'currentPosition keeps visual order from the saved canvas; pageOrder uses workspace-tree order.',
  })),
  sizeMode: Type.Optional(Type.Union([
    Type.Literal('preserve'),
    Type.Literal('preview'),
  ], {
    description: 'preserve keeps saved canvas sizes; preview resets sizes from each page config.schema.json $demo.previewSize.',
  })),
  pageIds: Type.Optional(Type.Array(
    Type.String({ description: 'Exact page IDs from listPages. Omit to arrange all pages.' }),
    { minItems: 1 },
  )),
  gap: Type.Optional(Type.Number({
    minimum: 8,
    maximum: 240,
    description: 'Gap between pages in canvas coordinates. Defaults to 48.',
  })),
  columns: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: 8,
    description: 'Column count for grid mode. Defaults to 3.',
  })),
  viewportWidth: Type.Optional(Type.Number({
    minimum: 320,
    maximum: 7680,
    description: 'Virtual viewport width used to compute the saved canvas viewport. Defaults to 1440.',
  })),
  viewportHeight: Type.Optional(Type.Number({
    minimum: 240,
    maximum: 4320,
    description: 'Virtual viewport height used to compute the saved canvas viewport. Defaults to 900.',
  })),
});

type ArrangeCanvasPagesParams = Static<typeof ArrangeCanvasPagesParams>;

function getWorkingDir(config: AgentConfig): string | null {
  return config.workingDir ? path.resolve(config.workingDir) : null;
}

function getWorkspaceTreePath(workingDir: string): string {
  return path.join(workingDir, WORKSPACE_TREE_FILENAME);
}

function getCanvasLayoutPath(workingDir: string): string {
  return path.join(workingDir, CANVAS_LAYOUT_FILENAME);
}

function getPageDir(workingDir: string, pageId: string): string {
  return path.join(workingDir, 'demos', pageId);
}

function isSafePageId(pageId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(pageId) && !pageId.includes('..');
}

function isCompletePageDir(workingDir: string, pageId: string): boolean {
  const pageDir = getPageDir(workingDir, pageId);
  return (
    fs.existsSync(pageDir) &&
    fs.existsSync(path.join(pageDir, 'index.tsx')) &&
    fs.existsSync(path.join(pageDir, 'config.schema.json'))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readWorkspaceTree(workingDir: string): WorkspaceTree {
  const treePath = getWorkspaceTreePath(workingDir);
  if (!fs.existsSync(treePath)) {
    return { folders: [], pages: [] };
  }

  const parsed = JSON.parse(fs.readFileSync(treePath, 'utf-8')) as Partial<WorkspaceTree>;
  return {
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
  };
}

function listPages(workingDir: string): WorkspacePage[] {
  const tree = readWorkspaceTree(workingDir);
  return tree.pages
    .filter((page) => isSafePageId(page.id) && isCompletePageDir(workingDir, page.id))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function readPreviewSize(workingDir: string, pageId: string): PreviewSize | undefined {
  const schemaPath = path.join(getPageDir(workingDir, pageId), 'config.schema.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.$demo) || !isRecord(parsed.$demo.previewSize)) {
      return undefined;
    }

    const preview = parsed.$demo.previewSize;
    const size: PreviewSize = {};
    if (typeof preview.width === 'number' || typeof preview.width === 'string') {
      size.width = preview.width;
    }
    if (typeof preview.height === 'number' || typeof preview.height === 'string') {
      size.height = preview.height;
    }
    return Object.keys(size).length > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseLayout(value: unknown): CanvasPageLayout | null {
  if (!isRecord(value)) return null;

  const x = readNumber(value, 'x');
  const y = readNumber(value, 'y');
  const width = readNumber(value, 'width');
  const height = readNumber(value, 'height');
  const zIndex = readNumber(value, 'zIndex');
  const sizeMode =
    value.sizeMode === 'preview' || value.sizeMode === 'custom'
      ? value.sizeMode
      : undefined;
  const previewSizeKey = typeof value.previewSizeKey === 'string' ? value.previewSizeKey : null;

  if (x === null || y === null || width === null || height === null) return null;
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

  const viewportX = readNumber(value.viewport, 'x');
  const viewportY = readNumber(value.viewport, 'y');
  const zoom = readNumber(value.viewport, 'zoom');
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
    ...(Array.isArray(value.hiddenPageIds)
      ? {
          hiddenPageIds: value.hiddenPageIds.filter(
            (item): item is string => typeof item === 'string',
          ),
        }
      : {}),
    ...(Array.isArray(value.hiddenKnowledgeDocumentIds)
      ? {
          hiddenKnowledgeDocumentIds: value.hiddenKnowledgeDocumentIds.filter(
            (item): item is string => typeof item === 'string',
          ),
        }
      : {}),
  };
}

function readStoredCanvasLayout(workingDir: string): StoredCanvasLayout | null {
  const layoutPath = getCanvasLayoutPath(workingDir);
  if (!fs.existsSync(layoutPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(layoutPath, 'utf-8')) as unknown;
    if (!isRecord(parsed)) return null;

    const state = parseCanvasState(parsed.state);
    if (!state) return null;

    return {
      version: 1,
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : undefined,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      state,
    };
  } catch {
    return null;
  }
}

function resolveCanvasPageSize(previewSize?: PreviewSize): { width: number; height: number } {
  const width =
    previewSize?.width != null
      ? Number.parseFloat(String(previewSize.width).replace(/px$/, ''))
      : DEFAULT_PAGE_SIZE.width;
  const height =
    previewSize?.height != null
      ? Number.parseFloat(String(previewSize.height).replace(/px$/, ''))
      : DEFAULT_PAGE_SIZE.height;

  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_PAGE_SIZE.width,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_PAGE_SIZE.height,
  };
}

function getCanvasPreviewSizeKey(previewSize?: PreviewSize): string {
  const size = resolveCanvasPageSize(previewSize);
  return `${size.width}x${size.height}`;
}

function withCanvasPageSizeMetadata(
  layout: CanvasPageLayout,
  previewSize: PreviewSize | undefined,
  fallbackSizeMode: 'preview' | 'custom',
): CanvasPageLayout {
  const previewSizeKey = getCanvasPreviewSizeKey(previewSize);
  const size = resolveCanvasPageSize(previewSize);
  const matchesPreview =
    Math.abs(layout.width - size.width) < 1 &&
    Math.abs(layout.height - size.height) < 1;
  const sizeMode =
    layout.sizeMode === 'custom'
      ? 'custom'
      : matchesPreview
        ? 'preview'
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

  return nearestDistance <= AUTO_LAYOUT_COLUMN_ALIGN_THRESHOLD ? nearest : undefined;
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
      existing && sizeMode !== 'preview'
        ? withCanvasPageSizeMetadata(existing, page.previewSize, 'custom')
        : undefined;

    layout[page.id] = {
      x: existing?.x ?? col * (maxColWidth + DEFAULT_INITIAL_GAP),
      y: existing?.y ?? row * (DEFAULT_PAGE_SIZE.height + DEFAULT_INITIAL_GAP),
      width: existingLayout?.width ?? size.width,
      height: existingLayout?.height ?? size.height,
      zIndex: existing?.zIndex ?? index,
      sizeMode: existingLayout?.sizeMode ?? 'preview',
      previewSizeKey: existingLayout?.previewSizeKey ?? getCanvasPreviewSizeKey(page.previewSize),
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
    .filter((item): item is { page: CanvasPageData; index: number; layout: CanvasPageLayout } => Boolean(item.layout))
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
    const rowItems = [...row.items].sort((a, b) => a.layout.x - b.layout.x || a.index - b.index);
    const rowY = snapToGrid(median(row.yValues));
    const maxHeight = Math.max(...rowItems.map((item) => item.layout.height));
    const minY = rowIndex > 0 ? previousArrangedY + previousArrangedHeight + gap : rowY;
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
        rowIndex > 0 ? findNearestAnchor(item.layout, previousRowAnchors) : undefined;
      const alignedX = nearestAnchor?.x ?? snappedX;
      const minX = Number.isFinite(previousRight) ? previousRight + gap : alignedX;
      const x = Math.max(alignedX, minX);

      layout[item.page.id] = { ...item.layout, x, y: row.y };
      previousRight = x + item.layout.width;
      currentAnchors.push({ x, centerX: x + item.layout.width / 2 });
    });

    previousRowAnchors.splice(0, previousRowAnchors.length, ...currentAnchors);
  });

  return layout;
}

function getCanvasLayoutBounds(pages: Record<string, CanvasPageLayout>): CanvasBounds | null {
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
    return sizeMode === 'preview' || !existing
      ? {
          ...previewSize,
          sizeMode: 'preview' as const,
          previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
        }
      : withCanvasPageSizeMetadata(existing, page.previewSize, 'custom');
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

  const zoom = Math.min(containerWidth / bounds.width, containerHeight / bounds.height) * 0.9;
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
  if (orderBy === 'pageOrder') return [...pages].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  return [...pages].sort((a, b) => {
    const layoutA = layout[a.id];
    const layoutB = layout[b.id];
    if (!layoutA && !layoutB) return a.order - b.order || a.id.localeCompare(b.id);
    if (!layoutA) return 1;
    if (!layoutB) return -1;
    return layoutA.y - layoutB.y || layoutA.x - layoutB.x || a.order - b.order || a.id.localeCompare(b.id);
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
    .join('\n');
}

export function createArrangeCanvasPagesTool(
  config: AgentConfig,
): AgentTool<typeof ArrangeCanvasPagesParams> {
  return {
    name: 'arrangeCanvasPages',
    label: 'Arrange Canvas Pages',
    description:
      'Arrange page positions and sizes in the canvas workspace by writing the structured .canvas-layout.json state. ' +
      'Use this for canvas layout requests, not for page tree order changes.',
    parameters: ArrangeCanvasPagesParams,
    execute: async (_toolCallId: string, args: ArrangeCanvasPagesParams) => {
      const workingDir = getWorkingDir(config);
      if (!workingDir) {
        return {
          content: [{ type: 'text' as const, text: 'Error: workingDir is required to arrange canvas pages.' }],
          details: { error: 'missing_working_dir' },
          isError: true,
        };
      }

      try {
        const workspacePages = listPages(workingDir);
        if (workspacePages.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: no pages found in the current workspace.' }],
            details: { error: 'no_pages' },
            isError: true,
          };
        }

        const allPages: CanvasPageData[] = workspacePages.map((page) => ({
          id: page.id,
          name: page.name,
          order: page.order,
          previewSize: readPreviewSize(workingDir, page.id),
        }));
        const requestedIds = args.pageIds ? Array.from(new Set(args.pageIds)) : allPages.map((page) => page.id);
        const pageIdSet = new Set(allPages.map((page) => page.id));
        const missing = requestedIds.filter((pageId) => !pageIdSet.has(pageId));

        if (missing.length > 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: these page IDs do not exist in the current workspace: ${missing.join(', ')}. Call listPages and retry with exact IDs.`,
            }],
            details: { error: 'page_not_found', missing },
            isError: true,
          };
        }

        const mode: ArrangeMode = args.mode ?? 'preserveGroups';
        const sizeMode: CanvasSizeMode = args.sizeMode ?? 'preserve';
        const orderBy: CanvasOrderBy = args.orderBy ?? (mode === 'grid' ? 'pageOrder' : 'currentPosition');
        const gap = args.gap ?? DEFAULT_ARRANGE_GAP;
        const columns = args.columns ?? DEFAULT_INITIAL_COLUMNS;
        const viewportWidth = args.viewportWidth ?? DEFAULT_VIEWPORT_SIZE.width;
        const viewportHeight = args.viewportHeight ?? DEFAULT_VIEWPORT_SIZE.height;
        const stored = readStoredCanvasLayout(workingDir);
        const currentLayout = stored?.state.pages ?? {};
        const baseLayout = buildBaseLayout(allPages, currentLayout, sizeMode);
        const selectedIdSet = new Set(requestedIds);
        const selectedPages = orderPages(
          allPages.filter((page) => selectedIdSet.has(page.id)),
          baseLayout,
          orderBy,
        );
        const selectedBaseLayout = Object.fromEntries(
          selectedPages.map((page) => [page.id, baseLayout[page.id]]),
        );
        const arrangedSelected =
          mode === 'grid'
            ? computeGridLayout(selectedPages, selectedBaseLayout, columns, gap, sizeMode)
            : computeAutoCanvasLayout(selectedPages, selectedBaseLayout, gap);
        const nextPages: Record<string, CanvasPageLayout> = {};

        for (const page of allPages) {
          nextPages[page.id] = arrangedSelected[page.id] ?? baseLayout[page.id];
        }

        const state: CanvasState = {
          ...(stored?.state ?? {}),
          pages: nextPages,
          viewport: computeFitCanvasViewport(nextPages, viewportWidth, viewportHeight),
        };
        const storedLayout: StoredCanvasLayout = {
          version: 1,
          projectId: stored?.projectId,
          updatedAt: Date.now(),
          state,
        };
        const layoutPath = getCanvasLayoutPath(workingDir);
        const content = JSON.stringify(storedLayout, null, 2);
        const liveWorkspace = resolveLiveWorkspaceMutationContext(workingDir);
        const receipt = liveWorkspace
          ? await (async () => {
          const previous = fs.readFileSync(layoutPath, 'utf-8');
          const authorityState = await liveWorkspace.authority.getState(liveWorkspace.projectId, liveWorkspace.workspaceId);
          return liveWorkspace.authority.mutate({
            mutationId: crypto.randomUUID(), projectId: liveWorkspace.projectId, workspaceId: liveWorkspace.workspaceId,
            sessionId: config.sessionId, baseRevision: authorityState.revision, actor: 'ai', reason: 'agent_canvas_arrange',
            operations: [{ type: 'put_text', path: CANVAS_LAYOUT_FILENAME, content, expectedHash: crypto.createHash('sha256').update(previous).digest('hex') }],
          });
          })()
          : null;
        if (!liveWorkspace) {
          fs.writeFileSync(layoutPath, content, 'utf-8');
        }

        return {
          content: [{
            type: 'text' as const,
            text: [
              `Arranged ${selectedPages.length} canvas page${selectedPages.length === 1 ? '' : 's'} using ${mode} mode.`,
              `Saved layout to ${CANVAS_LAYOUT_FILENAME}.`,
              '',
              formatLayoutSummary(selectedPages, arrangedSelected),
            ].join('\n'),
          }],
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
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'arrangeCanvasPages failed');
        return {
          content: [{ type: 'text' as const, text: `Error arranging canvas pages: ${message}` }],
          details: { error: message },
          isError: true,
        };
      }
    },
  };
}
