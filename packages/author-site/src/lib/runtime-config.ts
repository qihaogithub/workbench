export const DEFAULT_AGENT_SERVICE_URL = "http://localhost:4201";
/** 浏览器端生产/Docker 自动推导时使用的 agent-service 端口。 */
export const AGENT_SERVICE_PORT = "3201";
/** 浏览器端本地开发自动推导时使用的 agent-service 端口。 */
export const DEV_AGENT_SERVICE_PORT = "4201";
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

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function getBrowserAgentServicePort(pagePort: string): string {
  if (pagePort === "3200") return AGENT_SERVICE_PORT;
  if (pagePort === "4200") return DEV_AGENT_SERVICE_PORT;
  return process.env.NODE_ENV === "development"
    ? DEV_AGENT_SERVICE_PORT
    : AGENT_SERVICE_PORT;
}

function isStandardAgentServicePort(port: string): boolean {
  return port === AGENT_SERVICE_PORT || port === DEV_AGENT_SERVICE_PORT;
}

export function getBrowserAgentServiceUrl(
  pageLocation?: Pick<Location, "hostname" | "port" | "protocol">,
): string {
  // 仅开发环境允许显式覆盖。NEXT_PUBLIC_* 会在生产构建时内联，若带有
  // localhost 会让远程浏览器错误地连接访问者自己的机器。
  const configured =
    process.env.NODE_ENV === "development"
      ? process.env.NEXT_PUBLIC_AGENT_SERVICE_URL
      : undefined;
  if (typeof window !== "undefined") {
    const currentLocation = pageLocation || window.location;
    const pagePort = currentLocation.port;
    const port = getBrowserAgentServicePort(pagePort);

    // 本机地址不能覆盖页面自身的 Docker/local 拓扑：同一份前端资源可能
    // 由 3200 或 4200 提供，固定写入 localhost:4201 会让 Docker 页面绕过
    // 3201。非 loopback 或非标准端口的自定义地址仍保留给开发代理和特殊部署使用。
    if (configured) {
      try {
        const configuredUrl = new URL(configured);
        const isKnownLocalPage = pagePort === "3200" || pagePort === "4200";
        if (
          !isLoopbackHostname(configuredUrl.hostname) ||
          !isKnownLocalPage ||
          !isStandardAgentServicePort(configuredUrl.port)
        ) {
          return trimTrailingSlashes(configured);
        }
      } catch {
        return trimTrailingSlashes(configured);
      }
    }

    // 浏览器环境：从当前页面 hostname 自动推导，同主机 + 拓扑端口。
    return `${currentLocation.protocol}//${currentLocation.hostname}:${port}`;
  }
  if (configured) return trimTrailingSlashes(configured);
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
