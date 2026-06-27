"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize,
  Hand,
  MousePointer2,
  LayoutGrid,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "./utils";
import type { CanvasToolMode, CanvasInteractionMode } from "./types";

interface CanvasToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  interactionMode?: Exclude<CanvasInteractionMode, "readonly">;
  onFitToScreen?: () => void;
  onAutoLayout?: () => void;
  onAddDocument?: () => void;
  toolMode?: CanvasToolMode;
  onToolModeChange?: (mode: CanvasToolMode) => void;
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const toolbarButtonClass =
  "flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const compactToolbarButtonClass =
  "flex h-8 min-w-7 cursor-pointer items-center justify-center rounded-md px-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const toolbarToggleButtonClass =
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const activeToolbarButtonClass = "bg-muted text-foreground shadow-sm";
const activeToggleButtonClass = "bg-background text-foreground shadow-sm";

function ToolbarGroup({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center border-l border-border/70 first:border-l-0 first:pl-0 ${
        compact ? "gap-0.5 pl-1.5" : "gap-1 pl-2"
      }`}
    >
      {children}
    </div>
  );
}

function ToolbarTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        <span className="text-xs">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function CanvasToolbar({
  zoom,
  onZoomChange,
  interactionMode = "editor",
  onFitToScreen,
  onAutoLayout,
  onAddDocument,
  toolMode = "hand",
  onToolModeChange,
}: CanvasToolbarProps) {
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isEditorMode = interactionMode === "editor";

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showZoomMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showZoomMenu]);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <TooltipProvider delayDuration={250}>
      <div
        role="toolbar"
        aria-label="画布工具栏"
        className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-background/85 p-1.5 shadow-lg backdrop-blur"
      >
        {onToolModeChange && (
          <ToolbarGroup>
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
              <ToolbarTooltip label="拖动画布和视图">
                <button
                  type="button"
                  onClick={() => onToolModeChange("hand")}
                  className={cn(
                    toolbarToggleButtonClass,
                    toolMode === "hand" && activeToggleButtonClass,
                  )}
                  aria-label="拖动工具"
                  aria-pressed={toolMode === "hand"}
                >
                  <Hand className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
              {isEditorMode && (
                <ToolbarTooltip label="选择、移动和缩放节点">
                  <button
                    type="button"
                    onClick={() => onToolModeChange("select")}
                    className={cn(
                      toolbarToggleButtonClass,
                      toolMode === "select" && activeToggleButtonClass,
                    )}
                    aria-label="选择工具"
                    aria-pressed={toolMode === "select"}
                  >
                    <MousePointer2 className="h-4 w-4" />
                  </button>
                </ToolbarTooltip>
              )}
            </div>
          </ToolbarGroup>
        )}

        {isEditorMode && onAddDocument && (
          <ToolbarGroup>
            <ToolbarTooltip label="添加 Markdown 文档">
              <button
                type="button"
                onClick={onAddDocument}
                className={toolbarButtonClass}
                aria-label="添加文档"
              >
                <FileText className="h-4 w-4" />
              </button>
            </ToolbarTooltip>
          </ToolbarGroup>
        )}

        {(onFitToScreen || onAutoLayout) && (
          <ToolbarGroup>
            {onFitToScreen && (
              <ToolbarTooltip label="适应屏幕">
                <button
                  type="button"
                  onClick={onFitToScreen}
                  className={toolbarButtonClass}
                  aria-label="适应屏幕"
                >
                  <Maximize className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
            )}

            {isEditorMode && onAutoLayout && (
              <ToolbarTooltip label="自动整理画布">
                <button
                  type="button"
                  onClick={onAutoLayout}
                  className={toolbarButtonClass}
                  aria-label="自动排版"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </ToolbarTooltip>
            )}
          </ToolbarGroup>
        )}

        <ToolbarGroup compact>
          <ToolbarTooltip label="缩小">
            <button
              type="button"
              onClick={() => onZoomChange(Math.max(zoom / 1.3, 0.05))}
              className={compactToolbarButtonClass}
              aria-label="缩小"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
          </ToolbarTooltip>

          <div className="relative" ref={menuRef}>
            <ToolbarTooltip label="选择缩放比例">
              <button
                type="button"
                onClick={() => setShowZoomMenu(!showZoomMenu)}
                className={`${compactToolbarButtonClass} min-w-[3.25rem] tabular-nums`}
                aria-label="缩放比例"
                aria-expanded={showZoomMenu}
              >
                {zoomPercent}%
              </button>
            </ToolbarTooltip>

            {showZoomMenu && (
              <div className="absolute bottom-full left-1/2 mb-2 min-w-[5rem] -translate-x-1/2 rounded-lg border bg-popover py-1 shadow-lg">
                {ZOOM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onZoomChange(preset);
                      setShowZoomMenu(false);
                    }}
                    className={`w-full cursor-pointer px-3 py-1 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      Math.round(preset * 100) === zoomPercent
                        ? "font-medium text-blue-500"
                        : ""
                    }`}
                  >
                    {Math.round(preset * 100)}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <ToolbarTooltip label="放大">
            <button
              type="button"
              onClick={() => onZoomChange(Math.min(zoom * 1.3, 3))}
              className={compactToolbarButtonClass}
              aria-label="放大"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </ToolbarTooltip>
        </ToolbarGroup>

      </div>
    </TooltipProvider>
  );
}
