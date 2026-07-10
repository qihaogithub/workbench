"use client";

import { cn } from "@/lib/utils";
import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type ComponentType,
} from "react";
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
  ExternalLink,
  RefreshCw,
  Link2,
} from "lucide-react";
import type {
  ExternalAuthProvider,
  ExternalAuthRequiredDetails,
  ExternalAuthStartResponse,
  ExternalAuthStatusResponse,
} from "@workbench/shared";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./reasoning";
import { SplitContentRenderer } from "./split-content-renderer";
import { type MessagePart } from "./message";
import { UserChoiceCard } from "./user-choice-card";
import { ChatCard } from "./chat-card";
import type { UserChoiceResponse } from "./chat/services/stream-service";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  onExternalAuthConnected?: (targetAssistantId: string) => void;
  onUserChoiceResponse?: (requestId: string, choice: UserChoiceResponse) => void;
  externalAuthSessionId?: string;
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
type UserChoicePart = Extract<MessagePart, { type: "user_choice" }>;

type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning-group"; reasonings: ReasoningPart[] }
  | { type: "tool-group"; parts: ToolPart[]; toolKind: string }
  | { type: "tool-single"; part: ToolPart }
  | { type: "user-choice"; part: UserChoicePart }
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

function getExternalAuthRequiredDetails(
  part: ToolPart,
): ExternalAuthRequiredDetails | null {
  const candidates: unknown[] = [part.details];
  if (isRecord(part.result)) {
    candidates.push(part.result.details);
  }

  for (const candidate of candidates) {
    if (
      isRecord(candidate) &&
      candidate.kind === "external_auth_required" &&
      (candidate.provider === "figma" || candidate.provider === "dingtalk") &&
      typeof candidate.title === "string" &&
      typeof candidate.message === "string"
    ) {
      return candidate as unknown as ExternalAuthRequiredDetails;
    }
  }
  return null;
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
  const directDetails = isRecord(part.details) ? part.details : undefined;
  if (!isRecord(part.result)) return directDetails;
  if (isRecord(part.result.details)) return part.result.details;
  if (
    "success" in part.result ||
    "durationMs" in part.result ||
    "files" in part.result
  ) {
    return part.result;
  }
  return directDetails;
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

function getPageCountFromPaths(paths: string[]): number {
  const pageIds = new Set<string>();
  for (const item of paths) {
    const match = item.replace(/\\/g, "/").match(/(?:^|\/)demos\/([^/]+)/);
    if (match?.[1]) pageIds.add(match[1]);
  }
  return pageIds.size;
}

type SubagentDisplayStatus =
  | "running"
  | "returned"
  | "completed"
  | "error"
  | "aborted"
  | "timeout";

function getSubagentDisplay(part: ToolPart, isMessageStreaming = false) {
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
  const rawStatus = String(part.status);
  const isRunningStatus =
    rawStatus === "running" ||
    rawStatus === "in_progress" ||
    rawStatus === "pending" ||
    rawStatus === "awaiting-approval";

  let status: SubagentDisplayStatus = "completed";
  if (isRunningStatus) status = "running";
  else if (rawStatus === "completed" && isMessageStreaming) status = "returned";
  else if (success === true) status = "completed";
  else if (lowerFailure.includes("timed out") || lowerFailure.includes("timeout")) {
    status = "timeout";
  } else if (lowerFailure.includes("aborted") || lowerFailure.includes("abort")) {
    status = "aborted";
  } else if (rawStatus === "error" || rawStatus === "failed" || success === false) {
    status = "error";
  } else if (isMessageStreaming) {
    status = "running";
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
  if (status === "returned") return "待主 Agent 汇总";
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
  onExternalAuthConnected,
  onUserChoiceResponse,
  externalAuthSessionId,
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
        if (getExternalAuthRequiredDetails(part)) {
          flushExecution();
          flushReasonings();
          flushTools();
          blocks.push({ type: "tool-single", part });
          return;
        }
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
      } else if (part.type === "user_choice") {
        flushExecution();
        flushReasonings();
        flushTools();
        blocks.push({ type: "user-choice", part });
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

  const allTextContent = renderBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("\n\n");
  const showRunProgressPanel = isStreaming && renderBlocks.length === 0;
  const showActionBar = Boolean(allTextContent) || (isStreaming && !showRunProgressPanel);

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
              externalAuthSessionId={externalAuthSessionId}
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

        if (block.type === "user-choice") {
          return (
            <UserChoiceCard
              key={`user-choice-${block.part.requestId}`}
              part={block.part}
              onRespond={onUserChoiceResponse}
            />
          );
        }

        if (block.type === "tool-single") {
          const part = block.part;
          const authRequired = getExternalAuthRequiredDetails(part);
          if (authRequired) {
            return (
              <ExternalAuthCard
                key={`external-auth-${index}`}
                details={authRequired}
                sessionId={externalAuthSessionId}
                onConnected={
                  messageId && onExternalAuthConnected
                    ? () => onExternalAuthConnected(messageId)
                    : undefined
                }
              />
            );
          }

          if (isDelegateTask(part)) {
            return (
              <SubagentTaskBlock
                key={`tool-single-${index}`}
                part={part}
                isMessageStreaming={isStreaming}
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
                    isMessageStreaming={isStreaming}
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
              externalAuthSessionId={externalAuthSessionId}
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

      {showRunProgressPanel && <RunProgressPanel />}

      {showActionBar && (
        <MessageActionBar
          allTextContent={allTextContent}
          copied={copied}
          isStreaming={isStreaming}
          hasFileChanges={hasFileChanges}
          messageId={messageId}
          onCopy={handleCopy}
          onRegenerate={onRegenerate}
          onRollback={onRollback}
        />
      )}
    </div>
  );
}

function MessageActionBar({
  allTextContent,
  copied,
  isStreaming,
  hasFileChanges,
  messageId,
  onCopy,
  onRegenerate,
  onRollback,
}: {
  allTextContent: string;
  copied: boolean;
  isStreaming: boolean;
  hasFileChanges: boolean;
  messageId?: string;
  onCopy: () => void;
  onRegenerate?: (targetAssistantId: string) => void;
  onRollback?: (targetAssistantId: string) => void;
}) {
  return (
    <div
      data-testid="assistant-message-actions"
      className={cn(
        "mt-1 flex min-h-7 items-center gap-1 transition-opacity",
        isStreaming ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
    >
      {isStreaming && <RunProgressPanel inline />}
      {!isStreaming && allTextContent && (
        <button
          type="button"
          onClick={onCopy}
          disabled={isStreaming}
          className={cn(
            "cursor-pointer rounded p-1.5 transition-all hover:bg-muted/50 hover:opacity-100 disabled:cursor-not-allowed disabled:hover:bg-transparent",
            isStreaming ? "opacity-70" : "opacity-40",
          )}
          title="复制"
          aria-label="复制"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      {!isStreaming && onRegenerate && messageId && (
        <button
          type="button"
          onClick={() => onRegenerate(messageId)}
          className="cursor-pointer rounded p-1.5 opacity-40 transition-all hover:bg-muted/50 hover:opacity-100"
          title="重新生成"
          aria-label="重新生成"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      {!isStreaming && hasFileChanges && onRollback && messageId && (
        <button
          type="button"
          onClick={() => onRollback(messageId)}
          className="cursor-pointer rounded p-1.5 opacity-40 transition-all hover:bg-muted/50 hover:opacity-100"
          title="回撤"
          aria-label="回撤"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
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
  externalAuthSessionId,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  count: number;
  parts: ToolPart[];
  isRunning: boolean;
  externalAuthSessionId?: string;
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
            getExternalAuthRequiredDetails(p) ? (
              <ExternalAuthCard
                key={`auth-${p.toolCallId || i}`}
                details={getExternalAuthRequiredDetails(p)!}
                sessionId={externalAuthSessionId}
                compact
              />
            ) : (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 py-0.5"
              >
                <span className="truncate">{getToolActionText(p)}</span>
                {p.status === "running" && (
                  <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                )}
              </div>
            )
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SubagentTaskBlock({
  part,
  isMessageStreaming = false,
}: {
  part: ToolPart;
  isMessageStreaming?: boolean;
}) {
  const display = getSubagentDisplay(part, isMessageStreaming);
  const statusText = getSubagentStatusText(display.status);
  const filePaths = display.files.map(getFilePath).filter(Boolean) as string[];
  const pageCount = getPageCountFromPaths(filePaths);
  const isRunning = display.status === "running";
  const isReturned = display.status === "returned";
  const isFailed =
    display.status === "error" ||
    display.status === "timeout" ||
    display.status === "aborted";
  const resultMessage =
    display.content ||
    display.error ||
    (isRunning
      ? "子 Agent 正在处理，还没有返回消息。"
      : "子 Agent 没有返回文本消息。");
  const summaryParts = [statusText];

  if (display.durationText) summaryParts.push(display.durationText);
  if (filePaths.length > 0) summaryParts.push(`修改 ${filePaths.length} 个文件`);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md border border-border/30 bg-muted/20 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/40 min-w-0">
          <Sparkles
            className={cn(
              "h-3.5 w-3.5 flex-shrink-0",
              isRunning && "animate-pulse text-yellow-500",
              isReturned && "text-blue-500",
              !isRunning && !isReturned && !isFailed && "text-green-500",
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
              isReturned && "text-blue-600",
              !isRunning && !isReturned && !isFailed && "text-green-600",
              isFailed && "text-red-600",
            )}
          >
            {summaryParts.join(" · ")}
          </span>
          {isRunning && (
            <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 text-muted-foreground/60" />
          )}
          <ChevronDown className="h-3 w-3 -rotate-90 text-muted-foreground/40 flex-shrink-0" />
        </button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[82vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base">子 Agent 对话记录</DialogTitle>
        </DialogHeader>
        <div className="scrollbar-thin mx-auto flex min-h-0 w-full max-w-[620px] flex-1 flex-col gap-3 overflow-y-auto pr-1 text-xs">
          <SubagentReadonlyMessage
            role="user"
            title="主 Agent"
            content={display.task}
          />
          <SubagentReadonlyMessage
            role="assistant"
            title="子 Agent"
            content={resultMessage}
          />
        </div>
        <SubagentStatusBar
          statusText={statusText}
          statusTone={
            isFailed ? "danger" : isRunning ? "warning" : isReturned ? "info" : "success"
          }
          durationText={display.durationText || (isRunning ? "进行中" : "未记录")}
          pageText={pageCount > 0 ? `${pageCount} 个页面` : "页面未识别"}
          fileText={filePaths.length > 0 ? `${filePaths.length} 个文件` : "无文件变更"}
        />
      </DialogContent>
    </Dialog>
  );
}

function SubagentReadonlyMessage({
  role,
  title,
  content,
}: {
  role: "user" | "assistant";
  title: string;
  content: string;
}) {
  const isUser = role === "user";
  const [expanded, setExpanded] = useState(false);
  const shouldFold =
    isUser && (content.length > 420 || content.split(/\r?\n/).length > 8);

  return (
    <div className={cn("flex min-w-0", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "leading-relaxed",
          isUser
            ? "max-w-[86%] rounded-lg border border-border/40 bg-muted/60 px-3 py-2 text-foreground"
            : "w-full max-w-full px-0 py-0 text-foreground/85",
        )}
      >
        <div
          className="mb-1 text-[10px] font-medium text-muted-foreground"
        >
          {title}
        </div>
        <div className="relative">
          <div
            className={cn(
              "break-words text-[12px]",
              shouldFold && !expanded && "max-h-32 overflow-hidden",
            )}
          >
            <Streamdown plugins={{ code, cjk }} controls={{ table: false, code: true }}>
              {content}
            </Streamdown>
          </div>
          {shouldFold && !expanded && (
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-8",
                isUser
                  ? "bg-gradient-to-t from-muted to-muted/0"
                  : "bg-gradient-to-t from-background to-background/0",
              )}
            />
          )}
        </div>
        {shouldFold && (
          <button
            type="button"
            className={cn(
              "mt-2 inline-flex items-center gap-1 text-[11px] transition-colors",
              isUser
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起消息" : "展开完整消息"}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
    </div>
  );
}

function SubagentStatusBar({
  statusText,
  statusTone,
  durationText,
  pageText,
  fileText,
}: {
  statusText: string;
  statusTone: "success" | "warning" | "danger" | "info";
  durationText: string;
  pageText: string;
  fileText: string;
}) {
  return (
    <div className="-mx-6 -mb-6 mt-2 shrink-0 border-t border-border/30 bg-background/95 px-6 py-3">
      <div className="mx-auto flex w-full max-w-[620px] flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span>状态</span>
        <span
          className={cn(
            "font-medium",
            statusTone === "success" && "text-green-600",
            statusTone === "warning" && "text-yellow-600",
            statusTone === "danger" && "text-red-600",
            statusTone === "info" && "text-blue-600",
          )}
        >
          {statusText}
        </span>
      </span>
      <span>耗时 {durationText}</span>
      <span>{pageText}</span>
      <span>{fileText}</span>
      </div>
    </div>
  );
}

const WORKING_DOT_PATH = [
  1, 2, 3, 8, 13, 18, 23, 22, 21, 16, 11, 6, 5, 10, 15, 20, 12, 7, 0,
] as const;

const WORKING_DOT_ORDER: Map<number, number> = new Map<number, number>(
  WORKING_DOT_PATH.map((dotIndex, order): [number, number] => [
    dotIndex,
    order,
  ]),
);

function DotMatrixWorkingIndicator() {
  return (
    <div className="grid grid-cols-5 gap-[2px]" aria-hidden="true">
      {Array.from({ length: 25 }, (_, index) => {
        const order = WORKING_DOT_ORDER.get(index);
        return (
          <span
            key={index}
            data-testid="ai-working-dot"
            className={cn(
              "ai-working-dot h-[3px] w-[3px] rounded-full",
              order === undefined && "ai-working-dot-idle",
              order === 0 && "ai-working-dot-current",
            )}
            style={
              order === undefined
                ? undefined
                : { animationDelay: `${order * -76}ms` }
            }
          />
        );
      })}
    </div>
  );
}

function RunProgressPanel({ inline = false }: { inline?: boolean }) {
  return (
    <div
      role="status"
      aria-label="AI 正在处理"
      data-testid="ai-working-indicator"
      className={cn(
        "flex justify-start",
        inline
          ? "h-7 w-7 items-center justify-center rounded text-muted-foreground"
          : "px-1 py-0.5",
      )}
    >
      <DotMatrixWorkingIndicator />
    </div>
  );
}

function getProviderLabel(provider: ExternalAuthProvider): string {
  return provider === "figma" ? "Figma" : "钉钉";
}

function getProviderDescription(provider: ExternalAuthProvider): string {
  return provider === "figma"
    ? "授权后，AI 只能访问你在 Figma 中本来有权限访问的设计稿。"
    : "授权后，AI 只能访问你在钉钉中本来有权限访问的文档、表格和知识库。";
}

function ExternalAuthCard({
  details,
  sessionId,
  compact = false,
  onConnected,
}: {
  details: ExternalAuthRequiredDetails;
  sessionId?: string;
  compact?: boolean;
  onConnected?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [unsupported, setUnsupported] = useState(details.reason === "unsupported");
  const autoContinueTriggeredRef = useRef(false);
  const providerLabel = getProviderLabel(details.provider);

  const markConnected = (message: string) => {
    setConnected(true);
    setUnsupported(false);
    setStatusText(message);
    setAuthUrl(null);
    setUserCode(null);
    if (!autoContinueTriggeredRef.current && onConnected) {
      autoContinueTriggeredRef.current = true;
      setTimeout(onConnected, 350);
    }
  };

  const startAuth = async () => {
    setLoading(true);
    setStatusText(null);
    try {
      setUnsupported(false);
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
      const response = await fetch(
        `/api/user/external-auth/${details.provider}/start${query}`,
      );
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error?.message || "启动授权失败");
      }

      const data = body.data as ExternalAuthStartResponse;
      if (data.status === "connected") {
        markConnected(`${providerLabel} 已连接，正在继续刚才的请求。`);
        return;
      }
      if (data.status === "unsupported") {
        setUnsupported(true);
        setConnected(false);
        setAuthUrl(null);
        setUserCode(null);
        setStatusText(data.message || `${providerLabel} 当前部署未启用。`);
        return;
      }

      setUnsupported(false);
      const nextUrl = data.authUrl || data.verificationUrl || null;
      setAuthUrl(nextUrl);
      setUserCode(data.userCode || null);
      setStatusText(data.message || `请在浏览器完成 ${providerLabel} 授权。`);
      setConnected(false);
      if (nextUrl) {
        const link = document.createElement("a");
        link.href = nextUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "启动授权失败");
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    setChecking(true);
    try {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
      const response = await fetch(`/api/user/external-auth${query}`);
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error?.message || "刷新授权状态失败");
      }

      const data = body.data as ExternalAuthStatusResponse;
      const provider = data.providers.find(
        (item) => item.provider === details.provider,
      );
      if (provider?.status === "connected") {
        markConnected(
          `${providerLabel} 已连接${provider.accountLabel ? `：${provider.accountLabel}` : ""}，正在继续刚才的请求。`,
        );
      } else if (provider?.status === "unsupported") {
        setConnected(false);
        setUnsupported(true);
        setAuthUrl(null);
        setUserCode(null);
        setStatusText(provider.message || `${providerLabel} 当前部署未启用。`);
      } else {
        setConnected(false);
        setUnsupported(false);
        setStatusText(provider?.message || `${providerLabel} 还未完成授权。`);
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "刷新授权状态失败");
    } finally {
      setChecking(false);
    }
  };

  return (
    <ChatCard
      className={cn(
        "border-border/50 bg-muted/20 p-3",
        compact && "my-1",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-background/70 text-foreground/80">
          <Link2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="font-medium text-foreground">
              {details.title || `连接 ${providerLabel} 后继续`}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {details.message}
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
              {getProviderDescription(details.provider)}
            </div>
          </div>

          {userCode && (
            <div className="inline-flex items-center gap-2 rounded-md border border-border/40 bg-background/60 px-2.5 py-1.5 text-xs">
              <span className="text-muted-foreground">授权码</span>
              <code className="font-mono text-foreground">{userCode}</code>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigator.clipboard?.writeText(userCode)}
              >
                复制
              </button>
            </div>
          )}

          {statusText && (
            <div className="text-xs leading-relaxed text-muted-foreground">
              {statusText}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startAuth}
              disabled={loading || connected || unsupported}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-70",
                connected || unsupported
                  ? "border border-border/50 bg-background/50 text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : connected ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              {connected
                ? "已连接"
                : unsupported
                  ? "当前不可用"
                  : details.reason === "expired"
                  ? "重新授权"
                  : `连接 ${providerLabel}`}
            </button>
            <button
              type="button"
              onClick={refreshStatus}
              disabled={checking}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/50 bg-background/50 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {checking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {unsupported
                ? "重新检查配置"
                : connected
                  ? "重新检查授权"
                  : "我已完成授权"}
            </button>
            {authUrl && (
              <a
                href={authUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-500 underline underline-offset-2"
              >
                打开授权页
              </a>
            )}
          </div>
        </div>
      </div>
    </ChatCard>
  );
}

function ExecutionPhase({
  parts,
  isStreaming,
  isComplete,
  externalAuthSessionId,
}: {
  parts: MessagePart[];
  isStreaming: boolean;
  isComplete: boolean;
  externalAuthSessionId?: string;
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
      <div className="flex items-center gap-1.5 py-1.5 text-xs">
        <CollapsibleTrigger asChild>
          <button className="group/phase flex min-w-0 flex-1 items-center gap-1.5 text-left transition-colors select-none">
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
          </button>
        </CollapsibleTrigger>
      </div>
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
                const authRequired = getExternalAuthRequiredDetails(part);
                if (authRequired) {
                  return (
                    <ExternalAuthCard
                      key={`exec-auth-${part.toolCallId || i}`}
                      details={authRequired}
                      sessionId={externalAuthSessionId}
                      compact
                    />
                  );
                }

                if (isDelegateTask(part)) {
                  return (
                    <SubagentTaskBlock
                      key={`exec-subagent-${i}`}
                      part={part}
                      isMessageStreaming={isStreaming}
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
