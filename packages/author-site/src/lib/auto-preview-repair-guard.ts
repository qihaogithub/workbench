export const AUTO_PREVIEW_REPAIR_HISTORY_KEY =
  "opencode-workbench:auto-preview-repair-history:v1";

const AUTO_PREVIEW_REPAIR_HISTORY_VERSION = 1;
const AUTO_PREVIEW_REPAIR_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_PREVIEW_REPAIR_HISTORY_MAX_ENTRIES = 200;

export interface AutoPreviewRepairDiagnostic {
  source?: string;
  stage?: string;
  code?: string;
  pageId?: string;
  file?: string;
  message?: string;
  instruction?: string;
  moduleName?: string;
  importName?: string;
  codeHash?: string;
  moduleHash?: string;
}

interface AutoPreviewRepairHistoryEntry {
  count: number;
  updatedAt: number;
}

interface AutoPreviewRepairHistory {
  version: 1;
  entries: Record<string, AutoPreviewRepairHistoryEntry>;
}

type AutoPreviewRepairStorage = Pick<Storage, "getItem" | "setItem">;

function getBrowserStorage(): AutoPreviewRepairStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isHistoryEntry(value: unknown): value is AutoPreviewRepairHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.count === "number" &&
    Number.isFinite(entry.count) &&
    typeof entry.updatedAt === "number" &&
    Number.isFinite(entry.updatedAt)
  );
}

function readHistory(
  storage: AutoPreviewRepairStorage | null,
  now = Date.now(),
): AutoPreviewRepairHistory {
  if (!storage) {
    return { version: AUTO_PREVIEW_REPAIR_HISTORY_VERSION, entries: {} };
  }

  try {
    const raw = storage.getItem(AUTO_PREVIEW_REPAIR_HISTORY_KEY);
    if (!raw) {
      return { version: AUTO_PREVIEW_REPAIR_HISTORY_VERSION, entries: {} };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { version: AUTO_PREVIEW_REPAIR_HISTORY_VERSION, entries: {} };
    }

    const object = parsed as Record<string, unknown>;
    if (object.version !== AUTO_PREVIEW_REPAIR_HISTORY_VERSION) {
      return { version: AUTO_PREVIEW_REPAIR_HISTORY_VERSION, entries: {} };
    }
    if (!object.entries || typeof object.entries !== "object") {
      return { version: AUTO_PREVIEW_REPAIR_HISTORY_VERSION, entries: {} };
    }

    const entries: Record<string, AutoPreviewRepairHistoryEntry> = {};
    for (const [key, value] of Object.entries(
      object.entries as Record<string, unknown>,
    )) {
      if (!isHistoryEntry(value)) continue;
      if (now - value.updatedAt > AUTO_PREVIEW_REPAIR_HISTORY_TTL_MS) continue;
      entries[key] = {
        count: Math.max(0, Math.floor(value.count)),
        updatedAt: value.updatedAt,
      };
    }

    return { version: AUTO_PREVIEW_REPAIR_HISTORY_VERSION, entries };
  } catch {
    return { version: AUTO_PREVIEW_REPAIR_HISTORY_VERSION, entries: {} };
  }
}

function writeHistory(
  storage: AutoPreviewRepairStorage | null,
  history: AutoPreviewRepairHistory,
): void {
  if (!storage) return;

  const entries = Object.entries(history.entries)
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, AUTO_PREVIEW_REPAIR_HISTORY_MAX_ENTRIES);

  try {
    storage.setItem(
      AUTO_PREVIEW_REPAIR_HISTORY_KEY,
      JSON.stringify({
        version: AUTO_PREVIEW_REPAIR_HISTORY_VERSION,
        entries: Object.fromEntries(entries),
      }),
    );
  } catch {
    // Storage is an opportunistic loop guard; failure should not block preview.
  }
}

function normalizeFingerprintPart(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "unknown";
}

export function buildAutoPreviewRepairFingerprint(params: {
  projectId: string;
  pageId: string;
  diagnostic: AutoPreviewRepairDiagnostic;
}): string {
  const { projectId, pageId, diagnostic } = params;
  const stableDiagnosticKey =
    diagnostic.moduleHash ||
    diagnostic.codeHash ||
    [
      diagnostic.source,
      diagnostic.stage,
      diagnostic.code,
      diagnostic.file,
      diagnostic.moduleName,
      diagnostic.importName,
      diagnostic.message,
    ]
      .map(normalizeFingerprintPart)
      .join("|");

  return [
    normalizeFingerprintPart(projectId),
    normalizeFingerprintPart(pageId),
    stableDiagnosticKey,
  ].join("::");
}

export function getAutoPreviewRepairAttemptCount(
  fingerprint: string,
  memoryCounts: Map<string, number>,
  options: {
    storage?: AutoPreviewRepairStorage | null;
    now?: number;
  } = {},
): number {
  const storage = options.storage ?? getBrowserStorage();
  const history = readHistory(storage, options.now);
  return Math.max(
    memoryCounts.get(fingerprint) ?? 0,
    history.entries[fingerprint]?.count ?? 0,
  );
}

export function recordAutoPreviewRepairAttempt(
  fingerprint: string,
  memoryCounts: Map<string, number>,
  options: {
    storage?: AutoPreviewRepairStorage | null;
    now?: number;
  } = {},
): number {
  const storage = options.storage ?? getBrowserStorage();
  const now = options.now ?? Date.now();
  const history = readHistory(storage, now);
  const nextCount =
    Math.max(
      memoryCounts.get(fingerprint) ?? 0,
      history.entries[fingerprint]?.count ?? 0,
    ) + 1;

  memoryCounts.set(fingerprint, nextCount);
  history.entries[fingerprint] = {
    count: nextCount,
    updatedAt: now,
  };
  writeHistory(storage, history);

  return nextCount;
}
