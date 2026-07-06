import type { BackendProvidersConfig } from "@workbench/shared";

import {
  fetchBackendProvidersFromAgent,
  pushBackendProvidersToAgent,
  type PushResult,
} from "./agent-providers";
import { readDbConfigWithMeta } from "./db-config";

const CONFIG_ID = "model_config";
const STARTUP_SYNC_DELAY_MS = 3000;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 8;

export type BackendProvidersSyncSource = "startup" | "save" | "manual" | "retry";

export interface StoredBackendProvidersSummary {
  exists: boolean;
  updatedAt?: number;
  updatedBy?: string;
  providerCount: number;
  activeProviderId?: string;
  activeModelId?: string;
}

export interface BackendProvidersSyncRuntimeState {
  inProgress: boolean;
  attemptCount: number;
  lastSource?: BackendProvidersSyncSource;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  nextRetryAt?: number;
  lastProviderCount?: number;
  lastActiveProviderId?: string;
  lastActiveModelId?: string;
  lastResult?: PushResult;
}

export interface AgentBackendProvidersSummary {
  reachable: boolean;
  providerCount: number;
  activeProviderId?: string;
  activeModelId?: string;
  message?: string;
}

export interface BackendProvidersSyncStatus {
  dbConfig: StoredBackendProvidersSummary;
  syncState: BackendProvidersSyncRuntimeState;
  agentConfig: AgentBackendProvidersSummary;
}

interface StoredBackendProviders {
  config: BackendProvidersConfig | null;
  summary: StoredBackendProvidersSummary;
}

let startupScheduled = false;
let retryTimer: NodeJS.Timeout | null = null;
let syncState: BackendProvidersSyncRuntimeState = {
  inProgress: false,
  attemptCount: 0,
};

function isBackendProvidersConfig(
  value: unknown,
): value is BackendProvidersConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { providers?: unknown }).providers)
  );
}

function unrefTimer(timer: NodeJS.Timeout): void {
  if (typeof timer.unref === "function") {
    timer.unref();
  }
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

function summarizeConfig(
  config: BackendProvidersConfig | null,
  meta?: { updatedAt?: number; updatedBy?: string },
): StoredBackendProvidersSummary {
  return {
    exists: Boolean(config),
    updatedAt: meta?.updatedAt,
    updatedBy: meta?.updatedBy,
    providerCount: config?.providers.length ?? 0,
    activeProviderId: config?.activeProviderId,
    activeModelId: config?.activeModelId,
  };
}

export function readStoredBackendProvidersConfig(): StoredBackendProviders {
  const entry = readDbConfigWithMeta(CONFIG_ID);
  const rawConfig = entry?.config?.backendProviders;
  const config = isBackendProvidersConfig(rawConfig)
    ? {
        ...rawConfig,
        multimodalModels: Array.isArray(entry?.config?.multimodalModels)
          ? entry.config.multimodalModels
          : rawConfig.multimodalModels,
      }
    : null;

  return {
    config,
    summary: summarizeConfig(config, {
      updatedAt: entry?.updatedAt,
      updatedBy: entry?.updatedBy,
    }),
  };
}

export function getBackendProvidersSyncStateSnapshot(): BackendProvidersSyncRuntimeState {
  return { ...syncState };
}

function updateStateForAttempt(
  config: BackendProvidersConfig,
  source: BackendProvidersSyncSource,
): void {
  syncState = {
    ...syncState,
    inProgress: true,
    attemptCount: syncState.attemptCount + 1,
    lastSource: source,
    lastAttemptAt: Date.now(),
    lastProviderCount: config.providers.length,
    lastActiveProviderId: config.activeProviderId,
    lastActiveModelId: config.activeModelId,
  };
}

function updateStateForResult(result: PushResult): void {
  syncState = {
    ...syncState,
    inProgress: false,
    lastResult: result,
    lastSuccessAt: result.ok ? Date.now() : syncState.lastSuccessAt,
    lastFailureAt: result.ok ? syncState.lastFailureAt : Date.now(),
  };

  if (result.ok) {
    clearRetryTimer();
  }
}

function updateStateForMissingConfig(source: BackendProvidersSyncSource): PushResult {
  const result: PushResult = {
    ok: false,
    message: "数据库中没有 backendProviders 配置",
  };

  syncState = {
    ...syncState,
    inProgress: false,
    lastSource: source,
    lastAttemptAt: Date.now(),
    lastResult: result,
    lastFailureAt: Date.now(),
    nextRetryAt: undefined,
  };

  return result;
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
    void syncStoredBackendProvidersToAgent("retry", {
      scheduleRetryOnFailure: true,
    });
  }, delay);
  unrefTimer(retryTimer);
}

export async function syncBackendProvidersConfigToAgent(
  config: BackendProvidersConfig,
  source: BackendProvidersSyncSource,
  options: { scheduleRetryOnFailure?: boolean } = {},
): Promise<PushResult> {
  if (syncState.inProgress) {
    return {
      ok: false,
      message: "已有 backendProviders 同步任务正在执行",
    };
  }

  updateStateForAttempt(config, source);
  const result = await pushBackendProvidersToAgent(config);
  updateStateForResult(result);

  if (!result.ok && options.scheduleRetryOnFailure) {
    scheduleRetryIfNeeded();
  }

  if (result.ok) {
    console.log(
      `[BackendProviders Sync] ${source} succeeded: ${config.providers.length} providers, active=${config.activeProviderId || "unset"}`,
    );
  } else {
    console.warn(`[BackendProviders Sync] ${source} failed: ${result.message}`);
  }

  return result;
}

export async function syncStoredBackendProvidersToAgent(
  source: BackendProvidersSyncSource,
  options: { scheduleRetryOnFailure?: boolean } = {},
): Promise<PushResult> {
  const stored = readStoredBackendProvidersConfig();
  if (!stored.config) {
    return updateStateForMissingConfig(source);
  }

  return syncBackendProvidersConfigToAgent(stored.config, source, options);
}

export function scheduleStartupBackendProvidersSync(): void {
  if (startupScheduled) return;
  startupScheduled = true;

  const timer = setTimeout(() => {
    void syncStoredBackendProvidersToAgent("startup", {
      scheduleRetryOnFailure: true,
    });
  }, STARTUP_SYNC_DELAY_MS);
  unrefTimer(timer);
}

export async function getBackendProvidersSyncStatus(): Promise<BackendProvidersSyncStatus> {
  const stored = readStoredBackendProvidersConfig();
  const agentResult = await fetchBackendProvidersFromAgent();

  return {
    dbConfig: stored.summary,
    syncState: getBackendProvidersSyncStateSnapshot(),
    agentConfig: agentResult.ok && agentResult.config
      ? {
          reachable: true,
          providerCount: agentResult.config.providers.length,
          activeProviderId: agentResult.config.activeProviderId,
          activeModelId: agentResult.config.activeModelId,
        }
      : {
          reachable: false,
          providerCount: 0,
          message: agentResult.message || "agent-service 配置状态不可用",
        },
  };
}
