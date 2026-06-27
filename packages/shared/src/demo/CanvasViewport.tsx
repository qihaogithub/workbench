"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "./utils";
import type {
  CanvasViewportState,
  AlignmentGuide,
  CanvasToolMode,
  CanvasInteractionMode,
} from "./types";

interface CanvasSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasPointerPoint {
  x: number;
  y: number;
}

interface CanvasCreationDrag {
  start: CanvasPointerPoint;
  end: CanvasPointerPoint;
}

interface CanvasViewportProps {
  viewport: CanvasViewportState;
  onViewportChange: (viewport: CanvasViewportState) => void;
  editable?: boolean;
  interactionMode?: CanvasInteractionMode;
  onCanvasClick?: () => void;
  onPageClick?: (pageId: string) => void;
  onNodeClick?: (nodeId: string) => void;
  onFitToScreen?: () => void;
  onToolModeChange?: (mode: CanvasToolMode) => void;
  children?: React.ReactNode;
  className?: string;
  alignmentGuides?: AlignmentGuide[];
  toolMode?: CanvasToolMode;
  onSelectionRectChange?: (rect: CanvasSelectionRect) => void;
  creationMode?: Extract<CanvasToolMode, "text" | "arrow" | "draw" | "image"> | null;
  onCanvasPointClick?: (point: CanvasPointerPoint) => void;
  onArrowCreate?: (drag: CanvasCreationDrag) => void;
  drawingMode?: boolean;
  onDrawingStart?: (point: CanvasPointerPoint) => void;
  onDrawingMove?: (point: CanvasPointerPoint) => void;
  onDrawingEnd?: (point: CanvasPointerPoint) => void;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.1;

export function CanvasViewport({
  viewport,
  onViewportChange,
  editable = false,
  interactionMode,
  onCanvasClick,
  onPageClick,
  onNodeClick,
  onFitToScreen,
  onToolModeChange,
  children,
  className,
  alignmentGuides = [],
  toolMode = "hand",
  onSelectionRectChange,
  creationMode,
  onCanvasPointClick,
  onArrowCreate,
  drawingMode = false,
  onDrawingStart,
  onDrawingMove,
  onDrawingEnd,
}: CanvasViewportProps) {
  const resolvedInteractionMode = interactionMode ?? (editable ? "editor" : "readonly");
  const canInteractWithViewport = resolvedInteractionMode !== "readonly";
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const [selectionBox, setSelectionBox] =
    useState<CanvasSelectionRect | null>(null);
  const isSelectingRef = useRef(false);
  const isDrawingRef = useRef(false);
  const isArrowCreatingRef = useRef(false);
  const isPointCreatingRef = useRef(false);
  const creationStartPointRef = useRef<CanvasPointerPoint | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const viewportStartRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const activeCreationMode =
    creationMode ?? (drawingMode ? "draw" : null);
  // 记录 pointerDown 时的目标对象 ID（用于 hand 模式下点击后触发选择）
  const clickedPageIdRef = useRef<string | null>(null);
  const clickedNodeIdRef = useRef<string | null>(null);

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

  const getSelectionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      const startX = startPosRef.current.x - rect.left;
      const startY = startPosRef.current.y - rect.top;
      const screenRect = {
        x: Math.min(startX, screenX),
        y: Math.min(startY, screenY),
        width: Math.abs(screenX - startX),
        height: Math.abs(screenY - startY),
      };
      const zoom = viewportRef.current.zoom || 1;
      return {
        screenRect,
        canvasRect: {
          x: (screenRect.x - viewportRef.current.x) / zoom,
          y: (screenRect.y - viewportRef.current.y) / zoom,
          width: screenRect.width / zoom,
          height: screenRect.height / zoom,
        },
      };
    },
    [],
  );

  const getCanvasPointFromPointer = useCallback(
    (clientX: number, clientY: number): CanvasPointerPoint | null => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const zoom = viewportRef.current.zoom || 1;
      return {
        x: (clientX - rect.left - viewportRef.current.x) / zoom,
        y: (clientY - rect.top - viewportRef.current.y) / zoom,
      };
    },
    [],
  );

  const isBlankCanvasTarget = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        !target.closest("[data-page-id]") &&
        !target.closest("[data-canvas-node-id]")
      );
    },
    [],
  );

  // 键盘快捷键
  useEffect(() => {
    if (!canInteractWithViewport) return;

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
  }, [
    canInteractWithViewport,
    onFitToScreen,
    scheduleUpdate,
    onToolModeChange,
    onCanvasClick,
  ]);

  // capture phase：拦截需要优先处理的平移
  const handlePointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (!canInteractWithViewport) return;
      if (activeCreationMode) return;

      const isPrimaryButton = e.button === 0 || e.button === undefined;
      const isMiddleButton = e.button === 1;
      const isSpaceLeftClick = isPrimaryButton && spaceHeld;
      // hand 模式下，左键点击任何区域都触发平移（包括页面）
      const isHandModeLeftClick = toolMode === "hand" && isPrimaryButton;

      if (isHandModeLeftClick || isSpaceLeftClick || isMiddleButton) {
        // 阻止事件到达 CanvasPageItem，防止其开始拖拽或捕获指针
        e.stopPropagation();

        // 记录点击的页面 ID（用于 pointerUp 时判断是否触发配置面板）
        const target = e.target as HTMLElement;
        const pageEl = target.closest("[data-page-id]");
        const nodeEl = target.closest("[data-canvas-node-id]");
        clickedPageIdRef.current = pageEl ? pageEl.getAttribute("data-page-id") : null;
        clickedNodeIdRef.current = nodeEl
          ? nodeEl.getAttribute("data-canvas-node-id")
          : null;

        isPanningRef.current = true;
        setIsPanning(true);
        startPosRef.current = { x: e.clientX, y: e.clientY };
        viewportStartRef.current = { x: viewportRef.current.x, y: viewportRef.current.y };
        containerRef.current?.setPointerCapture(e.pointerId);
        markInteracting();
      }
    },
    [canInteractWithViewport, activeCreationMode, toolMode, spaceHeld, markInteracting],
  );

  // Bubble phase: select-mode background drag starts marquee selection.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // hand 模式、空格+左键、中键已在 capture phase 处理
      const isPrimaryButton = e.button === 0 || e.button === undefined;
      if (activeCreationMode && isPrimaryButton) {
        if (!isBlankCanvasTarget(e.target)) {
          return;
        }
        const point = getCanvasPointFromPointer(e.clientX, e.clientY);
        if (!point) return;
        e.preventDefault();
        e.stopPropagation();
        clickedPageIdRef.current = null;
        clickedNodeIdRef.current = null;
        creationStartPointRef.current = point;
        containerRef.current?.setPointerCapture(e.pointerId);
        if (activeCreationMode === "draw") {
          isDrawingRef.current = true;
          onDrawingStart?.(point);
        } else if (activeCreationMode === "arrow") {
          isArrowCreatingRef.current = true;
        } else {
          isPointCreatingRef.current = true;
        }
        return;
      }
      if (toolMode === "hand" || e.button === 1 || (isPrimaryButton && spaceHeld)) return;

      // In select mode, pan is handled by Space or middle mouse.
      if (toolMode === "select" && isPrimaryButton) {
        const target = e.target as HTMLElement;
        const isCanvasBackground =
          target === containerRef.current || target === containerRef.current?.firstElementChild;

        if (isCanvasBackground) {
          e.preventDefault();
          clickedPageIdRef.current = null;
          clickedNodeIdRef.current = null;
          isSelectingRef.current = true;
          startPosRef.current = { x: e.clientX, y: e.clientY };
          containerRef.current?.setPointerCapture(e.pointerId);
          setSelectionBox({ x: 0, y: 0, width: 0, height: 0 });
        }
      }
    },
    [
      activeCreationMode,
      getCanvasPointFromPointer,
      isBlankCanvasTarget,
      onDrawingStart,
      toolMode,
      spaceHeld,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDrawingRef.current) {
        const point = getCanvasPointFromPointer(e.clientX, e.clientY);
        if (point) onDrawingMove?.(point);
        return;
      }

      if (isSelectingRef.current) {
        const selection = getSelectionFromPointer(e.clientX, e.clientY);
        if (!selection) return;
        setSelectionBox(selection.screenRect);
        onSelectionRectChange?.(selection.canvasRect);
        return;
      }

      if (!isPanningRef.current) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      scheduleUpdate({
        x: viewportStartRef.current.x + dx,
        y: viewportStartRef.current.y + dy,
        zoom: viewportRef.current.zoom,
      });
    },
    [
      getCanvasPointFromPointer,
      getSelectionFromPointer,
      onDrawingMove,
      onSelectionRectChange,
      scheduleUpdate,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        const point = getCanvasPointFromPointer(e.clientX, e.clientY);
        containerRef.current?.releasePointerCapture(e.pointerId);
        if (point) onDrawingEnd?.(point);
        creationStartPointRef.current = null;
        return;
      }

      if (isArrowCreatingRef.current) {
        isArrowCreatingRef.current = false;
        const start = creationStartPointRef.current;
        const end = getCanvasPointFromPointer(e.clientX, e.clientY);
        containerRef.current?.releasePointerCapture(e.pointerId);
        creationStartPointRef.current = null;
        if (start && end) onArrowCreate?.({ start, end });
        return;
      }

      if (isPointCreatingRef.current) {
        isPointCreatingRef.current = false;
        const point =
          creationStartPointRef.current ??
          getCanvasPointFromPointer(e.clientX, e.clientY);
        containerRef.current?.releasePointerCapture(e.pointerId);
        creationStartPointRef.current = null;
        if (point) onCanvasPointClick?.(point);
        return;
      }

      if (isSelectingRef.current) {
        isSelectingRef.current = false;
        const selection = getSelectionFromPointer(e.clientX, e.clientY);
        const dx = e.clientX - startPosRef.current.x;
        const dy = e.clientY - startPosRef.current.y;
        const isClick = Math.abs(dx) < 3 && Math.abs(dy) < 3;
        setSelectionBox(null);
        containerRef.current?.releasePointerCapture(e.pointerId);
        if (isClick) {
          onCanvasClick?.();
        } else if (selection) {
          onSelectionRectChange?.(selection.canvasRect);
        }
        return;
      }

      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      setIsPanning(false);
      flushUpdate();
      markInteractingEnd();
      containerRef.current?.releasePointerCapture(e.pointerId);
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      const isClick = Math.abs(dx) < 3 && Math.abs(dy) < 3;
      if (isClick) {
        if (clickedPageIdRef.current) {
          // hand 模式下点击页面 → 触发配置面板
          onPageClick?.(clickedPageIdRef.current);
        } else if (clickedNodeIdRef.current) {
          onNodeClick?.(clickedNodeIdRef.current);
        } else {
          // 点击画布空白区域 → 取消选中
          onCanvasClick?.();
        }
      }
      clickedPageIdRef.current = null;
      clickedNodeIdRef.current = null;
    },
    [
      flushUpdate,
      getCanvasPointFromPointer,
      getSelectionFromPointer,
      onCanvasClick,
      onArrowCreate,
      onCanvasPointClick,
      onDrawingEnd,
      onNodeClick,
      onPageClick,
      onSelectionRectChange,
      markInteractingEnd,
    ],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!canInteractWithViewport) return;
      if (toolMode !== "hand" && !e.ctrlKey && !e.metaKey) return;

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
    [
      canInteractWithViewport,
      toolMode,
      scheduleUpdate,
      markInteracting,
      markInteractingEnd,
    ],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafIdRef.current);
      if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
    };
  }, []);

  // 光标样式：hand 模式显示抓手，select 模式默认光标（空格时显示抓手）
  const cursorClass = canInteractWithViewport
    ? activeCreationMode
      ? "cursor-crosshair"
      : toolMode === "hand"
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
      {selectionBox && (selectionBox.width > 1 || selectionBox.height > 1) && (
        <div
          className="pointer-events-none absolute z-40 border border-primary bg-primary/10"
          data-canvas-selection-box="true"
          style={{
            left: selectionBox.x,
            top: selectionBox.y,
            width: selectionBox.width,
            height: selectionBox.height,
          }}
        />
      )}
    </div>
  );
}
