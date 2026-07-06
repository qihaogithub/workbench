"use client";

import React, { useMemo } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  ArrowRight,
  BringToFront,
  Circle,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  ImageIcon,
  Lock,
  MousePointer2,
  Redo2,
  SendToBack,
  Square,
  StickyNote,
  TextCursorInput,
  Trash2,
  Type,
  Undo2,
  Unlock,
} from "lucide-react";
import {
  applySketchScenePatchOperations,
  createDefaultSketchScene,
  getSketchSelectionBounds,
  getSketchNodeBounds,
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
} from "@workbench/sketch-core";

export type PreviewSize = {
  width?: number | string;
  height?: number | string;
};

export type SketchTool =
  | "select"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "image"
  | "sticky"
  | "button"
  | "input"
  | "card";

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
  kind: "move" | "resize";
  nodeId?: string;
  resizeHandle?: SketchResizeInteractionHandle;
  resizeBounds?: SketchSceneBounds;
  initialScene: SketchSceneDocument;
  hasHistoryCheckpoint: boolean;
}

interface MarqueeState {
  start: { x: number; y: number };
  current: { x: number; y: number };
}

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

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

function createNode(type: SketchTool): SketchSceneNode {
  const id = `sketch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    id,
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
  if (type === "button") return { ...base, type: "button", width: 160, height: 52, text: "按钮" };
  if (type === "input") return { ...base, type: "input", width: 240, height: 52, text: "输入框" };
  if (type === "card") return { ...base, type: "card", width: 280, height: 180, text: "卡片" };
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
  if (type === "image") {
    const src = `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#e2e8f0"/><path d="M52 132 126 72l54 44 38-28 50 44" fill="none" stroke="#475569" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="238" cy="54" r="18" fill="#64748b"/></svg>',
    )}`;
    return { ...base, type: "image", width: 240, height: 135, src, alt: "图片占位" };
  }
  return { ...base, type: type as SketchSceneNodeType };
}

function createNodeAtPoint(type: SketchTool, point: { x: number; y: number }): SketchSceneNode {
  const node = createNode(type);
  return {
    ...node,
    x: Math.max(0, Math.round(point.x - node.width / 2)),
    y: Math.max(0, Math.round(point.y - node.height / 2)),
  };
}

function getPointerScenePoint(
  event: React.PointerEvent<HTMLElement>,
  stage: HTMLElement | null,
  scene: SketchSceneDocument,
): { x: number; y: number } | null {
  const rect = stage?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const clientX = event.clientX;
  const clientY = event.clientY;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const x = ((clientX - rect.left) / rect.width) * scene.pageSize.width;
  const y = ((clientY - rect.top) / rect.height) * scene.pageSize.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
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
  minimumSize = 0,
  endpointHandles,
}: {
  bounds: SketchSceneBounds | null;
  scaleX: number;
  scaleY: number;
  onResizePointerDown?: (event: React.PointerEvent<HTMLDivElement>, handle: SketchResizeInteractionHandle) => void;
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
  const activeIds = selectedNodeIds ?? (selectedNodeId ? [selectedNodeId] : []);
  const selectionBounds = useMemo(() => visibleSelectionBoundsFromIds(parsedScene, activeIds, configData), [activeIds, configData, parsedScene]);

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
  { tool: "rect", label: "矩形", icon: Square },
  { tool: "ellipse", label: "圆形", icon: Circle },
  { tool: "line", label: "线条", icon: Square },
  { tool: "arrow", label: "箭头", icon: ArrowRight },
  { tool: "text", label: "文本", icon: Type },
  { tool: "image", label: "图片", icon: ImageIcon },
  { tool: "sticky", label: "便签", icon: StickyNote },
  { tool: "button", label: "按钮", icon: Square },
  { tool: "input", label: "输入框", icon: TextCursorInput },
  { tool: "card", label: "卡片", icon: CreditCard },
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
  if (node.type === "text" || node.type === "sticky" || node.type === "button" || node.type === "input" || node.type === "card") {
    return {
      label: "内容",
      placeholder: "对象文本",
      value: node.text ?? "",
      toPatch: (value) => ({ text: value }),
    };
  }
  return null;
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
  return {
    x,
    y,
    width,
    height,
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
  const selectedNodes = getSelectedNodes(scene, controller);
  const editableSelectedNodes = selectedNodes.filter((node) => !node.locked && !isNodeHiddenByRuntimeConfig(node, configData));
  const visibleEditableSelectedNodes = editableSelectedNodes.filter((node) => node.visible !== false && isNodeVisibleForConfig(node, configData));
  const layerEditableSelectedNodes = visibleEditableSelectedNodes.filter((node) => node.type !== "group");
  const lockableNodes = selectedNodes.filter((node) => node.type !== "group" && node.visible !== false && isNodeVisibleForConfig(node, configData));
  const visibleToggleNodes = selectedNodes.filter((node) => node.type !== "group" && !isNodeHiddenByRuntimeConfig(node, configData));
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
      <button type="button" title="复制" aria-label="复制" className={actionButtonClass} disabled={!editableSelectedNodes.length} onClick={() => duplicateSelected(scene, controller, configData)}>
        <Copy className="h-4 w-4" />
      </button>
      <button type="button" title="删除" aria-label="删除" className={actionButtonClass} disabled={!editableSelectedNodes.length} onClick={() => deleteSelected(scene, controller, configData)}>
        <Trash2 className="h-4 w-4" />
      </button>
      <button type="button" title="置顶" aria-label="置顶" className={actionButtonClass} disabled={!layerEditableSelectedNodes.length} onClick={() => bringToFront(scene, controller, configData)}>
        <BringToFront className="h-4 w-4" />
      </button>
      <button type="button" title="置底" aria-label="置底" className={actionButtonClass} disabled={!layerEditableSelectedNodes.length} onClick={() => sendToBack(scene, controller, configData)}>
        <SendToBack className="h-4 w-4" />
      </button>
      <button type="button" title="锁定" aria-label="锁定" className={actionButtonClass} disabled={!lockableNodes.length} onClick={() => toggleLocked(scene, controller, configData)}>
        {lockableNodes.every((node) => node.locked) ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </button>
      <button type="button" title="显示隐藏" aria-label="显示隐藏" className={actionButtonClass} disabled={!visibleToggleNodes.length} onClick={() => toggleVisible(scene, controller, configData)}>
        {visibleToggleNodes.every((node) => node.visible !== false) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <button type="button" title="左对齐" aria-label="左对齐" className={cn(actionButtonClass, "text-xs font-semibold")} disabled={layerEditableSelectedNodes.length < 2} onClick={() => alignSelected(scene, controller, "left", configData)}>
        L
      </button>
      <button type="button" title="顶对齐" aria-label="顶对齐" className={cn(actionButtonClass, "text-xs font-semibold")} disabled={layerEditableSelectedNodes.length < 2} onClick={() => alignSelected(scene, controller, "top", configData)}>
        T
      </button>
      <button type="button" title="水平分布" aria-label="水平分布" className={cn(actionButtonClass, "text-xs font-semibold")} disabled={layerEditableSelectedNodes.length < 3} onClick={() => distributeSelectedHorizontally(scene, controller, configData)}>
        H
      </button>
      <div className="ml-2 shrink-0 whitespace-nowrap px-2 text-xs text-muted-foreground">
        {controller.selection.nodeIds.length ? `${controller.selection.nodeIds.length} selected` : "No selection"}
      </div>
    </div>
  );
}

export function SketchLayerPanel({ scene, controller, className }: SketchEditorPartProps) {
  const orderedNodes = getLayerPanelNodes(scene);

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      <div className="border-b border-border px-3 py-3">
        <div className="text-[13px] font-semibold text-foreground">Layers</div>
        <div className="mt-1 text-xs text-muted-foreground">{scene.nodes.length} objects</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {orderedNodes.length ? (
          <div className="space-y-0.5">
            {orderedNodes.map((node) => {
              const selected = controller.selection.nodeIds.includes(node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  className={cn(
                    "flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "bg-[#2f5d97] text-foreground ring-1 ring-[#3da0ff]" : "text-foreground",
                    node.visible === false && "opacity-50",
                  )}
                  title={getNodeDisplayName(node)}
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
                  <span className="min-w-0 flex-1 truncate">{getNodeDisplayName(node)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{NODE_TYPE_LABELS[node.type]}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            当前手绘页面暂无对象。
          </div>
        )}
      </div>
    </div>
  );
}

export function SketchPropertyPanel({ scene, controller, configData = {}, className }: SketchPropertyPanelProps) {
  const selectedNode = getSingleSelectedNode(scene, controller);

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
  const contentControl = getContentControl(selectedNode);
  const primaryColorControl = getPrimaryColorControl(selectedNode);

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
            </section>
          ) : null}
          <section className="space-y-3 px-4 py-4">
            <div className="text-sm font-semibold text-foreground">Position</div>
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
          {primaryColorControl ? (
            <section className="space-y-3 px-4 py-4">
              <div className="text-sm font-semibold text-foreground">{primaryColorControl.label}</div>
              <label className="grid gap-1 text-xs text-muted-foreground">
                <input
                  className="h-9 w-full rounded-md border border-input bg-input px-1"
                  type="color"
                  disabled={propertyReadOnly}
                  value={primaryColorControl.value}
                  onChange={(event) => {
                    if (propertyReadOnly) return;
                    updateSelectedStyle(scene, controller, { [primaryColorControl.property]: event.target.value });
                  }}
                  title={primaryColorControl.label}
                  aria-label={primaryColorControl.label}
                />
              </label>
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
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={cn("flex h-9 items-center gap-2 rounded-md bg-input px-2 text-xs text-muted-foreground", disabled && "opacity-60")}>
      <span className="w-8 shrink-0 font-semibold">{label}</span>
      <input
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none"
        type="number"
        disabled={disabled}
        value={Math.round(value)}
        onChange={(event) => {
          if (event.target.value.trim() === "") return;
          const nextValue = Number(event.target.value);
          if (!Number.isFinite(nextValue)) return;
          onChange(nextValue);
        }}
        aria-label={label}
      />
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
  const dragStartRef = React.useRef<DragState | null>(null);
  const marqueeRef = React.useRef<MarqueeState | null>(null);
  const clipboardRef = React.useRef<SketchSceneNode[]>([]);
  const pointerCaptureRef = React.useRef<{ element: HTMLElement; pointerId: number } | null>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
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
        event.preventDefault();
        pasteClipboard();
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [configData, controller, copySelected, mode, pasteClipboard, scene, selectedNodes]);

  return (
    <div
      className={cn("relative min-h-0 flex-1 overflow-auto bg-[#1f1f1f] p-6", className)}
      onPointerMove={(event) => {
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
        const resizeFromBounds = shouldResizeFromSelectionBounds(activeDragStart) ? activeDragStart.resizeBounds : null;
        const resizedNodes =
          resizeFromBounds
            ? resizeNodesWithinBounds(
                activeDragStart.nodes,
                resizeFromBounds,
                resizeBounds(resizeFromBounds, getBoxResizeHandle(activeDragStart.resizeHandle), delta),
              )
            : null;
        const translatedNodes = activeDragStart.kind === "move" ? translateSketchNodes(activeDragStart.nodes, delta) : null;
        const operations: SketchScenePatchOperation[] = activeDragStart.nodes.flatMap((node, index) => {
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
          setActiveDragStart({ ...activeDragStart, hasHistoryCheckpoint: true });
        }
        controller.commitScene(nextScene, false);
      }}
      onPointerUp={() => {
        const activeMarquee = marqueeRef.current;
        if (activeMarquee) {
          const bounds = boundsFromPoints(activeMarquee.start, activeMarquee.current);
          const nextIds = scene.nodes
            .filter((node) => isNodeVisibleForConfig(node, configData) && nodeIntersectsSelectionBounds(node, bounds))
            .map((node) => node.id);
          controller.setNodeIds(nextIds);
        }
        releasePointerCapture();
        setActiveDragStart(null);
        setActiveMarquee(null);
      }}
      onPointerCancel={() => {
        releasePointerCapture();
        setActiveDragStart(null);
        setActiveMarquee(null);
      }}
    >
      <div
        ref={stageRef}
        data-sketch-stage
        className="relative mx-auto bg-white shadow-[0_18px_60px_rgba(0,0,0,0.35)] ring-1 ring-black/30"
        style={{ width: fillContainer ? "100%" : width, height: fillContainer ? "100%" : height }}
        onPointerDown={(event) => {
          if (mode !== "edit") return;
          activateSketchKeyboardScope(controller);
          const target = event.target as Element;
          const nodeId = getSketchTargetNodeId(target);
          if (controller.tool !== "select") {
            const point = getPointerScenePoint(event, stageRef.current, scene);
            if (!point) return;
            event.preventDefault();
            const node = createNodeAtPoint(controller.tool, point);
            controller.applyOperations([{ op: "add", node }]);
            controller.setNodeIds([node.id]);
            controller.setTool("select");
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
              capturePointer(event);
              setActiveDragStart({
                kind: "move",
                pointer: point,
                nodes: dragNodes,
                initialScene: scene,
                hasHistoryCheckpoint: false,
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
      >
        <SketchPagePreview
          scene={scene}
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
        />
        <SelectionOverlay
          bounds={marquee ? boundsFromPoints(marquee.start, marquee.current) : null}
          scaleX={width / scene.pageSize.width}
          scaleY={height / scene.pageSize.height}
        />
      </div>
    </div>
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
