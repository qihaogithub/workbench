/**
 * Configuration-driven page visibility protocol.
 *
 * The protocol is declarative and shared by author preview, publish
 * validation and the viewer. It is never an authorization primitive: API
 * permissions remain enforced by the server independently.
 */

export const VISIBILITY_RULES_VERSION = 1 as const;

export type VisibilityRuleEffect = "hidden" | "disabled" | "unavailable";

export type VisibilityScalar = string | number | boolean | null;

export type VisibilityLeafCondition =
  | { kind: "truthy" }
  | { kind: "equals"; value: VisibilityScalar }
  | { kind: "oneOf"; values: VisibilityScalar[] };

export interface VisibilityRulePredicate {
  source: VisibilityRuleSource;
  condition: VisibilityLeafCondition;
}

export type VisibilityRuleCondition =
  | VisibilityLeafCondition
  | { kind: "all" | "any"; conditions: VisibilityRulePredicate[] };

export type VisibilityRuleTarget =
  | { type: "page"; pageId: string }
  | { type: "region"; pageId: string; regionId: string };

export type VisibilityRuleContext =
  { kind: "role"; value: string };

export type VisibilityRuleStrategy =
  | { kind: "unavailable"; message?: string }
  | { kind: "fallback-page"; pageId: string; message?: string }
  | { kind: "alternative-region"; pageId: string; regionId: string; message?: string };

export interface VisibilityRuleSource {
  /** Rules may read only project-level configuration fields. */
  scope: "project";
  fieldKey: string;
}

interface VisibilityRuleBase {
  id: string;
  target: VisibilityRuleTarget;
  effect: VisibilityRuleEffect;
  /** Optional server-supplied runtime context; it never grants permissions. */
  context?: VisibilityRuleContext;
  /** Optional safe rendering strategy when the rule condition matches. */
  strategy?: VisibilityRuleStrategy;
}

/**
 * Simple rules carry one source. Composite rules carry every source inside
 * their predicates, avoiding a second, potentially divergent primary source.
 */
export type VisibilityRule = VisibilityRuleBase & (
  | { source: VisibilityRuleSource; condition: VisibilityLeafCondition }
  | { condition: { kind: "all" | "any"; conditions: VisibilityRulePredicate[] }; source?: never }
);

export interface VisibilityRulesDocument {
  version: typeof VISIBILITY_RULES_VERSION;
  rules: VisibilityRule[];
  generatedBy?: string;
  generatedAt?: string;
  /** Mutation receipt or other creation audit reference. */
  mutationId?: string;
}

export interface VisibilityValidationIssue {
  code:
    | "DOCUMENT_INVALID"
    | "DOCUMENT_FIELDS_INVALID"
    | "VERSION_UNSUPPORTED"
    | "RULES_INVALID"
    | "RULE_FIELDS_INVALID"
    | "RULE_ID_INVALID"
    | "RULE_ID_DUPLICATE"
    | "SOURCE_SCOPE_UNSUPPORTED"
    | "SOURCE_FIELDS_INVALID"
    | "SOURCE_KEY_INVALID"
    | "SOURCE_KEY_MISSING"
    | "CONDITION_INVALID"
    | "CONDITION_FIELDS_INVALID"
    | "CONDITION_VALUE_INVALID"
    | "CONDITION_TYPE_MISMATCH"
    | "CONDITION_CONTEXT_INVALID"
    | "TARGET_INVALID"
    | "TARGET_FIELDS_INVALID"
    | "TARGET_PAGE_MISSING"
    | "TARGET_REGION_MISSING"
    | "TARGET_SCOPE_INVALID"
    | "STRATEGY_INVALID"
    | "STRATEGY_FIELDS_INVALID"
    | "STRATEGY_TARGET_MISSING"
    | "STRATEGY_TARGET_INVALID"
    | "STRATEGY_TARGET_CONFLICT"
    | "STRATEGY_CYCLE"
    | "CONFLICTING_RULES"
    | "PAGE_CONFIG_SCOPE_CONFLICT";
  message: string;
  ruleId?: string;
  pageId?: string;
  regionId?: string;
  fieldKey?: string;
}

export interface VisibilityValidationContext {
  /** Stable page ids from workspace-tree.json. */
  pageIds: Iterable<string>;
  /** Explicit region declarations per page. */
  regionIds?: Readonly<Record<string, Iterable<string>>>;
  /** Project schema, used to verify that each source field exists and types match. */
  projectSchema?: string | Record<string, unknown>;
  /** Optional page schemas used to reject project/page key collisions. */
  pageSchemas?: Readonly<Record<string, string | Record<string, unknown>>>;
}

export interface VisibilityValidationResult {
  valid: boolean;
  issues: VisibilityValidationIssue[];
  document?: VisibilityRulesDocument;
}

export type VisibilityResolvedStatus = "visible" | "hidden" | "disabled" | "unavailable";

export interface VisibilityPageState {
  pageId: string;
  /** Canonical rendering state; booleans below are stable projections for consumers. */
  status: VisibilityResolvedStatus;
  visible: boolean;
  enabled: boolean;
  hidden: boolean;
  disabled: boolean;
  unavailable: boolean;
  message?: string;
  fallbackPageId?: string;
  fallbackMessage?: string;
  alternativeRegion?: { pageId: string; regionId: string; message?: string };
  reasons: VisibilityRuleReason[];
}

export interface VisibilityRegionState {
  pageId: string;
  regionId: string;
  /** Canonical rendering state; booleans below are stable projections for consumers. */
  status: VisibilityResolvedStatus;
  visible: boolean;
  enabled: boolean;
  hidden: boolean;
  disabled: boolean;
  unavailable: boolean;
  message?: string;
  fallbackPageId?: string;
  fallbackMessage?: string;
  alternativeRegion?: { pageId: string; regionId: string; message?: string };
  reasons: VisibilityRuleReason[];
}

export interface VisibilityRuleReason {
  ruleId: string;
  fieldKey: string;
  fieldKeys?: string[];
  effect: VisibilityRuleEffect;
  strategy?: VisibilityRuleStrategy["kind"];
}

export interface VisibilityRuntimeContext {
  /** Roles must come from the server/session authority, never from page config. */
  roles?: Iterable<string>;
}

export interface VisibilityResolution {
  valid: boolean;
  pages: Record<string, VisibilityPageState>;
  regions: Record<string, VisibilityRegionState>;
  issues: VisibilityValidationIssue[];
  values: Record<string, unknown>;
}

export interface AllowedVisibilitySessionOverrides {
  /** Values already filtered by the caller's resource-field policy. */
  values?: Readonly<Record<string, unknown>>;
  /** Optional allow-list; omitted means every supplied value is accepted. */
  fieldKeys?: Iterable<string>;
  /** Viewer sessions may recompute only explicitly declared regions. */
  allowPageTargets?: boolean;
}

const SCALAR_TYPES = new Set(["string", "number", "boolean"]);
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_TEXT_LENGTH = 240;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is VisibilityScalar {
  return value === null || (SCALAR_TYPES.has(typeof value) && (typeof value !== "number" || Number.isFinite(value)));
}

function parseJsonObject(value: string | Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return isRecord(value) ? value : undefined;
}

function schemaProperties(value: string | Record<string, unknown> | undefined): Set<string> | undefined {
  const parsed = parseJsonObject(value);
  if (parsed === undefined) return undefined;
  const properties = parsed.properties;
  if (!isRecord(properties)) return new Set();
  return new Set(Object.keys(properties));
}

function schemaField(
  value: string | Record<string, unknown> | undefined,
  fieldKey: string,
): Record<string, unknown> | undefined {
  const parsed = parseJsonObject(value);
  if (!parsed || !isRecord(parsed.properties) || !isRecord(parsed.properties[fieldKey])) return undefined;
  return parsed.properties[fieldKey];
}

function schemaDefaults(value: string | Record<string, unknown> | undefined): Record<string, unknown> {
  const parsed = parseJsonObject(value);
  if (!parsed || !isRecord(parsed.properties)) return {};
  const defaults: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(parsed.properties)) {
    if (isRecord(field) && "default" in field) defaults[key] = field.default;
  }
  return defaults;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function normalizeSource(input: unknown): VisibilityRuleSource | undefined {
  if (!isRecord(input) || !hasOnlyKeys(input, ["scope", "fieldKey"]) || input.scope !== "project" || typeof input.fieldKey !== "string") return undefined;
  return { scope: "project", fieldKey: input.fieldKey };
}

function normalizeLeafCondition(input: unknown): VisibilityLeafCondition | undefined {
  if (!isRecord(input)) return undefined;
  if (input.kind === "truthy" && hasOnlyKeys(input, ["kind"])) return { kind: "truthy" };
  if (input.kind === "equals" && hasOnlyKeys(input, ["kind", "value"]) && isScalar(input.value)) {
    return { kind: "equals", value: input.value };
  }
  if (
    input.kind === "oneOf" &&
    hasOnlyKeys(input, ["kind", "values"]) &&
    Array.isArray(input.values) &&
    input.values.length > 0 &&
    input.values.length <= 64 &&
    input.values.every(isScalar)
  ) {
    return { kind: "oneOf", values: [...input.values] };
  }
  return undefined;
}

function normalizeCondition(input: unknown): VisibilityRuleCondition | undefined {
  const leaf = normalizeLeafCondition(input);
  if (leaf) return leaf;
  if (!isRecord(input) || (input.kind !== "all" && input.kind !== "any") || !hasOnlyKeys(input, ["kind", "conditions"])) return undefined;
  if (!Array.isArray(input.conditions) || input.conditions.length === 0 || input.conditions.length > 16) return undefined;
  const conditions: VisibilityRulePredicate[] = [];
  for (const candidate of input.conditions) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["source", "condition"])) return undefined;
    const source = normalizeSource(candidate.source);
    const condition = normalizeLeafCondition(candidate.condition);
    if (!source || !condition) return undefined;
    conditions.push({ source, condition });
  }
  return { kind: input.kind, conditions };
}

function normalizeTarget(input: unknown): VisibilityRuleTarget | undefined {
  if (!isRecord(input) || typeof input.pageId !== "string") return undefined;
  if (input.type === "page" && hasOnlyKeys(input, ["type", "pageId"])) return { type: "page", pageId: input.pageId };
  if (input.type === "region" && hasOnlyKeys(input, ["type", "pageId", "regionId"]) && typeof input.regionId === "string") return { type: "region", pageId: input.pageId, regionId: input.regionId };
  return undefined;
}

function normalizeStrategy(input: unknown): VisibilityRuleStrategy | undefined {
  if (!isRecord(input) || typeof input.kind !== "string") return undefined;
  if (input.kind === "unavailable" && hasOnlyKeys(input, ["kind", "message"]) && (input.message === undefined || typeof input.message === "string")) {
    return { kind: "unavailable", ...(typeof input.message === "string" ? { message: input.message } : {}) };
  }
  if (
    input.kind === "fallback-page" &&
    hasOnlyKeys(input, ["kind", "pageId", "message"]) &&
    typeof input.pageId === "string" &&
    (input.message === undefined || typeof input.message === "string")
  ) {
    return { kind: "fallback-page", pageId: input.pageId, ...(typeof input.message === "string" ? { message: input.message } : {}) };
  }
  if (
    input.kind === "alternative-region" &&
    hasOnlyKeys(input, ["kind", "pageId", "regionId", "message"]) &&
    typeof input.pageId === "string" &&
    typeof input.regionId === "string" &&
    (input.message === undefined || typeof input.message === "string")
  ) {
    return {
      kind: "alternative-region",
      pageId: input.pageId,
      regionId: input.regionId,
      ...(typeof input.message === "string" ? { message: input.message } : {}),
    };
  }
  return undefined;
}

function normalizeDocument(input: unknown): VisibilityRulesDocument | undefined {
  if (!isRecord(input) || input.version !== VISIBILITY_RULES_VERSION || !Array.isArray(input.rules)) return undefined;
  if (!hasOnlyKeys(input, ["version", "rules", "generatedBy", "generatedAt", "mutationId"])) return undefined;
  if (![input.generatedBy, input.generatedAt, input.mutationId].every((value) => value === undefined || typeof value === "string")) return undefined;
  const rules: VisibilityRule[] = [];
  for (const candidate of input.rules) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["id", "source", "condition", "target", "effect", "context", "strategy"])) return undefined;
    const condition = normalizeCondition(candidate.condition);
    const source = condition?.kind === "all" || condition?.kind === "any"
      ? candidate.source === undefined ? undefined : null
      : normalizeSource(candidate.source);
    const target = normalizeTarget(candidate.target);
    const context = isRecord(candidate.context) && hasOnlyKeys(candidate.context, ["kind", "value"]) && candidate.context.kind === "role" && typeof candidate.context.value === "string"
      ? { kind: "role", value: candidate.context.value } as VisibilityRuleContext
      : candidate.context === undefined ? undefined : null;
    const strategy = candidate.strategy === undefined ? undefined : normalizeStrategy(candidate.strategy);
    if (
      typeof candidate.id !== "string" ||
      !condition ||
      (condition.kind !== "all" && condition.kind !== "any" && !source) ||
      source === null ||
      !target ||
      (candidate.effect !== "hidden" && candidate.effect !== "disabled" && candidate.effect !== "unavailable") ||
      context === null ||
      (context && (context.value.length === 0 || context.value.length > MAX_TEXT_LENGTH)) ||
      (candidate.strategy !== undefined && !strategy)
    ) return undefined;
    const base = {
      id: candidate.id,
      target,
      effect: candidate.effect as VisibilityRuleEffect,
      ...(context ? { context } : {}),
      ...(strategy ? { strategy } : {}),
    };
    if (condition.kind === "all" || condition.kind === "any") {
      rules.push({ ...base, condition });
    } else if (source) {
      const leafCondition = normalizeLeafCondition(condition);
      if (leafCondition) rules.push({ ...base, source, condition: leafCondition });
    }
  }
  return {
    version: VISIBILITY_RULES_VERSION,
    rules,
    ...(typeof input.generatedBy === "string" ? { generatedBy: input.generatedBy } : {}),
    ...(typeof input.generatedAt === "string" ? { generatedAt: input.generatedAt } : {}),
    ...(typeof input.mutationId === "string" ? { mutationId: input.mutationId } : {}),
  };
}

export function parseVisibilityRules(input: string | unknown): VisibilityRulesDocument | undefined {
  if (typeof input === "string") {
    try {
      return normalizeDocument(JSON.parse(input) as unknown);
    } catch {
      return undefined;
    }
  }
  return normalizeDocument(input);
}

function targetKey(target: VisibilityRuleTarget): string {
  return target.type === "page" ? `page:${target.pageId}` : `region:${target.pageId}:${target.regionId}`;
}

function addIssue(issues: VisibilityValidationIssue[], issue: VisibilityValidationIssue): void {
  issues.push(issue);
}

function sourceList(rule: VisibilityRule): VisibilityRuleSource[] {
  if (rule.condition.kind === "all" || rule.condition.kind === "any") return rule.condition.conditions.map((predicate) => predicate.source);
  return rule.source ? [rule.source] : [];
}

function fieldTypeMatches(field: Record<string, unknown> | undefined, value: VisibilityScalar): boolean {
  if (!field) return true;
  if (Array.isArray(field.enum) && !field.enum.some((candidate) => Object.is(candidate, value))) return false;
  if ("const" in field && !Object.is(field.const, value)) return false;
  const declared = Array.isArray(field.type) ? field.type : typeof field.type === "string" ? [field.type] : [];
  if (declared.length === 0 || (value === null && declared.includes("null"))) return true;
  const actual = value === null ? "null" : typeof value;
  return declared.includes(actual) || (actual === "number" && declared.includes("integer") && Number.isInteger(value));
}

function validateSource(
  source: unknown,
  ruleId: string | undefined,
  projectKeys: Set<string> | undefined,
  projectSchema: string | Record<string, unknown> | undefined,
  issues: VisibilityValidationIssue[],
): source is VisibilityRuleSource {
  if (!isRecord(source) || !hasOnlyKeys(source, ["scope", "fieldKey"])) {
    addIssue(issues, { code: "SOURCE_FIELDS_INVALID", message: "联动来源只能包含 scope 和 fieldKey", ruleId });
    return false;
  }
  if (source.scope !== "project") addIssue(issues, { code: "SOURCE_SCOPE_UNSUPPORTED", message: "联动来源只能是项目级配置", ruleId });
  if (typeof source.fieldKey !== "string" || !KEY_RE.test(source.fieldKey)) {
    addIssue(issues, { code: "SOURCE_KEY_INVALID", message: "联动来源 fieldKey 无效", ruleId });
    return false;
  }
  if (!projectKeys?.has(source.fieldKey)) {
    addIssue(issues, {
      code: projectKeys === undefined ? "SOURCE_KEY_MISSING" : "SOURCE_KEY_INVALID",
      message: projectKeys === undefined ? `无法验证项目级配置 key「${source.fieldKey}」` : `项目级配置不存在 key「${source.fieldKey}」`,
      ruleId,
      fieldKey: source.fieldKey,
    });
  }
  return source.scope === "project";
}

function validateLeafCondition(
  condition: unknown,
  source: VisibilityRuleSource | undefined,
  projectSchema: string | Record<string, unknown> | undefined,
  ruleId: string | undefined,
  issues: VisibilityValidationIssue[],
): boolean {
  if (!isRecord(condition)) {
    addIssue(issues, { code: "CONDITION_INVALID", message: "条件必须是对象", ruleId });
    return false;
  }
  const leaf = normalizeLeafCondition(condition);
  if (!leaf) {
    if (condition.kind === "equals" || condition.kind === "oneOf") addIssue(issues, { code: "CONDITION_VALUE_INVALID", message: "条件值只能使用有限数字、字符串、布尔值或 null", ruleId });
    else if (!hasOnlyKeys(condition, ["kind", "value", "values"])) addIssue(issues, { code: "CONDITION_FIELDS_INVALID", message: "条件包含未允许的字段", ruleId });
    else addIssue(issues, { code: "CONDITION_INVALID", message: "条件只支持 truthy、equals 或 oneOf", ruleId });
    return false;
  }
  if (leaf.kind === "truthy") return true;
  const values = leaf.kind === "equals" ? [leaf.value] : leaf.values;
  const field = source ? schemaField(projectSchema, source.fieldKey) : undefined;
  if (field && values.some((value) => !fieldTypeMatches(field, value))) {
    addIssue(issues, { code: "CONDITION_TYPE_MISMATCH", message: `条件值与配置 key「${source?.fieldKey ?? ""}」声明类型不匹配`, ruleId, fieldKey: source?.fieldKey });
    return false;
  }
  return true;
}

function validateTarget(
  target: unknown,
  pageSet: Set<string>,
  regionSets: Map<string, Set<string>>,
  ruleId: string | undefined,
  issues: VisibilityValidationIssue[],
): target is VisibilityRuleTarget {
  if (!isRecord(target) || !hasOnlyKeys(target, ["type", "pageId", "regionId"])) {
    addIssue(issues, { code: "TARGET_FIELDS_INVALID", message: "目标只能包含 type、pageId 和 regionId", ruleId });
    return false;
  }
  const targetType = target.type;
  const pageId = target.pageId;
  if ((targetType !== "page" && targetType !== "region") || typeof pageId !== "string" || pageId.length === 0) {
    addIssue(issues, { code: "TARGET_INVALID", message: "目标必须是 pageId 或显式 regionId", ruleId });
    return false;
  }
  if (!pageSet.has(pageId)) {
    addIssue(issues, { code: "TARGET_PAGE_MISSING", message: `目标页面「${pageId}」不存在`, ruleId, pageId });
    return false;
  }
  if (targetType === "region") {
    const regions = regionSets.get(pageId);
    if (typeof target.regionId !== "string" || target.regionId.length === 0 || !regions || !regions.has(target.regionId)) {
      addIssue(issues, { code: "TARGET_REGION_MISSING", message: `页面「${pageId}」未声明区域「${String(target.regionId ?? "")}」`, ruleId, pageId, regionId: typeof target.regionId === "string" ? target.regionId : undefined });
      return false;
    }
  }
  return true;
}

function validateStrategy(
  strategy: unknown,
  target: VisibilityRuleTarget | undefined,
  pageSet: Set<string>,
  regionSets: Map<string, Set<string>>,
  ruleId: string | undefined,
  issues: VisibilityValidationIssue[],
): strategy is VisibilityRuleStrategy | undefined {
  if (strategy === undefined) return true;
  const normalized = normalizeStrategy(strategy);
  if (!normalized) {
    addIssue(issues, { code: "STRATEGY_FIELDS_INVALID", message: "策略只能是 unavailable、fallback-page 或 alternative-region", ruleId });
    return false;
  }
  if ("message" in normalized && normalized.message && normalized.message.length > MAX_TEXT_LENGTH) {
    addIssue(issues, { code: "STRATEGY_INVALID", message: "策略提示语过长", ruleId });
    return false;
  }
  if (normalized.kind === "unavailable") return true;
  if (normalized.kind === "fallback-page") {
    if (target?.type !== "page") {
      addIssue(issues, { code: "STRATEGY_TARGET_INVALID", message: "fallback-page 只能用于页面目标", ruleId });
      return false;
    }
    if (!pageSet.has(normalized.pageId) || (target?.type === "page" && target.pageId === normalized.pageId)) {
      addIssue(issues, { code: "STRATEGY_TARGET_MISSING", message: `备用页面「${normalized.pageId}」不存在或不能指向当前页面`, ruleId, pageId: normalized.pageId });
      return false;
    }
    return true;
  }
  if (target?.type !== "region" || target.pageId !== normalized.pageId) {
    addIssue(issues, { code: "STRATEGY_TARGET_INVALID", message: "alternative-region 只能指向同一页面内的替代区域", ruleId, pageId: normalized.pageId, regionId: normalized.regionId });
    return false;
  }
  const regions = regionSets.get(normalized.pageId);
  if (!pageSet.has(normalized.pageId) || !regions?.has(normalized.regionId) || (target?.type === "region" && target.pageId === normalized.pageId && target.regionId === normalized.regionId)) {
    addIssue(issues, { code: "STRATEGY_TARGET_MISSING", message: `替代区域「${normalized.pageId}:${normalized.regionId}」不存在或不能指向当前区域`, ruleId, pageId: normalized.pageId, regionId: normalized.regionId });
    return false;
  }
  return true;
}

function validateStrategyGraph(rules: unknown[], issues: VisibilityValidationIssue[]): void {
  const fallbackEdges = new Map<string, Array<{ target: string; ruleId?: string }>>();
  const normalTargets = new Set<string>();
  const alternativeTargets: Array<{ key: string; ruleId?: string; pageId: string; regionId: string }> = [];

  for (const candidate of rules) {
    if (!isRecord(candidate)) continue;
    const target = normalizeTarget(candidate.target);
    const strategy = normalizeStrategy(candidate.strategy);
    const ruleId = typeof candidate.id === "string" ? candidate.id : undefined;
    if (target) normalTargets.add(targetKey(target));
    if (target?.type === "page" && strategy?.kind === "fallback-page") {
      const edges = fallbackEdges.get(target.pageId) ?? [];
      edges.push({ target: strategy.pageId, ruleId });
      fallbackEdges.set(target.pageId, edges);
    }
    if (strategy?.kind === "alternative-region") {
      alternativeTargets.push({
        key: targetKey({ type: "region", pageId: strategy.pageId, regionId: strategy.regionId }),
        ruleId,
        pageId: strategy.pageId,
        regionId: strategy.regionId,
      });
    }
  }

  for (const alternative of alternativeTargets) {
    if (!normalTargets.has(alternative.key)) continue;
    addIssue(issues, {
      code: "STRATEGY_TARGET_CONFLICT",
      message: `替代区域「${alternative.pageId}:${alternative.regionId}」不能同时作为普通规则目标`,
      ruleId: alternative.ruleId,
      pageId: alternative.pageId,
      regionId: alternative.regionId,
    });
  }

  const visit = (pageId: string, visiting: Set<string>, visited: Set<string>): void => {
    if (visited.has(pageId)) return;
    if (visiting.has(pageId)) {
      addIssue(issues, { code: "STRATEGY_CYCLE", message: `备用页策略存在循环，涉及页面「${pageId}」`, pageId });
      return;
    }
    visiting.add(pageId);
    for (const edge of fallbackEdges.get(pageId) ?? []) visit(edge.target, visiting, visited);
    visiting.delete(pageId);
    visited.add(pageId);
  };
  const visited = new Set<string>();
  for (const start of fallbackEdges.keys()) visit(start, new Set(), visited);
}

/**
 * Validate a rule document against the current page tree and project schema.
 * Validation is fail-closed and rejects fields outside this protocol's
 * whitelist, so creator/session/admin data cannot leak into published rules.
 */
export function validateVisibilityRules(input: string | unknown, context: VisibilityValidationContext): VisibilityValidationResult {
  const issues: VisibilityValidationIssue[] = [];
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input) as unknown;
    } catch {
      addIssue(issues, { code: "DOCUMENT_INVALID", message: "project.visibility-rules.json 不是有效 JSON" });
      return { valid: false, issues };
    }
  }
  if (!isRecord(raw)) {
    addIssue(issues, { code: "DOCUMENT_INVALID", message: "联动规则必须是 JSON 对象" });
    return { valid: false, issues };
  }
  if (!hasOnlyKeys(raw, ["version", "rules", "generatedBy", "generatedAt", "mutationId"])) addIssue(issues, { code: "DOCUMENT_FIELDS_INVALID", message: "规则文档包含未允许的顶层字段" });
  if (raw.version !== VISIBILITY_RULES_VERSION) addIssue(issues, { code: "VERSION_UNSUPPORTED", message: `联动规则版本必须为 ${VISIBILITY_RULES_VERSION}` });
  if (!Array.isArray(raw.rules)) {
    addIssue(issues, { code: "RULES_INVALID", message: "联动规则 rules 必须是数组" });
    return { valid: false, issues };
  }

  const pageSet = new Set(context.pageIds);
  const regionSets = new Map(Object.entries(context.regionIds ?? {}).map(([pageId, ids]) => [pageId, new Set(ids)] as const));
  const projectKeys = schemaProperties(context.projectSchema);
  if (projectKeys && context.pageSchemas) {
    for (const [pageId, pageSchema] of Object.entries(context.pageSchemas)) {
      const pageKeys = schemaProperties(pageSchema);
      if (!pageKeys) continue;
      for (const fieldKey of pageKeys) if (projectKeys.has(fieldKey)) addIssue(issues, { code: "PAGE_CONFIG_SCOPE_CONFLICT", message: `项目级配置 key「${fieldKey}」与页面「${pageId}」配置 key 重名`, pageId, fieldKey });
    }
  }
  const seenIds = new Set<string>();
  const seenTargets = new Set<string>();
  for (const candidate of raw.rules) {
    if (!isRecord(candidate)) {
      addIssue(issues, { code: "RULES_INVALID", message: "联动规则条目必须是对象" });
      continue;
    }
    const ruleId = typeof candidate.id === "string" ? candidate.id : undefined;
    if (!hasOnlyKeys(candidate, ["id", "source", "condition", "target", "effect", "context", "strategy"])) addIssue(issues, { code: "RULE_FIELDS_INVALID", message: "联动规则包含未允许的字段", ruleId });
    if (!ruleId || ruleId.trim().length === 0 || ruleId.length > MAX_TEXT_LENGTH) addIssue(issues, { code: "RULE_ID_INVALID", message: "联动规则 id 不能为空且长度必须合理", ruleId });
    else if (seenIds.has(ruleId)) addIssue(issues, { code: "RULE_ID_DUPLICATE", message: `联动规则 id「${ruleId}」重复`, ruleId });
    else seenIds.add(ruleId);

    const condition = isRecord(candidate.condition) ? candidate.condition : undefined;
    if (condition?.kind === "all" || condition?.kind === "any") {
      if (candidate.source !== undefined) addIssue(issues, { code: "SOURCE_FIELDS_INVALID", message: "组合条件的来源必须只声明在 predicates 中，不能重复提供顶层 source", ruleId });
      if (!hasOnlyKeys(condition, ["kind", "conditions"]) || !Array.isArray(condition.conditions) || condition.conditions.length === 0 || condition.conditions.length > 16) addIssue(issues, { code: "CONDITION_INVALID", message: "all/any 条件必须包含 1-16 个 predicates", ruleId });
      else {
        for (const predicate of condition.conditions) {
          if (!isRecord(predicate) || !hasOnlyKeys(predicate, ["source", "condition"])) {
            addIssue(issues, { code: "CONDITION_FIELDS_INVALID", message: "组合条件 predicate 字段不受支持", ruleId });
            continue;
          }
          const predicateSource = validateSource(predicate.source, ruleId, projectKeys, context.projectSchema, issues) ? predicate.source as VisibilityRuleSource : undefined;
          validateLeafCondition(predicate.condition, predicateSource, context.projectSchema, ruleId, issues);
        }
      }
    } else {
      const source = isRecord(candidate.source) ? candidate.source : undefined;
      const primarySource = validateSource(source, ruleId, projectKeys, context.projectSchema, issues) ? source as VisibilityRuleSource : undefined;
      validateLeafCondition(condition, primarySource, context.projectSchema, ruleId, issues);
    }

    const target = validateTarget(candidate.target, pageSet, regionSets, ruleId, issues) ? candidate.target as VisibilityRuleTarget : undefined;
    if (candidate.effect !== "hidden" && candidate.effect !== "disabled" && candidate.effect !== "unavailable") addIssue(issues, { code: "TARGET_INVALID", message: "目标效果只支持 hidden、disabled 或 unavailable", ruleId });
    if (candidate.context !== undefined) {
      if (!isRecord(candidate.context) || !hasOnlyKeys(candidate.context, ["kind", "value"]) || candidate.context.kind !== "role" || typeof candidate.context.value !== "string" || candidate.context.value.length === 0 || candidate.context.value.length > MAX_TEXT_LENGTH) addIssue(issues, { code: "CONDITION_CONTEXT_INVALID", message: "公开规则的运行时上下文只能声明由服务端提供的 role 条件", ruleId });
    }
    validateStrategy(candidate.strategy, target, pageSet, regionSets, ruleId, issues);
    const strategy = normalizeStrategy(candidate.strategy);
    if (strategy?.kind === "unavailable" && candidate.effect !== "unavailable") {
      addIssue(issues, { code: "STRATEGY_TARGET_INVALID", message: "unavailable 提示策略只能与 unavailable 效果组合", ruleId });
    }

    if (target && (candidate.effect === "hidden" || candidate.effect === "disabled" || candidate.effect === "unavailable")) {
      // Context-specific rules may intentionally target the same page with
      // the same effect. Only an identical rule is redundant; do not reject
      // independent role variants as a false conflict.
      const key = `${targetKey(target)}:${candidate.effect}:${JSON.stringify(candidate.condition)}:${JSON.stringify(candidate.context ?? null)}`;
      if (seenTargets.has(key)) addIssue(issues, { code: "CONFLICTING_RULES", message: `同一目标的 ${candidate.effect} 联动规则重复，无法确定唯一结果`, ruleId });
      else seenTargets.add(key);
    }
  }

  validateStrategyGraph(raw.rules, issues);

  const document = normalizeDocument(raw);
  return { valid: issues.length === 0 && document !== undefined, issues, document };
}

function readOverrides(overrides?: AllowedVisibilitySessionOverrides | Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!overrides) return {};
  const isScoped = isRecord(overrides) && ("values" in overrides || "fieldKeys" in overrides || "allowPageTargets" in overrides);
  const scopedOverrides = isScoped ? overrides as AllowedVisibilitySessionOverrides : undefined;
  const candidate = scopedOverrides ? scopedOverrides.values ?? {} : overrides;
  const allow = scopedOverrides?.fieldKeys ? new Set<string>(Array.from(scopedOverrides.fieldKeys).filter((key): key is string => typeof key === "string")) : undefined;
  return Object.fromEntries(Object.entries(candidate).filter(([key]) => !allow || allow.has(key)));
}

function matchRuleCondition(getValue: (source: VisibilityRuleSource) => unknown, rule: VisibilityRule): boolean {
  if (rule.condition.kind === "all" || rule.condition.kind === "any") {
    const matches = rule.condition.conditions.map((predicate) => {
      const value = getValue(predicate.source);
      if (predicate.condition.kind === "truthy") return Boolean(value);
      if (predicate.condition.kind === "equals") return Object.is(value, predicate.condition.value);
      return predicate.condition.values.some((candidate) => Object.is(value, candidate));
    });
    return rule.condition.kind === "all" ? matches.every(Boolean) : matches.some(Boolean);
  }
  if (!rule.source) return false;
  const value = getValue(rule.source);
  if (rule.condition.kind === "truthy") return Boolean(value);
  if (rule.condition.kind === "equals") return Object.is(value, rule.condition.value);
  if (rule.condition.kind === "oneOf") return rule.condition.values.some((candidate) => Object.is(value, candidate));
  return false;
}

function matchesContext(context: VisibilityRuleContext | undefined, runtime: VisibilityRuntimeContext | undefined): boolean {
  if (!context) return true;
  if (!runtime) return false;
  return new Set(runtime.roles ?? []).has(context.value);
}

function initialPage(pageId: string): VisibilityPageState {
  return { pageId, status: "visible", visible: true, enabled: true, hidden: false, disabled: false, unavailable: false, reasons: [] };
}

function initialRegion(pageId: string, regionId: string): VisibilityRegionState {
  return { pageId, regionId, status: "visible", visible: true, enabled: true, hidden: false, disabled: false, unavailable: false, reasons: [] };
}

function setResolvedStatus(
  state: VisibilityPageState | VisibilityRegionState,
  status: VisibilityResolvedStatus,
  force = false,
): void {
  const rank: Record<VisibilityResolvedStatus, number> = {
    visible: 0,
    disabled: 1,
    unavailable: 2,
    hidden: 3,
  };
  if (!force && rank[status] < rank[state.status]) return;
  state.status = status;
  state.visible = status !== "hidden";
  state.enabled = status === "visible" || status === "hidden";
  state.hidden = status === "hidden";
  state.disabled = status === "disabled" || status === "unavailable";
  state.unavailable = status === "unavailable";
}

/** Resolve a validated rule document using published values and safe session/context inputs. */
export function resolveVisibility(
  snapshot: {
    rules: VisibilityRulesDocument | string | unknown;
    projectConfigValues?: Readonly<Record<string, unknown>>;
    projectConfigDefaults?: Readonly<Record<string, unknown>>;
    pageIds: Iterable<string>;
    regionIds?: Readonly<Record<string, Iterable<string>>>;
    projectSchema?: string | Record<string, unknown>;
    pageSchemas?: Readonly<Record<string, string | Record<string, unknown>>>;
  },
  allowedSessionOverrides?: AllowedVisibilitySessionOverrides | Readonly<Record<string, unknown>>,
  runtimeContext?: VisibilityRuntimeContext,
): VisibilityResolution {
  const pageIds = Array.from(snapshot.pageIds);
  const regionIds = Object.fromEntries(Object.entries(snapshot.regionIds ?? {}).map(([pageId, ids]) => [pageId, Array.from(ids)]));
  const validation = validateVisibilityRules(snapshot.rules ?? { version: VISIBILITY_RULES_VERSION, rules: [] }, {
    pageIds,
    regionIds,
    projectSchema: snapshot.projectSchema,
    pageSchemas: snapshot.pageSchemas,
  });
  const pages: Record<string, VisibilityPageState> = {};
  for (const pageId of pageIds) pages[pageId] = initialPage(pageId);
  const regions: Record<string, VisibilityRegionState> = {};
  for (const [pageId, ids] of Object.entries(regionIds)) for (const regionId of ids) regions[`${pageId}:${regionId}`] = initialRegion(pageId, regionId);
  const sessionOverrides = readOverrides(allowedSessionOverrides);
  const values = { ...schemaDefaults(snapshot.projectSchema), ...(snapshot.projectConfigDefaults ?? {}), ...(snapshot.projectConfigValues ?? {}), ...sessionOverrides };
  const publishedValues = { ...schemaDefaults(snapshot.projectSchema), ...(snapshot.projectConfigDefaults ?? {}), ...(snapshot.projectConfigValues ?? {}) };
  const sessionOverrideKeys = new Set(Object.keys(sessionOverrides));
  const allowPageTargets = !isRecord(allowedSessionOverrides) || !Object.prototype.hasOwnProperty.call(allowedSessionOverrides, "allowPageTargets") || allowedSessionOverrides.allowPageTargets !== false;
  if (!validation.valid || !validation.document) return { valid: false, pages, regions, issues: validation.issues, values };

  const alternativeRegionKeys = new Set(
    validation.document.rules.flatMap((rule) => rule.strategy?.kind === "alternative-region"
      ? [`${rule.strategy.pageId}:${rule.strategy.regionId}`]
      : []),
  );
  for (const key of alternativeRegionKeys) {
    const alternative = regions[key];
    if (!alternative) continue;
    setResolvedStatus(alternative, "hidden");
  }

  for (const rule of validation.document.rules) {
    if (!matchesContext(rule.context, runtimeContext)) continue;
    const getValue = (source: VisibilityRuleSource) => !allowPageTargets && rule.target.type === "page" && sessionOverrideKeys.has(source.fieldKey) ? publishedValues[source.fieldKey] : values[source.fieldKey];
    if (!matchRuleCondition(getValue, rule)) continue;
    const state = rule.target.type === "page" ? pages[rule.target.pageId] : regions[`${rule.target.pageId}:${rule.target.regionId}`];
    if (!state) continue;
    const fieldKeys = [...new Set(sourceList(rule).map((source) => source.fieldKey))];
    const reason: VisibilityRuleReason = { ruleId: rule.id, fieldKey: fieldKeys[0] ?? "unknown", ...(fieldKeys.length > 1 ? { fieldKeys } : {}), effect: rule.effect, ...(rule.strategy ? { strategy: rule.strategy.kind } : {}) };
    state.reasons.push(reason);
    setResolvedStatus(state, rule.effect);
    if (rule.strategy?.kind === "fallback-page") {
      state.fallbackPageId = rule.strategy.pageId;
      state.fallbackMessage = rule.strategy.message;
    } else if (rule.strategy?.kind === "alternative-region") {
      state.alternativeRegion = { pageId: rule.strategy.pageId, regionId: rule.strategy.regionId, ...(rule.strategy.message ? { message: rule.strategy.message } : {}) };
      const alternative = regions[`${rule.strategy.pageId}:${rule.strategy.regionId}`];
      if (alternative) {
        setResolvedStatus(alternative, "visible", true);
      }
    }
    if (rule.strategy?.message) state.message = rule.strategy.message;
  }
  return { valid: true, pages, regions, issues: [], values };
}

export function visibilityRulesToJson(document: VisibilityRulesDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
