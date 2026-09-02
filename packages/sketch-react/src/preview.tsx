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
  validateSketchSceneForRender,
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
  /** Render one cropped image's full source while its crop frame is being edited. */
  imageCropEditingNodeId?: string | null;
  onNodeSelect?: (node: SketchSceneNode | null) => void;
  onSelectionChange?: (selection: SketchEditorSelection) => void;
}

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

interface ParsedSketchScene {
  scene: SketchSceneDocument;
  error: string | null;
}

function emptySceneForError(pageSize: SketchSceneDocument["pageSize"]): SketchSceneDocument {
  return {
    version: 1,
    pageSize,
    nodes: [],
    assets: [],
    bindings: {},
    metadata: {},
  };
}

function parseScene(scene?: string | SketchSceneDocument | null): ParsedSketchScene {
  if (!scene) return { scene: createDefaultSketchScene(), error: null };
  const parsed = parseSketchSceneDocument(scene);
  if (!parsed) {
    return {
      scene: emptySceneForError(createDefaultSketchScene().pageSize),
      error: "白板场景无法解析，未渲染任何内容。",
    };
  }
  if (validateSketchSceneDocument(parsed).valid) return { scene: parsed, error: null };
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
    return {
      scene: emptySceneForError(pageSize),
      error: "白板场景校验失败，未渲染任何内容。",
    };
  }
  return {
    scene: emptySceneForError(createDefaultSketchScene().pageSize),
    error: "白板场景校验失败，未渲染任何内容。",
  };
}

function SketchSceneErrorNotice({ className }: { className?: string }) {
  return (
    <div
      role="alert"
      data-sketch-scene-error
      className={cn(
        "flex min-h-24 items-center justify-center border border-amber-200 bg-amber-50 px-4 text-center text-sm text-amber-900",
        className,
      )}
    >
      白板场景无效，未渲染任何内容，请刷新或修复文档后重试。
    </div>
  );
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
  imageCropEditingNodeId,
  onNodeSelect,
  onSelectionChange,
}: SketchPagePreviewProps) {
  const parsedSceneState = useMemo(() => parseScene(scene), [scene]);
  const parsedScene = parsedSceneState.scene;
  const width = normalizeSize(previewSize, parsedScene.pageSize.width, "width");
  const height = normalizeSize(previewSize, parsedScene.pageSize.height, "height");
  const renderError = useMemo(() => {
    if (parsedSceneState.error) return parsedSceneState.error;
    return validateSketchSceneForRender(parsedScene, configData).valid
      ? null
      : "白板场景无法渲染，未渲染任何内容。";
  }, [configData, parsedScene, parsedSceneState.error]);
  const svgMarkup = useMemo(
    () => {
      if (renderError) return "";
      try {
        return renderSketchSceneToSvgMarkup(parsedScene, configData, { imageCropEditingNodeId: imageCropEditingNodeId ?? undefined });
      } catch {
        return "";
      }
    },
    [configData, imageCropEditingNodeId, parsedScene, renderError],
  );
  const imageNodes = useMemo(() => getResolvedImageNodes(parsedScene, configData), [configData, parsedScene]);
  const imageProbeKey = useMemo(() => imageNodes.map((node) => `${node.id}:${node.src}`).join("|"), [imageNodes]);
  const [failedImageIds, setFailedImageIds] = React.useState<Set<string>>(() => new Set());
  const activeIds = selectedNodeIds ?? (selectedNodeId ? [selectedNodeId] : []);
  const selectionBounds = useMemo(() => visibleSelectionBoundsFromIds(parsedScene, activeIds, configData), [activeIds, configData, parsedScene]);

  React.useEffect(() => {
    setFailedImageIds(new Set());
  }, [imageProbeKey]);

  if (renderError) {
    return (
      <SketchSceneErrorNotice
        className={cn(fillContainer ? "h-full w-full" : "", className)}
      />
    );
  }

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
