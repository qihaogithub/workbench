"use client";

import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";

interface PreviewSize {
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  scale?: number;
}

interface IframeMessage {
  type: string;
  [key: string]: unknown;
}

export interface IframeRendererHandle {
  sendConfig: (configData: Record<string, unknown>) => void;
}

interface IframeRendererProps {
  src: string;
  previewSize?: PreviewSize;
  onReady?: () => void;
  onLoaded?: () => void;
  onError?: (error: string) => void;
  onResize?: (height: number) => void;
  className?: string;
}

export const IframeRenderer = forwardRef<IframeRendererHandle, IframeRendererProps>(
  function IframeRenderer(
    { src, previewSize, onReady, onLoaded, onError, onResize, className },
    ref,
  ) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [iframeHeight, setIframeHeight] = useState<number>(600);
    const [containerWidth, setContainerWidth] = useState<number>(0);

    useImperativeHandle(ref, () => ({
      sendConfig: (configData: Record<string, unknown>) => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            { type: "UPDATE_CONFIG", configData },
            "*",
          );
        }
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const handleMessage = useCallback(
      (event: MessageEvent<IframeMessage>) => {
        const { type } = event.data;

        switch (type) {
          case "READY":
            onReady?.();
            break;
          case "LOADED":
            onLoaded?.();
            break;
          case "RUNTIME_ERROR":
            onError?.(event.data.error as string);
            break;
          case "RESIZE":
            const height = event.data.height as number;
            if (height && height > 0) {
              setIframeHeight(height);
              onResize?.(height);
            }
            break;
        }
      },
      [onReady, onLoaded, onError, onResize],
    );

    useEffect(() => {
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, [handleMessage]);

    const hasPreviewSize =
      previewSize &&
      (previewSize.width !== undefined || previewSize.height !== undefined);

    if (hasPreviewSize) {
      const iframeWidth =
        typeof previewSize!.width === "number" ? previewSize!.width : 375;
      const iframeHeightVal =
        typeof previewSize!.height === "number" ? previewSize!.height : 812;
      const userScale = previewSize!.scale ?? 1;
      const effectiveWidth = iframeWidth * userScale;
      const effectiveHeight = iframeHeightVal * userScale;

      let scale = 1;
      if (containerWidth > 0 && effectiveWidth > containerWidth) {
        scale = containerWidth / effectiveWidth;
      }

      return (
        <div
          ref={containerRef}
          className={`flex items-start justify-center overflow-auto ${className || ""}`}
          style={{ width: "100%", height: "100%" }}
        >
          <div
            style={{
              width: effectiveWidth * scale,
              height: effectiveHeight * scale,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <iframe
              ref={iframeRef}
              src={src}
              sandbox="allow-scripts allow-same-origin"
              style={{
                width: effectiveWidth,
                height: effectiveHeight,
                border: "none",
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={className} style={{ width: "100%" }}>
        <iframe
          ref={iframeRef}
          src={src}
          sandbox="allow-scripts allow-same-origin"
          style={{ width: "100%", height: `${iframeHeight}px`, border: "none" }}
        />
      </div>
    );
  },
);
