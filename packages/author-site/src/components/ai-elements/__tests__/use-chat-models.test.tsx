import { act, renderHook, waitFor } from "@testing-library/react";

import { useChatModels } from "@workbench/ai-chat-shared/chat/hooks/use-chat-models";

type StreamHandler = (event: Record<string, unknown>) => void | Promise<void>;

const OPEN_READY_STATE = 1;
const CONNECTING_READY_STATE = 0;
const initialReadyStates = new Map<string, number>();

class MockAgentStream {
  readonly ws: { readyState: number; send: jest.Mock };

  readonly ping = jest.fn();
  readonly close = jest.fn();

  constructor(readyState = OPEN_READY_STATE) {
    this.ws = {
      readyState,
      send: jest.fn(),
    };
  }

  open() {
    this.ws.readyState = OPEN_READY_STATE;
  }

  isOpen() {
    return this.ws.readyState === OPEN_READY_STATE;
  }

  requestModels(options?: {
    workingDir?: string;
    projectId?: string;
    demoId?: string;
  }) {
    if (!this.isOpen()) return;
    this.ws.send(
      JSON.stringify({
        type: "get_models",
        mode: "workbench",
        workingDir: options?.workingDir,
        projectId: options?.projectId,
        demoId: options?.demoId,
      }),
    );
  }

  private readonly handlers = new Map<string, Set<StreamHandler>>();

  on(event: string, handler: StreamHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: StreamHandler) {
    this.handlers.get(event)?.delete(handler);
  }

  async emit(event: string, payload: Record<string, unknown>) {
    const handlers = Array.from(this.handlers.get(event) ?? []);
    for (const handler of handlers) {
      await handler(payload);
    }
  }
}

const mockStreams = new Map<string, MockAgentStream>();
const mockStream = jest.fn((sessionId: string) => {
  const stream = new MockAgentStream(
    initialReadyStates.get(sessionId) ?? OPEN_READY_STATE,
  );
  mockStreams.set(sessionId, stream);
  return stream;
});

jest.mock("@workbench/ai-chat-shared/config", () => ({
  configureAiChatShared: jest.fn(),
  getConfiguredAgentClient: () => ({
    stream: mockStream,
  }),
  getAuthorContextIntegration: () => null,
}));

describe("useChatModels", () => {
  beforeEach(() => {
    mockStreams.clear();
    initialReadyStates.clear();
    mockStream.mockClear();
    window.localStorage.clear();
    jest.useRealTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          frontend: {
            enabledModels: ["custom/default", "custom/preferred"],
            autoEnableRules: [],
            allowedPrefixes: ["custom/"],
            blacklist: [],
            nameFilters: [],
          },
          multimodalModels: [],
        },
      }),
    }) as unknown as typeof fetch;
    if (!global.WebSocket) {
      Object.defineProperty(global, "WebSocket", {
        configurable: true,
        value: { OPEN: OPEN_READY_STATE },
      });
    }
  });

  it("新建 agent session 后保留用户手动选择的模型", async () => {
    const models = [
      { id: "custom/default", label: "Default" },
      { id: "custom/preferred", label: "Preferred" },
    ];
    const { result, rerender } = renderHook(
      ({ agentSessionId }) => useChatModels({ agentSessionId }),
      { initialProps: { agentSessionId: "session-1" } },
    );

    await waitFor(() => expect(mockStreams.get("session-1")).toBeDefined());
    const firstStream = mockStreams.get("session-1")!;

    await act(async () => {
      await firstStream.emit("status", { status: "connected" });
      await firstStream.emit("models", {
        models,
        currentModelId: "custom/default",
        canSwitch: true,
      });
    });

    await waitFor(() =>
      expect(result.current.modelState.currentModelId).toBe("custom/default"),
    );

    act(() => {
      result.current.handleModelChange("custom/preferred");
    });

    expect(firstStream.ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "set_model", modelId: "custom/preferred" }),
    );

    await act(async () => {
      await firstStream.emit("models", {
        currentModelId: "custom/preferred",
      });
    });

    rerender({ agentSessionId: "session-2" });

    await waitFor(() => expect(mockStreams.get("session-2")).toBeDefined());
    const secondStream = mockStreams.get("session-2")!;

    await act(async () => {
      await secondStream.emit("status", { status: "connected" });
      await secondStream.emit("models", {
        models,
        currentModelId: "custom/default",
        canSwitch: true,
      });
    });

    await waitFor(() =>
      expect(result.current.modelState.currentModelId).toBe("custom/preferred"),
    );
    expect(secondStream.ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "set_model", modelId: "custom/preferred" }),
    );
  });

  it("AI 面板重挂载后从本地偏好恢复模型选择", async () => {
    const models = [
      { id: "custom/default", label: "Default" },
      { id: "custom/preferred", label: "Preferred" },
    ];
    const first = renderHook(() =>
      useChatModels({
        agentSessionId: "session-persist-1",
        persistenceKey: "project-1",
      }),
    );

    await waitFor(() => expect(mockStreams.get("session-persist-1")).toBeDefined());
    const firstStream = mockStreams.get("session-persist-1")!;

    await act(async () => {
      await firstStream.emit("status", { status: "connected" });
      await firstStream.emit("models", {
        models,
        currentModelId: "custom/default",
        canSwitch: true,
      });
    });

    act(() => {
      first.result.current.handleModelChange("custom/preferred");
    });
    first.unmount();

    const second = renderHook(() =>
      useChatModels({
        agentSessionId: "session-persist-2",
        persistenceKey: "project-1",
      }),
    );
    await waitFor(() => expect(mockStreams.get("session-persist-2")).toBeDefined());
    const secondStream = mockStreams.get("session-persist-2")!;

    await act(async () => {
      await secondStream.emit("status", { status: "connected" });
      await secondStream.emit("models", {
        models,
        currentModelId: "custom/default",
        canSwitch: true,
      });
    });

    await waitFor(() =>
      expect(second.result.current.modelState.currentModelId).toBe("custom/preferred"),
    );
    expect(secondStream.ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "set_model", modelId: "custom/preferred" }),
    );
    second.unmount();
  });

  it("连接状态事件已发出也会兜底请求模型列表", async () => {
    const { unmount } = renderHook(() =>
      useChatModels({ agentSessionId: "session-ready-fallback", workingDir: "/tmp/workspace" }),
    );

    await waitFor(() => expect(mockStreams.get("session-ready-fallback")).toBeDefined());
    const stream = mockStreams.get("session-ready-fallback")!;

    await waitFor(() =>
      expect(stream.ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "get_models", mode: "workbench", workingDir: "/tmp/workspace" }),
      ),
    );

    unmount();
  });

  it("兜底请求早于 WebSocket OPEN 时不会吞掉 connected 后的模型请求", async () => {
    jest.useFakeTimers();
    initialReadyStates.set("session-delayed-open", CONNECTING_READY_STATE);

    const { unmount } = renderHook(() =>
      useChatModels({
        agentSessionId: "session-delayed-open",
        workingDir: "/tmp/workspace",
      }),
    );

    await waitFor(() => expect(mockStreams.get("session-delayed-open")).toBeDefined());
    const stream = mockStreams.get("session-delayed-open")!;

    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(stream.ws.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: "get_models", mode: "workbench", workingDir: "/tmp/workspace" }),
    );

    stream.open();
    await act(async () => {
      await stream.emit("status", { status: "connected" });
    });

    expect(stream.ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "get_models", mode: "workbench", workingDir: "/tmp/workspace" }),
    );

    unmount();
    jest.useRealTimers();
  });

  it("模型列表专用连接保持心跳，避免空闲后被服务端关闭", async () => {
    jest.useFakeTimers();

    const { unmount } = renderHook(() =>
      useChatModels({ agentSessionId: "session-model-keepalive" }),
    );

    await waitFor(() => expect(mockStreams.get("session-model-keepalive")).toBeDefined());
    const stream = mockStreams.get("session-model-keepalive")!;

    act(() => {
      jest.advanceTimersByTime(25_000);
    });

    expect(stream.ping).toHaveBeenCalledTimes(1);

    unmount();
    jest.useRealTimers();
  });
});
