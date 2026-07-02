import crypto from "crypto";

import type {
  DingtalkExternalAuthCredential,
  ExternalAuthProvider,
  ExternalAuthProviderStatus,
  ExternalAuthSessionConfig,
  ExternalAuthStatus,
  FigmaExternalAuthCredential,
} from "@opencode-workbench/shared";

import { getDb } from "@/lib/db";

const ENCRYPTION_VERSION = "v1";
const PROVIDERS: ExternalAuthProvider[] = ["figma", "dingtalk"];
const FIGMA_REFRESH_URL = "https://api.figma.com/v1/oauth/refresh";
const FIGMA_REFRESH_WINDOW_MS = 5 * 60 * 1000;

type ExternalAuthCredential =
  | FigmaExternalAuthCredential
  | DingtalkExternalAuthCredential;

function getMissingFigmaOAuthRefreshMessage(): string {
  if (process.env.NODE_ENV !== "production") {
    return "Figma OAuth 客户端未配置，无法刷新授权。开发环境请在 packages/author-site/.env.local 设置 FIGMA_OAUTH_CLIENT_ID 和 FIGMA_OAUTH_CLIENT_SECRET，重启 pnpm dev 后重试。";
  }
  return "Figma OAuth 客户端未配置，无法刷新授权";
}

function createBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

interface StoredExternalAuthConfig {
  provider: ExternalAuthProvider;
  status: ExternalAuthStatus;
  accountLabel?: string;
  connectedAt?: number;
  expiresAt?: number;
  encryptedCredential?: string;
  message?: string;
}

interface ExternalAuthConfigRow {
  provider: ExternalAuthProvider;
  config_json: string;
  updated_at: number;
}

export interface ExternalAuthUpsertInput {
  provider: ExternalAuthProvider;
  status: ExternalAuthStatus;
  accountLabel?: string;
  expiresAt?: number;
  credential?: ExternalAuthCredential;
  message?: string;
}

function getEncryptionKey(): Buffer {
  const secret =
    process.env.MODEL_CONFIG_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "change-me-in-production";

  return crypto.createHash("sha256").update(secret).digest();
}

function encryptCredential(credential: ExternalAuthCredential): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credential), "utf8"),
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

function decryptCredential(value: string): ExternalAuthCredential {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== ENCRYPTION_VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("外部授权加密格式无效");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  const raw = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(raw) as ExternalAuthCredential;
}

function parseStoredConfig(row: ExternalAuthConfigRow): StoredExternalAuthConfig {
  return JSON.parse(row.config_json) as StoredExternalAuthConfig;
}

function toSafeStatus(
  stored: StoredExternalAuthConfig | null,
  provider: ExternalAuthProvider,
): ExternalAuthProviderStatus {
  if (!stored) {
    return { provider, status: "disconnected" };
  }

  const expired =
    stored.status === "connected" &&
    typeof stored.expiresAt === "number" &&
    stored.expiresAt <= Date.now();

  return {
    provider,
    status: expired ? "needs_reauth" : stored.status,
    accountLabel: stored.accountLabel,
    connectedAt: stored.connectedAt,
    expiresAt: stored.expiresAt,
    message: expired ? "授权已过期，请重新连接" : stored.message,
  };
}

function readStoredExternalAuthConfig(
  userId: string,
  provider: ExternalAuthProvider,
): StoredExternalAuthConfig | null {
  const row = getDb()
    .prepare(
      "SELECT provider, config_json, updated_at FROM user_external_auth_configs WHERE user_id = ? AND provider = ?",
    )
    .get(userId, provider) as ExternalAuthConfigRow | undefined;

  if (!row) return null;
  return parseStoredConfig(row);
}

export function readExternalAuthStatuses(userId: string): ExternalAuthProviderStatus[] {
  return PROVIDERS.map((provider) =>
    toSafeStatus(readStoredExternalAuthConfig(userId, provider), provider),
  );
}

export function upsertExternalAuthConfig(
  userId: string,
  input: ExternalAuthUpsertInput,
): ExternalAuthProviderStatus {
  const existing = readStoredExternalAuthConfig(userId, input.provider);
  const now = Date.now();
  const stored: StoredExternalAuthConfig = {
    provider: input.provider,
    status: input.status,
    accountLabel: input.accountLabel ?? existing?.accountLabel,
    connectedAt:
      input.status === "connected" ? existing?.connectedAt ?? now : existing?.connectedAt,
    expiresAt: input.expiresAt,
    encryptedCredential: input.credential
      ? encryptCredential(input.credential)
      : existing?.encryptedCredential,
    message: input.message,
  };

  getDb()
    .prepare(
      `INSERT INTO user_external_auth_configs (user_id, provider, config_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         config_json = ?,
         updated_at = ?`,
    )
    .run(
      userId,
      input.provider,
      JSON.stringify(stored),
      now,
      JSON.stringify(stored),
      now,
    );

  return toSafeStatus(stored, input.provider);
}

export function deleteExternalAuthConfig(
  userId: string,
  provider: ExternalAuthProvider,
): void {
  getDb()
    .prepare(
      "DELETE FROM user_external_auth_configs WHERE user_id = ? AND provider = ?",
    )
    .run(userId, provider);
}

export function readExternalAuthSessionConfig(
  userId: string,
): ExternalAuthSessionConfig {
  const figma = readStoredExternalAuthConfig(userId, "figma");
  const dingtalk = readStoredExternalAuthConfig(userId, "dingtalk");
  const config: ExternalAuthSessionConfig = {};

  if (figma?.status === "connected" && figma.encryptedCredential) {
    const credential = decryptCredential(
      figma.encryptedCredential,
    ) as FigmaExternalAuthCredential;
    if (!figma.expiresAt || figma.expiresAt > Date.now()) {
      config.figma = {
        enabled: true,
        accessToken: credential.accessToken,
        expiresAt: credential.expiresAt ?? figma.expiresAt,
        accountLabel: figma.accountLabel,
      };
    }
  }

  if (dingtalk?.status === "connected" && dingtalk.encryptedCredential) {
    const credential = decryptCredential(
      dingtalk.encryptedCredential,
    ) as DingtalkExternalAuthCredential;
    config.dingtalk = {
      enabled: true,
      configDir: credential.configDir,
      accountLabel: dingtalk.accountLabel,
    };
  }

  return config;
}

async function refreshFigmaCredential(
  userId: string,
  stored: StoredExternalAuthConfig,
  credential: FigmaExternalAuthCredential,
): Promise<FigmaExternalAuthCredential | null> {
  if (!credential.refreshToken) {
    upsertExternalAuthConfig(userId, {
      provider: "figma",
      status: "needs_reauth",
      accountLabel: stored.accountLabel,
      expiresAt: stored.expiresAt,
      message: "Figma 授权已过期，请重新连接",
    });
    return null;
  }

  const clientId = process.env.FIGMA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.FIGMA_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    upsertExternalAuthConfig(userId, {
      provider: "figma",
      status: "needs_reauth",
      accountLabel: stored.accountLabel,
      expiresAt: stored.expiresAt,
      message: getMissingFigmaOAuthRefreshMessage(),
    });
    return null;
  }

  try {
    const res = await fetch(FIGMA_REFRESH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: createBasicAuthHeader(clientId, clientSecret),
      },
      body: new URLSearchParams({
        refresh_token: credential.refreshToken,
      }),
    });

    if (!res.ok) {
      throw new Error(`Figma refresh failed: ${res.status}`);
    }

    const body = await res.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };
    if (!body.access_token) {
      throw new Error("Figma refresh response missing access_token");
    }

    const expiresAt =
      typeof body.expires_in === "number"
        ? Date.now() + body.expires_in * 1000
        : undefined;
    const refreshed: FigmaExternalAuthCredential = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || credential.refreshToken,
      expiresAt,
      tokenType: body.token_type,
      scope: body.scope,
    };

    upsertExternalAuthConfig(userId, {
      provider: "figma",
      status: "connected",
      accountLabel: stored.accountLabel,
      expiresAt,
      credential: refreshed,
    });
    return refreshed;
  } catch (error) {
    upsertExternalAuthConfig(userId, {
      provider: "figma",
      status: "needs_reauth",
      accountLabel: stored.accountLabel,
      expiresAt: stored.expiresAt,
      message:
        error instanceof Error
          ? `Figma 授权刷新失败：${error.message}`
          : "Figma 授权刷新失败",
    });
    return null;
  }
}

export async function readExternalAuthSessionConfigWithRefresh(
  userId: string,
): Promise<ExternalAuthSessionConfig> {
  const config = readExternalAuthSessionConfig(userId);
  const figma = readStoredExternalAuthConfig(userId, "figma");

  if (figma?.status !== "connected" || !figma.encryptedCredential) {
    return config;
  }

  const expiresAt = figma.expiresAt;
  if (!expiresAt || expiresAt > Date.now() + FIGMA_REFRESH_WINDOW_MS) {
    return config;
  }

  const credential = decryptCredential(
    figma.encryptedCredential,
  ) as FigmaExternalAuthCredential;
  const refreshed = await refreshFigmaCredential(userId, figma, credential);
  if (!refreshed?.accessToken) {
    return { ...config, figma: undefined };
  }

  return {
    ...config,
    figma: {
      enabled: true,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      accountLabel: figma.accountLabel,
    },
  };
}
