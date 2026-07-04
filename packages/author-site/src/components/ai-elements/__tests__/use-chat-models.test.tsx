import { act, renderHook, waitFor } from "@testing-library/react";

import { useChatModels } from "../chat/hooks/use-chat-models";

type StreamHandler = (event: Record<string, unknown>) => void | Promise<void>;

class MockAgentStream {
  readonly ws = {
    readyState: 1,
    send: jest.fn(),
  };

  readonly close = jest.fn();

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
  const stream = new MockAgentStream();
  mockStreams.set(sessionId, stream);
  return stream;
});

jest.mock("@/lib/agent-client", () => ({
  getAgentClient: () => ({
    stream: mockStream,
  }),
}));

describe("useChatModels", () => {
  beforeEach(() => {
    mockStreams.clear();
    mockStream.mockClear();
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
        value: { OPEN: 1 },
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
});
