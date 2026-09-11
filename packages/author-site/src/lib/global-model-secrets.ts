import crypto from "node:crypto";

import { requireSecret } from "@workbench/runtime-config/secrets";
import type { BackendProvider, BackendProvidersConfig } from "@workbench/shared";

import type { ImageGenConfig, ModelConfigData } from "./model-config";

const ENCRYPTION_VERSION = "v1";

type StoredProvider = Omit<BackendProvider, "apiKey"> & {
  encryptedApiKey?: string;
};

type StoredImageGen = Omit<ImageGenConfig, "apiKey"> & {
  encryptedApiKey?: string;
};

function encryptionKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update(requireSecret("MODEL_CONFIG_ENCRYPTION_KEY"))
    .digest();
}

function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decrypt(value: string): string {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== ENCRYPTION_VERSION || !iv || !tag || !encrypted) {
    throw new Error("模型凭据加密格式无效，请执行凭据清理后重新配置");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function rejectLegacyPlaintext(record: Record<string, unknown>, label: string): void {
  if (typeof record.apiKey === "string" && record.apiKey.length > 0) {
    throw new Error(`${label} 仍包含历史明文凭据，请先执行凭据清理`);
  }
}

export function hydrateBackendProviders(value: unknown): BackendProvidersConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as { providers?: unknown; activeProviderId?: string; activeModelId?: string };
  if (!Array.isArray(input.providers)) return undefined;
  const providers = input.providers.map((item) => {
    if (!item || typeof item !== "object") throw new TypeError("provider 必须是对象");
    const stored = item as StoredProvider & Record<string, unknown>;
    rejectLegacyPlaintext(stored, `provider ${String(stored.id ?? "(unknown)")}`);
    const { encryptedApiKey, ...provider } = stored;
    return {
      ...provider,
      apiKey: encryptedApiKey ? decrypt(encryptedApiKey) : "",
    } as BackendProvider;
  });
  return {
    providers,
    activeProviderId: input.activeProviderId,
    activeModelId: input.activeModelId,
  };
}

export function hydrateImageGen(value: unknown): ImageGenConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const stored = value as StoredImageGen & Record<string, unknown>;
  rejectLegacyPlaintext(stored, "imageGen");
  const { encryptedApiKey, ...config } = stored;
  return {
    ...config,
    apiKey: encryptedApiKey ? decrypt(encryptedApiKey) : "",
  } as ImageGenConfig;
}

export function sealModelConfig(
  config: ModelConfigData,
  previousStored?: Record<string, unknown>,
): Record<string, unknown> {
  const priorProviders = new Map<string, StoredProvider>();
  const rawPriorProviders = (previousStored?.backendProviders as { providers?: unknown } | undefined)?.providers;
  if (Array.isArray(rawPriorProviders)) {
    for (const item of rawPriorProviders) {
      if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
        const stored = item as StoredProvider & Record<string, unknown>;
        rejectLegacyPlaintext(stored, `provider ${stored.id}`);
        priorProviders.set(stored.id, stored);
      }
    }
  }

  const backendProviders = config.backendProviders
    ? {
        ...config.backendProviders,
        providers: config.backendProviders.providers.map((item) => {
          const { apiKey, hasApiKey: _hasApiKey, ...provider } = item as BackendProvider & {
            hasApiKey?: boolean;
          };
          const encryptedApiKey = apiKey
            ? encrypt(apiKey)
            : priorProviders.get(provider.id)?.encryptedApiKey;
          return { ...provider, ...(encryptedApiKey ? { encryptedApiKey } : {}) };
        }),
      }
    : undefined;

  const previousImage = previousStored?.imageGen as StoredImageGen | undefined;
  if (previousImage) {
    rejectLegacyPlaintext(
      previousImage as StoredImageGen & Record<string, unknown>,
      "imageGen",
    );
  }
  const imageGen = config.imageGen
    ? (() => {
        const { apiKey, ...rest } = config.imageGen;
        const encryptedApiKey = apiKey ? encrypt(apiKey) : previousImage?.encryptedApiKey;
        return { ...rest, ...(encryptedApiKey ? { encryptedApiKey } : {}) };
      })()
    : undefined;

  return {
    frontend: config.frontend,
    ...(backendProviders ? { backendProviders } : {}),
    ...(imageGen ? { imageGen } : {}),
  };
}

export function sanitizeModelConfig(config: ModelConfigData): Record<string, unknown> {
  return {
    frontend: config.frontend,
    ...(config.backendProviders
      ? {
          backendProviders: {
            ...config.backendProviders,
            providers: config.backendProviders.providers.map(({ apiKey, ...provider }) => ({
              ...provider,
              hasApiKey: Boolean(apiKey),
            })),
          },
        }
      : {}),
    ...(config.imageGen
      ? {
          imageGen: {
            ...config.imageGen,
            apiKey: undefined,
            hasApiKey: Boolean(config.imageGen.apiKey),
          },
        }
      : {}),
  };
}
