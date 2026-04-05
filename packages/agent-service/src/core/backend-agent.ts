import { BaseAgent } from '../core/agent';
import { AgentConfig, AgentResult, SendMessageOptions, StreamEvent } from '../core/types';
import { IBackendAdapter } from '../backends/base';

export class BackendAgent extends BaseAgent {
  private backend: IBackendAdapter;
  private bootstrap: Promise<void> | undefined;
  private bootstrapping = false;
  private isFirstMessage = true;
  private busy = false;
  private streamBuffer: Map<string, { content: string; timer: ReturnType<typeof setTimeout> }> = new Map();
  private readonly STREAM_FLUSH_MS = 120;

  constructor(config: AgentConfig, backend: IBackendAdapter) {
    super(config);
    this.backend = backend;

    this.backend.onStream?.((event) => {
      this.bufferStreamEvent(event);
    });

    this.backend.onError?.((event) => {
      this.flushStreamBuffer();
      this.emit('error', event);
    });

    this.backend.onFinish?.((event) => {
      this.flushStreamBuffer();
      this.emit('finish', event);
    });
  }

  private bufferStreamEvent(event: StreamEvent): void {
    const key = this.config.sessionId;
    const existing = this.streamBuffer.get(key);

    if (existing) {
      existing.content += event.content;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.flushStreamEvent(key), this.STREAM_FLUSH_MS);
      return;
    }

    const timer = setTimeout(() => this.flushStreamEvent(key), this.STREAM_FLUSH_MS);
    this.streamBuffer.set(key, { content: event.content, timer });
  }

  private flushStreamEvent(key: string): void {
    const buffered = this.streamBuffer.get(key);
    if (!buffered) return;

    this.streamBuffer.delete(key);
    this.emit('stream', {
      type: 'stream',
      sessionId: this.config.sessionId,
      content: buffered.content,
      done: false,
    });
  }

  private flushStreamBuffer(): void {
    for (const key of this.streamBuffer.keys()) {
      const buffered = this.streamBuffer.get(key);
      if (buffered) {
        clearTimeout(buffered.timer);
        this.emit('stream', {
          type: 'stream',
          sessionId: this.config.sessionId,
          content: buffered.content,
          done: false,
        });
      }
    }
    this.streamBuffer.clear();
  }

  private initBackend(): Promise<void> {
    if (this.bootstrap) return this.bootstrap;
    this.bootstrapping = true;
    this.bootstrap = (async () => {
      await this.backend.connect();
      this.bootstrapping = false;
    })();
    return this.bootstrap;
  }

  async start(): Promise<void> {
    await this.initBackend();
    this.setStatus('ready');
  }

  async sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult> {
    this.bootstrapping = false;
    this.busy = true;
    this.messageCount++;

    if (this.isFirstMessage) {
      this.isFirstMessage = false;
    }

    this.setStatus('processing');

    try {
      await this.initBackend();
      const result = await this.backend.sendMessage(content, options);

      if (!result.success) {
        this.busy = false;
      }

      this.setStatus(result.success ? 'ready' : 'error');
      return result;
    } catch (error) {
      this.flushStreamBuffer();
      this.busy = false;
      this.setStatus('error');
      return {
        success: false,
        error: {
          code: 'MESSAGE_SEND_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
      };
    }
  }

  cancel(): void {
    this.backend.cancel();
    this.busy = false;
  }

  async kill(): Promise<void> {
    this.flushStreamBuffer();
    await this.backend.disconnect();
    this.busy = false;
    this.setStatus('destroyed');
  }

  isBusy(): boolean {
    return this.busy;
  }

  async setModel(modelId: string): Promise<{ success: boolean; error?: string }> {
    if (this.backend.setModel) {
      return this.backend.setModel(modelId);
    }
    return { success: false, error: 'Model switching not supported' };
  }

  async setMode(mode: string): Promise<{ success: boolean; error?: string }> {
    if (this.backend.setMode) {
      return this.backend.setMode(mode);
    }
    return { success: false, error: 'Mode switching not supported' };
  }

  async getModels(): Promise<string[]> {
    if (this.backend.getModels) {
      return this.backend.getModels();
    }
    return [];
  }
}
