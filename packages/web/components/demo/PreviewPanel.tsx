"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { PreviewPanelProps, PreviewSize } from "./types";
import { generateIframeHtml } from "@/lib/iframe-template";

const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 812,
};

function buildPreviewStyle(
  size?: PreviewSize,
  iframeHeight?: number
): React.CSSProperties {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;

  const style: React.CSSProperties = {
    width: effectiveSize.width,
    margin: "0 auto",
    background: "#fff",
    display: "block",
  };

  // 如果有明确的 height，使用固定高度
  if (effectiveSize.height !== undefined) {
    style.height = effectiveSize.height;
  } else if (iframeHeight && iframeHeight > 0) {
    // 使用 iframe 回传的自适应高度
    style.height = iframeHeight;
  } else {
    style.minHeight = effectiveSize.minHeight ?? "400px";
  }

  if (effectiveSize.maxHeight !== undefined) {
    style.maxHeight = effectiveSize.maxHeight;
  }

  if (effectiveSize.scale !== undefined) {
    style.transform = `scale(${effectiveSize.scale})`;
    style.transformOrigin = "top center";
  }

  return style;
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

export function PreviewPanel({
  code,
  sessionId,
  configData,
  sdkFiles: _sdkFiles,
  onError,
  previewSize,
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(0);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeReadyRef = useRef(false);
  const [pendingCompileResult, setPendingCompileResult] = useState<CompileResult | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] = useState<CompileResult | null>(null);
  const [iframeSrcUrl, setIframeSrcUrl] = useState<string | null>(null);

  const validCode = code ? isValidCode(code) : true;

  // 使用 ref 追踪最新的 configData，避免编译 effect 依赖 configData
  const configDataRef = useRef(configData);
  configDataRef.current = configData;

  // 发送编译代码到 iframe
  const sendUpdateCode = useCallback(
    (result: CompileResult, config: Record<string, unknown> = {}) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        console.log('[PreviewPanel] sendUpdateCode: iframe 或 contentWindow 不存在');
        return;
      }

      console.log('[PreviewPanel] 发送 UPDATE_CODE 消息', {
        codeLength: result.compiledCode?.length,
        configData: config,
        cssImports: result.cssImports
      });

      iframe.contentWindow.postMessage(
        {
          type: "UPDATE_CODE",
          code: result.compiledCode,
          configData: config,
          cssImports: result.cssImports,
        },
        "*"
      );
    },
    []
  );

  // 发送配置更新到 iframe
  const sendUpdateConfig = useCallback(
    (config: Record<string, unknown>) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        console.log('[PreviewPanel] sendUpdateConfig: iframe 或 contentWindow 不存在');
        return;
      }

      console.log('[PreviewPanel] 发送 UPDATE_CONFIG 消息', { configData: config });

      iframe.contentWindow.postMessage(
        {
          type: "UPDATE_CONFIG",
          configData: config,
        },
        "*"
      );
    },
    []
  );

  // 编译代码 effect
  useEffect(() => {
    // 如果有 sessionId，通过 session 读取代码编译
    // 如果有 code，直接编译代码
    // 如果都没有，不编译
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
        const body = sessionId
          ? { sessionId }
          : { code };

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
        console.log('[PreviewPanel] 编译成功', {
          codeLength: compileResult.compiledCode?.length,
          dependencies: compileResult.dependencies?.length,
          cssImports: compileResult.cssImports?.length
        });
        setLastSuccessfulResult(compileResult);

        const currentConfig = configDataRef.current || {};
        if (iframeReadyRef.current) {
          console.log('[PreviewPanel] iframe 已就绪，立即发送代码');
          sendUpdateCode(compileResult, currentConfig);
        } else {
          console.log('[PreviewPanel] iframe 未就绪，缓存编译结果');
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
  }, [code, sessionId, validCode, sendUpdateCode]);

  // configData 变化时发送 UPDATE_CONFIG
  useEffect(() => {
    if (!iframeReady || !lastSuccessfulResult) return;

    // 如果有运行时错误，清除它（配置变更可能修复错误）
    if (runtimeError) {
      setRuntimeError(null);
    }

    sendUpdateConfig(configData || {});
  }, [configData, iframeReady, lastSuccessfulResult, runtimeError, sendUpdateConfig]);

  // 监听 iframe 消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const { type, error, height, stack } = event.data;

      console.log('[PreviewPanel] 收到 iframe 消息', { type, error, height });

      switch (type) {
        case "READY":
          console.log('[PreviewPanel] iframe 已就绪');
          iframeReadyRef.current = true;
          setIframeReady(true);
          if (pendingCompileResult) {
            console.log('[PreviewPanel] 发送待处理的编译结果');
            sendUpdateCode(pendingCompileResult, configData || {});
            setPendingCompileResult(null);
          } else if (lastSuccessfulResult) {
            console.log('[PreviewPanel] 重新发送上一版成功结果');
            sendUpdateCode(lastSuccessfulResult, configData || {});
          }
          break;

        case "LOADED":
          console.log('[PreviewPanel] 组件已加载');
          setRuntimeError(null);
          break;

        case "RUNTIME_ERROR":
          console.log('[PreviewPanel] 运行时错误', { error, stack });
          setRuntimeError(error || "组件运行时发生错误");
          onError?.(new Error(error || "组件运行时发生错误"));
          break;

        case "RESIZE":
          if (typeof height === "number" && height > 0) {
            console.log('[PreviewPanel] iframe 高度调整', { height });
            setIframeHeight(height);
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    pendingCompileResult,
    lastSuccessfulResult,
    configData,
    onError,
    sendUpdateCode,
  ]);

  const previewStyle = buildPreviewStyle(previewSize, iframeHeight);

  // 使用 Blob URL 替代 srcdoc，避免 CORS 问题
  useEffect(() => {
    console.log('[PreviewPanel] 创建 iframe Blob URL');
    const html = generateIframeHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    console.log('[PreviewPanel] iframe Blob URL 已创建', { url });
    setIframeSrcUrl(url);

    return () => {
      console.log('[PreviewPanel] 清理 iframe Blob URL');
      URL.revokeObjectURL(url);
    };
  }, []);

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
          style={previewStyle}
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

      {iframeSrcUrl && (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-same-origin"
          src={iframeSrcUrl}
          style={previewStyle}
          className="w-full h-full"
          title="预览"
        />
      )}
    </>
  );
}
