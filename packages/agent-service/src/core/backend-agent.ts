import { BaseAgent } from "./agent";
import { AgentConfig, AgentResult, SendMessageOptions, UserChoiceResponse } from "./types";
import { IBackendAdapter } from "../backends/base";
import { logger } from "../utils/logger";
import { getErrorMessage } from "../utils/error-utils";

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
  getLastResponseDebug?: () => unknown;
  cancelPrompt?: () => void;
  resolvePermission?: (toolCallId: string, approved: boolean, responseContent?: string) => void;
  resolveUserChoice?: (requestId: string, choice: UserChoiceResponse) => void;
  updateConfig?: (config: Partial<AgentConfig>) => void;
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
        files: options?.files,
      });
      this.busy = false;
      this.setStatus("ready");

      const files = this.backend.getFiles?.() || [];

      return {
        success: true,
        content: resultContent,
        files: files.length > 0 ? files : undefined,
        metadata: resultContent
          ? undefined
          : { emptyResponseDebug: this.backend.getLastResponseDebug?.() },
      };
    } catch (error) {
      this.busy = false;
      this.setStatus("error");
      const responseDebug = this.backend.getLastResponseDebug?.();
      return {
        success: false,
        error: {
          code: "MESSAGE_SEND_ERROR",
          message: getErrorMessage(error),
          retryable: true,
        },
        metadata: responseDebug ? { emptyResponseDebug: responseDebug } : undefined,
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

  getFiles(): Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    content?: string;
  }> {
    return this.backend.getFiles?.() || [];
  }

  async updateSystemPrompt(newPrompt: string): Promise<void> {
    if (this.backend.updateSystemPrompt) {
      await this.backend.updateSystemPrompt(newPrompt);
    } else {
      throw new Error("updateSystemPrompt not supported by backend");
    }
  }

  updateConfig(config: Partial<AgentConfig>): void {
    let changed = false;

    if (config.workingDir !== undefined && this.config.workingDir !== config.workingDir) {
      logger.info(
        { sessionId: this.sessionId, oldDir: this.config.workingDir, newDir: config.workingDir },
        'Updating workingDir',
      );
      this.config.workingDir = config.workingDir;
      changed = true;
    }

    if (config.model !== undefined && this.config.model !== config.model) {
      logger.info(
        { sessionId: this.sessionId, oldModel: this.config.model, newModel: config.model },
        'Updating model',
      );
      this.config.model = config.model;
      changed = true;
    }

    if (config.demoId !== undefined && this.config.demoId !== config.demoId) {
      this.config.demoId = config.demoId;
      changed = true;
    }

    if (config.backendProviders !== undefined) {
      this.config.backendProviders = config.backendProviders;
      changed = true;
    }

    if (config.externalAuth !== undefined) {
      this.config.externalAuth = config.externalAuth;
      changed = true;
    }

    if (changed) {
      this.backend.updateConfig?.(this.config);
      this.lastActivityAt = new Date();
      this.emit("config_updated", {
        type: "config_updated",
        sessionId: this.sessionId,
        config: this.getConfig(),
      });
    }
  }

  /**
   * 解除权限等待：前端用户确认或取消后调用
   */
  resolvePermission(toolCallId: string, approved: boolean, responseContent?: string): void {
    if (this.backend.resolvePermission) {
      this.backend.resolvePermission(toolCallId, approved, responseContent);
    } else {
      logger.warn({ toolCallId }, 'Backend does not support resolvePermission');
    }
  }

  resolveUserChoice(requestId: string, choice: UserChoiceResponse): void {
    if (this.backend.resolveUserChoice) {
      this.backend.resolveUserChoice(requestId, choice);
    } else {
      logger.warn({ requestId }, 'Backend does not support resolveUserChoice');
    }
  }
}
