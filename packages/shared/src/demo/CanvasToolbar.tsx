"use client";

import React, { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Maximize, Hand, MousePointer2 } from "lucide-react";
import type { CanvasToolMode } from "./types";

interface CanvasToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
  onFitToScreen?: () => void;
  toolMode?: CanvasToolMode;
  onToolModeChange?: (mode: CanvasToolMode) => void;
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export function CanvasToolbar({ zoom, onZoomChange, onReset, onFitToScreen, toolMode = "hand", onToolModeChange }: CanvasToolbarProps) {
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-background/80 backdrop-blur border rounded-lg shadow p-1">
      {/* 工具模式切换 */}
      {onToolModeChange && (
        <>
          <button
            type="button"
            onClick={() => onToolModeChange("hand")}
            className={`p-1.5 rounded ${toolMode === "hand" ? "bg-muted" : "hover:bg-muted"}`}
            title="拖动工具 (H)"
          >
            <Hand className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onToolModeChange("select")}
            className={`p-1.5 rounded ${toolMode === "select" ? "bg-muted" : "hover:bg-muted"}`}
            title="选择工具 (V)"
          >
            <MousePointer2 className="h-4 w-4" />
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
        </>
      )}

      {/* 适应屏幕 */}
      {onFitToScreen && (
        <button
          type="button"
          onClick={onFitToScreen}
          className="p-1.5 hover:bg-muted rounded"
          title="适应屏幕"
        >
          <Maximize className="h-4 w-4" />
        </button>
      )}

      {/* 缩小 */}
      <button
        type="button"
        onClick={() => onZoomChange(Math.max(zoom / 1.3, 0.05))}
        className="p-1.5 hover:bg-muted rounded"
        title="缩小"
      >
        <ZoomOut className="h-4 w-4" />
      </button>

      {/* 缩放百分比（可点击弹出预设菜单） */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowZoomMenu(!showZoomMenu)}
          className="text-xs min-w-[3.5rem] text-center tabular-nums px-1 py-0.5 hover:bg-muted rounded"
          title="缩放比例"
        >
          {zoomPercent}%
        </button>

        {showZoomMenu && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border rounded-lg shadow-lg py-1 min-w-[5rem]">
            {ZOOM_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  onZoomChange(preset);
                  setShowZoomMenu(false);
                }}
                className={`w-full px-3 py-1 text-xs text-left hover:bg-muted ${
                  Math.round(preset * 100) === zoomPercent
                    ? "text-blue-500 font-medium"
                    : ""
                }`}
              >
                {Math.round(preset * 100)}%
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 放大 */}
      <button
        type="button"
        onClick={() => onZoomChange(Math.min(zoom * 1.3, 3))}
        className="p-1.5 hover:bg-muted rounded"
        title="放大"
      >
        <ZoomIn className="h-4 w-4" />
      </button>

      {/* 1:1 */}
      <button
        type="button"
        onClick={() => onZoomChange(1)}
        className="p-1.5 hover:bg-muted rounded text-xs font-medium"
        title="1:1 缩放"
      >
        1:1
      </button>

      {/* 重置布局 */}
      <button
        type="button"
        onClick={onReset}
        className="p-1.5 hover:bg-muted rounded ml-1"
        title="重置布局"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}
