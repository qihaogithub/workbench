/**
 * Configuration-driven page visibility protocol.
 *
 * The protocol is intentionally small and declarative.  It is shared by the
 * author preview, publish validation and the viewer so each surface resolves
 * the same published facts.  It must never be treated as an authorization
 * primitive: API permissions remain enforced by the server independently.
 */

export const VISIBILITY_RULES_VERSION = 1 as const;

export type VisibilityRuleEffect = "hidden" | "disabled";

export type VisibilityScalar = string | number | boolean | null;

export type VisibilityRuleCondition =
  | { kind: "truthy" }
  | { kind: "equals"; value: VisibilityScalar };

export type VisibilityRuleTarget =
  | { type: "page"; pageId: string }
  | { type: "region"; pageId: string; regionId: string };

export interface VisibilityRuleSource {
  /** Stage one only permits project-level configuration sources. */
  scope: "project";
  fieldKey: string;
}

export interface VisibilityRule {
  id: string;
  source: VisibilityRuleSource;
  condition: VisibilityRuleCondition;
  target: VisibilityRuleTarget;
  effect: VisibilityRuleEffect;
}

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
    | "VERSION_UNSUPPORTED"
    | "RULES_INVALID"
    | "RULE_ID_INVALID"
    | "RULE_ID_DUPLICATE"
    | "SOURCE_SCOPE_UNSUPPORTED"
    | "SOURCE_KEY_INVALID"
    | "SOURCE_KEY_MISSING"
    | "CONDITION_INVALID"
    | "CONDITION_VALUE_INVALID"
    | "TARGET_INVALID"
    | "TARGET_PAGE_MISSING"
    | "TARGET_REGION_MISSING"
    | "TARGET_SCOPE_INVALID"
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
  /** Project schema, used to verify that each source field exists. */
  projectSchema?: string | Record<string, unknown>;
  /** Optional page schemas used to reject project/page key collisions. */
  pageSchemas?: Readonly<Record<string, string | Record<string, unknown>>>;
}

export interface VisibilityValidationResult {
  valid: boolean;
  issues: VisibilityValidationIssue[];
  document?: VisibilityRulesDocument;
}

export interface VisibilityPageState {
  pageId: string;
  visible: boolean;
  enabled: boolean;
  hidden: boolean;
  disabled: boolean;
  reasons: VisibilityRuleReason[];
}

export interface VisibilityRegionState {
  pageId: string;
  regionId: string;
  visible: boolean;
  enabled: boolean;
  hidden: boolean;
  disabled: boolean;
  reasons: VisibilityRuleReason[];
}

export interface VisibilityRuleReason {
  ruleId: string;
  fieldKey: string;
  effect: VisibilityRuleEffect;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is VisibilityScalar {
  return value === null || SCALAR_TYPES.has(typeof value);
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

function schemaDefaults(value: string | Record<string, unknown> | undefined): Record<string, unknown> {
  const parsed = parseJsonObject(value);
  if (!parsed || !isRecord(parsed.properties)) return {};
  const defaults: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(parsed.properties)) {
    if (isRecord(field) && "default" in field) defaults[key] = field.default;
  }
  return defaults;
}

function normalizeDocument(input: unknown): VisibilityRulesDocument | undefined {
  if (!isRecord(input)) return undefined;
  if (input.version !== VISIBILITY_RULES_VERSION || !Array.isArray(input.rules)) return undefined;
  for (const candidate of input.rules) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !isRecord(candidate.source)
      || candidate.source.scope !== "project" || typeof candidate.source.fieldKey !== "string"
      || !isRecord(candidate.condition) || (candidate.condition.kind !== "truthy" && candidate.condition.kind !== "equals")
      || (candidate.condition.kind === "equals" && !isScalar(candidate.condition.value))
      || !isRecord(candidate.target) || (candidate.target.type !== "page" && candidate.target.type !== "region")
      || typeof candidate.target.pageId !== "string"
      || (candidate.target.type === "region" && typeof candidate.target.regionId !== "string")
      || (candidate.effect !== "hidden" && candidate.effect !== "disabled")) {
      return undefined;
    }
  }
  return {
    version: VISIBILITY_RULES_VERSION,
    rules: input.rules as VisibilityRule[],
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
  return target.type === "page"
    ? `page:${target.pageId}`
    : `region:${target.pageId}:${target.regionId}`;
}

function addIssue(
  issues: VisibilityValidationIssue[],
  issue: VisibilityValidationIssue,
): void {
  issues.push(issue);
}

/**
 * Validate a rule document against the current page tree and project schema.
 * Validation is fail-closed: when a schema is supplied, a missing source key
 * is an error; when no schema exists, rules cannot be proven safe and are also
 * rejected.
 */
export function validateVisibilityRules(
  input: string | unknown,
  context: VisibilityValidationContext,
): VisibilityValidationResult {
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
  if (raw.version !== VISIBILITY_RULES_VERSION) {
    addIssue(issues, { code: "VERSION_UNSUPPORTED", message: `联动规则版本必须为 ${VISIBILITY_RULES_VERSION}` });
  }
  if (!Array.isArray(raw.rules)) {
    addIssue(issues, { code: "RULES_INVALID", message: "联动规则 rules 必须是数组" });
    return { valid: false, issues };
  }

  const pageSet = new Set(context.pageIds);
  const regionSets = new Map(
    Object.entries(context.regionIds ?? {}).map(([pageId, ids]) => [pageId, new Set(ids)] as const),
  );
  const projectKeys = schemaProperties(context.projectSchema);
  if (projectKeys && context.pageSchemas) {
    for (const [pageId, pageSchema] of Object.entries(context.pageSchemas)) {
      const pageKeys = schemaProperties(pageSchema);
      if (!pageKeys) continue;
      for (const fieldKey of pageKeys) {
        if (projectKeys.has(fieldKey)) {
          addIssue(issues, {
            code: "PAGE_CONFIG_SCOPE_CONFLICT",
            message: `项目级配置 key「${fieldKey}」与页面「${pageId}」配置 key 重名`,
            pageId,
            fieldKey,
          });
        }
      }
    }
  }
  const seenIds = new Set<string>();
  const seenTargets = new Set<string>();
  for (const candidate of raw.rules) {
    if (!isRecord(candidate)) {
      addIssue(issues, { code: "RULES_INVALID", message: "联动规则条目必须是对象" });
      continue;
    }
    const rule = candidate as Partial<VisibilityRule>;
    const ruleId = typeof rule.id === "string" ? rule.id : undefined;
    if (!ruleId || ruleId.trim().length === 0) {
      addIssue(issues, { code: "RULE_ID_INVALID", message: "联动规则 id 不能为空" });
    } else if (seenIds.has(ruleId)) {
      addIssue(issues, { code: "RULE_ID_DUPLICATE", message: `联动规则 id「${ruleId}」重复`, ruleId });
    } else {
      seenIds.add(ruleId);
    }

    const source = isRecord(rule.source) ? rule.source : undefined;
    const scope = source?.scope;
    const fieldKey = source?.fieldKey;
    if (scope !== "project") {
      addIssue(issues, { code: "SOURCE_SCOPE_UNSUPPORTED", message: "阶段一联动来源只能是项目级配置", ruleId });
    }
    if (typeof fieldKey !== "string" || !KEY_RE.test(fieldKey)) {
      addIssue(issues, { code: "SOURCE_KEY_INVALID", message: "联动来源 fieldKey 无效", ruleId });
    } else if (!projectKeys?.has(fieldKey)) {
      addIssue(issues, {
        code: projectKeys === undefined ? "SOURCE_KEY_MISSING" : "SOURCE_KEY_INVALID",
        message: projectKeys === undefined ? `无法验证项目级配置 key「${fieldKey}」` : `项目级配置不存在 key「${fieldKey}」`,
        ruleId,
        fieldKey,
      });
    }

    const condition = isRecord(rule.condition) ? rule.condition : undefined;
    if (condition?.kind === "truthy") {
      // no extra value
    } else if (condition?.kind === "equals" && isScalar(condition.value) && (typeof condition.value !== "number" || Number.isFinite(condition.value))) {
      // valid scalar condition
    } else if (condition?.kind === "equals") {
      addIssue(issues, { code: "CONDITION_VALUE_INVALID", message: "equals 条件只能使用有限数字、字符串、布尔值或 null", ruleId });
    } else {
      addIssue(issues, { code: "CONDITION_INVALID", message: "条件只支持 truthy 或 equals", ruleId });
    }

    const target = isRecord(rule.target) ? rule.target : undefined;
    const targetType = target?.type;
    const pageId = target?.pageId;
    if ((targetType !== "page" && targetType !== "region") || typeof pageId !== "string" || pageId.length === 0) {
      addIssue(issues, { code: "TARGET_INVALID", message: "目标必须是 pageId 或显式 regionId", ruleId });
    } else if (!pageSet.has(pageId)) {
      addIssue(issues, { code: "TARGET_PAGE_MISSING", message: `目标页面「${pageId}」不存在`, ruleId, pageId });
    } else if (targetType === "region" && target) {
      const regionId = target.regionId;
      const regions = regionSets.get(pageId);
      if (typeof regionId !== "string" || regionId.length === 0) {
        addIssue(issues, { code: "TARGET_REGION_MISSING", message: "region 目标必须提供 regionId", ruleId, pageId });
      } else if (!regions || !regions.has(regionId)) {
        addIssue(issues, { code: "TARGET_REGION_MISSING", message: `页面「${pageId}」未声明区域「${regionId}」`, ruleId, pageId, regionId });
      }
    }

    if (rule.effect !== "hidden" && rule.effect !== "disabled") {
      addIssue(issues, { code: "TARGET_INVALID", message: "目标效果只支持 hidden 或 disabled", ruleId });
    }

    if ((targetType === "page" || targetType === "region") && typeof pageId === "string" && pageId.length > 0 && (rule.effect === "hidden" || rule.effect === "disabled")) {
      const key = `${targetKey(target as VisibilityRuleTarget)}:${rule.effect}`;
      if (seenTargets.has(key)) {
        addIssue(issues, { code: "CONFLICTING_RULES", message: `同一目标的 ${rule.effect} 联动规则重复，无法确定唯一结果`, ruleId, pageId, fieldKey: typeof fieldKey === "string" ? fieldKey : undefined });
      } else {
        seenTargets.add(key);
      }
    }
  }

  const document = normalizeDocument(raw);
  return { valid: issues.length === 0 && document !== undefined, issues, document };
}

function readOverrides(overrides?: AllowedVisibilitySessionOverrides | Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!overrides) return {};
  const isScoped = isRecord(overrides)
    && ("values" in overrides || "fieldKeys" in overrides || "allowPageTargets" in overrides);
  const scopedOverrides = isScoped
    ? (overrides as AllowedVisibilitySessionOverrides)
    : undefined;
  const candidate = scopedOverrides ? (scopedOverrides.values ?? {}) : overrides;
  const allow = scopedOverrides?.fieldKeys
    ? new Set<string>(Array.from(scopedOverrides.fieldKeys).filter((key): key is string => typeof key === "string"))
    : undefined;
  return Object.fromEntries(Object.entries(candidate).filter(([key]) => !allow || allow.has(key)));
}

function conditionMatches(value: unknown, condition: VisibilityRuleCondition): boolean {
  if (condition.kind === "truthy") return Boolean(value);
  return Object.is(value, condition.value);
}

function initialPage(pageId: string): VisibilityPageState {
  return { pageId, visible: true, enabled: true, hidden: false, disabled: false, reasons: [] };
}

function initialRegion(pageId: string, regionId: string): VisibilityRegionState {
  return { pageId, regionId, visible: true, enabled: true, hidden: false, disabled: false, reasons: [] };
}

/** Resolve a validated rule document using published values and optional, pre-filtered session overrides. */
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
): VisibilityResolution {
  const pageIds = Array.from(snapshot.pageIds);
  const regionIds = Object.fromEntries(
    Object.entries(snapshot.regionIds ?? {}).map(([pageId, ids]) => [pageId, Array.from(ids)]),
  );
  const validation = validateVisibilityRules(snapshot.rules ?? { version: VISIBILITY_RULES_VERSION, rules: [] }, {
    pageIds,
    regionIds,
    projectSchema: snapshot.projectSchema,
    pageSchemas: snapshot.pageSchemas,
  });
  const pages: Record<string, VisibilityPageState> = {};
  for (const pageId of pageIds) pages[pageId] = initialPage(pageId);
  const regions: Record<string, VisibilityRegionState> = {};
  for (const [pageId, ids] of Object.entries(regionIds)) {
    for (const regionId of ids) regions[`${pageId}:${regionId}`] = initialRegion(pageId, regionId);
  }
  const sessionOverrides = readOverrides(allowedSessionOverrides);
  const values = {
    ...schemaDefaults(snapshot.projectSchema),
    ...(snapshot.projectConfigDefaults ?? {}),
    ...(snapshot.projectConfigValues ?? {}),
    ...sessionOverrides,
  };
  const publishedValues = {
    ...schemaDefaults(snapshot.projectSchema),
    ...(snapshot.projectConfigDefaults ?? {}),
    ...(snapshot.projectConfigValues ?? {}),
  };
  const sessionOverrideKeys = new Set(
    Object.keys(sessionOverrides),
  );
  const allowPageTargets = !isRecord(allowedSessionOverrides)
    || !Object.prototype.hasOwnProperty.call(allowedSessionOverrides, "allowPageTargets")
    || allowedSessionOverrides.allowPageTargets !== false;
  if (!validation.valid || !validation.document) return { valid: false, pages, regions, issues: validation.issues, values };

  for (const rule of validation.document.rules) {
    const value = !allowPageTargets
      && rule.target.type === "page"
      && sessionOverrideKeys.has(rule.source.fieldKey)
      ? publishedValues[rule.source.fieldKey]
      : values[rule.source.fieldKey];
    if (!conditionMatches(value, rule.condition)) continue;
    const state = rule.target.type === "page"
      ? pages[rule.target.pageId]
      : regions[`${rule.target.pageId}:${rule.target.regionId}`];
    if (!state) continue;
    const reason = { ruleId: rule.id, fieldKey: rule.source.fieldKey, effect: rule.effect };
    state.reasons.push(reason);
    if (rule.effect === "hidden") {
      state.hidden = true;
      state.visible = false;
    } else {
      state.disabled = true;
      state.enabled = false;
    }
  }
  return { valid: true, pages, regions, issues: [], values };
}

export function visibilityRulesToJson(document: VisibilityRulesDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
