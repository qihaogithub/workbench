/**
 * 运行时 Props 注入：合并项目级 Schema + 页面级 Schema 的 default 值
 *
 * 渲染前调用 `mergeConfigToProps()` 拿到合并后的 Props 整体注入到 iframe 组件，
 * 避免 AI 必须在每个页面的 Props 接口中同步项目级字段（5+ 页面时几乎必漏改）。
 *
 * 字段冲突处理：
 *  - 写入时机已通过 schema-validator 强校验
 *  - 此处运行时再做一次兜底，发现重名抛 `SchemaConflictError`
 *
 * 详见 docs/plans/进行中/项目多Demo页面支持方案.md §2.3 / §2.6 / §4.6
 */

import { parseSchemaString, type JsonSchema } from "./schema-validator";

/**
 * 字段冲突错误：项目级 Schema 与页面级 Schema 出现同名字段。
 * 由 PreviewPanel 等运行时入口捕获后展示明确错误。
 */
export class SchemaConflictError extends Error {
  conflicts: string[];
  constructor(conflicts: string[]) {
    super(`Schema 字段冲突: ${conflicts.join(", ")}`);
    this.name = "SchemaConflictError";
    this.conflicts = conflicts;
  }
}

/**
 * 从 Schema 的 properties 中提取 default 值，组装为对象。
 * 没有 default 的字段不会出现在结果中，与现有 `getDefaultValues()` 行为一致。
 */
function extractDefaultsFromSchema(
  schema: JsonSchema | null,
): Record<string, unknown> {
  if (!schema || !schema.properties || typeof schema.properties !== "object") {
    return {};
  }
  const defaults: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    if (value && typeof value === "object" && "default" in (value as object)) {
      const def = (value as { default?: unknown }).default;
      if (def !== undefined) {
        defaults[key] = def;
      }
    }
  }
  return defaults;
}

/**
 * 合并项目级配置和页面级配置的 Schema default 值，返回组件运行时 Props。
 *
 * @param projectSchema 项目级 `project.config.schema.json` 内容字符串（可空）
 * @param pageSchema 页面级 `demos/{id}/config.schema.json` 内容字符串
 * @throws {SchemaConflictError} 两个 Schema 出现同名字段时
 */
export function mergeConfigToProps(
  projectSchema: string | undefined,
  pageSchema: string,
): Record<string, unknown> {
  const project = parseSchemaString(projectSchema);
  const page = parseSchemaString(pageSchema);

  const projectDefaults = extractDefaultsFromSchema(project);
  const pageDefaults = extractDefaultsFromSchema(page);

  const projectKeys = new Set(Object.keys(projectDefaults));
  const overlapping = Object.keys(pageDefaults).filter((k) => projectKeys.has(k));
  if (overlapping.length > 0) {
    throw new SchemaConflictError(overlapping);
  }

  return { ...projectDefaults, ...pageDefaults };
}

/**
 * 检测值是否被用户修改过
 *
 * @param currentValue 当前配置值
 * @param oldValue 旧 Schema 的默认值
 * @param newValue 新 Schema 的默认值
 * @returns 如果用户修改过返回 true
 */
function isUserModified(
  currentValue: unknown,
  oldValue: unknown,
  newValue: unknown,
): boolean {
  // 如果当前值与新默认值相同，说明没有修改
  if (JSON.stringify(currentValue) === JSON.stringify(newValue)) {
    return false;
  }
  // 如果没有旧 schema，无法准确判断是否用户修改过
  // 在这种情况下，我们无法区分"用户修改过"和"schema 变化但用户未修改"
  // 为了安全起见，我们认为用户未修改（使用新默认值）
  if (oldValue === undefined) {
    return false;
  }
  // 如果当前值与旧默认值相同，说明用户未修改（只是 schema 变了）
  if (JSON.stringify(currentValue) === JSON.stringify(oldValue)) {
    return false;
  }
  // 如果当前值与旧默认值不同，说明用户修改过
  return true;
}

/**
 * 合并配置：删除不存在的字段，保留用户修改过的值
 *
 * @param currentConfig 当前配置数据
 * @param newSchema 新 Schema 字符串
 * @param oldSchema 旧 Schema 字符串（可选，用于检测用户修改）
 * @returns 合并后的配置数据
 */
export function mergeConfigWithUserValues(
  currentConfig: Record<string, unknown>,
  newSchema: string,
  oldSchema?: string,
): Record<string, unknown> {
  const newSchemaObj = parseSchemaString(newSchema);
  const oldSchemaObj = oldSchema ? parseSchemaString(oldSchema) : null;

  const newDefaults = extractDefaultsFromSchema(newSchemaObj);
  const oldDefaults = extractDefaultsFromSchema(oldSchemaObj);

  const result: Record<string, unknown> = {};

  // 遍历新 schema 中的字段
  for (const [key, newValue] of Object.entries(newDefaults)) {
    const currentValue = currentConfig[key];
    const oldValue = oldDefaults[key];

    if (
      currentValue !== undefined &&
      isUserModified(currentValue, oldValue, newValue)
    ) {
      // 用户修改过，保留用户值
      result[key] = currentValue;
    } else {
      // 使用新默认值
      result[key] = newValue;
    }
  }

  // 处理 __order 元数据
  if (currentConfig.__order) {
    result.__order = currentConfig.__order;
  }

  // 处理 __orderH 元数据
  if (currentConfig.__orderH) {
    result.__orderH = currentConfig.__orderH;
  }

  // 处理 __positions 元数据
  if (currentConfig.__positions) {
    result.__positions = currentConfig.__positions;
  }

  return result;
}
