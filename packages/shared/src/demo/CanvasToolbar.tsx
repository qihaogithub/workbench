"use client";

import React from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface CanvasToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
}

export function CanvasToolbar({ zoom, onZoomChange, onReset }: CanvasToolbarProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-background/80 backdrop-blur border rounded-lg shadow p-1">
      <button
        type="button"
        onClick={() => onZoomChange(Math.max(zoom / 1.3, 0.05))}
        className="p-1.5 hover:bg-muted rounded"
        title="缩小"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <span className="text-xs min-w-[3.5rem] text-center tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onZoomChange(Math.min(zoom * 1.3, 3))}
        className="p-1.5 hover:bg-muted rounded"
        title="放大"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
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
