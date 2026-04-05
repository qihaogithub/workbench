import { BaseAgent } from '../core/agent';
import { AgentConfig, AgentResult, SendMessageOptions } from '../core/types';
import { IBackendAdapter } from '../backends/base';

export class BackendAgent extends BaseAgent {
  private backend: IBackendAdapter;

  constructor(config: AgentConfig, backend: IBackendAdapter) {
    super(config);
    this.backend = backend;

    this.backend.onStream?.((event) => {
      this.emit('stream', event);
    });

    this.backend.onError?.((event) => {
      this.emit('error', event);
    });

    this.backend.onFinish?.((event) => {
      this.emit('finish', event);
    });
  }

  async start(): Promise<void> {
    await this.backend.connect();
    this.setStatus('ready');
  }

  async sendMessage(content: string, options?: SendMessageOptions): Promise<AgentResult> {
    this.messageCount++;
    this.setStatus('processing');

    try {
      const result = await this.backend.sendMessage(content, options);
      this.setStatus(result.success ? 'ready' : 'error');
      return result;
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  cancel(): void {
    this.backend.cancel();
  }

  async kill(): Promise<void> {
    await this.backend.disconnect();
    this.setStatus('destroyed');
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
