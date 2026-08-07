/**
 * 浏览端（独立 viewer-site）基址解析。
 *
 * 优先级：
 * 1. NEXT_PUBLIC_VIEWER_URL 环境变量
 * 2. 按当前 author-site 的 hostname/port 推导：dev 4200 → 4300，Docker 3200 → 3300
 * 3. 无法推导（如生产无端口）时返回空串，调用方自行降级
 */
export function getViewerBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const viewerUrl = process.env.NEXT_PUBLIC_VIEWER_URL;
  if (viewerUrl) return viewerUrl;

  const { hostname, port, protocol } = window.location;
  const authorPort = parseInt(port, 10);
  if (isNaN(authorPort)) return "";

  const portMap: Record<number, number> = {
    4200: 4300,
    3200: 3300,
  };
  const viewerPort = portMap[authorPort] ?? authorPort;

  return `${protocol}//${hostname}:${viewerPort}`;
}
