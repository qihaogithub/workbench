"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem } from "./CanvasPageItem";
import { CanvasToolbar } from "./CanvasToolbar";
import {
  computeAutoCanvasLayout,
  computeFitCanvasViewport,
  computeInitialCanvasLayout,
  resolveCanvasPageSize,
} from "./canvas-layout";
import { cn } from "./utils";
import type {
  PreviewCanvasProps,
  CanvasState,
  CanvasPageLayout,
  CanvasViewportState,
  AlignmentGuide,
  CanvasToolMode,
} from "./types";

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
  focusPageId,
  onPositionableSizes,
}: PreviewCanvasProps) {
  const [internalState, setInternalState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: computeInitialCanvasLayout(pages),
  });

  // 对齐辅助线状态
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [activeDragPageId, setActiveDragPageId] = useState<string | null>(null);

  // 工具模式状态
  const [toolMode, setToolMode] = useState<CanvasToolMode>("hand");

  const canvasState = externalState || internalState;

  const effectivePages = useMemo(() => {
    const baseLayout = computeInitialCanvasLayout(pages);
    return { ...baseLayout, ...canvasState.pages };
  }, [canvasState.pages, pages]);

  const updateState = useCallback(
    (updater: (prev: CanvasState) => CanvasState) => {
      const newState = updater(canvasState);
      if (externalState) {
        onCanvasStateChange(newState);
      } else {
        setInternalState(newState);
      }
    },
    [canvasState, externalState, onCanvasStateChange],
  );

  const handleCanvasClick = useCallback(() => {
    onCanvasClick?.();
  }, [onCanvasClick]);

  const handleLayoutChange = useCallback(
    (pageId: string, layout: CanvasPageLayout) => {
      updateState((prev) => ({
        ...prev,
        pages: { ...prev.pages, [pageId]: layout },
      }));
    },
    [updateState],
  );

  // 开始拖拽/缩放时，清空辅助线
  const handleDragStart = useCallback(
    (pageId: string) => {
      setActiveDragPageId(pageId);
      setAlignmentGuides([]);
    },
    [],
  );

  // 拖拽/缩放过程中计算对齐
  const handleDragMove = useCallback(
    (pageId: string, layout: CanvasPageLayout, edge?: string) => {
      if (!activeDragPageId || activeDragPageId !== pageId) return;

      // 获取其他页面的布局
      const otherLayouts = Object.entries(effectivePages)
        .filter(([id]) => id !== pageId)
        .map(([, l]) => l);

      const { layout: alignedLayout, guides } = computeAlignment(
        layout,
        otherLayouts,
        !!edge,
        edge,
      );

      setAlignmentGuides(guides);
      updateState((prev) => ({
        ...prev,
        pages: { ...prev.pages, [pageId]: alignedLayout },
      }));
    },
    [activeDragPageId, effectivePages, updateState],
  );

  // 结束拖拽/缩放时，清空辅助线
  const handleDragEnd = useCallback(() => {
    setActiveDragPageId(null);
    setAlignmentGuides([]);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

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
      viewport: { ...prev.viewport, x: cw / 2 - cx * zoom, y: ch / 2 - cy * zoom },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPageId]);

  const handleFitToScreen = useCallback(() => {
    const viewport = computeFitCanvasViewport(effectivePages, {
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
    });
    if (!viewport) return;

    updateState((prev) => ({
      ...prev,
      viewport,
    }));
  }, [effectivePages, containerSize, updateState]);

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

  return (
    <div
      ref={containerRef}
      className={cn("w-full h-full relative overflow-hidden bg-muted/30", className)}
    >
      {editable && (
        <CanvasToolbar
          zoom={canvasState.viewport.zoom}
          onZoomChange={(zoom) =>
            updateState((prev) => ({
              ...prev,
              viewport: { ...prev.viewport, zoom },
            }))
          }
          onReset={() =>
            updateState((prev) => ({
              pages: computeInitialCanvasLayout(pages),
              viewport: { x: 40, y: 40, zoom: 0.5 },
            }))
          }
          onFitToScreen={handleFitToScreen}
          onAutoLayout={handleAutoLayout}
          toolMode={toolMode}
          onToolModeChange={setToolMode}
        />
      )}

      <CanvasViewport
        viewport={canvasState.viewport}
        onViewportChange={(viewport) =>
          updateState((prev) => ({ ...prev, viewport }))
        }
        editable={editable}
        onCanvasClick={handleCanvasClick}
        onPageClick={(pageId) => onPageConfigEdit?.(pageId)}
        onFitToScreen={handleFitToScreen}
        onToolModeChange={setToolMode}
        alignmentGuides={alignmentGuides}
        toolMode={toolMode}
      >
        {pages.map((page) => (
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
            editable={editable}
            isEditing={editingPageId === page.id}
            zoom={canvasState.viewport.zoom}
            visible={visiblePageIds.has(page.id)}
            sessionId={sessionId}
            screenshotUrl={screenshotUrls?.[page.id]}
            screenshotRenderBox={screenshotRenderBoxes?.[page.id]}
            onLayoutChange={handleLayoutChange}
            onConfigEdit={onPageConfigEdit}
            onConsoleEntry={onConsoleEntry}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            toolMode={toolMode}
            onPositionableSizes={onPositionableSizes}
          />
        ))}
      </CanvasViewport>
    </div>
  );
}
