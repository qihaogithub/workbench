import type { CanvasNavigationState } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses persisted navigation defensively; malformed or dangling references are rejected. */
export function parseCanvasNavigation(
  value: unknown,
  pageIds: Set<string>,
): CanvasNavigationState | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.hotspots) || !isRecord(value.connections)) return null;
  const hotspots: CanvasNavigationState["hotspots"] = {};
  for (const [id, raw] of Object.entries(value.hotspots)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.pageId !== "string" || !pageIds.has(raw.pageId) || !isRecord(raw.rect)) return null;
    const { x, y, width, height } = raw.rect;
    if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number" || ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1 || typeof raw.createdAt !== "number" || typeof raw.updatedAt !== "number") return null;
    hotspots[id] = { id, pageId: raw.pageId, rect: { x, y, width, height }, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
  }
  const connections: CanvasNavigationState["connections"] = {};
  const seenHotspots = new Set<string>();
  for (const [id, raw] of Object.entries(value.connections)) {
    if (!isRecord(raw) || raw.id !== id || !isRecord(raw.source) || !isRecord(raw.target) || typeof raw.source.pageId !== "string" || typeof raw.source.hotspotId !== "string" || typeof raw.target.pageId !== "string" || !pageIds.has(raw.target.pageId) || typeof raw.createdAt !== "number" || typeof raw.updatedAt !== "number") return null;
    const hotspot = hotspots[raw.source.hotspotId];
    if (!hotspot || hotspot.pageId !== raw.source.pageId || seenHotspots.has(hotspot.id) || hotspot.pageId === raw.target.pageId) return null;
    seenHotspots.add(hotspot.id);
    connections[id] = { id, source: { pageId: raw.source.pageId, hotspotId: raw.source.hotspotId }, target: { pageId: raw.target.pageId }, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
  }
  return { hotspots, connections };
}
