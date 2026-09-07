export const OFFICIAL_HOME_NAVIGATION_PARAM = "from";
export const OFFICIAL_HOME_NAVIGATION_VALUE = "brand";

/**
 * 返回 OneFlow 官网首页地址。
 *
 * 品牌入口使用独立标记，以便已登录用户点击品牌时仍能看到官网；
 * 直接访问根路径的既有登录态重定向保持不变。
 */
export function getOfficialHomeUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_AUTHOR_SITE_URL?.trim();
  const baseUrl = configuredUrl?.replace(/\/+$/, "") ?? "";
  return `${baseUrl}/?${OFFICIAL_HOME_NAVIGATION_PARAM}=${OFFICIAL_HOME_NAVIGATION_VALUE}`;
}
