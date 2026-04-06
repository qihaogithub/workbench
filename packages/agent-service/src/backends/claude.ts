import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent } from '../core/types';
import { request } from 'undici';
import { logger } from '../utils/logger';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_TIMEOUT = 120000;
const API_URL = 'https://api.anthropic.com/v1/messages';

export class ClaudeBackend implements IBackendAdapter {
  readonly name = 'claude';
  private config: AgentConfig;
  private apiKey: string;
  private model: string;
  private timeout: number;
  private status: BackendStatus = 'idle';
  private eventCallback?: (event: AgentEvent) => void;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.apiKey = config.claude?.apiKey || process.env.CLAUDE_API_KEY || '';
    this.model = config.claude?.model || DEFAULT_MODEL;
    this.timeout = config.claude?.timeout || DEFAULT_TIMEOUT;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Claude API key is required. Set CLAUDE_API_KEY environment variable.');
    }
    this.status = 'ready';
    logger.info({ sessionId: this.config.sessionId }, 'Claude backend initialized');
  }

  async sendMessage(content: string, options?: { stream?: boolean }): Promise<string> {
    this.status = 'busy';
    this.conversationHistory.push({ role: 'user', content });

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
          model: this.model,
          max_tokens: 8192,
          messages: this.conversationHistory,
          system: this.buildSystemPrompt(),
          stream: true,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      const resultContent = await this.parseStreamResponse(response);
      this.conversationHistory.push({ role: 'assistant', content: resultContent });
      this.status = 'ready';
      return resultContent;
    } catch (error) {
      this.status = 'error';
      throw error;
    }
  }

  private buildSystemPrompt(): string {
    const basePrompt = 'You are a helpful coding assistant. You can read, write, and modify files.';
    if (this.config.workingDir) {
      return `${basePrompt}\n\nWorking directory: ${this.config.workingDir}`;
    }
    return basePrompt;
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
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as { type?: string; delta?: { text?: string; content?: string } };
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text || parsed.delta?.content || '';
                fullContent += text;
                if (this.eventCallback) {
                  this.eventCallback({
                    type: 'stream',
                    sessionId: this.config.sessionId,
                    content: text,
                    done: false,
                  });
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

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    this.conversationHistory = [];
    this.status = 'idle';
    logger.info({ sessionId: this.config.sessionId }, 'Claude backend destroyed');
  }

  async checkHealth(): Promise<boolean> {
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
}
