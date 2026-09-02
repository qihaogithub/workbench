import type { DesignSpecEntry } from "@/lib/design-specs";

export type DesignSpecDropPosition = "before" | "after";

export interface DesignSpecDragRect {
  top: number;
  height: number;
}

export function getDesignSpecDropPosition(
  activeRect: DesignSpecDragRect,
  targetRect: DesignSpecDragRect,
  pointerY?: number,
): DesignSpecDropPosition {
  const activeCenterY = activeRect.top + activeRect.height / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const comparisonY = pointerY ?? activeCenterY;
  return comparisonY > targetCenterY ? "after" : "before";
}

/** Move a dragged entry to an explicit side of a target card. */
export function reorderDesignSpecEntries(
  entries: DesignSpecEntry[],
  sourceId: string,
  targetId: string,
  position: DesignSpecDropPosition,
): DesignSpecEntry[] {
  if (sourceId === targetId) return entries;
  const from = entries.findIndex((entry) => entry.id === sourceId);
  const to = entries.findIndex((entry) => entry.id === targetId);
  if (from === -1 || to === -1) return entries;
  const next = [...entries];
  const [moved] = next.splice(from, 1);
  const targetIndex = next.findIndex((entry) => entry.id === targetId);
  if (targetIndex === -1) return entries;
  const insertionIndex = position === "after" ? targetIndex + 1 : targetIndex;
  if (insertionIndex === from) return entries;
  next.splice(insertionIndex, 0, moved);
  return next;
}
