import { AgentConfig, AgentResult, SendMessageOptions, AgentError } from '../core/types';
import { BaseBackendAdapter } from './base';
import { request } from 'undici';

const DEFAULT_SERVER_URL = 'http://localhost:4096';
const DEFAULT_TIMEOUT = 120000;

export class OpenCodeBackend extends BaseBackendAdapter {
  readonly type = 'opencode';
  private serverUrl: string;
  private timeout: number;
  private sessionId?: string;
  private abortController?: AbortController;

  constructor(config: AgentConfig) {
    super(config);
    this.serverUrl = config.opencode?.serverUrl || process.env.OPENCODE_SERVER_URL || DEFAULT_SERVER_URL;
    this.timeout = config.opencode?.timeout || DEFAULT_TIMEOUT;
  }

  async connect(): Promise<void> {
    const healthy = await this.isHealthy();
    if (!healthy) {
      throw new Error(`OpenCode server not available at ${this.serverUrl}`);
    }
    this.connected = true;
  }

  async sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult> {
    this.ensureConnected();

    const timeout = options?.timeout || this.timeout;
    this.abortController = new AbortController();

    try {
      if (!this.sessionId) {
        this.sessionId = await this.createSession();
      }

      const response = await request(`${this.serverUrl}/session/${this.sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [{ type: 'text', text: content }],
        }),
        signal: AbortSignal.timeout(timeout),
      });

      const data = await response.body.json() as Record<string, unknown>;
      return this.parseResponse(data);
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error),
      };
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.sessionId = undefined;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await request(`${this.serverUrl}/global/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  private async createSession(): Promise<string> {
    const response = await request(`${this.serverUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: this.config.demoId ? `Demo: ${this.config.demoId}` : 'Agent Session',
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.body.json() as { id?: string };
    if (!data.id) {
      throw new Error('Failed to create session: no ID returned');
    }
    return data.id;
  }

  private parseResponse(data: Record<string, unknown>): AgentResult {
    const content = this.extractContent(data);
    return {
      success: true,
      content,
    };
  }

  private extractContent(data: Record<string, unknown>): string {
    if (Array.isArray(data?.parts)) {
      return data.parts
        .filter((p: Record<string, unknown>) => p.type === 'text' && p.text)
        .map((p: Record<string, unknown>) => p.text as string)
        .join('\n');
    }
    const info = data?.info as Record<string, unknown> | undefined;
    if (info?.content) return info.content as string;
    if (data?.content) return data.content as string;
    return '';
  }

  private handleError(error: unknown): AgentError {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      code: 'MESSAGE_SEND_ERROR',
      message,
      retryable: !message.includes('timeout'),
    };
  }
}
