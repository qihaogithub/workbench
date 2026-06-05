"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem } from "./CanvasPageItem";
import { CanvasToolbar } from "./CanvasToolbar";
import { cn } from "./utils";
import type { PreviewCanvasProps, CanvasState, CanvasPageLayout, CanvasViewportState } from "./types";

const DEFAULT_PAGE_SIZE = { width: 375, height: 812 };

function resolvePageSize(
  previewSize?: { width?: string | number; height?: string | number },
): { width: number; height: number } {
  const w =
    previewSize?.width != null ? Number(previewSize.width) : DEFAULT_PAGE_SIZE.width;
  const h =
    previewSize?.height != null ? Number(previewSize.height) : DEFAULT_PAGE_SIZE.height;
  return {
    width: Number.isFinite(w) && w > 0 ? w : DEFAULT_PAGE_SIZE.width,
    height: Number.isFinite(h) && h > 0 ? h : DEFAULT_PAGE_SIZE.height,
  };
}

function computeInitialLayout(
  pages: PreviewCanvasProps["pages"],
): Record<string, CanvasPageLayout> {
  const layout: Record<string, CanvasPageLayout> = {};
  const cols = 3;
  const gap = 40;

  let maxColWidth = 0;
  const pageSizes = pages.map((page) => {
    const size = resolvePageSize(page.previewSize);
    if (size.width > maxColWidth) maxColWidth = size.width;
    return size;
  });

  pages.forEach((page, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const size = pageSizes[i];

    layout[page.id] = {
      x: col * (maxColWidth + gap),
      y: row * (DEFAULT_PAGE_SIZE.height + gap),
      width: size.width,
      height: size.height,
      zIndex: i,
    };
  });

  return layout;
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
  onConsoleEntry,
  focusPageId,
}: PreviewCanvasProps) {
  const [internalState, setInternalState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: computeInitialLayout(pages),
  });

  const canvasState = externalState || internalState;

  const effectivePages = useMemo(() => {
    const baseLayout = computeInitialLayout(pages);
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
              pages: computeInitialLayout(pages),
              viewport: { x: 40, y: 40, zoom: 0.5 },
            }))
          }
        />
      )}

      <CanvasViewport
        viewport={canvasState.viewport}
        onViewportChange={(viewport) =>
          updateState((prev) => ({ ...prev, viewport }))
        }
        editable={editable}
        onCanvasClick={handleCanvasClick}
      >
        {pages.map((page) => (
          <CanvasPageItem
            key={page.id}
            page={page}
            layout={
              effectivePages[page.id] ||
              (() => {
                const size = resolvePageSize(page.previewSize);
                return { x: 0, y: 0, width: size.width, height: size.height };
              })()
            }
            editable={editable}
            isEditing={editingPageId === page.id}
            zoom={canvasState.viewport.zoom}
            visible={visiblePageIds.has(page.id)}
            sessionId={sessionId}
            screenshotUrl={screenshotUrls?.[page.id]}
            onLayoutChange={handleLayoutChange}
            onConfigEdit={onPageConfigEdit}
            onConsoleEntry={onConsoleEntry}
          />
        ))}
      </CanvasViewport>
    </div>
  );
}
