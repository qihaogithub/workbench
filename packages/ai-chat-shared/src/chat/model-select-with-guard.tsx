"use client";

import { useCallback, useMemo } from "react";
import {
  PromptInputModelSelect,
  PromptInputThinkingDepthSelect,
  usePromptInputAttachments,
} from "../prompt-input";
import { useToast } from "../ui/toast-provider";
import type { ResolvedModel, ThinkingDepth } from "../lib/ai-models";
import type { PromptInputFile } from "../prompt-input";

interface ModelSelectWithGuardProps {
  currentModelId: string;
  currentDepth: ThinkingDepth | null;
  availableDepths: ThinkingDepth[];
  models: ResolvedModel[];
  canSwitch: boolean;
  isLoading: boolean;
  onModelChange: (modelId: string) => void;
  onDepthChange: (depth: ThinkingDepth) => void;
  imageDescriptionEnabled?: boolean;
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
  imageDescriptionEnabled = false,
}: ModelSelectWithGuardProps) {
  const attachments = usePromptInputAttachments();
  const { toast } = useToast();
  const imageCount = useMemo(
    () => attachments.files.filter((f: PromptInputFile) => f.type.startsWith("image/")).length,
    [attachments.files],
  );

  const handleGuardedChange = useCallback(
    (modelId: string) => {
      if (imageDescriptionEnabled) {
        onModelChange(modelId);
        return;
      }
      const target = models.find((m) => m.id === modelId);
      const targetSupportsImages = target?.supportsImages ?? false;
      if (!targetSupportsImages && imageCount > 0) {
        toast({
          title: "目标模型不支持图片输入",
          description: "请先移除已添加的图片再切换模型。",
        });
        return;
      }
      onModelChange(modelId);
    },
    [imageCount, imageDescriptionEnabled, models, onModelChange, toast],
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
