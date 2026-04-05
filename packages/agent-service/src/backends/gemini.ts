import { AgentConfig, AgentResult, SendMessageOptions, AgentError } from '../core/types';
import { BaseBackendAdapter } from './base';
import { request } from 'undici';

const DEFAULT_MODEL = 'gemini-2.5-pro';
const DEFAULT_TIMEOUT = 120000;

export class GeminiBackend extends BaseBackendAdapter {
  readonly type = 'gemini';
  private apiKey: string;
  private model: string;
  private timeout: number;
  private conversationHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  constructor(config: AgentConfig) {
    super(config);
    this.apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = config.gemini?.model || DEFAULT_MODEL;
    this.timeout = config.gemini?.timeout || DEFAULT_TIMEOUT;
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Google API key is required. Set GEMINI_API_KEY environment variable.');
    }
    const healthy = await this.isHealthy();
    if (!healthy) {
      throw new Error('Gemini API is not available');
    }
    this.connected = true;
  }

  async sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult> {
    this.ensureConnected();

    const timeout = options?.timeout || this.timeout;
    this.createAbortController();
    const startTime = Date.now();

    this.conversationHistory.push({ role: 'user', parts: [{ text: content }] });

    this.emitStream({
      type: 'stream',
      sessionId: this.config.sessionId,
      content: '',
      done: false,
    });

    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.currentModel || this.model}:streamGenerateContent?key=${this.apiKey}`;

      const response = await request(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: this.conversationHistory,
          systemInstruction: {
            parts: [{ text: this.buildSystemInstruction() }],
          },
        }),
        signal: AbortSignal.timeout(timeout),
      });

      const resultContent = await this.parseStreamResponse(response);

      this.conversationHistory.push({ role: 'model', parts: [{ text: resultContent }] });

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
      const response = await request(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  async setModel(modelId: string): Promise<{ success: boolean; error?: string }> {
    const validModels = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
    if (!validModels.includes(modelId)) {
      return { success: false, error: `Invalid model: ${modelId}` };
    }
    this.currentModel = modelId;
    return { success: true };
  }

  async getModels(): Promise<string[]> {
    return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
  }

  private buildSystemInstruction(): string {
    const base = 'You are a helpful coding assistant.';
    if (this.config.workingDir) {
      return `${base} Working directory: ${this.config.workingDir}`;
    }
    return base;
  }

  private async parseStreamResponse(response: { body: unknown }): Promise<string> {
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
            if (!trimmed) continue;

            try {
              const parsed = JSON.parse(trimmed) as { candidates?: Array<{ content?: { parts?: Array<{ text: string }> } }> };
              const parts = parsed.candidates?.[0]?.content?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.text) {
                    fullContent += part.text;
                    this.emitStream({
                      type: 'stream',
                      sessionId: this.config.sessionId,
                      content: part.text,
                      done: false,
                    });
                  }
                }
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
