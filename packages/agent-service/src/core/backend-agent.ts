import { BaseAgent } from "./agent";
import {
  AgentConfig,
  AgentResult,
  ErrorCode,
  SendMessageOptions,
  UserChoiceResponse,
} from "./types";
import { IBackendAdapter } from "../backends/base";
import { logger } from "../utils/logger";
import { getErrorMessage } from "../utils/error-utils";
import {
  isRateLimitError,
  withLlmRetry,
} from "../utils/retry-utils";
import { INACTIVITY_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS } from "./timeouts";

/**
 * 识别 LLM API 上下文窗口溢出错误。
 *
 * 触发场景：模型返回 400 + "maximum context length ... tokens, requested ..."，
 * 通常因为多轮对话历史累积或单轮注入过多上下文（如 L3 页面源码内嵌）。
 *
 * 这类错误不可重试——保留历史继续重试只会让 token 数继续膨胀。
 * 必须由上层销毁 agent 清空历史，或引导用户新建对话。
 */
function isContextOverflowError(error: unknown): boolean {
  const msg = getErrorMessage(error, "").toLowerCase();
  return (
    msg.includes("maximum context length") ||
    msg.includes("context length exceeded") ||
    msg.includes("context window exceeded")
  );
}

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
  cancelPrompt?: () => void | Promise<void>;
  resolvePermission?: (
    toolCallId: string,
    approved: boolean,
    responseContent?: string,
  ) => void;
  resolveUserChoice?: (requestId: string, choice: UserChoiceResponse) => void;
  updateConfig?: (config: Partial<AgentConfig>) => void;
}

export class BackendAgent extends BaseAgent {
  private backend: BackendWithModelSupport;
  private busy = false;
  private initialized = false;
  /** The run still owns the harness until sendMessage settles after this becomes true. */
  private cancellationRequested = false;
  /** A run that has invoked a tool may already have external side effects. */
  private toolStartedInCurrentRun = false;

  constructor(config: AgentConfig, backend: IBackendAdapter) {
    super(config);
    this.backend = backend as BackendWithModelSupport;

    this.backend.onStream((event) => {
      if (event.type === "tool_call") {
        this.toolStartedInCurrentRun = true;
      }
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
    const startTime = Date.now();
    this.busy = true;
    this.cancellationRequested = false;
    this.toolStartedInCurrentRun = false;
    this.messageCount++;
    this.setStatus("processing");

    logger.info(
      {
        sessionId: this.sessionId,
        messageCount: this.messageCount,
        backendStatus: this._status,
      },
      "sendMessage start",
    );

    let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
    let absoluteTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let awaitingPlanApproval = false;
    let pendingPlanApprovalToolCallId: string | undefined;
    const absoluteTimeoutMs = options?.timeout ?? ABSOLUTE_TIMEOUT_MS;
    let remainingAbsoluteTimeoutMs = absoluteTimeoutMs;
    let absoluteTimerStartedAt: number | undefined;

    const resetInactivityTimer = () => {
      if (awaitingPlanApproval) return;
      this.lastActivityAt = new Date();
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        logger.warn(
          { sessionId: this.sessionId, inactivityMs: INACTIVITY_TIMEOUT_MS },
          "Inactivity timeout fired, calling cancel()",
        );
        timedOut = true;
        void this.cancel();
      }, INACTIVITY_TIMEOUT_MS);
      inactivityTimer.unref?.();
    };

    const clearAbsoluteTimer = () => {
      if (absoluteTimer) clearTimeout(absoluteTimer);
      absoluteTimer = undefined;
      absoluteTimerStartedAt = undefined;
    };

    const startAbsoluteTimer = () => {
      if (awaitingPlanApproval || remainingAbsoluteTimeoutMs <= 0) return;
      absoluteTimerStartedAt = Date.now();
      absoluteTimer = setTimeout(() => {
        logger.warn(
          { sessionId: this.sessionId, absoluteMs: absoluteTimeoutMs },
          "Absolute timeout fired, calling cancel()",
        );
        timedOut = true;
        void this.cancel();
      }, remainingAbsoluteTimeoutMs);
      absoluteTimer.unref?.();
    };

    const pauseExecutionTimersForApproval = (toolCallId: string) => {
      if (awaitingPlanApproval) return;
      awaitingPlanApproval = true;
      pendingPlanApprovalToolCallId = toolCallId;
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = undefined;
      if (absoluteTimerStartedAt !== undefined) {
        remainingAbsoluteTimeoutMs = Math.max(
          0,
          remainingAbsoluteTimeoutMs - (Date.now() - absoluteTimerStartedAt),
        );
      }
      clearAbsoluteTimer();
      this.setStatus("awaiting_approval");
    };

    const resumeExecutionTimersAfterApproval = (toolCallId: string) => {
      if (!awaitingPlanApproval || toolCallId !== pendingPlanApprovalToolCallId) return;
      awaitingPlanApproval = false;
      pendingPlanApprovalToolCallId = undefined;
      if (!this.cancellationRequested) this.setStatus("processing");
      resetInactivityTimer();
      startAbsoluteTimer();
    };

    // 进度事件：只有“实质性输出”才重置无进展计时器。
    // 注意：不包含 thought——stuck 场景下模型可能持续产出 reasoning 事件，
    // 此时不应被视为“有活动”，否则前端 silence 提示和后端超时都无法触发。
    // 前端 use-chat-stream.ts 的 markActivity() 调用需与此处保持一致。
    const activityEvents = ["stream", "tool_call", "tool_call_update"] as const;
    for (const evt of activityEvents) {
      this.on(evt, resetInactivityTimer);
    }
    const onPermissionRequest = (event: import("./types").PermissionRequestEvent) => {
      if (event.permissionRequest.toolCall.approvalKind === "plan_approval" || event.permissionRequest.toolCall.approvalKind === "config_visibility") {
        pauseExecutionTimersForApproval(event.permissionRequest.toolCall.toolCallId);
      }
    };
    const onToolCallUpdate = (event: import("./types").ToolCallUpdateEvent) => {
      resumeExecutionTimersAfterApproval(event.toolCallId);
    };
    this.on("permission_request", onPermissionRequest);
    this.on("tool_call_update", onToolCallUpdate);

    // 启动无进展定时器
    resetInactivityTimer();

    // 审批等待属于人工输入阶段，不消耗模型执行预算；由 PermissionManager 的独立审批超时约束。
    startAbsoluteTimer();

    try {
      if (!this.initialized) {
        if (this.backend.start) {
          await this.backend.start();
        } else {
          await this.backend.initialize();
        }
        this.initialized = true;
      }

      // LLM API 调用重试：对 429/5xx/超时等可恢复错误自动重试
      const resultContent = await withLlmRetry(
        () =>
          this.backend.sendMessage(content, {
            stream: options?.stream,
            images: options?.images,
            files: options?.files,
          }),
        {},
        (error, meta) => {
          // 超时或 cancel 后不再重试，立即向上抛出
          if (timedOut || this.cancellationRequested) throw error;
          // A full AgentHarness prompt may execute writes, external requests, or
          // delegated work before surfacing a transient model error. Retrying it
          // would replay that work, so only the pre-tool portion is retry-safe.
          if (this.toolStartedInCurrentRun) throw error;
          logger.warn(
            {
              sessionId: this.sessionId,
              attempt: meta.attempt + 1,
              maxRetries: meta.maxRetries,
              waitMs: meta.waitMs,
              error: getErrorMessage(error),
              isRateLimit: isRateLimitError(error),
            },
            "LLM API error, retrying after backoff",
          );
        },
      );

      // 竞态防护：cancel() 触发 abort 但 harness.prompt() 仍正常 resolve
      if (timedOut) {
        logger.warn(
          { sessionId: this.sessionId, durationMs: Date.now() - startTime },
          "sendMessage resolved after timeout, returning MESSAGE_TIMEOUT",
        );
        this.busy = false;
        this.setStatus("ready");
        return {
          success: false,
          error: {
            code: "MESSAGE_TIMEOUT",
            message: "AI 处理超时，已自动取消。请重试或换用其他模型。",
            retryable: true,
          },
        };
      }

      if (this.cancellationRequested) {
        this.busy = false;
        this.setStatus("ready");
        return {
          success: false,
          error: {
            code: "CANCELLED",
            message: "AI 请求已取消。",
            retryable: true,
          },
        };
      }

      const files = this.backend.getFiles?.() || [];

      this.busy = false;
      this.setStatus("ready");

      logger.info(
        {
          sessionId: this.sessionId,
          durationMs: Date.now() - startTime,
          hasContent: !!resultContent,
          fileCount: files.length,
        },
        "sendMessage end success",
      );

      return {
        success: true,
        content: resultContent,
        files: files.length > 0 ? files : undefined,
        metadata: resultContent
          ? undefined
          : { emptyResponseDebug: this.backend.getLastResponseDebug?.() },
      };
    } catch (error) {
      if (timedOut) {
        logger.info(
          { sessionId: this.sessionId, durationMs: Date.now() - startTime },
          "sendMessage end timeout (caught error after cancel)",
        );
        this.busy = false;
        this.setStatus("ready");
        return {
          success: false,
          error: {
            code: "MESSAGE_TIMEOUT",
            message: "AI 处理超时，已自动取消。请重试或换用其他模型。",
            retryable: true,
          },
        };
      }
      if (this.cancellationRequested) {
        logger.info(
          { sessionId: this.sessionId, durationMs: Date.now() - startTime },
          "sendMessage ended after cancellation",
        );
        this.busy = false;
        this.setStatus("ready");
        return {
          success: false,
          error: {
            code: "CANCELLED",
            message: "AI 请求已取消。",
            retryable: true,
          },
        };
      }
      this.busy = false;
      this.setStatus("error");
      const responseDebug = this.backend.getLastResponseDebug?.();
      const rateLimited = isRateLimitError(error);
      const contextOverflow = isContextOverflowError(error);
      logger.error(
        {
          sessionId: this.sessionId,
          durationMs: Date.now() - startTime,
          error: getErrorMessage(error),
          rateLimited,
          contextOverflow,
        },
        "sendMessage end error",
      );
      // 上下文溢出优先于 rate limit 判断：不可重试，必须由上层销毁 agent 清空历史
      const errorCode: ErrorCode = contextOverflow
        ? "CONTEXT_OVERFLOW"
        : rateLimited
          ? "RATE_LIMIT_EXCEEDED"
          : "MESSAGE_SEND_ERROR";
      const errorMessage = contextOverflow
        ? "对话内容过长，已超出模型上下文上限。请新建对话继续。"
        : rateLimited
          ? "AI 服务额度或频率受限，请稍后重试。"
          : getErrorMessage(error);
      return {
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
          retryable: !contextOverflow && !this.toolStartedInCurrentRun,
        },
        metadata: responseDebug
          ? { emptyResponseDebug: responseDebug }
          : undefined,
      };
    } finally {
      // 清理所有定时器和事件监听器
      if (inactivityTimer) clearTimeout(inactivityTimer);
      clearAbsoluteTimer();
      for (const evt of activityEvents) {
        this.off(evt, resetInactivityTimer);
      }
      this.off("permission_request", onPermissionRequest);
      this.off("tool_call_update", onToolCallUpdate);
    }
  }

  async cancel(): Promise<void> {
    logger.info(
      { sessionId: this.sessionId, busy: this.busy, status: this._status },
      "cancel() called",
    );
    if (!this.busy || this.cancellationRequested) return;
    this.cancellationRequested = true;
    this.setStatus("cancelling");
    await this.backend.cancelPrompt?.();
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

  async updateProjectRules(rules: string): Promise<void> {
    if (this.backend.updateProjectRules) {
      await this.backend.updateProjectRules(rules);
    } else {
      throw new Error("updateProjectRules not supported by backend");
    }
  }

  async appendHistoryMessage(role: string, content: string): Promise<void> {
    if (this.backend.appendHistoryMessage) {
      await this.backend.appendHistoryMessage(role, content);
    } else {
      throw new Error("appendHistoryMessage not supported by backend");
    }
  }

  updateConfig(config: Partial<AgentConfig>): void {
    let changed = false;

    if (
      config.workingDir !== undefined &&
      this.config.workingDir !== config.workingDir
    ) {
      logger.info(
        {
          sessionId: this.sessionId,
          oldDir: this.config.workingDir,
          newDir: config.workingDir,
        },
        "Updating workingDir",
      );
      this.config.workingDir = config.workingDir;
      changed = true;
    }

    if (config.model !== undefined && this.config.model !== config.model) {
      logger.info(
        {
          sessionId: this.sessionId,
          oldModel: this.config.model,
          newModel: config.model,
        },
        "Updating model",
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
  resolvePermission(
    toolCallId: string,
    approved: boolean,
    responseContent?: string,
  ): void {
    if (this.backend.resolvePermission) {
      this.backend.resolvePermission(toolCallId, approved, responseContent);
    } else {
      logger.warn({ toolCallId }, "Backend does not support resolvePermission");
    }
  }

  resolveUserChoice(requestId: string, choice: UserChoiceResponse): void {
    if (this.backend.resolveUserChoice) {
      this.backend.resolveUserChoice(requestId, choice);
    } else {
      logger.warn({ requestId }, "Backend does not support resolveUserChoice");
    }
  }
}
