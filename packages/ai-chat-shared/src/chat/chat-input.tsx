"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputHeader,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "../prompt-input";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "../attachments";
import { ModelSelectWithGuard } from "./model-select-with-guard";
import { FileText, History, Image, Plus } from "lucide-react";
import { cn } from "../lib/utils";
import { getConfiguredAgentClient } from "../config";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { ResolvedModel, ThinkingDepth } from "../lib/ai-models";
import type { FileAttachment, ImageAttachment } from "@workbench/agent-client";

const AI_ATTACHMENT_ACCEPT = [
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".php",
  ".rb",
  ".swift",
  ".kt",
  ".kts",
  ".sql",
  ".sh",
  ".toml",
  ".ini",
  ".log",
  ".pdf",
  ".docx",
].join(",");
const AI_FILE_ACCEPT = `image/*,${AI_ATTACHMENT_ACCEPT}`;

const AI_FILE_MAX_SIZE = 20 * 1024 * 1024;
const AI_FILE_MAX_COUNT = 5;
const AI_FILE_MAX_TOTAL_SIZE = 50 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadFileAttachment(
  agentSessionId: string,
  file: File,
): Promise<FileAttachment> {
  const payload = await getConfiguredAgentClient().uploadAttachment(
    agentSessionId,
    file,
  );
  if (!payload.success) {
    throw new Error(payload.error.message);
  }
  return payload.data;
}

function PromptInputAddMenu({
  supportsImages,
  supportsFiles,
}: {
  supportsImages: boolean;
  supportsFiles: boolean;
}) {
  const attachments = usePromptInputAttachments();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const addSelectedFiles = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) attachments.add(files);
    event.target.value = "";
    setOpen(false);
  };

  if (!supportsImages && !supportsFiles) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            aria-label="添加图片或附件"
            title="添加图片或附件"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-40">
          {supportsImages && (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => imageInputRef.current?.click()}
            >
              <Image className="h-4 w-4" />
              添加图片
            </button>
          )}
          {supportsFiles && (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="h-4 w-4" />
              添加附件
            </button>
          )}
        </PopoverContent>
      </Popover>
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={addSelectedFiles}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={AI_ATTACHMENT_ACCEPT}
        onChange={addSelectedFiles}
        className="hidden"
      />
    </>
  );
}

const PromptInputAttachmentsDisplay = () => {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <Attachment
          data={attachment}
          key={attachment.id}
          onRemove={() => attachments.remove(attachment.id)}
        >
          <AttachmentPreview />
          <AttachmentInfo className="max-w-[160px]" />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
};

interface ChatInputProps {
  onSubmit: (
    message: string,
    images?: ImageAttachment[],
    runOptions?: undefined,
    files?: FileAttachment[],
  ) => void;
  onCancel: () => void;
  isStreaming: boolean;
  agentSessionId: string;
  onHistoryClick: () => void;
  onModelChange: (modelId: string) => void;
  onDepthChange: (depth: ThinkingDepth) => void;
  currentModelId: string;
  currentDepth: ThinkingDepth | null;
  availableDepths: ThinkingDepth[];
  models: ResolvedModel[];
  canSwitch: boolean;
  isModelLoading: boolean;
  supportsImages?: boolean;
  /** 是否支持文件附件（依赖 author-site 上传 API）；viewer-readonly 场景传 false */
  supportsFiles?: boolean;
  /** 是否显示历史会话入口（依赖 author-site 会话持久化）；viewer-readonly 场景传 false */
  supportsHistory?: boolean;
}

export function ChatInput({
  onSubmit,
  onCancel,
  isStreaming,
  agentSessionId,
  onHistoryClick,
  onModelChange,
  onDepthChange,
  currentModelId,
  currentDepth,
  availableDepths,
  models,
  canSwitch,
  isModelLoading,
  supportsImages,
  supportsFiles = true,
  supportsHistory = true,
}: ChatInputProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const hasText = Boolean(message.text);
      const hasAttachments = Boolean(message.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }

      setUploadError(null);
      const images: ImageAttachment[] = [];
      const files: FileAttachment[] = [];
      if (message.files?.length) {
        if (message.files.length > AI_FILE_MAX_COUNT) {
          setUploadError(`单次最多上传 ${AI_FILE_MAX_COUNT} 个附件`);
          return;
        }

        const totalSize = message.files.reduce(
          (sum, file) => sum + (file.file?.size ?? 0),
          0,
        );
        if (totalSize > AI_FILE_MAX_TOTAL_SIZE) {
          setUploadError("单次附件总大小不能超过 50MB");
          return;
        }

        try {
          for (const file of message.files) {
            if (!file.file) continue;
            if (file.type.startsWith("image/")) {
              const base64 = await fileToBase64(file.file);
              images.push({ data: base64, mimeType: file.type, name: file.name });
            } else {
              if (!agentSessionId) {
                throw new Error("AI 会话尚未初始化，无法上传文件");
              }
              files.push(await uploadFileAttachment(agentSessionId, file.file));
            }
          }
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : "文件上传失败");
          return;
        }
      }

      const fallbackMessage =
        files.length > 0
          ? images.length > 0
            ? "请结合附件内容处理"
            : "请读取并分析这些附件文件"
          : "处理附件图片";

      onSubmit(
        message.text || fallbackMessage,
        images.length > 0 ? images : undefined,
        undefined,
        files.length > 0 ? files : undefined,
      );
    },
    [agentSessionId, onSubmit],
  );

  return (
    <PromptInput
      onSubmit={handleSubmit}
      onCancel={onCancel}
      status={isStreaming ? "streaming" : "idle"}
      accept={AI_FILE_ACCEPT}
      maxFiles={AI_FILE_MAX_COUNT}
      maxSize={AI_FILE_MAX_SIZE}
      className="flex-shrink-0"
      globalDrop
      multiple
      supportsImages={supportsImages}
    >
      <PromptInputHeader>
        <PromptInputAttachmentsDisplay />
        {uploadError && (
          <div className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {uploadError}
          </div>
        )}
      </PromptInputHeader>
      <PromptInputBody>
        <PromptInputTextarea
          placeholder="输入指令，按 Enter 发送..."
          minHeight={40}
          maxHeight={140}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputAddMenu
            supportsImages={Boolean(supportsImages)}
            supportsFiles={supportsFiles}
          />
          {supportsHistory && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8",
                isStreaming && "opacity-40 cursor-not-allowed",
              )}
              disabled={isStreaming}
              onClick={onHistoryClick}
            >
              <History className="h-4 w-4" />
            </Button>
          )}
          <ModelSelectWithGuard
            currentModelId={currentModelId}
            currentDepth={currentDepth}
            availableDepths={availableDepths}
            models={models}
            canSwitch={canSwitch}
            onModelChange={onModelChange}
            onDepthChange={onDepthChange}
            isLoading={isModelLoading}
          />
        </PromptInputTools>
        <PromptInputSubmit />
      </PromptInputFooter>
    </PromptInput>
  );
}
