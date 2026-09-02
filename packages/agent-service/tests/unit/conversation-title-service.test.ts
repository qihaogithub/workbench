import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
const getModelMock = vi.fn();

vi.mock("../../src/backends/managers/pi-agent-deps", () => ({
  getComplete: () => completeMock,
  getGetModel: () => getModelMock,
  loadPiAgentDeps: vi.fn().mockResolvedValue(undefined),
}));

import { generateConversationTitle } from "../../src/services/conversation-title-service";

describe("conversation-title-service", () => {
  beforeEach(() => {
    completeMock.mockReset();
    getModelMock.mockReset();
    getModelMock.mockImplementation((provider: string, modelId: string) => ({
      id: modelId,
      name: modelId,
      provider,
      input: ["text"],
    }));
  });

  it("使用当前模型且不注入工具或 Workspace 上下文", async () => {
    completeMock.mockResolvedValue({
      content: [{ type: "text", text: "优化页面布局" }],
    });

    const title = await generateConversationTitle({
      sessionId: "agent-session",
      content: "请帮我优化当前页面的布局",
      model: "openai/gpt-4.1-mini",
    });

    expect(title).toBe("优化页面布局");
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gpt-4.1-mini", provider: "openai" }),
      expect.objectContaining({
        tools: [],
        messages: [
          expect.objectContaining({
            role: "user",
            content: "请帮我优化当前页面的布局",
          }),
        ],
      }),
      expect.objectContaining({ maxTokens: 64, timeoutMs: 8_000, maxRetries: 0 }),
    );
  });

  it("模型没有返回文本时抛出错误，由客户端负责降级", async () => {
    completeMock.mockResolvedValue({ content: [] });

    await expect(
      generateConversationTitle({
        sessionId: "agent-session",
        content: "测试标题",
      }),
    ).rejects.toThrow("标题模型未返回文本");
  });

  it("请求模型不可用时回退到服务端激活模型", async () => {
    getModelMock
      .mockImplementationOnce(() => {
        throw new Error("unknown model");
      })
      .mockImplementationOnce((provider: string, modelId: string) => ({
        id: modelId,
        name: modelId,
        provider,
        input: ["text"],
      }));
    completeMock.mockResolvedValue({
      content: [{ type: "text", text: "回退标题" }],
    });

    await expect(
      generateConversationTitle({
        sessionId: "agent-session",
        content: "测试回退模型",
        model: "invalid/model",
      }),
    ).resolves.toBe("回退标题");
    expect(getModelMock).toHaveBeenNthCalledWith(1, "invalid", "model");
    const fallbackCall = getModelMock.mock.calls[1];
    expect(fallbackCall?.[0]).not.toBe("invalid");
  });

  it("标题模型超过 8 秒未返回时终止请求", async () => {
    vi.useFakeTimers();
    completeMock.mockReturnValue(new Promise(() => {}));

    const pending = generateConversationTitle({
      sessionId: "agent-session",
      content: "测试超时",
    });
    const assertion = expect(pending).rejects.toThrow("标题生成超时");

    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;
    vi.useRealTimers();
  });
});
