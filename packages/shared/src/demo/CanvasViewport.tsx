"use client";

import React, { useState, useRef, useCallback } from "react";
import { cn } from "./utils";
import type { CanvasViewportState } from "./types";

interface CanvasViewportProps {
  viewport: CanvasViewportState;
  onViewportChange: (viewport: CanvasViewportState) => void;
  editable?: boolean;
  onCanvasClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.1;

export function CanvasViewport({
  viewport,
  onViewportChange,
  onCanvasClick,
  children,
  className,
}: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const viewportStartRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target === e.currentTarget || (e.target as HTMLElement).closest("[data-canvas-root]")) {
        setIsPanning(true);
        startPosRef.current = { x: e.clientX, y: e.clientY };
        viewportStartRef.current = { x: viewport.x, y: viewport.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [viewport.x, viewport.y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      onViewportChange({
        ...viewport,
        x: viewportStartRef.current.x + dx,
        y: viewportStartRef.current.y + dy,
      });
    },
    [isPanning, viewport, onViewportChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      setIsPanning(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        onCanvasClick?.();
      }
    },
    [isPanning, onCanvasClick],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.min(Math.max(viewport.zoom * zoomFactor, MIN_ZOOM), MAX_ZOOM);

      const scale = newZoom / viewport.zoom;
      const newX = mouseX - (mouseX - viewport.x) * scale;
      const newY = mouseY - (mouseY - viewport.y) * scale;

      onViewportChange({ x: newX, y: newY, zoom: newZoom });
    },
    [viewport, onViewportChange],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full h-full overflow-hidden",
        isPanning ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      data-canvas-root="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      <div
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          willChange: isPanning ? "transform" : "auto",
          width: 0,
          height: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
