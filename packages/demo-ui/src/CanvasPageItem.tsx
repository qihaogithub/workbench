"use client";

import React, { useState, useCallback, useRef } from "react";
import { Trash2 } from "lucide-react";
import { CanvasSelectionBox } from "./CanvasSelectionBox";
import {
  getCanvasPreviewSizeKey,
  resolveCanvasContentHeightLayout,
} from "./canvas-layout";
import { cn } from "./utils";
import { PreviewPanel } from "./PreviewPanel";
import { PrototypePagePreview } from "./PrototypePagePreview";
import { SketchPagePreview } from "./SketchPagePreview";
import { IframePreviewFrame } from "./IframePreviewFrame";
import type {
  CanvasPageLayout,
  CanvasPageData,
  CanvasPageRuntimeType,
  ConsoleLogPayload,
  CanvasToolMode,
  CanvasPageRenderMode,
  PositionableSizeItem,
  ScreenshotRenderBox,
} from "./types";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface CanvasPageItemProps {
  page: CanvasPageData;
  layout: CanvasPageLayout;
  editable: boolean;
  isEditing?: boolean;
  zoom?: number;
  sessionId?: string;
  screenshotUrl?: string;
  screenshotRenderBox?: ScreenshotRenderBox;
  renderMode?: CanvasPageRenderMode;
  visible?: boolean;
  selected?: boolean;
  onLayoutChange?: (pageId: string, layout: CanvasPageLayout) => void;
  onConfigEdit?: (pageId: string, event?: React.PointerEvent) => void; // 保留接口，viewer 模式可能需要
  onRuntimeConversionRequest?: (
    pageId: string,
    targetRuntimeType: CanvasPageRuntimeType,
  ) => void;
  onRequestDelete?: (pageId: string) => void;
  className?: string;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
  onError?: (error: Error) => void;
  // 拖拽/缩放回调（用于对齐辅助线）
  onDragStart?: (pageId: string) => void;
  onDragMove?: (
    pageId: string,
    layout: CanvasPageLayout,
    edge?: string,
  ) => void;
  onDragEnd?: () => void;
  // 工具模式
  toolMode?: CanvasToolMode;
  onPositionableSizes?: (sizes: Record<string, PositionableSizeItem>) => void;
}

interface CanvasPagePreviewContentProps {
  page: CanvasPageData;
  layout: CanvasPageLayout;
  sessionId?: string;
  screenshotUrl?: string;
  screenshotRenderBox?: ScreenshotRenderBox;
  renderMode?: CanvasPageRenderMode;
  onLayoutChange?: (pageId: string, layout: CanvasPageLayout) => void;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
  onError?: (error: Error) => void;
  onPositionableSizes?: (sizes: Record<string, PositionableSizeItem>) => void;
}

const MIN_SIZE = 100;
const MAX_SIZE = 2000;
const EDGE_HIT_SIZE = 8; // 边框热区宽度（px）
const CORNER_HIT_SIZE = 16; // 角点判定范围（px）
const PAGE_LABEL_SCREEN_FONT_SIZE = 12;
const PAGE_LABEL_MAX_FONT_SIZE = 24;
const PAGE_LABEL_SCREEN_GAP = 8;
const PAGE_LABEL_MAX_TOP_OFFSET = 40;

function parsePreviewSizeValue(
  value: string | number | undefined,
  fallback: number,
): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/px$/, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

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

function isResizeEdge(value: string | null | undefined): value is ResizeEdge {
  return (
    value === "n" ||
    value === "s" ||
    value === "e" ||
    value === "w" ||
    value === "ne" ||
    value === "nw" ||
    value === "se" ||
    value === "sw"
  );
}

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

export function CanvasPagePreviewContent({
  page,
  layout,
  sessionId,
  screenshotUrl,
  screenshotRenderBox,
  renderMode = "iframe",
  onLayoutChange,
  onConsoleEntry,
  onError,
  onPositionableSizes,
}: CanvasPagePreviewContentProps) {
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const [iframeContentLoaded, setIframeContentLoaded] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const handleContentHeightChange = useCallback(
    (newContentHeight: number, measuredWidth?: number) => {
      const designHeight = parsePreviewSizeValue(page.previewSize?.height, 812);

      if (newContentHeight <= designHeight) {
        if (contentHeight !== null) setContentHeight(null);
        return;
      }

      setContentHeight(newContentHeight);
      const currentLayout = layoutRef.current;
      const nextLayout = resolveCanvasContentHeightLayout(
        page,
        currentLayout,
        newContentHeight,
        measuredWidth,
      );

      if (nextLayout) onLayoutChange?.(page.id, nextLayout);
    },
    [page, onLayoutChange, contentHeight],
  );

  const handleScreenshotLoad = useCallback(() => {
    setScreenshotLoaded(true);
  }, []);

  const handleIframeContentLoaded = useCallback(() => {
    setIframeContentLoaded(true);
  }, []);

  const designHeight = parsePreviewSizeValue(page.previewSize?.height, 812);
  const designWidth = parsePreviewSizeValue(page.previewSize?.width, 375);
  const layoutScale = layout.width / designWidth;
  const layoutDerivedContentHeight =
    Number.isFinite(layoutScale) && layoutScale > 0
      ? layout.height / layoutScale
      : designHeight;
  const effectiveHeight = Math.max(
    contentHeight ?? 0,
    layoutDerivedContentHeight,
  );
  const iframeEffectiveHeight =
    effectiveHeight > designHeight + 1 ? effectiveHeight : undefined;

  React.useEffect(() => {
    setScreenshotLoaded(false);
  }, [screenshotUrl]);

  React.useEffect(() => {
    setIframeContentLoaded(false);
  }, [renderMode, page.code, page.compiledJsUrl, page.iframeUrl, page.configData]);

  React.useEffect(() => {
    if (!screenshotRenderBox) return;
    handleContentHeightChange(
      screenshotRenderBox.height,
      screenshotRenderBox.width,
    );
  }, [screenshotRenderBox, handleContentHeightChange]);

  React.useEffect(() => {
    setContentHeight(null);
  }, [page.previewSize]);

  const shouldRenderIframe =
    renderMode === "iframe" || renderMode === "sleeping-iframe";
  const shouldRenderPrototype =
    renderMode === "prototype" && page.runtimeType === "prototype-html-css";
  const shouldRenderSketch =
    renderMode === "prototype" && page.runtimeType === "sketch-scene";
  const shouldRenderScreenshot =
    !!screenshotUrl &&
    (renderMode === "screenshot" ||
      renderMode === "iframe" ||
      renderMode === "sleeping-iframe");
  const shouldRenderLoading =
    renderMode === "loading" ||
    (renderMode === "sleeping-iframe" && !screenshotUrl);
  const keepScreenshotVisible =
    shouldRenderScreenshot &&
    (renderMode === "screenshot" ||
      renderMode === "sleeping-iframe" ||
      !iframeContentLoaded ||
      !screenshotLoaded);
  const showIframeContent =
    renderMode === "iframe" && (!screenshotUrl || iframeContentLoaded);

  return (
    <>
      {shouldRenderPrototype && (
        <div className="absolute inset-0 h-full w-full overflow-hidden bg-white shadow-md pointer-events-none">
          <PrototypePagePreview
            html={page.prototypeHtml}
            css={page.prototypeCss}
            configData={page.configData}
            sessionId={sessionId}
            demoId={page.id}
            previewSize={page.previewSize}
            fillContainer
            effectiveHeight={iframeEffectiveHeight}
          />
        </div>
      )}

      {shouldRenderSketch && (
        <div className="absolute inset-0 h-full w-full overflow-hidden bg-white shadow-md pointer-events-none">
          <SketchPagePreview
            scene={page.sketchScene}
            configData={page.configData}
            previewSize={page.previewSize}
            fillContainer
          />
        </div>
      )}

      {shouldRenderIframe && page.iframeUrl && (
        <div
          className="absolute inset-0 h-full w-full overflow-hidden bg-white shadow-md transition-opacity duration-200 ease-out"
          style={{
            opacity: showIframeContent ? 1 : 0,
            pointerEvents: "none",
          }}
        >
          <IframePreviewFrame
            title={page.name}
            src={page.iframeUrl}
            previewSize={page.previewSize}
            fillContainer
            sandbox="allow-scripts"
            onLoad={handleIframeContentLoaded}
          />
        </div>
      )}

      {shouldRenderIframe && !page.iframeUrl && (
        <div
          className="absolute inset-0 h-full w-full transition-opacity duration-200 ease-out"
          style={{
            opacity: showIframeContent ? 1 : 0,
            pointerEvents: "none",
          }}
        >
          <PreviewPanel
            code={page.code}
            compiledJsUrl={page.compiledJsUrl}
            sessionId={sessionId}
            demoId={page.id}
            configData={page.configData}
            previewSize={page.previewSize}
            fillContainer
            onConsoleEntry={onConsoleEntry}
            onError={onError}
            onContentHeightChange={handleContentHeightChange}
            onContentLoaded={handleIframeContentLoaded}
            activityState={
              renderMode === "sleeping-iframe" ? "sleeping" : "active"
            }
            effectiveHeight={iframeEffectiveHeight}
            onPositionableSizes={onPositionableSizes}
          />
        </div>
      )}

      {shouldRenderScreenshot && (
        <div
          className="absolute inset-0 shadow-md overflow-hidden bg-white pointer-events-none transition-opacity duration-200 ease-out"
          style={{ opacity: keepScreenshotVisible ? 1 : 0 }}
        >
          <img
            src={screenshotUrl}
            alt={page.name}
            className="block h-full w-full object-contain pointer-events-none"
            loading="lazy"
            draggable={false}
            onLoad={handleScreenshotLoad}
          />
        </div>
      )}

      {shouldRenderLoading && (
        <div className="absolute inset-0 shadow-md overflow-hidden bg-white pointer-events-none">
          <div className="flex h-full w-full items-center justify-center bg-muted/35">
            <div
              role="status"
              aria-label="页面预览加载中"
              className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/25 border-b-muted-foreground"
            />
          </div>
        </div>
      )}
    </>
  );
}

export function CanvasPageItem({
  page,
  layout,
  editable,
  isEditing = false,
  zoom = 1,
  sessionId,
  screenshotUrl,
  screenshotRenderBox,
  renderMode = "iframe",
  visible = true,
  selected = false,
  onLayoutChange,
  onConfigEdit,
  onRuntimeConversionRequest,
  onRequestDelete,
  onConsoleEntry,
  onError,
  onDragStart,
  onDragMove,
  onDragEnd,
  toolMode = "hand",
  onPositionableSizes,
}: CanvasPageItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeEdge | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<ResizeEdge | null>(null);
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const targetRuntimeType: CanvasPageRuntimeType =
    page.runtimeType === "prototype-html-css"
      ? "high-fidelity-react"
      : page.runtimeType === "sketch-scene"
        ? "prototype-html-css"
      : "prototype-html-css";
  // 截图加载完成后，静态截图可作为轻量渲染路径。
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

  const designHeight = parsePreviewSizeValue(page.previewSize?.height, 812);
  const designWidth = parsePreviewSizeValue(page.previewSize?.width, 375);

  const canInteract = editable && toolMode === "select";
  const showEdgeHandles =
    (isHovering || selected) && canInteract && !isDragging && !isResizing;

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
        // hand 模式下事件被 viewport capture phase 拦截，不会到达这里
        // 但保留安全检查
        return;
      }
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;

      // 如果点在边框/角点热区，启动缩放而非拖拽
      const el = containerRef.current;
      if (el) {
        const handleEl = target.closest("[data-resize-handle]");
        const handleEdge = el.contains(handleEl)
          ? handleEl?.getAttribute("data-resize-handle")
          : null;
        const rect = el.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const edge = isResizeEdge(handleEdge)
          ? handleEdge
          : detectResizeEdge(localX, localY, rect.width, rect.height);
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

      if (target.closest("button")) return;

      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        e.stopPropagation();
        e.preventDefault();
        onConfigEdit?.(page.id, e);
        return;
      }

      e.stopPropagation();
      e.preventDefault();
      target.setPointerCapture(e.pointerId);

      setIsDragging(true);
      startPosRef.current = { x: e.clientX, y: e.clientY };
      layoutStartRef.current = { ...layoutRef.current };
      onDragStart?.(page.id);
    },
    [canInteract, page.id, onConfigEdit, onDragStart],
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
        const designW =
          page.previewSize?.width != null
            ? Number(page.previewSize.width)
            : 375;
        const designH =
          page.previewSize?.height != null
            ? Number(page.previewSize.height)
            : 812;
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
        const customLayout: CanvasPageLayout = {
          ...newLayout,
          sizeMode: "custom",
          previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
        };
        onLayoutChange?.(page.id, customLayout);
        onDragMove?.(page.id, customLayout, isResizing);
        return;
      }

      // 非拖拽/缩放时，更新边框热区 hover 状态
      updateEdgeFromPointer(e);
    },
    [
      isDragging,
      isResizing,
      page.id,
      onLayoutChange,
      onDragMove,
      updateEdgeFromPointer,
    ],
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
          onConfigEdit?.(page.id, e);
        }
        return;
      }
      if (isResizing) {
        setIsResizing(null);
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        onDragEnd?.();
        return;
      }
    },
    [isDragging, isResizing, onDragEnd, onConfigEdit, page.id],
  );

  const handleLostPointerCapture = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
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
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const pageLabelFontSize = Math.min(
    PAGE_LABEL_SCREEN_FONT_SIZE / safeZoom,
    PAGE_LABEL_MAX_FONT_SIZE,
  );
  const pageLabelTopOffset = Math.min(
    (PAGE_LABEL_SCREEN_FONT_SIZE + PAGE_LABEL_SCREEN_GAP) / safeZoom,
    PAGE_LABEL_MAX_TOP_OFFSET,
  );

  return (
    <div
      ref={containerRef}
      data-page-id={page.id}
      className={cn(
        "absolute rounded-lg transition-shadow duration-200 select-none",
        isEditing &&
          "ring-2 ring-white shadow-[0_0_0_1px_rgba(15,23,42,0.35),0_14px_34px_rgba(15,23,42,0.28)]",
      )}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
        cursor: activeCursor,
        zIndex: isEditing ? 10 : (layout.zIndex ?? 0),
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
      <div
        className="absolute left-0 max-w-full truncate font-medium text-muted-foreground pointer-events-none"
        title={page.name}
        style={{
          top: -pageLabelTopOffset,
          fontSize: pageLabelFontSize,
          lineHeight: 1.2,
        }}
      >
        {page.name}
      </div>

      <div className="absolute inset-0 rounded-lg overflow-hidden">
        <CanvasPagePreviewContent
          page={page}
          layout={layout}
          sessionId={sessionId}
          screenshotUrl={screenshotUrl}
          screenshotRenderBox={screenshotRenderBox}
          renderMode={renderMode}
          onLayoutChange={onLayoutChange}
          onConsoleEntry={onConsoleEntry}
          onError={onError}
          onPositionableSizes={onPositionableSizes}
        />
      </div>

      <CanvasSelectionBox
        visible={!isEditing && (selected || isDragging || Boolean(isResizing))}
        handles={canInteract}
      />

      {/* 边框热区 — 四条边 */}
      {showEdgeHandles && (
        <>
          {/* 四角热区覆盖选中框外侧的可视化角点 */}
          <div
            data-resize-handle="nw"
            className="absolute z-50"
            style={{
              left: -CORNER_HIT_SIZE / 2,
              top: -CORNER_HIT_SIZE / 2,
              width: CORNER_HIT_SIZE,
              height: CORNER_HIT_SIZE,
              cursor: "nwse-resize",
            }}
          />
          <div
            data-resize-handle="ne"
            className="absolute z-50"
            style={{
              right: -CORNER_HIT_SIZE / 2,
              top: -CORNER_HIT_SIZE / 2,
              width: CORNER_HIT_SIZE,
              height: CORNER_HIT_SIZE,
              cursor: "nesw-resize",
            }}
          />
          <div
            data-resize-handle="sw"
            className="absolute z-50"
            style={{
              left: -CORNER_HIT_SIZE / 2,
              bottom: -CORNER_HIT_SIZE / 2,
              width: CORNER_HIT_SIZE,
              height: CORNER_HIT_SIZE,
              cursor: "nesw-resize",
            }}
          />
          <div
            data-resize-handle="se"
            className="absolute z-50"
            style={{
              right: -CORNER_HIT_SIZE / 2,
              bottom: -CORNER_HIT_SIZE / 2,
              width: CORNER_HIT_SIZE,
              height: CORNER_HIT_SIZE,
              cursor: "nwse-resize",
            }}
          />
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
                  sizeMode: "preview",
                  previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
                });
                setContextMenu(null);
              }}
            >
              重置大小
            </button>
            {onRuntimeConversionRequest && (
              <button
                type="button"
                className="w-full border-t px-3 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onRuntimeConversionRequest(page.id, targetRuntimeType);
                  setContextMenu(null);
                }}
              >
                {targetRuntimeType === "prototype-html-css"
                  ? "AI 转 HTML/CSS 原型"
                  : "AI 转高保真页"}
              </button>
            )}
            {onRequestDelete && (
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted"
                onClick={() => {
                  onRequestDelete(page.id);
                  setContextMenu(null);
                }}
              >
                <Trash2 className="h-4 w-4" />
                删除页面
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
