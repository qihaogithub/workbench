"use client";

import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ArrowRight,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardPaste,
  Command,
  Copy,
  Diamond,
  Eraser,
  Eye,
  EyeOff,
  Group,
  Hand,
  ImageIcon,
  Italic,
  Keyboard,
  Link2,
  Lock,
  LocateFixed,
  Layers,
  MoreHorizontal,
  MousePointer2,
  PaintBucket,
  Pencil,
  PenLine,
  Redo2,
  RotateCcw,
  Rows3,
  Scissors,
  Square,
  StickyNote,
  SlidersHorizontal,
  Trash2,
  Type,
  Ungroup,
  Undo2,
  Underline,
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
import type {
  PreviewSize,
  SketchTool,
  SketchEditorSelection,
  SketchPagePreviewProps,
  SketchPageEditorProps,
  SketchEditorSurfaceProps,
  SketchEditorController,
  SketchEditorCanvasProps,
  SketchPropertyPanelProps,
  SketchEditorToolbarProps,
  SketchLayerPanelProps,
  InlineTextSelectionState,
} from "./types";
import {
  getSketchTextAutoSize,
  getSketchTextComputedStyle,
  SKETCH_TEXT_DEFAULT_COLOR,
  SKETCH_TEXT_DEFAULT_FONT_SIZE,
  SKETCH_TEXT_DEFAULT_FONT_WEIGHT,
  SKETCH_TEXT_PLACEHOLDER,
  SKETCH_TEXT_MIN_SIZE,
  type SketchTextComputedStyle,
} from "./text-utils";

type SketchResizeInteractionHandle = SketchSceneResizeHandle | "line-start" | "line-end";
type SketchSnapGuideKind = "grid" | "center" | "edge";

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
  sourceNodeIds?: string[];
  selectionNodeIds?: string[];
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
  style: SketchSceneStyle;
  textStyleRuns?: SketchSceneNode["textStyleRuns"];
  deleteWhenEmpty?: boolean;
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
  swatchKind?: "fill" | "stroke";
  swatchMixed?: boolean;
  ariaHasPopup?: React.AriaAttributes["aria-haspopup"];
  ariaExpanded?: boolean;
  disabled?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const EMPTY_SKETCH_FLOATING_TOOLBAR_ACTIONS: SketchFloatingToolbarAction[] = [];

const SKETCH_FLOATING_TOOLBAR_EDGE_PADDING = 16;
const SKETCH_ALIGNMENT_MENU_WIDTH = 235;
const SKETCH_ALIGNMENT_MENU_HEIGHT = 42;

function resolveSketchFloatingToolbarLeft(
  desiredLeft: number,
  containerWidth: number,
  toolbarWidth: number | null,
): number {
  if (!toolbarWidth || toolbarWidth <= 0 || !Number.isFinite(toolbarWidth)) return containerWidth / 2;

  const minLeft = SKETCH_FLOATING_TOOLBAR_EDGE_PADDING + toolbarWidth / 2;
  const maxLeft = containerWidth - SKETCH_FLOATING_TOOLBAR_EDGE_PADDING - toolbarWidth / 2;
  if (maxLeft < minLeft) return containerWidth / 2;
  return Math.min(maxLeft, Math.max(minLeft, desiredLeft));
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
    const textNode: SketchSceneNode = {
      ...base,
      type: "text",
      width: SKETCH_TEXT_MIN_SIZE,
      height: SKETCH_TEXT_MIN_SIZE,
      text: "",
      style: {
        ...base.style,
        fill: "transparent",
        stroke: "transparent",
        color: SKETCH_TEXT_DEFAULT_COLOR,
        fontSize: SKETCH_TEXT_DEFAULT_FONT_SIZE,
        fontWeight: SKETCH_TEXT_DEFAULT_FONT_WEIGHT,
        italic: false,
        textDecoration: "none",
        textAlign: "left",
      },
    };
    const size = getSketchTextAutoSize(textNode, "");
    return { ...textNode, width: size.width, height: size.height };
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

function getSketchGroupParentMap(scene: SketchSceneDocument): Map<string, string> {
  const parentByChild = new Map<string, string>();
  scene.nodes
    .filter((node) => node.type === "group")
    .forEach((group) => {
      (group.children ?? []).forEach((childId) => {
        if (!parentByChild.has(childId)) parentByChild.set(childId, group.id);
      });
    });
  return parentByChild;
}

function getSketchGroupAncestorIds(scene: SketchSceneDocument, nodeId: string): string[] {
  const parentByChild = getSketchGroupParentMap(scene);
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let currentId = nodeId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const parentId = parentByChild.get(currentId);
    if (!parentId) break;
    ancestors.push(parentId);
    currentId = parentId;
  }
  return ancestors;
}

function getSketchOutermostGroupId(scene: SketchSceneDocument, nodeId: string): string | null {
  const ancestors = getSketchGroupAncestorIds(scene, nodeId);
  return ancestors[ancestors.length - 1] ?? null;
}

function getSketchDirectGroupChildId(
  scene: SketchSceneDocument,
  groupId: string,
  nodeId: string,
): string | null {
  const parentByChild = getSketchGroupParentMap(scene);
  const visited = new Set<string>();
  let currentId = nodeId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const parentId = parentByChild.get(currentId);
    if (!parentId) return null;
    if (parentId === groupId) return currentId;
    currentId = parentId;
  }
  return null;
}

function getSketchCanvasHitNodeId(
  scene: SketchSceneDocument,
  target: Element,
  point: { x: number; y: number } | null,
  configData?: Record<string, unknown>,
): string | null {
  const directNodeId = getSketchTargetNodeId(target);
  const directNode = directNodeId ? scene.nodes.find((node) => node.id === directNodeId) : null;
  if (directNode && directNode.type !== "group" && isNodeVisibleForConfig(directNode, configData)) {
    return directNode.id;
  }
  return point ? hitTestSketchScene(scene, point, configData)?.id ?? null : null;
}

interface SketchCanvasSelectionTarget {
  hitNodeId: string;
  groupId: string | null;
  selectionNodeId: string;
}

function resolveSketchCanvasSelectionTarget(
  scene: SketchSceneDocument,
  hitNodeId: string,
  focusedGroupId: string | null,
): SketchCanvasSelectionTarget {
  const outermostGroupId = getSketchOutermostGroupId(scene, hitNodeId);
  if (focusedGroupId) {
    const directChildId = getSketchDirectGroupChildId(scene, focusedGroupId, hitNodeId);
    if (directChildId) {
      return {
        hitNodeId,
        groupId: outermostGroupId ?? focusedGroupId,
        selectionNodeId: directChildId,
      };
    }
  }
  return {
    hitNodeId,
    groupId: outermostGroupId,
    selectionNodeId: outermostGroupId ?? hitNodeId,
  };
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
  allowedTools?: readonly SketchTool[],
) {
  const keyboardScopeId = React.useId();
  const [tool, setToolState] = React.useState<SketchTool>("select");
  const [inlineTextSelection, setInlineTextSelection] = React.useState<InlineTextSelectionState | null>(null);
  const selectionState = useSketchSelection(scene, onSelectionChange, configData);
  const history = useSketchHistory(scene, onSceneChange);
  const setTool = React.useCallback((nextTool: SketchTool) => {
    if (allowedTools && !allowedTools.includes(nextTool)) return;
    setToolState(nextTool);
  }, [allowedTools]);
  React.useEffect(() => {
    if (allowedTools && !allowedTools.includes(tool)) setToolState("select");
  }, [allowedTools, tool]);

  return {
    keyboardScopeId,
    tool,
    setTool,
    allowedTools,
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
  viewportScale = 1,
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
  viewportScale?: number;
  onResizePointerDown?: (event: React.PointerEvent<HTMLDivElement>, handle: SketchResizeInteractionHandle) => void;
  onRotatePointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
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
  const controlScale = Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1;
  const resizeHandleSize = 12 / controlScale;
  const rotateHandleSize = 24 / controlScale;
  const rotateHandleGap = 28 / controlScale;
  const rotateIconSize = 14 / controlScale;
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
        <button
          type="button"
          aria-label="旋转控制柄"
          className="pointer-events-auto absolute bottom-0 left-0 inline-flex cursor-grab appearance-none items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.18)] transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 active:cursor-grabbing"
          data-testid="sketch-rotate-handle"
          data-sketch-rotate-handle="true"
          title="旋转"
          style={{
            width: rotateHandleSize,
            height: rotateHandleSize,
            left: -(rotateHandleSize + rotateHandleGap),
            bottom: -(rotateHandleSize + rotateHandleGap),
          }}
          onPointerDown={onRotatePointerDown}
        >
          <RotateCcw style={{ width: rotateIconSize, height: rotateIconSize }} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
      {onResizePointerDown && endpointHandles
        ? ([
            { key: "start", point: endpointHandles.start, handle: "line-start" as const, testId: "sketch-resize-handle-line-start" },
            { key: "end", point: endpointHandles.end, handle: "line-end" as const, testId: "sketch-resize-handle" },
          ]).map((item) => (
            <div
              key={item.key}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-slate-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] transition-colors hover:border-slate-400 hover:bg-slate-50"
              data-testid={item.testId}
              data-sketch-resize-handle={item.handle}
              style={{
                left: item.point.x * scaleX - left,
                top: item.point.y * scaleY - top,
                width: resizeHandleSize,
                height: resizeHandleSize,
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
                "pointer-events-auto absolute border border-slate-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] transition-colors hover:border-slate-400 hover:bg-slate-50",
                item.className,
                item.cursor,
              )}
              data-testid={item.handle === "se" ? "sketch-resize-handle" : `sketch-resize-handle-${item.handle}`}
              data-sketch-resize-handle={item.handle}
              style={{ width: resizeHandleSize, height: resizeHandleSize }}
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

const SKETCH_COLOR_PALETTE = [
  ["#ffffff", "#000000", "#e5e7eb", "#475569", "#3b82f6", "#14b8a6", "#0ea5e9", "#7c3aed", "#f59e0b", "#ef4444"],
  ["#fafafa", "#18181b", "#f3f4f6", "#e2e8f0", "#dbeafe", "#ccfbf1", "#e0f2fe", "#ede9fe", "#fffbeb", "#fef2f2"],
  ["#f4f4f5", "#27272a", "#d1d5db", "#cbd5e1", "#bfdbfe", "#99f6e4", "#bae6fd", "#ddd6fe", "#fef3c7", "#fee2e2"],
  ["#e4e4e7", "#3f3f46", "#9ca3af", "#94a3b8", "#93c5fd", "#5eead4", "#7dd3fc", "#c4b5fd", "#fde68a", "#fecaca"],
  ["#d4d4d8", "#52525b", "#6b7280", "#64748b", "#2563eb", "#0d9488", "#0284c7", "#6d28d9", "#d97706", "#dc2626"],
  ["#a1a1aa", "#71717a", "#4b5563", "#334155", "#1d4ed8", "#0f766e", "#0369a1", "#5b21b6", "#b45309", "#b91c1c"],
];

const SKETCH_COLOR_SWATCHES = SKETCH_COLOR_PALETTE.flat();

const SKETCH_TEXT_SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

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
  const computedTextStyle = getSketchTextComputedStyle(node);
  if (isFreestandingText) {
    const autoSize = getSketchTextAutoSize(node, value);
    return {
      style: {
        left: node.x,
        top: node.y,
        width: autoSize.width,
        height: autoSize.height,
        boxSizing: "border-box",
        padding: 0,
        overflowX: "hidden",
        overflowY: "hidden",
        fontFamily: computedTextStyle.fontFamily,
        fontSize: computedTextStyle.fontSize,
        fontWeight: computedTextStyle.fontWeight,
        fontStyle: computedTextStyle.italic ? "italic" : "normal",
        textDecoration: computedTextStyle.textDecoration,
        color: computedTextStyle.color,
        caretColor: computedTextStyle.color,
        lineHeight: `${computedTextStyle.lineHeight}px`,
        textAlign: style.textAlign ?? "left",
        transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
        transformOrigin: "center",
      },
      overflowing: false,
    };
  }
  const fullTextRunStyle = supportsTextStyle(node) ? getFullTextStyleRunStyle(node) : {};
  const lineHeight = Math.round(fullTextRunStyle.lineHeight ?? fontSize * 1.35);
  const lineCount = Math.max(1, value.split("\n").length);
  const textHeight = Math.max(lineHeight, lineCount * lineHeight);
  const paddingX = Math.min(16, Math.max(8, width * 0.08));
  const paddingY = Math.min(12, Math.max(6, height * 0.12));
  const editWidth = Math.max(32, width - paddingX * 2);
  const availableHeight = Math.max(28, height - paddingY * 2);
  const editHeight = Math.max(lineHeight, Math.min(availableHeight, textHeight));
  const overflowing = textHeight > availableHeight;
  const left = node.x + (width - editWidth) / 2;
  const top = node.y + paddingY + Math.max(0, (availableHeight - editHeight) / 2);

  return {
    style: {
      left,
      top,
      width: editWidth,
      height: editHeight,
      boxSizing: "border-box",
      padding: 0,
      overflowX: "auto",
      overflowY: overflowing ? "auto" : "hidden",
      fontFamily: computedTextStyle.fontFamily,
      fontSize,
      fontWeight: style.fontWeight ?? (node.type === "text" ? 400 : 500),
      fontStyle: computedTextStyle.italic ? "italic" : "normal",
      textDecoration: computedTextStyle.textDecoration,
      color: style.color ?? "#111827",
      caretColor: style.color ?? "#111827",
      lineHeight: `${lineHeight}px`,
      textAlign: style.textAlign ?? (isFreestandingText ? "left" : "center"),
      transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
      transformOrigin: "center",
    },
    overflowing,
  };
}

function isSketchNoColor(value: unknown): boolean {
  return value === "transparent" || value === null || typeof value === "undefined";
}

function toColorInputValue(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function getSketchColorFieldValue(value: unknown, fallback: string, allowNoColor = false): string {
  if (allowNoColor && isSketchNoColor(value)) return "transparent";
  return toColorInputValue(value, fallback);
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

function getTextStyleStateValue<K extends keyof SketchTextComputedStyle>(
  node: SketchSceneNode,
  range: { start: number; end: number } | null,
  property: K,
): { value: SketchTextComputedStyle[K] | undefined; mixed: boolean } {
  const textLength = node.text?.length ?? 0;
  const start = range ? Math.max(0, Math.min(textLength, range.start)) : 0;
  const end = range ? Math.max(start, Math.min(textLength, range.end)) : Math.min(1, textLength);
  const values = range && end > start
    ? Array.from({ length: end - start }, (_, index) => getSketchTextComputedStyle(node, start + index)[property])
    : [getSketchTextComputedStyle(node)[property]];
  const firstValue = values[0];
  return {
    value: firstValue,
    mixed: values.some((value) => !valuesEqual(value, firstValue)),
  };
}

function isSketchBoldFontWeight(value: SketchTextComputedStyle["fontWeight"] | undefined): boolean {
  if (typeof value === "number") return value >= 600;
  return value === "bold" || value === "bolder" || Number(value) >= 600;
}

function getTextStylePatchForRange(
  node: SketchSceneNode,
  range: { start: number; end: number } | null,
  stylePatch: SketchSceneTextStyleOverride,
  defaultStylePatch: SketchSceneStyle,
): Partial<SketchSceneNode> {
  if (!range) {
    return { style: { ...node.style, ...defaultStylePatch } };
  }
  return {
    textStyleRuns: updateTextStyleRunsForRange(node, range, (style) => ({
      ...style,
      ...stylePatch,
    })),
  };
}

function cloneSketchTextStyleRuns(runs: SketchSceneNode["textStyleRuns"]): SketchSceneNode["textStyleRuns"] {
  return runs?.map((run) => ({ ...run, style: { ...run.style } }));
}

function normalizeSketchTextStyleRuns(
  text: string,
  runs: SketchSceneNode["textStyleRuns"],
): SketchSceneNode["textStyleRuns"] {
  if (!runs?.length || !text.length) return undefined;
  const normalized = runs
    .map((run) => {
      const start = Math.max(0, Math.min(text.length, Math.floor(run.start)));
      const end = Math.max(start, Math.min(text.length, Math.floor(run.start + run.length)));
      return { ...run, start, length: end - start, style: { ...run.style } };
    })
    .filter((run) => run.length > 0)
    .sort((left, right) => left.start - right.start);
  if (!normalized.length) return undefined;
  return normalized;
}

function createInlineTextEditState(node: SketchSceneNode, deleteWhenEmpty = false): InlineTextEditState {
  return {
    nodeId: node.id,
    value: node.text ?? "",
    style: { ...node.style },
    textStyleRuns: cloneSketchTextStyleRuns(node.textStyleRuns),
    deleteWhenEmpty,
  };
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

interface SketchSelectionToolbarContext {
  grouped: boolean;
  groupNodes: SketchSceneNode[];
  visibleLeafNodes: SketchSceneNode[];
  graphicNodes: SketchSceneNode[];
  pureTextNodes: SketchSceneNode[];
  editableLeafNodes: SketchSceneNode[];
  fillStyleNodes: SketchSceneNode[];
  strokeStyleNodes: SketchSceneNode[];
}

function getSelectionVisibleLeafNodes(
  scene: SketchSceneDocument,
  nodes: SketchSceneNode[],
  configData?: Record<string, unknown>,
): SketchSceneNode[] {
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const leafIds = new Set<string>();
  const leaves: SketchSceneNode[] = [];
  const visit = (node: SketchSceneNode) => {
    if (node.type === "group") {
      for (const childId of node.children ?? []) {
        const child = nodesById.get(childId);
        if (child) visit(child);
      }
      return;
    }
    if (leafIds.has(node.id) || !isNodeVisibleForConfig(node, configData)) return;
    leafIds.add(node.id);
    leaves.push(node);
  };
  nodes.forEach(visit);
  return leaves;
}

function getSelectionMoveNodes(
  scene: SketchSceneDocument,
  nodes: SketchSceneNode[],
  configData?: Record<string, unknown>,
): SketchSceneNode[] {
  return getSelectionVisibleLeafNodes(scene, nodes, configData).filter(canEditNodeProperties);
}

function getSketchSelectionToolbarContext(
  scene: SketchSceneDocument,
  nodes: SketchSceneNode[],
  configData?: Record<string, unknown>,
): SketchSelectionToolbarContext {
  const groupNodes = nodes.filter((node) => node.type === "group");
  const visibleLeafNodes = getSelectionVisibleLeafNodes(scene, nodes, configData);
  const graphicNodes = visibleLeafNodes.filter((node) => node.type !== "text");
  const pureTextNodes = visibleLeafNodes.filter((node) => node.type === "text");
  const editableLeafNodes = visibleLeafNodes.filter((node) => canEditNodeProperties(node));
  return {
    grouped: groupNodes.length > 0,
    groupNodes,
    visibleLeafNodes,
    graphicNodes,
    pureTextNodes,
    editableLeafNodes,
    fillStyleNodes: editableLeafNodes.filter(supportsFillStyle),
    strokeStyleNodes: editableLeafNodes.filter(supportsStrokeStyle),
  };
}

function getSketchSelectionVisualBounds(
  scene: SketchSceneDocument,
  nodes: SketchSceneNode[],
  configData?: Record<string, unknown>,
): SketchSceneBounds | null {
  const context = getSketchSelectionToolbarContext(scene, nodes, configData);
  if (context.visibleLeafNodes.length) return getSketchSelectionBounds(context.visibleLeafNodes);
  const fallbackNodes = nodes.filter((node) => node.type === "group" || isNodeVisibleForConfig(node, configData));
  return getSketchSelectionBounds(fallbackNodes);
}

function getLayerOperationSelectedNodes(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  configData?: Record<string, unknown>,
): SketchSceneNode[] {
  const selectedIds = new Set<string>();
  const visitedIds = new Set<string>();
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const include = (node: SketchSceneNode, fromGroup = false) => {
    if (visitedIds.has(node.id)) return;
    visitedIds.add(node.id);
    if (node.type === "group") {
      selectedIds.add(node.id);
      for (const childId of node.children ?? []) {
        const child = nodesById.get(childId);
        if (child) include(child, true);
      }
      return;
    }
    if (!fromGroup && (node.locked || node.visible === false || !isNodeVisibleForConfig(node, configData))) return;
    selectedIds.add(node.id);
  };
  getSelectedNodes(scene, controller).forEach((node) => include(node));
  return getVisualLayerNodes(scene).filter((node) => selectedIds.has(node.id));
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
  const draggedIds = new Set([
    ...dragState.nodes.map((node) => node.id),
    ...(dragState.sourceNodeIds ?? []),
  ]);
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

  }

  return guides.slice(0, 6);
}

interface SketchSnapDeltaCandidate {
  distance: number;
  delta: number;
}

function pickSketchSnapDelta(candidates: SketchSnapDeltaCandidate[]): number {
  return [...candidates].sort((a, b) => a.distance - b.distance)[0]?.delta ?? 0;
}

function getSketchSnapDelta(
  scene: SketchSceneDocument,
  dragState: DragState,
  previewNodes: SketchSceneNode[],
  configData?: Record<string, unknown>,
): { x: number; y: number } {
  if (dragState.kind !== "move" || isSnapGuideSuppressed(dragState)) return { x: 0, y: 0 };
  const bounds = getSketchSelectionBounds(previewNodes);
  if (!bounds) return { x: 0, y: 0 };

  const threshold = 4;
  const verticalCandidates: SketchSnapDeltaCandidate[] = [];
  const horizontalCandidates: SketchSnapDeltaCandidate[] = [];
  const draggedIds = new Set([
    ...dragState.nodes.map((node) => node.id),
    ...(dragState.sourceNodeIds ?? []),
  ]);
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;
  const addCandidate = (candidates: SketchSnapDeltaCandidate[], delta: number) => {
    const distance = Math.abs(delta);
    if (distance <= threshold) candidates.push({ distance, delta });
  };

  addCandidate(verticalCandidates, scene.pageSize.width / 2 - boundsCenterX);
  addCandidate(horizontalCandidates, scene.pageSize.height / 2 - boundsCenterY);

  for (const node of scene.nodes) {
    if (draggedIds.has(node.id) || !isNodeVisibleForConfig(node, configData) || node.type === "group") continue;
    const targetBounds = getSketchNodeBounds(node);
    const targetCenterX = targetBounds.x + targetBounds.width / 2;
    const targetCenterY = targetBounds.y + targetBounds.height / 2;
    addCandidate(verticalCandidates, targetBounds.x - bounds.x);
    addCandidate(verticalCandidates, targetBounds.x + targetBounds.width - (bounds.x + bounds.width));
    addCandidate(verticalCandidates, targetCenterX - boundsCenterX);
    addCandidate(horizontalCandidates, targetBounds.y - bounds.y);
    addCandidate(horizontalCandidates, targetBounds.y + targetBounds.height - (bounds.y + bounds.height));
    addCandidate(horizontalCandidates, targetCenterY - boundsCenterY);
  }

  return {
    x: pickSketchSnapDelta(verticalCandidates),
    y: pickSketchSnapDelta(horizontalCandidates),
  };
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

export async function renderSketchSceneToPngBlob(
  scene: SketchSceneDocument,
  options: SketchExportOptions = { scale: 1, withBackground: true },
): Promise<Blob> {
  const svgMarkup = renderExportSvgMarkup(scene, { withBackground: options.withBackground });
  const blob = await renderSvgToPngBlob(svgMarkup, scene.pageSize, options.scale, options.withBackground);
  if (!blob) throw new Error("SKETCH_PNG_EXPORT_FAILED");
  return blob;
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
  let pngBlob: Blob | null = null;
  try { pngBlob = await renderSketchSceneToPngBlob(scene, options); } catch { /* retain legacy SVG download fallback */ }
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

type SketchLayerOrderAction = "front" | "forward" | "backward" | "back";

function moveSelectedLayerUnit(
  visualNodes: SketchSceneNode[],
  selectedIds: Set<string>,
  action: SketchLayerOrderAction,
): SketchSceneNode[] {
  const selectedNodes = visualNodes.filter((node) => selectedIds.has(node.id));
  if (!selectedNodes.length) return visualNodes;
  if (action === "front") {
    return [...visualNodes.filter((node) => !selectedIds.has(node.id)), ...selectedNodes];
  }
  if (action === "back") {
    return [...selectedNodes, ...visualNodes.filter((node) => !selectedIds.has(node.id))];
  }

  const selectedIndexes = visualNodes
    .map((node, index) => selectedIds.has(node.id) ? index : -1)
    .filter((index) => index >= 0);
  const firstSelectedIndex = Math.min(...selectedIndexes);
  const lastSelectedIndex = Math.max(...selectedIndexes);
  const remainingNodes = visualNodes.filter((node) => !selectedIds.has(node.id));
  if (action === "forward") {
    const nextNode = visualNodes.slice(lastSelectedIndex + 1).find((node) => !selectedIds.has(node.id));
    if (!nextNode) return visualNodes;
    const nextIndex = remainingNodes.indexOf(nextNode);
    remainingNodes.splice(nextIndex + 1, 0, ...selectedNodes);
    return remainingNodes;
  }
  const previousNode = [...visualNodes.slice(0, firstSelectedIndex)].reverse().find((node) => !selectedIds.has(node.id));
  if (!previousNode) return visualNodes;
  const previousIndex = remainingNodes.indexOf(previousNode);
  remainingNodes.splice(previousIndex, 0, ...selectedNodes);
  return remainingNodes;
}

function applyLayerOrderAction(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  action: SketchLayerOrderAction,
  configData?: Record<string, unknown>,
) {
  const selectedNodes = getLayerOperationSelectedNodes(scene, controller, configData);
  if (!selectedNodes.length) return;
  const currentNodes = getVisualLayerNodes(scene);
  const nextNodes = moveSelectedLayerUnit(currentNodes, new Set(selectedNodes.map((node) => node.id)), action);
  const currentIds = currentNodes.map((node) => node.id);
  const nextIds = nextNodes.map((node) => node.id);
  if (nextIds.every((nodeId, index) => nodeId === currentIds[index])) return;
  controller.applyOperations([{ op: "reorder", nodeIds: nextIds }]);
}

function bringToFront(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  applyLayerOrderAction(scene, controller, "front", configData);
}

function bringForward(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  applyLayerOrderAction(scene, controller, "forward", configData);
}

function sendToBack(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  applyLayerOrderAction(scene, controller, "back", configData);
}

function sendBackward(scene: SketchSceneDocument, controller: SketchEditorController, configData?: Record<string, unknown>) {
  applyLayerOrderAction(scene, controller, "backward", configData);
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

type SketchAlignmentAxis = "left" | "center" | "right" | "top" | "middle" | "bottom";

function alignSelected(scene: SketchSceneDocument, controller: SketchEditorController, axis: SketchAlignmentAxis, configData?: Record<string, unknown>) {
  const selectedNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  const bounds = getSketchSelectionBounds(selectedNodes);
  if (!bounds || selectedNodes.length < 2) return;
  controller.applyOperations(
    selectedNodes.map((node) => {
      const nodeBounds = getSketchNodeBounds(node);
      const targetLeft = axis === "left"
        ? bounds.x
        : axis === "center"
          ? bounds.x + (bounds.width - nodeBounds.width) / 2
          : bounds.x + bounds.width - nodeBounds.width;
      const targetTop = axis === "top"
        ? bounds.y
        : axis === "middle"
          ? bounds.y + (bounds.height - nodeBounds.height) / 2
          : bounds.y + bounds.height - nodeBounds.height;
      return {
        op: "update",
        nodeId: node.id,
        patch: axis === "left" || axis === "center" || axis === "right"
          ? { x: node.x + targetLeft - nodeBounds.x }
          : { y: node.y + targetTop - nodeBounds.y },
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
  layerOperationSelectedNodes,
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
  layerOperationSelectedNodes: SketchSceneNode[];
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
  const noLayerEditableSelection = layerOperationSelectedNodes.length ? undefined : "当前选择不可排序";
  const tools = TOOL_OPTIONS.filter((item) => !controller.allowedTools || controller.allowedTools.includes(item.tool)).map<SketchActionEntry>((item) => ({
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
      id: "arrange.alignCenter",
      section: "arrange",
      label: "水平居中",
      description: "按选择边界水平中心对齐",
      shortcuts: [],
      disabledReason: layerEditableSelectedNodes.length >= 2 ? undefined : "至少选择两个可编辑对象",
      run: () => alignSelected(scene, controller, "center", configData),
    },
    {
      id: "arrange.alignRight",
      section: "arrange",
      label: "右对齐",
      description: "按选择边界右侧对齐",
      shortcuts: [],
      disabledReason: layerEditableSelectedNodes.length >= 2 ? undefined : "至少选择两个可编辑对象",
      run: () => alignSelected(scene, controller, "right", configData),
    },
    {
      id: "arrange.alignMiddle",
      section: "arrange",
      label: "垂直居中",
      description: "按选择边界垂直中心对齐",
      shortcuts: [],
      disabledReason: layerEditableSelectedNodes.length >= 2 ? undefined : "至少选择两个可编辑对象",
      run: () => alignSelected(scene, controller, "middle", configData),
    },
    {
      id: "arrange.alignBottom",
      section: "arrange",
      label: "底对齐",
      description: "按选择边界底部对齐",
      shortcuts: [],
      disabledReason: layerEditableSelectedNodes.length >= 2 ? undefined : "至少选择两个可编辑对象",
      run: () => alignSelected(scene, controller, "bottom", configData),
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

function SketchMainToolbarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const timerRef = React.useRef<number | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - 8, center)),
      top: Math.max(8, rect.top - 8),
    });
  }, []);

  const hide = React.useCallback(() => {
    clearTimer();
    setVisible(false);
    setPosition(null);
  }, [clearTimer]);

  const show = React.useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      updatePosition();
      setVisible(true);
    }, 200);
  }, [clearTimer, updatePosition]);

  React.useEffect(() => () => clearTimer(), [clearTimer]);

  React.useEffect(() => {
    if (!visible) return undefined;
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [updatePosition, visible]);

  return (
    <>
      <span
        ref={triggerRef}
        className="pointer-events-auto inline-flex shrink-0"
        onPointerEnter={show}
        onPointerLeave={hide}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
      >
        {children}
      </span>
      {visible && position && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[10000] max-w-[calc(100vw-16px)] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium leading-4 text-white shadow-lg"
              style={{ left: position.left, top: position.top }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function SketchFloatingToolbarColorIndicator({
  color,
  kind,
  mixed = false,
}: {
  color: string;
  kind: "fill" | "stroke";
  mixed?: boolean;
}) {
  if (mixed) {
    return (
      <span
        data-testid={`sketch-floating-${kind}-indicator`}
        className="relative inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-sm border border-slate-300 bg-white"
        aria-hidden="true"
      >
        <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_42%,#94a3b8_42%,#94a3b8_58%,transparent_58%)]" />
        <span className="absolute inset-x-0 top-1/2 h-px bg-slate-400/70" />
      </span>
    );
  }
  const transparent = color === "transparent";
  if (kind === "stroke") {
    return (
      <span
        data-testid="sketch-floating-stroke-indicator"
        className="relative inline-flex h-4 w-4 items-center justify-center"
        aria-hidden="true"
      >
        <Square
          className="h-4 w-4"
          style={{ color: transparent ? "#cbd5e1" : color }}
          strokeWidth={2}
        />
        {transparent ? <span className="absolute h-px w-5 rotate-45 bg-slate-400" /> : null}
      </span>
    );
  }
  return (
    <span
      data-testid="sketch-floating-fill-indicator"
      className={cn(
        "relative inline-flex h-3.5 w-3.5 rounded-sm border border-slate-300",
        transparent && "bg-white",
      )}
      style={transparent ? undefined : { backgroundColor: color }}
      aria-hidden="true"
    >
      {transparent ? <span className="absolute inset-x-0 top-1/2 h-px rotate-45 bg-slate-400" /> : null}
    </span>
  );
}

function SketchTextColorIndicator({ color }: { color: string }) {
  return (
    <span
      data-testid="sketch-text-color-indicator"
      className="relative inline-flex h-[1.4rem] w-[1.2rem] items-start justify-center"
      aria-hidden="true"
    >
      <span className="select-none pt-0.5 text-[15px] font-medium leading-4 text-slate-700">A</span>
      <span
        data-testid="sketch-text-color-underline"
        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

function SketchFloatingToolbarActionButton({ action }: { action: SketchFloatingToolbarAction }) {
  return (
    <SketchMainToolbarTooltip label={action.label}>
      <button
        type="button"
      className="pointer-events-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={action.disabled}
        aria-label={`悬浮${action.label}`}
        aria-haspopup={action.ariaHasPopup}
        aria-expanded={action.ariaExpanded}
        onClick={action.onClick}
      >
        {action.swatchColor && action.swatchKind ? (
          <SketchFloatingToolbarColorIndicator color={action.swatchColor} kind={action.swatchKind} mixed={action.swatchMixed} />
        ) : (
          action.icon
        )}
      </button>
    </SketchMainToolbarTooltip>
  );
}

export function SketchEditorToolbar({ scene: _scene, controller, configData: _configData = {}, className, allowedTools }: SketchEditorToolbarProps) {
  const toolButtonClass =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-35";
  const actionButtonClass =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-35";

  return (
    <div
      className={cn(
        "flex min-h-12 w-fit max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-1.5 text-slate-900 shadow-lg backdrop-blur",
        className,
      )}
      onPointerDownCapture={() => activateSketchKeyboardScope(controller)}
    >
      {TOOL_OPTIONS.filter((item) => {
        const tools = allowedTools ?? controller.allowedTools;
        return !tools || tools.includes(item.tool);
      }).map((item) => {
        const Icon = item.icon;
        return (
          <SketchMainToolbarTooltip key={item.tool} label={item.label}>
            <button
              type="button"
              aria-label={item.label}
              className={cn(
                toolButtonClass,
                controller.tool === item.tool && "bg-violet-600 text-white shadow-sm hover:bg-violet-600 hover:text-white",
              )}
              onClick={() => controller.setTool(item.tool)}
            >
              <Icon className="h-5 w-5" />
            </button>
          </SketchMainToolbarTooltip>
        );
      })}
      <div className="mx-2 h-8 w-px shrink-0 bg-slate-200" />
      <SketchMainToolbarTooltip label="撤销">
        <button type="button" aria-label="撤销" className={actionButtonClass} disabled={!controller.canUndo} onClick={controller.undo}>
          <Undo2 className="h-4 w-4" />
        </button>
      </SketchMainToolbarTooltip>
      <SketchMainToolbarTooltip label="重做">
        <button type="button" aria-label="重做" className={actionButtonClass} disabled={!controller.canRedo} onClick={controller.redo}>
          <Redo2 className="h-4 w-4" />
        </button>
      </SketchMainToolbarTooltip>
      <span className="sr-only" aria-live="polite">
        {controller.selection.nodeIds.length ? `${controller.selection.nodeIds.length} selected` : "No selection"}
      </span>
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
  const layerOperationSelectedNodes = getLayerOperationSelectedNodes(scene, controller, configData);
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
            disabled={!layerOperationSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => bringToFront(scene, controller, configData))}
          />
          <ContextMenuButton
            label="上移一层"
            disabled={!layerOperationSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => bringForward(scene, controller, configData))}
          />
          <ContextMenuButton
            label="下移一层"
            disabled={!layerOperationSelectedNodes.length}
            onClick={() => runLayerContextMenuAction(() => sendBackward(scene, controller, configData))}
          />
          <ContextMenuButton
            label="置底"
            disabled={!layerOperationSelectedNodes.length}
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
    if (value === "transparent") {
      applyColor(value);
      return;
    }
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
  const layerOperationSelectedNodes = getLayerOperationSelectedNodes(scene, controller, configData);
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
              layerOperationSelectedNodes={layerOperationSelectedNodes}
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
                      value={getSketchColorFieldValue(fill.value, "#ffffff", true)}
                      allowNoColor
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
                        value={getSketchColorFieldValue(stroke.value, "#1F2937", true)}
                        allowNoColor
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
            layerOperationSelectedNodes={layerOperationSelectedNodes}
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
                    value={getSketchColorFieldValue(style.fill, "#ffffff", true)}
                    allowNoColor
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
                    value={getSketchColorFieldValue(style.stroke, "#1F2937", true)}
                    allowNoColor
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
  layerOperationSelectedNodes,
  canGroupSelection,
  canUngroupSelection,
  defaultOpen = true,
}: {
  scene: SketchSceneDocument;
  controller: SketchEditorController;
  configData?: Record<string, unknown>;
  layerEditableSelectedNodes: SketchSceneNode[];
  layerOperationSelectedNodes: SketchSceneNode[];
  canGroupSelection: boolean;
  canUngroupSelection: boolean;
  defaultOpen?: boolean;
}) {
  const hasLayerOperationSelection = layerOperationSelectedNodes.length > 0;
  const canAlignSelection = layerEditableSelectedNodes.length >= 2;
  const canDistributeSelection = layerEditableSelectedNodes.length >= 3;
  return (
    <PropertySection title="Layout/Arrange" defaultOpen={defaultOpen}>
      <div className="grid grid-cols-2 gap-2">
        <PropertyCommandButton
          label="置顶"
          disabled={!hasLayerOperationSelection}
          disabledReason="当前选择不可排序"
          onClick={() => bringToFront(scene, controller, configData)}
        />
        <PropertyCommandButton
          label="置底"
          disabled={!hasLayerOperationSelection}
          disabledReason="当前选择不可排序"
          onClick={() => sendToBack(scene, controller, configData)}
        />
        <PropertyCommandButton
          label="上移一层"
          disabled={!hasLayerOperationSelection}
          disabledReason="当前选择不可排序"
          onClick={() => bringForward(scene, controller, configData)}
        />
        <PropertyCommandButton
          label="下移一层"
          disabled={!hasLayerOperationSelection}
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
  allowNoColor = false,
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
  allowNoColor?: boolean;
  recentColors?: string[];
  continuousHistoryKey?: string;
  onContinuousStart?: (key: string) => void;
  onContinuousEnd?: () => void;
  onReset?: () => void;
  onChange: (value: string, recordHistory?: boolean) => void;
}) {
  const fallbackColor = label === "填充" ? "#ffffff" : SKETCH_TEXT_DEFAULT_COLOR;
  const noColor = allowNoColor && !mixed && isSketchNoColor(value);
  const normalizedValue = toColorInputValue(value, fallbackColor);
  const continuousActiveRef = React.useRef(false);
  const endContinuousInput = () => {
    if (!continuousActiveRef.current) return;
    continuousActiveRef.current = false;
    onContinuousEnd?.();
  };
  const updateColor = (nextValue: string, recordHistory = true) => {
    if (nextValue === "transparent") {
      if (!allowNoColor || noColor) return;
      onChange(nextValue);
      return;
    }
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
          value={noColor ? "" : normalizedValue.toUpperCase()}
          maxLength={7}
          placeholder={noColor ? "无颜色" : undefined}
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
      <SketchColorPicker
        label={label}
        value={noColor ? "transparent" : normalizedValue}
        mixed={mixed}
        disabled={disabled}
        allowNoColor={allowNoColor}
        recentColors={recentColors}
        customColorFallback={normalizedValue}
        getSwatchLabel={(color, recent) => `${label}${recent ? " 最近" : ""} ${color.toUpperCase()}`}
        onSelect={updateColor}
      />
    </div>
  );
}

function getSketchColorCheckColor(color: string): string {
  const normalized = normalizeSketchHexColor(color);
  if (!normalized) return "#ffffff";
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 170 ? "#0f172a" : "#ffffff";
}

function SketchColorPicker({
  label,
  value,
  disabled = false,
  mixed = false,
  allowNoColor = false,
  recentColors = [],
  choiceRole = "radio",
  autoFocus = false,
  customColorFallback = "#000000",
  getSwatchLabel = (color, recent) => `${label}${recent ? " 最近" : ""} ${color}`,
  onSelect,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  mixed?: boolean;
  allowNoColor?: boolean;
  recentColors?: string[];
  choiceRole?: "menuitemradio" | "radio";
  autoFocus?: boolean;
  customColorFallback?: string;
  getSwatchLabel?: (color: string, recent: boolean) => string;
  onSelect: (value: string) => void;
}) {
  const customColorInputRef = React.useRef<HTMLInputElement>(null);
  const initialChoiceRef = React.useRef<HTMLButtonElement>(null);
  const noColor = !mixed && allowNoColor && isSketchNoColor(value);
  const normalizedValue = noColor
    ? "transparent"
    : normalizeSketchHexColor(value) ?? toColorInputValue(value, customColorFallback);
  const customColorValue = toColorInputValue(value, customColorFallback);
  const normalizedRecentColors = recentColors
    .map((color) => normalizeSketchHexColor(color))
    .filter((color): color is string => Boolean(color));
  const moveChoiceFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const choices = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(`[role="${choiceRole}"]`));
    if (!choices.length) return;
    const currentIndex = choices.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? choices.length - 1
        : (currentIndex < 0 ? 0 : currentIndex + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
    event.preventDefault();
    choices[nextIndex]?.focus();
  };

  React.useEffect(() => {
    if (!autoFocus) return;
    initialChoiceRef.current?.focus();
  }, [autoFocus]);

  return (
    <div
      data-testid="sketch-color-picker"
      role={choiceRole === "radio" ? "radiogroup" : undefined}
      aria-label={choiceRole === "radio" ? `${label}颜色` : undefined}
      className="grid w-full max-w-[288px] gap-1.5"
      onKeyDown={moveChoiceFocus}
    >
      {mixed ? <span className="rounded bg-slate-50 px-1.5 py-1 text-[10px] text-slate-500">当前选区颜色不同</span> : null}
      {allowNoColor ? (
        <div className="flex h-6 items-center">
          <button
            type="button"
            ref={initialChoiceRef}
            role={choiceRole}
            aria-checked={noColor}
            data-sketch-color="transparent"
            aria-label={`${label} 无颜色`}
            title={`${label} 无颜色`}
            disabled={disabled}
            className={cn(
              "relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40",
              noColor && "ring-2 ring-slate-900 ring-offset-1",
            )}
            onClick={() => onSelect("transparent")}
          >
            <span className="absolute h-px w-7 rotate-45 bg-slate-400" aria-hidden="true" />
            {noColor ? <Check className="relative h-3.5 w-3.5 text-slate-900" aria-hidden="true" /> : null}
          </button>
        </div>
      ) : null}
      {normalizedRecentColors.length ? (
        <SketchColorSwatchGrid
          label={`${label}最近颜色`}
          colors={normalizedRecentColors}
          normalizedValue={normalizedValue}
          mixed={mixed}
          disabled={disabled}
          choiceRole={choiceRole}
          autoFocus={autoFocus && !allowNoColor}
          getSwatchLabel={(color) => getSwatchLabel(color, true)}
          onSelect={onSelect}
        />
      ) : null}
      <SketchColorSwatchGrid
        label={`${label}常用颜色`}
        colors={SKETCH_COLOR_SWATCHES}
        normalizedValue={normalizedValue}
        mixed={mixed}
        disabled={disabled}
        choiceRole={choiceRole}
        autoFocus={autoFocus && !allowNoColor && !normalizedRecentColors.length}
        getSwatchLabel={(color) => getSwatchLabel(color, false)}
        onSelect={onSelect}
      />
      <button
        type="button"
        role={choiceRole === "menuitemradio" ? "menuitem" : undefined}
        aria-label={`${label} 其他颜色`}
        aria-haspopup="dialog"
        disabled={disabled}
        className="flex min-h-8 w-full items-center gap-2 border-t border-slate-100 px-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => customColorInputRef.current?.click()}
      >
        <PaintBucket className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <span>其他颜色</span>
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      </button>
      <input
        ref={customColorInputRef}
        type="color"
        value={customColorValue}
        tabIndex={-1}
        aria-label={`${label} 其他颜色输入`}
        className="sr-only"
        onChange={(event) => onSelect(event.target.value)}
      />
    </div>
  );
}

function SketchColorSwatchGrid({
  label,
  colors,
  normalizedValue,
  mixed = false,
  disabled,
  choiceRole,
  autoFocus = false,
  getSwatchLabel,
  onSelect,
}: {
  label: string;
  colors: string[];
  normalizedValue: string;
  mixed?: boolean;
  disabled: boolean;
  choiceRole: "menuitemradio" | "radio";
  autoFocus?: boolean;
  getSwatchLabel: (color: string) => string;
  onSelect: (color: string) => void;
}) {
  const firstSwatchRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (autoFocus) firstSwatchRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="grid grid-cols-10 gap-1" data-sketch-color-grid="true" aria-label={label}>
      {colors.map((color, index) => {
        const swatchLabel = getSwatchLabel(color);
        const selected = !mixed && normalizedValue.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            ref={index === 0 ? firstSwatchRef : undefined}
            className={cn(
              "relative aspect-square w-full min-w-0 rounded-[4px] border border-slate-200 shadow-sm transition-transform hover:scale-105 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed",
              selected && "ring-2 ring-slate-900 ring-offset-1",
            )}
            role={choiceRole}
            aria-checked={selected}
            data-sketch-color={color}
            style={{ backgroundColor: color }}
            disabled={disabled}
            title={swatchLabel}
            aria-label={swatchLabel}
            onClick={() => onSelect(color)}
          >
            {selected ? <Check className="absolute inset-0 m-auto h-4 w-4" style={{ color: getSketchColorCheckColor(color) }} strokeWidth={2.75} aria-hidden="true" /> : null}
          </button>
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
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  const [contextMenuPos, setContextMenuPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  React.useLayoutEffect(() => {
    if (!contextMenu) return;
    const el = contextMenuRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el?.offsetWidth ?? 144;
    const h = el?.offsetHeight ?? 400;
    setContextMenuPos({
      x: Math.max(8, Math.min(contextMenu.x, vw - w - 8)),
      y: Math.max(8, Math.min(contextMenu.y, vh - h - 8)),
    });
  }, [contextMenu]);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = React.useState(false);
  const [detailsPanelOpen, setDetailsPanelOpen] = React.useState(false);
  const [detailsPanelTab, setDetailsPanelTab] = React.useState<"properties" | "layers" | "fill" | "stroke" | "more" | "position">("properties");
  const [alignmentMenuOpen, setAlignmentMenuOpen] = React.useState(false);
  const [alignmentMenuPosition, setAlignmentMenuPosition] = React.useState<{ left: number; top: number } | null>(null);
  const detailsPanelOpenRef = React.useRef(false);
  const detailsPanelTabRef = React.useRef(detailsPanelTab);
  detailsPanelOpenRef.current = detailsPanelOpen;
  detailsPanelTabRef.current = detailsPanelTab;
  const [detailsPanelAnchorX, setDetailsPanelAnchorX] = React.useState<number | null>(null);
  const [detailsPanelSize, setDetailsPanelSize] = React.useState<{ width: number; height: number } | null>(null);
  const [floatingSizeRatioLocked, setFloatingSizeRatioLocked] = React.useState(false);
  const detailsPanelRef = React.useRef<HTMLDivElement>(null);
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
  const lastGroupChildSelectionAtRef = React.useRef<number | null>(null);
  const lastInlineTextPointerDownRef = React.useRef<{
    nodeId: string;
    clientX: number;
    clientY: number;
    timestamp: number;
  } | null>(null);
  const pendingInlineTextDoublePointerRef = React.useRef<{
    nodeId: string;
    clientX: number;
    clientY: number;
    timestamp: number;
  } | null>(null);
  const lastInlineTextPointerEditAtRef = React.useRef<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const inlineTextRef = React.useRef<HTMLTextAreaElement>(null);
  const imageFileInputRef = React.useRef<HTMLInputElement>(null);
  const [canvasContainerWidth, setCanvasContainerWidth] = React.useState<number | null>(null);
  const [canvasContainerHeight, setCanvasContainerHeight] = React.useState<number | null>(null);
  const [floatingToolbarWidth, setFloatingToolbarWidth] = React.useState<number | null>(null);
  const width = fillContainer ? scene.pageSize.width : normalizeSize(previewSize, scene.pageSize.width, "width");
  const height = fillContainer ? scene.pageSize.height : normalizeSize(previewSize, scene.pageSize.height, "height");
  const selectedNodes = getSelectedNodes(scene, controller);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const inlineTextSourceNode = inlineTextEdit
    ? scene.nodes.find((node) => node.id === inlineTextEdit.nodeId) ?? null
    : null;
  const inlineTextNode = inlineTextSourceNode && inlineTextEdit
    ? {
        ...inlineTextSourceNode,
        text: inlineTextEdit.value,
        style: { ...inlineTextEdit.style },
        textStyleRuns: cloneSketchTextStyleRuns(inlineTextEdit.textStyleRuns),
      }
    : inlineTextSourceNode;
  const selectionNodes = selectedNodes.map((node) => node.id === inlineTextNode?.id ? inlineTextNode : node);
  const visibleSelectedNodes = selectionNodes.filter((node) => isNodeVisibleForConfig(node, configData));
  const selectionToolbarContext = getSketchSelectionToolbarContext(scene, selectionNodes, configData);
  const canvasSelectionBounds = getSketchSelectionVisualBounds(scene, selectionNodes, configData);
  const hoveredNode = hoveredNodeId && !controller.selection.nodeIds.includes(hoveredNodeId)
    ? scene.nodes.find((node) => node.id === hoveredNodeId && isNodeVisibleForConfig(node, configData)) ?? null
    : null;
  const hoverSelectionBounds = hoveredNode ? getSketchNodeBounds(hoveredNode) : null;
  const resizableSelectedNodes = selectionToolbarContext.grouped
    ? []
    : getSelectionResizeNodes(selectionNodes).filter((node) => isNodeVisibleForConfig(node, configData));
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
  const layerOperationSelectedNodes = getLayerOperationSelectedNodes(scene, controller, configData);
  const lockableSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData));
  const visibleToggleSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData));
  const selectedGroupNodes = getSelectedGroupNodes(scene, controller);
  const focusedGroupNode = focusedGroupId
    ? scene.nodes.find((node) => node.id === focusedGroupId && node.type === "group") ?? null
    : null;
  const canGroupSelection = layerEditableSelectedNodes.length >= 2;
  const canUngroupSelection = selectedGroupNodes.length > 0;
  const inlineTextPreviewNode = inlineTextNode && inlineTextEdit
    ? {
        ...inlineTextNode,
        text: "",
        bindings: inlineTextNode.bindings?.text
          ? { ...inlineTextNode.bindings, text: undefined }
          : inlineTextNode.bindings,
      }
    : null;
  const inlineTextPreviewScene = inlineTextNode && inlineTextEdit
    ? {
        ...scene,
        nodes: scene.nodes.map((node) => node.id === inlineTextNode.id ? inlineTextPreviewNode as SketchSceneNode : node),
      }
    : scene;
  const previewScene = drawingDraft?.node
    ? { ...inlineTextPreviewScene, nodes: [...inlineTextPreviewScene.nodes, drawingDraft.node] }
    : inlineTextPreviewScene;
  const connectorCandidatePoints = getConnectorCandidatePoints(scene, dragStart, configData);
  const snapGuides = getSketchSnapGuides(scene, dragStart, configData);
  const dragModifierHint = dragStart && dragStart.kind !== "rotate"
    ? [
        "Alt/Option 拖动复制",
        dragStart.kind === "resize" ? "Shift 等比缩放" : "Shift 约束比例",
        "Cmd/Ctrl 暂停吸附与参考线",
      ].join(" · ")
    : null;

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateContainerWidth = () => {
      const nextWidth = container.clientWidth || container.getBoundingClientRect().width;
      const nextHeight = container.clientHeight || container.getBoundingClientRect().height;
      if (Number.isFinite(nextWidth) && nextWidth > 0) {
        setCanvasContainerWidth((current) => (current === nextWidth ? current : nextWidth));
      }
      if (Number.isFinite(nextHeight) && nextHeight > 0) {
        setCanvasContainerHeight((current) => (current === nextHeight ? current : nextHeight));
      }
    };

    updateContainerWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateContainerWidth);
      return () => window.removeEventListener("resize", updateContainerWidth);
    }

    const observer = new ResizeObserver(updateContainerWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    if (!detailsPanelOpen) {
      setDetailsPanelSize((current) => (current === null ? current : null));
      return undefined;
    }
    const panel = detailsPanelRef.current;
    if (!panel) return undefined;

    const reportSize = () => {
      const rect = panel.getBoundingClientRect();
      const nextWidth = panel.offsetWidth || rect.width;
      const nextHeight = panel.offsetHeight || rect.height;
      if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) return;
      setDetailsPanelSize((current) => (
        current?.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      ));
    };

    reportSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", reportSize);
      return () => window.removeEventListener("resize", reportSize);
    }

    const observer = new ResizeObserver(reportSize);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [detailsPanelOpen, detailsPanelTab]);

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

  React.useEffect(() => {
    if (!controller.selection.nodeIds.length) setDetailsPanelOpen(false);
  }, [controller.selection.nodeIds.length]);

  const closeAlignmentMenu = React.useCallback(() => {
    setAlignmentMenuOpen(false);
    setAlignmentMenuPosition(null);
  }, []);

  React.useEffect(() => {
    if (!controller.selection.nodeIds.length || selectedNodes.length < 2) closeAlignmentMenu();
  }, [closeAlignmentMenu, controller.selection.nodeIds.length, selectedNodes.length]);

  React.useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [contextMenu]);

  React.useEffect(() => {
    if (!detailsPanelOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (detailsPanelRef.current?.contains(target)) return;
      if (target.closest("[data-sketch-text-toolbar], [data-sketch-floating-toolbar]")) return;
      detailsPanelOpenRef.current = false;
      setDetailsPanelOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [detailsPanelOpen]);

  React.useEffect(() => {
    if (!alignmentMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-sketch-alignment-menu], [data-sketch-floating-toolbar]")) return;
      closeAlignmentMenu();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [alignmentMenuOpen, closeAlignmentMenu]);

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

  const cutSelected = React.useCallback(() => {
    copySelected();
    deleteSelected(scene, controller, configData);
    setDetailsPanelOpen(false);
  }, [configData, controller, copySelected, scene]);

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
    if (node.type !== "text") {
      const nextTextStyleRuns = normalizeSketchTextStyleRuns(edit.value, edit.textStyleRuns);
      if (
        node.text === edit.value &&
        JSON.stringify(node.style ?? {}) === JSON.stringify(edit.style ?? {}) &&
        JSON.stringify(node.textStyleRuns ?? []) === JSON.stringify(nextTextStyleRuns ?? [])
      ) return;
      controller.applyOperations([{
        op: "update",
        nodeId: node.id,
        patch: {
          text: edit.value,
          style: edit.style,
          textStyleRuns: nextTextStyleRuns,
        },
      }]);
      return;
    }
    const draftNode: SketchSceneNode = {
      ...node,
      text: edit.value,
      style: { ...edit.style },
      textStyleRuns: normalizeSketchTextStyleRuns(edit.value, edit.textStyleRuns),
    };
    const size = getSketchTextAutoSize(draftNode, edit.value);
    const nextNode = {
      ...draftNode,
      width: size.width,
      height: size.height,
    };
    if (
      node.text === nextNode.text &&
      node.width === nextNode.width &&
      node.height === nextNode.height &&
      JSON.stringify(node.style ?? {}) === JSON.stringify(nextNode.style ?? {}) &&
      JSON.stringify(node.textStyleRuns ?? []) === JSON.stringify(nextNode.textStyleRuns ?? [])
    ) return;
    controller.applyOperations([{
      op: "update",
      nodeId: node.id,
      patch: {
        text: nextNode.text,
        width: nextNode.width,
        height: nextNode.height,
        style: nextNode.style,
        textStyleRuns: nextNode.textStyleRuns,
      },
    }]);
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
    layerOperationSelectedNodes,
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
    layerOperationSelectedNodes,
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
    setDetailsPanelOpen(false);
    setInlineTextEdit(createInlineTextEditState(node));
    return true;
  }, [configData, controller, scene.nodes]);

  const clearInlineTextPointerInteraction = React.useCallback(() => {
    dragStartRef.current = null;
    marqueeRef.current = null;
    setDragStart(null);
    setMarquee(null);
    const captured = pointerCaptureRef.current;
    pointerCaptureRef.current = null;
    if (!captured || typeof captured.element.releasePointerCapture !== "function") return;
    try {
      captured.element.releasePointerCapture(captured.pointerId);
    } catch {
      // Pointer capture may already be released by the browser after the double-click.
    }
  }, []);

  const enterFocusedGroupFromEvent = React.useCallback((target: Element, clientX: number, clientY: number): boolean => {
    const point = getClientScenePoint(clientX, clientY, stageRef.current, scene);
    const hitNodeId = getSketchCanvasHitNodeId(scene, target, point, configData);
    if (!hitNodeId) return false;
    const groupId = getSketchOutermostGroupId(scene, hitNodeId);
    if (!groupId || focusedGroupIdRef.current === groupId) return false;
    const childId = getSketchDirectGroupChildId(scene, groupId, hitNodeId);
    if (!childId) return false;
    const childNode = scene.nodes.find((node) => node.id === childId);
    if (
      !childNode ||
      (childNode.type !== "group" && !isNodeVisibleForConfig(childNode, configData)) ||
      (childNode.type === "group" && !getSelectionVisibleLeafNodes(scene, [childNode], configData).length)
    ) return false;
    activateSketchKeyboardScope(controller);
    focusedGroupIdRef.current = groupId;
    setFocusedGroupId(groupId);
    controller.setNodeIds([childNode.id]);
    return true;
  }, [configData, controller, scene]);

  const quickToolbarPosition = React.useMemo(() => {
    if (
      mode !== "edit" ||
      controller.tool !== "select" ||
      !canvasSelectionBounds ||
      !selectedNodes.length ||
      dragStart ||
      marquee ||
      drawingDraft
    ) return null;
    const scaleX = width / scene.pageSize.width;
    const scaleY = height / scene.pageSize.height;
    const containerWidth = canvasContainerWidth ?? (containerRef.current?.clientWidth || width + viewport.offsetX * 2);
    const desiredLeft = viewport.offsetX + (canvasSelectionBounds.x + canvasSelectionBounds.width / 2) * scaleX * viewport.scale;
    const top = viewport.offsetY + canvasSelectionBounds.y * scaleY * viewport.scale;
    const bottom = viewport.offsetY + (canvasSelectionBounds.y + canvasSelectionBounds.height) * scaleY * viewport.scale;
    return {
      left: resolveSketchFloatingToolbarLeft(desiredLeft, containerWidth, floatingToolbarWidth),
      top: top > 96 ? top - 84 : bottom + 32,
    };
  }, [
    canvasSelectionBounds,
    canvasContainerWidth,
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
    floatingToolbarWidth,
    viewport.offsetX,
    viewport.offsetY,
    viewport.scale,
    width,
  ]);

  const runQuickToolbarAction = React.useCallback((action: () => void) => {
    activateSketchKeyboardScope(controller);
    action();
  }, [controller]);

  const handleFloatingToolbarWidthChange = React.useCallback((nextWidth: number) => {
    if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
    setFloatingToolbarWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  const getDetailsPanelAnchorX = React.useCallback((trigger: HTMLElement | null): number | null => {
    const fallback = quickToolbarPosition?.left ?? null;
    if (!trigger) return fallback;
    const container = containerRef.current;
    const triggerRect = trigger.getBoundingClientRect();
    if (!container || triggerRect.width <= 0) return fallback;
    const containerRect = container.getBoundingClientRect();
    return triggerRect.left + triggerRect.width / 2 - containerRect.left;
  }, [quickToolbarPosition?.left]);

  const openAlignmentMenu = React.useCallback((trigger: HTMLElement | null) => {
    const container = containerRef.current;
    if (!container || !trigger) return;
    const containerRect = container.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const menuWidth = SKETCH_ALIGNMENT_MENU_WIDTH;
    const menuHeight = SKETCH_ALIGNMENT_MENU_HEIGHT;
    const left = Math.max(
      menuWidth / 2 + 12,
      Math.min(containerRect.width - menuWidth / 2 - 12, triggerRect.left - containerRect.left + triggerRect.width / 2),
    );
    const below = triggerRect.bottom - containerRect.top + 8;
    const top = below + menuHeight <= containerRect.height - 12
      ? below
      : Math.max(12, triggerRect.top - containerRect.top - menuHeight - 8);
    setDetailsPanelOpen(false);
    detailsPanelOpenRef.current = false;
    setAlignmentMenuPosition({ left, top });
    setAlignmentMenuOpen(true);
  }, []);

  const openDetailsBubble = React.useCallback((
    tab: "properties" | "layers" | "fill" | "stroke" | "more" | "position",
    trigger?: HTMLElement | null,
  ) => {
    setShortcutHelpOpen(false);
    setCommandPaletteOpen(false);
    closeAlignmentMenu();
    if (detailsPanelOpenRef.current && detailsPanelTabRef.current === tab) {
      detailsPanelOpenRef.current = false;
      setDetailsPanelOpen(false);
      return;
    }
    detailsPanelOpenRef.current = true;
    detailsPanelTabRef.current = tab;
    setDetailsPanelTab(tab);
    setDetailsPanelAnchorX(getDetailsPanelAnchorX(trigger ?? null));
    setDetailsPanelSize(null);
    setDetailsPanelOpen(true);
  }, [closeAlignmentMenu, getDetailsPanelAnchorX]);

  const textToolbarNode = selectedNodes.length === 1 && selectedNode && (
    selectedNode.type === "text" ||
    (supportsTextStyle(selectedNode) && (
      Boolean(selectedNode.text?.length) ||
      inlineTextEdit?.nodeId === selectedNode.id
    ))
  )
    ? inlineTextEdit?.nodeId === selectedNode.id && inlineTextNode
      ? inlineTextNode
      : selectedNode
    : null;
  const isTextToolbarInlineEdit = Boolean(inlineTextEdit && textToolbarNode?.id === inlineTextEdit.nodeId);
  const textToolbarRange = textToolbarNode && isTextToolbarInlineEdit
    ? getActiveInlineTextRange(controller, textToolbarNode)
    : null;

  const applyTextToolbarStyle = React.useCallback(
    (stylePatch: SketchSceneTextStyleOverride, defaultStylePatch: SketchSceneStyle) => {
      const node = textToolbarNode;
      if (!node || !canEditNodeProperties(node)) return;
      const patch = getTextStylePatchForRange(node, textToolbarRange, stylePatch, defaultStylePatch);
      if (isTextToolbarInlineEdit) {
        setInlineTextEdit((current) => {
          if (!current || current.nodeId !== node.id) return current;
          const nextStyle = patch.style ? { ...patch.style } : { ...current.style };
          const nextRuns = patch.textStyleRuns !== undefined
            ? normalizeSketchTextStyleRuns(current.value, patch.textStyleRuns)
            : cloneSketchTextStyleRuns(current.textStyleRuns);
          return { ...current, style: nextStyle, textStyleRuns: nextRuns };
        });
        return;
      }
      const candidateNode: SketchSceneNode = {
        ...node,
        style: patch.style ? { ...patch.style } : { ...node.style },
        textStyleRuns: patch.textStyleRuns !== undefined ? patch.textStyleRuns : cloneSketchTextStyleRuns(node.textStyleRuns),
      };
      const sizePatch = node.type === "text"
        ? (() => {
            const size = getSketchTextAutoSize(candidateNode, candidateNode.text ?? "");
            return { width: size.width, height: size.height };
          })()
        : {};
      applySelectedPatch(scene, controller, { ...patch, ...sizePatch });
    },
    [controller, isTextToolbarInlineEdit, scene, textToolbarNode, textToolbarRange],
  );

  const applyTextToolbarAlignment = React.useCallback(
    (textAlign: NonNullable<NonNullable<SketchSceneNode["style"]>["textAlign"]>) => {
      const node = textToolbarNode;
      if (!node || !canEditNodeProperties(node)) return;
      const nextStyle = { ...node.style, textAlign };
      if (isTextToolbarInlineEdit) {
        setInlineTextEdit((current) => current && current.nodeId === node.id ? { ...current, style: nextStyle } : current);
        return;
      }
      applySelectedPatch(scene, controller, { style: nextStyle });
    },
    [controller, isTextToolbarInlineEdit, scene, textToolbarNode],
  );

  const openTextDetails = React.useCallback((tab: "layers" | "more", trigger?: HTMLElement | null) => {
    if (isTextToolbarInlineEdit) commitInlineTextEdit();
    openDetailsBubble(tab, trigger);
  }, [commitInlineTextEdit, isTextToolbarInlineEdit, openDetailsBubble]);

  const toggleTextBold = React.useCallback(() => {
    if (!textToolbarNode) return;
    const state = getTextStyleStateValue(textToolbarNode, textToolbarRange, "fontWeight");
    const nextBold = state.mixed || !isSketchBoldFontWeight(state.value);
    applyTextToolbarStyle(
      { fontWeight: nextBold ? 700 : 400 },
      { fontWeight: nextBold ? 700 : 400 },
    );
  }, [applyTextToolbarStyle, textToolbarNode, textToolbarRange]);

  const toggleTextItalic = React.useCallback(() => {
    if (!textToolbarNode) return;
    const state = getTextStyleStateValue(textToolbarNode, textToolbarRange, "italic");
    const nextItalic = state.mixed || !Boolean(state.value);
    applyTextToolbarStyle({ italic: nextItalic }, { italic: nextItalic });
  }, [applyTextToolbarStyle, textToolbarNode, textToolbarRange]);

  const toggleTextUnderline = React.useCallback(() => {
    if (!textToolbarNode) return;
    const state = getTextStyleStateValue(textToolbarNode, textToolbarRange, "textDecoration");
    const nextDecoration = state.mixed || state.value !== "underline" ? "underline" : "none";
    applyTextToolbarStyle(
      { textDecoration: nextDecoration },
      { textDecoration: nextDecoration },
    );
  }, [applyTextToolbarStyle, textToolbarNode, textToolbarRange]);

  const setTextFontSize = React.useCallback((fontSize: number) => {
    if (!Number.isInteger(fontSize) || fontSize < 1 || fontSize > 512) return;
    applyTextToolbarStyle({ fontSize }, { fontSize });
  }, [applyTextToolbarStyle]);

  const setTextColor = React.useCallback((color: string) => {
    const normalized = normalizeSketchHexColor(color);
    if (!normalized) return;
    applyTextToolbarStyle({ color: normalized }, { color: normalized });
  }, [applyTextToolbarStyle]);

  const floatingToolbarActions = React.useMemo<SketchFloatingToolbarAction[]>(() => {
    if (!quickToolbarPosition || selectedNode?.type === "text") return [];
    const openMore = (trigger?: HTMLElement | null) => openDetailsBubble("more", trigger);
    if (selectedNodes.length === 1 && selectedNode && selectedNode.type !== "group") {
      const actions: SketchFloatingToolbarAction[] = [];
      if (supportsFillStyle(selectedNode)) {
        actions.push({
          id: "fill",
          label: "填充",
          title: "编辑填充",
          icon: <PaintBucket className="h-3.5 w-3.5" />,
          swatchColor: isSketchNoColor(selectedNode.style?.fill) ? "transparent" : toColorInputValue(selectedNode.style?.fill, "#ffffff"),
          swatchKind: "fill",
          disabled: !canEditNodeProperties(selectedNode),
          onClick: (event) => runQuickToolbarAction(() => openDetailsBubble("fill", event.currentTarget)),
        });
      }
      if (supportsStrokeStyle(selectedNode)) {
        actions.push({
          id: "stroke",
          label: "描边",
          title: "编辑描边",
          icon: <Square className="h-3.5 w-3.5" />,
          swatchColor: isSketchNoColor(selectedNode.style?.stroke) ? "transparent" : toColorInputValue(selectedNode.style?.stroke, "#111827"),
          swatchKind: "stroke",
          disabled: !canEditNodeProperties(selectedNode),
          onClick: (event) => runQuickToolbarAction(() => openDetailsBubble("stroke", event.currentTarget)),
        });
      }
      actions.push(
        {
          id: "layerOrder",
          label: "层级",
          icon: <Layers className="h-3.5 w-3.5" />,
          disabled: !canEditNodeProperties(selectedNode),
          onClick: (event) => runQuickToolbarAction(() => openDetailsBubble("layers", event.currentTarget)),
        },
        {
          id: "more",
          label: "更多",
          icon: <MoreHorizontal className="h-3.5 w-3.5" />,
          onClick: (event) => runQuickToolbarAction(() => openMore(event.currentTarget)),
        },
      );
      return actions;
    }
    const fill = getMixedStyleValue(selectionToolbarContext.fillStyleNodes, "fill");
    const stroke = getMixedStyleValue(selectionToolbarContext.strokeStyleNodes, "stroke");
    const showStyleActions = selectionToolbarContext.graphicNodes.length > 0 && (
      !selectionToolbarContext.grouped || selectionToolbarContext.pureTextNodes.length === 0
    );
    const actions: SketchFloatingToolbarAction[] = [];
    if (showStyleActions) {
      actions.push(
        {
          id: "stroke",
          label: "边框",
          title: "编辑边框",
          icon: <Square className="h-3.5 w-3.5" />,
          swatchColor: getSketchColorFieldValue(stroke.value, "#111827", true),
          swatchKind: "stroke",
          swatchMixed: stroke.mixed,
          disabled: !selectionToolbarContext.strokeStyleNodes.length,
          onClick: (event) => runQuickToolbarAction(() => openDetailsBubble("stroke", event.currentTarget)),
        },
        {
          id: "fill",
          label: "颜色",
          title: "编辑颜色",
          icon: <PaintBucket className="h-3.5 w-3.5" />,
          swatchColor: getSketchColorFieldValue(fill.value, "#ffffff", true),
          swatchKind: "fill",
          swatchMixed: fill.mixed,
          disabled: !selectionToolbarContext.fillStyleNodes.length,
          onClick: (event) => runQuickToolbarAction(() => openDetailsBubble("fill", event.currentTarget)),
        },
      );
    }
    if (!selectionToolbarContext.grouped) {
      actions.push({
        id: "alignment",
        label: "对齐方式",
        icon: <AlignHorizontalJustifyStart className="h-3.5 w-3.5" />,
        ariaHasPopup: "menu",
        ariaExpanded: alignmentMenuOpen,
        disabled: layerEditableSelectedNodes.length < 2,
        onClick: (event) => runQuickToolbarAction(() => openAlignmentMenu(event.currentTarget)),
      });
      actions.push({
        id: "group",
        label: "组合",
        icon: <Group data-sketch-icon="group" className="h-3.5 w-3.5" />,
        disabled: !canGroupSelection,
        onClick: () => runQuickToolbarAction(() => groupSelected(scene, controller, configData)),
      });
    } else {
      actions.push({
        id: "ungroup",
        label: "解组",
        icon: <Ungroup data-sketch-icon="ungroup" className="h-3.5 w-3.5" />,
        disabled: !canUngroupSelection,
        onClick: () => runQuickToolbarAction(() => ungroupSelected(scene, controller)),
      });
    }
    actions.push(
      {
        id: "layerOrder",
        label: "图层",
        icon: <Layers className="h-3.5 w-3.5" />,
        disabled: !layerOperationSelectedNodes.length,
        onClick: (event) => runQuickToolbarAction(() => openDetailsBubble("layers", event.currentTarget)),
      },
      {
        id: "more",
        label: "更多",
        icon: <MoreHorizontal className="h-3.5 w-3.5" />,
        onClick: (event) => runQuickToolbarAction(() => openMore(event.currentTarget)),
      },
    );
    return actions;
  }, [
    alignmentMenuOpen,
    canGroupSelection,
    canUngroupSelection,
    configData,
    controller,
    layerEditableSelectedNodes.length,
    layerOperationSelectedNodes.length,
    openAlignmentMenu,
    openDetailsBubble,
    quickToolbarPosition,
    runQuickToolbarAction,
    scene,
    selectedNode,
    selectedNodes.length,
    selectionToolbarContext,
  ]);

  const detailsStyleNodes = detailsPanelTab === "fill"
    ? selectionToolbarContext.fillStyleNodes
    : selectionToolbarContext.strokeStyleNodes;
  const detailsStyleState = getMixedStyleValue(
    detailsStyleNodes,
    detailsPanelTab === "fill" ? "fill" : "stroke",
  );
  const detailsStyleLabel = detailsPanelTab === "fill"
    ? selectionToolbarContext.grouped || selectedNodes.length > 1 ? "颜色" : "填充"
    : selectionToolbarContext.grouped || selectedNodes.length > 1 ? "边框" : "描边";

  const detailsBubblePosition = React.useMemo(() => {
    const fallbackWidth = detailsPanelTab === "position"
      ? 360
      : detailsPanelTab === "fill" || detailsPanelTab === "stroke"
        ? 236
        : detailsPanelTab === "more"
          ? 204
          : detailsPanelTab === "layers"
            ? 184
            : 320;
    const fallbackHeight = detailsPanelTab === "more" ? 268 : detailsPanelTab === "fill" || detailsPanelTab === "stroke" ? 210 : detailsPanelTab === "layers" ? 180 : 96;
    const bubbleWidth = detailsPanelSize?.width ?? fallbackWidth;
    const bubbleHeight = detailsPanelSize?.height ?? fallbackHeight;
    const containerWidth = canvasContainerWidth ?? (containerRef.current?.clientWidth || width);
    const containerHeight = canvasContainerHeight ?? (containerRef.current?.clientHeight || height);
    const toolbarTop = quickToolbarPosition?.top ?? 20;
    const below = toolbarTop + 44;
    const anchorX = detailsPanelAnchorX ?? quickToolbarPosition?.left ?? containerWidth / 2;
    return {
      left: Math.max(12, Math.min(containerWidth - bubbleWidth - 12, anchorX - bubbleWidth / 2)),
      top: below + bubbleHeight <= containerHeight - 12 ? below : Math.max(12, toolbarTop - bubbleHeight - 8),
    };
  }, [canvasContainerHeight, canvasContainerWidth, detailsPanelAnchorX, detailsPanelSize, detailsPanelTab, height, quickToolbarPosition, width]);

  const getInlineTextEditNodeIdFromPoint = React.useCallback(
    (target: Element, clientX: number, clientY: number): string | null => {
      if (target.closest("[data-sketch-inline-text-editor], [data-sketch-text-toolbar], [data-sketch-details-panel]")) return null;
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
      const startEditFromNativeEvent = (event: MouseEvent, suppressFollowingNativeDoubleClick = false) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (enterFocusedGroupFromEvent(target, event.clientX, event.clientY)) {
          if (suppressFollowingNativeDoubleClick) lastGroupChildSelectionAtRef.current = Date.now();
          clearInlineTextPointerInteraction();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (startImageFitEditFromTarget(target, event.clientX, event.clientY)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const nodeId = getInlineTextEditNodeIdFromPoint(target, event.clientX, event.clientY);
        if (!nodeId || !startInlineTextEdit(nodeId)) return;
        clearInlineTextPointerInteraction();
        event.preventDefault();
        event.stopPropagation();
    };
    const onNativePointerMove = (event: PointerEvent) => {
      const previous = lastInlineTextPointerDownRef.current;
      const pending = pendingInlineTextDoublePointerRef.current;
      const origin = pending ?? previous;
      if (!origin) return;
      const distance = Math.hypot(event.clientX - origin.clientX, event.clientY - origin.clientY);
      if (distance > 6) {
        lastInlineTextPointerDownRef.current = null;
        pendingInlineTextDoublePointerRef.current = null;
      }
    };
    const onNativePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && typeof event.button === "number") {
        lastInlineTextPointerDownRef.current = null;
        pendingInlineTextDoublePointerRef.current = null;
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        lastInlineTextPointerDownRef.current = null;
        pendingInlineTextDoublePointerRef.current = null;
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        lastInlineTextPointerDownRef.current = null;
        pendingInlineTextDoublePointerRef.current = null;
        return;
      }
      const nodeId = getInlineTextEditNodeIdFromPoint(target, event.clientX, event.clientY);
      if (!nodeId) {
        lastInlineTextPointerDownRef.current = null;
        pendingInlineTextDoublePointerRef.current = null;
        return;
      }
      const timestamp = Date.now();
      const previous = lastInlineTextPointerDownRef.current;
      const isDoublePointerDown = Boolean(
        previous &&
        previous.nodeId === nodeId &&
        timestamp - previous.timestamp <= 450 &&
        Math.hypot(event.clientX - previous.clientX, event.clientY - previous.clientY) <= 6,
      );
      lastInlineTextPointerDownRef.current = isDoublePointerDown
        ? null
        : { nodeId, clientX: event.clientX, clientY: event.clientY, timestamp };
      if (!isDoublePointerDown) return;
      pendingInlineTextDoublePointerRef.current = { nodeId, clientX: event.clientX, clientY: event.clientY, timestamp };
    };
    const onNativePointerUp = (event: PointerEvent) => {
      const pending = pendingInlineTextDoublePointerRef.current;
      if (!pending) return;
      const distance = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY);
      if (distance > 6 || Date.now() - pending.timestamp > 450) {
        pendingInlineTextDoublePointerRef.current = null;
        return;
      }
      pendingInlineTextDoublePointerRef.current = null;
      lastInlineTextPointerEditAtRef.current = Date.now();
      startEditFromNativeEvent(event, true);
    };
    const onNativeDoubleClick = (event: MouseEvent) => {
      const groupDetectedAt = lastGroupChildSelectionAtRef.current;
      if (groupDetectedAt !== null && Date.now() - groupDetectedAt <= 450) {
        lastGroupChildSelectionAtRef.current = null;
        return;
      }
      if (groupDetectedAt !== null) lastGroupChildSelectionAtRef.current = null;
      const detectedAt = lastInlineTextPointerEditAtRef.current;
      if (detectedAt !== null && Date.now() - detectedAt <= 450) {
        lastInlineTextPointerEditAtRef.current = null;
        return;
      }
      startEditFromNativeEvent(event);
    };
    stage.addEventListener("pointermove", onNativePointerMove);
    stage.addEventListener("pointerdown", onNativePointerDown);
    stage.addEventListener("pointerup", onNativePointerUp);
    stage.addEventListener("dblclick", onNativeDoubleClick);
    return () => {
      stage.removeEventListener("pointermove", onNativePointerMove);
      stage.removeEventListener("pointerdown", onNativePointerDown);
      stage.removeEventListener("pointerup", onNativePointerUp);
      stage.removeEventListener("dblclick", onNativeDoubleClick);
    };
  }, [clearInlineTextPointerInteraction, enterFocusedGroupFromEvent, getInlineTextEditNodeIdFromPoint, mode, startImageFitEditFromTarget, startInlineTextEdit]);

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
      if (event.key === "Escape") {
        event.preventDefault();
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (shortcutHelpOpen) {
          setShortcutHelpOpen(false);
        } else if (alignmentMenuOpen) {
          closeAlignmentMenu();
        } else if (detailsPanelOpen) {
          setDetailsPanelOpen(false);
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
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key === " ") {
        event.preventDefault();
        setIsSpacePanning(true);
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
        const editableSelectedNodes = getSelectionMoveNodes(scene, selectedNodes, configData);
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
  }, [actionEntries, cancelInlineTextEdit, commandPaletteOpen, configData, controller, detailsPanelOpen, inlineTextEdit, mode, scene, selectedNodes, setActiveDrawingDraft, shortcutHelpOpen]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative min-h-0 flex-1 overflow-hidden bg-[#f8fafc] [background-image:radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]",
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
        const snapDelta = translatedNodes && activeDragStart.kind === "move"
          ? getSketchSnapDelta(scene, nextDragStart, translatedNodes, configData)
          : { x: 0, y: 0 };
        const snappedNodes = translatedNodes?.map((node) => ({
          ...node,
          x: node.x + snapDelta.x,
          y: node.y + snapDelta.y,
        })) ?? null;
        const previewNodes =
          activeDragStart.kind === "move"
            ? snappedNodes ?? activeDragStart.nodes
            : activeDragStart.kind === "resize"
              ? activeDragStart.nodes.map((node, index) => (
                  resizeLineLikeNodeEndpoint(node, activeDragStart.resizeHandle, delta) ??
                  resizedNodes?.[index] ??
                  (activeDragStart.nodeId === node.id ? resizeSketchNode(node, getBoxResizeHandle(activeDragStart.resizeHandle), delta) : node)
                ))
              : activeDragStart.nodes;
        const operations: SketchScenePatchOperation[] =
          activeDragStart.duplicateOnDrag && activeDragStart.kind === "move" && !activeDragStart.hasHistoryCheckpoint
            ? (snappedNodes ?? activeDragStart.nodes).map((node) => ({ op: "add" as const, node }))
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
          const nextNode = snappedNodes?.[index] ?? node;
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
            controller.setNodeIds(activeDragStart.selectionNodeIds ?? activeDragStart.nodes.map((node) => node.id));
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
              setInlineTextEdit(createInlineTextEditState(node, true));
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
        releasePointerCapture();
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
        setContextMenu({ x: event.clientX, y: event.clientY });
        setContextMenuPos({ x: event.clientX, y: event.clientY });
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
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 text-slate-900 shadow-lg backdrop-blur">
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
      {alignmentMenuOpen && alignmentMenuPosition ? (
        <SketchAlignmentMenu
          left={alignmentMenuPosition.left}
          top={alignmentMenuPosition.top}
          onAlign={(axis) => runQuickToolbarAction(() => alignSelected(scene, controller, axis, configData))}
          onClose={closeAlignmentMenu}
        />
      ) : null}
      {detailsPanelOpen ? (
        <div
          ref={detailsPanelRef}
          role="dialog"
          aria-label="草图工具菜单"
          data-sketch-details-panel="true"
          className={cn(
            "absolute z-40 max-h-[min(460px,calc(100%-24px))] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-slate-900 shadow-[0_12px_32px_rgba(15,23,42,0.14)]",
            detailsPanelTab === "position"
              ? "w-[min(360px,calc(100%-24px))]"
              : detailsPanelTab === "fill" || detailsPanelTab === "stroke"
                ? "w-[min(304px,calc(100%-24px))]"
                : detailsPanelTab === "more" || detailsPanelTab === "layers"
                  ? "w-max max-w-[calc(100%-24px)]"
                  : "w-[min(320px,calc(100%-24px))]",
          )}
          style={detailsBubblePosition}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
            const items = Array.from(detailsPanelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
            if (!items.length) return;
            const currentIndex = items.indexOf(document.activeElement as HTMLElement);
            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            event.preventDefault();
            items[nextIndex]?.focus();
          }}
        >
          {detailsPanelTab === "more" ? (
            <div role="menu" aria-label="更多操作">
              <FloatingMenuItem icon={<Trash2 className="h-4 w-4" />} label="删除" shortcut="Delete" disabled={!editableSelectedNodes.length} autoFocus onClick={() => { deleteSelected(scene, controller, configData); setDetailsPanelOpen(false); }} />
              <FloatingMenuSeparator />
              <FloatingMenuItem icon={<Scissors className="h-4 w-4" />} label="剪切" shortcut="⌘ X" disabled={!editableSelectedNodes.length} onClick={cutSelected} />
              <FloatingMenuItem icon={<Copy className="h-4 w-4" />} label="复制" shortcut="⌘ C" disabled={!editableSelectedNodes.length} onClick={() => { copySelected(); setDetailsPanelOpen(false); }} />
              <FloatingMenuSeparator />
              <FloatingMenuItem icon={<Copy className="h-4 w-4" />} label="复制样式" shortcut="⌘⌥ C" disabled={!selectedNode || !canEditNodeProperties(selectedNode)} onClick={() => { copyStyle(); setDetailsPanelOpen(false); }} />
              <FloatingMenuItem icon={<ClipboardPaste className="h-4 w-4" />} label="粘贴样式" shortcut="⌘⌥ V" disabled={!styleClipboardRef.current || !editableSelectedNodes.length} onClick={() => { pasteStyle(); setDetailsPanelOpen(false); }} />
              <FloatingMenuSeparator />
              <FloatingMenuItem icon={<SlidersHorizontal className="h-4 w-4" />} label="位置与大小" trailing={<ArrowRight className="h-4 w-4" />} disabled={!selectedNode || !canEditNodeProperties(selectedNode)} onClick={() => setDetailsPanelTab("position")} />
              {!selectionToolbarContext.grouped && selectedNodes.length > 1 ? (
                <>
                  <FloatingMenuSeparator />
                  <FloatingMenuItem icon={<Rows3 className="h-4 w-4 rotate-90" />} label="水平分布" disabled={layerEditableSelectedNodes.length < 3} onClick={() => { distributeSelectedHorizontally(scene, controller, configData); setDetailsPanelOpen(false); }} />
                  <FloatingMenuItem icon={<Rows3 className="h-4 w-4" />} label="垂直分布" disabled={layerEditableSelectedNodes.length < 3} onClick={() => { distributeSelectedVertically(scene, controller, configData); setDetailsPanelOpen(false); }} />
                </>
              ) : null}
            </div>
          ) : detailsPanelTab === "layers" ? (
            <div role="menu" aria-label="层级">
              <FloatingMenuItem icon={<ArrowUpToLine className="h-4 w-4" />} label="置顶" shortcut="⌘⇧ ]" disabled={!layerOperationSelectedNodes.length} autoFocus onClick={() => { bringToFront(scene, controller, configData); setDetailsPanelOpen(false); }} />
              <FloatingMenuItem icon={<ArrowUp className="h-4 w-4" />} label="上移一层" shortcut="⌘ ]" disabled={!layerOperationSelectedNodes.length} onClick={() => { bringForward(scene, controller, configData); setDetailsPanelOpen(false); }} />
              <FloatingMenuItem icon={<ArrowDown className="h-4 w-4" />} label="下移一层" shortcut="⌘ [" disabled={!layerOperationSelectedNodes.length} onClick={() => { sendBackward(scene, controller, configData); setDetailsPanelOpen(false); }} />
              <FloatingMenuItem icon={<ArrowDownToLine className="h-4 w-4" />} label="置底" shortcut="⌘⇧ [" disabled={!layerOperationSelectedNodes.length} onClick={() => { sendToBack(scene, controller, configData); setDetailsPanelOpen(false); }} />
            </div>
          ) : detailsPanelTab === "fill" || detailsPanelTab === "stroke" ? (
            <div role="menu" aria-label={detailsStyleLabel} className="p-1">
              <SketchColorPicker
                label={detailsStyleLabel}
                value={getSketchColorFieldValue(
                  detailsStyleState.value,
                  detailsPanelTab === "fill" ? "#ffffff" : "#111827",
                  true,
                )}
                mixed={detailsStyleState.mixed}
                disabled={!detailsStyleNodes.length}
                allowNoColor
                choiceRole="menuitemradio"
                autoFocus
                customColorFallback={detailsPanelTab === "fill" ? "#ffffff" : "#111827"}
                getSwatchLabel={(color) => `${detailsStyleLabel} ${color}`}
                onSelect={(color) => {
                  updateNodesStyle(
                    controller,
                    detailsStyleNodes,
                    detailsPanelTab === "fill" ? { fill: color } : { stroke: color },
                  );
                  setDetailsPanelOpen(false);
                }}
              />
            </div>
          ) : detailsPanelTab === "position" && selectedNode ? (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 p-2">
              <FloatingNumberField label="水平位置" value={selectedNode.x} disabled={!canEditNodeProperties(selectedNode)} autoFocus onChange={(value) => applySelectedPatch(scene, controller, { x: value })} />
              <FloatingNumberField label="垂直位置" value={selectedNode.y} disabled={!canEditNodeProperties(selectedNode)} onChange={(value) => applySelectedPatch(scene, controller, { y: value })} />
              <span aria-hidden="true" />
              <FloatingNumberField label="宽度" value={selectedNode.width} disabled={!canEditNodeProperties(selectedNode)} onChange={(value) => applySelectedPatch(scene, controller, floatingSizeRatioLocked && selectedNode.width ? { width: value, height: value * (selectedNode.height / selectedNode.width) } : { width: value })} />
              <FloatingNumberField label="高度" value={selectedNode.height} disabled={!canEditNodeProperties(selectedNode)} onChange={(value) => applySelectedPatch(scene, controller, floatingSizeRatioLocked && selectedNode.height ? { height: value, width: value * (selectedNode.width / selectedNode.height) } : { height: value })} />
              <button type="button" aria-label={floatingSizeRatioLocked ? "关闭尺寸比例锁定" : "开启尺寸比例锁定"} title={floatingSizeRatioLocked ? "关闭尺寸比例锁定" : "开启尺寸比例锁定"} disabled={!canEditNodeProperties(selectedNode) || selectedNode.width <= 0 || selectedNode.height <= 0} onClick={() => setFloatingSizeRatioLocked((locked) => !locked)} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40", floatingSizeRatioLocked && "bg-slate-100 text-slate-900")}>
                <Link2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              {detailsPanelTab === "properties" ? <SketchPropertyPanel scene={scene} controller={controller} configData={configData} className="h-full border-0 bg-white" /> : <SketchLayerPanel scene={scene} controller={controller} configData={configData} className="h-full border-0 bg-white" />}
            </div>
          )}
        </div>
      ) : null}
      {quickToolbarPosition && textToolbarNode ? (
        <SketchTextFloatingToolbar
          left={quickToolbarPosition.left}
          top={quickToolbarPosition.top}
          node={textToolbarNode}
          range={textToolbarRange}
          canEdit={canEditNodeProperties(textToolbarNode)}
          toolbarLabel={textToolbarNode.type === "text" ? "纯文本工具栏" : "图文工具栏"}
          leadingActions={textToolbarNode.type === "text"
            ? EMPTY_SKETCH_FLOATING_TOOLBAR_ACTIONS
            : floatingToolbarActions.filter((action) => action.id === "fill" || action.id === "stroke")}
          useNodeDefaultColor={textToolbarNode.type !== "text"}
          onWidthChange={handleFloatingToolbarWidthChange}
          onPointerDown={() => activateSketchKeyboardScope(controller)}
          onToggleBold={toggleTextBold}
          onToggleItalic={toggleTextItalic}
          onToggleUnderline={toggleTextUnderline}
          onFontSize={setTextFontSize}
          onColor={setTextColor}
          onAlign={applyTextToolbarAlignment}
          onOpenLayers={(trigger) => runQuickToolbarAction(() => openTextDetails("layers", trigger))}
          onOpenMore={(trigger) => runQuickToolbarAction(() => openTextDetails("more", trigger))}
        />
      ) : null}
      {quickToolbarPosition && floatingToolbarActions.length && !textToolbarNode ? (
        <SketchFloatingToolbar
          left={quickToolbarPosition.left}
          top={quickToolbarPosition.top}
          actions={floatingToolbarActions}
          onWidthChange={handleFloatingToolbarWidthChange}
          onPointerDown={() => activateSketchKeyboardScope(controller)}
        />
      ) : null}
      <div
        ref={stageRef}
        data-sketch-stage
        className="absolute left-0 top-0 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.16)] ring-1 ring-slate-200"
        style={{
          // Keep the stage in scene coordinates; fillContainer only affects its preview wrapper.
          width,
          height,
          transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
          transformOrigin: "0 0",
        }}
        onPointerDown={(event) => {
          setContextMenu(null);
          if (mode !== "edit") return;
          activateSketchKeyboardScope(controller);
          updateHoveredNodeId(null);
          setImageFitEditNodeId(null);
          if (typeof event.button === "number" && event.button !== 0) {
            event.preventDefault();
            return;
          }
          if (isSpacePanning) return;
          const target = event.target as Element;
          if (controller.tool === "hand") return;
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
          const hitNodeId = getSketchCanvasHitNodeId(scene, target, point, configData);
          if ((event.metaKey || event.ctrlKey) && point) {
            const candidateIds = Array.from(new Set(
              getHitTestCandidateNodeIds(scene, point, configData).map((candidateId) =>
                resolveSketchCanvasSelectionTarget(scene, candidateId, focusedGroupIdRef.current).selectionNodeId,
              ),
            ));
            if (candidateIds.length) {
              event.preventDefault();
              const currentCandidateIndex = candidateIds.findIndex((id) => controller.selection.nodeIds.includes(id));
              const nextCandidateId = candidateIds[(currentCandidateIndex + 1) % candidateIds.length];
              const nextTarget = resolveSketchCanvasSelectionTarget(scene, nextCandidateId, focusedGroupIdRef.current);
              if (focusedGroupIdRef.current && nextTarget.groupId !== focusedGroupIdRef.current) {
                focusedGroupIdRef.current = null;
                setFocusedGroupId(null);
              }
              controller.setNodeIds([nextCandidateId]);
              return;
            }
          }
          if (hitNodeId) {
            const focusedGroupAtPointerDown = focusedGroupIdRef.current;
            const resolvedTarget = resolveSketchCanvasSelectionTarget(scene, hitNodeId, focusedGroupAtPointerDown);
            if (focusedGroupAtPointerDown && resolvedTarget.groupId !== focusedGroupAtPointerDown) {
              focusedGroupIdRef.current = null;
              setFocusedGroupId(null);
            }
            const targetSelectionId = resolvedTarget.selectionNodeId;
            const wasSelected = controller.selection.nodeIds.includes(targetSelectionId);
            const keepCurrentSelection =
              !event.shiftKey &&
              controller.selection.nodeIds.length > 1 &&
              wasSelected;
            let nextIds: string[];
            if (event.shiftKey) {
              nextIds = wasSelected
                ? controller.selection.nodeIds.filter((id) => id !== targetSelectionId)
                : [...controller.selection.nodeIds, targetSelectionId];
            } else {
              nextIds = keepCurrentSelection ? controller.selection.nodeIds : [targetSelectionId];
            }
            controller.setNodeIds(nextIds);
            if (event.shiftKey && wasSelected) return;
            const selectedSceneNodes = scene.nodes.filter((item) => nextIds.includes(item.id));
            const dragNodes = getSelectionMoveNodes(scene, selectedSceneNodes, configData);
            if (point && dragNodes.length) {
              const duplicateOnDrag = event.altKey && !event.shiftKey;
              const duplicateSourceNodes = duplicateOnDrag
                ? expandSketchNodesForInsert(scene, selectedSceneNodes, configData)
                : [];
              const nodesForDrag = duplicateOnDrag
                ? cloneSketchNodesForInsert(duplicateSourceNodes, { x: 0, y: 0 })
                : dragNodes;
              if (!nodesForDrag.length) return;
              const duplicateGroup = duplicateOnDrag && selectedSceneNodes.length === 1 && selectedSceneNodes[0].type === "group"
                ? nodesForDrag.find((node) => node.type === "group")
                : null;
              capturePointer(event);
              setActiveDragStart({
                kind: "move",
                pointer: point,
                nodes: nodesForDrag,
                initialScene: scene,
                hasHistoryCheckpoint: false,
                duplicateOnDrag,
                sourceNodeIds: duplicateOnDrag ? duplicateSourceNodes.map((item) => item.id) : undefined,
                selectionNodeIds: duplicateGroup ? [duplicateGroup.id] : undefined,
              });
            }
          } else {
            if (!point) return;
            if (focusedGroupIdRef.current) {
              focusedGroupIdRef.current = null;
              setFocusedGroupId(null);
            }
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
          viewportScale={viewport.scale}
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
          />
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
              data-sketch-inline-text-editor="true"
              wrap="off"
              spellCheck={false}
              className="absolute z-20 resize-none rounded-sm border border-[#3da0ff] bg-transparent px-2 py-1 text-[#111827] outline-none ring-2 ring-[#3da0ff]/30 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              style={inlineTextEditMetrics.style}
              placeholder={inlineTextNode.type === "text" && !inlineTextEdit.deleteWhenEmpty ? SKETCH_TEXT_PLACEHOLDER : inlineTextNode.type === "text" ? undefined : "输入形状文本"}
              value={inlineTextEdit.value}
              onPointerDown={(event) => {
                event.stopPropagation();
                activateSketchKeyboardScope(controller);
              }}
              onPointerUp={(event) => updateInlineTextSelection(event.currentTarget, inlineTextNode.id)}
              onSelect={(event) => updateInlineTextSelection(event.currentTarget, inlineTextNode.id)}
              onChange={(event) => {
                updateInlineTextSelection(event.currentTarget, inlineTextNode.id);
                const nextValue = event.target.value;
                setInlineTextEdit((current) => current ? {
                  ...current,
                  value: nextValue,
                  textStyleRuns: normalizeSketchTextStyleRuns(nextValue, current.textStyleRuns),
                } : current);
              }}
              onBlur={(event) => {
                const relatedTarget = event.relatedTarget;
                if (relatedTarget instanceof Element && relatedTarget.closest("[data-sketch-text-toolbar]")) return;
                commitInlineTextEdit();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelInlineTextEdit();
                }
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  inlineTextNode.type === "text" &&
                  inlineTextEdit.deleteWhenEmpty &&
                  inlineTextEdit.value.trim() === ""
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  commitInlineTextEdit();
                }
                if (event.key === "Enter" && !event.shiftKey && inlineTextNode.type !== "text") {
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
      {contextMenu && typeof document !== "undefined" ? (
        createPortal(
          <>
          <div
            aria-hidden
            onPointerDown={(event) => {
              event.stopPropagation();
              setContextMenu(null);
            }}
            className="fixed inset-0 cursor-default"
            style={{ zIndex: 9998 }}
          />
          <div
            ref={contextMenuRef}
            role="menu"
            aria-label="草图右键菜单"
            className="fixed min-w-36 overflow-hidden rounded-md border border-border bg-card py-1 text-sm text-foreground shadow-2xl"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y, zIndex: 9999 }}
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
            disabled={!layerOperationSelectedNodes.length}
            onClick={() => runContextMenuAction(() => bringToFront(scene, controller, configData))}
          />
          <ContextMenuButton
            label="上移一层"
            disabled={!layerOperationSelectedNodes.length}
            onClick={() => runContextMenuAction(() => bringForward(scene, controller, configData))}
          />
          <ContextMenuButton
            label="下移一层"
            disabled={!layerOperationSelectedNodes.length}
            onClick={() => runContextMenuAction(() => sendBackward(scene, controller, configData))}
          />
          <ContextMenuButton
            label="置底"
            disabled={!layerOperationSelectedNodes.length}
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
          </>,
          document.body,
        )
      ) : null}
    </div>
  );
}

type SketchTextToolbarMenu = "size" | "color" | "align" | null;

function SketchTextFloatingToolbar({
  left,
  top,
  node,
  range,
  canEdit,
  toolbarLabel = "纯文本工具栏",
  leadingActions = EMPTY_SKETCH_FLOATING_TOOLBAR_ACTIONS,
  useNodeDefaultColor = false,
  onWidthChange,
  onPointerDown,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onFontSize,
  onColor,
  onAlign,
  onOpenLayers,
  onOpenMore,
}: {
  left: number;
  top: number;
  node: SketchSceneNode;
  range: { start: number; end: number } | null;
  canEdit: boolean;
  toolbarLabel?: string;
  leadingActions?: SketchFloatingToolbarAction[];
  useNodeDefaultColor?: boolean;
  onWidthChange: (width: number) => void;
  onPointerDown: () => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onFontSize: (value: number) => void;
  onColor: (value: string) => void;
  onAlign: (value: "left" | "center" | "right") => void;
  onOpenLayers: (trigger: HTMLElement) => void;
  onOpenMore: (trigger: HTMLElement) => void;
}) {
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuAnchorRef = React.useRef<HTMLElement | null>(null);
  const [openMenu, setOpenMenu] = React.useState<SketchTextToolbarMenu>(null);
  const [menuPosition, setMenuPosition] = React.useState<{ left: number; top: number } | null>(null);
  const fontSizeState = getTextStyleStateValue(node, range, "fontSize");
  const fontSizeValue = typeof fontSizeState.value === "number" && Number.isFinite(fontSizeState.value)
    ? String(Math.round(fontSizeState.value))
    : "";
  const [fontSizeDraft, setFontSizeDraft] = React.useState(fontSizeValue);
  const boldState = getTextStyleStateValue(node, range, "fontWeight");
  const italicState = getTextStyleStateValue(node, range, "italic");
  const decorationState = getTextStyleStateValue(node, range, "textDecoration");
  const colorState = getTextStyleStateValue(node, range, "color");
  const resolvedTextColor = toColorInputValue(colorState.value, SKETCH_TEXT_DEFAULT_COLOR);
  const currentColor = useNodeDefaultColor
    ? toColorInputValue(node.style?.color, SKETCH_TEXT_DEFAULT_COLOR)
    : resolvedTextColor;
  const currentAlign = node.style?.textAlign ?? "left";
  const AlignIcon = currentAlign === "center" ? AlignCenter : currentAlign === "right" ? AlignRight : AlignLeft;

  React.useEffect(() => {
    setFontSizeDraft(fontSizeState.mixed ? "" : fontSizeValue);
  }, [fontSizeState.mixed, fontSizeValue]);

  React.useEffect(() => {
    if (!openMenu) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!toolbarRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  const positionOpenMenu = React.useCallback(() => {
    if (!openMenu) return;
    const anchor = menuAnchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu || typeof window === "undefined") return;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const margin = 12;
    const gap = 6;
    const preferredLeft = openMenu === "size"
      ? anchorRect.left
      : anchorRect.left + anchorRect.width / 2 - menuRect.width / 2;
    const left = Math.min(
      Math.max(margin, preferredLeft),
      Math.max(margin, window.innerWidth - menuRect.width - margin),
    );
    const below = anchorRect.bottom + gap;
    const above = anchorRect.top - gap - menuRect.height;
    const top = below + menuRect.height <= window.innerHeight - margin || above < margin ? below : above;
    const nextPosition = { left, top };
    setMenuPosition((current) => (
      current && current.left === nextPosition.left && current.top === nextPosition.top
        ? current
        : nextPosition
    ));
  }, [openMenu]);

  React.useLayoutEffect(() => {
    if (!openMenu) {
      setMenuPosition(null);
      return undefined;
    }
    setMenuPosition(null);
    positionOpenMenu();
    const handleViewportChange = () => positionOpenMenu();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [openMenu, positionOpenMenu]);

  React.useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const reportWidth = () => {
      const nextWidth = toolbar.getBoundingClientRect().width || toolbar.offsetWidth;
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
      onWidthChange(nextWidth);
    };
    reportWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", reportWidth);
      return () => window.removeEventListener("resize", reportWidth);
    }
    const observer = new ResizeObserver(reportWidth);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [onWidthChange]);

  const commitFontSize = React.useCallback(() => {
    const value = Number(fontSizeDraft);
    if (!Number.isInteger(value) || value < 1 || value > 512) {
      setFontSizeDraft(fontSizeState.mixed ? "" : fontSizeValue);
      return;
    }
    onFontSize(value);
    setFontSizeDraft(String(value));
  }, [fontSizeDraft, fontSizeState.mixed, fontSizeValue, onFontSize]);

  const chooseColor = React.useCallback((color: string) => {
    onColor(color);
    setOpenMenu(null);
  }, [onColor]);

  const chooseAlign = React.useCallback((align: "left" | "center" | "right") => {
    onAlign(align);
    setOpenMenu(null);
  }, [onAlign]);

  const textColorControl = (
    <SketchMainToolbarTooltip label="文字颜色">
      <div className="relative pointer-events-auto shrink-0">
        <button
          type="button"
          aria-label="悬浮文字颜色"
          disabled={!canEdit}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40",
            openMenu === "color" && "bg-slate-100 text-slate-900",
          )}
          onClick={(event) => {
            menuAnchorRef.current = event.currentTarget;
            setOpenMenu((current) => current === "color" ? null : "color");
          }}
        >
          <SketchTextColorIndicator color={currentColor} />
        </button>
      </div>
    </SketchMainToolbarTooltip>
  );

  const textToolbarMenuPortal = openMenu && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={openMenu === "size" ? "字号选项" : openMenu === "color" ? "文字颜色" : "对齐方式"}
          className={cn(
            "pointer-events-auto fixed z-[1000] rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xl",
            openMenu === "size" && "grid w-36 grid-cols-3 gap-1 p-1",
            openMenu === "color" && "w-[min(304px,calc(100vw-24px))] p-2",
            openMenu === "align" && "flex gap-1 p-1",
          )}
          style={{
            left: menuPosition?.left ?? 0,
            top: menuPosition?.top ?? 0,
            visibility: menuPosition ? "visible" : "hidden",
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {openMenu === "size" ? (
            SKETCH_TEXT_SIZE_PRESETS.map((size) => (
              <button
                key={size}
                type="button"
                role="menuitemradio"
                aria-checked={!fontSizeState.mixed && Number(fontSizeValue) === size}
                className={cn(
                  "h-8 rounded-md text-xs hover:bg-slate-50",
                  !fontSizeState.mixed && Number(fontSizeValue) === size && "bg-slate-100 font-semibold text-slate-900",
                )}
                onClick={() => {
                  onFontSize(size);
                  setFontSizeDraft(String(size));
                  setOpenMenu(null);
                }}
              >
                {size}
              </button>
            ))
          ) : openMenu === "color" ? (
            <SketchColorPicker
              label="文字颜色"
              value={currentColor}
              choiceRole="menuitemradio"
              customColorFallback={SKETCH_TEXT_DEFAULT_COLOR}
              getSwatchLabel={(color) => `文字颜色 ${color}`}
              onSelect={chooseColor}
            />
          ) : (
            ([
              { value: "left" as const, label: "左对齐", icon: AlignLeft },
              { value: "center" as const, label: "居中对齐", icon: AlignCenter },
              { value: "right" as const, label: "右对齐", icon: AlignRight },
            ]).map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={currentAlign === option.value}
                  aria-label={`对齐方式 ${option.label}`}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    currentAlign === option.value && "bg-slate-100 text-slate-900",
                  )}
                  onClick={() => chooseAlign(option.value)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              );
            })
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={toolbarLabel}
      data-testid="sketch-text-floating-toolbar"
      data-sketch-text-toolbar="true"
      className="pointer-events-none absolute z-30 flex max-w-[calc(100%-24px)] flex-nowrap -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-lg border border-slate-200 bg-white/95 p-1 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      style={{ left, top }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPointerDown();
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape" && openMenu) {
          event.preventDefault();
          setOpenMenu(null);
        }
      }}
    >
      {leadingActions.map((action) => (
        <SketchFloatingToolbarActionButton key={action.id} action={action} />
      ))}
      {leadingActions.length ? <div className="mx-1 h-5 w-px shrink-0 bg-slate-200" role="separator" /> : null}
      {leadingActions.length ? textColorControl : null}
      <SketchMainToolbarTooltip label="字号">
        <div className="relative pointer-events-auto flex shrink-0 items-center rounded-md border border-transparent focus-within:border-slate-200">
        <input
          type="number"
          min={1}
          max={512}
          step={1}
          value={fontSizeDraft}
          disabled={!canEdit}
          placeholder={fontSizeState.mixed ? "混合" : undefined}
          aria-label="悬浮字号"
          className="h-8 w-12 rounded-l-md border-0 bg-transparent px-1.5 text-center text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPointerDown();
            event.currentTarget.focus();
          }}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setFontSizeDraft(nextDraft);
            const nextValue = Number(nextDraft);
            if (Number.isInteger(nextValue) && nextValue >= 1 && nextValue <= 512) onFontSize(nextValue);
          }}
          onBlur={commitFontSize}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitFontSize();
            }
          }}
        />
        <button
          type="button"
          aria-label="打开字号选项"
          disabled={!canEdit}
          className={cn(
            "inline-flex h-8 w-6 items-center justify-center rounded-r-md text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40",
            openMenu === "size" && "bg-slate-100 text-slate-900",
          )}
          onClick={(event) => {
            menuAnchorRef.current = event.currentTarget;
            setOpenMenu((current) => current === "size" ? null : "size");
          }}
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        </div>
      </SketchMainToolbarTooltip>
      {!leadingActions.length ? <div className="mx-1 h-5 w-px shrink-0 bg-slate-200" role="separator" /> : null}
      <SketchMainToolbarTooltip label="加粗">
        <SketchTextToolbarIconButton
          label="加粗"
          icon={<Bold className="h-4 w-4" strokeWidth={2.5} />}
          active={!boldState.mixed && isSketchBoldFontWeight(boldState.value)}
          mixed={boldState.mixed}
          disabled={!canEdit}
          onClick={onToggleBold}
        />
      </SketchMainToolbarTooltip>
      <SketchMainToolbarTooltip label="斜体">
        <SketchTextToolbarIconButton
          label="斜体"
          icon={<Italic className="h-4 w-4" />}
          active={!italicState.mixed && italicState.value === true}
          mixed={italicState.mixed}
          disabled={!canEdit}
          onClick={onToggleItalic}
        />
      </SketchMainToolbarTooltip>
      <SketchMainToolbarTooltip label="下划线">
        <SketchTextToolbarIconButton
          label="下划线"
          icon={<Underline className="h-4 w-4" />}
          active={!decorationState.mixed && decorationState.value === "underline"}
          mixed={decorationState.mixed}
          disabled={!canEdit}
          onClick={onToggleUnderline}
        />
      </SketchMainToolbarTooltip>
      {!leadingActions.length ? <div className="mx-1 h-5 w-px shrink-0 bg-slate-200" role="separator" /> : null}
      {!leadingActions.length ? textColorControl : null}
      <SketchMainToolbarTooltip label="对齐方式">
        <div className="relative pointer-events-auto">
        <button
          type="button"
          aria-label="对齐方式"
          disabled={!canEdit}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40",
            openMenu === "align" && "bg-slate-100 text-slate-900",
          )}
          onClick={(event) => {
            menuAnchorRef.current = event.currentTarget;
            setOpenMenu((current) => current === "align" ? null : "align");
          }}
        >
          <AlignIcon className="h-4 w-4" aria-hidden="true" />
        </button>
        </div>
      </SketchMainToolbarTooltip>
      <SketchMainToolbarTooltip label="层级">
        <SketchTextToolbarIconButton
          label="层级"
          icon={<Layers className="h-4 w-4" />}
          disabled={!canEdit}
          onClick={(event) => {
            setOpenMenu(null);
            onOpenLayers(event.currentTarget);
          }}
        />
      </SketchMainToolbarTooltip>
      <SketchMainToolbarTooltip label="更多">
        <SketchTextToolbarIconButton
          label="更多"
          icon={<MoreHorizontal className="h-4 w-4" />}
          onClick={(event) => {
            setOpenMenu(null);
            onOpenMore(event.currentTarget);
          }}
        />
      </SketchMainToolbarTooltip>
      {textToolbarMenuPortal}
    </div>
  );
}

function SketchTextToolbarIconButton({
  label,
  icon,
  active = false,
  mixed = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  mixed?: boolean;
  disabled?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`悬浮${label}`}
      aria-pressed={mixed ? "mixed" : active}
      disabled={disabled}
      className={cn(
        "pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40",
        active && "bg-slate-100 text-slate-900",
        mixed && "bg-slate-50 text-slate-700",
      )}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function SketchFloatingToolbar({
  left,
  top,
  actions,
  onWidthChange,
  onPointerDown,
}: {
  left: number;
  top: number;
  actions: SketchFloatingToolbarAction[];
  onWidthChange: (width: number) => void;
  onPointerDown: () => void;
}) {
  const toolbarRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const reportWidth = () => {
      const nextWidth = toolbar.getBoundingClientRect().width || toolbar.offsetWidth;
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
      onWidthChange(nextWidth);
    };

    reportWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", reportWidth);
      return () => window.removeEventListener("resize", reportWidth);
    }

    const observer = new ResizeObserver(reportWidth);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [onWidthChange]);

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="草图悬浮快捷工具条"
      data-sketch-floating-toolbar="true"
      className="pointer-events-none absolute z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur"
      style={{ left, top }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {actions.map((action) => <SketchFloatingToolbarActionButton key={action.id} action={action} />)}
    </div>
  );
}

const SKETCH_ALIGNMENT_MENU_ITEMS: Array<{
  axis: SketchAlignmentAxis;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { axis: "left", label: "左对齐", icon: AlignHorizontalJustifyStart },
  { axis: "center", label: "水平居中", icon: AlignHorizontalJustifyCenter },
  { axis: "right", label: "右对齐", icon: AlignHorizontalJustifyEnd },
  { axis: "top", label: "顶对齐", icon: AlignVerticalJustifyStart },
  { axis: "middle", label: "垂直居中", icon: AlignVerticalJustifyCenter },
  { axis: "bottom", label: "底对齐", icon: AlignVerticalJustifyEnd },
];

function SketchAlignmentMenu({
  left,
  top,
  onAlign,
  onClose,
}: {
  left: number;
  top: number;
  onAlign: (axis: SketchAlignmentAxis) => void;
  onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    firstItem?.focus();
  }, []);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (currentIndex < 0 ? 0 : currentIndex + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    event.stopPropagation();
    items[nextIndex]?.focus();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="对齐方式"
      data-sketch-alignment-menu="true"
      className="pointer-events-auto absolute z-40 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.14)] backdrop-blur"
      style={{ left, top, transform: "translateX(-50%)" }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={moveFocus}
    >
      {SKETCH_ALIGNMENT_MENU_ITEMS.slice(0, 3).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.axis}
            type="button"
            role="menuitem"
            aria-label={item.label}
            title={item.label}
            data-sketch-alignment={item.axis}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            onClick={() => {
              onAlign(item.axis);
              onClose();
            }}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
      <div className="mx-1 h-5 w-px shrink-0 bg-slate-200" role="separator" />
      {SKETCH_ALIGNMENT_MENU_ITEMS.slice(3).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.axis}
            type="button"
            role="menuitem"
            aria-label={item.label}
            title={item.label}
            data-sketch-alignment={item.axis}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            onClick={() => {
              onAlign(item.axis);
              onClose();
            }}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

function ContextMenuSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />;
}

function FloatingMenuSeparator() {
  return <div className="my-1 h-px bg-slate-100" role="separator" />;
}

function FloatingMenuItem({
  icon,
  label,
  shortcut,
  trailing,
  disabled,
  autoFocus,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      autoFocus={autoFocus}
      disabled={disabled}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onClick}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-500" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">{shortcut}</kbd> : null}
      {trailing ? <span className="shrink-0 text-slate-400" aria-hidden="true">{trailing}</span> : null}
    </button>
  );
}

function FloatingNumberField({
  label,
  value,
  disabled,
  autoFocus,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-1.5 text-xs text-slate-600">
      <span className="w-12 shrink-0">{label}</span>
      <input
        type="number"
        value={formatNumberFieldValue(value, true)}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-8 min-w-0 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:opacity-50"
      />
    </label>
  );
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

/**
 * Standard editable whiteboard workspace. Hosts own the surrounding chrome and
 * persistence, while the canvas, keyboard scope, and floating primary toolbar
 * remain one shared composition.
 */
export function SketchEditorSurface({
  scene,
  configData = {},
  allowedTools,
  fillContainer = false,
  className,
  onSceneChange,
  onSelectionChange,
}: SketchEditorSurfaceProps) {
  const controller = useSketchEditorState(scene, onSceneChange, onSelectionChange, configData, allowedTools);

  return (
    <div data-sketch-editor-surface className={cn("relative flex h-full min-h-0 flex-col overflow-hidden bg-slate-100", className)}>
      <SketchEditorCanvas
        scene={scene}
        controller={controller}
        configData={configData}
        fillContainer={fillContainer}
        className="h-full"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
        <SketchEditorToolbar scene={scene} controller={controller} configData={configData} allowedTools={allowedTools} className="pointer-events-auto" />
      </div>
    </div>
  );
}

export type {
  PreviewSize,
  SketchTool,
  SketchEditorMode,
  SketchEditorSelection,
  SketchPagePreviewProps,
  SketchPageEditorProps,
  SketchEditorSurfaceProps,
  SketchEditorController,
  SketchEditorPartProps,
  SketchEditorCanvasProps,
  SketchPropertyPanelProps,
  SketchEditorToolbarProps,
  SketchLayerPanelProps,
  InlineTextSelectionState,
} from "./types";
