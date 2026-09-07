import { act, renderHook, waitFor } from "@testing-library/react";

import type { ChatMessage } from "@workbench/ai-chat-shared/message";
import {
  mergeWorkspaceProjectionAck,
  useChatStream,
} from "@workbench/ai-chat-shared/chat/hooks/use-chat-stream";
import { updateSessionTitle } from "@workbench/ai-chat-shared/chat/services/message-service";
import { requestConversationTitle } from "@workbench/ai-chat-shared/chat/services/title-service";

const mockSendMessage = jest.fn();
const mockSubmitMessageCommand = jest.fn(async (input) => ({
  conversationId: input.conversationId,
  messageId: `message-${input.clientMessageId}`,
  runId: `run-${input.clientMessageId}`,
  assistantMessageId: `assistant-${input.clientMessageId}`,
  conversationRevision: 1,
  sequence: 1,
  serverCreatedAt: 1,
  status: "accepted",
}));
const mockLoadConversation = jest.fn(async () => ({
  conversation: { revision: 7 },
  messages: [],
  runs: [],
}));
const mockSupersede = jest.fn(async () => ({
  conversation: { revision: 8 },
  messages: [],
  runs: [],
}));
const mockRetryRun = jest.fn(async (conversationId, userMessageId) => ({
  conversationId,
  messageId: userMessageId,
  runId: "run-retry",
  assistantMessageId: "assistant-retry",
  conversationRevision: 9,
  sequence: 1,
  serverCreatedAt: 1,
  status: "accepted",
}));
let mockHandlers: any;

jest.mock("@workbench/ai-chat-shared/config", () => ({
  getConfiguredAgentClient: jest.fn(() => ({
    submitMessageCommand: mockSubmitMessageCommand,
    loadConversation: mockLoadConversation,
    supersede: mockSupersede,
    retryRun: mockRetryRun,
    cancelRun: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn(),
  })),
  getAuthorContextIntegration: jest.fn(() => ({})),
}));

jest.mock("@workbench/ai-chat-shared/chat/services/message-service", () => ({
  updateSessionTitle: jest.fn().mockResolvedValue(undefined),
  fetchSessionFiles: jest.fn().mockResolvedValue(null),
}));

jest.mock("@workbench/ai-chat-shared/chat/services/title-service", () => ({
  deriveConversationTitle: jest.fn(() => "即时标题"),
  requestConversationTitle: jest.fn().mockResolvedValue(null),
}));

jest.mock("@workbench/ai-chat-shared/lib/active-view-context", () => ({
  buildActiveViewContextPrefix: jest.fn(() => ""),
}));

jest.mock("@workbench/ai-chat-shared/chat/services/stream-service", () => {
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
      onToolCall?: (toolCall: any) => void;
      onToolUpdate?: (update: any) => void;
      onPermission?: (request: any) => void;
      onError?: (error: any) => void;
    } = {};

    connect = jest.fn().mockResolvedValue({});
    waitForConnection = jest.fn().mockResolvedValue(undefined);
    startKeepalive = jest.fn();
    stopKeepalive = jest.fn();
    close = jest.fn();
    sendPermissionResponse = jest.fn();
    setHandlers = jest.fn((handlers) => {
      this.handlers = handlers;
      mockHandlers = handlers;
    });
    sendMessage = mockSendMessage.mockImplementation(
      async (message: string) => {
        if (message.includes("等待计划审批")) {
          this.handlers.onToolCall?.({
            toolCallId: "plan-call-1",
            toolName: "requestPlanApproval",
            status: "running",
          });
          this.handlers.onPermission?.({
            sessionId: "session-1",
            options: [],
            toolCall: {
              toolCallId: "plan-call-1",
              approvalKind: "plan_approval",
            },
          });
          return;
        }
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
  it("晚到 projection ack 只更新同 revision 的已提交摘要", () => {
    const summary = {
      mutations: [
        {
          mutationId: "mutation-1",
          revision: 7,
          status: "committed" as const,
          resources: [
            { path: "demos/home/index.tsx", action: "modified" as const },
          ],
          actor: "agent",
        },
      ],
      projections: [
        {
          revision: 7,
          surface: "active-preview" as const,
          status: "pending" as const,
        },
      ],
    };

    expect(
      mergeWorkspaceProjectionAck(summary, {
        projectId: "proj-1",
        workspaceId: "workspace-1",
        revision: 7,
        clientId: "client-1",
        surface: "active-preview",
        status: "applied",
        acknowledgedAt: Date.now(),
      }).projections,
    ).toEqual([
      {
        revision: 7,
        surface: "active-preview",
        status: "applied",
      },
    ]);
    expect(
      mergeWorkspaceProjectionAck(summary, {
        projectId: "proj-1",
        workspaceId: "workspace-1",
        revision: 8,
        clientId: "client-1",
        surface: "active-preview",
        status: "applied",
        acknowledgedAt: Date.now(),
      }),
    ).toBe(summary);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandlers = undefined;
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
        undefined,
        undefined,
        undefined,
        undefined,
        expect.objectContaining({
          conversationId: "session-1",
          messageId: expect.any(String),
          runId: expect.any(String),
          assistantMessageId: expect.any(String),
          conversationRevision: 1,
        }),
      );
    });
  });

  it("首轮先保存即时标题，再异步替换为模型标题且不阻塞消息发送", async () => {
    let resolveTitle: (title: string) => void = () => {};
    const titlePromise = new Promise<string>((resolve) => {
      resolveTitle = resolve;
    });
    (requestConversationTitle as jest.Mock).mockReturnValueOnce(titlePromise);

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

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleSend("请优化页面布局");
    });

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled());
    await waitFor(() => {
      expect(updateSessionTitle).toHaveBeenCalledWith("session-1", "即时标题");
    });

    resolveTitle("模型标题");
    await waitFor(() => {
      expect(updateSessionTitle).toHaveBeenCalledWith("session-1", "模型标题");
    });
    expect(requestConversationTitle).toHaveBeenCalledWith(
      "agent-session-1",
      "请优化页面布局",
      undefined,
    );
  });

  it("生成标题时不把引用的隐藏上下文发送给标题服务", async () => {
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

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "agent-session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleSend("引用上下文\n\n真实需求", undefined, {
        inlineRefs: {
          tags: [
            {
              type: "page",
              label: "首页",
              context: "隐藏页面源码和配置",
            },
          ],
          text: "真实需求",
        },
      });
    });

    await waitFor(() => {
      expect(requestConversationTitle).toHaveBeenCalledWith(
        "agent-session-1",
        "真实需求",
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
        undefined,
        undefined,
        undefined,
        undefined,
        expect.objectContaining({
          conversationId: "session-1",
          messageId: expect.any(String),
          runId: expect.any(String),
          assistantMessageId: expect.any(String),
          conversationRevision: 1,
        }),
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
        undefined,
        undefined,
        undefined,
        undefined,
        expect.objectContaining({
          conversationId: "session-1",
          messageId: expect.any(String),
          runId: expect.any(String),
          assistantMessageId: expect.any(String),
          conversationRevision: 1,
        }),
      );
      const secondCallContent = mockSendMessage.mock.calls[1]?.[0] as string;
      expect(secondCallContent).toBe("第二条");
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

  it("计划审批超时会结束历史工具状态并释放后续发送", async () => {
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
      result.current.handleSend("等待计划审批");
    });
    await waitFor(() =>
      expect(result.current.pendingPermissionRequest).not.toBeNull(),
    );

    act(() => {
      mockHandlers.onError({
        code: "MESSAGE_TIMEOUT",
        message: "AI 服务响应超时",
      });
    });

    await waitFor(() => {
      expect(result.current.pendingPermissionRequest).toBeNull();
      expect(messages[1]?.parts?.[0]).toMatchObject({
        type: "tool",
        toolCallId: "plan-call-1",
        status: "error",
      });
    });
    act(() => {
      result.current.handleSend("继续");
    });
    await waitFor(() => {
      expect(
        mockSendMessage.mock.calls.some((call) =>
          String(call[0]).includes("继续"),
        ),
      ).toBe(true);
    });
  });

  it("计划批准后将终态工具更新回写到历史卡片", async () => {
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
      result.current.handleSend("等待计划审批");
    });
    await waitFor(() =>
      expect(result.current.pendingPermissionRequest).not.toBeNull(),
    );

    act(() => {
      result.current.handlePermissionResponse("approve_once");
      mockHandlers.onToolUpdate({
        toolCallId: "plan-call-1",
        toolCallStatus: "completed",
        result: { approved: true },
      });
    });

    await waitFor(() => {
      expect(messages[1]?.parts?.[0]).toMatchObject({
        type: "tool",
        toolCallId: "plan-call-1",
        status: "completed",
        result: { approved: true },
      });
    });
    expect(currentMessageRef.current.parts).toEqual([]);
    await act(async () => {
      await mockHandlers.onFinish({
        content: "计划已执行",
        files: [],
      });
    });

    const assistantMessages = messages.filter(
      (message) => message.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(new Set(messages.map((message) => message.id)).size).toBe(
      messages.length,
    );
    expect(assistantMessages[0]).toMatchObject({
      content: "计划已执行",
      parts: [
        expect.objectContaining({
          toolCallId: "plan-call-1",
          status: "completed",
          result: { approved: true },
        }),
      ],
    });
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
        undefined,
        undefined,
        undefined,
        undefined,
        expect.objectContaining({
          conversationId: "session-1",
          messageId: expect.any(String),
          runId: expect.any(String),
          assistantMessageId: expect.any(String),
          conversationRevision: 1,
        }),
      );
    });
  });

  it("发送第二轮消息时不再由浏览器注入历史", async () => {
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
      expect(sentContent).toBe("第二轮问题");
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

  it("重新生成通过账本 supersede 与 retry 创建新 run，不回灌浏览器历史", async () => {
    let messages: ChatMessage[] = [
      { id: "message-user-1", role: "user", content: "原问题" },
      { id: "assistant-old", role: "assistant", content: "旧回答" },
    ];
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
        agentSessionId: "session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage,
      }),
    );

    await act(async () => {
      await result.current.handleRegenerate("assistant-old");
    });

    expect(mockSupersede).toHaveBeenCalledWith({
      conversationId: "session-1",
      afterMessageId: "message-user-1",
      expectedRevision: 7,
    });
    expect(mockRetryRun).toHaveBeenCalledWith("session-1", "message-user-1");
    expect(mockSubmitMessageCommand).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        "原问题",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        expect.objectContaining({
          runId: "run-retry",
          assistantMessageId: "assistant-retry",
        }),
      ),
    );
  });

  it("编辑重发先按服务端 revision 截断账本，再提交新消息", async () => {
    let messages: ChatMessage[] = [
      { id: "message-user-1", role: "user", content: "第一问" },
      { id: "assistant-1", role: "assistant", content: "第一答" },
      { id: "message-user-2", role: "user", content: "第二问" },
      { id: "assistant-2", role: "assistant", content: "第二答" },
    ];
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
        agentSessionId: "session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef,
        setCurrentMessage,
      }),
    );

    await act(async () => {
      await result.current.handleEditResend("message-user-2", "修改后的第二问");
    });

    expect(mockSupersede).toHaveBeenCalledWith({
      conversationId: "session-1",
      afterMessageId: "assistant-1",
      expectedRevision: 7,
    });
    await waitFor(() =>
      expect(mockSubmitMessageCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "session-1",
          content: "修改后的第二问",
        }),
      ),
    );
  });

  it("编辑重发的发送前同步失败时不截断权威账本", async () => {
    const messages: ChatMessage[] = [
      { id: "message-user-1", role: "user", content: "原问题" },
      { id: "assistant-1", role: "assistant", content: "原回答" },
    ];
    const messagesRef = { current: messages };
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const beforeSend = jest
      .fn()
      .mockRejectedValue(new Error("workspace sync failed"));
    const setMessages = jest.fn();

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef: {
          current: { role: "assistant", content: "", parts: [] } as ChatMessage,
        },
        setCurrentMessage: jest.fn(),
        beforeSend,
      }),
    );

    await act(async () => {
      await result.current.handleEditResend("message-user-1", "修改后的问题");
    });

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(mockLoadConversation).not.toHaveBeenCalled();
    expect(mockSupersede).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("消息命令未获 ACK 时明确标记同步失败且不启动 Agent", async () => {
    mockSubmitMessageCommand.mockRejectedValueOnce(
      new Error("ledger unavailable"),
    );
    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages = typeof updater === "function" ? updater(messages) : updater;
      messagesRef.current = messages;
    };

    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef: {
          current: { role: "assistant", content: "", parts: [] } as ChatMessage,
        },
        setCurrentMessage: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleSend("需要可靠提交的问题");
    });

    await waitFor(() => {
      expect(messages[0]).toMatchObject({
        role: "user",
        content: "需要可靠提交的问题",
        syncStatus: "failed",
      });
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("对话 outbox 只保存图片附件元数据，不写入 base64 data URL", async () => {
    let messages: ChatMessage[] = [];
    const messagesRef = { current: messages };
    const setMessages = (
      updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      messages = typeof updater === "function" ? updater(messages) : updater;
      messagesRef.current = messages;
    };
    const { result } = renderHook(() =>
      useChatStream({
        sessionId: "session-1",
        agentSessionId: "session-1",
        messagesRef,
        setMessages,
        setIsStreaming: jest.fn(),
        setStreamContent: jest.fn(),
        currentMessageRef: {
          current: { role: "assistant", content: "", parts: [] } as ChatMessage,
        },
        setCurrentMessage: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleSend(
        "请分析图片",
        [
          {
            data: "very-large-base64",
            mimeType: "image/png",
            name: "image.png",
          },
        ],
        undefined,
        [
          {
            id: "attachment-image",
            name: "image.png",
            mimeType: "image/png",
            size: 128,
            textExtracted: false,
          },
        ],
      );
    });

    await waitFor(() => expect(mockSubmitMessageCommand).toHaveBeenCalled());
    const command = mockSubmitMessageCommand.mock.calls[0][0];
    expect(command.attachmentIds).toEqual(["attachment-image"]);
    expect(command.displayParts).toEqual([
      expect.objectContaining({
        type: "file",
        attachmentId: "attachment-image",
        mimeType: "image/png",
      }),
    ]);
    expect(JSON.stringify(command)).not.toContain("very-large-base64");
    expect(messages[0].parts).toEqual([
      { type: "image", url: "data:image/png;base64,very-large-base64" },
    ]);
  });
});
