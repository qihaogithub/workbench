import {
  AgentConfig,
  AgentStatus,
  AgentResult,
  SendMessageOptions,
  EventHandler,
  AgentEvent,
  StreamEvent,
  ErrorEvent,
  FinishEvent,
  StatusEvent,
} from './types';
import { EventEmitter } from 'events';

export abstract class BaseAgent extends EventEmitter {
  protected config: AgentConfig;
  protected _status: AgentStatus = 'initializing';
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
    this.emit('status', {
      type: 'status',
      sessionId: this.sessionId,
      status,
    });
  }

  abstract start(): Promise<void>;
  abstract sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult>;
  abstract cancel(): void;
  abstract kill(): Promise<void>;

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): this {
    return super.on(event, handler as (...args: unknown[]) => void);
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): this {
    return super.off(event, handler as (...args: unknown[]) => void);
  }

  protected emitEvent<T extends AgentEvent>(event: T): void {
    this.emit(event.type, event);
  }

  getInfo(): AgentInfo {
    return {
      sessionId: this.sessionId,
      status: this._status,
      backend: this.config.backend || 'opencode',
      createdAt: this.createdAt.toISOString(),
      lastActivityAt: this.lastActivityAt.toISOString(),
      messageCount: this.messageCount,
      workingDir: this.config.workingDir,
    };
  }
}

interface EventMap {
  stream: StreamEvent;
  error: ErrorEvent;
  finish: FinishEvent;
  status: StatusEvent;
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
