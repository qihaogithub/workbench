import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IBackendAdapter } from "../../src/backends/base";
import type { AgentConfig } from "../../src/core/types";

vi.mock("../../src/core/timeouts", () => ({
  INACTIVITY_TIMEOUT_MS: 1000,
  ABSOLUTE_TIMEOUT_MS: 3000,
  PROCESSING_MAX_TIMEOUT_MS: 2000,
}));

import { BackendAgent } from "../../src/core/backend-agent";

function createMockBackend() {
  let cancelReject: ((err: Error) => void) | null = null;
  const neverResolvePromise = new Promise<string>((_resolve, reject) => {
    cancelReject = reject;
  });

  const backend: IBackendAdapter = {
    name: "test-backend",
    initialize: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockReturnValue(neverResolvePromise),
    onStream: vi.fn(),
    getStatus: vi.fn().mockResolvedValue("idle" as const),
    destroy: vi.fn().mockResolvedValue(undefined),
    checkHealth: vi.fn().mockResolvedValue(true),
    cancelPrompt: vi.fn(() => {
      if (cancelReject) cancelReject(new Error("CANCELLED"));
    }),
    getFiles: vi.fn().mockReturnValue([]),
    getLastResponseDebug: vi.fn().mockReturnValue(null),
  };
  return backend;
}

function createAgent(backend: IBackendAdapter) {
  const config: AgentConfig = { sessionId: "test-session" };
  return new BackendAgent(config, backend);
}

async function startAgent(agent: BackendAgent) {
  await agent.start();
}

describe("BackendAgent 超时防护", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sendMessage 无进展超时后 busy 恢复为 false", async () => {
    const backend = createMockBackend();
    const agent = createAgent(backend);
    await startAgent(agent);

    const resultPromise = agent.sendMessage("hello");
    expect(agent.isBusy()).toBe(true);

    vi.advanceTimersByTime(1100); // 1000ms inactivity timeout + buffer
    await resultPromise;

    expect(agent.isBusy()).toBe(false);
  });

  it("超时后返回 MESSAGE_TIMEOUT 错误码", async () => {
    const backend = createMockBackend();
    const agent = createAgent(backend);
    await startAgent(agent);

    const resultPromise = agent.sendMessage("hello");
    vi.advanceTimersByTime(1100); // 1000ms inactivity timeout + buffer
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("MESSAGE_TIMEOUT");
    expect(result.error?.retryable).toBe(true);
  });

  it("事件持续到来时 inactivity timer 被重置", async () => {
    const backend = createMockBackend();
    const agent = createAgent(backend);
    await startAgent(agent);

    const resultPromise = agent.sendMessage("hello");

    // 每隔 800ms（< INACTIVITY_TIMEOUT_MS=1000ms）发送 stream 事件，持续重置 inactivity timer
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(800);
      agent.emit("stream", {
        type: "stream",
        sessionId: "test-session",
        content: "chunk",
        done: false,
      });
    }
    // 已推进 2400ms，inactivity timer 始终未触发
    expect(agent.isBusy()).toBe(true);
    expect(backend.cancelPrompt).not.toHaveBeenCalled();

    // absolute timer 在 3000ms 时仍然会触发
    vi.advanceTimersByTime(1100);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("MESSAGE_TIMEOUT");
  });

  it("thought 事件不重置 inactivity timer", async () => {
    const backend = createMockBackend();
    const agent = createAgent(backend);
    await startAgent(agent);

    const resultPromise = agent.sendMessage("hello");

    // 持续发送 thought 事件（不是 stream/tool_call/tool_call_update）
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(400);
      agent.emit("thought", {
        type: "thought",
        sessionId: "test-session",
        content: "thinking...",
        done: false,
      });
    }

    // inactivity timer 仍然在 1000ms 时触发
    expect(backend.cancelPrompt).toHaveBeenCalled();

    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("MESSAGE_TIMEOUT");
  });

  it("absolute timer 在持续有事件时仍会触发", async () => {
    const backend = createMockBackend();
    const agent = createAgent(backend);
    await startAgent(agent);

    const resultPromise = agent.sendMessage("hello");

    // 每 500ms 发送 stream 事件，确保 inactivity timer 不触发
    const interval = setInterval(() => {
      agent.emit("stream", {
        type: "stream",
        sessionId: "test-session",
        content: "alive",
        done: false,
      });
    }, 500);

    // 推进到 absolute timer 触发点（3000ms）
    vi.advanceTimersByTime(3100);
    clearInterval(interval);

    const result = await resultPromise;
    expect(backend.cancelPrompt).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("MESSAGE_TIMEOUT");
  });
});
