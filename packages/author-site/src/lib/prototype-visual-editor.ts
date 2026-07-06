import type {
  VisualNodeInfo,
  VisualPropertyChange,
  VisualPropertyChangeKind,
} from "@workbench/demo-ui";

export type PrototypeVisualConfigKind = "text" | "image" | "color";

export interface PrototypeVisualConfigTarget {
  kind: PrototypeVisualConfigKind;
  fieldKey: string;
  title: string;
  defaultValue: string;
  category?: string;
  colorProperty?: "color" | "backgroundColor" | "borderColor";
}

export type PrototypeVisualEditResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

export type PrototypeVisualConfigResult =
  | {
      ok: true;
      html: string;
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

const STYLE_BIND_ATTRS = {
  color: "data-bind-style-color",
  backgroundColor: "data-bind-style-background-color",
  borderColor: "data-bind-style-border-color",
} as const;

function parsePrototypeHtml(html: string): { document: Document; root: HTMLElement } {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<div class="prototype-root">${html}</div>`,
    "text/html",
  );
  const root = document.querySelector<HTMLElement>(".prototype-root");
  if (!root) throw new Error("无法解析 prototype.html");
  return { document, root };
}

function serializePrototypeHtml(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (node instanceof Element) return node.outerHTML;
      return "";
    })
    .join("")
    .trim();
}

function queryByDomPath(root: ParentNode, domPath?: string): HTMLElement | null {
  if (!domPath) return null;
  const selector = domPath.replace(/^prototype-root\s*>\s*/, "");
  if (!selector || selector === "prototype-root") {
    return root.querySelector<HTMLElement>(".prototype-root");
  }
  try {
    return root.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function getElementByNode(root: ParentNode, node: Pick<VisualNodeInfo, "nodeId" | "domPath">): HTMLElement | null {
  if (node.nodeId && !node.nodeId.startsWith("prototype-root")) {
    const escaped = typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(node.nodeId)
      : node.nodeId.replace(/"/g, '\\"');
    const byId = root.querySelector<HTMLElement>(`[data-ow-id="${escaped}"]`);
    if (byId) return byId;
  }
  return queryByDomPath(root, node.domPath);
}

function ensureStableNodeId(element: HTMLElement, node: Pick<VisualNodeInfo, "nodeId">): string {
  const existing = element.getAttribute("data-ow-id");
  if (existing) return existing;
  const next = node.nodeId && !node.nodeId.startsWith("prototype-root")
    ? node.nodeId
    : `ow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  element.setAttribute("data-ow-id", next);
  return next;
}

function normalizeStyleValue(property: string, value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (
    [
      "fontSize",
      "width",
      "height",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "padding",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "margin",
      "gap",
      "borderWidth",
      "borderRadius",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
      "letterSpacing",
      "lineHeight",
    ].includes(property) &&
    /^\d+(\.\d+)?$/.test(trimmed)
  ) {
    return `${trimmed}px`;
  }
  if (property === "opacity" && /^\d+(\.\d+)?%?$/.test(trimmed)) {
    const numeric = Number(trimmed.replace("%", ""));
    return String(numeric > 1 ? Math.max(0, Math.min(100, numeric)) / 100 : Math.max(0, Math.min(1, numeric)));
  }
  return trimmed;
}

function validateTarget(target: PrototypeVisualConfigTarget): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(target.fieldKey)) {
    return "字段 key 必须以英文字母或下划线开头，并且只能包含英文字母、数字和下划线";
  }
  if (target.fieldKey.startsWith("__")) return "字段 key 不能以双下划线开头";
  if (!target.title.trim()) return "字段标题不能为空";
  if (typeof target.defaultValue !== "string") return "默认值必须是字符串";
  if (target.category !== undefined && typeof target.category !== "string") {
    return "配置分类必须是字符串";
  }
  if (target.kind === "color" && !target.colorProperty) return "颜色配置缺少目标属性";
  return null;
}

function normalizeCategory(category: string | undefined): string | undefined {
  const normalized = category?.trim();
  return normalized ? normalized : undefined;
}

function parseSchema(schema: string): Record<string, unknown> | null {
  if (!schema.trim()) return { ...DEFAULT_SCHEMA, properties: {} };
  try {
    return JSON.parse(schema) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function ensureRecord(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = target[key];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  target[key] = next;
  return next;
}

function createSchemaProperty(target: PrototypeVisualConfigTarget): Record<string, unknown> {
  const property: Record<string, unknown> = {
    type: "string",
    title: target.title.trim(),
    default: target.defaultValue,
  };
  if (target.kind === "image") property.format = "image";
  if (target.kind === "color") property.format = "color";
  const category = normalizeCategory(target.category);
  if (category) {
    property["ui:options"] = { category };
  }
  return property;
}

export function applyPrototypePropertyChange(
  html: string,
  node: Pick<VisualNodeInfo, "nodeId" | "domPath">,
  property: string,
  value: string,
  kind: VisualPropertyChangeKind,
): PrototypeVisualEditResult {
  try {
    const { root } = parsePrototypeHtml(html);
    const element = getElementByNode(root, node);
    if (!element) return { ok: false, error: "无法定位选中的原型节点" };
    ensureStableNodeId(element, node);

    if (kind === "text") {
      element.textContent = value || "";
    } else if (kind === "attribute") {
      if (value) element.setAttribute(property, value);
      else element.removeAttribute(property);
    } else {
      element.style.setProperty(
        property.replace(/[A-Z]/g, (part) => `-${part.toLowerCase()}`),
        normalizeStyleValue(property, value),
      );
    }

    return { ok: true, html: serializePrototypeHtml(root) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "原型页属性写回失败",
    };
  }
}

export function applyPrototypePropertyChanges(
  html: string,
  changes: VisualPropertyChange[],
): PrototypeVisualEditResult {
  let nextHtml = html;
  for (const change of changes) {
    const result = applyPrototypePropertyChange(
      nextHtml,
      change,
      change.property,
      change.value,
      change.kind,
    );
    if (!result.ok) return result;
    nextHtml = result.html;
  }
  return { ok: true, html: nextHtml };
}

export function applyPrototypeVisualConfiguration(params: {
  html: string;
  schema: string;
  node: VisualNodeInfo;
  target: PrototypeVisualConfigTarget;
}): PrototypeVisualConfigResult {
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

  try {
    const { root } = parsePrototypeHtml(params.html);
    const element = getElementByNode(root, params.node);
    if (!element) return { ok: false, error: "无法定位选中的原型节点" };
    ensureStableNodeId(element, params.node);

    if (params.target.kind === "text") {
      element.setAttribute("data-bind-text", params.target.fieldKey);
      element.textContent = params.target.defaultValue;
    } else if (params.target.kind === "image") {
      element.setAttribute("data-bind-src", params.target.fieldKey);
      element.setAttribute("src", params.target.defaultValue);
    } else {
      const colorProperty = params.target.colorProperty;
      if (!colorProperty) return { ok: false, error: "颜色配置缺少目标属性" };
      element.setAttribute(STYLE_BIND_ATTRS[colorProperty], params.target.fieldKey);
      element.style.setProperty(
        colorProperty.replace(/[A-Z]/g, (part) => `-${part.toLowerCase()}`),
        params.target.defaultValue,
      );
    }

    properties[params.target.fieldKey] = createSchemaProperty(params.target);
    if (!Array.isArray(parsedSchema.required)) parsedSchema.required = [];

    return {
      ok: true,
      html: serializePrototypeHtml(root),
      schema: JSON.stringify(parsedSchema, null, 2),
      configPatch: { [params.target.fieldKey]: params.target.defaultValue },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "添加原型页配置项失败",
    };
  }
}
