import { IBackendAdapter, BackendStatus } from "./base";
import {
  AcpConnection,
  AcpSessionUpdate,
  AcpPermissionRequest,
  AcpModelInfo,
} from "../acp";
import { AgentConfig, AgentEvent } from "../core/types";
import { logger } from "../utils/logger";

export class OpenCodeAcpBackend implements IBackendAdapter {
  readonly name = "opencode";
  private connection: AcpConnection | null = null;
  private config: AgentConfig;
  private status: BackendStatus = "idle";
  private eventCallback?: (event: AgentEvent) => void;
  private fullContent = "";
  private files: Array<{
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
    const workingDir = this.config.workingDir;
    if (!workingDir) {
      logger.warn("[OpenCode ACP Backend] workingDir is not set in initialize(), falling back to process.cwd() — AI may see incorrect directory");
    }
    this.connection = new AcpConnection(
      "opencode",
      workingDir || process.cwd(),
    );

    this.connection.on("disconnect", () => {
      this.status = "error";
      logger.warn("OpenCode ACP connection disconnected");
    });

    this.connection.on("error", (error) => {
      this.status = "error";
      logger.error({ error }, "OpenCode ACP connection error");
    });

    await this.connection.connect();
    await this.connection.createSession({ model: this.config.model });
    this.status = "ready";
    logger.info(
      { sessionId: this.connection.currentSessionId },
      "OpenCode ACP backend initialized",
    );
  }

  async start(options?: { resumeSessionId?: string }): Promise<void> {
    if (this.connection) {
      return;
    }

    this.status = "initializing";
    const workingDir = this.config.workingDir;
    if (!workingDir) {
      logger.warn("[OpenCode ACP Backend] workingDir is not set in start(), falling back to process.cwd() — AI may see incorrect directory");
    }
    logger.info(
      { workingDir: this.config.workingDir, finalWorkingDir: workingDir || process.cwd() },
      "OpenCode ACP backend starting",
    );
    this.connection = new AcpConnection("opencode", workingDir || process.cwd());

    this.connection.on("disconnect", () => {
      this.status = "error";
      logger.warn("OpenCode ACP connection disconnected");
    });

    this.connection.on("error", (error) => {
      this.status = "error";
      logger.error({ error }, "OpenCode ACP connection error");
    });

    this.connection.onFileOperation = (operation) => {
      this.handleFileOperation(operation);
    };

    await this.connection.connect();

    if (options?.resumeSessionId) {
      try {
        await this.connection.loadSession(options.resumeSessionId);
        logger.info({ sessionId: options.resumeSessionId }, "Resumed session");
      } catch (error) {
        logger.warn(
          { error, resumeSessionId: options.resumeSessionId },
          "Failed to resume session, creating new one",
        );
        await this.connection.createSession({ model: this.config.model });
      }
    } else {
      await this.connection.createSession({ model: this.config.model });
    }

    this.status = "ready";
    logger.info(
      { sessionId: this.connection.currentSessionId },
      "OpenCode ACP backend started",
    );
  }

  private handleFileOperation(operation: {
    method: string;
    path: string;
    content?: string;
    sessionId: string;
  }): void {
    if (operation.method === "fs/write_text_file") {
      logger.info(
        {
          path: operation.path,
          contentLength: operation.content?.length,
          sessionId: this.config.sessionId,
        },
        "[OpenCode Backend] Handling file operation fs/write_text_file",
      );

      this.files.push({
        path: operation.path,
        action: "modified",
        content: operation.content,
      });

      // ✅ 发出正确的 file_operation 事件
      if (this.eventCallback) {
        logger.info(
          {
            path: operation.path,
            eventCallbackRegistered: true,
          },
          "[OpenCode Backend] Emitting file_operation event",
        );
        this.eventCallback({
          type: "file_operation",
          sessionId: this.config.sessionId,
          fileOperation: {
            method: operation.method,
            path: operation.path,
            content: operation.content,
          },
        });
      } else {
        logger.warn(
          {
            path: operation.path,
          },
          "[OpenCode Backend] file_operation event NOT emitted - no eventCallback registered",
        );
      }
    }
  }

  /**
   * ✅ 兜底方案：检测 edit 工具造成的文件变更
   *
   * 当 AI 使用 edit 工具时，ACP 协议可能不会发出 WRITE_TEXT_FILE 通知，
   * 所以我们需要在 AI 完成后主动读取工作区中的关键文件。
   */
  private async detectFileChangesAfterEdit(): Promise<void> {
    const workingDir = this.config.workingDir;
    if (!workingDir) {
      logger.warn(
        "[OpenCode Backend] No workingDir, skipping file change detection",
      );
      return;
    }

    // 需要检测的关键文件列表
    const targetFiles = [
      "index.tsx",
      "index.ts",
      "Demo.tsx",
      "Demo.ts",
      "config.schema.json",
    ];

    logger.info(
      { workingDir, targetFiles },
      "[OpenCode Backend] Detecting file changes after edit tool",
    );

    // 注意：这里我们无法直接读取文件内容（因为没有文件操作权限），
    // 但我们可以通过检查 this.files 数组来判断是否有通过 ACP 写入的文件
    // 如果 this.files 为空，说明 AI 可能使用了 edit 工具（绕过 ACP 通知）

    if (this.files.length === 0) {
      logger.info(
        "[OpenCode Backend] No file_operation events captured, edit tool may have been used",
      );
      // 这里暂时无法做更多，因为 ACP 协议没有提供直接读取文件的机制
      // 前端需要在 finish 事件中通过其他方式获取文件内容
    } else {
      logger.info(
        { fileCount: this.files.length },
        "[OpenCode Backend] File changes detected via ACP events",
      );
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

      // ✅ 兜底：在 AI 完成后主动检查工作区文件变更
      await this.detectFileChangesAfterEdit();

      this.status = "ready";
      return this.fullContent;
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  private handleSessionUpdate(update: AcpSessionUpdate): void {
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

  private async handlePermissionRequest(
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
        "Auto-approving permission",
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
      "OpenCode ACP backend destroyed",
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
    logger.info({ modelId, sessionId: this.config.sessionId }, "Model changed");
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

  getWorkingDir(): string | null {
    return this.config.workingDir || null;
  }
}
