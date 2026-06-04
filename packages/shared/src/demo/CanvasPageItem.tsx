"use client";

import React, { useState, useCallback, useRef } from "react";
import { cn } from "./utils";
import { PreviewPanel } from "./PreviewPanel";
import type { CanvasPageLayout, CanvasPageData } from "./types";

interface CanvasPageItemProps {
  page: CanvasPageData;
  layout: CanvasPageLayout;
  editable: boolean;
  isEditing?: boolean;
  snapshotUrl?: string;
  snapshotVersion?: number;
  sessionId?: string;
  onLayoutChange?: (pageId: string, layout: CanvasPageLayout) => void;
  onConfigEdit?: (pageId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  className?: string;
}

export function CanvasPageItem({
  page,
  layout,
  editable,
  isEditing = false,
  snapshotUrl,
  snapshotVersion,
  sessionId,
  onLayoutChange,
  onConfigEdit,
  onDragStart,
  onDragEnd,
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

  const agentUrl = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "")
    : "";

  const imageSrc = snapshotUrl
    ? `${agentUrl}${snapshotUrl}?v=${snapshotVersion || 0}`
    : undefined;

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
      {isEditing ? (
        <div className="w-full h-full rounded-lg overflow-hidden shadow-lg">
          <PreviewPanel
            code={page.code}
            sessionId={sessionId}
            demoId={page.id}
            configData={page.configData}
            previewSize={page.previewSize}
            snapshotVersion={snapshotVersion}
          />
        </div>
      ) : imageSrc ? (
        <>
          <img
            src={imageSrc}
            alt={page.name}
            className="w-full h-full object-cover rounded-lg shadow-md border border-border/50"
            draggable={false}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 rounded-b-lg">
            <span className="text-xs text-white font-medium truncate block">
              {page.name}
            </span>
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center border border-border/50">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {isHovering && !isEditing && onConfigEdit && (
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
