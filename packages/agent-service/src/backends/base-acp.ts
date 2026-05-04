import { IBackendAdapter, BackendStatus } from "./base";
import {
  AcpConnection,
  AcpSessionUpdate,
  AcpPermissionRequest,
  AcpModelInfo,
  AcpBackend,
} from "../acp";
import { AgentConfig, AgentEvent } from "../core/types";
import { logger } from "../utils/logger";

export abstract class BaseAcpBackend implements IBackendAdapter {
  abstract readonly name: AcpBackend;
  protected connection: AcpConnection | null = null;
  protected config: AgentConfig;
  protected status: BackendStatus = "idle";
  protected eventCallback?: (event: AgentEvent) => void;
  protected fullContent = "";
  protected files: Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    content?: string;
  }> = [];

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.connection) {
      return;
    }

    this.status = "initializing";
    this.connection = new AcpConnection(
      this.name,
      this.config.workingDir || process.cwd(),
    );

    this.connection.on("disconnect", () => {
      this.status = "error";
      logger.warn(`${this.name} ACP connection disconnected`);
    });

    this.connection.on("error", (error) => {
      this.status = "error";
      logger.error({ error }, `${this.name} ACP connection error`);
    });

    this.connection.onFileOperation = (operation) => {
      this.handleFileOperation(operation);
    };

    await this.connection.connect();
    await this.connection.createSession({ model: this.config.model });
    this.status = "ready";
    logger.info(
      { sessionId: this.connection.currentSessionId },
      `${this.name} ACP backend initialized`,
    );
  }

  async start(options?: { resumeSessionId?: string }): Promise<void> {
    if (this.connection) {
      return;
    }

    this.status = "initializing";
    this.connection = new AcpConnection(
      this.name,
      this.config.workingDir || process.cwd(),
    );

    this.connection.on("disconnect", () => {
      this.status = "error";
      logger.warn(`${this.name} ACP connection disconnected`);
    });

    this.connection.on("error", (error) => {
      this.status = "error";
      logger.error({ error }, `${this.name} ACP connection error`);
    });

    this.connection.onFileOperation = (operation) => {
      this.handleFileOperation(operation);
    };

    await this.connection.connect();

    if (options?.resumeSessionId) {
      try {
        await this.connection.loadSession(options.resumeSessionId);
        logger.info(
          { sessionId: options.resumeSessionId },
          `${this.name} session resumed`,
        );
      } catch (error) {
        logger.warn(
          { error, resumeSessionId: options.resumeSessionId },
          `${this.name} failed to resume session, creating new one`,
        );
        await this.connection.createSession({ model: this.config.model });
      }
    } else {
      await this.connection.createSession({ model: this.config.model });
    }

    this.status = "ready";
    logger.info(
      { sessionId: this.connection.currentSessionId },
      `${this.name} ACP backend started`,
    );
  }

  protected handleFileOperation(operation: {
    method: string;
    path: string;
    content?: string;
    sessionId: string;
  }): void {
    if (operation.method === "fs/write_text_file") {
      this.files.push({
        path: operation.path,
        action: "modified",
        content: operation.content,
      });

      // ✅ 发出正确的 file_operation 事件
      if (this.eventCallback) {
        this.eventCallback({
          type: "file_operation",
          sessionId: this.config.sessionId,
          fileOperation: {
            method: operation.method,
            path: operation.path,
            content: operation.content,
          },
        });
      }
    }
  }

  async sendMessage(
    content: string,
    options?: { stream?: boolean },
  ): Promise<string> {
    if (!this.connection?.isConnected) {
      await this.initialize();
    }

    this.status = "busy";
    this.fullContent = "";
    this.files = [];

    if (!this.connection) {
      throw new Error("Connection not initialized");
    }

    try {
      await this.connection.sendPrompt(content, {
        onSessionUpdate: (update: AcpSessionUpdate) => {
          this.handleSessionUpdate(update);
        },
        onPermissionRequest: async (request: AcpPermissionRequest) => {
          return this.handlePermissionRequest(request);
        },
        onFileOperation: (operation) => {
          this.handleFileOperation(operation);
        },
      });

      this.status = "ready";
      return this.fullContent;
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  protected handleSessionUpdate(update: AcpSessionUpdate): void {
    const { update: updateData } = update;

    switch (updateData.sessionUpdate) {
      case "agent_message_chunk":
        if (updateData.content?.type === "text" && updateData.content.text) {
          this.fullContent += updateData.content.text;
          if (this.eventCallback) {
            this.eventCallback({
              type: "stream",
              sessionId: this.config.sessionId,
              content: updateData.content.text,
              done: false,
            });
          }
        }
        break;
      case "agent_thought_chunk":
        if (updateData.content?.type === "text" && updateData.content.text) {
          if (this.eventCallback) {
            this.eventCallback({
              type: "thought",
              sessionId: this.config.sessionId,
              content: updateData.content.text,
              done: false,
            });
          }
        }
        break;
      case "tool_call":
        if (this.eventCallback) {
          this.eventCallback({
            type: "tool_call",
            sessionId: this.config.sessionId,
            toolCallId: updateData.toolCallId as string,
            status: updateData.status as
              | "pending"
              | "in_progress"
              | "completed"
              | "failed",
            title: updateData.title as string,
            kind: updateData.kind as "read" | "edit" | "execute",
          });
        }
        break;
      case "tool_call_update":
        if (this.eventCallback) {
          this.eventCallback({
            type: "tool_call_update",
            sessionId: this.config.sessionId,
            toolCallId: updateData.toolCallId as string,
            status: updateData.status as "completed" | "failed",
          });
        }
        break;
      default:
        logger.debug(
          { updateType: updateData.sessionUpdate },
          "Unhandled session update",
        );
    }
  }

  protected async handlePermissionRequest(
    request: AcpPermissionRequest,
  ): Promise<{ optionId: string }> {
    if (this.connection) {
      const approvalStore = this.connection.getApprovalStore();
      const key = {
        kind: request.toolCall.kind || "unknown",
        title: request.toolCall.title || "",
        rawInput: request.toolCall.rawInput,
      };

      if (approvalStore.isApprovedForSession(key)) {
        return { optionId: "allow_always" };
      }
    }

    const allowAlways = request.options.find((o) => o.kind === "allow_always");
    const allowOnce = request.options.find((o) => o.kind === "allow_once");
    const selected = allowAlways || allowOnce;

    if (selected) {
      logger.info(
        { toolCallId: request.toolCall.toolCallId, option: selected.name },
        `${this.name} auto-approving permission`,
      );
      return { optionId: selected.optionId };
    }

    return { optionId: request.options[0]?.optionId || "reject_once" };
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
    this.status = "idle";
    logger.info(
      { sessionId: this.config.sessionId },
      `${this.name} ACP backend destroyed`,
    );
  }

  async checkHealth(): Promise<boolean> {
    return this.connection?.isConnected ?? false;
  }

  async setModel(modelId: string): Promise<void> {
    if (!this.connection?.isConnected) {
      throw new Error("Connection not initialized");
    }
    await this.connection.setModel(modelId);
    logger.info(
      { modelId, sessionId: this.config.sessionId },
      `${this.name} model changed`,
    );
  }

  getModelInfo(): AcpModelInfo | null {
    if (!this.connection) {
      return null;
    }
    return this.connection.getModelInfo();
  }

  getCurrentSessionId(): string | null {
    return this.connection?.currentSessionId || null;
  }

  getFiles(): Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    content?: string;
  }> {
    return this.files;
  }

  setPromptTimeout(seconds: number): void {
    if (this.connection) {
      this.connection.setPromptTimeout(seconds);
    }
  }

  cancelPrompt(): void {
    if (this.connection) {
      this.connection.cancelPrompt();
    }
  }

  getWorkingDir(): string | null {
    return this.config.workingDir || null;
  }
}
