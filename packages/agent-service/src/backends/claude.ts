import { AgentConfig, AgentResult, SendMessageOptions, AgentError } from '../core/types';
import { BaseBackendAdapter } from './base';
import { request } from 'undici';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_TIMEOUT = 120000;
const API_URL = 'https://api.anthropic.com/v1/messages';

export class ClaudeBackend extends BaseBackendAdapter {
  readonly type = 'claude';
  private apiKey: string;
  private model: string;
  private timeout: number;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor(config: AgentConfig) {
    super(config);
    this.apiKey = config.claude?.apiKey || process.env.CLAUDE_API_KEY || '';
    this.model = config.claude?.model || DEFAULT_MODEL;
    this.timeout = config.claude?.timeout || DEFAULT_TIMEOUT;
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Claude API key is required. Set CLAUDE_API_KEY environment variable.');
    }
    const healthy = await this.isHealthy();
    if (!healthy) {
      throw new Error('Claude API is not available');
    }
    this.connected = true;
  }

  async sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult> {
    this.ensureConnected();

    const timeout = options?.timeout || this.timeout;
    this.createAbortController();
    const startTime = Date.now();

    this.conversationHistory.push({ role: 'user', content });

    this.emitStream({
      type: 'stream',
      sessionId: this.config.sessionId,
      content: '',
      done: false,
    });

    try {
      const response = await request(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify({
          model: this.currentModel || this.model,
          max_tokens: 8192,
          messages: this.conversationHistory,
          system: this.buildSystemPrompt(),
          stream: true,
        }),
        signal: AbortSignal.timeout(timeout),
      });

      const resultContent = await this.parseStreamResponse(response);

      this.conversationHistory.push({ role: 'assistant', content: resultContent });

      const result: AgentResult = {
        success: true,
        content: resultContent,
        metadata: {
          model: this.currentModel || this.model,
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
    this.conversationHistory = [];
  }

  async isHealthy(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const response = await request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: '.' }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      return response.statusCode === 200 || response.statusCode === 400;
    } catch {
      return false;
    }
  }

  async setModel(modelId: string): Promise<{ success: boolean; error?: string }> {
    const validModels = [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ];

    if (!validModels.includes(modelId)) {
      return { success: false, error: `Invalid model: ${modelId}` };
    }

    this.currentModel = modelId;
    return { success: true };
  }

  async getModels(): Promise<string[]> {
    return [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ];
  }

  private buildSystemPrompt(): string {
    const basePrompt = 'You are a helpful coding assistant. You can read, write, and modify files.';
    if (this.config.workingDir) {
      return `${basePrompt}\n\nWorking directory: ${this.config.workingDir}`;
    }
    return basePrompt;
  }

  private async parseStreamResponse(response: { body: { iterator?: () => AsyncIterableIterator<{ data: string }> } }): Promise<string> {
    let fullContent = '';

    try {
      const reader = response.body as unknown as { getReader: () => ReadableStreamDefaultReader<Uint8Array> };
      if (reader.getReader) {
        const streamReader = reader.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;

        while (!done) {
          const readResult = await streamReader.read();
          done = readResult.done;
          const value = readResult.value;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as { type?: string; delta?: { text?: string; content?: string } };
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text || parsed.delta?.content || '';
                fullContent += text;
                this.emitStream({
                  type: 'stream',
                  sessionId: this.config.sessionId,
                  content: text,
                  done: false,
                });
              }
            } catch {
              // Ignore parse errors for individual chunks
            }
          }
        }
      }
    } catch {
      // Ignore stream reading errors
    }

    return fullContent;
  }

  private handleError(error: unknown): AgentError {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('timeout') || message.includes('aborted')) {
      return { code: 'MESSAGE_SEND_ERROR', message: '请求超时', retryable: true };
    }

    if (message.includes('401') || message.includes('403')) {
      return { code: 'BACKEND_UNAVAILABLE', message: 'API Key 无效或权限不足', retryable: false };
    }

    if (message.includes('429')) {
      return { code: 'RATE_LIMIT_EXCEEDED', message: '请求频率过高，请稍后重试', retryable: true };
    }

    return { code: 'MESSAGE_SEND_ERROR', message, retryable: true };
  }
}
