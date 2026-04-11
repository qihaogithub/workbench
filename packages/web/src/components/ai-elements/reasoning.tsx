"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Streamdown } from "streamdown";

interface ReasoningProps {
  content: string;
  duration?: number;
  isStreaming?: boolean;
  className?: string;
}

export function Reasoning({
  content,
  duration,
  isStreaming = false,
  className,
}: ReasoningProps) {
  // 流式时默认展开，非流式时默认折叠
  const [isExpanded, setIsExpanded] = useState(isStreaming);

  // 当 isStreaming 状态变化时，自动更新展开状态
  useEffect(() => {
    setIsExpanded(isStreaming);
  }, [isStreaming]);

  if (!content) return null;

  return (
    <div
      className={cn(
        "bg-muted/30 border border-muted rounded-lg overflow-hidden",
        className,
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
          ) : (
            <svg
              className="h-3 w-3 text-muted-foreground/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          )}
          <span className="font-medium">
            {isStreaming
              ? "思考中..."
              : duration
                ? `思考过程 (${(duration / 1000).toFixed(1)}s)`
                : "思考过程"}
          </span>
        </div>
        <svg
          className={cn(
            "h-4 w-4 transition-transform",
            isExpanded && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isExpanded && (
        <div className="px-3 py-2 border-t border-muted">
          <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-xs text-muted-foreground">
            {content}
          </Streamdown>
        </div>
      )}
    </div>
  );
}

export function ReasoningTrigger({
  onClick,
  duration,
  isStreaming,
}: {
  onClick: () => void;
  duration?: number;
  isStreaming?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <div
        className={cn(
          "h-2 w-2 rounded-full",
          isStreaming ? "bg-violet-500 animate-pulse" : "bg-violet-500",
        )}
      />
      <span>
        {isStreaming ? "思考中..." : duration ? `思考 (${duration}s)` : "思考"}
      </span>
    </button>
  );
}

export function ReasoningContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-3 py-2 border-t border-muted", className)}>
      {children}
    </div>
  );
}

// 别名导出，方便在 ai-chat 中使用
export const ReasoningDisplay = Reasoning;
