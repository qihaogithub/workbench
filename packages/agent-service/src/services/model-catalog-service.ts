import type { AgentConfig } from "../core/types";
import type { BaseAgent } from "../core/agent";
import type { IAgentManager } from "../core/agent-manager";

export interface ModelCatalogItem {
  id: string;
  label: string;
  group: string;
  supportsImages: boolean;
  supportsThinkingDepth: boolean;
}

export interface ModelCatalogSuccess {
  success: true;
  data: {
    models: ModelCatalogItem[];
    currentModelId: string | null;
    canSwitch: boolean;
  };
}

export interface ModelCatalogFailure {
  success: false;
  error: {
    code: "SERVER_UNREACHABLE" | "GET_MODELS_ERROR";
    message: string;
  };
}

export type ModelCatalogResult = ModelCatalogSuccess | ModelCatalogFailure;

function isConnectionError(message: string): boolean {
  return (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("aborted")
  );
}

function toModelCatalogItem(model: { id: string; label: string }): ModelCatalogItem {
  const slashIdx = model.id.indexOf("/");
  return {
    id: model.id,
    label: model.label,
    group: slashIdx >= 0 ? model.id.slice(0, slashIdx) : "",
    supportsImages: false,
    supportsThinkingDepth: false,
  };
}

export class ModelCatalogService {
  constructor(private readonly manager: Pick<IAgentManager, "getOrCreate" | "destroy">) {}

  async listModels(now: () => number = Date.now): Promise<ModelCatalogResult> {
    const tempSessionId = `__models_probe_${now()}`;
    let agent: BaseAgent | undefined;

    try {
      const config: AgentConfig = {
        sessionId: tempSessionId,
      };

      agent = this.manager.getOrCreate(tempSessionId, config);

      if (agent.status !== "ready") {
        await agent.start();
      }

      const modelInfo = await agent.getModelInfo?.();

      if (!modelInfo) {
        return {
          success: true,
          data: {
            models: [],
            currentModelId: null,
            canSwitch: false,
          },
        };
      }

      return {
        success: true,
        data: {
          models: modelInfo.availableModels.map(toModelCatalogItem),
          currentModelId: modelInfo.currentModelId,
          canSwitch: modelInfo.canSwitch,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: isConnectionError(message)
          ? {
              code: "SERVER_UNREACHABLE",
              message: "无法连接 Pi Agent 后端，请确认服务已启动后点击「拉取模型」重试",
            }
          : {
              code: "GET_MODELS_ERROR",
              message,
            },
      };
    } finally {
      if (agent) {
        await this.manager.destroy(tempSessionId);
      }
    }
  }
}
