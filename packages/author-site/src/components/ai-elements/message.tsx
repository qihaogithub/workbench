"use client";

import { cn } from "@/lib/utils";
import type { ImageAttachment } from "@workbench/agent-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Bot,
  User,
  Copy,
  Check,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  X,
  MessageSquareText,
  Wrench,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Streamdown } from "streamdown";
import { Tool } from "./tool";
import { Reasoning } from "./reasoning";
import { AssistantMessage } from "./assistant-message";

/**
 * MessagePart 类型定义
 * 用于表示消息中的有序内容块
 */
export type MessagePart =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "reasoning";
      content: string;
      duration?: number;
      timestamp?: number;
    }
  | {
      type: "tool";
      toolCallId: string;
      toolName: string;
      status: "running" | "completed" | "error" | "awaiting-approval";
      parameters?: Record<string, unknown>;
      result?: unknown;
      details?: unknown;
      duration?: number;
      startedAt?: number;
      endedAt?: number;
    }
  | {
      type: "user_choice";
      requestId: string;
      question: string;
      description?: string;
      options: Array<{
        optionId: string;
        label: string;
        value?: string;
        description?: string;
      }>;
      allowCustom: boolean;
      status: "pending" | "answered" | "cancelled" | "expired";
      selected?: {
        type: "option" | "custom";
        optionId?: string;
        label?: string;
        value?: string;
        text?: string;
      };
    }
  | {
      type: "image";
      url: string;
      alt?: string;
    }
  | {
      type: "file";
      name: string;
      url: string;
      size?: number;
    };

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  kind?: "auto_repair";
  queueId?: string;
  queueStatus?: "queued" | "sending";
  /** @deprecated 使用 parts 数组替代 */
  content: string;
  autoRepair?: {
    status: "running" | "completed" | "failed";
    title: string;
    summary: string;
    debugDetail?: string;
    hiddenPrompt?: string;
  };
  /** 有序的内容块数组（推荐） */
  parts?: MessagePart[];
  /** @deprecated 使用 parts 中的 reasoning 类型替代 */
  reasoning?: {
    content: string;
    duration?: number;
  };
  /** @deprecated 使用 parts 中的 reasoning 类型替代 */
  reasonings?: Array<{
    content: string;
    duration?: number;
    timestamp?: number;
  }>;
  /** @deprecated 使用 parts 中的 tool 类型替代 */
  tools?: Array<{
    name: string;
    kind?: "read" | "edit" | "execute";
    path?: string;
    status: "running" | "completed" | "error";
    parameters?: Record<string, unknown>;
    result?: unknown;
  }>;
  /** @deprecated 使用 parts 中的 image 类型替代 */
  images?: Array<{
    url: string;
    alt?: string;
  }>;
  /** @deprecated 使用 parts 中的 file 类型替代 */
  files?: Array<{
    name: string;
    url: string;
    size?: number;
  }>;
}

interface MessageProps {
  message: ChatMessage;
  className?: string;
  isStreaming?: boolean;
  onEditResend?: (targetMessageId: string, newContent: string) => void;
  allMessages?: ChatMessage[];
  setMessages?: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  handleSend?: (
    content: string,
    images?: ImageAttachment[],
    options?: {
      source: "system_auto_repair";
      displayMessage: NonNullable<ChatMessage["autoRepair"]>;
    },
  ) => void;
  onCancelQueuedMessage?: (queueId: string) => void;
}

export function Message({
  message,
  className,
  isStreaming = false,
  onEditResend,
  allMessages,
  setMessages,
  handleSend,
  onCancelQueuedMessage,
}: MessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const visualAnnotationMarker = "<!-- VISUAL_ANNOTATION_CONTEXT";
  const isVisualAnnotationMessage =
    isUser && message.content.includes(visualAnnotationMarker);
  const visualAnnotationSummary = isVisualAnnotationMessage
    ? message.content.split(visualAnnotationMarker)[0].trim()
    : "";
  const visualAnnotationCount =
    visualAnnotationSummary.match(/(\d+)\s*条页面批注/)?.[1] ?? "";
  const visualStyleChangeCount = isVisualAnnotationMessage
    ? (message.content.match(/- 样式修改：/g) ?? []).length
    : 0;

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [editing]);

  const handleCopy = async () => {
    if (message.content) {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (message.role === "system" && message.kind === "auto_repair" && message.autoRepair) {
    return (
      <AutoRepairMessage
        message={message}
        className={className}
        onRetry={handleSend}
      />
    );
  }

  // 用户消息使用气泡样式
  if (isUser) {
    if (editing) {
      return (
        <div
          className={cn(
            "flex flex-col gap-2 items-end min-w-0",
            className,
          )}
        >
          <div className="w-full max-w-[80%] rounded-2xl rounded-tr-sm border border-border bg-muted">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full rounded-2xl rounded-tr-sm bg-transparent px-4 py-2.5 text-sm text-foreground resize-none outline-none min-h-[60px]"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditing(false);
                  setEditContent(message.content);
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (
                    onEditResend &&
                    message.id &&
                    editContent.trim() &&
                    editContent !== message.content
                  ) {
                    onEditResend(message.id, editContent);
                    setEditing(false);
                  } else {
                    setEditing(false);
                  }
                }
              }}
            />
            <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-t border-border/50">
              <button
                onClick={() => {
                  setEditing(false);
                  setEditContent(message.content);
                }}
                className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (
                    onEditResend &&
                    message.id &&
                    editContent.trim() &&
                    editContent !== message.content
                  ) {
                    onEditResend(message.id, editContent);
                  }
                  setEditing(false);
                }}
                disabled={
                  !editContent.trim() || editContent === message.content
                }
                className="px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      );
    }

    const userImageParts = (message.parts || []).filter(
      (p): p is Extract<MessagePart, { type: "image" }> =>
        p.type === "image",
    );

    return (
      <div className={cn("flex flex-col gap-2 group items-end min-w-0", className)}>
        {userImageParts.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end max-w-[80%]">
            {userImageParts.map((part, i) => (
              <img
                key={`user-img-${i}`}
                src={part.url}
                alt={part.alt || "用户上传图片"}
                className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-border/50"
              />
            ))}
          </div>
        )}
        {isVisualAnnotationMessage && (
          <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-foreground">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-blue-500/20 p-1.5 text-blue-400">
                <MessageSquareText className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="font-medium">页面批注已发送给 AI</p>
                <p className="text-xs text-muted-foreground">
                  {visualAnnotationCount
                    ? `包含 ${visualAnnotationCount} 条批注${visualStyleChangeCount > 0 ? `，其中 ${visualStyleChangeCount} 条包含样式修改` : ""}，AI 将根据页面上下文处理。`
                    : visualAnnotationSummary}
                </p>
              </div>
            </div>
          </div>
        )}
        {message.content && !isVisualAnnotationMessage && (
          <div className="max-w-[80%] min-w-0 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-muted text-foreground border border-border/50 group/user-msg relative">
            <div
              data-testid="user-message-markdown"
              className="min-w-0 max-w-none break-words [&_*]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
            >
              <Streamdown controls={{ table: false, code: true }}>
                {message.content}
              </Streamdown>
            </div>
            {message.queueStatus && (
              <div className="mt-2 flex items-center justify-end gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                <span>{message.queueStatus === "queued" ? "等待发送" : "正在发送"}</span>
                {message.queueStatus === "queued" && message.queueId && onCancelQueuedMessage && (
                  <button
                    type="button"
                    onClick={() => onCancelQueuedMessage(message.queueId!)}
                    className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                    取消
                  </button>
                )}
              </div>
            )}
            {!message.queueStatus && !isStreaming && onEditResend && message.id && (
              <button
                onClick={() => {
                  setEditContent(message.content);
                  setEditing(true);
                }}
                className="absolute -top-2 -left-2 p-1 rounded-full bg-background border border-border opacity-0 group-hover/user-msg:opacity-100 transition-opacity hover:bg-muted"
                title="编辑"
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // AI 消息使用 AssistantMessage 组件
  return (
    <AssistantMessage
      content={message.content}
      reasonings={message.reasonings}
      tools={message.tools}
      parts={message.parts}
      isStreaming={isStreaming}
      className={className}
    />
  );
}

function AutoRepairMessage({
  message,
  className,
  onRetry,
}: {
  message: ChatMessage;
  className?: string;
  onRetry?: MessageProps["handleSend"];
}) {
  const autoRepair = message.autoRepair;
  if (!autoRepair) return null;

  const statusConfig = {
    running: {
      label: "修复中",
      icon: Wrench,
      className: "border-blue-500/25 bg-blue-500/10 text-blue-300",
    },
    completed: {
      label: "已修复",
      icon: CheckCircle2,
      className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    },
    failed: {
      label: "修复失败",
      icon: AlertTriangle,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  }[autoRepair.status];
  const StatusIcon = statusConfig.icon;
  const canRetry = autoRepair.status === "failed" && autoRepair.hiddenPrompt && onRetry;

  return (
    <div className={cn("flex justify-center px-3 py-2", className)}>
      <div className="w-full max-w-[540px] rounded-lg border border-border/70 bg-card/80 px-3.5 py-3 text-sm text-foreground shadow-sm">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-6">
                {autoRepair.title}
              </p>
              <span
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium",
                  statusConfig.className,
                )}
              >
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
              </span>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate text-sm leading-5 text-muted-foreground">
                {autoRepair.summary}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {autoRepair.debugDetail && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        查看详情
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </DialogTrigger>
                    <DialogContent className="flex max-h-[82vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden p-0">
                      <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <DialogTitle className="text-base leading-6">
                            自动修复详情
                          </DialogTitle>
                          <span
                            className={cn(
                              "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium",
                              statusConfig.className,
                            )}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.label}
                          </span>
                        </div>
                        <DialogDescription className="text-sm leading-5">
                          {autoRepair.summary}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
                        <pre className="whitespace-pre-wrap break-words rounded-md border border-border/70 bg-background p-3 text-xs leading-relaxed text-muted-foreground">
                          {autoRepair.debugDetail}
                        </pre>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                {canRetry && (
                  <button
                    type="button"
                    onClick={() =>
                      onRetry(autoRepair.hiddenPrompt!, undefined, {
                        source: "system_auto_repair",
                        displayMessage: {
                          ...autoRepair,
                          status: "running",
                        },
                      })
                    }
                    className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    重新修复
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 文件附件组件
function FileAttachment({
  file,
}: {
  file: NonNullable<ChatMessage["files"]>[number];
}) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      pdf: "📄",
      doc: "📝",
      docx: "📝",
      txt: "📃",
      zip: "📦",
      rar: "📦",
      jpg: "🖼️",
      jpeg: "🖼️",
      png: "🖼️",
      gif: "🖼️",
    };
    return iconMap[ext || ""] || "📎";
  };

  return (
    <a
      href={file.url}
      download={file.name}
      className="flex items-center gap-2 p-2 bg-muted/50 hover:bg-muted rounded-lg transition-colors cursor-pointer"
    >
      <span className="text-lg">{getFileIcon(file.name)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{file.name}</p>
        {file.size && (
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)}
          </p>
        )}
      </div>
    </a>
  );
}
