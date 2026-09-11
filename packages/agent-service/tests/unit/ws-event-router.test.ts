import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BaseAgent } from "../../src/core/agent";
import { AgentConfig, AgentEvent, AgentResult } from "../../src/core/types";
import {
  ServerMessage,
  WebSocketEventRouter,
} from "../../src/routes/ws-event-router";

class TestAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  async start(): Promise<void> {
    return undefined;
  }

  async sendMessage(): Promise<AgentResult> {
    return { success: true, content: "" };
  }

  cancel(): void {
    return undefined;
  }

  async kill(): Promise<void> {
    return undefined;
  }

  updateConfig(): void {
    return undefined;
  }

  fire(event: AgentEvent): void {
    this.emit(event.type, event);
  }
}

describe("WebSocketEventRouter", () => {
  let tempLogDir: string;
  let tempDataDir: string;
  let originalRunLogDir: string | undefined;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    originalRunLogDir = process.env.AGENT_RUN_LOG_DIR;
    originalDataDir = process.env.DATA_DIR;
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-run-logs-"));
    tempDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "agent-diagnostics-data-"),
    );
    process.env.AGENT_RUN_LOG_DIR = tempLogDir;
    process.env.DATA_DIR = tempDataDir;
  });

  afterEach(() => {
    if (originalRunLogDir === undefined) {
      delete process.env.AGENT_RUN_LOG_DIR;
    } else {
      process.env.AGENT_RUN_LOG_DIR = originalRunLogDir;
    }
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    fs.rmSync(tempLogDir, { recursive: true, force: true });
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("应完整转发工具调用入参、结果详情、耗时和错误信息", () => {
    const messages: ServerMessage[] = [];
    const router = new WebSocketEventRouter("session-1", (message) => {
      messages.push(message);
    });
    const agent = new TestAgent({ sessionId: "session-1" });

    router.bindAgent(agent);
    router.startMessage("message-1");

    agent.fire({
      type: "tool_call",
      sessionId: "session-1",
      toolCallId: "delegate-1",
      status: "in_progress",
      title: "delegateTask",
      kind: "execute",
      parameters: { task: "检查重复页面", context: "当前项目" },
    });
    agent.fire({
      type: "tool_call_update",
      sessionId: "session-1",
      toolCallId: "delegate-1",
      status: "completed",
      content: "发现 2 个重复页面",
      result: { content: "发现 2 个重复页面" },
      details: {
        success: true,
        files: [{ path: "workspace-tree.json", action: "modified" }],
      },
      durationMs: 1234,
    });
    agent.fire({
      type: "tool_call_update",
      sessionId: "session-1",
      toolCallId: "delegate-2",
      status: "failed",
      error: { message: "Subagent timed out" },
      details: { success: false, error: "Subagent timed out" },
      durationMs: 5000,
    });

    expect(messages).toEqual([
      expect.objectContaining({
        type: "tool_call",
        id: "message-1",
        toolCallId: "delegate-1",
        parameters: { task: "检查重复页面", context: "当前项目" },
      }),
      expect.objectContaining({
        type: "tool_call_update",
        id: "message-1",
        toolCallId: "delegate-1",
        content: "发现 2 个重复页面",
        result: { content: "发现 2 个重复页面" },
        details: {
          success: true,
          files: [{ path: "workspace-tree.json", action: "modified" }],
        },
        durationMs: 1234,
      }),
      expect.objectContaining({
        type: "tool_call_update",
        id: "message-1",
        toolCallId: "delegate-2",
        error: { message: "Subagent timed out" },
        details: { success: false, error: "Subagent timed out" },
        durationMs: 5000,
      }),
    ]);
  });

  it("转发上下文压缩事件而不暴露压缩摘要", () => {
    const messages: ServerMessage[] = [];
    const router = new WebSocketEventRouter("session-1", (message) => {
      messages.push(message);
    });
    const agent = new TestAgent({ sessionId: "session-1" });

    router.bindAgent(agent);
    router.startMessage("message-1");
    agent.fire({
      type: "context_compacted",
      sessionId: "session-1",
      reason: "preflight",
      tokensBefore: 104_000,
      contextWindow: 128_000,
      durationMs: 321,
    });

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "context_compacted",
        id: "message-1",
        sessionId: "session-1",
        contextCompaction: {
          reason: "preflight",
          tokensBefore: 104_000,
          contextWindow: 128_000,
          durationMs: 321,
        },
      }),
    );

    expect(router.getContextSummary()).toBeUndefined();
  });

  it("缓存压缩摘要供账本终态使用，但不把正文发给浏览器", () => {
    const messages: ServerMessage[] = [];
    const router = new WebSocketEventRouter("session-1", (message) => {
      messages.push(message);
    });
    const agent = new TestAgent({ sessionId: "session-1" });

    router.bindAgent(agent);
    router.startMessage("message-1");
    agent.fire({
      type: "context_compacted",
      sessionId: "session-1",
      reason: "overflow_recovery",
      tokensBefore: 200_000,
      contextWindow: 128_000,
      durationMs: 20,
      contextSummary: {
        summaryText: "私有压缩正文，不得出现在浏览器消息中",
        tailMessages: [{ role: "user", content: "尾部消息" }],
        summaryHash: "hash-1",
      },
    });

    expect(JSON.stringify(messages)).not.toContain("私有压缩正文");
    expect(router.getContextSummary()).toMatchObject({
      schemaVersion: 1,
      reason: "overflow_recovery",
      summaryText: "私有压缩正文，不得出现在浏览器消息中",
      tailMessages: [{ role: "user", content: "尾部消息" }],
      sourceRevision: 0,
      coveredThroughSequence: 0,
    });
  });

  it("转发 mutation 与 projection 的运行摘要", () => {
    const messages: ServerMessage[] = [];
    const router = new WebSocketEventRouter("session-1", (message) => {
      messages.push(message);
    });
    const agent = new TestAgent({ sessionId: "session-1" });

    router.bindAgent(agent);
    router.startMessage("message-1");
    agent.fire({
      type: "run_summary",
      sessionId: "session-1",
      runSummary: {
        mutations: [
          {
            mutationId: "mutation-1",
            revision: 7,
            status: "committed",
            resources: [
              { path: "demos/home/prototype.html", action: "modified" },
            ],
            actor: "agent",
          },
        ],
        projections: [{ revision: 7, surface: "preview", status: "applied" }],
      },
    });

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "run_summary",
        id: "message-1",
        sessionId: "session-1",
        runSummary: expect.objectContaining({
          mutations: [expect.objectContaining({ mutationId: "mutation-1" })],
        }),
      }),
    );
  });

  it("应在转发 Agent 事件时通知活动回调", () => {
    const activities: AgentEvent[] = [];
    const router = new WebSocketEventRouter(
      "session-1",
      () => undefined,
      (event) => activities.push(event),
    );
    const agent = new TestAgent({ sessionId: "session-1" });

    router.bindAgent(agent);
    router.startMessage("message-1");

    const thoughtEvent: AgentEvent = {
      type: "thought",
      sessionId: "session-1",
      content: "still working",
      done: false,
    };
    agent.fire(thoughtEvent);

    expect(activities).toEqual([thoughtEvent]);
  });

  it("生成不含工具参数、结果和思考正文的结构化轨迹", () => {
    const router = new WebSocketEventRouter("session-1", () => undefined);
    const agent = new TestAgent({ sessionId: "session-1" });
    router.bindAgent(agent);
    router.startMessage("message-1");
    agent.fire({ type: "thought", sessionId: "session-1", content: "private reasoning", done: true });
    agent.fire({
      type: "tool_call",
      sessionId: "session-1",
      toolCallId: "tool-1",
      status: "in_progress",
      title: "readFile",
      kind: "read",
      parameters: { token: "secret", path: "private.txt" },
    });
    agent.fire({
      type: "tool_call_update",
      sessionId: "session-1",
      toolCallId: "tool-1",
      status: "completed",
      result: "private file body",
      durationMs: 12,
    });
    router.recordFinish({
      success: true,
      content: "final response",
      files: [{ path: "src/page.tsx", action: "modified", content: "private source" }],
    });

    const trace = router.getLedgerTraceEvents();
    expect(trace.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "run_started", "thought_started", "thought_finished", "tool_started", "tool_finished", "run_completed",
    ]));
    expect(JSON.stringify(trace)).not.toMatch(/private reasoning|secret|private\.txt|file body|private source|final response/);
    expect(trace.at(-1)?.files).toEqual([{ path: "src/page.tsx", action: "modified" }]);
  });

  it("将执行中的用户取消记录为明确终态", () => {
    const router = new WebSocketEventRouter("session-1", () => undefined);
    router.startMessage("message-1");
    router.cancelMessage();
    router.recordFinish({
      success: false,
      error: { code: "CANCELLED", message: "cancelled", retryable: false },
    });

    expect(router.getLedgerTraceEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "cancel_requested", status: "requested" }),
      expect.objectContaining({ eventType: "run_cancelled", status: "cancelled" }),
    ]));
  });

  it("应转发用户单选确认请求", () => {
    const messages: ServerMessage[] = [];
    const router = new WebSocketEventRouter("session-1", (message) => {
      messages.push(message);
    });
    const agent = new TestAgent({ sessionId: "session-1" });

    router.bindAgent(agent);
    router.startMessage("message-1");

    agent.fire({
      type: "user_choice_request",
      sessionId: "session-1",
      userChoiceRequest: {
        requestId: "choice-1",
        sessionId: "session-1",
        question: "选择布局？",
        options: [
          { optionId: "option_1", label: "左右布局" },
          { optionId: "option_2", label: "上下布局" },
        ],
        allowCustom: true,
      },
    });

    expect(messages).toEqual([
      expect.objectContaining({
        type: "user_choice_request",
        id: "message-1",
        sessionId: "session-1",
        userChoiceRequest: expect.objectContaining({
          requestId: "choice-1",
          question: "选择布局？",
        }),
      }),
    ]);
  });

  it("应在 run 结束 drain 后将执行事件保存到 JSONL 日志文件", async () => {
    const router = new WebSocketEventRouter("session-1", () => undefined);
    const agent = new TestAgent({ sessionId: "session-1" });

    router.bindAgent(agent);
    router.startMessage("message-1", {
      contentLength: 8,
      workingDir: "/tmp/workspace",
      demoId: "demo-1",
      model: "openai/gpt-5",
    });

    agent.fire({
      type: "stream",
      sessionId: "session-1",
      content: "hello",
      done: false,
    });
    agent.fire({
      type: "context_compacted",
      sessionId: "session-1",
      reason: "preflight",
      tokensBefore: 12_000,
      contextWindow: 16_000,
      durationMs: 5,
      contextSummary: {
        summaryText: "do not persist this private summary",
        tailMessages: [{ role: "assistant", content: "private tail" }],
        summaryHash: "hash-2",
      },
    });
    agent.fire({
      type: "tool_call",
      sessionId: "session-1",
      toolCallId: "delegate-1",
      status: "in_progress",
      title: "delegateTask",
      kind: "execute",
      parameters: { task: "检查页面", apiKey: "secret-key" },
    });
    agent.fire({
      type: "tool_call_update",
      sessionId: "session-1",
      toolCallId: "delegate-1",
      status: "completed",
      details: {
        success: true,
        content: "完成",
        files: [{ path: "workspace-tree.json", action: "modified" }],
        receipt: { committed: true, revision: 7 },
        runtimeValidation: { ok: true },
      },
      durationMs: 1200,
    });
    agent.fire({
      type: "run_summary",
      sessionId: "session-1",
      runSummary: {
        mutations: [
          {
            mutationId: "mutation-1",
            revision: 7,
            status: "committed",
            resources: [{ path: "workspace-tree.json", action: "modified" }],
            actor: "agent",
          },
        ],
        projections: [
          { revision: 7, surface: "active-preview", status: "applied" },
        ],
      },
    });
    router.recordContextRestore({
      success: true,
      restoredMessageCount: 3,
      durationMs: 9,
    });
    router.recordFinish({
      success: true,
      content: "",
      files: [{ path: "workspace-tree.json", action: "modified" }],
    });
    await router.finishMessage();

    const logPath = path.join(tempLogDir, "session-1", "message-1.jsonl");
    const entries = fs
      .readFileSync(logPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(fs.readFileSync(logPath, "utf-8")).not.toContain(
      "do not persist this private summary",
    );
    expect(fs.readFileSync(logPath, "utf-8")).not.toContain("private tail");

    expect(entries.map((entry) => entry.eventType)).toEqual([
      "run_start",
      "stream_start",
      "context_compacted",
      "tool_call",
      "tool_call_update",
      "context_restore_succeeded",
      "finish",
    ]);
    expect(entries[3]).toEqual(
      expect.objectContaining({
        source: "subagent",
        title: "Subagent task started",
        summary: "检查页面",
      }),
    );
    expect(entries[3].payload.parameters.apiKey).toBe("[REDACTED]");
    expect(entries[6].payload).toEqual(
      expect.objectContaining({
        finishContentLength: 0,
        accumulatedStreamLength: 5,
        toolResultCount: 1,
        subagentResultCount: 1,
        fileCount: 1,
        metrics: expect.objectContaining({
          runDurationMs: expect.any(Number),
          firstThoughtMs: null,
          firstToolMs: expect.any(Number),
          firstTextMs: expect.any(Number),
          finishMs: expect.any(Number),
          thoughtEventCount: 0,
          thoughtCharCount: 0,
          toolCallCount: 1,
          toolResultCount: 1,
          toolDurationSumMs: 1200,
          toolIntervalMs: expect.any(Number),
          capabilityActivationCount: 0,
          capabilityActivationDurationMs: 0,
          mutationCommitted: true,
          runtimeValidationOk: true,
          projectionStatus: "applied",
          model: "openai/gpt-5",
          provider: "openai",
        }),
      }),
    );
    expect(entries[6].payload.metrics.toolIntervalMs).toBeGreaterThanOrEqual(
      1200,
    );

    const diagnosticPath = path.join(
      tempDataDir,
      "editor-diagnostics",
      "agent-service.jsonl",
    );
    expect(fs.readFileSync(diagnosticPath, "utf-8")).not.toContain(
      "do not persist this private summary",
    );
    expect(fs.readFileSync(diagnosticPath, "utf-8")).not.toContain(
      "private tail",
    );
    const diagnostics = fs
      .readFileSync(diagnosticPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(diagnostics.map((entry) => entry.eventType)).toEqual([
      "ai.run_started",
      "ai.tool_call_started",
      "ai.tool_call_finished",
      "ai.context_restore_succeeded",
      "ai.run_finished",
    ]);
    expect(diagnostics[1].payload).toEqual(
      expect.objectContaining({
        messageId: "message-1",
        runId: "message-1",
        toolCallId: "delegate-1",
        toolName: "delegateTask",
        status: "in_progress",
      }),
    );
    expect(diagnostics[1].payload.parameters).toBeUndefined();
    expect(diagnostics[3].payload).toEqual(
      expect.objectContaining({
        restoredMessageCount: 3,
        durationMs: 9,
        status: "succeeded",
      }),
    );
  });

  it("将能力加载指标写入 run log 与结构化诊断，但不发送用户侧事件", async () => {
    const messages: ServerMessage[] = [];
    const router = new WebSocketEventRouter("session-activation", (message) => {
      messages.push(message);
    });
    const agent = new TestAgent({ sessionId: "session-activation" });
    router.bindAgent(agent);
    router.startMessage("message-activation", { contentLength: 0 });

    agent.fire({
      type: "capability_activation",
      sessionId: "session-activation",
      status: "completed",
      capabilities: ["workspace", "pages"],
      previousActiveToolCount: 8,
      activeToolCount: 20,
      durationMs: 4,
    });
    await router.finishMessage();

    expect(messages).toEqual([]);
    const logPath = path.join(
      tempLogDir,
      "session-activation",
      "message-activation.jsonl",
    );
    expect(fs.readFileSync(logPath, "utf-8")).toContain(
      '"eventType":"capability_activation"',
    );

    const diagnosticPath = path.join(
      tempDataDir,
      "editor-diagnostics",
      "agent-service.jsonl",
    );
    const diagnostic = fs
      .readFileSync(diagnosticPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .find((entry) => entry.eventType === "ai.capability_activated");
    expect(diagnostic.eventType).toBe("ai.capability_activated");
    expect(diagnostic.payload).toMatchObject({
      capabilityGroups: ["workspace", "pages"],
      previousActiveToolCount: 8,
      activeToolCount: 20,
      durationMs: 4,
    });
  });
});
