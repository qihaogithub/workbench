"use client";

import type { ResizeEdge } from "./types";

export type CanvasResizeHandleSet = "all" | "corners";

export interface CanvasResizeHitAreaOptions {
  handles: CanvasResizeHandleSet;
  edgeHitSize: number;
  cornerHitSize: number;
}

export const RESIZE_CURSOR_BY_EDGE: Record<ResizeEdge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};

const CORNER_HANDLES: ResizeEdge[] = ["nw", "ne", "sw", "se"];
const EDGE_HANDLES: ResizeEdge[] = ["n", "s", "w", "e"];

export function isCanvasResizeEdge(value: string | null | undefined): value is ResizeEdge {
  return value === "n" || value === "s" || value === "e" || value === "w" || value === "ne" || value === "nw" || value === "se" || value === "sw";
}

export function detectCanvasResizeEdge(
  localX: number,
  localY: number,
  width: number,
  height: number,
  { handles, edgeHitSize, cornerHitSize }: CanvasResizeHitAreaOptions,
): ResizeEdge | null {
  const nearLeftCorner = localX <= cornerHitSize;
  const nearRightCorner = localX >= width - cornerHitSize;
  const nearTopCorner = localY <= cornerHitSize;
  const nearBottomCorner = localY >= height - cornerHitSize;

  if (nearTopCorner && nearLeftCorner) return "nw";
  if (nearTopCorner && nearRightCorner) return "ne";
  if (nearBottomCorner && nearLeftCorner) return "sw";
  if (nearBottomCorner && nearRightCorner) return "se";
  if (handles === "corners") return null;

  if (localY <= edgeHitSize) return "n";
  if (localY >= height - edgeHitSize) return "s";
  if (localX <= edgeHitSize) return "w";
  if (localX >= width - edgeHitSize) return "e";
  return null;
}

export function getCanvasResizeHandleFromTarget(target: EventTarget | null, container: HTMLElement): ResizeEdge | null {
  if (!(target instanceof Element)) return null;
  const handle = target.closest<HTMLElement>("[data-canvas-resize-handle]");
  if (!handle || !container.contains(handle)) return null;
  return isCanvasResizeEdge(handle.dataset.canvasResizeHandle) ? handle.dataset.canvasResizeHandle : null;
}

export function CanvasResizeHandles({ visible, options }: { visible: boolean; options: CanvasResizeHitAreaOptions }) {
  if (!visible) return null;

  return (
    <>
      {CORNER_HANDLES.map((edge) => (
        <div
          key={edge}
          aria-hidden="true"
          data-canvas-resize-handle={edge}
          className="absolute z-50"
          style={{
            ...(edge.includes("w") ? { left: -options.cornerHitSize / 2 } : { right: -options.cornerHitSize / 2 }),
            ...(edge.includes("n") ? { top: -options.cornerHitSize / 2 } : { bottom: -options.cornerHitSize / 2 }),
            width: options.cornerHitSize,
            height: options.cornerHitSize,
            cursor: RESIZE_CURSOR_BY_EDGE[edge],
          }}
        />
      ))}
      {options.handles === "all"
        ? EDGE_HANDLES.map((edge) => (
            <div
              key={edge}
              aria-hidden="true"
              data-canvas-resize-handle={edge}
              className="absolute z-20"
              style={{
                ...(edge === "n" ? { top: 0, left: 0, right: 0, height: options.edgeHitSize } : {}),
                ...(edge === "s" ? { bottom: 0, left: 0, right: 0, height: options.edgeHitSize } : {}),
                ...(edge === "w" ? { top: 0, bottom: 0, left: 0, width: options.edgeHitSize } : {}),
                ...(edge === "e" ? { top: 0, bottom: 0, right: 0, width: options.edgeHitSize } : {}),
                cursor: RESIZE_CURSOR_BY_EDGE[edge],
              }}
            />
          ))
        : null}
    </>
  );
}
