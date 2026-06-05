"use client";

import React, { useState, useCallback, useRef } from "react";
import { cn } from "./utils";
import { PreviewPanel } from "./PreviewPanel";
import type { CanvasPageLayout, CanvasPageData, ConsoleLogPayload } from "./types";

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

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
  onConfigEdit?: (pageId: string) => void;
  className?: string;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
}

const MIN_SIZE = 100;

const HANDLE_DEFS: Record<
  ResizeHandle,
  { cursor: string; style: React.CSSProperties }
> = {
  nw: { cursor: "nwse-resize", style: { top: -4, left: -4 } },
  n: { cursor: "ns-resize", style: { top: -4, left: "50%", marginLeft: -4 } },
  ne: { cursor: "nesw-resize", style: { top: -4, right: -4 } },
  e: { cursor: "ew-resize", style: { top: "50%", right: -4, marginTop: -4 } },
  se: { cursor: "nwse-resize", style: { bottom: -4, right: -4 } },
  s: { cursor: "ns-resize", style: { bottom: -4, left: "50%", marginLeft: -4 } },
  sw: { cursor: "nesw-resize", style: { bottom: -4, left: -4 } },
  w: { cursor: "ew-resize", style: { top: "50%", left: -4, marginTop: -4 } },
};

function computeResizeLayout(
  layout: CanvasPageLayout,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSize: number,
): CanvasPageLayout {
  const { x: sx, y: sy, width: sw, height: sh } = layout;
  let newWidth = sw;
  let newHeight = sh;
  let newX = sx;
  let newY = sy;

  switch (handle) {
    case "se":
      newWidth = Math.max(minSize, sw + dx);
      newHeight = Math.max(minSize, sh + dy);
      break;
    case "e":
      newWidth = Math.max(minSize, sw + dx);
      break;
    case "s":
      newHeight = Math.max(minSize, sh + dy);
      break;
    case "ne":
      newWidth = Math.max(minSize, sw + dx);
      newHeight = Math.max(minSize, sh - dy);
      newY = sy + (sh - newHeight);
      break;
    case "nw":
      newWidth = Math.max(minSize, sw - dx);
      newHeight = Math.max(minSize, sh - dy);
      newX = sx + (sw - newWidth);
      newY = sy + (sh - newHeight);
      break;
    case "n":
      newHeight = Math.max(minSize, sh - dy);
      newY = sy + (sh - newHeight);
      break;
    case "sw":
      newWidth = Math.max(minSize, sw - dx);
      newHeight = Math.max(minSize, sh + dy);
      newX = sx + (sw - newWidth);
      break;
    case "w":
      newWidth = Math.max(minSize, sw - dx);
      newX = sx + (sw - newWidth);
      break;
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
}: CanvasPageItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeHandle | null>(null);
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

  const canInteract = editable && !isEditing;
  const showHandles = isHovering && canInteract && !isDragging && !isResizing;

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canInteract) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-resize-handle]")) return;
      if (target.closest("button")) return;

      e.stopPropagation();
      e.preventDefault();
      target.setPointerCapture(e.pointerId);

      setIsDragging(true);
      startPosRef.current = { x: e.clientX, y: e.clientY };
      layoutStartRef.current = { ...layoutRef.current };
    },
    [canInteract],
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      e.stopPropagation();
      const s = zoomRef.current || 1;
      const dx = (e.clientX - startPosRef.current.x) / s;
      const dy = (e.clientY - startPosRef.current.y) / s;
      onLayoutChange?.(page.id, {
        ...layoutRef.current,
        x: layoutStartRef.current.x + dx,
        y: layoutStartRef.current.y + dy,
      });
    },
    [isDragging, page.id, onLayoutChange],
  );

  const handleDragPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
    [isDragging],
  );

  const handleLostPointerCapture = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
  }, []);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandle) => {
      if (!canInteract) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      setIsResizing(handle);
      startPosRef.current = { x: e.clientX, y: e.clientY };
      layoutStartRef.current = { ...layoutRef.current };
    },
    [canInteract],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing) return;
      e.stopPropagation();
      const s = zoomRef.current || 1;
      const dx = (e.clientX - startPosRef.current.x) / s;
      const dy = (e.clientY - startPosRef.current.y) / s;
      const newLayout = computeResizeLayout(
        layoutStartRef.current,
        isResizing,
        dx,
        dy,
        MIN_SIZE,
      );
      onLayoutChange?.(page.id, newLayout);
    },
    [isResizing, page.id, onLayoutChange],
  );

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing) return;
      setIsResizing(null);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
    [isResizing],
  );

  const handleConfigClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isEditing) {
        onConfigEdit?.(page.id);
      }
    },
    [isEditing, page.id, onConfigEdit],
  );

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

  const pageContent = (
    <>
      <div
        className="w-full h-full rounded-lg overflow-hidden"
        style={{
          visibility: showIframe ? "visible" : "hidden",
          position: showScreenshotOverlay ? "absolute" : "relative",
          pointerEvents: canInteract ? "none" : undefined,
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

      {showScreenshotOverlay && (
        <div className="absolute inset-0 rounded-lg overflow-hidden shadow-md">
          <img
            src={screenshotUrl}
            alt={page.name}
            className="w-full h-full object-contain pointer-events-none"
            loading="lazy"
            draggable={false}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 rounded-b-lg">
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
      className={cn(
        "absolute transition-shadow duration-200 select-none",
        canInteract && !isResizing && "cursor-move",
        isEditing && "ring-2 ring-blue-500",
      )}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
        cursor: isResizing ? HANDLE_DEFS[isResizing].cursor : undefined,
        zIndex: isEditing ? 10 : layout.zIndex ?? 0,
      }}
      onPointerDown={isResizing ? handleResizePointerMove : handleDragPointerDown}
      onPointerMove={isResizing ? handleResizePointerMove : handleDragPointerMove}
      onPointerUp={isResizing ? handleResizePointerUp : handleDragPointerUp}
      onLostPointerCapture={handleLostPointerCapture}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        if (!isDragging && !isResizing) setIsHovering(false);
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {pageContent}

      {showHandles &&
        (Object.keys(HANDLE_DEFS) as ResizeHandle[]).map((handle) => (
          <div
            key={handle}
            data-resize-handle={handle}
            className="absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-sm opacity-60 hover:opacity-100 hover:scale-125 transition-all z-20"
            style={{
              ...HANDLE_DEFS[handle].style,
              cursor: HANDLE_DEFS[handle].cursor,
            }}
            onPointerDown={(e) => handleResizePointerDown(e, handle)}
          />
        ))}

      {isHovering && !isEditing && !isDragging && onConfigEdit && (
        <button
          type="button"
          className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded shadow transition-opacity"
          onClick={handleConfigClick}
        >
          修改配置
        </button>
      )}

      {isDragging && (
        <div className="absolute inset-0 rounded-lg border-2 border-blue-500 pointer-events-none" />
      )}

      {isResizing && (
        <div className="absolute inset-0 border-2 border-blue-500 rounded-lg pointer-events-none" />
      )}
    </div>
  );
}
