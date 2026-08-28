/** 浏览器端自动推导时使用的 agent-service 端口（Docker 部署标准端口） */
const AGENT_SERVICE_PORT = "3201";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * 获取浏览器端 agent-service URL。
 * 优先使用显式配置；未配置时从当前页面 hostname 自动推导，
 * 使同一 Docker 镜像在任意 IP/域名下均可正常工作。
 */
export function getBrowserAgentServiceUrl(): string {
  // 生产构建不得接受浏览器端地址覆盖，避免将 localhost 内联进远程部署包。
  const configured =
    process.env.NODE_ENV === "development"
      ? process.env.NEXT_PUBLIC_AGENT_SERVICE_URL
      : undefined;
  if (configured) return trimTrailingSlashes(configured);
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${AGENT_SERVICE_PORT}`;
  }
  return "";
}
