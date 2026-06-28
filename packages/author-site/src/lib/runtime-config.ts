export const DEFAULT_AGENT_SERVICE_URL = "http://localhost:3201";
export const DEFAULT_SCREENSHOT_SERVICE_URL = "http://localhost:3202";
export const DEFAULT_SCREENSHOT_PROXY_TIMEOUT_MS = 30000;

export interface ModelEnvConfig {
  allowedPrefixes: string[];
  nameFilters: string[];
  defaultModelIds: string[];
  blacklist: string[];
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseCsvEnv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIntegerEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  return Number.parseInt(value, 10);
}

export function getBrowserAgentServiceUrl(): string {
  return trimTrailingSlashes(
    process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || DEFAULT_AGENT_SERVICE_URL,
  );
}

export function getServerAgentServiceUrl(): string {
  return trimTrailingSlashes(
    process.env.AGENT_SERVICE_URL || DEFAULT_AGENT_SERVICE_URL,
  );
}

export function getAgentServiceUrl(): string {
  return typeof window !== "undefined"
    ? getBrowserAgentServiceUrl()
    : getServerAgentServiceUrl();
}

export function getAgentServiceApiKey(): string | undefined {
  return process.env.AGENT_SERVICE_API_KEY;
}

export function getInternalApiToken(): string {
  return (
    process.env.INTERNAL_API_TOKEN ||
    (process.env.NODE_ENV === "production" ? "" : "dev-internal-token")
  );
}

export function getScreenshotServiceUrl(): string {
  return trimTrailingSlashes(
    process.env.SCREENSHOT_SERVICE_URL ||
      process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL ||
      DEFAULT_SCREENSHOT_SERVICE_URL,
  );
}

export function getScreenshotProxyTimeoutMs(): number {
  return parseIntegerEnv(
    process.env.SCREENSHOT_PROXY_TIMEOUT_MS,
    DEFAULT_SCREENSHOT_PROXY_TIMEOUT_MS,
  );
}

export function getModelEnvConfig(): ModelEnvConfig {
  return {
    allowedPrefixes: parseCsvEnv(process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES),
    nameFilters: parseCsvEnv(process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS),
    defaultModelIds: parseCsvEnv(process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS),
    blacklist: parseCsvEnv(process.env.NEXT_PUBLIC_MODEL_BLACKLIST),
  };
}
