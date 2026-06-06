"use client";

import React, { useState, useCallback, useRef } from "react";
import { cn } from "./utils";
import { PreviewPanel } from "./PreviewPanel";
import type { CanvasPageLayout, CanvasPageData, ConsoleLogPayload, CanvasToolMode } from "./types";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface CanvasPageItemProps {
  page: CanvasPageData;
  layout: CanvasPageLayout;
  editable: boolean;
  isEditing?: boolean;
  zoom?: number;
  sessionId?: string;
  screenshotUrl?: string;
  screenshotLoading?: boolean;
  visible?: boolean;
  onLayoutChange?: (pageId: string, layout: CanvasPageLayout) => void;
  onConfigEdit?: (pageId: string) => void; // 保留接口，viewer 模式可能需要
  className?: string;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
  // 拖拽/缩放回调（用于对齐辅助线）
  onDragStart?: (pageId: string) => void;
  onDragMove?: (pageId: string, layout: CanvasPageLayout, edge?: string) => void;
  onDragEnd?: () => void;
  // 工具模式
  toolMode?: CanvasToolMode;
}

const MIN_SIZE = 100;
const MAX_SIZE = 2000;
const EDGE_HIT_SIZE = 8; // 边框热区宽度（px）
const CORNER_HIT_SIZE = 16; // 角点判定范围（px）

const EDGE_CURSORS: Record<ResizeEdge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};

// 根据鼠标在页面元素上的位置判断缩放方向
function detectResizeEdge(
  localX: number,
  localY: number,
  width: number,
  height: number,
): ResizeEdge | null {
  const nearLeft = localX < EDGE_HIT_SIZE;
  const nearRight = localX > width - EDGE_HIT_SIZE;
  const nearTop = localY < EDGE_HIT_SIZE;
  const nearBottom = localY > height - EDGE_HIT_SIZE;

  if (!nearLeft && !nearRight && !nearTop && !nearBottom) return null;

  // 角点判定
  const inCornerZone =
    (localX < CORNER_HIT_SIZE || localX > width - CORNER_HIT_SIZE) &&
    (localY < CORNER_HIT_SIZE || localY > height - CORNER_HIT_SIZE);

  if (inCornerZone) {
    if (nearTop && nearLeft) return "nw";
    if (nearTop && nearRight) return "ne";
    if (nearBottom && nearLeft) return "sw";
    if (nearBottom && nearRight) return "se";
  }

  // 边条判定
  if (nearTop) return "n";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  if (nearRight) return "e";

  return null;
}

function computeResizeLayout(
  layout: CanvasPageLayout,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  minSize: number,
  maxSize: number,
  aspectRatio: number,
): CanvasPageLayout {
  const { x: sx, y: sy, width: sw, height: sh } = layout;
  let newWidth = sw;
  let newHeight = sh;
  let newX = sx;
  let newY = sy;

  const clampSize = (v: number) => Math.min(Math.max(v, minSize), maxSize);

  const isNorth = edge === "n" || edge === "nw" || edge === "ne";
  const isSouth = edge === "s" || edge === "sw" || edge === "se";
  const isWest = edge === "w" || edge === "nw" || edge === "sw";
  const isEast = edge === "e" || edge === "ne" || edge === "se";

  if (isEast) {
    newWidth = clampSize(sw + dx);
  }
  if (isWest) {
    newWidth = clampSize(sw - dx);
    newX = sx + (sw - newWidth);
  }
  if (isSouth) {
    newHeight = clampSize(sh + dy);
  }
  if (isNorth) {
    newHeight = clampSize(sh - dy);
    newY = sy + (sh - newHeight);
  }

  // 始终根据设计宽高比保持比例
  // 以变化更大的维度为准，另一维度按比例计算
  if (Math.abs(newWidth - sw) / aspectRatio > Math.abs(newHeight - sh)) {
    newHeight = clampSize(newWidth / aspectRatio);
  } else {
    newWidth = clampSize(newHeight * aspectRatio);
  }

  // 重新校正位置（因为高度/宽度可能因比例调整而变化）
  if (isWest) {
    newX = sx + (sw - newWidth);
  }
  if (isNorth) {
    newY = sy + (sh - newHeight);
  }

  return { x: newX, y: newY, width: newWidth, height: newHeight };
}

export function CanvasPageItem({
  page,
  layout,
  editable,
  isEditing = false,
  zoom = 1,
  sessionId,
  screenshotUrl,
  screenshotLoading: _screenshotLoading,
  visible = true,
  onLayoutChange,
  onConfigEdit,
  onConsoleEntry,
  onDragStart,
  onDragMove,
  onDragEnd,
  toolMode = "hand",
}: CanvasPageItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeEdge | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<ResizeEdge | null>(null);
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  // 截图加载完成后，标记可以卸载 iframe
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const layoutStartRef = useRef<CanvasPageLayout>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const containerRef = useRef<HTMLDivElement>(null);
  // 非交互模式下点击追踪标记
  const isClickTrackingRef = useRef(false);

  // 当 screenshotUrl 变化时重置截图加载状态
  React.useEffect(() => {
    setScreenshotLoaded(false);
  }, [screenshotUrl]);

  const canInteract = editable && !isEditing && toolMode === "select";
  const showEdgeHandles = isHovering && canInteract && !isDragging && !isResizing;

  /**
   * 四种渲染路径：
   * 1. isEditing → 始终渲染 iframe
   * 2. !isEditing && 有截图 && 截图已加载 → 仅渲染 img
   * 3. !isEditing && 有截图 && 截图未加载 → 渲染 iframe(隐藏) + img(加载中)，img onLoad 后卸载 iframe
   * 4. !isEditing && 无截图 → 渲染 iframe
   */
  const shouldRenderIframe = isEditing || !screenshotUrl || !screenshotLoaded;
  const shouldRenderScreenshot = !isEditing && !!screenshotUrl;

  // 根据鼠标位置更新 cursor 和 hoveredEdge
  const updateEdgeFromPointer = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      if (!canInteract || isDragging || isResizing) {
        setHoveredEdge(null);
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const edge = detectResizeEdge(localX, localY, rect.width, rect.height);
      setHoveredEdge(edge);
    },
    [canInteract, isDragging, isResizing],
  );

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 始终记录起始位置，用于点击检测
      startPosRef.current = { x: e.clientX, y: e.clientY };

      if (!canInteract) {
        // 非交互模式：阻止冒泡以防止 CanvasViewport 捕获指针，
        // 这样我们可以在 pointerUp 中检测点击并触发 onConfigEdit
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        e.stopPropagation();
        target.setPointerCapture(e.pointerId);
        isClickTrackingRef.current = true;
        return;
      }
      if (e.button !== 0) return;

      // 如果点在边框热区，启动缩放而非拖拽
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const edge = detectResizeEdge(localX, localY, rect.width, rect.height);
        if (edge) {
          e.stopPropagation();
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setIsResizing(edge);
          startPosRef.current = { x: e.clientX, y: e.clientY };
          layoutStartRef.current = { ...layoutRef.current };
          onDragStart?.(page.id);
          return;
        }
      }

      const target = e.target as HTMLElement;
      if (target.closest("button")) return;

      e.stopPropagation();
      e.preventDefault();
      target.setPointerCapture(e.pointerId);

      setIsDragging(true);
      startPosRef.current = { x: e.clientX, y: e.clientY };
      layoutStartRef.current = { ...layoutRef.current };
      onDragStart?.(page.id);
    },
    [canInteract, page.id, onDragStart],
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        e.stopPropagation();
        const s = zoomRef.current || 1;
        const dx = (e.clientX - startPosRef.current.x) / s;
        const dy = (e.clientY - startPosRef.current.y) / s;
        const newLayout = {
          ...layoutRef.current,
          x: layoutStartRef.current.x + dx,
          y: layoutStartRef.current.y + dy,
        };
        onLayoutChange?.(page.id, newLayout);
        onDragMove?.(page.id, newLayout);
        return;
      }

      if (isResizing) {
        e.stopPropagation();
        const s = zoomRef.current || 1;
        const dx = (e.clientX - startPosRef.current.x) / s;
        const dy = (e.clientY - startPosRef.current.y) / s;
        const designW = page.previewSize?.width != null ? Number(page.previewSize.width) : 375;
        const designH = page.previewSize?.height != null ? Number(page.previewSize.height) : 812;
        const aspectRatio = designW / designH;
        const newLayout = computeResizeLayout(
          layoutStartRef.current,
          isResizing,
          dx,
          dy,
          MIN_SIZE,
          MAX_SIZE,
          aspectRatio,
        );
        onLayoutChange?.(page.id, newLayout);
        onDragMove?.(page.id, newLayout, isResizing);
        return;
      }

      // 非拖拽/缩放时，更新边框热区 hover 状态
      updateEdgeFromPointer(e);
    },
    [isDragging, isResizing, page.id, onLayoutChange, onDragMove, updateEdgeFromPointer],
  );

  const handleDragPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        onDragEnd?.();
        // 拖拽距离很小时视为点击，触发 onConfigEdit
        const dx = e.clientX - startPosRef.current.x;
        const dy = e.clientY - startPosRef.current.y;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
          onConfigEdit?.(page.id);
        }
        return;
      }
      if (isResizing) {
        setIsResizing(null);
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        onDragEnd?.();
        return;
      }
      // 非交互模式下的点击检测
      if (isClickTrackingRef.current) {
        isClickTrackingRef.current = false;
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        const dx = e.clientX - startPosRef.current.x;
        const dy = e.clientY - startPosRef.current.y;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
          onConfigEdit?.(page.id);
        }
      }
    },
    [isDragging, isResizing, onDragEnd, onConfigEdit, page.id],
  );

  const handleLostPointerCapture = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
    isClickTrackingRef.current = false;
    onDragEnd?.();
  }, [onDragEnd]);

  if (!visible) {
    return (
      <div
        style={{
          position: "absolute",
          left: layout.x,
          top: layout.y,
          width: layout.width,
          height: layout.height,
          backgroundColor: "transparent",
          pointerEvents: "none",
        }}
      />
    );
  }

  const showIframe = isEditing || !screenshotUrl;
  const showScreenshotOverlay = !isEditing && !!screenshotUrl;

  // 当前 cursor
  const activeCursor =
    isResizing && EDGE_CURSORS[isResizing]
      ? EDGE_CURSORS[isResizing]
      : hoveredEdge && EDGE_CURSORS[hoveredEdge]
        ? EDGE_CURSORS[hoveredEdge]
        : canInteract && !isDragging
          ? "move"
          : toolMode === "hand" && editable && !isEditing
            ? "default"
            : undefined;

  const pageContent = (
    <>
      {shouldRenderIframe && (
        <div
          className="w-full h-full"
          style={{
            // 过渡期间（截图加载中），iframe 隐藏但仍存在于 DOM
            visibility: showIframe ? "visible" : "hidden",
            position: showScreenshotOverlay ? "absolute" : "relative",
            // hand 模式下禁止 iframe 交互（防止误拖图片），select 模式下也禁止（通过外层容器操作）
            pointerEvents: "none",
          }}
        >
          <PreviewPanel
            code={page.code}
            sessionId={sessionId}
            demoId={page.id}
            configData={page.configData}
            previewSize={page.previewSize}
            fillContainer
            onConsoleEntry={onConsoleEntry}
          />
        </div>
      )}

      {shouldRenderScreenshot && (
        <div className="absolute inset-0 shadow-md flex items-center justify-center bg-black/5 pointer-events-none">
          <img
            src={screenshotUrl}
            alt={page.name}
            className="max-w-full max-h-full object-contain pointer-events-none"
            loading="lazy"
            draggable={false}
            onLoad={() => setScreenshotLoaded(true)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
            <span className="text-xs text-white font-medium truncate block">
              {page.name}
            </span>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute rounded-lg overflow-hidden transition-shadow duration-200 select-none",
        isEditing && "ring-2 ring-blue-500",
      )}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
        cursor: activeCursor,
        zIndex: isEditing ? 10 : layout.zIndex ?? 0,
      }}
      onPointerDown={handleDragPointerDown}
      onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerUp}
      onLostPointerCapture={handleLostPointerCapture}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        if (!isDragging && !isResizing) {
          setIsHovering(false);
          setHoveredEdge(null);
        }
      }}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        if (!editable) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {pageContent}

      {/* 边框热区 — 四条边 */}
      {showEdgeHandles && (
        <>
          {/* 上边 */}
          <div
            data-resize-handle="n"
            className="absolute top-0 left-0 right-0 z-20"
            style={{ height: EDGE_HIT_SIZE, cursor: "ns-resize" }}
          />
          {/* 下边 */}
          <div
            data-resize-handle="s"
            className="absolute bottom-0 left-0 right-0 z-20"
            style={{ height: EDGE_HIT_SIZE, cursor: "ns-resize" }}
          />
          {/* 左边 */}
          <div
            data-resize-handle="w"
            className="absolute top-0 left-0 bottom-0 z-20"
            style={{ width: EDGE_HIT_SIZE, cursor: "ew-resize" }}
          />
          {/* 右边 */}
          <div
            data-resize-handle="e"
            className="absolute top-0 right-0 bottom-0 z-20"
            style={{ width: EDGE_HIT_SIZE, cursor: "ew-resize" }}
          />
        </>
      )}

      {/* 角点视觉指示器 — 四角小方块 */}
      {showEdgeHandles && (
        <>
          <div
            className="absolute w-2 h-2 bg-white border-2 border-blue-500 rounded-sm z-30 opacity-70 hover:opacity-100 hover:scale-150 transition-all"
            style={{ top: -3, left: -3, cursor: "nwse-resize" }}
          />
          <div
            className="absolute w-2 h-2 bg-white border-2 border-blue-500 rounded-sm z-30 opacity-70 hover:opacity-100 hover:scale-150 transition-all"
            style={{ top: -3, right: -3, cursor: "nesw-resize" }}
          />
          <div
            className="absolute w-2 h-2 bg-white border-2 border-blue-500 rounded-sm z-30 opacity-70 hover:opacity-100 hover:scale-150 transition-all"
            style={{ bottom: -3, left: -3, cursor: "nesw-resize" }}
          />
          <div
            className="absolute w-2 h-2 bg-white border-2 border-blue-500 rounded-sm z-30 opacity-70 hover:opacity-100 hover:scale-150 transition-all"
            style={{ bottom: -3, right: -3, cursor: "nwse-resize" }}
          />
        </>
      )}

      {/* 拖拽/缩放时的蓝色边框指示器 */}
      {(isDragging || isResizing) && (
        <div className="absolute inset-0 border-2 border-blue-500 rounded-lg pointer-events-none" />
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          {/* 菜单 */}
          <div
            className="fixed z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[8rem]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted"
              onClick={() => {
                // 重置大小：将页面宽高恢复为设计尺寸
                const defaultSize = page.previewSize
                  ? {
                      width: Number(page.previewSize.width) || 375,
                      height: Number(page.previewSize.height) || 812,
                    }
                  : { width: 375, height: 812 };
                onLayoutChange?.(page.id, {
                  ...layout,
                  width: defaultSize.width,
                  height: defaultSize.height,
                });
                setContextMenu(null);
              }}
            >
              重置大小
            </button>
          </div>
        </>
      )}
    </div>
  );
}
