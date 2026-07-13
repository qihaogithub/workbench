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
      onFinish?: (result: {
        content: string;
        files?: Array<{
          path: string;
          action: "created" | "modified" | "deleted";
          content?: string;
        }>;
      }) => Promise<void>;
    } = {};

    connect = jest.fn().mockResolvedValue({});
    waitForConnection = jest.fn().mockResolvedValue(undefined);
    startKeepalive = jest.fn();
    stopKeepalive = jest.fn();
    close = jest.fn();
    setHandlers = jest.fn((handlers) => {
      this.handlers = handlers;
    });
    sendMessage = mockSendMessage.mockImplementation(
      async (message: string) => {
        const files = message.includes("触发文件回调异常")
          ? [
              {
                path: "demos/demo_omrf/prototype.html",
                action: "modified" as const,
                content: "<main>updated</main>",
              },
            ]
          : [];
        await this.handlers.onFinish?.({
          content: `已处理: ${message}`,
          files,
        });
      },
    );
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it("发送前会等待 beforeSend 完成", async () => {
    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages = typeof updater === "function" ? updater(messages) : updater;
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
    let resolveBeforeSend: () => void = () => undefined;
    let beforeSendCallCount = 0;
    const beforeSend = jest.fn(() => {
      beforeSendCallCount += 1;
      if (beforeSendCallCount > 1) return Promise.resolve();
      return new Promise<void>((resolve) => {
        resolveBeforeSend = resolve;
      });
    });

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        workingDir: "/tmp/workspace",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage,
        beforeSend,
      }),
    );

    act(() => {
      result.current.handleSend("删除共享配置");
    });

    await waitFor(() => {
      expect(beforeSend).toHaveBeenCalledTimes(1);
    });
    expect(mockSendMessage).not.toHaveBeenCalled();

    await act(async () => {
      resolveBeforeSend();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "删除共享配置",
        "/tmp/workspace",
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  it("不会追加用户消息，但会把 hidden prompt 发给 Agent", async () => {
    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages = typeof updater === "function" ? updater(messages) : updater;
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
      messages = typeof updater === "function" ? updater(messages) : updater;
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

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        jest.runOnlyPendingTimers();
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "第一条",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      const secondCallContent = mockSendMessage.mock.calls[1]?.[0] as string;
      expect(secondCallContent).toContain("用户：第一条");
      expect(secondCallContent).toContain("AI：已处理: 第一条");
      expect(secondCallContent).toContain("第二条");
    });

    expect(messages.map((message) => message.content)).toEqual([
      "第一条",
      "已处理: 第一条",
      "第二条",
      expect.stringContaining("第二条"),
    ]);
    expect(messages.some((message) => message.queueStatus)).toBe(false);

    jest.useRealTimers();
  });

  it("AI 回复期间触发的系统自动任务会排队，避免并发发送到 Agent", async () => {
    jest.useFakeTimers();
    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages = typeof updater === "function" ? updater(messages) : updater;
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
    let resolveBeforeSend: () => void = () => undefined;
    const beforeSend = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBeforeSend = resolve;
        }),
    );

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
        beforeSend,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.handleSend("正在执行的用户任务");
      await Promise.resolve();
    });

    expect(beforeSend).toHaveBeenCalledTimes(1);

    const autoRepairOptions = {
      source: "system_auto_repair" as const,
      displayMessage: {
        status: "running" as const,
        title: "转换为HTML/CSS 原型",
        summary: "AI 将生成原型页内容",
        hiddenPrompt: "隐藏的转换提示",
      },
    };

    act(() => {
      result.current.handleSend("隐藏的转换提示", undefined, autoRepairOptions);
      result.current.handleSend("隐藏的转换提示", undefined, autoRepairOptions);
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(
      messages.filter(
        (message) =>
          message.role === "system" &&
          message.kind === "auto_repair" &&
          message.queueStatus === "queued",
      ),
    ).toHaveLength(1);
    expect(messages).toContainEqual(
      expect.objectContaining({
        role: "system",
        kind: "auto_repair",
        content: "转换为HTML/CSS 原型",
        queueStatus: "queued",
        autoRepair: expect.objectContaining({
          status: "running",
          hiddenPrompt: "隐藏的转换提示",
        }),
      }),
    );

    await act(async () => {
      resolveBeforeSend();
      await Promise.resolve();
    });
  });

  it("重复触发正在运行的系统自动任务时不会额外排队", async () => {
    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages = typeof updater === "function" ? updater(messages) : updater;
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
    let resolveBeforeSend: () => void = () => undefined;
    const beforeSend = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBeforeSend = resolve;
        }),
    );

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
        beforeSend,
      }),
    );

    const autoRepairOptions = {
      source: "system_auto_repair" as const,
      displayMessage: {
        status: "running" as const,
        title: "转换为HTML/CSS 原型",
        summary: "AI 将生成原型页内容",
        hiddenPrompt: "隐藏的转换提示",
      },
    };

    act(() => {
      result.current.handleSend("隐藏的转换提示", undefined, autoRepairOptions);
      result.current.handleSend("隐藏的转换提示", undefined, autoRepairOptions);
    });

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(
      messages.filter(
        (message) =>
          message.role === "system" && message.kind === "auto_repair",
      ),
    ).toHaveLength(1);
    expect(messages.some((message) => message.queueStatus)).toBe(false);

    await act(async () => {
      resolveBeforeSend();
      await Promise.resolve();
    });
  });

  it("不同系统自动任务仍会排队等待当前任务结束", async () => {
    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages = typeof updater === "function" ? updater(messages) : updater;
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
    let resolveBeforeSend: () => void = () => undefined;
    const beforeSend = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBeforeSend = resolve;
        }),
    );

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
        beforeSend,
      }),
    );

    act(() => {
      result.current.handleSend("隐藏的转换提示 A", undefined, {
        source: "system_auto_repair",
        displayMessage: {
          status: "running",
          title: "转换为HTML/CSS 原型",
          summary: "AI 将生成原型页内容",
          hiddenPrompt: "隐藏的转换提示 A",
        },
      });
      result.current.handleSend("隐藏的转换提示 B", undefined, {
        source: "system_auto_repair",
        displayMessage: {
          status: "running",
          title: "重新修复预览",
          summary: "AI 将生成原型页内容",
          hiddenPrompt: "隐藏的转换提示 B",
        },
      });
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(messages.map((message) => message.content)).toEqual([
      "转换为HTML/CSS 原型",
      "重新修复预览",
    ]);
    expect(messages[1]).toMatchObject({
      role: "system",
      kind: "auto_repair",
      queueStatus: "queued",
    });

    await act(async () => {
      resolveBeforeSend();
      await Promise.resolve();
    });
  });

  it("发送消息时会把当前选中的模型传给流式服务", async () => {
    const messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const currentMessageRef = {
      current: { role: "assistant", content: "", parts: [] } as ChatMessage,
    };

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        workingDir: "/tmp/workspace",
        selectedModelId: "deepseek/deepseek-v4-pro",
        messagesRef,
        setMessages: jest.fn(),
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleSend("测试模型选择");
    });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "测试模型选择",
        "/tmp/workspace",
        undefined,
        undefined,
        undefined,
        "deepseek/deepseek-v4-pro",
      );
    });
  });

  it("发送第二轮消息时显式注入最近对话历史", async () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "第一轮问题" },
      { role: "assistant", content: "第一轮回答" },
    ];
    const messagesRef = { current: messages };
    const currentMessageRef = {
      current: { role: "assistant", content: "", parts: [] } as ChatMessage,
    };

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        workingDir: "/tmp/workspace",
        messagesRef,
        setMessages: jest.fn(),
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleSend("第二轮问题");
    });

    await waitFor(() => {
      const sentContent = mockSendMessage.mock.calls[0]?.[0] as string;
      expect(sentContent).toContain("用户：第一轮问题");
      expect(sentContent).toContain("AI：第一轮回答");
      expect(sentContent).toContain("第二轮问题");
    });
  });

  it("流式回复完成后恢复发送状态", async () => {
    const messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const currentMessageRef = {
      current: { role: "assistant", content: "", parts: [] } as ChatMessage,
    };
    const setIsStreaming = jest.fn();

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        workingDir: "/tmp/workspace",
        messagesRef,
        setMessages: jest.fn(),
        setIsStreaming,
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleSend("测试完成状态");
    });

    await waitFor(() => {
      expect(setIsStreaming).toHaveBeenCalledWith(false);
    });
  });

  it("流式回复完成后的持久化失败不会卡住发送状态", async () => {
    // 所有 persistMessages 调用都失败，包括发送时立即持久化、流式中间持久化和 onFinish 持久化
    (persistMessages as jest.Mock).mockRejectedValue(new Error("写入失败"));
    const messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const currentMessageRef = {
      current: { role: "assistant", content: "", parts: [] } as ChatMessage,
    };
    const setIsStreaming = jest.fn();
    const onDiagnosticEvent = jest.fn();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        workingDir: "/tmp/workspace",
        messagesRef,
        setMessages: jest.fn(),
        setIsStreaming,
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage: jest.fn(),
        onDiagnosticEvent,
      }),
    );

    act(() => {
      result.current.handleSend("测试完成收尾失败状态");
    });

    await waitFor(() => {
      expect(setIsStreaming).toHaveBeenCalledWith(false);
    });
    expect(onDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ai.stream_finish_finalization_failed",
        level: "warn",
      }),
    );

    warnSpy.mockRestore();
    // 恢复默认 mock 实现，避免影响后续测试
    (persistMessages as jest.Mock).mockResolvedValue(undefined);
  });

  it("流式回复完成后的文件回调失败不会卡住发送状态", async () => {
    const messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const currentMessageRef = {
      current: { role: "assistant", content: "", parts: [] } as ChatMessage,
    };
    const setIsStreaming = jest.fn();
    const onDiagnosticEvent = jest.fn();
    const onFilesChange = jest.fn(() => {
      throw new Error("文件回调失败");
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        workingDir: "/tmp/workspace",
        messagesRef,
        setMessages: jest.fn(),
        setIsStreaming,
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage: jest.fn(),
        onFilesChange,
        onDiagnosticEvent,
      }),
    );

    act(() => {
      result.current.handleSend("触发文件回调异常");
    });

    await waitFor(() => {
      expect(setIsStreaming).toHaveBeenCalledWith(false);
    });
    expect(onFilesChange).toHaveBeenCalledWith([
      {
        path: "demos/demo_omrf/prototype.html",
        action: "modified",
        content: "<main>updated</main>",
      },
    ]);
    expect(onDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ai.stream_finish_finalization_failed",
        level: "warn",
      }),
    );

    warnSpy.mockRestore();
  });

  it("取消当前回复时清空正在展示的计划", () => {
    const messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const currentMessageRef = {
      current: { role: "assistant", content: "", parts: [] } as ChatMessage,
    };

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        messagesRef,
        setMessages: jest.fn(),
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage: jest.fn(),
      }),
    );

    act(() => {
      result.current.setPlan({
        fallbackText: "",
        items: [
          { id: "mobile", title: "修复手机版布局", status: "in_progress" },
        ],
      });
    });

    expect(result.current.plan.items).toHaveLength(1);

    act(() => {
      result.current.handleCancel("", currentMessageRef.current);
    });

    expect(result.current.plan).toEqual({ items: [], fallbackText: "" });
  });
});
