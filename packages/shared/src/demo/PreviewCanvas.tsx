"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BetweenHorizontalStart,
  BetweenVerticalStart,
} from "lucide-react";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem } from "./CanvasPageItem";
import { CanvasFreeNodeItem } from "./CanvasFreeNodeItem";
import { CanvasToolbar } from "./CanvasToolbar";
import { DocumentEditor } from "./DocumentEditor";
import {
  computeCanvasRenderModes,
  DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES,
  DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES,
  MIN_CANVAS_SCREENSHOT_PAGE_COUNT,
} from "./canvas-render-scheduler";
import {
  computeAutoCanvasLayout,
  computeFitCanvasViewport,
  computeInitialCanvasLayout,
  resolveCanvasPageSize,
} from "./canvas-layout";
import {
  getPreviewPageResourceDescriptor,
  prewarmPreviewImageUrls,
} from "./preview-resource-cache";
import { cn } from "./utils";
import type {
  PreviewCanvasProps,
  CanvasState,
  CanvasPageLayout,
  CanvasViewportState,
  AlignmentGuide,
  CanvasToolMode,
  CanvasFreeNode,
} from "./types";

type CanvasImportFileKind = "document" | "image";

interface CanvasImportFile {
  kind: CanvasImportFileKind;
  file: File;
}

interface CanvasPoint {
  x: number;
  y: number;
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

interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MARKDOWN_FILE_EXTENSIONS = [".md", ".markdown", ".mdown"];
const MARKDOWN_MIME_TYPES = new Set(["text/markdown", "text/x-markdown"]);

function getLowerFileName(file: File): string {
  return file.name.toLowerCase();
}

function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
}

function isMarkdownFile(file: File): boolean {
  const lowerName = getLowerFileName(file);
  return (
    MARKDOWN_MIME_TYPES.has(file.type) ||
    MARKDOWN_FILE_EXTENSIONS.some((extension) =>
      lowerName.endsWith(extension),
    )
  );
}

function getVisiblePageIds(
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

function getCanvasLayoutSignature(
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

function getLayoutBounds(layouts: CanvasPageLayout[]): CanvasRect | null {
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

function rectsIntersect(a: CanvasRect, b: CanvasRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

const SNAP_THRESHOLD = 8; // 吸附阈值（px）

interface AlignmentPoint {
  position: number;
  edgeType: "left" | "right" | "center-x" | "top" | "bottom" | "center-y";
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

function computeAlignment(
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

export function PreviewCanvas({
  editable = false,
  interactionMode,
  sessionId,
  projectId,
  pages,
  canvasState: externalState,
  onCanvasStateChange,
  onPageConfigEdit,
  onCanvasClick,
  className,
  editingPageId,
  screenshotUrls,
  screenshotRenderBoxes,
  onConsoleEntry,
  onError,
  focusPageId,
  onPositionableSizes,
  knowledgeDocuments,
  onCreateKnowledgeDocument,
  onUpdateKnowledgeDocument,
  onReadKnowledgeDocument,
}: PreviewCanvasProps) {
  const resolvedInteractionMode = interactionMode ?? (editable ? "editor" : "readonly");
  const isEditorMode = resolvedInteractionMode === "editor";
  const canInteractWithViewport = resolvedInteractionMode !== "readonly";
  const [internalState, setInternalState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: computeInitialCanvasLayout(pages),
    nodes: {},
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
  const [knowledgeDocumentMarkdown, setKnowledgeDocumentMarkdown] = useState<
    Record<string, string>
  >({});
  const [documentSaving, setDocumentSaving] = useState(false);
  const [draggingFileOver, setDraggingFileOver] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  // 工具模式状态
  const [toolMode, setToolMode] = useState<CanvasToolMode>("select");
  const effectiveToolMode: CanvasToolMode = isEditorMode ? toolMode : "hand";

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const recentIframeAccessRef = useRef<Map<string, number>>(new Map());
  const prewarmedResourceFingerprintsRef = useRef<Set<string>>(new Set());
  const initialViewerFitSignatureRef = useRef<string | null>(null);

  const canvasState = externalState || internalState;
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;

  const effectivePages = useMemo(() => {
    const baseLayout = computeInitialCanvasLayout(pages);
    return { ...baseLayout, ...canvasState.pages };
  }, [canvasState.pages, pages]);

  const pageIds = useMemo(() => new Set(pages.map((page) => page.id)), [pages]);

  const effectiveNodes = canvasState.nodes ?? {};
  const knowledgeDocumentsById = useMemo(
    () =>
      new Map(
        (knowledgeDocuments ?? []).map((document) => [document.id, document]),
      ),
    [knowledgeDocuments],
  );

  const selectedPageLayouts = useMemo(
    () =>
      selectedPageIds
        .map((pageId) => effectivePages[pageId])
        .filter((layout): layout is CanvasPageLayout => Boolean(layout)),
    [effectivePages, selectedPageIds],
  );
  const selectedPageBounds = useMemo(
    () => getLayoutBounds(selectedPageLayouts),
    [selectedPageLayouts],
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
    return { ...effectivePages, ...nodeLayouts };
  }, [effectiveNodes, effectivePages]);

  const allItemLayoutSignature = useMemo(
    () => getCanvasLayoutSignature(allItemLayouts),
    [allItemLayouts],
  );

  const updateState = useCallback(
    (updater: (prev: CanvasState) => CanvasState) => {
      const newState = updater(canvasStateRef.current);
      canvasStateRef.current = newState;
      if (externalState) {
        onCanvasStateChange(newState);
      } else {
        setInternalState(newState);
      }
    },
    [externalState, onCanvasStateChange],
  );

  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedPageIds([]);
    onCanvasClick?.();
  }, [onCanvasClick]);

  useEffect(() => {
    setSelectedPageIds((current) =>
      current.filter((pageId) => pageIds.has(pageId)),
    );
  }, [pageIds]);

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
        return;
      }

      const nextSelectedPageIds = pages
        .filter((page) => {
          const layout = effectivePages[page.id];
          if (!layout) return false;
          return rectsIntersect(rect, layout);
        })
        .map((page) => page.id);

      setSelectedNodeId(null);
      setSelectedPageIds(nextSelectedPageIds);
    },
    [effectivePages, effectiveToolMode, isEditorMode, pages],
  );

  const handlePageSelect = useCallback(
    (pageId: string) => {
      if (isEditorMode && effectiveToolMode === "select") {
        setSelectedNodeId(null);
        setSelectedPageIds([pageId]);
      }
      onPageConfigEdit?.(pageId);
    },
    [effectiveToolMode, isEditorMode, onPageConfigEdit],
  );

  const updateSelectedPageLayouts = useCallback(
    (action: MultiPageAlignAction) => {
      if (selectedPageIds.length < 2 || !selectedPageBounds) return;

      updateState((prev) => {
        const selectedLayouts = selectedPageIds
          .map((pageId) => [pageId, effectivePages[pageId]] as const)
          .filter((entry): entry is readonly [string, CanvasPageLayout] =>
            Boolean(entry[1]),
          );
        if (selectedLayouts.length < 2) return prev;

        const nextPages = { ...prev.pages };

        if (action === "distribute-x") {
          if (selectedLayouts.length < 3) return prev;
          const sorted = [...selectedLayouts].sort(
            ([, a], [, b]) => a.x - b.x,
          );
          const totalWidth = sorted.reduce(
            (sum, [, layout]) => sum + layout.width,
            0,
          );
          const gap = (selectedPageBounds.width - totalWidth) / (sorted.length - 1);
          let cursor = selectedPageBounds.x;
          for (const [pageId, layout] of sorted) {
            nextPages[pageId] = { ...layout, x: cursor };
            cursor += layout.width + gap;
          }
          return { ...prev, pages: nextPages };
        }

        if (action === "distribute-y") {
          if (selectedLayouts.length < 3) return prev;
          const sorted = [...selectedLayouts].sort(
            ([, a], [, b]) => a.y - b.y,
          );
          const totalHeight = sorted.reduce(
            (sum, [, layout]) => sum + layout.height,
            0,
          );
          const gap =
            (selectedPageBounds.height - totalHeight) / (sorted.length - 1);
          let cursor = selectedPageBounds.y;
          for (const [pageId, layout] of sorted) {
            nextPages[pageId] = { ...layout, y: cursor };
            cursor += layout.height + gap;
          }
          return { ...prev, pages: nextPages };
        }

        for (const [pageId, layout] of selectedLayouts) {
          if (action === "left") {
            nextPages[pageId] = { ...layout, x: selectedPageBounds.x };
          } else if (action === "center-x") {
            nextPages[pageId] = {
              ...layout,
              x: selectedPageBounds.x + selectedPageBounds.width / 2 - layout.width / 2,
            };
          } else if (action === "right") {
            nextPages[pageId] = {
              ...layout,
              x: selectedPageBounds.x + selectedPageBounds.width - layout.width,
            };
          } else if (action === "top") {
            nextPages[pageId] = { ...layout, y: selectedPageBounds.y };
          } else if (action === "center-y") {
            nextPages[pageId] = {
              ...layout,
              y:
                selectedPageBounds.y +
                selectedPageBounds.height / 2 -
                layout.height / 2,
            };
          } else if (action === "bottom") {
            nextPages[pageId] = {
              ...layout,
              y: selectedPageBounds.y + selectedPageBounds.height - layout.height,
            };
          }
        }

        return { ...prev, pages: nextPages };
      });
    },
    [effectivePages, selectedPageBounds, selectedPageIds, updateState],
  );

  const handleNodeLayoutChange = useCallback(
    (nodeId: string, layout: CanvasPageLayout) => {
      updateState((prev) => {
        const node = prev.nodes?.[nodeId];
        if (!node) return prev;
        return {
          ...prev,
          nodes: {
            ...(prev.nodes ?? {}),
            [nodeId]: { ...node, layout, updatedAt: Date.now() },
          },
        };
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
    [allItemLayouts, canvasState.viewport, containerSize.height, containerSize.width],
  );

  const getCanvasPointFromClient = useCallback(
    (clientX: number, clientY: number): CanvasPoint | undefined => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return undefined;
      }
      const container = containerRef.current;
      if (!container) return undefined;
      const rect = container.getBoundingClientRect();
      const zoom = canvasState.viewport.zoom || 1;
      return {
        x: (clientX - rect.left - canvasState.viewport.x) / zoom,
        y: (clientY - rect.top - canvasState.viewport.y) / zoom,
      };
    },
    [canvasState.viewport],
  );

  const addOrUpdateNode = useCallback(
    (node: CanvasFreeNode) => {
      updateState((prev) => ({
        ...prev,
        nodes: {
          ...(prev.nodes ?? {}),
          [node.id]: node,
        },
      }));
    },
    [updateState],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      updateState((prev) => {
        const nextNodes = { ...(prev.nodes ?? {}) };
        delete nextNodes[nodeId];
        return { ...prev, nodes: nextNodes };
      });
      setSelectedNodeId((current) => (current === nodeId ? null : current));
    },
    [updateState],
  );

  useEffect(() => {
    if (!knowledgeDocuments) return;

    updateState((prev) => {
      const nodes = prev.nodes ?? {};
      const validKnowledgeIds = new Set(knowledgeDocuments.map((item) => item.id));
      const existingKnowledgeIds = new Set<string>();
      const nextNodes = { ...nodes };
      let changed = false;

      for (const [nodeId, node] of Object.entries(nodes)) {
        if (node.kind !== "document" || !node.knowledgeDocument) continue;
        existingKnowledgeIds.add(node.knowledgeDocument.id);
        if (!validKnowledgeIds.has(node.knowledgeDocument.id)) {
          delete nextNodes[nodeId];
          changed = true;
        }
      }

      const maxZ = Math.max(
        0,
        ...Object.values(prev.pages).map((layout) => layout.zIndex ?? 0),
        ...Object.values(nextNodes).map((node) => node.layout.zIndex ?? 0),
      );

      knowledgeDocuments.forEach((document, index) => {
        if (existingKnowledgeIds.has(document.id)) return;
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
    if (!onReadKnowledgeDocument) return;

    const documentsToLoad = Object.values(effectiveNodes)
      .map((node) =>
        node.kind === "document" ? node.knowledgeDocument : undefined,
      )
      .filter((document): document is NonNullable<typeof document> =>
        Boolean(
          document &&
            knowledgeDocumentMarkdown[document.id] === undefined,
        ),
      );

    if (documentsToLoad.length === 0) return;

    let cancelled = false;
    void Promise.all(
      documentsToLoad.map(async (document) => {
        try {
          return {
            id: document.id,
            markdown: await onReadKnowledgeDocument(document),
          };
        } catch {
          return { id: document.id, markdown: "文档内容加载失败" };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setKnowledgeDocumentMarkdown((prev) => {
        const next = { ...prev };
        for (const result of results) {
          next[result.id] = result.markdown;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveNodes, knowledgeDocumentMarkdown, onReadKnowledgeDocument]);

  useEffect(() => {
    if (!isEditorMode || !selectedNodeId || documentDraft) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input,textarea") ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      deleteNode(selectedNodeId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteNode, documentDraft, isEditorMode, selectedNodeId]);

  // 开始拖拽/缩放时，清空辅助线
  const handleDragStart = useCallback(
    (itemId: string) => {
      setActiveDragItemId(itemId);
      setAlignmentGuides([]);
    },
    [],
  );

  // 拖拽/缩放过程中计算对齐
  const handleDragMove = useCallback(
    (itemId: string, layout: CanvasPageLayout, edge?: string) => {
      if (!activeDragItemId || activeDragItemId !== itemId) return;

      const otherLayouts = Object.entries(allItemLayouts)
        .filter(([id]) => id !== itemId)
        .map(([, l]) => l);

      const { layout: alignedLayout, guides } = computeAlignment(
        layout,
        otherLayouts,
        !!edge,
        edge,
      );

      setAlignmentGuides(guides);
      const isPageItem = pageIds.has(itemId);
      updateState((prev) => ({
        ...prev,
        pages: isPageItem
          ? { ...prev.pages, [itemId]: alignedLayout }
          : prev.pages,
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
    [activeDragItemId, allItemLayouts, pageIds, updateState],
  );

  // 结束拖拽/缩放时，清空辅助线
  const handleDragEnd = useCallback(() => {
    setActiveDragItemId(null);
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
        effectivePages,
        canvasState.viewport,
        containerSize.width,
        containerSize.height,
      ),
    [effectivePages, canvasState.viewport, containerSize],
  );

  const pageRenderPlan = useMemo(
    () =>
      computeCanvasRenderModes({
        pages,
        layouts: effectivePages,
        visiblePageIds,
        viewport: canvasState.viewport,
        containerWidth: containerSize.width,
        containerHeight: containerSize.height,
        editingPageId,
        screenshotUrls,
        recentIframeAccess: recentIframeAccessRef.current,
        maxActiveIframes: DEFAULT_MAX_ACTIVE_CANVAS_IFRAMES,
        maxSleepingIframes: DEFAULT_MAX_SLEEPING_CANVAS_IFRAMES,
      }),
    [
      canvasState.viewport,
      containerSize.height,
      containerSize.width,
      editingPageId,
      effectivePages,
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

    const retainedPageIds = new Set([
      ...pageRenderPlan.activePageIds,
      ...pageRenderPlan.sleepingPageIds,
    ]);
    for (const pageId of Array.from(recentIframeAccessRef.current.keys())) {
      if (!retainedPageIds.has(pageId) && !visiblePageIds.has(pageId)) {
        recentIframeAccessRef.current.delete(pageId);
      }
    }
  }, [
    pageRenderPlan.activePageIds,
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
      if (prewarmedResourceFingerprintsRef.current.has(descriptor.fingerprint)) {
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
    const pageLayout = effectivePages[focusPageId];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPageId]);

  const handleFitToScreen = useCallback(() => {
    const viewport = computeFitCanvasViewport(allItemLayouts, {
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
    });
    if (!viewport) return;

    updateState((prev) => ({
      ...prev,
      viewport,
    }));
  }, [allItemLayouts, containerSize, updateState]);

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
      const existingDocument =
        documentDraft.knowledgeDocumentId
          ? knowledgeDocumentsById.get(documentDraft.knowledgeDocumentId) ??
            (existing?.kind === "document" ? existing.knowledgeDocument : undefined)
          : existing?.kind === "document"
            ? existing.knowledgeDocument
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

      addOrUpdateNode({
        id,
        kind: "document",
        title: knowledgeDocument?.title ?? title,
        ...(knowledgeDocument
          ? { knowledgeDocument }
          : { markdown: documentDraft.markdown }),
        layout: existing?.layout ?? getNodeLayout(420, 360),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });

      if (knowledgeDocument) {
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
    async (
      file: File,
      index: number = 0,
      canvasPoint?: CanvasPoint,
    ) => {
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
    },
    [addOrUpdateNode, createNodeId, getNodeLayout],
  );

  const addMarkdownFile = useCallback(
    async (
      file: File,
      index: number = 0,
      canvasPoint?: CanvasPoint,
    ) => {
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
      const layout = getNodeLayout(420, 360, canvasPoint);
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

  const handleEditNode = useCallback((node: CanvasFreeNode) => {
    if (node.kind !== "document") return;

    setDocumentDraft({
      nodeId: node.id,
      knowledgeDocumentId: node.knowledgeDocument?.id,
      title: node.title,
      markdown: node.knowledgeDocument
        ? knowledgeDocumentMarkdown[node.knowledgeDocument.id] ?? node.markdown ?? ""
        : node.markdown ?? "",
    });
  }, [knowledgeDocumentMarkdown]);

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
    (
      files: FileList | File[],
      items: DataTransferItemList | undefined,
    ) => {
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

  const selectionToolbarStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!selectedPageBounds || selectedPageIds.length < 2) return undefined;
    const zoom = canvasState.viewport.zoom || 1;
    return {
      left:
        canvasState.viewport.x +
        (selectedPageBounds.x + selectedPageBounds.width / 2) * zoom,
      top: Math.max(12, canvasState.viewport.y + selectedPageBounds.y * zoom - 48),
      transform: "translateX(-50%)",
    };
  }, [canvasState.viewport, selectedPageBounds, selectedPageIds.length]);

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
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
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
          target.closest("input,textarea") ||
          target.isContentEditable
        ) {
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
                    markdown: "# 文档\n\n在这里记录说明、参考或待办。",
                  })
              : undefined
          }
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
          aria-label="多选对齐工具栏"
          className="absolute z-30 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-lg backdrop-blur"
          style={selectionToolbarStyle}
        >
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
            <BetweenHorizontalStart className="h-4 w-4" />,
            selectedPageIds.length < 3,
          )}
          {renderAlignmentButton(
            "distribute-y",
            "垂直均分",
            <BetweenVerticalStart className="h-4 w-4" />,
            selectedPageIds.length < 3,
          )}
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
          isEditorMode
            ? (nodeId) => {
                setSelectedPageIds([]);
                setSelectedNodeId(nodeId);
              }
            : undefined
        }
        onFitToScreen={handleFitToScreen}
        onToolModeChange={isEditorMode ? setToolMode : undefined}
        alignmentGuides={alignmentGuides}
        toolMode={effectiveToolMode}
        onSelectionRectChange={handleSelectionRectChange}
      >
        {pages.map((page) => {
          const renderMode = pageRenderModes[page.id] ?? "loading";
          return (
            <CanvasPageItem
              key={page.id}
              page={page}
              layout={
                effectivePages[page.id] ||
                (() => {
                  const size = resolveCanvasPageSize(page.previewSize);
                  return { x: 0, y: 0, width: size.width, height: size.height };
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
                shouldUseScreenshotLayer ? screenshotUrls?.[page.id] : undefined
              }
              screenshotRenderBox={
                shouldUseScreenshotLayer
                  ? screenshotRenderBoxes?.[page.id]
                  : undefined
              }
              renderMode={renderMode}
              onLayoutChange={handleLayoutChange}
              onConfigEdit={handlePageSelect}
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
        {Object.values(effectiveNodes).map((node) => {
          const renderedNode =
            node.kind === "document" && node.knowledgeDocument
              ? {
                  ...node,
                  title:
                    knowledgeDocumentsById.get(node.knowledgeDocument.id)?.title ??
                    node.title,
                  knowledgeDocument:
                    knowledgeDocumentsById.get(node.knowledgeDocument.id) ??
                    node.knowledgeDocument,
                  markdown:
                    knowledgeDocumentMarkdown[node.knowledgeDocument.id] ??
                    node.markdown,
                }
              : node;

          return (
          <CanvasFreeNodeItem
            key={node.id}
            node={renderedNode}
            editable={isEditorMode}
            zoom={canvasState.viewport.zoom}
            toolMode={effectiveToolMode}
            selected={selectedNodeId === node.id}
            onLayoutChange={handleNodeLayoutChange}
            onEdit={handleEditNode}
            onSelect={setSelectedNodeId}
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
