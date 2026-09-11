import fs from "fs";
import path from "path";

import { getDataDir } from "@/lib/paths";

const MIN_MEANINGFUL_SCREENSHOT_BYTES = 8 * 1024;
const LARGE_RENDER_AREA = 160_000;

export type ScreenshotVariant = "strict" | "fast";

interface ScreenshotMeta {
  currentHash?: string;
  renderBoxes?: Record<string, unknown>;
  variants?: Record<
    string,
    {
      variant?: ScreenshotVariant;
      generatedAt?: string;
      renderBox?: unknown;
    }
  >;
}

export interface LocalScreenshotMetadata {
  currentHash: string;
  variant: ScreenshotVariant;
  renderBox?: unknown;
  url: string;
}

export interface LocalScreenshotFile {
  buffer: Buffer;
  immutable: boolean;
}

function getScreenshotsDir(): string {
  return path.join(getDataDir(), "screenshots");
}

export function isSafeScreenshotIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0")
  );
}

export function normalizeScreenshotHash(
  hash?: string | null,
): string | null {
  if (!hash) return null;
  return /^[a-f0-9]{16}$/i.test(hash) ? hash.toLowerCase() : null;
}

function isLikelyBlankScreenshot(
  byteLength: number,
  renderBox?: unknown,
): boolean {
  if (!renderBox || typeof renderBox !== "object") return false;
  const box = renderBox as Record<string, unknown>;
  const width = typeof box.width === "number" ? box.width : 0;
  const height = typeof box.height === "number" ? box.height : 0;
  return (
    width * height >= LARGE_RENDER_AREA &&
    byteLength < MIN_MEANINGFUL_SCREENSHOT_BYTES
  );
}

function readScreenshotMeta(
  projectId: string,
  pageId: string,
): ScreenshotMeta | null {
  const metaPath = path.join(
    getScreenshotsDir(),
    projectId,
    `${pageId}.meta.json`,
  );
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as ScreenshotMeta;
  } catch {
    return null;
  }
}

function resolveCurrentScreenshotMeta(meta: ScreenshotMeta | null): {
  hash: string;
  variant: ScreenshotVariant;
  renderBox?: unknown;
} | null {
  if (!meta) return null;
  const currentHash = normalizeScreenshotHash(meta.currentHash);
  if (currentHash) {
    return {
      hash: currentHash,
      variant: "strict",
      renderBox: meta.renderBoxes?.[currentHash],
    };
  }

  const candidates = Object.entries(meta.variants ?? {})
    .map(([key, value]) => {
      const [rawHash, variant = "strict"] = key.split(":");
      return {
        hash: normalizeScreenshotHash(rawHash),
        variant: variant === "fast" ? ("fast" as const) : ("strict" as const),
        generatedAt: value.generatedAt ?? "",
        renderBox: value.renderBox,
      };
    })
    .filter((entry) => entry.hash !== null)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const latest = candidates[0];
  if (!latest?.hash) return null;
  return { ...latest, hash: latest.hash };
}

function getLocalScreenshotPath(
  projectId: string,
  pageId: string,
  hash: string,
  variant: ScreenshotVariant,
): string {
  return path.join(
    getScreenshotsDir(),
    projectId,
    variant === "strict"
      ? `${pageId}.${hash}.png`
      : `${pageId}.${hash}.${variant}.png`,
  );
}

export function getLocalScreenshotMetadata(
  projectId: string,
  pageId: string,
): LocalScreenshotMetadata | null {
  if (
    !isSafeScreenshotIdentifier(projectId) ||
    !isSafeScreenshotIdentifier(pageId)
  ) {
    return null;
  }

  const current = resolveCurrentScreenshotMeta(
    readScreenshotMeta(projectId, pageId),
  );
  if (!current) return null;

  try {
    const filePath = getLocalScreenshotPath(
      projectId,
      pageId,
      current.hash,
      current.variant,
    );
    const { size } = fs.statSync(filePath);
    if (isLikelyBlankScreenshot(size, current.renderBox)) return null;
  } catch {
    return null;
  }

  const query = new URLSearchParams({
    hash: current.hash,
    ...(current.variant === "fast" ? { variant: "fast" } : {}),
  });
  return {
    currentHash: current.hash,
    variant: current.variant,
    url: `/api/screenshots/file/${encodeURIComponent(projectId)}/${encodeURIComponent(pageId)}?${query.toString()}`,
    renderBox: current.renderBox,
  };
}

export function readLocalScreenshotFile(input: {
  projectId: string;
  pageId: string;
  hash?: string | null;
  variant?: ScreenshotVariant;
}): LocalScreenshotFile | null {
  const { projectId, pageId } = input;
  if (
    !isSafeScreenshotIdentifier(projectId) ||
    !isSafeScreenshotIdentifier(pageId)
  ) {
    return null;
  }

  const normalizedHash = normalizeScreenshotHash(input.hash);
  if (input.hash && !normalizedHash) return null;

  const meta = readScreenshotMeta(projectId, pageId);
  const current = normalizedHash ? null : resolveCurrentScreenshotMeta(meta);
  const hash = normalizedHash ?? current?.hash;
  const variant = normalizedHash
    ? input.variant ?? "strict"
    : current?.variant ?? "strict";
  const filePath = hash
    ? getLocalScreenshotPath(projectId, pageId, hash, variant)
    : path.join(getScreenshotsDir(), projectId, `${pageId}.png`);
  const renderBox = hash
    ? meta?.renderBoxes?.[hash] ?? current?.renderBox
    : undefined;

  try {
    const buffer = fs.readFileSync(filePath);
    if (isLikelyBlankScreenshot(buffer.length, renderBox)) return null;
    return { buffer, immutable: Boolean(normalizedHash) };
  } catch {
    return null;
  }
}
