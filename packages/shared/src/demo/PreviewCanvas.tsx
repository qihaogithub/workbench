"use client";

import React, { useState, useCallback, useMemo } from "react";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem } from "./CanvasPageItem";
import { CanvasToolbar } from "./CanvasToolbar";
import { cn } from "./utils";
import type { PreviewCanvasProps, CanvasState, CanvasPageLayout } from "./types";

const DEFAULT_PAGE_SIZE = { width: 375, height: 812 };

function resolvePageSize(previewSize?: { width?: string | number; height?: string | number }): { width: number; height: number } {
  const w = previewSize?.width != null ? Number(previewSize.width) : DEFAULT_PAGE_SIZE.width;
  const h = previewSize?.height != null ? Number(previewSize.height) : DEFAULT_PAGE_SIZE.height;
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

  return (
    <div className={cn("w-full h-full relative overflow-hidden bg-muted/30", className)}>
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
            layout={effectivePages[page.id] || (() => {
              const size = resolvePageSize(page.previewSize);
              return { x: 0, y: 0, width: size.width, height: size.height };
            })()}
            editable={editable}
            isEditing={editingPageId === page.id}
            zoom={canvasState.viewport.zoom}
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
