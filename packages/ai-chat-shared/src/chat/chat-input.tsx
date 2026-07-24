"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  PromptInput,
  PromptInputBody,
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
import { FileText, FolderKanban, History, Image, Plus } from "lucide-react";
import { cn } from "../lib/utils";
import { getConfiguredAgentClient } from "../config";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { ResolvedModel, ThinkingDepth } from "../lib/ai-models";
import type { FileAttachment, ImageAttachment } from "@workbench/agent-client";
import { type ChatElementRef } from "./element-selection-chip";
import {
  InlineTagInput,
  type InlineTagInputHandle,
  type ProjectReference,
} from "./inline-tag-input";
import { ProjectReferencePicker } from "./project-reference-picker";
import { AttachmentManagerDialog } from "./attachment-manager-dialog";

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
const AI_FILE_MAX_COUNT = 30;
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
  hasProjects,
  onOpenProjectPicker,
}: {
  supportsImages: boolean;
  supportsFiles: boolean;
  hasProjects: boolean;
  onOpenProjectPicker: () => void;
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

  if (!supportsImages && !supportsFiles && !hasProjects) return null;

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
          {hasProjects && (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setOpen(false);
                onOpenProjectPicker();
              }}
            >
              <FolderKanban className="h-4 w-4" />
              引用其他项目
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

const VISIBLE_ATTACHMENT_COUNT = 4;

const PromptInputAttachmentsDisplay = ({
  onOpenManager,
}: {
  onOpenManager: () => void;
}) => {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  const visibleFiles = attachments.files.slice(0, VISIBLE_ATTACHMENT_COUNT);
  const overflow = attachments.files.length - VISIBLE_ATTACHMENT_COUNT;
  const imageCount = attachments.files.filter((f) =>
    f.type.startsWith("image/"),
  ).length;
  const hasOtherFiles = attachments.files.length !== imageCount;

  const overflowLabel = hasOtherFiles
    ? `+${overflow} 个附件`
    : `+${overflow} 张图片`;

  return (
    <div className="flex items-start gap-2">
      <Attachments variant="inline">
        {visibleFiles.map((attachment) => (
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
      {overflow > 0 && (
        <button
          type="button"
          className="flex-shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
          onClick={onOpenManager}
        >
          <Image className="h-3 w-3" />
          {overflowLabel}
        </button>
      )}
    </div>
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
  supportsFiles?: boolean;
  supportsHistory?: boolean;
  imageDescriptionEnabled?: boolean;
  selectedElement?: ChatElementRef | null;
  onRemoveElement?: () => void;
  projects?: ProjectReference[];
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
  imageDescriptionEnabled = false,
  selectedElement,
  onRemoveElement,
  projects,
}: ChatInputProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [attachmentManagerOpen, setAttachmentManagerOpen] = useState(false);
  const attachments = usePromptInputAttachments();
  const inputRef = useRef<InlineTagInputHandle | null>(null);
  const prevElementIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedElement && selectedElement.id !== prevElementIdRef.current) {
      prevElementIdRef.current = selectedElement.id;
      inputRef.current?.insertTag({
        id: selectedElement.id,
        type: "element",
        label: selectedElement.label,
        context: selectedElement.context,
      });
      onRemoveElement?.();
    }
  }, [selectedElement, onRemoveElement]);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const tagValue = inputRef.current?.getValue();
      const tags = tagValue?.tags ?? [];
      const hasText = Boolean(message.text);
      const hasAttachments = Boolean(message.files?.length);
      const hasTags = tags.length > 0;

      if (!(hasText || hasAttachments || hasTags)) {
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

      const baseText = message.text || fallbackMessage;

      const tagContexts = tags
        .map(
          (tag) =>
            `[引用${tag.type === "project" ? "项目" : "元素"}: ${tag.label}]\n${tag.context}`,
        )
        .join("\n\n");

      const userMessage = tagContexts
        ? `${tagContexts}\n\n${baseText}`
        : baseText;

      inputRef.current?.clear();

      onSubmit(
        userMessage,
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
        <PromptInputAttachmentsDisplay
          onOpenManager={() => setAttachmentManagerOpen(true)}
        />
        {uploadError && (
          <div className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {uploadError}
          </div>
        )}
      </PromptInputHeader>
      <PromptInputBody>
        <InlineTagInput
          controller={inputRef}
          placeholder="输入指令，⌘↵ / Ctrl↵ 发送..."
          minHeight={40}
          maxHeight={140}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputAddMenu
            supportsImages={Boolean(supportsImages)}
            supportsFiles={supportsFiles}
            hasProjects={Boolean(projects && projects.length > 0)}
            onOpenProjectPicker={() => setProjectPickerOpen(true)}
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
            imageDescriptionEnabled={imageDescriptionEnabled}
          />
        </PromptInputTools>
        <PromptInputSubmit />
      </PromptInputFooter>
      {projects && projects.length > 0 && (
        <ProjectReferencePicker
          open={projectPickerOpen}
          onOpenChange={setProjectPickerOpen}
          projects={projects}
          onSelect={(project) => {
            inputRef.current?.insertTag({
              id: `proj-${project.id}-${Date.now()}`,
              type: "project",
              label: project.name,
              context: `项目名称: ${project.name}\n项目ID: ${project.id}`,
            });
            inputRef.current?.focus();
          }}
        />
      )}
      <AttachmentManagerDialog
        open={attachmentManagerOpen}
        onOpenChange={setAttachmentManagerOpen}
        files={attachments.files}
        onAddFiles={(newFiles) => attachments.add(newFiles)}
        onRemoveFile={(id) => attachments.remove(id)}
      />
    </PromptInput>
  );
}
