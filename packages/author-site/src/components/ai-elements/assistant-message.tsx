"use client";

import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef } from "react";
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
  ChevronDown,
  Sparkles,
  RotateCcw,
  Undo2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./reasoning";
import { CodeBlockFolder } from "./collapsible-code-block";
import { type MessagePart } from "./message";

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
  messageId?: string;
  hasFileChanges?: boolean;
  onRegenerate?: (targetAssistantId: string) => void;
  onRollback?: (targetAssistantId: string) => void;
}

function getToolKind(toolName?: string): "read" | "edit" | "execute" | "other" {
  if (!toolName) return "other";
  const name = toolName.toLowerCase();
  if (
    name.includes("read") ||
    name.includes("get") ||
    name.includes("search") ||
    name.includes("glob") ||
    name.includes("grep")
  )
    return "read";
  if (
    name.includes("edit") ||
    name.includes("write") ||
    name.includes("create") ||
    name.includes("delete")
  )
    return "edit";
  if (
    name.includes("bash") ||
    name.includes("exec") ||
    name.includes("run") ||
    name.includes("command")
  )
    return "execute";
  return "other";
}

type ReasoningPart = Extract<MessagePart, { type: "reasoning" }>;
type ToolPart = Extract<MessagePart, { type: "tool" }>;

type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning-group"; reasonings: ReasoningPart[] }
  | { type: "tool-group"; parts: ToolPart[]; toolKind: string }
  | { type: "tool-single"; part: ToolPart }
  | { type: "image"; url: string; alt?: string }
  | { type: "file"; name: string; url: string; size?: number }
  | { type: "execution-phase"; parts: MessagePart[] };

function getToolIcon(toolKind: string) {
  if (toolKind === "read") return Eye;
  if (toolKind === "edit") return Edit3;
  if (toolKind === "execute") return Terminal;
  return Wrench;
}

function getToolGroupLabel(toolKind: string): string {
  if (toolKind === "read") return "读取文件";
  if (toolKind === "edit") return "编辑文件";
  if (toolKind === "execute") return "执行命令";
  return "工具操作";
}

function getToolActionText(part: ToolPart): string {
  const name = (part.toolName || "").toLowerCase();
  const path = (part.parameters?.path || part.parameters?.file_path) as
    | string
    | undefined;
  if (
    name.includes("read") ||
    name.includes("search") ||
    name.includes("glob") ||
    name.includes("grep")
  ) {
    return path || "读取文件";
  }
  if (
    name.includes("edit") ||
    name.includes("write") ||
    name.includes("create") ||
    name.includes("delete")
  ) {
    return path || "修改文件";
  }
  if (
    name.includes("bash") ||
    name.includes("exec") ||
    name.includes("run") ||
    name.includes("command")
  ) {
    return "执行命令";
  }
  return part.toolName || "未知操作";
}

export function AssistantMessage({
  content,
  reasonings = [],
  tools = [],
  parts,
  isStreaming = false,
  className,
  messageId,
  hasFileChanges = false,
  onRegenerate,
  onRollback,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);

  const normalizedParts: MessagePart[] = useMemo(() => {
    const parts_copy = parts ? [...parts] : [];

    if (
      parts_copy.length === 0 &&
      (reasonings.length > 0 || tools.length > 0 || content)
    ) {
      const converted: MessagePart[] = [];

      for (const r of reasonings) {
        converted.push({
          type: "reasoning",
          content: r.content,
          duration: r.duration,
          timestamp: r.timestamp,
        });
      }

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

  const renderBlocks: RenderBlock[] = useMemo(() => {
    const blocks: RenderBlock[] = [];
    let currentExecution: MessagePart[] = [];
    let currentReasonings: ReasoningPart[] = [];
    let currentToolGroup: { parts: ToolPart[]; toolKind: string } | null = null;

    const flushExecution = () => {
      if (currentExecution.length > 0) {
        blocks.push({ type: "execution-phase", parts: [...currentExecution] });
        currentExecution = [];
      }
    };

    const flushReasonings = () => {
      if (currentReasonings.length > 0) {
        blocks.push({
          type: "reasoning-group",
          reasonings: [...currentReasonings],
        });
        currentReasonings = [];
      }
    };

    const flushTools = () => {
      if (!currentToolGroup || currentToolGroup.parts.length === 0) return;
      if (currentToolGroup.parts.length >= 2) {
        blocks.push({
          type: "tool-group",
          parts: [...currentToolGroup.parts],
          toolKind: currentToolGroup.toolKind,
        });
      } else {
        blocks.push({ type: "tool-single", part: currentToolGroup.parts[0] });
      }
      currentToolGroup = null;
    };

    normalizedParts.forEach((part) => {
      if (part.type === "reasoning") {
        // 如果有暂存的纯工具，纳入执行阶段
        if (currentToolGroup && currentToolGroup.parts.length > 0) {
          currentToolGroup.parts.forEach((t) => currentExecution.push(t));
          currentToolGroup = null;
        }
        flushReasonings();
        currentExecution.push(part);
      } else if (part.type === "tool") {
        flushReasonings();
        if (currentExecution.length > 0) {
          // 已在执行阶段中，直接加入
          currentExecution.push(part);
        } else {
          // 纯工具聚合逻辑
          const toolKind = getToolKind(part.toolName);
          if (currentToolGroup && currentToolGroup.toolKind === toolKind) {
            currentToolGroup.parts.push(part);
          } else {
            flushTools();
            currentToolGroup = { parts: [part], toolKind };
          }
        }
      } else if (part.type === "text") {
        flushExecution();
        flushReasonings();
        flushTools();
        if (part.content?.trim()) {
          blocks.push({ type: "text", content: part.content });
        }
      } else if (part.type === "image") {
        flushExecution();
        flushReasonings();
        flushTools();
        blocks.push({ type: "image", url: part.url, alt: part.alt });
      } else if (part.type === "file") {
        flushExecution();
        flushReasonings();
        flushTools();
        blocks.push({
          type: "file",
          name: part.name,
          url: part.url,
          size: part.size,
        });
      }
    });

    flushExecution();
    flushReasonings();
    flushTools();
    return blocks;
  }, [normalizedParts]);

  if (renderBlocks.length === 0 && !isStreaming) {
    return null;
  }

  const showInitialLoading = isStreaming && renderBlocks.length === 0;

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
      {showInitialLoading && (
        <Reasoning isStreaming={true}>
          <ReasoningTrigger />
          <ReasoningContent>{""}</ReasoningContent>
        </Reasoning>
      )}

      {renderBlocks.map((block, index) => {
        if (block.type === "reasoning-group") {
          const lastDuration =
            block.reasonings[block.reasonings.length - 1]?.duration;
          return (
            <Reasoning
              key={`reasoning-group-${index}`}
              isStreaming={isStreaming && index === renderBlocks.length - 1}
              duration={lastDuration}
            >
              <ReasoningTrigger
                getThinkingMessage={(streaming, duration) => (
                  <span className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Sparkles
                      className={cn(
                        "h-3 w-3 text-muted-foreground/50 flex-shrink-0",
                        streaming && "animate-pulse",
                      )}
                    />
                    <span className="text-xs text-muted-foreground/60 truncate">
                      {streaming
                        ? "思考中..."
                        : duration
                          ? `思考了 ${Math.round(duration / 1000)} 秒`
                          : "思考过程"}
                    </span>
                  </span>
                )}
              />
              {block.reasonings.map((r, i) => (
                <div key={i}>
                  <ReasoningContent>{r.content}</ReasoningContent>
                  {i < block.reasonings.length - 1 && (
                    <div className="border-t border-dashed border-border/30 my-1.5 ml-4" />
                  )}
                </div>
              ))}
            </Reasoning>
          );
        }

        if (block.type === "execution-phase") {
          const isLast = index === renderBlocks.length - 1;
          return (
            <ExecutionPhase
              key={`execution-phase-${index}`}
              parts={block.parts}
              isStreaming={isStreaming}
              isComplete={isStreaming && !isLast}
            />
          );
        }

        if (block.type === "text") {
          const isLastText = index === renderBlocks.length - 1;
          return (
            <CodeBlockFolder
              key={`text-${index}`}
              isStreaming={isStreaming && isLastText}
            >
              <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 text-[14px]">
                <Streamdown
                  plugins={{ code, mermaid, math, cjk }}
                  isAnimating={isStreaming && isLastText}
                  caret="block"
                  controls={{ table: false, code: true, mermaid: true }}
                >
                  {block.content}
                </Streamdown>
              </div>
            </CodeBlockFolder>
          );
        }

        if (block.type === "tool-single") {
          const part = block.part;
          const toolKind = getToolKind(part.toolName);
          const Icon = getToolIcon(toolKind);
          const actionText = getToolActionText(part);

          return (
            <div
              key={`tool-single-${index}`}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 py-0.5 min-w-0"
            >
              <Icon className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{actionText}</span>
              {part.status === "running" && (
                <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
              )}
            </div>
          );
        }

        if (block.type === "tool-group") {
          const Icon = getToolIcon(block.toolKind);
          const label = getToolGroupLabel(block.toolKind);
          const hasRunning = block.parts.some((p) => p.status === "running");

          return (
            <ToolCallGroup
              key={`tool-group-${index}`}
              icon={Icon}
              label={label}
              count={block.parts.length}
              parts={block.parts}
              isRunning={hasRunning}
            />
          );
        }

        if (block.type === "image") {
          return (
            <img
              key={`image-${index}`}
              src={block.url}
              alt={block.alt}
              className="max-w-full rounded-md"
            />
          );
        }

        if (block.type === "file") {
          return (
            <a
              key={`file-${index}`}
              href={block.url}
              className="text-sm text-blue-500 underline"
            >
              📎 {block.name}
            </a>
          );
        }

        return null;
      })}

      {isStreaming && renderBlocks.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 py-0.5">
          <span className="inline-flex items-center gap-0.5">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
          <span>AI 工作中</span>
        </div>
      )}

      {allTextContent && (
        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            disabled={isStreaming}
            className="p-1.5 rounded opacity-40 hover:opacity-100 hover:bg-muted/50 transition-all"
            title="复制"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          {!isStreaming && onRegenerate && messageId && (
            <button
              onClick={() => onRegenerate(messageId)}
              className="p-1.5 rounded opacity-40 hover:opacity-100 hover:bg-muted/50 transition-all"
              title="重新生成"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {!isStreaming && hasFileChanges && onRollback && messageId && (
            <button
              onClick={() => onRollback(messageId)}
              className="p-1.5 rounded opacity-40 hover:opacity-100 hover:bg-muted/50 transition-all"
              title="回撤"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCallGroup({
  icon: Icon,
  label,
  count,
  parts,
  isRunning,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  parts: ToolPart[];
  isRunning: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1 py-1.5 text-xs transition-colors select-none min-w-0 group/tool">
        <Icon className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-muted-foreground/60 truncate">
          {label} ({count} 个)
        </span>
        {isRunning && (
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 text-muted-foreground/50" />
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground/30 transition-transform duration-200 flex-shrink-0 group-hover/tool:text-muted-foreground/50",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="pl-4 border-l border-border/20 ml-[5px] mt-0.5">
          {parts.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 py-0.5"
            >
              <span className="truncate">{getToolActionText(p)}</span>
              {p.status === "running" && (
                <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExecutionPhase({
  parts,
  isStreaming,
  isComplete,
}: {
  parts: MessagePart[];
  isStreaming: boolean;
  isComplete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wasStreamingRef = useRef(false);

  // 当执行阶段从"正在构建"变为"已完成"时，延迟 800ms 自动折叠
  useEffect(() => {
    if (isStreaming && !isComplete) {
      wasStreamingRef.current = true;
      setOpen(true);
    } else if (wasStreamingRef.current && isComplete) {
      const timer = setTimeout(() => {
        setOpen(false);
        wasStreamingRef.current = false;
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isComplete]);

  // 统计信息
  const reasoningCount = parts.filter((p) => p.type === "reasoning").length;
  const toolCount = parts.filter((p) => p.type === "tool").length;

  const summaryParts: string[] = [];
  if (reasoningCount > 0) summaryParts.push(`${reasoningCount} 次思考`);
  if (toolCount > 0) summaryParts.push(`${toolCount} 次工具调用`);

  const hasRunning = parts.some(
    (p) => p.type === "tool" && p.status === "running",
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1.5 text-xs transition-colors select-none min-w-0 group/phase">
        <Wrench className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-muted-foreground/60 truncate">
          执行过程（{summaryParts.join("、")}）
        </span>
        {hasRunning && (
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 text-muted-foreground/50" />
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground/30 transition-transform duration-200 flex-shrink-0 group-hover/phase:text-muted-foreground/50",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="pl-4 border-l border-border/20 ml-[5px] mt-0.5 space-y-0.5 max-h-72 overflow-y-auto">
          {parts.map((part, i) => {
            if (part.type === "reasoning") {
              return (
                <div
                  key={`exec-r-${i}`}
                  className="flex items-start gap-1.5 text-[11px] text-muted-foreground/70 py-0.5"
                >
                  <Sparkles className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 leading-relaxed">
                    <Streamdown
                      plugins={{ code, cjk }}
                      controls={{ table: false, code: true }}
                    >
                      {part.content}
                    </Streamdown>
                  </div>
                </div>
              );
            }

            if (part.type === "tool") {
              const toolKind = getToolKind(part.toolName);
              const Icon = getToolIcon(toolKind);
              const actionText = getToolActionText(part);
              return (
                <div
                  key={`exec-t-${i}`}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 py-0.5"
                >
                  <Icon className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{actionText}</span>
                  {part.status === "running" && (
                    <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                  )}
                  {part.status === "error" && (
                    <span className="text-red-400 text-[10px]">失败</span>
                  )}
                  {part.status === "awaiting-approval" && (
                    <span className="text-yellow-400 text-[10px]">
                      等待确认
                    </span>
                  )}
                </div>
              );
            }

            return null;
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
