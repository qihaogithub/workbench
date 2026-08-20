export type CaptureHistoryStatus = "ready" | "failed" | "cancelled";

export interface CaptureHistoryEntry {
  captureId: string;
  url: string;
  routeKey?: string;
  time: string;
  filename?: string;
  status: CaptureHistoryStatus;
}

export function sanitizeHistoryEntry(entry: CaptureHistoryEntry): CaptureHistoryEntry {
  return {
    captureId: entry.captureId,
    url: entry.url,
    ...(entry.routeKey ? { routeKey: entry.routeKey } : {}),
    time: entry.time,
    ...(entry.filename ? { filename: entry.filename } : {}),
    status: entry.status,
  };
}

export function appendHistory(entries: readonly CaptureHistoryEntry[], entry: CaptureHistoryEntry, limit = 50): CaptureHistoryEntry[] {
  const next = [sanitizeHistoryEntry(entry), ...entries.filter((item) => item.captureId !== entry.captureId)];
  return next.slice(0, Math.max(1, limit));
}

export function removeHistoryEntry(entries: readonly CaptureHistoryEntry[], captureId: string): CaptureHistoryEntry[] {
  return entries.filter((entry) => entry.captureId !== captureId);
}

