import { persistMessages } from "@workbench/ai-chat-shared/chat/services/message-service";
import type { ChatMessage } from "@workbench/ai-chat-shared/message";

// 会话持久化以 authorContext 配置为开关（viewer 宿主未配置时跳过），测试中模拟创作端已配置
jest.mock("@workbench/ai-chat-shared/config", () => ({
  configureAiChatShared: jest.fn(),
  getConfiguredAgentClient: jest.fn(),
  getAuthorContextIntegration: () => ({
    buildStaticSystemPrompt: () => "",
    fetchContextPrefix: async () => ({
      l3: "",
      memoryPrefix: null,
      knowledgePrefix: null,
    }),
  }),
}));

describe("message-service", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("保存消息时保留文件附件 part", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const messages: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        content: "读取附件",
        parts: [
          {
            type: "file",
            name: "demo.html",
            url: "",
            size: 123,
            attachmentId: "att-1",
            mimeType: "text/html",
            textExtracted: true,
          },
        ],
      },
    ];

    await persistMessages("session-1", messages);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session-1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].parts).toEqual(messages[0].parts);
  });
});
