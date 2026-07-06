"use client";

import React, { useMemo } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  createDefaultSketchScene,
  getSketchSelectionBounds,
  parseSketchSceneDocument,
  renderSketchSceneToSvgMarkup,
  resolveSketchSceneBindingValue,
  validateSketchSceneDocument,
  type SketchSceneBounds,
  type SketchSceneDocument,
  type SketchSceneNode,
} from "@workbench/sketch-core";

export type PreviewSize = {
  width?: number | string;
  height?: number | string;
};

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

function isNodeVisibleForConfig(node: SketchSceneNode, configData?: Record<string, unknown>): boolean {
  if (node.type === "group") return false;
  if (resolveSketchSceneBindingValue(node, "visible", node.visible ?? true, configData) === false) return false;
  if (node.type === "image") {
    const src = resolveSketchSceneBindingValue(node, "src", node.src ?? "", configData);
    return typeof src === "string" && src.trim().length > 0;
  }
  return true;
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

function visibleSelectionBoundsFromIds(
  scene: SketchSceneDocument,
  nodeIds: string[],
  configData?: Record<string, unknown>,
): SketchSceneBounds | null {
  const selectedIds = new Set(selectionFromIds(scene, nodeIds, configData).nodeIds);
  const selected = scene.nodes.filter((node) => selectedIds.has(node.id) && isNodeVisibleForConfig(node, configData));
  return getSketchSelectionBounds(selected);
}

function getSketchTargetNodeId(target: Element): string | null {
  return (
    target.closest("[data-sketch-node-id]")?.getAttribute("data-sketch-node-id") ??
    target.closest("[data-sketch-node-label]")?.getAttribute("data-sketch-node-label")
  ) ?? null;
}

function SelectionOverlay({
  bounds,
  scaleX,
  scaleY,
  minimumSize = 0,
}: {
  bounds: SketchSceneBounds | null;
  scaleX: number;
  scaleY: number;
  minimumSize?: number;
}) {
  if (!bounds) return null;
  const scaledWidth = bounds.width * scaleX;
  const scaledHeight = bounds.height * scaleY;
  const width = Math.max(scaledWidth, minimumSize);
  const height = Math.max(scaledHeight, minimumSize);
  const left = bounds.x * scaleX - (width - scaledWidth) / 2;
  const top = bounds.y * scaleY - (height - scaledHeight) / 2;
  return (
    <div
      className="pointer-events-none absolute border border-blue-600"
      data-testid="sketch-selection-box"
      style={{
        left,
        top,
        width,
        height,
      }}
    />
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
