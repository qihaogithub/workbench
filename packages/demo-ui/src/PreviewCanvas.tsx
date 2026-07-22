"use client";

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Combine,
  Trash2,
} from "lucide-react";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem, CanvasPagePreviewContent } from "./CanvasPageItem";
import { CanvasFreeNodeItem } from "./CanvasFreeNodeItem";
import { CanvasSelectionBox } from "./CanvasSelectionBox";
import { CanvasToolbar } from "./CanvasToolbar";
import { DocumentEditor } from "./DocumentEditor";
import { useCanvasDocumentMarkdown } from "./useCanvasDocumentMarkdown";
import {
  DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES,
  DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES,
  MIN_CANVAS_SCREENSHOT_PAGE_COUNT,
} from "./canvas-render-scheduler";
import { computePreviewRuntimePoolPlan } from "./preview-runtime-pool";
import {
  computeAutoCanvasLayout,
  computeFitCanvasViewport,
  computeInitialCanvasLayout,
  normalizeCanvasPageLayouts,
  resolveCanvasPageSize,
} from "./canvas-layout";
import {
  getPreviewPageResourceDescriptor,
  prewarmPreviewImageUrls,
} from "./preview-resource-cache";
import { cn } from "./utils";
import {
  getAnnotationsFromCanvasState,
  getActiveCanvasDocumentEntry,
  getCanvasDocumentEntries,
  normalizeCanvasStateLayers,
  resolveCanvasToolMode,
  screenPointToCanvasPoint,
  withCanvasAnnotationNodes,
} from "./canvas-kernel";
import {
  writeCanvasClipboard,
  readCanvasClipboard,
  computeBounds,
  isEditableTarget,
} from "./canvas-clipboard";
import {
  PAGE_GROUP_DIRECTORY_WIDTH,
  PAGE_GROUP_DIRECTORY_GAP,
  getVisiblePageIds,
  getCanvasLayoutSignature,
  areStringListsEqual,
  getLayoutBounds,
  sortDocumentNodesByLayout,
  sortPageIdsByLayout,
  getDocumentNodeKnowledgeIds,
  rectsIntersect,
  computeAlignment,
  detectPageGroupResizeEdge,
  resizePageGroupLayout,
  type CanvasRect,
} from "./canvas-geometry";
import type { CanvasPoint } from "./canvas-kernel";
import {
  DOCUMENT_NODE_DEFAULT_HEIGHT,
  DOCUMENT_NODE_COLLAPSED_HEIGHT,
  getFileNameWithoutExtension,
  isMarkdownFile,
} from "./canvas-file-utils";
import type {
  PreviewCanvasProps,
  CanvasState,
  CanvasPageLayout,
  AlignmentGuide,
  CanvasToolMode,
  CanvasFreeNode,
  CanvasDocumentNode,
  CanvasPageData,
  CanvasPageGroup,
  CanvasPageRenderMode,
  ConsoleLogPayload,
  PositionableSizeItem,
  ScreenshotRenderBox,
} from "./types";

type CanvasImportFileKind = "document" | "image";

interface CanvasImportFile {
  kind: CanvasImportFileKind;
  file: File;
}

type MultiPageAlignAction =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom"
  | "distribute-x"
  | "distribute-y";

interface CanvasPageGroupItemProps {
  group: CanvasPageGroup;
  pagesById: Map<string, CanvasPageData>;
  editable: boolean;
  selected: boolean;
  zoom: number;
  sessionId?: string;
  pageRenderModes: Record<string, CanvasPageRenderMode>;
  screenshotUrls?: Record<string, string>;
  screenshotRenderBoxes?: Record<string, ScreenshotRenderBox>;
  onSelect: (
    groupId: string,
    activePageId: string,
    event?: React.PointerEvent | React.MouseEvent,
  ) => void;
  onLayoutChange: (groupId: string, layout: CanvasPageLayout) => void;
  onActivePageChange: (groupId: string, pageId: string) => void;
  onDirectoryCollapsedChange: (groupId: string, collapsed: boolean) => void;
  onDragStart?: (groupId: string) => void;
  onDragMove?: (
    groupId: string,
    layout: CanvasPageLayout,
    edge?: string,
  ) => void;
  onDragEnd?: () => void;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
  onError?: (error: Error) => void;
  onPositionableSizes?: (sizes: Record<string, PositionableSizeItem>) => void;
}

function CanvasPageGroupItem({
  group,
  pagesById,
  editable,
  selected,
  zoom,
  sessionId,
  pageRenderModes,
  screenshotUrls,
  screenshotRenderBoxes,
  onSelect,
  onLayoutChange,
  onActivePageChange,
  onDirectoryCollapsedChange,
  onDragStart,
  onDragMove,
  onDragEnd,
  onConsoleEntry,
  onError,
  onPositionableSizes,
}: CanvasPageGroupItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [resizeEdge, setResizeEdge] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const startPointerRef = useRef({ x: 0, y: 0 });
  const startLayoutRef = useRef(group.layout);
  const groupRef = useRef<HTMLDivElement>(null);
  const activeEntry =
    group.pages.find((entry) => entry.pageId === group.activePageId) ??
    group.pages[0];
  const activePageId = activeEntry?.pageId ?? group.activePageId;
  const activePage = activePageId ? pagesById.get(activePageId) : undefined;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const labelFontSize = Math.min(12 / safeZoom, 24);
  const labelTopOffset = Math.min(20 / safeZoom, 40);
  const previewLayout: CanvasPageLayout = {
    x: 0,
    y: 0,
    width: Math.max(group.layout.width, 1),
    height: group.layout.height,
  };
  const activePageSize = activePage
    ? resolveCanvasPageSize(activePage.previewSize)
    : { width: group.layout.width, height: group.layout.height };
  const activePageAspectRatio = activePageSize.width / activePageSize.height;

  const updateHoveredEdge = useCallback(
    (event: React.PointerEvent | React.MouseEvent) => {
      if (!editable || isDragging || resizeEdge) {
        setHoveredEdge(null);
        return;
      }
      const rect = groupRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoveredEdge(
        detectPageGroupResizeEdge(
          event.clientX - rect.left,
          event.clientY - rect.top,
          rect.width,
          rect.height,
        ),
      );
    },
    [editable, isDragging, resizeEdge],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!editable || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("button,input,textarea,select,a")) return;

      event.stopPropagation();
      startPointerRef.current = { x: event.clientX, y: event.clientY };
      startLayoutRef.current = group.layout;
      if (hoveredEdge) {
        setResizeEdge(hoveredEdge);
      } else {
        setIsDragging(true);
      }
      onDragStart?.(group.id);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [editable, group.id, group.layout, hoveredEdge, onDragStart],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging && !resizeEdge) {
        updateHoveredEdge(event);
        return;
      }

      event.stopPropagation();
      const dx = (event.clientX - startPointerRef.current.x) / safeZoom;
      const dy = (event.clientY - startPointerRef.current.y) / safeZoom;
      const nextLayout = resizeEdge
        ? resizePageGroupLayout(
            startLayoutRef.current,
            resizeEdge,
            dx,
            dy,
            activePageAspectRatio,
          )
        : {
            ...startLayoutRef.current,
            x: startLayoutRef.current.x + dx,
            y: startLayoutRef.current.y + dy,
          };
      onLayoutChange(group.id, nextLayout);
      onDragMove?.(group.id, nextLayout, resizeEdge ?? undefined);
    },
    [
      activePageAspectRatio,
      group.id,
      isDragging,
      onDragMove,
      onLayoutChange,
      resizeEdge,
      safeZoom,
      updateHoveredEdge,
    ],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging && !resizeEdge) return;

      event.stopPropagation();
      const dx = event.clientX - startPointerRef.current.x;
      const dy = event.clientY - startPointerRef.current.y;
      const wasClick = Math.abs(dx) < 3 && Math.abs(dy) < 3 && !resizeEdge;
      setIsDragging(false);
      setResizeEdge(null);
      setHoveredEdge(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      onDragEnd?.();
      if (wasClick) onSelect(group.id, activePageId, event);
    },
    [activePageId, group.id, isDragging, onDragEnd, onSelect, resizeEdge],
  );

  const cursor =
    resizeEdge || hoveredEdge ? "nwse-resize" : editable ? "move" : undefined;

  return (
    <div
      ref={groupRef}
      data-page-group-id={group.id}
      className="absolute select-none"
      style={{
        left: group.layout.x,
        top: group.layout.y,
        width: group.layout.width,
        height: group.layout.height,
        zIndex: group.layout.zIndex ?? 0,
        cursor,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onLostPointerCapture={() => {
        setIsDragging(false);
        setResizeEdge(null);
        setHoveredEdge(null);
        onDragEnd?.();
      }}
      onMouseEnter={updateHoveredEdge}
      onMouseLeave={() => {
        if (!isDragging && !resizeEdge) setHoveredEdge(null);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(group.id, activePageId, event);
      }}
    >
      <div
        className="absolute left-0 max-w-full truncate font-medium text-muted-foreground pointer-events-none"
        title={group.title}
        style={{
          top: -labelTopOffset,
          fontSize: labelFontSize,
          lineHeight: 1.2,
        }}
      >
        {group.title}
      </div>

      {group.directoryCollapsed ? (
        <button
          type="button"
          className="absolute top-0 z-20 flex h-9 min-w-9 items-center justify-center rounded-md border bg-background px-2 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            right: `calc(100% + ${PAGE_GROUP_DIRECTORY_GAP}px)`,
          }}
          aria-label={`展开页面目录，${group.pages.length} 个页面`}
          title="展开页面目录"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDirectoryCollapsedChange(group.id, false);
            onSelect(group.id, activePageId);
          }}
        >
          {group.pages.length}
        </button>
      ) : (
        <div
          className="absolute top-0 z-20 overflow-hidden rounded-md border bg-background shadow-lg"
          style={{
            right: `calc(100% + ${PAGE_GROUP_DIRECTORY_GAP}px)`,
            width: PAGE_GROUP_DIRECTORY_WIDTH,
            maxHeight: Math.max(group.layout.height, 120),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-2 py-1.5">
            <span className="truncate text-xs font-medium text-muted-foreground">
              目录
            </span>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="折叠页面目录"
              title="折叠页面目录"
              onClick={(event) => {
                event.stopPropagation();
                onDirectoryCollapsedChange(group.id, true);
                onSelect(group.id, activePageId);
              }}
            >
              <span aria-hidden="true">‹</span>
            </button>
          </div>
          <div className="scrollbar-thin max-h-[inherit] overflow-auto py-1">
            {group.pages.map((entry) => {
              const active = entry.pageId === activePageId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={cn(
                    "block w-full truncate px-3 py-2 text-left text-xs transition-colors hover:bg-background/80",
                    active
                      ? "bg-background font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                  title={entry.title}
                  onClick={(event) => {
                    event.stopPropagation();
                    onActivePageChange(group.id, entry.pageId);
                    onSelect(group.id, entry.pageId, event);
                  }}
                >
                  {entry.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative h-full w-full overflow-hidden rounded-lg bg-white shadow-md">
        {activePage ? (
          <CanvasPagePreviewContent
            page={activePage}
            layout={previewLayout}
            sessionId={sessionId}
            screenshotUrl={screenshotUrls?.[activePage.id]}
            screenshotRenderBox={screenshotRenderBoxes?.[activePage.id]}
            renderMode={pageRenderModes[activePage.id] ?? "loading"}
            onConsoleEntry={onConsoleEntry}
            onError={onError}
            onPositionableSizes={onPositionableSizes}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted/35 text-sm text-muted-foreground">
            页面不存在
          </div>
        )}
      </div>

      <CanvasSelectionBox
        visible={selected || isDragging || Boolean(resizeEdge)}
        handles={editable}
      />
    </div>
  );
}

export function PreviewCanvas({
  editable = false,
  interactionMode,
  sessionId,
  projectId,
  pages,
  canvasState: externalState,
  onCanvasStateChange,
  onRequestDeletePages,
  onPageConfigEdit,
  onRuntimeConversionRequest,
  onCanvasClick,
  className,
  editingPageId,
  screenshotUrls,
  screenshotRenderBoxes,
  onConsoleEntry,
  onError,
  focusPageId,
  onVisiblePageIdsChange,
  fitToScreenOnMount = false,
  onFitToScreenOnMountComplete,
  onPositionableSizes,
  knowledgeDocuments,
  onCreateKnowledgeDocument,
  onUpdateKnowledgeDocument,
  onReadKnowledgeDocument,
  onRequestPastePages,
}: PreviewCanvasProps) {
  const resolvedInteractionMode =
    interactionMode ?? (editable ? "editor" : "readonly");
  const isEditorMode = resolvedInteractionMode === "editor";
  const canInteractWithViewport = resolvedInteractionMode !== "readonly";
  const [internalState, setInternalState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: computeInitialCanvasLayout(pages),
    pageGroups: {},
    hiddenPageIds: [],
    nodes: {},
    layers: {
      annotations: { nodes: {} },
    },
  });

  // 对齐辅助线状态
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [activeDragItemId, setActiveDragItemId] = useState<string | null>(null);
  const [documentDraft, setDocumentDraft] = useState<{
    nodeId?: string;
    knowledgeDocumentId?: string;
    markdown: string;
    title?: string;
  } | null>(null);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [draggingFileOver, setDraggingFileOver] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDocumentNodeIds, setSelectedDocumentNodeIds] = useState<
    string[]
  >([]);
  const [selectedPageGroupIds, setSelectedPageGroupIds] = useState<string[]>(
    [],
  );
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(
    null,
  );
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const pendingImageFilesRef = useRef<File[]>([]);

  // 工具模式状态
  const [toolMode, setToolMode] = useState<CanvasToolMode>("select");
  const effectiveToolMode: CanvasToolMode = resolveCanvasToolMode(
    toolMode,
    isEditorMode,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const activeDragItemIdRef = useRef<string | null>(null);
  const recentIframeAccessRef = useRef<Map<string, number>>(new Map());
  const prewarmedResourceFingerprintsRef = useRef<Set<string>>(new Set());
  const initialViewerFitSignatureRef = useRef<string | null>(null);
  const fitToScreenOnMountAppliedRef = useRef(false);
  const multiDragStartLayoutsRef = useRef<Record<
    string,
    CanvasPageLayout
  > | null>(null);

  const canvasState = useMemo(
    () => normalizeCanvasStateLayers(externalState || internalState),
    [externalState, internalState],
  );
  const isControlledState = externalState !== undefined;
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;

  const effectivePages = useMemo(() => {
    return normalizeCanvasPageLayouts(pages, canvasState.pages);
  }, [canvasState.pages, pages]);

  const pageIds = useMemo(() => new Set(pages.map((page) => page.id)), [pages]);
  const pagesById = useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  );
  const hiddenPageIdSet = useMemo(
    () => new Set(canvasState.hiddenPageIds ?? []),
    [canvasState.hiddenPageIds],
  );
  const effectivePageGroups = useMemo(() => {
    return Object.fromEntries(
      Object.entries(canvasState.pageGroups ?? {})
        .map(([groupId, group]) => {
          const entries = group.pages.filter((entry) =>
            pageIds.has(entry.pageId),
          );
          if (entries.length === 0) return null;
          const activePageId = entries.some(
            (entry) => entry.pageId === group.activePageId,
          )
            ? group.activePageId
            : entries[0].pageId;
          return [
            groupId,
            {
              ...group,
              pages: entries,
              activePageId,
            },
          ] as const;
        })
        .filter(
          (entry): entry is readonly [string, CanvasPageGroup] =>
            entry !== null,
        ),
    );
  }, [canvasState.pageGroups, pageIds]);
  const pageGroupIds = useMemo(
    () => new Set(Object.keys(effectivePageGroups)),
    [effectivePageGroups],
  );

  const standalonePageLayouts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(effectivePages).filter(
          ([pageId]) => !hiddenPageIdSet.has(pageId),
        ),
      ),
    [effectivePages, hiddenPageIdSet],
  );
  const activePageGroupLayouts = useMemo(
    () =>
      Object.fromEntries(
        Object.values(effectivePageGroups).map((group) => [
          group.activePageId,
          group.layout,
        ]),
      ),
    [effectivePageGroups],
  );
  const renderablePageLayouts = useMemo(
    () => ({ ...standalonePageLayouts, ...activePageGroupLayouts }),
    [activePageGroupLayouts, standalonePageLayouts],
  );

  const effectiveNodes = getAnnotationsFromCanvasState(canvasState);
  const documentNodes = useMemo(
    () =>
      Object.values(effectiveNodes).filter(
        (node): node is CanvasDocumentNode => node.kind === "document",
      ),
    [effectiveNodes],
  );
  const visibleDocumentNodeIds = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return new Set<string>();
    }
    const documentLayouts = Object.fromEntries(
      documentNodes.map((node) => [node.id, node.layout]),
    );
    return getVisiblePageIds(
      documentLayouts,
      canvasState.viewport,
      containerSize.width,
      containerSize.height,
    );
  }, [
    canvasState.viewport,
    containerSize.height,
    containerSize.width,
    documentNodes,
  ]);
  const readableDocumentNodes = useMemo(
    () =>
      documentNodes.filter(
        (node) =>
          visibleDocumentNodeIds.has(node.id) ||
          selectedNodeId === node.id ||
          selectedDocumentNodeIds.includes(node.id) ||
          documentDraft?.nodeId === node.id,
      ),
    [
      documentDraft?.nodeId,
      documentNodes,
      selectedDocumentNodeIds,
      selectedNodeId,
      visibleDocumentNodeIds,
    ],
  );
  const {
    markdownByDocumentId: knowledgeDocumentMarkdown,
    setMarkdownByDocumentId: setKnowledgeDocumentMarkdown,
  } = useCanvasDocumentMarkdown({
    documentNodes: readableDocumentNodes,
    onReadKnowledgeDocument,
  });
  const knowledgeDocumentsById = useMemo(
    () =>
      new Map(
        (knowledgeDocuments ?? []).map((document) => [document.id, document]),
      ),
    [knowledgeDocuments],
  );

  const selectedPageLayoutEntries = useMemo(
    () =>
      selectedPageIds
        .map((pageId) => {
          const layout = effectivePages[pageId];
          return layout ? { kind: "page" as const, id: pageId, layout } : null;
        })
        .filter(
          (
            entry,
          ): entry is {
            kind: "page";
            id: string;
            layout: CanvasPageLayout;
          } => Boolean(entry),
        ),
    [effectivePages, selectedPageIds],
  );
  const selectedPageGroupLayoutEntries = useMemo(
    () =>
      selectedPageGroupIds
        .map((groupId) => {
          const group = effectivePageGroups[groupId];
          return group
            ? { kind: "page-group" as const, id: groupId, layout: group.layout }
            : null;
        })
        .filter(
          (
            entry,
          ): entry is {
            kind: "page-group";
            id: string;
            layout: CanvasPageLayout;
          } => Boolean(entry),
        ),
    [effectivePageGroups, selectedPageGroupIds],
  );
  const selectedPageLikeLayoutEntries = useMemo(
    () => [...selectedPageLayoutEntries, ...selectedPageGroupLayoutEntries],
    [selectedPageGroupLayoutEntries, selectedPageLayoutEntries],
  );
  const selectedPageLikeCount = selectedPageLikeLayoutEntries.length;
  const selectedPageLayouts = useMemo(
    () => selectedPageLikeLayoutEntries.map((entry) => entry.layout),
    [selectedPageLikeLayoutEntries],
  );
  const selectedPageBounds = useMemo(
    () => getLayoutBounds(selectedPageLayouts),
    [selectedPageLayouts],
  );
  const selectedDocumentNodes = useMemo(
    () =>
      selectedDocumentNodeIds
        .map((nodeId) => effectiveNodes[nodeId])
        .filter((node): node is CanvasDocumentNode =>
          Boolean(node && node.kind === "document"),
        ),
    [effectiveNodes, selectedDocumentNodeIds],
  );
  const selectedDocumentBounds = useMemo(
    () => getLayoutBounds(selectedDocumentNodes.map((node) => node.layout)),
    [selectedDocumentNodes],
  );

  const pageResourceDescriptors = useMemo(() => {
    return Object.fromEntries(
      pages.map((page) => [
        page.id,
        getPreviewPageResourceDescriptor(page, { sessionId }),
      ]),
    );
  }, [pages, sessionId]);

  const allItemLayouts = useMemo(() => {
    const nodeLayouts = Object.fromEntries(
      Object.entries(effectiveNodes).map(([id, node]) => [id, node.layout]),
    );
    const pageGroupLayouts = Object.fromEntries(
      Object.entries(effectivePageGroups).map(([id, group]) => [
        id,
        group.layout,
      ]),
    );
    return { ...standalonePageLayouts, ...pageGroupLayouts, ...nodeLayouts };
  }, [effectiveNodes, effectivePageGroups, standalonePageLayouts]);

  const allItemLayoutSignature = useMemo(
    () => getCanvasLayoutSignature(allItemLayouts),
    [allItemLayouts],
  );

  const updateState = useCallback(
    (updater: (prev: CanvasState) => CanvasState) => {
      const previousState = canvasStateRef.current;
      const newState = updater(previousState);
      if (newState === previousState) {
        return;
      }
      const normalizedState = normalizeCanvasStateLayers(newState);
      canvasStateRef.current = normalizedState;
      if (isControlledState) {
        onCanvasStateChange(normalizedState);
      } else {
        setInternalState(normalizedState);
      }
    },
    [isControlledState, onCanvasStateChange],
  );

  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedDocumentNodeIds([]);
    setSelectedPageGroupIds([]);
    setEditingTextNodeId(null);
    setSelectedPageIds([]);
    onCanvasClick?.();
  }, [onCanvasClick]);

  useEffect(() => {
    setSelectedPageIds((current) =>
      current.filter(
        (pageId) => pageIds.has(pageId) && !hiddenPageIdSet.has(pageId),
      ),
    );
  }, [hiddenPageIdSet, pageIds]);

  useEffect(() => {
    setSelectedPageGroupIds((current) =>
      current.filter((groupId) => effectivePageGroups[groupId]),
    );
  }, [effectivePageGroups]);

  useEffect(() => {
    setSelectedDocumentNodeIds((current) =>
      current.filter((nodeId) => effectiveNodes[nodeId]?.kind === "document"),
    );
  }, [effectiveNodes]);

  const handleLayoutChange = useCallback(
    (pageId: string, layout: CanvasPageLayout) => {
      updateState((prev) => ({
        ...prev,
        pages: { ...prev.pages, [pageId]: layout },
      }));
    },
    [updateState],
  );

  const handleSelectionRectChange = useCallback(
    (rect: CanvasRect) => {
      if (!isEditorMode || effectiveToolMode !== "select") return;
      if (rect.width < 2 && rect.height < 2) {
        setSelectedPageIds([]);
        setSelectedNodeId(null);
        setSelectedDocumentNodeIds([]);
        setSelectedPageGroupIds([]);
        setEditingTextNodeId(null);
        return;
      }

      const nextSelectedPageIds = pages
        .filter((page) => {
          const layout = standalonePageLayouts[page.id];
          if (!layout) return false;
          return rectsIntersect(rect, layout);
        })
        .map((page) => page.id);
      const nextSelectedPageGroupIds = Object.values(effectivePageGroups)
        .filter((group) => rectsIntersect(rect, group.layout))
        .map((group) => group.id);
      const hasSelectedPageLikeItems =
        nextSelectedPageIds.length > 0 || nextSelectedPageGroupIds.length > 0;

      const nextSelectedDocumentNodes = Object.values(effectiveNodes).filter(
        (node): node is CanvasDocumentNode =>
          node.kind === "document" && rectsIntersect(rect, node.layout),
      );

      const nextSelectedTextNode = Object.values(effectiveNodes).find(
        (node) => node.kind === "text" && rectsIntersect(rect, node.layout),
      );

      const nextSelectedDocumentNodeIds = !hasSelectedPageLikeItems
        ? nextSelectedDocumentNodes.map((node) => node.id)
        : [];

      setSelectedDocumentNodeIds(nextSelectedDocumentNodeIds);
      setSelectedPageGroupIds(nextSelectedPageGroupIds);
      setSelectedNodeId(
        !hasSelectedPageLikeItems
          ? nextSelectedDocumentNodeIds.length === 1
            ? nextSelectedDocumentNodeIds[0]
            : nextSelectedDocumentNodeIds.length === 0 && nextSelectedTextNode
              ? nextSelectedTextNode.id
              : null
          : null,
      );
      setEditingTextNodeId(null);
      setSelectedPageIds(nextSelectedPageIds);
    },
    [
      effectiveNodes,
      effectivePageGroups,
      effectiveToolMode,
      isEditorMode,
      pages,
      standalonePageLayouts,
    ],
  );

  const handlePageSelect = useCallback(
    (pageId: string, event?: React.PointerEvent | React.MouseEvent) => {
      if (isEditorMode && effectiveToolMode === "select") {
        const isAdditive =
          Boolean(event?.shiftKey) ||
          Boolean(event?.metaKey) ||
          Boolean(event?.ctrlKey);
        setSelectedNodeId(null);
        setSelectedDocumentNodeIds([]);
        setEditingTextNodeId(null);
        if (isAdditive) {
          setSelectedPageIds((current) =>
            current.includes(pageId)
              ? current.filter((selectedId) => selectedId !== pageId)
              : [...current, pageId],
          );
          return;
        }
        setSelectedPageGroupIds([]);
        setSelectedPageIds([pageId]);
        onPageConfigEdit?.(pageId);
        return;
      }
      if (!isEditorMode) {
        onPageConfigEdit?.(pageId);
      }
    },
    [effectiveToolMode, isEditorMode, onPageConfigEdit],
  );

  const handleNodeSelect = useCallback(
    (nodeId: string, event?: React.PointerEvent | React.MouseEvent) => {
      const node = effectiveNodes[nodeId];
      const isAdditive =
        Boolean(event?.shiftKey) ||
        Boolean(event?.metaKey) ||
        Boolean(event?.ctrlKey);

      setSelectedPageIds([]);
      setSelectedPageGroupIds([]);
      setEditingTextNodeId(null);

      if (node?.kind === "document" && isAdditive) {
        setSelectedNodeId(null);
        setSelectedDocumentNodeIds((current) =>
          current.includes(nodeId)
            ? current.filter((selectedId) => selectedId !== nodeId)
            : [...current, nodeId],
        );
        return;
      }

      setSelectedDocumentNodeIds(node?.kind === "document" ? [nodeId] : []);
      setSelectedNodeId(nodeId);
    },
    [effectiveNodes],
  );

  const updateSelectedPageLayouts = useCallback(
    (action: MultiPageAlignAction) => {
      if (selectedPageLikeLayoutEntries.length < 2 || !selectedPageBounds)
        return;

      updateState((prev) => {
        const selectedLayouts = selectedPageLikeLayoutEntries;
        if (selectedLayouts.length < 2) return prev;

        const nextPages = { ...prev.pages };
        const nextPageGroups = { ...(prev.pageGroups ?? {}) };
        const applyLayout = (
          entry: (typeof selectedLayouts)[number],
          layout: CanvasPageLayout,
        ) => {
          if (entry.kind === "page") {
            nextPages[entry.id] = layout;
            return;
          }
          const group = nextPageGroups[entry.id];
          if (!group) return;
          nextPageGroups[entry.id] = {
            ...group,
            layout,
            updatedAt: Date.now(),
          };
        };

        if (action === "distribute-x") {
          if (selectedLayouts.length < 3) return prev;
          const sorted = [...selectedLayouts].sort(
            (a, b) => a.layout.x - b.layout.x,
          );
          const totalWidth = sorted.reduce(
            (sum, entry) => sum + entry.layout.width,
            0,
          );
          const gap =
            (selectedPageBounds.width - totalWidth) / (sorted.length - 1);
          let cursor = selectedPageBounds.x;
          for (const entry of sorted) {
            applyLayout(entry, { ...entry.layout, x: cursor });
            cursor += entry.layout.width + gap;
          }
          return { ...prev, pages: nextPages, pageGroups: nextPageGroups };
        }

        if (action === "distribute-y") {
          if (selectedLayouts.length < 3) return prev;
          const sorted = [...selectedLayouts].sort(
            (a, b) => a.layout.y - b.layout.y,
          );
          const totalHeight = sorted.reduce(
            (sum, entry) => sum + entry.layout.height,
            0,
          );
          const gap =
            (selectedPageBounds.height - totalHeight) / (sorted.length - 1);
          let cursor = selectedPageBounds.y;
          for (const entry of sorted) {
            applyLayout(entry, { ...entry.layout, y: cursor });
            cursor += entry.layout.height + gap;
          }
          return { ...prev, pages: nextPages, pageGroups: nextPageGroups };
        }

        for (const entry of selectedLayouts) {
          const { layout } = entry;
          if (action === "left") {
            applyLayout(entry, { ...layout, x: selectedPageBounds.x });
          } else if (action === "center-x") {
            applyLayout(entry, {
              ...layout,
              x:
                selectedPageBounds.x +
                selectedPageBounds.width / 2 -
                layout.width / 2,
            });
          } else if (action === "right") {
            applyLayout(entry, {
              ...layout,
              x: selectedPageBounds.x + selectedPageBounds.width - layout.width,
            });
          } else if (action === "top") {
            applyLayout(entry, { ...layout, y: selectedPageBounds.y });
          } else if (action === "center-y") {
            applyLayout(entry, {
              ...layout,
              y:
                selectedPageBounds.y +
                selectedPageBounds.height / 2 -
                layout.height / 2,
            });
          } else if (action === "bottom") {
            applyLayout(entry, {
              ...layout,
              y:
                selectedPageBounds.y +
                selectedPageBounds.height -
                layout.height,
            });
          }
        }

        return { ...prev, pages: nextPages, pageGroups: nextPageGroups };
      });
    },
    [selectedPageBounds, selectedPageLikeLayoutEntries, updateState],
  );

  const handleNodeLayoutChange = useCallback(
    (nodeId: string, layout: CanvasPageLayout) => {
      updateState((prev) => {
        const node = prev.nodes?.[nodeId];
        if (!node) return prev;
        return withCanvasAnnotationNodes(prev, {
          ...(prev.nodes ?? {}),
          [nodeId]: { ...node, layout, updatedAt: Date.now() },
        });
      });
    },
    [updateState],
  );

  const handlePageGroupLayoutChange = useCallback(
    (groupId: string, layout: CanvasPageLayout) => {
      updateState((prev) => {
        const group = prev.pageGroups?.[groupId];
        if (!group) return prev;
        return {
          ...prev,
          pageGroups: {
            ...(prev.pageGroups ?? {}),
            [groupId]: { ...group, layout, updatedAt: Date.now() },
          },
        };
      });
    },
    [updateState],
  );

  const handlePageGroupSelect = useCallback(
    (
      groupId: string,
      activePageId: string,
      event?: React.PointerEvent | React.MouseEvent,
    ) => {
      const isAdditive =
        Boolean(event?.shiftKey) ||
        Boolean(event?.metaKey) ||
        Boolean(event?.ctrlKey);
      setSelectedDocumentNodeIds([]);
      setSelectedNodeId(null);
      setEditingTextNodeId(null);
      if (isAdditive) {
        setSelectedPageGroupIds((current) =>
          current.includes(groupId)
            ? current.filter((selectedId) => selectedId !== groupId)
            : [...current, groupId],
        );
        return;
      }
      setSelectedPageIds([]);
      setSelectedPageGroupIds([groupId]);
      onPageConfigEdit?.(activePageId);
    },
    [onPageConfigEdit],
  );

  const handlePageGroupActivePageChange = useCallback(
    (groupId: string, pageId: string) => {
      updateState((prev) => {
        const group = prev.pageGroups?.[groupId];
        if (!group || !group.pages.some((entry) => entry.pageId === pageId)) {
          return prev;
        }
        return {
          ...prev,
          pageGroups: {
            ...(prev.pageGroups ?? {}),
            [groupId]: {
              ...group,
              activePageId: pageId,
              updatedAt: Date.now(),
            },
          },
        };
      });
    },
    [updateState],
  );

  const handlePageGroupDirectoryCollapsedChange = useCallback(
    (groupId: string, collapsed: boolean) => {
      updateState((prev) => {
        const group = prev.pageGroups?.[groupId];
        if (!group) return prev;
        return {
          ...prev,
          pageGroups: {
            ...(prev.pageGroups ?? {}),
            [groupId]: {
              ...group,
              directoryCollapsed: collapsed,
              updatedAt: Date.now(),
            },
          },
        };
      });
    },
    [updateState],
  );

  const handleNodeToggleCollapse = useCallback(
    (nodeId: string) => {
      updateState((prev) => {
        const node = prev.nodes?.[nodeId];
        if (!node || node.kind !== "document") return prev;
        const nextCollapsed = !node.collapsed;
        const expandedHeight = nextCollapsed
          ? Math.max(node.layout.height, DOCUMENT_NODE_COLLAPSED_HEIGHT)
          : (node.expandedHeight ?? DOCUMENT_NODE_DEFAULT_HEIGHT);
        return withCanvasAnnotationNodes(prev, {
          ...(prev.nodes ?? {}),
          [nodeId]: {
            ...node,
            collapsed: nextCollapsed,
            expandedHeight,
            layout: {
              ...node.layout,
              height: nextCollapsed
                ? DOCUMENT_NODE_COLLAPSED_HEIGHT
                : Math.max(expandedHeight, DOCUMENT_NODE_COLLAPSED_HEIGHT),
            },
            updatedAt: Date.now(),
          },
        });
      });
    },
    [updateState],
  );

  const handleActiveDocumentChange = useCallback(
    (nodeId: string, documentId: string) => {
      updateState((prev) => {
        const node = prev.nodes?.[nodeId];
        if (!node || node.kind !== "document") return prev;
        if (
          !getCanvasDocumentEntries(node).some(
            (entry) => entry.id === documentId,
          )
        ) {
          return prev;
        }
        return withCanvasAnnotationNodes(prev, {
          ...(prev.nodes ?? {}),
          [nodeId]: {
            ...node,
            activeDocumentId: documentId,
            updatedAt: Date.now(),
          },
        });
      });
    },
    [updateState],
  );

  const getNodeLayout = useCallback(
    (
      width: number,
      height: number,
      canvasPoint?: CanvasPoint,
    ): CanvasPageLayout => {
      const zoom = canvasState.viewport.zoom || 1;
      const centerX =
        canvasPoint?.x ??
        (-canvasState.viewport.x + containerSize.width / 2) / zoom;
      const centerY =
        canvasPoint?.y ??
        (-canvasState.viewport.y + containerSize.height / 2) / zoom;
      const maxZ = Math.max(
        0,
        ...Object.values(allItemLayouts).map((layout) => layout.zIndex ?? 0),
      );
      return {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
        zIndex: maxZ + 1,
      };
    },
    [
      allItemLayouts,
      canvasState.viewport,
      containerSize.height,
      containerSize.width,
    ],
  );

  const getCanvasPointFromClient = useCallback(
    (clientX: number, clientY: number): CanvasPoint | undefined => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return undefined;
      }
      const container = containerRef.current;
      if (!container) return undefined;
      const rect = container.getBoundingClientRect();
      return screenPointToCanvasPoint(
        clientX,
        clientY,
        rect,
        canvasState.viewport,
      );
    },
    [canvasState.viewport],
  );

  const addOrUpdateNode = useCallback(
    (node: CanvasFreeNode) => {
      updateState((prev) => ({
        ...withCanvasAnnotationNodes(prev, {
          ...(prev.nodes ?? {}),
          [node.id]: node,
        }),
      }));
    },
    [updateState],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      updateState((prev) => {
        const node = prev.nodes?.[nodeId];
        const nextNodes = { ...(prev.nodes ?? {}) };
        delete nextNodes[nodeId];
        const hiddenKnowledgeDocumentIds =
          node?.kind === "document"
            ? Array.from(
                new Set([
                  ...(prev.hiddenKnowledgeDocumentIds ?? []),
                  ...getDocumentNodeKnowledgeIds(node),
                ]),
              )
            : prev.hiddenKnowledgeDocumentIds;
        return withCanvasAnnotationNodes(
          {
            ...prev,
            ...(hiddenKnowledgeDocumentIds
              ? { hiddenKnowledgeDocumentIds }
              : {}),
          },
          nextNodes,
        );
      });
      setSelectedNodeId((current) => (current === nodeId ? null : current));
      setSelectedDocumentNodeIds((current) =>
        current.filter((selectedId) => selectedId !== nodeId),
      );
      setEditingTextNodeId((current) => (current === nodeId ? null : current));
    },
    [updateState],
  );

  useEffect(() => {
    if (!knowledgeDocuments) return;

    updateState((prev) => {
      const nodes = prev.nodes ?? {};
      const validKnowledgeIds = new Set(
        knowledgeDocuments.map((item) => item.id),
      );
      const hiddenKnowledgeIds = new Set(prev.hiddenKnowledgeDocumentIds ?? []);
      const existingKnowledgeIds = new Set<string>();
      const nextNodes = { ...nodes };
      let changed = false;

      for (const [nodeId, node] of Object.entries(nodes)) {
        if (node.kind !== "document") continue;
        const entries = getCanvasDocumentEntries(node);
        if (entries.length === 0) continue;
        for (const entry of entries) {
          existingKnowledgeIds.add(entry.knowledgeDocument.id);
        }
        const nextEntries = entries.filter((entry) =>
          validKnowledgeIds.has(entry.knowledgeDocument.id),
        );
        if (nextEntries.length === entries.length) continue;

        if (nextEntries.length === 0) {
          delete nextNodes[nodeId];
          changed = true;
          continue;
        }

        const nextActiveDocumentId =
          nextEntries.find((entry) => entry.id === node.activeDocumentId)?.id ??
          nextEntries[0].id;
        nextNodes[nodeId] = {
          ...node,
          documents: nextEntries,
          activeDocumentId: nextActiveDocumentId,
          updatedAt: Date.now(),
        };
        changed = true;
      }

      const maxZ = Math.max(
        0,
        ...Object.values(prev.pages).map((layout) => layout.zIndex ?? 0),
        ...Object.values(nextNodes).map((node) => node.layout.zIndex ?? 0),
      );

      knowledgeDocuments.forEach((document, index) => {
        if (existingKnowledgeIds.has(document.id)) return;
        if (hiddenKnowledgeIds.has(document.id)) return;
        const now = Date.now();
        const id = `doc-${document.id}`;
        nextNodes[id] = {
          id,
          kind: "document",
          title: document.title,
          knowledgeDocument: document,
          layout: {
            x: 80 + index * 28,
            y: 80 + index * 28,
            width: 420,
            height: 360,
            zIndex: maxZ + index + 1,
          },
          createdAt: now,
          updatedAt: now,
        };
        changed = true;
      });

      return changed ? { ...prev, nodes: nextNodes } : prev;
    });
  }, [knowledgeDocuments, updateState]);

  useEffect(() => {
    if (
      !isEditorMode ||
      (!selectedNodeId &&
        selectedDocumentNodeIds.length === 0 &&
        selectedPageIds.length === 0) ||
      documentDraft
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target?.closest("input,textarea,select,[contenteditable='true']") ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      if (selectedPageIds.length > 0) {
        void onRequestDeletePages?.(selectedPageIds);
        return;
      }
      if (selectedDocumentNodeIds.length > 1) {
        selectedDocumentNodeIds.forEach((nodeId) => deleteNode(nodeId));
        return;
      }
      if (selectedNodeId) {
        deleteNode(selectedNodeId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    deleteNode,
    documentDraft,
    isEditorMode,
    onRequestDeletePages,
    selectedDocumentNodeIds,
    selectedNodeId,
    selectedPageIds,
  ]);

  // ── 复制快捷键（Ctrl/Cmd+C）──
  useEffect(() => {
    if (!isEditorMode || documentDraft) return;
    const hasSelection =
      selectedNodeId ||
      selectedDocumentNodeIds.length > 0 ||
      selectedPageIds.length > 0 ||
      selectedPageGroupIds.length > 0;
    if (!hasSelection) return;

    const handleCopy = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key !== "c" || !(event.metaKey || event.ctrlKey)) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();

      // 收集选中的自由节点
      const copiedNodeIds = new Set<string>();
      if (selectedDocumentNodeIds.length > 0) {
        selectedDocumentNodeIds.forEach((id) => copiedNodeIds.add(id));
      } else if (selectedNodeId) {
        copiedNodeIds.add(selectedNodeId);
      }
      const copiedNodes: CanvasFreeNode[] = [];
      copiedNodeIds.forEach((id) => {
        const node = effectiveNodes[id];
        if (node) copiedNodes.push(node);
      });

      // 收集选中的页面及布局
      const copiedPages: CanvasPageData[] = [];
      const copiedPageLayouts: Record<string, CanvasPageLayout> = {};
      selectedPageIds.forEach((pageId) => {
        const page = pagesById.get(pageId);
        const layout = effectivePages[pageId];
        if (page) copiedPages.push(page);
        if (layout) copiedPageLayouts[pageId] = layout;
      });

      // 收集选中的页面组
      const copiedPageGroups: CanvasPageGroup[] = [];
      selectedPageGroupIds.forEach((groupId) => {
        const group = canvasState.pageGroups?.[groupId];
        if (group) copiedPageGroups.push(group);
      });

      const bounds = computeBounds(copiedPageLayouts, copiedNodes);

      writeCanvasClipboard({
        version: 1,
        copiedAt: Date.now(),
        sourceProjectId: projectId,
        sourceSessionId: sessionId,
        nodes: copiedNodes,
        pages: copiedPages,
        pageLayouts: copiedPageLayouts,
        pageGroups: copiedPageGroups,
        bounds,
      });
    };

    window.addEventListener("keydown", handleCopy);
    return () => window.removeEventListener("keydown", handleCopy);
  }, [
    isEditorMode,
    documentDraft,
    selectedNodeId,
    selectedDocumentNodeIds,
    selectedPageIds,
    selectedPageGroupIds,
    effectiveNodes,
    effectivePages,
    pagesById,
    canvasState.pageGroups,
    projectId,
    sessionId,
  ]);

  // ── 粘贴快捷键（Ctrl/Cmd+V）──
  useEffect(() => {
    if (!isEditorMode || documentDraft) return;

    const handlePaste = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key !== "v" || !(event.metaKey || event.ctrlKey)) return;
      if (isEditableTarget(event.target)) return;
      // 如果系统剪贴板有文件，让现有 onPaste 处理
      // （keyboard event 无法直接读取 clipboardData.files，此处不阻止）

      const clipboardData = readCanvasClipboard();
      if (!clipboardData) return;
      const hasContent =
        clipboardData.nodes.length > 0 ||
        clipboardData.pages.length > 0 ||
        clipboardData.pageGroups.length > 0;
      if (!hasContent) return;
      event.preventDefault();

      const PASTE_OFFSET = 24;
      const zoom = canvasState.viewport.zoom || 1;
      const centerX =
        (-canvasState.viewport.x + containerSize.width / 2) / zoom;
      const centerY =
        (-canvasState.viewport.y + containerSize.height / 2) / zoom;
      const offsetX = clipboardData.bounds
        ? centerX - clipboardData.bounds.x + PASTE_OFFSET
        : PASTE_OFFSET;
      const offsetY = clipboardData.bounds
        ? centerY - clipboardData.bounds.y + PASTE_OFFSET
        : PASTE_OFFSET;
      const now = Date.now();
      const maxZ = Math.max(
        0,
        ...Object.values(allItemLayouts).map((l) => l.zIndex ?? 0),
      );

      // A. 粘贴自由节点
      const newNodeIds: string[] = [];
      if (clipboardData.nodes.length > 0) {
        const newNodes: CanvasFreeNode[] = clipboardData.nodes.map(
          (node, index) => {
            const prefix =
              node.kind === "text"
                ? "text"
                : node.kind === "image"
                  ? "img"
                  : "doc";
            const newId = `${prefix}-${crypto.randomUUID()}`;
            newNodeIds.push(newId);
            return {
              ...node,
              id: newId,
              layout: {
                ...node.layout,
                x: node.layout.x + offsetX,
                y: node.layout.y + offsetY,
                zIndex: maxZ + 1 + index,
              },
              createdAt: now,
              updatedAt: now,
            } as CanvasFreeNode;
          },
        );

        updateState((prev) => {
          const nextNodes = { ...(prev.nodes ?? {}) };
          for (const node of newNodes) {
            nextNodes[node.id] = node;
          }
          return withCanvasAnnotationNodes(prev, nextNodes);
        });
      }

      // B. 粘贴页面（通过回调通知父组件）
      if (clipboardData.pages.length > 0 && onRequestPastePages) {
        // 对页面布局应用偏移
        const shiftedPageLayouts: Record<string, CanvasPageLayout> = {};
        for (const [pageId, layout] of Object.entries(
          clipboardData.pageLayouts,
        )) {
          shiftedPageLayouts[pageId] = {
            ...layout,
            x: layout.x + offsetX,
            y: layout.y + offsetY,
            zIndex: maxZ + 1,
          };
        }

        void onRequestPastePages({
          pages: clipboardData.pages,
          pageLayouts: shiftedPageLayouts,
          pageGroups: clipboardData.pageGroups,
        }).then(({ pageIdMapping }) => {
          // 将新页面布局写入画布状态
          updateState((prev) => {
            const nextPages = { ...prev.pages };
            pageIdMapping.forEach((newId, oldId) => {
              const layout = shiftedPageLayouts[oldId];
              if (layout) nextPages[newId] = layout;
            });
            // 更新页面组中的 pageId 引用
            const nextGroups = { ...(prev.pageGroups ?? {}) };
            for (const oldGroup of clipboardData.pageGroups) {
              const newGroupPages = oldGroup.pages.map((entry) => ({
                ...entry,
                pageId: pageIdMapping.get(entry.pageId) ?? entry.pageId,
              }));
              const newActivePageId =
                pageIdMapping.get(oldGroup.activePageId) ??
                oldGroup.activePageId;
              const groupId = `page-group-${crypto.randomUUID()}`;
              nextGroups[groupId] = {
                ...oldGroup,
                id: groupId,
                pages: newGroupPages,
                activePageId: newActivePageId,
                createdAt: now,
                updatedAt: now,
              };
            }
            return {
              ...prev,
              pages: nextPages,
              pageGroups:
                Object.keys(nextGroups).length > 0
                  ? nextGroups
                  : prev.pageGroups,
            };
          });

          // 选中新粘贴的页面
          const newPageIds = Array.from(pageIdMapping.values());
          setSelectedPageIds(newPageIds);
          setSelectedNodeId(null);
          setSelectedDocumentNodeIds([]);
          setSelectedPageGroupIds([]);
        });
      }

      // 选中粘贴的节点（如果有节点且无页面）
      if (newNodeIds.length > 0 && clipboardData.pages.length === 0) {
        if (newNodeIds.length === 1) {
          setSelectedNodeId(newNodeIds[0]);
          setSelectedDocumentNodeIds([]);
        } else {
          setSelectedNodeId(null);
          setSelectedDocumentNodeIds(newNodeIds);
        }
        setSelectedPageIds([]);
        setSelectedPageGroupIds([]);
      }
    };

    window.addEventListener("keydown", handlePaste);
    return () => window.removeEventListener("keydown", handlePaste);
  }, [
    isEditorMode,
    documentDraft,
    canvasState.viewport,
    containerSize.width,
    containerSize.height,
    allItemLayouts,
    updateState,
    onRequestPastePages,
  ]);

  // 开始拖拽/缩放时，清空辅助线
  const handleDragStart = useCallback(
    (itemId: string) => {
      activeDragItemIdRef.current = itemId;
      setActiveDragItemId(itemId);
      setAlignmentGuides([]);
      if (
        pageIds.has(itemId) &&
        selectedPageIds.length > 1 &&
        selectedPageIds.includes(itemId)
      ) {
        multiDragStartLayoutsRef.current = Object.fromEntries(
          selectedPageIds
            .map((pageId) => {
              const layout = effectivePages[pageId];
              return layout ? [pageId, { ...layout }] : null;
            })
            .filter(
              (entry): entry is [string, CanvasPageLayout] => entry !== null,
            ),
        );
      } else {
        multiDragStartLayoutsRef.current = null;
      }
    },
    [effectivePages, pageIds, selectedPageIds],
  );

  // 拖拽/缩放过程中计算对齐
  const handleDragMove = useCallback(
    (itemId: string, layout: CanvasPageLayout, edge?: string) => {
      const activeDragItemIdValue =
        activeDragItemIdRef.current ?? activeDragItemId;
      if (!activeDragItemIdValue || activeDragItemIdValue !== itemId) return;
      const isPageItem = pageIds.has(itemId);
      const isPageGroupItem = pageGroupIds.has(itemId);

      if (isPageItem && !edge && multiDragStartLayoutsRef.current?.[itemId]) {
        const startLayout = multiDragStartLayoutsRef.current[itemId];
        const dx = layout.x - startLayout.x;
        const dy = layout.y - startLayout.y;

        updateState((prev) => ({
          ...prev,
          pages: {
            ...prev.pages,
            ...Object.fromEntries(
              Object.entries(multiDragStartLayoutsRef.current ?? {}).map(
                ([pageId, start]) => [
                  pageId,
                  {
                    ...start,
                    x: start.x + dx,
                    y: start.y + dy,
                  },
                ],
              ),
            ),
          },
        }));
        setAlignmentGuides([]);
        return;
      }

      const otherLayouts = Object.entries(allItemLayouts)
        .filter(([id]) => id !== itemId)
        .map(([, l]) => l);

      const { layout: alignedLayout, guides } = computeAlignment(
        layout,
        otherLayouts,
      );

      setAlignmentGuides(guides);
      updateState((prev) => ({
        ...prev,
        pages: isPageItem
          ? { ...prev.pages, [itemId]: alignedLayout }
          : prev.pages,
        pageGroups:
          isPageGroupItem && prev.pageGroups?.[itemId]
            ? {
                ...prev.pageGroups,
                [itemId]: {
                  ...prev.pageGroups[itemId],
                  layout: alignedLayout,
                  updatedAt: Date.now(),
                },
              }
            : prev.pageGroups,
        nodes: prev.nodes?.[itemId]
          ? {
              ...prev.nodes,
              [itemId]: {
                ...prev.nodes[itemId],
                layout: alignedLayout,
                updatedAt: Date.now(),
              },
            }
          : prev.nodes,
      }));
    },
    [activeDragItemId, allItemLayouts, pageGroupIds, pageIds, updateState],
  );

  // 结束拖拽/缩放时，清空辅助线
  const handleDragEnd = useCallback(() => {
    activeDragItemIdRef.current = null;
    setActiveDragItemId(null);
    multiDragStartLayoutsRef.current = null;
    setAlignmentGuides([]);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visiblePageIds = useMemo(
    () =>
      getVisiblePageIds(
        renderablePageLayouts,
        canvasState.viewport,
        containerSize.width,
        containerSize.height,
      ),
    [renderablePageLayouts, canvasState.viewport, containerSize],
  );
  const visiblePageIdList = useMemo(
    () => Array.from(visiblePageIds).sort(),
    [visiblePageIds],
  );
  const lastEmittedVisiblePageIdListRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (
      lastEmittedVisiblePageIdListRef.current &&
      areStringListsEqual(
        lastEmittedVisiblePageIdListRef.current,
        visiblePageIdList,
      )
    ) {
      return;
    }
    lastEmittedVisiblePageIdListRef.current = visiblePageIdList;
    onVisiblePageIdsChange?.(visiblePageIdList);
  }, [onVisiblePageIdsChange, visiblePageIdList]);

  const pageRenderPlan = useMemo(
    () =>
      computePreviewRuntimePoolPlan({
        pages,
        layouts: renderablePageLayouts,
        visiblePageIds,
        viewport: canvasState.viewport,
        containerWidth: containerSize.width,
        containerHeight: containerSize.height,
        editingPageId,
        screenshotUrls,
        recentRuntimeAccess: recentIframeAccessRef.current,
        maxActiveRuntimes: DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES,
        maxSleepingRuntimes: DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES,
      }),
    [
      canvasState.viewport,
      containerSize.height,
      containerSize.width,
      editingPageId,
      renderablePageLayouts,
      pages,
      screenshotUrls,
      visiblePageIds,
    ],
  );
  const pageRenderModes = pageRenderPlan.modes;
  const shouldUseScreenshotLayer =
    pages.length >= MIN_CANVAS_SCREENSHOT_PAGE_COUNT;

  useEffect(() => {
    const currentTime = Date.now();
    for (const pageId of pageRenderPlan.activePageIds) {
      recentIframeAccessRef.current.set(pageId, currentTime);
    }

    const retainedPageIds = new Set(pageRenderPlan.retainedRuntimePageIds);
    for (const pageId of Array.from(recentIframeAccessRef.current.keys())) {
      if (!retainedPageIds.has(pageId) && !visiblePageIds.has(pageId)) {
        recentIframeAccessRef.current.delete(pageId);
      }
    }
  }, [
    pageRenderPlan.activePageIds,
    pageRenderPlan.retainedRuntimePageIds,
    pageRenderPlan.sleepingPageIds,
    visiblePageIds,
  ]);

  useEffect(() => {
    const warmPageIds = [
      ...pageRenderPlan.activePageIds,
      ...pageRenderPlan.sleepingPageIds,
    ];
    const urls: string[] = [];

    for (const pageId of warmPageIds) {
      const descriptor = pageResourceDescriptors[pageId];
      if (!descriptor) continue;
      if (
        prewarmedResourceFingerprintsRef.current.has(descriptor.fingerprint)
      ) {
        continue;
      }
      prewarmedResourceFingerprintsRef.current.add(descriptor.fingerprint);
      urls.push(...descriptor.imageUrls);
    }

    if (urls.length > 0) {
      void prewarmPreviewImageUrls(urls);
    }
  }, [
    pageRenderPlan.activePageIds,
    pageRenderPlan.sleepingPageIds,
    pageResourceDescriptors,
  ]);

  useEffect(() => {
    if (!focusPageId) return;
    const pageLayout = renderablePageLayouts[focusPageId];
    if (!pageLayout) return;
    const cw = containerSize.width;
    const ch = containerSize.height;
    if (cw === 0 || ch === 0) return;
    const zoom = canvasState.viewport.zoom || 1;
    const cx = pageLayout.x + pageLayout.width / 2;
    const cy = pageLayout.y + pageLayout.height / 2;
    updateState((prev) => ({
      ...prev,
      viewport: {
        ...prev.viewport,
        x: cw / 2 - cx * zoom,
        y: ch / 2 - cy * zoom,
      },
    }));
  }, [focusPageId]);

  const fitCanvasToScreen = useCallback(() => {
    const viewport = computeFitCanvasViewport(allItemLayouts, {
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
    });
    if (!viewport) return false;

    updateState((prev) => ({
      ...prev,
      viewport,
    }));
    return true;
  }, [allItemLayouts, containerSize, updateState]);

  const handleFitToScreen = useCallback(() => {
    fitCanvasToScreen();
  }, [fitCanvasToScreen]);

  useEffect(() => {
    if (!fitToScreenOnMount) {
      fitToScreenOnMountAppliedRef.current = false;
      return;
    }
    if (fitToScreenOnMountAppliedRef.current) {
      return;
    }
    if (!allItemLayoutSignature) {
      return;
    }
    if (!fitCanvasToScreen()) {
      return;
    }
    fitToScreenOnMountAppliedRef.current = true;
    onFitToScreenOnMountComplete?.();
  }, [
    allItemLayoutSignature,
    fitCanvasToScreen,
    fitToScreenOnMount,
    onFitToScreenOnMountComplete,
  ]);

  useEffect(() => {
    if (resolvedInteractionMode !== "viewer") {
      return;
    }
    if (!allItemLayoutSignature) {
      return;
    }
    if (initialViewerFitSignatureRef.current === allItemLayoutSignature) {
      return;
    }

    const viewport = computeFitCanvasViewport(allItemLayouts, {
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
    });
    if (!viewport) {
      return;
    }

    initialViewerFitSignatureRef.current = allItemLayoutSignature;
    updateState((prev) => ({
      ...prev,
      viewport,
    }));
  }, [
    allItemLayoutSignature,
    allItemLayouts,
    containerSize.height,
    containerSize.width,
    resolvedInteractionMode,
    updateState,
  ]);

  const handleAutoLayout = useCallback(() => {
    const arrangedPages = computeAutoCanvasLayout(pages, {
      currentLayout: effectivePages,
    });
    const nextViewport =
      computeFitCanvasViewport(arrangedPages, {
        containerWidth: containerSize.width,
        containerHeight: containerSize.height,
      }) ?? canvasState.viewport;

    updateState((prev) => ({
      ...prev,
      pages: arrangedPages,
      viewport: nextViewport,
    }));
  }, [canvasState.viewport, containerSize, effectivePages, pages, updateState]);

  const createNodeId = useCallback((prefix: string) => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  const handleMergeSelectedPages = useCallback(() => {
    if (selectedPageIds.length < 2) return;
    const sortedPageIds = sortPageIdsByLayout(
      selectedPageIds,
      effectivePages,
    ).filter((pageId) => pagesById.has(pageId));
    const uniquePageIds = Array.from(new Set(sortedPageIds));
    if (uniquePageIds.length < 2) return;

    const firstPage = pagesById.get(uniquePageIds[0]);
    const firstLayout = effectivePages[uniquePageIds[0]];
    if (!firstPage || !firstLayout) return;
    const now = Date.now();
    const id = createNodeId("page-group");
    const maxZ = Math.max(
      0,
      ...Object.values(allItemLayouts).map((layout) => layout.zIndex ?? 0),
    );
    const title = `${firstPage.name} 等 ${uniquePageIds.length} 个页面`;
    const entries = uniquePageIds.map((pageId) => {
      const page = pagesById.get(pageId);
      return {
        id: pageId,
        pageId,
        title: page?.name ?? pageId,
      };
    });

    updateState((prev) => ({
      ...prev,
      pageGroups: {
        ...(prev.pageGroups ?? {}),
        [id]: {
          id,
          kind: "page-group",
          title,
          pages: entries,
          activePageId: uniquePageIds[0],
          layout: {
            ...firstLayout,
            zIndex: maxZ + 1,
          },
          createdAt: now,
          updatedAt: now,
        },
      },
      hiddenPageIds: Array.from(
        new Set([...(prev.hiddenPageIds ?? []), ...uniquePageIds]),
      ),
    }));

    setSelectedPageIds([]);
    setSelectedDocumentNodeIds([]);
    setSelectedNodeId(null);
    setEditingTextNodeId(null);
    setSelectedPageGroupIds([id]);
  }, [
    allItemLayouts,
    createNodeId,
    effectivePages,
    pagesById,
    selectedPageIds,
    updateState,
  ]);

  const getDocumentTitleFromMarkdown = useCallback(
    (markdown: string, fallback = "文档") => {
      const firstLine = markdown
        .split(/\r?\n/)
        .find((line) => line.trim().length > 0);
      const title = (firstLine ?? "")
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/^\[[ xX]\]\s+/, "")
        .replace(/^>\s+/, "")
        .replace(/[*_`~]/g, "")
        .trim();

      return title || fallback;
    },
    [],
  );

  const handleMergeSelectedDocuments = useCallback(() => {
    const selectedNodes = sortDocumentNodesByLayout(
      selectedDocumentNodes,
    ).filter((node) => getCanvasDocumentEntries(node).length > 0);
    if (selectedNodes.length < 2 || !selectedDocumentBounds) return;

    const entries = selectedNodes.flatMap((node) =>
      getCanvasDocumentEntries(node),
    );
    const uniqueEntries = Array.from(
      new Map(
        entries.map((entry) => [entry.knowledgeDocument.id, entry]),
      ).values(),
    );
    if (uniqueEntries.length < 2) return;

    const now = Date.now();
    const id = createNodeId("doc");
    const maxZ = Math.max(
      0,
      ...Object.values(allItemLayouts).map((layout) => layout.zIndex ?? 0),
    );
    const title = `${uniqueEntries[0].title} 等 ${uniqueEntries.length} 个文档`;
    const hiddenIds = uniqueEntries.map((entry) => entry.knowledgeDocument.id);

    updateState((prev) => {
      const nextNodes = { ...(prev.nodes ?? {}) };
      selectedNodes.forEach((node) => {
        delete nextNodes[node.id];
      });
      nextNodes[id] = {
        id,
        kind: "document",
        title,
        documents: uniqueEntries,
        activeDocumentId: uniqueEntries[0].id,
        layout: {
          x: selectedDocumentBounds.x,
          y: selectedDocumentBounds.y,
          width: Math.max(selectedDocumentBounds.width, 560),
          height: Math.max(selectedDocumentBounds.height, 420),
          zIndex: maxZ + 1,
        },
        createdAt: now,
        updatedAt: now,
      };

      return withCanvasAnnotationNodes(
        {
          ...prev,
          hiddenKnowledgeDocumentIds: Array.from(
            new Set([...(prev.hiddenKnowledgeDocumentIds ?? []), ...hiddenIds]),
          ),
        },
        nextNodes,
      );
    });

    setSelectedDocumentNodeIds([]);
    setSelectedPageIds([]);
    setSelectedPageGroupIds([]);
    setEditingTextNodeId(null);
    setSelectedNodeId(id);
  }, [
    allItemLayouts,
    createNodeId,
    selectedDocumentBounds,
    selectedDocumentNodes,
    updateState,
  ]);

  const handleSaveDocument = useCallback(async () => {
    if (!documentDraft) return;
    setDocumentSaving(true);
    const now = Date.now();
    const existing = documentDraft.nodeId
      ? effectiveNodes[documentDraft.nodeId]
      : undefined;
    const id = existing?.id ?? createNodeId("doc");
    const title = getDocumentTitleFromMarkdown(
      documentDraft.markdown,
      documentDraft.title ?? "文档",
    );

    try {
      const activeEntry =
        existing?.kind === "document"
          ? getActiveCanvasDocumentEntry(existing)
          : undefined;
      const existingDocument = documentDraft.knowledgeDocumentId
        ? (knowledgeDocumentsById.get(documentDraft.knowledgeDocumentId) ??
          (existing?.kind === "document"
            ? (activeEntry?.knowledgeDocument ?? existing.knowledgeDocument)
            : undefined))
        : existing?.kind === "document"
          ? (activeEntry?.knowledgeDocument ?? existing.knowledgeDocument)
          : undefined;
      const knowledgeDocument =
        existingDocument && onUpdateKnowledgeDocument
          ? await onUpdateKnowledgeDocument(existingDocument.id, {
              title,
              content: documentDraft.markdown,
            })
          : onCreateKnowledgeDocument
            ? await onCreateKnowledgeDocument({
                title,
                description: title,
                content: documentDraft.markdown,
              })
            : undefined;

      if (
        existing?.kind === "document" &&
        existing.documents &&
        existing.documents.length > 0
      ) {
        const documents = getCanvasDocumentEntries(existing).map((entry) =>
          knowledgeDocument &&
          entry.knowledgeDocument.id === knowledgeDocument.id
            ? {
                id: knowledgeDocument.id,
                title: knowledgeDocument.title,
                knowledgeDocument,
              }
            : entry,
        );
        addOrUpdateNode({
          ...existing,
          title:
            knowledgeDocument &&
            documents[0].knowledgeDocument.id === knowledgeDocument.id
              ? `${knowledgeDocument.title} 等 ${documents.length} 个文档`
              : existing.title,
          documents,
          activeDocumentId:
            knowledgeDocument?.id ??
            activeEntry?.id ??
            existing.activeDocumentId,
          ...(!knowledgeDocument ? { markdown: documentDraft.markdown } : {}),
          updatedAt: now,
        });
      } else {
        addOrUpdateNode({
          id,
          kind: "document",
          title: knowledgeDocument?.title ?? title,
          ...(knowledgeDocument
            ? { knowledgeDocument }
            : { markdown: documentDraft.markdown }),
          ...(existing?.kind === "document" && existing.collapsed !== undefined
            ? { collapsed: existing.collapsed }
            : {}),
          ...(existing?.kind === "document" &&
          existing.expandedHeight !== undefined
            ? { expandedHeight: existing.expandedHeight }
            : {}),
          layout:
            existing?.layout ??
            getNodeLayout(420, DOCUMENT_NODE_DEFAULT_HEIGHT),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
      }

      if (knowledgeDocument) {
        updateState((prev) => ({
          ...prev,
          hiddenKnowledgeDocumentIds: (
            prev.hiddenKnowledgeDocumentIds ?? []
          ).filter((documentId) => documentId !== knowledgeDocument.id),
        }));
        setKnowledgeDocumentMarkdown((prev) => ({
          ...prev,
          [knowledgeDocument.id]: documentDraft.markdown,
        }));
      }
      setDocumentDraft(null);
    } finally {
      setDocumentSaving(false);
    }
  }, [
    addOrUpdateNode,
    createNodeId,
    documentDraft,
    effectiveNodes,
    getDocumentTitleFromMarkdown,
    getNodeLayout,
    knowledgeDocumentsById,
    onCreateKnowledgeDocument,
    onUpdateKnowledgeDocument,
  ]);

  const addImageFile = useCallback(
    async (file: File, index: number = 0, canvasPoint?: CanvasPoint) => {
      if (!file.type.startsWith("image/")) return;
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("图片读取失败"));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });

      const size = await new Promise<{
        width: number;
        height: number;
        intrinsicWidth?: number;
        intrinsicHeight?: number;
      }>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxWidth = 560;
          const maxHeight = 420;
          const ratio = Math.min(
            maxWidth / img.naturalWidth,
            maxHeight / img.naturalHeight,
            1,
          );
          resolve({
            width: Math.max(180, Math.round(img.naturalWidth * ratio)),
            height: Math.max(120, Math.round(img.naturalHeight * ratio)),
            intrinsicWidth: img.naturalWidth,
            intrinsicHeight: img.naturalHeight,
          });
        };
        img.onerror = () => resolve({ width: 360, height: 240 });
        img.src = src;
      });

      const now = Date.now();
      const layout = getNodeLayout(size.width, size.height, canvasPoint);
      const id = createNodeId("img");
      addOrUpdateNode({
        id,
        kind: "image",
        title: file.name || "图片",
        fileName: file.name,
        src,
        ...(size.intrinsicWidth && size.intrinsicHeight
          ? {
              intrinsicWidth: size.intrinsicWidth,
              intrinsicHeight: size.intrinsicHeight,
            }
          : {}),
        layout: {
          ...layout,
          x: layout.x + index * 24,
          y: layout.y + index * 24,
        },
        createdAt: now,
        updatedAt: now,
      });
      setSelectedPageIds([]);
      setSelectedDocumentNodeIds([]);
      setSelectedPageGroupIds([]);
      setSelectedNodeId(id);
      setEditingTextNodeId(null);
      return id;
    },
    [addOrUpdateNode, createNodeId, getNodeLayout],
  );

  const addMarkdownFile = useCallback(
    async (file: File, index: number = 0, canvasPoint?: CanvasPoint) => {
      if (!isMarkdownFile(file)) return;
      const markdown = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("文档读取失败"));
        reader.onerror = () => reject(new Error("文档读取失败"));
        reader.readAsText(file);
      });

      const fallbackTitle = file.name
        ? getFileNameWithoutExtension(file.name)
        : "文档";
      const title = getDocumentTitleFromMarkdown(markdown, fallbackTitle);
      const knowledgeDocument = onCreateKnowledgeDocument
        ? await onCreateKnowledgeDocument({
            title,
            description: `画布导入文档: ${file.name}`,
            content: markdown,
          })
        : undefined;
      const now = Date.now();
      const layout = getNodeLayout(
        420,
        DOCUMENT_NODE_DEFAULT_HEIGHT,
        canvasPoint,
      );
      const id = createNodeId("doc");
      addOrUpdateNode({
        id,
        kind: "document",
        title: knowledgeDocument?.title ?? title,
        ...(knowledgeDocument ? { knowledgeDocument } : { markdown }),
        layout: {
          ...layout,
          x: layout.x + index * 24,
          y: layout.y + index * 24,
        },
        createdAt: now,
        updatedAt: now,
      });

      if (knowledgeDocument) {
        updateState((prev) => ({
          ...prev,
          hiddenKnowledgeDocumentIds: (
            prev.hiddenKnowledgeDocumentIds ?? []
          ).filter((documentId) => documentId !== knowledgeDocument.id),
        }));
        setKnowledgeDocumentMarkdown((prev) => ({
          ...prev,
          [knowledgeDocument.id]: markdown,
        }));
      }
    },
    [
      addOrUpdateNode,
      createNodeId,
      getDocumentTitleFromMarkdown,
      getNodeLayout,
      onCreateKnowledgeDocument,
    ],
  );

  const handleAddImportFiles = useCallback(
    (files: CanvasImportFile[], canvasPoint?: CanvasPoint) => {
      files.forEach(({ kind, file }, index) => {
        if (kind === "image") {
          void addImageFile(file, index, canvasPoint);
          return;
        }
        void addMarkdownFile(file, index, canvasPoint);
      });
    },
    [addImageFile, addMarkdownFile],
  );

  const handleAddImageFiles = useCallback((files: FileList) => {
    pendingImageFilesRef.current = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (pendingImageFilesRef.current.length > 0) {
      setSelectedPageIds([]);
      setSelectedDocumentNodeIds([]);
      setSelectedPageGroupIds([]);
      setSelectedNodeId(null);
      setEditingTextNodeId(null);
      setToolMode("image");
    }
  }, []);

  const handleEditNode = useCallback(
    (node: CanvasFreeNode) => {
      if (node.kind !== "document") return;
      const activeEntry = getActiveCanvasDocumentEntry(node);
      const activeDocument =
        activeEntry?.knowledgeDocument ?? node.knowledgeDocument;

      setDocumentDraft({
        nodeId: node.id,
        knowledgeDocumentId: activeDocument?.id,
        title: activeEntry?.title ?? activeDocument?.title ?? node.title,
        markdown: activeDocument
          ? (knowledgeDocumentMarkdown[activeDocument.id] ??
            node.markdown ??
            "")
          : (node.markdown ?? ""),
      });
    },
    [knowledgeDocumentMarkdown],
  );

  const classifyImportFile = useCallback(
    (file: File): CanvasImportFile | null => {
      if (file.type.startsWith("image/")) {
        return { kind: "image", file };
      }
      if (isMarkdownFile(file)) {
        return { kind: "document", file };
      }
      return null;
    },
    [],
  );

  const extractImportFiles = useCallback(
    (files: FileList | File[]) => {
      return Array.from(files)
        .map(classifyImportFile)
        .filter((file): file is CanvasImportFile => Boolean(file));
    },
    [classifyImportFile],
  );

  const extractImportFilesFromItems = useCallback(
    (items: DataTransferItemList | undefined) => {
      if (!items) return [];
      return Array.from(items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
    },
    [],
  );

  const extractImportFilesFromTransfer = useCallback(
    (files: FileList | File[], items: DataTransferItemList | undefined) => {
      const importFiles = extractImportFiles(files);
      if (importFiles.length > 0) {
        return importFiles;
      }

      return extractImportFilesFromItems(items)
        .map(classifyImportFile)
        .filter((file): file is CanvasImportFile => Boolean(file));
    },
    [classifyImportFile, extractImportFiles, extractImportFilesFromItems],
  );

  const hasPotentialImportItems = useCallback(
    (files: FileList | File[], items: DataTransferItemList | undefined) => {
      if (files.length > 0) return true;
      if (!items) return false;
      return Array.from(items).some((item) => item.kind === "file");
    },
    [],
  );

  const handleAddTextNode = useCallback(
    (canvasPoint?: CanvasPoint) => {
      if (!canvasPoint) {
        pendingImageFilesRef.current = [];
        setSelectedPageIds([]);
        setSelectedDocumentNodeIds([]);
        setSelectedPageGroupIds([]);
        setSelectedNodeId(null);
        setEditingTextNodeId(null);
        setToolMode("text");
        return;
      }
      const now = Date.now();
      const id = createNodeId("text");
      addOrUpdateNode({
        id,
        kind: "text",
        title: "文字",
        text: "",
        fontSize: 18,
        color: "#ffffff",
        autoWidth: true,
        layout: {
          x: canvasPoint.x,
          y: canvasPoint.y,
          width: 18,
          height: Math.ceil(18 * 1.35),
        },
        createdAt: now,
        updatedAt: now,
      });
      setSelectedPageIds([]);
      setSelectedDocumentNodeIds([]);
      setSelectedPageGroupIds([]);
      setSelectedNodeId(id);
      setEditingTextNodeId(id);
      setToolMode("select");
    },
    [addOrUpdateNode, createNodeId, getNodeLayout],
  );

  const handleCanvasPointCreate = useCallback(
    (point: CanvasPoint) => {
      if (effectiveToolMode === "text") {
        handleAddTextNode(point);
        return;
      }

      if (effectiveToolMode === "image") {
        const files = pendingImageFilesRef.current;
        pendingImageFilesRef.current = [];
        if (files.length === 0) {
          setToolMode("select");
          return;
        }
        files.forEach((file, index) => {
          void addImageFile(file, index, point);
        });
        setToolMode("select");
      }
    },
    [addImageFile, effectiveToolMode, handleAddTextNode],
  );

  const handleTextNodeChange = useCallback(
    (nodeId: string, text: string) => {
      const titleText = text.trim() || "文字";
      updateState((prev) => {
        const node = prev.nodes?.[nodeId];
        if (!node || node.kind !== "text") return prev;
        return withCanvasAnnotationNodes(prev, {
          ...(prev.nodes ?? {}),
          [nodeId]: {
            ...node,
            title: titleText.split(/\r?\n/)[0]?.slice(0, 24) || "文字",
            text,
            updatedAt: Date.now(),
          },
        });
      });
    },
    [updateState],
  );

  const handleNodeStyleChange = useCallback(
    (nextNode: CanvasFreeNode) => {
      updateState((prev) => {
        const existing = prev.nodes?.[nextNode.id];
        if (!existing || existing.kind !== nextNode.kind) return prev;
        return withCanvasAnnotationNodes(prev, {
          ...(prev.nodes ?? {}),
          [nextNode.id]: { ...nextNode, updatedAt: Date.now() },
        });
      });
    },
    [updateState],
  );

  const selectionToolbarStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!selectedPageBounds || selectedPageLikeCount < 1) return undefined;
    const zoom = canvasState.viewport.zoom || 1;
    return {
      left:
        canvasState.viewport.x +
        (selectedPageBounds.x + selectedPageBounds.width / 2) * zoom,
      top: Math.max(
        12,
        canvasState.viewport.y + selectedPageBounds.y * zoom - 48,
      ),
      transform: "translateX(-50%)",
    };
  }, [canvasState.viewport, selectedPageBounds, selectedPageLikeCount]);

  const documentSelectionToolbarStyle = useMemo<
    React.CSSProperties | undefined
  >(() => {
    if (
      selectedPageLikeCount > 0 ||
      !selectedDocumentBounds ||
      selectedDocumentNodeIds.length < 2
    ) {
      return undefined;
    }
    const zoom = canvasState.viewport.zoom || 1;
    return {
      left:
        canvasState.viewport.x +
        (selectedDocumentBounds.x + selectedDocumentBounds.width / 2) * zoom,
      top: Math.max(
        12,
        canvasState.viewport.y + selectedDocumentBounds.y * zoom - 48,
      ),
      transform: "translateX(-50%)",
    };
  }, [
    canvasState.viewport,
    selectedDocumentBounds,
    selectedDocumentNodeIds.length,
    selectedPageLikeCount,
  ]);

  const renderAlignmentButton = (
    action: MultiPageAlignAction,
    label: string,
    icon: React.ReactNode,
    disabled = false,
  ) => (
    <button
      key={action}
      type="button"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
      )}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => updateSelectedPageLayouts(action)}
    >
      {icon}
    </button>
  );

  const focusCanvasForClipboard = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isEditorMode) return;
      const target = event.target as HTMLElement;
      if (
        target.closest("button,input,textarea,select,a") ||
        target.isContentEditable
      ) {
        return;
      }
      containerRef.current?.focus({ preventScroll: true });
    },
    [isEditorMode],
  );

  return (
    <div
      ref={containerRef}
      tabIndex={isEditorMode ? 0 : undefined}
      aria-label="画布工作区"
      className={cn(
        "w-full h-full relative overflow-hidden bg-muted/30 outline-none",
        className,
      )}
      onPointerDownCapture={focusCanvasForClipboard}
      onDragOver={(event) => {
        if (!isEditorMode) return;
        if (documentDraft) return;
        const files = extractImportFilesFromTransfer(
          event.dataTransfer.files,
          event.dataTransfer.items,
        );
        if (
          files.length === 0 &&
          !hasPotentialImportItems(
            event.dataTransfer.files,
            event.dataTransfer.items,
          )
        ) {
          return;
        }
        event.preventDefault();
        setDraggingFileOver(true);
      }}
      onDragLeave={(event) => {
        if (!isEditorMode) return;
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        setDraggingFileOver(false);
      }}
      onDrop={(event) => {
        if (!isEditorMode) return;
        if (documentDraft) return;
        const files = extractImportFilesFromTransfer(
          event.dataTransfer.files,
          event.dataTransfer.items,
        );
        if (files.length === 0) return;
        event.preventDefault();
        setDraggingFileOver(false);
        handleAddImportFiles(
          files,
          getCanvasPointFromClient(event.clientX, event.clientY),
        );
      }}
      onPaste={(event) => {
        if (!isEditorMode) return;
        const target = event.target as HTMLElement;
        if (target.closest("input,textarea") || target.isContentEditable) {
          return;
        }
        if (documentDraft) return;
        const files = extractImportFilesFromTransfer(
          event.clipboardData.files,
          event.clipboardData.items,
        );
        if (files.length === 0) return;
        event.preventDefault();
        handleAddImportFiles(files);
      }}
    >
      {canInteractWithViewport && (
        <CanvasToolbar
          zoom={canvasState.viewport.zoom}
          onZoomChange={(zoom) =>
            updateState((prev) => ({
              ...prev,
              viewport: { ...prev.viewport, zoom },
            }))
          }
          interactionMode={isEditorMode ? "editor" : "viewer"}
          onFitToScreen={handleFitToScreen}
          onAutoLayout={isEditorMode ? handleAutoLayout : undefined}
          onAddDocument={
            isEditorMode
              ? () =>
                  setDocumentDraft({
                    markdown: "# 文档\n\n在这里记录说明、参考或上下文。",
                  })
              : undefined
          }
          onAddText={isEditorMode ? handleAddTextNode : undefined}
          onAddImageFiles={isEditorMode ? handleAddImageFiles : undefined}
          toolMode={effectiveToolMode}
          onToolModeChange={setToolMode}
        />
      )}

      {draggingFileOver && (
        <div className="pointer-events-none absolute inset-3 z-30 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5" />
      )}

      {isEditorMode && selectionToolbarStyle && (
        <div
          role="toolbar"
          aria-label={
            selectedPageLikeCount > 1 ? "多选对齐工具栏" : "单选页面工具栏"
          }
          className="absolute z-30 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-lg backdrop-blur"
          style={selectionToolbarStyle}
        >
          {selectedPageLikeCount === 1 && (
            <span className="px-2 text-xs font-medium text-muted-foreground">
              已选中 1 个页面
            </span>
          )}
          {selectedPageLikeCount >= 2 && (
            <>
              {renderAlignmentButton(
                "left",
                "左对齐",
                <AlignStartVertical className="h-4 w-4" />,
              )}
              {renderAlignmentButton(
                "center-x",
                "水平居中对齐",
                <AlignCenterVertical className="h-4 w-4" />,
              )}
              {renderAlignmentButton(
                "right",
                "右对齐",
                <AlignEndVertical className="h-4 w-4" />,
              )}
              <div className="mx-1 h-5 w-px bg-border" />
              {renderAlignmentButton(
                "top",
                "顶部对齐",
                <AlignStartHorizontal className="h-4 w-4" />,
              )}
              {renderAlignmentButton(
                "center-y",
                "垂直居中对齐",
                <AlignCenterHorizontal className="h-4 w-4" />,
              )}
              {renderAlignmentButton(
                "bottom",
                "底部对齐",
                <AlignEndHorizontal className="h-4 w-4" />,
              )}
              <div className="mx-1 h-5 w-px bg-border" />
              {renderAlignmentButton(
                "distribute-x",
                "水平均分",
                <BetweenVerticalStart className="h-4 w-4" />,
                selectedPageLikeCount < 3,
              )}
              {renderAlignmentButton(
                "distribute-y",
                "垂直均分",
                <BetweenHorizontalStart className="h-4 w-4" />,
                selectedPageLikeCount < 3,
              )}
            </>
          )}
          {selectedPageIds.length >= 2 && selectedPageGroupIds.length === 0 && (
            <>
              <div className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={handleMergeSelectedPages}
              >
                <Combine className="h-4 w-4" />
                合并页面
              </button>
            </>
          )}
          {onRequestDeletePages && selectedPageIds.length > 0 && (
            <>
              <div className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="删除页面"
                onClick={() => void onRequestDeletePages(selectedPageIds)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}

      {isEditorMode && documentSelectionToolbarStyle && (
        <div
          role="toolbar"
          aria-label="文档多选工具栏"
          className="absolute z-30 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-lg backdrop-blur"
          style={documentSelectionToolbarStyle}
        >
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={handleMergeSelectedDocuments}
          >
            <Combine className="h-4 w-4" />
            合并文档
          </button>
        </div>
      )}

      <CanvasViewport
        viewport={canvasState.viewport}
        onViewportChange={(viewport) =>
          updateState((prev) => ({ ...prev, viewport }))
        }
        editable={isEditorMode}
        interactionMode={resolvedInteractionMode}
        onCanvasClick={handleCanvasClick}
        onPageClick={handlePageSelect}
        onNodeClick={
          isEditorMode ? (nodeId) => handleNodeSelect(nodeId) : undefined
        }
        onFitToScreen={handleFitToScreen}
        onToolModeChange={isEditorMode ? setToolMode : undefined}
        alignmentGuides={alignmentGuides}
        toolMode={effectiveToolMode}
        onSelectionRectChange={handleSelectionRectChange}
        creationMode={
          isEditorMode &&
          (effectiveToolMode === "text" || effectiveToolMode === "image")
            ? effectiveToolMode
            : null
        }
        onCanvasPointClick={handleCanvasPointCreate}
      >
        {pages
          .filter((page) => !hiddenPageIdSet.has(page.id))
          .map((page) => {
            const renderMode = pageRenderModes[page.id] ?? "loading";
            return (
              <CanvasPageItem
                key={page.id}
                page={page}
                layout={
                  standalonePageLayouts[page.id] ||
                  (() => {
                    const size = resolveCanvasPageSize(page.previewSize);
                    return {
                      x: 0,
                      y: 0,
                      width: size.width,
                      height: size.height,
                    };
                  })()
                }
                editable={isEditorMode}
                isEditing={editingPageId === page.id}
                zoom={canvasState.viewport.zoom}
                visible={
                  renderMode === "iframe" ||
                  visiblePageIds.has(page.id) ||
                  renderMode === "sleeping-iframe"
                }
                sessionId={sessionId}
                screenshotUrl={
                  shouldUseScreenshotLayer
                    ? screenshotUrls?.[page.id]
                    : undefined
                }
                screenshotRenderBox={
                  shouldUseScreenshotLayer
                    ? screenshotRenderBoxes?.[page.id]
                    : undefined
                }
                renderMode={renderMode}
                onLayoutChange={handleLayoutChange}
                onConfigEdit={handlePageSelect}
                onRequestDelete={
                  onRequestDeletePages
                    ? (pageId) => void onRequestDeletePages([pageId])
                    : undefined
                }
                onRuntimeConversionRequest={onRuntimeConversionRequest}
                onConsoleEntry={onConsoleEntry}
                onError={onError}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                toolMode={effectiveToolMode}
                selected={selectedPageIds.includes(page.id)}
                onPositionableSizes={onPositionableSizes}
              />
            );
          })}
        {Object.values(effectivePageGroups).map((group) => (
          <CanvasPageGroupItem
            key={group.id}
            group={group}
            pagesById={pagesById}
            editable={isEditorMode}
            selected={selectedPageGroupIds.includes(group.id)}
            zoom={canvasState.viewport.zoom}
            sessionId={sessionId}
            pageRenderModes={pageRenderModes}
            screenshotUrls={
              shouldUseScreenshotLayer ? screenshotUrls : undefined
            }
            screenshotRenderBoxes={
              shouldUseScreenshotLayer ? screenshotRenderBoxes : undefined
            }
            onSelect={handlePageGroupSelect}
            onLayoutChange={handlePageGroupLayoutChange}
            onActivePageChange={handlePageGroupActivePageChange}
            onDirectoryCollapsedChange={handlePageGroupDirectoryCollapsedChange}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onConsoleEntry={onConsoleEntry}
            onError={onError}
            onPositionableSizes={onPositionableSizes}
          />
        ))}
        {Object.values(effectiveNodes).map((node) => {
          const renderedNode = (() => {
            if (node.kind !== "document") return node;
            const documents = getCanvasDocumentEntries(node).map((entry) => {
              const knowledgeDocument =
                knowledgeDocumentsById.get(entry.knowledgeDocument.id) ??
                entry.knowledgeDocument;
              return {
                ...entry,
                title: knowledgeDocument.title,
                knowledgeDocument,
              };
            });
            const activeEntry =
              documents.find((entry) => entry.id === node.activeDocumentId) ??
              documents[0];
            if (documents.length > 1) {
              return {
                ...node,
                documents,
                activeDocumentId: activeEntry?.id ?? node.activeDocumentId,
                markdown: activeEntry
                  ? (knowledgeDocumentMarkdown[
                      activeEntry.knowledgeDocument.id
                    ] ?? node.markdown)
                  : node.markdown,
              };
            }
            if (activeEntry) {
              return {
                ...node,
                title: activeEntry.knowledgeDocument.title,
                knowledgeDocument: activeEntry.knowledgeDocument,
                markdown:
                  knowledgeDocumentMarkdown[activeEntry.knowledgeDocument.id] ??
                  node.markdown,
              };
            }
            return node;
          })();

          return (
            <CanvasFreeNodeItem
              key={node.id}
              node={renderedNode}
              editable={isEditorMode}
              zoom={canvasState.viewport.zoom}
              toolMode={effectiveToolMode}
              selected={
                selectedNodeId === node.id ||
                selectedDocumentNodeIds.includes(node.id)
              }
              editing={editingTextNodeId === node.id}
              onLayoutChange={handleNodeLayoutChange}
              onEdit={handleEditNode}
              onTextChange={handleTextNodeChange}
              onNodeStyleChange={handleNodeStyleChange}
              onTextEditStart={(nodeId) => {
                setSelectedPageIds([]);
                setSelectedDocumentNodeIds([]);
                setSelectedPageGroupIds([]);
                setSelectedNodeId(nodeId);
                setEditingTextNodeId(nodeId);
              }}
              onToggleCollapse={handleNodeToggleCollapse}
              onActiveDocumentChange={handleActiveDocumentChange}
              onSelect={handleNodeSelect}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            />
          );
        })}
      </CanvasViewport>

      {documentDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[78vh] w-full max-w-5xl flex-col rounded-lg border bg-background shadow-xl">
            <div className="border-b px-4 py-3">
              <div className="text-sm font-semibold">编辑文档</div>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <DocumentEditor
                value={documentDraft.markdown}
                onChange={(markdown) =>
                  setDocumentDraft((prev) =>
                    prev ? { ...prev, markdown } : prev,
                  )
                }
                format="markdown"
                placeholder="文档标题"
              />
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <button
                type="button"
                className="h-9 rounded-md border px-3 text-sm hover:bg-muted"
                onClick={() => setDocumentDraft(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleSaveDocument}
                disabled={documentSaving}
              >
                {documentSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
