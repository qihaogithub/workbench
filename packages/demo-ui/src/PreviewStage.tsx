"use client";

import React, { lazy, Suspense, useEffect, useMemo } from "react";

import { PreviewStageToolbar } from "./PreviewStageToolbar";
import { SinglePagePreview } from "./SinglePagePreview";
import {
  normalizePreviewStagePages,
  resolvePreviewStageSize,
} from "./preview-stage-resolver";
import type { PreviewStageProps } from "./preview-stage-types";
import { cn } from "./utils";

const PreviewCanvas = lazy(() =>
  import("./PreviewCanvas").then(({ PreviewCanvas }) => ({
    default: PreviewCanvas,
  })),
);

export function PreviewStage({
  pages,
  activePageId,
  onActivePageChange,
  previewMode,
  onPreviewModeChange,
  canvasState,
  onCanvasStateChange,
  interactionMode,
  singlePageProps,
  canvasProps,
  showToolbar = true,
  showDefaultPageSelector = false,
  selectorSlot,
  toolbarCenter,
  toolbarTrailing,
  onSinglePagePrevious,
  onSinglePageNext,
  renderSingleContent,
  className,
}: PreviewStageProps) {
  console.count("[perf] PreviewStage render");
  const normalizedPages = useMemo(
    () => normalizePreviewStagePages(pages),
    [pages],
  );
  const orderedPages = useMemo(
    () => [...normalizedPages].sort((left, right) => left.order - right.order),
    [normalizedPages],
  );
  const activePage = normalizedPages.find((page) => page.id === activePageId);

  useEffect(() => {
    if (previewMode !== "single") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableElement(event.target)
      ) {
        return;
      }

      const activePageIndex = orderedPages.findIndex(
        (page) => page.id === activePageId,
      );
      if (event.key === "ArrowLeft") {
        if (onSinglePagePrevious) {
          event.preventDefault();
          onSinglePagePrevious();
        } else if (activePageIndex > 0) {
          event.preventDefault();
          onActivePageChange(orderedPages[activePageIndex - 1].id);
        }
      } else if (event.key === "ArrowRight") {
        if (onSinglePageNext) {
          event.preventDefault();
          onSinglePageNext();
        } else if (activePageIndex >= 0 && activePageIndex < orderedPages.length - 1) {
          event.preventDefault();
          onActivePageChange(orderedPages[activePageIndex + 1].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activePageId,
    orderedPages,
    onActivePageChange,
    onSinglePageNext,
    onSinglePagePrevious,
    previewMode,
  ]);
  const createSingleNavigation = (pageId: string, rect: { x: number; y: number; width: number; height: number }, targetPageId: string) => {
    const timestamp = Date.now();
    const hotspotId = `navigation_hotspot_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
    const connectionId = `navigation_connection_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
    onCanvasStateChange({
      ...canvasState,
      navigation: {
        hotspots: { ...(canvasState.navigation?.hotspots ?? {}), [hotspotId]: { id: hotspotId, pageId, rect, createdAt: timestamp, updatedAt: timestamp } },
        connections: { ...(canvasState.navigation?.connections ?? {}), [connectionId]: { id: connectionId, source: { pageId, hotspotId }, target: { pageId: targetPageId }, createdAt: timestamp, updatedAt: timestamp } },
      },
    });
  };
  const updateSingleNavigationHotspot = (hotspotId: string, rect: { x: number; y: number; width: number; height: number }) => {
    const hotspot = canvasState.navigation?.hotspots[hotspotId];
    if (!hotspot) return;
    onCanvasStateChange({
      ...canvasState,
      navigation: {
        hotspots: { ...canvasState.navigation?.hotspots, [hotspotId]: { ...hotspot, rect, updatedAt: Date.now() } },
        connections: { ...(canvasState.navigation?.connections ?? {}) },
      },
    });
  };
  const updateSingleNavigationTarget = (hotspotId: string, targetPageId: string) => {
    const connection = Object.values(canvasState.navigation?.connections ?? {}).find((item) => item.source.hotspotId === hotspotId);
    if (!connection) return;
    onCanvasStateChange({
      ...canvasState,
      navigation: {
        hotspots: { ...(canvasState.navigation?.hotspots ?? {}) },
        connections: { ...(canvasState.navigation?.connections ?? {}), [connection.id]: { ...connection, target: { pageId: targetPageId }, updatedAt: Date.now() } },
      },
    });
  };
  const deleteSingleNavigationHotspot = (hotspotId: string) => {
    const { [hotspotId]: _removed, ...hotspots } = canvasState.navigation?.hotspots ?? {};
    const connections = Object.fromEntries(Object.entries(canvasState.navigation?.connections ?? {}).filter(([, connection]) => connection.source.hotspotId !== hotspotId));
    onCanvasStateChange({ ...canvasState, navigation: { hotspots, connections } });
  };
  const defaultSingleContent = (
    <SinglePagePreview {...singlePageProps} page={activePage}
      onRequestPasteHtmlContent={
        canvasProps?.onRequestPasteHtmlContent ??
        singlePageProps?.onRequestPasteHtmlContent
      }
      navigationPages={normalizedPages}
      navigationHotspots={activePage ? Object.values(canvasState.navigation?.hotspots ?? {}).filter((hotspot) => hotspot.pageId === activePage.id) : []}
      navigationConnections={Object.values(canvasState.navigation?.connections ?? {})}
      navigationEditable={interactionMode === "editor"}
      onCreateNavigation={createSingleNavigation}
      onUpdateNavigationHotspot={updateSingleNavigationHotspot}
      onUpdateNavigationTarget={updateSingleNavigationTarget}
      onDeleteNavigationHotspot={deleteSingleNavigationHotspot}
    />
  );
  const customSingleContent = renderSingleContent?.({
    activePage,
    resolvedPreviewSize: activePage
      ? resolvePreviewStageSize(activePage)
      : undefined,
    defaultContent: defaultSingleContent,
  });
  const singleContent =
    customSingleContent === undefined
      ? defaultSingleContent
      : customSingleContent;

  return (
    <div
      data-preview-stage
      className={cn("flex h-full min-h-0 flex-col", className)}
    >
      {showToolbar && (
        <PreviewStageToolbar
          pages={normalizedPages}
          activePageId={activePageId}
          onActivePageChange={onActivePageChange}
          previewMode={previewMode}
          showDefaultPageSelector={showDefaultPageSelector}
          selectorSlot={selectorSlot}
          center={toolbarCenter}
          trailing={toolbarTrailing}
        />
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {previewMode === "document" ? (
          singleContent
        ) : previewMode === "canvas" ? (
          <Suspense
            fallback={<div className="h-full w-full" aria-hidden="true" />}
          >
            <PreviewCanvas
              {...canvasProps}
              pages={normalizedPages}
              canvasState={canvasState}
              onCanvasStateChange={onCanvasStateChange}
              interactionMode={interactionMode}
            />
          </Suspense>
        ) : (
          singleContent
        )}
      </div>
    </div>
  );
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}
