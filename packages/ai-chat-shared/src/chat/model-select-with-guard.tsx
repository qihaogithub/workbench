"use client";

import {
  PromptInputModelSelect,
  PromptInputThinkingDepthSelect,
} from "../prompt-input";
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
  return (
    <>
      <PromptInputModelSelect
        currentModelId={currentModelId}
        models={models}
        canSwitch={canSwitch}
        onModelChange={onModelChange}
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
