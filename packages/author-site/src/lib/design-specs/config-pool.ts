import { parseSchemaToFields } from "@workbench/demo-ui";
import type { ConfigPoolItem, ConfigPoolItemKind } from "./types";

/** 页面元信息（用于聚合配置项池） */
export interface ConfigPoolPageInput {
  id: string;
  name: string;
  schema: string;
}

export interface ConfigPoolBuildOptions {
  /**
   * 图片值对应的原始像素尺寸。素材池保持纯函数，由调用方决定如何读取
   * 平台图床、CDN 或其他资源的元数据。
   */
  resolveImageSize?: (value: string) => { width?: number; height?: number } | null;
}

/**
 * 从项目级 schema + 各页面 schema 聚合配置项素材池。
 * 每个 schema 字段展开为一个配置项，kind 由类型/格式/键名推断。
 * 项目级配置项 scope=project，页面级 scope=page。
 */
export function buildConfigPool(
  projectSchema: string | undefined,
  pages: ConfigPoolPageInput[],
  options: ConfigPoolBuildOptions = {},
): ConfigPoolItem[] {
  const items: ConfigPoolItem[] = [];
  const seen = new Set<string>();
  const pageNames = pages.map((p) => p.name).filter(Boolean);

  const push = (item: ConfigPoolItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  if (projectSchema) {
    for (const field of flattenFields(projectSchema)) {
      const kind = inferKind(field);
      push({
        id: `project:${field.key}`,
        scope: "project",
        key: field.key,
        title: field.title,
        kind,
        value: field.default,
        category: field.category,
        format: inferFormat(field),
        size: resolveImageSize(field, kind, options),
        // 项目级配置项拆分到各受影响页面（真实 schema 无 usage 信息，默认归入全部页面）
        pages: pageNames.length ? pageNames : undefined,
      });
    }
  }

  for (const page of pages) {
    for (const field of flattenFields(page.schema)) {
      const kind = inferKind(field);
      push({
        id: `page:${page.id}:${field.key}`,
        scope: "page",
        pageId: page.id,
        pageName: page.name,
        key: field.key,
        title: field.title,
        kind,
        value: field.default,
        category: field.category,
        format: inferFormat(field),
        size: resolveImageSize(field, kind, options),
      });
    }
  }

  return items;
}

function resolveImageSize(
  field: FlatField,
  kind: ConfigPoolItemKind,
  options: ConfigPoolBuildOptions,
): ConfigPoolItem["size"] | undefined {
  if (kind !== "image") return undefined;

  const widthRule = readImageRule(field.uiOptions?.widthRule);
  const heightRule = readImageRule(field.uiOptions?.heightRule);
  if (widthRule || heightRule) {
    return {
      w: widthRule ? String(widthRule.value) : "",
      h: heightRule ? String(heightRule.value) : "",
      wOperator: widthRule?.operator,
      hOperator: heightRule?.operator,
      wAny: !widthRule,
      hAny: !heightRule,
    };
  }

  if (typeof field.default !== "string") return undefined;
  const size = options.resolveImageSize?.(field.default);
  if (!size || !isPositivePixel(size.width) || !isPositivePixel(size.height)) {
    return undefined;
  }
  return { w: String(size.width), h: String(size.height) };
}

function isPositivePixel(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

type FlatField = {
  key: string;
  title: string;
  type: string;
  format?: string;
  uiWidget?: string;
  default?: unknown;
  category?: string;
  uiOptions?: Record<string, unknown>;
};

/** 展平 schema 顶层字段（parseSchemaToFields 已按分组返回） */
function flattenFields(schema: string): FlatField[] {
  const groups = parseSchemaToFields(schema);
  const fields: FlatField[] = [];
  for (const group of groups) {
    for (const field of group.fields) {
      if (!field.key) continue;
      fields.push({
        key: field.key,
        title: field.title,
        type: field.type,
        format: field.format,
        uiWidget: field.uiWidget,
        default: field.default,
        category: field.category,
        uiOptions: field.uiOptions,
      });
    }
  }
  return fields;
}

/** 常见图片扩展名 */
const IMAGE_EXTENSIONS = new Set([
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "avif",
]);

function inferKind(field: FlatField): ConfigPoolItemKind {
  const t = (field.type || "").toLowerCase();
  const w = (field.uiWidget || "").toLowerCase();
  const f = (field.format || "").toLowerCase();
  const k = field.key.toLowerCase();
  if (f === "color" || t.includes("color")) return "color";
  if (f === "image" || t === "image" || t === "imagelist" || w === "imagelist" || w === "image")
    return "image";
  if (t === "number" || t === "integer") return "number";
  if (
    w === "motion" ||
    t === "motion" ||
    k.includes("motion") ||
    k.includes("animation") ||
    k.includes("transition")
  )
    return "motion";
  // 图片启发式：默认值为图片扩展名，或键名含 image/img/logo/banner/pic
  if (
    typeof field.default === "string" &&
    (/\.(svg|png|jpe?g|gif|webp|bmp|avif)$/i.test(field.default) ||
      /^data:image\//i.test(field.default))
  )
    return "image";
  if (/(image|img|logo|banner|pic|thumb|background)/.test(k)) return "image";
  return "text";
}

function inferFormat(field: FlatField): string | undefined {
  const kind = inferKind(field);
  if (kind === "image") {
    const accept = typeof field.uiOptions?.accept === "string"
      ? field.uiOptions.accept.trim()
      : "";
    if (!accept || accept === "image/*" || accept === "*/*") return "不限";
    const labels = accept.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
      const raw = item.includes("/") ? item.split("/").pop() ?? item : item.replace(/^\./, "");
      return raw.toLowerCase() === "jpeg" ? "jpg" : raw.toLowerCase();
    });
    return Array.from(new Set(labels)).join("/") || "不限";
  }
  if (field.format) return field.format.toUpperCase();
  return undefined;
}

function readImageRule(value: unknown): { operator: string; value: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const rule = value as Record<string, unknown>;
  return typeof rule.operator === "string" && typeof rule.value === "number" && Number.isFinite(rule.value)
    ? { operator: rule.operator, value: rule.value }
    : undefined;
}
