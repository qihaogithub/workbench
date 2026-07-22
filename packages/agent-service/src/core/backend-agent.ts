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
import { INACTIVITY_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS } from "./timeouts";

// ============================================================
// LLM API 调用重试与错误分类
// ============================================================

const MAX_LLM_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10_000;

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  return typeof status === "number" ? status : undefined;
}

function isRateLimitError(error: unknown): boolean {
  if (getErrorStatus(error) === 429) return true;
  const msg = getErrorMessage(error, "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("quota")
  );
}

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

function isRetryableLlmError(error: unknown): boolean {
  if (isRateLimitError(error)) return true;
  const status = getErrorStatus(error);
  if (status && status >= 500 && status <= 599) return true;
  const msg = getErrorMessage(error, "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("connection error")
  );
}

function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const retryAfter = record.retryAfter ?? record["retry-after"];
  if (typeof retryAfter === "number") return retryAfter * 1000;
  if (typeof retryAfter === "string") {
    const seconds = parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
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
  cancelPrompt?: () => void;
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
    const startTime = Date.now();
    this.busy = true;
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
    let timedOut = false;

    const resetInactivityTimer = () => {
      this.lastActivityAt = new Date();
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        logger.warn(
          { sessionId: this.sessionId, inactivityMs: INACTIVITY_TIMEOUT_MS },
          "Inactivity timeout fired, calling cancel()",
        );
        timedOut = true;
        this.cancel();
      }, INACTIVITY_TIMEOUT_MS);
      inactivityTimer.unref?.();
    };

    // 进度事件：只有“实质性输出”才重置无进展计时器。
    // 注意：不包含 thought——stuck 场景下模型可能持续产出 reasoning 事件，
    // 此时不应被视为“有活动”，否则前端 silence 提示和后端超时都无法触发。
    // 前端 use-chat-stream.ts 的 markActivity() 调用需与此处保持一致。
    const activityEvents = ["stream", "tool_call", "tool_call_update"] as const;
    for (const evt of activityEvents) {
      this.on(evt, resetInactivityTimer);
    }

    // 启动无进展定时器
    resetInactivityTimer();

    // 启动绝对超时定时器（永不重置）
    const absoluteTimer = setTimeout(() => {
      logger.warn(
        { sessionId: this.sessionId, absoluteMs: ABSOLUTE_TIMEOUT_MS },
        "Absolute timeout fired, calling cancel()",
      );
      timedOut = true;
      this.cancel();
    }, ABSOLUTE_TIMEOUT_MS);
    absoluteTimer.unref?.();

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
      let resultContent: string;
      let llmAttempt = 0;
      for (;;) {
        try {
          resultContent = await this.backend.sendMessage(content, {
            stream: options?.stream,
            images: options?.images,
            files: options?.files,
          });
          break;
        } catch (error) {
          // 超时或 cancel 后不再重试
          if (timedOut || !this.busy) throw error;
          if (llmAttempt >= MAX_LLM_RETRIES || !isRetryableLlmError(error))
            throw error;

          // 指数退避 + 抖动；429 优先读取 Retry-After
          const baseDelay = Math.min(
            INITIAL_RETRY_DELAY_MS * Math.pow(2, llmAttempt),
            MAX_RETRY_DELAY_MS,
          );
          const jitter = Math.random() * baseDelay * 0.5;
          const retryAfter = getRetryAfterMs(error);
          const waitMs = retryAfter ?? Math.round(baseDelay + jitter);

          logger.warn(
            {
              sessionId: this.sessionId,
              attempt: llmAttempt + 1,
              maxRetries: MAX_LLM_RETRIES,
              waitMs,
              error: getErrorMessage(error),
              isRateLimit: isRateLimitError(error),
            },
            "LLM API error, retrying after backoff",
          );

          await sleep(waitMs);
          llmAttempt++;
        }
      }

      // 竞态防护：cancel() 触发 abort 但 harness.prompt() 仍正常 resolve
      if (timedOut) {
        logger.warn(
          { sessionId: this.sessionId, durationMs: Date.now() - startTime },
          "sendMessage resolved after timeout, returning MESSAGE_TIMEOUT",
        );
        return {
          success: false,
          error: {
            code: "MESSAGE_TIMEOUT",
            message: "AI 处理超时，已自动取消。请重试或换用其他模型。",
            retryable: true,
          },
        };
      }

      this.busy = false;
      this.setStatus("ready");

      const files = this.backend.getFiles?.() || [];

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
        // cancel() 已将 busy 设为 false、status 设为 ready
        // 不在此处调用 setStatus('error') 以免覆盖
        logger.info(
          { sessionId: this.sessionId, durationMs: Date.now() - startTime },
          "sendMessage end timeout (caught error after cancel)",
        );
        return {
          success: false,
          error: {
            code: "MESSAGE_TIMEOUT",
            message: "AI 处理超时，已自动取消。请重试或换用其他模型。",
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
          retryable: !contextOverflow,
        },
        metadata: responseDebug
          ? { emptyResponseDebug: responseDebug }
          : undefined,
      };
    } finally {
      // 清理所有定时器和事件监听器
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (absoluteTimer) clearTimeout(absoluteTimer);
      for (const evt of activityEvents) {
        this.off(evt, resetInactivityTimer);
      }
    }
  }

  cancel(): void {
    logger.info(
      { sessionId: this.sessionId, busy: this.busy, status: this._status },
      "cancel() called",
    );
    if (!this.busy) return; // 幂等守卫：防止多路竞态重复 cancel
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
