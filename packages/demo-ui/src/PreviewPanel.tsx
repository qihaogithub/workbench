"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type {
  PreviewDiagnostic,
  PreviewDiagnosticError,
  PreviewPanelProps,
  PositionableSizeItem,
} from "./types";
import type { AppActionPayload, ConsoleLogPayload, VisualNodeInfo, VisualNodeTreeItem } from "./iframe-types";
import { LayerTreeMenu } from "./LayerTreeMenu";
import { generateIframeHtml } from "./iframe-template";
import { getCachedCompile, setCachedCompile } from "./compile-cache";
import { computePreviewScale } from "./preview-scale";
const DEFAULT_PREVIEW_CDN_BASE = "https://esm.sh";
const NO_ACTIVE_PREVIEW_REQUEST_ID = -1;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;

interface VisualContextMenuState {
  x: number;
  y: number;
  tree: VisualNodeTreeItem[];
}

function buildVisualTreeFromStack(nodes: VisualNodeInfo[]): VisualNodeTreeItem[] {
  if (nodes.length === 0) return [];
  let child: VisualNodeTreeItem | null = null;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    child = {
      ...nodes[index],
      children: child ? [child] : [],
    };
  }
  return child ? [child] : [];
}

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
    details?: {
      demoId?: string;
      pageId?: string;
      codeHash?: string;
      moduleHash?: string;
      issues?: Array<{
        stage?: string;
        code?: string;
        moduleName?: string;
        importName?: string;
        message?: string;
        instruction?: string;
      }>;
    };
  };
}

function createPreviewDiagnosticError(
  message: string,
  diagnostic: PreviewDiagnostic,
): PreviewDiagnosticError {
  const error = new Error(message) as PreviewDiagnosticError;
  error.previewDiagnostic = diagnostic;
  return error;
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

function sanitizeStaticPrototypeElement(root: HTMLElement) {
  const blockedSelectors = "script, iframe, embed, object";
  root.querySelectorAll(blockedSelectors).forEach((node) => node.remove());
  root.querySelectorAll<HTMLElement>("*").forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) {
        node.removeAttribute(attr.name);
        continue;
      }
      if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    }
  });
}

function extractStaticPrototypeCss(doc: Document): string {
  const chunks: string[] = [];
  doc.querySelectorAll("style").forEach((style) => {
    if (style.textContent?.trim()) {
      chunks.push(style.textContent.trim());
    }
  });
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .filter(Boolean);
      if (rules.length > 0) {
        chunks.push(rules.join("\n"));
      }
    } catch {
      // Cross-origin stylesheets cannot be read; prototype validation will decide
      // whether the remaining static output is usable.
    }
  }
  return Array.from(new Set(chunks)).join("\n\n");
}

function extractStaticPrototypeSnapshot(
  iframe: HTMLIFrameElement | null,
): { ok: true; html: string; css: string } | { ok: false; error: string } {
  try {
    const doc = iframe?.contentDocument;
    if (!doc) {
      return { ok: false, error: "当前预览 iframe 不可读取" };
    }
    const sourceRoot =
      doc.getElementById("root") ||
      doc.querySelector<HTMLElement>("[data-preview-root]") ||
      doc.body;
    if (!sourceRoot) {
      return { ok: false, error: "未找到可静态化的预览根节点" };
    }
    const clone = sourceRoot.cloneNode(true) as HTMLElement;
    sanitizeStaticPrototypeElement(clone);
    const html = clone.innerHTML.trim();
    if (!html) {
      return { ok: false, error: "预览根节点为空" };
    }
    return {
      ok: true,
      html,
      css: extractStaticPrototypeCss(doc),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "预览 DOM 静态化失败",
    };
  }
}

function normalizeMeasuredSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function shouldUsePassiveMeasureFallback(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /jsdom/i.test(navigator.userAgent)
  );
}

function setBooleanStateIfChanged(
  setter: React.Dispatch<React.SetStateAction<boolean>>,
  value: boolean,
) {
  setter((current) => (current === value ? current : value));
}

function setNullableStringStateIfChanged(
  setter: React.Dispatch<React.SetStateAction<string | null>>,
  value: string | null,
) {
  setter((current) => (current === value ? current : value));
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
  hiddenVisualNodeIds = [],
  visualPropertyChanges = [],
  visualAnnotations = [],
  onVisualHover,
  onVisualSelect,
  onVisualSelectStack,
  visualNodeTreeRequestKey,
  onVisualNodeTreeChange,
  staticPrototypeRequestKey,
  onStaticPrototypeSnapshot,
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
  const activePreviewRequestIdRef = useRef(0);
  const nextPreviewRequestIdRef = useRef(0);
  const [pendingCompileResult, setPendingCompileResult] =
    useState<{ result: CompileResult; requestId: number } | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] =
    useState<CompileResult | null>(null);
  const [iframeSrcUrl, setIframeSrcUrl] = useState<string | null>(null);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [placeholderFailed, setPlaceholderFailed] = useState(false);
  const [visualContextMenu, setVisualContextMenu] =
    useState<VisualContextMenuState | null>(null);
  const containerSizeRef = useRef({ width: 0, height: 0 });
  const skipNextPassiveMeasureRef = useRef(false);
  const timingStartRef = useRef<number>(0);
  const compileStartRef = useRef<number | null>(null);
  const updateCodeSentAtRef = useRef<number | null>(null);

  const isUrlMode = !!compiledJsUrl;
  const visualEditStateRef = useRef({
    enabled: visualEditMode,
    annotationMode: visualAnnotationMode,
    hoverNodeId: visualHoverNodeId ?? null,
    selectedNodeId: selectedVisualNodeId ?? null,
    hiddenNodeIds: hiddenVisualNodeIds,
    propertyChanges: visualPropertyChanges,
    annotations: visualAnnotations,
  });
  visualEditStateRef.current = {
    enabled: visualEditMode,
    annotationMode: visualAnnotationMode,
    hoverNodeId: visualHoverNodeId ?? null,
    selectedNodeId: selectedVisualNodeId ?? null,
    hiddenNodeIds: hiddenVisualNodeIds,
    propertyChanges: visualPropertyChanges,
    annotations: visualAnnotations,
  };

  const validCode = code ? isValidCode(code) : true;
  const { designWidth, designHeight, wrapperStyle, contentStyle } = computePreviewScale(
    previewSize,
    containerWidth,
    containerHeight,
    fillContainer,
    effectiveHeight,
  );

  const configDataRef = useRef(configData);
  configDataRef.current = configData;
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const routeParamsRef = useRef(routeParams);
  routeParamsRef.current = routeParams;
  const activityStateRef = useRef(activityState);
  activityStateRef.current = activityState;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onConsoleEntryRef = useRef(onConsoleEntry);
  onConsoleEntryRef.current = onConsoleEntry;

  const isSleeping = activityState === "sleeping";
  const resolvedCdnBaseUrl = getPreviewCdnBaseUrl(cdnBaseUrl);

  const reportTiming = useCallback(
    (stage: string, details: Record<string, unknown> = {}) => {
      const handleConsoleEntry = onConsoleEntryRef.current;
      if (!handleConsoleEntry || typeof performance === "undefined") return;
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
      handleConsoleEntry({
        level: "info",
        args: JSON.stringify(payload),
        timestamp: Date.now(),
      });
    },
    [],
  );

  const updateContainerSize = useCallback((width: number, height: number) => {
    const nextWidth = normalizeMeasuredSize(width);
    const nextHeight = normalizeMeasuredSize(height);
    if (nextWidth <= 0 || nextHeight <= 0) return;
    const current = containerSizeRef.current;
    const resolvedWidth =
      current.width > 0 && Math.abs(current.width - nextWidth) <= 1
        ? current.width
        : nextWidth;
    const resolvedHeight =
      current.height > 0 && Math.abs(current.height - nextHeight) <= 1
        ? current.height
        : nextHeight;
    if (current.width === resolvedWidth && current.height === resolvedHeight) {
      return;
    }
    containerSizeRef.current = { width: resolvedWidth, height: resolvedHeight };
    skipNextPassiveMeasureRef.current = true;
    setContainerWidth(resolvedWidth);
    setContainerHeight(resolvedHeight);
  }, []);

  const measureContainer = useCallback(() => {
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
  }, [updateContainerSize]);

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
      requestId = activePreviewRequestIdRef.current,
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
          requestId,
        },
        "*",
      );
    },
    [sessionId, demoId, reportTiming],
  );

  const sendUpdateCode = useCallback(
    (
      result: CompileResult,
      config: Record<string, unknown> = {},
      requestId = activePreviewRequestIdRef.current,
    ) => {
      activePreviewRequestIdRef.current = requestId;
      if (result.moduleUrl) {
        sendUpdateCodeUrl(
          result.moduleUrl,
          result.cssImports,
          config,
          "UPDATE_MODULE",
          requestId,
        );
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
          requestId,
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
    const requestId = activePreviewRequestIdRef.current;

    iframe.contentWindow.postMessage(
      {
        type: "UPDATE_CONFIG",
        configData: resolvedConfig,
        appState: appStateRef.current || {},
        routeParams: routeParamsRef.current || {},
        requestId,
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
    iframe.contentWindow.postMessage(
      {
        type: "COLLECT_POSITIONABLE_SIZES",
        requestId: activePreviewRequestIdRef.current,
      },
      "*",
    );
  }, []);

  const sendCollectVisualNodeTree = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      return;
    }
    if (activityStateRef.current === "sleeping") {
      return;
    }
    iframe.contentWindow.postMessage({ type: "COLLECT_VISUAL_NODE_TREE" }, "*");
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
        hiddenNodeIds: state.hiddenNodeIds,
        propertyChanges: state.propertyChanges,
        annotations: state.annotations,
      },
      "*",
    );
  }, []);

  const getVisualContextMenuPosition = useCallback(
    (point: { x: number; y: number }) => {
      const iframe = iframeRef.current;
      const wrapper = iframe?.parentElement;
      if (!iframe || !wrapper) return null;

      const iframeRect = iframe.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const scaleX = iframeRect.width / designWidth;
      const scaleY = iframeRect.height / designHeight;
      const rawX = iframeRect.left - wrapperRect.left + point.x * scaleX;
      const rawY = iframeRect.top - wrapperRect.top + point.y * scaleY;
      const maxX = Math.max(8, wrapperRect.width - 236);
      const maxY = Math.max(8, wrapperRect.height - 260);

      return {
        x: Math.min(Math.max(rawX, 8), maxX),
        y: Math.min(Math.max(rawY, 8), maxY),
      };
    },
    [designHeight, designWidth],
  );

  const updateVisualContextHover = useCallback(
    (nodeId: string | null) => {
      visualEditStateRef.current = {
        ...visualEditStateRef.current,
        hoverNodeId: nodeId ?? visualHoverNodeId ?? null,
      };
      sendVisualEditState();
    },
    [sendVisualEditState, visualHoverNodeId],
  );

  const closeVisualContextMenu = useCallback(() => {
    setVisualContextMenu(null);
    updateVisualContextHover(null);
  }, [updateVisualContextHover]);

  const clearVisualSelection = useCallback(() => {
    visualEditStateRef.current = {
      ...visualEditStateRef.current,
      selectedNodeId: null,
      hoverNodeId: null,
    };
    onVisualSelect?.(null);
    onVisualSelectStack?.([]);
    setVisualContextMenu(null);
    sendVisualEditState();
  }, [onVisualSelect, onVisualSelectStack, sendVisualEditState]);

  useEffect(() => {
    setBooleanStateIfChanged(setContentLoaded, false);

    if (isUrlMode) {
      if (!compiledJsUrl) {
        activePreviewRequestIdRef.current = NO_ACTIVE_PREVIEW_REQUEST_ID;
        return;
      }

      const requestId = nextPreviewRequestIdRef.current + 1;
      nextPreviewRequestIdRef.current = requestId;
      activePreviewRequestIdRef.current = requestId;

      setNullableStringStateIfChanged(setCompileError, null);
      setNullableStringStateIfChanged(setRuntimeError, null);

      const currentConfig = configDataRef.current || {};
      if (iframeReadyRef.current) {
        sendUpdateCodeUrl(
          compiledJsUrl,
          externalCssImports || [],
          currentConfig,
          "UPDATE_CODE",
          requestId,
        );
      }

      return;
    }

    if (code !== undefined && !code) {
      activePreviewRequestIdRef.current = NO_ACTIVE_PREVIEW_REQUEST_ID;
      setBooleanStateIfChanged(setContentLoaded, false);
      setBooleanStateIfChanged(setIsCompiling, false);
      setNullableStringStateIfChanged(setCompileError, null);
      setNullableStringStateIfChanged(setRuntimeError, null);
      setPendingCompileResult(null);
      setLastSuccessfulResult(null);
      return;
    }

    if (!sessionId && (!code || !validCode)) {
      activePreviewRequestIdRef.current = NO_ACTIVE_PREVIEW_REQUEST_ID;
      setBooleanStateIfChanged(setContentLoaded, false);
      setBooleanStateIfChanged(setIsCompiling, false);
      setNullableStringStateIfChanged(setCompileError, null);
      setPendingCompileResult(null);
      setLastSuccessfulResult(null);
      return;
    }

    const requestId = nextPreviewRequestIdRef.current + 1;
    nextPreviewRequestIdRef.current = requestId;
    activePreviewRequestIdRef.current = requestId;

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
    setBooleanStateIfChanged(setContentLoaded, false);
    setBooleanStateIfChanged(setIsCompiling, true);
    setNullableStringStateIfChanged(setCompileError, null);
    setNullableStringStateIfChanged(setRuntimeError, null);

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
              sendUpdateCode(compileResult, currentConfig, requestId);
            } else {
              setPendingCompileResult({ result: compileResult, requestId });
            }
            setBooleanStateIfChanged(setIsCompiling, false);
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
          const issue = result.error?.details?.issues?.[0];
          const diagnosticPageId =
            result.error?.details?.pageId || result.error?.details?.demoId || demoId;
          const diagnostic: PreviewDiagnostic = {
            source: "post_generation_validation",
            stage: issue?.stage ?? "compile_transform",
            code: issue?.code,
            pageId: diagnosticPageId,
            file: diagnosticPageId ? `demos/${diagnosticPageId}/index.tsx` : undefined,
            message: issue?.message ?? message,
            instruction: issue?.instruction,
            moduleName: issue?.moduleName,
            importName: issue?.importName,
            codeHash: result.error?.details?.codeHash,
            moduleHash: result.error?.details?.moduleHash,
          };
          setNullableStringStateIfChanged(setCompileError, message);
          onErrorRef.current?.(createPreviewDiagnosticError(message, diagnostic));
          setPendingCompileResult(null);
          setBooleanStateIfChanged(setIsCompiling, false);
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
          sendUpdateCode(compileResult, currentConfig, requestId);
        } else {
          setPendingCompileResult({ result: compileResult, requestId });
        }

        setBooleanStateIfChanged(setIsCompiling, false);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "编译失败";
        const diagnostic: PreviewDiagnostic = {
          source: "post_generation_validation",
          stage: "compile_transform",
          pageId: demoId,
          file: demoId ? `demos/${demoId}/index.tsx` : undefined,
          message,
          instruction: "请修复 TSX/JSX 语法错误，保留一个完整的 React 组件模块后重新生成。",
        };
        setNullableStringStateIfChanged(setCompileError, message);
        onErrorRef.current?.(createPreviewDiagnosticError(message, diagnostic));
        setPendingCompileResult(null);
        setBooleanStateIfChanged(setIsCompiling, false);
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
      setNullableStringStateIfChanged(setRuntimeError, null);
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
      sendUpdateCode(
        pendingCompileResult.result,
        currentConfig,
        pendingCompileResult.requestId,
      );
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

      const { type, error, requestId } = event.data;
      const isCurrentPreviewRequest =
        typeof requestId === "number" &&
        requestId === activePreviewRequestIdRef.current;

      switch (type) {
        case "READY":
          reportTiming("iframe_ready");
          iframeReadyRef.current = true;
          setBooleanStateIfChanged(setIframeReady, true);
          if (isUrlMode && compiledJsUrl) {
            sendUpdateCodeUrl(compiledJsUrl, externalCssImports || [], configData || {});
          } else if (pendingCompileResult) {
            sendUpdateCode(
              pendingCompileResult.result,
              configData || {},
              pendingCompileResult.requestId,
            );
            setPendingCompileResult(null);
          } else if (lastSuccessfulResult) {
            sendUpdateCode(lastSuccessfulResult, configData || {});
          }
          sendVisualEditState();
          break;

        case "LOADED":
          if (!isCurrentPreviewRequest) return;
          reportTiming("iframe_loaded", {
            updateToLoadedMs:
              updateCodeSentAtRef.current != null &&
              typeof performance !== "undefined"
                ? Math.round(performance.now() - updateCodeSentAtRef.current)
                : undefined,
          });
          setNullableStringStateIfChanged(setRuntimeError, null);
          setBooleanStateIfChanged(setContentLoaded, true);
          if (!contentLoaded) {
            onContentLoaded?.();
          }
          sendCollectPositionableSizes();
          break;

        case "COMPONENT_READY":
          if (!isCurrentPreviewRequest) return;
          sendCollectPositionableSizes();
          break;

        case "RUNTIME_ERROR":
          if (!isCurrentPreviewRequest) return;
          {
            const message = error || "组件运行时发生错误";
            setNullableStringStateIfChanged(setRuntimeError, message);
            onErrorRef.current?.(
              createPreviewDiagnosticError(message, {
                source: "preview_runtime",
                stage: "runtime",
                pageId: demoId,
                file: demoId ? `demos/${demoId}/index.tsx` : undefined,
                message,
                instruction:
                  "请优先检查当前页面的 import、默认导出和渲染逻辑；图标和基础能力优先使用 @preview/sdk。",
              }),
            );
          }
          break;

        case "RESIZE":
          if (!isCurrentPreviewRequest) return;
          if (typeof event.data?.height === "number") {
            onContentHeightChange?.(event.data.height);
          }
          break;

        case "CONSOLE_LOG":
          if (event.data?.payload) {
            onConsoleEntryRef.current?.(event.data.payload as ConsoleLogPayload);
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
          if (!isCurrentPreviewRequest) return;
          if (event.data?.sizes) {
            onPositionableSizes?.(event.data.sizes as Record<string, PositionableSizeItem>);
          }
          break;

        case "VISUAL_NODE_TREE_RESULT":
          onVisualNodeTreeChange?.(
            Array.isArray(event.data?.nodes)
              ? (event.data.nodes as VisualNodeTreeItem[])
              : [],
          );
          break;

        case "VISUAL_HOVER":
          onVisualHover?.(event.data?.node ?? null);
          break;

        case "VISUAL_SELECT":
          onVisualSelect?.(event.data?.node ?? null);
          if (Array.isArray(event.data?.nodeStack)) {
            const nodeStack = event.data.nodeStack as VisualNodeInfo[];
            onVisualSelectStack?.(nodeStack);
            if (event.data?.openLayerPicker === true) {
              const point = event.data?.contextMenuPoint;
              const hasPoint =
                point &&
                typeof point.x === "number" &&
                typeof point.y === "number";
              const position = hasPoint
                ? getVisualContextMenuPosition(point)
                : null;
              if (position && nodeStack.length > 0) {
                const nodeTree =
                  event.data?.nodeTree && Array.isArray(event.data.nodeTree.children)
                    ? (event.data.nodeTree as VisualNodeTreeItem)
                    : null;
                setVisualContextMenu({
                  ...position,
                  tree: nodeTree ? [nodeTree] : buildVisualTreeFromStack(nodeStack),
                });
              } else {
                closeVisualContextMenu();
              }
            } else {
              closeVisualContextMenu();
            }
          } else {
            closeVisualContextMenu();
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
    onAppAction,
    onContentHeightChange,
    onContentLoaded,
    onPositionableSizes,
    sendUpdateCode,
    sendUpdateCodeUrl,
    sendCollectPositionableSizes,
    sendVisualEditState,
    sendCollectVisualNodeTree,
    onVisualHover,
    onVisualSelect,
    onVisualSelectStack,
    onVisualNodeTreeChange,
    getVisualContextMenuPosition,
    closeVisualContextMenu,
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
    hiddenVisualNodeIds,
    visualPropertyChanges,
    visualAnnotations,
    sendVisualEditState,
  ]);

  useEffect(() => {
    if (visualNodeTreeRequestKey == null) return;
    if (!iframeReadyRef.current) return;
    sendCollectVisualNodeTree();
  }, [sendCollectVisualNodeTree, visualNodeTreeRequestKey]);

  useEffect(() => {
    if (staticPrototypeRequestKey == null) return;
    if (staticPrototypeRequestKey <= 0) return;
    if (!iframeReadyRef.current) {
      onStaticPrototypeSnapshot?.({
        ok: false,
        error: "当前预览尚未加载完成",
      });
      return;
    }
    onStaticPrototypeSnapshot?.(
      extractStaticPrototypeSnapshot(iframeRef.current),
    );
  }, [onStaticPrototypeSnapshot, staticPrototypeRequestKey]);

  useEffect(() => {
    measureContainer();
  }, [measureContainer]);

  useEffect(() => {
    if (!shouldUsePassiveMeasureFallback()) return;
    if (skipNextPassiveMeasureRef.current) {
      skipNextPassiveMeasureRef.current = false;
      return;
    }
    measureContainer();
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateContainerSize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateContainerSize]);

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

  const hasPreviewSource = isUrlMode || (typeof code === "string" && code.length > 0);
  const showPreviewLoading = hasPreviewSource && (isCompiling || !contentLoaded);
  const showPreviewPendingText = showPreviewLoading && !isCompiling;
  const showPlaceholder =
    !!placeholderScreenshotUrl && !contentLoaded && !placeholderFailed;
  const showLoadingOverlay =
    showPreviewLoading && !showPlaceholder;
  const showEmptyPreview = !hasPreviewSource && !compileError && !runtimeError;

  useEffect(() => {
    if (!visualEditMode) {
      setVisualContextMenu(null);
    }
  }, [visualEditMode]);

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
    setIframeSrcUrl((current) => (current === url ? current : url));
    reportTiming("iframe_html_created", {
      cdnBase: resolvedCdnBaseUrl,
      transport: canUseFixedShell ? "fixed-shell" : "data-url",
      runtimeSource,
      shellMode,
    });
  }, [isUrlMode, resolvedCdnBaseUrl]);

  useEffect(() => {
    setBooleanStateIfChanged(setContentLoaded, false);
  }, [iframeSrcUrl]);

  useEffect(() => {
    setBooleanStateIfChanged(setPlaceholderFailed, false);
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
          className="absolute inset-0 z-30 m-2 flex items-center justify-center rounded-lg border border-border bg-background/95 p-4 text-center"
        >
          <p className="text-sm font-medium text-muted-foreground">正在修复预览</p>
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
        onClick={(event) => {
          if (!visualEditMode) return;
          if (event.target !== event.currentTarget) return;
          clearVisualSelection();
        }}
      >
        {iframeSrcUrl && (
          <div style={wrapperStyle} className={fillContainer ? "relative" : "rounded-lg border border-border relative"}>
            {showPlaceholder && (
              <div className="absolute inset-0 z-10 bg-muted/30 flex items-center justify-center rounded-lg pointer-events-none overflow-hidden">
                <img
                  src={placeholderScreenshotUrl}
                  alt="preview placeholder"
                  className="h-full w-full object-contain"
                  draggable={false}
                  onError={() => setBooleanStateIfChanged(setPlaceholderFailed, true)}
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
                {showPreviewPendingText && (
                  <p className="absolute mt-14 text-xs text-muted-foreground">
                    正在加载页面预览，若页面没有生成预览产物会继续尝试渲染源码
                  </p>
                )}
              </div>
            )}
            {showEmptyPreview && (
              <div className="absolute inset-0 z-20 bg-muted/30 flex items-center justify-center rounded-lg px-4 text-center">
                <p className="text-xs text-muted-foreground">等待页面代码加载</p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts allow-same-origin"
              src={iframeSrcUrl}
              style={{
                ...contentStyle,
                opacity: contentLoaded ? 1 : 0,
                transition: 'opacity 0.2s ease-in-out',
              }}
              title="预览"
            />
            {visualContextMenu && (
              <div
                className="absolute z-30"
                style={{
                  left: visualContextMenu.x,
                  top: visualContextMenu.y,
                }}
              >
                <LayerTreeMenu
                  title="预览区图层"
                  nodes={visualContextMenu.tree}
                  scrollClassName="layer-tree-menu-scrollbar"
                  selectedNodeId={selectedVisualNodeId}
                  onHoverNodeIdChange={updateVisualContextHover}
                  onSelectNode={(node, path) => {
                    visualEditStateRef.current = {
                      ...visualEditStateRef.current,
                      selectedNodeId: node.domPath,
                      hoverNodeId: null,
                    };
                    onVisualSelect?.(node);
                    onVisualSelectStack?.(path);
                    setVisualContextMenu(null);
                    sendVisualEditState();
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
