"use client";

import { useCallback } from "react";
import {
  PromptInputModelSelect,
  usePromptInputAttachments,
} from "@/components/ai-elements";
import { useToast } from "@/components/ui/toast-provider";
import type { ResolvedModel } from "@/lib/ai-models";

interface ModelSelectWithGuardProps {
  currentModelId: string;
  models: ResolvedModel[];
  canSwitch: boolean;
  isLoading: boolean;
  onModelChange: (modelId: string) => void;
}

export function ModelSelectWithGuard(props: ModelSelectWithGuardProps) {
  const attachments = usePromptInputAttachments();
  const { toast } = useToast();

  const handleGuardedChange = useCallback(
    (modelId: string) => {
      const target = props.models.find((m) => m.id === modelId);
      const targetSupportsImages = target?.supportsImages ?? false;
      if (!targetSupportsImages && attachments.files.length > 0) {
        toast({
          title: "目标模型不支持图片输入",
          description: "请先移除已添加的图片再切换模型。",
        });
        return;
      }
      props.onModelChange(modelId);
    },
    [attachments.files.length, props, toast],
  );

  return (
    <PromptInputModelSelect
      currentModelId={props.currentModelId}
      models={props.models}
      canSwitch={props.canSwitch}
      onModelChange={handleGuardedChange}
      isLoading={props.isLoading}
    />
  );
}
