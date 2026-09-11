"use client";

import React, {
  lazy,
  Suspense,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Combine,
  Copy,
  ExternalLink,
  Maximize2,
  MessageSquarePlus,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  LayoutGrid,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem, CanvasPagePreviewContent } from "./CanvasPageItem";
import { PasteOptionsModal } from "./PasteOptionsModal";
import type { CanvasClipboardData } from "./canvas-clipboard";
import { CanvasFreeNodeItem } from "./CanvasFreeNodeItem";
import { CanvasSectionItem } from "./CanvasSectionItem";
import { CanvasSelectionBox } from "./CanvasSelectionBox";
import { CanvasToolbar } from "./CanvasToolbar";
import { useCanvasDocumentMarkdown } from "./useCanvasDocumentMarkdown";
import {
  DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES,
  DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES,
  MIN_CANVAS_SCREENSHOT_PAGE_COUNT,
} from "./canvas-render-scheduler";
import { computePreviewRuntimePoolPlan } from "./preview-runtime-pool";
import {
  computeFitCanvasViewport,
  computeInitialCanvasLayout,
  getCanvasPreviewSizeKey,
  normalizeCanvasPageLayouts,
  resolveCanvasPageSize,
} from "./canvas-layout";
import {
  getPreviewPageResourceDescriptor,
  prewarmPreviewImageUrls,
} from "./preview-resource-cache";
import { cn } from "./utils";
import { ColorPicker, formatHex, formatRgba, parseColor } from "@workbench/color-picker";
import { extractHtmlImportFromClipboard } from "./html-import-clipboard";
import { localizeRemoteImageForSession } from "./markdown/remote-image-localizer";
import {
  buildNavigationConnectorRoute,
  toRoundedNavigationPath,
  type NavigationRouteRect,
} from "./canvas-navigation-routing";
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
  assignCanvasObjectToSection,
  assignCanvasSectionToSection,
  computeCanvasSectionAutoLayout,
  createCanvasSection,
  findInnermostSectionContainingLayout,
  fitCanvasSectionToChildren,
  moveCanvasSectionWithChildren,
  reconcileCanvasSectionMembership,
  removeCanvasSection,
} from "./canvas-section";
import { createCanvasId } from "./canvas-id";

const DocumentEditor = lazy(() =>
  import("./DocumentEditor").then((module) => ({
    default: module.DocumentEditor,
  })),
);
import {
  writeCanvasClipboard,
  readCanvasClipboard,
  computeBounds,
  isEditableTarget,
  remapCanvasSectionsForPaste,
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
  CanvasNavigationHotspot,
  CanvasNavigationConnection,
  CanvasFreeNode,
  CanvasTextNode,
  CanvasDocumentNode,
  CanvasPageData,
  CanvasTransferPageIdentity,
  CanvasPageGroup,
  CanvasPageRenderMode,
  CanvasSection,
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

type MultiPageArrangeAction = "horizontal" | "vertical";

function remapNavigation(
  navigation: NonNullable<CanvasState["navigation"]> | undefined,
  pageIdMapping: Map<string, string>,
): NonNullable<CanvasState["navigation"]> | undefined {
  if (!navigation) return undefined;
  const timestamp = Date.now();
  const hotspots: NonNullable<CanvasState["navigation"]>["hotspots"] = {};
  const hotspotIds = new Map<string, string>();
  for (const hotspot of Object.values(navigation.hotspots)) {
    const pageId = pageIdMapping.get(hotspot.pageId);
    if (!pageId) continue;
    const id = createCanvasId("navigation_hotspot", "_");
    hotspotIds.set(hotspot.id, id);
    hotspots[id] = {
      ...hotspot,
      id,
      pageId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
  const connections: NonNullable<CanvasState["navigation"]>["connections"] = {};
  for (const connection of Object.values(navigation.connections)) {
    const sourcePageId = pageIdMapping.get(connection.source.pageId);
    const targetPageId = pageIdMapping.get(connection.target.pageId);
    const hotspotId = hotspotIds.get(connection.source.hotspotId);
    if (!sourcePageId || !targetPageId || !hotspotId) continue;
    const id = createCanvasId("navigation_connection", "_");
    connections[id] = {
      ...connection,
      id,
      source: { pageId: sourcePageId, hotspotId },
      target: { pageId: targetPageId },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
  return { hotspots, connections };
}

/** A navigation source belongs to exactly one connector, so delete them together. */
export function removeNavigationConnectionFromState(
  state: CanvasState,
  connectionId: string,
): CanvasState {
  const connection = state.navigation?.connections[connectionId];
  if (!connection || !state.navigation) return state;
  const { [connectionId]: _removedConnection, ...connections } =
    state.navigation.connections;
  const { [connection.source.hotspotId]: _removedHotspot, ...hotspots } =
    state.navigation.hotspots;
  return { ...state, navigation: { hotspots, connections } };
}

export function NavigationConnectionsLayer({
  connections,
  hotspots,
  layouts,
  obstacles,
  hoveredPageId,
  selectedConnectionId,
  interactive,
  onConnectionSelect,
  draft,
}: {
  connections: CanvasNavigationConnection[];
  hotspots: CanvasNavigationHotspot[];
  layouts: Record<string, CanvasPageLayout>;
  obstacles: NavigationRouteRect[];
  hoveredPageId: string | null;
  selectedConnectionId: string | null;
  interactive: boolean;
  onConnectionSelect: (connectionId: string) => void;
  draft: {
    sourcePageId: string;
    rect: CanvasNavigationHotspot["rect"];
    pointer: { x: number; y: number } | null;
  } | null;
}) {
  const hotspotsById = new Map(
    hotspots.map((hotspot) => [hotspot.id, hotspot]),
  );
  const lines = connections.flatMap((connection) => {
    const hotspot = hotspotsById.get(connection.source.hotspotId);
    const source = hotspot ? layouts[connection.source.pageId] : undefined;
    const target = layouts[connection.target.pageId];
    if (!hotspot || !source || !target) return [];
    const sourceCenter = {
      x: source.x + (hotspot.rect.x + hotspot.rect.width / 2) * source.width,
      y: source.y + (hotspot.rect.y + hotspot.rect.height / 2) * source.height,
    };
    const active =
      hoveredPageId === connection.source.pageId ||
      hoveredPageId === connection.target.pageId;
    const routeObstacles = obstacles.filter(
      (rect) =>
        !(
          rect.x === source.x - 16 &&
          rect.y === source.y - 16 &&
          rect.width === source.width + 32 &&
          rect.height === source.height + 32
        ) &&
        !(
          rect.x === target.x - 16 &&
          rect.y === target.y - 16 &&
          rect.width === target.width + 32 &&
          rect.height === target.height + 32
        ),
    );
    const route = buildNavigationConnectorRoute({
      sourceRect: source,
      targetRect: target,
      sourceAnchor: sourceCenter,
      obstacles: routeObstacles,
    });
    return [{ connection, route, active }];
  });
  const draftRoute = (() => {
    if (!draft?.pointer) return null;
    const source = layouts[draft.sourcePageId];
    if (!source) return null;
    const sourceAnchor = {
      x: source.x + (draft.rect.x + draft.rect.width / 2) * source.width,
      y: source.y + (draft.rect.y + draft.rect.height / 2) * source.height,
    };
    return buildNavigationConnectorRoute({
      sourceRect: source,
      targetRect: {
        x: draft.pointer.x - 0.5,
        y: draft.pointer.y - 0.5,
        width: 1,
        height: 1,
      },
      sourceAnchor,
      obstacles: obstacles.filter(
        (rect) =>
          !(
            rect.x === source.x - 16 &&
            rect.y === source.y - 16 &&
            rect.width === source.width + 32 &&
            rect.height === source.height + 32
          ),
      ),
    });
  })();
  if (lines.length === 0 && !draftRoute) return null;
  return (
    <svg
      className="absolute overflow-visible"
      style={{ zIndex: 1, width: 1, height: 1, pointerEvents: "none" }}
      aria-label="页面跳转关系"
    >
      <defs>
        <marker
          id="canvas-navigation-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" className="fill-primary" />
        </marker>
      </defs>
      {lines.map(({ connection, route, active }) => {
        const path = toRoundedNavigationPath(route);
        const selected = connection.id === selectedConnectionId;
        return (
          <path
            key={connection.id}
            d={path}
            fill="none"
            markerEnd="url(#canvas-navigation-arrow)"
            className={active || selected ? "stroke-primary" : "stroke-primary/40"}
            strokeWidth={active || selected ? 3 : 2}
            pointerEvents={interactive ? "stroke" : "none"}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? "选择页面跳转连线" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onPointerDown={(event) => {
              if (!interactive) return;
              event.preventDefault();
              event.stopPropagation();
              onConnectionSelect(connection.id);
            }}
          />
        );
      })}
      {draftRoute && (
        <path
          d={toRoundedNavigationPath(draftRoute)}
          fill="none"
          markerEnd="url(#canvas-navigation-arrow)"
          className="stroke-primary/70"
          strokeWidth={2}
          strokeDasharray="6 4"
          pointerEvents="none"
          aria-label="待完成页面跳转连线"
        />
      )}
    </svg>
  );
}

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
  onLayoutChange?: (groupId: string, layout: CanvasPageLayout) => void;
  onActivePageChange: (groupId: string, pageId: string) => void;
  onDirectoryCollapsedChange: (groupId: string, collapsed: boolean) => void;
  commentCounts?: Record<string, number>;
  onCommentBadgeClick?: (
    pageId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
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
  commentCounts,
  onCommentBadgeClick,
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
      onLayoutChange?.(group.id, nextLayout);
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
    resizeEdge || hoveredEdge ? "nwse-resize" : editable ? "default" : undefined;

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
        className="absolute left-0 flex max-w-full items-center gap-1 font-medium text-muted-foreground"
        title={group.title}
        style={{
          top: -labelTopOffset,
          fontSize: labelFontSize,
          lineHeight: 1.2,
        }}
      >
        <span className="max-w-full truncate" title={group.title}>
          {group.title}
        </span>
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
              const commentCount = commentCounts?.[entry.pageId] ?? 0;
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex w-full items-center gap-1 px-3 py-2 text-xs transition-colors hover:bg-background/80",
                    active
                      ? "bg-background font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    title={entry.title}
                    onClick={(event) => {
                      event.stopPropagation();
                      onActivePageChange(group.id, entry.pageId);
                      onSelect(group.id, entry.pageId, event);
                    }}
                  >
                    {entry.title}
                  </button>
                  {commentCount > 0 && (
                    <button
                      type="button"
                      className="shrink-0 cursor-pointer rounded-full border border-blue-500 bg-blue-600 px-2 py-0.5 text-[11px] font-semibold leading-4 text-white shadow-sm transition-colors duration-200 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                      title={`打开${entry.title}的评论列表`}
                      aria-label={`${entry.title}有 ${commentCount} 条未处理评论，打开评论列表`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onActivePageChange(group.id, entry.pageId);
                        onCommentBadgeClick?.(entry.pageId, event);
                      }}
                    >
                      评论 {commentCount}
                    </button>
                  )}
                </div>
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
            onLayoutChange={
              editable && onLayoutChange
                ? (_pageId, nextLayout) => {
                    onLayoutChange(group.id, {
                      ...group.layout,
                      width: nextLayout.width,
                      height: nextLayout.height,
                    });
                  }
                : undefined
            }
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
  onAddPagesToChat,
  onPageConfigEdit,
  onPageRename,
  onPageComment,
  onPageCommentBadgeClick,
  commentCounts,
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
  onRequestCreateReferences,
  onViewSource,
  onRequestPasteHtmlContent,
}: PreviewCanvasProps) {
  const resolvedInteractionMode =
    interactionMode ?? (editable ? "editor" : "readonly");
  const isEditorMode = resolvedInteractionMode === "editor";
  const canInteractWithViewport = resolvedInteractionMode !== "readonly";
  const localizeRemoteImage = useMemo(
    () =>
      isEditorMode && sessionId
        ? (url: string) => localizeRemoteImageForSession(sessionId, url)
        : undefined,
    [isEditorMode, sessionId],
  );
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
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(
    null,
  );
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
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [titleEditingSectionId, setTitleEditingSectionId] = useState<
    string | null
  >(null);
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(
    null,
  );
  const [pendingTextDraft, setPendingTextDraft] = useState<CanvasTextNode | null>(
    null,
  );
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [hoveredNavigationPageId, setHoveredNavigationPageId] = useState<
    string | null
  >(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    sourcePageId: string;
    kind: CanvasNavigationHotspot["kind"];
    rect: CanvasNavigationHotspot["rect"];
    pointer: { x: number; y: number } | null;
  } | null>(null);
  const [selectedNavigationConnectionId, setSelectedNavigationConnectionId] =
    useState<string | null>(null);
  const pendingImageFilesRef = useRef<File[]>([]);

  // 跨项目粘贴选择器状态
  const [pendingPasteModal, setPendingPasteModal] = useState<{
    pages: CanvasTransferPageIdentity[];
    pageLayouts: Record<string, CanvasPageLayout>;
    pageGroups: CanvasPageGroup[];
    sections: CanvasSection[];
    nodeIdMapping: Map<string, string>;
    offset: { x: number; y: number };
    sourceProjectId: string;
  } | null>(null);

  // 工具模式状态
  const [toolMode, setToolMode] = useState<CanvasToolMode>("select");
  const effectiveToolMode: CanvasToolMode = resolveCanvasToolMode(
    toolMode,
    isEditorMode,
  );

  const handleToolModeChange = useCallback((mode: CanvasToolMode) => {
    setToolMode(mode);
    if (mode !== "select") {
      setEditingTextNodeId(null);
      setPendingTextDraft(null);
    }
  }, []);

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
  const copyDragRef = useRef<{
    kind: "page" | "node";
    sourceId: string;
    startLayout: CanvasPageLayout;
  } | null>(null);

  // 项目切换后浏览器通常会把焦点留在 body，导致原生 paste 事件不会到达
  // 画布根节点。编辑态进入画布时主动聚焦，输入控件和后续交互仍可自行接管焦点。
  useEffect(() => {
    if (!isEditorMode || documentDraft) return;
    containerRef.current?.focus({ preventScroll: true });
  }, [documentDraft, isEditorMode, projectId]);

  const canvasState = useMemo(
    () => normalizeCanvasStateLayers(externalState || internalState),
    [externalState, internalState],
  );
  const isControlledState = externalState !== undefined;
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;
  const effectiveSections = canvasState.sections ?? {};

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
  const navigation = canvasState.navigation;
  const navigationHotspots = useMemo(
    () =>
      Object.values(navigation?.hotspots ?? {}).filter((hotspot) =>
        pageIds.has(hotspot.pageId),
      ),
    [navigation?.hotspots, pageIds],
  );
  const navigationConnections = useMemo(
    () =>
      Object.values(navigation?.connections ?? {}).filter(
        (connection) =>
          pageIds.has(connection.source.pageId) &&
          pageIds.has(connection.target.pageId) &&
          navigation?.hotspots?.[connection.source.hotspotId]?.pageId ===
            connection.source.pageId,
      ),
    [navigation?.connections, navigation?.hotspots, pageIds],
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

  useEffect(() => {
    if (!isEditorMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || editingTextNodeId) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLElement &&
        target.closest("textarea,input,select,button,[contenteditable='true']")
      ) {
        return;
      }
      const node = selectedNodeId ? effectiveNodes[selectedNodeId] : undefined;
      if (node?.kind !== "text") return;
      event.preventDefault();
      setEditingTextNodeId(node.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingTextNodeId, effectiveNodes, isEditorMode, selectedNodeId]);

  const navigationObstacles = useMemo<NavigationRouteRect[]>(
    () => {
      const layouts = [
        ...Object.values(renderablePageLayouts),
        ...Object.values(effectivePageGroups).map((group) => group.layout),
        ...Object.values(effectiveNodes).map((node) => node.layout),
      ];
      const unique = new Map<string, NavigationRouteRect>();
      for (const layout of layouts) {
        const rect = {
          x: layout.x - 16,
          y: layout.y - 16,
          width: layout.width + 32,
          height: layout.height + 32,
        };
        unique.set(`${rect.x}:${rect.y}:${rect.width}:${rect.height}`, rect);
      }
      return [...unique.values()];
    },
    [effectiveNodes, effectivePageGroups, renderablePageLayouts],
  );
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
  const selectedPage =
    selectedPageLikeCount === 1 && selectedPageIds.length === 1
      ? pagesById.get(selectedPageIds[0])
      : undefined;
  const selectedReferencePageId =
    selectedPage?.isReference &&
    selectedPage.sourceProjectId &&
    selectedPage.sourcePageId
      ? selectedPage.id
      : null;
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
    const sectionLayouts = Object.fromEntries(
      Object.entries(effectiveSections).map(([id, section]) => [
        id,
        section.layout,
      ]),
    );
    return {
      ...standalonePageLayouts,
      ...pageGroupLayouts,
      ...nodeLayouts,
      ...sectionLayouts,
    };
  }, [
    effectiveNodes,
    effectivePageGroups,
    effectiveSections,
    standalonePageLayouts,
  ]);

  const visibleItemLayouts = useMemo(
    () => ({
      ...standalonePageLayouts,
      ...Object.fromEntries(
        Object.entries(effectivePageGroups).map(([id, group]) => [
          id,
          group.layout,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(effectiveNodes)
          .map(([id, node]) => [id, node.layout]),
      ),
      ...Object.fromEntries(
        Object.entries(effectiveSections)
          .map(([id, section]) => [id, section.layout]),
      ),
    }),
    [
      effectiveNodes,
      effectivePageGroups,
      effectiveSections,
      standalonePageLayouts,
    ],
  );

  const allItemLayoutSignature = useMemo(
    () => getCanvasLayoutSignature(visibleItemLayouts),
    [visibleItemLayouts],
  );

  const updateState = useCallback(
    (
      updater: (prev: CanvasState) => CanvasState,
      options: { normalize?: boolean } = {},
    ) => {
      const previousState = canvasStateRef.current;
      const newState = updater(previousState);
      if (newState === previousState) {
        return;
      }
      // A Section move translates its complete subtree, so its membership is
      // unchanged until the drag settles. Avoid rebuilding the entire canvas
      // graph on each pointer event; handleDragEnd performs the one required
      // reconciliation when the gesture completes.
      const nextState = options.normalize === false
        ? newState
        : normalizeCanvasStateLayers(newState);
      canvasStateRef.current = nextState;
      if (isControlledState) {
        onCanvasStateChange(nextState);
      } else {
        setInternalState(nextState);
      }
    },
    [isControlledState, onCanvasStateChange],
  );

  const handleCanvasClick = useCallback(() => {
    if (pendingNavigation) {
      setPendingNavigation(null);
      return;
    }
    setSelectedNavigationConnectionId(null);
    setSelectedNodeId(null);
    setSelectedDocumentNodeIds([]);
    setSelectedPageGroupIds([]);
    setSelectedSectionId(null);
    setEditingTextNodeId(null);
    setPendingTextDraft(null);
    setSelectedPageIds([]);
    onCanvasClick?.();
  }, [onCanvasClick, pendingNavigation]);

  const handleCreateSection = useCallback(
    (rect: CanvasRect) => {
      if (rect.width < 80 || rect.height < 60) return;
      const id = createCanvasId("section", "_");
      const maxZ = Math.max(
        0,
        ...Object.values(allItemLayouts).map((layout) => layout.zIndex ?? 0),
      );
      const section = createCanvasSection({
        id,
        layout: { ...rect, zIndex: maxZ + 1 },
      });
      const candidatePageEntries = Object.entries(effectivePages).filter(
        ([, layout]) =>
          layout.x >= rect.x &&
          layout.y >= rect.y &&
          layout.x + layout.width <= rect.x + rect.width &&
          layout.y + layout.height <= rect.y + rect.height,
      );
      const children = [
        ...candidatePageEntries.map(([pageId]) => ({
          kind: "page" as const,
          id: pageId,
        })),
        ...Object.entries(effectiveNodes)
          .filter(
            ([, node]) =>
              node.layout.x >= rect.x &&
              node.layout.y >= rect.y &&
              node.layout.x + node.layout.width <= rect.x + rect.width &&
              node.layout.y + node.layout.height <= rect.y + rect.height,
          )
          .map(([nodeId]) => ({ kind: "node" as const, id: nodeId })),
      ];
      updateState((prev) => {
        // A newly created page can have an effective fallback layout before it
        // has ever been moved. Persist candidate layouts before automatic
        // membership so normalization sees every fully-contained item.
        let next: CanvasState = {
          ...prev,
          pages: {
            ...prev.pages,
            ...Object.fromEntries(candidatePageEntries),
          },
          sections: { ...(prev.sections ?? {}), [id]: section },
        };
        for (const child of children) {
          const layout = child.kind === "page"
            ? next.pages[child.id]
            : next.nodes?.[child.id]?.layout;
          if (layout) next = assignCanvasObjectToSection(next, child, layout);
        }
        return next;
      });
      setSelectedNodeId(null);
      setSelectedDocumentNodeIds([]);
      setSelectedPageGroupIds([]);
      setSelectedPageIds([]);
      setSelectedSectionId(id);
      setTitleEditingSectionId(id);
      setToolMode("select");
    },
    [allItemLayouts, effectiveNodes, effectivePages, updateState],
  );

  const handleRenameSection = useCallback(
    (sectionId: string, title: string) => {
      updateState((prev) => {
        const section = prev.sections?.[sectionId];
        if (!section) return prev;
        return {
          ...prev,
          sections: {
            ...prev.sections,
            [sectionId]: { ...section, title, updatedAt: Date.now() },
          },
        };
      });
    },
    [updateState],
  );

  const handleSectionLayoutChange = useCallback(
    (
      sectionId: string,
      layout: CanvasPageLayout,
      operation: "move" | "resize",
    ) => {
      updateState((prev) => {
        const section = prev.sections?.[sectionId];
        if (!section) return prev;
        if (operation === "move") {
          return moveCanvasSectionWithChildren(prev, sectionId, layout);
        }
        return {
          ...prev,
          sections: {
            ...prev.sections,
            [sectionId]: { ...section, layout, updatedAt: Date.now() },
          },
        };
      }, { normalize: operation !== "move" });
    },
    [updateState],
  );

  const handleSectionStyleChange = useCallback(
    (sectionId: string, style: CanvasSection["style"]) => {
      updateState((prev) => {
        const section = prev.sections?.[sectionId];
        if (!section) return prev;
        return {
          ...prev,
          sections: {
            ...prev.sections,
            [sectionId]: { ...section, style, updatedAt: Date.now() },
          },
        };
      });
    },
    [updateState],
  );

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
      updateState((prev) =>
        reconcileCanvasSectionMembership({
          ...prev,
          pages: { ...prev.pages, [pageId]: layout },
        }),
      );
    },
    [updateState],
  );

  const handleCreateNavigation = useCallback(
    (
      pageId: string,
      rect: CanvasNavigationHotspot["rect"],
      targetPageId: string,
      kind: CanvasNavigationHotspot["kind"],
    ) => {
      const timestamp = Date.now();
      const hotspotId = `navigation_hotspot_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
      const connectionId = `navigation_connection_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
      updateState((prev) => ({
        ...prev,
        navigation: {
          hotspots: {
            ...(prev.navigation?.hotspots ?? {}),
            [hotspotId]: {
              id: hotspotId,
              pageId,
              kind,
              rect,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
          connections: {
            ...(prev.navigation?.connections ?? {}),
            [connectionId]: {
              id: connectionId,
              source: { pageId, hotspotId },
              target: { pageId: targetPageId },
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
        },
      }));
      setSelectedNavigationConnectionId(connectionId);
      setSelectedNodeId(null);
      setSelectedDocumentNodeIds([]);
      setSelectedPageGroupIds([]);
      setSelectedSectionId(null);
      setSelectedPageIds([]);
      setToolMode("select");
      setPendingNavigation(null);
    },
    [updateState],
  );

  const handleNavigationDraftChange = useCallback(
    (
      sourcePageId: string,
      draft: Pick<CanvasNavigationHotspot, "kind" | "rect"> | null,
    ) => {
      setPendingNavigation(
        draft ? { sourcePageId, ...draft, pointer: null } : null,
      );
    },
    [],
  );

  const handleNavigationPointerMove = useCallback(
    (pointer: { x: number; y: number }) => {
      setPendingNavigation((current) =>
        current ? { ...current, pointer } : current,
      );
    },
    [],
  );

  const handleNavigationTargetSelect = useCallback(
    (targetPageId: string) => {
      if (!pendingNavigation || pendingNavigation.sourcePageId === targetPageId) return;
      handleCreateNavigation(
        pendingNavigation.sourcePageId,
        pendingNavigation.rect,
        targetPageId,
        pendingNavigation.kind,
      );
    },
    [handleCreateNavigation, pendingNavigation],
  );

  const handleUpdateNavigationHotspot = useCallback(
    (hotspotId: string, rect: CanvasNavigationHotspot["rect"]) => {
      updateState((prev) => {
        const hotspot = prev.navigation?.hotspots[hotspotId];
        if (!hotspot) return prev;
        return {
          ...prev,
          navigation: {
            hotspots: {
              ...(prev.navigation?.hotspots ?? {}),
              [hotspotId]: { ...hotspot, rect, updatedAt: Date.now() },
            },
            connections: { ...(prev.navigation?.connections ?? {}) },
          },
        };
      });
    },
    [updateState],
  );

  const handleUpdateNavigationTarget = useCallback(
    (hotspotId: string, targetPageId: string) => {
      updateState((prev) => {
        const connection = Object.values(prev.navigation?.connections ?? {}).find(
          (item) => item.source.hotspotId === hotspotId,
        );
        if (!connection || connection.source.pageId === targetPageId) return prev;
        return {
          ...prev,
          navigation: {
            hotspots: { ...(prev.navigation?.hotspots ?? {}) },
            connections: {
              ...(prev.navigation?.connections ?? {}),
              [connection.id]: {
                ...connection,
                target: { pageId: targetPageId },
                updatedAt: Date.now(),
              },
            },
          },
        };
      });
    },
    [updateState],
  );

  const handleDeleteNavigationHotspot = useCallback(
    (hotspotId: string) => {
      updateState((prev) => {
        if (!prev.navigation?.hotspots[hotspotId]) return prev;
        const { [hotspotId]: _removed, ...hotspots } = prev.navigation.hotspots;
        const connections = Object.fromEntries(
          Object.entries(prev.navigation.connections).filter(
            ([, connection]) => connection.source.hotspotId !== hotspotId,
          ),
        );
        return { ...prev, navigation: { hotspots, connections } };
      });
    },
    [updateState],
  );

  const handleDeleteNavigationConnection = useCallback(
    (connectionId: string) => {
      updateState((prev) =>
        removeNavigationConnectionFromState(prev, connectionId),
      );
      setSelectedNavigationConnectionId((current) =>
        current === connectionId ? null : current,
      );
    },
    [updateState],
  );

  const handleDeleteNavigationRelations = useCallback(
    (pageId: string) => {
      updateState((prev) => {
        const connections = Object.fromEntries(
          Object.entries(prev.navigation?.connections ?? {}).filter(
            ([, connection]) =>
              connection.source.pageId !== pageId &&
              connection.target.pageId !== pageId,
          ),
        );
        const activeHotspotIds = new Set(
          Object.values(connections).map(
            (connection) => connection.source.hotspotId,
          ),
        );
        const hotspots = Object.fromEntries(
          Object.entries(prev.navigation?.hotspots ?? {}).filter(
            ([id, hotspot]) =>
              hotspot.pageId !== pageId && activeHotspotIds.has(id),
          ),
        );
        return {
          ...prev,
          ...(prev.navigation ? { navigation: { hotspots, connections } } : {}),
        };
      });
    },
    [updateState],
  );

  const handleSelectionRectChange = useCallback(
    (rect: CanvasRect) => {
      if (!isEditorMode || effectiveToolMode !== "select") return;
      if (rect.width < 2 && rect.height < 2) {
        setSelectedNavigationConnectionId(null);
        setSelectedPageIds([]);
        setSelectedNodeId(null);
        setSelectedDocumentNodeIds([]);
        setSelectedSectionId(null);
        setSelectedPageGroupIds([]);
        setEditingTextNodeId(null);
        return;
      }

      setSelectedNavigationConnectionId(null);

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
      setSelectedSectionId(null);
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

  const notifyPageConfigEdit = useCallback(
    (pageId: string) => {
      const configCount = pages.find((page) => page.id === pageId)?.configCount;
      if (configCount === undefined) {
        onPageConfigEdit?.(pageId);
      } else {
        onPageConfigEdit?.(pageId, { openConfigDetail: configCount > 0 });
      }
    },
    [onPageConfigEdit, pages],
  );

  const handlePageSelect = useCallback(
    (pageId: string, event?: React.PointerEvent | React.MouseEvent) => {
      if (isEditorMode && effectiveToolMode === "select") {
        setSelectedNavigationConnectionId(null);
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
        notifyPageConfigEdit(pageId);
        return;
      }
      if (!isEditorMode) {
        notifyPageConfigEdit(pageId);
      }
    },
    [effectiveToolMode, isEditorMode, notifyPageConfigEdit],
  );

  const handlePageCommentBadgeClick = useCallback(
    (pageId: string) => {
      if (isEditorMode) {
        setSelectedNavigationConnectionId(null);
        setSelectedNodeId(null);
        setSelectedDocumentNodeIds([]);
        setSelectedSectionId(null);
        setSelectedPageGroupIds([]);
        setSelectedPageIds([pageId]);
      }
      onPageCommentBadgeClick?.(pageId);
    },
    [isEditorMode, onPageCommentBadgeClick],
  );

  const handlePageGroupCommentBadgeClick = useCallback(
    (groupId: string, pageId: string) => {
      if (isEditorMode) {
        setSelectedNavigationConnectionId(null);
        setSelectedNodeId(null);
        setSelectedDocumentNodeIds([]);
        setSelectedSectionId(null);
        setSelectedPageIds([]);
        setSelectedPageGroupIds([groupId]);
      }
      onPageCommentBadgeClick?.(pageId);
    },
    [isEditorMode, onPageCommentBadgeClick],
  );

  const writeCanvasSelectionToClipboard = useCallback(
    (options?: { pageIds?: string[] }) => {
      const pageIdsToCopy = options?.pageIds ?? selectedPageIds;
      const includeNonPageSelection = options?.pageIds === undefined;

      const copiedNodeIds = new Set<string>();
      const copiedSectionIds = new Set<string>();
      const copiedSectionPageIds = new Set<string>();
      const copiedSectionPageGroupIds = new Set<string>();
      const collectSection = (sectionId: string) => {
        if (copiedSectionIds.has(sectionId)) return;
        const section = effectiveSections[sectionId];
        if (!section) return;
        copiedSectionIds.add(sectionId);
        for (const child of section.children) {
          if (child.kind === "section") collectSection(child.id);
          if (child.kind === "page") copiedSectionPageIds.add(child.id);
          if (child.kind === "page-group") copiedSectionPageGroupIds.add(child.id);
          if (child.kind === "node") copiedNodeIds.add(child.id);
        }
      };

      if (includeNonPageSelection) {
        if (selectedSectionId) collectSection(selectedSectionId);
        if (selectedDocumentNodeIds.length > 0) {
          selectedDocumentNodeIds.forEach((id) => copiedNodeIds.add(id));
        } else if (selectedNodeId) {
          copiedNodeIds.add(selectedNodeId);
        }
      }

      const copiedNodes: CanvasFreeNode[] = [];
      copiedNodeIds.forEach((id) => {
        const node = effectiveNodes[id];
        if (node) copiedNodes.push(node);
      });

      const copiedPages: CanvasTransferPageIdentity[] = [];
      const copiedPageLayouts: Record<string, CanvasPageLayout> = {};
      new Set([...pageIdsToCopy, ...copiedSectionPageIds]).forEach((pageId) => {
        const page = pagesById.get(pageId);
        const layout = effectivePages[pageId];
        if (page) {
          copiedPages.push({
            id: page.id,
            name: page.name,
            runtimeType: page.runtimeType,
          });
        }
        if (layout) copiedPageLayouts[pageId] = layout;
      });

      const copiedPageGroups: CanvasPageGroup[] = includeNonPageSelection
        ? [...new Set([...selectedPageGroupIds, ...copiedSectionPageGroupIds])].flatMap((groupId) => {
            const group = canvasState.pageGroups?.[groupId];
            return group ? [group] : [];
          })
        : [];
      const copiedSections = Array.from(copiedSectionIds)
        .map((sectionId) => effectiveSections[sectionId])
        .filter((section): section is CanvasSection => Boolean(section));
      const copiedPageIds = new Set(copiedPages.map((page) => page.id));
      const copiedHotspots = Object.fromEntries(
        Object.entries(canvasState.navigation?.hotspots ?? {}).filter(
          ([, hotspot]) => copiedPageIds.has(hotspot.pageId),
        ),
      );
      const copiedNavigation = {
        hotspots: copiedHotspots,
        connections: Object.fromEntries(
          Object.entries(canvasState.navigation?.connections ?? {}).filter(
            ([, connection]) =>
              copiedPageIds.has(connection.source.pageId) &&
              copiedPageIds.has(connection.target.pageId) &&
              Boolean(copiedHotspots[connection.source.hotspotId]),
          ),
        ),
      };

      writeCanvasClipboard({
        version: 2,
        copiedAt: Date.now(),
        sourceProjectId: projectId,
        sourceSessionId: sessionId,
        nodes: copiedNodes,
        pages: copiedPages,
        pageLayouts: copiedPageLayouts,
        pageGroups: copiedPageGroups,
        sections: copiedSections,
        ...(Object.keys(copiedHotspots).length > 0
          ? { navigation: copiedNavigation }
          : {}),
        bounds: computeBounds(copiedPageLayouts, copiedNodes, copiedSections),
      });
    },
    [
      canvasState.navigation,
      canvasState.pageGroups,
      effectiveNodes,
      effectivePages,
      effectiveSections,
      pagesById,
      projectId,
      selectedDocumentNodeIds,
      selectedNodeId,
      selectedPageGroupIds,
      selectedPageIds,
      selectedSectionId,
      sessionId,
    ],
  );

  // 粘贴选择器回调
  const handlePasteAsCopy = useCallback(() => {
    const data = pendingPasteModal;
    if (!data || !onRequestPastePages) return;
    setPendingPasteModal(null);
    void onRequestPastePages({
      pages: data.pages,
      pageLayouts: data.pageLayouts,
      pageGroups: data.pageGroups,
      sourceProjectId: data.sourceProjectId,
    }).then(({ pageIdMapping }) => {
      updateState((prev) => {
        const nextPages = { ...prev.pages };
        pageIdMapping.forEach((newId, oldId) => {
          const layout = data.pageLayouts[oldId];
          if (layout) nextPages[newId] = layout;
        });
        const nextGroups = { ...(prev.pageGroups ?? {}) };
        const pastedSections = remapCanvasSectionsForPaste({
          sections: data.sections,
          pageIdMapping,
          nodeIdMapping: data.nodeIdMapping,
          offset: data.offset,
          now: Date.now(),
          createId: () => createCanvasId("section", "_"),
        });
        for (const oldGroup of data.pageGroups) {
          const newGroupPages = oldGroup.pages.map((entry) => ({
            ...entry,
            pageId: pageIdMapping.get(entry.pageId) ?? entry.pageId,
          }));
          const newActivePageId =
            pageIdMapping.get(oldGroup.activePageId) ?? oldGroup.activePageId;
          const groupId = createCanvasId("page-group");
          nextGroups[groupId] = {
            ...oldGroup,
            id: groupId,
            pages: newGroupPages,
            activePageId: newActivePageId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
        return {
          ...prev,
          pages: nextPages,
          pageGroups:
            Object.keys(nextGroups).length > 0 ? nextGroups : prev.pageGroups,
          sections: { ...(prev.sections ?? {}), ...pastedSections },
        };
      });
      const newPageIds = Array.from(pageIdMapping.values());
      setSelectedPageIds(newPageIds);
      setSelectedNodeId(null);
      setSelectedDocumentNodeIds([]);
      setSelectedPageGroupIds([]);
    });
  }, [pendingPasteModal, onRequestPastePages]);

  const handlePasteAsReference = useCallback(() => {
    const data = pendingPasteModal;
    if (!data || !onRequestCreateReferences) return;
    setPendingPasteModal(null);
    void onRequestCreateReferences({
      pages: data.pages,
      pageLayouts: data.pageLayouts,
      pageGroups: data.pageGroups,
      sourceProjectId: data.sourceProjectId,
    }).then(({ pageIdMapping }) => {
      updateState((prev) => {
        const nextPages = { ...prev.pages };
        pageIdMapping.forEach((newId, oldId) => {
          const layout = data.pageLayouts[oldId];
          if (layout) nextPages[newId] = { ...layout, zIndex: layout.zIndex };
        });
        const nextGroups = { ...(prev.pageGroups ?? {}) };
        const pastedSections = remapCanvasSectionsForPaste({
          sections: data.sections,
          pageIdMapping,
          nodeIdMapping: data.nodeIdMapping,
          offset: data.offset,
          now: Date.now(),
          createId: () => createCanvasId("section", "_"),
        });
        for (const oldGroup of data.pageGroups) {
          const newGroupPages = oldGroup.pages.map((entry) => ({
            ...entry,
            pageId: pageIdMapping.get(entry.pageId) ?? entry.pageId,
          }));
          const newActivePageId =
            pageIdMapping.get(oldGroup.activePageId) ?? oldGroup.activePageId;
          const groupId = createCanvasId("page-group");
          nextGroups[groupId] = {
            ...oldGroup,
            id: groupId,
            pages: newGroupPages,
            activePageId: newActivePageId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
        return {
          ...prev,
          pages: nextPages,
          pageGroups:
            Object.keys(nextGroups).length > 0 ? nextGroups : prev.pageGroups,
          sections: { ...(prev.sections ?? {}), ...pastedSections },
        };
      });
      const newPageIds = Array.from(pageIdMapping.values());
      setSelectedPageIds(newPageIds);
      setSelectedNodeId(null);
      setSelectedDocumentNodeIds([]);
      setSelectedPageGroupIds([]);
    });
  }, [pendingPasteModal, onRequestCreateReferences]);

  const handlePasteCancel = useCallback(() => {
    setPendingPasteModal(null);
  }, []);

  const handleNodeSelect = useCallback(
    (nodeId: string, event?: React.PointerEvent | React.MouseEvent) => {
      const node = effectiveNodes[nodeId];
      setSelectedNavigationConnectionId(null);
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

  const handleGroupSelectedPages = useCallback(() => {
    if (selectedPageLikeLayoutEntries.length < 2 || !selectedPageBounds) return;
    const padding = 24;
    const titleSpace = 28;
    const id = createCanvasId("section", "_");
    const section = createCanvasSection({
      id,
      title: "分组",
      layout: {
        x: selectedPageBounds.x - padding,
        y: selectedPageBounds.y - padding - titleSpace,
        width: selectedPageBounds.width + padding * 2,
        height: selectedPageBounds.height + padding * 2 + titleSpace,
        zIndex: Math.max(
          0,
          ...Object.values(allItemLayouts).map((layout) => layout.zIndex ?? 0),
        ) + 1,
      },
    });
    updateState((prev) => {
      let next: CanvasState = {
        ...prev,
        sections: { ...(prev.sections ?? {}), [id]: section },
      };
      for (const entry of selectedPageLikeLayoutEntries) {
        next = assignCanvasObjectToSection(next, entry, entry.layout);
      }
      return next;
    });
    setSelectedPageIds([]);
    setSelectedPageGroupIds([]);
    setSelectedSectionId(id);
    setTitleEditingSectionId(id);
    setToolMode("select");
  }, [allItemLayouts, selectedPageBounds, selectedPageLikeLayoutEntries, updateState]);

  const updateArrangedPageLayouts = useCallback(
    (action: MultiPageArrangeAction) => {
      if (selectedPageLikeLayoutEntries.length < 2 || !selectedPageBounds) return;

      updateState((prev) => {
        const entries = [...selectedPageLikeLayoutEntries].sort((a, b) => {
          const primary = action === "horizontal" ? a.layout.x - b.layout.x : a.layout.y - b.layout.y;
          if (primary !== 0) return primary;
          return a.id.localeCompare(b.id);
        });
        const totalSize = entries.reduce(
          (sum, entry) => sum + (action === "horizontal" ? entry.layout.width : entry.layout.height),
          0,
        );
        const availableSize = action === "horizontal" ? selectedPageBounds.width : selectedPageBounds.height;
        const gap = (availableSize - totalSize) / (entries.length - 1);
        const nextPages = { ...prev.pages };
        const nextPageGroups = { ...(prev.pageGroups ?? {}) };
        let cursor = action === "horizontal" ? selectedPageBounds.x : selectedPageBounds.y;

        for (const entry of entries) {
          const size = action === "horizontal" ? entry.layout.width : entry.layout.height;
          const nextLayout = {
            ...entry.layout,
            ...(action === "horizontal" ? { x: cursor } : { y: cursor }),
          };
          if (entry.kind === "page") {
            nextPages[entry.id] = nextLayout;
          } else if (nextPageGroups[entry.id]) {
            nextPageGroups[entry.id] = {
              ...nextPageGroups[entry.id],
              layout: nextLayout,
              updatedAt: Date.now(),
            };
          }
          cursor += size + gap;
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
        return reconcileCanvasSectionMembership(
          withCanvasAnnotationNodes(prev, {
            ...(prev.nodes ?? {}),
            [nodeId]: { ...node, layout, updatedAt: Date.now() },
          }),
        );
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
      setSelectedSectionId(null);
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
      setSelectedSectionId(null);
      notifyPageConfigEdit(activePageId);
    },
    [notifyPageConfigEdit],
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
        selectedPageIds.length === 0 &&
        !selectedSectionId &&
        !selectedNavigationConnectionId) ||
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
      if (selectedNavigationConnectionId) {
        handleDeleteNavigationConnection(selectedNavigationConnectionId);
        return;
      }
      if (selectedSectionId) {
        updateState((prev) =>
          removeCanvasSection(prev, selectedSectionId),
        );
        setSelectedSectionId(null);
        return;
      }
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
    handleDeleteNavigationConnection,
    isEditorMode,
    onRequestDeletePages,
    selectedDocumentNodeIds,
    selectedNodeId,
    selectedNavigationConnectionId,
    selectedPageIds,
    selectedSectionId,
    updateState,
  ]);

  // ── 复制快捷键（Ctrl/Cmd+C）──
  useEffect(() => {
    if (!isEditorMode || documentDraft) return;
    const hasSelection =
      selectedNodeId ||
      selectedDocumentNodeIds.length > 0 ||
      selectedPageIds.length > 0 ||
      selectedPageGroupIds.length > 0 ||
      Boolean(selectedSectionId);
    if (!hasSelection) return;

    const handleCopy = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key !== "c" || !(event.metaKey || event.ctrlKey)) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();

      writeCanvasSelectionToClipboard();
    };

    window.addEventListener("keydown", handleCopy);
    return () => window.removeEventListener("keydown", handleCopy);
  }, [
    isEditorMode,
    documentDraft,
    writeCanvasSelectionToClipboard,
  ]);

  // 内部画布剪贴板只能在原生 paste 事件中处理。这样系统 HTML/文件
  // 可先依据实际 ClipboardData 分流，不会被残留的 localStorage 内容拦截。
  const handleInternalCanvasPaste = useCallback(() => {
    const clipboardData = readCanvasClipboard();
    if (!clipboardData) return false;
    const clipboardSections = clipboardData.sections ?? [];
    const hasContent =
      clipboardData.nodes.length > 0 ||
      clipboardData.pages.length > 0 ||
      clipboardData.pageGroups.length > 0 ||
      clipboardSections.length > 0;
    if (!hasContent) return false;

    const PASTE_OFFSET = 24;
    const zoom = canvasState.viewport.zoom || 1;
    const centerX = (-canvasState.viewport.x + containerSize.width / 2) / zoom;
    const centerY = (-canvasState.viewport.y + containerSize.height / 2) / zoom;
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
    const nodeIdMapping = new Map<string, string>();
    if (clipboardData.nodes.length > 0) {
      const newNodes: CanvasFreeNode[] = clipboardData.nodes.map(
        (node, index) => {
          const prefix =
            node.kind === "text"
              ? "text"
              : node.kind === "image"
                ? "img"
                : "doc";
          const newId = createCanvasId(prefix);
          newNodeIds.push(newId);
          nodeIdMapping.set(node.id, newId);
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

    const applyPastedSections = (pageIdMapping: Map<string, string>) => {
      if (clipboardSections.length === 0) return;
      updateState((prev) => ({
        ...prev,
        sections: {
          ...(prev.sections ?? {}),
          ...remapCanvasSectionsForPaste({
            sections: clipboardSections,
            pageIdMapping,
            nodeIdMapping,
            offset: { x: offsetX, y: offsetY },
            now,
            createId: () => createCanvasId("section", "_"),
          }),
        },
      }));
    };

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

      // 判断是否为跨项目粘贴
      const isCrossProject =
        clipboardData.sourceProjectId &&
        clipboardData.sourceProjectId !== projectId;

      if (isCrossProject && onRequestCreateReferences) {
        // 跨项目：弹出选择器，暂存粘贴数据
        setPendingPasteModal({
          pages: clipboardData.pages,
          pageLayouts: shiftedPageLayouts,
          pageGroups: clipboardData.pageGroups,
          sections: clipboardSections,
          nodeIdMapping,
          offset: { x: offsetX, y: offsetY },
          sourceProjectId: clipboardData.sourceProjectId ?? "",
        });
      } else {
        // 同项目：直接粘贴为副本
        void onRequestPastePages({
          pages: clipboardData.pages,
          pageLayouts: shiftedPageLayouts,
          pageGroups: clipboardData.pageGroups,
          sourceProjectId: clipboardData.sourceProjectId,
        }).then(({ pageIdMapping }) => {
          // 将新页面布局写入画布状态
          updateState((prev) => {
            const nextPages = { ...prev.pages };
            pageIdMapping.forEach((newId, oldId) => {
              const layout = shiftedPageLayouts[oldId];
              if (layout) nextPages[newId] = layout;
            });
            const nextGroups = { ...(prev.pageGroups ?? {}) };
            const pastedSections = remapCanvasSectionsForPaste({
              sections: clipboardSections,
              pageIdMapping,
              nodeIdMapping,
              offset: { x: offsetX, y: offsetY },
              now,
              createId: () => createCanvasId("section", "_"),
            });
            const remappedNavigation = remapNavigation(
              clipboardData.navigation,
              pageIdMapping,
            );
            for (const oldGroup of clipboardData.pageGroups) {
              const newGroupPages = oldGroup.pages.map((entry) => ({
                ...entry,
                pageId: pageIdMapping.get(entry.pageId) ?? entry.pageId,
              }));
              const newActivePageId =
                pageIdMapping.get(oldGroup.activePageId) ??
                oldGroup.activePageId;
              const groupId = createCanvasId("page-group");
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
              sections: { ...(prev.sections ?? {}), ...pastedSections },
              ...(remappedNavigation
                ? {
                    navigation: {
                      hotspots: {
                        ...(prev.navigation?.hotspots ?? {}),
                        ...remappedNavigation.hotspots,
                      },
                      connections: {
                        ...(prev.navigation?.connections ?? {}),
                        ...remappedNavigation.connections,
                      },
                    },
                  }
                : {}),
            };
          });
          const newPageIds = Array.from(pageIdMapping.values());
          setSelectedPageIds(newPageIds);
          setSelectedNodeId(null);
          setSelectedDocumentNodeIds([]);
          setSelectedPageGroupIds([]);
        });
      }
    } else {
      applyPastedSections(new Map());
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
      setSelectedSectionId(null);
    }
    return true;
  }, [
    canvasState.viewport,
    containerSize.width,
    containerSize.height,
    allItemLayouts,
    updateState,
    onRequestPastePages,
    onRequestCreateReferences,
    projectId,
  ]);

  // 开始拖拽/缩放时，清空辅助线
  const handleDragStart = useCallback(
    (itemId: string, options?: { copy?: boolean }) => {
      activeDragItemIdRef.current = itemId;
      setActiveDragItemId(itemId);
      setAlignmentGuides([]);
      const sourceLayout = pageIds.has(itemId)
        ? effectivePages[itemId]
        : effectiveNodes[itemId]?.layout;
      const canCopy =
        Boolean(options?.copy) &&
        Boolean(sourceLayout) &&
        (Boolean(effectiveNodes[itemId]) ||
          (pageIds.has(itemId) && Boolean(onRequestPastePages)));
      copyDragRef.current =
        canCopy && sourceLayout
          ? {
              kind: pageIds.has(itemId) ? "page" : "node",
              sourceId: itemId,
              startLayout: { ...sourceLayout },
            }
          : null;
      if (
        pageIds.has(itemId) &&
        !options?.copy &&
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
    [
      effectiveNodes,
      effectivePages,
      onRequestPastePages,
      pageIds,
      selectedPageIds,
    ],
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
      if (isPageItem || Boolean(effectiveNodes[itemId])) {
        setDropTargetSectionId(
          findInnermostSectionContainingLayout(
            effectiveSections,
            alignedLayout,
          )?.id ?? null,
        );
      }
      updateState((prev) => reconcileCanvasSectionMembership({
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
    [
      activeDragItemId,
      allItemLayouts,
      effectiveNodes,
      effectiveSections,
      pageGroupIds,
      pageIds,
      updateState,
    ],
  );

  // 结束拖拽/缩放时，清空辅助线
  const handleDragEnd = useCallback(() => {
    const itemId = activeDragItemIdRef.current;
    const copyDrag = copyDragRef.current;
    copyDragRef.current = null;
    if (copyDrag && itemId === copyDrag.sourceId) {
      const targetLayout =
        copyDrag.kind === "page"
          ? canvasStateRef.current.pages[copyDrag.sourceId]
          : canvasStateRef.current.nodes?.[copyDrag.sourceId]?.layout;
      if (targetLayout) {
        if (copyDrag.kind === "node") {
          const sourceNode = canvasStateRef.current.nodes?.[copyDrag.sourceId];
          if (sourceNode) {
            const newId = createCanvasId(
              sourceNode.kind === "text" ? "text" : sourceNode.kind === "image" ? "img" : "doc",
            );
            const now = Date.now();
            updateState((prev) => {
              const nextNodes = {
                ...(prev.nodes ?? {}),
                [copyDrag.sourceId]: {
                  ...sourceNode,
                  layout: copyDrag.startLayout,
                },
                [newId]: {
                  ...sourceNode,
                  id: newId,
                  layout: targetLayout,
                  createdAt: now,
                  updatedAt: now,
                },
              };
              return assignCanvasObjectToSection(
                withCanvasAnnotationNodes(prev, nextNodes),
                { kind: "node", id: newId },
                targetLayout,
              );
            });
            setSelectedNodeId(newId);
          }
        } else {
          const sourcePage = pagesById.get(copyDrag.sourceId);
          if (sourcePage && onRequestPastePages) {
            updateState((prev) => ({
              ...prev,
              pages: {
                ...prev.pages,
                [copyDrag.sourceId]: copyDrag.startLayout,
              },
            }));
            void onRequestPastePages({
              pages: [sourcePage],
              pageLayouts: { [copyDrag.sourceId]: targetLayout },
              pageGroups: [],
            }).then(({ pageIdMapping }) => {
              const newId = pageIdMapping.get(copyDrag.sourceId);
              if (!newId) return;
              updateState((prev) =>
                assignCanvasObjectToSection(
                  {
                    ...prev,
                    pages: { ...prev.pages, [newId]: targetLayout },
                  },
                  { kind: "page", id: newId },
                  targetLayout,
                ),
              );
              setSelectedPageIds([newId]);
            });
          }
        }
      }
      activeDragItemIdRef.current = null;
      setActiveDragItemId(null);
      multiDragStartLayoutsRef.current = null;
      setAlignmentGuides([]);
      setDropTargetSectionId(null);
      return;
    }
    if (itemId && effectiveSections[itemId]) {
      const layout = canvasStateRef.current.sections?.[itemId]?.layout;
      if (layout)
        updateState((prev) =>
          reconcileCanvasSectionMembership(
            assignCanvasSectionToSection(prev, itemId, layout),
          ),
        );
    } else if (
      itemId &&
      (pageIds.has(itemId) || Boolean(effectiveNodes[itemId]))
    ) {
      const kind = pageIds.has(itemId) ? "page" : "node";
      const layout =
        kind === "page"
          ? canvasStateRef.current.pages[itemId]
          : canvasStateRef.current.nodes?.[itemId]?.layout;
      if (layout) {
        updateState((prev) =>
          reconcileCanvasSectionMembership(
            assignCanvasObjectToSection(prev, { kind, id: itemId }, layout),
          ),
        );
      }
    }
    activeDragItemIdRef.current = null;
    setActiveDragItemId(null);
    multiDragStartLayoutsRef.current = null;
    setAlignmentGuides([]);
    setDropTargetSectionId(null);
  }, [
    effectiveNodes,
    effectiveSections,
    onRequestPastePages,
    pageIds,
    pagesById,
    updateState,
  ]);

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
    const viewport = computeFitCanvasViewport(visibleItemLayouts, {
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
    });
    if (!viewport) return false;

    updateState((prev) => ({
      ...prev,
      viewport,
    }));
    return true;
  }, [containerSize, updateState, visibleItemLayouts]);

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

    const viewport = computeFitCanvasViewport(visibleItemLayouts, {
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
    visibleItemLayouts,
    containerSize.height,
    containerSize.width,
    resolvedInteractionMode,
    updateState,
  ]);

  const handleAutoLayout = useCallback(() => {
    updateState((prev) => {
      const arranged = computeCanvasSectionAutoLayout({
        ...prev,
        pages: effectivePages,
        nodes: effectiveNodes,
      });
      const layouts = {
        ...arranged.pages,
        ...Object.fromEntries(
          Object.entries(arranged.pageGroups ?? {}).map(([id, group]) => [
            id,
            group.layout,
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(arranged.nodes ?? {}).map(([id, node]) => [
            id,
            node.layout,
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(arranged.sections ?? {}).map(([id, section]) => [
            id,
            section.layout,
          ]),
        ),
      };
      const viewport =
        computeFitCanvasViewport(layouts, {
          containerWidth: containerSize.width,
          containerHeight: containerSize.height,
        }) ?? prev.viewport;
      return withCanvasAnnotationNodes(
        {
          ...prev,
          pages: arranged.pages,
          pageGroups: arranged.pageGroups,
          sections: arranged.sections,
          viewport,
        },
        arranged.nodes ?? {},
      );
    });
  }, [containerSize, effectiveNodes, effectivePages, updateState]);

  const createNodeId = useCallback((prefix: string) => {
    return createCanvasId(prefix);
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

  const handleResetSelectedPages = useCallback(() => {
    if (selectedPageIds.length === 0) return;
    updateState((prev) => {
      const nextPages = { ...prev.pages };
      for (const pageId of selectedPageIds) {
        const page = pagesById.get(pageId);
        const layout = prev.pages[pageId];
        if (!page || !layout) continue;
        const width = Number(page.previewSize?.width) || 375;
        const height = Number(page.previewSize?.height) || 812;
        nextPages[pageId] = {
          ...layout,
          width,
          height,
          sizeMode: "preview",
          previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
        };
      }
      return { ...prev, pages: nextPages };
    });
  }, [pagesById, selectedPageIds, updateState]);

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
    (
      canvasPoint?: CanvasPoint,
      fixedLayout?: Pick<CanvasPageLayout, "width" | "height">,
    ) => {
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
      const width = fixedLayout?.width ?? 18;
      const height = fixedLayout?.height ?? Math.ceil(18 * 1.35);
      setPendingTextDraft({
        id: createCanvasId("draft_text", "_"),
        kind: "text",
        title: "文字",
        text: "",
        fontSize: 18,
        color: "#ffffff",
        textAlign: "left",
        fontWeight: 400,
        lineHeight: 1.5,
        stylePreset: "body",
        autoWidth: !fixedLayout,
        layout: {
          x: canvasPoint.x,
          y: canvasPoint.y,
          width,
          height,
        },
        createdAt: now,
        updatedAt: now,
      });
      setSelectedPageIds([]);
      setSelectedDocumentNodeIds([]);
      setSelectedPageGroupIds([]);
      setSelectedNodeId(null);
      setEditingTextNodeId(null);
      setToolMode("select");
    },
    [],
  );

  const handlePendingTextDraftChange = useCallback(
    (text: string) => {
      if (!pendingTextDraft) return;
      const nextDraft = { ...pendingTextDraft, text };
      if (!text.trim()) {
        setPendingTextDraft(nextDraft);
        return;
      }

      const now = Date.now();
      const node: CanvasTextNode = {
        ...nextDraft,
        id: createNodeId("text"),
        title: text.trim().split(/\r?\n/)[0]?.slice(0, 24) || "文字",
        createdAt: now,
        updatedAt: now,
      };
      addOrUpdateNode(node);
      setSelectedNodeId(node.id);
      setEditingTextNodeId(node.id);
      setPendingTextDraft(null);
    },
    [addOrUpdateNode, createNodeId, pendingTextDraft],
  );

  const handleCanvasRectCreate = useCallback(
    (rect: CanvasRect) => {
      if (effectiveToolMode === "text") {
        const isDrag = rect.width >= 3 || rect.height >= 3;
        handleAddTextNode(
          { x: rect.x, y: rect.y },
          isDrag
            ? { width: Math.max(18, rect.width), height: Math.max(25, rect.height) }
            : undefined,
        );
        return;
      }
      handleCreateSection(rect);
    },
    [effectiveToolMode, handleAddTextNode, handleCreateSection],
  );

  const handleCanvasPointCreate = useCallback(
    (point: CanvasPoint) => {
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
    [addImageFile, effectiveToolMode],
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

  const selectedSection = selectedSectionId
    ? effectiveSections[selectedSectionId]
    : undefined;
  const selectedSectionToolbarStyle = useMemo<
    React.CSSProperties | undefined
  >(() => {
    if (!selectedSection) return undefined;
    const zoom = canvasState.viewport.zoom || 1;
    return {
      left:
        canvasState.viewport.x +
        (selectedSection.layout.x + selectedSection.layout.width / 2) * zoom,
      top: Math.max(
        12,
        canvasState.viewport.y + selectedSection.layout.y * zoom - 62,
      ),
      transform: "translateX(-50%)",
    };
  }, [canvasState.viewport, selectedSection]);

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
        "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
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
        if (
          target.closest("button,input,textarea,select,a") ||
          target.isContentEditable
        ) {
          return;
        }
        if (documentDraft) return;
        const files = extractImportFilesFromTransfer(
          event.clipboardData.files,
          event.clipboardData.items,
        );
        if (files.length > 0) {
          event.preventDefault();
          handleAddImportFiles(files);
          return;
        }
        if (onRequestPasteHtmlContent) {
          const html = extractHtmlImportFromClipboard(event.clipboardData);
          if (html) {
            event.preventDefault();
            void onRequestPasteHtmlContent(html);
            return;
          }
        }
        if (handleInternalCanvasPaste()) event.preventDefault();
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
          className="absolute z-30 flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap rounded-lg border bg-background/90 p-1 shadow-lg backdrop-blur"
          style={selectionToolbarStyle}
        >
          {selectedPageLikeCount >= 2 && (
            <span
              role="status"
              aria-label={`已选中 ${selectedPageLikeCount} 个画布对象`}
              title={`已选中 ${selectedPageLikeCount} 个画布对象`}
              className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1 text-xs font-medium tabular-nums text-muted-foreground"
            >
              {selectedPageLikeCount}
            </span>
          )}
          {selectedPageLikeCount >= 2 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="对齐"
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <AlignCenterHorizontal className="h-4 w-4" />
                  对齐
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-52 p-2.5"
              >
                <div className="space-y-2">
                  <div>
                    <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
                      水平对齐
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {renderAlignmentButton("left", "左对齐", <AlignStartVertical className="h-4 w-4" />)}
                      {renderAlignmentButton("center-x", "水平居中对齐", <AlignCenterVertical className="h-4 w-4" />)}
                      {renderAlignmentButton("right", "右对齐", <AlignEndVertical className="h-4 w-4" />)}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
                      垂直对齐
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {renderAlignmentButton("top", "顶部对齐", <AlignStartHorizontal className="h-4 w-4" />)}
                      {renderAlignmentButton("center-y", "垂直居中对齐", <AlignCenterHorizontal className="h-4 w-4" />)}
                      {renderAlignmentButton("bottom", "底部对齐", <AlignEndHorizontal className="h-4 w-4" />)}
                    </div>
                  </div>
                  <div className="border-t pt-2">
                    <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
                      分布
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {renderAlignmentButton("distribute-x", "水平均分", <BetweenVerticalStart className="h-4 w-4" />, selectedPageLikeCount < 3)}
                      {renderAlignmentButton("distribute-y", "垂直均分", <BetweenHorizontalStart className="h-4 w-4" />, selectedPageLikeCount < 3)}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {selectedPageLikeCount >= 2 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="排列"
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  排列
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" sideOffset={8} className="w-44 p-1">
                <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => updateArrangedPageLayouts("horizontal")}>
                  <ArrowLeftRight className="h-4 w-4" />
                  横向排列
                </button>
                <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => updateArrangedPageLayouts("vertical")}>
                  <ArrowUpDown className="h-4 w-4" />
                  竖向排列
                </button>
                <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={handleAutoLayout}>
                  <LayoutGrid className="h-4 w-4" />
                  自动排列
                </button>
              </PopoverContent>
            </Popover>
          )}
          {selectedPageLikeCount >= 2 && (
            <button
              type="button"
              aria-label="编组"
              title="编组"
              className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={handleGroupSelectedPages}
            >
              <Combine className="h-4 w-4" />
              编组
            </button>
          )}
          {selectedReferencePageId && onViewSource && (
            <button
              type="button"
              aria-label="打开源项目"
              title="打开源项目"
              className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onViewSource(selectedReferencePageId)}
            >
              <ExternalLink className="h-4 w-4" />
              打开源项目
            </button>
          )}
          {onAddPagesToChat && selectedPageIds.length > 0 && (
            <>
              <button
                type="button"
                className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onAddPagesToChat(selectedPageIds)}
              >
                <MessageSquarePlus className="h-4 w-4" />
                添加到对话
              </button>
              <div className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          {selectedPageIds.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="更多"
                  title="更多"
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" sideOffset={8} className="w-44 p-1">
                {selectedPageIds.length >= 2 && selectedPageGroupIds.length === 0 && (
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={handleMergeSelectedPages}>
                    <Combine className="h-4 w-4" />
                    合并页面
                  </button>
                )}
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={handleResetSelectedPages}>
                  <RotateCcw className="h-4 w-4" />
                  重置大小
                </button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => writeCanvasSelectionToClipboard()}>
                  <Copy className="h-4 w-4" />
                  复制
                </button>
                {onRequestDeletePages && (
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10" onClick={() => void onRequestDeletePages(selectedPageIds)}>
                    <Trash2 className="h-4 w-4" />
                    删除
                  </button>
                )}
              </PopoverContent>
            </Popover>
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

      {isEditorMode && selectedSection && selectedSectionToolbarStyle && (
        <TooltipProvider delayDuration={250}>
          <div
            role="toolbar"
            aria-label="分组操作"
            className="absolute z-30 flex w-max max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto whitespace-nowrap rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur"
            style={selectedSectionToolbarStyle}
          >
            <ColorPicker
              format="color-opacity"
              label="分组颜色与透明度"
              compact
              className="h-8 w-8 shrink-0 justify-center px-1 [&>span:nth-child(2)]:hidden"
              value={(() => {
                const color = parseColor(selectedSection.style?.color ?? "#94a3b8");
                return color
                  ? formatRgba({ ...color, alpha: (selectedSection.style?.fillOpacity ?? 12) / 100 })
                  : null;
              })()}
              onChange={(nextValue) => {
                if (nextValue === null) {
                  const nextStyle = { ...selectedSection.style };
                  delete nextStyle.color;
                  delete nextStyle.fillOpacity;
                  handleSectionStyleChange(selectedSection.id, nextStyle);
                  return;
                }
                const color = parseColor(nextValue);
                if (!color) return;
                handleSectionStyleChange(selectedSection.id, {
                  ...selectedSection.style,
                  color: formatHex(color),
                  fillOpacity: Math.round(color.alpha * 100),
                });
              }}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="适应成员"
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => updateState((prev) => fitCanvasSectionToChildren(prev, selectedSection.id))}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">适应成员</TooltipContent>
            </Tooltip>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="删除分区"
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    updateState((prev) => removeCanvasSection(prev, selectedSection.id));
                    setSelectedSectionId(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">删除分区并释放成员</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
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
        onToolModeChange={isEditorMode ? handleToolModeChange : undefined}
        alignmentGuides={alignmentGuides}
        toolMode={effectiveToolMode}
        onSelectionRectChange={handleSelectionRectChange}
        onCanvasPointerMove={handleNavigationPointerMove}
        creationMode={
          isEditorMode &&
          (effectiveToolMode === "text" ||
            effectiveToolMode === "image" ||
            effectiveToolMode === "section")
            ? effectiveToolMode
            : null
        }
        onCanvasPointClick={handleCanvasPointCreate}
        onCanvasRectCreate={handleCanvasRectCreate}
      >
        {Object.values(effectiveSections)
          .map((section: CanvasSection) => (
            <CanvasSectionItem
              key={section.id}
              section={section}
              editable={isEditorMode}
              zoom={canvasState.viewport.zoom}
              selected={selectedSectionId === section.id}
              dropTarget={dropTargetSectionId === section.id}
              startEditing={titleEditingSectionId === section.id}
              onSelect={(id) => {
                setSelectedNavigationConnectionId(null);
                setSelectedSectionId(id);
                setSelectedPageIds([]);
                setSelectedPageGroupIds([]);
                setSelectedNodeId(null);
                setSelectedDocumentNodeIds([]);
              }}
              onRename={handleRenameSection}
              onLayoutChange={handleSectionLayoutChange}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}
        <NavigationConnectionsLayer
          connections={navigationConnections}
          hotspots={navigationHotspots}
          layouts={renderablePageLayouts}
          obstacles={navigationObstacles}
          hoveredPageId={hoveredNavigationPageId}
          selectedConnectionId={selectedNavigationConnectionId}
          interactive={
            isEditorMode &&
            (effectiveToolMode === "select" || effectiveToolMode === "navigation") &&
            !pendingNavigation
          }
          onConnectionSelect={(connectionId) => {
            setSelectedNavigationConnectionId(connectionId);
            setSelectedPageIds([]);
            setSelectedNodeId(null);
            setSelectedDocumentNodeIds([]);
            setSelectedPageGroupIds([]);
            setSelectedSectionId(null);
            setEditingTextNodeId(null);
          }}
          draft={pendingNavigation}
        />
        {pages
          .filter(
            (page) =>
              !hiddenPageIdSet.has(page.id),
          )
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
                // Viewer 只读：运行时内容测量不能反向改写已发布布局。
                // 否则页面加载期间的高度微调会改变布局签名，触发 viewer
                // 的适应屏幕逻辑并覆盖用户当前的缩放/平移。
                onLayoutChange={isEditorMode ? handleLayoutChange : undefined}
                onConfigEdit={handlePageSelect}
                onRename={isEditorMode ? onPageRename : undefined}
                onCommentSelect={
                  onPageComment
                    ? (pageId, event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        const page = pagesById.get(pageId);
                        if (!page || rect.width === 0 || rect.height === 0)
                          return;
                        onPageComment({
                          pageId,
                          pageName: page.name,
                          pin: {
                            xRatio: Math.min(
                              1,
                              Math.max(
                                0,
                                (event.clientX - rect.left) / rect.width,
                              ),
                            ),
                            yRatio: Math.min(
                              1,
                              Math.max(
                                0,
                                (event.clientY - rect.top) / rect.height,
                              ),
                            ),
                          },
                          clientX: event.clientX,
                          clientY: event.clientY,
                        });
                      }
                    : undefined
                }
                commentCount={commentCounts?.[page.id] ?? 0}
                onCommentBadgeClick={
                  onPageCommentBadgeClick
                    ? handlePageCommentBadgeClick
                    : undefined
                }
                onRequestDelete={
                  onRequestDeletePages
                    ? (pageId) => void onRequestDeletePages([pageId])
                    : undefined
                }
                onContextMenuOpen={(pageId) => {
                  if (selectedPageIds.includes(pageId)) return;
                  handlePageSelect(pageId);
                }}
                onCopy={(pageId) => {
                  writeCanvasSelectionToClipboard({
                    pageIds: selectedPageIds.includes(pageId)
                      ? selectedPageIds
                      : [pageId],
                  });
                }}
                onViewSource={onViewSource}
                brokenReference={
                  page.isReference &&
                  !page.code &&
                  !page.prototypeHtml &&
                  !page.sketchScene
                }
                onConsoleEntry={onConsoleEntry}
                onError={onError}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                toolMode={effectiveToolMode}
                selected={selectedPageIds.includes(page.id)}
                onPositionableSizes={onPositionableSizes}
                navigationPages={pages}
                navigationHotspots={navigationHotspots.filter(
                  (hotspot) => hotspot.pageId === page.id,
                )}
                navigationConnections={navigationConnections}
                navigationActive={
                  isEditorMode &&
                  effectiveToolMode === "navigation" &&
                  (!pendingNavigation || pendingNavigation.sourcePageId === page.id)
                }
                navigationTargetPending={
                  Boolean(pendingNavigation) && pendingNavigation?.sourcePageId !== page.id
                }
                onNavigationTargetSelect={handleNavigationTargetSelect}
                onNavigationDraftChange={handleNavigationDraftChange}
                showNavigationHotspots={
                  hoveredNavigationPageId === page.id ||
                  selectedPageIds.includes(page.id)
                }
                onCreateNavigation={handleCreateNavigation}
                onUpdateNavigationHotspot={handleUpdateNavigationHotspot}
                onUpdateNavigationTarget={handleUpdateNavigationTarget}
                onDeleteNavigationHotspot={handleDeleteNavigationHotspot}
                onNavigationHover={setHoveredNavigationPageId}
                hasNavigationRelations={navigationConnections.some(
                  (connection) =>
                    connection.source.pageId === page.id ||
                    connection.target.pageId === page.id,
                )}
                onDeleteNavigationRelations={handleDeleteNavigationRelations}
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
            onLayoutChange={
              isEditorMode ? handlePageGroupLayoutChange : undefined
            }
            onActivePageChange={handlePageGroupActivePageChange}
            onDirectoryCollapsedChange={handlePageGroupDirectoryCollapsedChange}
            commentCounts={commentCounts}
            onCommentBadgeClick={
              onPageCommentBadgeClick
                ? (pageId) =>
                    handlePageGroupCommentBadgeClick(group.id, pageId)
                : undefined
            }
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onConsoleEntry={onConsoleEntry}
            onError={onError}
            onPositionableSizes={onPositionableSizes}
          />
        ))}
        {Object.values(effectiveNodes)
          .map((node) => {
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
                    knowledgeDocumentMarkdown[
                      activeEntry.knowledgeDocument.id
                    ] ?? node.markdown,
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
                onLayoutChange={
                  isEditorMode ? handleNodeLayoutChange : undefined
                }
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
                onTextEditFinish={(nodeId) => {
                  if (editingTextNodeId === nodeId) setEditingTextNodeId(null);
                }}
                onTextEditCancel={(nodeId) => {
                  if (editingTextNodeId === nodeId) setEditingTextNodeId(null);
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
        {pendingTextDraft && (
          <CanvasFreeNodeItem
            key={pendingTextDraft.id}
            node={pendingTextDraft}
            editable={isEditorMode}
            zoom={canvasState.viewport.zoom}
            toolMode="select"
            selected
            editing
            onLayoutChange={(nodeId, layout) => {
              setPendingTextDraft((draft) =>
                draft?.id === nodeId ? { ...draft, layout } : draft,
              );
            }}
            onTextChange={(_, text) => handlePendingTextDraftChange(text)}
            onNodeStyleChange={(node) => {
              if (node.kind === "text") setPendingTextDraft(node);
            }}
            onTextEditFinish={() => setPendingTextDraft(null)}
            onTextEditCancel={() => setPendingTextDraft(null)}
          />
        )}
      </CanvasViewport>

      {documentDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[78vh] w-full max-w-5xl flex-col rounded-lg border bg-background shadow-xl">
            <div className="border-b px-4 py-3">
              <div className="text-sm font-semibold">编辑文档</div>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    正在加载文档编辑器…
                  </div>
                }
              >
                <DocumentEditor
                  value={documentDraft.markdown}
                  onChange={(markdown) =>
                    setDocumentDraft((prev) =>
                      prev ? { ...prev, markdown } : prev,
                    )
                  }
                  placeholder="文档标题"
                  localizeRemoteImage={localizeRemoteImage}
                />
              </Suspense>
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

      <PasteOptionsModal
        open={pendingPasteModal !== null}
        pageCount={pendingPasteModal?.pages.length ?? 0}
        onSelectCopy={handlePasteAsCopy}
        onSelectReference={handlePasteAsReference}
        onCancel={handlePasteCancel}
      />
    </div>
  );
}
