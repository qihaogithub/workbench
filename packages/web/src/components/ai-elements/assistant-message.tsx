"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { Streamdown } from "streamdown";
import {
  Loader2,
  Check,
  Copy,
  Eye,
  Terminal,
  Edit3,
  Wrench,
  Search,
} from "lucide-react";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./reasoning";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
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
  parts?: MessagePart[];
  isStreaming?: boolean;
  className?: string;
}

// 渲染块定义：文本块、推理块、过程块（仅包含工具）
type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string; duration?: number }
  | { type: "process"; parts: MessagePart[] };

export function AssistantMessage({
  content,
  reasonings = [],
  tools = [],
  parts,
  isStreaming = false,
  className,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  // 修复问题1：为每个处理过程块使用独立的展开状态
  const [processOpenState, setProcessOpenState] = useState<
    Record<number, boolean>
  >({});

  useEffect(() => {
    // 当流式传输结束时，可以选择关闭所有过程块，或者保持原状态
    // 这里我们保持原状态不变，让用户手动控制
  }, [isStreaming]);

  const normalizedParts: MessagePart[] = useMemo(() => {
    const parts_copy = parts ? [...parts] : [];

    // 兼容旧的 reasonings/tools 格式，转换为 parts
    if (
      parts_copy.length === 0 &&
      (reasonings.length > 0 || tools.length > 0 || content)
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
      if (content && parts_copy.length === 0) {
        converted.push({
          type: "text",
          content,
        });
      }

      parts_copy.push(...converted);
    }

    if (parts_copy.length === 0 && content) {
      parts_copy.push({ type: "text", content });
    }

    return parts_copy;
  }, [parts, reasonings, tools, content]);

  // 按类型分组：reasoning 独立出来，tool 和连续的 tool 组合成 process 块
  const renderBlocks: RenderBlock[] = useMemo(() => {
    const blocks: RenderBlock[] = [];
    let currentToolGroup: MessagePart[] = [];
    let reasoningContent = "";
    let reasoningDuration: number | undefined;

    const flushReasoning = () => {
      if (reasoningContent.trim()) {
        blocks.push({
          type: "reasoning",
          content: reasoningContent.trim(),
          duration: reasoningDuration,
        });
        reasoningContent = "";
        reasoningDuration = undefined;
      }
    };

    const flushTools = () => {
      if (currentToolGroup.length > 0) {
        blocks.push({ type: "process", parts: currentToolGroup });
        currentToolGroup = [];
      }
    };

    normalizedParts.forEach((part) => {
      if (part.type === "reasoning") {
        // 遇到 reasoning 时，先刷新前面的工具块
        flushTools();
        reasoningContent +=
          (reasoningContent ? "\n\n" : "") + (part.content || "");
        if (part.duration) {
          reasoningDuration = part.duration;
        }
      } else if (part.type === "tool") {
        // 遇到 tool 时，先刷新前面的 reasoning
        flushReasoning();
        currentToolGroup.push(part);
      } else if (part.type === "text") {
        // 遇到文本时，刷新前面的 reasoning 和 tools
        flushReasoning();
        flushTools();
        if (part.content?.trim()) {
          blocks.push({ type: "text", content: part.content });
        }
      }
    });

    // 收尾
    flushReasoning();
    flushTools();

    return blocks;
  }, [normalizedParts]);

  // 如果什么都没有，显示初始加载状态
  if (renderBlocks.length === 0) {
    if (!isStreaming) return null;
    return (
      <div className={cn("flex flex-col gap-4 w-full py-2", className)}>
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
          <span className="text-sm text-muted-foreground">思考中...</span>
        </div>
      </div>
    );
  }

  // 获取所有纯文本用于一键复制
  const allTextContent = renderBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("\n\n");

  const handleCopy = async () => {
    if (allTextContent) {
      await navigator.clipboard.writeText(allTextContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 w-full group relative py-1",
        className,
      )}
    >
      {renderBlocks.map((block, index) => {
        // 渲染推理内容（使用官方的 Reasoning 组件）
        if (block.type === "reasoning") {
          return (
            <Reasoning
              key={`reasoning-${index}`}
              isStreaming={isStreaming && index === renderBlocks.length - 1}
              duration={block.duration}
            >
              <ReasoningTrigger />
              <ReasoningContent>{block.content}</ReasoningContent>
            </Reasoning>
          );
        }

        // 渲染纯文本内容
        if (block.type === "text") {
          return (
            <div
              key={`text-${index}`}
              className="prose prose-sm dark:prose-invert max-w-none"
            >
              <Streamdown className="[&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-all [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
                {block.content}
              </Streamdown>
            </div>
          );
        }

        // 渲染工具过程（仅包含 tool，不再包含 reasoning）
        if (block.type === "process") {
          // 使用每个过程块的独立展开状态
          const isOpen = processOpenState[index] ?? true; // 默认展开

          return (
            <ChainOfThought
              key={`process-${index}`}
              open={isOpen}
              onOpenChange={(open) => {
                setProcessOpenState((prev) => ({ ...prev, [index]: open }));
              }}
            >
              <ChainOfThoughtHeader>
                {isStreaming && index === renderBlocks.length - 1
                  ? "处理中..."
                  : "处理过程"}
              </ChainOfThoughtHeader>

              <ChainOfThoughtContent>
                <div className="flex flex-col gap-3 py-1">
                  {block.parts.map((part, pIndex) => {
                    // 工具呈现：一个图标 + 简短的动作描述
                    if (part.type === "tool") {
                      const name = (part.toolName || "").toLowerCase();
                      const path = (part.parameters?.path ||
                        part.parameters?.file_path) as string;

                      // 智能映射图标与文案
                      let ToolIcon = Wrench;
                      let actionText = part.toolName || "未知操作";

                      if (name.includes("read")) {
                        ToolIcon = Eye;
                        actionText = path ? `读取 ${path}` : "读取文件";
                      } else if (
                        name.includes("edit") ||
                        name.includes("write")
                      ) {
                        ToolIcon = Edit3;
                        actionText = path ? `修改 ${path}` : "修改文件";
                      } else if (
                        name.includes("execute") ||
                        name.includes("cmd") ||
                        name.includes("terminal")
                      ) {
                        ToolIcon = Terminal;
                        actionText = "执行命令";
                      } else if (name.includes("search")) {
                        ToolIcon = Search;
                        actionText = "搜索资料";
                      }

                      return (
                        <div
                          key={pIndex}
                          className="flex items-center gap-2.5 text-[13px] font-medium text-foreground/90 my-0.5"
                        >
                          <ToolIcon className="h-4 w-4 text-muted-foreground/80" />
                          <span>{actionText}</span>
                          {/* 如果正在运行，跟一个加载圈 */}
                          {part.status === "running" && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </ChainOfThoughtContent>
            </ChainOfThought>
          );
        }
        return null;
      })}

      {/* 消息的整体操作按钮 (只在鼠标 Hover 时显示) */}
      {allTextContent && (
        <div className="absolute -bottom-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10 bg-background/80 backdrop-blur rounded p-1 shadow-sm">
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
      )}
    </div>
  );
}
