"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AgentStream, type StreamEvent } from "@opencode-workbench/agent-client";
import {
  applyModelConfigs,
  UNCONFIGURED_DEFAULT,
  type ResolvedModel,
} from "@/lib/ai-models";

export interface ModelState {
  currentModelId: string;
  models: ResolvedModel[];
  canSwitch: boolean;
  isLoading: boolean;
}

const INITIAL_MODEL_STATE: ModelState = {
  currentModelId: "",
  models: [],
  canSwitch: false,
  isLoading: true,
};

interface UseChatModelsOptions {
  agentSessionId: string;
  workingDir?: string;
  onSessionChange?: () => void;
}

export function useChatModels(options: UseChatModelsOptions) {
  const { agentSessionId, workingDir } = options;

  const [modelState, setModelState] = useState<ModelState>(INITIAL_MODEL_STATE);
  const modelStreamRef = useRef<AgentStream | null>(null);

  // agentSessionId 变化时建立持久连接，提前获取模型列表
  useEffect(() => {
    if (!agentSessionId) return;

    const setupModelStream = async () => {
      const { getAgentClient } = await import("@/lib/agent-client");
      const agentClient = getAgentClient();
      const stream = agentClient.stream(agentSessionId);
      modelStreamRef.current = stream;

      let connected = false;
      stream.on("status", (event: StreamEvent) => {
        if (event.status === "connected" && !connected) {
          connected = true;
          const ws = (stream as any).ws;
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "get_models", workingDir }));
          }
        }
      });

      stream.on("models", (event: StreamEvent) => {
        setModelState((prev) => ({
          currentModelId: event.currentModelId || prev.currentModelId,
          models: event.models ? applyModelConfigs(event.models) : prev.models,
          canSwitch: event.canSwitch ?? prev.canSwitch,
          isLoading: false,
        }));
      });

      stream.on("error", (event: StreamEvent) => {
        const isModelError =
          event.error?.code === "SESSION_NOT_FOUND" ||
          event.error?.code === "GET_MODELS_ERROR";
        if (isModelError) {
          setModelState((prev) => ({ ...prev, isLoading: false }));
        }
      });
    };

    setupModelStream();

    return () => {
      if (modelStreamRef.current) {
        modelStreamRef.current.close();
        modelStreamRef.current = null;
      }
    };
  }, [agentSessionId, workingDir]);

  const handleModelChange = useCallback(
    (modelId: string) => {
      if (modelId === modelState.currentModelId) return;

      setModelState((prev) => ({ ...prev, isLoading: true }));

      const ws = (modelStreamRef.current as any)?.ws;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "set_model", modelId }));
      }
    },
    [modelState.currentModelId],
  );

  const handleModelsEvent = useCallback((event: StreamEvent) => {
    setModelState((prev) => ({
      currentModelId: event.currentModelId || prev.currentModelId,
      models: event.models ? applyModelConfigs(event.models) : prev.models,
      canSwitch: event.canSwitch ?? prev.canSwitch,
      isLoading: false,
    }));
  }, []);

  const handleModelError = useCallback(() => {
    setModelState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const resetModelState = useCallback(() => {
    setModelState(INITIAL_MODEL_STATE);
  }, []);

  const currentSupportsImages =
    modelState.models.find((m) => m.id === modelState.currentModelId)
      ?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages;

  return {
    modelState,
    setModelState,
    currentSupportsImages,
    handleModelChange,
    handleModelsEvent,
    handleModelError,
    resetModelState,
  };
}
