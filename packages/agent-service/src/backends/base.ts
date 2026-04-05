import { AgentConfig, AgentResult, SendMessageOptions, EventHandler, StreamEvent, ErrorEvent, FinishEvent } from '../core/types';

export interface IBackendAdapter {
  readonly type: string;
  connect(): Promise<void>;
  sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult>;
  cancel(): void;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
  setModel?(modelId: string): Promise<{ success: boolean; error?: string }>;
  setMode?(mode: string): Promise<{ success: boolean; error?: string }>;
  getModels?(): Promise<string[]>;
  onStream?(handler: EventHandler<StreamEvent>): void;
  onError?(handler: EventHandler<ErrorEvent>): void;
  onFinish?(handler: EventHandler<FinishEvent>): void;
}

export abstract class BaseBackendAdapter implements IBackendAdapter {
  abstract readonly type: string;
  protected config: AgentConfig;
  protected connected: boolean = false;
  protected currentModel?: string;
  protected currentMode: string = 'default';
  protected abortController?: AbortController;

  protected streamHandlers: EventHandler<StreamEvent>[] = [];
  protected errorHandlers: EventHandler<ErrorEvent>[] = [];
  protected finishHandlers: EventHandler<FinishEvent>[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult>;
  abstract cancel(): void;
  abstract disconnect(): Promise<void>;
  abstract isHealthy(): Promise<boolean>;

  async setModel(modelId: string): Promise<{ success: boolean; error?: string }> {
    this.currentModel = modelId;
    return { success: true };
  }

  async setMode(mode: string): Promise<{ success: boolean; error?: string }> {
    this.currentMode = mode;
    return { success: true };
  }

  async getModels(): Promise<string[]> {
    return [];
  }

  onStream(handler: EventHandler<StreamEvent>): void {
    this.streamHandlers.push(handler);
  }

  onError(handler: EventHandler<ErrorEvent>): void {
    this.errorHandlers.push(handler);
  }

  onFinish(handler: EventHandler<FinishEvent>): void {
    this.finishHandlers.push(handler);
  }

  protected emitStream(event: StreamEvent): void {
    this.streamHandlers.forEach((h) => h(event));
  }

  protected emitError(event: ErrorEvent): void {
    this.errorHandlers.forEach((h) => h(event));
  }

  protected emitFinish(event: FinishEvent): void {
    this.finishHandlers.forEach((h) => h(event));
  }

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`Backend ${this.type} not connected`);
    }
  }

  protected createAbortController(): AbortController {
    this.abortController = new AbortController();
    return this.abortController;
  }
}
