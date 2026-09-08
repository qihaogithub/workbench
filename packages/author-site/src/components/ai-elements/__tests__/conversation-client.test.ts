import { AgentClient, ConversationHttpError } from "@workbench/agent-client";

describe("AgentClient conversation commands", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([
    [401, false],
    [403, false],
    [404, false],
    [413, false],
    [429, true],
    [500, true],
  ])("将 HTTP %i 映射为 retryable=%s 的明确失败", async (status, retryable) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({
        success: false,
        error: { code: `HTTP_${status}`, message: "command failed" },
      }),
    }) as unknown as typeof fetch;
    const client = new AgentClient({
      baseUrl: "http://agent.local",
      conversationBaseUrl: "http://author.local",
    });

    await expect(
      client.submitMessageCommand({
        conversationId: "conversation/a",
        clientMessageId: "client-1",
        content: "prompt",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ConversationHttpError",
        status,
        code: `HTTP_${status}`,
        retryable,
      }),
    );
  });

  it("将 fetch reject 映射为可重试网络错误", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const client = new AgentClient({
      baseUrl: "http://agent.local",
      conversationBaseUrl: "http://author.local",
    });

    await expect(
      client.submitMessageCommand({
        conversationId: "conversation-1",
        clientMessageId: "client-1",
        content: "prompt",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "NETWORK_ERROR",
        status: 0,
        retryable: true,
      } satisfies Partial<ConversationHttpError>),
    );
  });

  it("只有成功 envelope 才返回服务端 ACK", async () => {
    const accepted = {
      conversationId: "conversation-1",
      messageId: "message-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      sequence: 1,
      serverCreatedAt: 1,
      conversationRevision: 1,
      status: "accepted" as const,
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: accepted }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new AgentClient({
      baseUrl: "http://agent.local",
      conversationBaseUrl: "http://author.local",
    });

    await expect(
      client.submitMessageCommand({
        conversationId: "conversation/a",
        clientMessageId: "client-1",
        content: "prompt",
      }),
    ).resolves.toEqual(accepted);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://author.local/api/conversations/conversation%2Fa/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
