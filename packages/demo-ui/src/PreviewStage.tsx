"use client";

import React, { useEffect, useMemo } from "react";

import { PreviewCanvas } from "./PreviewCanvas";
import { PreviewStageToolbar } from "./PreviewStageToolbar";
import { SinglePagePreview } from "./SinglePagePreview";
import {
  normalizePreviewStagePages,
  resolvePreviewStageSize,
} from "./preview-stage-resolver";
import type { PreviewStageProps } from "./preview-stage-types";
import { cn } from "./utils";

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
  const defaultSingleContent = (
    <SinglePagePreview {...singlePageProps} page={activePage} />
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
          <PreviewCanvas
            {...canvasProps}
            pages={normalizedPages}
            canvasState={canvasState}
            onCanvasStateChange={onCanvasStateChange}
            interactionMode={interactionMode}
          />
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
