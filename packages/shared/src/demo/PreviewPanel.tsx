"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { PreviewPanelProps, PreviewSize } from "./types";
import { generateIframeHtml } from "./iframe-template";

const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 812,
};

const CONTAINER_PADDING = 32;

function parseSizeValue(value: string | number | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value.replace(/px$/, ""));
    return isNaN(num) ? null : num;
  }
  return null;
}

interface PreviewScaleResult {
  designWidth: number;
  designHeight: number;
  scale: number;
  wrapperStyle: React.CSSProperties;
  iframeStyle: React.CSSProperties;
}

function computePreviewScale(
  size?: PreviewSize,
  containerWidth?: number,
  containerHeight?: number,
): PreviewScaleResult {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;
  const designWidth = parseSizeValue(effectiveSize.width) ?? 375;
  const designHeight = parseSizeValue(effectiveSize.height) ?? 812;

  if (!containerWidth || !containerHeight) {
    return {
      designWidth,
      designHeight,
      scale: 1,
      wrapperStyle: {
        width: designWidth,
        height: designHeight,
        margin: "0 auto",
        position: "relative",
        overflow: "hidden",
      },
      iframeStyle: {
        width: designWidth,
        height: designHeight,
        border: "none",
        position: "absolute",
        top: 0,
        left: 0,
      },
    };
  }

  const availableHeight = containerHeight - CONTAINER_PADDING;
  const availableWidth = containerWidth;
  const aspectRatio = designWidth / designHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (availableHeight * aspectRatio <= availableWidth) {
    displayWidth = availableHeight * aspectRatio;
    displayHeight = availableHeight;
  } else {
    displayWidth = availableWidth;
    displayHeight = availableWidth / aspectRatio;
  }

  const scale = displayWidth / designWidth;

  return {
    designWidth,
    designHeight,
    scale,
    wrapperStyle: {
      width: displayWidth,
      height: displayHeight,
      margin: "auto",
      position: "relative",
      overflow: "hidden",
    },
    iframeStyle: {
      width: designWidth,
      height: designHeight,
      transform: `scale(${scale})`,
      transformOrigin: "top left",
      border: "none",
      position: "absolute",
      top: 0,
      left: 0,
    },
  };
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;

function resolveRelativePath(relativePath: string, basePath: string): string {
  const parts = basePath.split('/').filter(p => p !== '');
  const relativeParts = relativePath.split('/');

  for (const part of relativeParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
}

function resolveImageUrls(
  data: Record<string, unknown>,
  sessionId?: string,
  demoId?: string,
): Record<string, unknown> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (!origin) return data;

  const basePath = demoId ? `demos/${demoId}/` : '';

  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      if (value.startsWith("/api/sessions/")) {
        return origin + value;
      }
      if (sessionId && basePath && /^\.\.?\/[^'")\s]*$/.test(value) && IMAGE_EXT_RE.test(value)) {
        const resolved = resolveRelativePath(value, basePath);
        return `${origin}/api/sessions/${sessionId}/workspace/${resolved}`;
      }
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = walk(v);
      }
      return result;
    }
    return value;
  }

  return walk(data) as Record<string, unknown>;
}

function isValidCode(code: string): boolean {
  return (
    typeof code === "string" &&
    code.trim().length > 0 &&
    (code.includes("import") ||
      code.includes("function") ||
      code.includes("export") ||
      code.includes("<")) &&
    !code.match(/^[A-Z]:\\/) &&
    !code.includes("\\重要文件\\")
  );
}

interface CompileResult {
  compiledCode: string;
  dependencies: string[];
  cssImports: string[];
}

function hideIframeScrollbar(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;
    const style = doc.createElement("style");
    style.textContent = `
      html {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      html::-webkit-scrollbar {
        display: none !important;
      }
    `;
    doc.head.appendChild(style);
  } catch {}
}

export function PreviewPanel({
  code,
  sessionId,
  demoId,
  compiledJsUrl,
  cssImports: externalCssImports,
  configData,
  sdkFiles: _sdkFiles,
  onError,
  previewSize,
  snapshotVersion: _snapshotVersion,
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeReadyRef = useRef(false);
  const [pendingCompileResult, setPendingCompileResult] =
    useState<CompileResult | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] =
    useState<CompileResult | null>(null);
  const [iframeSrcUrl, setIframeSrcUrl] = useState<string | null>(null);

  const isUrlMode = !!compiledJsUrl;

  const validCode = code ? isValidCode(code) : true;

  const configDataRef = useRef(configData);
  configDataRef.current = configData;

  const sendUpdateCode = useCallback(
    (result: CompileResult, config: Record<string, unknown> = {}) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        return;
      }

      const resolvedConfig = resolveImageUrls(config, sessionId, demoId);

      iframe.contentWindow.postMessage(
        {
          type: "UPDATE_CODE",
          code: result.compiledCode,
          configData: resolvedConfig,
          cssImports: result.cssImports,
        },
        "*",
      );
    },
    [sessionId, demoId],
  );

  const sendUpdateCodeUrl = useCallback(
    (url: string, cssList: string[], config: Record<string, unknown> = {}) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        return;
      }

      const resolvedConfig = resolveImageUrls(config, sessionId, demoId);

      iframe.contentWindow.postMessage(
        {
          type: "UPDATE_CODE",
          code: url,
          isUrl: true,
          configData: resolvedConfig,
          cssImports: cssList,
        },
        "*",
      );
    },
    [],
  );

  const sendUpdateConfig = useCallback((config: Record<string, unknown>) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      return;
    }

    const resolvedConfig = resolveImageUrls(config, sessionId, demoId);

    iframe.contentWindow.postMessage(
      {
        type: "UPDATE_CONFIG",
        configData: resolvedConfig,
      },
      "*",
    );
  }, []);

  useEffect(() => {
    if (isUrlMode) {
      if (!compiledJsUrl) return;

      setCompileError(null);
      setRuntimeError(null);

      const currentConfig = configDataRef.current || {};
      if (iframeReadyRef.current) {
        sendUpdateCodeUrl(compiledJsUrl, externalCssImports || [], currentConfig);
      }

      return;
    }

    if (!sessionId && (!code || !validCode)) {
      setIsCompiling(false);
      setCompileError(null);
      return;
    }

    let cancelled = false;
    setIsCompiling(true);
    setCompileError(null);
    setRuntimeError(null);

    const compile = async () => {
      try {
        const body: Record<string, unknown> = sessionId
          ? { sessionId, code }
          : { code };
        if (demoId) {
          body.demoId = demoId;
        }

        const response = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const result = await response.json();

        if (cancelled) return;

        if (!result.success) {
          setCompileError(result.error?.message || "编译失败");
          setIsCompiling(false);
          return;
        }

        const compileResult: CompileResult = result.data;
        setLastSuccessfulResult(compileResult);

        const currentConfig = configDataRef.current || {};
        if (iframeReadyRef.current) {
          sendUpdateCode(compileResult, currentConfig);
        } else {
          setPendingCompileResult(compileResult);
        }

        setIsCompiling(false);
      } catch (err) {
        if (cancelled) return;
        setCompileError(err instanceof Error ? err.message : "编译失败");
        setIsCompiling(false);
      }
    };

    compile();

    return () => {
      cancelled = true;
    };
  }, [
    code,
    sessionId,
    demoId,
    compiledJsUrl,
    externalCssImports,
    isUrlMode,
    validCode,
    sendUpdateCode,
    sendUpdateCodeUrl,
  ]);

  useEffect(() => {
    if (!iframeReady) return;

    if (isUrlMode && compiledJsUrl) {
      sendUpdateConfig(configData || {});
      return;
    }

    if (!lastSuccessfulResult) return;

    if (runtimeError) {
      setRuntimeError(null);
    }

    sendUpdateConfig(configData || {});
  }, [
    configData,
    iframeReady,
    isUrlMode,
    compiledJsUrl,
    lastSuccessfulResult,
    runtimeError,
    sendUpdateConfig,
  ]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const { type, error } = event.data;

      switch (type) {
        case "READY":
          iframeReadyRef.current = true;
          setIframeReady(true);
          if (isUrlMode && compiledJsUrl) {
            sendUpdateCodeUrl(compiledJsUrl, externalCssImports || [], configData || {});
          } else if (pendingCompileResult) {
            sendUpdateCode(pendingCompileResult, configData || {});
            setPendingCompileResult(null);
          } else if (lastSuccessfulResult) {
            sendUpdateCode(lastSuccessfulResult, configData || {});
          }
          break;

        case "LOADED":
          setRuntimeError(null);
          break;

        case "RUNTIME_ERROR":
          setRuntimeError(error || "组件运行时发生错误");
          onError?.(new Error(error || "组件运行时发生错误"));
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    isUrlMode,
    compiledJsUrl,
    externalCssImports,
    pendingCompileResult,
    lastSuccessfulResult,
    configData,
    onError,
    sendUpdateCode,
    sendUpdateCodeUrl,
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      hideIframeScrollbar(iframe);
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [iframeSrcUrl]);

  const { wrapperStyle, iframeStyle } = computePreviewScale(
    previewSize,
    containerWidth,
    containerHeight,
  );

  useEffect(() => {
    const html = generateIframeHtml({ supportUrlMode: isUrlMode });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setIframeSrcUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [isUrlMode]);

  return (
    <>
      {!validCode && code && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
          <p className="text-red-800 font-medium">⚠️ 代码加载失败</p>
          <p className="text-red-600 text-sm mt-1">
            检测到无效的代码文件（可能是文件路径而非代码内容）
          </p>
        </div>
      )}

      {isCompiling && (
        <div
          className="flex items-center justify-center p-8"
          style={wrapperStyle}
        >
          <div
            role="status"
            aria-label="编译中"
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"
          />
        </div>
      )}

      {compileError && !isCompiling && (
        <div
          className="absolute inset-0 z-10 p-4 bg-red-50/95 border border-red-200 rounded-lg m-2"
          style={{ maxHeight: "200px", overflow: "auto" }}
        >
          <p className="text-red-800 font-medium">编译错误</p>
          <pre className="text-red-600 text-sm mt-2 whitespace-pre-wrap">
            {compileError}
          </pre>
        </div>
      )}

      {runtimeError && !isCompiling && (
        <div
          className="absolute inset-0 z-10 p-4 bg-red-50/95 border border-red-200 rounded-lg m-2"
          style={{ maxHeight: "200px", overflow: "auto" }}
        >
          <p className="text-red-800 font-medium">运行时错误</p>
          <pre className="text-red-600 text-sm mt-2 whitespace-pre-wrap">
            {runtimeError}
          </pre>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full flex flex-col items-center"
      >
        {iframeSrcUrl && (
          <div style={wrapperStyle} className="rounded-lg border border-border">
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts allow-same-origin"
              src={iframeSrcUrl}
              style={iframeStyle}
              title="预览"
            />
          </div>
        )}
      </div>
    </>
  );
}
