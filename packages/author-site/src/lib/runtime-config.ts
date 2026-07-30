export const DEFAULT_AGENT_SERVICE_URL = "http://localhost:4201";
/** 浏览器端自动推导时使用的 agent-service 端口（Docker 部署标准端口） */
export const AGENT_SERVICE_PORT = "3201";
export const DEFAULT_SCREENSHOT_SERVICE_URL = "http://localhost:4202";
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
  // 显式配置优先（开发环境 .env 或反向代理等特殊拓扑）
  const configured = process.env.NEXT_PUBLIC_AGENT_SERVICE_URL;
  if (configured) return trimTrailingSlashes(configured);
  // 浏览器环境：从当前页面 hostname 自动推导，同主机 + 固定端口
  // 使同一 Docker 镜像在任意 IP/域名下均可正常工作
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${AGENT_SERVICE_PORT}`;
  }
  return DEFAULT_AGENT_SERVICE_URL;
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
