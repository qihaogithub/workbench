import type { VisualNodeInfo } from "@opencode-workbench/demo-ui";

export type VisualConfigKind = "text" | "image" | "color";

export interface VisualConfigCandidate {
  id: string;
  kind: VisualConfigKind;
  label: string;
  fieldTitle: string;
  defaultValue: string;
  colorProperty?: "color" | "backgroundColor" | "borderColor";
}

export interface VisualConfigTarget {
  kind: VisualConfigKind;
  fieldKey: string;
  title: string;
  defaultValue: string;
  colorProperty?: "color" | "backgroundColor" | "borderColor";
}

export interface VisualConfigureParams {
  code: string;
  schema: string;
  node: VisualNodeInfo;
  target: VisualConfigTarget;
}

export type VisualConfigureResult =
  | {
      ok: true;
      code: string;
      schema: string;
      configPatch: Record<string, unknown>;
    }
  | { ok: false; error: string };

const DEFAULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Demo 配置",
  type: "object",
  properties: {},
  required: [],
};

const COLOR_LABELS: Record<
  NonNullable<VisualConfigCandidate["colorProperty"]>,
  string
> = {
  color: "文字颜色",
  backgroundColor: "背景颜色",
  borderColor: "边框颜色",
};

const CSS_STYLE_PROPS: Record<
  NonNullable<VisualConfigTarget["colorProperty"]>,
  string
> = {
  color: "color",
  backgroundColor: "backgroundColor",
  borderColor: "borderColor",
};

export function buildVisualConfigCandidates(
  node: VisualNodeInfo | null,
): VisualConfigCandidate[] {
  if (!node) return [];
  const candidates: VisualConfigCandidate[] = [];

  if (node.textContent && node.editCapabilities.includes("text")) {
    candidates.push({
      id: "text:value",
      kind: "text",
      label: "文本内容",
      fieldTitle: titleFromText(node.textContent, "文本"),
      defaultValue: node.textContent,
    });
  }

  const imageValue = getImageValue(node);
  if (imageValue) {
    candidates.push({
      id: "image:src",
      kind: "image",
      label: "图片",
      fieldTitle: titleFromText(node.attrs?.alt || node.textContent, "图片"),
      defaultValue: imageValue,
    });
  }

  for (const property of ["color", "backgroundColor", "borderColor"] as const) {
    const value = node.computedStyle?.[property];
    if (!isUsefulColor(value)) continue;
    candidates.push({
      id: `color:${property}`,
      kind: "color",
      label: COLOR_LABELS[property],
      fieldTitle: COLOR_LABELS[property],
      defaultValue: value,
      colorProperty: property,
    });
  }

  return candidates;
}

export function suggestVisualConfigFieldKey(
  title: string,
  usedKeys: string[] = [],
): string {
  const base = toCamelKey(title) || "configItem";
  const used = new Set(usedKeys);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

export function applyVisualConfiguration(
  params: VisualConfigureParams,
): VisualConfigureResult {
  const validationError = validateTarget(params.target);
  if (validationError) return { ok: false, error: validationError };

  const parsedSchema = parseSchema(params.schema);
  if (!parsedSchema || typeof parsedSchema !== "object" || Array.isArray(parsedSchema)) {
    return { ok: false, error: "当前页面 Schema 不是合法 JSON 对象" };
  }

  const properties = ensureRecord(parsedSchema, "properties");
  if (params.target.fieldKey in properties) {
    return { ok: false, error: `配置字段 ${params.target.fieldKey} 已存在` };
  }

  const codeResult = applyCodeChange(params.code, params.node, params.target);
  if (!codeResult.ok) return codeResult;

  properties[params.target.fieldKey] = createSchemaProperty(params.target);
  if (!Array.isArray(parsedSchema.required)) {
    parsedSchema.required = [];
  }

  return {
    ok: true,
    code: codeResult.code,
    schema: JSON.stringify(parsedSchema, null, 2),
    configPatch: { [params.target.fieldKey]: params.target.defaultValue },
  };
}

function getImageValue(node: VisualNodeInfo): string | undefined {
  if (node.tagName !== "img") return undefined;
  return node.attrs?.src || node.attrs?.currentSrc;
}

function isUsefulColor(value?: string): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "transparent" &&
    normalized !== "rgba(0, 0, 0, 0)" &&
    normalized !== "rgba(0,0,0,0)"
  );
}

function titleFromText(value: string | undefined, fallback: string): string {
  const text = value?.trim();
  if (!text) return fallback;
  return text.length > 12 ? text.slice(0, 12) : text;
}

function toCamelKey(input: string): string {
  const ascii = input
    .trim()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]+/g, " ")
    .trim();

  const words = ascii
    .split(/\s+/)
    .map((word) => pinyinFallback(word))
    .filter(Boolean);

  if (words.length === 0) return "";
  const [first, ...rest] = words;
  const key = [
    first.toLowerCase(),
    ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
  ].join("");
  return /^[a-zA-Z_]/.test(key) ? key : `field${key}`;
}

function pinyinFallback(word: string): string {
  const mapped: Record<string, string> = {
    文本: "text",
    内容: "content",
    标题: "title",
    图片: "image",
    颜色: "color",
    文字: "text",
    背景: "background",
    边框: "border",
  };
  if (/^[a-zA-Z0-9_]+$/.test(word)) return word;
  return mapped[word] || "field";
}

function validateTarget(target: VisualConfigTarget): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(target.fieldKey)) {
    return "字段 key 必须以英文字母或下划线开头，并且只能包含英文字母、数字和下划线";
  }
  if (target.fieldKey.startsWith("__")) {
    return "字段 key 不能以双下划线开头";
  }
  if (!target.title.trim()) {
    return "字段标题不能为空";
  }
  if (typeof target.defaultValue !== "string") {
    return "默认值必须是字符串";
  }
  if (target.kind === "color" && !target.colorProperty) {
    return "颜色配置缺少目标属性";
  }
  return null;
}

function parseSchema(schema: string): Record<string, unknown> | null {
  if (!schema.trim()) return { ...DEFAULT_SCHEMA, properties: {} };
  try {
    return JSON.parse(schema) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function ensureRecord(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const existing = target[key];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  target[key] = next;
  return next;
}

function createSchemaProperty(target: VisualConfigTarget): Record<string, unknown> {
  const property: Record<string, unknown> = {
    type: "string",
    title: target.title.trim(),
    default: target.defaultValue,
  };
  if (target.kind === "image") property.format = "image";
  if (target.kind === "color") property.format = "color";
  return property;
}

function applyCodeChange(
  code: string,
  node: VisualNodeInfo,
  target: VisualConfigTarget,
): { ok: true; code: string } | { ok: false; error: string } {
  if (target.kind === "text") {
    const textResult = replaceUniqueTextLiteral(
      code,
      target.defaultValue,
      `{${target.fieldKey}}`,
    );
    if (!textResult.ok) return textResult;
    return ensurePropsField(textResult.code, target);
  }

  const propsResult = ensurePropsField(code, target);
  if (!propsResult.ok) return propsResult;

  if (target.kind === "image") {
    return replaceUniqueImageSrc(propsResult.code, node, target);
  }

  return applyColorStyle(propsResult.code, node, target);
}

function ensurePropsField(
  code: string,
  target: VisualConfigTarget,
): { ok: true; code: string } | { ok: false; error: string } {
  const fieldDeclaration = `  ${target.fieldKey}?: string;`;
  let nextCode = code;

  const interfaceMatch = nextCode.match(/interface\s+(\w*Props)\s*\{([\s\S]*?)\n\}/);
  const typeMatch = nextCode.match(/type\s+(\w*Props)\s*=\s*\{([\s\S]*?)\n\};?/);
  const propsName = interfaceMatch?.[1] || typeMatch?.[1] || "DemoProps";

  if (interfaceMatch) {
    if (!new RegExp(`\\b${escapeRegExp(target.fieldKey)}\\??\\s*:`).test(interfaceMatch[2])) {
      const insertAt = interfaceMatch.index! + interfaceMatch[0].lastIndexOf("\n}");
      nextCode = `${nextCode.slice(0, insertAt)}\n${fieldDeclaration}${nextCode.slice(insertAt)}`;
    }
  } else if (typeMatch) {
    if (!new RegExp(`\\b${escapeRegExp(target.fieldKey)}\\??\\s*:`).test(typeMatch[2])) {
      const insertAt = typeMatch.index! + typeMatch[0].lastIndexOf("\n}");
      nextCode = `${nextCode.slice(0, insertAt)}\n${fieldDeclaration}${nextCode.slice(insertAt)}`;
    }
  } else {
    const functionMatch = nextCode.match(/export\s+default\s+function\s+\w*\s*\(/);
    if (!functionMatch || functionMatch.index === undefined) {
      return { ok: false, error: "无法找到默认导出函数，不能安全补齐 Props" };
    }
    nextCode = `${nextCode.slice(0, functionMatch.index)}interface ${propsName} {\n${fieldDeclaration}\n}\n\n${nextCode.slice(functionMatch.index)}`;
  }

  const defaultExpr = JSON.stringify(target.defaultValue);
  const destructured = addFieldToDestructuredParams(
    nextCode,
    target.fieldKey,
    defaultExpr,
  );
  if (destructured.ok) return destructured;

  return convertEmptyDefaultFunction(nextCode, target.fieldKey, defaultExpr, propsName);
}

function addFieldToDestructuredParams(
  code: string,
  fieldKey: string,
  defaultExpr: string,
): { ok: true; code: string } | { ok: false; error: string } {
  const patterns = [
    /(export\s+default\s+function\s+\w*\s*\(\s*\{)([\s\S]*?)(\}\s*:\s*\w+\s*\))/,
    /(function\s+\w+\s*\(\s*\{)([\s\S]*?)(\}\s*:\s*\w+\s*\))/,
    /(const\s+\w+\s*=\s*\(\s*\{)([\s\S]*?)(\}\s*:\s*\w+\s*\)\s*=>)/,
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (!match || match.index === undefined) continue;
    if (new RegExp(`\\b${escapeRegExp(fieldKey)}\\b`).test(match[2])) {
      return { ok: true, code };
    }

    const body = match[2];
    const fieldText = body.includes("\n")
      ? `${body.trimEnd().endsWith(",") ? "" : ","}\n  ${fieldKey} = ${defaultExpr},\n`
      : `${body.trim() ? `${body.trim()}, ` : ""}${fieldKey} = ${defaultExpr}`;

    const replacement = `${match[1]}${fieldText}${match[3]}`;
    return {
      ok: true,
      code: `${code.slice(0, match.index)}${replacement}${code.slice(match.index + match[0].length)}`,
    };
  }

  return { ok: false, error: "无法找到可写入的 Props 解构参数" };
}

function convertEmptyDefaultFunction(
  code: string,
  fieldKey: string,
  defaultExpr: string,
  propsName: string,
): { ok: true; code: string } | { ok: false; error: string } {
  const pattern = /(export\s+default\s+function\s+\w*\s*)\(\s*\)/;
  const match = code.match(pattern);
  if (!match || match.index === undefined) {
    return { ok: false, error: "当前组件参数结构过于复杂，无法安全添加配置字段" };
  }
  const replacement = `${match[1]}({ ${fieldKey} = ${defaultExpr} }: ${propsName})`;
  return {
    ok: true,
    code: `${code.slice(0, match.index)}${replacement}${code.slice(match.index + match[0].length)}`,
  };
}

function replaceUniqueTextLiteral(
  code: string,
  before: string,
  after: string,
): { ok: true; code: string } | { ok: false; error: string } {
  const first = code.indexOf(before);
  if (first === -1) {
    return { ok: false, error: "当前代码中找不到选中文本，可能来自动态数据或已被修改" };
  }
  const second = code.indexOf(before, first + before.length);
  if (second !== -1) {
    return { ok: false, error: "选中文本在代码中出现多次，无法判断要配置哪一个元素" };
  }
  return {
    ok: true,
    code: `${code.slice(0, first)}${after}${code.slice(first + before.length)}`,
  };
}

function replaceUniqueImageSrc(
  code: string,
  node: VisualNodeInfo,
  target: VisualConfigTarget,
): { ok: true; code: string } | { ok: false; error: string } {
  const values = Array.from(
    new Set([node.attrs?.src, node.attrs?.currentSrc, target.defaultValue].filter(Boolean)),
  ) as string[];

  for (const value of values) {
    const srcPattern = new RegExp(`src=(["'])${escapeRegExp(value)}\\1`, "g");
    const matches = Array.from(code.matchAll(srcPattern));
    if (matches.length === 1 && matches[0].index !== undefined) {
      const match = matches[0];
      return {
        ok: true,
        code: `${code.slice(0, match.index)}src={${target.fieldKey}}${code.slice(match.index + match[0].length)}`,
      };
    }
  }

  return { ok: false, error: "无法在代码中唯一定位图片 src" };
}

function applyColorStyle(
  code: string,
  node: VisualNodeInfo,
  target: VisualConfigTarget,
): { ok: true; code: string } | { ok: false; error: string } {
  if (!target.colorProperty) {
    return { ok: false, error: "颜色配置缺少目标属性" };
  }

  const anchor = node.textContent || node.attrs?.src || node.attrs?.currentSrc;
  if (!anchor) {
    return { ok: false, error: "选中元素缺少可用于定位的文本或图片地址" };
  }

  const anchorIndex = getUniqueIndex(code, anchor);
  if (anchorIndex < 0) {
    return {
      ok: false,
      error:
        anchorIndex === -1
          ? "无法在代码中找到选中元素"
          : "选中元素的定位内容在代码中出现多次",
    };
  }

  const openStart = code.lastIndexOf("<", anchorIndex);
  const openEnd = code.indexOf(">", openStart);
  if (openStart === -1 || openEnd === -1 || openStart > anchorIndex) {
    return { ok: false, error: "无法定位选中元素的 JSX 标签" };
  }

  const opening = code.slice(openStart, openEnd);
  if (opening.includes("style={") && !opening.includes("style={{")) {
    return { ok: false, error: "当前元素已有复杂 style 表达式，无法安全合并颜色配置" };
  }

  const styleProp = CSS_STYLE_PROPS[target.colorProperty];
  let nextOpening: string;
  if (opening.includes("style={{")) {
    nextOpening = opening.replace("style={{", `style={{ ${styleProp}: ${target.fieldKey},`);
  } else {
    nextOpening = `${opening} style={{ ${styleProp}: ${target.fieldKey} }}`;
  }

  return {
    ok: true,
    code: `${code.slice(0, openStart)}${nextOpening}${code.slice(openEnd)}`,
  };
}

function getUniqueIndex(source: string, value: string): number {
  const first = source.indexOf(value);
  if (first === -1) return -1;
  const second = source.indexOf(value, first + value.length);
  return second === -1 ? first : -2;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
