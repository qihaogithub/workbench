import type { CanvasState } from "@workbench/demo-ui/types";

type RecordKey = "pages" | "sections" | "pageGroups" | "nodes" | "layers";
type ArrayKey = "hiddenPageIds" | "hiddenKnowledgeDocumentIds";

const RECORD_KEYS: RecordKey[] = ["pages", "sections", "pageGroups", "nodes", "layers"];
const ARRAY_KEYS: ArrayKey[] = ["hiddenPageIds", "hiddenKnowledgeDocumentIds"];

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function records(state: CanvasState, key: RecordKey): Record<string, unknown> {
  return (state[key] as Record<string, unknown> | undefined) ?? {};
}

/**
 * Replays local canvas edits on top of a newly received collaboration snapshot.
 *
 * A record is the smallest replayable unit. Concurrent changes to distinct pages,
 * nodes or Sections merge; two divergent edits to the same record are surfaced to
 * the caller instead of silently choosing a client by timestamp.
 */
export function rebaseCanvasState(
  base: CanvasState,
  local: CanvasState,
  remote: CanvasState,
): { state: CanvasState; conflicts: string[] } {
  const next: CanvasState = { ...remote };
  const conflicts: string[] = [];

  for (const key of RECORD_KEYS) {
    const baseRecords = records(base, key);
    const localRecords = records(local, key);
    const remoteRecords = records(remote, key);
    const merged = { ...remoteRecords };
    const ids = new Set([...Object.keys(baseRecords), ...Object.keys(localRecords)]);

    for (const id of ids) {
      const before = baseRecords[id];
      const localValue = localRecords[id];
      if (same(before, localValue)) continue;

      const remoteValue = remoteRecords[id];
      if (!same(before, remoteValue) && !same(localValue, remoteValue)) {
        conflicts.push(`${key}:${id}`);
        continue;
      }
      if (localValue === undefined) delete merged[id];
      else merged[id] = localValue;
    }
    (next as unknown as Record<string, unknown>)[key] = merged;
  }

  for (const key of ARRAY_KEYS) {
    const before = base[key] ?? [];
    const localValue = local[key] ?? [];
    if (same(before, localValue)) continue;
    const remoteValue = remote[key] ?? [];
    if (!same(before, remoteValue) && !same(localValue, remoteValue)) {
      conflicts.push(key);
      continue;
    }
    next[key] = [...localValue];
  }

  const baseNavigation = base.navigation ?? null;
  const localNavigation = local.navigation ?? null;
  if (!same(baseNavigation, localNavigation)) {
    const remoteNavigation = remote.navigation ?? null;
    if (!same(baseNavigation, remoteNavigation) && !same(localNavigation, remoteNavigation)) {
      conflicts.push("navigation");
    } else {
      next.navigation = local.navigation;
    }
  }

  return { state: next, conflicts };
}
