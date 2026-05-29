"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { buildIframeHtml } from "@/lib/iframe-template";

interface StaticPreviewPanelProps {
  compiledJsUrl: string;
  cssImports?: string[];
  configData?: Record<string, unknown>;
}

export function StaticPreviewPanel({
  compiledJsUrl,
  cssImports,
  configData,
}: StaticPreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeSrc, setIframeSrc] = useState<string>("");
  const [ready, setReady] = useState(false);
  const configDataRef = useRef(configData);

  configDataRef.current = configData;

  useEffect(() => {
    const html = buildIframeHtml(cssImports);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setIframeSrc(url);
    setReady(false);
    return () => URL.revokeObjectURL(url);
  }, [cssImports]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "READY") {
        setReady(true);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!iframeRef.current || !ready || !compiledJsUrl) return;

    iframeRef.current.contentWindow?.postMessage(
      {
        type: "UPDATE_CODE",
        code: compiledJsUrl,
        configData: configDataRef.current ?? {},
        cssImports: cssImports ?? [],
        isUrl: true,
      },
      "*",
    );
  }, [compiledJsUrl, ready, cssImports]);

  useEffect(() => {
    if (!iframeRef.current || !ready || !configData) return;

    iframeRef.current.contentWindow?.postMessage(
      {
        type: "UPDATE_CONFIG",
        configData,
      },
      "*",
    );
  }, [configData, ready]);

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      className="w-full h-full border-none"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
