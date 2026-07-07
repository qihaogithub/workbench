"use client";

import React, { useMemo } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyStart,
  ArrowRight,
  Circle,
  Command,
  Copy,
  Diamond,
  Eraser,
  Eye,
  EyeOff,
  Group,
  Hand,
  ImageIcon,
  Keyboard,
  Link2,
  Lock,
  LocateFixed,
  MoreHorizontal,
  MousePointer2,
  PaintBucket,
  Pencil,
  PenLine,
  Redo2,
  Rows3,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  applySketchScenePatchOperations,
  createDefaultSketchScene,
  getSketchConnectorAnchorPoint,
  getSketchSelectionBounds,
  getSketchNodeBounds,
  hitTestSketchScene,
  parseSketchSceneDocument,
  renderSketchSceneToSvgMarkup,
  resolveSketchSceneBindingValue,
  resizeSketchNode,
  rotateSketchNode,
  translateSketchNodes,
  validateSketchSceneDocument,
  type SketchSceneBounds,
  type SketchSceneConnectorAnchor,
  type SketchSceneDocument,
  type SketchSceneNode,
  type SketchSceneNodeType,
  type SketchScenePatchOperation,
  type SketchSceneResizeHandle,
  type SketchSceneStyle,
  type SketchSceneTextStyleOverride,
  type SketchSceneTextStyleRun,
} from "@workbench/sketch-core";

export type PreviewSize = {
  width?: number | string;
  height?: number | string;
};

export type SketchTool =
  | "select"
  | "hand"
  | "rect"
  | "diamond"
  | "ellipse"
  | "line"
  | "arrow"
  | "pencil"
  | "text"
  | "image"
  | "sticky"
  | "eraser";

export type SketchEditorMode = "edit" | "preview";

export interface SketchEditorSelection {
  nodeIds: string[];
  bounds: SketchSceneBounds | null;
}

export interface SketchPagePreviewProps {
  scene?: string | SketchSceneDocument | null;
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  fillContainer?: boolean;
  className?: string;
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
  onNodeSelect?: (node: SketchSceneNode | null) => void;
  onSelectionChange?: (selection: SketchEditorSelection) => void;
}

export interface SketchPageEditorProps extends SketchPagePreviewProps {
  mode?: SketchEditorMode;
  onSceneChange?: (scene: SketchSceneDocument) => void;
}

export interface SketchEditorController {
  keyboardScopeId: string;
  tool: SketchTool;
  setTool: (tool: SketchTool) => void;
  selection: SketchEditorSelection;
  inlineTextSelection: InlineTextSelectionState | null;
  setInlineTextSelection: (selection: InlineTextSelectionState | null) => void;
  setNodeIds: (nextIds: string[]) => void;
  clearSelection: () => void;
  applyOperations: (operations: SketchScenePatchOperation[], recordHistory?: boolean) => void;
  commitScene: (scene: SketchSceneDocument, recordHistory?: boolean) => void;
  recordHistoryCheckpoint: (scene: SketchSceneDocument) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export interface SketchEditorPartProps {
  scene: SketchSceneDocument;
  controller: SketchEditorController;
  className?: string;
}

export interface SketchEditorCanvasProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  fillContainer?: boolean;
  mode?: SketchEditorMode;
}

export interface SketchPropertyPanelProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
}

export interface SketchEditorToolbarProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
}

export interface SketchLayerPanelProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
}

type SketchResizeInteractionHandle = SketchSceneResizeHandle | "line-start" | "line-end";
type SketchSnapGuideKind = "grid" | "center" | "edge" | "spacing";

interface SketchSnapGuide {
  id: string;
  kind: SketchSnapGuideKind;
  orientation: "vertical" | "horizontal";
  position: number;
  from: number;
  to: number;
  label: string;
}

interface DragModifierKeys {
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

let activeSketchKeyboardScopeId: string | null = null;
const registeredSketchKeyboardScopeIds = new Set<string>();

function activateSketchKeyboardScope(controller: SketchEditorController) {
  activeSketchKeyboardScopeId = controller.keyboardScopeId;
}

function canHandleSketchKeyboardShortcut(controller: SketchEditorController): boolean {
  return (
    activeSketchKeyboardScopeId === controller.keyboardScopeId ||
    (activeSketchKeyboardScopeId === null && registeredSketchKeyboardScopeIds.size <= 1)
  );
}

interface DragState {
  pointer: { x: number; y: number };
  currentPointer?: { x: number; y: number };
  modifierKeys?: DragModifierKeys;
  nodes: SketchSceneNode[];
  kind: "move" | "resize" | "rotate";
  nodeId?: string;
  resizeHandle?: SketchResizeInteractionHandle;
  resizeBounds?: SketchSceneBounds;
  rotationCenter?: { x: number; y: number };
  rotationStartAngle?: number;
  initialScene: SketchSceneDocument;
  hasHistoryCheckpoint: boolean;
  duplicateOnDrag?: boolean;
}

interface MarqueeState {
  start: { x: number; y: number };
  current: { x: number; y: number };
}

interface SketchCanvasViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface PanState {
  pointer: { x: number; y: number };
  viewport: SketchCanvasViewport;
}

type InsertableSketchTool = Exclude<SketchTool, "select" | "hand" | "eraser">;

interface DrawingDraftState {
  tool: InsertableSketchTool;
  start: { x: number; y: number };
  current: { x: number; y: number };
  points: Array<{ x: number; y: number }>;
  node: SketchSceneNode | null;
}

interface EraseState {
  nodeIds: Set<string>;
}

interface InlineTextEditState {
  nodeId: string;
  value: string;
  deleteWhenEmpty?: boolean;
}

export interface InlineTextSelectionState {
  nodeId: string;
  start: number;
  end: number;
}

interface ContextMenuState {
  x: number;
  y: number;
}

interface StyleClipboardState {
  style?: SketchSceneStyle;
  textStyleRuns?: SketchSceneNode["textStyleRuns"];
}

interface SketchExportOptions {
  scale: number;
  withBackground: boolean;
}

type SketchExportResult = "copied" | "downloaded";

type SketchActionSection = "tool" | "object" | "arrange" | "style" | "view" | "history";

interface SketchActionEntry {
  id: string;
  section: SketchActionSection;
  label: string;
  description: string;
  shortcuts: string[];
  disabledReason?: string;
  run: () => void;
}

interface SketchFloatingToolbarAction {
  id: string;
  label: string;
  title?: string;
  icon: React.ReactNode;
  swatchColor?: string;
  disabled?: boolean;
  onClick: () => void;
}

interface PendingImageImportState {
  point?: { x: number; y: number };
  replaceNodeId?: string;
}

interface ImageResourceStatus {
  sourceLabel: string;
  sizeLabel: string;
  overLimit: boolean;
}

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const DRAWING_COMMIT_THRESHOLD = 4;
const PENCIL_SAMPLE_DISTANCE = 2;

function parseScene(scene?: string | SketchSceneDocument | null): SketchSceneDocument {
  if (!scene) return createDefaultSketchScene();
  const parsed = parseSketchSceneDocument(scene);
  if (!parsed) return createDefaultSketchScene();
  if (validateSketchSceneDocument(parsed).valid) return parsed;
  const pageSize = parsed.pageSize;
  if (
    pageSize &&
    typeof pageSize.width === "number" &&
    Number.isFinite(pageSize.width) &&
    pageSize.width > 0 &&
    typeof pageSize.height === "number" &&
    Number.isFinite(pageSize.height) &&
    pageSize.height > 0
  ) {
    return createDefaultSketchScene(pageSize);
  }
  return createDefaultSketchScene();
}

function normalizeSize(previewSize: PreviewSize | undefined, fallback: number, key: "width" | "height"): number {
  const value = previewSize?.[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/px$/, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function getDefaultSketchNodeName(type: InsertableSketchTool): string {
  switch (type) {
    case "rect":
      return "矩形";
    case "diamond":
      return "菱形";
    case "ellipse":
      return "圆形";
    case "line":
      return "线条";
    case "arrow":
      return "箭头";
    case "pencil":
      return "画笔路径";
    case "text":
      return "文本";
    case "image":
      return "图片";
    case "sticky":
      return "便签";
    default:
      return type;
  }
}

function createNode(type: InsertableSketchTool): SketchSceneNode {
  const id = createSketchNodeId();
  const base = {
    id,
    name: getDefaultSketchNodeName(type),
    x: 0,
    y: 0,
    width: 180,
    height: 96,
    style: {
      fill: "#FFFFFF",
      stroke: "#1F2937",
      strokeWidth: 2,
      radius: 10,
      color: "#111827",
      fontSize: 18,
      fontWeight: 500,
    },
  };

  if (type === "text") {
    return {
      ...base,
      type: "text",
      width: 260,
      height: 48,
      text: "",
      style: { ...base.style, fill: "transparent", stroke: "transparent", fontSize: 24 },
    };
  }
  if (type === "sticky") {
    return {
      ...base,
      type: "sticky",
      text: "",
      style: { ...base.style, fill: "#FEF3C7", stroke: "#F59E0B", color: "#78350F" },
    };
  }
  if (type === "diamond") {
    return { ...base, type: "diamond", text: "" };
  }
  if (type === "line") {
    return {
      ...base,
      type: "line",
      width: 180,
      height: 0,
      style: { ...base.style, fill: "transparent", stroke: "#475569", strokeWidth: 3 },
    };
  }
  if (type === "arrow") {
    return {
      ...base,
      type: "arrow",
      width: 180,
      height: 0,
      style: { ...base.style, fill: "transparent", stroke: "#2563EB", strokeWidth: 3 },
    };
  }
  if (type === "pencil") {
    return {
      ...base,
      type: "path",
      width: 1,
      height: 1,
      path: "M 0 0 L 1 1",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      style: { ...base.style, fill: "transparent", stroke: "#111827", strokeWidth: 3 },
    };
  }
  if (type === "image") {
    const src = `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#e2e8f0"/><path d="M52 132 126 72l54 44 38-28 50 44" fill="none" stroke="#475569" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="238" cy="54" r="18" fill="#64748b"/></svg>',
    )}`;
    return { ...base, type: "image", width: 240, height: 135, src, alt: "图片占位" };
  }
  return { ...base, type: type as SketchSceneNodeType };
}

function createNodeAtPoint(type: InsertableSketchTool, point: { x: number; y: number }): SketchSceneNode {
  const node = createNode(type);
  return {
    ...node,
    x: Math.max(0, Math.round(point.x - node.width / 2)),
    y: Math.max(0, Math.round(point.y - node.height / 2)),
  };
}

function createImportedImageNode(file: File, src: string, point: { x: number; y: number }): SketchSceneNode {
  const displayName = file.name || "导入图片";
  return {
    ...createNodeAtPoint("image", point),
    name: displayName,
    src,
    alt: displayName,
  };
}

function readImageFileAsDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    });
    reader.addEventListener("error", () => resolve(null));
    reader.readAsDataURL(file);
  });
}

function firstImageFile(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
}

function formatApproxBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function getDataUrlApproxBytes(src: string): number {
  const commaIndex = src.indexOf(",");
  if (commaIndex < 0) return src.length;
  const meta = src.slice(0, commaIndex);
  const payload = src.slice(commaIndex + 1);
  if (meta.includes(";base64")) return Math.ceil((payload.length * 3) / 4);
  return decodeURIComponent(payload).length;
}

function getImageResourceStatus(node: SketchSceneNode): ImageResourceStatus {
  if (node.type !== "image") return { sourceLabel: "非图片节点", sizeLabel: "不适用", overLimit: false };
  if (node.bindings?.src) return { sourceLabel: `绑定 ${node.bindings.src}`, sizeLabel: "由运行时数据决定", overLimit: false };
  if (!node.src?.trim()) return { sourceLabel: "未设置", sizeLabel: "无资源", overLimit: false };
  const src = node.src.trim();
  const approxBytes = src.startsWith("data:") ? getDataUrlApproxBytes(src) : src.length;
  return {
    sourceLabel: src.startsWith("data:") ? "内嵌 data URL" : "外部 URL",
    sizeLabel: `约 ${formatApproxBytes(approxBytes)}`,
    overLimit: approxBytes > 2 * 1024 * 1024,
  };
}

function isPointInsideNodeBounds(point: { x: number; y: number }, node: SketchSceneNode): boolean {
  const bounds = getSketchNodeBounds(node);
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function clampScenePoint(point: { x: number; y: number }, scene: SketchSceneDocument): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(scene.pageSize.width, point.x)),
    y: Math.max(0, Math.min(scene.pageSize.height, point.y)),
  };
}

function getDrawingDistance(start: { x: number; y: number }, current: { x: number; y: number }): number {
  return Math.hypot(current.x - start.x, current.y - start.y);
}

function constrainLineEndPoint(
  start: { x: number; y: number },
  current: { x: number; y: number },
  preserveAngle: boolean,
  scene: SketchSceneDocument,
): { x: number; y: number } {
  if (!preserveAngle) return clampScenePoint(current, scene);
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < DRAWING_COMMIT_THRESHOLD) return clampScenePoint(current, scene);
  const angle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return clampScenePoint(
    {
      x: start.x + Math.cos(snappedAngle) * distance,
      y: start.y + Math.sin(snappedAngle) * distance,
    },
    scene,
  );
}

function createPathData(points: Array<{ x: number; y: number }>): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${Math.round(point.x)} ${Math.round(point.y)}`)
    .join(" ");
}

function getPathPointsBounds(points: Array<{ x: number; y: number }>): SketchSceneBounds {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  };
}

function getPointLineDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy);
}

function getPointSegmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function simplifyPathPoints(points: Array<{ x: number; y: number }>, tolerance: number): Array<{ x: number; y: number }> {
  if (points.length <= 2 || tolerance <= 0) return points;

  function simplifyRange(startIndex: number, endIndex: number): Array<{ x: number; y: number }> {
    let maxDistance = 0;
    let splitIndex = startIndex;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = getPointLineDistance(points[index], points[startIndex], points[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = index;
      }
    }

    if (maxDistance > tolerance) {
      const left = simplifyRange(startIndex, splitIndex);
      const right = simplifyRange(splitIndex, endIndex);
      return left.slice(0, -1).concat(right);
    }

    return [points[startIndex], points[endIndex]];
  }

  return simplifyRange(0, points.length - 1);
}

function createSimplifiedPathPatch(node: SketchSceneNode, tolerance: number): Partial<SketchSceneNode> | null {
  if (node.type !== "path" || !node.points || node.points.length <= 2) return null;
  const simplifiedPoints = simplifyPathPoints(node.points, tolerance);
  if (simplifiedPoints.length >= node.points.length) return null;
  const bounds = getPathPointsBounds(simplifiedPoints);
  return {
    ...bounds,
    points: simplifiedPoints,
    path: createPathData(simplifiedPoints),
  };
}

function createDrawingNode(
  tool: InsertableSketchTool,
  start: { x: number; y: number },
  current: { x: number; y: number },
  scene: SketchSceneDocument,
  options: { shiftKey?: boolean; points?: Array<{ x: number; y: number }>; allowClickText?: boolean } = {},
): SketchSceneNode | null {
  const safeStart = clampScenePoint(start, scene);
  const safeCurrent = clampScenePoint(current, scene);
  const distance = getDrawingDistance(safeStart, safeCurrent);

  if (tool === "line" || tool === "arrow") {
    if (distance < DRAWING_COMMIT_THRESHOLD) return null;
    const end = constrainLineEndPoint(safeStart, safeCurrent, Boolean(options.shiftKey), scene);
    const width = Math.round(end.x - safeStart.x);
    const height = Math.round(end.y - safeStart.y);
    if (width === 0 && height === 0) return null;
    return {
      ...createNode(tool),
      x: Math.round(safeStart.x),
      y: Math.round(safeStart.y),
      width,
      height,
    };
  }

  if (tool === "pencil") {
    const points = (options.points ?? [safeStart, safeCurrent]).map((point) => clampScenePoint(point, scene));
    if (points.length < 2 || getDrawingDistance(points[0], points[points.length - 1]) < DRAWING_COMMIT_THRESHOLD) return null;
    const bounds = getPathPointsBounds(points);
    return {
      ...createNode("pencil"),
      ...bounds,
      path: createPathData(points),
      points,
    };
  }

  if (tool === "text" && distance < DRAWING_COMMIT_THRESHOLD && options.allowClickText) {
    return {
      ...createNodeAtPoint("text", safeStart),
      text: "",
    };
  }

  if (distance < DRAWING_COMMIT_THRESHOLD) return null;
  const bounds = boundsFromPoints(safeStart, safeCurrent);
  const shouldPreserveAspectRatio = options.shiftKey && (tool === "rect" || tool === "diamond" || tool === "ellipse");
  const width = shouldPreserveAspectRatio ? Math.max(bounds.width, bounds.height) : bounds.width;
  const height = shouldPreserveAspectRatio ? width : bounds.height;
  const x = safeCurrent.x < safeStart.x ? safeStart.x - width : safeStart.x;
  const y = safeCurrent.y < safeStart.y ? safeStart.y - height : safeStart.y;
  return {
    ...createNode(tool),
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function getPointerScenePoint(
  event: React.PointerEvent<HTMLElement>,
  stage: HTMLElement | null,
  scene: SketchSceneDocument,
): { x: number; y: number } | null {
  return getClientScenePoint(event.clientX, event.clientY, stage, scene);
}

function getClientScenePoint(
  clientX: number,
  clientY: number,
  stage: HTMLElement | null,
  scene: SketchSceneDocument,
): { x: number; y: number } | null {
  const rect = stage?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const x = ((clientX - rect.left) / rect.width) * scene.pageSize.width;
  const y = ((clientY - rect.top) / rect.height) * scene.pageSize.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function clampViewportScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(0.25, Math.min(4, scale));
}

function roundViewportValue(value: number): number {
  return Number(value.toFixed(3));
}

function normalizeViewport(viewport: SketchCanvasViewport): SketchCanvasViewport {
  return {
    scale: clampViewportScale(viewport.scale),
    offsetX: roundViewportValue(viewport.offsetX),
    offsetY: roundViewportValue(viewport.offsetY),
  };
}

function zoomViewportAt(
  viewport: SketchCanvasViewport,
  nextScale: number,
  anchor: { x: number; y: number },
): SketchCanvasViewport {
  const scale = clampViewportScale(nextScale);
  const sceneX = (anchor.x - viewport.offsetX) / viewport.scale;
  const sceneY = (anchor.y - viewport.offsetY) / viewport.scale;
  return normalizeViewport({
    scale,
    offsetX: anchor.x - sceneX * scale,
    offsetY: anchor.y - sceneY * scale,
  });
}

function getCenteredViewportForBounds(
  bounds: SketchSceneBounds,
  container: HTMLElement | null,
  maxScale = 2.5,
): SketchCanvasViewport {
  const containerWidth = container?.clientWidth || bounds.width + 48;
  const containerHeight = container?.clientHeight || bounds.height + 48;
  const availableWidth = Math.max(80, containerWidth - 64);
  const availableHeight = Math.max(80, containerHeight - 64);
  const scale = clampViewportScale(Math.min(maxScale, availableWidth / Math.max(1, bounds.width), availableHeight / Math.max(1, bounds.height)));
  return normalizeViewport({
    scale,
    offsetX: (containerWidth - bounds.width * scale) / 2 - bounds.x * scale,
    offsetY: (containerHeight - bounds.height * scale) / 2 - bounds.y * scale,
  });
}

function selectionFromIds(
  scene: SketchSceneDocument,
  nodeIds: string[],
  configData?: Record<string, unknown>,
): SketchEditorSelection {
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const selectedIds = Array.from(new Set(nodeIds)).filter((nodeId) => nodesById.has(nodeId));
  const selected = selectedIds.map((nodeId) => nodesById.get(nodeId)).filter((node): node is SketchSceneNode => Boolean(node));
  const visibleSelected = selected.filter((node) => isNodeVisibleForConfig(node, configData));
  return {
    nodeIds: selectedIds,
    bounds: getSketchSelectionBounds(visibleSelected),
  };
}

function boundsEqual(a: SketchSceneBounds | null, b: SketchSceneBounds | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function selectionsEqual(a: SketchEditorSelection, b: SketchEditorSelection): boolean {
  return (
    a.nodeIds.length === b.nodeIds.length &&
    a.nodeIds.every((nodeId, index) => nodeId === b.nodeIds[index]) &&
    boundsEqual(a.bounds, b.bounds)
  );
}

function visibleSelectionBoundsFromIds(
  scene: SketchSceneDocument,
  nodeIds: string[],
  configData?: Record<string, unknown>,
): SketchSceneBounds | null {
  const selectedIds = new Set(selectionFromIds(scene, nodeIds, configData).nodeIds);
  const selected = scene.nodes.filter((node) => selectedIds.has(node.id) && isNodeVisibleForConfig(node, configData));
  return getSketchSelectionBounds(selected);
}

type ResolvedImageNode = Pick<SketchSceneNode, "id" | "x" | "y" | "width" | "height" | "alt" | "name"> & {
  src: string;
};

function getResolvedImageNodes(scene: SketchSceneDocument, configData?: Record<string, unknown>): ResolvedImageNode[] {
  return scene.nodes.flatMap((node) => {
    if (node.type !== "image") return [];
    if (resolveSketchSceneBindingValue(node, "visible", node.visible ?? true, configData) === false) return [];
    const src = resolveSketchSceneBindingValue(node, "src", node.src ?? "", configData);
    if (typeof src !== "string" || !src.trim()) return [];
    return [{ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height, alt: node.alt, name: node.name, src }];
  });
}

function boundsFromPoints(
  start: { x: number; y: number },
  current: { x: number; y: number },
): SketchSceneBounds {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function boundsIntersect(a: SketchSceneBounds, b: SketchSceneBounds): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function getNodeRotationCenter(node: SketchSceneNode): { x: number; y: number } {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

function rotatePoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  rotation: number,
): { x: number; y: number } {
  if (!rotation) return point;
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

function getPointAngleDegrees(point: { x: number; y: number }, center: { x: number; y: number }): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function normalizeRotationDegrees(rotation: number): number {
  const normalized = Math.round(rotation) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function pointInBounds(point: { x: number; y: number }, bounds: SketchSceneBounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function pointOnPolygonEdge(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  return polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return getSegmentOrientation(start, end, point) === 0 && pointOnSegment(point, start, end);
  });
}

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  if (pointOnPolygonEdge(point, polygon)) return true;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getBoundsPolygon(bounds: SketchSceneBounds): Array<{ x: number; y: number }> {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

function getRotatedNodePolygon(node: SketchSceneNode): Array<{ x: number; y: number }> {
  const localBounds = {
    x: Math.min(node.x, node.x + node.width),
    y: Math.min(node.y, node.y + node.height),
    width: Math.abs(node.width),
    height: Math.abs(node.height),
  };
  const center = getNodeRotationCenter(node);
  return getBoundsPolygon(localBounds).map((point) => rotatePoint(point, center, node.rotation ?? 0));
}

function polygonIntersectsBounds(polygon: Array<{ x: number; y: number }>, bounds: SketchSceneBounds): boolean {
  const boundsPolygon = getBoundsPolygon(bounds);
  if (polygon.some((point) => pointInBounds(point, bounds))) return true;
  if (boundsPolygon.some((point) => pointInPolygon(point, polygon))) return true;
  return polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    return boundsPolygon.some((boundsStart, boundsIndex) =>
      segmentsIntersect(start, end, boundsStart, boundsPolygon[(boundsIndex + 1) % boundsPolygon.length]),
    );
  });
}

function getSegmentOrientation(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (value === 0) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  return (
    point.x <= Math.max(start.x, end.x) &&
    point.x >= Math.min(start.x, end.x) &&
    point.y <= Math.max(start.y, end.y) &&
    point.y >= Math.min(start.y, end.y)
  );
}

function segmentsIntersect(
  aStart: { x: number; y: number },
  aEnd: { x: number; y: number },
  bStart: { x: number; y: number },
  bEnd: { x: number; y: number },
): boolean {
  const o1 = getSegmentOrientation(aStart, aEnd, bStart);
  const o2 = getSegmentOrientation(aStart, aEnd, bEnd);
  const o3 = getSegmentOrientation(bStart, bEnd, aStart);
  const o4 = getSegmentOrientation(bStart, bEnd, aEnd);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(bStart, aStart, aEnd)) return true;
  if (o2 === 0 && pointOnSegment(bEnd, aStart, aEnd)) return true;
  if (o3 === 0 && pointOnSegment(aStart, bStart, bEnd)) return true;
  return o4 === 0 && pointOnSegment(aEnd, bStart, bEnd);
}

function lineLikeNodeIntersectsBounds(node: SketchSceneNode, bounds: SketchSceneBounds): boolean {
  const center = getNodeRotationCenter(node);
  const start = rotatePoint({ x: node.x, y: node.y }, center, node.rotation ?? 0);
  const end = rotatePoint({ x: node.x + node.width, y: node.y + node.height }, center, node.rotation ?? 0);
  if (pointInBounds(start, bounds) || pointInBounds(end, bounds)) return true;
  const topLeft = { x: bounds.x, y: bounds.y };
  const topRight = { x: bounds.x + bounds.width, y: bounds.y };
  const bottomRight = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
  const bottomLeft = { x: bounds.x, y: bounds.y + bounds.height };
  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

function nodeIntersectsSelectionBounds(node: SketchSceneNode, bounds: SketchSceneBounds): boolean {
  if (node.type === "line" || node.type === "arrow") return lineLikeNodeIntersectsBounds(node, bounds);
  if (node.rotation) return polygonIntersectsBounds(getRotatedNodePolygon(node), bounds);
  return boundsIntersect(bounds, getSketchNodeBounds(node));
}

function getNodeLocalBounds(node: SketchSceneNode): SketchSceneBounds {
  return {
    x: Math.min(node.x, node.x + node.width),
    y: Math.min(node.y, node.y + node.height),
    width: Math.abs(node.width),
    height: Math.abs(node.height),
  };
}

function getNodeLocalPointForHitTest(node: SketchSceneNode, point: { x: number; y: number }): { x: number; y: number } {
  return node.rotation ? rotatePoint(point, getNodeRotationCenter(node), -(node.rotation ?? 0)) : point;
}

function lineLikeNodeContainsPoint(node: SketchSceneNode, point: { x: number; y: number }): boolean {
  const strokeWidth = normalizeFiniteNumber(node.style?.strokeWidth) ?? 1;
  const tolerance = Math.max(6, strokeWidth / 2 + 3);
  return getPointSegmentDistance(point, { x: node.x, y: node.y }, { x: node.x + node.width, y: node.y + node.height }) <= tolerance;
}

function pathNodeContainsPoint(node: SketchSceneNode, point: { x: number; y: number }): boolean {
  const points = node.points;
  if (!points || points.length < 2) return pointInBounds(point, getNodeLocalBounds(node));
  const strokeWidth = normalizeFiniteNumber(node.style?.strokeWidth) ?? 1;
  const tolerance = Math.max(6, strokeWidth / 2 + 3);
  for (let index = 1; index < points.length; index += 1) {
    if (getPointSegmentDistance(point, points[index - 1], points[index]) <= tolerance) return true;
  }
  return false;
}

function diamondNodeContainsPoint(node: SketchSceneNode, point: { x: number; y: number }): boolean {
  const bounds = getNodeLocalBounds(node);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const normalizedX = bounds.width === 0 ? 0 : Math.abs(point.x - centerX) / (bounds.width / 2);
  const normalizedY = bounds.height === 0 ? 0 : Math.abs(point.y - centerY) / (bounds.height / 2);
  return normalizedX + normalizedY <= 1;
}

function nodeContainsHitTestPoint(node: SketchSceneNode, point: { x: number; y: number }): boolean {
  const localPoint = getNodeLocalPointForHitTest(node, point);
  if (node.type === "line" || node.type === "arrow") return lineLikeNodeContainsPoint(node, localPoint);
  if (node.type === "path") return pathNodeContainsPoint(node, localPoint);
  if (node.type === "diamond") return diamondNodeContainsPoint(node, localPoint);
  return pointInBounds(localPoint, getNodeLocalBounds(node));
}

function getHitTestCandidateNodeIds(
  scene: SketchSceneDocument,
  point: { x: number; y: number },
  configData?: Record<string, unknown>,
): string[] {
  return scene.nodes
    .map((node, index) => ({ node, index }))
    .filter((entry) => isNodeVisibleForConfig(entry.node, configData) && nodeContainsHitTestPoint(entry.node, point))
    .sort((a, b) => {
      const zDiff = (b.node.zIndex ?? 0) - (a.node.zIndex ?? 0);
      return zDiff || b.index - a.index;
    })
    .map((entry) => entry.node.id);
}

function getSketchTargetNodeId(target: Element): string | null {
  return (
    target.closest("[data-sketch-node-id]")?.getAttribute("data-sketch-node-id") ??
    target.closest("[data-sketch-node-label]")?.getAttribute("data-sketch-node-label")
  ) ?? null;
}

export function useSketchSelection(
  scene: SketchSceneDocument,
  onSelectionChange?: (selection: SketchEditorSelection) => void,
  configData?: Record<string, unknown>,
) {
  const [nodeIds, setNodeIdsState] = React.useState<string[]>([]);
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  const emittedSelectionRef = React.useRef<SketchEditorSelection | null>(null);
  onSelectionChangeRef.current = onSelectionChange;
  const selection = useMemo(() => selectionFromIds(scene, nodeIds, configData), [configData, scene, nodeIds]);

  React.useEffect(() => {
    if (emittedSelectionRef.current && selectionsEqual(emittedSelectionRef.current, selection)) return;
    emittedSelectionRef.current = selection;
    onSelectionChangeRef.current?.(selection);
  }, [selection]);

  const setNodeIds = React.useCallback(
    (nextIds: string[]) => {
      const uniqueIds = Array.from(new Set(nextIds));
      setNodeIdsState(uniqueIds);
    },
    [],
  );

  return {
    selection,
    setNodeIds,
    clearSelection: React.useCallback(() => setNodeIds([]), [setNodeIds]),
  };
}

export function useSketchHistory(
  scene: SketchSceneDocument,
  onSceneChange?: (scene: SketchSceneDocument) => void,
) {
  const currentRef = React.useRef(scene);
  const pastRef = React.useRef<SketchSceneDocument[]>([]);
  const futureRef = React.useRef<SketchSceneDocument[]>([]);
  const [historyVersion, setHistoryVersion] = React.useState(0);

  React.useEffect(() => {
    if (scene !== currentRef.current) {
      pastRef.current = [];
      futureRef.current = [];
      setHistoryVersion((version) => version + 1);
    }
    currentRef.current = scene;
  }, [scene]);

  const refreshHistoryState = React.useCallback(() => {
    setHistoryVersion((version) => version + 1);
  }, []);

  const commitScene = React.useCallback(
    (nextScene: SketchSceneDocument, recordHistory = true) => {
      if (nextScene === currentRef.current) return;
      if (recordHistory) {
        pastRef.current = [...pastRef.current.slice(-49), currentRef.current];
        futureRef.current = [];
        refreshHistoryState();
      }
      currentRef.current = nextScene;
      onSceneChange?.(nextScene);
    },
    [onSceneChange, refreshHistoryState],
  );

  const applyOperations = React.useCallback(
    (operations: SketchScenePatchOperation[], recordHistory = true) => {
      commitScene(applySketchScenePatchOperations(currentRef.current, operations), recordHistory);
    },
    [commitScene],
  );

  const recordHistoryCheckpoint = React.useCallback(
    (checkpoint: SketchSceneDocument) => {
      pastRef.current = [...pastRef.current.slice(-49), checkpoint];
      futureRef.current = [];
      refreshHistoryState();
    },
    [refreshHistoryState],
  );

  const undo = React.useCallback(() => {
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [currentRef.current, ...futureRef.current];
    currentRef.current = previous;
    refreshHistoryState();
    onSceneChange?.(previous);
  }, [onSceneChange, refreshHistoryState]);

  const redo = React.useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, currentRef.current];
    currentRef.current = next;
    refreshHistoryState();
    onSceneChange?.(next);
  }, [onSceneChange, refreshHistoryState]);

  return {
    applyOperations,
    commitScene,
    recordHistoryCheckpoint,
    undo,
    redo,
    canUndo: historyVersion >= 0 && pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}

export function useSketchEditorState(
  scene: SketchSceneDocument,
  onSceneChange?: (scene: SketchSceneDocument) => void,
  onSelectionChange?: (selection: SketchEditorSelection) => void,
  configData?: Record<string, unknown>,
) {
  const keyboardScopeId = React.useId();
  const [tool, setTool] = React.useState<SketchTool>("select");
  const [inlineTextSelection, setInlineTextSelection] = React.useState<InlineTextSelectionState | null>(null);
  const selectionState = useSketchSelection(scene, onSelectionChange, configData);
  const history = useSketchHistory(scene, onSceneChange);

  return {
    keyboardScopeId,
    tool,
    setTool,
    inlineTextSelection,
    setInlineTextSelection,
    ...selectionState,
    ...history,
  };
}

function SelectionOverlay({
  bounds,
  scaleX,
  scaleY,
  onResizePointerDown,
  onRotatePointerDown,
  minimumSize = 0,
  endpointHandles,
  variant = "selection",
  showCenterPoint = false,
  testId = "sketch-selection-box",
}: {
  bounds: SketchSceneBounds | null;
  scaleX: number;
  scaleY: number;
  onResizePointerDown?: (event: React.PointerEvent<HTMLDivElement>, handle: SketchResizeInteractionHandle) => void;
  onRotatePointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  minimumSize?: number;
  endpointHandles?: {
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
  variant?: "selection" | "hover" | "marquee";
  showCenterPoint?: boolean;
  testId?: string;
}) {
  if (!bounds) return null;
  const scaledWidth = bounds.width * scaleX;
  const scaledHeight = bounds.height * scaleY;
  const width = Math.max(scaledWidth, minimumSize);
  const height = Math.max(scaledHeight, minimumSize);
  const left = bounds.x * scaleX - (width - scaledWidth) / 2;
  const top = bounds.y * scaleY - (height - scaledHeight) / 2;
  const handles: Array<{
    handle: SketchSceneResizeHandle;
    className: string;
    cursor: string;
  }> = [
    { handle: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-n-resize" },
    { handle: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "cursor-ne-resize" },
    { handle: "e", className: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2", cursor: "cursor-e-resize" },
    { handle: "se", className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2", cursor: "cursor-se-resize" },
    { handle: "s", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursor: "cursor-s-resize" },
    { handle: "sw", className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-sw-resize" },
    { handle: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-w-resize" },
    { handle: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-nw-resize" },
  ];
  return (
    <div
      className={cn(
        "pointer-events-none absolute",
        variant === "selection" && "border border-[#62b7ff]",
        variant === "hover" && "border border-[#38bdf8]/80 bg-[#38bdf8]/10",
        variant === "marquee" && "border border-dashed border-[#62b7ff] bg-[#62b7ff]/10",
      )}
      data-testid={testId}
      style={{
        left,
        top,
        width,
        height,
      }}
    >
      {variant === "marquee" ? (
        <div
          className="absolute left-0 top-0 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded-sm border border-[#62b7ff]/70 bg-[#0f172a]/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
          data-testid="sketch-marquee-mode-label"
        >
          矩形框选
        </div>
      ) : null}
      {showCenterPoint ? (
        <div
          className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#62b7ff] shadow"
          data-testid="sketch-selection-center-point"
          aria-hidden="true"
        />
      ) : null}
      {onRotatePointerDown ? (
        <div
          className="pointer-events-auto absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-8 cursor-grab rounded-full border border-[#62b7ff] bg-[#1f1f1f] active:cursor-grabbing"
          data-testid="sketch-rotate-handle"
          data-sketch-rotate-handle="true"
          title="旋转"
          onPointerDown={onRotatePointerDown}
        />
      ) : null}
      {onResizePointerDown && endpointHandles
        ? ([
            { key: "start", point: endpointHandles.start, handle: "line-start" as const, testId: "sketch-resize-handle-line-start" },
            { key: "end", point: endpointHandles.end, handle: "line-end" as const, testId: "sketch-resize-handle" },
          ]).map((item) => (
            <div
              key={item.key}
              className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-[#62b7ff] bg-[#1f1f1f]"
              data-testid={item.testId}
              data-sketch-resize-handle={item.handle}
              style={{
                left: item.point.x * scaleX - left,
                top: item.point.y * scaleY - top,
              }}
              onPointerDown={(event) => onResizePointerDown(event, item.handle)}
            />
          ))
        : null}
      {onResizePointerDown && !endpointHandles
        ? handles.map((item) => (
            <div
              key={item.handle}
              className={cn(
                "pointer-events-auto absolute h-3 w-3 border border-[#62b7ff] bg-[#1f1f1f]",
                item.className,
                item.cursor,
              )}
              data-testid={item.handle === "se" ? "sketch-resize-handle" : `sketch-resize-handle-${item.handle}`}
              data-sketch-resize-handle={item.handle}
              onPointerDown={(event) => onResizePointerDown(event, item.handle)}
            />
          ))
        : null}
    </div>
  );
}

export function SketchPagePreview({
  scene,
  configData = {},
  previewSize,
  fillContainer = false,
  className,
  selectedNodeId,
  selectedNodeIds,
  onNodeSelect,
  onSelectionChange,
}: SketchPagePreviewProps) {
  const parsedScene = useMemo(() => parseScene(scene), [scene]);
  const width = normalizeSize(previewSize, parsedScene.pageSize.width, "width");
  const height = normalizeSize(previewSize, parsedScene.pageSize.height, "height");
  const svgMarkup = useMemo(
    () => renderSketchSceneToSvgMarkup(parsedScene, configData),
    [parsedScene, configData],
  );
  const imageNodes = useMemo(() => getResolvedImageNodes(parsedScene, configData), [configData, parsedScene]);
  const imageProbeKey = useMemo(() => imageNodes.map((node) => `${node.id}:${node.src}`).join("|"), [imageNodes]);
  const [failedImageIds, setFailedImageIds] = React.useState<Set<string>>(() => new Set());
  const activeIds = selectedNodeIds ?? (selectedNodeId ? [selectedNodeId] : []);
  const selectionBounds = useMemo(() => visibleSelectionBoundsFromIds(parsedScene, activeIds, configData), [activeIds, configData, parsedScene]);

  React.useEffect(() => {
    setFailedImageIds(new Set());
  }, [imageProbeKey]);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-white",
        fillContainer ? "h-full w-full" : "",
        className,
      )}
      style={{ width: fillContainer ? "100%" : width, height: fillContainer ? "100%" : height }}
      onClick={(event) => {
        const target = event.target as Element;
        const nodeId = getSketchTargetNodeId(target);
        const node = parsedScene.nodes.find((item) => item.id === nodeId) ?? null;
        onNodeSelect?.(node);
        onSelectionChange?.(selectionFromIds(parsedScene, node ? [node.id] : [], configData));
      }}
    >
      <div
        className="h-full w-full"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      <div aria-hidden="true" className="hidden">
        {imageNodes.map((node) => (
          <img
            key={`${node.id}:${node.src}`}
            alt=""
            data-sketch-image-probe-id={node.id}
            src={node.src}
            onError={() => {
              setFailedImageIds((current) => {
                if (current.has(node.id)) return current;
                const next = new Set(current);
                next.add(node.id);
                return next;
              });
            }}
            onLoad={() => {
              setFailedImageIds((current) => {
                if (!current.has(node.id)) return current;
                const next = new Set(current);
                next.delete(node.id);
                return next;
              });
            }}
          />
        ))}
      </div>
      {imageNodes.map((node) =>
        failedImageIds.has(node.id) ? (
          <div
            key={`failed-${node.id}`}
            className="pointer-events-none absolute flex items-center justify-center border border-dashed border-amber-500 bg-amber-50/90 px-2 text-center text-xs font-medium text-amber-800"
            data-sketch-image-error-id={node.id}
            role="status"
            style={{
              left: node.x * (width / parsedScene.pageSize.width),
              top: node.y * (height / parsedScene.pageSize.height),
              width: Math.max(24, Math.abs(node.width) * (width / parsedScene.pageSize.width)),
              height: Math.max(20, Math.abs(node.height) * (height / parsedScene.pageSize.height)),
            }}
          >
            图片加载失败
          </div>
        ) : null,
      )}
      <SelectionOverlay
        bounds={selectionBounds}
        scaleX={width / parsedScene.pageSize.width}
        scaleY={height / parsedScene.pageSize.height}
        minimumSize={8}
      />
    </div>
  );
}

const TOOL_OPTIONS: Array<{ tool: SketchTool; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { tool: "select", label: "选择", icon: MousePointer2 },
  { tool: "hand", label: "抓手", icon: Hand },
  { tool: "rect", label: "矩形", icon: Square },
  { tool: "diamond", label: "菱形", icon: Diamond },
  { tool: "ellipse", label: "圆形", icon: Circle },
  { tool: "line", label: "线条", icon: Square },
  { tool: "arrow", label: "箭头", icon: ArrowRight },
  { tool: "pencil", label: "画笔", icon: Pencil },
  { tool: "text", label: "文本", icon: Type },
  { tool: "image", label: "图片", icon: ImageIcon },
  { tool: "sticky", label: "便签", icon: StickyNote },
  { tool: "eraser", label: "橡皮", icon: Eraser },
];

const NODE_TYPE_LABELS: Record<SketchSceneNodeType, string> = {
  rect: "矩形",
  diamond: "菱形",
  ellipse: "圆形",
  line: "线条",
  arrow: "箭头",
  text: "文本",
  image: "图片",
  sticky: "便签",
  button: "按钮",
  input: "输入框",
  card: "卡片",
  group: "分组",
  path: "路径",
};

const LAYER_NODE_TYPE_ICONS: Partial<Record<SketchSceneNodeType, React.ComponentType<{ className?: string }>>> = {
  arrow: ArrowRight,
  diamond: Diamond,
  ellipse: Circle,
  group: Group,
  image: ImageIcon,
  path: PenLine,
  sticky: StickyNote,
  text: Type,
};

const SKETCH_COLOR_SWATCHES = [
  "#ffffff",
  "#f8fafc",
  "#111827",
  "#475569",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const SKETCH_RECENT_COLOR_LIMIT = 8;

function normalizeSketchHexColor(value: string): string | null {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

function addRecentSketchColor(colors: string[], value: string): string[] {
  const normalized = normalizeSketchHexColor(value);
  if (!normalized) return colors;
  return [normalized, ...colors.filter((color) => color !== normalized)].slice(0, SKETCH_RECENT_COLOR_LIMIT);
}

function getNextSketchSwatchColor(value: unknown, fallback: string): string {
  const normalized = typeof value === "string" ? normalizeSketchHexColor(value) : null;
  const currentIndex = normalized ? SKETCH_COLOR_SWATCHES.indexOf(normalized) : -1;
  if (currentIndex >= 0) return SKETCH_COLOR_SWATCHES[(currentIndex + 1) % SKETCH_COLOR_SWATCHES.length];
  return normalizeSketchHexColor(fallback) ?? SKETCH_COLOR_SWATCHES[0];
}

function getSelectedNodes(scene: SketchSceneDocument, controller: SketchEditorController): SketchSceneNode[] {
  return scene.nodes.filter((node) => controller.selection.nodeIds.includes(node.id));
}

function getEditableSelectedNodes(scene: SketchSceneDocument, controller: SketchEditorController): SketchSceneNode[] {
  return getSelectedNodes(scene, controller).filter((node) => !node.locked);
}

function getVisibleEditableSelectedNodes(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  configData?: Record<string, unknown>,
): SketchSceneNode[] {
  return getEditableSelectedNodes(scene, controller).filter((node) => node.visible !== false && isNodeVisibleForConfig(node, configData));
}

function getLayerEditableSelectedNodes(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  configData?: Record<string, unknown>,
): SketchSceneNode[] {
  return getVisibleEditableSelectedNodes(scene, controller, configData).filter((node) => node.type !== "group");
}

function canEditNodeProperties(node: SketchSceneNode): boolean {
  return !node.locked && node.visible !== false && node.type !== "group";
}

type PrimaryColorControl = {
  label: string;
  property: "fill" | "stroke" | "color";
  value: string;
};

type ContentControl = {
  label: string;
  placeholder: string;
  value: string;
  toPatch: (value: string) => Partial<SketchSceneNode>;
};

function getContentControl(node: SketchSceneNode): ContentControl | null {
  if (node.type === "image") {
    return {
      label: "图片地址",
      placeholder: "图片 URL 或 data URI",
      value: node.src ?? "",
      toPatch: (value) => ({ src: value }),
    };
  }
  if (
    node.type === "rect" ||
    node.type === "diamond" ||
    node.type === "ellipse" ||
    node.type === "text" ||
    node.type === "sticky" ||
    node.type === "button" ||
    node.type === "input" ||
    node.type === "card"
  ) {
    return {
      label: "内容",
      placeholder: "对象文本",
      value: node.text ?? "",
      toPatch: (value) => ({ text: value }),
    };
  }
  return null;
}

function canInlineEditTextNode(
  node: SketchSceneNode,
  configData?: Record<string, unknown>,
): boolean {
  if (
    node.type !== "rect" &&
    node.type !== "diamond" &&
    node.type !== "ellipse" &&
    node.type !== "text" &&
    node.type !== "sticky" &&
    node.type !== "button" &&
    node.type !== "input" &&
    node.type !== "card"
  ) return false;
  return canEditNodeProperties(node) && isNodeVisibleForConfig(node, configData);
}

function getInlineTextEditMetrics(node: SketchSceneNode, value: string): { style: React.CSSProperties; overflowing: boolean } {
  const style = node.style ?? {};
  const width = Math.max(32, Math.abs(node.width));
  const height = Math.max(28, Math.abs(node.height));
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : node.type === "text" ? 18 : 16;
  const isFreestandingText = node.type === "text";
  const fullTextRunStyle = supportsTextStyle(node) ? getFullTextStyleRunStyle(node) : {};
  const lineHeight = Math.round(fullTextRunStyle.lineHeight ?? fontSize * 1.35);
  const lineCount = Math.max(1, value.split("\n").length);
  const textHeight = Math.max(lineHeight, lineCount * lineHeight);
  const paddingX = isFreestandingText ? 0 : Math.min(16, Math.max(8, width * 0.08));
  const paddingY = isFreestandingText ? 0 : Math.min(12, Math.max(6, height * 0.12));
  const editWidth = isFreestandingText ? width : Math.max(32, width - paddingX * 2);
  const availableHeight = isFreestandingText ? height : Math.max(28, height - paddingY * 2);
  const editHeight = isFreestandingText ? Math.max(height, textHeight) : Math.max(lineHeight, Math.min(availableHeight, textHeight));
  const overflowing = !isFreestandingText && textHeight > availableHeight;
  const left = node.x + (isFreestandingText ? 0 : (width - editWidth) / 2);
  const top = isFreestandingText
    ? node.y
    : node.y + paddingY + Math.max(0, (availableHeight - editHeight) / 2);

  return {
    style: {
      left,
      top,
      width: editWidth,
      height: editHeight,
      boxSizing: "border-box",
      padding: 0,
      overflowY: overflowing ? "auto" : "hidden",
      fontSize,
      fontWeight: style.fontWeight ?? (node.type === "text" ? 400 : 500),
      color: style.color ?? "#111827",
      lineHeight: `${lineHeight}px`,
      textAlign: style.textAlign ?? (isFreestandingText ? "left" : "center"),
      transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
      transformOrigin: "center",
    },
    overflowing,
  };
}

function toColorInputValue(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function getPrimaryColorControl(node: SketchSceneNode): PrimaryColorControl | null {
  if (node.type === "group" || node.type === "image") return null;
  if (node.type === "text") {
    return {
      label: "文字颜色",
      property: "color",
      value: toColorInputValue(node.style?.color, "#111827"),
    };
  }
  if (node.type === "line" || node.type === "arrow" || node.type === "path") {
    return {
      label: "描边",
      property: "stroke",
      value: toColorInputValue(node.style?.stroke, "#1F2937"),
    };
  }
  return {
    label: "填充",
    property: "fill",
    value: toColorInputValue(node.style?.fill, "#ffffff"),
  };
}

function supportsFillStyle(node: SketchSceneNode): boolean {
  return node.type !== "group" && node.type !== "image" && node.type !== "line" && node.type !== "arrow" && node.type !== "path" && node.type !== "text";
}

function supportsStrokeStyle(node: SketchSceneNode): boolean {
  return node.type !== "group" && node.type !== "image" && node.type !== "text";
}

function supportsTextStyle(node: SketchSceneNode): boolean {
  return node.type === "rect" || node.type === "diamond" || node.type === "ellipse" || node.type === "text" || node.type === "sticky" || node.type === "button" || node.type === "input" || node.type === "card";
}

function supportsRadiusStyle(node: SketchSceneNode): boolean {
  return node.type === "rect" || node.type === "sticky" || node.type === "button" || node.type === "input" || node.type === "card";
}

function isLineLikeNode(node: SketchSceneNode): boolean {
  return node.type === "line" || node.type === "arrow";
}

function getLineDashPreset(lineDash?: number[]): "solid" | "dashed" | "dotted" {
  if (!lineDash?.length) return "solid";
  if (lineDash.length >= 2 && lineDash[0] <= 3) return "dotted";
  return "dashed";
}

function lineDashFromPreset(value: string): number[] {
  if (value === "dashed") return [8, 6];
  if (value === "dotted") return [2, 4];
  return [];
}

function getFullTextStyleRunStyle(node: SketchSceneNode): SketchSceneTextStyleOverride {
  const textLength = node.text?.length ?? 0;
  if (textLength <= 0) return {};
  const run = node.textStyleRuns?.find((item) => item.start === 0 && item.length >= textLength);
  return run?.style ?? {};
}

function getActiveInlineTextRange(
  controller: SketchEditorController,
  node: SketchSceneNode,
): { start: number; end: number } | null {
  const textLength = node.text?.length ?? 0;
  const selection = controller.inlineTextSelection;
  if (!selection || selection.nodeId !== node.id || textLength <= 0) return null;
  const start = Math.max(0, Math.min(textLength, Math.min(selection.start, selection.end)));
  const end = Math.max(0, Math.min(textLength, Math.max(selection.start, selection.end)));
  return end > start ? { start, end } : null;
}

function textStyleRunsEqual(left: SketchSceneTextStyleOverride, right: SketchSceneTextStyleOverride): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getTextStyleForSegment(node: SketchSceneNode, start: number, end: number): SketchSceneTextStyleOverride {
  const style: SketchSceneTextStyleOverride = {};
  for (const run of node.textStyleRuns ?? []) {
    const runStart = Math.max(0, run.start);
    const runEnd = Math.max(runStart, run.start + run.length);
    if (runStart <= start && runEnd >= end) {
      Object.assign(style, run.style);
    }
  }
  return style;
}

function mergeTextStyleRunSegments(segments: SketchSceneTextStyleRun[]): SketchSceneTextStyleRun[] {
  const merged: SketchSceneTextStyleRun[] = [];
  for (const segment of segments) {
    if (segment.length <= 0 || !Object.keys(segment.style).length) continue;
    const previous = merged.at(-1);
    if (previous && previous.start + previous.length === segment.start && textStyleRunsEqual(previous.style, segment.style)) {
      previous.length += segment.length;
    } else {
      merged.push({ ...segment, style: { ...segment.style } });
    }
  }
  return merged;
}

function updateTextStyleRunsForRange(
  node: SketchSceneNode,
  range: { start: number; end: number },
  updateStyle: (style: SketchSceneTextStyleOverride) => SketchSceneTextStyleOverride,
): SketchSceneTextStyleRun[] {
  const textLength = node.text?.length ?? 0;
  const start = Math.max(0, Math.min(textLength, range.start));
  const end = Math.max(0, Math.min(textLength, range.end));
  if (start >= end) return node.textStyleRuns ?? [];
  const boundaries = new Set<number>([0, textLength, start, end]);
  for (const run of node.textStyleRuns ?? []) {
    const runStart = Math.max(0, Math.min(textLength, run.start));
    const runEnd = Math.max(runStart, Math.min(textLength, run.start + run.length));
    boundaries.add(runStart);
    boundaries.add(runEnd);
  }
  const sorted = Array.from(boundaries).sort((left, right) => left - right);
  const segments: SketchSceneTextStyleRun[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const segmentStart = sorted[index];
    const segmentEnd = sorted[index + 1];
    if (segmentStart === segmentEnd) continue;
    const baseStyle = getTextStyleForSegment(node, segmentStart, segmentEnd);
    const nextStyle = segmentStart >= start && segmentEnd <= end ? updateStyle(baseStyle) : baseStyle;
    segments.push({
      start: segmentStart,
      length: segmentEnd - segmentStart,
      style: nextStyle,
    });
  }
  return mergeTextStyleRunSegments(segments);
}

function getTextStyleRunStyleForRange(
  node: SketchSceneNode,
  range: { start: number; end: number } | null,
): SketchSceneTextStyleOverride {
  if (!range) return getFullTextStyleRunStyle(node);
  const segments = updateTextStyleRunsForRange(node, range, (style) => style).filter(
    (run) => run.start < range.end && run.start + run.length > range.start,
  );
  return segments[0]?.style ?? {};
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  return left === right;
}

function getMixedStyleValue<K extends keyof SketchSceneStyle>(
  nodes: SketchSceneNode[],
  property: K,
): { value: SketchSceneStyle[K] | undefined; mixed: boolean } {
  if (!nodes.length) return { value: undefined, mixed: false };
  const firstValue = nodes[0].style?.[property];
  return {
    value: firstValue,
    mixed: nodes.some((node) => !valuesEqual(node.style?.[property], firstValue)),
  };
}

function isNodeVisibleForConfig(node: SketchSceneNode, configData?: Record<string, unknown>): boolean {
  if (node.type === "group") return false;
  if (resolveSketchSceneBindingValue(node, "visible", node.visible ?? true, configData) === false) return false;
  if (node.type === "image") {
    const src = resolveSketchSceneBindingValue(node, "src", node.src ?? "", configData);
    return typeof src === "string" && src.trim().length > 0;
  }
  return true;
}

function isNodeHiddenByConfigBinding(node: SketchSceneNode, configData?: Record<string, unknown>): boolean {
  const key = node.bindings?.visible;
  return Boolean(key && configData && key in configData && configData[key] === false);
}

function isImageSourceUnresolvedForConfig(node: SketchSceneNode, configData?: Record<string, unknown>): boolean {
  if (node.type !== "image") return false;
  const src = resolveSketchSceneBindingValue(node, "src", node.src ?? "", configData);
  return typeof src !== "string" || src.trim().length === 0;
}

function isNodeHiddenByRuntimeConfig(node: SketchSceneNode, configData?: Record<string, unknown>): boolean {
  return isNodeHiddenByConfigBinding(node, configData) || isImageSourceUnresolvedForConfig(node, configData);
}

function getKeyboardNavigableNodes(
  scene: SketchSceneDocument,
  configData?: Record<string, unknown>,
  focusedGroupId?: string | null,
): SketchSceneNode[] {
  const focusedGroupNode = focusedGroupId
    ? scene.nodes.find((node) => node.id === focusedGroupId && node.type === "group") ?? null
    : null;
  const focusedChildIds = focusedGroupNode?.children ? new Set(focusedGroupNode.children) : null;
  return scene.nodes.filter((node) => {
    if (node.type === "group") return false;
    if (focusedChildIds && !focusedChildIds.has(node.id)) return false;
    return isNodeVisibleForConfig(node, configData);
  });
}

function selectAdjacentKeyboardNode(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  direction: 1 | -1,
  configData?: Record<string, unknown>,
  focusedGroupId?: string | null,
): boolean {
  const navigableNodes = getKeyboardNavigableNodes(scene, configData, focusedGroupId);
  if (!navigableNodes.length) return false;
  const currentId = controller.selection.nodeIds.at(-1);
  const currentIndex = currentId ? navigableNodes.findIndex((node) => node.id === currentId) : -1;
  const nextIndex = currentIndex === -1
    ? direction === 1 ? 0 : navigableNodes.length - 1
    : (currentIndex + direction + navigableNodes.length) % navigableNodes.length;
  controller.setNodeIds([navigableNodes[nextIndex].id]);
  return true;
}

function getSingleSelectedNode(scene: SketchSceneDocument, controller: SketchEditorController): SketchSceneNode | null {
  const selectedNodes = getSelectedNodes(scene, controller);
  return selectedNodes.length === 1 ? selectedNodes[0] : null;
}

function getNodeDisplayName(node: SketchSceneNode): string {
  const text = node.text?.trim();
  if (text) return text;
  const name = node.name?.trim();
  if (name) return name;
  return NODE_TYPE_LABELS[node.type] ?? node.type;
}

function getLayerNodeDisplayName(node: SketchSceneNode): string {
  const name = node.name?.trim();
  if (name) return name;
  return getNodeDisplayName(node);
}

function getLayerPanelNodes(scene: SketchSceneDocument): SketchSceneNode[] {
  return [...getVisualLayerNodes(scene)].reverse();
}

function getVisualLayerNodes(scene: SketchSceneDocument): SketchSceneNode[] {
  return scene.nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const zDiff = (a.node.zIndex ?? 0) - (b.node.zIndex ?? 0);
      return zDiff || a.index - b.index;
    })
    .map((entry) => entry.node);
}

function getEditableMinSize(node: SketchSceneNode): number {
  return node.type === "line" || node.type === "arrow" ? 0 : 8;
}

function getSelectionResizeNodes(nodes: SketchSceneNode[]): SketchSceneNode[] {
  return nodes.filter((node) => !node.locked && node.visible !== false && node.type !== "group");
}

function resizeBounds(
  bounds: SketchSceneBounds,
  handle: SketchSceneResizeHandle,
  delta: { x: number; y: number },
  preserveAspectRatio = false,
): SketchSceneBounds {
  let { x, y, width, height } = bounds;
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
  if (width < 1) {
    if (handle.includes("w")) x = bounds.x + bounds.width - 1;
    width = 1;
  }
  if (height < 1) {
    if (handle.includes("n")) y = bounds.y + bounds.height - 1;
    height = 1;
  }
  if (x < 0 && handle.includes("w")) {
    width = Math.max(1, width + x);
    x = 0;
  }
  if (y < 0 && handle.includes("n")) {
    height = Math.max(1, height + y);
    y = 0;
  }
  if (preserveAspectRatio && handle.length === 2 && bounds.width > 0 && bounds.height > 0) {
    const aspectRatio = bounds.width / bounds.height;
    const widthChange = Math.abs(width - bounds.width);
    const heightChange = Math.abs(height - bounds.height);
    if (widthChange >= heightChange) {
      height = Math.max(1, width / aspectRatio);
    } else {
      width = Math.max(1, height * aspectRatio);
    }
    if (handle.includes("w")) x = Math.max(0, bounds.x + bounds.width - width);
    if (handle.includes("n")) y = Math.max(0, bounds.y + bounds.height - height);
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function getMinimumLineLikeVector(node: SketchSceneNode): { width: number; height: number } {
  const width = node.width === 0 ? 0 : node.width < 0 ? -1 : 1;
  const height = node.height === 0 ? 0 : node.height < 0 ? -1 : 1;
  if (width !== 0 || height !== 0) return { width, height };
  return { width: 1, height: 0 };
}

function resizeNodesWithinBounds(
  nodes: SketchSceneNode[],
  fromBounds: SketchSceneBounds,
  toBounds: SketchSceneBounds,
): SketchSceneNode[] {
  if (fromBounds.width <= 0 && fromBounds.height <= 0) return nodes;
  const canScaleX = fromBounds.width > 0;
  const canScaleY = fromBounds.height > 0;
  const scaleX = canScaleX ? toBounds.width / fromBounds.width : 1;
  const scaleY = canScaleY ? toBounds.height / fromBounds.height : 1;
  return nodes.map((node) => {
    const lineLikeType = node.type === "line" || node.type === "arrow";
    let width = Math.round(node.width * scaleX);
    let height = Math.round(node.height * scaleY);
    let x = Math.max(0, Math.round(canScaleX ? toBounds.x + (node.x - fromBounds.x) * scaleX : node.x));
    let y = Math.max(0, Math.round(canScaleY ? toBounds.y + (node.y - fromBounds.y) * scaleY : node.y));
    if (!lineLikeType) {
      width = Math.max(getEditableMinSize(node), width);
      height = Math.max(getEditableMinSize(node), height);
    }
    if (lineLikeType && width === 0 && height === 0) {
      const vector = getMinimumLineLikeVector(node);
      if (vector.width < 0) x = Math.max(1, x);
      if (vector.height < 0) y = Math.max(1, y);
      width = vector.width;
      height = vector.height;
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
      x,
      y,
      width,
      height,
    };
  });
}

function shouldResizeFromSelectionBounds(state: DragState): boolean {
  if (state.kind !== "resize" || !state.resizeBounds) return false;
  if (!state.nodeId) return true;
  return state.nodes.some((node) => node.id === state.nodeId && Boolean(node.rotation) && node.type !== "line" && node.type !== "arrow");
}

function getBoxResizeHandle(handle: SketchResizeInteractionHandle | undefined): SketchSceneResizeHandle {
  if (handle === "line-start" || handle === "line-end") return "se";
  return handle ?? "se";
}

function resizeLineLikeNodeEndpoint(
  node: SketchSceneNode,
  handle: SketchResizeInteractionHandle | undefined,
  delta: { x: number; y: number },
): SketchSceneNode | null {
  if (node.type !== "line" && node.type !== "arrow") return null;
  if (handle !== "line-start" && handle !== "line-end") return null;
  const start = { x: node.x, y: node.y };
  const end = { x: node.x + node.width, y: node.y + node.height };
  const anchorPoint = handle === "line-start" ? end : start;
  const movingPoint = handle === "line-start" ? start : end;
  const nextMovingPoint = {
    x: Math.max(0, Math.round(movingPoint.x + delta.x)),
    y: Math.max(0, Math.round(movingPoint.y + delta.y)),
  };
  let x = handle === "line-start" ? nextMovingPoint.x : anchorPoint.x;
  let y = handle === "line-start" ? nextMovingPoint.y : anchorPoint.y;
  let width = handle === "line-start" ? anchorPoint.x - nextMovingPoint.x : nextMovingPoint.x - anchorPoint.x;
  let height = handle === "line-start" ? anchorPoint.y - nextMovingPoint.y : nextMovingPoint.y - anchorPoint.y;
  if (width === 0 && height === 0) {
    const vector = getMinimumLineLikeVector(node);
    if (handle === "line-start") {
      x = Math.max(0, anchorPoint.x - vector.width);
      y = Math.max(0, anchorPoint.y - vector.height);
      width = anchorPoint.x - x;
      height = anchorPoint.y - y;
    } else {
      width = vector.width;
      height = vector.height;
    }
  }
  return {
    ...node,
    x,
    y,
    width,
    height,
  };
}

interface ConnectorCandidatePoint {
  id: string;
  nodeId: string;
  anchor: SketchSceneConnectorAnchor;
  x: number;
  y: number;
  bound: boolean;
}

function isConnectorTargetNode(node: SketchSceneNode, configData?: Record<string, unknown>): boolean {
  return (
    node.type !== "group" &&
    node.type !== "line" &&
    node.type !== "arrow" &&
    node.type !== "path" &&
    isNodeVisibleForConfig(node, configData)
  );
}

function getConnectorCandidatePoints(
  scene: SketchSceneDocument,
  dragState: DragState | null,
  configData?: Record<string, unknown>,
): ConnectorCandidatePoint[] {
  if (
    dragState?.kind !== "resize" ||
    (dragState.resizeHandle !== "line-start" && dragState.resizeHandle !== "line-end")
  ) {
    return [];
  }
  const draggedIds = new Set(dragState.nodes.map((node) => node.id));
  return scene.nodes.flatMap((node) => {
    if (draggedIds.has(node.id) || node.type === "group" || node.type === "line" || node.type === "arrow" || node.type === "path") return [];
    if (!isConnectorTargetNode(node, configData)) return [];
    const activeLine = dragState.nodes[0];
    const endpoint = dragState.resizeHandle === "line-start" ? "start" : "end";
    const currentBinding = activeLine?.connections?.[endpoint];
    return (["top", "right", "bottom", "left", "center"] as SketchSceneConnectorAnchor[]).map((anchor) => {
      const point = getSketchConnectorAnchorPoint(node, anchor);
      return {
        id: `${node.id}:${anchor}`,
        nodeId: node.id,
        anchor,
        x: point.x,
        y: point.y,
        bound: currentBinding?.nodeId === node.id && currentBinding.anchor === anchor,
      };
    });
  });
}

function getLineLikeEndpointPoint(node: SketchSceneNode, endpoint: "start" | "end"): { x: number; y: number } {
  return endpoint === "start"
    ? { x: node.x, y: node.y }
    : { x: node.x + node.width, y: node.y + node.height };
}

function getLineLikeEndpointPatch(
  node: SketchSceneNode,
  endpoint: "start" | "end",
  point: { x: number; y: number },
): Pick<SketchSceneNode, "x" | "y" | "width" | "height"> {
  if (endpoint === "start") {
    const end = getLineLikeEndpointPoint(node, "end");
    return {
      x: Math.max(0, Math.round(point.x)),
      y: Math.max(0, Math.round(point.y)),
      width: Math.round(end.x - point.x),
      height: Math.round(end.y - point.y),
    };
  }
  return {
    x: node.x,
    y: node.y,
    width: Math.round(point.x - node.x),
    height: Math.round(point.y - node.y),
  };
}

function compactConnectorConnections(connections: SketchSceneNode["connections"]): SketchSceneNode["connections"] {
  if (!connections?.start && !connections?.end) return undefined;
  return connections;
}

function patchConnectorEndpointBinding(
  node: SketchSceneNode,
  endpoint: "start" | "end",
  candidate: ConnectorCandidatePoint | null,
): Pick<SketchSceneNode, "connections"> {
  return {
    connections: compactConnectorConnections({
      ...node.connections,
      [endpoint]: candidate ? { nodeId: candidate.nodeId, anchor: candidate.anchor } : undefined,
    }),
  };
}

function findNearestConnectorCandidate(
  scene: SketchSceneDocument,
  dragState: DragState,
  configData?: Record<string, unknown>,
): ConnectorCandidatePoint | null {
  if (dragState.kind !== "resize" || (dragState.resizeHandle !== "line-start" && dragState.resizeHandle !== "line-end")) return null;
  const endpoint = dragState.resizeHandle === "line-start" ? "start" : "end";
  const previewNode = dragState.nodes[0]
    ? resizeLineLikeNodeEndpoint(dragState.nodes[0], dragState.resizeHandle, getDragDelta(dragState))
    : null;
  if (!previewNode) return null;
  const endpointPoint = getLineLikeEndpointPoint(previewNode, endpoint);
  const draggedIds = new Set(dragState.nodes.map((node) => node.id));
  const candidates = scene.nodes
    .filter((node) => !draggedIds.has(node.id) && isConnectorTargetNode(node, configData))
    .flatMap((node) => (["top", "right", "bottom", "left", "center"] as SketchSceneConnectorAnchor[]).map((anchor) => {
      const point = getSketchConnectorAnchorPoint(node, anchor);
      return {
        id: `${node.id}:${anchor}`,
        nodeId: node.id,
        anchor,
        x: point.x,
        y: point.y,
        bound: false,
        distance: Math.hypot(endpointPoint.x - point.x, endpointPoint.y - point.y),
      };
    }))
    .sort((a, b) => a.distance - b.distance);
  const nearest = candidates[0];
  return nearest && nearest.distance <= 12 ? nearest : null;
}

function getConnectedLineFollowOperations(
  scene: SketchSceneDocument,
  previewNodes: SketchSceneNode[],
): SketchScenePatchOperation[] {
  const previewById = new Map(previewNodes.map((node) => [node.id, node]));
  if (!previewById.size) return [];
  const getNode = (nodeId: string) => previewById.get(nodeId) ?? scene.nodes.find((node) => node.id === nodeId) ?? null;
  return scene.nodes.flatMap((node) => {
    if ((node.type !== "line" && node.type !== "arrow") || !node.connections) return [];
    if (previewById.has(node.id)) return [];
    const startTarget = node.connections.start ? getNode(node.connections.start.nodeId) : null;
    const endTarget = node.connections.end ? getNode(node.connections.end.nodeId) : null;
    if (
      (!node.connections.start || !previewById.has(node.connections.start.nodeId)) &&
      (!node.connections.end || !previewById.has(node.connections.end.nodeId))
    ) {
      return [];
    }
    const start = node.connections.start && startTarget
      ? getSketchConnectorAnchorPoint(startTarget, node.connections.start.anchor)
      : getLineLikeEndpointPoint(node, "start");
    const end = node.connections.end && endTarget
      ? getSketchConnectorAnchorPoint(endTarget, node.connections.end.anchor)
      : getLineLikeEndpointPoint(node, "end");
    const patch = {
      x: Math.round(start.x),
      y: Math.round(start.y),
      width: Math.round(end.x - start.x),
      height: Math.round(end.y - start.y),
    };
    if (patch.width === 0 && patch.height === 0) return [];
    if (node.x === patch.x && node.y === patch.y && node.width === patch.width && node.height === patch.height) return [];
    return [{ op: "update" as const, nodeId: node.id, patch }];
  });
}

function isSnapGuideSuppressed(dragState: DragState | null): boolean {
  return Boolean(dragState?.modifierKeys?.metaKey || dragState?.modifierKeys?.ctrlKey);
}

function getDragDelta(dragState: DragState): { x: number; y: number } {
  const current = dragState.currentPointer ?? dragState.pointer;
  return { x: current.x - dragState.pointer.x, y: current.y - dragState.pointer.y };
}

function getDragPreviewBounds(dragState: DragState): SketchSceneBounds | null {
  if (dragState.kind === "move") {
    return getSketchSelectionBounds(translateSketchNodes(dragState.nodes, getDragDelta(dragState)));
  }
  if (dragState.kind !== "resize" || !dragState.currentPointer) return null;
  const delta = getDragDelta(dragState);
  const preserveAspectRatio =
    Boolean(dragState.resizeBounds) &&
    Boolean(dragState.resizeHandle) &&
    getBoxResizeHandle(dragState.resizeHandle).length === 2 &&
    Boolean(dragState.modifierKeys?.shiftKey);
  const resizeFromBounds =
    shouldResizeFromSelectionBounds(dragState) || preserveAspectRatio
      ? dragState.resizeBounds
      : null;
  const resizedNodes =
    resizeFromBounds
      ? resizeNodesWithinBounds(
          dragState.nodes,
          resizeFromBounds,
          resizeBounds(resizeFromBounds, getBoxResizeHandle(dragState.resizeHandle), delta, preserveAspectRatio),
        )
      : null;
  const previewNodes = dragState.nodes.map((node, index) => (
    resizeLineLikeNodeEndpoint(node, dragState.resizeHandle, delta) ??
    resizedNodes?.[index] ??
    (dragState.nodeId === node.id ? resizeSketchNode(node, getBoxResizeHandle(dragState.resizeHandle), delta) : node)
  ));
  return getSketchSelectionBounds(previewNodes);
}

function pushNearestSnapGuide(
  guides: SketchSnapGuide[],
  guide: Omit<SketchSnapGuide, "id">,
) {
  if (guides.some((item) => item.kind === guide.kind && item.orientation === guide.orientation)) return;
  guides.push({ ...guide, id: `${guide.kind}:${guide.orientation}:${Math.round(guide.position)}` });
}

function getSketchSnapGuides(
  scene: SketchSceneDocument,
  dragState: DragState | null,
  configData?: Record<string, unknown>,
): SketchSnapGuide[] {
  if (!dragState || dragState.kind === "rotate" || !dragState.currentPointer || isSnapGuideSuppressed(dragState)) return [];
  const bounds = getDragPreviewBounds(dragState);
  if (!bounds) return [];
  const threshold = 4;
  const guides: SketchSnapGuide[] = [];
  const draggedIds = new Set(dragState.nodes.map((node) => node.id));
  const pageCenterX = scene.pageSize.width / 2;
  const pageCenterY = scene.pageSize.height / 2;
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;
  const verticalBounds = { from: 0, to: scene.pageSize.height };
  const horizontalBounds = { from: 0, to: scene.pageSize.width };

  if (Math.abs(boundsCenterX - pageCenterX) <= threshold) {
    pushNearestSnapGuide(guides, { kind: "center", orientation: "vertical", position: pageCenterX, ...verticalBounds, label: "中心线" });
  }
  if (Math.abs(boundsCenterY - pageCenterY) <= threshold) {
    pushNearestSnapGuide(guides, { kind: "center", orientation: "horizontal", position: pageCenterY, ...horizontalBounds, label: "中心线" });
  }

  const gridSize = 20;
  const nearestGridX = Math.round(bounds.x / gridSize) * gridSize;
  const nearestGridY = Math.round(bounds.y / gridSize) * gridSize;
  if (Math.abs(bounds.x - nearestGridX) <= threshold) {
    pushNearestSnapGuide(guides, { kind: "grid", orientation: "vertical", position: nearestGridX, ...verticalBounds, label: "网格" });
  }
  if (Math.abs(bounds.y - nearestGridY) <= threshold) {
    pushNearestSnapGuide(guides, { kind: "grid", orientation: "horizontal", position: nearestGridY, ...horizontalBounds, label: "网格" });
  }

  for (const node of scene.nodes) {
    if (draggedIds.has(node.id) || !isNodeVisibleForConfig(node, configData) || node.type === "group") continue;
    const targetBounds = getSketchNodeBounds(node);
    const targetCenterX = targetBounds.x + targetBounds.width / 2;
    const targetCenterY = targetBounds.y + targetBounds.height / 2;
    const targetVerticalFrom = Math.min(bounds.y, targetBounds.y);
    const targetVerticalTo = Math.max(bounds.y + bounds.height, targetBounds.y + targetBounds.height);
    const targetHorizontalFrom = Math.min(bounds.x, targetBounds.x);
    const targetHorizontalTo = Math.max(bounds.x + bounds.width, targetBounds.x + targetBounds.width);

    if (Math.abs(bounds.x - targetBounds.x) <= threshold || Math.abs(bounds.x + bounds.width - (targetBounds.x + targetBounds.width)) <= threshold) {
      pushNearestSnapGuide(guides, { kind: "edge", orientation: "vertical", position: Math.abs(bounds.x - targetBounds.x) <= threshold ? targetBounds.x : targetBounds.x + targetBounds.width, from: targetVerticalFrom, to: targetVerticalTo, label: "边缘" });
    }
    if (Math.abs(bounds.y - targetBounds.y) <= threshold || Math.abs(bounds.y + bounds.height - (targetBounds.y + targetBounds.height)) <= threshold) {
      pushNearestSnapGuide(guides, { kind: "edge", orientation: "horizontal", position: Math.abs(bounds.y - targetBounds.y) <= threshold ? targetBounds.y : targetBounds.y + targetBounds.height, from: targetHorizontalFrom, to: targetHorizontalTo, label: "边缘" });
    }
    if (Math.abs(boundsCenterX - targetCenterX) <= threshold) {
      pushNearestSnapGuide(guides, { kind: "center", orientation: "vertical", position: targetCenterX, from: targetVerticalFrom, to: targetVerticalTo, label: "中心线" });
    }
    if (Math.abs(boundsCenterY - targetCenterY) <= threshold) {
      pushNearestSnapGuide(guides, { kind: "center", orientation: "horizontal", position: targetCenterY, from: targetHorizontalFrom, to: targetHorizontalTo, label: "中心线" });
    }

    const horizontalGap = bounds.x >= targetBounds.x + targetBounds.width
      ? bounds.x - (targetBounds.x + targetBounds.width)
      : targetBounds.x >= bounds.x + bounds.width
        ? targetBounds.x - (bounds.x + bounds.width)
        : null;
    const verticalOverlap = bounds.y < targetBounds.y + targetBounds.height && bounds.y + bounds.height > targetBounds.y;
    if (horizontalGap !== null && verticalOverlap && horizontalGap >= 8 && horizontalGap <= 80) {
      const position = bounds.x >= targetBounds.x + targetBounds.width
        ? targetBounds.x + targetBounds.width + horizontalGap / 2
        : bounds.x + bounds.width + horizontalGap / 2;
      pushNearestSnapGuide(guides, { kind: "spacing", orientation: "vertical", position, from: Math.min(bounds.y, targetBounds.y), to: Math.max(bounds.y + bounds.height, targetBounds.y + targetBounds.height), label: "间距" });
    }
  }

  return guides.slice(0, 6);
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(3));
}

function sanitizeEditablePatch(
  node: SketchSceneNode,
  patch: Partial<SketchSceneNode>,
): Partial<SketchSceneNode> | null {
  const lineLikeType = node.type === "line" || node.type === "arrow";
  const nextPatch: Partial<SketchSceneNode> = { ...patch };
  if ("x" in patch) {
    const next = normalizeFiniteNumber(patch.x);
    if (next === null) return null;
    nextPatch.x = Math.max(0, next);
  }
  if ("y" in patch) {
    const next = normalizeFiniteNumber(patch.y);
    if (next === null) return null;
    nextPatch.y = Math.max(0, next);
  }
  if ("width" in patch) {
    const next = normalizeFiniteNumber(patch.width);
    if (next === null) return null;
    nextPatch.width = lineLikeType ? next : Math.max(getEditableMinSize(node), next);
  }
  if ("height" in patch) {
    const next = normalizeFiniteNumber(patch.height);
    if (next === null) return null;
    nextPatch.height = lineLikeType ? next : Math.max(getEditableMinSize(node), next);
  }
  if (lineLikeType) {
    const geometryTouched = "x" in patch || "y" in patch || "width" in patch || "height" in patch;
    if (geometryTouched) {
      let nextX = typeof nextPatch.x === "number" ? nextPatch.x : node.x;
      let nextY = typeof nextPatch.y === "number" ? nextPatch.y : node.y;
      let nextWidth = typeof nextPatch.width === "number" ? nextPatch.width : node.width;
      let nextHeight = typeof nextPatch.height === "number" ? nextPatch.height : node.height;

      if (nextX + nextWidth < 0) {
        if ("width" in patch && !("x" in patch)) nextWidth = -nextX;
        else nextX = Math.max(0, -nextWidth);
      }
      if (nextY + nextHeight < 0) {
        if ("height" in patch && !("y" in patch)) nextHeight = -nextY;
        else nextY = Math.max(0, -nextHeight);
      }
      if (nextWidth === 0 && nextHeight === 0) {
        if ("height" in patch && !("width" in patch)) {
          const preferredHeight = node.height < 0 ? -1 : 1;
          nextHeight = preferredHeight < 0 && nextY <= 0 ? 1 : preferredHeight;
        } else {
          const preferredWidth = node.width < 0 ? -1 : 1;
          nextWidth = preferredWidth < 0 && nextX <= 0 ? 1 : preferredWidth;
        }
      }
      if (nextX + nextWidth < 0) nextWidth = -nextX;
      if (nextY + nextHeight < 0) nextHeight = -nextY;

      nextPatch.x = nextX;
      nextPatch.y = nextY;
      nextPatch.width = nextWidth;
      nextPatch.height = nextHeight;
    }
  }
  if ("rotation" in patch) {
    const next = normalizeFiniteNumber(patch.rotation);
    if (next === null) return null;
    nextPatch.rotation = next;
  }
  return nextPatch;
}

function applySelectedPatch(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  patch: Partial<SketchSceneNode>,
  recordHistory = true,
) {
  if (!controller.selection.nodeIds.length) return;
  const editableNodes = getEditableSelectedNodes(scene, controller).filter(canEditNodeProperties);
  if (!editableNodes.length) return;
  const operations = editableNodes.flatMap((node) => {
    const sanitizedPatch = sanitizeEditablePatch(node, patch);
    return sanitizedPatch ? [{ op: "update" as const, nodeId: node.id, patch: sanitizedPatch }] : [];
  });
  if (!operations.length) return;
  controller.applyOperations(operations, recordHistory);
}

function updateSelectedStyle(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  stylePatch: NonNullable<SketchSceneNode["style"]>,
  recordHistory = true,
) {
  const selectedNode = getSingleSelectedNode(scene, controller);
  if (!selectedNode || !canEditNodeProperties(selectedNode)) return;
  applySelectedPatch(scene, controller, {
    style: { ...selectedNode.style, ...stylePatch },
  }, recordHistory);
}

function updateNodesStyle(
  controller: SketchEditorController,
  nodes: SketchSceneNode[],
  stylePatch: NonNullable<SketchSceneNode["style"]>,
  recordHistory = true,
) {
  if (!nodes.length) return;
  controller.applyOperations(
    nodes.map((node) => ({
      op: "update" as const,
      nodeId: node.id,
      patch: { style: { ...node.style, ...stylePatch } },
    })),
    recordHistory,
  );
}

function resetSelectedStyleKeys(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  keys: Array<keyof SketchSceneStyle>,
) {
  const selectedNode = getSingleSelectedNode(scene, controller);
  if (!selectedNode || !canEditNodeProperties(selectedNode)) return;
  const nextStyle: SketchSceneStyle = { ...selectedNode.style };
  for (const key of keys) delete nextStyle[key];
  applySelectedPatch(scene, controller, { style: nextStyle });
}

function resetNodesStyleKeys(
  controller: SketchEditorController,
  nodes: SketchSceneNode[],
  keys: Array<keyof SketchSceneStyle>,
) {
  if (!nodes.length) return;
  controller.applyOperations(
    nodes.map((node) => {
      const nextStyle: SketchSceneStyle = { ...node.style };
      for (const key of keys) delete nextStyle[key];
      return {
        op: "update" as const,
        nodeId: node.id,
        patch: { style: nextStyle },
      };
    }),
  );
}

function resetSelectedTextStyleRunKeys(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  keys: Array<keyof SketchSceneTextStyleOverride>,
) {
  const selectedNode = getSingleSelectedNode(scene, controller);
  if (!selectedNode || !canEditNodeProperties(selectedNode) || !supportsTextStyle(selectedNode)) return;
  const text = selectedNode.text ?? "";
  if (!text.length) return;
  const activeRange = getActiveInlineTextRange(controller, selectedNode);
  if (activeRange) {
    applySelectedPatch(scene, controller, {
      textStyleRuns: updateTextStyleRunsForRange(selectedNode, activeRange, (style) => {
        const nextStyle: SketchSceneTextStyleOverride = { ...style };
        for (const key of keys) delete nextStyle[key];
        return nextStyle;
      }),
    });
    return;
  }
  const nextStyle: SketchSceneTextStyleOverride = { ...getFullTextStyleRunStyle(selectedNode) };
  for (const key of keys) delete nextStyle[key];
  applySelectedPatch(scene, controller, {
    textStyleRuns: Object.keys(nextStyle).length
      ? [
          {
            start: 0,
            length: text.length,
            style: nextStyle,
          },
        ]
      : [],
  });
}

function createExportScene(scene: SketchSceneDocument, nodes: SketchSceneNode[]): SketchSceneDocument {
  return {
    ...scene,
    nodes: nodes.length ? nodes : scene.nodes,
  };
}

function renderExportSvgMarkup(scene: SketchSceneDocument, options: Pick<SketchExportOptions, "withBackground">): string {
  const svgMarkup = renderSketchSceneToSvgMarkup(scene);
  if (!options.withBackground) return svgMarkup;
  const background = `<rect x="0" y="0" width="${scene.pageSize.width}" height="${scene.pageSize.height}" fill="#ffffff" />`;
  return svgMarkup.replace(/(<svg[^>]*>)/, `$1${background}`);
}

async function copySvgToClipboardOrDownload(
  scene: SketchSceneDocument,
  filename: string,
  options: Pick<SketchExportOptions, "withBackground">,
): Promise<SketchExportResult> {
  const svgMarkup = renderExportSvgMarkup(scene, options);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(svgMarkup);
      return "copied";
    } catch {
      // Fall through to a file download when text clipboard writes are blocked.
    }
  }
  downloadTextFile(filename, svgMarkup, "image/svg+xml;charset=utf-8");
  return "downloaded";
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadBlobFile(filename: string, blob: Blob) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function renderSvgToPngBlob(
  svgMarkup: string,
  size: { width: number; height: number },
  scale = 1,
  withBackground = false,
): Promise<Blob | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.toBlob !== "function") return null;
  canvas.width = Math.max(1, Math.round(size.width * scale));
  canvas.height = Math.max(1, Math.round(size.height * scale));
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to rasterize SVG"));
      image.src = svgUrl;
    });
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (withBackground) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function copyPngToClipboardOrDownload(
  scene: SketchSceneDocument,
  filename: string,
  options: SketchExportOptions = { scale: 1, withBackground: false },
): Promise<SketchExportResult> {
  const svgMarkup = renderExportSvgMarkup(scene, { withBackground: options.withBackground });
  const pngBlob = await renderSvgToPngBlob(svgMarkup, scene.pageSize, options.scale, options.withBackground);
  if (!pngBlob) {
    downloadTextFile(filename.replace(/\.png$/i, ".svg"), svgMarkup, "image/svg+xml;charset=utf-8");
    return "downloaded";
  }
  const ClipboardItemCtor = typeof ClipboardItem === "undefined" ? null : ClipboardItem;
  if (ClipboardItemCtor && typeof navigator !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItemCtor({ "image/png": pngBlob })]);
      return "copied";
    } catch {
      // Fall through to a file download when the browser blocks image clipboard writes.
    }
  }
  downloadBlobFile(filename, pngBlob);
  return "downloaded";
}

function updateSelectedTextStyleRun(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  stylePatch: SketchSceneTextStyleOverride,
  recordHistory = true,
) {
  const selectedNode = getSingleSelectedNode(scene, controller);
  if (!selectedNode || !canEditNodeProperties(selectedNode) || !supportsTextStyle(selectedNode)) return;
  const text = selectedNode.text ?? "";
  if (!text.length) return;
  const activeRange = getActiveInlineTextRange(controller, selectedNode);
  if (activeRange) {
    applySelectedPatch(scene, controller, {
      textStyleRuns: updateTextStyleRunsForRange(selectedNode, activeRange, (style) => ({
        ...style,
        ...stylePatch,
      })),
    }, recordHistory);
    return;
  }
  const nextStyle = {
    ...getFullTextStyleRunStyle(selectedNode),
    ...stylePatch,
  };
  applySelectedPatch(scene, controller, {
    textStyleRuns: [
      {
        start: 0,
        length: text.length,
        style: nextStyle,
      },
    ],
  }, recordHistory);
}

function deleteSelected(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  configData?: Record<string, unknown>,
) {
  const selectedNodes = getEditableSelectedNodes(scene, controller).filter((node) => !isNodeHiddenByRuntimeConfig(node, configData));
  const editableNodes = expandSketchNodesForDelete(scene, selectedNodes, configData);
  if (!editableNodes.length) return;
  controller.applyOperations(editableNodes.map((node) => ({ op: "delete", nodeId: node.id })));
  controller.clearSelection();
}

function createSketchNodeId(): string {
  return `sketch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function expandSketchNodesForInsert(
  scene: SketchSceneDocument,
  nodes: SketchSceneNode[],
  configData?: Record<string, unknown>,
): SketchSceneNode[] {
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const includedIds = new Set<string>();
  const visit = (nodeId: string, fromGroup = false): boolean => {
    const node = nodesById.get(nodeId);
    if (!node || node.locked) return false;
    if (fromGroup && node.type !== "group" && !isNodeVisibleForConfig(node, configData)) return false;
    if (node.type !== "group") {
      includedIds.add(node.id);
      return true;
    }
    const hasIncludedChildren = (node.children ?? []).some((childId) => visit(childId, true));
    if (hasIncludedChildren) includedIds.add(node.id);
    return hasIncludedChildren;
  };

  for (const node of nodes) visit(node.id);
  return scene.nodes.filter((node) => includedIds.has(node.id));
}

function expandSketchNodesForDelete(
  scene: SketchSceneDocument,
  nodes: SketchSceneNode[],
  configData?: Record<string, unknown>,
): SketchSceneNode[] {
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const includedIds = new Set<string>();
  const visit = (nodeId: string, fromGroup = false) => {
    const node = nodesById.get(nodeId);
    if (!node || node.locked || includedIds.has(node.id)) return;
    if (fromGroup && node.type !== "group" && !isNodeVisibleForConfig(node, configData)) return;
    includedIds.add(node.id);
    if (node.type === "group") {
      for (const childId of node.children ?? []) visit(childId, true);
    }
  };

  for (const node of nodes) visit(node.id);
  return scene.nodes.filter((node) => includedIds.has(node.id));
}

function cloneSketchNodesForInsert(
  nodes: SketchSceneNode[],
  offset: { x: number; y: number } = { x: 24, y: 24 },
): SketchSceneNode[] {
  const idMap = new Map(nodes.map((node) => [node.id, createSketchNodeId()]));
  const clonedNodes = nodes.map((node) => {
    const children = node.children?.flatMap((childId) => {
      const mappedId = idMap.get(childId);
      return mappedId ? [mappedId] : [];
    });
    return {
      ...node,
      id: idMap.get(node.id) ?? createSketchNodeId(),
      x: node.x + offset.x,
      y: node.y + offset.y,
      locked: false,
      visible: node.type === "group" ? false : true,
      children,
      name: node.name ? `${node.name} copy` : undefined,
    };
  });
  const clonedIds = new Set(clonedNodes.map((node) => node.id));
  const insertedIds = new Set<string>();
  const pending = [...clonedNodes];
  const ordered: SketchSceneNode[] = [];

  while (pending.length) {
    const nextIndex = pending.findIndex((node) =>
      (node.children ?? []).every((childId) => !clonedIds.has(childId) || insertedIds.has(childId)),
    );
    if (nextIndex < 0) return [...ordered, ...pending];
    const [nextNode] = pending.splice(nextIndex, 1);
    ordered.push(nextNode);
    insertedIds.add(nextNode.id);
  }

  return ordered;
}

function duplicateSelected(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  configData?: Record<string, unknown>,
) {
  const editableSelectedNodes = getEditableSelectedNodes(scene, controller).filter((node) => !isNodeHiddenByRuntimeConfig(node, configData));
  const selectedNodes = expandSketchNodesForInsert(scene, editableSelectedNodes, configData);
  const nodes = cloneSketchNodesForInsert(selectedNodes);
  if (!nodes.length) return;
  controller.applyOperations(nodes.map((node) => ({ op: "add", node })));
  controller.setNodeIds(nodes.map((node) => node.id));
}

function bringToFront(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const editableNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  if (!editableNodes.length) return;
  const selectedIds = new Set(editableNodes.map((node) => node.id));
  const visualLayerIds = getVisualLayerNodes(scene).map((node) => node.id);
  const editableIds = visualLayerIds.filter((nodeId) => selectedIds.has(nodeId));
  const otherIds = visualLayerIds.filter((nodeId) => !selectedIds.has(nodeId));
  const nextNodeIds = [...otherIds, ...editableIds];
  if (nextNodeIds.every((nodeId, index) => nodeId === visualLayerIds[index])) return;
  controller.applyOperations([{ op: "reorder", nodeIds: nextNodeIds }]);
}

function bringForward(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const editableNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  if (!editableNodes.length) return;
  const selectedIds = new Set(editableNodes.map((node) => node.id));
  const nextNodeIds = getVisualLayerNodes(scene).map((node) => node.id);
  for (let index = nextNodeIds.length - 2; index >= 0; index -= 1) {
    if (!selectedIds.has(nextNodeIds[index]) || selectedIds.has(nextNodeIds[index + 1])) continue;
    [nextNodeIds[index], nextNodeIds[index + 1]] = [nextNodeIds[index + 1], nextNodeIds[index]];
  }
  const currentNodeIds = getVisualLayerNodes(scene).map((node) => node.id);
  if (nextNodeIds.every((nodeId, index) => nodeId === currentNodeIds[index])) return;
  controller.applyOperations([{ op: "reorder", nodeIds: nextNodeIds }]);
}

function sendToBack(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const editableNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  if (!editableNodes.length) return;
  const selectedIds = new Set(editableNodes.map((node) => node.id));
  const visualLayerIds = getVisualLayerNodes(scene).map((node) => node.id);
  const editableIds = visualLayerIds.filter((nodeId) => selectedIds.has(nodeId));
  const otherIds = visualLayerIds.filter((nodeId) => !selectedIds.has(nodeId));
  const nextNodeIds = [...editableIds, ...otherIds];
  if (nextNodeIds.every((nodeId, index) => nodeId === visualLayerIds[index])) return;
  controller.applyOperations([{ op: "reorder", nodeIds: nextNodeIds }]);
}

function sendBackward(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const editableNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  if (!editableNodes.length) return;
  const selectedIds = new Set(editableNodes.map((node) => node.id));
  const nextNodeIds = getVisualLayerNodes(scene).map((node) => node.id);
  for (let index = 1; index < nextNodeIds.length; index += 1) {
    if (!selectedIds.has(nextNodeIds[index]) || selectedIds.has(nextNodeIds[index - 1])) continue;
    [nextNodeIds[index - 1], nextNodeIds[index]] = [nextNodeIds[index], nextNodeIds[index - 1]];
  }
  const currentNodeIds = getVisualLayerNodes(scene).map((node) => node.id);
  if (nextNodeIds.every((nodeId, index) => nodeId === currentNodeIds[index])) return;
  controller.applyOperations([{ op: "reorder", nodeIds: nextNodeIds }]);
}

function toggleLocked(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const selectedNodes = getSelectedNodes(scene, controller);
  const lockableNodes = selectedNodes.filter((node) => node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData));
  if (!lockableNodes.length) return;
  controller.applyOperations([
    {
      op: "set-locked",
      nodeIds: lockableNodes.map((node) => node.id),
      locked: !lockableNodes.every((node) => node.locked),
    },
  ]);
}

function toggleVisible(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const selectedNodes = getSelectedNodes(scene, controller);
  const toggleableNodes = selectedNodes.filter((node) => node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData));
  if (!toggleableNodes.length) return;
  controller.applyOperations([
    {
      op: "set-visible",
      nodeIds: toggleableNodes.map((node) => node.id),
      visible: !toggleableNodes.every((node) => node.visible !== false),
    },
  ]);
}

function getGroupableSelectedNodes(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  configData?: Record<string, unknown>,
): SketchSceneNode[] {
  return getLayerEditableSelectedNodes(scene, controller, configData);
}

function getSelectedGroupNodes(scene: SketchSceneDocument, controller: SketchEditorController): SketchSceneNode[] {
  return getSelectedNodes(scene, controller).filter((node) => node.type === "group");
}

function groupSelected(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const groupableNodes = getGroupableSelectedNodes(scene, controller, configData);
  if (groupableNodes.length < 2) return;
  const groupId = createSketchNodeId();
  controller.applyOperations([
    {
      op: "group",
      groupId,
      nodeIds: groupableNodes.map((node) => node.id),
      name: `分组 ${groupableNodes.length}`,
    },
  ]);
  controller.setNodeIds([groupId]);
}

function ungroupSelected(scene: SketchSceneDocument, controller: SketchEditorController) {
  const groups = getSelectedGroupNodes(scene, controller);
  if (!groups.length) return;
  const childIds = groups.flatMap((group) => group.children ?? []);
  controller.applyOperations(groups.map((group) => ({ op: "ungroup", groupId: group.id })));
  controller.setNodeIds(childIds);
}

function alignSelected(scene: SketchSceneDocument, controller: SketchEditorController, axis: "left" | "top", configData?: Record<string, unknown>) {
  const selectedNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  const bounds = getSketchSelectionBounds(selectedNodes);
  if (!bounds || selectedNodes.length < 2) return;
  controller.applyOperations(
    selectedNodes.map((node) => {
      const nodeBounds = getSketchNodeBounds(node);
      return {
        op: "update",
        nodeId: node.id,
        patch: axis === "left"
          ? { x: node.x + bounds.x - nodeBounds.x }
          : { y: node.y + bounds.y - nodeBounds.y },
      };
    }),
  );
}

function distributeSelectedHorizontally(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const selectedNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  const bounds = getSketchSelectionBounds(selectedNodes);
  if (!bounds || selectedNodes.length < 3) return;
  const ordered = [...selectedNodes]
    .map((node) => ({ node, bounds: getSketchNodeBounds(node) }))
    .sort((a, b) => a.bounds.x - b.bounds.x);
  const totalWidth = ordered.reduce((sum, item) => sum + item.bounds.width, 0);
  const gap = Math.max(0, (bounds.width - totalWidth) / (ordered.length - 1));
  let cursor = bounds.x;
  controller.applyOperations(
    ordered.map((item) => {
      const patch = { x: item.node.x + cursor - item.bounds.x };
      cursor += item.bounds.width + gap;
      return { op: "update", nodeId: item.node.id, patch };
    }),
  );
}

function distributeSelectedVertically(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  const selectedNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  const bounds = getSketchSelectionBounds(selectedNodes);
  if (!bounds || selectedNodes.length < 3) return;
  const ordered = [...selectedNodes]
    .map((node) => ({ node, bounds: getSketchNodeBounds(node) }))
    .sort((a, b) => a.bounds.y - b.bounds.y);
  const totalHeight = ordered.reduce((sum, item) => sum + item.bounds.height, 0);
  const gap = Math.max(0, (bounds.height - totalHeight) / (ordered.length - 1));
  let cursor = bounds.y;
  controller.applyOperations(
    ordered.map((item) => {
      const patch = { y: item.node.y + cursor - item.bounds.y };
      cursor += item.bounds.height + gap;
      return { op: "update", nodeId: item.node.id, patch };
    }),
  );
}

function getStylePatchForNode(node: SketchSceneNode, clipboard: StyleClipboardState): Partial<SketchSceneNode> | null {
  const stylePatch: SketchSceneStyle = {};
  if (clipboard.style) {
    if (supportsFillStyle(node) && clipboard.style.fill !== undefined) stylePatch.fill = clipboard.style.fill;
    if (supportsStrokeStyle(node)) {
      if (clipboard.style.stroke !== undefined) stylePatch.stroke = clipboard.style.stroke;
      if (clipboard.style.strokeWidth !== undefined) stylePatch.strokeWidth = clipboard.style.strokeWidth;
      if (clipboard.style.lineDash !== undefined) stylePatch.lineDash = clipboard.style.lineDash;
    }
    if (supportsTextStyle(node)) {
      if (clipboard.style.color !== undefined) stylePatch.color = clipboard.style.color;
      if (clipboard.style.fontSize !== undefined) stylePatch.fontSize = clipboard.style.fontSize;
      if (clipboard.style.fontWeight !== undefined) stylePatch.fontWeight = clipboard.style.fontWeight;
      if (clipboard.style.textAlign !== undefined) stylePatch.textAlign = clipboard.style.textAlign;
    }
    if (supportsRadiusStyle(node) && clipboard.style.radius !== undefined) stylePatch.radius = clipboard.style.radius;
    if (clipboard.style.opacity !== undefined) stylePatch.opacity = clipboard.style.opacity;
    if (node.type === "arrow") {
      if (clipboard.style.startArrow !== undefined) stylePatch.startArrow = clipboard.style.startArrow;
      if (clipboard.style.endArrow !== undefined) stylePatch.endArrow = clipboard.style.endArrow;
    }
    if (node.type === "image" && clipboard.style.imageFit !== undefined) stylePatch.imageFit = clipboard.style.imageFit;
  }
  const patch: Partial<SketchSceneNode> = {};
  if (Object.keys(stylePatch).length > 0) {
    patch.style = { ...node.style, ...stylePatch };
  }
  if (supportsTextStyle(node) && clipboard.textStyleRuns) {
    patch.textStyleRuns = clipboard.textStyleRuns.map((run) => ({ ...run, style: { ...run.style } }));
  }
  return Object.keys(patch).length ? patch : null;
}

function buildSketchActionEntries({
  scene,
  controller,
  configData,
  selectedNodes,
  editableSelectedNodes,
  layerEditableSelectedNodes,
  lockableSelectedNodes,
  visibleToggleSelectedNodes,
  canGroupSelection,
  canUngroupSelection,
  copiedNodeCount,
  hasCopiedStyle,
  copySelected,
  pasteClipboard,
  copyStyle,
  pasteStyle,
  fitPageToViewport,
  zoomToSelection,
}: {
  scene: SketchSceneDocument;
  controller: SketchEditorController;
  configData?: Record<string, unknown>;
  selectedNodes: SketchSceneNode[];
  editableSelectedNodes: SketchSceneNode[];
  layerEditableSelectedNodes: SketchSceneNode[];
  lockableSelectedNodes: SketchSceneNode[];
  visibleToggleSelectedNodes: SketchSceneNode[];
  canGroupSelection: boolean;
  canUngroupSelection: boolean;
  copiedNodeCount: number;
  hasCopiedStyle: boolean;
  copySelected: () => void;
  pasteClipboard: () => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  fitPageToViewport: () => void;
  zoomToSelection: () => void;
}): SketchActionEntry[] {
  const noSelection = selectedNodes.length ? undefined : "需要先选择对象";
  const noEditableSelection = editableSelectedNodes.length ? undefined : "当前选择不可编辑";
  const noLayerEditableSelection = layerEditableSelectedNodes.length ? undefined : "当前选择不可排序";
  const tools = TOOL_OPTIONS.map<SketchActionEntry>((item) => ({
    id: `tool.${item.tool}`,
    section: "tool",
    label: item.label,
    description: `切换到${item.label}工具`,
    shortcuts: [],
    run: () => controller.setTool(item.tool),
  }));
  return [
    ...tools,
    {
      id: "history.undo",
      section: "history",
      label: "撤销",
      description: "撤销上一步编辑",
      shortcuts: ["Cmd/Ctrl+Z"],
      disabledReason: controller.canUndo ? undefined : "没有可撤销的历史",
      run: controller.undo,
    },
    {
      id: "history.redo",
      section: "history",
      label: "重做",
      description: "恢复被撤销的编辑",
      shortcuts: ["Cmd/Ctrl+Shift+Z"],
      disabledReason: controller.canRedo ? undefined : "没有可重做的历史",
      run: controller.redo,
    },
    {
      id: "object.copy",
      section: "object",
      label: "复制对象",
      description: "复制当前选择到草图剪贴板",
      shortcuts: ["Cmd/Ctrl+C"],
      disabledReason: noEditableSelection,
      run: copySelected,
    },
    {
      id: "object.paste",
      section: "object",
      label: "粘贴对象",
      description: "粘贴草图剪贴板中的对象",
      shortcuts: ["Cmd/Ctrl+V"],
      disabledReason: copiedNodeCount ? undefined : "草图剪贴板为空",
      run: pasteClipboard,
    },
    {
      id: "object.duplicate",
      section: "object",
      label: "复制副本",
      description: "在原对象旁插入一份副本",
      shortcuts: ["Cmd/Ctrl+D", "Alt+拖动"],
      disabledReason: noEditableSelection,
      run: () => duplicateSelected(scene, controller, configData),
    },
    {
      id: "object.delete",
      section: "object",
      label: "删除",
      description: "删除当前可编辑选择",
      shortcuts: ["Delete", "Backspace"],
      disabledReason: noEditableSelection,
      run: () => deleteSelected(scene, controller, configData),
    },
    {
      id: "arrange.front",
      section: "arrange",
      label: "置顶",
      description: "把选择对象移动到最上层",
      shortcuts: ["Cmd/Ctrl+Shift+]"],
      disabledReason: noLayerEditableSelection,
      run: () => bringToFront(scene, controller, configData),
    },
    {
      id: "arrange.forward",
      section: "arrange",
      label: "上移一层",
      description: "把选择对象向上移动一层",
      shortcuts: ["Cmd/Ctrl+]"],
      disabledReason: noLayerEditableSelection,
      run: () => bringForward(scene, controller, configData),
    },
    {
      id: "arrange.backward",
      section: "arrange",
      label: "下移一层",
      description: "把选择对象向下移动一层",
      shortcuts: ["Cmd/Ctrl+["],
      disabledReason: noLayerEditableSelection,
      run: () => sendBackward(scene, controller, configData),
    },
    {
      id: "arrange.back",
      section: "arrange",
      label: "置底",
      description: "把选择对象移动到最下层",
      shortcuts: ["Cmd/Ctrl+Shift+["],
      disabledReason: noLayerEditableSelection,
      run: () => sendToBack(scene, controller, configData),
    },
    {
      id: "arrange.alignLeft",
      section: "arrange",
      label: "左对齐",
      description: "按选择边界左侧对齐",
      shortcuts: [],
      disabledReason: layerEditableSelectedNodes.length >= 2 ? undefined : "至少选择两个可编辑对象",
      run: () => alignSelected(scene, controller, "left", configData),
    },
    {
      id: "arrange.alignTop",
      section: "arrange",
      label: "顶对齐",
      description: "按选择边界顶部对齐",
      shortcuts: [],
      disabledReason: layerEditableSelectedNodes.length >= 2 ? undefined : "至少选择两个可编辑对象",
      run: () => alignSelected(scene, controller, "top", configData),
    },
    {
      id: "arrange.distributeHorizontal",
      section: "arrange",
      label: "水平分布",
      description: "在选择边界内均分水平间距",
      shortcuts: [],
      disabledReason: layerEditableSelectedNodes.length >= 3 ? undefined : "至少选择三个可编辑对象",
      run: () => distributeSelectedHorizontally(scene, controller, configData),
    },
    {
      id: "arrange.distributeVertical",
      section: "arrange",
      label: "垂直分布",
      description: "在选择边界内均分垂直间距",
      shortcuts: [],
      disabledReason: layerEditableSelectedNodes.length >= 3 ? undefined : "至少选择三个可编辑对象",
      run: () => distributeSelectedVertically(scene, controller, configData),
    },
    {
      id: "object.lock",
      section: "object",
      label: lockableSelectedNodes.length && lockableSelectedNodes.every((node) => node.locked) ? "解锁" : "锁定",
      description: "切换选择对象的锁定状态",
      shortcuts: ["Cmd/Ctrl+L"],
      disabledReason: lockableSelectedNodes.length ? undefined : noSelection,
      run: () => toggleLocked(scene, controller, configData),
    },
    {
      id: "object.visible",
      section: "object",
      label: visibleToggleSelectedNodes.length && visibleToggleSelectedNodes.every((node) => node.visible !== false) ? "隐藏" : "显示",
      description: "切换选择对象的可见状态",
      shortcuts: ["Cmd/Ctrl+Shift+H"],
      disabledReason: visibleToggleSelectedNodes.length ? undefined : noSelection,
      run: () => toggleVisible(scene, controller, configData),
    },
    {
      id: "object.group",
      section: "object",
      label: "成组",
      description: "把多个对象组合成语义分组",
      shortcuts: ["Cmd/Ctrl+G"],
      disabledReason: canGroupSelection ? undefined : "至少选择两个可成组对象",
      run: () => groupSelected(scene, controller, configData),
    },
    {
      id: "object.ungroup",
      section: "object",
      label: "解组",
      description: "解除当前选择中的语义分组",
      shortcuts: ["Cmd/Ctrl+Shift+G"],
      disabledReason: canUngroupSelection ? undefined : "当前选择不是分组",
      run: () => ungroupSelected(scene, controller),
    },
    {
      id: "style.copy",
      section: "style",
      label: "复制样式",
      description: "复制单个对象的外观样式",
      shortcuts: ["Cmd/Ctrl+Alt+C"],
      disabledReason: selectedNodes.length === 1 && canEditNodeProperties(selectedNodes[0]) ? undefined : "需要选择一个可编辑对象",
      run: copyStyle,
    },
    {
      id: "style.paste",
      section: "style",
      label: "粘贴样式",
      description: "把复制的外观样式应用到当前选择",
      shortcuts: ["Cmd/Ctrl+Alt+V"],
      disabledReason: hasCopiedStyle ? noEditableSelection : "还没有复制样式",
      run: pasteStyle,
    },
    {
      id: "view.fitPage",
      section: "view",
      label: "适配页面",
      description: "把整页缩放到当前视口",
      shortcuts: ["Shift+1"],
      run: fitPageToViewport,
    },
    {
      id: "view.zoomSelection",
      section: "view",
      label: "缩放到选区",
      description: "把当前选择缩放到视口中心",
      shortcuts: ["Shift+2"],
      disabledReason: noSelection,
      run: zoomToSelection,
    },
  ];
}

const ACTION_SECTION_LABELS: Record<SketchActionSection, string> = {
  tool: "工具",
  object: "对象",
  arrange: "排列",
  style: "样式",
  view: "视图",
  history: "历史",
};

function SketchCommandPalette({
  actions,
  onClose,
}: {
  actions: SketchActionEntry[];
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredActions = actions.filter((action) => {
    if (!normalizedQuery) return true;
    return `${action.label} ${action.description} ${ACTION_SECTION_LABELS[action.section]} ${action.shortcuts.join(" ")}`
      .toLowerCase()
      .includes(normalizedQuery);
  });
  return (
    <div
      className="absolute left-1/2 top-16 z-40 w-[min(520px,calc(100%-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-2xl"
      role="dialog"
      aria-label="草图命令面板"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Command className="h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          aria-label="搜索草图命令"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="搜索命令或工具"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {filteredActions.length ? filteredActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            disabled={Boolean(action.disabledReason)}
            title={action.disabledReason ?? action.description}
            onClick={() => {
              if (action.disabledReason) return;
              action.run();
              onClose();
            }}
          >
            <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{ACTION_SECTION_LABELS[action.section]}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{action.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{action.disabledReason ?? action.description}</span>
            </span>
            {action.shortcuts.length ? (
              <span className="shrink-0 text-xs text-muted-foreground">{action.shortcuts[0]}</span>
            ) : null}
          </button>
        )) : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配命令</div>
        )}
      </div>
    </div>
  );
}

function SketchShortcutHelp({
  actions,
  onClose,
}: {
  actions: SketchActionEntry[];
  onClose: () => void;
}) {
  const shortcutActions = actions.filter((action) => action.shortcuts.length > 0);
  return (
    <div
      className="absolute right-4 top-16 z-40 w-[min(420px,calc(100%-32px))] overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-2xl"
      role="dialog"
      aria-label="草图快捷键帮助"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Keyboard className="h-4 w-4 text-muted-foreground" />
          快捷键
        </div>
        <button type="button" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto px-3 py-2">
        {shortcutActions.map((action) => (
          <div key={action.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/60 py-2 text-sm last:border-0">
            <div className="min-w-0">
              <div className="truncate font-medium">{action.label}</div>
              <div className="truncate text-xs text-muted-foreground">{ACTION_SECTION_LABELS[action.section]}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              {action.shortcuts.map((shortcut) => (
                <span key={shortcut} className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                  {shortcut}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SketchEditorToolbar({ scene, controller, configData = {}, className }: SketchEditorToolbarProps) {
  const toolButtonClass =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35";
  const actionButtonClass =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35";

  return (
    <div
      className={cn(
        "flex min-h-12 w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 text-foreground shadow-2xl",
        className,
      )}
      onPointerDownCapture={() => activateSketchKeyboardScope(controller)}
    >
      {TOOL_OPTIONS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.tool}
            type="button"
            title={item.label}
            aria-label={item.tool === "text" ? "text" : item.label}
            className={cn(
              toolButtonClass,
              controller.tool === item.tool && "bg-[#7cc7ff] text-[#111111] hover:bg-[#7cc7ff] hover:text-[#111111]",
            )}
            onClick={() => controller.setTool(item.tool)}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      })}
      <div className="mx-2 h-8 w-px shrink-0 bg-border" />
      <button type="button" title="撤销" aria-label="撤销" className={actionButtonClass} disabled={!controller.canUndo} onClick={controller.undo}>
        <Undo2 className="h-4 w-4" />
      </button>
      <button type="button" title="重做" aria-label="重做" className={actionButtonClass} disabled={!controller.canRedo} onClick={controller.redo}>
        <Redo2 className="h-4 w-4" />
      </button>
      <div className="ml-2 shrink-0 whitespace-nowrap px-2 text-xs text-muted-foreground">
        {controller.selection.nodeIds.length ? `${controller.selection.nodeIds.length} selected` : "No selection"}
      </div>
    </div>
  );
}

function LayerStatusBadges({
  node,
  nodeName,
  hidden,
  hasBindings,
}: {
  node: SketchSceneNode;
  nodeName: string;
  hidden: boolean;
  hasBindings: boolean;
}) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {node.type === "group" ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-background text-muted-foreground" aria-label={`分组 ${nodeName}`} title="分组状态">
          <Group className="h-3 w-3" />
        </span>
      ) : null}
      {node.locked ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-background text-muted-foreground" aria-label={`已锁定 ${nodeName}`} title="锁定状态">
          <Lock className="h-3 w-3" />
        </span>
      ) : null}
      {hidden ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-background text-muted-foreground" aria-label={`已隐藏 ${nodeName}`} title="隐藏状态">
          <EyeOff className="h-3 w-3" />
        </span>
      ) : null}
      {hasBindings ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-background text-muted-foreground" aria-label={`已绑定 ${nodeName}`} title="绑定状态">
          <Link2 className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );
}

export function SketchLayerPanel({ scene, controller, configData = {}, className }: SketchLayerPanelProps) {
  const orderedNodes = getLayerPanelNodes(scene);
  const [layerContextMenu, setLayerContextMenu] = React.useState<ContextMenuState | null>(null);
  const [renamingLayerId, setRenamingLayerId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [draggedLayerId, setDraggedLayerId] = React.useState<string | null>(null);
  const [layerDropTargetId, setLayerDropTargetId] = React.useState<string | null>(null);
  const [layerSearchQuery, setLayerSearchQuery] = React.useState("");
  const [layerTypeFilter, setLayerTypeFilter] = React.useState<string>("all");
  const panelRef = React.useRef<HTMLDivElement>(null);
  const selectedNodes = getSelectedNodes(scene, controller);
  const editableSelectedNodes = selectedNodes.filter((node) => !node.locked && !isNodeHiddenByRuntimeConfig(node, configData));
  const layerEditableSelectedNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  const lockableSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData));
  const visibleToggleSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData));
  const selectedGroupNodes = getSelectedGroupNodes(scene, controller);
  const canGroupSelection = getGroupableSelectedNodes(scene, controller, configData).length >= 2;
  const canUngroupSelection = selectedGroupNodes.length > 0;
  const layerTypeOptions = React.useMemo(() => {
    const types = Array.from(new Set(orderedNodes.map((node) => node.type)));
    return types.sort((a, b) => (NODE_TYPE_LABELS[a] ?? a).localeCompare(NODE_TYPE_LABELS[b] ?? b, "zh-Hans-CN"));
  }, [orderedNodes]);
  const filteredLayerNodes = React.useMemo(() => {
    const query = layerSearchQuery.trim().toLowerCase();
    return orderedNodes.filter((node) => {
      if (layerTypeFilter !== "all" && node.type !== layerTypeFilter) return false;
      if (!query) return true;
      const name = getLayerNodeDisplayName(node).toLowerCase();
      const typeLabel = (NODE_TYPE_LABELS[node.type] ?? node.type).toLowerCase();
      return name.includes(query) || typeLabel.includes(query) || node.id.toLowerCase().includes(query);
    });
  }, [layerSearchQuery, layerTypeFilter, orderedNodes]);

  const runLayerContextMenuAction = React.useCallback((action: () => void) => {
    action();
    setLayerContextMenu(null);
  }, []);
  const startLayerRename = React.useCallback((node: SketchSceneNode) => {
    activateSketchKeyboardScope(controller);
    controller.setNodeIds([node.id]);
    setRenamingLayerId(node.id);
    setRenameDraft(node.name ?? "");
  }, [controller]);
  const cancelLayerRename = React.useCallback(() => {
    setRenamingLayerId(null);
    setRenameDraft("");
  }, []);
  const commitLayerRename = React.useCallback((node: SketchSceneNode) => {
    const nextName = renameDraft.trim();
    setRenamingLayerId(null);
    setRenameDraft("");
    if (nextName === (node.name ?? "")) return;
    controller.applyOperations([{ op: "update", nodeId: node.id, patch: { name: nextName } }]);
  }, [controller, renameDraft]);
  const canDragLayerNode = React.useCallback((node: SketchSceneNode) =>
    !node.locked && !isNodeHiddenByRuntimeConfig(node, configData),
  [configData]);
  const reorderLayerPanelNode = React.useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceNode = scene.nodes.find((node) => node.id === sourceId);
    const targetNode = scene.nodes.find((node) => node.id === targetId);
    if (!sourceNode || !targetNode || !canDragLayerNode(sourceNode) || !canDragLayerNode(targetNode)) return;
    const panelIds = getLayerPanelNodes(scene).map((node) => node.id);
    const sourceIndex = panelIds.indexOf(sourceId);
    const targetIndex = panelIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    panelIds.splice(sourceIndex, 1);
    panelIds.splice(targetIndex, 0, sourceId);
    const nextVisualIds = [...panelIds].reverse();
    const currentVisualIds = getVisualLayerNodes(scene).map((node) => node.id);
    if (nextVisualIds.every((nodeId, index) => nodeId === currentVisualIds[index])) return;
    controller.applyOperations([{ op: "reorder", nodeIds: nextVisualIds }]);
    controller.setNodeIds([sourceId]);
  }, [canDragLayerNode, controller, scene]);

  return (
    <div
      ref={panelRef}
      data-testid="sketch-layer-panel"
      className={cn("relative flex h-full min-h-0 flex-col bg-card", className)}
      onPointerDownCapture={() => activateSketchKeyboardScope(controller)}
    >
      <div className="border-b border-border px-3 py-3">
        <div className="text-[13px] font-semibold text-foreground">Layers</div>
        <div className="mt-1 text-xs text-muted-foreground">{filteredLayerNodes.length === scene.nodes.length ? `${scene.nodes.length} objects` : `${filteredLayerNodes.length}/${scene.nodes.length} objects`}</div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
          <input
            className="h-8 min-w-0 rounded-md border border-border bg-input px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            value={layerSearchQuery}
            onChange={(event) => setLayerSearchQuery(event.target.value)}
            placeholder="搜索图层"
            aria-label="搜索图层"
          />
          <select
            className="h-8 min-w-0 rounded-md border border-border bg-input px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            value={layerTypeFilter}
            onChange={(event) => setLayerTypeFilter(event.target.value)}
            aria-label="筛选图层类型"
          >
            <option value="all">全部类型</option>
            {layerTypeOptions.map((type) => (
              <option key={type} value={type}>{NODE_TYPE_LABELS[type] ?? type}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {orderedNodes.length ? (
          <div className="space-y-0.5">
            {filteredLayerNodes.length ? filteredLayerNodes.map((node) => {
              const selected = controller.selection.nodeIds.includes(node.id);
              const nodeName = getLayerNodeDisplayName(node);
              const renaming = renamingLayerId === node.id;
              const LayerTypeIcon = LAYER_NODE_TYPE_ICONS[node.type] ?? Square;
              const hasBindings = Boolean(node.bindings && Object.keys(node.bindings).length);
              const hiddenByRuntime = isNodeHiddenByConfigBinding(node, configData) || (node.type === "image" && isImageSourceUnresolvedForConfig(node, configData));
              const hidden = node.visible === false || hiddenByRuntime;
              const canToggleLock = node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData);
              const canToggleVisible = node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData);
              const canDragLayer = canDragLayerNode(node);
              return (
                <div
                  key={node.id}
                  data-sketch-layer-row
                  data-sketch-layer-node-id={node.id}
                  className={cn(
                    "group flex h-9 w-full min-w-0 items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent",
                    selected ? "bg-[#2f5d97] text-foreground ring-1 ring-[#3da0ff]" : "text-foreground",
                    layerDropTargetId === node.id && draggedLayerId !== node.id && "ring-1 ring-[#7cc7ff]",
                    draggedLayerId === node.id && "opacity-60",
                    node.visible === false && "opacity-50",
                  )}
                  draggable={canDragLayer && !renaming}
                  onDragStart={(event) => {
                    if (!canDragLayer || renaming) {
                      event.preventDefault();
                      return;
                    }
                    activateSketchKeyboardScope(controller);
                    controller.setNodeIds([node.id]);
                    setDraggedLayerId(node.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", node.id);
                  }}
                  onDragOver={(event) => {
                    if (!draggedLayerId || draggedLayerId === node.id || !canDragLayer) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setLayerDropTargetId(node.id);
                  }}
                  onDragLeave={() => {
                    setLayerDropTargetId((current) => (current === node.id ? null : current));
                  }}
                  onDrop={(event) => {
                    const sourceId = event.dataTransfer.getData("text/plain") || draggedLayerId;
                    setDraggedLayerId(null);
                    setLayerDropTargetId(null);
                    if (!sourceId) return;
                    event.preventDefault();
                    reorderLayerPanelNode(sourceId, node.id);
                  }}
                  onDragEnd={() => {
                    setDraggedLayerId(null);
                    setLayerDropTargetId(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    activateSketchKeyboardScope(controller);
                    if (!selected) {
                      controller.setNodeIds([node.id]);
                    }
                    const rect = panelRef.current?.getBoundingClientRect();
                    setLayerContextMenu({
                      x: rect ? event.clientX - rect.left : event.clientX,
                      y: rect ? event.clientY - rect.top : event.clientY,
                    });
                  }}
                >
                  {renaming ? (
                    <div className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 text-left text-sm">
                      <LayerTypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <input
                        autoFocus
                        className="h-7 min-w-0 flex-1 rounded border border-[#3da0ff] bg-background px-2 text-sm text-foreground outline-none"
                        value={renameDraft}
                        aria-label={`重命名图层 ${nodeName}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => commitLayerRename(node)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelLayerRename();
                            return;
                          }
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          event.stopPropagation();
                          commitLayerRename(node);
                        }}
                      />
                      <LayerStatusBadges node={node} nodeName={nodeName} hidden={hidden} hasBindings={hasBindings} />
                      <span className="shrink-0 text-[11px] text-muted-foreground">{NODE_TYPE_LABELS[node.type]}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={nodeName}
                      aria-label={`图层 ${nodeName}`}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        startLayerRename(node);
                      }}
                      onClick={(event) => {
                        activateSketchKeyboardScope(controller);
                        if (event.shiftKey) {
                          controller.setNodeIds(
                            selected
                              ? controller.selection.nodeIds.filter((nodeId) => nodeId !== node.id)
                              : [...controller.selection.nodeIds, node.id],
                          );
                        } else {
                          controller.setNodeIds([node.id]);
                        }
                      }}
                    >
                      <LayerTypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{nodeName}</span>
                      <LayerStatusBadges node={node} nodeName={nodeName} hidden={hidden} hasBindings={hasBindings} />
                      <span className="shrink-0 text-[11px] text-muted-foreground">{NODE_TYPE_LABELS[node.type]}</span>
                    </button>
                  )}
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                      title={node.locked ? "解锁" : "锁定"}
                      aria-label={`${node.locked ? "解锁" : "锁定"} ${nodeName}`}
                      disabled={!canToggleLock}
                      onClick={(event) => {
                        event.stopPropagation();
                        activateSketchKeyboardScope(controller);
                        controller.setNodeIds([node.id]);
                        controller.applyOperations([{ op: "set-locked", nodeIds: [node.id], locked: !node.locked }]);
                      }}
                    >
                      {node.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                      title={node.visible === false ? "显示" : "隐藏"}
                      aria-label={`${node.visible === false ? "显示" : "隐藏"} ${nodeName}`}
                      disabled={!canToggleVisible}
                      onClick={(event) => {
                        event.stopPropagation();
                        activateSketchKeyboardScope(controller);
                        controller.setNodeIds([node.id]);
                        controller.applyOperations([{ op: "set-visible", nodeIds: [node.id], visible: node.visible === false }]);
                      }}
                    >
                      {node.visible === false ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              );
            }) : (
              <div className="flex h-28 items-center justify-center px-4 text-center text-xs text-muted-foreground">
                没有匹配的图层。
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            当前手绘页面暂无对象。
          </div>
        )}
      </div>
      {layerContextMenu ? (
        <div
          role="menu"
          aria-label="草图图层菜单"
          className="absolute z-30 min-w-36 rounded-md border border-border bg-card py-1 text-foreground shadow-2xl"
          style={{ left: layerContextMenu.x, top: layerContextMenu.y }}
          onPointerDown={(event) => {
            event.stopPropagation();
            activateSketchKeyboardScope(controller);
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <ContextMenuButton
            label="复制"
            disabled={!editableSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => duplicateSelected(scene, controller, configData))}
          />
          <ContextMenuButton
            label="删除"
            disabled={!editableSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => deleteSelected(scene, controller, configData))}
          />
          <ContextMenuSeparator />
          <ContextMenuButton
            label="置顶"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => bringToFront(scene, controller, configData))}
          />
          <ContextMenuButton
            label="上移一层"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => bringForward(scene, controller, configData))}
          />
          <ContextMenuButton
            label="下移一层"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => sendBackward(scene, controller, configData))}
          />
          <ContextMenuButton
            label="置底"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => sendToBack(scene, controller, configData))}
          />
          <ContextMenuSeparator />
          <ContextMenuButton
            label={lockableSelectedNodes.length && lockableSelectedNodes.every((item) => item.locked) ? "解锁" : "锁定"}
            disabled={!lockableSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => toggleLocked(scene, controller, configData))}
          />
          <ContextMenuButton
            label={visibleToggleSelectedNodes.length && visibleToggleSelectedNodes.every((item) => item.visible !== false) ? "隐藏" : "显示"}
            disabled={!visibleToggleSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => toggleVisible(scene, controller, configData))}
          />
          <ContextMenuSeparator />
          <ContextMenuButton
            label="成组"
            disabled={!canGroupSelection}
            onClick={() => runLayerContextMenuAction(() => groupSelected(scene, controller, configData))}
          />
          <ContextMenuButton
            label="解组"
            disabled={!canUngroupSelection}
            onClick={() => runLayerContextMenuAction(() => ungroupSelected(scene, controller))}
          />
        </div>
      ) : null}
    </div>
  );
}

export function SketchPropertyPanel({ scene, controller, configData = {}, className }: SketchPropertyPanelProps) {
  const imageReplacementInputRef = React.useRef<HTMLInputElement>(null);
  const continuousHistoryKeyRef = React.useRef<string | null>(null);
  const [pathSimplifyTolerance, setPathSimplifyTolerance] = React.useState(2);
  const [recentColors, setRecentColors] = React.useState<string[]>([]);
  const [sizeRatioLocked, setSizeRatioLocked] = React.useState(false);
  const [exportScale, setExportScale] = React.useState(1);
  const [exportWithBackground, setExportWithBackground] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);
  const beginContinuousHistory = React.useCallback((key: string) => {
    if (continuousHistoryKeyRef.current === key) return;
    controller.recordHistoryCheckpoint(scene);
    continuousHistoryKeyRef.current = key;
  }, [controller, scene]);
  const endContinuousHistory = React.useCallback(() => {
    continuousHistoryKeyRef.current = null;
  }, []);
  const applyContinuousSelectedPatch = React.useCallback((key: string, patch: Partial<SketchSceneNode>) => {
    beginContinuousHistory(key);
    applySelectedPatch(scene, controller, patch, false);
  }, [beginContinuousHistory, controller, scene]);
  const commitColor = React.useCallback((value: string, applyColor: (nextValue: string) => void) => {
    const normalized = normalizeSketchHexColor(value);
    if (!normalized) return;
    setRecentColors((colors) => addRecentSketchColor(colors, normalized));
    applyColor(normalized);
  }, []);
  const selectedNodes = getSelectedNodes(scene, controller);
  const selectedHistoryKey = selectedNodes.map((node) => node.id).join("|") || "none";
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const imageResourceStatus = selectedNode?.type === "image" ? getImageResourceStatus(selectedNode) : null;
  const layerEditableSelectedNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  const canGroupSelection = getGroupableSelectedNodes(scene, controller, configData).length >= 2;
  const canUngroupSelection = getSelectedGroupNodes(scene, controller).length > 0;
  const exportOptions = { scale: exportScale, withBackground: exportWithBackground };

  if (selectedNodes.length > 1) {
    const editableNodes = selectedNodes.filter((node) => canEditNodeProperties(node) && isNodeVisibleForConfig(node, configData));
    const canBatchFill = editableNodes.length > 0 && editableNodes.every(supportsFillStyle);
    const canBatchStroke = editableNodes.length > 0 && editableNodes.every(supportsStrokeStyle);
    const canBatchRadius = editableNodes.length > 0 && editableNodes.every(supportsRadiusStyle);
    const canBatchText = editableNodes.length > 0 && editableNodes.every(supportsTextStyle);
    const canBatchArrow = editableNodes.length > 0 && editableNodes.every((node) => node.type === "arrow");
    const canBatchImageFit = editableNodes.length > 0 && editableNodes.every((node) => node.type === "image");
    const fill = getMixedStyleValue(editableNodes, "fill");
    const stroke = getMixedStyleValue(editableNodes, "stroke");
    const color = getMixedStyleValue(editableNodes, "color");
    const strokeWidth = getMixedStyleValue(editableNodes, "strokeWidth");
    const opacity = getMixedStyleValue(editableNodes, "opacity");
    const radius = getMixedStyleValue(editableNodes, "radius");
    const lineDash = getMixedStyleValue(editableNodes, "lineDash");
    const startArrow = getMixedStyleValue(editableNodes, "startArrow");
    const endArrow = getMixedStyleValue(editableNodes, "endArrow");
    const fontSize = getMixedStyleValue(editableNodes, "fontSize");
    const fontWeight = getMixedStyleValue(editableNodes, "fontWeight");
    const textAlign = getMixedStyleValue(editableNodes, "textAlign");
    const imageFit = getMixedStyleValue(editableNodes, "imageFit");
    const hasBatchControls = canBatchFill || canBatchStroke || canBatchRadius || canBatchText || canBatchArrow || canBatchImageFit || editableNodes.length > 0;

    return (
      <div className={cn("flex h-full min-h-0 flex-col bg-card", className)} onPointerDownCapture={() => activateSketchKeyboardScope(controller)}>
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold">Design</h2>
            <p className="truncate text-sm font-semibold text-foreground">{selectedNodes.length} 个对象</p>
          </div>
          <BadgeLike>多选</BadgeLike>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div>
            <SketchArrangeSection
              scene={scene}
              controller={controller}
              configData={configData}
              layerEditableSelectedNodes={layerEditableSelectedNodes}
              canGroupSelection={canGroupSelection}
              canUngroupSelection={canUngroupSelection}
            />
            <PropertySection
              title="多选样式"
              actions={
                <PropertyActionButton
                  label="重置样式"
                  disabled={!editableNodes.length}
                  onClick={() => resetNodesStyleKeys(controller, editableNodes, [
                    "fill",
                    "stroke",
                    "strokeWidth",
                    "opacity",
                    "radius",
                    "lineDash",
                    "color",
                    "fontSize",
                    "fontWeight",
                    "textAlign",
                    "startArrow",
                    "endArrow",
                    "imageFit",
                  ])}
                />
              }
            >
              {editableNodes.length !== selectedNodes.length ? (
                <p className="text-xs leading-5 text-muted-foreground">已跳过锁定、分组或运行时不可见对象。</p>
              ) : null}
              {!hasBatchControls ? (
                <p className="text-xs leading-5 text-muted-foreground">当前选择没有可共同编辑的样式字段。</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {canBatchFill ? (
                    <ColorField
                      label="填充"
                      value={toColorInputValue(fill.value, "#ffffff")}
                      mixed={fill.mixed}
                      recentColors={recentColors}
                      continuousHistoryKey={`${selectedHistoryKey}:batch-fill`}
                      onContinuousStart={beginContinuousHistory}
                      onContinuousEnd={endContinuousHistory}
                      onChange={(value, recordHistory = true) => commitColor(value, (nextValue) => updateNodesStyle(controller, editableNodes, { fill: nextValue }, recordHistory))}
                    />
                  ) : null}
                  {canBatchStroke ? (
                    <>
                      <ColorField
                        label="描边"
                        value={toColorInputValue(stroke.value, "#1F2937")}
                        mixed={stroke.mixed}
                        recentColors={recentColors}
                        continuousHistoryKey={`${selectedHistoryKey}:batch-stroke`}
                        onContinuousStart={beginContinuousHistory}
                        onContinuousEnd={endContinuousHistory}
                        onChange={(value, recordHistory = true) => commitColor(value, (nextValue) => updateNodesStyle(controller, editableNodes, { stroke: nextValue }, recordHistory))}
                      />
                      <NumberField
                        label="线宽"
                        value={typeof strokeWidth.value === "number" ? strokeWidth.value : 1}
                        min={0}
                        mixed={strokeWidth.mixed}
                        continuousHistoryKey={`${selectedHistoryKey}:batch-strokeWidth`}
                        onContinuousStart={beginContinuousHistory}
                        onContinuousEnd={endContinuousHistory}
                        onChange={(value, recordHistory = true) => updateNodesStyle(controller, editableNodes, { strokeWidth: value }, recordHistory)}
                      />
                      <SelectField
                        label="线型"
                        value={getLineDashPreset(Array.isArray(lineDash.value) ? lineDash.value : undefined)}
                        mixed={lineDash.mixed}
                        options={[
                          { value: "solid", label: "实线" },
                          { value: "dashed", label: "虚线" },
                          { value: "dotted", label: "点线" },
                        ]}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { lineDash: lineDashFromPreset(value) })}
                      />
                    </>
                  ) : null}
                  <NumberField
                    label="透明"
                    value={typeof opacity.value === "number" ? opacity.value : 1}
                    min={0}
                    max={1}
                    step={0.1}
                    integer={false}
                    mixed={opacity.mixed}
                    disabled={!editableNodes.length}
                    continuousHistoryKey={`${selectedHistoryKey}:batch-opacity`}
                    onContinuousStart={beginContinuousHistory}
                    onContinuousEnd={endContinuousHistory}
                    onChange={(value, recordHistory = true) => updateNodesStyle(controller, editableNodes, { opacity: value }, recordHistory)}
                  />
                  {canBatchRadius ? (
                    <NumberField
                      label="圆角"
                      value={typeof radius.value === "number" ? radius.value : 0}
                      min={0}
                      mixed={radius.mixed}
                      continuousHistoryKey={`${selectedHistoryKey}:batch-radius`}
                      onContinuousStart={beginContinuousHistory}
                      onContinuousEnd={endContinuousHistory}
                      onChange={(value, recordHistory = true) => updateNodesStyle(controller, editableNodes, { radius: value }, recordHistory)}
                    />
                  ) : null}
                  {canBatchText ? (
                    <>
                      <ColorField
                        label="文字颜色"
                        value={toColorInputValue(color.value, "#111827")}
                        mixed={color.mixed}
                        recentColors={recentColors}
                        continuousHistoryKey={`${selectedHistoryKey}:batch-color`}
                        onContinuousStart={beginContinuousHistory}
                        onContinuousEnd={endContinuousHistory}
                        onChange={(value, recordHistory = true) => commitColor(value, (nextValue) => updateNodesStyle(controller, editableNodes, { color: nextValue }, recordHistory))}
                      />
                      <NumberField
                        label="字号"
                        value={typeof fontSize.value === "number" ? fontSize.value : 16}
                        min={1}
                        mixed={fontSize.mixed}
                        continuousHistoryKey={`${selectedHistoryKey}:batch-fontSize`}
                        onContinuousStart={beginContinuousHistory}
                        onContinuousEnd={endContinuousHistory}
                        onChange={(value, recordHistory = true) => updateNodesStyle(controller, editableNodes, { fontSize: value }, recordHistory)}
                      />
                      <SelectField
                        label="字重"
                        value={String(typeof fontWeight.value === "number" ? fontWeight.value : 400)}
                        mixed={fontWeight.mixed}
                        options={[
                          { value: "400", label: "常规" },
                          { value: "500", label: "中等" },
                          { value: "700", label: "加粗" },
                        ]}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { fontWeight: Number(value) })}
                      />
                      <SelectField
                        label="对齐"
                        value={typeof textAlign.value === "string" ? textAlign.value : "left"}
                        mixed={textAlign.mixed}
                        options={[
                          { value: "left", label: "左对齐" },
                          { value: "center", label: "居中" },
                          { value: "right", label: "右对齐" },
                        ]}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { textAlign: value as NonNullable<NonNullable<SketchSceneNode["style"]>["textAlign"]> })}
                      />
                    </>
                  ) : null}
                  {canBatchArrow ? (
                    <>
                      <SelectField
                        label="起点箭头"
                        value={typeof startArrow.value === "string" ? startArrow.value : "none"}
                        mixed={startArrow.mixed}
                        options={[
                          { value: "none", label: "无" },
                          { value: "arrow", label: "箭头" },
                        ]}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { startArrow: value as "none" | "arrow" })}
                      />
                      <SelectField
                        label="终点箭头"
                        value={typeof endArrow.value === "string" ? endArrow.value : "arrow"}
                        mixed={endArrow.mixed}
                        options={[
                          { value: "arrow", label: "箭头" },
                          { value: "none", label: "无" },
                        ]}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { endArrow: value as "none" | "arrow" })}
                      />
                    </>
                  ) : null}
                  {canBatchImageFit ? (
                    <SelectField
                      label="适配"
                      value={typeof imageFit.value === "string" ? imageFit.value : "cover"}
                      mixed={imageFit.mixed}
                      options={[
                        { value: "cover", label: "裁切填满" },
                        { value: "contain", label: "完整显示" },
                        { value: "fill", label: "拉伸填满" },
                      ]}
                      onChange={(value) => updateNodesStyle(controller, editableNodes, { imageFit: value as NonNullable<NonNullable<SketchSceneNode["style"]>["imageFit"]> })}
                    />
                  ) : null}
                </div>
              )}
            </PropertySection>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedNode) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col bg-card", className)} onPointerDownCapture={() => activateSketchKeyboardScope(controller)}>
        <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
          <h2 className="text-[13px] font-semibold">Design</h2>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <MousePointer2 className="mb-4 h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium">选择一个对象</div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            右侧会显示图层、位置、尺寸、旋转和样式属性。
          </p>
        </div>
      </div>
    );
  }

  const propertyReadOnly = !canEditNodeProperties(selectedNode) || !isNodeVisibleForConfig(selectedNode, configData);
  const stateControlDisabled = selectedNode.type === "group" || isNodeHiddenByRuntimeConfig(selectedNode, configData);
  const contentControl = getContentControl(selectedNode);
  const primaryColorControl = getPrimaryColorControl(selectedNode);
  const style = selectedNode.style ?? {};
  const activeTextRange = supportsTextStyle(selectedNode) ? getActiveInlineTextRange(controller, selectedNode) : null;
  const textRunStyle = supportsTextStyle(selectedNode) ? getTextStyleRunStyleForRange(selectedNode, activeTextRange) : {};
  const lineLike = isLineLikeNode(selectedNode);
  const lineEndX = selectedNode.x + selectedNode.width;
  const lineEndY = selectedNode.y + selectedNode.height;
  const pathPointCount = selectedNode.type === "path" ? selectedNode.points?.length ?? 0 : 0;
  const canSimplifyPath = selectedNode.type === "path" && pathPointCount > 2 && !propertyReadOnly;
  const canLockSizeRatio = selectedNode.width > 0 && selectedNode.height > 0;
  const applySizePatch = (dimension: "width" | "height", value: number, recordHistory = true) => {
    if (propertyReadOnly) return;
    if (!sizeRatioLocked || !canLockSizeRatio) {
      applySelectedPatch(scene, controller, { [dimension]: value }, recordHistory);
      return;
    }
    if (dimension === "width") {
      applySelectedPatch(scene, controller, { width: value, height: value * (selectedNode.height / selectedNode.width) }, recordHistory);
      return;
    }
    applySelectedPatch(scene, controller, { height: value, width: value * (selectedNode.width / selectedNode.height) }, recordHistory);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)} onPointerDownCapture={() => activateSketchKeyboardScope(controller)}>
      <div className="sticky top-0 z-10 flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-input text-muted-foreground">
            {selectedNode.type === "text" ? <Type className="h-4 w-4" /> : selectedNode.type === "image" ? <ImageIcon className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold">Design</h2>
            <p className="truncate text-sm font-semibold text-foreground">{getNodeDisplayName(selectedNode)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <BadgeLike>{NODE_TYPE_LABELS[selectedNode.type]}</BadgeLike>
              {selectedNode.locked ? <BadgeLike>锁定</BadgeLike> : null}
              {selectedNode.visible === false ? <BadgeLike>隐藏</BadgeLike> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            disabled={stateControlDisabled || selectedNode.visible === false}
            onClick={() => {
              if (stateControlDisabled || selectedNode.visible === false) return;
              controller.applyOperations([{ op: "set-locked", nodeIds: [selectedNode.id], locked: !selectedNode.locked }]);
            }}
            aria-label={selectedNode.locked ? "快捷解锁" : "快捷锁定"}
            title={selectedNode.locked ? "解锁" : "锁定"}
          >
            {selectedNode.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            disabled={stateControlDisabled}
            onClick={() => {
              if (stateControlDisabled) return;
              controller.applyOperations([{ op: "set-visible", nodeIds: [selectedNode.id], visible: selectedNode.visible === false }]);
            }}
            aria-label={selectedNode.visible === false ? "显示" : "隐藏"}
            title={selectedNode.visible === false ? "显示" : "隐藏"}
          >
            {selectedNode.visible === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          <PropertySection title="通用">
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>名称</span>
              <input
                className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                value={selectedNode.name ?? ""}
                disabled={propertyReadOnly}
                onBlur={endContinuousHistory}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  endContinuousHistory();
                  event.currentTarget.blur();
                }}
                onChange={(event) => {
                  if (propertyReadOnly) return;
                  applyContinuousSelectedPatch(`${selectedHistoryKey}:name`, { name: event.target.value });
                }}
                placeholder={getNodeDisplayName(selectedNode)}
                aria-label="名称"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={cn("flex h-9 items-center gap-2 rounded-md bg-input px-2 text-xs text-muted-foreground", stateControlDisabled && "opacity-60")}>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(selectedNode.locked)}
                  disabled={stateControlDisabled || selectedNode.visible === false}
                  onChange={(event) => {
                    if (stateControlDisabled || selectedNode.visible === false) return;
                    controller.applyOperations([{ op: "set-locked", nodeIds: [selectedNode.id], locked: event.target.checked }]);
                  }}
                  aria-label="锁定"
                />
                <span>锁定</span>
              </label>
              <label className={cn("flex h-9 items-center gap-2 rounded-md bg-input px-2 text-xs text-muted-foreground", stateControlDisabled && "opacity-60")}>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selectedNode.visible !== false}
                  disabled={stateControlDisabled}
                  onChange={(event) => {
                    if (stateControlDisabled) return;
                    controller.applyOperations([{ op: "set-visible", nodeIds: [selectedNode.id], visible: event.target.checked }]);
                  }}
                  aria-label="可见"
                />
                <span>可见</span>
              </label>
            </div>
          </PropertySection>
          {contentControl ? (
            <PropertySection title="Content">
              <input
                className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                value={contentControl.value}
                disabled={propertyReadOnly}
                onBlur={endContinuousHistory}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  endContinuousHistory();
                  event.currentTarget.blur();
                }}
                onChange={(event) => {
                  if (propertyReadOnly) return;
                  applyContinuousSelectedPatch(`${selectedHistoryKey}:content`, contentControl.toPatch(event.target.value));
                }}
                placeholder={contentControl.placeholder}
                aria-label={contentControl.label}
              />
              {selectedNode.type === "image" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                    disabled={propertyReadOnly}
                    onClick={() => imageReplacementInputRef.current?.click()}
                  >
                    替换图片
                  </button>
                  <input
                    ref={imageReplacementInputRef}
                    type="file"
                    accept="image/*"
                    aria-label="替换图片文件"
                    className="hidden"
                    disabled={propertyReadOnly}
                    onChange={(event) => {
                      const file = firstImageFile(event.target.files);
                      event.currentTarget.value = "";
                      if (!file || propertyReadOnly) return;
                      void readImageFileAsDataUrl(file).then((src) => {
                        if (!src) return;
                        controller.applyOperations([
                          {
                            op: "update",
                            nodeId: selectedNode.id,
                            patch: { src, alt: file.name || selectedNode.alt || "导入图片" },
                          },
                        ]);
                      });
                    }}
                  />
                </div>
              ) : null}
            </PropertySection>
          ) : null}
          <SketchArrangeSection
            scene={scene}
            controller={controller}
            configData={configData}
            layerEditableSelectedNodes={layerEditableSelectedNodes}
            canGroupSelection={canGroupSelection}
            canUngroupSelection={canUngroupSelection}
            defaultOpen={false}
          />
          <PropertySection title="Position">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="X" value={selectedNode.x} disabled={propertyReadOnly} continuousHistoryKey={`${selectedHistoryKey}:x`} onContinuousStart={beginContinuousHistory} onContinuousEnd={endContinuousHistory} onChange={(value, recordHistory = true) => {
                if (propertyReadOnly) return;
                applySelectedPatch(scene, controller, { x: value }, recordHistory);
              }} />
              <NumberField label="Y" value={selectedNode.y} disabled={propertyReadOnly} continuousHistoryKey={`${selectedHistoryKey}:y`} onContinuousStart={beginContinuousHistory} onContinuousEnd={endContinuousHistory} onChange={(value, recordHistory = true) => {
                if (propertyReadOnly) return;
                applySelectedPatch(scene, controller, { y: value }, recordHistory);
              }} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2">
              <NumberField label="W" value={selectedNode.width} disabled={propertyReadOnly} continuousHistoryKey={`${selectedHistoryKey}:width`} onContinuousStart={beginContinuousHistory} onContinuousEnd={endContinuousHistory} onChange={(value, recordHistory = true) => applySizePatch("width", value, recordHistory)} />
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
                  sizeRatioLocked && canLockSizeRatio && "bg-background text-foreground",
                )}
                disabled={propertyReadOnly || !canLockSizeRatio}
                aria-label={sizeRatioLocked ? "关闭尺寸比例锁定" : "开启尺寸比例锁定"}
                title={sizeRatioLocked ? "关闭尺寸比例锁定" : "开启尺寸比例锁定"}
                onClick={() => setSizeRatioLocked((locked) => !locked)}
              >
                <Link2 className="h-3.5 w-3.5" />
              </button>
              <NumberField label="H" value={selectedNode.height} disabled={propertyReadOnly} continuousHistoryKey={`${selectedHistoryKey}:height`} onContinuousStart={beginContinuousHistory} onContinuousEnd={endContinuousHistory} onChange={(value, recordHistory = true) => applySizePatch("height", value, recordHistory)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="旋转"
                value={selectedNode.rotation ?? 0}
                disabled={propertyReadOnly}
                continuousHistoryKey={`${selectedHistoryKey}:rotation`}
                onContinuousStart={beginContinuousHistory}
                onContinuousEnd={endContinuousHistory}
                onChange={(value, recordHistory = true) => {
                  if (propertyReadOnly) return;
                  applySelectedPatch(scene, controller, { rotation: rotateSketchNode(selectedNode, value).rotation }, recordHistory);
                }}
              />
            </div>
          </PropertySection>
          {lineLike ? (
            <PropertySection title="Line/Connector">
              <div className="grid gap-1 rounded-md bg-input px-3 py-2 text-xs text-muted-foreground">
                <div>起点绑定：{selectedNode.connections?.start ? `${selectedNode.connections.start.nodeId} / ${selectedNode.connections.start.anchor}` : "未绑定"}</div>
                <div>终点绑定：{selectedNode.connections?.end ? `${selectedNode.connections.end.nodeId} / ${selectedNode.connections.end.anchor}` : "未绑定"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="起点 X"
                  value={selectedNode.x}
                  disabled={propertyReadOnly}
                  continuousHistoryKey={`${selectedHistoryKey}:line-start-x`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { x: value, width: lineEndX - value, ...patchConnectorEndpointBinding(selectedNode, "start", null) }, recordHistory);
                  }}
                />
                <NumberField
                  label="起点 Y"
                  value={selectedNode.y}
                  disabled={propertyReadOnly}
                  continuousHistoryKey={`${selectedHistoryKey}:line-start-y`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { y: value, height: lineEndY - value, ...patchConnectorEndpointBinding(selectedNode, "start", null) }, recordHistory);
                  }}
                />
                <NumberField
                  label="终点 X"
                  value={lineEndX}
                  disabled={propertyReadOnly}
                  continuousHistoryKey={`${selectedHistoryKey}:line-end-x`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { width: value - selectedNode.x, ...patchConnectorEndpointBinding(selectedNode, "end", null) }, recordHistory);
                  }}
                />
                <NumberField
                  label="终点 Y"
                  value={lineEndY}
                  disabled={propertyReadOnly}
                  continuousHistoryKey={`${selectedHistoryKey}:line-end-y`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { height: value - selectedNode.y, ...patchConnectorEndpointBinding(selectedNode, "end", null) }, recordHistory);
                  }}
                />
              </div>
            </PropertySection>
          ) : null}
          {selectedNode.type === "path" ? (
            <PropertySection title="路径">
              <div className="rounded-md bg-input px-3 py-2 text-xs text-muted-foreground">
                路径点数：{selectedNode.points ? pathPointCount : "未记录"}
              </div>
              <NumberField
                label="简化强度"
                value={pathSimplifyTolerance}
                min={0}
                max={50}
                step={0.5}
                integer={false}
                disabled={!canSimplifyPath}
                onChange={setPathSimplifyTolerance}
              />
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                disabled={!canSimplifyPath}
                aria-label="简化路径"
                onClick={() => {
                  if (!canSimplifyPath) return;
                  const patch = createSimplifiedPathPatch(selectedNode, pathSimplifyTolerance);
                  if (!patch) return;
                  applySelectedPatch(scene, controller, patch);
                }}
              >
                应用简化
              </button>
            </PropertySection>
          ) : null}
          {primaryColorControl ? (
            <PropertySection
              title="Appearance"
              actions={
                <PropertyActionButton
                  label="重置外观"
                  disabled={propertyReadOnly}
                  onClick={() => resetSelectedStyleKeys(scene, controller, [
                    "fill",
                    "stroke",
                    "strokeWidth",
                    "opacity",
                    "radius",
                    "lineDash",
                    "startArrow",
                    "endArrow",
                  ])}
                />
              }
            >
              <div className="grid grid-cols-2 gap-2">
                {supportsFillStyle(selectedNode) ? (
                  <ColorField
                    label="填充"
                    value={toColorInputValue(style.fill, "#ffffff")}
                    disabled={propertyReadOnly}
                    recentColors={recentColors}
                    continuousHistoryKey={`${selectedHistoryKey}:fill`}
                    onContinuousStart={beginContinuousHistory}
                    onContinuousEnd={endContinuousHistory}
                    onChange={(value, recordHistory = true) => commitColor(value, (nextValue) => updateSelectedStyle(scene, controller, { fill: nextValue }, recordHistory))}
                    onReset={() => resetSelectedStyleKeys(scene, controller, ["fill"])}
                  />
                ) : null}
                {supportsStrokeStyle(selectedNode) ? (
                  <ColorField
                    label="描边"
                    value={toColorInputValue(style.stroke, "#1F2937")}
                    disabled={propertyReadOnly}
                    recentColors={recentColors}
                    continuousHistoryKey={`${selectedHistoryKey}:stroke`}
                    onContinuousStart={beginContinuousHistory}
                    onContinuousEnd={endContinuousHistory}
                    onChange={(value, recordHistory = true) => commitColor(value, (nextValue) => updateSelectedStyle(scene, controller, { stroke: nextValue }, recordHistory))}
                    onReset={() => resetSelectedStyleKeys(scene, controller, ["stroke"])}
                  />
                ) : null}
                {supportsStrokeStyle(selectedNode) ? (
                  <NumberField
                    label="线宽"
                    value={style.strokeWidth ?? 1}
                    min={0}
                    disabled={propertyReadOnly}
                    continuousHistoryKey={`${selectedHistoryKey}:strokeWidth`}
                    onContinuousStart={beginContinuousHistory}
                    onContinuousEnd={endContinuousHistory}
                    onChange={(value, recordHistory = true) => updateSelectedStyle(scene, controller, { strokeWidth: value }, recordHistory)}
                    onReset={() => resetSelectedStyleKeys(scene, controller, ["strokeWidth"])}
                  />
                ) : null}
                <NumberField
                  label="透明"
                  value={style.opacity ?? 1}
                  min={0}
                  max={1}
                  step={0.1}
                  integer={false}
                  disabled={propertyReadOnly}
                  continuousHistoryKey={`${selectedHistoryKey}:opacity`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => updateSelectedStyle(scene, controller, { opacity: value }, recordHistory)}
                  onReset={() => resetSelectedStyleKeys(scene, controller, ["opacity"])}
                />
                {supportsRadiusStyle(selectedNode) ? (
                  <NumberField
                    label="圆角"
                    value={style.radius ?? 0}
                    min={0}
                    disabled={propertyReadOnly}
                    continuousHistoryKey={`${selectedHistoryKey}:radius`}
                    onContinuousStart={beginContinuousHistory}
                    onContinuousEnd={endContinuousHistory}
                    onChange={(value, recordHistory = true) => updateSelectedStyle(scene, controller, { radius: value }, recordHistory)}
                    onReset={() => resetSelectedStyleKeys(scene, controller, ["radius"])}
                  />
                ) : null}
                {supportsStrokeStyle(selectedNode) ? (
                  <SelectField
                    label="线型"
                    value={getLineDashPreset(style.lineDash)}
                    disabled={propertyReadOnly}
                    options={[
                      { value: "solid", label: "实线" },
                      { value: "dashed", label: "虚线" },
                      { value: "dotted", label: "点线" },
                    ]}
                    onChange={(value) => updateSelectedStyle(scene, controller, { lineDash: lineDashFromPreset(value) })}
                    onReset={() => resetSelectedStyleKeys(scene, controller, ["lineDash"])}
                  />
                ) : null}
                {selectedNode.type === "arrow" ? (
                  <>
                    <SelectField
                      label="起点箭头"
                      value={style.startArrow ?? "none"}
                      disabled={propertyReadOnly}
                      options={[
                        { value: "none", label: "无" },
                        { value: "arrow", label: "箭头" },
                      ]}
                      onChange={(value) => updateSelectedStyle(scene, controller, { startArrow: value as "none" | "arrow" })}
                      onReset={() => resetSelectedStyleKeys(scene, controller, ["startArrow"])}
                    />
                    <SelectField
                      label="终点箭头"
                      value={style.endArrow ?? "arrow"}
                      disabled={propertyReadOnly}
                      options={[
                        { value: "arrow", label: "箭头" },
                        { value: "none", label: "无" },
                      ]}
                      onChange={(value) => updateSelectedStyle(scene, controller, { endArrow: value as "none" | "arrow" })}
                      onReset={() => resetSelectedStyleKeys(scene, controller, ["endArrow"])}
                    />
                  </>
                ) : null}
              </div>
            </PropertySection>
          ) : null}
          {supportsTextStyle(selectedNode) ? (
            <PropertySection
              title="Text"
              actions={
                <PropertyActionButton
                  label="重置文字"
                  disabled={propertyReadOnly}
                  onClick={() => {
                    resetSelectedStyleKeys(scene, controller, ["color", "fontSize", "fontWeight", "textAlign"]);
                    resetSelectedTextStyleRunKeys(scene, controller, ["italic", "textDecoration", "lineHeight", "letterSpacing"]);
                  }}
                />
              }
            >
              <div className="grid grid-cols-2 gap-2">
                <ColorField
                  label="文字颜色"
                  value={toColorInputValue(style.color, "#111827")}
                  disabled={propertyReadOnly}
                  recentColors={recentColors}
                  continuousHistoryKey={`${selectedHistoryKey}:color`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => commitColor(value, (nextValue) => updateSelectedStyle(scene, controller, { color: nextValue }, recordHistory))}
                  onReset={() => resetSelectedStyleKeys(scene, controller, ["color"])}
                />
                <NumberField
                  label="字号"
                  value={style.fontSize ?? 16}
                  min={1}
                  disabled={propertyReadOnly}
                  continuousHistoryKey={`${selectedHistoryKey}:fontSize`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => updateSelectedStyle(scene, controller, { fontSize: value }, recordHistory)}
                  onReset={() => resetSelectedStyleKeys(scene, controller, ["fontSize"])}
                />
                <SelectField
                  label="字重"
                  value={String(style.fontWeight ?? 400)}
                  disabled={propertyReadOnly}
                  options={[
                    { value: "400", label: "常规" },
                    { value: "500", label: "中等" },
                    { value: "700", label: "加粗" },
                  ]}
                  onChange={(value) => updateSelectedStyle(scene, controller, { fontWeight: Number(value) })}
                  onReset={() => resetSelectedStyleKeys(scene, controller, ["fontWeight"])}
                />
                <SelectField
                  label="对齐"
                  value={style.textAlign ?? "left"}
                  disabled={propertyReadOnly}
                  options={[
                    { value: "left", label: "左对齐" },
                    { value: "center", label: "居中" },
                    { value: "right", label: "右对齐" },
                  ]}
                  onChange={(value) => updateSelectedStyle(scene, controller, { textAlign: value as NonNullable<NonNullable<SketchSceneNode["style"]>["textAlign"]> })}
                  onReset={() => resetSelectedStyleKeys(scene, controller, ["textAlign"])}
                />
                <SelectField
                  label="斜体"
                  value={textRunStyle.italic ? "true" : "false"}
                  disabled={propertyReadOnly || !(selectedNode.text ?? "").length}
                  options={[
                    { value: "false", label: "否" },
                    { value: "true", label: "是" },
                  ]}
                  onChange={(value) => updateSelectedTextStyleRun(scene, controller, { italic: value === "true" })}
                  onReset={() => resetSelectedTextStyleRunKeys(scene, controller, ["italic"])}
                />
                <SelectField
                  label="装饰"
                  value={textRunStyle.textDecoration ?? "none"}
                  disabled={propertyReadOnly || !(selectedNode.text ?? "").length}
                  options={[
                    { value: "none", label: "无" },
                    { value: "underline", label: "下划线" },
                    { value: "line-through", label: "删除线" },
                  ]}
                  onChange={(value) => updateSelectedTextStyleRun(scene, controller, { textDecoration: value as NonNullable<SketchSceneTextStyleOverride["textDecoration"]> })}
                  onReset={() => resetSelectedTextStyleRunKeys(scene, controller, ["textDecoration"])}
                />
                <NumberField
                  label="行高"
                  value={textRunStyle.lineHeight ?? style.fontSize ?? 18}
                  min={1}
                  disabled={propertyReadOnly || !(selectedNode.text ?? "").length}
                  continuousHistoryKey={`${selectedHistoryKey}:lineHeight`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => updateSelectedTextStyleRun(scene, controller, { lineHeight: value }, recordHistory)}
                  onReset={() => resetSelectedTextStyleRunKeys(scene, controller, ["lineHeight"])}
                />
                <NumberField
                  label="字距"
                  value={textRunStyle.letterSpacing ?? 0}
                  step={0.1}
                  integer={false}
                  disabled={propertyReadOnly || !(selectedNode.text ?? "").length}
                  continuousHistoryKey={`${selectedHistoryKey}:letterSpacing`}
                  onContinuousStart={beginContinuousHistory}
                  onContinuousEnd={endContinuousHistory}
                  onChange={(value, recordHistory = true) => updateSelectedTextStyleRun(scene, controller, { letterSpacing: value }, recordHistory)}
                  onReset={() => resetSelectedTextStyleRunKeys(scene, controller, ["letterSpacing"])}
                />
              </div>
            </PropertySection>
          ) : null}
          {selectedNode.type === "image" ? (
            <PropertySection
              title="Image"
              actions={
                <PropertyActionButton
                  label="重置裁剪/适配"
                  disabled={propertyReadOnly}
                  onClick={() => resetSelectedStyleKeys(scene, controller, ["imageFit"])}
                />
              }
            >
              <label className="grid gap-1 text-xs text-muted-foreground">
                <span>Alt 文本</span>
                <input
                  className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                  value={selectedNode.alt ?? ""}
                  disabled={propertyReadOnly}
                  onBlur={endContinuousHistory}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    endContinuousHistory();
                    event.currentTarget.blur();
                  }}
                  onChange={(event) => {
                    if (propertyReadOnly) return;
                    applyContinuousSelectedPatch(`${selectedHistoryKey}:alt`, { alt: event.target.value });
                  }}
                  placeholder="图片说明"
                  aria-label="Alt 文本"
                />
              </label>
              <div className="grid gap-1 rounded-md bg-input px-3 py-2 text-xs text-muted-foreground">
                <div>图片来源：{imageResourceStatus?.sourceLabel ?? "未知"}</div>
                <div>资源大小：{imageResourceStatus?.sizeLabel ?? "未知"}</div>
                {imageResourceStatus?.overLimit ? (
                  <div className="font-medium text-destructive">资源超过 2 MB，建议压缩后使用</div>
                ) : null}
              </div>
              <SelectField
                label="裁剪/适配"
                value={style.imageFit ?? "cover"}
                disabled={propertyReadOnly}
                options={[
                  { value: "cover", label: "裁切填满" },
                  { value: "contain", label: "完整显示" },
                  { value: "fill", label: "拉伸填满" },
                ]}
                onChange={(value) => updateSelectedStyle(scene, controller, { imageFit: value as NonNullable<NonNullable<SketchSceneNode["style"]>["imageFit"]> })}
              />
            </PropertySection>
          ) : null}
          {selectedNode.bindings ? (
            <PropertySection title="Bindings">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(selectedNode.bindings).map(([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={propertyReadOnly}
                    className="rounded-md bg-input px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                    onClick={() => {
                      if (propertyReadOnly) return;
                      controller.applyOperations([
                        {
                          op: "unbind",
                          nodeId: selectedNode.id,
                          property: key as keyof NonNullable<SketchSceneNode["bindings"]>,
                        },
                      ]);
                    }}
                  >
                    {key}: {String(value)} x
                  </button>
                ))}
              </div>
            </PropertySection>
          ) : null}
          <PropertySection title="Export" defaultOpen={false}>
            <div className="grid gap-2">
              <div className="rounded-md bg-input px-3 py-2 text-xs leading-5 text-muted-foreground">
                <div>选区尺寸：{Math.round(selectedNode.width)} x {Math.round(selectedNode.height)}</div>
                <div>PNG 输出：{Math.round(scene.pageSize.width * exportScale)} x {Math.round(scene.pageSize.height * exportScale)} px，{exportWithBackground ? "带白色背景" : "透明背景"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label="导出倍率"
                  value={String(exportScale)}
                  options={[
                    { value: "1", label: "1x" },
                    { value: "2", label: "2x" },
                    { value: "3", label: "3x" },
                  ]}
                  onChange={(value) => setExportScale(Number(value))}
                />
                <label className="flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={exportWithBackground}
                    onChange={(event) => setExportWithBackground(event.target.checked)}
                    aria-label="导出带背景"
                  />
                  带背景
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  void copySvgToClipboardOrDownload(createExportScene(scene, [selectedNode]), `${selectedNode.id || "selection"}.svg`, exportOptions).then((result) => {
                    setExportStatus(result === "copied" ? "已复制 SVG" : "剪贴板不可用，已下载 SVG");
                  });
                }}
              >
                复制 SVG
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  downloadTextFile(`${selectedNode.id || "selection"}.svg`, renderExportSvgMarkup(createExportScene(scene, [selectedNode]), exportOptions), "image/svg+xml;charset=utf-8");
                  setExportStatus("已下载选区 SVG");
                }}
              >
                导出选区
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  downloadTextFile("sketch-page.svg", renderExportSvgMarkup(scene, exportOptions), "image/svg+xml;charset=utf-8");
                  setExportStatus("已下载整页 SVG");
                }}
              >
                导出整页
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  void copyPngToClipboardOrDownload(createExportScene(scene, [selectedNode]), `${selectedNode.id || "selection"}@${exportScale}x.png`, exportOptions).then((result) => {
                    setExportStatus(result === "copied" ? "已复制 PNG" : "剪贴板不可用，已下载 PNG");
                  });
                }}
              >
                复制 PNG
              </button>
            </div>
            {exportStatus ? (
              <div className="rounded-md bg-input px-3 py-2 text-xs text-muted-foreground" role="status">
                {exportStatus}
              </div>
            ) : null}
          </PropertySection>
        </div>
      </div>
    </div>
  );
}

function SketchArrangeSection({
  scene,
  controller,
  configData,
  layerEditableSelectedNodes,
  canGroupSelection,
  canUngroupSelection,
  defaultOpen = true,
}: {
  scene: SketchSceneDocument;
  controller: SketchEditorController;
  configData?: Record<string, unknown>;
  layerEditableSelectedNodes: SketchSceneNode[];
  canGroupSelection: boolean;
  canUngroupSelection: boolean;
  defaultOpen?: boolean;
}) {
  const hasLayerEditableSelection = layerEditableSelectedNodes.length > 0;
  const canAlignSelection = layerEditableSelectedNodes.length >= 2;
  const canDistributeSelection = layerEditableSelectedNodes.length >= 3;
  return (
    <PropertySection title="Layout/Arrange" defaultOpen={defaultOpen}>
      <div className="grid grid-cols-2 gap-2">
        <PropertyCommandButton
          label="置顶"
          disabled={!hasLayerEditableSelection}
          disabledReason="当前选择不可排序"
          onClick={() => bringToFront(scene, controller, configData)}
        />
        <PropertyCommandButton
          label="置底"
          disabled={!hasLayerEditableSelection}
          disabledReason="当前选择不可排序"
          onClick={() => sendToBack(scene, controller, configData)}
        />
        <PropertyCommandButton
          label="上移一层"
          disabled={!hasLayerEditableSelection}
          disabledReason="当前选择不可排序"
          onClick={() => bringForward(scene, controller, configData)}
        />
        <PropertyCommandButton
          label="下移一层"
          disabled={!hasLayerEditableSelection}
          disabledReason="当前选择不可排序"
          onClick={() => sendBackward(scene, controller, configData)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PropertyCommandButton
          label="左对齐"
          disabled={!canAlignSelection}
          disabledReason="至少选择两个可编辑对象"
          onClick={() => alignSelected(scene, controller, "left", configData)}
        />
        <PropertyCommandButton
          label="顶对齐"
          disabled={!canAlignSelection}
          disabledReason="至少选择两个可编辑对象"
          onClick={() => alignSelected(scene, controller, "top", configData)}
        />
        <PropertyCommandButton
          label="水平分布"
          disabled={!canDistributeSelection}
          disabledReason="至少选择三个可编辑对象"
          onClick={() => distributeSelectedHorizontally(scene, controller, configData)}
        />
        <PropertyCommandButton
          label="垂直分布"
          disabled={!canDistributeSelection}
          disabledReason="至少选择三个可编辑对象"
          onClick={() => distributeSelectedVertically(scene, controller, configData)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PropertyCommandButton
          label="成组"
          disabled={!canGroupSelection}
          disabledReason="至少选择两个可成组对象"
          onClick={() => groupSelected(scene, controller, configData)}
        />
        <PropertyCommandButton
          label="解组"
          disabled={!canUngroupSelection}
          disabledReason="当前选择不是分组"
          onClick={() => ungroupSelected(scene, controller)}
        />
      </div>
    </PropertySection>
  );
}

function PropertySection({
  title,
  actions,
  defaultOpen = true,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-b border-border last:border-b-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {actions ? (
            <span className="flex items-center gap-1" onClick={(event) => event.preventDefault()}>
              {actions}
            </span>
          ) : null}
          <span className="text-[10px] font-medium text-muted-foreground group-open:hidden">展开</span>
          <span className="hidden text-[10px] font-medium text-muted-foreground group-open:inline">收起</span>
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function PropertyCommandButton({
  label,
  disabled = false,
  disabledReason,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-8 min-w-0 items-center justify-center rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-45"
      disabled={disabled}
      title={disabled ? disabledReason : label}
      aria-label={label}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

function PropertyActionButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-6 items-center rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}

function formatNumberFieldValue(value: number, integer: boolean, preserveFraction = false): string {
  if (integer && !preserveFraction && Number.isInteger(value)) return String(Math.round(value));
  return String(Number(value.toFixed(3)));
}

function parsePlainNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberFieldInput(value: string, currentValue: number): number | null {
  const trimmed = value.trim();
  const expressionMatch = trimmed.match(/^([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (expressionMatch) {
    const operand = Number(expressionMatch[2]);
    if (!Number.isFinite(operand)) return null;
    switch (expressionMatch[1]) {
      case "+":
        return currentValue + operand;
      case "-":
        return currentValue - operand;
      case "*":
        return currentValue * operand;
      case "/":
        return operand === 0 ? null : currentValue / operand;
    }
  }
  return parsePlainNumberInput(trimmed);
}

function getNumberFieldDisplayLabel(label: string): string {
  const compactLabels: Record<string, string> = {
    旋转: "R",
    字号: "T",
    字重: "W",
    行高: "LH",
    字距: "LS",
    线宽: "S",
    圆角: "Rd",
    透明度: "O",
  };
  return compactLabels[label] ?? label;
}

function NumberField({
  label,
  value,
  disabled = false,
  mixed = false,
  min,
  max,
  step = 1,
  integer = true,
  continuousHistoryKey,
  onContinuousStart,
  onContinuousEnd,
  onReset,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  mixed?: boolean;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  continuousHistoryKey?: string;
  onContinuousStart?: (key: string) => void;
  onContinuousEnd?: () => void;
  onReset?: () => void;
  onChange: (value: number, recordHistory?: boolean) => void;
}) {
  const displayValue = formatNumberFieldValue(value, integer);
  const displayLabel = getNumberFieldDisplayLabel(label);
  const [draftValue, setDraftValue] = React.useState(displayValue);
  const editingRef = React.useRef(false);
  const continuousActiveRef = React.useRef(false);
  const scrubberStartRef = React.useRef<{ x: number; value: number } | null>(null);

  React.useEffect(() => {
    if (!editingRef.current && !continuousActiveRef.current) setDraftValue(displayValue);
  }, [displayValue]);

  const endContinuousInput = () => {
    if (!continuousActiveRef.current) return;
    continuousActiveRef.current = false;
    onContinuousEnd?.();
  };
  const commitValue = (nextValue: number, options: { recordHistory?: boolean; preserveFraction?: boolean } = {}) => {
    const nextWithMin = typeof min === "number" ? Math.max(min, nextValue) : nextValue;
    const nextWithBounds = typeof max === "number" ? Math.min(max, nextWithMin) : nextWithMin;
    const normalized = integer && !options.preserveFraction ? Math.round(nextWithBounds) : Number(nextWithBounds.toFixed(3));
    if (normalized === value) return;
    if (options.recordHistory === false && continuousHistoryKey && onContinuousStart) {
      if (!continuousActiveRef.current) {
        continuousActiveRef.current = true;
        onContinuousStart(continuousHistoryKey);
      }
      onChange(normalized, false);
      return;
    }
    onChange(normalized);
  };
  const finishDraftInput = () => {
    const parsedValue = parseNumberFieldInput(draftValue, value);
    if (parsedValue !== null) commitValue(parsedValue, { recordHistory: continuousActiveRef.current ? false : undefined });
    editingRef.current = false;
    endContinuousInput();
    setDraftValue(formatNumberFieldValue(parsedValue ?? value, integer));
  };
  const adjustValue = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const direction = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
    if (!direction) return false;
    const delta = event.altKey ? 0.1 : event.shiftKey ? 10 : step;
    const preserveFraction = event.altKey || !integer;
    event.preventDefault();
    const nextValue = value + direction * delta;
    commitValue(nextValue, { recordHistory: false, preserveFraction });
    setDraftValue(formatNumberFieldValue(nextValue, integer, preserveFraction));
    return true;
  };
  const updateScrubberValue = (clientX: number, shiftKey: boolean) => {
    const start = scrubberStartRef.current;
    if (!start) return;
    const multiplier = shiftKey ? 10 : 1;
    const delta = ((clientX - start.x) / 4) * step * multiplier;
    const preserveFraction = !integer || step < 1;
    const nextValue = start.value + delta;
    commitValue(nextValue, { recordHistory: false, preserveFraction });
    setDraftValue(formatNumberFieldValue(nextValue, integer, preserveFraction));
  };
  const startPointerScrubber = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled) return;
    if (scrubberStartRef.current) return;
    event.preventDefault();
    editingRef.current = false;
    scrubberStartRef.current = { x: event.clientX, value };
    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateScrubberValue(moveEvent.clientX, moveEvent.shiftKey);
    };
    const handlePointerUp = () => {
      scrubberStartRef.current = null;
      endContinuousInput();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };
  const startMouseScrubber = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (disabled) return;
    if (scrubberStartRef.current) return;
    event.preventDefault();
    editingRef.current = false;
    scrubberStartRef.current = { x: event.clientX, value };
    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateScrubberValue(moveEvent.clientX, moveEvent.shiftKey);
    };
    const handleMouseUp = () => {
      scrubberStartRef.current = null;
      endContinuousInput();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };
  return (
    <label className={cn("flex h-8 items-center gap-1.5 rounded-md bg-input px-1.5 text-xs text-muted-foreground", disabled && "opacity-60")}>
      <span
        className="flex h-6 w-7 shrink-0 cursor-ew-resize select-none items-center justify-center rounded text-[10px] font-semibold tracking-normal hover:bg-background hover:text-foreground"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label}拖拽调整`}
        title={`${label}：左右拖拽调整数值，支持方向键和表达式`}
        onPointerDown={startPointerScrubber}
        onMouseDown={startMouseScrubber}
      >
        {displayLabel}
      </span>
      {mixed ? <span className="shrink-0 rounded bg-background px-1 text-[10px] text-muted-foreground">混合</span> : null}
      <input
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none"
        type="text"
        role="spinbutton"
        inputMode="decimal"
        disabled={disabled}
        value={draftValue}
        onChange={(event) => {
          editingRef.current = true;
          const nextDraftValue = event.target.value;
          setDraftValue(nextDraftValue);
          const plainValue = parsePlainNumberInput(nextDraftValue);
          if (plainValue === null) return;
          commitValue(plainValue, { recordHistory: false });
        }}
        onFocus={() => {
          editingRef.current = true;
        }}
        onBlur={finishDraftInput}
        onKeyDown={(event) => {
          if (adjustValue(event)) return;
          if (event.key !== "Enter") return;
          finishDraftInput();
          event.currentTarget.blur();
        }}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      {onReset ? (
        <button
          type="button"
          className="shrink-0 rounded px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
          disabled={disabled}
          aria-label="重置字段为默认值"
          title={`重置${label}`}
          data-sketch-reset-field={label}
          onClick={(event) => {
            event.preventDefault();
            onReset();
          }}
        >
          重置
        </button>
      ) : null}
    </label>
  );
}

function ColorField({
  label,
  value,
  disabled = false,
  mixed = false,
  recentColors = [],
  continuousHistoryKey,
  onContinuousStart,
  onContinuousEnd,
  onReset,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  mixed?: boolean;
  recentColors?: string[];
  continuousHistoryKey?: string;
  onContinuousStart?: (key: string) => void;
  onContinuousEnd?: () => void;
  onReset?: () => void;
  onChange: (value: string, recordHistory?: boolean) => void;
}) {
  const normalizedValue = toColorInputValue(value, "#000000");
  const continuousActiveRef = React.useRef(false);
  const endContinuousInput = () => {
    if (!continuousActiveRef.current) return;
    continuousActiveRef.current = false;
    onContinuousEnd?.();
  };
  const updateColor = (nextValue: string, recordHistory = true) => {
    const normalized = normalizeSketchHexColor(nextValue);
    if (!normalized) return;
    if (normalized === normalizedValue.toLowerCase()) return;
    if (!recordHistory && continuousHistoryKey && onContinuousStart) {
      if (!continuousActiveRef.current) {
        continuousActiveRef.current = true;
        onContinuousStart(continuousHistoryKey);
      }
      onChange(normalized, false);
      return;
    }
    onChange(normalized);
  };
  return (
    <div className={cn("grid gap-1 rounded-md bg-input px-2 py-2 text-xs text-muted-foreground", disabled && "opacity-60")}>
      <div className="flex min-h-7 items-center gap-2">
        <span className="w-12 shrink-0 font-semibold">{label}</span>
        {mixed ? <span className="shrink-0 rounded bg-background px-1 text-[10px] text-muted-foreground">混合</span> : null}
        <input
          className="h-5 w-5 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0 outline-none"
          type="color"
          disabled={disabled}
          value={normalizedValue}
          onChange={(event) => updateColor(event.target.value, false)}
          onBlur={endContinuousInput}
          title={label}
        />
        <input
          className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[12px] text-foreground outline-none"
          disabled={disabled}
          value={normalizedValue.toUpperCase()}
          maxLength={7}
          onChange={(event) => updateColor(event.target.value, false)}
          onBlur={endContinuousInput}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            endContinuousInput();
            event.currentTarget.blur();
          }}
          aria-label={label}
        />
        {onReset ? (
          <button
            type="button"
            className="shrink-0 rounded px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
            disabled={disabled}
            aria-label="重置字段为默认值"
            title={`重置${label}`}
            data-sketch-reset-field={label}
            onClick={onReset}
          >
            重置
          </button>
        ) : null}
      </div>
      {recentColors.length > 0 ? (
        <ColorSwatchRow
          label={`${label}最近颜色`}
          colors={recentColors}
          normalizedValue={normalizedValue}
          disabled={disabled}
          getSwatchLabel={(color) => `${label} 最近 ${color.toUpperCase()}`}
          onSelect={updateColor}
        />
      ) : null}
      <ColorSwatchRow
        label={`${label}常用颜色`}
        colors={SKETCH_COLOR_SWATCHES}
        normalizedValue={normalizedValue}
        disabled={disabled}
        getSwatchLabel={(color) => `${label} ${color.toUpperCase()}`}
        onSelect={updateColor}
      />
    </div>
  );
}

function ColorSwatchRow({
  label,
  colors,
  normalizedValue,
  disabled,
  getSwatchLabel,
  onSelect,
}: {
  label: string;
  colors: string[];
  normalizedValue: string;
  disabled: boolean;
  getSwatchLabel: (color: string) => string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="ml-14 flex flex-wrap gap-1" aria-label={label}>
      {colors.map((color) => {
        const swatchLabel = getSwatchLabel(color);
        return (
          <button
            key={color}
            type="button"
            className={cn(
              "h-4 w-4 rounded border border-border shadow-sm transition-transform hover:scale-110 disabled:cursor-not-allowed",
              normalizedValue.toLowerCase() === color && "ring-1 ring-ring ring-offset-1 ring-offset-input",
            )}
            style={{ backgroundColor: color }}
            disabled={disabled}
            title={swatchLabel}
            aria-label={swatchLabel}
            onClick={() => onSelect(color)}
          />
        );
      })}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled = false,
  mixed = false,
  onReset,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  mixed?: boolean;
  onReset?: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className={cn("flex min-h-9 items-center gap-2 rounded-md bg-input px-2 py-1 text-xs text-muted-foreground", disabled && "opacity-60")}>
      <span className="w-12 shrink-0 font-semibold">{label}</span>
      {mixed ? <span className="shrink-0 rounded bg-background px-1 text-[10px] text-muted-foreground">混合</span> : null}
      <div className="flex min-w-0 flex-1 flex-wrap gap-1" role="group">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "min-h-7 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed",
              value === option.value && "bg-background text-foreground shadow-sm",
            )}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {onReset ? (
        <button
          type="button"
          className="shrink-0 rounded px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
          disabled={disabled}
          aria-label="重置字段为默认值"
          title={`重置${label}`}
          data-sketch-reset-field={label}
          onClick={onReset}
        >
          重置
        </button>
      ) : null}
      <select
        className="sr-only"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function BadgeLike({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-input px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export function SketchEditorCanvas({
  scene,
  controller,
  configData = {},
  previewSize,
  fillContainer = false,
  mode = "edit",
  className,
}: SketchEditorCanvasProps) {
  const [dragStart, setDragStart] = React.useState<DragState | null>(null);
  const [marquee, setMarquee] = React.useState<MarqueeState | null>(null);
  const [viewport, setViewport] = React.useState<SketchCanvasViewport>({ scale: 1, offsetX: 24, offsetY: 24 });
  const [isSpacePanning, setIsSpacePanning] = React.useState(false);
  const [drawingDraft, setDrawingDraft] = React.useState<DrawingDraftState | null>(null);
  const [inlineTextEdit, setInlineTextEdit] = React.useState<InlineTextEditState | null>(null);
  const [imageFitEditNodeId, setImageFitEditNodeId] = React.useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [focusedGroupId, setFocusedGroupId] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = React.useState(false);
  const [clipboardVersion, setClipboardVersion] = React.useState(0);
  const [styleClipboardVersion, setStyleClipboardVersion] = React.useState(0);
  const dragStartRef = React.useRef<DragState | null>(null);
  const marqueeRef = React.useRef<MarqueeState | null>(null);
  const panStartRef = React.useRef<PanState | null>(null);
  const drawingDraftRef = React.useRef<DrawingDraftState | null>(null);
  const eraseStateRef = React.useRef<EraseState | null>(null);
  const clipboardRef = React.useRef<SketchSceneNode[]>([]);
  const styleClipboardRef = React.useRef<StyleClipboardState | null>(null);
  const pointerCaptureRef = React.useRef<{ element: HTMLElement; pointerId: number } | null>(null);
  const pendingImageImportRef = React.useRef<PendingImageImportState | null>(null);
  const focusedGroupIdRef = React.useRef<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const inlineTextRef = React.useRef<HTMLTextAreaElement>(null);
  const imageFileInputRef = React.useRef<HTMLInputElement>(null);
  const width = normalizeSize(previewSize, scene.pageSize.width, "width");
  const height = normalizeSize(previewSize, scene.pageSize.height, "height");
  const selectedNodes = getSelectedNodes(scene, controller);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const visibleSelectedNodes = selectedNodes.filter((node) => isNodeVisibleForConfig(node, configData));
  const canvasSelectionBounds = getSketchSelectionBounds(visibleSelectedNodes);
  const hoveredNode = hoveredNodeId && !controller.selection.nodeIds.includes(hoveredNodeId)
    ? scene.nodes.find((node) => node.id === hoveredNodeId && isNodeVisibleForConfig(node, configData)) ?? null
    : null;
  const hoverSelectionBounds = hoveredNode ? getSketchNodeBounds(hoveredNode) : null;
  const resizableSelectedNodes = getSelectionResizeNodes(selectedNodes).filter((node) => isNodeVisibleForConfig(node, configData));
  const resizeSelectionBounds = getSketchSelectionBounds(resizableSelectedNodes);
  const canResizeSelection = Boolean(resizeSelectionBounds && resizableSelectedNodes.length);
  const lineEndpointHandles =
    selectedNode &&
    (selectedNode.type === "line" || selectedNode.type === "arrow") &&
    !selectedNode.rotation
      ? {
          start: { x: selectedNode.x, y: selectedNode.y },
          end: { x: selectedNode.x + selectedNode.width, y: selectedNode.y + selectedNode.height },
        }
      : undefined;
  const inlineTextNode = inlineTextEdit
    ? scene.nodes.find((node) => node.id === inlineTextEdit.nodeId) ?? null
    : null;
  const canEditInlineTextNode = inlineTextNode ? canInlineEditTextNode(inlineTextNode, configData) : false;
  const inlineTextEditMetrics = inlineTextEdit && inlineTextNode && canEditInlineTextNode
    ? getInlineTextEditMetrics(inlineTextNode, inlineTextEdit.value)
    : null;
  const imageFitEditNode = imageFitEditNodeId
    ? scene.nodes.find((node) => node.id === imageFitEditNodeId && node.type === "image" && isNodeVisibleForConfig(node, configData)) ?? null
    : null;
  const imageFitEditBounds = imageFitEditNode ? getSketchNodeBounds(imageFitEditNode) : null;
  const editableSelectedNodes = selectedNodes.filter((node) => !node.locked && !isNodeHiddenByRuntimeConfig(node, configData));
  const layerEditableSelectedNodes = getGroupableSelectedNodes(scene, controller, configData);
  const lockableSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData));
  const visibleToggleSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData));
  const selectedGroupNodes = getSelectedGroupNodes(scene, controller);
  const focusedGroupNode = focusedGroupId
    ? scene.nodes.find((node) => node.id === focusedGroupId && node.type === "group") ?? null
    : null;
  const canGroupSelection = layerEditableSelectedNodes.length >= 2;
  const canUngroupSelection = selectedGroupNodes.length > 0;
  const previewScene = drawingDraft?.node
    ? { ...scene, nodes: [...scene.nodes, drawingDraft.node] }
    : scene;
  const connectorCandidatePoints = getConnectorCandidatePoints(scene, dragStart, configData);
  const snapGuides = getSketchSnapGuides(scene, dragStart, configData);
  const dragModifierHint = dragStart && dragStart.kind !== "rotate"
    ? [
        "Alt/Option 拖动复制",
        dragStart.kind === "resize" ? "Shift 等比缩放" : "Shift 约束比例",
        "Cmd/Ctrl 临时隐藏吸附参考线",
      ].join(" · ")
    : null;

  React.useEffect(() => {
    if (!inlineTextEdit) return;
    inlineTextRef.current?.focus();
    inlineTextRef.current?.select();
  }, [inlineTextEdit?.nodeId]);

  React.useEffect(() => {
    const textSelectionNodeId = controller.inlineTextSelection?.nodeId;
    if (textSelectionNodeId && !controller.selection.nodeIds.includes(textSelectionNodeId)) {
      controller.setInlineTextSelection(null);
    }
  }, [controller]);

  const updateInlineTextSelection = React.useCallback((element: HTMLTextAreaElement, nodeId: string) => {
    controller.setInlineTextSelection({
      nodeId,
      start: element.selectionStart,
      end: element.selectionEnd,
    });
  }, [controller]);

  React.useEffect(() => {
    if (!focusedGroupNode) {
      focusedGroupIdRef.current = null;
      return;
    }
    const childIds = focusedGroupNode.children ?? [];
    const isFocusedChildSelection =
      controller.selection.nodeIds.length > 0 &&
      controller.selection.nodeIds.every((nodeId) => childIds.includes(nodeId));
    if (isFocusedChildSelection) {
      focusedGroupIdRef.current = focusedGroupNode.id;
      return;
    }
    focusedGroupIdRef.current = null;
    setFocusedGroupId(null);
  }, [controller.selection.nodeIds, focusedGroupNode]);

  const copySelected = React.useCallback(() => {
    clipboardRef.current = expandSketchNodesForInsert(
      scene,
      selectedNodes.filter((node) => !node.locked && !isNodeHiddenByRuntimeConfig(node, configData)),
      configData,
    ).map((node) => ({ ...node }));
    setClipboardVersion((version) => version + 1);
  }, [configData, scene, selectedNodes]);

  const pasteClipboard = React.useCallback(() => {
    if (!clipboardRef.current.length) return;
    const nodes = cloneSketchNodesForInsert(clipboardRef.current);
    controller.applyOperations(nodes.map((node) => ({ op: "add", node })));
    controller.setNodeIds(nodes.map((node) => node.id));
  }, [controller]);

  const copyStyle = React.useCallback(() => {
    const node = selectedNodes.length === 1 ? selectedNodes[0] : null;
    if (!node || !canEditNodeProperties(node)) return;
    styleClipboardRef.current = {
      style: node.style ? { ...node.style, lineDash: node.style.lineDash ? [...node.style.lineDash] : undefined } : undefined,
      textStyleRuns: node.textStyleRuns?.map((run) => ({ ...run, style: { ...run.style } })),
    };
    setStyleClipboardVersion((version) => version + 1);
  }, [selectedNodes]);

  const pasteStyle = React.useCallback(() => {
    const clipboard = styleClipboardRef.current;
    if (!clipboard) return;
    const operations = editableSelectedNodes.flatMap((node) => {
      if (!canEditNodeProperties(node) || !isNodeVisibleForConfig(node, configData)) return [];
      const patch = getStylePatchForNode(node, clipboard);
      return patch ? [{ op: "update" as const, nodeId: node.id, patch }] : [];
    });
    if (!operations.length) return;
    controller.applyOperations(operations);
  }, [configData, controller, editableSelectedNodes]);

  const commitInlineTextEdit = React.useCallback(() => {
    const edit = inlineTextEdit;
    if (!edit) return;
    const node = scene.nodes.find((item) => item.id === edit.nodeId);
    setInlineTextEdit(null);
    if (!node || !canInlineEditTextNode(node, configData)) return;
    if (edit.deleteWhenEmpty && edit.value.trim() === "") {
      controller.applyOperations([{ op: "delete", nodeId: node.id }]);
      controller.clearSelection();
      return;
    }
    if (node.text === edit.value) return;
    controller.applyOperations([{ op: "update", nodeId: node.id, patch: { text: edit.value } }]);
  }, [configData, controller, inlineTextEdit, scene.nodes]);

  const cancelInlineTextEdit = React.useCallback(() => {
    const edit = inlineTextEdit;
    setInlineTextEdit(null);
    if (!edit?.deleteWhenEmpty) return;
    const node = scene.nodes.find((item) => item.id === edit.nodeId);
    if (!node || !canInlineEditTextNode(node, configData) || (node.text ?? "").trim() !== "") return;
    controller.applyOperations([{ op: "delete", nodeId: node.id }]);
    controller.clearSelection();
  }, [configData, controller, inlineTextEdit, scene.nodes]);

  const fitPageToViewport = React.useCallback(() => {
    setViewport(getCenteredViewportForBounds({ x: 0, y: 0, width: scene.pageSize.width, height: scene.pageSize.height }, containerRef.current, 1));
  }, [scene.pageSize.height, scene.pageSize.width]);

  const zoomToSelection = React.useCallback(() => {
    const bounds = canvasSelectionBounds;
    if (!bounds) return fitPageToViewport();
    setViewport(getCenteredViewportForBounds(bounds, containerRef.current, 3));
  }, [canvasSelectionBounds, fitPageToViewport]);

  const zoomViewportBy = React.useCallback((factor: number) => {
    const container = containerRef.current;
    const anchor = {
      x: (container?.clientWidth ?? width) / 2,
      y: (container?.clientHeight ?? height) / 2,
    };
    setViewport((current) => zoomViewportAt(current, current.scale * factor, anchor));
  }, [height, width]);

  const actionEntries = React.useMemo(() => buildSketchActionEntries({
    scene,
    controller,
    configData,
    selectedNodes,
    editableSelectedNodes,
    layerEditableSelectedNodes,
    lockableSelectedNodes,
    visibleToggleSelectedNodes,
    canGroupSelection,
    canUngroupSelection,
    copiedNodeCount: clipboardRef.current.length,
    hasCopiedStyle: Boolean(styleClipboardRef.current) || styleClipboardVersion > 0,
    copySelected,
    pasteClipboard,
    copyStyle,
    pasteStyle,
    fitPageToViewport,
    zoomToSelection,
  }), [
    canGroupSelection,
    canUngroupSelection,
    clipboardVersion,
    configData,
    controller,
    copySelected,
    copyStyle,
    editableSelectedNodes,
    fitPageToViewport,
    layerEditableSelectedNodes,
    lockableSelectedNodes,
    pasteClipboard,
    pasteStyle,
    scene,
    selectedNodes,
    styleClipboardVersion,
    visibleToggleSelectedNodes,
    zoomToSelection,
  ]);

  const startInlineTextEdit = React.useCallback((nodeId: string): boolean => {
    const node = scene.nodes.find((item) => item.id === nodeId);
    if (!node || !canInlineEditTextNode(node, configData)) return false;
    activateSketchKeyboardScope(controller);
    controller.setNodeIds([node.id]);
    setInlineTextEdit({ nodeId: node.id, value: node.text ?? "" });
    return true;
  }, [configData, controller, scene.nodes]);

  const enterFocusedGroupFromEvent = React.useCallback((target: Element, clientX: number, clientY: number): boolean => {
    const directNodeId = getSketchTargetNodeId(target);
    const point = getClientScenePoint(clientX, clientY, stageRef.current, scene);
    const hitNodeId = point ? hitTestSketchScene(scene, point, configData)?.id ?? null : null;
    const targetNodeIds = [directNodeId, hitNodeId].filter((nodeId): nodeId is string => Boolean(nodeId));
    if (!targetNodeIds.length) return false;
    const groups = scene.nodes.filter((node) => node.type === "group" && node.children?.length);
    const selectedNodeIds = new Set(controller.selection.nodeIds);
    const group =
      groups.find((node) => selectedNodeIds.has(node.id) && targetNodeIds.some((nodeId) => node.children?.includes(nodeId))) ??
      groups.find((node) => targetNodeIds.some((nodeId) => node.children?.includes(nodeId))) ??
      null;
    if (!group?.children?.length || focusedGroupIdRef.current === group.id) return false;
    const childId = targetNodeIds.find((nodeId) => group.children?.includes(nodeId)) ?? null;
    if (!childId || !group.children.includes(childId)) return false;
    const childNode = scene.nodes.find((node) => node.id === childId);
    if (!childNode || !isNodeVisibleForConfig(childNode, configData)) return false;
    activateSketchKeyboardScope(controller);
    focusedGroupIdRef.current = group.id;
    setFocusedGroupId(group.id);
    controller.setNodeIds([childNode.id]);
    return true;
  }, [configData, controller, scene]);

  const quickToolbarPosition = React.useMemo(() => {
    if (
      mode !== "edit" ||
      controller.tool !== "select" ||
      !canvasSelectionBounds ||
      !selectedNodes.length ||
      inlineTextEdit ||
      dragStart ||
      marquee ||
      drawingDraft
    ) return null;
    const scaleX = width / scene.pageSize.width;
    const scaleY = height / scene.pageSize.height;
    const containerWidth = containerRef.current?.clientWidth ?? width + viewport.offsetX * 2;
    const left = viewport.offsetX + (canvasSelectionBounds.x + canvasSelectionBounds.width / 2) * scaleX * viewport.scale;
    const top = viewport.offsetY + canvasSelectionBounds.y * scaleY * viewport.scale;
    const bottom = viewport.offsetY + (canvasSelectionBounds.y + canvasSelectionBounds.height) * scaleY * viewport.scale;
    return {
      left: Math.max(16, Math.min(containerWidth - 16, left)),
      top: top > 96 ? top - 84 : bottom + 32,
    };
  }, [
    canvasSelectionBounds,
    controller.tool,
    dragStart,
    drawingDraft,
    height,
    inlineTextEdit,
    marquee,
    mode,
    scene.pageSize.height,
    scene.pageSize.width,
    selectedNodes.length,
    viewport.offsetX,
    viewport.offsetY,
    viewport.scale,
    width,
  ]);

  const runQuickToolbarAction = React.useCallback((action: () => void) => {
    activateSketchKeyboardScope(controller);
    action();
  }, [controller]);

  const cycleSelectedColor = React.useCallback((property: "fill" | "stroke") => {
    if (!selectedNode) return;
    const fallback = property === "fill" ? "#ffffff" : "#111827";
    const nextColor = getNextSketchSwatchColor(selectedNode.style?.[property], fallback);
    updateSelectedStyle(scene, controller, property === "fill" ? { fill: nextColor } : { stroke: nextColor });
  }, [controller, scene, selectedNode]);

  const floatingToolbarActions = React.useMemo<SketchFloatingToolbarAction[]>(() => {
    if (!quickToolbarPosition) return [];
    const openMore = () => {
      setShortcutHelpOpen(false);
      setCommandPaletteOpen(true);
    };
    if (selectedNodes.length === 1 && selectedNode) {
      const actions: SketchFloatingToolbarAction[] = [];
      if (supportsFillStyle(selectedNode)) {
        actions.push({
          id: "fill",
          label: "填充",
          title: "切换填充常用色",
          icon: <PaintBucket className="h-3.5 w-3.5" />,
          swatchColor: toColorInputValue(selectedNode.style?.fill, "#ffffff"),
          disabled: !canEditNodeProperties(selectedNode),
          onClick: () => runQuickToolbarAction(() => cycleSelectedColor("fill")),
        });
      }
      if (supportsStrokeStyle(selectedNode)) {
        actions.push({
          id: "stroke",
          label: "描边",
          title: "切换描边常用色",
          icon: <PenLine className="h-3.5 w-3.5" />,
          swatchColor: toColorInputValue(selectedNode.style?.stroke, "#111827"),
          disabled: !canEditNodeProperties(selectedNode),
          onClick: () => runQuickToolbarAction(() => cycleSelectedColor("stroke")),
        });
      }
      if (canInlineEditTextNode(selectedNode, configData)) {
        actions.push({
          id: "text",
          label: "文本",
          icon: <Type className="h-3.5 w-3.5" />,
          onClick: () => runQuickToolbarAction(() => startInlineTextEdit(selectedNode.id)),
        });
      }
      actions.push(
        {
          id: "copyStyle",
          label: "复制样式",
          icon: <Copy className="h-3.5 w-3.5" />,
          disabled: !canEditNodeProperties(selectedNode),
          onClick: () => runQuickToolbarAction(copyStyle),
        },
        {
          id: "more",
          label: "更多",
          icon: <MoreHorizontal className="h-3.5 w-3.5" />,
          onClick: () => runQuickToolbarAction(openMore),
        },
      );
      return actions;
    }
    return [
      {
        id: "alignLeft",
        label: "左对齐",
        icon: <AlignHorizontalJustifyStart className="h-3.5 w-3.5" />,
        disabled: layerEditableSelectedNodes.length < 2,
        onClick: () => runQuickToolbarAction(() => alignSelected(scene, controller, "left", configData)),
      },
      {
        id: "alignTop",
        label: "顶对齐",
        icon: <AlignVerticalJustifyStart className="h-3.5 w-3.5" />,
        disabled: layerEditableSelectedNodes.length < 2,
        onClick: () => runQuickToolbarAction(() => alignSelected(scene, controller, "top", configData)),
      },
      {
        id: "distributeHorizontal",
        label: "水平分布",
        icon: <Rows3 className="h-3.5 w-3.5 rotate-90" />,
        disabled: layerEditableSelectedNodes.length < 3,
        onClick: () => runQuickToolbarAction(() => distributeSelectedHorizontally(scene, controller, configData)),
      },
      {
        id: "group",
        label: "成组",
        icon: <Group className="h-3.5 w-3.5" />,
        disabled: !canGroupSelection,
        onClick: () => runQuickToolbarAction(() => groupSelected(scene, controller, configData)),
      },
      {
        id: "duplicate",
        label: "复制",
        icon: <Copy className="h-3.5 w-3.5" />,
        disabled: !editableSelectedNodes.length,
        onClick: () => runQuickToolbarAction(() => duplicateSelected(scene, controller, configData)),
      },
      {
        id: "delete",
        label: "删除",
        icon: <Trash2 className="h-3.5 w-3.5" />,
        disabled: !editableSelectedNodes.length,
        onClick: () => runQuickToolbarAction(() => deleteSelected(scene, controller, configData)),
      },
      {
        id: "more",
        label: "更多",
        icon: <MoreHorizontal className="h-3.5 w-3.5" />,
        onClick: () => runQuickToolbarAction(openMore),
      },
    ];
  }, [
    canGroupSelection,
    configData,
    controller,
    copyStyle,
    cycleSelectedColor,
    editableSelectedNodes.length,
    layerEditableSelectedNodes.length,
    quickToolbarPosition,
    runQuickToolbarAction,
    scene,
    selectedNode,
    selectedNodes.length,
    startInlineTextEdit,
  ]);

  const getInlineTextEditNodeIdFromPoint = React.useCallback(
    (target: Element, clientX: number, clientY: number): string | null => {
      const directNodeId = getSketchTargetNodeId(target);
      if (directNodeId) {
        const directNode = scene.nodes.find((node) => node.id === directNodeId);
        return directNode && canInlineEditTextNode(directNode, configData) ? directNode.id : null;
      }
      const point = getClientScenePoint(clientX, clientY, stageRef.current, scene);
      if (!point) return null;
      const hitNode = hitTestSketchScene(scene, point, configData);
      return hitNode && canInlineEditTextNode(hitNode, configData) ? hitNode.id : null;
    },
    [configData, scene],
  );

  const runContextMenuAction = React.useCallback((action: () => void) => {
    action();
    setContextMenu(null);
  }, []);

  const getViewportCenterScenePoint = React.useCallback((): { x: number; y: number } => {
    const container = containerRef.current;
    return clampScenePoint(
      {
        x: ((container?.clientWidth ?? width) / 2 - viewport.offsetX) / viewport.scale,
        y: ((container?.clientHeight ?? height) / 2 - viewport.offsetY) / viewport.scale,
      },
      scene,
    );
  }, [height, scene, viewport.offsetX, viewport.offsetY, viewport.scale, width]);

  const importImageFile = React.useCallback(
    async (file: File, intent: PendingImageImportState) => {
      const src = await readImageFileAsDataUrl(file);
      if (!src) return;
      if (intent.replaceNodeId) {
        const target = scene.nodes.find((node) => node.id === intent.replaceNodeId);
        if (!target || target.type !== "image" || !canEditNodeProperties(target) || !isNodeVisibleForConfig(target, configData)) return;
        controller.applyOperations([
          { op: "update", nodeId: target.id, patch: { src, alt: file.name || target.alt || "导入图片" } },
        ]);
        controller.setNodeIds([target.id]);
        return;
      }
      const point = intent.point ?? getViewportCenterScenePoint();
      const node = createImportedImageNode(file, src, point);
      controller.applyOperations([{ op: "add", node }]);
      controller.setNodeIds([node.id]);
      controller.setTool("select");
    },
    [configData, controller, getViewportCenterScenePoint, scene],
  );

  const requestImageFileImport = React.useCallback((intent: PendingImageImportState) => {
    pendingImageImportRef.current = intent;
    imageFileInputRef.current?.click();
  }, []);

  const getImageReplaceTargetId = React.useCallback(
    (target: Element | null, point?: { x: number; y: number }): string | null => {
      const targetNodeId = target ? getSketchTargetNodeId(target) : null;
      const directTarget = targetNodeId ? scene.nodes.find((node) => node.id === targetNodeId) : null;
      if (directTarget?.type === "image" && canEditNodeProperties(directTarget) && isNodeVisibleForConfig(directTarget, configData)) {
        return directTarget.id;
      }
      if (!point || controller.selection.nodeIds.length !== 1) return null;
      const selected = scene.nodes.find((node) => node.id === controller.selection.nodeIds[0]);
      if (!selected || selected.type !== "image" || !canEditNodeProperties(selected) || !isNodeVisibleForConfig(selected, configData)) return null;
      return isPointInsideNodeBounds(point, selected) ? selected.id : null;
    },
    [configData, controller.selection.nodeIds, scene.nodes],
  );

  const startImageFitEditFromTarget = React.useCallback(
    (target: Element, clientX: number, clientY: number): boolean => {
      const point = getClientScenePoint(clientX, clientY, stageRef.current, scene);
      const targetNodeId = getImageReplaceTargetId(target, point ?? undefined);
      if (!targetNodeId) return false;
      const node = scene.nodes.find((item) => item.id === targetNodeId);
      if (!node || node.type !== "image" || node.locked) return false;
      controller.setNodeIds([node.id]);
      setImageFitEditNodeId(node.id);
      return true;
    },
    [controller, getImageReplaceTargetId, scene],
  );

  const importDroppedOrPastedImage = React.useCallback(
    (file: File | null, point?: { x: number; y: number }) => {
      if (!file) return false;
      void importImageFile(file, { point });
      return true;
    },
    [importImageFile],
  );

  React.useEffect(() => {
    if (mode !== "edit") return undefined;
    const stage = stageRef.current;
    if (!stage) return undefined;
      const startEditFromNativeEvent = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (startImageFitEditFromTarget(target, event.clientX, event.clientY)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (enterFocusedGroupFromEvent(target, event.clientX, event.clientY)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const nodeId = getInlineTextEditNodeIdFromPoint(target, event.clientX, event.clientY);
        if (!nodeId || !startInlineTextEdit(nodeId)) return;
        event.preventDefault();
        event.stopPropagation();
    };
    const onNativeDoubleClick = (event: MouseEvent) => startEditFromNativeEvent(event);
    const onNativeClick = (event: MouseEvent) => {
      if (event.detail < 2) return;
      startEditFromNativeEvent(event);
    };
    stage.addEventListener("click", onNativeClick);
    stage.addEventListener("dblclick", onNativeDoubleClick);
    return () => {
      stage.removeEventListener("click", onNativeClick);
      stage.removeEventListener("dblclick", onNativeDoubleClick);
    };
  }, [enterFocusedGroupFromEvent, getInlineTextEditNodeIdFromPoint, mode, startImageFitEditFromTarget, startInlineTextEdit]);

  React.useEffect(() => {
    if (mode !== "edit") return undefined;
    registeredSketchKeyboardScopeIds.add(controller.keyboardScopeId);
    return () => {
      registeredSketchKeyboardScopeIds.delete(controller.keyboardScopeId);
      if (activeSketchKeyboardScopeId === controller.keyboardScopeId) {
        activeSketchKeyboardScopeId = null;
      }
    };
  }, [controller.keyboardScopeId, mode]);

  const setActiveDragStart = React.useCallback((next: DragState | null) => {
    dragStartRef.current = next;
    setDragStart(next);
  }, []);

  const setActiveMarquee = React.useCallback((next: MarqueeState | null) => {
    marqueeRef.current = next;
    setMarquee(next);
  }, []);

  const setActiveDrawingDraft = React.useCallback((next: DrawingDraftState | null) => {
    drawingDraftRef.current = next;
    setDrawingDraft(next);
  }, []);

  const getEraseTargetNodeId = React.useCallback(
    (point: { x: number; y: number }, target?: Element): string | null => {
      const targetNodeId = target ? getSketchTargetNodeId(target) : null;
      const nodeId = targetNodeId ?? hitTestSketchScene(scene, point, configData)?.id ?? null;
      if (!nodeId) return null;
      const node = scene.nodes.find((item) => item.id === nodeId);
      if (!node || node.locked || node.visible === false || !isNodeVisibleForConfig(node, configData)) return null;
      return node.id;
    },
    [configData, scene],
  );

  const getHoverTargetNodeId = React.useCallback(
    (target: Element, clientX: number, clientY: number): string | null => {
      if (mode !== "edit" || controller.tool !== "select" || inlineTextEdit || dragStartRef.current || marqueeRef.current || drawingDraftRef.current) {
        return null;
      }
      const directNodeId = getSketchTargetNodeId(target);
      const point = getClientScenePoint(clientX, clientY, stageRef.current, scene);
      const nodeId = directNodeId ?? (point ? hitTestSketchScene(scene, point, configData)?.id ?? null : null);
      if (!nodeId || controller.selection.nodeIds.includes(nodeId)) return null;
      const node = scene.nodes.find((item) => item.id === nodeId);
      if (!node || node.visible === false || !isNodeVisibleForConfig(node, configData)) return null;
      return node.id;
    },
    [configData, controller.selection.nodeIds, controller.tool, inlineTextEdit, mode, scene],
  );

  const updateHoveredNodeId = React.useCallback((nextId: string | null) => {
    setHoveredNodeId((current) => (current === nextId ? current : nextId));
  }, []);

  const capturePointer = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (typeof event.pointerId !== "number") return;
    const element = event.currentTarget;
    if (typeof element.setPointerCapture !== "function") return;
    try {
      element.setPointerCapture(event.pointerId);
      pointerCaptureRef.current = { element, pointerId: event.pointerId };
    } catch {
      pointerCaptureRef.current = null;
    }
  }, []);

  const releasePointerCapture = React.useCallback(() => {
    const captured = pointerCaptureRef.current;
    if (!captured) return;
    pointerCaptureRef.current = null;
    if (typeof captured.element.releasePointerCapture !== "function") return;
    try {
      captured.element.releasePointerCapture(captured.pointerId);
    } catch {
      // Pointer capture may already be released by the browser after cancellation.
    }
  }, []);

  React.useEffect(() => releasePointerCapture, [releasePointerCapture]);

  React.useEffect(() => {
    if (mode !== "edit") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canHandleSketchKeyboardShortcut(controller)) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key === " ") {
        event.preventDefault();
        setIsSpacePanning(true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (shortcutHelpOpen) {
          setShortcutHelpOpen(false);
        } else if (inlineTextEdit) {
          cancelInlineTextEdit();
        } else if (drawingDraftRef.current) {
          setActiveDrawingDraft(null);
        } else {
          const activeFocusedGroupNode = focusedGroupIdRef.current
            ? scene.nodes.find((node) => node.id === focusedGroupIdRef.current && node.type === "group") ?? null
            : null;
          if (activeFocusedGroupNode) {
            focusedGroupIdRef.current = null;
            controller.setNodeIds([activeFocusedGroupNode.id]);
            setFocusedGroupId(null);
            return;
          }
          controller.clearSelection();
          controller.setTool("select");
        }
        return;
      }
      const runAction = (id: string): boolean => {
        const action = actionEntries.find((entry) => entry.id === id);
        if (!action || action.disabledReason) return false;
        action.run();
        return true;
      };
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShortcutHelpOpen(false);
        setCommandPaletteOpen((open) => !open);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === "?") {
        event.preventDefault();
        setCommandPaletteOpen(false);
        setShortcutHelpOpen((open) => !open);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === "Tab") {
        if (selectAdjacentKeyboardNode(scene, controller, event.shiftKey ? -1 : 1, configData, focusedGroupIdRef.current)) {
          event.preventDefault();
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        runAction("object.delete");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        runAction(event.shiftKey ? "history.redo" : "history.undo");
      }
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        runAction("style.copy");
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        runAction("object.copy");
      }
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        runAction("style.paste");
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        runAction("object.paste");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        runAction("object.duplicate");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        runAction(event.shiftKey ? "object.ungroup" : "object.group");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        runAction("object.lock");
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        runAction("object.visible");
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "]") {
        event.preventDefault();
        runAction(event.shiftKey ? "arrange.front" : "arrange.forward");
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "[") {
        event.preventDefault();
        runAction(event.shiftKey ? "arrange.back" : "arrange.backward");
      }
      if (!event.metaKey && !event.ctrlKey && event.shiftKey && event.key === "!") {
        event.preventDefault();
        runAction("view.fitPage");
      }
      if (!event.metaKey && !event.ctrlKey && event.shiftKey && event.key === "@") {
        event.preventDefault();
        runAction("view.zoomSelection");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        controller.setNodeIds(
          scene.nodes
            .filter((node) => node.visible !== false && isNodeVisibleForConfig(node, configData))
            .map((node) => node.id),
        );
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && controller.selection.nodeIds.length) {
        const editableSelectedNodes = selectedNodes.filter((node) => !node.locked && isNodeVisibleForConfig(node, configData));
        if (!editableSelectedNodes.length) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const delta = {
          x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
          y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
        };
        const translatedNodes = translateSketchNodes(editableSelectedNodes, delta);
        controller.applyOperations(
          editableSelectedNodes.map((node, index) => {
            const nextNode = translatedNodes[index];
            return { op: "update", nodeId: node.id, patch: { x: nextNode.x, y: nextNode.y } };
          }),
        );
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") {
        setIsSpacePanning(false);
        panStartRef.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [actionEntries, cancelInlineTextEdit, commandPaletteOpen, configData, controller, inlineTextEdit, mode, scene, selectedNodes, setActiveDrawingDraft, shortcutHelpOpen]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative min-h-0 flex-1 overflow-hidden bg-[#1f1f1f]",
        panStartRef.current ? "cursor-grabbing" : isSpacePanning || controller.tool === "hand" ? "cursor-grab" : "cursor-default",
        className,
      )}
      onWheel={(event) => {
        if (mode !== "edit") return;
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const rect = containerRef.current?.getBoundingClientRect();
          const anchor = rect
            ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
            : { x: width / 2, y: height / 2 };
          const factor = event.deltaY > 0 ? 0.9 : 1.1;
          setViewport((current) => zoomViewportAt(current, current.scale * factor, anchor));
          return;
        }
        event.preventDefault();
        setViewport((current) =>
          normalizeViewport({
            ...current,
            offsetX: current.offsetX - event.deltaX,
            offsetY: current.offsetY - event.deltaY,
          }),
        );
      }}
      onPointerDown={(event) => {
        setContextMenu(null);
        if (mode !== "edit" || (!isSpacePanning && controller.tool !== "hand")) return;
        event.preventDefault();
        activateSketchKeyboardScope(controller);
        capturePointer(event);
        panStartRef.current = {
          pointer: { x: event.clientX, y: event.clientY },
          viewport,
        };
      }}
      onPaste={(event) => {
        if (mode !== "edit") return;
        const file = firstImageFile(event.clipboardData.files);
        if (!importDroppedOrPastedImage(file, getViewportCenterScenePoint())) return;
        event.preventDefault();
      }}
      onDragOver={(event) => {
        if (mode !== "edit") return;
        if (!firstImageFile(event.dataTransfer.files)) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (mode !== "edit") return;
        const file = firstImageFile(event.dataTransfer.files);
        const point = getClientScenePoint(event.clientX, event.clientY, stageRef.current, scene) ?? getViewportCenterScenePoint();
        const replaceNodeId = getImageReplaceTargetId(event.target as Element, point);
        if (replaceNodeId && file) {
          void importImageFile(file, { replaceNodeId });
          event.preventDefault();
          return;
        }
        if (!importDroppedOrPastedImage(file, point)) return;
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        updateHoveredNodeId(getHoverTargetNodeId(event.target as Element, event.clientX, event.clientY));
        const activePanStart = panStartRef.current;
        if (activePanStart) {
          event.preventDefault();
          setViewport(
            normalizeViewport({
              ...activePanStart.viewport,
              offsetX: activePanStart.viewport.offsetX + event.clientX - activePanStart.pointer.x,
              offsetY: activePanStart.viewport.offsetY + event.clientY - activePanStart.pointer.y,
            }),
          );
          return;
        }
        const activeDrawingDraft = drawingDraftRef.current;
        if (activeDrawingDraft) {
          event.preventDefault();
          const point = getPointerScenePoint(event, stageRef.current, scene);
          if (!point) return;
          const nextPoint = clampScenePoint(point, scene);
          const nextPoints =
            activeDrawingDraft.tool === "pencil"
              ? (() => {
                  const previousPoint = activeDrawingDraft.points[activeDrawingDraft.points.length - 1];
                  if (previousPoint && getDrawingDistance(previousPoint, nextPoint) < PENCIL_SAMPLE_DISTANCE) {
                    return activeDrawingDraft.points;
                  }
                  return [...activeDrawingDraft.points, nextPoint];
                })()
              : activeDrawingDraft.points;
          setActiveDrawingDraft({
            ...activeDrawingDraft,
            current: nextPoint,
            points: nextPoints,
            node: createDrawingNode(activeDrawingDraft.tool, activeDrawingDraft.start, nextPoint, scene, {
              shiftKey: event.shiftKey,
              points: nextPoints,
              allowClickText: activeDrawingDraft.tool === "text",
            }),
          });
          return;
        }
        const activeEraseState = eraseStateRef.current;
        if (activeEraseState) {
          event.preventDefault();
          const point = getPointerScenePoint(event, stageRef.current, scene);
          if (!point) return;
          const nodeId = getEraseTargetNodeId(point, event.target as Element);
          if (nodeId) activeEraseState.nodeIds.add(nodeId);
          return;
        }
        const activeDragStart = dragStartRef.current;
        if (!activeDragStart) return;
        event.preventDefault();
        const point = getPointerScenePoint(event, stageRef.current, scene);
        if (!point) return;
        const activeMarquee = marqueeRef.current;
        if (activeMarquee) {
          setActiveMarquee({ ...activeMarquee, current: point });
          return;
        }
        const delta = { x: point.x - activeDragStart.pointer.x, y: point.y - activeDragStart.pointer.y };
        const nextDragStart: DragState = {
          ...activeDragStart,
          currentPointer: point,
          modifierKeys: {
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
          },
        };
        setActiveDragStart(nextDragStart);
        if (activeDragStart.kind === "rotate") {
          if (!activeDragStart.rotationCenter || typeof activeDragStart.rotationStartAngle !== "number") return;
          const angleDelta = getPointAngleDegrees(point, activeDragStart.rotationCenter) - activeDragStart.rotationStartAngle;
          if (!activeDragStart.hasHistoryCheckpoint && Math.abs(angleDelta) < 1) return;
          const operations: SketchScenePatchOperation[] = activeDragStart.nodes.map((node) => ({
            op: "update",
            nodeId: node.id,
            patch: { rotation: normalizeRotationDegrees((node.rotation ?? 0) + angleDelta) },
          }));
          const nextScene = applySketchScenePatchOperations(scene, operations);
          if (nextScene === scene) return;
          if (!activeDragStart.hasHistoryCheckpoint) {
            controller.recordHistoryCheckpoint(activeDragStart.initialScene);
            setActiveDragStart({ ...nextDragStart, hasHistoryCheckpoint: true });
          }
          controller.commitScene(nextScene, false);
          return;
        }
        if (
          activeDragStart.duplicateOnDrag &&
          !activeDragStart.hasHistoryCheckpoint &&
          Math.hypot(delta.x, delta.y) < DRAWING_COMMIT_THRESHOLD
        ) {
          return;
        }
        const preserveAspectRatio =
          activeDragStart.kind === "resize" &&
          Boolean(activeDragStart.resizeBounds) &&
          Boolean(activeDragStart.resizeHandle) &&
          getBoxResizeHandle(activeDragStart.resizeHandle).length === 2 &&
          event.shiftKey;
        const resizeFromBounds =
          shouldResizeFromSelectionBounds(activeDragStart) || preserveAspectRatio
            ? activeDragStart.resizeBounds
            : null;
        const resizedNodes =
          resizeFromBounds
            ? resizeNodesWithinBounds(
                activeDragStart.nodes,
                resizeFromBounds,
                resizeBounds(resizeFromBounds, getBoxResizeHandle(activeDragStart.resizeHandle), delta, preserveAspectRatio),
              )
            : null;
        const translatedNodes = activeDragStart.kind === "move" ? translateSketchNodes(activeDragStart.nodes, delta) : null;
        const previewNodes =
          activeDragStart.kind === "move"
            ? translatedNodes ?? activeDragStart.nodes
            : activeDragStart.kind === "resize"
              ? activeDragStart.nodes.map((node, index) => (
                  resizeLineLikeNodeEndpoint(node, activeDragStart.resizeHandle, delta) ??
                  resizedNodes?.[index] ??
                  (activeDragStart.nodeId === node.id ? resizeSketchNode(node, getBoxResizeHandle(activeDragStart.resizeHandle), delta) : node)
                ))
              : activeDragStart.nodes;
        const operations: SketchScenePatchOperation[] =
          activeDragStart.duplicateOnDrag && activeDragStart.kind === "move" && !activeDragStart.hasHistoryCheckpoint
            ? (translatedNodes ?? activeDragStart.nodes).map((node) => ({ op: "add" as const, node }))
            : activeDragStart.nodes.flatMap((node, index) => {
          if (activeDragStart.kind === "resize") {
            const nextNode = previewNodes[index] ?? node;
            if (nextNode === node) return [];
            return [{
              op: "update" as const,
              nodeId: node.id,
              patch: { x: nextNode.x, y: nextNode.y, width: nextNode.width, height: nextNode.height },
            }];
          }
          const nextNode = translatedNodes?.[index] ?? node;
          return [{
            op: "update" as const,
            nodeId: node.id,
            patch: { x: nextNode.x, y: nextNode.y },
          }];
        });
        if (!activeDragStart.duplicateOnDrag) {
          operations.push(...getConnectedLineFollowOperations(scene, previewNodes));
        }
        const nextScene = applySketchScenePatchOperations(scene, operations);
        if (nextScene === scene) return;
        if (operations.length && !activeDragStart.hasHistoryCheckpoint) {
          controller.recordHistoryCheckpoint(activeDragStart.initialScene);
          if (activeDragStart.duplicateOnDrag) {
            controller.setNodeIds(activeDragStart.nodes.map((node) => node.id));
          }
          setActiveDragStart({ ...nextDragStart, hasHistoryCheckpoint: true });
        }
        controller.commitScene(nextScene, false);
      }}
      onPointerUp={(event) => {
        const activeDragState = dragStartRef.current;
        if (
          activeDragState?.kind === "resize" &&
          (activeDragState.resizeHandle === "line-start" || activeDragState.resizeHandle === "line-end")
        ) {
          const point = getPointerScenePoint(event, stageRef.current, scene);
          const finalDragState: DragState = {
            ...activeDragState,
            currentPointer: point ?? activeDragState.currentPointer ?? activeDragState.pointer,
            modifierKeys: {
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
            },
          };
          const endpoint = finalDragState.resizeHandle === "line-start" ? "start" : "end";
          const candidate = findNearestConnectorCandidate(scene, finalDragState, configData);
          const lineNode = scene.nodes.find((node) => node.id === finalDragState.nodes[0]?.id && (node.type === "line" || node.type === "arrow"));
          if (lineNode && (candidate || lineNode.connections?.[endpoint])) {
            const endpointPatch = candidate
              ? getLineLikeEndpointPatch(lineNode, endpoint, { x: candidate.x, y: candidate.y })
              : {};
            controller.applyOperations([
              {
                op: "update",
                nodeId: lineNode.id,
                patch: {
                  ...endpointPatch,
                  ...patchConnectorEndpointBinding(lineNode, endpoint, candidate),
                },
              },
            ]);
          }
        }
        const activeDrawingDraft = drawingDraftRef.current;
        if (activeDrawingDraft) {
          const point = getPointerScenePoint(event, stageRef.current, scene);
          const finalPoint = point ? clampScenePoint(point, scene) : activeDrawingDraft.current;
          const node =
            activeDrawingDraft.node ??
            createDrawingNode(activeDrawingDraft.tool, activeDrawingDraft.start, finalPoint, scene, {
              shiftKey: event.shiftKey,
              points: activeDrawingDraft.points,
              allowClickText: activeDrawingDraft.tool === "text",
            });
          if (node) {
            controller.applyOperations([{ op: "add", node }]);
            controller.setNodeIds([node.id]);
            controller.setTool("select");
            if (node.type === "text") {
              setInlineTextEdit({ nodeId: node.id, value: node.text ?? "", deleteWhenEmpty: true });
            }
          } else if (activeDrawingDraft.tool === "image") {
            requestImageFileImport({ point: finalPoint });
          }
        }
        const activeEraseState = eraseStateRef.current;
        if (activeEraseState?.nodeIds.size) {
          const nodesToDelete = scene.nodes.filter((node) => activeEraseState.nodeIds.has(node.id));
          const editableNodes = expandSketchNodesForDelete(scene, nodesToDelete, configData);
          if (editableNodes.length) {
            controller.applyOperations(editableNodes.map((node) => ({ op: "delete", nodeId: node.id })));
            controller.clearSelection();
          }
        }
        const activeMarquee = marqueeRef.current;
        if (activeMarquee) {
          const bounds = boundsFromPoints(activeMarquee.start, activeMarquee.current);
          const nextIds = scene.nodes
            .filter((node) => isNodeVisibleForConfig(node, configData) && nodeIntersectsSelectionBounds(node, bounds))
            .map((node) => node.id);
          controller.setNodeIds(nextIds);
        }
        releasePointerCapture();
        panStartRef.current = null;
        eraseStateRef.current = null;
        setActiveDragStart(null);
        setActiveDrawingDraft(null);
        setActiveMarquee(null);
      }}
      onPointerCancel={() => {
        releasePointerCapture();
        panStartRef.current = null;
        eraseStateRef.current = null;
        setActiveDragStart(null);
        setActiveDrawingDraft(null);
        setActiveMarquee(null);
      }}
      onContextMenu={(event) => {
        if (mode !== "edit") return;
        event.preventDefault();
        activateSketchKeyboardScope(controller);
        const target = event.target as Element;
        const nodeId = getSketchTargetNodeId(target);
        if (nodeId) {
          const node = scene.nodes.find((item) => item.id === nodeId);
          if (node && !controller.selection.nodeIds.includes(node.id)) {
            controller.setNodeIds([node.id]);
          }
        } else if (!controller.selection.nodeIds.length) {
          return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        setContextMenu({
          x: rect ? event.clientX - rect.left : event.clientX,
          y: rect ? event.clientY - rect.top : event.clientY,
        });
      }}
    >
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        aria-label="图片导入文件"
        className="hidden"
        onChange={(event) => {
          const file = firstImageFile(event.target.files);
          const intent = pendingImageImportRef.current ?? { point: getViewportCenterScenePoint() };
          pendingImageImportRef.current = null;
          event.currentTarget.value = "";
          if (!file) return;
          void importImageFile(file, intent);
        }}
      />
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 text-foreground shadow-xl">
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="缩小" title="缩小" onClick={() => zoomViewportBy(0.85)}>
          <ZoomOut className="h-4 w-4" />
        </button>
        <button type="button" className="inline-flex h-8 min-w-12 items-center justify-center rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="重置缩放" title="重置缩放" onClick={fitPageToViewport}>
          {Math.round(viewport.scale * 100)}%
        </button>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="放大" title="放大" onClick={() => zoomViewportBy(1.15)}>
          <ZoomIn className="h-4 w-4" />
        </button>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" aria-label="缩放到选区" title="缩放到选区" disabled={!canvasSelectionBounds} onClick={zoomToSelection}>
          <LocateFixed className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", commandPaletteOpen && "bg-accent text-foreground")}
          aria-label="打开命令面板"
          title="命令面板"
          onClick={() => {
            setShortcutHelpOpen(false);
            setCommandPaletteOpen((open) => !open);
          }}
        >
          <Command className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", shortcutHelpOpen && "bg-accent text-foreground")}
          aria-label="打开快捷键帮助"
          title="快捷键"
          onClick={() => {
            setCommandPaletteOpen(false);
            setShortcutHelpOpen((open) => !open);
          }}
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </div>
      {commandPaletteOpen ? (
        <SketchCommandPalette actions={actionEntries} onClose={() => setCommandPaletteOpen(false)} />
      ) : null}
      {shortcutHelpOpen ? (
        <SketchShortcutHelp actions={actionEntries} onClose={() => setShortcutHelpOpen(false)} />
      ) : null}
      {quickToolbarPosition && floatingToolbarActions.length ? (
        <SketchFloatingToolbar
          left={quickToolbarPosition.left}
          top={quickToolbarPosition.top}
          actions={floatingToolbarActions}
          onPointerDown={() => activateSketchKeyboardScope(controller)}
        />
      ) : null}
      <div
        ref={stageRef}
        data-sketch-stage
        className="absolute left-0 top-0 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.35)] ring-1 ring-black/30"
        style={{
          width: fillContainer ? "100%" : width,
          height: fillContainer ? "100%" : height,
          transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
          transformOrigin: "0 0",
        }}
        onPointerDown={(event) => {
        if (mode !== "edit") return;
        activateSketchKeyboardScope(controller);
        updateHoveredNodeId(null);
        setImageFitEditNodeId(null);
        if (isSpacePanning) return;
          const target = event.target as Element;
          const nodeId = getSketchTargetNodeId(target);
          if (controller.tool === "hand") return;
          if (controller.tool === "select" && event.detail >= 2) {
            if (enterFocusedGroupFromEvent(target, event.clientX, event.clientY)) {
              event.preventDefault();
              return;
            }
            const editNodeId = getInlineTextEditNodeIdFromPoint(target, event.clientX, event.clientY);
            if (editNodeId) {
              event.preventDefault();
              return;
            }
          }
          if (controller.tool === "eraser") {
            const point = getPointerScenePoint(event, stageRef.current, scene);
            if (!point) return;
            event.preventDefault();
            capturePointer(event);
            const nodeId = getEraseTargetNodeId(point, target);
            eraseStateRef.current = { nodeIds: new Set(nodeId ? [nodeId] : []) };
            return;
          }
          if (controller.tool !== "select") {
            const point = getPointerScenePoint(event, stageRef.current, scene);
            if (!point) return;
            event.preventDefault();
            capturePointer(event);
            const start = clampScenePoint(point, scene);
            setActiveDrawingDraft({
              tool: controller.tool,
              start,
              current: start,
              points: [start],
              node: controller.tool === "text"
                ? createDrawingNode(controller.tool, start, start, scene, { allowClickText: true })
                : null,
            });
            return;
          }
          const point = getPointerScenePoint(event, stageRef.current, scene);
          if ((event.metaKey || event.ctrlKey) && point) {
            const candidateIds = getHitTestCandidateNodeIds(scene, point, configData);
            if (candidateIds.length) {
              event.preventDefault();
              const currentCandidateIndex = candidateIds.findIndex((id) => controller.selection.nodeIds.includes(id));
              const nextCandidateId = candidateIds[(currentCandidateIndex + 1) % candidateIds.length];
              controller.setNodeIds([nextCandidateId]);
              return;
            }
          }
          if (nodeId) {
            const node = scene.nodes.find((item) => item.id === nodeId);
            if (!node) return;
            const wasSelected = controller.selection.nodeIds.includes(node.id);
            const keepCurrentSelection =
              !event.shiftKey &&
              controller.selection.nodeIds.length > 1 &&
              wasSelected;
            let nextIds: string[];
            if (event.shiftKey) {
              nextIds = wasSelected
                ? controller.selection.nodeIds.filter((id) => id !== node.id)
                : [...controller.selection.nodeIds, node.id];
            } else {
              nextIds = keepCurrentSelection ? controller.selection.nodeIds : [node.id];
            }
            controller.setNodeIds(nextIds);
            if (event.shiftKey && wasSelected) return;
            if (node.locked) return;
            const dragNodes = scene.nodes.filter((item) => nextIds.includes(item.id) && !item.locked && isNodeVisibleForConfig(item, configData));
            if (point && dragNodes.length) {
              const duplicateOnDrag = event.altKey && !event.shiftKey;
              const nodesForDrag = duplicateOnDrag
                ? cloneSketchNodesForInsert(expandSketchNodesForInsert(scene, dragNodes, configData), { x: 0, y: 0 })
                : dragNodes;
              if (!nodesForDrag.length) return;
              capturePointer(event);
              setActiveDragStart({
                kind: "move",
                pointer: point,
                nodes: nodesForDrag,
                initialScene: scene,
                hasHistoryCheckpoint: false,
                duplicateOnDrag,
              });
            }
          } else {
            const point = getPointerScenePoint(event, stageRef.current, scene);
            if (!point) return;
            controller.clearSelection();
            capturePointer(event);
            setActiveMarquee({ start: point, current: point });
            setActiveDragStart({
              kind: "move",
              pointer: point,
              nodes: [],
              initialScene: scene,
              hasHistoryCheckpoint: false,
            });
          }
        }}
        onDoubleClick={(event) => {
          if (mode !== "edit") return;
          const target = event.target as Element;
          if (enterFocusedGroupFromEvent(target, event.clientX, event.clientY)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const nodeId = getInlineTextEditNodeIdFromPoint(target, event.clientX, event.clientY);
          if (!nodeId) return;
          if (!startInlineTextEdit(nodeId)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          if (mode !== "edit" || event.detail < 2) return;
          const target = event.target as Element;
          if (enterFocusedGroupFromEvent(target, event.clientX, event.clientY)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          const nodeId = getInlineTextEditNodeIdFromPoint(target, event.clientX, event.clientY);
          if (!nodeId || !startInlineTextEdit(nodeId)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerLeave={() => updateHoveredNodeId(null)}
      >
        <SketchPagePreview
          scene={previewScene}
          configData={configData}
          previewSize={{ width, height }}
          fillContainer={fillContainer}
        />
        <SelectionOverlay
          bounds={hoverSelectionBounds}
          scaleX={width / scene.pageSize.width}
          scaleY={height / scene.pageSize.height}
          minimumSize={8}
          variant="hover"
          testId="sketch-hover-highlight"
        />
        <SelectionOverlay
          bounds={canResizeSelection ? resizeSelectionBounds : canvasSelectionBounds}
          scaleX={width / scene.pageSize.width}
          scaleY={height / scene.pageSize.height}
          minimumSize={8}
          endpointHandles={lineEndpointHandles}
          showCenterPoint={Boolean(canvasSelectionBounds)}
          onResizePointerDown={
            canResizeSelection
              ? (event, handle) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!resizeSelectionBounds || !resizableSelectedNodes.length) return;
                  const point = getPointerScenePoint(event, stageRef.current, scene);
                  if (!point) return;
                  capturePointer(event);
                  setActiveDragStart({
                    kind: "resize",
                    pointer: point,
                    nodes: resizableSelectedNodes,
                    nodeId: resizableSelectedNodes.length === 1 ? resizableSelectedNodes[0].id : undefined,
                    resizeHandle: handle,
                    resizeBounds: resizeSelectionBounds,
                    initialScene: scene,
                    hasHistoryCheckpoint: false,
                  });
                }
              : undefined
          }
          onRotatePointerDown={
            canResizeSelection
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!resizeSelectionBounds || !resizableSelectedNodes.length) return;
                  const point = getPointerScenePoint(event, stageRef.current, scene);
                  if (!point) return;
                  const rotationCenter = {
                    x: resizeSelectionBounds.x + resizeSelectionBounds.width / 2,
                    y: resizeSelectionBounds.y + resizeSelectionBounds.height / 2,
                  };
                  capturePointer(event);
                  setActiveDragStart({
                    kind: "rotate",
                    pointer: point,
                    nodes: resizableSelectedNodes,
                    rotationCenter,
                    rotationStartAngle: getPointAngleDegrees(point, rotationCenter),
                    initialScene: scene,
                    hasHistoryCheckpoint: false,
                  });
                }
              : undefined
          }
        />
        <SelectionOverlay
          bounds={marquee ? boundsFromPoints(marquee.start, marquee.current) : null}
          scaleX={width / scene.pageSize.width}
          scaleY={height / scene.pageSize.height}
          variant="marquee"
          testId="sketch-marquee-box"
        />
        {snapGuides.map((guide) => (
          <span
            key={guide.id}
            data-testid="sketch-snap-guide"
            data-sketch-snap-guide-kind={guide.kind}
            aria-label={`吸附参考线：${guide.label}`}
            className={cn(
              "pointer-events-none absolute z-20",
              guide.kind === "grid" && "bg-slate-400/70",
              guide.kind === "center" && "bg-blue-500/80",
              guide.kind === "edge" && "bg-emerald-500/80",
              guide.kind === "spacing" && "bg-amber-500/80",
            )}
            style={
              guide.orientation === "vertical"
                ? {
                    left: guide.position * (width / scene.pageSize.width),
                    top: guide.from * (height / scene.pageSize.height),
                    width: 1,
                    height: Math.max(12, (guide.to - guide.from) * (height / scene.pageSize.height)),
                  }
                : {
                    left: guide.from * (width / scene.pageSize.width),
                    top: guide.position * (height / scene.pageSize.height),
                    width: Math.max(12, (guide.to - guide.from) * (width / scene.pageSize.width)),
                    height: 1,
                  }
            }
          >
            <span
              className={cn(
                "absolute rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm",
                guide.orientation === "vertical" ? "left-1 top-1" : "left-1 -top-5",
                guide.kind === "grid" && "bg-slate-600",
                guide.kind === "center" && "bg-blue-600",
                guide.kind === "edge" && "bg-emerald-600",
                guide.kind === "spacing" && "bg-amber-600",
              )}
            >
              {guide.label}
            </span>
          </span>
        ))}
        {connectorCandidatePoints.map((point) => (
          <span
            key={point.id}
            data-testid="sketch-connector-candidate-point"
            data-sketch-connector-bound={point.bound ? "true" : "false"}
            aria-label="连接候选点"
            className={cn(
              "pointer-events-none absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white",
              point.bound ? "bg-[#2563eb] shadow-[0_0_0_3px_rgba(37,99,235,0.35)]" : "bg-[#22c55e] shadow-[0_0_0_2px_rgba(34,197,94,0.35)]",
            )}
            style={{
              left: point.x * (width / scene.pageSize.width),
              top: point.y * (height / scene.pageSize.height),
            }}
          />
        ))}
        {dragModifierHint ? (
          <span
            data-testid="sketch-drag-modifier-hint"
            className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xl"
          >
            {dragModifierHint}
          </span>
        ) : null}
        {imageFitEditNode && imageFitEditBounds ? (
          <div
            role="toolbar"
            aria-label="图片裁剪适配编辑"
            data-testid="sketch-image-fit-editor"
            className="absolute z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 text-foreground shadow-2xl"
            style={{
              left: imageFitEditBounds.x * (width / scene.pageSize.width),
              top: Math.max(0, imageFitEditBounds.y * (height / scene.pageSize.height) - 42),
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              activateSketchKeyboardScope(controller);
            }}
          >
            {[
              { value: "cover", label: "裁切填满" },
              { value: "contain", label: "完整显示" },
              { value: "fill", label: "拉伸填满" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  (imageFitEditNode.style?.imageFit ?? "cover") === option.value && "bg-accent text-foreground",
                )}
                aria-label={`图片${option.label}`}
                onClick={() => {
                  controller.applyOperations([
                    {
                      op: "update",
                      nodeId: imageFitEditNode.id,
                      patch: { style: { ...imageFitEditNode.style, imageFit: option.value as NonNullable<NonNullable<SketchSceneNode["style"]>["imageFit"]> } },
                    },
                  ]);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {inlineTextEdit && inlineTextNode && inlineTextEditMetrics ? (
          <>
            <textarea
              ref={inlineTextRef}
              aria-label="画布文本编辑"
              className="absolute z-20 resize-none rounded-sm border border-[#3da0ff] bg-white/95 px-2 py-1 text-[#111827] outline-none ring-2 ring-[#3da0ff]/30"
              style={inlineTextEditMetrics.style}
              placeholder={inlineTextNode.type === "text" ? "输入文本" : "输入形状文本"}
              value={inlineTextEdit.value}
              onPointerDown={(event) => {
                event.stopPropagation();
                activateSketchKeyboardScope(controller);
              }}
              onPointerUp={(event) => updateInlineTextSelection(event.currentTarget, inlineTextNode.id)}
              onSelect={(event) => updateInlineTextSelection(event.currentTarget, inlineTextNode.id)}
              onChange={(event) => {
                updateInlineTextSelection(event.currentTarget, inlineTextNode.id);
                setInlineTextEdit({ ...inlineTextEdit, value: event.target.value });
              }}
              onBlur={commitInlineTextEdit}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelInlineTextEdit();
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.stopPropagation();
                  commitInlineTextEdit();
                }
              }}
              onKeyUp={(event) => updateInlineTextSelection(event.currentTarget, inlineTextNode.id)}
            />
            {inlineTextEditMetrics.overflowing ? (
              <span
                data-testid="sketch-inline-text-overflow"
                className="pointer-events-none absolute z-20 rounded bg-[#111827] px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm"
                style={{
                  left: (inlineTextEditMetrics.style.left as number),
                  top: (inlineTextEditMetrics.style.top as number) + (inlineTextEditMetrics.style.height as number) + 4,
                }}
              >
                文本超出
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {contextMenu ? (
        <div
          role="menu"
          aria-label="草图右键菜单"
          className="absolute z-30 min-w-36 overflow-hidden rounded-md border border-border bg-card py-1 text-sm text-foreground shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => {
            event.stopPropagation();
            activateSketchKeyboardScope(controller);
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <ContextMenuButton
            label="复制"
            disabled={!editableSelectedNodes.length}
            onClick={() => runContextMenuAction(() => duplicateSelected(scene, controller, configData))}
          />
          <ContextMenuButton
            label="删除"
            disabled={!editableSelectedNodes.length}
            onClick={() => runContextMenuAction(() => deleteSelected(scene, controller, configData))}
          />
          <ContextMenuSeparator />
          <ContextMenuButton
            label="复制 SVG"
            disabled={!visibleSelectedNodes.length}
            onClick={() => runContextMenuAction(() => void copySvgToClipboardOrDownload(createExportScene(scene, visibleSelectedNodes), `${visibleSelectedNodes[0]?.id || "selection"}.svg`, { withBackground: false }))}
          />
          <ContextMenuButton
            label="复制 PNG"
            disabled={!visibleSelectedNodes.length}
            onClick={() => runContextMenuAction(() => void copyPngToClipboardOrDownload(createExportScene(scene, visibleSelectedNodes), `${visibleSelectedNodes[0]?.id || "selection"}.png`, { scale: 1, withBackground: false }))}
          />
          <ContextMenuButton
            label="导出选区"
            disabled={!visibleSelectedNodes.length}
            onClick={() => runContextMenuAction(() => downloadTextFile(`${visibleSelectedNodes[0]?.id || "selection"}.svg`, renderExportSvgMarkup(createExportScene(scene, visibleSelectedNodes), { withBackground: false }), "image/svg+xml;charset=utf-8"))}
          />
          <ContextMenuButton
            label="导出整页"
            onClick={() => runContextMenuAction(() => downloadTextFile("sketch-page.svg", renderExportSvgMarkup(scene, { withBackground: false }), "image/svg+xml;charset=utf-8"))}
          />
          <ContextMenuSeparator />
          <ContextMenuButton
            label="置顶"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runContextMenuAction(() => bringToFront(scene, controller, configData))}
          />
          <ContextMenuButton
            label="上移一层"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runContextMenuAction(() => bringForward(scene, controller, configData))}
          />
          <ContextMenuButton
            label="下移一层"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runContextMenuAction(() => sendBackward(scene, controller, configData))}
          />
          <ContextMenuButton
            label="置底"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runContextMenuAction(() => sendToBack(scene, controller, configData))}
          />
          <ContextMenuSeparator />
          <ContextMenuButton
            label="左对齐"
            disabled={layerEditableSelectedNodes.length < 2}
            onClick={() => runContextMenuAction(() => alignSelected(scene, controller, "left", configData))}
          />
          <ContextMenuButton
            label="顶对齐"
            disabled={layerEditableSelectedNodes.length < 2}
            onClick={() => runContextMenuAction(() => alignSelected(scene, controller, "top", configData))}
          />
          <ContextMenuButton
            label="水平分布"
            disabled={layerEditableSelectedNodes.length < 3}
            onClick={() => runContextMenuAction(() => distributeSelectedHorizontally(scene, controller, configData))}
          />
          <ContextMenuButton
            label="垂直分布"
            disabled={layerEditableSelectedNodes.length < 3}
            onClick={() => runContextMenuAction(() => distributeSelectedVertically(scene, controller, configData))}
          />
          <ContextMenuSeparator />
          <ContextMenuButton
            label={lockableSelectedNodes.length && lockableSelectedNodes.every((node) => node.locked) ? "解锁" : "锁定"}
            disabled={!lockableSelectedNodes.length}
            onClick={() => runContextMenuAction(() => toggleLocked(scene, controller, configData))}
          />
          <ContextMenuButton
            label={visibleToggleSelectedNodes.length && visibleToggleSelectedNodes.every((node) => node.visible !== false) ? "隐藏" : "显示"}
            disabled={!visibleToggleSelectedNodes.length}
            onClick={() => runContextMenuAction(() => toggleVisible(scene, controller, configData))}
          />
          <ContextMenuSeparator />
          <ContextMenuButton
            label="成组"
            disabled={!canGroupSelection}
            onClick={() => runContextMenuAction(() => groupSelected(scene, controller, configData))}
          />
          <ContextMenuButton
            label="解组"
            disabled={!canUngroupSelection}
            onClick={() => runContextMenuAction(() => ungroupSelected(scene, controller))}
          />
        </div>
      ) : null}
    </div>
  );
}

function SketchFloatingToolbar({
  left,
  top,
  actions,
  onPointerDown,
}: {
  left: number;
  top: number;
  actions: SketchFloatingToolbarAction[];
  onPointerDown: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="草图悬浮快捷工具条"
      className="pointer-events-none absolute z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card/95 p-1 text-foreground shadow-2xl"
      style={{ left, top }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="pointer-events-auto inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={action.disabled}
          aria-label={`悬浮${action.label}`}
          title={action.title ?? action.label}
          onClick={action.onClick}
        >
          {action.swatchColor ? (
            <span className="h-3.5 w-3.5 rounded-sm border border-border" style={{ backgroundColor: action.swatchColor }} aria-hidden="true" />
          ) : (
            action.icon
          )}
          <span className="max-w-14 truncate">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function ContextMenuSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />;
}

function ContextMenuButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex h-8 w-full items-center px-3 text-left text-sm hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function SketchPageEditor({
  scene,
  configData = {},
  previewSize,
  fillContainer = false,
  className,
  mode = "edit",
  onSceneChange,
  onSelectionChange,
}: SketchPageEditorProps) {
  const parsedScene = useMemo(() => parseScene(scene), [scene]);
  const controller = useSketchEditorState(parsedScene, onSceneChange, onSelectionChange, configData);

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col overflow-hidden bg-slate-100", className)}>
      <SketchEditorCanvas
        scene={parsedScene}
        controller={controller}
        configData={configData}
        previewSize={previewSize}
        fillContainer={fillContainer}
        mode={mode}
      />
      {mode === "edit" ? (
        <>
          <SketchEditorToolbar scene={parsedScene} controller={controller} configData={configData} />
          <div className="max-h-72 min-h-0 border-t border-slate-200 bg-white">
            <SketchPropertyPanel scene={parsedScene} controller={controller} configData={configData} className="h-full" />
          </div>
        </>
      ) : null}
    </div>
  );
}
