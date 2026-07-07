export const SKETCH_SCENE_PROTOCOL_VERSION = 1;

export type SketchSceneNodeType =
  | "rect"
  | "diamond"
  | "ellipse"
  | "line"
  | "arrow"
  | "path"
  | "text"
  | "image"
  | "sticky"
  | "button"
  | "input"
  | "card"
  | "group";

const SKETCH_SCENE_NODE_TYPES = new Set<string>([
  "rect",
  "diamond",
  "ellipse",
  "line",
  "arrow",
  "path",
  "text",
  "image",
  "sticky",
  "button",
  "input",
  "card",
  "group",
]);

export interface SketchScenePageSize {
  width: number;
  height: number;
}

export interface SketchSceneStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  radius?: number;
  fontSize?: number;
  fontWeight?: string | number;
  textAlign?: "left" | "center" | "right";
  color?: string;
  lineDash?: number[];
  startArrow?: "none" | "arrow";
  endArrow?: "none" | "arrow";
  imageFit?: "cover" | "contain" | "fill";
}

export interface SketchSceneTextStyleOverride {
  color?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontFamily?: string;
  italic?: boolean;
  textDecoration?: "none" | "underline" | "line-through";
  lineHeight?: number | null;
  letterSpacing?: number;
}

export interface SketchSceneTextStyleRun {
  start: number;
  length: number;
  style: SketchSceneTextStyleOverride;
}

export interface SketchSceneNodeBindings {
  text?: string;
  src?: string;
  fill?: string;
  stroke?: string;
  color?: string;
  visible?: string;
  variant?: string;
}

export type SketchSceneConnectorAnchor = "top" | "right" | "bottom" | "left" | "center";

export interface SketchSceneConnectorEndpointBinding {
  nodeId: string;
  anchor: SketchSceneConnectorAnchor;
}

export interface SketchSceneConnectorBindings {
  start?: SketchSceneConnectorEndpointBinding;
  end?: SketchSceneConnectorEndpointBinding;
}

const SKETCH_SCENE_BINDING_KEYS = new Set<string>([
  "text",
  "src",
  "fill",
  "stroke",
  "color",
  "visible",
  "variant",
]);

const SKETCH_SCENE_CONNECTOR_ANCHORS = new Set<string>([
  "top",
  "right",
  "bottom",
  "left",
  "center",
]);

const SKETCH_SCENE_TEXT_ALIGN_VALUES = new Set<string>([
  "left",
  "center",
  "right",
]);

const SKETCH_SCENE_TEXT_DECORATION_VALUES = new Set<string>([
  "none",
  "underline",
  "line-through",
]);

const SKETCH_SCENE_ARROW_HEAD_VALUES = new Set<string>([
  "none",
  "arrow",
]);

const SKETCH_SCENE_IMAGE_FIT_VALUES = new Set<string>([
  "cover",
  "contain",
  "fill",
]);

export interface SketchSceneNode {
  id: string;
  type: SketchSceneNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  locked?: boolean;
  visible?: boolean;
  text?: string;
  textStyleRuns?: SketchSceneTextStyleRun[];
  src?: string;
  alt?: string;
  path?: string;
  points?: Array<{ x: number; y: number }>;
  style?: SketchSceneStyle;
  bindings?: SketchSceneNodeBindings;
  connections?: SketchSceneConnectorBindings;
  children?: string[];
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface SketchSceneAsset {
  id: string;
  type: "image";
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface SketchSceneDocument {
  version: number;
  pageSize: SketchScenePageSize;
  nodes: SketchSceneNode[];
  assets?: SketchSceneAsset[];
  bindings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SketchSnapLine {
  orientation: "vertical" | "horizontal";
  position: number;
  from: number;
  to: number;
  targetNodeId?: string;
}

export interface SketchSnapResult {
  delta: { x: number; y: number };
  lines: SketchSnapLine[];
}

export interface ComputeSketchSnapOptions {
  movingBounds: SketchSceneBounds;
  nodes: SketchSceneNode[];
  movingNodeIds?: string[];
  threshold?: number;
  gridSize?: number;
  includeGrid?: boolean;
}

export type SketchScenePatchOperation =
  | { op: "add"; node: SketchSceneNode }
  | { op: "update"; nodeId: string; patch: Partial<SketchSceneNode> }
  | { op: "delete"; nodeId: string }
  | { op: "duplicate"; nodeId: string; newNodeId: string; offset?: { x: number; y: number } }
  | { op: "reorder"; nodeIds: string[] }
  | { op: "group"; groupId: string; nodeIds: string[]; name?: string }
  | { op: "ungroup"; groupId: string }
  | { op: "set-locked"; nodeIds: string[]; locked: boolean }
  | { op: "set-visible"; nodeIds: string[]; visible: boolean }
  | {
      op: "bind";
      nodeId: string;
      property: keyof SketchSceneNodeBindings;
      field: string;
    }
  | {
      op: "unbind";
      nodeId: string;
      property: keyof SketchSceneNodeBindings;
    };

export interface SketchSceneValidationIssue {
  code:
    | "INVALID_DOCUMENT"
    | "INVALID_VERSION"
    | "INVALID_PAGE_SIZE"
    | "INVALID_NODE"
    | "DUPLICATE_NODE_ID"
    | "MISSING_NODE_ID"
    | "INVALID_GEOMETRY"
    | "INVALID_STYLE"
    | "INVALID_BINDING"
    | "INVALID_ASSET";
  message: string;
  nodeId?: string;
  severity: "error" | "warning";
}

export interface SketchSceneValidationResult {
  valid: boolean;
  issues: SketchSceneValidationIssue[];
}

export interface SketchScenePatchSummary {
  operationCount: number;
  changed: boolean;
  beforeNodeCount: number;
  afterNodeCount: number;
  addedNodeIds: string[];
  deletedNodeIds: string[];
  updatedNodeIds: string[];
  updatedFieldsByNodeId: Record<string, string[]>;
  addedCount: number;
  deletedCount: number;
  updatedCount: number;
  affectedNodeCount: number;
}

export interface SketchScenePatchResult {
  scene: SketchSceneDocument;
  validation: SketchSceneValidationResult;
  summary: SketchScenePatchSummary;
}

export interface SketchSceneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SketchSceneResizeHandle =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

export const DEFAULT_SKETCH_SCENE_PAGE_SIZE: SketchScenePageSize = {
  width: 1440,
  height: 900,
};

export function createDefaultSketchScene(
  pageSize: SketchScenePageSize = DEFAULT_SKETCH_SCENE_PAGE_SIZE,
): SketchSceneDocument {
  const marginX = Math.min(96, Math.max(0, Math.floor(pageSize.width * 0.1)));
  const marginY = Math.min(96, Math.max(0, Math.floor(pageSize.height * 0.1)));
  const availableWidth = Math.max(1, pageSize.width - marginX * 2);
  const titleHeight = Math.max(1, Math.min(64, pageSize.height - marginY));
  const noteY = Math.min(marginY + titleHeight + 32, Math.max(0, pageSize.height - 1));
  const noteHeight = Math.max(1, Math.min(160, pageSize.height - noteY));

  return {
    version: SKETCH_SCENE_PROTOCOL_VERSION,
    pageSize,
    nodes: [
      {
        id: "title",
        type: "text",
        x: marginX,
        y: marginY,
        width: Math.min(520, availableWidth),
        height: titleHeight,
        text: "手绘页面",
        style: {
          fontSize: 40,
          fontWeight: 700,
          color: "#111827",
          textAlign: "left",
        },
      },
      {
        id: "note",
        type: "sticky",
        x: marginX,
        y: noteY,
        width: Math.min(320, availableWidth),
        height: noteHeight,
        text: "选择编辑后可以直接添加文字、形状、图片和组件占位。",
        style: {
          fill: "#FEF3C7",
          stroke: "#F59E0B",
          strokeWidth: 1,
          radius: 12,
          fontSize: 20,
          color: "#78350F",
        },
      },
    ],
    assets: [],
    bindings: {},
    metadata: {
      createdBy: "system",
      updatedAt: Date.now(),
    },
  };
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isValidSketchScenePoint(value: unknown): boolean {
  return isObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isValidSketchSceneChildren(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((child) => typeof child === "string"));
}

function isValidSketchScenePoints(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isValidSketchScenePoint));
}

function isValidSketchSceneTextStyleOverride(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (!isOptionalString(value.color)) return false;
  if (!isOptionalString(value.fontFamily)) return false;
  if (value.fontSize !== undefined && !isFinitePositive(value.fontSize)) return false;
  if (
    value.fontWeight !== undefined &&
    typeof value.fontWeight !== "string" &&
    !isFiniteNonNegative(value.fontWeight)
  ) {
    return false;
  }
  if (!isOptionalBoolean(value.italic)) return false;
  if (
    value.textDecoration !== undefined &&
    (typeof value.textDecoration !== "string" || !SKETCH_SCENE_TEXT_DECORATION_VALUES.has(value.textDecoration))
  ) {
    return false;
  }
  if (value.lineHeight !== undefined && value.lineHeight !== null && !isFinitePositive(value.lineHeight)) return false;
  if (value.letterSpacing !== undefined && !isFiniteNumber(value.letterSpacing)) return false;
  return true;
}

function isValidSketchSceneTextStyleRun(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    isFiniteNonNegative(value.start) &&
    isFinitePositive(value.length) &&
    isValidSketchSceneTextStyleOverride(value.style)
  );
}

function isValidSketchSceneTextStyleRuns(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isValidSketchSceneTextStyleRun));
}

function isValidOptionalObject(value: unknown): boolean {
  return value === undefined || isObject(value);
}

function isValidSketchSceneNodeOptionalFields(node: Record<string, unknown>): boolean {
  return (
    isOptionalFiniteNumber(node.rotation) &&
    isOptionalFiniteNumber(node.zIndex) &&
    isOptionalBoolean(node.locked) &&
    isOptionalBoolean(node.visible) &&
    isOptionalString(node.text) &&
    isOptionalString(node.src) &&
    isOptionalString(node.alt) &&
    isOptionalString(node.path) &&
    isOptionalString(node.name) &&
    isValidSketchScenePoints(node.points) &&
    isValidSketchSceneTextStyleRuns(node.textStyleRuns) &&
    isValidSketchSceneChildren(node.children) &&
    isValidOptionalObject(node.metadata)
  );
}

function isValidSketchSceneStyle(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (!isOptionalString(value.fill)) return false;
  if (!isOptionalString(value.stroke)) return false;
  if (!isOptionalString(value.color)) return false;
  if (value.strokeWidth !== undefined && !isFiniteNonNegative(value.strokeWidth)) return false;
  if (value.opacity !== undefined && !isFiniteNonNegative(value.opacity)) return false;
  if (value.radius !== undefined && !isFiniteNonNegative(value.radius)) return false;
  if (value.fontSize !== undefined && !isFinitePositive(value.fontSize)) return false;
  if (
    value.fontWeight !== undefined &&
    typeof value.fontWeight !== "string" &&
    !isFiniteNonNegative(value.fontWeight)
  ) {
    return false;
  }
  if (value.textAlign !== undefined && (typeof value.textAlign !== "string" || !SKETCH_SCENE_TEXT_ALIGN_VALUES.has(value.textAlign))) {
    return false;
  }
  if (
    value.lineDash !== undefined &&
    (!Array.isArray(value.lineDash) || value.lineDash.some((entry) => !isFiniteNonNegative(entry)))
  ) {
    return false;
  }
  if (value.startArrow !== undefined && (typeof value.startArrow !== "string" || !SKETCH_SCENE_ARROW_HEAD_VALUES.has(value.startArrow))) {
    return false;
  }
  if (value.endArrow !== undefined && (typeof value.endArrow !== "string" || !SKETCH_SCENE_ARROW_HEAD_VALUES.has(value.endArrow))) {
    return false;
  }
  if (value.imageFit !== undefined && (typeof value.imageFit !== "string" || !SKETCH_SCENE_IMAGE_FIT_VALUES.has(value.imageFit))) {
    return false;
  }
  return true;
}

function isValidSketchSceneBindings(value: unknown): boolean {
  if (!isObject(value)) return false;
  return Object.entries(value).every(
    ([key, field]) => SKETCH_SCENE_BINDING_KEYS.has(key) && typeof field === "string",
  );
}

function isValidSketchSceneConnectorEndpoint(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.nodeId === "string" &&
    value.nodeId.trim().length > 0 &&
    typeof value.anchor === "string" &&
    SKETCH_SCENE_CONNECTOR_ANCHORS.has(value.anchor)
  );
}

function isValidSketchSceneConnectorBindings(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObject(value)) return false;
  return (
    Object.entries(value).every(([key]) => key === "start" || key === "end") &&
    (value.start === undefined || isValidSketchSceneConnectorEndpoint(value.start)) &&
    (value.end === undefined || isValidSketchSceneConnectorEndpoint(value.end))
  );
}

export function parseSketchSceneDocument(
  value: unknown,
): SketchSceneDocument | null {
  if (typeof value === "string") {
    try {
      return parseSketchSceneDocument(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!isObject(value)) return null;
  return value as unknown as SketchSceneDocument;
}

export function cloneSketchSceneDocument(scene: SketchSceneDocument): SketchSceneDocument {
  return JSON.parse(JSON.stringify(scene)) as SketchSceneDocument;
}

export function getSketchConnectorAnchorPoint(
  node: SketchSceneNode,
  anchor: SketchSceneConnectorAnchor,
): { x: number; y: number } {
  const bounds = getSketchNodeBounds(node);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  if (anchor === "top") return { x: centerX, y: bounds.y };
  if (anchor === "right") return { x: bounds.x + bounds.width, y: centerY };
  if (anchor === "bottom") return { x: centerX, y: bounds.y + bounds.height };
  if (anchor === "left") return { x: bounds.x, y: centerY };
  return { x: centerX, y: centerY };
}

export function normalizeSketchSceneDocument(
  value: unknown,
  fallbackPageSize: SketchScenePageSize = DEFAULT_SKETCH_SCENE_PAGE_SIZE,
): SketchSceneDocument {
  const parsed = parseSketchSceneDocument(value);
  if (!parsed) return createDefaultSketchScene(fallbackPageSize);
  return {
    version: SKETCH_SCENE_PROTOCOL_VERSION,
    pageSize:
      isObject(parsed.pageSize) &&
      isFinitePositive(parsed.pageSize.width) &&
      isFinitePositive(parsed.pageSize.height)
        ? parsed.pageSize
        : fallbackPageSize,
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    bindings: isObject(parsed.bindings) ? parsed.bindings : {},
    metadata: isObject(parsed.metadata) ? parsed.metadata : {},
  };
}

function getValidSketchScenePageSize(
  value: unknown,
  fallbackPageSize: SketchScenePageSize = DEFAULT_SKETCH_SCENE_PAGE_SIZE,
): SketchScenePageSize {
  const parsed = parseSketchSceneDocument(value);
  return parsed ? getValidSketchScenePageSizeValue(parsed.pageSize, fallbackPageSize) : fallbackPageSize;
}

function getValidSketchScenePageSizeValue(
  value: unknown,
  fallbackPageSize: SketchScenePageSize = DEFAULT_SKETCH_SCENE_PAGE_SIZE,
): SketchScenePageSize {
  if (
    isObject(value) &&
    isFinitePositive(value.width) &&
    isFinitePositive(value.height)
  ) {
    return { width: value.width, height: value.height };
  }
  return fallbackPageSize;
}

export function validateSketchSceneDocument(
  value: unknown,
): SketchSceneValidationResult {
  const scene = parseSketchSceneDocument(value);
  const issues: SketchSceneValidationIssue[] = [];

  if (!scene) {
    return {
      valid: false,
      issues: [
        {
          code: "INVALID_DOCUMENT",
          message: "Sketch scene must be a JSON object.",
          severity: "error",
        },
      ],
    };
  }

  if (scene.version !== SKETCH_SCENE_PROTOCOL_VERSION) {
    issues.push({
      code: "INVALID_VERSION",
      message: `Unsupported sketch scene version: ${String(scene.version)}.`,
      severity: "error",
    });
  }

  if (
    !isObject(scene.pageSize) ||
    !isFinitePositive(scene.pageSize.width) ||
    !isFinitePositive(scene.pageSize.height)
  ) {
    issues.push({
      code: "INVALID_PAGE_SIZE",
      message: "Sketch scene pageSize must include positive width and height.",
      severity: "error",
    });
  }

  if (!Array.isArray(scene.nodes)) {
    issues.push({
      code: "INVALID_NODE",
      message: "Sketch scene nodes must be an array.",
      severity: "error",
    });
  } else {
    const ids = new Set<string>();
    const nodesById = new Map<string, SketchSceneNode>();
    const childRefs: Array<{ nodeId?: string; childId: string }> = [];
    const connectorRefs: Array<{ nodeId?: string; endpoint: "start" | "end"; targetNodeId: string }> = [];
    for (const node of scene.nodes) {
      if (!isObject(node)) {
        issues.push({
          code: "INVALID_NODE",
          message: "Sketch scene node must be an object.",
          severity: "error",
        });
        continue;
      }
      const nodeId = typeof node.id === "string" ? node.id : undefined;
      if (!nodeId) {
        issues.push({
          code: "MISSING_NODE_ID",
          message: "Sketch scene node id is required.",
          severity: "error",
        });
      } else if (ids.has(nodeId)) {
        issues.push({
          code: "DUPLICATE_NODE_ID",
          message: `Duplicate sketch scene node id: ${nodeId}.`,
          nodeId,
          severity: "error",
        });
      } else {
        ids.add(nodeId);
        nodesById.set(nodeId, node as unknown as SketchSceneNode);
      }
      if (Array.isArray(node.children)) {
        const childIds = new Set<string>();
        if (node.type !== "group") {
          issues.push({
            code: "INVALID_NODE",
            message: "Sketch scene children are only supported on group nodes.",
            nodeId,
            severity: "error",
          });
        }
        for (const childId of node.children) {
          if (typeof childId === "string" && childIds.has(childId)) {
            issues.push({
              code: "INVALID_NODE",
              message: "Sketch scene node children must not contain duplicates.",
              nodeId,
              severity: "error",
            });
          }
          if (typeof childId === "string") childIds.add(childId);
          if (typeof childId === "string") childRefs.push({ nodeId, childId });
        }
      }
      const validType = typeof node.type === "string" && SKETCH_SCENE_NODE_TYPES.has(node.type);
      const lineLikeType = node.type === "line" || node.type === "arrow";
      const validLineGeometry =
        lineLikeType &&
        isFiniteNonNegative(node.x) &&
        isFiniteNonNegative(node.y) &&
        typeof node.width === "number" &&
        Number.isFinite(node.width) &&
        typeof node.height === "number" &&
        Number.isFinite(node.height) &&
        node.x + node.width >= 0 &&
        node.y + node.height >= 0 &&
        (node.width !== 0 || node.height !== 0);
      const validGroupGeometry =
        node.type === "group" &&
        isFiniteNonNegative(node.x) &&
        isFiniteNonNegative(node.y) &&
        isFiniteNonNegative(node.width) &&
        isFiniteNonNegative(node.height) &&
        (node.width > 0 || node.height > 0);
      const validBoxGeometry =
        validType &&
        node.type !== "group" &&
        !lineLikeType &&
        isFiniteNonNegative(node.x) &&
        isFiniteNonNegative(node.y) &&
        isFinitePositive(node.width) &&
        isFinitePositive(node.height);
      const validPathData = node.type !== "path" || (typeof node.path === "string" && node.path.trim().length > 0);
      const validImageSource =
        node.type !== "image" ||
        (typeof node.src === "string" && node.src.trim().length > 0) ||
        (typeof node.bindings?.src === "string" && node.bindings.src.trim().length > 0);
      if (!validType || (!validLineGeometry && !validGroupGeometry && !validBoxGeometry) || !validPathData || !validImageSource) {
        issues.push({
          code: "INVALID_GEOMETRY",
          message:
            node.type === "path" && !validPathData
              ? "Sketch scene path nodes must include non-empty path data."
              : node.type === "image" && !validImageSource
                ? "Sketch scene image nodes must include non-empty src data or a src binding."
                : "Sketch scene node requires type, x, y, width and height.",
          nodeId,
          severity: "error",
        });
      }
      if (!isValidSketchSceneNodeOptionalFields(node)) {
        issues.push({
          code: "INVALID_NODE",
          message: "Sketch scene node contains invalid optional fields.",
          nodeId,
          severity: "error",
        });
      }
      if (node.type === "group") {
        if (node.visible !== false || node.locked === true) {
          issues.push({
            code: "INVALID_NODE",
            message: "Sketch scene group nodes must stay hidden and unlocked.",
            nodeId,
            severity: "error",
          });
        }
        if (!Array.isArray(node.children) || !node.children.length) {
          issues.push({
            code: "INVALID_NODE",
            message: "Sketch scene group nodes must reference at least one child.",
            nodeId,
            severity: "error",
          });
        }
      }
      if (node.style !== undefined && !isValidSketchSceneStyle(node.style)) {
        issues.push({
          code: "INVALID_STYLE",
          message: "Sketch scene node style contains invalid values.",
          nodeId,
          severity: "error",
        });
      }
      if (node.bindings !== undefined && !isValidSketchSceneBindings(node.bindings)) {
        issues.push({
          code: "INVALID_BINDING",
          message: "Sketch scene node bindings must map known properties to config field names.",
          nodeId,
          severity: "error",
        });
      }
      if (node.connections !== undefined) {
        if (!lineLikeType || !isValidSketchSceneConnectorBindings(node.connections)) {
          issues.push({
            code: "INVALID_NODE",
            message: "Sketch scene connector connections are only supported on line and arrow nodes.",
            nodeId,
            severity: "error",
          });
        } else {
          if (node.connections.start) connectorRefs.push({ nodeId, endpoint: "start", targetNodeId: node.connections.start.nodeId });
          if (node.connections.end) connectorRefs.push({ nodeId, endpoint: "end", targetNodeId: node.connections.end.nodeId });
        }
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasChildCycle = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      const node = nodesById.get(nodeId);
      if (!node || node.type !== "group" || !Array.isArray(node.children)) return false;
      visiting.add(nodeId);
      const cyclic = node.children.some((childId) => hasChildCycle(childId));
      visiting.delete(nodeId);
      visited.add(nodeId);
      return cyclic;
    };
    for (const node of scene.nodes) {
      if (isObject(node) && typeof node.id === "string" && node.type === "group" && hasChildCycle(node.id)) {
        issues.push({
          code: "INVALID_NODE",
          message: "Sketch scene group children must not form cycles.",
          nodeId: node.id,
          severity: "error",
        });
      }
    }
    for (const ref of childRefs) {
      if (ref.childId === ref.nodeId || !ids.has(ref.childId)) {
        issues.push({
          code: "INVALID_NODE",
          message: "Sketch scene node children must reference existing nodes.",
          nodeId: ref.nodeId,
          severity: "error",
        });
      }
    }
    for (const ref of connectorRefs) {
      const target = nodesById.get(ref.targetNodeId);
      if (
        !target ||
        target.id === ref.nodeId ||
        target.type === "group" ||
        target.type === "line" ||
        target.type === "arrow" ||
        target.type === "path"
      ) {
        issues.push({
          code: "INVALID_NODE",
          message: "Sketch scene connector endpoints must reference an existing connectable node.",
          nodeId: ref.nodeId,
          severity: "error",
        });
      }
    }
  }

  if (scene.assets !== undefined && !Array.isArray(scene.assets)) {
    issues.push({
      code: "INVALID_ASSET",
      message: "Sketch scene assets must be an array.",
      severity: "error",
    });
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export function applySketchScenePatchOperations(
  scene: SketchSceneDocument,
  operations: SketchScenePatchOperation[],
): SketchSceneDocument {
  let nodes = cloneSketchSceneDocument(scene).nodes;
  const initialNodesJson = JSON.stringify(nodes);
  const commitNodesIfValid = (nextNodes: SketchSceneNode[]) => {
    const candidate = { ...scene, nodes: nextNodes };
    if (!validateSketchSceneDocument(candidate).valid) return false;
    nodes = nextNodes;
    return true;
  };
  const getNextTopZIndex = () =>
    nodes.reduce((max, node) => Math.max(max, isFiniteNumber(node.zIndex) ? node.zIndex : 0), -1) + 1;
  const removeNodeAndReferences = (nodeId: string) => {
    const removedIds = new Set([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes) {
        if (removedIds.has(node.id) || node.type !== "group" || !node.children) continue;
        const children = node.children.filter((childId) => !removedIds.has(childId));
        if (!children.length) {
          removedIds.add(node.id);
          changed = true;
        }
      }
    }
    return nodes
      .filter((node) => !removedIds.has(node.id))
      .map((node) => {
        const nextChildren = node.children?.some((childId) => removedIds.has(childId))
          ? node.children.filter((childId) => !removedIds.has(childId))
          : node.children;
        const nextConnections =
          node.connections && (removedIds.has(node.connections.start?.nodeId ?? "") || removedIds.has(node.connections.end?.nodeId ?? ""))
            ? {
                ...node.connections,
                start: node.connections.start && !removedIds.has(node.connections.start.nodeId) ? node.connections.start : undefined,
                end: node.connections.end && !removedIds.has(node.connections.end.nodeId) ? node.connections.end : undefined,
              }
            : node.connections;
        const compactConnections = nextConnections && (nextConnections.start || nextConnections.end) ? nextConnections : undefined;
        if (nextChildren === node.children && compactConnections === node.connections) return node;
        return {
          ...node,
          children: nextChildren,
          connections: compactConnections,
        };
      });
  };

  for (const operation of operations) {
    if (operation.op === "add") {
      if (nodes.some((node) => node.id === operation.node.id)) continue;
      commitNodesIfValid([
        ...nodes,
        { ...operation.node, zIndex: getNextTopZIndex() },
      ]);
      continue;
    }
    if (operation.op === "update") {
      commitNodesIfValid(nodes.map((node) =>
        node.id === operation.nodeId ? { ...node, ...operation.patch, id: node.id } : node,
      ));
      continue;
    }
    if (operation.op === "delete") {
      commitNodesIfValid(removeNodeAndReferences(operation.nodeId));
      continue;
    }
    if (operation.op === "duplicate") {
      const source = nodes.find((node) => node.id === operation.nodeId);
      if (source) {
        const offset = operation.offset ?? { x: 24, y: 24 };
        commitNodesIfValid([
          ...nodes,
          {
            ...cloneSketchSceneDocument({ ...scene, nodes: [source] }).nodes[0],
            id: operation.newNodeId,
            x: source.x + offset.x,
            y: source.y + offset.y,
            locked: false,
            visible: source.type === "group" ? false : true,
            zIndex: getNextTopZIndex(),
            name: source.name ? `${source.name} copy` : undefined,
          },
        ]);
      }
      continue;
    }
    if (operation.op === "reorder") {
      const currentIds = new Set(nodes.map((node) => node.id));
      const requestedIds = new Set(operation.nodeIds);
      if (!operation.nodeIds.length || requestedIds.size !== operation.nodeIds.length) continue;
      if (operation.nodeIds.some((nodeId) => !currentIds.has(nodeId))) continue;
      const order = new Map(operation.nodeIds.map((id, index) => [id, index]));
      const reordered = [...nodes].sort((a, b) => {
        const aOrder = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.zIndex ?? 0) - (b.zIndex ?? 0);
      }).map((node, index) => ({ ...node, zIndex: index }));
      commitNodesIfValid(reordered);
      continue;
    }
    if (operation.op === "group") {
      const groupNodes = nodes.filter((node) => operation.nodeIds.includes(node.id));
      const bounds = getSketchSelectionBounds(groupNodes);
      if (bounds && !nodes.some((node) => node.id === operation.groupId)) {
        commitNodesIfValid([
          ...nodes,
          {
            id: operation.groupId,
            type: "group",
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            visible: false,
            children: operation.nodeIds,
            name: operation.name,
            metadata: { semanticGroup: true },
          },
        ]);
      }
      continue;
    }
    if (operation.op === "ungroup") {
      if (nodes.find((node) => node.id === operation.groupId)?.type !== "group") continue;
      commitNodesIfValid(removeNodeAndReferences(operation.groupId));
      continue;
    }
    if (operation.op === "set-locked") {
      const ids = new Set(operation.nodeIds);
      commitNodesIfValid(nodes.map((node) =>
        ids.has(node.id) ? { ...node, locked: node.type === "group" ? false : operation.locked } : node,
      ));
      continue;
    }
    if (operation.op === "set-visible") {
      const ids = new Set(operation.nodeIds);
      commitNodesIfValid(nodes.map((node) =>
        ids.has(node.id) ? { ...node, visible: node.type === "group" ? false : operation.visible } : node,
      ));
      continue;
    }
    if (operation.op === "bind") {
      commitNodesIfValid(nodes.map((node) =>
        node.id === operation.nodeId
          ? {
              ...node,
              bindings: {
                ...node.bindings,
                [operation.property]: operation.field,
              },
            }
          : node,
      ));
      continue;
    }
    if (operation.op === "unbind") {
      commitNodesIfValid(nodes.map((node) => {
        if (node.id !== operation.nodeId) return node;
        const bindings = { ...node.bindings };
        delete bindings[operation.property];
        return {
          ...node,
          bindings: Object.keys(bindings).length ? bindings : undefined,
        };
      }));
    }
  }

  if (JSON.stringify(nodes) === initialNodesJson) return scene;

  return {
    ...scene,
    nodes,
    metadata: {
      ...scene.metadata,
      updatedAt: Date.now(),
    },
  };
}

function getChangedSketchNodeFields(beforeNode: SketchSceneNode, afterNode: SketchSceneNode): string[] {
  const fields = new Set([...Object.keys(beforeNode), ...Object.keys(afterNode)]);
  fields.delete("id");
  return [...fields]
    .filter((field) => {
      const key = field as keyof SketchSceneNode;
      return JSON.stringify(beforeNode[key]) !== JSON.stringify(afterNode[key]);
    })
    .sort();
}

function buildSketchScenePatchSummary(
  beforeScene: SketchSceneDocument,
  afterScene: SketchSceneDocument,
  operationCount: number,
): SketchScenePatchSummary {
  const beforeById = new Map(beforeScene.nodes.map((node) => [node.id, node]));
  const afterById = new Map(afterScene.nodes.map((node) => [node.id, node]));
  const addedNodeIds = afterScene.nodes.filter((node) => !beforeById.has(node.id)).map((node) => node.id);
  const deletedNodeIds = beforeScene.nodes.filter((node) => !afterById.has(node.id)).map((node) => node.id);
  const updatedNodeIds = afterScene.nodes
    .filter((node) => {
      const beforeNode = beforeById.get(node.id);
      return beforeNode ? JSON.stringify(beforeNode) !== JSON.stringify(node) : false;
    })
    .map((node) => node.id);
  const updatedFieldsByNodeId = Object.fromEntries(
    updatedNodeIds.map((nodeId) => [
      nodeId,
      getChangedSketchNodeFields(beforeById.get(nodeId) as SketchSceneNode, afterById.get(nodeId) as SketchSceneNode),
    ]),
  );
  const affectedNodeIds = new Set([...addedNodeIds, ...deletedNodeIds, ...updatedNodeIds]);
  return {
    operationCount,
    changed: affectedNodeIds.size > 0,
    beforeNodeCount: beforeScene.nodes.length,
    afterNodeCount: afterScene.nodes.length,
    addedNodeIds,
    deletedNodeIds,
    updatedNodeIds,
    updatedFieldsByNodeId,
    addedCount: addedNodeIds.length,
    deletedCount: deletedNodeIds.length,
    updatedCount: updatedNodeIds.length,
    affectedNodeCount: affectedNodeIds.size,
  };
}

export function applySketchScenePatchOperationsWithResult(
  scene: SketchSceneDocument,
  operations: SketchScenePatchOperation[],
): SketchScenePatchResult {
  const nextScene = applySketchScenePatchOperations(scene, operations);
  return {
    scene: nextScene,
    validation: validateSketchSceneDocument(nextScene),
    summary: buildSketchScenePatchSummary(scene, nextScene, operations.length),
  };
}

export function bindSketchSceneConfigField(
  scene: SketchSceneDocument,
  nodeId: string,
  property: keyof SketchSceneNodeBindings,
  field: string,
): SketchSceneDocument {
  return applySketchScenePatchOperations(scene, [
    { op: "bind", nodeId, property, field },
  ]);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function resolveBindingValue<T>(
  node: SketchSceneNode,
  property: keyof SketchSceneNodeBindings,
  fallback: T,
  configData?: Record<string, unknown>,
): T {
  const key = node.bindings?.[property];
  if (!key || !configData || !(key in configData)) return fallback;
  const value = configData[key];
  if (property === "visible") return (typeof value === "boolean" ? value : fallback) as T;
  return (typeof value === "string" ? value : fallback) as T;
}

export function resolveSketchSceneBindingValue<T>(
  node: SketchSceneNode,
  property: keyof SketchSceneNodeBindings,
  fallback: T,
  configData?: Record<string, unknown>,
): T {
  return resolveBindingValue(node, property, fallback, configData);
}

function isSketchNodeRenderable(node: SketchSceneNode, configData?: Record<string, unknown>): boolean {
  if (node.type === "group") return false;
  if (resolveBindingValue(node, "visible", node.visible ?? true, configData) === false) return false;
  if (node.type === "image") {
    const src = resolveBindingValue(node, "src", node.src ?? "", configData);
    return typeof src === "string" && src.trim().length > 0;
  }
  return true;
}

function styleNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function nodeTransform(node: SketchSceneNode): string {
  const rotation = styleNumber(node.rotation, 0);
  if (!rotation) return "";
  const center = getSketchNodeRotationCenter(node);
  return ` transform="rotate(${rotation} ${center.x} ${center.y})"`;
}

function getSketchNodeRotationCenter(node: SketchSceneNode): { x: number; y: number } {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

function rotateSketchPoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  rotation: number,
): { x: number; y: number } {
  const radians = (rotation * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function renderTextLines(text: string, x: number): string {
  const escapedX = escapeAttr(x);
  return escapeHtml(text)
    .split(/\r?\n/)
    .map((line, index) =>
      `<tspan x="${escapedX}" dy="${index === 0 ? "0" : "1.25em"}">${line || " "}</tspan>`,
    )
    .join("");
}

function renderTextStyleOverrideAttributes(style: SketchSceneTextStyleOverride): string {
  const attributes: string[] = [];
  if (style.color) attributes.push(`fill="${escapeAttr(style.color)}"`);
  if (style.fontSize !== undefined) attributes.push(`font-size="${escapeAttr(style.fontSize)}"`);
  if (style.fontWeight !== undefined) attributes.push(`font-weight="${escapeAttr(style.fontWeight)}"`);
  if (style.fontFamily) attributes.push(`font-family="${escapeAttr(style.fontFamily)}"`);
  if (style.italic === true) attributes.push('font-style="italic"');
  if (style.textDecoration && style.textDecoration !== "none") {
    attributes.push(`text-decoration="${escapeAttr(style.textDecoration)}"`);
  }
  if (style.letterSpacing !== undefined) attributes.push(`letter-spacing="${escapeAttr(style.letterSpacing)}"`);
  if (style.lineHeight !== undefined && style.lineHeight !== null) {
    attributes.push(`style="line-height:${escapeAttr(style.lineHeight)}px"`);
  }
  return attributes.length ? ` ${attributes.join(" ")}` : "";
}

function getSortedTextStyleRuns(
  text: string,
  runs: SketchSceneTextStyleRun[] | undefined,
): SketchSceneTextStyleRun[] {
  if (!runs?.length || text.length === 0) return [];
  return runs
    .map((run) => {
      const start = Math.min(Math.max(0, Math.floor(run.start)), text.length);
      const end = Math.min(Math.max(start, Math.floor(run.start + run.length)), text.length);
      return { ...run, start, length: end - start };
    })
    .filter((run) => run.length > 0)
    .sort((a, b) => a.start - b.start);
}

function renderStyledTextRange(
  text: string,
  start: number,
  end: number,
  runs: SketchSceneTextStyleRun[],
): string {
  let cursor = start;
  const chunks: string[] = [];
  while (cursor < end) {
    const activeRun = runs.find((run) => cursor >= run.start && cursor < run.start + run.length);
    if (activeRun) {
      const runEnd = Math.min(end, activeRun.start + activeRun.length);
      chunks.push(
        `<tspan${renderTextStyleOverrideAttributes(activeRun.style)}>${escapeHtml(text.slice(cursor, runEnd))}</tspan>`,
      );
      cursor = runEnd;
      continue;
    }

    const nextRun = runs.find((run) => run.start > cursor);
    const plainEnd = Math.min(end, nextRun?.start ?? end);
    chunks.push(escapeHtml(text.slice(cursor, plainEnd)));
    cursor = plainEnd;
  }
  return chunks.join("");
}

function renderTextLinesWithStyleRuns(
  text: string,
  x: number,
  runs: SketchSceneTextStyleRun[] | undefined,
): string {
  const sortedRuns = getSortedTextStyleRuns(text, runs);
  if (!sortedRuns.length) return renderTextLines(text, x);

  const escapedX = escapeAttr(x);
  const lines = text.split(/\r?\n/);
  let cursor = 0;
  return lines
    .map((line, index) => {
      const lineStart = cursor;
      const lineEnd = lineStart + line.length;
      cursor = lineEnd + (text[cursor + line.length] === "\r" && text[cursor + line.length + 1] === "\n" ? 2 : 1);
      const content = line
        ? renderStyledTextRange(text, lineStart, lineEnd, sortedRuns)
        : " ";
      return `<tspan x="${escapedX}" dy="${index === 0 ? "0" : "1.25em"}">${content}</tspan>`;
    })
    .join("");
}

function renderCenteredNodeLabel(
  node: SketchSceneNode,
  label: string,
  style: SketchSceneStyle,
  color: unknown,
  opacity: number,
  transform: string,
  defaultFontSize: number,
): string {
  const fontSize = styleNumber(style.fontSize, defaultFontSize);
  const labelX = node.x + node.width / 2;
  const labelY = node.y + Math.min(node.height / 2 + fontSize / 3, node.height - 8);
  const labelCommon = `data-sketch-node-label="${escapeAttr(node.id)}" opacity="${opacity}"${transform}`;
  return `<text ${labelCommon} x="${labelX}" y="${labelY}" fill="${escapeAttr(color)}" font-size="${fontSize}" font-weight="${escapeAttr(style.fontWeight ?? 500)}" text-anchor="middle">${renderTextLinesWithStyleRuns(label, labelX, node.textStyleRuns)}</text>`;
}

function renderSketchNode(
  node: SketchSceneNode,
  configData?: Record<string, unknown>,
): string {
  if (node.type === "group") return "";
  const visible = resolveBindingValue(node, "visible", node.visible ?? true, configData);
  if (visible === false) return "";

  const style = node.style ?? {};
  const fill = resolveBindingValue(node, "fill", style.fill ?? "transparent", configData);
  const stroke = resolveBindingValue(node, "stroke", style.stroke ?? "#1F2937", configData);
  const color = resolveBindingValue(node, "color", style.color ?? "#111827", configData);
  const opacity = styleNumber(style.opacity, 1);
  const strokeWidth = styleNumber(style.strokeWidth, 1);
  const radius = styleNumber(style.radius, node.type === "sticky" ? 12 : 6);
  const transform = nodeTransform(node);
  const common = `data-sketch-node-id="${escapeAttr(node.id)}" opacity="${opacity}"${transform}`;
  const dash = style.lineDash?.length ? ` stroke-dasharray="${style.lineDash.join(" ")}"` : "";

  if (node.type === "ellipse") {
    const ellipse = `<ellipse ${common} cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"${dash} />`;
    const label = resolveBindingValue(node, "text", node.text ?? "", configData);
    if (!label) return ellipse;
    return `${ellipse}${renderCenteredNodeLabel(node, String(label), style, color, opacity, transform, 16)}`;
  }

  if (node.type === "diamond") {
    const points = [
      `${node.x + node.width / 2},${node.y}`,
      `${node.x + node.width},${node.y + node.height / 2}`,
      `${node.x + node.width / 2},${node.y + node.height}`,
      `${node.x},${node.y + node.height / 2}`,
    ].join(" ");
    const diamond = `<polygon ${common} points="${points}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"${dash} />`;
    const label = resolveBindingValue(node, "text", node.text ?? "", configData);
    if (!label) return diamond;
    return `${diamond}${renderCenteredNodeLabel(node, String(label), style, color, opacity, transform, 16)}`;
  }

  if (node.type === "line" || node.type === "arrow") {
    const x2 = node.x + node.width;
    const y2 = node.y + node.height;
    const startArrow = style.startArrow === "arrow";
    const endArrow = node.type === "arrow" ? style.endArrow !== "none" : style.endArrow === "arrow";
    const markers = `${startArrow ? ' marker-start="url(#sketch-arrow)"' : ""}${endArrow ? ' marker-end="url(#sketch-arrow)"' : ""}`;
    return `<line ${common} x1="${node.x}" y1="${node.y}" x2="${x2}" y2="${y2}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round"${dash}${markers} />`;
  }

  if (node.type === "path") {
    if (!node.path) return "";
    return `<path ${common} d="${escapeAttr(node.path)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash} />`;
  }

  if (node.type === "image") {
    const src = resolveBindingValue(node, "src", node.src ?? "", configData);
    if (!src) return "";
    const preserveAspectRatio =
      style.imageFit === "fill"
        ? "none"
        : style.imageFit === "contain"
          ? "xMidYMid meet"
          : "xMidYMid slice";
    return `<image ${common} href="${escapeAttr(src)}" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" preserveAspectRatio="${preserveAspectRatio}"><title>${escapeHtml(node.alt ?? node.name ?? "")}</title></image>`;
  }

  if (node.type === "text") {
    const text = resolveBindingValue(node, "text", node.text ?? "", configData);
    const fontSize = styleNumber(style.fontSize, 18);
    const fontWeight = style.fontWeight ?? 400;
    const anchor = style.textAlign === "center" ? "middle" : style.textAlign === "right" ? "end" : "start";
    const x = style.textAlign === "center" ? node.x + node.width / 2 : style.textAlign === "right" ? node.x + node.width : node.x;
    return `<text ${common} x="${x}" y="${node.y + fontSize}" fill="${escapeAttr(color)}" font-size="${fontSize}" font-weight="${escapeAttr(fontWeight)}" text-anchor="${anchor}">${renderTextLinesWithStyleRuns(String(text), x, node.textStyleRuns)}</text>`;
  }

  const isControl = node.type === "button" || node.type === "input" || node.type === "card";
  const resolvedFill =
    fill !== "transparent"
      ? fill
      : node.type === "sticky"
        ? "#FEF3C7"
        : isControl
          ? "#F9FAFB"
          : "#FFFFFF";
  const label = resolveBindingValue(node, "text", node.text ?? "", configData);
  const rect = `<rect ${common} x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${radius}" ry="${radius}" fill="${escapeAttr(resolvedFill)}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"${dash} />`;
  if (!label) return rect;
  return `${rect}${renderCenteredNodeLabel(node, String(label), style, color, opacity, transform, node.type === "sticky" ? 18 : 16)}`;
}

export function renderSketchSceneToSvgMarkup(
  scene: SketchSceneDocument,
  configData: Record<string, unknown> = {},
): string {
  const validation = validateSketchSceneDocument(scene);
  const safeScene = validation.valid ? scene : createDefaultSketchScene(getValidSketchScenePageSize(scene));
  const nodes = [...safeScene.nodes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const width = safeScene.pageSize.width;
  const height = safeScene.pageSize.height;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sketch scene">`,
    "<defs>",
    '<marker id="sketch-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth">',
    '<path d="M0,0 L0,6 L9,3 z" fill="context-stroke" />',
    "</marker>",
    "</defs>",
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" />`,
    ...nodes.map((node) => renderSketchNode(node, configData)),
    "</svg>",
  ].join("");
}

export function getSketchSceneHashSource(
  scene: SketchSceneDocument,
  configData: Record<string, unknown> = {},
): string {
  return renderSketchSceneToSvgMarkup(scene, configData);
}

export function buildSketchScenePreviewDocumentHtml(input: {
  scene: SketchSceneDocument;
  configData?: Record<string, unknown>;
  previewSize?: SketchScenePageSize;
}): string {
  const scene = input.scene;
  const pageSize = input.previewSize
    ? getValidSketchScenePageSizeValue(input.previewSize, getValidSketchScenePageSize(scene))
    : getValidSketchScenePageSize(scene);
  const width = pageSize.width;
  const height = pageSize.height;
  const svg = renderSketchSceneToSvgMarkup(
    validateSketchSceneDocument(scene).valid ? scene : createDefaultSketchScene(pageSize),
    input.configData,
  );
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; width: ${width}px; min-height: ${height}px; background: #fff; }
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .sketch-scene-root { width: ${width}px; min-height: ${height}px; overflow: hidden; background: #fff; }
    .sketch-scene-root svg { display: block; width: ${width}px; height: ${height}px; }
  </style>
</head>
<body>
  <main class="sketch-scene-root">${svg}</main>
</body>
</html>`;
}

function getSketchNodeLocalBounds(node: SketchSceneNode): SketchSceneBounds {
  return {
    x: Math.min(node.x, node.x + node.width),
    y: Math.min(node.y, node.y + node.height),
    width: Math.abs(node.width),
    height: Math.abs(node.height),
  };
}

export function getSketchNodeBounds(node: SketchSceneNode): SketchSceneBounds {
  const bounds = getSketchNodeLocalBounds(node);
  const rotation = styleNumber(node.rotation, 0);
  if (!rotation) return bounds;
  const center = getSketchNodeRotationCenter(node);
  const points = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => rotateSketchPoint(point, center, rotation));
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function getSketchSelectionBounds(nodes: SketchSceneNode[]): SketchSceneBounds | null {
  if (!nodes.length) return null;
  const bounds = nodes.map(getSketchNodeBounds);
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function getSnapAnchors(bounds: SketchSceneBounds): Array<{ kind: "start" | "center" | "end"; x?: number; y?: number }> {
  return [
    { kind: "start", x: bounds.x, y: bounds.y },
    { kind: "center", x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    { kind: "end", x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];
}

function pickBestSnapCandidate(
  candidates: Array<{ distance: number; delta: number; line: SketchSnapLine }>,
): { delta: number; lines: SketchSnapLine[] } | null {
  if (!candidates.length) return null;
  const bestDistance = Math.min(...candidates.map((candidate) => candidate.distance));
  const best = candidates.filter((candidate) => candidate.distance === bestDistance);
  return {
    delta: best[0].delta,
    lines: best.map((candidate) => candidate.line),
  };
}

export function computeSketchSnapResult(options: ComputeSketchSnapOptions): SketchSnapResult {
  const threshold = options.threshold ?? 6;
  const movingNodeIds = new Set(options.movingNodeIds ?? []);
  const movingAnchors = getSnapAnchors(options.movingBounds);
  const verticalCandidates: Array<{ distance: number; delta: number; line: SketchSnapLine }> = [];
  const horizontalCandidates: Array<{ distance: number; delta: number; line: SketchSnapLine }> = [];

  for (const node of options.nodes) {
    if (movingNodeIds.has(node.id) || node.type === "group" || node.visible === false) continue;
    const targetBounds = getSketchNodeBounds(node);
    const targetAnchors = getSnapAnchors(targetBounds);
    for (const movingAnchor of movingAnchors) {
      for (const targetAnchor of targetAnchors) {
        if (movingAnchor.x !== undefined && targetAnchor.x !== undefined) {
          const delta = targetAnchor.x - movingAnchor.x;
          const distance = Math.abs(delta);
          if (distance <= threshold) {
            verticalCandidates.push({
              distance,
              delta,
              line: {
                orientation: "vertical",
                position: targetAnchor.x,
                from: Math.min(options.movingBounds.y, targetBounds.y),
                to: Math.max(options.movingBounds.y + options.movingBounds.height, targetBounds.y + targetBounds.height),
                targetNodeId: node.id,
              },
            });
          }
        }
        if (movingAnchor.y !== undefined && targetAnchor.y !== undefined) {
          const delta = targetAnchor.y - movingAnchor.y;
          const distance = Math.abs(delta);
          if (distance <= threshold) {
            horizontalCandidates.push({
              distance,
              delta,
              line: {
                orientation: "horizontal",
                position: targetAnchor.y,
                from: Math.min(options.movingBounds.x, targetBounds.x),
                to: Math.max(options.movingBounds.x + options.movingBounds.width, targetBounds.x + targetBounds.width),
                targetNodeId: node.id,
              },
            });
          }
        }
      }
    }
  }

  if (options.includeGrid && options.gridSize && options.gridSize > 0) {
    const gridSize = options.gridSize;
    for (const movingAnchor of movingAnchors) {
      if (movingAnchor.x !== undefined) {
        const position = Math.round(movingAnchor.x / gridSize) * gridSize;
        const delta = position - movingAnchor.x;
        const distance = Math.abs(delta);
        if (distance <= threshold) {
          verticalCandidates.push({
            distance,
            delta,
            line: {
              orientation: "vertical",
              position,
              from: options.movingBounds.y,
              to: options.movingBounds.y + options.movingBounds.height,
            },
          });
        }
      }
      if (movingAnchor.y !== undefined) {
        const position = Math.round(movingAnchor.y / gridSize) * gridSize;
        const delta = position - movingAnchor.y;
        const distance = Math.abs(delta);
        if (distance <= threshold) {
          horizontalCandidates.push({
            distance,
            delta,
            line: {
              orientation: "horizontal",
              position,
              from: options.movingBounds.x,
              to: options.movingBounds.x + options.movingBounds.width,
            },
          });
        }
      }
    }
  }

  const vertical = pickBestSnapCandidate(verticalCandidates);
  const horizontal = pickBestSnapCandidate(horizontalCandidates);
  return {
    delta: { x: vertical?.delta ?? 0, y: horizontal?.delta ?? 0 },
    lines: [...(vertical?.lines ?? []), ...(horizontal?.lines ?? [])],
  };
}

function getPointToSegmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Number.POSITIVE_INFINITY;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function hitTestLineLikeNode(node: SketchSceneNode, point: { x: number; y: number }): boolean {
  const strokeWidth = styleNumber(node.style?.strokeWidth, 1);
  const tolerance = Math.max(6, strokeWidth / 2 + 3);
  return getPointToSegmentDistance(
    point,
    { x: node.x, y: node.y },
    { x: node.x + node.width, y: node.y + node.height },
  ) <= tolerance;
}

function hitTestPathNode(node: SketchSceneNode, point: { x: number; y: number }): boolean {
  const points = node.points;
  if (!points || points.length < 2) {
    const bounds = getSketchNodeLocalBounds(node);
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }
  const strokeWidth = styleNumber(node.style?.strokeWidth, 1);
  const tolerance = Math.max(6, strokeWidth / 2 + 3);
  for (let index = 1; index < points.length; index += 1) {
    if (getPointToSegmentDistance(point, points[index - 1], points[index]) <= tolerance) {
      return true;
    }
  }
  return false;
}

function getNodeLocalPointForHitTest(
  node: SketchSceneNode,
  point: { x: number; y: number },
): { x: number; y: number } {
  const rotation = styleNumber(node.rotation, 0);
  if (!rotation) return point;
  return rotateSketchPoint(point, getSketchNodeRotationCenter(node), -rotation);
}

export function hitTestSketchScene(
  scene: SketchSceneDocument,
  point: { x: number; y: number },
  configData: Record<string, unknown> = {},
): SketchSceneNode | null {
  const nodes = scene.nodes
    .map((node, index) => ({ node, index }))
    .filter((entry) => isSketchNodeRenderable(entry.node, configData))
    .sort((a, b) => {
      const zDiff = (b.node.zIndex ?? 0) - (a.node.zIndex ?? 0);
      return zDiff || b.index - a.index;
    })
    .map((entry) => entry.node);
  return nodes.find((node) => {
    const localPoint = getNodeLocalPointForHitTest(node, point);
    if (node.type === "line" || node.type === "arrow") {
      return hitTestLineLikeNode(node, localPoint);
    }
    if (node.type === "path") {
      return hitTestPathNode(node, localPoint);
    }
    if (node.type === "diamond") {
      const bounds = getSketchNodeLocalBounds(node);
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const normalizedX = bounds.width === 0 ? 0 : Math.abs(localPoint.x - centerX) / (bounds.width / 2);
      const normalizedY = bounds.height === 0 ? 0 : Math.abs(localPoint.y - centerY) / (bounds.height / 2);
      return normalizedX + normalizedY <= 1;
    }
    const bounds = getSketchNodeLocalBounds(node);
    return (
      localPoint.x >= bounds.x &&
      localPoint.x <= bounds.x + bounds.width &&
      localPoint.y >= bounds.y &&
      localPoint.y <= bounds.y + bounds.height
    );
  }) ?? null;
}

export function translateSketchNodes(
  nodes: SketchSceneNode[],
  delta: { x: number; y: number },
): SketchSceneNode[] {
  if (!nodes.length) return nodes;
  const minX = Math.min(
    ...nodes.map((node) => (node.type === "line" || node.type === "arrow" ? Math.min(node.x, node.x + node.width) : node.x)),
  );
  const minY = Math.min(
    ...nodes.map((node) => (node.type === "line" || node.type === "arrow" ? Math.min(node.y, node.y + node.height) : node.y)),
  );
  const nextDelta = {
    x: Math.max(delta.x, -minX),
    y: Math.max(delta.y, -minY),
  };
  return nodes.map((node) => {
    return {
      ...node,
      x: Math.round(node.x + nextDelta.x),
      y: Math.round(node.y + nextDelta.y),
    };
  });
}

function getMinimumLineLikeVector(node: SketchSceneNode): { width: number; height: number } {
  const width = node.width === 0 ? 0 : node.width < 0 ? -1 : 1;
  const height = node.height === 0 ? 0 : node.height < 0 ? -1 : 1;
  if (width !== 0 || height !== 0) return { width, height };
  return { width: 1, height: 0 };
}

export function resizeSketchNode(
  node: SketchSceneNode,
  handle: SketchSceneResizeHandle,
  delta: { x: number; y: number },
): SketchSceneNode {
  const lineLikeType = node.type === "line" || node.type === "arrow";
  const minSize = lineLikeType ? 0 : 8;
  let { x, y, width, height } = node;
  if (handle.includes("e")) width += delta.x;
  if (handle.includes("s")) height += delta.y;
  if (handle.includes("w")) {
    x += delta.x;
    width -= delta.x;
  }
  if (handle.includes("n")) {
    y += delta.y;
    height -= delta.y;
  }
  if (!lineLikeType && width < minSize) {
    if (handle.includes("w")) x = node.x + node.width - minSize;
    width = minSize;
  }
  if (!lineLikeType && height < minSize) {
    if (handle.includes("n")) y = node.y + node.height - minSize;
    height = minSize;
  }
  if (x < 0) {
    if (handle.includes("w")) width = Math.max(minSize, width + x);
    x = 0;
  }
  if (y < 0) {
    if (handle.includes("n")) height = Math.max(minSize, height + y);
    y = 0;
  }
  if (lineLikeType && x + width < 0) {
    width = -x;
  }
  if (lineLikeType && y + height < 0) {
    height = -y;
  }
  if (lineLikeType && width === 0 && height === 0) {
    const vector = getMinimumLineLikeVector(node);
    if (vector.width < 0) x = Math.max(1, x);
    if (vector.height < 0) y = Math.max(1, y);
    width = vector.width;
    height = vector.height;
  }
  return {
    ...node,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function rotateSketchNode(node: SketchSceneNode, rotation: number): SketchSceneNode {
  return {
    ...node,
    rotation: Math.round(rotation),
  };
}
