"use client";

import React, { useState, useCallback, useMemo } from "react";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem } from "./CanvasPageItem";
import { CanvasToolbar } from "./CanvasToolbar";
import { cn } from "./utils";
import type { PreviewCanvasProps, CanvasState, CanvasPageLayout } from "./types";

const DEFAULT_PAGE_SIZE = { width: 375, height: 812 };

function computeInitialLayout(
  pages: PreviewCanvasProps["pages"],
): Record<string, CanvasPageLayout> {
  const layout: Record<string, CanvasPageLayout> = {};
  const cols = 3;
  const gap = 40;

  pages.forEach((page, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = DEFAULT_PAGE_SIZE.width;
    const h = DEFAULT_PAGE_SIZE.height;

    layout[page.id] = {
      x: col * (w + gap),
      y: row * (h + gap),
      width: w,
      height: h,
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
            layout={effectivePages[page.id] || {
              x: 0,
              y: 0,
              width: DEFAULT_PAGE_SIZE.width,
              height: DEFAULT_PAGE_SIZE.height,
            }}
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
