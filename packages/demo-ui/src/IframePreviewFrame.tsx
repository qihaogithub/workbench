"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { computePreviewScale } from "./preview-scale";
import { resolvePreviewConfigAssetUrls } from "./preview-config-utils";
import type { PreviewContainerSize, PreviewSize } from "./types";
import { cn } from "./utils";

export interface IframePreviewFrameProps {
  src: string;
  title: string;
  previewSize?: PreviewSize;
  className?: string;
  fillContainer?: boolean;
  containerSizeOverride?: PreviewContainerSize;
  sandbox?: string;
  configData?: Record<string, unknown>;
  sessionId?: string;
  demoId?: string;
  onLoad?: () => void;
  effectiveHeight?: number;
  onContentHeightChange?: (height: number) => void;
}

function getIframeOrigin(src: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

function normalizeMeasuredSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

export function IframePreviewFrame({
  src,
  title,
  previewSize,
  className,
  fillContainer = false,
  containerSizeOverride,
  sandbox = "allow-scripts allow-same-origin",
  configData,
  sessionId,
  demoId,
  onLoad,
  effectiveHeight,
  onContentHeightChange,
}: IframePreviewFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [measuredContentHeight, setMeasuredContentHeight] = useState<number | undefined>(undefined);
  const hasContainerSizeOverride = containerSizeOverride != null;
  const resolvedEffectiveHeight = effectiveHeight ?? measuredContentHeight;

  const updateContainerSize = useCallback((width: number, height: number) => {
    const nextWidth = normalizeMeasuredSize(width);
    const nextHeight = normalizeMeasuredSize(height);
    if (nextWidth <= 0 || nextHeight <= 0) return;
    setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
    setContainerHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const measureContainer = useCallback(() => {
    if (hasContainerSizeOverride) return;
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width > 0 && height > 0) {
      updateContainerSize(width, height);
      return;
    }
    const rect = el.getBoundingClientRect();
    updateContainerSize(rect.width, rect.height);
  }, [hasContainerSizeOverride, updateContainerSize]);

  useLayoutEffect(() => {
    measureContainer();
  }, [measureContainer]);

  useEffect(() => {
    if (hasContainerSizeOverride) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateContainerSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasContainerSizeOverride, updateContainerSize]);

  const effectiveContainerWidth = containerSizeOverride?.width ?? containerWidth;
  const effectiveContainerHeight = containerSizeOverride?.height ?? containerHeight;

  const { wrapperStyle, contentStyle } = computePreviewScale(
    previewSize,
    effectiveContainerWidth,
    effectiveContainerHeight,
    fillContainer,
    resolvedEffectiveHeight,
  );

  const syncIframeConfig = useCallback(() => {
    if (!configData) return;
    const resolvedConfig = resolvePreviewConfigAssetUrls(configData, {
      sessionId,
      demoId,
      origin: getIframeOrigin(src),
    });
    iframeRef.current?.contentWindow?.postMessage(
      { type: "UPDATE_CONFIG", configData: resolvedConfig },
      "*",
    );
  }, [configData, demoId, sessionId, src]);

  useEffect(() => {
    syncIframeConfig();
  }, [syncIframeConfig]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (
        event.data?.type === "RESIZE" &&
        typeof event.data?.height === "number"
      ) {
        const height = event.data.height as number;
        if (effectiveHeight == null) {
          setMeasuredContentHeight(height);
        }
        onContentHeightChange?.(height);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [effectiveHeight, onContentHeightChange]);

  const handleLoad = useCallback(() => {
    onLoad?.();
    syncIframeConfig();

    // 兼容性注入：旧项目发布的 iframe.html 可能不包含最新 Shell 模板的
    // 滚动条隐藏样式，这里兜底隐藏滚动条但不改变 overflow 行为，保留滚动能力。
    const doc = iframeRef.current?.contentDocument;
    if (doc && doc.head) {
      const style = doc.createElement("style");
      style.textContent = `
        ::-webkit-scrollbar { display: none; }
        html, body { scrollbar-width: none; -ms-overflow-style: none; }
      `;
      doc.head.appendChild(style);
    }
  }, [onLoad, syncIframeConfig]);

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full w-full items-center justify-center", className)}
    >
      <style>{`
        .iframe-preview-frame::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div
        style={wrapperStyle}
        className={fillContainer ? "relative" : "relative rounded-lg border border-border"}
      >
        <iframe
          ref={iframeRef}
          title={title}
          src={src}
          sandbox={sandbox}
          style={{
            ...contentStyle,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          className="bg-white iframe-preview-frame"
          onLoad={handleLoad}
        />
      </div>
    </div>
  );
}
