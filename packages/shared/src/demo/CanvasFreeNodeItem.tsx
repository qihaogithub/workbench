"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import MarkdownIt from "markdown-it";
import { Edit3, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "./utils";
import type {
  CanvasArrowNode,
  CanvasDrawingNode,
  CanvasFreeNode,
  CanvasPageLayout,
  CanvasTextNode,
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
  onTextChange?: (nodeId: string, text: string) => void;
  onNodeStyleChange?: (node: CanvasFreeNode) => void;
  onToggleCollapse?: (nodeId: string) => void;
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
const TEXT_NODE_MIN_HEIGHT = 44;

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
  onTextChange,
  onNodeStyleChange,
  onToggleCollapse,
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
    (isHovering || selected) && canInteract && !isDragging && !isResizing;
  const showPropertiesBubble =
    selected &&
    canInteract &&
    !isDragging &&
    !isResizing &&
    (node.kind === "text" || node.kind === "arrow" || node.kind === "drawing");

  const renderedMarkdown = useMemo(() => {
    if (node.kind !== "document") return "";
    return markdownRenderer.render(node.markdown || "文档内容加载中...");
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
      if (target.closest("button,a,textarea,input,label")) return;

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
      {(node.kind === "document" || node.kind === "image") && (
        <div
          className="pointer-events-none absolute left-0 z-30 max-w-full truncate font-medium text-foreground/75 drop-shadow-sm"
          title={node.title}
          style={{ top: -labelTopOffset, fontSize: labelFontSize, lineHeight: 1.2 }}
        >
          {node.title}
        </div>
      )}

      {showPropertiesBubble && (
        <CanvasNodePropertiesBubble
          node={node}
          zoom={safeZoom}
          onTextChange={onTextChange}
          onNodeStyleChange={onNodeStyleChange}
        />
      )}

      <div
        className={cn(
          "absolute inset-0 overflow-hidden rounded-lg border shadow-md",
          (node.kind === "document" || node.kind === "text") && "bg-background",
          node.kind === "arrow" && "border-transparent bg-transparent shadow-none",
          node.kind === "drawing" && "border-transparent bg-transparent shadow-none",
          (selected || isDragging || isResizing) && "ring-2 ring-blue-500",
        )}
      >
        {node.kind === "document" && isHovering && (
          <div className="absolute right-2 top-2 z-30 flex gap-1">
            <button
              type="button"
              className="rounded-md border bg-background/90 p-1.5 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
              title={node.collapsed ? "展开" : "折叠"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.(node.id);
              }}
            >
              {node.collapsed ? (
                <Maximize2 className="h-3.5 w-3.5" />
              ) : (
                <Minimize2 className="h-3.5 w-3.5" />
              )}
            </button>
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

        {node.kind === "document" && node.collapsed && (
          <div className="flex h-full items-center px-4 py-3 text-sm font-medium text-foreground">
            <span className="truncate" title={node.title}>
              {node.title}
            </span>
          </div>
        )}

        {node.kind === "document" && !node.collapsed && (
          <div
            className="markdown-editor-content scrollbar-thin h-full overflow-auto px-4 py-3 text-sm"
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

        {node.kind === "text" && (
          selected && canInteract ? (
            <textarea
              aria-label="编辑文字"
              className="h-full w-full resize-none bg-transparent px-4 py-3 outline-none"
              value={node.text}
              autoFocus
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onTextChange?.(node.id, event.target.value)}
              placeholder="输入文字"
              style={{
                color: node.color,
                backgroundColor: node.backgroundColor,
                fontSize: node.fontSize,
                lineHeight: 1.35,
                minHeight: TEXT_NODE_MIN_HEIGHT,
              }}
            />
          ) : (
            <div
              className="flex h-full w-full items-center overflow-hidden px-4 py-3"
              style={{
                color: node.color,
                backgroundColor: node.backgroundColor,
                fontSize: node.fontSize,
                lineHeight: 1.35,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {node.text || "输入文字"}
            </div>
          )
        )}

        {node.kind === "arrow" && (
          <svg
            className="h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {node.start && node.end ? (
              <>
                <defs>
                  <marker
                    id={`arrow-head-${node.id}`}
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L8,4 L0,8" fill="none" stroke={node.color} strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                </defs>
                <line
                  x1={node.start.x}
                  y1={node.start.y}
                  x2={node.end.x}
                  y2={node.end.y}
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                  markerEnd={`url(#arrow-head-${node.id})`}
                />
              </>
            ) : node.direction === "right" && (
              <>
                <line
                  x1="8"
                  y1="50"
                  x2="86"
                  y2="50"
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                />
                <polyline
                  points="72,34 88,50 72,66"
                  fill="none"
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {!node.start && node.direction === "left" && (
              <>
                <line
                  x1="14"
                  y1="50"
                  x2="92"
                  y2="50"
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                />
                <polyline
                  points="28,34 12,50 28,66"
                  fill="none"
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {!node.start && node.direction === "down" && (
              <>
                <line
                  x1="50"
                  y1="8"
                  x2="50"
                  y2="86"
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                />
                <polyline
                  points="34,72 50,88 66,72"
                  fill="none"
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {!node.start && node.direction === "up" && (
              <>
                <line
                  x1="50"
                  y1="14"
                  x2="50"
                  y2="92"
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                />
                <polyline
                  points="34,28 50,12 66,28"
                  fill="none"
                  stroke={node.color}
                  strokeWidth={node.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
          </svg>
        )}

        {node.kind === "drawing" && (
          <svg
            className="h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={node.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke={node.color}
              strokeWidth={node.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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

function CanvasNodePropertiesBubble({
  node,
  zoom,
  onTextChange,
  onNodeStyleChange,
}: {
  node: CanvasTextNode | CanvasArrowNode | CanvasDrawingNode;
  zoom: number;
  onTextChange?: (nodeId: string, text: string) => void;
  onNodeStyleChange?: (node: CanvasFreeNode) => void;
}) {
  const top = -Math.min(48 / zoom, 88);
  const inputClass =
    "h-7 rounded-md border bg-background px-2 text-xs text-foreground outline-none";

  return (
    <div
      role="toolbar"
      aria-label="标注属性"
      className="absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur"
      style={{ top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        颜色
        <input
          aria-label="标注颜色"
          type="color"
          className="h-7 w-8 cursor-pointer rounded border bg-background p-0.5"
          value={node.color}
          onChange={(event) =>
            onNodeStyleChange?.({ ...node, color: event.target.value })
          }
        />
      </label>

      {node.kind === "text" && (
        <>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            字号
            <input
              aria-label="文字字号"
              type="number"
              min={10}
              max={96}
              className={cn(inputClass, "w-16")}
              value={node.fontSize}
              onChange={(event) =>
                onNodeStyleChange?.({
                  ...node,
                  fontSize: Number(event.target.value) || node.fontSize,
                })
              }
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            背景
            <input
              aria-label="文字背景色"
              type="color"
              className="h-7 w-8 cursor-pointer rounded border bg-background p-0.5"
              value={node.backgroundColor ?? "#ffffff"}
              onChange={(event) =>
                onNodeStyleChange?.({
                  ...node,
                  backgroundColor: event.target.value,
                })
              }
            />
          </label>
          <button
            type="button"
            className="h-7 rounded-md border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onTextChange?.(node.id, "")}
          >
            清空
          </button>
        </>
      )}

      {(node.kind === "arrow" || node.kind === "drawing") && (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          粗细
          <input
            aria-label="线条粗细"
            type="range"
            min={1}
            max={16}
            value={node.strokeWidth}
            onChange={(event) =>
              onNodeStyleChange?.({
                ...node,
                strokeWidth: Number(event.target.value) || node.strokeWidth,
              })
            }
          />
        </label>
      )}
    </div>
  );
}
