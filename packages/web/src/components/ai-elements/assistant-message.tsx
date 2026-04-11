"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Streamdown } from "streamdown";
import {
  ChevronDown,
  ChevronRight,
  Bot,
  Sparkles,
  Loader2,
  Check,
  Copy,
} from "lucide-react";
import { Tool, type ToolEntry } from "./tool";

interface AssistantMessageProps {
  content?: string;
  reasonings?: Array<{
    content: string;
    duration?: number;
    timestamp?: number;
  }>;
  tools?: Array<{
    name: string;
    kind?: "read" | "edit" | "execute";
    path?: string;
    status: "running" | "completed" | "error" | "awaiting-approval";
    parameters?: Record<string, unknown>;
    result?: unknown;
  }>;
  isStreaming?: boolean;
  className?: string;
}

/**
 * 统一的 Assistant 消息卡片
 *
 * 布局策略（与 Cursor/Trae 一致）：
 * 1. 思考过程（折叠，顶部）
 * 2. 工具调用（折叠，中部）
 * 3. 正文内容（始终可见，底部）
 *
 * 流式和完成状态使用同一套布局，仅展开状态不同
 */
export function AssistantMessage({
  content,
  reasonings = [],
  tools = [],
  isStreaming = false,
  className,
}: AssistantMessageProps) {
  // 流式时 reasoning 默认展开，完成后默认折叠
  const [reasoningOpen, setReasoningOpen] = useState(isStreaming);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // 当 isStreaming 从 true 变为 false 时，自动折叠 reasoning
  // 但如果是用户手动展开的，不要强制折叠
  useEffect(() => {
    if (!isStreaming) {
      // 完成后折叠，但如果用户已经手动展开 tools，保持 reasoning 不动
      setReasoningOpen(false);
    } else {
      // 流式开始时展开
      setReasoningOpen(true);
    }
  }, [isStreaming]);

  const hasReasoning = reasonings.length > 0;
  const hasTools = tools.length > 0;
  const hasContent = !!content;

  // 如果什么都没有，显示加载状态
  if (!hasReasoning && !hasTools && !hasContent) {
    if (!isStreaming) return null;
    
    return (
      <div className={cn("w-full rounded-lg border bg-card", className)}>
        <div className="flex items-center gap-3 px-3 py-3">
          <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
          <span className="text-sm text-muted-foreground">思考中...</span>
        </div>
      </div>
    );
  }

  // 按文件路径合并工具调用
  const groupedTools = (() => {
    const groups = new Map<string, { path?: string; entries: ToolEntry[] }>();
    for (const tool of tools) {
      const path = (tool.path ||
        tool.parameters?.path ||
        tool.parameters?.file_path) as string | undefined;
      const key = path || tool.name;
      if (!groups.has(key)) {
        groups.set(key, { path, entries: [] });
      }
      groups.get(key)!.entries.push({
        name: tool.name,
        kind: tool.kind,
        status: tool.status,
        parameters: tool.parameters,
        result: tool.result,
      });
    }
    return Array.from(groups.values());
  })();

  const handleCopy = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn("w-full rounded-lg border bg-card", className)}>
      {/* 顶部：思考过程 */}
      {hasReasoning && (
        <div className={cn(hasContent && "border-b border-border/40")}>
          <button
            onClick={() => setReasoningOpen(!reasoningOpen)}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
          >
            {reasoningOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {isStreaming ? (
              <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            )}
            <span className="font-medium text-foreground">
              {isStreaming ? "思考中" : `思考过程 (${reasonings.length})`}
            </span>
            {reasonings.length > 1 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {reasonings.reduce((acc, r) => acc + (r.duration || 0), 0) > 0
                  ? `${(reasonings.reduce((acc, r) => acc + (r.duration || 0), 0) / 1000).toFixed(1)}s`
                  : ""}
              </span>
            )}
          </button>

          {reasoningOpen && (
            <div className="px-3 pb-3 space-y-2">
              {reasonings.map((r, index) => (
                <div
                  key={index}
                  className="rounded-md border border-border/40 bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                    <span>思考 {index + 1}</span>
                    {r.duration && (
                      <span>({(r.duration / 1000).toFixed(1)}s)</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Streamdown>{r.content}</Streamdown>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 中部：工具调用 */}
      {hasTools && (
        <div className={cn(hasContent && "border-b border-border/40")}>
          <button
            onClick={() => setToolsOpen(!toolsOpen)}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
          >
            {toolsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Bot className="h-3.5 w-3.5 text-blue-500" />
            <span className="font-medium text-foreground">
              工具调用 ({tools.length})
            </span>
            {tools.some((t) => t.status === "running") && (
              <Loader2 className="h-3 w-3 ml-auto text-yellow-500 animate-spin" />
            )}
          </button>

          {toolsOpen && (
            <div className="px-3 pb-2 space-y-1">
              {groupedTools.map((group, index) => (
                <Tool
                  key={index}
                  path={group.path}
                  entries={group.entries}
                  className="text-xs"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 底部：正文内容 */}
      {hasContent && (
        <div className="group relative">
          <div className="px-3 py-3">
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none overflow-hidden">
              <div className="overflow-x-auto">
                <Streamdown className="[&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-all [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
                  {content}
                </Streamdown>
              </div>
            </div>
          </div>

          {/* 消息操作按钮 */}
          <div className="flex items-center gap-1 px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
