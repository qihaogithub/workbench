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
import type { LedgerTerminalInput } from "../services/conversation-ledger-client";
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
  }

  cancelMessage(): void {
    if (this.activeMessage) {
      this.activeMessage.isCancelled = true;
      this.runLog?.recordCancel();
    }
  }

  async finishMessage(): Promise<void> {
    await this.runLog?.drain();
    this.activeMessage = null;
    this.runLog = null;
  }

  recordFinish(result: AgentResult): void {
    this.runLog?.recordFinish(result);
  }

  recordError(
    error: AgentError | { code?: string; message?: string; details?: unknown },
  ): void {
    this.runLog?.recordError(error);
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

      case "tool_call_update":
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

      case "plan":
        this.ledgerDisplayParts.push({
          type: "plan",
          content: event.content.slice(0, 8_000),
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
        this.sendMessage({
          type: "error",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          error: event.error,
        });
        break;

      case "status":
        this.sendMessage({
          type: "status",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          status: event.status,
        });
        break;

      case "context_compacted":
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

      case "run_summary":
        this.sendMessage({
          type: "run_summary",
          id: messageId,
          sessionId: this.sessionId,
          ...runIds,
          runSummary: event.runSummary,
        });
        break;

      case "permission_request":
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
    }
  }
}
