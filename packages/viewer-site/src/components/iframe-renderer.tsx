"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface IframeMessage {
  type: string;
  [key: string]: unknown;
}

interface IframeRendererProps {
  src: string;
  onReady?: () => void;
  onLoaded?: () => void;
  onError?: (error: string) => void;
  onResize?: (height: number) => void;
  className?: string;
}

export function IframeRenderer({
  src,
  onReady,
  onLoaded,
  onError,
  onResize,
  className,
}: IframeRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(600);

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
    [onReady, onLoaded, onError, onResize]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const sendConfig = useCallback(
    (configData: Record<string, unknown>) => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: "UPDATE_CONFIG", configData },
          "*"
        );
      }
    },
    []
  );

  return (
    <iframe
      ref={iframeRef}
      src={src}
      sandbox="allow-scripts allow-same-origin"
      style={{ width: "100%", height: `${iframeHeight}px`, border: "none" }}
      className={className}
    />
  );
}
