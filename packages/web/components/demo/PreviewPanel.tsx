"use client";

import React, { useState, useEffect, Component, type ErrorInfo } from "react";
import type { PreviewPanelProps, PreviewSize } from "./types";
import { compileCode } from "@/lib/compiler-client";
import { executeComponent } from "@/lib/component-executor";

const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 812,
};

function buildPreviewStyle(size?: PreviewSize): React.CSSProperties {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;

  const style: React.CSSProperties = {
    width: effectiveSize.width,
    height: effectiveSize.height,
    minHeight: effectiveSize.minHeight ?? "400px",
    margin: "0 auto",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    overflow: "hidden",
  };

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

class PreviewErrorBoundary extends Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">渲染出错</p>
          <p className="text-red-600 text-sm mt-1">
            {this.state.error?.message || "组件运行时发生错误"}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export function PreviewPanel({
  code,
  configData,
  sdkFiles: _sdkFiles,
  onError,
  className,
  previewSize,
}: PreviewPanelProps) {
  const [compiledComponent, setCompiledComponent] =
    useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  const validCode = isValidCode(code);

  useEffect(() => {
    if (!validCode) {
      setCompiledComponent(null);
      setCompileError(null);
      setIsCompiling(false);
      return;
    }

    let cancelled = false;
    setIsCompiling(true);
    setCompileError(null);

    compileCode(code)
      .then((result) => {
        if (cancelled) return;
        try {
          const Component = executeComponent(result.compiledCode);
          setCompiledComponent(() => Component);
        } catch (err) {
          setCompileError(err instanceof Error ? err.message : "执行编译后代码失败");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setCompileError(err instanceof Error ? err.message : "编译失败");
      })
      .finally(() => {
        if (!cancelled) {
          setIsCompiling(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, validCode]);

  const previewStyle = buildPreviewStyle(previewSize);

  return (
    <div className={className || "h-full w-full"}>
      {!validCode && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
          <p className="text-red-800 font-medium">⚠️ 代码加载失败</p>
          <p className="text-red-600 text-sm mt-1">
            检测到无效的代码文件（可能是文件路径而非代码内容）
          </p>
        </div>
      )}

      {isCompiling && (
        <div className="flex items-center justify-center p-8" style={previewStyle}>
          <div role="status" aria-label="编译中" className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {compileError && !isCompiling && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4" style={previewStyle}>
          <p className="text-red-800 font-medium">编译错误</p>
          <pre className="text-red-600 text-sm mt-2 whitespace-pre-wrap overflow-auto max-h-60">
            {compileError}
          </pre>
        </div>
      )}

      {compiledComponent && !isCompiling && (
        <PreviewErrorBoundary onError={onError}>
          <div style={previewStyle}>
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center p-8">
                  <div role="status" aria-label="加载中" className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
                </div>
              }
            >
              {React.createElement(compiledComponent, configData)}
            </React.Suspense>
          </div>
        </PreviewErrorBoundary>
      )}
    </div>
  );
}
