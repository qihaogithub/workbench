"use client";

import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import "katex/dist/katex.min.css";
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

// 渲染块定义：文本块、推理块、工具块
type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string; duration?: number }
  | { type: "tool"; part: MessagePart };

export function AssistantMessage({
  content,
  reasonings = [],
  tools = [],
  parts,
  isStreaming = false,
  className,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);

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

  // 按类型分组：每个类型都独立成块
  const renderBlocks: RenderBlock[] = useMemo(() => {
    const blocks: RenderBlock[] = [];
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

    normalizedParts.forEach((part) => {
      if (part.type === "reasoning") {
        // 遇到 reasoning 时，先刷新前面的 reasoning 块
        flushReasoning();
        reasoningContent +=
          (reasoningContent ? "\n\n" : "") + (part.content || "");
        if (part.duration) {
          reasoningDuration = part.duration;
        }
      } else if (part.type === "tool") {
        // 每个 tool 独立为一个块
        flushReasoning();
        blocks.push({ type: "tool", part });
      } else if (part.type === "text") {
        // 遇到文本时，刷新前面的 reasoning
        flushReasoning();
        if (part.content?.trim()) {
          blocks.push({ type: "text", content: part.content });
        }
      }
    });

    // 收尾
    flushReasoning();

    return blocks;
  }, [normalizedParts]);

  // 如果没有内容且不在流式传输中，返回 null
  if (renderBlocks.length === 0 && !isStreaming) {
    return null;
  }

  // 如果正在流式传输但没有内容块，显示初始加载状态
  const showInitialLoading = isStreaming && renderBlocks.length === 0;

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
        "flex flex-col gap-2 w-full min-w-0 group relative py-1",
        className,
      )}
    >
      {/* 初始加载状态 - 使用 Reasoning 组件保持样式统一 */}
      {showInitialLoading && (
        <Reasoning isStreaming={true}>
          <ReasoningTrigger />
          <ReasoningContent>{""}</ReasoningContent>
        </Reasoning>
      )}

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
              className="prose prose-sm dark:prose-invert max-w-none min-w-0"
            >
              <Streamdown
                plugins={{ code, mermaid, math, cjk }}
                isAnimating={isStreaming && index === renderBlocks.length - 1}
                caret="block"
                controls={{ table: false, code: true, mermaid: true }}
              >
                {block.content}
              </Streamdown>
            </div>
          );
        }

        // 渲染工具调用（直接展示，不折叠）
        if (block.type === "tool") {
          const part = block.part;
          const name = (part.toolName || "").toLowerCase();
          const path = (part.parameters?.path ||
            part.parameters?.file_path) as string;

          // 智能映射图标与文案
          let ToolIcon = Wrench;
          let actionText = part.toolName || "未知操作";

          if (name.includes("read")) {
            ToolIcon = Eye;
            actionText = path ? path : "读取文件";
          } else if (name.includes("edit") || name.includes("write")) {
            ToolIcon = Edit3;
            actionText = path ? path : "修改文件";
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
              key={`tool-${index}`}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 py-0.5 min-w-0"
            >
              <ToolIcon className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{actionText}</span>
              {part.status === "running" && (
                <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
              )}
            </div>
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
