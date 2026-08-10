/**
 * 绘图（图像生成）配置同步层
 *
 * author-site 的 imageGen 配置存储在 SQLite system_configs 表中，
 * 仅在保存时会推送到 agent-service。agent-service 重启后内存中的绘图配置
 * 会回退到环境变量默认值，导致已保存的绘图配置失效。
 *
 * 本模块在 author-site 启动时把数据库中的 imageGen 配置重新推送到
 * agent-service，并带退避重试，保证重建容器后已保存配置自动生效。
 */

import type { ImageGenConfig } from "./agent-providers";
import { pushImageGenConfig, type PushResult } from "./agent-providers";
import { readDbConfigWithMeta } from "./db-config";

const CONFIG_ID = "model_config";
const STARTUP_SYNC_DELAY_MS = 3000;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 8;

export type ImageGenSyncSource = "startup" | "save" | "retry";

export interface ImageGenSyncState {
  inProgress: boolean;
  attemptCount: number;
  lastSource?: ImageGenSyncSource;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  nextRetryAt?: number;
  lastResult?: PushResult;
}

let startupScheduled = false;
let retryTimer: NodeJS.Timeout | null = null;
let syncState: ImageGenSyncState = {
  inProgress: false,
  attemptCount: 0,
};

function unrefTimer(timer: NodeJS.Timeout): void {
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

function readStoredImageGenConfig(): ImageGenConfig | null {
  const entry = readDbConfigWithMeta(CONFIG_ID);
  const raw = entry?.config?.imageGen;
  if (raw && typeof raw === "object") {
    return raw as ImageGenConfig;
  }
  return null;
}

export function hasStoredImageGenConfig(): boolean {
  return readStoredImageGenConfig() !== null;
}

export function getImageGenSyncStateSnapshot(): ImageGenSyncState {
  return { ...syncState };
}

function scheduleRetryIfNeeded(): void {
  if (retryTimer || syncState.attemptCount >= MAX_RETRY_ATTEMPTS) {
    return;
  }

  const delay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(syncState.attemptCount - 1, 0),
    MAX_RETRY_DELAY_MS,
  );
  const nextRetryAt = Date.now() + delay;

  syncState = {
    ...syncState,
    nextRetryAt,
  };

  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncStoredImageGenToAgent("retry");
  }, delay);
  unrefTimer(retryTimer);
}

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  syncState = {
    ...syncState,
    nextRetryAt: undefined,
  };
}

export async function syncStoredImageGenToAgent(
  source: ImageGenSyncSource,
): Promise<PushResult> {
  if (syncState.inProgress) {
    return {
      ok: false,
      message: "已有绘图配置同步任务正在执行",
    };
  }

  const config = readStoredImageGenConfig();
  if (!config) {
    return {
      ok: false,
      message: "数据库中没有绘图配置",
    };
  }

  syncState = {
    ...syncState,
    inProgress: true,
    attemptCount: syncState.attemptCount + 1,
    lastSource: source,
    lastAttemptAt: Date.now(),
  };

  const result = await pushImageGenConfig(config);

  syncState = {
    ...syncState,
    inProgress: false,
    lastResult: result,
    lastSuccessAt: result.ok ? Date.now() : syncState.lastSuccessAt,
    lastFailureAt: result.ok ? syncState.lastFailureAt : Date.now(),
  };

  if (result.ok) {
    clearRetryTimer();
    syncState = { ...syncState, attemptCount: 0 };
    console.log(
      `[ImageGen Sync] ${source} succeeded: enabled=${config.enabled}, model=${config.model || "(unset)"}`,
    );
  } else {
    scheduleRetryIfNeeded();
    console.warn(`[ImageGen Sync] ${source} failed: ${result.message}`);
  }

  return result;
}

export function scheduleStartupImageGenSync(): void {
  if (startupScheduled) return;
  startupScheduled = true;

  if (!hasStoredImageGenConfig()) {
    console.log(
      "[ImageGen Sync] 数据库中没有绘图配置，跳过启动同步",
    );
    return;
  }

  const timer = setTimeout(() => {
    void syncStoredImageGenToAgent("startup");
  }, STARTUP_SYNC_DELAY_MS);
  unrefTimer(timer);
}