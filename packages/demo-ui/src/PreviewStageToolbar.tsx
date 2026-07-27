"use client";

import type { ReactNode } from "react";
import { FileText, Map as MapIcon } from "lucide-react";

import type { PreviewStagePage } from "./preview-stage-types";
import type { PreviewMode } from "./types";
import { cn } from "./utils";

export interface PreviewStageToolbarProps {
  pages: PreviewStagePage[];
  activePageId?: string;
  onActivePageChange: (pageId: string) => void;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  showDefaultPageSelector?: boolean;
  selectorSlot?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function PreviewStageToolbar({
  pages,
  activePageId,
  onActivePageChange,
  previewMode,
  onPreviewModeChange,
  showDefaultPageSelector = false,
  selectorSlot,
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
        "flex shrink-0 items-center gap-2 border-b px-3 py-2",
        className,
      )}
    >
      <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
        <button
          type="button"
          data-preview-mode="single"
          onClick={() => onPreviewModeChange("single")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors",
            previewMode === "single"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          单页
        </button>
        <button
          type="button"
          data-preview-mode="canvas"
          onClick={() => onPreviewModeChange("canvas")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors",
            previewMode === "canvas"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MapIcon className="h-3.5 w-3.5" />
          画布
        </button>
      </div>
      <div className="flex-1" />
      {selector}
      {trailing}
    </div>
  );
}
