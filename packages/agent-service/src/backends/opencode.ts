import { AgentConfig, AgentResult, SendMessageOptions, AgentError, FileChange } from '../core/types';
import { BaseBackendAdapter } from './base';
import { request } from 'undici';

const DEFAULT_SERVER_URL = 'http://localhost:4096';
const DEFAULT_TIMEOUT = 120000;

export class OpenCodeBackend extends BaseBackendAdapter {
  readonly type = 'opencode';
  private serverUrl: string;
  private timeout: number;
  private opencodeSessionId?: string;

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
    this.createAbortController();

    const startTime = Date.now();

    try {
      if (!this.opencodeSessionId) {
        this.opencodeSessionId = await this.createSession();
      }

      this.emitStream({
        type: 'stream',
        sessionId: this.config.sessionId,
        content: '',
        done: false,
      });

      const response = await request(`${this.serverUrl}/session/${this.opencodeSessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [{ type: 'text', text: content }],
        }),
        signal: AbortSignal.timeout(timeout),
      });

      const data = await response.body.json() as Record<string, unknown>;
      const resultContent = this.extractContent(data);

      this.emitStream({
        type: 'stream',
        sessionId: this.config.sessionId,
        content: resultContent,
        done: true,
      });

      const files = await this.getChangedFiles();

      const result: AgentResult = {
        success: true,
        content: resultContent,
        files,
        metadata: {
          model: this.currentModel,
          duration: Date.now() - startTime,
        },
      };

      this.emitFinish({
        type: 'finish',
        sessionId: this.config.sessionId,
        result,
      });

      return result;
    } catch (error) {
      const agentError = this.handleError(error);

      this.emitError({
        type: 'error',
        sessionId: this.config.sessionId,
        error: agentError,
      });

      return {
        success: false,
        error: agentError,
        metadata: { duration: Date.now() - startTime },
      };
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.opencodeSessionId = undefined;
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

  async setModel(modelId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await request(`${this.serverUrl}/session/${this.opencodeSessionId}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
        signal: AbortSignal.timeout(5000),
      });
      this.currentModel = modelId;
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await request(`${this.serverUrl}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.body.json() as { models?: string[] };
      return data.models || [];
    } catch {
      return [];
    }
  }

  private async createSession(): Promise<string> {
    const response = await request(`${this.serverUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: this.config.demoId ? `Demo: ${this.config.demoId}` : 'Agent Session',
        workingDir: this.config.workingDir,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.body.json() as { id?: string };
    if (!data.id) {
      throw new Error('Failed to create session: no ID returned');
    }
    return data.id;
  }

  private async getChangedFiles(): Promise<FileChange[]> {
    if (!this.config.workingDir || !this.opencodeSessionId) return [];

    try {
      const response = await request(`${this.serverUrl}/session/${this.opencodeSessionId}/files`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.body.json() as { files?: Array<{ path: string; action: string; content?: string }> };
      return data.files?.map((f) => ({
        path: f.path,
        action: f.action as FileChange['action'],
        content: f.content,
      })) || [];
    } catch {
      return [];
    }
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

    if (message.includes('timeout') || message.includes('aborted')) {
      return {
        code: 'MESSAGE_SEND_ERROR',
        message: '请求超时',
        retryable: true,
      };
    }

    return {
      code: 'MESSAGE_SEND_ERROR',
      message,
      retryable: !message.includes('404') && !message.includes('400'),
    };
  }
}
