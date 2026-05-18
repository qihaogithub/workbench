"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputAddImage,
  PromptInputHeader,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { ModelSelectWithGuard } from "./model-select-with-guard";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResolvedModel, ThinkingDepth } from "@/lib/ai-models";

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
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
};

interface ChatInputProps {
  onSubmit: (message: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
  currentSupportsImages: boolean;
  onHistoryClick: () => void;
  onModelChange: (modelId: string) => void;
  onDepthChange: (depth: ThinkingDepth) => void;
  currentModelId: string;
  currentDepth: ThinkingDepth | null;
  availableDepths: ThinkingDepth[];
  models: ResolvedModel[];
  canSwitch: boolean;
  isModelLoading: boolean;
}

export function ChatInput({
  onSubmit,
  onCancel,
  isStreaming,
  currentSupportsImages,
  onHistoryClick,
  onModelChange,
  onDepthChange,
  currentModelId,
  currentDepth,
  availableDepths,
  models,
  canSwitch,
  isModelLoading,
}: ChatInputProps) {
  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const hasText = Boolean(message.text);
      const hasAttachments = Boolean(message.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }

      onSubmit(message.text || "处理附件文件");
    },
    [onSubmit],
  );

  return (
    <PromptInput
      onSubmit={handleSubmit}
      onCancel={onCancel}
      status={isStreaming ? "streaming" : "idle"}
      className="flex-shrink-0"
      globalDrop
      multiple
    >
      <PromptInputHeader>
        <PromptInputAttachmentsDisplay />
      </PromptInputHeader>
      <PromptInputBody>
        <PromptInputTextarea placeholder="输入指令，按 Enter 发送..." />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          {currentSupportsImages && <PromptInputAddImage />}
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
