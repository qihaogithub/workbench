"use client";

import React, { useMemo } from "react";

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
  toolbarTrailing,
  renderSingleContent,
  className,
}: PreviewStageProps) {
  console.count("[perf] PreviewStage render");
  const normalizedPages = useMemo(
    () => normalizePreviewStagePages(pages),
    [pages],
  );
  const activePage = normalizedPages.find((page) => page.id === activePageId);
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
          onPreviewModeChange={onPreviewModeChange}
          showDefaultPageSelector={showDefaultPageSelector}
          selectorSlot={selectorSlot}
          trailing={toolbarTrailing}
        />
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {previewMode === "canvas" ? (
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

