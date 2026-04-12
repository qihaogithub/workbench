"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Streamdown } from "streamdown";
import { Loader2, Check, Copy } from "lucide-react";
import { Tool, type ToolEntry } from "./tool";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "./chain-of-thought";

interface MessagePart {
  type: "text" | "reasoning" | "tool" | "image" | "file";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  status?: "running" | "completed" | "error" | "awaiting-approval";
  parameters?: Record<string, unknown>;
  result?: unknown;
  duration?: number;
  timestamp?: number;
}

interface AssistantMessageProps {
  content?: string;
  /** @deprecated 使用 parts 替代 */
  reasonings?: Array<{
    content: string;
    duration?: number;
    timestamp?: number;
  }>;
  /** @deprecated 使用 parts 替代 */
  tools?: Array<{
    name: string;
    kind?: "read" | "edit" | "execute";
    path?: string;
    status: "running" | "completed" | "error" | "awaiting-approval";
    parameters?: Record<string, unknown>;
    result?: unknown;
  }>;
  /** 有序的内容块数组（推荐） */
  parts?: MessagePart[];
  isStreaming?: boolean;
  className?: string;
}

/**
 * 统一的 Assistant 消息卡片
 *
 * 使用 parts 数组渲染，保持内容的时间线顺序
 * - ReasoningPart -> ChainOfThoughtStep
 * - ToolCallPart -> ChainOfThoughtStep
 * - TextPart -> 普通 Markdown 正文
 */
export function AssistantMessage({
  content,
  reasonings = [],
  tools = [],
  parts,
  isStreaming = false,
  className,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [chainOpen, setChainOpen] = useState(isStreaming);

  // 当 isStreaming 从 true 变为 false 时，自动折叠 ChainOfThought
  useEffect(() => {
    if (!isStreaming) {
      setChainOpen(false);
    } else {
      setChainOpen(true);
    }
  }, [isStreaming]);

  // 兼容旧的 reasonings/tools 格式，转换为 parts
  const normalizedParts: MessagePart[] = parts ? [...parts] : [];

  // 如果没有 parts 但有旧的 reasonings/tools，进行兼容转换
  if (
    normalizedParts.length === 0 &&
    (reasonings.length > 0 || tools.length > 0)
  ) {
    const converted: MessagePart[] = [];

    // 转换 reasonings
    for (const r of reasonings) {
      converted.push({
        type: "reasoning",
        content: r.content,
        duration: r.duration,
        timestamp: r.timestamp,
      });
    }

    // 转换 tools
    for (const t of tools) {
      converted.push({
        type: "tool",
        toolCallId: (t.parameters?.toolCallId as string) || `tool-${t.name}`,
        toolName: t.name,
        status: t.status,
        parameters: t.parameters,
        result: t.result,
      });
    }

    // 如果有文本内容，添加到末尾
    if (content) {
      converted.push({
        type: "text",
        content,
      });
    }

    normalizedParts.push(...converted);
  }

  // 检查是否有中间过程内容（reasoning 或 tool）
  const hasProcessContent = normalizedParts.some(
    (p) => p.type === "reasoning" || p.type === "tool",
  );

  // 提取纯文本内容（TextPart 或 content 字段）
  const textParts = normalizedParts.filter((p) => p.type === "text");
  const finalContent =
    textParts.length > 0
      ? textParts.map((p) => p.content).join("\n\n")
      : content;

  // 如果什么都没有，显示加载状态
  if (!hasProcessContent && !finalContent) {
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

  const handleCopy = async () => {
    if (finalContent) {
      await navigator.clipboard.writeText(finalContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 按文件路径合并工具调用
  const groupToolsByPath = (
    toolParts: Array<{
      toolName: string;
      status: any;
      parameters?: Record<string, unknown>;
      result?: unknown;
    }>,
  ) => {
    const groups = new Map<string, { path?: string; entries: ToolEntry[] }>();
    for (const tool of toolParts) {
      const path = (tool.parameters?.path || tool.parameters?.file_path) as
        | string
        | undefined;
      const key = path || tool.toolName;
      if (!groups.has(key)) {
        groups.set(key, { path, entries: [] });
      }
      groups.get(key)!.entries.push({
        name: tool.toolName,
        status: tool.status,
        parameters: tool.parameters,
        result: tool.result,
      });
    }
    return Array.from(groups.values());
  };

  return (
    <div className={cn("w-full rounded-lg border bg-card", className)}>
      {/* ChainOfThought - 渲染中间过程 */}
      {hasProcessContent && (
        <ChainOfThought open={chainOpen} onOpenChange={setChainOpen}>
          <ChainOfThoughtHeader>
            {isStreaming ? "处理中" : "处理过程"}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {normalizedParts.map((part, index) => {
              // 渲染 ReasoningPart
              if (part.type === "reasoning") {
                const reasoningContent = part.content || "";
                return (
                  <ChainOfThoughtStep
                    key={`reasoning-${index}`}
                    status="complete"
                    title={
                      reasoningContent.length > 50
                        ? reasoningContent.slice(0, 50) + "..."
                        : reasoningContent
                    }
                    description={
                      part.duration
                        ? `耗时 ${(part.duration / 1000).toFixed(1)}s`
                        : undefined
                    }
                  >
                    <div className="text-xs text-muted-foreground mt-1">
                      <Streamdown>{reasoningContent}</Streamdown>
                    </div>
                  </ChainOfThoughtStep>
                );
              }

              // 渲染 ToolCallPart
              if (part.type === "tool") {
                const status =
                  part.status === "running"
                    ? "active"
                    : part.status === "completed"
                      ? "complete"
                      : part.status === "error"
                        ? "complete"
                        : "pending";

                return (
                  <ChainOfThoughtStep
                    key={`tool-${part.toolCallId || index}`}
                    status={status}
                    title={part.toolName || "工具调用"}
                  >
                    <div className="mt-1">
                      <Tool
                        entries={[
                          {
                            name: part.toolName || "未知工具",
                            status: part.status || "completed",
                            parameters: part.parameters,
                            result: part.result,
                          },
                        ]}
                      />
                    </div>
                  </ChainOfThoughtStep>
                );
              }

              return null;
            })}
          </ChainOfThoughtContent>
        </ChainOfThought>
      )}

      {/* 正文内容 */}
      {finalContent && (
        <div
          className={cn(
            "group relative",
            hasProcessContent && "border-t border-border/40",
          )}
        >
          <div className="px-3 py-3">
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none overflow-hidden">
              <div className="overflow-x-auto">
                <Streamdown className="[&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-all [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
                  {finalContent}
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
