/** A single inclusive or exclusive image-dimension boundary. */
export interface ImageDimensionBound {
  value: number;
  inclusive: boolean;
}

/**
 * Canonical image dimension rule.
 *
 * `min` and `max` are intentionally optional so the same contract can express
 * an exact value, a lower/upper bound, or a bounded interval. An exact value
 * is represented by equal inclusive bounds.
 */
export interface ImageDimensionRule {
  min?: ImageDimensionBound;
  max?: ImageDimensionBound;
}

export type ImageDimensionOperator = "=" | ">" | "≥" | "<" | "≤";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}必须是非负数字`);
  }
  return value;
}

function parseBound(value: unknown, label: string): ImageDimensionBound {
  if (!isRecord(value)) throw new Error(`${label}格式无效`);
  if (typeof value.inclusive !== "boolean") throw new Error(`${label}包含边界标记无效`);
  return {
    value: parseValue(value.value, `${label}数值`),
    inclusive: value.inclusive,
  };
}

function canonicalize(rule: ImageDimensionRule, label: string): ImageDimensionRule {
  if (!rule.min && !rule.max) throw new Error(`${label}至少需要一个边界`);
  if (rule.min && rule.max) {
    if (rule.min.value > rule.max.value) throw new Error(`${label}下限不能大于上限`);
    if (rule.min.value === rule.max.value && (!rule.min.inclusive || !rule.max.inclusive)) {
      throw new Error(`${label}上下限相等时必须包含边界`);
    }
  }
  return rule;
}

function fromOperator(operator: ImageDimensionOperator, value: number): ImageDimensionRule {
  switch (operator) {
    case "=":
      return {
        min: { value, inclusive: true },
        max: { value, inclusive: true },
      };
    case ">":
      return { min: { value, inclusive: false } };
    case "≥":
      return { min: { value, inclusive: true } };
    case "<":
      return { max: { value, inclusive: false } };
    case "≤":
      return { max: { value, inclusive: true } };
  }
}

/**
 * Normalize canonical rules and the currently persisted operator/value shape.
 * All schema writes should use the returned canonical min/max representation.
 */
export function normalizeImageDimensionRule(
  value: unknown,
  label = "尺寸规则",
): ImageDimensionRule | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isRecord(value)) throw new Error(`${label}格式无效`);

  if (Object.prototype.hasOwnProperty.call(value, "operator")) {
    const operator = value.operator;
    if (typeof operator !== "string" || !["=", ">", "≥", "<", "≤"].includes(operator)) {
      throw new Error(`${label}比较符无效`);
    }
    return fromOperator(operator as ImageDimensionOperator, parseValue(value.value, `${label}数值`));
  }

  const rule: ImageDimensionRule = {
    min: value.min === undefined ? undefined : parseBound(value.min, `${label}下限`),
    max: value.max === undefined ? undefined : parseBound(value.max, `${label}上限`),
  };
  return canonicalize(rule, label);
}

export function exactImageDimensionRule(value: number): ImageDimensionRule {
  const parsed = parseValue(value, "尺寸规则数值");
  return fromOperator("=", parsed);
}

/** Return a user-facing validation message, or undefined when the rule is valid. */
export function validateImageDimensionRule(
  rule: ImageDimensionRule | undefined,
  label = "尺寸规则",
): string | undefined {
  if (!rule) return undefined;
  try {
    normalizeImageDimensionRule(rule, label);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : `${label}无效`;
  }
}

export function matchesImageDimension(
  actualValue: number,
  rule: ImageDimensionRule | undefined,
): boolean {
  if (!rule || !Number.isFinite(actualValue)) return !rule;
  if (rule.min) {
    if (actualValue < rule.min.value) return false;
    if (actualValue === rule.min.value && !rule.min.inclusive) return false;
  }
  if (rule.max) {
    if (actualValue > rule.max.value) return false;
    if (actualValue === rule.max.value && !rule.max.inclusive) return false;
  }
  return true;
}

export function validateImageDimensions(
  actual: { width: number; height: number },
  rules: { widthRule?: ImageDimensionRule; heightRule?: ImageDimensionRule },
): { valid: boolean; message: string } {
  const parts: string[] = [];
  if (rules.widthRule && !matchesImageDimension(actual.width, rules.widthRule)) {
    parts.push(`宽度${formatImageDimensionRule(rules.widthRule)}`);
  }
  if (rules.heightRule && !matchesImageDimension(actual.height, rules.heightRule)) {
    parts.push(`高度${formatImageDimensionRule(rules.heightRule)}`);
  }
  if (parts.length === 0) return { valid: true, message: "" };
  return {
    valid: false,
    message: `图片尺寸不符合要求：${parts.join("，")}（实际 ${actual.width}x${actual.height}px）`,
  };
}

function boundText(bound: ImageDimensionBound, side: "min" | "max"): string {
  return `${side === "min" ? (bound.inclusive ? "≥" : ">") : (bound.inclusive ? "≤" : "<")} ${bound.value}px`;
}

/** Format one rule without an axis prefix, or with W/H when supplied. */
export function formatImageDimensionRule(
  rule: ImageDimensionRule | undefined,
  axis?: "W" | "H",
): string {
  if (!rule) return "不限";
  const prefix = axis ? `${axis} ` : "";
  if (
    rule.min && rule.max
    && rule.min.value === rule.max.value
    && rule.min.inclusive
    && rule.max.inclusive
  ) {
    return `${prefix}= ${rule.min.value}px`;
  }
  const parts = [
    rule.min ? `${prefix}${boundText(rule.min, "min")}` : undefined,
    rule.max ? `${prefix}${boundText(rule.max, "max")}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" 且 ");
}

/** Format a compact rule for the configuration-panel dimension summary. */
export function formatImageDimensionRuleCompact(
  rule: ImageDimensionRule | undefined,
  axis: "W" | "H",
): string {
  if (!rule) return "不限";
  if (
    rule.min && rule.max
    && rule.min.value === rule.max.value
    && rule.min.inclusive
    && rule.max.inclusive
  ) {
    return `${axis}=${rule.min.value}px`;
  }
  if (rule.min && rule.max) {
    const minOperator = rule.min.inclusive ? "≤" : "<";
    const maxOperator = rule.max.inclusive ? "≤" : "<";
    return `${rule.min.value}px${minOperator}${axis}${maxOperator}${rule.max.value}px`;
  }
  if (rule.min) return `${axis}${rule.min.inclusive ? "≥" : ">"}${rule.min.value}px`;
  if (rule.max) return `${axis}${rule.max.inclusive ? "≤" : "<"}${rule.max.value}px`;
  return "不限";
}
