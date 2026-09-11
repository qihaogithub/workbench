import { BaseAgent } from "../core/agent";
import {
  AgentError,
  AgentEvent,
  AgentResult,
  AgentStatus,
  RunSummary,
} from "../core/types";
import {
  AgentRunLog,
  AgentRunLogStartOptions,
  createAgentRunLog,
} from "../session/run-log-store";
import { logger } from "../utils/logger";
import type {
  LedgerTerminalInput,
  LedgerTraceEventInput,
} from "../services/conversation-ledger-client";
import type {
  ObservePreviewInput,
  PreviewObservationResult,
} from "@workbench/shared/demo/preview-observation";

const AGENT_EVENT_TYPES = [
  "stream",
  "thought",
  "tool_call",
  "tool_call_update",
  "plan",
  "error",
  "status",
  "context_compacted",
  "capability_activation",
  "run_summary",
  "permission_request",
  "user_choice_request",
] as const;

export interface ServerMessage {
  type:
    | "stream"
    | "thought"
    | "tool_call"
    | "tool_call_update"
    | "plan"
    | "error"
    | "finish"
    | "status"
    | "context_compacted"
    | "run_summary"
    | "pong"
    | "permission_request"
    | "user_choice_request"
    | "models"
    | "preview_observe_request";
  id?: string;
  sessionId?: string;
  conversationId?: string;
  runId?: string;
  assistantMessageId?: string;
  content?: string;
  done?: boolean;
  status?: AgentStatus;
  /** 会话 checkpoint 的单调版本号；仅灰度开启时返回。 */
  checkpointVersion?: number;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  files?: Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    content?: string;
  }>;
  metadata?: {
    model?: string;
    tokens?: {
      prompt: number;
      completion: number;
    };
    duration?: number;
  };
  toolCallId?: string;
  title?: string;
  kind?: "read" | "edit" | "execute";
  toolCallStatus?: "pending" | "in_progress" | "completed" | "failed";
  parameters?: Record<string, unknown>;
  result?: unknown;
  details?: unknown;
  durationMs?: number;
  timestamp?: number;
  contextCompaction?: {
    reason: "preflight" | "overflow_recovery";
    tokensBefore: number;
    contextWindow: number;
    durationMs: number;
  };
  runSummary?: RunSummary;
  permissionRequest?: {
    sessionId: string;
    options: Array<{
      optionId: string;
      name: string;
    }>;
    toolCall: {
      toolCallId: string;
      title?: string;
      kind?: string;
      summary?: string;
      planId?: string;
      approvalKind?: "delete" | "plan_approval" | "config_visibility";
      editable?: boolean;
      initialContent?: string;
    };
  };
  userChoiceRequest?: {
    requestId: string;
    sessionId: string;
    question: string;
    description?: string;
    options: Array<{
      optionId: string;
      label: string;
      value?: string;
      description?: string;
    }>;
    allowCustom: boolean;
  };
  models?: Array<{
    id: string;
    label: string;
  }>;
  currentModelId?: string;
  canSwitch?: boolean;
  previewRequestId?: string;
  previewObservation?: ObservePreviewInput;
  previewResult?: PreviewObservationResult;
}

export type SendMessageFn = (message: ServerMessage) => void;

interface ActiveMessage {
  id: string;
  conversationId: string;
  runId: string;
  assistantMessageId: string;
  isCancelled: boolean;
}

export class WebSocketEventRouter {
  private sendMessage: SendMessageFn;
  private sessionId: string;
  private activeMessage: ActiveMessage | null = null;
  private runLog: AgentRunLog | null = null;
  private agent: BaseAgent | null = null;
  private boundHandler: (event: AgentEvent) => void;
  private onActivity?: (event: AgentEvent) => void;
  private ledgerDisplayParts: Array<Record<string, unknown>> = [];
  private ledgerTraceEvents: LedgerTraceEventInput[] = [];
  private streamPhase: { startedAt: number; contentLength: number; eventCount: number } | null = null;
  private thoughtPhase: { startedAt: number; contentLength: number; eventCount: number } | null = null;
  private terminalTraceRecorded = false;
  private latestContextSummary: NonNullable<
    LedgerTerminalInput["contextSummary"]
  > | null = null;

  constructor(
    sessionId: string,
    sendMessage: SendMessageFn,
    onActivity?: (event: AgentEvent) => void,
  ) {
    this.sessionId = sessionId;
    this.sendMessage = sendMessage;
    this.onActivity = onActivity;
    this.boundHandler = this.handleEvent.bind(this);
  }

  bindAgent(agent: BaseAgent): void {
    if (this.agent === agent) return;

    this.unbindAgent();
    this.agent = agent;

    for (const eventType of AGENT_EVENT_TYPES) {
      agent.on(eventType, this.boundHandler);
    }
  }

  unbindAgent(): void {
    if (!this.agent) return;

    for (const eventType of AGENT_EVENT_TYPES) {
      this.agent.off(eventType, this.boundHandler);
    }
    this.agent = null;
  }

  startMessage(
    messageId: string,
    logOptions?: Omit<AgentRunLogStartOptions, "sessionId" | "messageId">,
  ): void {
    this.ledgerDisplayParts = [];
    this.ledgerTraceEvents = [];
    this.streamPhase = null;
    this.thoughtPhase = null;
    this.terminalTraceRecorded = false;
    this.latestContextSummary = null;
    this.activeMessage = {
      id: messageId,
      conversationId: logOptions?.conversationId || this.sessionId,
      runId: logOptions?.runId || messageId,
      assistantMessageId: logOptions?.assistantMessageId || messageId,
      isCancelled: false,
    };
    this.runLog = logOptions
      ? createAgentRunLog({
          sessionId: this.sessionId,
          messageId,
          ...logOptions,
        })
      : null;
    this.pushTraceEvent({
      source: "system",
      eventType: "run_started",
      title: "Agent 运行开始",
      status: "running",
    });
  }

  cancelMessage(): void {
    if (this.activeMessage) {
      this.activeMessage.isCancelled = true;
      this.runLog?.recordCancel();
      this.pushTraceEvent({
        source: "system",
        eventType: "cancel_requested",
        title: "用户请求取消运行",
        status: "requested",
      });
    }
  }

  async finishMessage(): Promise<void> {
    await this.runLog?.drain();
    this.activeMessage = null;
    this.runLog = null;
  }

  recordFinish(result: AgentResult): void {
    this.runLog?.recordFinish(result);
    if (this.terminalTraceRecorded) return;
    this.closeModelPhases();
    this.terminalTraceRecorded = true;
    const terminalStatus = result.success
      ? "completed"
      : this.isCancelled()
        ? "cancelled"
        : "failed";
    this.pushTraceEvent({
      source: "system",
      eventType: `run_${terminalStatus}`,
      title: terminalStatus === "completed"
        ? "Agent 运行完成"
        : terminalStatus === "cancelled"
          ? "Agent 运行已取消"
          : "Agent 运行失败",
      status: terminalStatus,
      errorCode: result.success ? undefined : result.error?.code,
      durationMs: result.metadata?.duration,
      metrics: {
        success: result.success,
        contentLength: result.content?.length ?? 0,
        fileCount: result.files?.length ?? 0,
      },
      files: result.files?.map(({ path, action }) => ({ path, action })),
    });
  }

  recordError(
    error: AgentError | { code?: string; message?: string; details?: unknown },
  ): void {
    this.runLog?.recordError(error);
    this.pushTraceEvent({
      source: "system",
      eventType: "run_error",
      title: "运行发生错误",
      status: "failed",
      errorCode: error.code,
    });
  }

  isActive(): boolean {
    return this.activeMessage !== null;
  }

  isCancelled(): boolean {
    return this.activeMessage?.isCancelled ?? false;
  }

  getActiveRunIds(): Pick<
    ActiveMessage,
    "conversationId" | "runId" | "assistantMessageId"
  > | null {
    if (!this.activeMessage) return null;
    const { conversationId, runId, assistantMessageId } = this.activeMessage;
    return { conversationId, runId, assistantMessageId };
  }

  getLedgerDisplayParts(): Array<Record<string, unknown>> {
    return this.ledgerDisplayParts.map((part) => ({ ...part }));
  }

  getLedgerTraceEvents(): LedgerTraceEventInput[] {
    this.closeModelPhases();
    return this.ledgerTraceEvents.map((event) => ({
      ...event,
      metrics: event.metrics ? { ...event.metrics } : undefined,
      files: event.files?.map((file) => ({ ...file })),
    }));
  }

  getContextSummary():
    | NonNullable<LedgerTerminalInput["contextSummary"]>
    | undefined {
    return this.latestContextSummary
      ? {
          ...this.latestContextSummary,
          tailMessages: this.latestContextSummary.tailMessages.map(
            (message) => ({ ...message }),
          ),
        }
      : undefined;
  }

  recordContextRestore(input: {
    success: boolean;
    restoredMessageCount: number;
    durationMs: number;
    errorCode?: string;
  }): void {
    this.runLog?.recordContextRestore(input);
    this.pushTraceEvent({
      source: "system",
      eventType: "context_restored",
      title: input.success ? "恢复对话上下文" : "恢复对话上下文失败",
      status: input.success ? "completed" : "failed",
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      metrics: {
        success: input.success,
        restoredMessageCount: input.restoredMessageCount,
      },
    });
  }

  async destroy(): Promise<void> {
    await this.runLog?.drain();
    this.unbindAgent();
    this.activeMessage = null;
    this.runLog = null;
  }

  private handleEvent(event: AgentEvent): void {
    if (event.sessionId !== this.sessionId) return;

    if (event.type === "context_compacted" && event.contextSummary) {
      // The websocket route fills in the ledger revision/sequence boundary.
      // Keep only the bounded private payload here; never forward its body.
      this.latestContextSummary = {
        schemaVersion: 1,
        reason: event.reason,
        summaryText: event.contextSummary.summaryText,
        tailMessages: event.contextSummary.tailMessages.map((message) => ({
          ...message,
        })),
        sourceRevision: 0,
        coveredThroughSequence: 0,
      };
    }

    if (this.activeMessage?.isCancelled) {
      logger.debug(
        { sessionId: this.sessionId, eventType: event.type },
        "Ignoring event after cancel",
      );
      return;
    }

    const messageId = this.activeMessage?.id;
    const runIds = this.getActiveRunIds();
    const observedEvent: AgentEvent =
      event.type === "context_compacted"
        ? { ...event, contextSummary: undefined }
        : event;
    this.onActivity?.(observedEvent);
    this.runLog?.recordAgentEvent(observedEvent);

    switch (event.type) {
      case "stream":
        this.recordModelPhase("stream", event.content.length, event.done);
        this.sendMessage({
          type: "stream",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          content: event.content,
          done: event.done,
        });
        break;

      case "thought":
        this.recordModelPhase("thought", event.content.length, event.done);
        this.sendMessage({
          type: "thought",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          content: event.content,
          done: event.done,
        });
        break;

      case "tool_call":
        this.ledgerDisplayParts.push({
          type: "tool",
          toolCallId: event.toolCallId,
          title: event.title,
          kind: event.kind,
          status: event.status,
        });
        this.pushTraceEvent({
          source: this.isSubagentTool(event.title) ? "subagent" : "tool",
          eventType: "tool_started",
          title: event.title,
          status: event.status,
          toolName: event.title,
          toolCallId: event.toolCallId,
          metrics: { toolKind: event.kind },
        });
        this.sendMessage({
          type: "tool_call",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          toolCallId: event.toolCallId,
          title: event.title,
          kind: event.kind,
          toolCallStatus: event.status,
          parameters: event.parameters,
        });
        break;

      case "tool_call_update": {
        this.ledgerDisplayParts = this.ledgerDisplayParts.map((part) =>
          part.toolCallId === event.toolCallId
            ? {
                ...part,
                status: event.status,
                durationMs: event.durationMs,
                errorMessage: event.error?.message,
              }
            : part,
        );
        const originalTool = this.ledgerDisplayParts.find(
          (part) => part.toolCallId === event.toolCallId,
        );
        const toolTitle = typeof originalTool?.title === "string"
          ? originalTool.title
          : "工具调用";
        this.pushTraceEvent({
          source: this.isSubagentTool(toolTitle) ? "subagent" : "tool",
          eventType: "tool_finished",
          title: toolTitle,
          status: event.status,
          toolName: toolTitle,
          toolCallId: event.toolCallId,
          durationMs: event.durationMs,
          errorCode: event.status === "failed" ? "TOOL_CALL_FAILED" : undefined,
        });
        this.sendMessage({
          type: "tool_call_update",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          toolCallId: event.toolCallId,
          toolCallStatus: event.status,
          content: event.content,
          result: event.result,
          details: event.details,
          durationMs: event.durationMs,
          error: event.error,
        });
        break;
      }

      case "plan":
        this.ledgerDisplayParts.push({
          type: "plan",
          content: event.content.slice(0, 8_000),
        });
        this.pushTraceEvent({
          source: "model",
          eventType: "plan_updated",
          title: "Agent 更新执行计划",
          status: "completed",
          metrics: { contentLength: event.content.length },
        });
        this.sendMessage({
          type: "plan",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          content: event.content,
        });
        break;

      case "error":
        this.pushTraceEvent({
          source: "system",
          eventType: "agent_error",
          title: "Agent 返回错误",
          status: "failed",
          errorCode: event.error.code,
        });
        this.sendMessage({
          type: "error",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          error: event.error,
        });
        break;

      case "status":
        this.pushTraceEvent({
          source: "system",
          eventType: "status_changed",
          title: `运行状态：${event.status}`,
          status: event.status,
        });
        this.sendMessage({
          type: "status",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          status: event.status,
        });
        break;

      case "context_compacted":
        this.pushTraceEvent({
          source: "system",
          eventType: "context_compacted",
          title: "压缩对话上下文",
          status: "completed",
          durationMs: event.durationMs,
          metrics: {
            reason: event.reason,
            tokensBefore: event.tokensBefore,
            contextWindow: event.contextWindow,
          },
        });
        this.sendMessage({
          type: "context_compacted",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          contextCompaction: {
            reason: event.reason,
            tokensBefore: event.tokensBefore,
            contextWindow: event.contextWindow,
            durationMs: event.durationMs,
          },
        });
        break;

      case "run_summary": {
        const projectionStatus = event.runSummary.projections.some(
          (projection) => projection.status === "failed",
        )
          ? "failed"
          : event.runSummary.projections.some((projection) => projection.status === "pending")
            ? "pending"
            : event.runSummary.projections.length > 0
              ? "applied"
              : "none";
        this.pushTraceEvent({
          source: "system",
          eventType: "projection_summary",
          title: "运行结果投影摘要",
          status: "completed",
          metrics: {
            mutationCount: event.runSummary.mutations.length,
            projectionCount: event.runSummary.projections.length,
            observationCount: event.runSummary.observations?.length ?? 0,
            mutationCommitted: event.runSummary.mutations.every(
              (mutation) => mutation.status === "committed",
            ),
            projectionStatus,
          },
          files: event.runSummary.mutations.flatMap((mutation) =>
            mutation.resources.flatMap((resource) =>
              resource.action === "moved"
                ? []
                : [{ path: resource.path, action: resource.action }],
            ),
          ),
        });
        this.sendMessage({
          type: "run_summary",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          runSummary: event.runSummary,
        });
        break;
      }

      case "permission_request":
        this.pushTraceEvent({
          source: "system",
          eventType: "permission_requested",
          title: "等待用户授权",
          status: "pending",
          toolCallId: event.permissionRequest?.toolCall?.toolCallId,
          toolName: event.permissionRequest?.toolCall?.title,
        });
        logger.info(
          {
            event: "permission_request",
            toolCallId: event.permissionRequest?.toolCall?.toolCallId,
          },
          "[WebSocket] Forwarding permission_request event to client",
        );
        this.sendMessage({
          type: "permission_request",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          permissionRequest: event.permissionRequest,
        });
        break;

      case "user_choice_request":
        this.pushTraceEvent({
          source: "system",
          eventType: "user_choice_requested",
          title: "等待用户选择",
          status: "pending",
        });
        logger.info(
          {
            event: "user_choice_request",
            requestId: event.userChoiceRequest.requestId,
          },
          "[WebSocket] Forwarding user_choice_request event to client",
        );
        this.sendMessage({
          type: "user_choice_request",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          userChoiceRequest: event.userChoiceRequest,
        });
        break;

      case "capability_activation":
        this.pushTraceEvent({
          source: "system",
          eventType: "capability_activation",
          title: "加载 Agent 能力",
          status: event.status,
          durationMs: event.durationMs,
          errorCode: event.status === "failed" ? "CAPABILITY_ACTIVATION_FAILED" : undefined,
          metrics: {
            capabilityGroups: event.capabilities,
            previousActiveToolCount: event.previousActiveToolCount,
            activeToolCount: event.activeToolCount,
          },
        });
        break;
    }
  }

  private pushTraceEvent(
    event: Omit<LedgerTraceEventInput, "occurredAt"> & { occurredAt?: number },
  ): void {
    if (!this.activeMessage || this.ledgerTraceEvents.length >= 2_000) return;
    this.ledgerTraceEvents.push({ ...event, occurredAt: event.occurredAt ?? Date.now() });
  }

  private recordModelPhase(
    phase: "stream" | "thought",
    contentLength: number,
    done: boolean,
  ): void {
    const key = phase === "stream" ? "streamPhase" : "thoughtPhase";
    let current = this[key];
    if (!current) {
      current = { startedAt: Date.now(), contentLength: 0, eventCount: 0 };
      this[key] = current;
      this.pushTraceEvent({
        occurredAt: current.startedAt,
        source: "model",
        eventType: `${phase}_started`,
        title: phase === "stream" ? "开始生成回复" : "开始思考",
        status: "running",
      });
    }
    current.contentLength += contentLength;
    current.eventCount += 1;
    if (done) this.closeModelPhase(phase);
  }

  private closeModelPhases(): void {
    this.closeModelPhase("thought");
    this.closeModelPhase("stream");
  }

  private closeModelPhase(phase: "stream" | "thought"): void {
    const key = phase === "stream" ? "streamPhase" : "thoughtPhase";
    const current = this[key];
    if (!current) return;
    this[key] = null;
    this.pushTraceEvent({
      source: "model",
      eventType: `${phase}_finished`,
      title: phase === "stream" ? "回复生成结束" : "思考阶段结束",
      status: "completed",
      durationMs: Date.now() - current.startedAt,
      metrics: {
        contentLength: current.contentLength,
        thoughtEventCount: current.eventCount,
      },
    });
  }

  private isSubagentTool(title: string): boolean {
    return /sub.?agent|delegate|子\s*agent|子智能体/i.test(title);
  }
}
