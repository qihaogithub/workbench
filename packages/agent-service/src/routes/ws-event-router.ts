import { BaseAgent } from "../core/agent";
import { AgentError, AgentEvent, AgentResult, AgentStatus } from "../core/types";
import {
  AgentRunLog,
  AgentRunLogStartOptions,
  createAgentRunLog,
} from "../session/run-log-store";
import { logger } from "../utils/logger";

const AGENT_EVENT_TYPES = [
  "stream",
  "thought",
  "tool_call",
  "tool_call_update",
  "plan",
  "error",
  "status",
  "permission_request",
  "user_choice_request",
  "file_operation",
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
    | "pong"
    | "permission_request"
    | "user_choice_request"
    | "models"
    | "file_operation";
  id?: string;
  sessionId?: string;
  content?: string;
  done?: boolean;
  status?: AgentStatus;
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
      approvalKind?: "delete" | "plan_approval";
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
  fileOperation?: {
    method: string;
    path: string;
    content?: string;
  };
}

export type SendMessageFn = (message: ServerMessage) => void;

interface ActiveMessage {
  id: string;
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

  constructor(sessionId: string, sendMessage: SendMessageFn, onActivity?: (event: AgentEvent) => void) {
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
    this.activeMessage = { id: messageId, isCancelled: false };
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

  finishMessage(): void {
    this.activeMessage = null;
    this.runLog = null;
  }

  recordFinish(result: AgentResult): void {
    this.runLog?.recordFinish(result);
  }

  recordError(error: AgentError | { code?: string; message?: string; details?: unknown }): void {
    this.runLog?.recordError(error);
  }

  isActive(): boolean {
    return this.activeMessage !== null;
  }

  isCancelled(): boolean {
    return this.activeMessage?.isCancelled ?? false;
  }

  destroy(): void {
    this.unbindAgent();
    this.activeMessage = null;
    this.runLog = null;
  }

  private handleEvent(event: AgentEvent): void {
    if (event.sessionId !== this.sessionId) return;

    if (this.activeMessage?.isCancelled) {
      logger.debug(
        { sessionId: this.sessionId, eventType: event.type },
        "Ignoring event after cancel",
      );
      return;
    }

    const messageId = this.activeMessage?.id;
    this.onActivity?.(event);
    this.runLog?.recordAgentEvent(event);

    switch (event.type) {
      case "stream":
        this.sendMessage({
          type: "stream",
          id: messageId,
          sessionId: this.sessionId,
          content: event.content,
          done: event.done,
        });
        break;

      case "thought":
        this.sendMessage({
          type: "thought",
          id: messageId,
          sessionId: this.sessionId,
          content: event.content,
          done: event.done,
        });
        break;

      case "tool_call":
        this.sendMessage({
          type: "tool_call",
          id: messageId,
          sessionId: this.sessionId,
          toolCallId: event.toolCallId,
          title: event.title,
          kind: event.kind,
          toolCallStatus: event.status,
          parameters: event.parameters,
        });
        break;

      case "tool_call_update":
        this.sendMessage({
          type: "tool_call_update",
          id: messageId,
          sessionId: this.sessionId,
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
        this.sendMessage({
          type: "plan",
          id: messageId,
          sessionId: this.sessionId,
          content: event.content,
        });
        break;

      case "error":
        this.sendMessage({
          type: "error",
          id: messageId,
          sessionId: this.sessionId,
          error: event.error,
        });
        break;

      case "status":
        this.sendMessage({
          type: "status",
          id: messageId,
          sessionId: this.sessionId,
          status: event.status,
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
          userChoiceRequest: event.userChoiceRequest,
        });
        break;

      case "file_operation":
        logger.info(
          {
            event: "file_operation",
            path: event.fileOperation?.path,
            contentLength: event.fileOperation?.content?.length,
          },
          "[WebSocket] Forwarding file_operation event to client",
        );
        this.sendMessage({
          type: "file_operation",
          id: messageId,
          sessionId: this.sessionId,
          fileOperation: event.fileOperation,
        });
        break;
    }
  }
}
