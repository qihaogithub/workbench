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
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "./chain-of-thought";

export interface MessagePart {
  type: "text" | "reasoning" | "tool" | "image" | "file";
  content?: string;
  name?: string;
  status?: "running" | "completed" | "error" | "awaiting-approval";
  parameters?: Record<string, unknown>;
  result?: unknown;
  duration?: number;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts?: MessagePart[];
  reasoning?: {
    content: string;
    duration?: number;
  };
  // 支持多个独立思考过程
  reasonings?: Array<{
    content: string;
    duration?: number;
    timestamp?: number;
  }>;
  tools?: Array<{
    name: string;
    kind?: "read" | "edit" | "execute";
    path?: string;
    status: "running" | "completed" | "error";
    parameters?: Record<string, unknown>;
    result?: unknown;
  }>;
  images?: Array<{
    url: string;
    alt?: string;
  }>;
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

  const hasProcessContent = message.tools && message.tools.length > 0;

  // 按文件路径合并工具调用
  const groupedTools = (() => {
    if (!message.tools) return [];
    const groups = new Map<string, { path?: string; entries: any[] }>();
    for (const tool of message.tools) {
      const path = (tool.path ||
        tool.parameters?.path ||
        tool.parameters?.file_path) as string | undefined;
      const key = path || tool.name;
      if (!groups.has(key)) {
        groups.set(key, { path, entries: [] });
      }
      groups.get(key)!.entries.push(tool);
    }
    return Array.from(groups.values());
  })();

  return (
    <div
      className={cn(
        "flex flex-col gap-3 group",
        isUser && "items-end",
        className,
      )}
    >
      {/* 消息内容优先显示（AI 回复文字先于处理过程） */}
      {!isUser && message.content && (
        <div className="text-sm max-w-full overflow-hidden text-muted-foreground">
          <div className="overflow-x-auto max-w-full">
            <Streamdown className="prose prose-sm dark:prose-invert max-w-full [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-all [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
              {message.content}
            </Streamdown>
          </div>
        </div>
      )}

      {/* 思考过程（完成后折叠） */}
      {!isUser && message.reasonings && message.reasonings.length > 0 && (
        <div className="w-full">
          <ChainOfThought defaultOpen={false}>
            <ChainOfThoughtHeader
              stepCount={message.reasonings.length}
              completedCount={message.reasonings.length}
            >
              思考过程
            </ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              {message.reasonings.map((r, index) => (
                <ChainOfThoughtStep
                  key={index}
                  status="complete"
                  title={
                    r.content.length > 50
                      ? r.content.slice(0, 50) + "..."
                      : r.content
                  }
                  description={
                    r.duration
                      ? `耗时 ${(r.duration / 1000).toFixed(1)}s`
                      : undefined
                  }
                />
              ))}
            </ChainOfThoughtContent>
          </ChainOfThought>
        </div>
      )}

      {/* 工具调用展示 */}
      {hasProcessContent && (
        <div className="w-full">
          <ChainOfThought defaultOpen={false}>
            <ChainOfThoughtHeader>AI 处理过程</ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              <ChainOfThoughtStep status="complete" title="执行工具调用">
                <div className="space-y-0">
                  {groupedTools.map((group, index) => (
                    <Tool
                      key={index}
                      path={group.path}
                      entries={group.entries.map((e: any) => ({
                        name: e.name,
                        kind: e.kind,
                        status: e.status,
                        parameters: e.parameters,
                        result: e.result,
                      }))}
                    />
                  ))}
                </div>
              </ChainOfThoughtStep>
            </ChainOfThoughtContent>
          </ChainOfThought>
        </div>
      )}

      {/* 用户消息内容 */}
      {isUser && message.content && (
        <div className="text-sm max-w-full overflow-hidden text-right">
          <div className="whitespace-pre-wrap break-words text-foreground inline-block">
            {message.content}
          </div>
        </div>
      )}

      {/* 图片展示 */}
      {message.images && message.images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {message.images.map((img, index) => (
            <img
              key={index}
              src={img.url}
              alt={img.alt || ""}
              className="rounded-lg max-w-full h-auto object-contain"
            />
          ))}
        </div>
      )}

      {/* 文件附件展示 */}
      {message.files && message.files.length > 0 && (
        <div className="space-y-1">
          {message.files.map((file, index) => (
            <FileAttachment key={index} file={file} />
          ))}
        </div>
      )}

      {/* 消息操作按钮（仅 AI 消息） */}
      {!isUser && message.content && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ThumbsUp className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ThumbsDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      )}
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
