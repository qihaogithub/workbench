"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import type { PreviewPanelProps, PreviewSize, PositionableSizeItem } from "./types";
import type { AppActionPayload, ConsoleLogPayload } from "./iframe-types";
import { generateIframeHtml } from "./iframe-template";
import { getCachedCompile, setCachedCompile } from "./compile-cache";

const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 812,
};

const CONTAINER_PADDING = 32;
const DEFAULT_PREVIEW_CDN_BASE = "https://esm.sh";

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
  fillContainer?: boolean,
  effectiveHeight?: number,
): PreviewScaleResult {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;
  const designWidth = parseSizeValue(effectiveSize.width) ?? 375;
  const designHeight = parseSizeValue(effectiveSize.height) ?? 812;
  const useEffectiveHeight = effectiveHeight != null && effectiveHeight > designHeight;
  const iframeHeight = useEffectiveHeight ? effectiveHeight : designHeight;

  if (fillContainer) {
    if (containerWidth && containerHeight) {
      if (useEffectiveHeight) {
        const scale = containerWidth / designWidth;
        return {
          designWidth,
          designHeight: iframeHeight,
          scale,
          wrapperStyle: {
            width: "100%",
            height: "100%",
            overflow: "hidden",
            position: "relative",
          },
          iframeStyle: {
            width: designWidth,
            height: iframeHeight,
            border: "none",
            position: "absolute",
            top: 0,
            left: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          },
        };
      }

      const scaleX = containerWidth / designWidth;
      const scaleY = containerHeight / designHeight;
      const scale = Math.min(scaleX, scaleY);

      const displayWidth = designWidth * scale;
      const displayHeight = designHeight * scale;
      const offsetX = (containerWidth - displayWidth) / 2;
      const offsetY = (containerHeight - displayHeight) / 2;

      return {
        designWidth,
        designHeight,
        scale,
        wrapperStyle: {
          width: "100%",
          height: "100%",
          overflow: "hidden",
          position: "relative",
        },
        iframeStyle: {
          width: designWidth,
          height: designHeight,
          border: "none",
          position: "absolute",
          top: offsetY / scale,
          left: offsetX / scale,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        },
      };
    }

    const fallbackHeight = useEffectiveHeight ? iframeHeight : designHeight;
    return {
      designWidth,
      designHeight: fallbackHeight,
      scale: 1,
      wrapperStyle: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      },
      iframeStyle: {
        width: designWidth,
        height: fallbackHeight,
        border: "none",
        position: "absolute",
        top: 0,
        left: 0,
        transformOrigin: "top left",
      },
    };
  }

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

function getPreviewCdnBaseUrl(explicitBaseUrl?: string): string {
  return (
    explicitBaseUrl ||
    process.env.NEXT_PUBLIC_PREVIEW_CDN_BASE_URL ||
    DEFAULT_PREVIEW_CDN_BASE
  );
}

interface CompileResult {
  compiledCode: string;
  dependencies: string[];
  cssImports: string[];
  moduleHash?: string;
  moduleUrl?: string;
}

interface CompileApiResponse {
  success?: boolean;
  data?: CompileResult;
  error?: {
    message?: string;
  };
}

async function readCompileResponse(response: Response): Promise<CompileApiResponse> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as CompileApiResponse;
  }

  const text = await response.text().catch(() => "");
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
  const status = `${response.status} ${response.statusText}`.trim();
  const suffix = snippet ? `：${snippet}` : "";
  throw new Error(`编译服务返回非 JSON 响应（${status}）${suffix}`);
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
  appState,
  routeParams,
  sdkFiles: _sdkFiles,
  onError,
  previewSize,
  placeholderScreenshotUrl,
  cdnBaseUrl,
  fillContainer = false,
  onConsoleEntry,
  onAppAction,
  onContentHeightChange,
  onContentLoaded,
  activityState = "active",
  effectiveHeight,
  onPositionableSizes,
  visualEditMode = false,
  visualAnnotationMode = false,
  visualHoverNodeId,
  selectedVisualNodeId,
  visualPropertyChanges = [],
  visualAnnotations = [],
  onVisualHover,
  onVisualSelect,
  onVisualSelectStack,
  onVisualLayerMenu,
  onVisualInlineEdit,
  onVisualAnnotationCreate,
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
  const [contentLoaded, setContentLoaded] = useState(false);
  const [placeholderFailed, setPlaceholderFailed] = useState(false);
  const timingStartRef = useRef<number>(0);
  const compileStartRef = useRef<number | null>(null);
  const updateCodeSentAtRef = useRef<number | null>(null);

  const isUrlMode = !!compiledJsUrl;
  const visualEditStateRef = useRef({
    enabled: visualEditMode,
    annotationMode: visualAnnotationMode,
    hoverNodeId: visualHoverNodeId ?? null,
    selectedNodeId: selectedVisualNodeId ?? null,
    propertyChanges: visualPropertyChanges,
    annotations: visualAnnotations,
  });
  visualEditStateRef.current = {
    enabled: visualEditMode,
    annotationMode: visualAnnotationMode,
    hoverNodeId: visualHoverNodeId ?? null,
    selectedNodeId: selectedVisualNodeId ?? null,
    propertyChanges: visualPropertyChanges,
    annotations: visualAnnotations,
  };

  const validCode = code ? isValidCode(code) : true;

  const configDataRef = useRef(configData);
  configDataRef.current = configData;
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const routeParamsRef = useRef(routeParams);
  routeParamsRef.current = routeParams;
  const activityStateRef = useRef(activityState);
  activityStateRef.current = activityState;

  const isSleeping = activityState === "sleeping";
  const resolvedCdnBaseUrl = getPreviewCdnBaseUrl(cdnBaseUrl);

  const reportTiming = useCallback(
    (stage: string, details: Record<string, unknown> = {}) => {
      if (!onConsoleEntry || typeof performance === "undefined") return;
      const now = performance.now();
      if (timingStartRef.current === 0) {
        timingStartRef.current = now;
      }
      const sinceStart =
        timingStartRef.current > 0 ? Math.round(now - timingStartRef.current) : 0;
      const payload = {
        source: "preview-runtime",
        stage,
        sinceStart,
        ...details,
      };
      if (typeof console !== "undefined") {
        console.info("[PreviewRuntime]", payload);
      }
      onConsoleEntry({
        level: "info",
        args: JSON.stringify(payload),
        timestamp: Date.now(),
      });
    },
    [onConsoleEntry],
  );

  const sendLifecycleMessage = useCallback((type: "SLEEP" | "WAKE") => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ type }, "*");
  }, []);

  const sendUpdateCodeUrl = useCallback(
    (
      url: string,
      cssList: string[],
      config: Record<string, unknown> = {},
      messageType: "UPDATE_CODE" | "UPDATE_MODULE" = "UPDATE_CODE",
    ) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        return;
      }
      if (activityStateRef.current === "sleeping") {
        return;
      }

      const resolvedConfig = resolveImageUrls(config, sessionId, demoId);
      updateCodeSentAtRef.current =
        typeof performance !== "undefined" ? performance.now() : null;
      reportTiming("parent_update_code_url_sent", {
        cssImports: cssList.length,
      });

      iframe.contentWindow.postMessage(
        {
          type: messageType,
          code: url,
          moduleUrl: url,
          isUrl: true,
          configData: resolvedConfig,
          appState: appStateRef.current || {},
          routeParams: routeParamsRef.current || {},
          cssImports: cssList,
        },
        "*",
      );
    },
    [sessionId, demoId, reportTiming],
  );

  const sendUpdateCode = useCallback(
    (result: CompileResult, config: Record<string, unknown> = {}) => {
      if (result.moduleUrl) {
        sendUpdateCodeUrl(result.moduleUrl, result.cssImports, config, "UPDATE_MODULE");
        return;
      }

      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        return;
      }
      if (activityStateRef.current === "sleeping") {
        return;
      }

      const resolvedConfig = resolveImageUrls(config, sessionId, demoId);
      updateCodeSentAtRef.current =
        typeof performance !== "undefined" ? performance.now() : null;
      reportTiming("parent_update_code_sent", {
        cssImports: result.cssImports.length,
        codeBytes: result.compiledCode.length,
      });

      iframe.contentWindow.postMessage(
        {
          type: "UPDATE_CODE",
          code: result.compiledCode,
          configData: resolvedConfig,
          appState: appStateRef.current || {},
          routeParams: routeParamsRef.current || {},
          cssImports: result.cssImports,
        },
        "*",
      );
    },
    [sessionId, demoId, reportTiming, sendUpdateCodeUrl],
  );

  const sendUpdateConfig = useCallback((config: Record<string, unknown>) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      return;
    }
    if (activityStateRef.current === "sleeping") {
      return;
    }

    const resolvedConfig = resolveImageUrls(config, sessionId, demoId);

    iframe.contentWindow.postMessage(
      {
        type: "UPDATE_CONFIG",
        configData: resolvedConfig,
        appState: appStateRef.current || {},
        routeParams: routeParamsRef.current || {},
      },
      "*",
    );
  }, [sessionId, demoId]);

  const sendCollectPositionableSizes = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      return;
    }
    if (activityStateRef.current === "sleeping") {
      return;
    }
    iframe.contentWindow.postMessage({ type: "COLLECT_POSITIONABLE_SIZES" }, "*");
  }, []);

  const sendVisualEditState = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      return;
    }
    if (activityStateRef.current === "sleeping") {
      return;
    }
    const state = visualEditStateRef.current;
    iframe.contentWindow.postMessage(
      {
        type: "UPDATE_VISUAL_EDIT_STATE",
        enabled: state.enabled,
        annotationMode: state.annotationMode,
        hoverNodeId: state.hoverNodeId,
        selectedNodeId: state.selectedNodeId,
        propertyChanges: state.propertyChanges,
        annotations: state.annotations,
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

    if (code !== undefined && !code) {
      setContentLoaded(false);
      setIsCompiling(false);
      setCompileError(null);
      setRuntimeError(null);
      setPendingCompileResult(null);
      setLastSuccessfulResult(null);
      return;
    }

    if (!sessionId && (!code || !validCode)) {
      setIsCompiling(false);
      setCompileError(null);
      setPendingCompileResult(null);
      setLastSuccessfulResult(null);
      return;
    }

    let cancelled = false;
    if (typeof performance !== "undefined") {
      compileStartRef.current = performance.now();
      if (timingStartRef.current === 0) {
        timingStartRef.current = compileStartRef.current;
      }
    }
    reportTiming("compile_start", {
      cacheScope: sessionId && demoId ? "session-demo" : "request",
    });
    setContentLoaded(false);
    setIsCompiling(true);
    setCompileError(null);
    setRuntimeError(null);

    const compile = async () => {
      try {
        // 先检查编译缓存
        if (sessionId && demoId) {
          const cached = getCachedCompile(sessionId, demoId, code);
          if (cached) {
            const compileResult: CompileResult = cached;
            const compileMs =
              compileStartRef.current != null && typeof performance !== "undefined"
                ? Math.round(performance.now() - compileStartRef.current)
                : undefined;
            reportTiming("compile_done", { cacheHit: true, compileMs });
            setLastSuccessfulResult(compileResult);
            const currentConfig = configDataRef.current || {};
            if (iframeReadyRef.current) {
              sendUpdateCode(compileResult, currentConfig);
            } else {
              setPendingCompileResult(compileResult);
            }
            setIsCompiling(false);
            return;
          }
        }

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

        const result = await readCompileResponse(response);

        if (cancelled) return;

        if (!response.ok || !result.success || !result.data) {
          const message = result.error?.message || "编译失败";
          setCompileError(message);
          onError?.(new Error(message));
          setPendingCompileResult(null);
          setLastSuccessfulResult(null);
          setIsCompiling(false);
          const compileMs =
            compileStartRef.current != null && typeof performance !== "undefined"
              ? Math.round(performance.now() - compileStartRef.current)
              : undefined;
          reportTiming("compile_error", { compileMs, message });
          return;
        }

        const compileResult: CompileResult = result.data;
        const compileMs =
          compileStartRef.current != null && typeof performance !== "undefined"
            ? Math.round(performance.now() - compileStartRef.current)
            : undefined;
        reportTiming("compile_done", { cacheHit: false, compileMs });
        setLastSuccessfulResult(compileResult);

        // 写入编译缓存
        if (sessionId && demoId) {
          setCachedCompile(sessionId, demoId, compileResult, code);
        }

        const currentConfig = configDataRef.current || {};
        if (iframeReadyRef.current) {
          sendUpdateCode(compileResult, currentConfig);
        } else {
          setPendingCompileResult(compileResult);
        }

        setIsCompiling(false);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "编译失败";
        setCompileError(message);
        onError?.(new Error(message));
        setPendingCompileResult(null);
        setLastSuccessfulResult(null);
        setIsCompiling(false);
        const compileMs =
          compileStartRef.current != null && typeof performance !== "undefined"
            ? Math.round(performance.now() - compileStartRef.current)
            : undefined;
        reportTiming("compile_error", { compileMs, message });
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
    onError,
    reportTiming,
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

    // 配置变更后延迟收集 positionable 元素尺寸
    if (contentLoaded && onPositionableSizes) {
      const timer = setTimeout(sendCollectPositionableSizes, 200);
      return () => clearTimeout(timer);
    }
  }, [
    configData,
    appState,
    routeParams,
    iframeReady,
    isUrlMode,
    compiledJsUrl,
    lastSuccessfulResult,
    runtimeError,
    sendUpdateConfig,
    contentLoaded,
    onPositionableSizes,
    sendCollectPositionableSizes,
  ]);

  useEffect(() => {
    if (!iframeReady) return;

    if (isSleeping) {
      sendLifecycleMessage("SLEEP");
      return;
    }

    sendLifecycleMessage("WAKE");

    const currentConfig = configDataRef.current || {};
    if (isUrlMode && compiledJsUrl) {
      sendUpdateCodeUrl(compiledJsUrl, externalCssImports || [], currentConfig);
    } else if (pendingCompileResult) {
      sendUpdateCode(pendingCompileResult, currentConfig);
      setPendingCompileResult(null);
    } else if (lastSuccessfulResult) {
      sendUpdateCode(lastSuccessfulResult, currentConfig);
    } else {
      sendUpdateConfig(currentConfig);
    }
    sendVisualEditState();

    const timer = setTimeout(sendCollectPositionableSizes, 0);
    return () => clearTimeout(timer);
  }, [
    compiledJsUrl,
    externalCssImports,
    iframeReady,
    isSleeping,
    isUrlMode,
    lastSuccessfulResult,
    pendingCompileResult,
    sendCollectPositionableSizes,
    sendLifecycleMessage,
    sendUpdateCode,
    sendUpdateCodeUrl,
    sendUpdateConfig,
    sendVisualEditState,
  ]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const { type, error } = event.data;

      switch (type) {
        case "READY":
          reportTiming("iframe_ready");
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
          sendVisualEditState();
          break;

        case "LOADED":
          reportTiming("iframe_loaded", {
            updateToLoadedMs:
              updateCodeSentAtRef.current != null &&
              typeof performance !== "undefined"
                ? Math.round(performance.now() - updateCodeSentAtRef.current)
                : undefined,
          });
          setRuntimeError(null);
          setContentLoaded(true);
          onContentLoaded?.();
          sendCollectPositionableSizes();
          break;

        case "COMPONENT_READY":
          sendCollectPositionableSizes();
          break;

        case "RUNTIME_ERROR":
          setRuntimeError(error || "组件运行时发生错误");
          onError?.(new Error(error || "组件运行时发生错误"));
          break;

        case "RESIZE":
          if (typeof event.data?.height === "number") {
            onContentHeightChange?.(event.data.height);
          }
          break;

        case "CONSOLE_LOG":
          if (event.data?.payload) {
            onConsoleEntry?.(event.data.payload as ConsoleLogPayload);
          }
          break;

        case "APP_ACTION":
          if (typeof event.data?.event === "string") {
            const payload =
              event.data.payload &&
              typeof event.data.payload === "object" &&
              !Array.isArray(event.data.payload)
                ? (event.data.payload as Record<string, unknown>)
                : undefined;
            onAppAction?.({
              event: event.data.event,
              payload,
              pageId: demoId,
            } satisfies AppActionPayload & { pageId?: string });
          }
          break;

        case "POSITIONABLE_SIZES_RESULT":
          if (event.data?.sizes) {
            onPositionableSizes?.(event.data.sizes as Record<string, PositionableSizeItem>);
          }
          break;

        case "VISUAL_HOVER":
          onVisualHover?.(event.data?.node ?? null);
          break;

        case "VISUAL_SELECT":
          onVisualSelect?.(event.data?.node ?? null);
          if (Array.isArray(event.data?.nodeStack)) {
            onVisualSelectStack?.(event.data.nodeStack);
            if (event.data?.openLayerPicker === true) {
              onVisualLayerMenu?.(event.data.nodeStack);
            }
          }
          break;

        case "VISUAL_INLINE_EDIT":
          if (event.data?.payload) {
            onVisualInlineEdit?.(event.data.payload);
          }
          break;

        case "VISUAL_ANNOTATION_CREATE":
          if (event.data?.node) {
            onVisualAnnotationCreate?.(
              event.data.node,
              event.data.text,
              event.data.annotationId,
              event.data.styleChanges,
            );
          }
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
    onConsoleEntry,
    onAppAction,
    onContentHeightChange,
    onContentLoaded,
    onPositionableSizes,
    sendUpdateCode,
    sendUpdateCodeUrl,
    sendCollectPositionableSizes,
    sendVisualEditState,
    onVisualHover,
    onVisualSelect,
    onVisualSelectStack,
    onVisualLayerMenu,
    onVisualInlineEdit,
    onVisualAnnotationCreate,
    demoId,
    reportTiming,
  ]);

  useEffect(() => {
    if (!iframeReadyRef.current) return;
    sendVisualEditState();
  }, [
    visualEditMode,
    visualAnnotationMode,
    visualHoverNodeId,
    selectedVisualNodeId,
    visualPropertyChanges,
    visualAnnotations,
    sendVisualEditState,
  ]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerWidth(rect.width);
      setContainerHeight(rect.height);
    }
  }, [previewSize]);

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

  // 页面切换时重置外层滚动容器的 scrollTop，避免 iframe 偏移到底部
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // 向上查找最近的可滚动父容器
    let parent: HTMLElement | null = el.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollTop > 0) {
        parent.scrollTop = 0;
        break;
      }
      parent = parent.parentElement;
    }
  }, [previewSize, demoId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      reportTiming("iframe_load_event");
      hideIframeScrollbar(iframe);
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [iframeSrcUrl, reportTiming]);

  const { wrapperStyle, iframeStyle } = computePreviewScale(
    previewSize,
    containerWidth,
    containerHeight,
    fillContainer,
    effectiveHeight,
  );
  const showPreviewLoading = isCompiling || !contentLoaded;
  const showPlaceholder =
    !!placeholderScreenshotUrl && !contentLoaded && !placeholderFailed;
  const showLoadingOverlay =
    showPreviewLoading && !showPlaceholder;

  useEffect(() => {
    reportTiming("iframe_html_create_start", {
      cdnBase: resolvedCdnBaseUrl,
      urlMode: isUrlMode,
    });
    const runtimeSource = process.env.NEXT_PUBLIC_PREVIEW_RUNTIME_SOURCE === "cdn" ? "cdn" : "local";
    const shellMode = process.env.NEXT_PUBLIC_PREVIEW_SHELL_MODE || "fixed";
    const canUseFixedShell =
      shellMode !== "inline" &&
      typeof window !== "undefined" &&
      !!window.location?.origin;
    const url = canUseFixedShell
        ? `${window.location.origin}/api/preview-runtime/shell?runtimeSource=${runtimeSource}`
        : `data:text/html;charset=utf-8,${encodeURIComponent(generateIframeHtml({
            supportUrlMode: true,
            cdnBaseUrl: resolvedCdnBaseUrl,
            runtimeBaseUrl: window.location.origin,
            useCdnRuntime: runtimeSource === "cdn",
          }))}`;
    setIframeSrcUrl(url);
    reportTiming("iframe_html_created", {
      cdnBase: resolvedCdnBaseUrl,
      transport: canUseFixedShell ? "fixed-shell" : "data-url",
      runtimeSource,
      shellMode,
    });
  }, [isUrlMode, resolvedCdnBaseUrl]);

  useEffect(() => {
    setContentLoaded(false);
  }, [iframeSrcUrl]);

  useEffect(() => {
    setPlaceholderFailed(false);
  }, [placeholderScreenshotUrl]);

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

      {isCompiling && !iframeSrcUrl && (
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
          className="absolute inset-0 z-30 m-2 flex flex-col items-center justify-center rounded-lg border border-destructive/40 bg-background/95 p-4 text-center"
        >
          <p className="text-sm font-medium text-destructive">编译错误</p>
          <p className="mt-1 text-xs text-muted-foreground">{compileError}</p>
        </div>
      )}

      {runtimeError && !isCompiling && (
        <div
          className="absolute inset-0 z-30 m-2 flex items-center justify-center rounded-lg border border-border bg-background/95 p-4 text-center"
        >
          <p className="text-sm font-medium text-muted-foreground">正在修复预览</p>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
      >
        {iframeSrcUrl && (
          <div style={wrapperStyle} className={fillContainer ? "relative" : "rounded-lg border border-border relative"}>
            {showPlaceholder && (
              <div className="absolute inset-0 z-10 bg-muted/30 flex items-center justify-center rounded-lg pointer-events-none overflow-hidden">
                <img
                  src={placeholderScreenshotUrl}
                  alt="preview placeholder"
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                  onError={() => setPlaceholderFailed(true)}
                />
              </div>
            )}
            {showLoadingOverlay && (
              <div className="absolute inset-0 z-20 bg-muted/30 flex items-center justify-center rounded-lg">
                <div
                  role="status"
                  aria-label="预览加载中"
                  className="animate-spin rounded-full h-8 w-8 border-2 border-muted-foreground/30 border-b-muted-foreground"
                />
              </div>
            )}
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts allow-same-origin"
              src={iframeSrcUrl}
              style={{
                ...iframeStyle,
                opacity: contentLoaded ? 1 : 0,
                transition: 'opacity 0.2s ease-in-out',
              }}
              title="预览"
            />
          </div>
        )}
      </div>
    </>
  );
}
