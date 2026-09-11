export type AutoEnableRule =
  | { type: "prefix"; value: string }
  | { type: "nameFilter"; value: string };

export interface FrontendModelPolicy {
  enabledModels: string[];
  autoEnableRules: AutoEnableRule[];
  excludedModels: string[];
}

export type ImageGenApiProfile =
  | "auto"
  | "gpt-image"
  | "dall-e-3"
  | "generation-only";

export interface ImageGenConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiProfile: ImageGenApiProfile;
  timeoutMs: number;
  maxPerSession: number;
  maxRetries: number;
  concurrency: number;
  maxPromptLen: number;
  apiKey?: string;
}

export interface BackendProvider {
  readonly id: string;
  readonly name: string;
  readonly baseURL: string;
  readonly apiKey: string;
  readonly models: string[];
  readonly defaultModel?: string;
  readonly enabled?: boolean;
  readonly contextWindow?: number;
  readonly maxTokens?: number;
}

export interface BackendProvidersConfig {
  readonly providers: BackendProvider[];
  readonly activeProviderId?: string;
  readonly activeModelId?: string;
}

export interface GlobalModelConfig {
  readonly frontend: FrontendModelPolicy;
  readonly backendProviders: BackendProvidersConfig;
  readonly imageGen: ImageGenConfig;
}

export const DEFAULT_FRONTEND_MODEL_POLICY: FrontendModelPolicy = {
  enabledModels: [],
  autoEnableRules: [],
  excludedModels: [],
};

/** Deliberately contains no API key. */
export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
  enabled: false,
  baseUrl: "https://api.openai.com/v1",
  model: "dall-e-3",
  apiProfile: "auto",
  timeoutMs: 60_000,
  maxPerSession: 30,
  maxRetries: 3,
  concurrency: 2,
  maxPromptLen: 1_000,
};

export const DEFAULT_BACKEND_PROVIDERS_CONFIG: BackendProvidersConfig = {
  providers: [],
};

export function createDefaultGlobalModelConfig(): GlobalModelConfig {
  return {
    frontend: cloneFrontendPolicy(DEFAULT_FRONTEND_MODEL_POLICY),
    backendProviders: cloneBackendProviders(DEFAULT_BACKEND_PROVIDERS_CONFIG),
    imageGen: { ...DEFAULT_IMAGE_GEN_CONFIG },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function assertKnownKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${label} contains unsupported field "${unknown}"`);
}

function normalizeStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      throw new TypeError(`${label} must contain non-empty strings`);
    }
    const normalized = item.trim();
    if (!seen.has(normalized)) {
      result.push(normalized);
      seen.add(normalized);
    }
  }
  return result;
}

function normalizeHttpUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be an HTTP URL`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new TypeError(`${label} must be an HTTP URL`);
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new TypeError(`${label} must be an HTTP URL without credentials`);
  }
  return parsed.toString().replace(/\/+$/, "");
}

function normalizePositiveInteger(
  value: unknown,
  label: string,
  options: { readonly min: number; readonly max: number },
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < options.min ||
    value > options.max
  ) {
    throw new TypeError(
      `${label} must be an integer between ${options.min} and ${options.max}`,
    );
  }
  return value;
}

function cloneFrontendPolicy(policy: FrontendModelPolicy): FrontendModelPolicy {
  return {
    enabledModels: [...policy.enabledModels],
    autoEnableRules: policy.autoEnableRules.map((rule) => ({ ...rule })),
    excludedModels: [...policy.excludedModels],
  };
}

function cloneBackendProviders(
  config: BackendProvidersConfig,
): BackendProvidersConfig {
  return {
    providers: config.providers.map((provider) => ({
      ...provider,
      models: [...provider.models],
    })),
    activeProviderId: config.activeProviderId,
    activeModelId: config.activeModelId,
  };
}

export function normalizeFrontendModelPolicy(
  input: unknown = DEFAULT_FRONTEND_MODEL_POLICY,
): FrontendModelPolicy {
  const value = requireRecord(input, "frontend");
  assertKnownKeys(
    value,
    ["enabledModels", "autoEnableRules", "excludedModels"],
    "frontend",
  );
  for (const key of ["enabledModels", "autoEnableRules", "excludedModels"] as const) {
    if (!(key in value)) throw new TypeError(`frontend.${key} is required`);
  }

  const enabledModels = normalizeStringList(
    value.enabledModels ?? [],
    "frontend.enabledModels",
  );
  const excludedModels = normalizeStringList(
    value.excludedModels ?? [],
    "frontend.excludedModels",
  );
  const excluded = new Set(excludedModels);
  if (enabledModels.some((model) => excluded.has(model))) {
    throw new TypeError("frontend.enabledModels and excludedModels must be disjoint");
  }

  const rawRules = value.autoEnableRules ?? [];
  if (!Array.isArray(rawRules)) {
    throw new TypeError("frontend.autoEnableRules must be an array");
  }
  const autoEnableRules: AutoEnableRule[] = [];
  const seenRules = new Set<string>();
  for (const rawRule of rawRules) {
    const rule = requireRecord(rawRule, "frontend.autoEnableRules item");
    assertKnownKeys(rule, ["type", "value"], "frontend.autoEnableRules item");
    if (rule.type !== "prefix" && rule.type !== "nameFilter") {
      throw new TypeError("frontend.autoEnableRules item has an invalid type");
    }
    if (typeof rule.value !== "string" || rule.value.trim() === "") {
      throw new TypeError("frontend.autoEnableRules item value must be non-empty");
    }
    const normalizedValue = rule.value.trim();
    const identity = `${rule.type}:${normalizedValue}`;
    if (!seenRules.has(identity)) {
      autoEnableRules.push({ type: rule.type, value: normalizedValue });
      seenRules.add(identity);
    }
  }

  return { enabledModels, autoEnableRules, excludedModels };
}

export function validateFrontendModelPolicy(
  value: unknown,
): asserts value is FrontendModelPolicy {
  normalizeFrontendModelPolicy(value);
}

export function normalizeImageGenConfig(
  input: unknown = {},
): ImageGenConfig {
  const value = requireRecord(input, "imageGen");
  assertKnownKeys(
    value,
    [
      "enabled",
      "baseUrl",
      "model",
      "apiProfile",
      "timeoutMs",
      "maxPerSession",
      "maxRetries",
      "concurrency",
      "maxPromptLen",
      "apiKey",
    ],
    "imageGen",
  );

  const merged = { ...DEFAULT_IMAGE_GEN_CONFIG, ...value };
  if (typeof merged.enabled !== "boolean") {
    throw new TypeError("imageGen.enabled must be a boolean");
  }
  if (typeof merged.model !== "string" || merged.model.trim() === "") {
    throw new TypeError("imageGen.model must be a non-empty string");
  }
  if (
    merged.apiProfile !== "auto" &&
    merged.apiProfile !== "gpt-image" &&
    merged.apiProfile !== "dall-e-3" &&
    merged.apiProfile !== "generation-only"
  ) {
    throw new TypeError("imageGen.apiProfile is invalid");
  }
  if (merged.apiKey !== undefined && typeof merged.apiKey !== "string") {
    throw new TypeError("imageGen.apiKey must be a string when provided");
  }

  const apiKey = merged.apiKey?.trim() || undefined;
  return {
    enabled: merged.enabled,
    baseUrl: normalizeHttpUrl(merged.baseUrl, "imageGen.baseUrl"),
    model: merged.model.trim(),
    apiProfile: merged.apiProfile,
    timeoutMs: normalizePositiveInteger(merged.timeoutMs, "imageGen.timeoutMs", {
      min: 1,
      max: 3_600_000,
    }),
    maxPerSession: normalizePositiveInteger(
      merged.maxPerSession,
      "imageGen.maxPerSession",
      { min: 1, max: 1_000 },
    ),
    maxRetries: normalizePositiveInteger(merged.maxRetries, "imageGen.maxRetries", {
      min: 0,
      max: 20,
    }),
    concurrency: normalizePositiveInteger(merged.concurrency, "imageGen.concurrency", {
      min: 1,
      max: 100,
    }),
    maxPromptLen: normalizePositiveInteger(
      merged.maxPromptLen,
      "imageGen.maxPromptLen",
      { min: 1, max: 100_000 },
    ),
    ...(apiKey ? { apiKey } : {}),
  };
}

export function validateImageGenConfig(
  value: unknown,
): asserts value is ImageGenConfig {
  normalizeImageGenConfig(value);
}

export function normalizeBackendProvidersConfig(
  input: unknown = DEFAULT_BACKEND_PROVIDERS_CONFIG,
): BackendProvidersConfig {
  const value = requireRecord(input, "backendProviders");
  assertKnownKeys(
    value,
    ["providers", "activeProviderId", "activeModelId"],
    "backendProviders",
  );
  if (!("providers" in value)) {
    throw new TypeError("backendProviders.providers is required");
  }
  const rawProviders = value.providers ?? [];
  if (!Array.isArray(rawProviders)) {
    throw new TypeError("backendProviders.providers must be an array");
  }

  const providers: BackendProvider[] = [];
  const providerIds = new Set<string>();
  for (const rawProvider of rawProviders) {
    const provider = requireRecord(rawProvider, "backendProviders.providers item");
    assertKnownKeys(
      provider,
      [
        "id",
        "name",
        "baseURL",
        "apiKey",
        "models",
        "defaultModel",
        "enabled",
        "contextWindow",
        "maxTokens",
      ],
      "backendProviders.providers item",
    );
    const id = normalizeRequiredString(provider.id, "provider.id");
    if (providerIds.has(id)) throw new TypeError(`Duplicate provider id "${id}"`);
    providerIds.add(id);
    const models = normalizeStringList(provider.models ?? [], "provider.models");
    const defaultModel =
      provider.defaultModel === undefined
        ? undefined
        : normalizeRequiredString(provider.defaultModel, "provider.defaultModel");
    if (defaultModel !== undefined && !models.includes(defaultModel)) {
      throw new TypeError("provider.defaultModel must be listed in provider.models");
    }
    const enabled = provider.enabled === undefined ? true : provider.enabled;
    if (typeof enabled !== "boolean") throw new TypeError("provider.enabled must be a boolean");

    providers.push({
      id,
      name:
        provider.name === undefined
          ? id
          : normalizeRequiredString(provider.name, "provider.name"),
      baseURL: normalizeHttpUrl(provider.baseURL, "provider.baseURL"),
      apiKey:
        provider.apiKey === undefined
          ? ""
          : normalizeString(provider.apiKey, "provider.apiKey"),
      models,
      ...(defaultModel ? { defaultModel } : {}),
      enabled,
      ...(provider.contextWindow === undefined
        ? {}
        : {
            contextWindow: normalizePositiveInteger(
              provider.contextWindow,
              "provider.contextWindow",
              { min: 1, max: 10_000_000 },
            ),
          }),
      ...(provider.maxTokens === undefined
        ? {}
        : {
            maxTokens: normalizePositiveInteger(provider.maxTokens, "provider.maxTokens", {
              min: 1,
              max: 10_000_000,
            }),
          }),
    });
  }

  const activeProviderId =
    value.activeProviderId === undefined
      ? undefined
      : normalizeRequiredString(value.activeProviderId, "backendProviders.activeProviderId");
  if (activeProviderId !== undefined && !providerIds.has(activeProviderId)) {
    throw new TypeError("backendProviders.activeProviderId must reference a provider");
  }
  const activeModelId =
    value.activeModelId === undefined
      ? undefined
      : normalizeRequiredString(value.activeModelId, "backendProviders.activeModelId");

  return {
    providers,
    ...(activeProviderId ? { activeProviderId } : {}),
    ...(activeModelId ? { activeModelId } : {}),
  };
}

function normalizeString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value.trim();
}

function normalizeRequiredString(value: unknown, label: string): string {
  const normalized = normalizeString(value, label);
  if (!normalized) throw new TypeError(`${label} must be non-empty`);
  return normalized;
}

export function normalizeGlobalModelConfig(
  input: unknown = createDefaultGlobalModelConfig(),
): GlobalModelConfig {
  const value = requireRecord(input, "modelConfig");
  assertKnownKeys(value, ["frontend", "backendProviders", "imageGen"], "modelConfig");
  for (const key of ["frontend", "backendProviders", "imageGen"] as const) {
    if (!(key in value)) throw new TypeError(`modelConfig.${key} is required`);
  }
  return {
    frontend: normalizeFrontendModelPolicy(value.frontend),
    backendProviders: normalizeBackendProvidersConfig(value.backendProviders),
    imageGen: normalizeImageGenConfig(value.imageGen),
  };
}

export function validateGlobalModelConfig(
  value: unknown,
): asserts value is GlobalModelConfig {
  normalizeGlobalModelConfig(value);
}
