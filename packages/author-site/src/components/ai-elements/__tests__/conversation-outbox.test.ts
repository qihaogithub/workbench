import type { AgentClient } from "@workbench/agent-client";
import { ConversationHttpError } from "@workbench/agent-client";
import {
  flushConversationOutbox,
  submitConversationCommand,
  type ConversationCommandStore,
  type PendingConversationCommand,
} from "@workbench/ai-chat-shared/chat/services/conversation-outbox";

function command(clientMessageId = "client-1"): PendingConversationCommand {
  return {
    conversationId: "conversation-1",
    clientMessageId,
    content: "private prompt",
    attachmentIds: ["attachment-1"],
    createdAt: 1,
  };
}

function ack(clientMessageId = "client-1") {
  return {
    conversationId: "conversation-1",
    messageId: `message-${clientMessageId}`,
    assistantMessageId: `assistant-${clientMessageId}`,
    runId: `run-${clientMessageId}`,
    sequence: 1,
    serverCreatedAt: 1,
    conversationRevision: 1,
    status: "accepted" as const,
  };
}

function memoryStore(initial: PendingConversationCommand[] = []) {
  const records = new Map(initial.map((item) => [item.clientMessageId, item]));
  const store: ConversationCommandStore = {
    put: jest.fn(async (item) => {
      records.set(item.clientMessageId, item);
    }),
    remove: jest.fn(async (clientMessageId) => {
      records.delete(clientMessageId);
    }),
    list: jest.fn(async (conversationId) =>
      [...records.values()]
        .filter((item) => item.conversationId === conversationId)
        .sort((left, right) => left.createdAt - right.createdAt),
    ),
  };
  return { records, store };
}

describe("conversation command outbox", () => {
  it("对可重试错误执行有界退避并在 ACK 后删除命令", async () => {
    const { records, store } = memoryStore();
    const submitMessageCommand = jest
      .fn()
      .mockRejectedValueOnce(new ConversationHttpError(500, "HTTP_500", "failed"))
      .mockRejectedValueOnce(new ConversationHttpError(429, "RATE_LIMITED", "busy"))
      .mockResolvedValue(ack());
    const retryDelay = jest.fn(async () => undefined);

    await expect(
      submitConversationCommand(
        { submitMessageCommand } as unknown as AgentClient,
        command(),
        { store, retryDelay },
      ),
    ).resolves.toEqual(ack());

    expect(submitMessageCommand).toHaveBeenCalledTimes(3);
    expect(submitMessageCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({ attachmentIds: ["attachment-1"] }),
    );
    expect(retryDelay).toHaveBeenNthCalledWith(1, 250);
    expect(retryDelay).toHaveBeenNthCalledWith(2, 500);
    expect(records.size).toBe(0);
  });

  it("不可重试错误立即失败并移除无效命令", async () => {
    const { records, store } = memoryStore();
    const submitMessageCommand = jest.fn().mockRejectedValue(
      new ConversationHttpError(413, "PAYLOAD_TOO_LARGE", "too large"),
    );

    await expect(
      submitConversationCommand(
        { submitMessageCommand } as unknown as AgentClient,
        command(),
        { store, retryDelay: jest.fn() },
      ),
    ).rejects.toMatchObject({ status: 413, retryable: false });

    expect(submitMessageCommand).toHaveBeenCalledTimes(1);
    expect(records.size).toBe(0);
  });

  it("重试耗尽后保留命令供刷新后继续投递", async () => {
    const { records, store } = memoryStore();
    const submitMessageCommand = jest.fn().mockRejectedValue(
      new ConversationHttpError(0, "NETWORK_ERROR", "offline", true),
    );

    await expect(
      submitConversationCommand(
        { submitMessageCommand } as unknown as AgentClient,
        command(),
        { store, maxAttempts: 2, retryDelay: jest.fn(async () => undefined) },
      ),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR", retryable: true });

    expect(submitMessageCommand).toHaveBeenCalledTimes(2);
    expect(records.has("client-1")).toBe(true);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("按创建时间顺序重放同一对话的待提交命令", async () => {
    const later = { ...command("client-2"), createdAt: 2 };
    const earlier = { ...command("client-1"), createdAt: 1 };
    const { store } = memoryStore([later, earlier]);
    const submitted: string[] = [];
    const submitMessageCommand = jest.fn(async (item: PendingConversationCommand) => {
      submitted.push(item.clientMessageId);
      return ack(item.clientMessageId);
    });
    const cancelRun = jest.fn().mockResolvedValue(undefined);

    await flushConversationOutbox(
      { submitMessageCommand, cancelRun } as unknown as AgentClient,
      "conversation-1",
      { store, retryDelay: jest.fn() },
    );

    expect(submitted).toEqual(["client-1", "client-2"]);
    expect(cancelRun).toHaveBeenNthCalledWith(1, "conversation-1", "run-client-1");
    expect(cancelRun).toHaveBeenNthCalledWith(2, "conversation-1", "run-client-2");
  });

  it("恢复重放已 ACK 但取消失败时保留命令，避免遗留 queued run", async () => {
    const pending = command();
    const { records, store } = memoryStore([pending]);
    const submitMessageCommand = jest.fn().mockResolvedValue(ack());
    const cancelRun = jest.fn().mockRejectedValue(
      new ConversationHttpError(500, "HTTP_500", "cancel failed"),
    );

    await expect(
      flushConversationOutbox(
        { submitMessageCommand, cancelRun } as unknown as AgentClient,
        "conversation-1",
        { store, retryDelay: jest.fn() },
      ),
    ).rejects.toMatchObject({ code: "HTTP_500" });

    expect(cancelRun).toHaveBeenCalledTimes(3);
    expect(records.has("client-1")).toBe(true);
  });
});
