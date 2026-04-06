import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent } from '../core/types';
import { logger } from '../utils/logger';

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096';

export class OpenCodeHttpBackend implements IBackendAdapter {
  readonly name = 'opencode-http';
  private config: AgentConfig;
  private status: BackendStatus = 'idle';
  private eventCallback?: (event: AgentEvent) => void;
  private sessionId: string | null = null;
  private fullContent = '';

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.status === 'ready' || this.status === 'initializing') {
      return;
    }

    this.status = 'initializing';
    logger.info('Initializing OpenCode HTTP backend');

    try {
      await this.createSession();
      this.status = 'ready';
      logger.info({ sessionId: this.sessionId }, 'OpenCode HTTP backend initialized');
    } catch (error) {
      this.status = 'error';
      logger.error({ error }, 'Failed to initialize OpenCode HTTP backend');
      throw error;
    }
  }

  async start(options?: { resumeSessionId?: string }): Promise<void> {
    if (options?.resumeSessionId) {
      this.sessionId = options.resumeSessionId;
      this.status = 'ready';
      logger.info({ sessionId: this.sessionId }, 'OpenCode HTTP backend started with resumed session');
    } else {
      await this.initialize();
    }
  }

  private async createSession(): Promise<void> {
    const response = await fetch(`${OPENCODE_SERVER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: this.config.sessionId || `session-${Date.now()}`,
        model: this.config.model,
        workingDir: this.config.workingDir,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Failed to create OpenCode session: ${await response.text()}`);
    }

    const data = await response.json();
    this.sessionId = data.id;
    logger.info({ sessionId: this.sessionId }, 'Created OpenCode session');
  }

  async sendMessage(content: string, options?: { stream?: boolean }): Promise<string> {
    if (!this.sessionId) {
      await this.initialize();
    }

    if (!this.sessionId) {
      throw new Error('Session ID is not available');
    }

    this.status = 'busy';
    this.fullContent = '';

    try {
      const response = await fetch(`${OPENCODE_SERVER_URL}/session/${this.sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [{ type: 'text', text: content }],
        }),
        signal: AbortSignal.timeout(this.config.timeout || 120000),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${await response.text()}`);
      }

      const data = await response.json();
      
      // 提取文本内容
      const textParts = data.parts?.filter((p: any) => p.type === 'text') || [];
      this.fullContent = textParts.map((p: any) => p.text).join('');

      // 发送流式事件（模拟）
      if (this.eventCallback && this.fullContent) {
        this.eventCallback({
          type: 'stream',
          sessionId: this.config.sessionId,
          content: this.fullContent,
          done: true,
        });
      }

      this.status = 'ready';
      return this.fullContent;
    } catch (error) {
      this.status = 'error';
      logger.error({ error, sessionId: this.sessionId }, 'Failed to send message');
      throw error;
    }
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    this.sessionId = null;
    this.status = 'idle';
    this.fullContent = '';
    logger.info({ sessionId: this.config.sessionId }, 'OpenCode HTTP backend destroyed');
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${OPENCODE_SERVER_URL}/global/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getCurrentSessionId(): string | null {
    return this.sessionId;
  }
}
