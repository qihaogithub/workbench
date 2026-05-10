/**
 * Schema 冲突校验
 *
 * 项目级 Schema 与页面级 Schema 的字段必须互斥不重名。
 * 所有 Schema 写入入口（PUT config / PUT files / POST generate-schema）
 * 在落盘前必须调用 `validateNoSchemaConflict`，发现重名直接 400 拒绝。
 *
 * 详见 docs/plans/进行中/项目多Demo页面支持方案.md §2.4 / §6.3
 */

export interface JsonSchema {
  $schema?: string;
  type?: string;
  title?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface SchemaConflictDetail {
  field: string;
  pages: string[]; // 与项目级冲突的页面 ID 列表
}

export type SchemaConflictResult =
  | { ok: true }
  | { ok: false; conflicts: SchemaConflictDetail[] };

/**
 * 提取 Schema properties 的字段名集合
 * 解析失败或无 properties 时返回空 Set
 */
function extractFieldNames(schema: JsonSchema | null | undefined): Set<string> {
  if (!schema || !schema.properties || typeof schema.properties !== "object") {
    return new Set();
  }
  return new Set(Object.keys(schema.properties));
}

/**
 * 校验项目级 Schema 与所有页面级 Schema 之间无字段名冲突
 *
 * @param projectSchema 项目级 Schema 对象（null 表示不存在项目级配置）
 * @param pageSchemas demoId -> 页面级 Schema 对象 的映射
 * @returns 全部互斥时 `{ ok: true }`，否则返回冲突详情列表
 */
export function validateNoSchemaConflict(
  projectSchema: JsonSchema | null,
  pageSchemas: Record<string, JsonSchema>,
): SchemaConflictResult {
  const projectFields = extractFieldNames(projectSchema);
  if (projectFields.size === 0) {
    return { ok: true };
  }

  const conflictMap = new Map<string, string[]>();
  for (const [demoId, pageSchema] of Object.entries(pageSchemas)) {
    const pageFields = extractFieldNames(pageSchema);
    for (const field of pageFields) {
      if (projectFields.has(field)) {
        const list = conflictMap.get(field) ?? [];
        list.push(demoId);
        conflictMap.set(field, list);
      }
    }
  }

  if (conflictMap.size === 0) {
    return { ok: true };
  }

  const conflicts: SchemaConflictDetail[] = Array.from(conflictMap.entries())
    .map(([field, pages]) => ({ field, pages }))
    .sort((a, b) => a.field.localeCompare(b.field));

  return { ok: false, conflicts };
}

/**
 * 解析 JSON Schema 字符串。
 * 字符串非合法 JSON 时返回 null（调用方可视情况返回 400）。
 */
export function parseSchemaString(schema: string | undefined): JsonSchema | null {
  if (!schema) return null;
  try {
    const parsed = JSON.parse(schema);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonSchema;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 字符串入口形式的便捷封装：直接传入 Schema 字符串，内部解析后再做冲突校验
 */
export function validateNoSchemaConflictFromStrings(
  projectSchema: string | undefined,
  pageSchemas: Record<string, string>,
): SchemaConflictResult {
  const project = parseSchemaString(projectSchema);
  const pages: Record<string, JsonSchema> = {};
  for (const [demoId, raw] of Object.entries(pageSchemas)) {
    const parsed = parseSchemaString(raw);
    if (parsed) pages[demoId] = parsed;
  }
  return validateNoSchemaConflict(project, pages);
}
