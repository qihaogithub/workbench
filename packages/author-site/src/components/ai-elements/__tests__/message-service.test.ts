import { updateSessionTitle } from "@workbench/ai-chat-shared/chat/services/message-service";

jest.mock("@workbench/ai-chat-shared/config", () => ({
  getAuthorContextIntegration: () => ({}),
}));

describe("message-service", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("通过 Conversation Command API 更新标题", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    await updateSessionTitle("conversation-1", "  新标题  ");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conversation-1/title",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "新标题" }),
      }),
    );
  });

  it("标题更新非 2xx 时不会伪装成功", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await updateSessionTitle("conversation-1", "标题");

    expect(warn).toHaveBeenCalledWith(
      "[MessageService] Failed to update session title:",
      expect.objectContaining({ message: "Conversation title update failed (500)" }),
    );
  });
});
