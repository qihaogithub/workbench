import { validateSketchSceneDocument, type SketchSceneDocument, type SketchSceneNode } from "@workbench/sketch-core";

/** A deliberately narrow, durable pointer to an image configuration value. */
export interface ImageConfigTarget {
  scope: "page" | "project";
  pageId?: string;
  fieldPath: readonly [string];
  /** Present only for an image-list item. `itemValue` is the conflict guard; index is only a hint. */
  item?: { indexHint: number; itemValue: string };
}

/** A parsed, canonical configuration path used by image whiteboard bindings. */
export type WhiteboardConfigPathSegment = string | number;

const WHITEBOARD_CONFIG_PATH_MAX_SEGMENTS = 32;

/**
 * Parses the deliberately small path grammar accepted by whiteboard targets:
 * `field`, `items[0]`, or `items[0].image`. It is shared by binding reads and
 * writes so a persisted binding cannot describe a path the commit endpoint
 * would reject.
 */
export function parseWhiteboardConfigPath(value: string): WhiteboardConfigPathSegment[] | null {
  if (!value || value.length > 512) return null;
  const segments: WhiteboardConfigPathSegment[] = [];
  let offset = 0;
  let expectsProperty = true;
  while (offset < value.length) {
    if (expectsProperty) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(value.slice(offset));
      if (!match || RESERVED_CONFIG_KEYS.has(match[0])) return null;
      segments.push(match[0]);
      offset += match[0].length;
      expectsProperty = false;
    }
    while (value[offset] === "[") {
      const match = /^\[(0|[1-9][0-9]*)\]/.exec(value.slice(offset));
      if (!match) return null;
      const index = Number(match[1]);
      if (!Number.isSafeInteger(index)) return null;
      segments.push(index);
      offset += match[0].length;
    }
    if (offset === value.length) break;
    if (value[offset] !== ".") return null;
    offset += 1;
    expectsProperty = true;
  }
  return !expectsProperty && segments.length > 0 && segments.length <= WHITEBOARD_CONFIG_PATH_MAX_SEGMENTS
    ? segments
    : null;
}

export function isWhiteboardConfigPath(value: unknown): value is string {
  return typeof value === "string" && parseWhiteboardConfigPath(value) !== null;
}

/**
 * Validates a page id before it is used as a single workspace path segment.
 * Page ids may contain Unicode because imported workspaces can retain their
 * original directory names; path separators and control characters are never
 * valid ids.
 */
export function isWhiteboardPageId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value !== "."
    && value !== ".."
    && !/[\\/]/u.test(value)
    && !/[\p{Cc}\p{Cs}]/u.test(value);
}
export type WhiteboardEditorViewMode = "fit-content" | "manual";

export interface WhiteboardEditorView {
  /** Missing on old documents; normalized V3 documents always write it. */
  mode?: WhiteboardEditorViewMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export function normalizeWhiteboardEditorView(
  view: WhiteboardEditorView,
): WhiteboardEditorView {
  return {
    ...view,
    mode: view.mode === "manual" ? "manual" : "fit-content",
  };
}

export type WhiteboardNodeRole =
  | "background"
  | "subject"
  | "logo"
  | "decor"
  | "title"
  | "subtitle"
  | "label";

export interface WhiteboardNodeSemantics {
  role?: WhiteboardNodeRole;
  /** Stable managed asset identity. This is never a data URL or temporary URL. */
  assetRef?: string;
}

export interface WhiteboardSafeArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Durable whiteboard envelope used by the legacy bridge-era writer. */
export interface WhiteboardDocumentV2 {
  id: string;
  version: 2;
  /** Monotonic CAS revision owned by this document, independent of Workspace revision. */
  documentRevision: number;
  scene: SketchSceneDocument;
  nodeSemantics: Record<string, WhiteboardNodeSemantics>;
  safeArea?: WhiteboardSafeArea;
  editorView: WhiteboardEditorView;
  updatedAt: number;
}

/**
 * Full-fidelity durable whiteboard envelope.
 *
 * `scene` is the single source of truth for editing and rendering.  Unlike
 * the HTML/CSS bridge projection, this envelope intentionally retains every
 * SketchScene field, including scene assets, bindings and metadata.
 */
export interface WhiteboardDocumentV3 {
  id: string;
  version: 3;
  sceneFormat: "sketch-scene-v1";
  /** Monotonic CAS revision owned by this document, independent of Workspace revision. */
  documentRevision: number;
  scene: SketchSceneDocument;
  nodeSemantics: Record<string, WhiteboardNodeSemantics>;
  safeArea?: WhiteboardSafeArea;
  editorView: WhiteboardEditorView;
  updatedAt: number;
}

/** Read-only compatibility shape for documents created before v2. */
export interface LegacyWhiteboardDocument {
  id: string;
  version: 1;
  scene: SketchSceneDocument;
  editorView: WhiteboardEditorView;
  updatedAt: number;
}

/** Public type accepts legacy reads; new normalized documents are V3. */
export type WhiteboardDocument = WhiteboardDocumentV3 | WhiteboardDocumentV2 | LegacyWhiteboardDocument;

export type WhiteboardDocumentVersion = WhiteboardDocument["version"];

export interface WhiteboardBinding {
  id: string;
  target: ImageConfigTarget;
  whiteboardId: string;
  /** Document revision represented by outputAssetHash. */
  documentRevisionAtOutput: number;
  /** Version of the document represented by outputAssetHash. Optional for legacy bindings. */
  documentVersion?: 2 | 3;
  /** @deprecated read-only alias accepted for pre-v2 bindings. */
  sceneRevision?: number;
  outputAssetHash: string;
  updatedAt: number;
}

export const WHITEBOARD_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;
export {
  WHITEBOARD_DOCUMENT_VERSION,
  WHITEBOARD_DOCUMENT_V2_VERSION,
  WHITEBOARD_DOCUMENT_V3_VERSION,
} from "@workbench/whiteboard-core";
export const WHITEBOARD_SCENE_FORMAT = "sketch-scene-v1" as const;
export const WHITEBOARD_BRIDGE_NODE_TYPES = ["group", "rect", "ellipse", "image", "text", "button"] as const;

export function whiteboardDocumentPath(id: string): string {
  return `whiteboards/${id}.json`;
}

export function isWhiteboardDocument(value: unknown): value is WhiteboardDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const document = value as Record<string, unknown>;
  if (typeof document.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(document.id)) return false;
  const version = document.version;
  const scene = document.scene as SketchSceneDocument | undefined;
  if ((version !== 1 && version !== 2 && version !== 3) || !scene || !validateSketchSceneDocument(scene).valid) return false;
  if (version === 3 && document.sceneFormat !== WHITEBOARD_SCENE_FORMAT) return false;
  if (version !== 3 && document.sceneFormat !== undefined) return false;
  const view = document.editorView as WhiteboardEditorView | undefined;
  if (!view || (view.mode !== undefined && view.mode !== "fit-content" && view.mode !== "manual") || !Number.isFinite(view.zoom) || view.zoom <= 0) return false;
  if (!Number.isFinite(view.offsetX) || !Number.isFinite(view.offsetY) || !Number.isFinite(document.updatedAt) || (document.updatedAt as number) < 0) return false;
  if (version === 2 || version === 3) {
    const documentRevision = document.documentRevision;
    const nodeSemantics = document.nodeSemantics;
    if (!Number.isInteger(documentRevision) || (documentRevision as number) < 0) return false;
    if (!nodeSemantics || typeof nodeSemantics !== "object" || Array.isArray(nodeSemantics)) return false;
    const nodeIds = new Set(scene.nodes.map((node) => node.id));
    for (const [nodeId, semantics] of Object.entries(nodeSemantics)) {
      if (!nodeIds.has(nodeId) || !semantics || typeof semantics !== "object" || Array.isArray(semantics)) return false;
      if (semantics.role !== undefined && !WHITEBOARD_NODE_ROLES.has(semantics.role)) return false;
      if (semantics.assetRef !== undefined && (!isManagedAssetId(semantics.assetRef) || sceneNodeType(scene, nodeId) !== "image")) return false;
      if (Object.keys(semantics).some((key) => key !== "role" && key !== "assetRef")) return false;
    }
    if (document.safeArea && !isSafeArea(document.safeArea as WhiteboardSafeArea, scene)) return false;
  }
  return true;
}

export function isWhiteboardBinding(value: unknown): value is WhiteboardBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Partial<WhiteboardBinding>;
  const target = binding.target;
  const documentRevision = binding.documentRevisionAtOutput ?? binding.sceneRevision;
  return typeof binding.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(binding.id)
    && typeof binding.whiteboardId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(binding.whiteboardId)
    && typeof binding.outputAssetHash === "string" && Number.isInteger(documentRevision) && (documentRevision as number) >= 0
    && (binding.documentVersion === undefined || binding.documentVersion === 2 || binding.documentVersion === 3)
    && Number.isFinite(binding.updatedAt) && Boolean(target)
    && (target!.scope === "page" || target!.scope === "project")
    && (target!.scope === "page"
      ? isWhiteboardPageId(target!.pageId)
      : target!.pageId === undefined)
    && Array.isArray(target!.fieldPath) && target!.fieldPath.length === 1
    && isWhiteboardConfigPath(target!.fieldPath[0])
    && (!target!.item || (Number.isInteger(target!.item.indexHint) && target!.item.indexHint >= 0 && typeof target!.item.itemValue === "string"));
}

const RESERVED_CONFIG_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const WHITEBOARD_NODE_ROLES = new Set<WhiteboardNodeRole>([
  "background", "subject", "logo", "decor", "title", "subtitle", "label",
]);

function isManagedAssetId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) && !value.includes("/" );
}

function sceneNodeType(scene: SketchSceneDocument, nodeId: string): SketchSceneNode["type"] | undefined {
  const sceneNodes = Array.isArray(scene?.nodes) ? scene.nodes : [];
  return sceneNodes.find((node) => node?.id === nodeId)?.type;
}

function isSafeArea(value: WhiteboardSafeArea, scene: SketchSceneDocument): boolean {
  const pageSize = scene.pageSize as { width?: unknown; height?: unknown } | undefined;
  return [value.x, value.y, value.width, value.height].every(Number.isFinite)
    && value.width >= 0 && value.height >= 0
    && value.x >= 0 && value.y >= 0
    && typeof pageSize?.width === "number" && Number.isFinite(pageSize.width)
    && typeof pageSize?.height === "number" && Number.isFinite(pageSize.height)
    && value.x + value.width <= pageSize.width
    && value.y + value.height <= pageSize.height;
}

export function getWhiteboardDocumentRevision(document: WhiteboardDocument | null | undefined): number {
  return (document?.version === 2 || document?.version === 3) && Number.isInteger(document.documentRevision)
    ? document.documentRevision
    : 0;
}

export function asWhiteboardDocumentV2(document: WhiteboardDocument): WhiteboardDocumentV2 {
  if (document.version === 2) return document;
  const { sceneFormat: _sceneFormat, ...legacyEnvelope } = document.version === 3 ? document : { ...document, sceneFormat: undefined };
  void _sceneFormat;
  const nodeSemantics: Record<string, WhiteboardNodeSemantics> = {};
  return {
    ...legacyEnvelope,
    version: 2,
    documentRevision: document.version === 3 ? document.documentRevision : 0,
    nodeSemantics: document.version === 3 ? { ...document.nodeSemantics } : nodeSemantics,
    // This is a compatibility envelope for the code bridge, not a scene
    // canonicalizer. Keep the complete scene so callers can explicitly choose
    // whether to project it through the restricted bridge.
    scene: { ...document.scene },
  };
}

/** Upgrade a legacy/V2 read into the full-fidelity V3 envelope. */
export function asWhiteboardDocumentV3(document: WhiteboardDocument): WhiteboardDocumentV3 {
  if (document.version === 3) {
    return {
      ...document,
      editorView: normalizeWhiteboardEditorView(document.editorView),
    };
  }
  return {
    ...document,
    version: 3,
    sceneFormat: WHITEBOARD_SCENE_FORMAT,
    documentRevision: document.version === 2 && Number.isInteger(document.documentRevision)
      ? document.documentRevision
      : 0,
    nodeSemantics: document.version === 2 ? { ...document.nodeSemantics } : {},
    scene: { ...document.scene },
    editorView: normalizeWhiteboardEditorView(document.editorView),
  };
}

export function isWhiteboardDocumentV3(value: unknown): value is WhiteboardDocumentV3 {
  return isWhiteboardDocument(value) && value.version === 3;
}
