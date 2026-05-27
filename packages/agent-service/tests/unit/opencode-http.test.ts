import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OpenCodeHttpBackend } from "../../src/backends/opencode-http";
import { AgentConfig } from "../../src/core/types";

// ── Module-level EventSource mock ──
// The backend imports EventSource from the 'eventsource' package.
// vi.mock intercepts the ES module import.
const esHandlers: {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onopen: ((event?: unknown) => void) | null;
} = { onmessage: null, onerror: null, onopen: null };
const esClose = vi.fn();

vi.mock("eventsource", () => ({
  EventSource: vi.fn(() => ({
    close: esClose,
    get onmessage() {
      return esHandlers.onmessage;
    },
    set onmessage(h: ((event: { data: string }) => void) | null) {
      esHandlers.onmessage = h;
    },
    get onerror() {
      return esHandlers.onerror;
    },
    set onerror(h: ((event?: unknown) => void) | null) {
      esHandlers.onerror = h;
    },
    get onopen() {
      return esHandlers.onopen;
    },
    set onopen(h: ((event?: unknown) => void) | null) {
      esHandlers.onopen = h;
    },
  })),
}));

const MOCK_SERVER_URL = "http://localhost:4096";

function createMockConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    sessionId: "test-session-123",
    backend: "opencode-http",
    model: "test-model",
    workingDir: "/tmp/test",
    ...overrides,
  };
}

function resetEsHandlers() {
  esHandlers.onmessage = null;
  esHandlers.onerror = null;
  esHandlers.onopen = null;
  esClose.mockClear();
}

/** 等待 EventSource handler 就绪 */
async function waitForHandler(maxWait = 500) {
  for (let i = 0; i < maxWait / 10; i++) {
    if (esHandlers.onmessage) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("onmessage handler not ready");
}

// ── SSE event helpers (matching OpenCodeSSEEvent format) ──

function sseTextDelta(partId: string, delta: string, field = "text") {
  return {
    id: `evt-${Date.now()}`,
    type: "message.part.delta",
    properties: { partID: partId, field, delta },
  };
}

function ssePartUpdated(partType: string, partId: string, text?: string) {
  return {
    id: `evt-${Date.now()}`,
    type: "message.part.updated",
    properties: {
      part: { type: partType, id: partId, text },
    },
  };
}

function sseSessionIdle() {
  return {
    id: `evt-${Date.now()}`,
    type: "session.idle",
    properties: { sessionID: "oc-session-456" },
  };
}

function sseSessionStatusIdle() {
  return {
    id: `evt-${Date.now()}`,
    type: "session.status",
    properties: { status: { type: "idle" } },
  };
}

function sseSessionDiff(
  diffs: Array<{
    file: string;
    before: string;
    after: string;
    additions: number;
    deletions: number;
  }>,
) {
  return {
    id: `evt-${Date.now()}`,
    type: "session.diff",
    properties: { diff: diffs },
  };
}

function emit(event: unknown) {
  esHandlers.onmessage!({ data: JSON.stringify(event) });
}

// ── Tests ──

describe("OpenCodeHttpBackend", () => {
  let backend: OpenCodeHttpBackend;

  beforeEach(() => {
    resetEsHandlers();
    backend = new OpenCodeHttpBackend(createMockConfig());
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── initialize ──

  describe("initialize", () => {
    it("should create session successfully", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "oc-session-456" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        `${MOCK_SERVER_URL}/session`,
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("test-session-123"),
        }),
      );
      expect(backend.getCurrentSessionId()).toBe("oc-session-456");
    });

    it("should throw when session creation fails", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve("Server error"),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(backend.initialize()).rejects.toThrow(
        "Failed to create OpenCode session",
      );
    });

    it("should not re-initialize when already ready", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "oc-session-456" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── sendMessage sync ──

  describe("sendMessage (sync)", () => {
    it("should send and return text content", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "oc-session-456" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ parts: [{ type: "text", text: "Hello world" }] }),
        });
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();
      const result = await backend.sendMessage("Test message");

      expect(result).toBe("Hello world");
    });

    it("should emit stream done event", async () => {
      const events: Array<{ type: string; content?: string; done?: boolean }> =
        [];
      backend.onStream((event) =>
        events.push(
          event as { type: string; content?: string; done?: boolean },
        ),
      );

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "oc-session-456" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              parts: [{ type: "text", text: "Response text" }],
            }),
        });
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();
      await backend.sendMessage("Test");

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "stream",
        content: "Response text",
        done: true,
      });
    });

    it("should throw on non-ok response", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "oc-session-456" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve("Bad request"),
        });
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();
      await expect(backend.sendMessage("Test")).rejects.toThrow(
        "Failed to send message",
      );
      expect(await backend.getStatus()).toBe("error");
    });
  });

  // ── Helper: pre-initialize backend and set up fetch for stream tests ──

  async function initForStream() {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "oc-session-456" }),
    });
    await backend.initialize();
    // prompt_async response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
  }

  // ── sendMessage stream: text delta ──

  describe("SSE message.part.delta", () => {
    it("should accumulate text deltas and resolve on session.idle", async () => {
      const events: Array<{ type: string; content?: string; done?: boolean }> =
        [];
      backend.onStream((event) =>
        events.push(
          event as { type: string; content?: string; done?: boolean },
        ),
      );

      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(sseTextDelta("p1", "Hello "));
      emit(sseTextDelta("p1", "World"));
      emit(sseSessionIdle());

      const result = await sendPromise;
      expect(result).toBe("Hello World");

      const streamEvents = events.filter((e) => e.type === "stream");
      expect(streamEvents.length).toBeGreaterThanOrEqual(2);
      expect(streamEvents[0].content).toBe("Hello ");
      expect(streamEvents[1].content).toBe("World");
    }, 10000);
  });

  // ── reasoning parts ──

  describe("SSE reasoning parts", () => {
    it("should emit thought events for reasoning part deltas", async () => {
      const events: Array<{ type: string; content?: string }> = [];
      backend.onStream((event) =>
        events.push(event as { type: string; content?: string }),
      );

      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(ssePartUpdated("reasoning", "r1"));
      emit(sseTextDelta("r1", "Thinking..."));
      emit(sseSessionIdle());

      await sendPromise;

      const thoughtEvents = events.filter((e) => e.type === "thought");
      expect(thoughtEvents.length).toBe(1);
      expect(thoughtEvents[0].content).toBe("Thinking...");
    }, 10000);
  });

  // ── step-start / step-finish → tool_call events ──

  describe("SSE step-start / step-finish", () => {
    it("should emit tool_call and tool_call_update events", async () => {
      const events: Array<{
        type: string;
        toolCallId?: string;
        status?: string;
      }> = [];
      backend.onStream((event) =>
        events.push(
          event as { type: string; toolCallId?: string; status?: string },
        ),
      );

      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(ssePartUpdated("step-start", "tool-1"));
      emit(ssePartUpdated("step-finish", "tool-1"));
      emit(sseSessionIdle());

      await sendPromise;

      const toolCalls = events.filter((e) => e.type === "tool_call");
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].toolCallId).toBe("tool-1");

      const toolUpdates = events.filter((e) => e.type === "tool_call_update");
      expect(toolUpdates.length).toBe(1);
      expect(toolUpdates[0].status).toBe("completed");
    }, 10000);
  });

  // ── session.diff → file_operation + getFiles ──

  describe("SSE session.diff", () => {
    it("should emit file_operation events and populate getFiles()", async () => {
      const events: Array<{
        type: string;
        fileOperation?: { path: string; content: string };
      }> = [];
      backend.onStream((event) =>
        events.push(
          event as {
            type: string;
            fileOperation?: { path: string; content: string };
          },
        ),
      );

      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(
        sseSessionDiff([
          {
            file: "index.tsx",
            before: "",
            after: "<div>Hello</div>",
            additions: 1,
            deletions: 0,
          },
          {
            file: "config.schema.json",
            before: "{}",
            after: '{"type":"object"}',
            additions: 1,
            deletions: 1,
          },
        ]),
      );
      emit(sseSessionIdle());

      await sendPromise;

      const fileEvents = events.filter((e) => e.type === "file_operation");
      expect(fileEvents.length).toBe(2);
      expect(fileEvents[0].fileOperation?.path).toBe("index.tsx");
      expect(fileEvents[1].fileOperation?.path).toBe("config.schema.json");

      const files = backend.getFiles();
      expect(files.length).toBe(2);
      expect(files[0]).toMatchObject({ path: "index.tsx", action: "created" });
      expect(files[1]).toMatchObject({
        path: "config.schema.json",
        action: "modified",
      });
    }, 10000);
  });

  // ── Timing: diff before idle ──

  describe("SSE timing: diff before idle", () => {
    it("should have files available when diff arrives before idle", async () => {
      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(
        sseSessionDiff([
          {
            file: "index.tsx",
            before: "",
            after: "new code",
            additions: 1,
            deletions: 0,
          },
        ]),
      );
      emit(sseSessionIdle());

      await sendPromise;

      const files = backend.getFiles();
      expect(files.length).toBe(1);
      expect(files[0].content).toBe("new code");
    }, 10000);
  });

  // ── Timing: idle before diff (drain) ──

  describe("SSE timing: idle before diff (drain)", () => {
    it("should wait for diff during drain and still return files", async () => {
      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      // idle arrives first
      emit(sseSessionIdle());

      // diff arrives shortly after (within drain window)
      await new Promise((resolve) => setTimeout(resolve, 100));
      emit(
        sseSessionDiff([
          {
            file: "index.tsx",
            before: "",
            after: "delayed code",
            additions: 1,
            deletions: 0,
          },
        ]),
      );

      await sendPromise;

      const files = backend.getFiles();
      expect(files.length).toBe(1);
      expect(files[0].content).toBe("delayed code");
    }, 15000);

    it("should resolve with empty files when drain times out with no diff", async () => {
      const shortConfig = createMockConfig({ timeout: 500 });
      const shortBackend = new OpenCodeHttpBackend(shortConfig);

      const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "oc-session-456" }),
      });
      await shortBackend.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const sendPromise = shortBackend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(sseSessionIdle());
      // No diff arrives — drain should time out and resolve

      await sendPromise;

      const files = shortBackend.getFiles();
      expect(files.length).toBe(0);
    }, 15000);
  });

  // ── session.status idle ──

  describe("SSE session.status idle", () => {
    it("should resolve stream on session.status idle", async () => {
      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(sseTextDelta("p1", "text"));
      emit(sseSessionStatusIdle());

      const result = await sendPromise;
      expect(result).toBe("text");
    }, 10000);
  });

  // ── empty diff ──

  describe("SSE empty diff", () => {
    it("should handle session.diff with empty diff array", async () => {
      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(sseSessionDiff([]));
      emit(sseSessionIdle());

      await sendPromise;

      expect(backend.getFiles()).toHaveLength(0);
    }, 10000);
  });

  // ── SSE connection error ──

  describe("SSE connection error", () => {
    it("should reject on SSE connection error", async () => {
      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      esHandlers.onerror!(new Event("error"));

      await expect(sendPromise).rejects.toThrow("SSE connection error");
    }, 10000);
  });

  // ── SSE stream timeout ──

  describe("SSE stream timeout", () => {
    it("should reject on timeout", async () => {
      const shortConfig = createMockConfig({ timeout: 100 });
      const shortBackend = new OpenCodeHttpBackend(shortConfig);

      const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "oc-session-456" }),
      });
      await shortBackend.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const sendPromise = shortBackend.sendMessage("Test", { stream: true });

      await expect(sendPromise).rejects.toThrow("SSE stream timeout");
    }, 10000);
  });

  // ── sendMessage stream error ──

  describe("sendMessage stream error", () => {
    it("should throw on non-ok prompt_async response", async () => {
      const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "oc-session-456" }),
      });
      await backend.initialize();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve("Server error"),
      });

      await expect(
        backend.sendMessage("Test", { stream: true }),
      ).rejects.toThrow("Failed to send async message");
    });
  });

  // ── cancelPrompt ──

  describe("cancelPrompt", () => {
    it("should close SSE and resolve pending stream", async () => {
      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(sseTextDelta("p1", "Partial"));
      backend.cancelPrompt();

      const result = await sendPromise;
      expect(result).toBe("Partial");
      expect(await backend.getStatus()).toBe("ready");
    }, 10000);
  });

  // ── destroy ──

  describe("destroy", () => {
    it("should clean up resources", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "oc-session-456" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();
      await backend.destroy();

      expect(backend.getCurrentSessionId()).toBeNull();
      expect(backend.getFiles()).toHaveLength(0);
    });

    it("should reject pending stream on destroy", async () => {
      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit(sseTextDelta("p1", "Partial"));
      await backend.destroy();

      await expect(sendPromise).rejects.toThrow("Backend destroyed");
    }, 10000);
  });

  // ── start with resume ──

  describe("start with resume", () => {
    it("should resume existing session", async () => {
      await backend.start({ resumeSessionId: "existing-session-id" });

      expect(backend.getCurrentSessionId()).toBe("existing-session-id");
      expect(await backend.getStatus()).toBe("ready");
    });
  });

  // ── health check ──

  describe("health check", () => {
    it("should return true when healthy", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true }));
      expect(await backend.checkHealth()).toBe(true);
    });

    it("should return false when unhealthy", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }));
      expect(await backend.checkHealth()).toBe(false);
    });

    it("should return false on network error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValueOnce(new Error("Network error")),
      );
      expect(await backend.checkHealth()).toBe(false);
    });
  });

  // ── setModel ──

  describe("setModel", () => {
    it("should update config model", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "oc-session-456" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();
      await backend.setModel("new-model-id");

      const modelInfo = await backend.getModelInfo();
      expect(modelInfo?.currentModelId).toBe("new-model-id");
    });
  });

  // ── getModelInfo ──

  describe("getModelInfo", () => {
    it("should fetch models from server", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "oc-session-456" }),
        }) // initialize
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) }) // getSessionInfo (ignored)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              all: [
                {
                  id: "provider-a",
                  models: { "model-a": { id: "model-a", name: "Model A" } },
                },
              ],
            }),
        });
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();
      const modelInfo = await backend.getModelInfo();

      expect(modelInfo).not.toBeNull();
      expect(modelInfo?.availableModels).toHaveLength(1);
      expect(modelInfo?.availableModels[0].label).toBe("Model A");
      expect(modelInfo?.canSwitch).toBe(true);
    });

    it("should return fallback when server unavailable", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "oc-session-456" }),
        })
        .mockRejectedValueOnce(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      await backend.initialize();
      const modelInfo = await backend.getModelInfo();

      expect(modelInfo?.availableModels).toHaveLength(0);
      expect(modelInfo?.currentModelId).toBe("test-model");
    });
  });

  // ── setPromptTimeout ──

  describe("setPromptTimeout", () => {
    it("should set timeout in opencode config", () => {
      const config = createMockConfig({ opencode: { timeout: 30000 } });
      const b = new OpenCodeHttpBackend(config);
      b.setPromptTimeout(60);
      expect(config.opencode!.timeout).toBe(60000);
    });

    it("should not throw when opencode config is absent", () => {
      expect(() => backend.setPromptTimeout(60)).not.toThrow();
    });
  });

  // ── auto-initialize ──

  describe("sendMessage without session", () => {
    it("should auto-initialize when session is null", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "oc-session-456" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              parts: [{ type: "text", text: "Auto-initialized" }],
            }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const result = await backend.sendMessage("Test");
      expect(result).toBe("Auto-initialized");
    });
  });

  // ── ignorable events ──

  describe("ignorable SSE events", () => {
    it("should ignore heartbeat and other ignorable events", async () => {
      const events: Array<{ type: string; done?: boolean }> = [];
      backend.onStream((event) =>
        events.push(event as { type: string; done?: boolean }),
      );

      await initForStream();
      const sendPromise = backend.sendMessage("Test", { stream: true });
      await waitForHandler();

      emit({ id: "1", type: "server.heartbeat", properties: {} });
      emit({ id: "2", type: "server.connected", properties: {} });
      emit({ id: "3", type: "session.updated", properties: {} });
      emit({ id: "4", type: "message.updated", properties: {} });
      emit(sseSessionIdle());

      await sendPromise;

      const meaningful = events.filter(
        (e) =>
          e.type === "stream" || e.type === "thought" || e.type === "tool_call",
      );
      // Only the stream done event from session.idle
      expect(meaningful.length).toBe(1);
      expect(meaningful[0].done).toBe(true);
    }, 10000);
  });
});
