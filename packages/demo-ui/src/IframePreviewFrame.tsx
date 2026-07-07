"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { computePreviewScale } from "./preview-scale";
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
  onLoad?: () => void;
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
  sandbox = "allow-scripts",
  onLoad,
}: IframePreviewFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const hasContainerSizeOverride = containerSizeOverride != null;

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
  );

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full w-full items-center justify-center", className)}
    >
      <div
        style={wrapperStyle}
        className={fillContainer ? "relative" : "relative rounded-lg border border-border"}
      >
        <iframe
          title={title}
          src={src}
          sandbox={sandbox}
          style={contentStyle}
          className="bg-white"
          onLoad={onLoad}
        />
      </div>
    </div>
  );
}
