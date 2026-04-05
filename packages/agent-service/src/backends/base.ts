import { AgentConfig, AgentResult, SendMessageOptions } from '../core/types';

export interface IBackendAdapter {
  readonly type: string;
  connect(): Promise<void>;
  sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult>;
  cancel(): void;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export abstract class BaseBackendAdapter implements IBackendAdapter {
  abstract readonly type: string;
  protected config: AgentConfig;
  protected connected: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult>;
  abstract cancel(): void;
  abstract disconnect(): Promise<void>;
  abstract isHealthy(): Promise<boolean>;

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`Backend ${this.type} not connected`);
    }
  }
}
