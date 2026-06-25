"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Bot,
  User,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  X,
  MessageSquareText,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  /** @deprecated 使用 parts 数组替代 */
  content: string;
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
  handleSend?: (content: string) => void;
}

export function Message({
  message,
  className,
  isStreaming = false,
  onEditResend,
  allMessages,
  setMessages,
  handleSend,
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
            {!isStreaming && onEditResend && message.id && (
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
