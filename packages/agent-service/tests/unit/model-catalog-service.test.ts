import { describe, expect, it, vi } from "vitest";

import type { AgentConfig } from "../../src/core/types";
import type { BaseAgent } from "../../src/core/agent";
import type { IAgentManager } from "../../src/core/agent-manager";
import { ModelCatalogService } from "../../src/services/model-catalog-service";

type MockAgent = Pick<BaseAgent, "status" | "start" | "getModelInfo">;

function createManager(agent: MockAgent): Pick<IAgentManager, "getOrCreate" | "destroy"> {
  return {
    getOrCreate: vi.fn((_sessionId: string, _config: AgentConfig) => agent as BaseAgent),
    destroy: vi.fn(async () => undefined),
  };
}

describe("ModelCatalogService", () => {
  it("返回带 provider 分组的模型列表并清理临时 agent", async () => {
    const agent: MockAgent = {
      status: "initializing",
      start: vi.fn(async () => undefined),
      getModelInfo: vi.fn(async () => ({
        currentModelId: "openai/gpt-4.1",
        canSwitch: true,
        availableModels: [
          { id: "openai/gpt-4.1", label: "GPT 4.1" },
          { id: "local-model", label: "Local" },
        ],
      })),
    };
    const manager = createManager(agent);

    const result = await new ModelCatalogService(manager).listModels(() => 123);

    expect(manager.getOrCreate).toHaveBeenCalledWith("__models_probe_123", {
      sessionId: "__models_probe_123",
    });
    expect(agent.start).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: {
        currentModelId: "openai/gpt-4.1",
        canSwitch: true,
        models: [
          {
            id: "openai/gpt-4.1",
            label: "GPT 4.1",
            group: "openai",
            supportsImages: false,
            supportsThinkingDepth: false,
          },
          {
            id: "local-model",
            label: "Local",
            group: "",
            supportsImages: false,
            supportsThinkingDepth: false,
          },
        ],
      },
    });
    expect(manager.destroy).toHaveBeenCalledWith("__models_probe_123");
  });

  it("缺少模型信息时返回空列表", async () => {
    const agent: MockAgent = {
      status: "ready",
      start: vi.fn(async () => undefined),
      getModelInfo: vi.fn(async () => null),
    };

    const result = await new ModelCatalogService(createManager(agent)).listModels(() => 456);

    expect(agent.start).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: {
        models: [],
        currentModelId: null,
        canSwitch: false,
      },
    });
  });

  it("连接错误返回 SERVER_UNREACHABLE 并清理临时 agent", async () => {
    const agent: MockAgent = {
      status: "ready",
      start: vi.fn(async () => undefined),
      getModelInfo: vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    };
    const manager = createManager(agent);

    const result = await new ModelCatalogService(manager).listModels(() => 789);

    expect(result).toEqual({
      success: false,
      error: {
        code: "SERVER_UNREACHABLE",
        message: "无法连接 Pi Agent 后端，请确认服务已启动后点击「拉取模型」重试",
      },
    });
    expect(manager.destroy).toHaveBeenCalledWith("__models_probe_789");
  });
});
