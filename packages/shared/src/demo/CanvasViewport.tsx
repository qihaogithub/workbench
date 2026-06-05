"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
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
  editable = false,
  onCanvasClick,
  children,
  className,
}: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const viewportStartRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const rafIdRef = useRef(0);
  const pendingViewportRef = useRef<CanvasViewportState | null>(null);
  const [willChangeTransform, setWillChangeTransform] = useState(false);
  const interactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushUpdate = useCallback(() => {
    if (pendingViewportRef.current) {
      onViewportChange(pendingViewportRef.current);
      pendingViewportRef.current = null;
    }
  }, [onViewportChange]);

  const scheduleUpdate = useCallback((newViewport: CanvasViewportState) => {
    pendingViewportRef.current = newViewport;
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(flushUpdate);
  }, [flushUpdate]);

  const markInteracting = useCallback(() => {
    setWillChangeTransform(true);
    if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
  }, []);

  const markInteractingEnd = useCallback(() => {
    interactTimerRef.current = setTimeout(() => {
      setWillChangeTransform(false);
    }, 100);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target === e.currentTarget || (e.target as HTMLElement).closest("[data-canvas-root]")) {
        setIsPanning(true);
        startPosRef.current = { x: e.clientX, y: e.clientY };
        viewportStartRef.current = { x: viewportRef.current.x, y: viewportRef.current.y };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        markInteracting();
      }
    },
    [markInteracting],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      scheduleUpdate({
        x: viewportStartRef.current.x + dx,
        y: viewportStartRef.current.y + dy,
        zoom: viewportRef.current.zoom,
      });
    },
    [isPanning, scheduleUpdate],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      setIsPanning(false);
      markInteractingEnd();
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        onCanvasClick?.();
      }
    },
    [isPanning, onCanvasClick, markInteractingEnd],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!editable) return;
      e.preventDefault();
      markInteracting();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const vp = viewportRef.current;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.min(Math.max(vp.zoom * zoomFactor, MIN_ZOOM), MAX_ZOOM);

      const scale = newZoom / vp.zoom;
      const newX = mouseX - (mouseX - vp.x) * scale;
      const newY = mouseY - (mouseY - vp.y) * scale;

      scheduleUpdate({ x: newX, y: newY, zoom: newZoom });

      markInteractingEnd();
    },
    [editable, scheduleUpdate, markInteracting, markInteractingEnd],
  );

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafIdRef.current);
      if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full h-full overflow-hidden",
        editable && (isPanning ? "cursor-grabbing" : "cursor-grab"),
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
          willChange: willChangeTransform ? "transform" : "auto",
          width: 0,
          height: 0,
          userSelect: "none",
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}
