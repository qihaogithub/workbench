"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  AgentStream,
  type StreamEvent,
} from "@opencode-workbench/agent-client";
import {
  applyModelConfigsAsync,
  buildFullModelId,
  resolveCurrentModel,
  UNCONFIGURED_DEFAULT,
  type ResolvedModel,
  type ThinkingDepth,
} from "@/lib/ai-models";

export interface ModelState {
  currentModelId: string;
  currentDepth: ThinkingDepth | null;
  models: ResolvedModel[];
  canSwitch: boolean;
  isLoading: boolean;
}

const INITIAL_MODEL_STATE: ModelState = {
  currentModelId: "",
  currentDepth: null,
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

      stream.on("models", async (event: StreamEvent) => {
        const models = event.models
          ? await applyModelConfigsAsync(event.models)
          : [];
        const resolved = resolveCurrentModel(
          event.currentModelId || "",
          models,
        );

        setModelState((prev) => ({
          currentModelId:
            resolved?.baseModelId || models[0]?.id || prev.currentModelId,
          currentDepth: resolved?.depth ?? prev.currentDepth,
          models: models.length > 0 ? models : prev.models,
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

  const sendSetModel = useCallback((fullModelId: string) => {
    const ws = (modelStreamRef.current as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_model", modelId: fullModelId }));
    }
  }, []);

  const handleModelChange = useCallback(
    (baseModelId: string) => {
      if (baseModelId === modelState.currentModelId) return;

      const model = modelState.models.find((m) => m.id === baseModelId);
      if (!model) return;

      let depth: ThinkingDepth | null = null;
      let fullModelId = baseModelId;

      if (model.supportsThinkingDepth && model.availableDepths.length > 0) {
        depth = model.availableDepths.includes("medium")
          ? "medium"
          : model.availableDepths[0];
        fullModelId = model.depthVariantIds[depth] || baseModelId;
      }

      setModelState((prev) => ({
        ...prev,
        currentModelId: baseModelId,
        currentDepth: depth,
        isLoading: true,
      }));

      sendSetModel(fullModelId);
    },
    [modelState.currentModelId, modelState.models, sendSetModel],
  );

  const handleDepthChange = useCallback(
    (depth: ThinkingDepth) => {
      const model = modelState.models.find(
        (m) => m.id === modelState.currentModelId,
      );
      if (!model || !model.supportsThinkingDepth) return;

      const fullModelId = model.depthVariantIds[depth];
      if (!fullModelId) return;

      setModelState((prev) => ({
        ...prev,
        currentDepth: depth,
        isLoading: true,
      }));

      sendSetModel(fullModelId);
    },
    [modelState.currentModelId, modelState.models, sendSetModel],
  );

  const handleModelsEvent = useCallback(async (event: StreamEvent) => {
    const models = event.models
      ? await applyModelConfigsAsync(event.models)
      : [];
    const resolved = resolveCurrentModel(event.currentModelId || "", models);

    setModelState((prev) => ({
      currentModelId:
        resolved?.baseModelId || models[0]?.id || prev.currentModelId,
      currentDepth: resolved?.depth ?? prev.currentDepth,
      models: models.length > 0 ? models : prev.models,
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

  const currentModel = modelState.models.find(
    (m) => m.id === modelState.currentModelId,
  );
  const currentSupportsImages =
    currentModel?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages;
  const currentAvailableDepths = currentModel?.supportsThinkingDepth
    ? currentModel.availableDepths
    : [];

  return {
    modelState,
    setModelState,
    currentSupportsImages,
    currentAvailableDepths,
    handleModelChange,
    handleDepthChange,
    handleModelsEvent,
    handleModelError,
    resetModelState,
  };
}
