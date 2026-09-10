/**
 * 识图代理配置同步层
 *
 * author-site 的 imageDescription 配置存储在 SQLite system_configs 表中，
 * 仅在保存时会推送到 agent-service。agent-service 重启（如 Docker 重建容器）后
 * 会丢失内存中的识图配置并回退到环境变量默认值，导致已保存的识图代理配置失效，
 * 需要重新打开配置页触发一次保存才会生效。
 *
 * 本模块在 author-site 启动时把数据库中的 imageDescription 配置重新推送到
 * agent-service，并对失败进行带退避的重试，保证重建容器后已保存的识图代理配置自动生效。
 */

import type { ImageDescriptionConfig } from "./agent-providers";
import { pushImageDescriptionConfig, type PushResult } from "./agent-providers";
import { readDbConfigWithMeta } from "./db-config";

const CONFIG_ID = "model_config";
const STARTUP_SYNC_DELAY_MS = 3000;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 8;

export type ImageDescriptionSyncSource = "startup" | "save" | "retry";

export interface ImageDescriptionSyncState {
  inProgress: boolean;
  attemptCount: number;
  lastSource?: ImageDescriptionSyncSource;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  nextRetryAt?: number;
  lastResult?: PushResult;
}

let startupScheduled = false;
let retryTimer: NodeJS.Timeout | null = null;
let syncState: ImageDescriptionSyncState = {
  inProgress: false,
  attemptCount: 0,
};

function unrefTimer(timer: NodeJS.Timeout): void {
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

function readStoredImageDescriptionConfig(): ImageDescriptionConfig | null {
  const entry = readDbConfigWithMeta(CONFIG_ID);
  const raw = entry?.config?.imageDescription;
  if (raw && typeof raw === "object") {
    return raw as ImageDescriptionConfig;
  }
  return null;
}

export function getImageDescriptionSyncStateSnapshot(): ImageDescriptionSyncState {
  return { ...syncState };
}

function hasStoredConfig(): boolean {
  return readStoredImageDescriptionConfig() !== null;
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
    void syncStoredImageDescriptionToAgent("retry");
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

export async function syncStoredImageDescriptionToAgent(
  source: ImageDescriptionSyncSource,
): Promise<PushResult> {
  if (syncState.inProgress) {
    return {
      ok: false,
      message: "已有识图配置同步任务正在执行",
    };
  }

  const config = readStoredImageDescriptionConfig();
  if (!config) {
    return {
      ok: false,
      message: "数据库中没有识图代理配置",
    };
  }

  syncState = {
    ...syncState,
    inProgress: true,
    attemptCount: syncState.attemptCount + 1,
    lastSource: source,
    lastAttemptAt: Date.now(),
  };

  const result = await pushImageDescriptionConfig(config);

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
      `[ImageDescription Sync] ${source} succeeded: enabled=${config.enabled}, visionModelId=${config.visionModelId || "(unset)"}`,
    );
  } else {
    scheduleRetryIfNeeded();
    console.warn(`[ImageDescription Sync] ${source} failed: ${result.message}`);
  }

  return result;
}

export function scheduleStartupImageDescriptionSync(): void {
  if (startupScheduled) return;
  startupScheduled = true;

  // 仅当数据中确实存在识图配置时才尝试推送，避免每次启动都做无意义调用
  if (!hasStoredConfig()) {
    console.log(
      "[ImageDescription Sync] 数据库中没有识图代理配置，跳过启动同步",
    );
    return;
  }

  const timer = setTimeout(() => {
    void syncStoredImageDescriptionToAgent("startup");
  }, STARTUP_SYNC_DELAY_MS);
  unrefTimer(timer);
}

/** @internal exported for unit testing only */
export { hasStoredConfig as _hasStoredConfig };