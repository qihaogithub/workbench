"use client";

import { useCallback } from "react";
import {
  PromptInputModelSelect,
  PromptInputThinkingDepthSelect,
  usePromptInputAttachments,
} from "../prompt-input";
import { useToast } from "../ui/toast-provider";
import type { ResolvedModel, ThinkingDepth } from "../lib/ai-models";

interface ModelSelectWithGuardProps {
  currentModelId: string;
  currentDepth: ThinkingDepth | null;
  availableDepths: ThinkingDepth[];
  models: ResolvedModel[];
  canSwitch: boolean;
  isLoading: boolean;
  onModelChange: (modelId: string) => void;
  onDepthChange: (depth: ThinkingDepth) => void;
}

export function ModelSelectWithGuard({
  currentModelId,
  currentDepth,
  availableDepths,
  models,
  canSwitch,
  isLoading,
  onModelChange,
  onDepthChange,
}: ModelSelectWithGuardProps) {
  const attachments = usePromptInputAttachments();
  const { toast } = useToast();
  const attachmentCount = attachments.files.length;

  const handleGuardedChange = useCallback(
    (modelId: string) => {
      const target = models.find((m) => m.id === modelId);
      const targetSupportsImages = target?.supportsImages ?? false;
      if (!targetSupportsImages && attachmentCount > 0) {
        toast({
          title: "目标模型不支持图片输入",
          description: "请先移除已添加的图片再切换模型。",
        });
        return;
      }
      onModelChange(modelId);
    },
    [attachmentCount, models, onModelChange, toast],
  );

  return (
    <>
      <PromptInputModelSelect
        currentModelId={currentModelId}
        models={models}
        canSwitch={canSwitch}
        onModelChange={handleGuardedChange}
        isLoading={isLoading}
      />
      <PromptInputThinkingDepthSelect
        currentDepth={currentDepth}
        availableDepths={availableDepths}
        onDepthChange={onDepthChange}
        disabled={!canSwitch || isLoading}
      />
    </>
  );
}
