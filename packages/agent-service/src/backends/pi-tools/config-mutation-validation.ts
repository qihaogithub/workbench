import {
  extractDeclaredRegionIds,
  validateVisibilityRules,
} from "@workbench/shared";

import type { AiMutationCategory } from "./ai-mutation-policy";
import { validateConfigSchemaContract } from "./schema-contract-validation";

export interface ConfigMutationValidationIssue {
  category: Extract<AiMutationCategory, "config_definition" | "visibility_reference_conflict" | "resource_reference">;
  code: string;
  message: string;
  details?: unknown;
}

interface ValidationInput {
  path: string;
  content: string;
  resources?: Record<string, string>;
  /**
   * Binary resources (notably assets/*) are intentionally omitted from the
   * text snapshot. Their authoritative hash paths still prove existence and
   * must participate in reference validation.
   */
  resourcePaths?: Iterable<string>;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isSchemaPath(resourcePath: string): boolean {
  return resourcePath === "project.config.schema.json" || /^demos\/[^/]+\/config\.schema\.json$/u.test(resourcePath);
}

function isValuesPath(resourcePath: string): boolean {
  return resourcePath === "project.config.values.json" || /^demos\/[^/]+\/config\.values\.json$/u.test(resourcePath);
}

function parseJsonObject(content: string): { value?: Record<string, unknown>; issue?: ConfigMutationValidationIssue } {
  try {
    const value = JSON.parse(content) as unknown;
    const object = asObject(value);
    if (!object) {
      return { issue: { category: "config_definition", code: "CONFIG_NOT_OBJECT", message: "配置资源必须是 JSON 对象。" } };
    }
    return { value: object };
  } catch {
    return { issue: { category: "config_definition", code: "INVALID_JSON", message: "配置资源不是合法 JSON。" } };
  }
}

function schemaPathForValues(resourcePath: string): string {
  return resourcePath === "project.config.values.json"
    ? "project.config.schema.json"
    : resourcePath.replace(/config\.values\.json$/u, "config.schema.json");
}

function schemaForValues(resourcePath: string, resources: Record<string, string>): { schema?: Record<string, unknown>; issue?: ConfigMutationValidationIssue } {
  const schemaPath = schemaPathForValues(resourcePath);
  if (resources[schemaPath] === undefined) return {};
  const parsed = parseJsonObject(resources[schemaPath]);
  return parsed.issue ? { issue: parsed.issue } : { schema: parsed.value };
}

function matchesType(value: unknown, type: unknown): boolean {
  if (Array.isArray(type)) return type.some((candidate) => matchesType(value, candidate));
  if (typeof type !== "string") return true;
  if (type === "object") return asObject(value) !== undefined;
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function validateValueAgainstSchema(value: unknown, schema: unknown, valuePath: string): ConfigMutationValidationIssue | undefined {
  const definition = asObject(schema);
  if (!definition) return undefined;
  if (Object.hasOwn(definition, "const") && !Object.is(definition.const, value)) {
    return { category: "config_definition", code: "CONFIG_VALUE_CONST", message: `${valuePath} 不符合 Schema 的 const 约束。` };
  }
  for (const [keyword, branches] of [
    ["oneOf", definition.oneOf],
    ["anyOf", definition.anyOf],
  ] as const) {
    if (!Array.isArray(branches) || branches.length === 0) continue;
    const matches = branches.some((branch) => validateValueAgainstSchema(value, branch, valuePath) === undefined);
    if (!matches) {
      return { category: "config_definition", code: `CONFIG_VALUE_${keyword.toUpperCase()}`, message: `${valuePath} 不符合 Schema 的 ${keyword} 分支。` };
    }
  }
  const variants = asObject(definition.variants);
  if (variants && Object.keys(variants).length > 0) {
    const matches = Object.values(variants).some((branch) => validateValueAgainstSchema(value, branch, valuePath) === undefined);
    if (!matches) {
      return { category: "config_definition", code: "CONFIG_VALUE_VARIANT", message: `${valuePath} 不符合 Schema 的 variants 分支。` };
    }
  }
  if (Array.isArray(definition.enum) && !definition.enum.some((candidate) => Object.is(candidate, value))) {
    return { category: "config_definition", code: "CONFIG_VALUE_ENUM", message: `${valuePath} 不满足 Schema 的 enum 约束。` };
  }
  if (!matchesType(value, definition.type)) {
    return { category: "config_definition", code: "CONFIG_VALUE_TYPE", message: `${valuePath} 的类型不符合 Schema。` };
  }
  const object = asObject(value);
  const properties = asObject(definition.properties);
  if (object && properties) {
    const required = Array.isArray(definition.required) ? definition.required : [];
    for (const key of required) {
      if (typeof key === "string" && !Object.hasOwn(object, key)) {
        return { category: "config_definition", code: "CONFIG_VALUE_REQUIRED", message: `${valuePath}.${key} 是 Schema 要求的必填字段。` };
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) {
        const issue = validateValueAgainstSchema(object[key], child, `${valuePath}.${key}`);
        if (issue) return issue;
      }
    }
  }
  if (Array.isArray(value) && definition.items) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = validateValueAgainstSchema(value[index], definition.items, `${valuePath}[${index}]`);
      if (issue) return issue;
    }
  }
  return undefined;
}

function findResourceReferences(value: unknown, resources: Record<string, string>, valuePath = "$"): ConfigMutationValidationIssue | undefined {
  if (typeof value === "string") {
    const match = /^assets\/.+/u.exec(value);
    if (match && resources[value] === undefined) {
      return { category: "resource_reference", code: "RESOURCE_NOT_REGISTERED", message: `${valuePath} 引用了未登记或不可用的资源 ${value}。` };
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = findResourceReferences(value[index], resources, `${valuePath}[${index}]`);
      if (issue) return issue;
    }
    return undefined;
  }
  const object = asObject(value);
  if (object) {
    for (const [key, child] of Object.entries(object)) {
      const issue = findResourceReferences(child, resources, `${valuePath}.${key}`);
      if (issue) return issue;
    }
  }
  return undefined;
}

function visibilityReferenceIssue(
  resourcePath: string,
  content: string,
  resources: Record<string, string>,
): ConfigMutationValidationIssue | undefined {
  const rulesRaw = resources["project.visibility-rules.json"];
  if (rulesRaw === undefined) return undefined;
  let tree: { pages?: Array<{ id?: unknown }> };
  try {
    tree = JSON.parse(resources["workspace-tree.json"] ?? "{}") as typeof tree;
  } catch {
    return { category: "visibility_reference_conflict", code: "WORKSPACE_TREE_INVALID", message: "无法校验现有 visibility 规则：workspace-tree.json 无法解析。" };
  }
  if (!Array.isArray(tree.pages)) {
    return { category: "visibility_reference_conflict", code: "WORKSPACE_TREE_INVALID", message: "无法校验现有 visibility 规则：页面树缺少 pages。" };
  }
  const pageIds = tree.pages.flatMap((page) => typeof page.id === "string" ? [page.id] : []);
  if (pageIds.length !== tree.pages.length) {
    return { category: "visibility_reference_conflict", code: "PAGE_ID_INVALID", message: "无法校验现有 visibility 规则：页面 ID 无效。" };
  }
  const projectSchema = resourcePath === "project.config.schema.json" ? content : resources["project.config.schema.json"];
  const pageSchemas: Record<string, string> = {};
  const regionIds: Record<string, string[]> = {};
  for (const pageId of pageIds) {
    const pageSchemaPath = `demos/${pageId}/config.schema.json`;
    const pageSchema = resourcePath === pageSchemaPath ? content : resources[pageSchemaPath];
    if (pageSchema !== undefined) pageSchemas[pageId] = pageSchema;
    regionIds[pageId] = extractDeclaredRegionIds([
      resources[`demos/${pageId}/index.tsx`],
      resources[`demos/${pageId}/prototype.html`],
    ]);
  }
  let rules: unknown;
  try {
    rules = JSON.parse(rulesRaw);
  } catch {
    return { category: "visibility_reference_conflict", code: "VISIBILITY_RULES_INVALID", message: "现有 visibility 规则不是合法 JSON，不能通过 Schema 写入绕过修复。" };
  }
  const validation = validateVisibilityRules(rules, { pageIds, regionIds, projectSchema, pageSchemas });
  if (!validation.valid) {
    return {
      category: "visibility_reference_conflict",
      code: "VISIBILITY_REFERENCE_CONFLICT",
      message: "候选 Schema 会使现有 visibility 规则引用失效，请将 Schema 与规则放入配置联动草稿原子调整。",
      details: validation.issues,
    };
  }
  return undefined;
}

export function validateConfigResourceMutation(input: ValidationInput): ConfigMutationValidationIssue | undefined {
  const resourcePath = input.path.replace(/\\/g, "/").replace(/^\.?\//u, "");
  if (!isSchemaPath(resourcePath) && !isValuesPath(resourcePath)) return undefined;
  const parsed = parseJsonObject(input.content);
  if (parsed.issue) return parsed.issue;
  const resources: Record<string, string> = { ...(input.resources ?? {}) };
  for (const resourcePath of input.resourcePaths ?? []) {
    if (resources[resourcePath] === undefined) resources[resourcePath] = "";
  }
  if (isSchemaPath(resourcePath)) {
    const contractIssues = validateConfigSchemaContract(parsed.value);
    if (contractIssues.length > 0) {
      return { category: "config_definition", code: contractIssues[0].code, message: contractIssues[0].message, details: contractIssues };
    }
    return visibilityReferenceIssue(resourcePath, input.content, resources);
  }
  const schemaResult = schemaForValues(resourcePath, resources);
  if (schemaResult.issue) return schemaResult.issue;
  if (schemaResult.schema) {
    const issue = validateValueAgainstSchema(parsed.value, schemaResult.schema, "$" );
    if (issue) return issue;
  }
  // A values file can legitimately exist before its schema is created (for
  // example during a page bootstrap). Apply strict resource-reference checks
  // once the authoritative schema is available; the Authority still enforces
  // JSON-object shape for schema-less values.
  return schemaResult.schema ? findResourceReferences(parsed.value, resources) : undefined;
}
