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

export interface WhiteboardEditorView {
  zoom: number;
  offsetX: number;
  offsetY: number;
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

/** Current durable whiteboard envelope. */
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

/** Read-only compatibility shape for documents created before v2. */
export interface LegacyWhiteboardDocument {
  id: string;
  version: 1;
  scene: SketchSceneDocument;
  editorView: WhiteboardEditorView;
  updatedAt: number;
}

/** Public type accepts legacy reads; all newly-created/serialized documents are v2. */
export type WhiteboardDocument = WhiteboardDocumentV2 | LegacyWhiteboardDocument;

export interface WhiteboardBinding {
  id: string;
  target: ImageConfigTarget;
  whiteboardId: string;
  /** Document revision represented by outputAssetHash. */
  documentRevisionAtOutput: number;
  /** @deprecated read-only alias accepted for pre-v2 bindings. */
  sceneRevision?: number;
  outputAssetHash: string;
  updatedAt: number;
}

export const WHITEBOARD_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;
export const WHITEBOARD_DOCUMENT_VERSION = 2 as const;
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
  if ((version !== 1 && version !== 2) || !scene || !validateSketchSceneDocument(scene).valid) return false;
  const view = document.editorView as WhiteboardEditorView | undefined;
  if (!view || !Number.isFinite(view.zoom) || view.zoom <= 0) return false;
  if (!Number.isFinite(view.offsetX) || !Number.isFinite(view.offsetY) || !Number.isFinite(document.updatedAt)) return false;
  if (version === 2) {
    const documentRevision = document.documentRevision;
    const nodeSemantics = document.nodeSemantics;
    if (!Number.isInteger(documentRevision) || (documentRevision as number) < 0) return false;
    if (!nodeSemantics || typeof nodeSemantics !== "object" || Array.isArray(nodeSemantics)) return false;
    const nodeIds = new Set(scene.nodes.map((node) => node.id));
    if (scene.nodes.some((node) => !(WHITEBOARD_BRIDGE_NODE_TYPES as readonly string[]).includes(node.type))) return false;
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
    && Number.isFinite(binding.updatedAt) && Boolean(target)
    && (target!.scope === "page" || target!.scope === "project")
    && (target!.scope === "page"
      ? typeof target!.pageId === "string" && /^[A-Za-z0-9_-]+$/.test(target!.pageId)
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
  return scene.nodes.find((node) => node.id === nodeId)?.type;
}

function isSafeArea(value: WhiteboardSafeArea, scene: SketchSceneDocument): boolean {
  return [value.x, value.y, value.width, value.height].every(Number.isFinite)
    && value.width >= 0 && value.height >= 0
    && value.x >= 0 && value.y >= 0
    && value.x + value.width <= scene.pageSize.width
    && value.y + value.height <= scene.pageSize.height;
}

export function getWhiteboardDocumentRevision(document: WhiteboardDocument | null | undefined): number {
  return document?.version === 2 && Number.isInteger(document.documentRevision) ? document.documentRevision : 0;
}

export function asWhiteboardDocumentV2(document: WhiteboardDocument): WhiteboardDocumentV2 {
  if (document.version === 2) return document;
  const nodeSemantics: Record<string, WhiteboardNodeSemantics> = {};
  return {
    ...document,
    version: 2,
    documentRevision: 0,
    nodeSemantics,
    // Legacy scene metadata/assets/bindings were never part of the whiteboard
    // bridge. Strip those non-authoritative projections during the one-way
    // read normalization; unsupported node kinds remain visible to the core
    // validator and therefore still block an unsafe write.
    scene: { ...document.scene, assets: [], bindings: {}, metadata: {} },
  };
}
