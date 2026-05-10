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
} from "lucide-react";
import { useState } from "react";
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
      duration?: number;
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
}

export function Message({
  message,
  className,
  isStreaming = false,
}: MessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (message.content) {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 用户消息使用气泡样式
  if (isUser) {
    return (
      <div className={cn("flex flex-col gap-3 group items-end min-w-0", className)}>
        {message.content && (
          <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-muted text-foreground border border-border/50">
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
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
