import {
  isValidSketchSceneImageCrop,
  validateSketchSceneDocument,
  type SketchSceneDocument,
  type SketchSceneFrame,
  type SketchSceneImageCrop,
  type SketchSceneNode,
  type SketchSceneStyle,
} from "@workbench/sketch-core";

export const WHITEBOARD_DOCUMENT_VERSION = 3 as const;
export const WHITEBOARD_DOCUMENT_V2_VERSION = 2 as const;
export const WHITEBOARD_DOCUMENT_V3_VERSION = 3 as const;
export const WHITEBOARD_SCENE_FORMAT = "sketch-scene-v1" as const;
export const BRIDGE_PROFILE_VERSION = "html-css-v2" as const;
export const WHITEBOARD_CONTEXT_SCHEMA_VERSION = "whiteboard-context-v1" as const;
export const WHITEBOARD_PLAN_SCHEMA_VERSION = "whiteboard-plan-v1" as const;
export const WHITEBOARD_ACTION_SCHEMA_VERSION = "whiteboard-action-v2" as const;
export const BRIDGE_NODE_TYPES = ["group", "rect", "ellipse", "image", "text", "button"] as const;
export type BridgeNodeType = (typeof BRIDGE_NODE_TYPES)[number];
export type SemanticRole = "background" | "subject" | "logo" | "decor" | "title" | "subtitle" | "label";
export const BRIDGE_STYLE_FIELDS = [
  "background", "border-color", "border-width", "opacity", "border-radius", "font-size", "font-weight",
  "color", "text-align", "object-fit", "transform", "left", "top", "width", "height", "z-index",
] as const;

export interface WhiteboardNodeSemantics { role?: SemanticRole; assetRef?: string }
export interface WhiteboardEditorView { zoom: number; offsetX: number; offsetY: number }
export interface WhiteboardSafeArea { x: number; y: number; width: number; height: number }
export interface WhiteboardDocumentV2 {
  id: string;
  version: 2;
  documentRevision: number;
  scene: SketchSceneDocument;
  nodeSemantics: Record<string, WhiteboardNodeSemantics>;
  safeArea?: WhiteboardSafeArea;
  editorView: WhiteboardEditorView;
  updatedAt: number;
}

export interface WhiteboardDocumentV3 {
  id: string;
  version: 3;
  sceneFormat: typeof WHITEBOARD_SCENE_FORMAT;
  documentRevision: number;
  scene: SketchSceneDocument;
  nodeSemantics: Record<string, WhiteboardNodeSemantics>;
  safeArea?: WhiteboardSafeArea;
  editorView: WhiteboardEditorView;
  updatedAt: number;
}

export type WhiteboardDocument = WhiteboardDocumentV2 | WhiteboardDocumentV3;

export interface WhiteboardContext {
  schemaVersion: typeof WHITEBOARD_CONTEXT_SCHEMA_VERSION;
  whiteboardId: string;
  documentRevision: number;
  pageSize: { width: number; height: number };
  safeArea?: WhiteboardSafeArea;
  nodeSemantics: Record<string, WhiteboardNodeSemantics>;
  nodes: SketchSceneNode[];
  selection?: WhiteboardSelection;
}

export interface WhiteboardSelection {
  nodeIds: string[];
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export interface WhiteboardPlan {
  schemaVersion: typeof WHITEBOARD_PLAN_SCHEMA_VERSION;
  actionSchemaVersion: typeof WHITEBOARD_ACTION_SCHEMA_VERSION;
  intent: string;
  baseDocumentRevision: number;
  selectedNodeIds: string[];
  selection: WhiteboardSelection;
  safeArea?: WhiteboardSafeArea;
  constraints: { bridgeProfile: typeof BRIDGE_PROFILE_VERSION; safeAreaEnforced: boolean; coordinateSpace: "page-px" };
  suggestedActionTypes: string[];
  requiresConfirmation: true;
}

export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  range?: { start: number; end: number };
  suggestion?: string;
}
export interface ConversionResult<T> {
  value?: T;
  diagnostics: Diagnostic[];
  /** Maps a generated action identity (for example `addText:0`) to its durable node ID. */
  idMapping?: Record<string, string>;
}

/**
 * A managed image moves through these states before it can become part of a
 * durable whiteboard document.  The state is deliberately kept outside the
 * scene so candidate assets can be discarded without mutating a draft.
 */
export type WhiteboardAssetLifecycle = "candidate" | "localized" | "attached" | "output";

export interface WhiteboardAssetRecord {
  assetId: string;
  lifecycle: WhiteboardAssetLifecycle;
  /** Stable local or same-origin image path; never a data/blob/remote URL. */
  src?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sha256?: string;
}

export type WhiteboardAssetTransition =
  | { type: "localize"; src: string; mimeType?: string; width?: number; height?: number; sha256?: string }
  | { type: "attach" }
  | { type: "markOutput" }
  | { type: "discard" };

const typeSet = new Set<string>(BRIDGE_NODE_TYPES);
const roleSet = new Set<string>(["background", "subject", "logo", "decor", "title", "subtitle", "label"]);
const tagFor: Record<BridgeNodeType, string> = { group: "div", rect: "div", ellipse: "div", image: "img", text: "div", button: "button" };
const tagKinds: Record<string, BridgeNodeType[]> = {
  div: ["group", "rect", "ellipse", "text"], button: ["button"], img: ["image"],
  h1: ["text"], h2: ["text"], h3: ["text"], h4: ["text"], h5: ["text"], h6: ["text"], p: ["text"], span: ["text"],
};
const allowedAttrs = new Set(["data-sketch-id", "data-sketch-kind", "data-sketch-role", "data-asset-ref", "data-sketch-children", "data-sketch-image-size", "data-sketch-image-crop", "src", "alt"]);
const allowedDocumentKeys = new Set(["id", "version", "sceneFormat", "documentRevision", "scene", "nodeSemantics", "safeArea", "editorView", "updatedAt"]);
const nativeDocumentKeys = new Set(["id", "version", "sceneFormat", "documentRevision", "scene", "nodeSemantics", "safeArea", "editorView", "updatedAt"]);
const allowedNodeKeys = new Set(["id", "type", "x", "y", "width", "height", "zIndex", "style", "text", "src", "alt", "intrinsicWidth", "intrinsicHeight", "imageCrop", "rotation", "children", "visible"]);
const cssPropertySet = new Set<string>(BRIDGE_STYLE_FIELDS);
const bridgeStyleKeys = new Set(["fill", "stroke", "strokeWidth", "opacity", "radius", "fontSize", "fontWeight", "textAlign", "color", "imageFit"]);
const whiteboardActionTypes = new Set(["updateNode", "updateRole", "placeAsset", "setImageFit", "setImageCrop", "removeNode", "addText", "align", "distribute"]);
const updateNodeKeys = new Set(["x", "y", "width", "height", "text", "rotation", "style"]);
const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const assetIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const WHITEBOARD_DIAGNOSTIC_FALLBACK = "白板内容不符合当前支持范围，请检查后重试。";
const NODE_KIND_LABELS: Record<string, string> = {
  group: "分组",
  rect: "图形",
  ellipse: "椭圆",
  image: "图片",
  text: "文本",
  button: "按钮",
};

const WHITEBOARD_DIAGNOSTIC_MESSAGES: Record<string, string> = {
  ASSET_IN_USE: "已附加或已输出的资源不能丢弃。",
  ASSET_NOT_ATTACHED: "资源尚未附加到白板节点，请先确认并附加资源。",
  ASSET_NOT_RESOLVED: "找不到关联的白板资源，请先确认资源后重试。",
  CSS_TOKEN_LIMIT: "CSS 内容超过安全限制，请减少声明数量。",
  DEPTH_LIMIT: "HTML 嵌套层级超过安全限制。",
  DUPLICATE_CSS_PROPERTY: "CSS 属性重复。",
  DUPLICATE_CSS_RULE: "CSS 规则重复。",
  DUPLICATE_NODE_ID: "节点 ID 必须唯一。",
  INPUT_TOO_LARGE: "HTML/CSS 内容超过输入限制。",
  INVALID_ACTION: "白板操作无效。",
  INVALID_ASSET_REF: "资源引用无效。",
  INVALID_CANVAS: "缺少有效的白板画布根节点。",
  INVALID_CSS: "CSS 包含未闭合或不支持的规则。",
  INVALID_DECLARATION: "CSS 声明必须包含属性和值。",
  INVALID_DOCUMENT: "白板文档必须是对象。",
  INVALID_EDITOR_VIEW: "白板视图参数无效。",
  INVALID_GEOMETRY: "节点几何尺寸无效或超出画布范围。",
  INVALID_GROUP: "分组包含未知子节点。",
  INVALID_GROUP_SEMANTICS: "分组节点不能携带该语义信息。",
  INVALID_ID: "白板文档 ID 无效。",
  INVALID_IMAGE_CROP: "图片裁剪数据无效。",
  INVALID_IMAGE_SIZE: "图片原始尺寸必须是两个正的有限数值。",
  INVALID_INPUT: "HTML 和 CSS 必须是文本。",
  INVALID_NODE: "节点必须是对象。",
  INVALID_NODE_ID: "节点必须提供有效的 data-sketch-id。",
  INVALID_NODE_TYPE: "节点类型不支持该操作。",
  INVALID_PAGE_SIZE: "画布宽高必须为正数且不能超过限制。",
  INVALID_ROLE: "节点语义角色无效。",
  INVALID_SAFE_AREA: "安全区域必须位于画布范围内。",
  INVALID_SCENE: "场景不符合白板协议。",
  INVALID_SCENE_FORMAT: "白板场景格式无效，应为 sketch-scene-v1。",
  INVALID_SELECTION: "至少需要选择两个节点。",
  INVALID_SEMANTICS: "节点语义信息无效。",
  INVALID_STYLE: "节点样式无效。",
  INVALID_TIMESTAMP: "更新时间必须是非负有限数值。",
  INVALID_VERSION: "白板版本或文档修订号无效。",
  MISSING_CSS_RULE: "节点缺少对应的 CSS 规则。",
  MISSING_GEOMETRY: "节点必须提供 left、top、width 和 height。",
  NESTED_NODE: "不支持嵌套可编辑节点，请使用分组子节点元数据。",
  NODE_LIMIT: "节点数量超过限制。",
  NODE_NOT_FOUND: "操作目标节点不存在。",
  ORPHAN_CSS_RULE: "CSS 规则没有对应的白板节点。",
  ORPHAN_SEMANTICS: "节点语义引用了不存在的节点。",
  OUTSIDE_SAFE_AREA: "操作会使节点超出安全区域。",
  TAG_KIND_MISMATCH: "HTML 标签与节点类型不匹配。",
  UNLOCALIZED_RESOURCE: "图片必须引用已本地化的 workspace 资源。",
  UNSAFE_STYLE: "节点样式值不适合跨环境渲染。",
  UNSUPPORTED_CONTENT: "不支持脚本、嵌入内容、style 标签和 CSS at-rule。",
  UNSUPPORTED_HTML: "画布中包含不支持的 HTML 内容。",
  UNSUPPORTED_NODE: "节点类型不在白板代码桥接范围内。",
  UNSUPPORTED_NODE_CONTENT: "节点包含不支持的文本内容。",
  UNSUPPORTED_SAFE_AREA_FIELD: "安全区域字段不受支持。",
  UNSUPPORTED_SCENE_FIELD: "场景字段不属于当前白板代码桥接范围。",
  UNSUPPORTED_SELECTOR: "CSS 选择器不受支持。",
  UNSUPPORTED_SEMANTICS: "节点语义字段不受支持。",
  UNSUPPORTED_STYLE: "节点样式字段不受支持。",
};

function localizeWhiteboardDiagnosticMessage(code: string, message: string): string {
  const normalized = message.trim();
  if (!normalized) return WHITEBOARD_DIAGNOSTIC_FALLBACK;
  if (/[\u3400-\u9fff]/u.test(normalized)) return normalized;

  if (normalized === "scene metadata is not part of the whiteboard bridge") {
    return "场景元数据不属于当前白板代码桥接范围";
  }
  if (normalized === "scene bindings are not part of the whiteboard bridge") {
    return "场景绑定不属于当前白板代码桥接范围";
  }
  if (normalized === "scene assets must be represented by nodeSemantics.assetRef") {
    return "场景资源必须通过节点语义中的 assetRef 表示";
  }
  if (normalized === "text is only supported on text and button nodes") {
    return "仅文本节点和按钮节点支持文本内容";
  }
  const nodeContent = normalized.match(/^([a-z]+) nodes cannot contain text content$/u);
  if (nodeContent) {
    return `${NODE_KIND_LABELS[nodeContent[1]] ?? "节点"}节点不能包含文本内容`;
  }
  const duplicateAttribute = normalized.match(/^duplicate (?:canvas )?attribute (.+)$/u);
  if (duplicateAttribute) return `属性 ${duplicateAttribute[1]} 重复`;
  const unsupportedAttribute = normalized.match(/^(?:attribute|canvas attribute) (.+) is not supported$/u);
  if (unsupportedAttribute) return `属性 ${unsupportedAttribute[1]} 不受支持`;
  const unsupportedSelector = normalized.match(/^selector (.+) is not supported$/u);
  if (unsupportedSelector) return `CSS 选择器 ${unsupportedSelector[1]} 不受支持`;
  const unsupportedCss = normalized.match(/^CSS property (.+) is not supported$/u);
  if (unsupportedCss) return `CSS 属性 ${unsupportedCss[1]} 不受支持`;
  const duplicateCssProperty = normalized.match(/^duplicate CSS property (.+)$/u);
  if (duplicateCssProperty) return `CSS 属性 ${duplicateCssProperty[1]} 重复`;
  const unsupportedNodeField = normalized.match(/^node field (.+) is not supported by the bridge profile$/u);
  if (unsupportedNodeField) return `节点字段 ${unsupportedNodeField[1]} 不属于当前白板代码桥接范围`;
  const unsupportedNodeType = normalized.match(/^node type (.+) is not in bridge profile$/u);
  if (unsupportedNodeType) return `节点类型 ${unsupportedNodeType[1]} 不在当前白板代码桥接范围内`;
  const unsupportedStyle = normalized.match(/^style field (.+) is not supported by the bridge profile$/u);
  if (unsupportedStyle) return `样式字段 ${unsupportedStyle[1]} 不属于当前白板代码桥接范围`;
  const unsafeStyle = normalized.match(/^style value for (.+) is not portable$/u);
  if (unsafeStyle) return `样式字段 ${unsafeStyle[1]} 的值无法安全跨环境渲染`;
  const unsupportedRole = normalized.match(/^unsupported role (.+)$/u);
  if (unsupportedRole) return `语义角色 ${unsupportedRole[1]} 不受支持`;
  const unsupportedAction = normalized.match(/^unsupported whiteboard action (.+)$/u);
  if (unsupportedAction) return `白板操作 ${unsupportedAction[1]} 不受支持`;
  const unsupportedPatchFields = normalized.match(/^updateNode fields are not supported: (.+)$/u);
  if (unsupportedPatchFields) return `节点更新字段不受支持：${unsupportedPatchFields[1]}`;
  const invalidCssNumber = normalized.match(/^(.+) must be a finite px number$/u);
  if (invalidCssNumber) return `${invalidCssNumber[1]} 必须是有限的像素数值`;
  const invalidCssProperty = normalized.match(/^(.+) must be an integer$/u);
  if (invalidCssProperty) return `${invalidCssProperty[1]} 必须是整数`;
  const invalidCssRange = normalized.match(/^(.+) must be between 0 and 1$/u);
  if (invalidCssRange) return `${invalidCssRange[1]} 必须在 0 到 1 之间`;
  const invalidCssEnum = normalized.match(/^(.+) must be (.+)$/u);
  if (invalidCssEnum && ["text-align", "object-fit"].includes(invalidCssEnum[1])) {
    return `${invalidCssEnum[1]} 的取值必须为 ${invalidCssEnum[2]}`;
  }
  const managedAssetMissing = normalized.match(/^managed asset (.+) was not found$/u);
  if (managedAssetMissing) return `找不到关联的资源 ${managedAssetMissing[1]}`;
  const managedAssetState = normalized.match(/^managed asset (.+) is (.+), not attached$/u);
  if (managedAssetState) return `资源 ${managedAssetState[1]} 当前为${managedAssetState[2]}状态，尚未附加`;
  const managedAssetUnsafe = normalized.match(/^managed asset (.+) has no safe render path$/u);
  if (managedAssetUnsafe) return `资源 ${managedAssetUnsafe[1]} 没有安全的渲染路径`;

  return WHITEBOARD_DIAGNOSTIC_MESSAGES[code] ?? WHITEBOARD_DIAGNOSTIC_FALLBACK;
}

function diag(code: string, message: string, extra: Partial<Diagnostic> = {}): Diagnostic {
  return { code, severity: "error", message: localizeWhiteboardDiagnosticMessage(code, message), ...extra };
}
function esc(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function textEsc(value: string): string { return esc(value).replace(/\n/g, "&#10;"); }
function decodeText(value: string): string { return value.replace(/&#10;|&#x0a;/gi, "\n").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); }
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function numeric(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim().replace(/px$/, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberTuple(value: string | undefined, length: number): number[] | undefined {
  if (value === undefined) return undefined;
  const values = value.split(",").map((part) => Number(part.trim()));
  return values.length === length && values.every((part) => Number.isFinite(part)) ? values : undefined;
}

function serializeImageCrop(crop: SketchSceneImageCrop): string {
  const source = crop.sourceRect;
  const frame = crop.originalFrame;
  return [
    crop.shape,
    [source.x, source.y, source.width, source.height].join(","),
    [frame.x, frame.y, frame.width, frame.height].join(","),
    crop.originalImageFit,
  ].join("|");
}

function parseImageCrop(value: string | undefined, nodeId: string, diagnostics: Diagnostic[]): SketchSceneImageCrop | undefined {
  if (value === undefined) return undefined;
  const parts = value.split("|");
  const source = numberTuple(parts[1], 4);
  const frame = numberTuple(parts[2], 4);
  const crop = parts.length === 4 && (parts[0] === "rect" || parts[0] === "circle") && source && frame && (parts[3] === "cover" || parts[3] === "contain" || parts[3] === "fill")
    ? {
        shape: parts[0],
        sourceRect: { x: source[0], y: source[1], width: source[2], height: source[3] },
        originalFrame: { x: frame[0], y: frame[1], width: frame[2], height: frame[3] },
        originalImageFit: parts[3],
      } as SketchSceneImageCrop
    : undefined;
  if (!crop || !isValidSketchSceneImageCrop(crop)) {
    diagnostics.push(diag("INVALID_IMAGE_CROP", "data-sketch-image-crop must encode a valid image crop", { nodeId }));
    return undefined;
  }
  return crop;
}

function isSafeCssToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 256
    && !/[;{}<>]/.test(value)
    && !/(?:url|var|calc|expression|gradient)\s*\(/i.test(value);
}

function parseAttrs(source: string, offset: number, diagnostics: Diagnostic[]): Map<string, string> {
  const attrs = new Map<string, string>();
  const attrRe = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(source))) {
    const name = match[1]; const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (attrs.has(name)) diagnostics.push(diag("DUPLICATE_ATTRIBUTE", `duplicate attribute ${name}`, { range: { start: offset + match.index, end: offset + attrRe.lastIndex } }));
    if (!allowedAttrs.has(name)) diagnostics.push(diag("UNSUPPORTED_ATTRIBUTE", `attribute ${name} is not supported`, { range: { start: offset + match.index, end: offset + attrRe.lastIndex }, suggestion: "Use data-sketch-* attributes only." }));
    attrs.set(name, value);
  }
  return attrs;
}

function validateCanvasAttrs(source: string, offset: number, diagnostics: Diagnostic[]): void {
  const allowed = new Set(["data-sketch-canvas", "data-width", "data-height"]);
  const seen = new Set<string>();
  const attrRe = /([:\w-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(source))) {
    const name = match[1];
    if (seen.has(name)) diagnostics.push(diag("DUPLICATE_ATTRIBUTE", `duplicate canvas attribute ${name}`, { range: { start: offset + match.index, end: offset + attrRe.lastIndex } }));
    if (!allowed.has(name)) diagnostics.push(diag("UNSUPPORTED_ATTRIBUTE", `canvas attribute ${name} is not supported`, { range: { start: offset + match.index, end: offset + attrRe.lastIndex } }));
    seen.add(name);
  }
}

function parseCss(css: string, diagnostics: Diagnostic[]): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  const tokenCount = (css.match(/[\w-]+|[{}:;]/g) ?? []).length;
  if (tokenCount > 20_000) diagnostics.push(diag("CSS_TOKEN_LIMIT", "CSS token count exceeds the safety limit", { suggestion: "Reduce the number of declarations." }));
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null; let consumed = 0;
  while ((match = ruleRe.exec(css))) {
    consumed = ruleRe.lastIndex;
    const selector = match[1].trim();
    const idMatch = selector.match(/^\[data-sketch-id\s*=\s*(["'])([^"']+)\1\]$/);
    if (!idMatch || !idPattern.test(idMatch[2])) { diagnostics.push(diag("UNSUPPORTED_SELECTOR", `selector ${selector} is not supported`, { range: { start: match.index, end: ruleRe.lastIndex }, suggestion: "Use [data-sketch-id=\"id\"] selectors." })); continue; }
    const id = idMatch[2];
    if (rules.has(id)) diagnostics.push(diag("DUPLICATE_CSS_RULE", `duplicate CSS rule for ${id}`, { nodeId: id, range: { start: match.index, end: ruleRe.lastIndex } }));
    const declarations = new Map<string, string>();
    const bodyStart = match.index + match[0].indexOf("{") + 1;
    let declarationOffset = 0;
    for (const declaration of match[2].split(";")) {
      const range = { start: bodyStart + declarationOffset, end: bodyStart + declarationOffset + declaration.length };
      declarationOffset += declaration.length + 1;
      const colon = declaration.indexOf(":");
      if (colon < 1) { if (declaration.trim()) diagnostics.push(diag("INVALID_DECLARATION", "CSS declaration must contain a property and value", { nodeId: id, range })); continue; }
      const property = declaration.slice(0, colon).trim().toLowerCase(); const value = declaration.slice(colon + 1).trim();
      if (!cssPropertySet.has(property)) diagnostics.push(diag("UNSUPPORTED_CSS", `CSS property ${property} is not supported`, { nodeId: id, range, suggestion: `Allowed properties: ${BRIDGE_STYLE_FIELDS.join(", ")}.` }));
      if (!isSafeCssToken(value) || /[!;]/.test(value)) diagnostics.push(diag("UNSUPPORTED_CSS_VALUE", `CSS value for ${property} is not portable`, { nodeId: id, range }));
      if (declarations.has(property)) diagnostics.push(diag("DUPLICATE_CSS_PROPERTY", `duplicate CSS property ${property}`, { nodeId: id, range }));
      if (cssPropertySet.has(property)) {
        const numericProperty = new Set(["left", "top", "width", "height", "border-width", "border-radius", "font-size", "z-index"]);
        if (numericProperty.has(property) && numeric(value) === undefined) diagnostics.push(diag("INVALID_CSS_VALUE", `${property} must be a finite px number`, { nodeId: id, range }));
        if (property === "z-index" && (!Number.isInteger(Number(value)) || numeric(value) === undefined)) diagnostics.push(diag("INVALID_CSS_VALUE", "z-index must be an integer", { nodeId: id, range }));
        if (property === "opacity" && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1)) diagnostics.push(diag("INVALID_CSS_VALUE", "opacity must be between 0 and 1", { nodeId: id, range }));
        if (property === "text-align" && !["left", "center", "right"].includes(value)) diagnostics.push(diag("INVALID_CSS_VALUE", "text-align must be left, center or right", { nodeId: id, range }));
        if (property === "object-fit" && !["cover", "contain", "fill"].includes(value)) diagnostics.push(diag("INVALID_CSS_VALUE", "object-fit must be cover, contain or fill", { nodeId: id, range }));
      }
      declarations.set(property, value);
    }
    rules.set(id, declarations);
  }
  if (consumed < css.trim().length) diagnostics.push(diag("INVALID_CSS", "CSS contains an unterminated or unsupported rule", { range: { start: consumed, end: css.length } }));
  return rules;
}

function styleToCss(style: SketchSceneStyle | undefined, node: SketchSceneNode): string {
  const pairs: string[] = [`left:${node.x}px`, `top:${node.y}px`, `width:${node.width}px`, `height:${node.height}px`, `z-index:${node.zIndex ?? 0}`];
  if (node.rotation !== undefined) pairs.push(`transform:rotate(${node.rotation}deg)`);
  const s = style ?? {};
  const map: Array<[string, unknown]> = [
    ["background", s.fill], ["border-color", s.stroke], ["border-width", s.strokeWidth === undefined ? undefined : `${s.strokeWidth}px`],
    ["opacity", s.opacity], ["border-radius", s.radius === undefined ? undefined : `${s.radius}px`],
    ["font-size", s.fontSize === undefined ? undefined : `${s.fontSize}px`], ["font-weight", s.fontWeight], ["color", s.color],
    ["text-align", s.textAlign], ["object-fit", node.type === "image" ? s.imageFit : undefined],
  ];
  for (const [key, value] of map) if (value !== undefined) pairs.push(`${key}:${String(value)}`);
  return pairs.join(";");
}

export function isBridgeNodeType(value: unknown): value is BridgeNodeType { return typeof value === "string" && typeSet.has(value); }

/**
 * Validate the durable/native whiteboard envelope.
 *
 * This delegates scene validation to SketchSceneDocument and deliberately
 * does not apply the html-css-v2 field allowlist. A native document may retain
 * every field supported by the sketch protocol, including scene metadata,
 * assets, bindings, paths, connectors and non-bridge node types.
 */
export function validateWhiteboardNativeDocument(document: unknown): { valid: boolean; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return { valid: false, diagnostics: [diag("INVALID_DOCUMENT", "document must be an object")] };
  }

  const d = document as Record<string, unknown>;
  const version = d.version;
  const scene = d.scene as SketchSceneDocument | undefined;
  for (const key of Object.keys(d)) {
    if (!nativeDocumentKeys.has(key)) diagnostics.push(diag("UNSUPPORTED_DOCUMENT_FIELD", `document field ${key} is not part of the native whiteboard document`));
  }
  if (typeof d.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(d.id)) {
    diagnostics.push(diag("INVALID_ID", "invalid document id"));
  }
  if (version !== 2 && version !== 3) {
    diagnostics.push(diag("INVALID_VERSION", "version must be 2 or 3"));
  }
  if (version === 3 && d.sceneFormat !== WHITEBOARD_SCENE_FORMAT) {
    diagnostics.push(diag("INVALID_SCENE_FORMAT", "sceneFormat must be sketch-scene-v1"));
  }
  if (version === 2 && d.sceneFormat !== undefined) {
    diagnostics.push(diag("UNSUPPORTED_DOCUMENT_FIELD", "sceneFormat is only supported by V3 documents"));
  }
  if (version === 2 || version === 3) {
    if (!Number.isInteger(d.documentRevision) || (d.documentRevision as number) < 0) {
      diagnostics.push(diag("INVALID_VERSION", "documentRevision must be a non-negative integer"));
    }
  }

  const view = d.editorView as Partial<WhiteboardEditorView> | undefined;
  if (!view || typeof view !== "object" || Array.isArray(view)) {
    diagnostics.push(diag("INVALID_EDITOR_VIEW", "editorView is required"));
  } else {
    for (const key of Object.keys(view)) {
      if (!["zoom", "offsetX", "offsetY"].includes(key)) diagnostics.push(diag("UNSUPPORTED_EDITOR_VIEW_FIELD", `editorView field ${key} is not part of the native whiteboard document`));
    }
    if (![view.zoom, view.offsetX, view.offsetY].every((value) => typeof value === "number" && Number.isFinite(value)) || (view.zoom as number) <= 0) {
      diagnostics.push(diag("INVALID_EDITOR_VIEW", "editorView values must be finite and zoom must be positive"));
    }
  }
  if (typeof d.updatedAt !== "number" || !Number.isFinite(d.updatedAt) || d.updatedAt < 0) {
    diagnostics.push(diag("INVALID_TIMESTAMP", "updatedAt must be a finite non-negative number"));
  }
  if (!scene || !validateSketchSceneDocument(scene).valid) {
    diagnostics.push(diag("INVALID_SCENE", "scene does not satisfy the Sketch protocol"));
  }

  const semantics = d.nodeSemantics;
  if (!semantics || typeof semantics !== "object" || Array.isArray(semantics)) {
    diagnostics.push(diag("INVALID_SEMANTICS", "nodeSemantics is required"));
  } else {
    const nodes = scene?.nodes ?? [];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const [nodeId, value] of Object.entries(semantics)) {
      if (!nodeIds.has(nodeId)) diagnostics.push(diag("ORPHAN_SEMANTICS", "semantics references missing node", { nodeId }));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        diagnostics.push(diag("INVALID_SEMANTICS", "node semantics must be an object", { nodeId }));
        continue;
      }
      const semantic = value as Record<string, unknown>;
      if (nodeById.get(nodeId)?.type === "group" && (semantic.role !== undefined || semantic.assetRef !== undefined)) {
        diagnostics.push(diag("INVALID_GROUP_SEMANTICS", "group nodes cannot carry role or assetRef", { nodeId }));
      }
      if (semantic.role !== undefined && (typeof semantic.role !== "string" || !roleSet.has(semantic.role))) {
        diagnostics.push(diag("INVALID_ROLE", "unsupported semantic role", { nodeId }));
      }
      if (semantic.assetRef !== undefined && (!assetIdPattern.test(String(semantic.assetRef)) || nodeById.get(nodeId)?.type !== "image")) {
        diagnostics.push(diag("INVALID_ASSET_REF", "assetRef must be a managed id attached to an image node", { nodeId }));
      }
      if (Object.keys(semantic).some((key) => key !== "role" && key !== "assetRef")) {
        diagnostics.push(diag("UNSUPPORTED_SEMANTICS", "unknown node semantics field", { nodeId }));
      }
    }
  }

  if (d.safeArea !== undefined) {
    const safeArea = d.safeArea as Partial<WhiteboardSafeArea> | null;
    const safeAreaObject = safeArea !== null && typeof safeArea === "object" && !Array.isArray(safeArea);
    if (safeAreaObject) {
      for (const key of Object.keys(safeArea)) {
        if (!["x", "y", "width", "height"].includes(key)) diagnostics.push(diag("UNSUPPORTED_SAFE_AREA_FIELD", `safeArea field ${key} is not part of the native whiteboard document`));
      }
    }
    const pageSize = scene && typeof scene === "object" && !Array.isArray(scene) ? scene.pageSize : undefined;
    const valid = safeAreaObject
      && pageSize
      && [safeArea.x, safeArea.y, safeArea.width, safeArea.height].every((value) => typeof value === "number" && Number.isFinite(value))
      && safeArea.x! >= 0 && safeArea.y! >= 0 && safeArea.width! >= 0 && safeArea.height! >= 0
      && safeArea.x! + safeArea.width! <= pageSize.width
      && safeArea.y! + safeArea.height! <= pageSize.height;
    if (!valid) diagnostics.push(diag("INVALID_SAFE_AREA", "safeArea must be within page bounds"));
  }

  return { valid: diagnostics.length === 0, diagnostics };
}

/** Preferred generic name for the full/native document validator. */
export const validateWhiteboardDocument = validateWhiteboardNativeDocument;

/**
 * Validate the restricted html-css-v2 projection. This validator is only for
 * code import/export and AI bridge actions; it is deliberately stricter than
 * the native whiteboard document validator below.
 */
export function validateWhiteboardBridgeDocument(document: unknown): { valid: boolean; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) return { valid: false, diagnostics: [diag("INVALID_DOCUMENT", "document must be an object")] };
  const d = document as Partial<WhiteboardDocument> & { sceneFormat?: unknown }; const scene = d.scene;
  if (typeof d.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(d.id)) diagnostics.push(diag("INVALID_ID", "invalid document id"));
  if ((d.version !== 2 && d.version !== 3) || !Number.isInteger(d.documentRevision) || (d.documentRevision ?? -1) < 0) diagnostics.push(diag("INVALID_VERSION", "version must be 2 or 3 and documentRevision a non-negative integer"));
  if (d.version === 3 && d.sceneFormat !== WHITEBOARD_SCENE_FORMAT) diagnostics.push(diag("INVALID_SCENE_FORMAT", "sceneFormat must be sketch-scene-v1"));
  if (d.version !== 3 && d.sceneFormat !== undefined) diagnostics.push(diag("UNSUPPORTED_DOCUMENT_FIELD", "sceneFormat is only supported by V3 documents"));
  for (const key of Object.keys(d)) if (!allowedDocumentKeys.has(key)) diagnostics.push(diag("UNSUPPORTED_DOCUMENT_FIELD", `document field ${key} is not supported by the bridge profile`));
  const editorView = d.editorView;
  if (!editorView || typeof editorView !== "object" || Array.isArray(editorView)) diagnostics.push(diag("INVALID_EDITOR_VIEW", "editorView is required"));
  else {
    for (const key of Object.keys(editorView)) if (!["zoom", "offsetX", "offsetY"].includes(key)) diagnostics.push(diag("UNSUPPORTED_EDITOR_VIEW_FIELD", `editorView field ${key} is not supported`));
    if (![editorView.zoom, editorView.offsetX, editorView.offsetY].every(Number.isFinite) || editorView.zoom <= 0) diagnostics.push(diag("INVALID_EDITOR_VIEW", "editorView values must be finite and zoom must be positive"));
  }
  if (typeof d.updatedAt !== "number" || !Number.isFinite(d.updatedAt) || d.updatedAt < 0) diagnostics.push(diag("INVALID_TIMESTAMP", "updatedAt must be a finite non-negative number"));
  if (!scene || !validateSketchSceneDocument(scene).valid) diagnostics.push(diag("INVALID_SCENE", "scene does not satisfy the Sketch protocol"));
  if (scene?.assets?.length) diagnostics.push(diag("UNSUPPORTED_SCENE_FIELD", "scene assets must be represented by nodeSemantics.assetRef"));
  if (scene?.bindings && Object.keys(scene.bindings).length) diagnostics.push(diag("UNSUPPORTED_SCENE_FIELD", "scene bindings are not part of the whiteboard bridge"));
  if (scene?.metadata && Object.keys(scene.metadata).length) diagnostics.push(diag("UNSUPPORTED_SCENE_FIELD", "scene metadata is not part of the whiteboard bridge"));
  const ids = new Set<string>();
  const sceneNodes = scene && Array.isArray(scene.nodes) ? scene.nodes : [];
  for (const candidate of sceneNodes) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      diagnostics.push(diag("INVALID_NODE", "node must be an object"));
      continue;
    }
    const node = candidate as SketchSceneNode;
    for (const key of Object.keys(node)) if (!allowedNodeKeys.has(key)) diagnostics.push(diag("UNSUPPORTED_NODE_FIELD", `node field ${key} is not supported by the bridge profile`, { nodeId: typeof node.id === "string" ? node.id : undefined }));
    if (!isBridgeNodeType(node.type)) diagnostics.push(diag("UNSUPPORTED_NODE", `node type ${String(node.type)} is not in bridge profile`, { nodeId: node.id }));
    if (!idPattern.test(node.id) || ids.has(node.id)) diagnostics.push(diag(ids.has(node.id) ? "DUPLICATE_NODE_ID" : "MISSING_NODE_ID", "node id must be unique and valid", { nodeId: node.id })); else ids.add(node.id);
    if (![node.x, node.y, node.width, node.height].every(Number.isFinite) || node.x < 0 || node.y < 0 || node.width <= 0 || node.height <= 0 || (scene && (node.x + node.width > scene.pageSize.width || node.y + node.height > scene.pageSize.height))) diagnostics.push(diag("INVALID_GEOMETRY", "node geometry must be finite and within the page", { nodeId: node.id }));
    if (node.type === "group" && scene && node.children?.some((child) => !scene.nodes.some((candidate) => candidate.id === child))) diagnostics.push(diag("INVALID_GROUP", "group contains an unknown child", { nodeId: node.id }));
    if (node.type === "image" && node.src && !isManagedAssetPath(node.src)) diagnostics.push(diag("UNLOCALIZED_RESOURCE", "image src must reference a localized workspace asset", { nodeId: node.id, suggestion: "Upload or place the image as a managed asset before committing." }));
    if (node.style) {
      for (const [key, value] of Object.entries(node.style)) {
        if (!bridgeStyleKeys.has(key)) diagnostics.push(diag("UNSUPPORTED_STYLE", `style field ${key} is not supported by the bridge profile`, { nodeId: node.id }));
        if (typeof value === "string" && !isSafeCssToken(value)) diagnostics.push(diag("UNSAFE_STYLE", `style value for ${key} is not portable`, { nodeId: node.id }));
      }
      if (node.style.opacity !== undefined && (typeof node.style.opacity !== "number" || node.style.opacity < 0 || node.style.opacity > 1)) diagnostics.push(diag("INVALID_STYLE", "opacity must be between 0 and 1", { nodeId: node.id }));
      if (node.style.imageFit !== undefined && node.type !== "image") diagnostics.push(diag("INVALID_STYLE", "imageFit is only supported on image nodes", { nodeId: node.id }));
      for (const [key, value] of [["strokeWidth", node.style.strokeWidth], ["radius", node.style.radius], ["fontSize", node.style.fontSize]] as const) {
        if (value !== undefined && (!Number.isFinite(value) || value < 0)) diagnostics.push(diag("INVALID_STYLE", `${key} must be a finite non-negative number`, { nodeId: node.id }));
      }
    }
    const allowedHiddenGroup = node.type === "group" && node.visible === false && node.locked === undefined;
    if ((node.visible !== undefined && !allowedHiddenGroup) || node.locked !== undefined || node.name !== undefined || node.bindings !== undefined || node.textStyleRuns !== undefined || node.metadata !== undefined) diagnostics.push(diag("UNSUPPORTED_NODE_FIELD", "node contains a field outside the bridge profile", { nodeId: node.id }));
    if (node.text !== undefined && node.type !== "text" && node.type !== "button") diagnostics.push(diag("UNSUPPORTED_NODE_FIELD", "text is only supported on text and button nodes", { nodeId: node.id }));
    if (node.src !== undefined && node.type !== "image") diagnostics.push(diag("UNSUPPORTED_NODE_FIELD", "src is only supported on image nodes", { nodeId: node.id }));
    if (node.alt !== undefined && node.type !== "image") diagnostics.push(diag("UNSUPPORTED_NODE_FIELD", "alt is only supported on image nodes", { nodeId: node.id }));
    if (node.type !== "image" && (node.intrinsicWidth !== undefined || node.intrinsicHeight !== undefined || node.imageCrop !== undefined)) diagnostics.push(diag("UNSUPPORTED_NODE_FIELD", "image dimensions and crop data are only supported on image nodes", { nodeId: node.id }));
    const intrinsicWidth = node.intrinsicWidth;
    const intrinsicHeight = node.intrinsicHeight;
    if (node.type === "image" && ((intrinsicWidth !== undefined) !== (intrinsicHeight !== undefined) || (intrinsicWidth !== undefined && intrinsicHeight !== undefined && (!Number.isFinite(intrinsicWidth) || intrinsicWidth <= 0 || !Number.isFinite(intrinsicHeight) || intrinsicHeight <= 0)))) diagnostics.push(diag("INVALID_IMAGE_SIZE", "image intrinsic dimensions must be two positive finite values", { nodeId: node.id }));
    if (node.type === "image" && node.imageCrop !== undefined && !isValidSketchSceneImageCrop(node.imageCrop)) diagnostics.push(diag("INVALID_IMAGE_CROP", "imageCrop must use finite source coordinates with a visible source intersection", { nodeId: node.id }));
  }
  const semantics = d.nodeSemantics;
  if (!semantics || typeof semantics !== "object" || Array.isArray(semantics)) diagnostics.push(diag("INVALID_SEMANTICS", "nodeSemantics is required"));
  for (const [id, value] of Object.entries(semantics ?? {})) {
    if (!ids.has(id)) diagnostics.push(diag("ORPHAN_SEMANTICS", "semantics references missing node", { nodeId: id }));
    if (!value || typeof value !== "object" || Array.isArray(value)) diagnostics.push(diag("INVALID_SEMANTICS", "node semantics must be an object", { nodeId: id }));
    else {
      const semanticsValue = value as WhiteboardNodeSemantics;
      if (scene?.nodes.find((node) => node.id === id)?.type === "group" && (semanticsValue.role !== undefined || semanticsValue.assetRef !== undefined)) diagnostics.push(diag("INVALID_GROUP_SEMANTICS", "group nodes cannot carry role or assetRef", { nodeId: id }));
      if (semanticsValue.role !== undefined && !roleSet.has(semanticsValue.role)) diagnostics.push(diag("INVALID_ROLE", "unsupported semantic role", { nodeId: id }));
      if (semanticsValue.assetRef !== undefined && (!assetIdPattern.test(semanticsValue.assetRef) || scene?.nodes.find((node) => node.id === id)?.type !== "image")) diagnostics.push(diag("INVALID_ASSET_REF", "assetRef must be a managed id attached to an image node", { nodeId: id }));
      if (Object.keys(semanticsValue).some((key) => key !== "role" && key !== "assetRef")) diagnostics.push(diag("UNSUPPORTED_SEMANTICS", "unknown node semantics field", { nodeId: id }));
    }
  }
  if (d.safeArea && scene) {
    for (const key of Object.keys(d.safeArea)) if (!["x", "y", "width", "height"].includes(key)) diagnostics.push(diag("UNSUPPORTED_SAFE_AREA_FIELD", `safeArea field ${key} is not supported`));
    if (![d.safeArea.x, d.safeArea.y, d.safeArea.width, d.safeArea.height].every(Number.isFinite) || d.safeArea.x < 0 || d.safeArea.y < 0 || d.safeArea.width < 0 || d.safeArea.height < 0 || d.safeArea.x + d.safeArea.width > scene.pageSize.width || d.safeArea.y + d.safeArea.height > scene.pageSize.height) diagnostics.push(diag("INVALID_SAFE_AREA", "safeArea must be within page bounds"));
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Canonicalize a durable/native document without changing its renderable
 * meaning. The only scene normalization is deterministic ordering; all scene
 * fields and their values remain present.
 */
export function canonicalizeWhiteboardNativeDocument(document: WhiteboardDocument): WhiteboardDocumentV3 {
  const validation = validateWhiteboardNativeDocument(document);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => item.message).join("；") || "白板文档无效");
  // Keep the original array order for equal z-index values. The Sketch
  // renderer uses that order as the final painter's-order tie breaker, so a
  // lexical ID tie breaker would change the visual result of overlapping
  // nodes while pretending to be a semantics-preserving normalization.
  const nodes = document.scene.nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => (left.node.zIndex ?? 0) - (right.node.zIndex ?? 0) || left.index - right.index)
    .map(({ node }) => node);
  const scene = {
    ...document.scene,
    nodes,
    ...(document.scene.assets ? { assets: [...document.scene.assets].sort((a, b) => a.id.localeCompare(b.id)) } : {}),
    ...(document.scene.bindings ? { bindings: sortRecord(document.scene.bindings) } : {}),
    ...(document.scene.metadata ? { metadata: sortRecord(document.scene.metadata) } : {}),
  };
  const nodeSemantics: Record<string, WhiteboardNodeSemantics> = {};
  for (const [nodeId, semantics] of Object.entries(document.nodeSemantics)) {
    nodeSemantics[nodeId] = { ...semantics };
  }
  return {
    ...document,
    version: 3,
    sceneFormat: WHITEBOARD_SCENE_FORMAT,
    documentRevision: document.documentRevision,
    scene,
    nodeSemantics: sortRecord(nodeSemantics),
  };
}

/** Preferred explicit name for the full/native canonicalizer. */
export const canonicalizeWhiteboardDocument = canonicalizeWhiteboardNativeDocument;

/**
 * Canonicalize only the html-css-v2 bridge projection. This is intentionally
 * lossy for fields the bridge cannot express and must never be used for
 * durable/native persistence.
 */
export function canonicalizeWhiteboardBridgeDocument(document: WhiteboardDocument): WhiteboardDocumentV2 {
  const validation = validateWhiteboardBridgeDocument(document);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => item.message).join("；") || "白板桥接文档无效");
  const nodes = [...document.scene.nodes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.id.localeCompare(b.id)).map((node, index) => ({ ...node, zIndex: index }));
  const semantics: Record<string, WhiteboardNodeSemantics> = {};
  for (const node of nodes) if (document.nodeSemantics[node.id]) semantics[node.id] = { ...document.nodeSemantics[node.id] };
  const { sceneFormat: _sceneFormat, ...envelope } = document.version === 3 ? document : { ...document, sceneFormat: undefined };
  return {
    ...envelope,
    version: 2,
    scene: { ...document.scene, version: 1, nodes, assets: [], bindings: {}, metadata: {} },
    nodeSemantics: semantics,
  };
}

/** Return a deterministic selection summary for AI context and plans. */
export function getWhiteboardSelection(document: WhiteboardDocument, nodeIds: readonly string[] = []): WhiteboardSelection {
  const ids = [...new Set(nodeIds)].filter((nodeId) => document.scene.nodes.some((node) => node.id === nodeId));
  const selected = document.scene.nodes.filter((node) => ids.includes(node.id));
  if (!selected.length) return { nodeIds: ids, bounds: null };
  const left = Math.min(...selected.map((node) => node.x));
  const top = Math.min(...selected.map((node) => node.y));
  const right = Math.max(...selected.map((node) => node.x + node.width));
  const bottom = Math.max(...selected.map((node) => node.y + node.height));
  return { nodeIds: ids, bounds: { x: left, y: top, width: right - left, height: bottom - top } };
}

export function serializeWhiteboardCode(document: WhiteboardDocument): ConversionResult<{ html: string; css: string }> {
  const validation = validateWhiteboardBridgeDocument(document);
  if (!validation.valid) return { diagnostics: validation.diagnostics };
  const d = canonicalizeWhiteboardBridgeDocument(document);
  const htmlNodes = d.scene.nodes.map((node) => {
    const semantics = d.nodeSemantics[node.id] ?? {}; const attrs = [`data-sketch-id="${esc(node.id)}"`, `data-sketch-kind="${node.type}"`];
    if (semantics.role) attrs.push(`data-sketch-role="${semantics.role}"`); if (semantics.assetRef) attrs.push(`data-asset-ref="${esc(semantics.assetRef)}"`); if (node.children?.length) attrs.push(`data-sketch-children="${esc(node.children.join(","))}"`); if (node.type === "image") { attrs.push(`src="${esc(node.src ?? "")}"`); if (node.alt) attrs.push(`alt="${esc(node.alt)}"`); if (node.intrinsicWidth !== undefined && node.intrinsicHeight !== undefined) attrs.push(`data-sketch-image-size="${node.intrinsicWidth},${node.intrinsicHeight}"`); if (node.imageCrop) attrs.push(`data-sketch-image-crop="${serializeImageCrop(node.imageCrop)}"`); }
    const body = node.type === "text" || node.type === "button" ? textEsc(node.text ?? "") : ""; const tag = (tagFor as Record<string, string>)[node.type];
    return `  <${tag} ${attrs.join(" ")}>${body}</${tag}>`;
  }).join("\n");
  const html = `<main data-sketch-canvas="v1" data-width="${d.scene.pageSize.width}" data-height="${d.scene.pageSize.height}">\n${htmlNodes}\n</main>`;
  const css = d.scene.nodes.map((node) => `[data-sketch-id="${esc(node.id)}"] { ${styleToCss(node.style, node)} }`).join("\n");
  return { value: { html, css }, diagnostics: [] };
}

export function parseWhiteboardCode(html: string, css = "", options: { id?: string; maxBytes?: number; maxNodes?: number; maxDepth?: number } = {}): ConversionResult<WhiteboardDocumentV2> {
  const diagnostics: Diagnostic[] = []; const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  if (typeof html !== "string" || typeof css !== "string") return { diagnostics: [diag("INVALID_INPUT", "HTML and CSS must be strings")] };
  if (new TextEncoder().encode(html).length + new TextEncoder().encode(css).length > maxBytes) return { diagnostics: [diag("INPUT_TOO_LARGE", "HTML/CSS exceeds input limit", { range: { start: 0, end: html.length + css.length } })] };
  if (/<(?:script|iframe|object|embed|style)\b/i.test(html) || /@(?:import|media|supports|keyframes)\b/i.test(css)) diagnostics.push(diag("UNSUPPORTED_CONTENT", "scripts, embeds, style blocks and CSS at-rules are not supported"));
  const mainMatch = html.match(/<main\b([^>]*)>([\s\S]*)<\/main\s*>/i);
  if (!mainMatch || !/\bdata-sketch-canvas\s*=\s*["']v1["']/i.test(mainMatch[1])) return { diagnostics: [diag("INVALID_CANVAS", "expected main[data-sketch-canvas=\"v1\"]")] };
  validateCanvasAttrs(mainMatch[1], (mainMatch.index ?? 0) + 5, diagnostics);
  if (mainMatch.index !== undefined && `${html.slice(0, mainMatch.index)}${html.slice(mainMatch.index + mainMatch[0].length)}`.trim()) diagnostics.push(diag("UNSUPPORTED_HTML", "only one main[data-sketch-canvas=\"v1\"] root is allowed"));
  const width = numeric(mainMatch[1].match(/\bdata-width\s*=\s*["']([^"']+)["']/i)?.[1]); const height = numeric(mainMatch[1].match(/\bdata-height\s*=\s*["']([^"']+)["']/i)?.[1]);
  if (!width || !height || width <= 0 || height <= 0 || width > 10_000 || height > 10_000) diagnostics.push(diag("INVALID_PAGE_SIZE", "canvas width and height must be positive and bounded"));
  const rules = parseCss(css, diagnostics); const body = mainMatch[2];
  const bodyOffset = (mainMatch.index ?? 0) + mainMatch[0].indexOf(">") + 1;
  const maxDepth = options.maxDepth ?? 8;
  let depth = 0; let observedDepth = 0;
  for (const token of body.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const raw = token[0];
    if (/^<\//.test(raw)) depth = Math.max(0, depth - 1);
    else if (!/\/\s*>$/.test(raw)) { depth += 1; observedDepth = Math.max(observedDepth, depth); }
  }
  if (observedDepth > maxDepth) diagnostics.push(diag("DEPTH_LIMIT", `HTML nesting depth ${observedDepth} exceeds limit ${maxDepth}`, { suggestion: "Flatten nested elements and use data-sketch-children for groups." }));
  const nestedBridgeNodes: Array<{ id: string; range: { start: number; end: number }; depth: number }> = [];
  const openTags: string[] = [];
  for (const token of body.matchAll(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const raw = token[0];
    if (raw.startsWith("</")) {
      openTags.pop();
      continue;
    }
    const attrSource = token[2] ?? "";
    const id = attrSource.match(/\bdata-sketch-id\s*=\s*(["'])([^"']+)\1/i)?.[2];
    if (id) nestedBridgeNodes.push({ id, depth: openTags.length, range: { start: bodyOffset + token.index!, end: bodyOffset + token.index! + raw.length } });
    if (!/\/\s*>$/.test(raw)) openTags.push(token[1].toLowerCase());
  }
  if (nestedBridgeNodes.some((node) => node.depth > 0)) {
    for (const node of nestedBridgeNodes) diagnostics.push(diag("NESTED_NODE", "nested editable elements are not supported; use group children metadata", { nodeId: node.id, range: node.range, suggestion: "Flatten bridge nodes and declare group relationships with data-sketch-children." }));
  }
  const nodeRe = /<([a-z][a-z0-9]*)\b([^>]*?)(?:\s*\/)?>([\s\S]*?)<\/\1\s*>|<([a-z][a-z0-9]*)\b([^>]*?)\s*\/?>/gi;
  const nodes: SketchSceneNode[] = []; const semantics: Record<string, WhiteboardNodeSemantics> = {}; const seen = new Set<string>(); let match: RegExpExecArray | null;
  while ((match = nodeRe.exec(body))) {
    if (nodes.length >= (options.maxNodes ?? 500)) { diagnostics.push(diag("NODE_LIMIT", "node count exceeds limit", { range: { start: match.index, end: nodeRe.lastIndex } })); break; }
    const tag = (match[1] ?? match[4]).toLowerCase(); const attrSource = match[2] ?? match[5] ?? ""; const attrs = parseAttrs(attrSource, match.index, diagnostics); const id = attrs.get("data-sketch-id"); const kindValue = attrs.get("data-sketch-kind");
    if (!id || !idPattern.test(id)) { diagnostics.push(diag("INVALID_NODE_ID", "data-sketch-id is required and must be valid", { range: { start: match.index, end: nodeRe.lastIndex } })); continue; }
    if (seen.has(id)) { diagnostics.push(diag("DUPLICATE_NODE_ID", "duplicate data-sketch-id", { nodeId: id, range: { start: match.index, end: nodeRe.lastIndex } })); continue; }
    seen.add(id);
    if (!kindValue || !isBridgeNodeType(kindValue)) { diagnostics.push(diag("UNSUPPORTED_NODE", `unsupported or missing data-sketch-kind: ${kindValue ?? ""}`, { nodeId: id, range: { start: match.index, end: nodeRe.lastIndex } })); continue; }
    if (!(tagKinds[tag] ?? []).includes(kindValue)) diagnostics.push(diag("TAG_KIND_MISMATCH", `${tag} cannot represent ${kindValue}`, { nodeId: id }));
    const content = match[3] ?? "";
    if (kindValue !== "text" && kindValue !== "button" && content.replace(/<[^>]*>/g, "").trim()) diagnostics.push(diag("UNSUPPORTED_NODE_CONTENT", `${kindValue} nodes cannot contain text content`, { nodeId: id }));
    if (attrs.has("src") && kindValue !== "image") diagnostics.push(diag("UNSUPPORTED_ATTRIBUTE", "src is only supported on image nodes", { nodeId: id }));
    if (attrs.has("data-sketch-children") && kindValue !== "group") diagnostics.push(diag("UNSUPPORTED_ATTRIBUTE", "data-sketch-children is only supported on group nodes", { nodeId: id }));
    if (attrs.has("data-sketch-image-size") && kindValue !== "image") diagnostics.push(diag("UNSUPPORTED_ATTRIBUTE", "data-sketch-image-size is only supported on image nodes", { nodeId: id }));
    if (attrs.has("data-sketch-image-crop") && kindValue !== "image") diagnostics.push(diag("UNSUPPORTED_ATTRIBUTE", "data-sketch-image-crop is only supported on image nodes", { nodeId: id }));
    const imageSize = kindValue === "image" ? numberTuple(attrs.get("data-sketch-image-size"), 2) : undefined;
    if (kindValue === "image" && attrs.has("data-sketch-image-size") && (!imageSize || !imageSize.every((part) => part > 0))) diagnostics.push(diag("INVALID_IMAGE_SIZE", "data-sketch-image-size must contain two positive pixel values", { nodeId: id }));
    const imageCrop = kindValue === "image" ? parseImageCrop(attrs.get("data-sketch-image-crop"), id, diagnostics) : undefined;
    const declarations = rules.get(id); if (!declarations) { diagnostics.push(diag("MISSING_CSS_RULE", `missing CSS rule for ${id}`, { nodeId: id })); continue; }
    const x = numeric(declarations.get("left")); const y = numeric(declarations.get("top")); const w = numeric(declarations.get("width")); const h = numeric(declarations.get("height")); if ([x, y, w, h].some((value) => value === undefined)) { diagnostics.push(diag("MISSING_GEOMETRY", "left/top/width/height are required", { nodeId: id })); continue; }
    const style: SketchSceneStyle = {}; if (declarations.has("background")) style.fill = declarations.get("background"); if (declarations.has("color")) style.color = declarations.get("color"); if (declarations.has("border-color")) style.stroke = declarations.get("border-color"); const strokeWidth = numeric(declarations.get("border-width")); if (strokeWidth !== undefined) style.strokeWidth = strokeWidth; const radius = numeric(declarations.get("border-radius")); if (radius !== undefined) style.radius = radius; const opacity = declarations.has("opacity") ? Number(declarations.get("opacity")) : undefined; if (opacity !== undefined && Number.isFinite(opacity)) style.opacity = opacity; const fontSize = numeric(declarations.get("font-size")); if (fontSize !== undefined) style.fontSize = fontSize; const fontWeight = declarations.get("font-weight"); if (fontWeight) style.fontWeight = /^\d+(?:\.\d+)?$/.test(fontWeight) ? Number(fontWeight) : fontWeight; const textAlign = declarations.get("text-align"); if (textAlign === "left" || textAlign === "center" || textAlign === "right") style.textAlign = textAlign; const imageFit = declarations.get("object-fit"); if (imageFit === "cover" || imageFit === "contain" || imageFit === "fill") style.imageFit = imageFit;
    const transform = declarations.get("transform"); let rotation: number | undefined; if (transform) { const parsedRotation = transform.match(/^rotate\((-?(?:\d+\.?\d*|\.\d+))deg\)$/); if (!parsedRotation) diagnostics.push(diag("UNSUPPORTED_CSS_VALUE", "only rotate(<degrees>deg) is supported", { nodeId: id })); else rotation = Number(parsedRotation[1]); }
    const assetRef = attrs.get("data-asset-ref");
    const imageSrc = attrs.get("src") || (assetRef && assetIdPattern.test(assetRef) ? `assets/${assetRef}` : "");
    const node: SketchSceneNode = { id, type: kindValue, x: x!, y: y!, width: w!, height: h!, zIndex: Number(declarations.get("z-index") ?? 0), ...(kindValue === "group" ? { visible: false } : {}), ...(rotation === undefined ? {} : { rotation }), ...(Object.keys(style).length ? { style } : {}), ...(kindValue === "text" || kindValue === "button" ? { text: decodeText(content.replace(/<[^>]*>/g, "")) } : {}), ...(kindValue === "image" ? { src: imageSrc, ...(imageSize ? { intrinsicWidth: imageSize[0], intrinsicHeight: imageSize[1] } : {}), ...(imageCrop ? { imageCrop } : {}) } : {}), ...(attrs.get("alt") ? { alt: attrs.get("alt") } : {}), ...(attrs.get("data-sketch-children") ? { children: attrs.get("data-sketch-children")!.split(",").filter(Boolean) } : {}) };
    if (node.type === "image" && node.src && !isManagedAssetPath(node.src)) diagnostics.push(diag("UNLOCALIZED_RESOURCE", "image src must reference a localized workspace asset", { nodeId: id, suggestion: "Upload or place the image as a managed asset before import." }));
    nodes.push(node); const role = attrs.get("data-sketch-role"); if (role !== undefined && !roleSet.has(role)) diagnostics.push(diag("INVALID_ROLE", `unsupported role ${role}`, { nodeId: id })); if (assetRef !== undefined && !assetIdPattern.test(assetRef)) diagnostics.push(diag("INVALID_ASSET_REF", "assetRef must be a managed asset id", { nodeId: id })); if (role !== undefined || assetRef !== undefined) semantics[id] = { ...(role && roleSet.has(role) ? { role: role as SemanticRole } : {}), ...(assetRef && assetIdPattern.test(assetRef) ? { assetRef } : {}) };
  }
  if (body.replace(nodeRe, "").trim()) diagnostics.push(diag("UNSUPPORTED_HTML", "canvas contains text or elements outside the bridge grammar"));
  for (const id of rules.keys()) if (!seen.has(id)) diagnostics.push(diag("ORPHAN_CSS_RULE", `CSS rule ${id} has no matching bridge node`, { nodeId: id, suggestion: "Add the matching data-sketch-id element or remove the rule." }));
  if (diagnostics.length || !width || !height) return { diagnostics };
  const document: WhiteboardDocumentV2 = { id: options.id ?? "whiteboard", version: 2, documentRevision: 0, scene: { version: 1, pageSize: { width, height }, nodes, assets: [], bindings: {}, metadata: {} }, nodeSemantics: semantics, editorView: { zoom: 1, offsetX: 0, offsetY: 0 }, updatedAt: Date.now() };
  const validation = validateWhiteboardBridgeDocument(document); return validation.valid ? { value: canonicalizeWhiteboardBridgeDocument(document), diagnostics: [] } : { diagnostics: validation.diagnostics };
}

export type WhiteboardAction =
  | { type: "updateNode"; nodeId: string; patch: Partial<Pick<SketchSceneNode, "x" | "y" | "width" | "height" | "text" | "rotation" | "style">> }
  | { type: "updateRole"; nodeId: string; role?: SemanticRole }
  | { type: "placeAsset"; nodeId: string; assetId: string; src: string }
  | { type: "setImageFit"; nodeId: string; fit: "cover" | "contain" | "fill" }
  | { type: "setImageCrop"; nodeId: string; crop: SketchSceneImageCrop | null; frame?: SketchSceneFrame }
  | { type: "removeNode"; nodeId: string }
  | { type: "addText"; nodeId?: string; text: string; x: number; y: number; width: number; height: number; role?: SemanticRole }
  | { type: "align"; nodeIds: string[]; axis: "left" | "center" | "right" | "top" | "middle" | "bottom" }
  | { type: "distribute"; nodeIds: string[]; axis: "horizontal" | "vertical" };

export function applyWhiteboardActions(document: WhiteboardDocument, actions: readonly WhiteboardAction[]): ConversionResult<WhiteboardDocument> {
  // Actions operate on the durable/native scene, not the lossy HTML/CSS
  // bridge projection. Native V3 scenes intentionally retain metadata,
  // bindings and asset-library entries that the bridge validator rejects.
  const initialValidation = validateWhiteboardNativeDocument(document);
  if (!initialValidation.valid) return { diagnostics: initialValidation.diagnostics };
  const next = cloneJson(document) as WhiteboardDocument;
  const diagnostics: Diagnostic[] = [];
  const idMapping: Record<string, string> = {};
  const touchedGeometry = new Set<string>();
  const find = (nodeId: string) => next.scene.nodes.findIndex((node) => node.id === nodeId);
  for (const [actionIndex, action] of actions.entries()) {
    if (!action || typeof action !== "object" || typeof action.type !== "string") {
      diagnostics.push(diag("INVALID_ACTION", "whiteboard action must have a type"));
      continue;
    }
    if (!whiteboardActionTypes.has(action.type)) {
      diagnostics.push(diag("INVALID_ACTION", `unsupported whiteboard action ${action.type}`));
      continue;
    }
    if (typeof (action as { nodeId?: unknown }).nodeId !== "string" && !["addText", "align", "distribute"].includes(action.type)) {
      diagnostics.push(diag("INVALID_ACTION", "nodeId is required for this whiteboard action"));
      continue;
    }
    if (action.type === "setImageFit" && !["cover", "contain", "fill"].includes(action.fit)) {
      diagnostics.push(diag("INVALID_ACTION", "setImageFit fit must be cover, contain or fill"));
      continue;
    }
    if (action.type === "setImageCrop") {
      const frame = action.frame;
      const validFrame = frame === undefined
        || (frame && Number.isFinite(frame.x) && Number.isFinite(frame.y) && Number.isFinite(frame.width) && Number.isFinite(frame.height) && frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0);
      if ((action.crop !== null && !isValidSketchSceneImageCrop(action.crop)) || !validFrame) {
        diagnostics.push(diag("INVALID_ACTION", "setImageCrop requires valid crop data and an optional positive frame", { nodeId: action.nodeId }));
        continue;
      }
    }
    if ((action.type === "align" && !["left", "center", "right", "top", "middle", "bottom"].includes(action.axis)) || (action.type === "distribute" && !["horizontal", "vertical"].includes(action.axis))) {
      diagnostics.push(diag("INVALID_ACTION", "alignment axis is not supported"));
      continue;
    }
    if (action.type === "updateNode") {
      if (!action.patch || typeof action.patch !== "object" || Array.isArray(action.patch)) { diagnostics.push(diag("INVALID_ACTION", "updateNode patch must be an object", { nodeId: action.nodeId })); continue; }
      const unknownPatchKeys = Object.keys(action.patch).filter((key) => !updateNodeKeys.has(key));
      if (unknownPatchKeys.length) { diagnostics.push(diag("INVALID_ACTION", `updateNode fields are not supported: ${unknownPatchKeys.join(", ")}`, { nodeId: action.nodeId })); continue; }
      if (action.patch.style !== undefined && (typeof action.patch.style !== "object" || Array.isArray(action.patch.style) || Object.keys(action.patch.style).some((key) => !bridgeStyleKeys.has(key)))) { diagnostics.push(diag("INVALID_ACTION", "updateNode style contains unsupported fields", { nodeId: action.nodeId })); continue; }
    }
    if (action.type === "addText") {
      let id = action.nodeId;
      if (!id) {
        let suffix = 1;
        do { id = `text-${suffix++}`; } while (find(id) >= 0);
        idMapping[`addText:${actionIndex}`] = id;
      }
      if (!idPattern.test(id) || find(id) >= 0) { diagnostics.push(diag("DUPLICATE_NODE_ID", `node id ${id} is already in use`, { nodeId: id })); continue; }
      next.scene.nodes.push({ id, type: "text", x: action.x, y: action.y, width: action.width, height: action.height, text: action.text, zIndex: next.scene.nodes.length }); if (action.role) next.nodeSemantics[id] = { role: action.role }; touchedGeometry.add(id); continue;
    }
    if (action.type === "align" || action.type === "distribute") {
      if (!Array.isArray(action.nodeIds) || action.nodeIds.some((nodeId) => typeof nodeId !== "string")) {
        diagnostics.push(diag("INVALID_ACTION", "alignment/distribution nodeIds must be an array of ids"));
        continue;
      }
      const missingNodeIds = action.nodeIds.filter((nodeId) => find(nodeId) < 0);
      if (missingNodeIds.length) {
        for (const nodeId of missingNodeIds) diagnostics.push(diag("NODE_NOT_FOUND", "action target does not exist", { nodeId }));
        continue;
      }
      const selected = next.scene.nodes.filter((candidate) => action.nodeIds.includes(candidate.id));
      if (selected.length < 2) { diagnostics.push(diag("INVALID_SELECTION", "alignment/distribution requires at least two nodes")); continue; }
      const bounds = selected.reduce((acc, candidate) => ({ left: Math.min(acc.left, candidate.x), top: Math.min(acc.top, candidate.y), right: Math.max(acc.right, candidate.x + candidate.width), bottom: Math.max(acc.bottom, candidate.y + candidate.height) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
      if (action.type === "align") for (const candidate of selected) { if (action.axis === "left") candidate.x = bounds.left; if (action.axis === "right") candidate.x = bounds.right - candidate.width; if (action.axis === "center") candidate.x = bounds.left + (bounds.right - bounds.left - candidate.width) / 2; if (action.axis === "top") candidate.y = bounds.top; if (action.axis === "bottom") candidate.y = bounds.bottom - candidate.height; if (action.axis === "middle") candidate.y = bounds.top + (bounds.bottom - bounds.top - candidate.height) / 2; touchedGeometry.add(candidate.id); }
      else { const sorted = [...selected].sort((a, b) => action.axis === "horizontal" ? a.x - b.x : a.y - b.y); const span = action.axis === "horizontal" ? bounds.right - bounds.left : bounds.bottom - bounds.top; const total = sorted.reduce((sum, candidate) => sum + (action.axis === "horizontal" ? candidate.width : candidate.height), 0); const gap = (span - total) / Math.max(1, sorted.length - 1); let cursor = action.axis === "horizontal" ? bounds.left : bounds.top; for (const candidate of sorted) { if (action.axis === "horizontal") candidate.x = cursor; else candidate.y = cursor; cursor += (action.axis === "horizontal" ? candidate.width : candidate.height) + gap; touchedGeometry.add(candidate.id); } }
      continue;
    }
    const index = find(action.nodeId); if (index < 0) { diagnostics.push(diag("NODE_NOT_FOUND", "action target does not exist", { nodeId: action.nodeId })); continue; } const node = next.scene.nodes[index];
    if (action.type === "removeNode") { next.scene.nodes.splice(index, 1); delete next.nodeSemantics[action.nodeId]; for (const group of next.scene.nodes) if (group.children) group.children = group.children.filter((child) => child !== action.nodeId); }
    else if (action.type === "updateRole") { if (action.role && !roleSet.has(action.role)) diagnostics.push(diag("INVALID_ROLE", "unsupported semantic role", { nodeId: action.nodeId })); else if (node.type === "group" && action.role) diagnostics.push(diag("INVALID_GROUP_SEMANTICS", "group nodes cannot carry a role", { nodeId: action.nodeId })); else if (action.role) next.nodeSemantics[action.nodeId] = { ...next.nodeSemantics[action.nodeId], role: action.role }; else if (next.nodeSemantics[action.nodeId]) { const { role: _role, ...rest } = next.nodeSemantics[action.nodeId]; if (Object.keys(rest).length) next.nodeSemantics[action.nodeId] = rest; else delete next.nodeSemantics[action.nodeId]; } }
    else if (action.type === "placeAsset") { if (node.type !== "image" || !assetIdPattern.test(action.assetId) || !isManagedAssetPathForId(action.assetId, action.src)) diagnostics.push(diag("INVALID_ASSET_REF", "placeAsset requires an image node and its matching managed asset source", { nodeId: action.nodeId })); else { node.src = action.src; next.nodeSemantics[action.nodeId] = { ...next.nodeSemantics[action.nodeId], assetRef: action.assetId }; } }
    else if (action.type === "setImageFit") { if (node.type !== "image") diagnostics.push(diag("INVALID_NODE_TYPE", "setImageFit requires an image node", { nodeId: action.nodeId })); else node.style = { ...node.style, imageFit: action.fit }; }
    else if (action.type === "setImageCrop") {
      if (node.type !== "image") diagnostics.push(diag("INVALID_NODE_TYPE", "setImageCrop requires an image node", { nodeId: action.nodeId }));
      else {
        if (action.crop === null) delete node.imageCrop;
        else node.imageCrop = cloneJson(action.crop);
        if (action.frame) {
          node.x = action.frame.x;
          node.y = action.frame.y;
          node.width = action.frame.width;
          node.height = action.frame.height;
          touchedGeometry.add(action.nodeId);
        }
      }
    }
    else if (action.type === "updateNode") { next.scene.nodes[index] = { ...node, ...action.patch, style: action.patch.style ? { ...node.style, ...action.patch.style } : node.style }; if (action.patch.x !== undefined || action.patch.y !== undefined || action.patch.width !== undefined || action.patch.height !== undefined) touchedGeometry.add(action.nodeId); }
  }
  if (next.safeArea) {
    for (const nodeId of touchedGeometry) {
      const node = next.scene.nodes.find((candidate) => candidate.id === nodeId);
      if (!node || node.type === "group" || next.nodeSemantics[nodeId]?.role === "background") continue;
      const { x, y, width, height } = next.safeArea;
      if (node.x < x || node.y < y || node.x + node.width > x + width || node.y + node.height > y + height) {
        diagnostics.push(diag("OUTSIDE_SAFE_AREA", "action would place a node outside the configured safe area", { nodeId, suggestion: "Move or resize the node so its bounds stay within safeArea." }));
      }
    }
  }
  if (diagnostics.length) return { diagnostics };
  next.documentRevision += actions.length ? 1 : 0;
  next.updatedAt = Date.now();
  const validation = validateWhiteboardNativeDocument(next);
  return validation.valid
    ? { value: canonicalizeWhiteboardNativeDocument(next), diagnostics: [], ...(Object.keys(idMapping).length ? { idMapping } : {}) }
    : { diagnostics: validation.diagnostics };
}

function isManagedAssetPathForId(assetId: string, src: string): boolean {
  return src === `assets/${assetId}` || src === `/assets/${assetId}` || src === `/api/images/${assetId}`;
}

function isManagedAssetPath(value: string): boolean {
  return value.length <= 512
    && !/^(?:data:|blob:|https?:|\/\/)/i.test(value)
    && !value.includes("\\")
    && !value.includes("//")
    && !value.split("/").includes("..")
    && (/^\/?assets\/[A-Za-z0-9._/-]+$/.test(value)
      || /^\/api\/images\/[A-Za-z0-9_-]+$/.test(value)
      || /^\/api\/sessions\/[A-Za-z0-9_-]{1,80}\/workspace\/assets\/[A-Za-z0-9._/-]+$/.test(value));
}

/** Apply one lifecycle transition without touching a document or filesystem. */
export function transitionWhiteboardAsset(
  record: WhiteboardAssetRecord,
  transition: WhiteboardAssetTransition,
): ConversionResult<WhiteboardAssetRecord> {
  const diagnostics: Diagnostic[] = [];
  if (!assetIdPattern.test(record.assetId)) diagnostics.push(diag("INVALID_ASSET_REF", "assetId must be a managed id"));
  if (transition.type === "discard") {
    if (record.lifecycle === "attached" || record.lifecycle === "output") diagnostics.push(diag("ASSET_IN_USE", "attached or output assets cannot be discarded"));
    return diagnostics.length ? { diagnostics } : { value: record, diagnostics: [] };
  }
  if (transition.type === "localize") {
    if (record.lifecycle !== "candidate") diagnostics.push(diag("INVALID_ASSET_TRANSITION", "only candidate assets can be localized"));
    if (!isManagedAssetPath(transition.src)) diagnostics.push(diag("UNLOCALIZED_RESOURCE", "localized asset src must be a managed local path"));
    return diagnostics.length ? { diagnostics } : {
      value: { ...record, lifecycle: "localized", src: transition.src, ...(transition.mimeType ? { mimeType: transition.mimeType } : {}), ...(transition.width === undefined ? {} : { width: transition.width }), ...(transition.height === undefined ? {} : { height: transition.height }), ...(transition.sha256 ? { sha256: transition.sha256 } : {}) },
      diagnostics: [],
    };
  }
  if (transition.type === "attach") {
    if (record.lifecycle !== "localized" || !record.src || !isManagedAssetPath(record.src)) diagnostics.push(diag("INVALID_ASSET_TRANSITION", "only localized assets with a managed src can be attached"));
    return diagnostics.length ? { diagnostics } : { value: { ...record, lifecycle: "attached" }, diagnostics: [] };
  }
  if (record.lifecycle !== "attached") diagnostics.push(diag("INVALID_ASSET_TRANSITION", "only attached assets can be marked as output"));
  return diagnostics.length ? { diagnostics } : { value: { ...record, lifecycle: "output" }, diagnostics: [] };
}

/**
 * Resolve every semantic asset reference to a stable render-time src.  This is
 * pure and intentionally requires an attached/output record: a candidate or a
 * missing registry entry must block preview/commit instead of falling back to
 * a temporary URL.
 */
export function resolveWhiteboardAssetRefs(
  document: WhiteboardDocument,
  records: readonly WhiteboardAssetRecord[],
): ConversionResult<WhiteboardDocument> {
  const validation = validateWhiteboardBridgeDocument(document);
  if (!validation.valid) return { diagnostics: validation.diagnostics };
  const next = cloneJson(canonicalizeWhiteboardBridgeDocument(document)) as WhiteboardDocument;
  const byId = new Map(records.map((record) => [record.assetId, record]));
  const diagnostics: Diagnostic[] = [];
  for (const [nodeId, semantics] of Object.entries(next.nodeSemantics)) {
    if (!semantics.assetRef) continue;
    const node = next.scene.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || node.type !== "image") {
      diagnostics.push(diag("INVALID_ASSET_REF", "assetRef must target an image node", { nodeId }));
      continue;
    }
    const record = byId.get(semantics.assetRef);
    if (!record) {
      diagnostics.push(diag("ASSET_NOT_RESOLVED", `managed asset ${semantics.assetRef} was not found`, { nodeId, suggestion: "Localize and confirm the asset before committing." }));
      continue;
    }
    if (record.lifecycle === "candidate" || record.lifecycle === "localized") {
      diagnostics.push(diag("ASSET_NOT_ATTACHED", `managed asset ${record.assetId} is ${record.lifecycle}, not attached`, { nodeId, suggestion: "Confirm the candidate and attach it to this node first." }));
      continue;
    }
    if (!record.src || !isManagedAssetPath(record.src)) {
      diagnostics.push(diag("UNLOCALIZED_RESOURCE", `managed asset ${record.assetId} has no safe render path`, { nodeId }));
      continue;
    }
    node.src = record.src;
  }
  if (diagnostics.length) return { diagnostics };
  const result = validateWhiteboardBridgeDocument(next);
  return result.valid ? { value: next, diagnostics: [] } : { diagnostics: result.diagnostics };
}
