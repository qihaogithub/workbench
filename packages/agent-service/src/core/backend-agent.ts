import { BaseAgent } from "./agent";
import { AgentConfig, AgentResult, SendMessageOptions } from "./types";
import { IBackendAdapter } from "../backends/base";

interface BackendWithModelSupport extends IBackendAdapter {
  setModel?: (modelId: string) => Promise<void>;
  getModelInfo?: () =>
    | {
        currentModelId: string | null;
        availableModels: Array<{ id: string; label: string }>;
        canSwitch: boolean;
      }
    | null
    | Promise<{
        currentModelId: string | null;
        availableModels: Array<{ id: string; label: string }>;
        canSwitch: boolean;
      } | null>;
  getCurrentSessionId?: () => string | null;
  start?: (options?: { resumeSessionId?: string }) => Promise<void>;
  getFiles?: () => Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    content?: string;
  }>;
  cancelPrompt?: () => void;
}

export class BackendAgent extends BaseAgent {
  private backend: BackendWithModelSupport;
  private busy = false;
  private initialized = false;

  constructor(config: AgentConfig, backend: IBackendAdapter) {
    super(config);
    this.backend = backend as BackendWithModelSupport;

    this.backend.onStream((event) => {
      this.emit(event.type, event);
    });
  }

  async start(options?: { resumeSessionId?: string }): Promise<void> {
    if (!this.initialized) {
      if (this.backend.start) {
        await this.backend.start(options);
      } else {
        await this.backend.initialize();
      }
      this.initialized = true;
    }
    this.setStatus("ready");
  }

  async sendMessage(
    content: string,
    options?: SendMessageOptions,
  ): Promise<AgentResult> {
    this.busy = true;
    this.messageCount++;
    this.setStatus("processing");

    try {
      if (!this.initialized) {
        if (this.backend.start) {
          await this.backend.start();
        } else {
          await this.backend.initialize();
        }
        this.initialized = true;
      }

      const resultContent = await this.backend.sendMessage(content, {
        stream: options?.stream,
        images: options?.images,
      });
      this.busy = false;
      this.setStatus("ready");

      const files = this.backend.getFiles?.() || [];

      return {
        success: true,
        content: resultContent,
        files: files.length > 0 ? files : undefined,
      };
    } catch (error) {
      this.busy = false;
      this.setStatus("error");
      return {
        success: false,
        error: {
          code: "MESSAGE_SEND_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: true,
        },
      };
    }
  }

  cancel(): void {
    this.backend.cancelPrompt?.();
    this.busy = false;
    this.setStatus("ready");
  }

  async kill(): Promise<void> {
    await this.backend.destroy();
    this.busy = false;
    this.initialized = false;
    this.setStatus("destroyed");
  }

  isBusy(): boolean {
    return this.busy;
  }

  async setModel(modelId: string): Promise<void> {
    if (this.backend.setModel) {
      await this.backend.setModel(modelId);
    } else {
      throw new Error("Model switching not supported by this backend");
    }
  }

  async getModelInfo(): Promise<{
    currentModelId: string | null;
    availableModels: Array<{ id: string; label: string }>;
    canSwitch: boolean;
  } | null> {
    if (this.backend.getModelInfo) {
      return await this.backend.getModelInfo();
    }
    return null;
  }

  getCurrentSessionId(): string | null {
    if (this.backend.getCurrentSessionId) {
      return this.backend.getCurrentSessionId();
    }
    return null;
  }

  async updateSystemPrompt(newPrompt: string): Promise<void> {
    if (this.backend.updateSystemPrompt) {
      await this.backend.updateSystemPrompt(newPrompt);
    } else {
      throw new Error("updateSystemPrompt not supported by backend");
    }
  }
}
