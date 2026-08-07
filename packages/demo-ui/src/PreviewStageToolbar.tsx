"use client";

import type { ReactNode } from "react";

import type { PreviewStagePage } from "./preview-stage-types";
import type { PreviewMode } from "./types";
import { cn } from "./utils";

export interface PreviewStageToolbarProps {
  pages: PreviewStagePage[];
  activePageId?: string;
  onActivePageChange: (pageId: string) => void;
  previewMode: PreviewMode;
  onPreviewModeChange?: (mode: PreviewMode) => void;
  showDefaultPageSelector?: boolean;
  selectorSlot?: ReactNode;
  center?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function PreviewStageToolbar({
  pages,
  activePageId,
  onActivePageChange,
  previewMode,
  showDefaultPageSelector = false,
  selectorSlot,
  center,
  trailing,
  className,
}: PreviewStageToolbarProps) {
  const sortedPages = [...pages].sort(
    (left, right) => left.order - right.order,
  );
  const hasActivePage = sortedPages.some(
    (page) => page.id === activePageId,
  );
  const selector =
    selectorSlot !== undefined
      ? selectorSlot
      : showDefaultPageSelector &&
          previewMode === "single" &&
          sortedPages.length > 0
        ? (
            <select
              value={hasActivePage ? activePageId : ""}
              onChange={(event) => onActivePageChange(event.target.value)}
              aria-label="选择预览页面"
              className="h-7 w-44 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {!hasActivePage && (
                <option value="" disabled>
                  请选择页面
                </option>
              )}
              {sortedPages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          )
        : null;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center gap-2 border-b px-3 py-2",
        className,
      )}
    >
      <div className="flex-1" />
      {center && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
          <div className="pointer-events-auto">{center}</div>
        </div>
      )}
      {selector}
      {trailing}
    </div>
  );
}
