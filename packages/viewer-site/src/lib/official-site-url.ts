const DEFAULT_AUTHOR_SITE_URL = "http://localhost:4200";

/** 返回浏览端品牌入口应跳转到的 OneFlow 官网首页地址。 */
export function getOfficialHomeUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_AUTHOR_SITE_URL?.trim() || DEFAULT_AUTHOR_SITE_URL;
  const baseUrl = configuredUrl.replace(/\/+$/, "");
  return `${baseUrl}/?from=brand`;
}
