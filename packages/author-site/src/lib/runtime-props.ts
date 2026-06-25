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

import { getDefaultValues } from "@opencode-workbench/shared/demo";

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

const RESERVED_CONFIG_KEYS = new Set(["__order", "__orderH", "__positions"]);

function isReservedConfigKey(key: string): boolean {
  return RESERVED_CONFIG_KEYS.has(key);
}

function readSchemaDefaults(schema: string | undefined): Record<string, unknown> {
  return schema ? getDefaultValues(schema) : {};
}

function mergeRuntimeDefaults(
  projectDefaults: Record<string, unknown>,
  pageDefaults: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...projectDefaults,
    ...pageDefaults,
  };

  const projectPositions = projectDefaults.__positions;
  const pagePositions = pageDefaults.__positions;
  if (
    projectPositions &&
    typeof projectPositions === "object" &&
    !Array.isArray(projectPositions)
  ) {
    merged.__positions = { ...(projectPositions as Record<string, unknown>) };
  }
  if (
    pagePositions &&
    typeof pagePositions === "object" &&
    !Array.isArray(pagePositions)
  ) {
    merged.__positions = {
      ...((merged.__positions as Record<string, unknown> | undefined) ?? {}),
      ...(pagePositions as Record<string, unknown>),
    };
  }

  return merged;
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
  const projectDefaults = readSchemaDefaults(projectSchema);
  const pageDefaults = readSchemaDefaults(pageSchema);

  const projectKeys = new Set(Object.keys(projectDefaults));
  const overlapping = Object.keys(pageDefaults).filter(
    (k) => projectKeys.has(k) && !isReservedConfigKey(k),
  );
  if (overlapping.length > 0) {
    throw new SchemaConflictError(overlapping);
  }

  return mergeRuntimeDefaults(projectDefaults, pageDefaults);
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
  const newDefaults = readSchemaDefaults(newSchema);
  const oldDefaults = oldSchema ? readSchemaDefaults(oldSchema) : {};

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

  for (const key of RESERVED_CONFIG_KEYS) {
    if (newDefaults[key] === undefined && currentConfig[key] === undefined) {
      continue;
    }
    result[key] = currentConfig[key] ?? newDefaults[key];
  }

  return result;
}
