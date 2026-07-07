"use client";

import React, { useMemo } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  ArrowRight,
  Circle,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  ImageIcon,
  Lock,
  LocateFixed,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  StickyNote,
  Type,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  applySketchScenePatchOperations,
  createDefaultSketchScene,
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
  type SketchSceneDocument,
  type SketchSceneNode,
  type SketchSceneNodeType,
  type SketchScenePatchOperation,
  type SketchSceneResizeHandle,
  type SketchSceneStyle,
  type SketchSceneTextStyleOverride,
} from "@workbench/sketch-core";

export type PreviewSize = {
  width?: number | string;
  height?: number | string;
};

export type SketchTool =
  | "select"
  | "hand"
  | "rect"
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

interface ContextMenuState {
  x: number;
  y: number;
}

interface PendingImageImportState {
  point?: { x: number; y: number };
  replaceNodeId?: string;
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
      text: "双击编辑文本",
      style: { ...base.style, fill: "transparent", stroke: "transparent", fontSize: 24 },
    };
  }
  if (type === "sticky") {
    return {
      ...base,
      type: "sticky",
      text: "便签",
      style: { ...base.style, fill: "#FEF3C7", stroke: "#F59E0B", color: "#78350F" },
    };
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
  const shouldPreserveAspectRatio = options.shiftKey && (tool === "rect" || tool === "ellipse");
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
  const selectionState = useSketchSelection(scene, onSelectionChange, configData);
  const history = useSketchHistory(scene, onSceneChange);

  return {
    keyboardScopeId,
    tool,
    setTool,
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
      className="pointer-events-none absolute border border-[#62b7ff]"
      data-testid="sketch-selection-box"
      style={{
        left,
        top,
        width,
        height,
      }}
    >
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
    node.type !== "ellipse" &&
    node.type !== "text" &&
    node.type !== "sticky" &&
    node.type !== "button" &&
    node.type !== "input" &&
    node.type !== "card"
  ) return false;
  return canEditNodeProperties(node) && isNodeVisibleForConfig(node, configData);
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
  return node.type === "rect" || node.type === "ellipse" || node.type === "text" || node.type === "sticky" || node.type === "button" || node.type === "input" || node.type === "card";
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

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
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
) {
  if (!controller.selection.nodeIds.length) return;
  const editableNodes = getEditableSelectedNodes(scene, controller).filter(canEditNodeProperties);
  if (!editableNodes.length) return;
  const operations = editableNodes.flatMap((node) => {
    const sanitizedPatch = sanitizeEditablePatch(node, patch);
    return sanitizedPatch ? [{ op: "update" as const, nodeId: node.id, patch: sanitizedPatch }] : [];
  });
  if (!operations.length) return;
  controller.applyOperations(operations);
}

function updateSelectedStyle(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  stylePatch: NonNullable<SketchSceneNode["style"]>,
) {
  const selectedNode = getSingleSelectedNode(scene, controller);
  if (!selectedNode || !canEditNodeProperties(selectedNode)) return;
  applySelectedPatch(scene, controller, {
    style: { ...selectedNode.style, ...stylePatch },
  });
}

function updateNodesStyle(
  controller: SketchEditorController,
  nodes: SketchSceneNode[],
  stylePatch: NonNullable<SketchSceneNode["style"]>,
) {
  if (!nodes.length) return;
  controller.applyOperations(
    nodes.map((node) => ({
      op: "update" as const,
      nodeId: node.id,
      patch: { style: { ...node.style, ...stylePatch } },
    })),
  );
}

function updateSelectedTextStyleRun(
  scene: SketchSceneDocument,
  controller: SketchEditorController,
  stylePatch: SketchSceneTextStyleOverride,
) {
  const selectedNode = getSingleSelectedNode(scene, controller);
  if (!selectedNode || !canEditNodeProperties(selectedNode) || !supportsTextStyle(selectedNode)) return;
  const text = selectedNode.text ?? "";
  if (!text.length) return;
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
  });
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

export function SketchLayerPanel({ scene, controller, configData = {}, className }: SketchLayerPanelProps) {
  const orderedNodes = getLayerPanelNodes(scene);
  const [layerContextMenu, setLayerContextMenu] = React.useState<ContextMenuState | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const selectedNodes = getSelectedNodes(scene, controller);
  const editableSelectedNodes = selectedNodes.filter((node) => !node.locked && !isNodeHiddenByRuntimeConfig(node, configData));
  const layerEditableSelectedNodes = getLayerEditableSelectedNodes(scene, controller, configData);
  const lockableSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData));
  const visibleToggleSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData));
  const selectedGroupNodes = getSelectedGroupNodes(scene, controller);
  const canGroupSelection = getGroupableSelectedNodes(scene, controller, configData).length >= 2;
  const canUngroupSelection = selectedGroupNodes.length > 0;

  const runLayerContextMenuAction = React.useCallback((action: () => void) => {
    action();
    setLayerContextMenu(null);
  }, []);

  return (
    <div
      ref={panelRef}
      data-testid="sketch-layer-panel"
      className={cn("relative flex h-full min-h-0 flex-col bg-card", className)}
      onPointerDownCapture={() => activateSketchKeyboardScope(controller)}
    >
      <div className="border-b border-border px-3 py-3">
        <div className="text-[13px] font-semibold text-foreground">Layers</div>
        <div className="mt-1 text-xs text-muted-foreground">{scene.nodes.length} objects</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {orderedNodes.length ? (
          <div className="space-y-0.5">
            {orderedNodes.map((node) => {
              const selected = controller.selection.nodeIds.includes(node.id);
              const nodeName = getNodeDisplayName(node);
              const canToggleLock = node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData);
              const canToggleVisible = node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData);
              return (
                <div
                  key={node.id}
                  data-sketch-layer-row
                  data-sketch-layer-node-id={node.id}
                  className={cn(
                    "group flex h-9 w-full min-w-0 items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent",
                    selected ? "bg-[#2f5d97] text-foreground ring-1 ring-[#3da0ff]" : "text-foreground",
                    node.visible === false && "opacity-50",
                  )}
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
                  <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={nodeName}
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
                    <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{nodeName}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{NODE_TYPE_LABELS[node.type]}</span>
                  </button>
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
            })}
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
  const [pathSimplifyTolerance, setPathSimplifyTolerance] = React.useState(2);
  const selectedNodes = getSelectedNodes(scene, controller);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

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
          <div className="divide-y divide-border">
            <section className="space-y-3 px-4 py-4">
              <div className="text-sm font-semibold text-foreground">多选样式</div>
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
                      onChange={(value) => updateNodesStyle(controller, editableNodes, { fill: value })}
                    />
                  ) : null}
                  {canBatchStroke ? (
                    <>
                      <ColorField
                        label="描边"
                        value={toColorInputValue(stroke.value, "#1F2937")}
                        mixed={stroke.mixed}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { stroke: value })}
                      />
                      <NumberField
                        label="线宽"
                        value={typeof strokeWidth.value === "number" ? strokeWidth.value : 1}
                        min={0}
                        mixed={strokeWidth.mixed}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { strokeWidth: value })}
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
                    onChange={(value) => updateNodesStyle(controller, editableNodes, { opacity: value })}
                  />
                  {canBatchRadius ? (
                    <NumberField
                      label="圆角"
                      value={typeof radius.value === "number" ? radius.value : 0}
                      min={0}
                      mixed={radius.mixed}
                      onChange={(value) => updateNodesStyle(controller, editableNodes, { radius: value })}
                    />
                  ) : null}
                  {canBatchText ? (
                    <>
                      <ColorField
                        label="文字颜色"
                        value={toColorInputValue(color.value, "#111827")}
                        mixed={color.mixed}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { color: value })}
                      />
                      <NumberField
                        label="字号"
                        value={typeof fontSize.value === "number" ? fontSize.value : 16}
                        min={1}
                        mixed={fontSize.mixed}
                        onChange={(value) => updateNodesStyle(controller, editableNodes, { fontSize: value })}
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
            </section>
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
  const textRunStyle = supportsTextStyle(selectedNode) ? getFullTextStyleRunStyle(selectedNode) : {};
  const lineLike = isLineLikeNode(selectedNode);
  const lineEndX = selectedNode.x + selectedNode.width;
  const lineEndY = selectedNode.y + selectedNode.height;
  const pathPointCount = selectedNode.type === "path" ? selectedNode.points?.length ?? 0 : 0;
  const canSimplifyPath = selectedNode.type === "path" && pathPointCount > 2 && !propertyReadOnly;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)} onPointerDownCapture={() => activateSketchKeyboardScope(controller)}>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">Design</h2>
          <p className="truncate text-sm font-semibold text-foreground">{getNodeDisplayName(selectedNode)}</p>
        </div>
        <BadgeLike>{NODE_TYPE_LABELS[selectedNode.type]}</BadgeLike>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y divide-border">
          <section className="space-y-3 px-4 py-4">
            <div className="text-sm font-semibold text-foreground">通用</div>
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>名称</span>
              <input
                className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                value={selectedNode.name ?? ""}
                disabled={propertyReadOnly}
                onChange={(event) => {
                  if (propertyReadOnly) return;
                  applySelectedPatch(scene, controller, { name: event.target.value });
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
          </section>
          {contentControl ? (
            <section className="space-y-2 px-4 py-4">
              <div className="text-sm font-semibold text-foreground">{contentControl.label}</div>
              <input
                className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                value={contentControl.value}
                disabled={propertyReadOnly}
                onChange={(event) => {
                  if (propertyReadOnly) return;
                  applySelectedPatch(scene, controller, contentControl.toPatch(event.target.value));
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
            </section>
          ) : null}
          <section className="space-y-3 px-4 py-4">
            <div className="text-sm font-semibold text-foreground">几何</div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="X" value={selectedNode.x} disabled={propertyReadOnly} onChange={(value) => {
                if (propertyReadOnly) return;
                applySelectedPatch(scene, controller, { x: value });
              }} />
              <NumberField label="Y" value={selectedNode.y} disabled={propertyReadOnly} onChange={(value) => {
                if (propertyReadOnly) return;
                applySelectedPatch(scene, controller, { y: value });
              }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="W" value={selectedNode.width} disabled={propertyReadOnly} onChange={(value) => {
                if (propertyReadOnly) return;
                applySelectedPatch(scene, controller, { width: value });
              }} />
              <NumberField label="H" value={selectedNode.height} disabled={propertyReadOnly} onChange={(value) => {
                if (propertyReadOnly) return;
                applySelectedPatch(scene, controller, { height: value });
              }} />
              <NumberField
                label="旋转"
                value={selectedNode.rotation ?? 0}
                disabled={propertyReadOnly}
                onChange={(value) => {
                  if (propertyReadOnly) return;
                  applySelectedPatch(scene, controller, { rotation: rotateSketchNode(selectedNode, value).rotation });
                }}
              />
            </div>
          </section>
          {lineLike ? (
            <section className="space-y-3 px-4 py-4">
              <div className="text-sm font-semibold text-foreground">线条端点</div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="起点 X"
                  value={selectedNode.x}
                  disabled={propertyReadOnly}
                  onChange={(value) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { x: value, width: lineEndX - value });
                  }}
                />
                <NumberField
                  label="起点 Y"
                  value={selectedNode.y}
                  disabled={propertyReadOnly}
                  onChange={(value) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { y: value, height: lineEndY - value });
                  }}
                />
                <NumberField
                  label="终点 X"
                  value={lineEndX}
                  disabled={propertyReadOnly}
                  onChange={(value) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { width: value - selectedNode.x });
                  }}
                />
                <NumberField
                  label="终点 Y"
                  value={lineEndY}
                  disabled={propertyReadOnly}
                  onChange={(value) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { height: value - selectedNode.y });
                  }}
                />
              </div>
            </section>
          ) : null}
          {selectedNode.type === "path" ? (
            <section className="space-y-3 px-4 py-4">
              <div className="text-sm font-semibold text-foreground">路径</div>
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
            </section>
          ) : null}
          {primaryColorControl ? (
            <section className="space-y-3 px-4 py-4">
              <div className="text-sm font-semibold text-foreground">样式</div>
              <div className="grid grid-cols-2 gap-2">
                {supportsFillStyle(selectedNode) ? (
                  <ColorField
                    label="填充"
                    value={toColorInputValue(style.fill, "#ffffff")}
                    disabled={propertyReadOnly}
                    onChange={(value) => updateSelectedStyle(scene, controller, { fill: value })}
                  />
                ) : null}
                {supportsStrokeStyle(selectedNode) ? (
                  <ColorField
                    label="描边"
                    value={toColorInputValue(style.stroke, "#1F2937")}
                    disabled={propertyReadOnly}
                    onChange={(value) => updateSelectedStyle(scene, controller, { stroke: value })}
                  />
                ) : null}
                {supportsTextStyle(selectedNode) ? (
                  <ColorField
                    label="文字颜色"
                    value={toColorInputValue(style.color, "#111827")}
                    disabled={propertyReadOnly}
                    onChange={(value) => updateSelectedStyle(scene, controller, { color: value })}
                  />
                ) : null}
                {supportsStrokeStyle(selectedNode) ? (
                  <NumberField
                    label="线宽"
                    value={style.strokeWidth ?? 1}
                    min={0}
                    disabled={propertyReadOnly}
                    onChange={(value) => updateSelectedStyle(scene, controller, { strokeWidth: value })}
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
                  onChange={(value) => updateSelectedStyle(scene, controller, { opacity: value })}
                />
                {supportsRadiusStyle(selectedNode) ? (
                  <NumberField
                    label="圆角"
                    value={style.radius ?? 0}
                    min={0}
                    disabled={propertyReadOnly}
                    onChange={(value) => updateSelectedStyle(scene, controller, { radius: value })}
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
                    />
                  </>
                ) : null}
                {supportsTextStyle(selectedNode) ? (
                  <>
                    <NumberField
                      label="字号"
                      value={style.fontSize ?? 16}
                      min={1}
                      disabled={propertyReadOnly}
                      onChange={(value) => updateSelectedStyle(scene, controller, { fontSize: value })}
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
                    />
                    <NumberField
                      label="行高"
                      value={textRunStyle.lineHeight ?? style.fontSize ?? 18}
                      min={1}
                      disabled={propertyReadOnly || !(selectedNode.text ?? "").length}
                      onChange={(value) => updateSelectedTextStyleRun(scene, controller, { lineHeight: value })}
                    />
                    <NumberField
                      label="字距"
                      value={textRunStyle.letterSpacing ?? 0}
                      step={0.1}
                      integer={false}
                      disabled={propertyReadOnly || !(selectedNode.text ?? "").length}
                      onChange={(value) => updateSelectedTextStyleRun(scene, controller, { letterSpacing: value })}
                    />
                  </>
                ) : null}
              </div>
            </section>
          ) : null}
          {selectedNode.type === "image" ? (
            <section className="space-y-3 px-4 py-4">
              <div className="text-sm font-semibold text-foreground">图片</div>
              <label className="grid gap-1 text-xs text-muted-foreground">
                <span>Alt 文本</span>
                <input
                  className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                  value={selectedNode.alt ?? ""}
                  disabled={propertyReadOnly}
                  onChange={(event) => {
                    if (propertyReadOnly) return;
                    applySelectedPatch(scene, controller, { alt: event.target.value });
                  }}
                  placeholder="图片说明"
                  aria-label="Alt 文本"
                />
              </label>
              <div className="rounded-md bg-input px-3 py-2 text-xs text-muted-foreground">
                图片源：{selectedNode.bindings?.src ? `绑定 ${selectedNode.bindings.src}` : selectedNode.src ? "已设置" : "未设置"}
              </div>
              <SelectField
                label="适配"
                value={style.imageFit ?? "cover"}
                disabled={propertyReadOnly}
                options={[
                  { value: "cover", label: "裁切填满" },
                  { value: "contain", label: "完整显示" },
                  { value: "fill", label: "拉伸填满" },
                ]}
                onChange={(value) => updateSelectedStyle(scene, controller, { imageFit: value as NonNullable<NonNullable<SketchSceneNode["style"]>["imageFit"]> })}
              />
            </section>
          ) : null}
          {selectedNode.bindings ? (
            <section className="space-y-3 px-4 py-4">
              <div className="text-sm font-semibold text-foreground">Bindings</div>
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
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
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
  onChange: (value: number) => void;
}) {
  const displayValue = integer ? Math.round(value) : Number(value.toFixed(3));
  return (
    <label className={cn("flex h-9 items-center gap-2 rounded-md bg-input px-2 text-xs text-muted-foreground", disabled && "opacity-60")}>
      <span className="w-12 shrink-0 font-semibold">{label}</span>
      {mixed ? <span className="shrink-0 rounded bg-background px-1 text-[10px] text-muted-foreground">混合</span> : null}
      <input
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none"
        type="number"
        disabled={disabled}
        value={displayValue}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          if (event.target.value.trim() === "") return;
          const nextValue = Number(event.target.value);
          if (!Number.isFinite(nextValue)) return;
          const nextWithMin = typeof min === "number" ? Math.max(min, nextValue) : nextValue;
          const nextWithBounds = typeof max === "number" ? Math.min(max, nextWithMin) : nextWithMin;
          onChange(integer ? Math.round(nextWithBounds) : nextWithBounds);
        }}
        aria-label={label}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  disabled = false,
  mixed = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  mixed?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={cn("flex h-9 items-center gap-2 rounded-md bg-input px-2 text-xs text-muted-foreground", disabled && "opacity-60")}>
      <span className="w-12 shrink-0 font-semibold">{label}</span>
      {mixed ? <span className="shrink-0 rounded bg-background px-1 text-[10px] text-muted-foreground">混合</span> : null}
      <input
        className="min-w-0 flex-1 border-0 bg-transparent outline-none"
        type="color"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        title={label}
        aria-label={label}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled = false,
  mixed = false,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  mixed?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={cn("flex h-9 items-center gap-2 rounded-md bg-input px-2 text-xs text-muted-foreground", disabled && "opacity-60")}>
      <span className="w-12 shrink-0 font-semibold">{label}</span>
      {mixed ? <span className="shrink-0 rounded bg-background px-1 text-[10px] text-muted-foreground">混合</span> : null}
      <select
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none"
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
    </label>
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
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const dragStartRef = React.useRef<DragState | null>(null);
  const marqueeRef = React.useRef<MarqueeState | null>(null);
  const panStartRef = React.useRef<PanState | null>(null);
  const drawingDraftRef = React.useRef<DrawingDraftState | null>(null);
  const eraseStateRef = React.useRef<EraseState | null>(null);
  const clipboardRef = React.useRef<SketchSceneNode[]>([]);
  const pointerCaptureRef = React.useRef<{ element: HTMLElement; pointerId: number } | null>(null);
  const pendingImageImportRef = React.useRef<PendingImageImportState | null>(null);
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
  const editableSelectedNodes = selectedNodes.filter((node) => !node.locked && !isNodeHiddenByRuntimeConfig(node, configData));
  const layerEditableSelectedNodes = getGroupableSelectedNodes(scene, controller, configData);
  const lockableSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData));
  const visibleToggleSelectedNodes = selectedNodes.filter((node) => node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData));
  const selectedGroupNodes = getSelectedGroupNodes(scene, controller);
  const canGroupSelection = layerEditableSelectedNodes.length >= 2;
  const canUngroupSelection = selectedGroupNodes.length > 0;
  const previewScene = drawingDraft?.node
    ? { ...scene, nodes: [...scene.nodes, drawingDraft.node] }
    : scene;

  React.useEffect(() => {
    if (!inlineTextEdit) return;
    inlineTextRef.current?.focus();
    inlineTextRef.current?.select();
  }, [inlineTextEdit?.nodeId]);

  const copySelected = React.useCallback(() => {
    clipboardRef.current = expandSketchNodesForInsert(
      scene,
      selectedNodes.filter((node) => !node.locked && !isNodeHiddenByRuntimeConfig(node, configData)),
      configData,
    ).map((node) => ({ ...node }));
  }, [configData, scene, selectedNodes]);

  const pasteClipboard = React.useCallback(() => {
    if (!clipboardRef.current.length) return;
    const nodes = cloneSketchNodesForInsert(clipboardRef.current);
    controller.applyOperations(nodes.map((node) => ({ op: "add", node })));
    controller.setNodeIds(nodes.map((node) => node.id));
  }, [controller]);

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

  const startInlineTextEdit = React.useCallback((nodeId: string): boolean => {
    const node = scene.nodes.find((item) => item.id === nodeId);
    if (!node || !canInlineEditTextNode(node, configData)) return false;
    activateSketchKeyboardScope(controller);
    controller.setNodeIds([node.id]);
    setInlineTextEdit({ nodeId: node.id, value: node.text ?? "" });
    return true;
  }, [configData, controller, scene.nodes]);

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
      const nodeId = getSketchTargetNodeId(target);
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
  }, [mode, startInlineTextEdit]);

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
        if (inlineTextEdit) {
          cancelInlineTextEdit();
        } else if (drawingDraftRef.current) {
          setActiveDrawingDraft(null);
        } else {
          controller.clearSelection();
          controller.setTool("select");
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected(scene, controller, configData);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) controller.redo();
        else controller.undo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        if (clipboardRef.current.length) {
          event.preventDefault();
          pasteClipboard();
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected(scene, controller, configData);
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
  }, [cancelInlineTextEdit, configData, controller, copySelected, inlineTextEdit, mode, pasteClipboard, scene, selectedNodes, setActiveDrawingDraft]);

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
        if (!importDroppedOrPastedImage(file, point)) return;
        event.preventDefault();
      }}
      onPointerMove={(event) => {
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
            setActiveDragStart({ ...activeDragStart, hasHistoryCheckpoint: true });
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
        const operations: SketchScenePatchOperation[] =
          activeDragStart.duplicateOnDrag && activeDragStart.kind === "move" && !activeDragStart.hasHistoryCheckpoint
            ? (translatedNodes ?? activeDragStart.nodes).map((node) => ({ op: "add" as const, node }))
            : activeDragStart.nodes.flatMap((node, index) => {
          if (activeDragStart.kind === "resize") {
            const nextNode =
              resizeLineLikeNodeEndpoint(node, activeDragStart.resizeHandle, delta) ??
              resizedNodes?.[index] ??
              (activeDragStart.nodeId === node.id ? resizeSketchNode(node, getBoxResizeHandle(activeDragStart.resizeHandle), delta) : node);
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
        const nextScene = applySketchScenePatchOperations(scene, operations);
        if (nextScene === scene) return;
        if (operations.length && !activeDragStart.hasHistoryCheckpoint) {
          controller.recordHistoryCheckpoint(activeDragStart.initialScene);
          if (activeDragStart.duplicateOnDrag) {
            controller.setNodeIds(activeDragStart.nodes.map((node) => node.id));
          }
          setActiveDragStart({ ...activeDragStart, hasHistoryCheckpoint: true });
        }
        controller.commitScene(nextScene, false);
      }}
      onPointerUp={(event) => {
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
      </div>
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
          if (isSpacePanning) return;
          const target = event.target as Element;
          const nodeId = getSketchTargetNodeId(target);
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
            const point = getPointerScenePoint(event, stageRef.current, scene);
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
          const nodeId = getSketchTargetNodeId(target);
          if (!nodeId) return;
          if (!startInlineTextEdit(nodeId)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          if (mode !== "edit" || event.detail < 2) return;
          const target = event.target as Element;
          const nodeId = getSketchTargetNodeId(target);
          if (!nodeId || !startInlineTextEdit(nodeId)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <SketchPagePreview
          scene={previewScene}
          configData={configData}
          previewSize={{ width, height }}
          fillContainer={fillContainer}
        />
        <SelectionOverlay
          bounds={canResizeSelection ? resizeSelectionBounds : canvasSelectionBounds}
          scaleX={width / scene.pageSize.width}
          scaleY={height / scene.pageSize.height}
          minimumSize={8}
          endpointHandles={lineEndpointHandles}
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
        />
        {inlineTextEdit && inlineTextNode && canEditInlineTextNode ? (
          <textarea
            ref={inlineTextRef}
            aria-label="画布文本编辑"
            className="absolute z-20 resize-none rounded-sm border border-[#3da0ff] bg-white/95 px-2 py-1 text-[#111827] outline-none ring-2 ring-[#3da0ff]/30"
            style={{
              left: inlineTextNode.x,
              top: inlineTextNode.y,
              width: Math.max(32, Math.abs(inlineTextNode.width)),
              height: Math.max(28, Math.abs(inlineTextNode.height)),
              fontSize: inlineTextNode.style?.fontSize ?? 18,
              fontWeight: inlineTextNode.style?.fontWeight ?? 500,
              color: inlineTextNode.style?.color ?? "#111827",
              transform: inlineTextNode.rotation ? `rotate(${inlineTextNode.rotation}deg)` : undefined,
              transformOrigin: "center",
            }}
            value={inlineTextEdit.value}
            onPointerDown={(event) => {
              event.stopPropagation();
              activateSketchKeyboardScope(controller);
            }}
            onChange={(event) => setInlineTextEdit({ nodeId: inlineTextEdit.nodeId, value: event.target.value })}
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
          />
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
            label="置顶"
            disabled={!layerEditableSelectedNodes.length}
            onClick={() => runContextMenuAction(() => bringToFront(scene, controller, configData))}
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
