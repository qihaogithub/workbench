import path from "path";
import type { DemoPageMeta } from "@workbench/shared";

/**
 * 将页面名称转为文件系统安全的 slug。
 * - ASCII 字母数字保留，空格/特殊字符 → `-`，全小写
 * - 非 ASCII 字符（中文等）直接丢弃
 * - 合并连续 `-`，去除首尾 `-`
 * - 截断到 20 字符
 * - 空结果回退 `page`
 *
 * @example
 *   generatePageSlug("Landing Page")    // → "landing-page"
 *   generatePageSlug("Product Detail")  // → "product-detail"
 *   generatePageSlug("首页")            // → "page"（中文被丢弃，回退默认）
 *   generatePageSlug("首页 Home")       // → "home"
 *   generatePageSlug("")                // → "page"
 */
export function generatePageSlug(name: string): string {
  const slug = name
    .toLowerCase()
    // 保留 ASCII 字母数字和空格/连字符，丢弃其他字符（含中文）
    .replace(/[^a-z0-9\s-]/g, "")
    // 空格替换为 `-`
    .replace(/\s+/g, "-")
    // 合并连续 `-`
    .replace(/-{2,}/g, "-")
    // 去除首尾 `-`
    .replace(/^-|-$/g, "")
    // 截断到 20 字符
    .slice(0, 20)
    // 截断后可能产生尾部 `-`
    .replace(/-$/, "");

  return slug || "page";
}

export function isValidRouteKey(routeKey: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(routeKey);
}

export function makeUniqueRouteKey(base: string, used: Set<string>): string {
  const normalizedBase = isValidRouteKey(base) ? base : generatePageSlug(base);
  let candidate = normalizedBase || "page";
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${normalizedBase || "page"}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function generateRouteKey(
  name: string,
  existingRouteKeys: string[] = [],
): string {
  return makeUniqueRouteKey(generatePageSlug(name), new Set(existingRouteKeys));
}

/**
 * 生成 Demo 页面 ID。
 * 格式 `{slug}_{4位随机}`，如 `product-detail_a3f2`。
 * slug 由 `generatePageSlug(name)` 生成，保证目录名有语义。
 */
export function generateDemoPageId(name?: string): string {
  const slug = generatePageSlug(name || "Default Page");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug}_${rand}`;
}

/**
 * 获取页面目录的绝对路径
 */
export function getDemoDirPath(workspacePath: string, demoId: string): string {
  return path.join(workspacePath, "demos", demoId);
}

export function normalizeWorkspacePagesRouteKeys(
  pages: DemoPageMeta[],
): { pages: DemoPageMeta[]; changed: boolean } {
  const used = new Set<string>();
  let changed = false;
  const normalizedPages = pages.map((page) => {
    const current = typeof page.routeKey === "string" ? page.routeKey.trim() : "";
    if (current && isValidRouteKey(current) && !used.has(current)) {
      used.add(current);
      return page;
    }

    changed = true;
    return {
      ...page,
      routeKey: makeUniqueRouteKey(current || page.name || page.id, used),
    };
  });
  return { pages: normalizedPages, changed };
}
