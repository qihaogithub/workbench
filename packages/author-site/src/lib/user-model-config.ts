import crypto from "crypto";

import type {
  BackendProvider,
  BackendProvidersConfig,
} from "@opencode-workbench/shared";

import { getDb } from "@/lib/db";

const DEFAULT_PROVIDER_ID = "custom";
const ENCRYPTION_VERSION = "v1";

interface StoredUserModelConfig {
  provider: Omit<BackendProvider, "apiKey"> & {
    encryptedApiKey?: string;
    hasApiKey?: boolean;
  };
}

export interface UserModelConfigInput {
  id?: string;
  name?: string;
  baseURL?: string;
  apiKey?: string;
  keepExistingApiKey?: boolean;
  clearApiKey?: boolean;
  models?: string[];
  defaultModel?: string;
  enabled?: boolean;
}

export interface SafeUserModelConfig {
  provider: Omit<BackendProvider, "apiKey"> & {
    apiKey: "";
    hasApiKey: boolean;
  };
  updatedAt: number;
}

interface UserModelConfigRow {
  config_json: string;
  updated_at: number;
}

function getEncryptionKey(): Buffer {
  const secret =
    process.env.MODEL_CONFIG_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "change-me-in-production";

  return crypto.createHash("sha256").update(secret).digest();
}

function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptApiKey(value: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== ENCRYPTION_VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("API Key 加密格式无效");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeProviderId(id: string | undefined): string {
  const normalized = (id || DEFAULT_PROVIDER_ID)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || DEFAULT_PROVIDER_ID;
}

function normalizeModels(models: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (models || [])
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  );
}

function validateBaseURL(baseURL: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error("baseURL 格式无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("baseURL 仅支持 http 或 https");
  }
}

function parseStoredConfig(row: UserModelConfigRow): StoredUserModelConfig {
  return JSON.parse(row.config_json) as StoredUserModelConfig;
}

function toSafeConfig(
  stored: StoredUserModelConfig,
  updatedAt: number,
): SafeUserModelConfig {
  const {
    encryptedApiKey: encrypted,
    hasApiKey: storedHasApiKey,
    ...provider
  } = stored.provider;

  return {
    provider: {
      ...provider,
      apiKey: "",
      hasApiKey: Boolean(encrypted || storedHasApiKey),
    },
    updatedAt,
  };
}

export function readUserModelConfig(userId: string): SafeUserModelConfig | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT config_json, updated_at FROM user_model_configs WHERE user_id = ?",
    )
    .get(userId) as UserModelConfigRow | undefined;

  if (!row) return null;
  return toSafeConfig(parseStoredConfig(row), row.updated_at);
}

export function readUserBackendProvidersConfig(
  userId: string,
  fallbackConfig?: BackendProvidersConfig | null,
): BackendProvidersConfig | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT config_json, updated_at FROM user_model_configs WHERE user_id = ?",
    )
    .get(userId) as UserModelConfigRow | undefined;

  if (!row) return null;

  const stored = parseStoredConfig(row);
  const encryptedApiKey = stored.provider.encryptedApiKey;
  const apiKey = encryptedApiKey ? decryptApiKey(encryptedApiKey) : "";
  const provider: BackendProvider = {
    id: stored.provider.id,
    name: stored.provider.name,
    baseURL: stored.provider.baseURL,
    apiKey,
    models: stored.provider.models,
    defaultModel: stored.provider.defaultModel,
    enabled: stored.provider.enabled !== false,
  };

  const fallbackProviders = fallbackConfig?.providers || [];
  const providers = [
    provider,
    ...fallbackProviders.filter((item) => item.id !== provider.id),
  ];

  return {
    providers,
    activeProviderId: provider.id,
    activeModelId: provider.defaultModel
      ? `${provider.id}/${provider.defaultModel}`
      : provider.models[0]
        ? `${provider.id}/${provider.models[0]}`
        : undefined,
  };
}

export function upsertUserModelConfig(
  userId: string,
  input: UserModelConfigInput,
): SafeUserModelConfig {
  const baseURL = (input.baseURL || "").trim();
  if (!baseURL) throw new Error("baseURL 必填");
  validateBaseURL(baseURL);

  const models = normalizeModels(input.models);
  if (models.length === 0) throw new Error("至少填写一个模型");

  const defaultModel = input.defaultModel?.trim() || undefined;
  if (defaultModel && !models.includes(defaultModel)) {
    throw new Error("默认模型必须在模型列表中");
  }

  const existing = readStoredUserModelConfig(userId);
  let encryptedApiKey: string | undefined;
  if (input.clearApiKey) {
    encryptedApiKey = undefined;
  } else if (input.apiKey && input.apiKey.trim()) {
    encryptedApiKey = encryptApiKey(input.apiKey.trim());
  } else if (input.keepExistingApiKey !== false) {
    encryptedApiKey = existing?.provider.encryptedApiKey;
  }

  const provider = {
    id: normalizeProviderId(input.id),
    name: input.name?.trim() || "自定义模型",
    baseURL,
    encryptedApiKey,
    hasApiKey: Boolean(encryptedApiKey),
    models,
    defaultModel,
    enabled: input.enabled !== false,
  };

  const stored: StoredUserModelConfig = { provider };
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO user_model_configs (user_id, config_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         config_json = ?,
         updated_at = ?`,
    )
    .run(userId, JSON.stringify(stored), now, JSON.stringify(stored), now);

  return toSafeConfig(stored, now);
}

export function deleteUserModelConfig(userId: string): void {
  getDb().prepare("DELETE FROM user_model_configs WHERE user_id = ?").run(userId);
}

function readStoredUserModelConfig(
  userId: string,
): StoredUserModelConfig | null {
  const row = getDb()
    .prepare(
      "SELECT config_json, updated_at FROM user_model_configs WHERE user_id = ?",
    )
    .get(userId) as UserModelConfigRow | undefined;

  if (!row) return null;
  return parseStoredConfig(row);
}
