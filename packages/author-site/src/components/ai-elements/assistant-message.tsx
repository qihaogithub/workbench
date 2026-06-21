"use client";

import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import { SplitContentRenderer } from "./split-content-renderer";
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

function getToolKind(toolName?: string): "read" | "edit" | "execute" | "delegate" | "other" {
  if (!toolName) return "other";
  const name = toolName.toLowerCase();
  if (name.includes("delegatetask") || name.includes("subagent")) return "delegate";
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
  if (toolKind === "delegate") return Sparkles;
  return Wrench;
}

function getToolGroupLabel(toolKind: string): string {
  if (toolKind === "read") return "读取文件";
  if (toolKind === "edit") return "编辑文件";
  if (toolKind === "execute") return "执行命令";
  if (toolKind === "delegate") return "子 Agent";
  return "工具操作";
}

function getToolActionText(part: ToolPart): string {
  const name = (part.toolName || "").toLowerCase();
  const task = part.parameters?.task;
  const path = (part.parameters?.path || part.parameters?.file_path) as
    | string
    | undefined;
  if (name.includes("delegatetask") || name.includes("subagent")) {
    return typeof task === "string" && task.trim()
      ? `委派子 Agent：${task.trim()}`
      : "委派子 Agent";
  }
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

function isDelegateTask(part: ToolPart): boolean {
  return getToolKind(part.toolName) === "delegate";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractResultText(result: unknown): string | undefined {
  if (typeof result === "string") return result;
  if (!isRecord(result)) return undefined;

  const content = result.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item) && typeof item.text === "string") return item.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return text || undefined;
  }

  return undefined;
}

function getSubagentDetails(part: ToolPart): Record<string, unknown> | undefined {
  if (!isRecord(part.result)) return undefined;
  if (isRecord(part.result.details)) return part.result.details;
  if (
    "success" in part.result ||
    "durationMs" in part.result ||
    "files" in part.result
  ) {
    return part.result;
  }
  return undefined;
}

function formatDuration(durationMs?: number): string | undefined {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return undefined;
  }
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function getFilePath(file: unknown): string | undefined {
  if (typeof file === "string") return file;
  if (!isRecord(file)) return undefined;
  const path = file.path ?? file.filePath ?? file.name;
  return typeof path === "string" ? path : undefined;
}

type SubagentDisplayStatus =
  | "running"
  | "completed"
  | "error"
  | "aborted"
  | "timeout";

function getSubagentDisplay(part: ToolPart) {
  const details = getSubagentDetails(part);
  const task =
    typeof part.parameters?.task === "string" && part.parameters.task.trim()
      ? part.parameters.task.trim()
      : "子 Agent 任务";
  const context =
    typeof part.parameters?.context === "string" && part.parameters.context.trim()
      ? part.parameters.context.trim()
      : undefined;
  const success = typeof details?.success === "boolean" ? details.success : undefined;
  const content =
    (typeof details?.content === "string" && details.content) ||
    extractResultText(part.result);
  const error =
    (typeof details?.error === "string" && details.error) ||
    (part.status === "error" ? content : undefined);
  const files = Array.isArray(details?.files) ? details.files : [];
  const durationMs =
    typeof details?.durationMs === "number"
      ? details.durationMs
      : typeof part.duration === "number"
        ? part.duration
        : undefined;
  const lowerFailure = `${error ?? ""} ${content ?? ""}`.toLowerCase();

  let status: SubagentDisplayStatus = "completed";
  if (part.status === "running") status = "running";
  else if (success === true) status = "completed";
  else if (lowerFailure.includes("timed out") || lowerFailure.includes("timeout")) {
    status = "timeout";
  } else if (lowerFailure.includes("aborted") || lowerFailure.includes("abort")) {
    status = "aborted";
  } else if (part.status === "error" || success === false) {
    status = "error";
  }

  return {
    task,
    context,
    status,
    content,
    error,
    files,
    durationText: formatDuration(durationMs),
  };
}

function getSubagentStatusText(status: SubagentDisplayStatus): string {
  if (status === "running") return "运行中";
  if (status === "completed") return "已完成";
  if (status === "timeout") return "超时未完成";
  if (status === "aborted") return "已取消";
  return "执行失败";
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
            <SplitContentRenderer
              key={`text-${index}`}
              content={block.content}
              isStreaming={isStreaming && isLastText}
            />
          );
        }

        if (block.type === "tool-single") {
          const part = block.part;
          if (isDelegateTask(part)) {
            return (
              <SubagentTaskBlock
                key={`tool-single-${index}`}
                part={part}
              />
            );
          }

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
          if (block.toolKind === "delegate") {
            return (
              <div key={`tool-group-${index}`} className="space-y-1">
                {block.parts.map((part, partIndex) => (
                  <SubagentTaskBlock
                    key={`delegate-${part.toolCallId || partIndex}`}
                    part={part}
                  />
                ))}
              </div>
            );
          }

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

function SubagentTaskBlock({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const display = getSubagentDisplay(part);
  const statusText = getSubagentStatusText(display.status);
  const filePaths = display.files.map(getFilePath).filter(Boolean) as string[];
  const isRunning = display.status === "running";
  const isFailed =
    display.status === "error" ||
    display.status === "timeout" ||
    display.status === "aborted";
  const summaryParts = [statusText];

  if (display.durationText) summaryParts.push(display.durationText);
  if (filePaths.length > 0) summaryParts.push(`修改 ${filePaths.length} 个文件`);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border/30 bg-muted/20 overflow-hidden">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/40 min-w-0">
          <Sparkles
            className={cn(
              "h-3.5 w-3.5 flex-shrink-0",
              isRunning && "animate-pulse text-yellow-500",
              !isRunning && !isFailed && "text-green-500",
              isFailed && "text-red-500",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {isRunning ? "子 Agent 正在处理" : "委派子 Agent"}
            </span>
            ：{display.task}
          </span>
          <span
            className={cn(
              "hidden flex-shrink-0 text-[11px] sm:inline",
              isRunning && "text-yellow-600",
              !isRunning && !isFailed && "text-green-600",
              isFailed && "text-red-600",
            )}
          >
            {summaryParts.join(" · ")}
          </span>
          {isRunning && (
            <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 text-muted-foreground/60" />
          )}
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground/40 transition-transform flex-shrink-0",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-2 border-t border-border/30 px-3 py-2.5 text-xs">
            <SubagentDetail label="委派任务" value={display.task} />
            {display.context && (
              <SubagentDetail label="补充上下文" value={display.context} />
            )}
            <SubagentDetail
              label="状态"
              value={[
                statusText,
                display.durationText,
                filePaths.length > 0 ? `修改 ${filePaths.length} 个文件` : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            {display.content && (
              <SubagentDetail
                label={isFailed ? "失败信息" : "子 Agent 摘要"}
                value={display.content}
                markdown
              />
            )}
            {!display.content && display.error && (
              <SubagentDetail label="失败原因" value={display.error} />
            )}
            {filePaths.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                  文件变更
                </div>
                <ul className="space-y-0.5">
                  {filePaths.map((path, index) => (
                    <li
                      key={`${path}-${index}`}
                      className="truncate rounded bg-background/50 px-2 py-1 font-mono text-[11px] text-muted-foreground"
                      title={path}
                    >
                      {path}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function SubagentDetail({
  label,
  value,
  markdown = false,
}: {
  label: string;
  value: string;
  markdown?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="min-w-0 rounded bg-background/50 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/80">
        {markdown ? (
          <Streamdown plugins={{ code, cjk }} controls={{ table: false, code: true }}>
            {value}
          </Streamdown>
        ) : (
          <span className="break-words">{value}</span>
        )}
      </div>
    </div>
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
  const contentRef = useRef<HTMLDivElement>(null);
  const isUserScrollingPhaseRef = useRef(false);

  const handlePhaseScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const threshold = 30;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isUserScrollingPhaseRef.current = !isNearBottom;
  }, []);

  useEffect(() => {
    if (!isStreaming || isComplete) return;
    if (isUserScrollingPhaseRef.current) return;
    const el = contentRef.current;
    if (!el) return;
    // 流式输出时用即时滚动跟上内容增长
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    });
  }, [parts, isStreaming, isComplete]);

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

  const reasoningCount = parts.filter((p) => p.type === "reasoning").length;
  const delegateCount = parts.filter(
    (p) => p.type === "tool" && isDelegateTask(p),
  ).length;
  const toolCount = parts.filter(
    (p) => p.type === "tool" && !isDelegateTask(p),
  ).length;

  const summaryParts: string[] = [];
  if (reasoningCount > 0) summaryParts.push(`${reasoningCount} 次思考`);
  if (delegateCount > 0) summaryParts.push(`${delegateCount} 个子 Agent`);
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
        <div className="relative">
          <div
            ref={contentRef}
            onScroll={handlePhaseScroll}
            className="pl-4 border-l border-border/20 ml-[5px] mt-0.5 space-y-0.5 max-h-72 overflow-y-auto overflow-x-hidden scrollbar-thin"
          >
            {parts.map((part, i) => {
              if (part.type === "reasoning") {
                return (
                  <div
                    key={`exec-r-${i}`}
                    className="flex items-start gap-1.5 text-[11px] text-muted-foreground/70 py-0.5"
                  >
                    <Sparkles className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 leading-relaxed break-words overflow-hidden">
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
                if (isDelegateTask(part)) {
                  return (
                    <SubagentTaskBlock
                      key={`exec-subagent-${i}`}
                      part={part}
                    />
                  );
                }

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

        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
