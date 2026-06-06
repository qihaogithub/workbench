"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "./utils";
import type { CanvasViewportState, AlignmentGuide, CanvasToolMode } from "./types";

interface CanvasViewportProps {
  viewport: CanvasViewportState;
  onViewportChange: (viewport: CanvasViewportState) => void;
  editable?: boolean;
  onCanvasClick?: () => void;
  onFitToScreen?: () => void;
  onToolModeChange?: (mode: CanvasToolMode) => void;
  children?: React.ReactNode;
  className?: string;
  alignmentGuides?: AlignmentGuide[];
  toolMode?: CanvasToolMode;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.1;

export function CanvasViewport({
  viewport,
  onViewportChange,
  editable = false,
  onCanvasClick,
  onFitToScreen,
  onToolModeChange,
  children,
  className,
  alignmentGuides = [],
  toolMode = "hand",
}: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
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

  // 键盘快捷键
  useEffect(() => {
    if (!editable) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Space 键：切换为平移模式
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }

      // H 键：切换到拖动工具
      if (e.key === "h" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        onToolModeChange?.("hand");
      }

      // V 键：切换到选择工具
      if (e.key === "v" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        onToolModeChange?.("select");
      }

      // Ctrl/Cmd + 0：适应屏幕
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        onFitToScreen?.();
      }

      // Ctrl/Cmd + 1：1:1 缩放
      if ((e.ctrlKey || e.metaKey) && e.key === "1") {
        e.preventDefault();
        const vp = viewportRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          const scale = 1 / vp.zoom;
          scheduleUpdate({
            x: cx - (cx - vp.x) * scale,
            y: cy - (cy - vp.y) * scale,
            zoom: 1,
          });
        }
      }

      // Ctrl/Cmd + =：放大
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const vp = viewportRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          const newZoom = Math.min(vp.zoom * ZOOM_STEP, MAX_ZOOM);
          const scale = newZoom / vp.zoom;
          scheduleUpdate({
            x: cx - (cx - vp.x) * scale,
            y: cy - (cy - vp.y) * scale,
            zoom: newZoom,
          });
        }
      }

      // Ctrl/Cmd + -：缩小
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        const vp = viewportRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          const newZoom = Math.max(vp.zoom / ZOOM_STEP, MIN_ZOOM);
          const scale = newZoom / vp.zoom;
          scheduleUpdate({
            x: cx - (cx - vp.x) * scale,
            y: cy - (cy - vp.y) * scale,
            zoom: newZoom,
          });
        }
      }

      // Escape：取消选中页面（触发 onCanvasClick）
      if (e.key === "Escape") {
        onCanvasClick?.();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [editable, onFitToScreen, scheduleUpdate, onToolModeChange, onCanvasClick]);

  // capture phase：在事件到达子元素（CanvasPageItem）之前拦截平移
  const handlePointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (!editable) return;

      const isMiddleButton = e.button === 1;
      const isSpaceLeftClick = e.button === 0 && spaceHeld;
      const isHandModeLeftClick = toolMode === "hand" && e.button === 0;

      if (isHandModeLeftClick || isSpaceLeftClick || isMiddleButton) {
        // 阻止事件到达 CanvasPageItem，防止其开始拖拽
        e.stopPropagation();
        setIsPanning(true);
        startPosRef.current = { x: e.clientX, y: e.clientY };
        viewportStartRef.current = { x: viewportRef.current.x, y: viewportRef.current.y };
        containerRef.current?.setPointerCapture(e.pointerId);
        markInteracting();
      }
    },
    [editable, toolMode, spaceHeld, markInteracting],
  );

  // bubble phase：处理画布空白区域的点击（select 模式下点击空白区域取消选中）
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 平移已在 capture phase 处理，这里只处理 select 模式下点击画布空白区域
      if (toolMode !== "select" || e.button !== 0 || spaceHeld) return;

      // 判断是否点击在画布空白区域（viewport 容器本身或 transform 层，而非页面元素）
      const target = e.target as HTMLElement;
      const isCanvasBackground =
        target === containerRef.current || target === containerRef.current?.firstElementChild;

      if (isCanvasBackground) {
        setIsPanning(true);
        startPosRef.current = { x: e.clientX, y: e.clientY };
        viewportStartRef.current = { x: viewportRef.current.x, y: viewportRef.current.y };
        containerRef.current?.setPointerCapture(e.pointerId);
        markInteracting();
      }
    },
    [toolMode, spaceHeld, markInteracting],
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
      containerRef.current?.releasePointerCapture(e.pointerId);
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

  // 光标样式：hand 模式显示抓手，select 模式默认光标（空格时显示抓手）
  const cursorClass = editable
    ? toolMode === "hand"
      ? isPanning
        ? "cursor-grabbing"
        : "cursor-grab"
      : spaceHeld
        ? isPanning
          ? "cursor-grabbing"
          : "cursor-grab"
        : ""
    : "";

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full h-full overflow-hidden outline-none",
        cursorClass,
        className,
      )}
      data-canvas-root="true"
      tabIndex={0}
      onPointerDownCapture={handlePointerDownCapture}
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

        {/* 对齐辅助线 */}
        {alignmentGuides.map((guide, index) => {
          if (guide.type === "vertical") {
            return (
              <div
                key={`v-${index}`}
                className="absolute pointer-events-none"
                style={{
                  left: guide.position,
                  top: guide.start,
                  width: 1,
                  height: guide.end - guide.start,
                  backgroundColor: "#ef4444",
                  zIndex: 9999,
                }}
              />
            );
          } else {
            return (
              <div
                key={`h-${index}`}
                className="absolute pointer-events-none"
                style={{
                  left: guide.start,
                  top: guide.position,
                  width: guide.end - guide.start,
                  height: 1,
                  backgroundColor: "#ef4444",
                  zIndex: 9999,
                }}
              />
            );
          }
        })}
      </div>
    </div>
  );
}
