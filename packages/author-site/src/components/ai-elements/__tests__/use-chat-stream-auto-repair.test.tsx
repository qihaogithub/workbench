import { act, renderHook, waitFor } from "@testing-library/react";

import type { ChatMessage } from "../message";
import { useChatStream } from "../chat/hooks/use-chat-stream";
import {
  persistMessages,
  updateSessionTitle,
} from "../chat/services/message-service";

const mockSendMessage = jest.fn();

jest.mock("../chat/services/message-service", () => ({
  persistMessages: jest.fn().mockResolvedValue(undefined),
  updateSessionTitle: jest.fn().mockResolvedValue(undefined),
  fetchSessionFiles: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/agent/active-view-context", () => ({
  buildActiveViewContextPrefix: jest.fn(() => ""),
}));

jest.mock("../chat/services/stream-service", () => {
  class MissingTransactionalDeleteToolsError extends Error {}

  class StreamService {
    private handlers: {
      onFinish?: (result: { content: string; files?: [] }) => Promise<void>;
    } = {};

    connect = jest.fn().mockResolvedValue({});
    waitForConnection = jest.fn().mockResolvedValue(undefined);
    startKeepalive = jest.fn();
    stopKeepalive = jest.fn();
    close = jest.fn();
    setHandlers = jest.fn((handlers) => {
      this.handlers = handlers;
    });
    sendMessage = mockSendMessage.mockImplementation(async (message: string) => {
      await this.handlers.onFinish?.({ content: `已处理: ${message}`, files: [] });
    });
  }

  return {
    MissingTransactionalDeleteToolsError,
    StreamService,
  };
});

describe("useChatStream 自动修复发送", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("不会追加用户消息，但会把 hidden prompt 发给 Agent", async () => {
    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages =
        typeof updater === "function" ? updater(messages) : updater;
      messagesRef.current = messages;
    };
    const currentMessageRef = {
      current: { role: "assistant", content: "", parts: [] } as ChatMessage,
    };
    const setCurrentMessage = (
      updater: ChatMessage | ((prev: ChatMessage) => ChatMessage),
    ) => {
      currentMessageRef.current =
        typeof updater === "function"
          ? updater(currentMessageRef.current)
          : updater;
    };

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage,
      }),
    );

    await act(async () => {
      await result.current.handleSend("隐藏的完整技术错误", undefined, {
        source: "system_auto_repair",
        displayMessage: {
          status: "running",
          title: "检测到预览异常，正在自动修复",
          summary: "AI 将尝试恢复当前页面预览",
          debugDetail: "错误: import 失败",
          hiddenPrompt: "隐藏的完整技术错误",
        },
      });
    });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "隐藏的完整技术错误",
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    expect(messages.some((message) => message.role === "user")).toBe(false);
    expect(messages[0]).toMatchObject({
      role: "system",
      kind: "auto_repair",
      content: "检测到预览异常，正在自动修复",
      autoRepair: {
        status: "completed",
        title: "检测到预览异常，正在自动修复",
      },
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "已处理: 隐藏的完整技术错误",
    });
    expect(updateSessionTitle).not.toHaveBeenCalled();
    expect(persistMessages).toHaveBeenCalledWith("session-1", messages);
  });

  it("AI 回复期间提交的用户消息会排队并在上一轮结束后自动发送", async () => {
    jest.useFakeTimers();

    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages =
        typeof updater === "function" ? updater(messages) : updater;
      messagesRef.current = messages;
    };
    const currentMessageRef = {
      current: { role: "assistant", content: "", parts: [] } as ChatMessage,
    };
    const setCurrentMessage = (
      updater: ChatMessage | ((prev: ChatMessage) => ChatMessage),
    ) => {
      currentMessageRef.current =
        typeof updater === "function"
          ? updater(currentMessageRef.current)
          : updater;
    };

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage,
      }),
    );

    act(() => {
      result.current.handleSend("第一条");
      result.current.handleSend("第二条");
    });

    expect(
      messages.some(
        (message) =>
          message.role === "user" &&
          message.content === "第二条" &&
          message.queueStatus === "queued",
      ),
    ).toBe(true);

    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "第一条",
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        "第二条",
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    expect(messages.map((message) => message.content)).toEqual([
      "第一条",
      "已处理: 第一条",
      "第二条",
      "已处理: 第二条",
    ]);
    expect(messages.some((message) => message.queueStatus)).toBe(false);

    jest.useRealTimers();
  });
});
