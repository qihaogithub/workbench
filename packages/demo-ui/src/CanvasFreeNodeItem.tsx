"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ALargeSmall,
  Edit3,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { CanvasDocumentContent } from "./CanvasDocumentContent";
import { CanvasSelectionBox } from "./CanvasSelectionBox";
import { cn } from "./utils";
import type {
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
  editing?: boolean;
  onLayoutChange?: (nodeId: string, layout: CanvasPageLayout) => void;
  onEdit?: (node: CanvasFreeNode) => void;
  onTextChange?: (nodeId: string, text: string) => void;
  onNodeStyleChange?: (node: CanvasFreeNode) => void;
  onTextEditStart?: (nodeId: string) => void;
  onToggleCollapse?: (nodeId: string) => void;
  onActiveDocumentChange?: (nodeId: string, documentId: string) => void;
  onSelect?: (
    nodeId: string,
    event?: React.PointerEvent | React.MouseEvent,
  ) => void;
  onDragStart?: (nodeId: string) => void;
  onDragMove?: (nodeId: string, layout: CanvasPageLayout, edge?: string) => void;
  onDragEnd?: () => void;
}

const MIN_WIDTH = 180;
const MIN_HEIGHT = 120;
const MAX_SIZE = 2400;
const EDGE_HIT_SIZE = 8;
const CORNER_HIT_SIZE = 16;
const TEXT_EDGE_HIT_SIZE = 3;
const TEXT_CORNER_HIT_SIZE = 8;
const NODE_LABEL_SCREEN_FONT_SIZE = 12;
const NODE_LABEL_MAX_FONT_SIZE = 24;
const NODE_LABEL_SCREEN_GAP = 8;
const NODE_LABEL_MAX_TOP_OFFSET = 40;
const TEXT_LINE_HEIGHT = 1.35;
const TEXT_NODE_VERTICAL_PADDING = 0;
const TEXT_NODE_MIN_HEIGHT = 24;
const TEXT_NODE_HORIZONTAL_PADDING = 0;
const TEXT_NODE_MIN_CHAR_COUNT = 1;
const TEXT_NODE_AVERAGE_CHAR_WIDTH_RATIO = 0.56;
const TEXT_NODE_AUTO_WIDTH_PADDING = 2;
const TEXT_PROPERTIES_BUBBLE_SCREEN_GAP = 24;
const TEXT_NODE_MIN_FONT_SIZE = 8;
const TEXT_NODE_MAX_FONT_SIZE = 96;
const TEXT_COLOR_SWATCHES = [
  "#111827",
  "#374151",
  "#4b5563",
  "#6b7280",
  "#9ca3af",
  "#d1d5db",
  "#f9fafb",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
] as const;
const BACKGROUND_COLOR_SWATCHES = [
  "#ffffff",
  "#111827",
  "#374151",
  "#6b7280",
  "#9ca3af",
  "#d1d5db",
  "#f3f4f6",
  "#fee2e2",
  "#ffedd5",
  "#fef3c7",
  "#fef9c3",
  "#dcfce7",
  "#ccfbf1",
  "#dbeafe",
  "#e0e7ff",
  "#fce7f3",
  "#fb7185",
  "#fb923c",
  "#fbbf24",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#818cf8",
  "#e879f9",
] as const;

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

function detectResizeEdge(
  localX: number,
  localY: number,
  width: number,
  height: number,
  edgeHitSize = EDGE_HIT_SIZE,
  cornerHitSize = CORNER_HIT_SIZE,
): ResizeEdge | null {
  const nearLeft = localX < edgeHitSize;
  const nearRight = localX > width - edgeHitSize;
  const nearTop = localY < edgeHitSize;
  const nearBottom = localY > height - edgeHitSize;

  if (!nearLeft && !nearRight && !nearTop && !nearBottom) return null;

  const inCornerZone =
    (localX < cornerHitSize || localX > width - cornerHitSize) &&
    (localY < cornerHitSize || localY > height - cornerHitSize);

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
  options?: { aspectRatio?: number; minWidth?: number; minHeight?: number },
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

  const minWidth = options?.minWidth ?? MIN_WIDTH;
  const minHeight = options?.minHeight ?? MIN_HEIGHT;
  const clampWidth = (value: number) =>
    Math.min(Math.max(value, minWidth), MAX_SIZE);
  const clampHeight = (value: number) =>
    Math.min(Math.max(value, minHeight), MAX_SIZE);

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

function isCornerResize(edge: ResizeEdge): boolean {
  return edge.length === 2;
}

function clampTextScaleFontSize(fontSize: number, scale: number): number {
  const safeFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 18;
  return Math.min(
    Math.max(Math.round(safeFontSize * scale), TEXT_NODE_MIN_FONT_SIZE),
    TEXT_NODE_MAX_FONT_SIZE,
  );
}

function computeTextScaleResize(
  layout: CanvasPageLayout,
  fontSize: number,
  edge: ResizeEdge,
  dx: number,
  dy: number,
): { layout: CanvasPageLayout; fontSize: number } {
  const safeFontSize =
    Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 18;
  const proposedWidth = edge.includes("e") ? layout.width + dx : layout.width - dx;
  const proposedHeight = edge.includes("s") ? layout.height + dy : layout.height - dy;
  const widthScale = proposedWidth / layout.width;
  const heightScale = proposedHeight / layout.height;
  const rawScale =
    Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)
      ? widthScale
      : heightScale;
  const nextFontSize = clampTextScaleFontSize(safeFontSize, rawScale);
  const scale = nextFontSize / safeFontSize;
  const width = Math.min(Math.max(layout.width * scale, safeFontSize * scale), MAX_SIZE);
  const height = Math.min(Math.max(layout.height * scale, TEXT_NODE_MIN_HEIGHT * scale), MAX_SIZE);

  let x = layout.x;
  let y = layout.y;
  if (edge.includes("w")) {
    x = layout.x + layout.width - width;
  }
  if (edge.includes("n")) {
    y = layout.y + layout.height - height;
  }

  return {
    layout: { ...layout, x, y, width, height },
    fontSize: nextFontSize,
  };
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

function estimateTextLineWidthUnits(line: string): number {
  return Array.from(line).reduce((total, char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    if (char === "\t") return total + 2;
    if (char === " ") return total + 0.33;
    if (
      (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xff00 && codePoint <= 0xffef)
    ) {
      return total + 1;
    }
    return total + TEXT_NODE_AVERAGE_CHAR_WIDTH_RATIO;
  }, 0);
}

function estimateTextNodeContentHeight(node: CanvasTextNode, width?: number): number {
  const safeFontSize =
    Number.isFinite(node.fontSize) && node.fontSize > 0 ? node.fontSize : 18;
  const lineHeight = safeFontSize * TEXT_LINE_HEIGHT;
  const safeWidth =
    Number.isFinite(width) && width && width > 0 ? width : node.layout.width;
  const lineCapacity = Math.max(1, safeWidth / safeFontSize);
  const visualLines = (node.text || "")
    .split(/\r?\n/)
    .reduce((total, line) => {
      return total + Math.max(1, Math.ceil(estimateTextLineWidthUnits(line) / lineCapacity));
    }, 0);

  return Math.ceil(
    Math.max(TEXT_NODE_MIN_HEIGHT, visualLines * lineHeight + TEXT_NODE_VERTICAL_PADDING),
  );
}

function estimateTextNodeContentWidth(node: CanvasTextNode): number {
  const safeFontSize =
    Number.isFinite(node.fontSize) && node.fontSize > 0 ? node.fontSize : 18;
  return Math.ceil(
    Math.max(
      safeFontSize * TEXT_NODE_MIN_CHAR_COUNT,
      safeFontSize * TEXT_NODE_AVERAGE_CHAR_WIDTH_RATIO +
        TEXT_NODE_HORIZONTAL_PADDING,
    ),
  );
}

function estimateTextNodeAutoWidth(node: CanvasTextNode, text: string): number {
  const safeFontSize =
    Number.isFinite(node.fontSize) && node.fontSize > 0 ? node.fontSize : 18;
  const longestLineUnits = text
    .split(/\r?\n/)
    .reduce((max, line) => Math.max(max, estimateTextLineWidthUnits(line)), 0);
  return Math.ceil(
    Math.max(
      estimateTextNodeContentWidth(node),
      longestLineUnits * safeFontSize + TEXT_NODE_AUTO_WIDTH_PADDING,
    ),
  );
}

export function CanvasFreeNodeItem({
  node,
  editable,
  zoom = 1,
  toolMode = "hand",
  selected = false,
  editing = false,
  onLayoutChange,
  onEdit,
  onTextChange,
  onNodeStyleChange,
  onTextEditStart,
  onToggleCollapse,
  onActiveDocumentChange,
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
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const layoutStartRef = useRef(node.layout);
  const fontSizeStartRef = useRef(node.kind === "text" ? node.fontSize : 18);
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
    node.kind === "text";

  useEffect(() => {
    if (node.kind !== "text" || !selected || !editing || !canInteract) return;
    const textArea = textAreaRef.current;
    if (!textArea) return;
    const caretPosition = textArea.value.length;
    textArea.focus();
    textArea.setSelectionRange(caretPosition, caretPosition);
  }, [canInteract, editing, node.kind, node.id, node.kind === "text" ? node.text : "", selected]);

  const updateEdgeFromPointer = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      if (!canInteract || isDragging || isResizing) {
        setHoveredEdge(null);
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const edgeHitSize = node.kind === "text" ? TEXT_EDGE_HIT_SIZE : EDGE_HIT_SIZE;
      const cornerHitSize =
        node.kind === "text" ? TEXT_CORNER_HIT_SIZE : CORNER_HIT_SIZE;
      const edge = detectResizeEdge(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
        edgeHitSize,
        cornerHitSize,
      );
      setHoveredEdge(edge);
    },
    [canInteract, isDragging, isResizing, node.kind],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      startPosRef.current = { x: e.clientX, y: e.clientY };
      onSelect?.(node.id, e);
      if (!canInteract || e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest("button,a,textarea,input,label")) return;

      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const edgeHitSize =
          node.kind === "text" ? TEXT_EDGE_HIT_SIZE : EDGE_HIT_SIZE;
        const cornerHitSize =
          node.kind === "text" ? TEXT_CORNER_HIT_SIZE : CORNER_HIT_SIZE;
        const edge = detectResizeEdge(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
          rect.height,
          edgeHitSize,
          cornerHitSize,
        );
        if (edge) {
          e.stopPropagation();
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setIsResizing(edge);
          layoutStartRef.current = { ...layoutRef.current };
          fontSizeStartRef.current = node.kind === "text" ? node.fontSize : 18;
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
        if (node.kind === "text" && isCornerResize(isResizing)) {
          const next = computeTextScaleResize(
            layoutStartRef.current,
            fontSizeStartRef.current,
            isResizing,
            dx,
            dy,
          );
          onNodeStyleChange?.({
            ...node,
            autoWidth: false,
            fontSize: next.fontSize,
            layout: next.layout,
          });
          onDragMove?.(node.id, next.layout, isResizing);
          return;
        }

        let newLayout = computeResizeLayout(
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
            minWidth:
              node.kind === "text" ? estimateTextNodeContentWidth(node) : undefined,
            minHeight: node.kind === "text" ? TEXT_NODE_MIN_HEIGHT : undefined,
          },
        );
        if (node.kind === "text") {
          const minHeight = estimateTextNodeContentHeight(node, newLayout.width);
          if (newLayout.height < minHeight) {
            const heightDelta = minHeight - newLayout.height;
            newLayout = {
              ...newLayout,
              y: isResizing.includes("n") ? newLayout.y - heightDelta : newLayout.y,
              height: minHeight,
            };
          }
        }
        if (node.kind === "text" && node.autoWidth) {
          onNodeStyleChange?.({ ...node, autoWidth: false, layout: newLayout });
        } else {
          onLayoutChange?.(node.id, newLayout);
        }
        onDragMove?.(node.id, newLayout, isResizing);
        return;
      }

      updateEdgeFromPointer(e);
    },
    [
      isDragging,
      isResizing,
      node,
      onDragMove,
      onLayoutChange,
      onNodeStyleChange,
      updateEdgeFromPointer,
    ],
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

  const handleTextAreaChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (node.kind !== "text") return;
      const text = event.target.value;
      onTextChange?.(node.id, text);

      const nextLayout = node.autoWidth
        ? {
            ...node.layout,
            width: estimateTextNodeAutoWidth(node, text),
            height: Math.ceil(node.fontSize * TEXT_LINE_HEIGHT),
          }
        : {
            ...node.layout,
            height: estimateTextNodeContentHeight({ ...node, text }, node.layout.width),
          };
      if (
        nextLayout.width !== node.layout.width ||
        nextLayout.height !== node.layout.height
      ) {
        onLayoutChange?.(node.id, {
          ...nextLayout,
        });
      }
    },
    [node, onLayoutChange, onTextChange],
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
        if (node.kind === "text" && canInteract) onTextEditStart?.(node.id);
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
          onNodeStyleChange={onNodeStyleChange}
        />
      )}

      <div
        className={cn(
          "absolute inset-0 overflow-hidden",
          node.kind !== "text" && "rounded-lg border shadow-md",
          node.kind === "document" && "bg-background",
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
          <CanvasDocumentContent
            node={node}
            onActiveDocumentChange={onActiveDocumentChange}
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
          selected && editing && canInteract ? (
            <textarea
              ref={textAreaRef}
              aria-label="编辑文字"
              className="h-full w-full resize-none bg-transparent p-0 outline-none"
              value={node.text}
              autoFocus
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={handleTextAreaChange}
              style={{
                color: node.color,
                backgroundColor: node.backgroundColor,
                fontSize: node.fontSize,
                lineHeight: TEXT_LINE_HEIGHT,
                minHeight: node.autoWidth
                  ? Math.ceil(node.fontSize * TEXT_LINE_HEIGHT)
                  : estimateTextNodeContentHeight(node, node.layout.width),
                overflow: "hidden",
                whiteSpace: node.autoWidth ? "pre" : "pre-wrap",
              }}
            />
          ) : (
            <div
              className="h-full w-full overflow-hidden p-0"
              style={{
                color: node.color,
                backgroundColor: node.backgroundColor,
                fontSize: node.fontSize,
                lineHeight: TEXT_LINE_HEIGHT,
                whiteSpace: node.autoWidth ? "pre" : "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {node.text}
            </div>
          )
        )}

      </div>

      <CanvasSelectionBox
        visible={selected || isDragging || Boolean(isResizing)}
        handles={canInteract}
      />

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
  onNodeStyleChange,
}: {
  node: CanvasTextNode;
  zoom: number;
  onNodeStyleChange?: (node: CanvasFreeNode) => void;
}) {
  const [colorPanelOpen, setColorPanelOpen] = useState(false);
  const top = -Math.min((48 + TEXT_PROPERTIES_BUBBLE_SCREEN_GAP) / zoom, 120);
  const inputClass =
    "h-8 rounded-md border border-border/70 bg-background px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";
  const iconClass = "h-4 w-4 text-muted-foreground";
  const colorButtonClass =
    "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
  const swatchClass =
    "h-6 w-6 cursor-pointer rounded-md border border-border/70 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

  const renderColorPanel = () => {
    if (!colorPanelOpen) return null;

    const applyTextColor = (color: string) => {
      onNodeStyleChange?.({ ...node, color });
    };
    const applyBackgroundColor = (color: string | undefined) => {
      onNodeStyleChange?.(
        { ...node, backgroundColor: color },
      );
    };

    return (
      <div
        className="absolute bottom-full left-1/2 mb-2 w-72 -translate-x-1/2 rounded-lg border border-border/80 bg-background/98 p-3 shadow-xl backdrop-blur"
        role="dialog"
        aria-label="颜色设置"
      >
        <div className="mb-2 flex items-center gap-2">
          <div className="text-sm font-medium text-foreground">字体颜色</div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            经典
          </span>
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {TEXT_COLOR_SWATCHES.map((color) => (
            <button
              key={`text-${color}`}
              type="button"
              className={cn(
                swatchClass,
                node.color.toLowerCase() === color.toLowerCase() &&
                  "ring-2 ring-blue-500",
              )}
              style={{ backgroundColor: color }}
              title={color}
              aria-label={`字体颜色 ${color}`}
              onClick={() => applyTextColor(color)}
            />
          ))}
        </div>

        <div className="mb-2 mt-4 flex items-center gap-2">
          <div className="text-sm font-medium text-foreground">背景颜色</div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            经典
          </span>
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          <button
            type="button"
            className={cn(
              swatchClass,
              "relative overflow-hidden bg-background",
              node.backgroundColor === undefined && "ring-2 ring-blue-500",
            )}
            title="无背景"
            aria-label="无背景"
            onClick={() => applyBackgroundColor(undefined)}
          >
            <span className="absolute left-1/2 top-0 h-full w-px -rotate-45 bg-border" />
          </button>
          {BACKGROUND_COLOR_SWATCHES.map((color) => (
            <button
              key={`background-${color}`}
              type="button"
              className={cn(
                swatchClass,
                node.backgroundColor?.toLowerCase() === color.toLowerCase() &&
                  "ring-2 ring-blue-500",
              )}
              style={{ backgroundColor: color }}
              title={color}
              aria-label={`背景颜色 ${color}`}
              onClick={() => applyBackgroundColor(color)}
            />
          ))}
        </div>
        <div className="mt-4 border-t border-border/70 pt-3">
          <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1 text-sm text-foreground transition-colors hover:bg-muted">
            <span
              className="h-5 w-5 rounded-full"
              style={{
                background:
                  "conic-gradient(from 90deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444)",
              }}
            />
            <span>更多颜色</span>
            <input
              aria-label="更多字体颜色"
              type="color"
              className="sr-only"
              value={node.color}
              onChange={(event) => applyTextColor(event.target.value)}
            />
          </label>
        </div>
      </div>
    );
  };

  return (
    <div
      role="toolbar"
      aria-label="文字属性"
      className="absolute left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border/80 bg-background/95 p-1.5 shadow-lg backdrop-blur"
      style={{ top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") setColorPanelOpen(false);
      }}
    >
      {node.kind === "text" && (
        <>
          <label
            className="flex h-8 items-center gap-1 rounded-md px-1"
            title="字号"
          >
            <ALargeSmall className={iconClass} />
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
          <button
            aria-label="颜色设置"
            type="button"
            title="颜色设置"
            className={colorButtonClass}
            onClick={() => setColorPanelOpen((current) => !current)}
          >
            <span className="relative h-full w-full overflow-hidden rounded-sm border border-border/60 bg-background">
              <span
                className="absolute inset-0"
                style={{ backgroundColor: node.backgroundColor ?? "transparent" }}
              />
              <span
                className="absolute bottom-0.5 left-1 text-sm font-semibold leading-none"
                style={{ color: node.color }}
              >
                A
              </span>
            </span>
          </button>
        </>
      )}
      {renderColorPanel()}
    </div>
  );
}
