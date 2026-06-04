import {
  AgentConfig,
  AgentStatus,
  AgentResult,
  SendMessageOptions,
  EventHandler,
  AgentEvent,
  StreamEvent,
  ThoughtEvent,
  ToolCallEvent,
  ToolCallUpdateEvent,
  PlanEvent,
  ErrorEvent,
  FinishEvent,
  StatusEvent,
  FileOperationEvent,
  ConfigUpdatedEvent,
} from "./types";
import { EventEmitter } from "events";

export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected _status: AgentStatus = "initializing";
  protected messageCount: number = 0;
  protected createdAt: Date;
  protected lastActivityAt: Date;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
  }

  get sessionId(): string {
    return this.config.sessionId;
  }

  get status(): AgentStatus {
    return this._status;
  }

  get lastActivityAtPub(): Date {
    return this.lastActivityAt;
  }

  protected setStatus(status: AgentStatus): void {
    this._status = status;
    this.lastActivityAt = new Date();
    this.emit("status", {
      type: "status",
      sessionId: this.sessionId,
      status,
    });
  }

  abstract start(options?: { resumeSessionId?: string }): Promise<void>;
  abstract sendMessage(
    content: string,
    options?: SendMessageOptions,
  ): Promise<AgentResult>;
  abstract cancel(): void;
  abstract kill(): Promise<void>;
  abstract updateConfig(config: Partial<AgentConfig>): void;

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  on<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): this {
    return super.on(event, handler as (...args: unknown[]) => void);
  }

  off<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): this {
    return super.off(event, handler as (...args: unknown[]) => void);
  }

  protected emitEvent<T extends AgentEvent>(event: T): void {
    this.emit(event.type, event);
  }

  getInfo(): AgentInfo {
    return {
      sessionId: this.sessionId,
      status: this._status,
      backend: "pi-agent",
      createdAt: this.createdAt.toISOString(),
      lastActivityAt: this.lastActivityAt.toISOString(),
      messageCount: this.messageCount,
      workingDir: this.config.workingDir,
    };
  }

  abstract setModel?(modelId: string): Promise<void>;
  abstract getModelInfo?(): {
    currentModelId: string | null;
    availableModels: Array<{ id: string; label: string }>;
    canSwitch: boolean;
  } | null | Promise<{
    currentModelId: string | null;
    availableModels: Array<{ id: string; label: string }>;
    canSwitch: boolean;
  } | null>;
  abstract getCurrentSessionId?(): string | null;
}

interface EventMap {
  stream: StreamEvent;
  thought: ThoughtEvent;
  tool_call: ToolCallEvent;
  tool_call_update: ToolCallUpdateEvent;
  plan: PlanEvent;
  error: ErrorEvent;
  finish: FinishEvent;
  status: StatusEvent;
  file_operation: FileOperationEvent;
  config_updated: ConfigUpdatedEvent;
}

interface AgentInfo {
  sessionId: string;
  status: AgentStatus;
  backend: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  workingDir?: string;
}
