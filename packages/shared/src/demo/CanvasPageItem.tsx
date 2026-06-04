"use client";

import React, { useState, useCallback, useRef } from "react";
import { cn } from "./utils";
import { PreviewPanel } from "./PreviewPanel";
import { ThumbnailRenderer } from "./ThumbnailRenderer";
import { ThumbnailPlaceholder } from "./ThumbnailPlaceholder";
import type { CanvasPageLayout, CanvasPageData, ConsoleLogPayload } from "./types";

interface CanvasPageItemProps {
  page: CanvasPageData;
  layout: CanvasPageLayout;
  editable: boolean;
  isEditing?: boolean;
  zoom?: number;
  sessionId?: string;
  onLayoutChange?: (pageId: string, layout: CanvasPageLayout) => void;
  onConfigEdit?: (pageId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  className?: string;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
}

const IFRAME_ZOOM_THRESHOLD = 0.55;

export function CanvasPageItem({
  page,
  layout,
  editable,
  isEditing = false,
  zoom = 0,
  sessionId,
  onLayoutChange,
  onConfigEdit,
  onDragStart,
  onDragEnd,
  onConsoleEntry,
}: CanvasPageItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const layoutStartRef = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!editable || isEditing) return;
      e.stopPropagation();
      setIsDragging(true);
      startPosRef.current = { x: e.clientX, y: e.clientY };
      layoutStartRef.current = { x: layout.x, y: layout.y };
      onDragStart?.();
    },
    [editable, isEditing, layout.x, layout.y, onDragStart],
  );

  const handleDragMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      e.stopPropagation();
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      onLayoutChange?.(page.id, {
        ...layout,
        x: layoutStartRef.current.x + dx,
        y: layoutStartRef.current.y + dy,
      });
    },
    [isDragging, page.id, layout, onLayoutChange],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd?.();
  }, [onDragEnd]);

  const handleConfigClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isEditing) {
        onConfigEdit?.(page.id);
      }
    },
    [isEditing, page.id, onConfigEdit],
  );

  return (
    <div
      className={cn(
        "absolute transition-shadow duration-200",
        editable && !isEditing && "cursor-move",
        isDragging && "shadow-2xl opacity-90",
        isEditing && "ring-2 ring-blue-500",
      )}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
        zIndex: isEditing ? 10 : layout.zIndex ?? 0,
      }}
      onMouseDown={handleDragStart}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={() => {
        handleDragEnd();
        setIsHovering(false);
      }}
      onMouseEnter={() => setIsHovering(true)}
    >
      {isEditing || (zoom >= IFRAME_ZOOM_THRESHOLD && page.code) ? (
        <div className="w-full h-full rounded-lg overflow-hidden shadow-lg">
          <PreviewPanel
            code={page.code}
            sessionId={sessionId}
            demoId={page.id}
            configData={page.configData}
            previewSize={page.previewSize}
            onConsoleEntry={onConsoleEntry}
          />
        </div>
      ) : page.thumbnailMeta ? (
        <div className="relative w-full h-full rounded-lg overflow-hidden shadow-md">
          <ThumbnailRenderer meta={page.thumbnailMeta} className="w-full h-full" />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 rounded-b-lg">
            <span className="text-xs text-white font-medium truncate block">
              {page.name}
            </span>
          </div>
        </div>
      ) : (
        <ThumbnailPlaceholder pageName={page.name} />
      )}

      {isHovering && !isEditing && zoom < IFRAME_ZOOM_THRESHOLD && onConfigEdit && (
        <button
          type="button"
          className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded shadow transition-opacity"
          onClick={handleConfigClick}
        >
          修改配置
        </button>
      )}

      {isDragging && (
        <div className="absolute inset-0 border-2 border-blue-500 rounded-lg pointer-events-none" />
      )}
    </div>
  );
}
