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
  const modelRetryCountRef = useRef(0);
  const modelRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preferredModelRef = useRef<{
    fullModelId: string;
    baseModelId: string;
    depth: ThinkingDepth | null;
  } | null>(null);
  const preferredModelAppliedKeyRef = useRef<string | null>(null);

  const sendSetModel = useCallback((fullModelId: string) => {
    const ws = (modelStreamRef.current as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_model", modelId: fullModelId }));
    }
  }, []);

  const applyPreferredModelToSession = useCallback(
    (models: ResolvedModel[], eventCurrentModelId: string) => {
      const preferred = preferredModelRef.current;
      if (!preferred || !agentSessionId) return null;

      const resolved = resolveCurrentModel(preferred.fullModelId, models);
      if (!resolved) return null;

      if (preferred.fullModelId === eventCurrentModelId) {
        preferredModelAppliedKeyRef.current = `${agentSessionId}:${preferred.fullModelId}`;
        return {
          ...preferred,
          baseModelId: resolved.baseModelId,
          depth: resolved.depth ?? null,
          isApplying: false,
        };
      }

      const applyKey = `${agentSessionId}:${preferred.fullModelId}`;
      if (preferredModelAppliedKeyRef.current !== applyKey) {
        preferredModelAppliedKeyRef.current = applyKey;
        sendSetModel(preferred.fullModelId);
      }

      return {
        ...preferred,
        baseModelId: resolved.baseModelId,
        depth: resolved.depth ?? null,
        isApplying: true,
      };
    },
    [agentSessionId, sendSetModel],
  );

  useEffect(() => {
    if (!agentSessionId) return;

    const setupModelStream = async () => {
      const { getAgentClient } = await import("@/lib/agent-client");
      const agentClient = getAgentClient();
      const stream = agentClient.stream(agentSessionId);
      modelStreamRef.current = stream;
      modelRetryCountRef.current = 0;

      const requestModels = () => {
        const ws = (stream as any).ws;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "get_models", workingDir }));
        }
      };

      let connected = false;
      stream.on("status", (event: StreamEvent) => {
        if (event.status === "connected" && !connected) {
          connected = true;
          requestModels();
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
        const preferred = applyPreferredModelToSession(
          models,
          event.currentModelId || "",
        );

        setModelState((prev) => ({
          currentModelId:
            preferred?.baseModelId ||
            resolved?.baseModelId ||
            models[0]?.id ||
            prev.currentModelId,
          currentDepth:
            preferred?.depth ?? resolved?.depth ?? prev.currentDepth,
          models: models.length > 0 ? models : prev.models,
          canSwitch: event.canSwitch ?? prev.canSwitch,
          isLoading: preferred?.isApplying ?? false,
        }));

        if (models.length > 0) {
          modelRetryCountRef.current = 0;
          if (modelRetryTimerRef.current) {
            clearTimeout(modelRetryTimerRef.current);
            modelRetryTimerRef.current = null;
          }
        } else if (modelRetryCountRef.current < 5) {
          modelRetryCountRef.current += 1;
          if (modelRetryTimerRef.current) {
            clearTimeout(modelRetryTimerRef.current);
          }
          modelRetryTimerRef.current = setTimeout(requestModels, 2000);
        }
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
      if (modelRetryTimerRef.current) {
        clearTimeout(modelRetryTimerRef.current);
        modelRetryTimerRef.current = null;
      }
      if (modelStreamRef.current) {
        modelStreamRef.current.close();
        modelStreamRef.current = null;
      }
    };
  }, [agentSessionId, workingDir, applyPreferredModelToSession]);

  const handleModelChange = useCallback(
    (baseModelId: string) => {
      if (baseModelId === modelState.currentModelId) return;

      const model = modelState.models.find((m) => m.id === baseModelId);
      if (!model) return;

      let depth: ThinkingDepth | null = null;

      if (model.supportsThinkingDepth && model.availableDepths.length > 0) {
        depth = model.availableDepths.includes("medium")
          ? "medium"
          : model.availableDepths[0];
      }
      const fullModelId = buildFullModelId(
        baseModelId,
        depth ?? undefined,
        modelState.models,
      );

      setModelState((prev) => ({
        ...prev,
        currentModelId: baseModelId,
        currentDepth: depth,
        isLoading: true,
      }));

      preferredModelRef.current = {
        fullModelId,
        baseModelId,
        depth,
      };
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

      const fullModelId = buildFullModelId(
        modelState.currentModelId,
        depth,
        modelState.models,
      );
      if (!fullModelId) return;

      setModelState((prev) => ({
        ...prev,
        currentDepth: depth,
        isLoading: true,
      }));

      preferredModelRef.current = {
        fullModelId,
        baseModelId: modelState.currentModelId,
        depth,
      };
      sendSetModel(fullModelId);
    },
    [modelState.currentModelId, modelState.models, sendSetModel],
  );

  const handleModelsEvent = useCallback(async (event: StreamEvent) => {
    const models = event.models
      ? await applyModelConfigsAsync(event.models)
      : [];
    const resolved = resolveCurrentModel(event.currentModelId || "", models);
    const preferred = applyPreferredModelToSession(
      models,
      event.currentModelId || "",
    );

    setModelState((prev) => ({
      currentModelId:
        preferred?.baseModelId ||
        resolved?.baseModelId ||
        models[0]?.id ||
        prev.currentModelId,
      currentDepth: preferred?.depth ?? resolved?.depth ?? prev.currentDepth,
      models: models.length > 0 ? models : prev.models,
      canSwitch: event.canSwitch ?? prev.canSwitch,
      isLoading: preferred?.isApplying ?? false,
    }));
  }, [applyPreferredModelToSession]);

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
