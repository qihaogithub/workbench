"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { computePreviewScale } from "./preview-scale";
import type { PreviewSize } from "./types";
import { cn } from "./utils";
import {
  createSandboxedHtmlRateLimiter,
  isSandboxedHtmlMessage,
  readSandboxedHtmlHeight,
  SANDBOXED_HTML_CHANNEL,
} from "./sandboxed-html-protocol";

export type SandboxedHtmlFrameStatus =
  | "loading"
  | "ready"
  | "loaded"
  | "runtime-error"
  | "left-document"
  | "empty-first-frame"
  | "error"
  | "timeout";

export interface SandboxedHtmlFrameProps {
  executionUrl: string;
  channelId: string;
  title: string;
  previewSize?: PreviewSize;
  className?: string;
  fillContainer?: boolean;
  reloadKey?: string | number;
  timeoutMs?: number;
  heightBehavior?: "fixed" | "content";
  onStatusChange?: (status: SandboxedHtmlFrameStatus) => void;
  onContentHeightChange?: (height: number) => void;
}

export function SandboxedHtmlFrame({
  executionUrl,
  channelId,
  title,
  previewSize,
  className,
  fillContainer = false,
  reloadKey,
  timeoutMs = 8_000,
  heightBehavior = "content",
  onStatusChange,
  onContentHeightChange,
}: SandboxedHtmlFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const generationRef = useRef({ key: "", value: 0 });
  const [status, setStatus] = useState<SandboxedHtmlFrameStatus>("loading");
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [contentHeight, setContentHeight] = useState<number>();
  const frameUrl = useMemo(() => executionUrl.trim(), [executionUrl]);
  const frameKey = `${frameUrl}:${reloadKey ?? ""}:${channelId}`;
  if (generationRef.current.key !== frameKey) {
    generationRef.current = { key: frameKey, value: generationRef.current.value + 1 };
  }
  const generation = generationRef.current.value;
  const executionSrc = `${frameUrl}#workbenchGeneration=${generation}`;
  const announce = (next: SandboxedHtmlFrameStatus) => {
    setStatus(next);
    onStatusChange?.(next);
  };

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !frameUrl) {
      announce("error");
      return;
    }
    const currentGeneration = generation;
    setContentHeight(undefined);
    announce("loading");
    const limiter = createSandboxedHtmlRateLimiter();
    let hasReady = false;
    let hasUsefulFrame = false;
    let timeout: number | undefined;
    let emptyFrame: number | undefined;
    const settle = (next: SandboxedHtmlFrameStatus) => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (emptyFrame !== undefined) window.clearTimeout(emptyFrame);
      announce(next);
    };
    timeout = window.setTimeout(() => settle("timeout"), timeoutMs);
    emptyFrame = window.setTimeout(() => {
      if (hasReady && !hasUsefulFrame) announce("empty-first-frame");
    }, Math.min(timeoutMs, 1200));
    const onLoad = () => {
      if (hasReady) settle("left-document");
      else announce("loaded");
    };
    const onError = () => settle("error");
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (!limiter.accept()) return;
      if (!isSandboxedHtmlMessage(event.data, channelId, currentGeneration)) return;
      if (event.data.type === "READY") {
        hasReady = true;
        settle("ready");
        return;
      }
      if (event.data.type === "RESIZE") {
        const height = readSandboxedHtmlHeight(event.data);
        if (height === undefined) return;
        hasUsefulFrame = true;
        if (heightBehavior === "content") {
          setContentHeight(height);
          onContentHeightChange?.(height);
        }
        return;
      }
      if (event.data.type === "RUNTIME_ERROR") settle("runtime-error");
    };
    frame.addEventListener("load", onLoad);
    frame.addEventListener("error", onError);
    window.addEventListener("message", onMessage);
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (emptyFrame !== undefined) window.clearTimeout(emptyFrame);
      frame.removeEventListener("load", onLoad);
      frame.removeEventListener("error", onError);
      window.removeEventListener("message", onMessage);
    };
  }, [frameUrl, channelId, generation, reloadKey, timeoutMs, heightBehavior, onContentHeightChange]);

  useEffect(() => {
    const node = iframeRef.current?.parentElement;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = computePreviewScale(
    previewSize,
    containerSize.width,
    containerSize.height,
    fillContainer,
    heightBehavior === "content" ? contentHeight : undefined,
  );
  return (
    <div className={cn("relative h-full w-full min-h-[240px]", className)} data-sandbox-status={status}>
      <div style={scale.wrapperStyle}>
        <iframe
          key={frameKey}
          ref={iframeRef}
          src={executionSrc}
          title={title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allow=""
          style={scale.contentStyle}
          data-sandbox-channel={channelId}
          data-load-generation={generation}
        />
      </div>
    </div>
  );
}
