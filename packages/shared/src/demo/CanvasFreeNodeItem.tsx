"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import MarkdownIt from "markdown-it";
import { Edit3 } from "lucide-react";
import { cn } from "./utils";
import type {
  CanvasFreeNode,
  CanvasPageLayout,
  CanvasToolMode,
} from "./types";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface CanvasFreeNodeItemProps {
  node: CanvasFreeNode;
  editable: boolean;
  zoom?: number;
  toolMode?: CanvasToolMode;
  selected?: boolean;
  onLayoutChange?: (nodeId: string, layout: CanvasPageLayout) => void;
  onEdit?: (node: CanvasFreeNode) => void;
  onSelect?: (nodeId: string) => void;
  onDragStart?: (nodeId: string) => void;
  onDragMove?: (nodeId: string, layout: CanvasPageLayout, edge?: string) => void;
  onDragEnd?: () => void;
}

const MIN_WIDTH = 180;
const MIN_HEIGHT = 120;
const MAX_SIZE = 2400;
const EDGE_HIT_SIZE = 8;
const CORNER_HIT_SIZE = 16;
const NODE_LABEL_SCREEN_FONT_SIZE = 12;
const NODE_LABEL_MAX_FONT_SIZE = 24;
const NODE_LABEL_SCREEN_GAP = 8;
const NODE_LABEL_MAX_TOP_OFFSET = 40;

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

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

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

  const inCornerZone =
    (localX < CORNER_HIT_SIZE || localX > width - CORNER_HIT_SIZE) &&
    (localY < CORNER_HIT_SIZE || localY > height - CORNER_HIT_SIZE);

  if (inCornerZone) {
    if (nearTop && nearLeft) return "nw";
    if (nearTop && nearRight) return "ne";
    if (nearBottom && nearLeft) return "sw";
    if (nearBottom && nearRight) return "se";
  }

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
  options?: { aspectRatio?: number },
): CanvasPageLayout {
  if (options?.aspectRatio) {
    return computeAspectRatioResizeLayout(
      layout,
      edge,
      dx,
      dy,
      options.aspectRatio,
    );
  }

  let { x, y, width, height } = layout;

  const clampWidth = (value: number) =>
    Math.min(Math.max(value, MIN_WIDTH), MAX_SIZE);
  const clampHeight = (value: number) =>
    Math.min(Math.max(value, MIN_HEIGHT), MAX_SIZE);

  if (edge.includes("e")) {
    width = clampWidth(layout.width + dx);
  }
  if (edge.includes("w")) {
    width = clampWidth(layout.width - dx);
    x = layout.x + (layout.width - width);
  }
  if (edge.includes("s")) {
    height = clampHeight(layout.height + dy);
  }
  if (edge.includes("n")) {
    height = clampHeight(layout.height - dy);
    y = layout.y + (layout.height - height);
  }

  return { ...layout, x, y, width, height };
}

function computeAspectRatioResizeLayout(
  layout: CanvasPageLayout,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  aspectRatio: number,
): CanvasPageLayout {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return computeResizeLayout(layout, edge, dx, dy);
  }

  const minWidth = Math.max(MIN_WIDTH, MIN_HEIGHT * aspectRatio);
  const maxWidth = Math.min(MAX_SIZE, MAX_SIZE * aspectRatio);
  const clampWidth = (value: number) =>
    Math.min(Math.max(value, minWidth), maxWidth);

  const horizontalWidth = edge.includes("e")
    ? layout.width + dx
    : edge.includes("w")
      ? layout.width - dx
      : undefined;
  const verticalWidth = edge.includes("s")
    ? (layout.height + dy) * aspectRatio
    : edge.includes("n")
      ? (layout.height - dy) * aspectRatio
      : undefined;

  let nextWidth = layout.width;
  if (horizontalWidth !== undefined && verticalWidth !== undefined) {
    const horizontalDelta = Math.abs(horizontalWidth - layout.width);
    const verticalDelta = Math.abs(verticalWidth - layout.width);
    nextWidth =
      horizontalDelta >= verticalDelta ? horizontalWidth : verticalWidth;
  } else if (horizontalWidth !== undefined) {
    nextWidth = horizontalWidth;
  } else if (verticalWidth !== undefined) {
    nextWidth = verticalWidth;
  }

  const width = clampWidth(nextWidth);
  const height = width / aspectRatio;

  let x = layout.x;
  let y = layout.y;

  if (edge.includes("w")) {
    x = layout.x + layout.width - width;
  } else if (!edge.includes("e")) {
    x = layout.x + (layout.width - width) / 2;
  }

  if (edge.includes("n")) {
    y = layout.y + layout.height - height;
  } else if (!edge.includes("s")) {
    y = layout.y + (layout.height - height) / 2;
  }

  return { ...layout, x, y, width, height };
}

export function CanvasFreeNodeItem({
  node,
  editable,
  zoom = 1,
  toolMode = "hand",
  selected = false,
  onLayoutChange,
  onEdit,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: CanvasFreeNodeItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeEdge | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<ResizeEdge | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const layoutStartRef = useRef(node.layout);
  const layoutRef = useRef(node.layout);
  layoutRef.current = node.layout;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const canInteract = editable && toolMode === "select";
  const showEdgeHandles =
    isHovering && canInteract && !isDragging && !isResizing;

  const renderedMarkdown = useMemo(() => {
    if (node.kind !== "document") return "";
    return markdownRenderer.render(node.markdown || "空文档");
  }, [node]);

  const updateEdgeFromPointer = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      if (!canInteract || isDragging || isResizing) {
        setHoveredEdge(null);
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const edge = detectResizeEdge(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      );
      setHoveredEdge(edge);
    },
    [canInteract, isDragging, isResizing],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      startPosRef.current = { x: e.clientX, y: e.clientY };
      onSelect?.(node.id);
      if (!canInteract || e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest("button,a")) return;

      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const edge = detectResizeEdge(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
          rect.height,
        );
        if (edge) {
          e.stopPropagation();
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setIsResizing(edge);
          layoutStartRef.current = { ...layoutRef.current };
          onDragStart?.(node.id);
          return;
        }
      }

      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      layoutStartRef.current = { ...layoutRef.current };
      onDragStart?.(node.id);
    },
    [canInteract, node.id, onDragStart, onSelect],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        e.stopPropagation();
        const scale = zoomRef.current || 1;
        const dx = (e.clientX - startPosRef.current.x) / scale;
        const dy = (e.clientY - startPosRef.current.y) / scale;
        const newLayout = {
          ...layoutStartRef.current,
          x: layoutStartRef.current.x + dx,
          y: layoutStartRef.current.y + dy,
        };
        onLayoutChange?.(node.id, newLayout);
        onDragMove?.(node.id, newLayout);
        return;
      }

      if (isResizing) {
        e.stopPropagation();
        const scale = zoomRef.current || 1;
        const dx = (e.clientX - startPosRef.current.x) / scale;
        const dy = (e.clientY - startPosRef.current.y) / scale;
        const newLayout = computeResizeLayout(
          layoutStartRef.current,
          isResizing,
          dx,
          dy,
          {
            aspectRatio:
              node.kind === "image"
                ? (node.intrinsicWidth ?? layoutStartRef.current.width) /
                  (node.intrinsicHeight ?? layoutStartRef.current.height)
                : undefined,
          },
        );
        onLayoutChange?.(node.id, newLayout);
        onDragMove?.(node.id, newLayout, isResizing);
        return;
      }

      updateEdgeFromPointer(e);
    },
    [isDragging, isResizing, node.id, onDragMove, onLayoutChange, updateEdgeFromPointer],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        setIsDragging(false);
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        onDragEnd?.();
        return;
      }
      if (isResizing) {
        setIsResizing(null);
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        onDragEnd?.();
      }
    },
    [isDragging, isResizing, onDragEnd],
  );

  const activeCursor =
    isResizing && EDGE_CURSORS[isResizing]
      ? EDGE_CURSORS[isResizing]
      : hoveredEdge && EDGE_CURSORS[hoveredEdge]
        ? EDGE_CURSORS[hoveredEdge]
        : canInteract && !isDragging
          ? "move"
          : undefined;

  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const labelFontSize = Math.min(
    NODE_LABEL_SCREEN_FONT_SIZE / safeZoom,
    NODE_LABEL_MAX_FONT_SIZE,
  );
  const labelTopOffset = Math.min(
    (NODE_LABEL_SCREEN_FONT_SIZE + NODE_LABEL_SCREEN_GAP) / safeZoom,
    NODE_LABEL_MAX_TOP_OFFSET,
  );

  return (
    <div
      ref={containerRef}
      data-canvas-node-id={node.id}
      className="absolute select-none"
      style={{
        left: node.layout.x,
        top: node.layout.y,
        width: node.layout.width,
        height: node.layout.height,
        cursor: activeCursor,
        zIndex: node.layout.zIndex ?? 0,
      }}
      onDoubleClick={() => {
        if (node.kind === "document") onEdit?.(node);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onLostPointerCapture={() => {
        setIsDragging(false);
        setIsResizing(null);
        onDragEnd?.();
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        if (!isDragging && !isResizing) {
          setIsHovering(false);
          setHoveredEdge(null);
        }
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <div
        className="absolute left-0 max-w-full truncate font-medium text-muted-foreground pointer-events-none"
        title={node.title}
        style={{ top: -labelTopOffset, fontSize: labelFontSize, lineHeight: 1.2 }}
      >
        {node.title}
      </div>

      <div
        className={cn(
          "absolute inset-0 overflow-hidden rounded-lg border shadow-md",
          node.kind === "document" && "bg-background",
          (selected || isDragging || isResizing) && "ring-2 ring-blue-500",
        )}
      >
        {node.kind === "document" && isHovering && (
          <div className="absolute right-2 top-2 z-30">
            <button
              type="button"
              className="rounded-md border bg-background/90 p-1.5 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
              title="编辑"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(node);
              }}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {node.kind === "document" && (
          <div
            className="markdown-editor-content h-full overflow-auto px-4 py-3 text-sm"
            dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
          />
        )}

        {node.kind === "image" && (
          <div className="flex h-full items-center justify-center">
            <img
              src={node.src}
              alt={node.title}
              className="h-full w-full object-fill"
              draggable={false}
            />
          </div>
        )}
      </div>

      {showEdgeHandles && (
        <>
          <div className="absolute top-0 left-0 right-0 z-20" style={{ height: EDGE_HIT_SIZE, cursor: "ns-resize" }} />
          <div className="absolute bottom-0 left-0 right-0 z-20" style={{ height: EDGE_HIT_SIZE, cursor: "ns-resize" }} />
          <div className="absolute top-0 left-0 bottom-0 z-20" style={{ width: EDGE_HIT_SIZE, cursor: "ew-resize" }} />
          <div className="absolute top-0 right-0 bottom-0 z-20" style={{ width: EDGE_HIT_SIZE, cursor: "ew-resize" }} />
        </>
      )}
    </div>
  );
}
