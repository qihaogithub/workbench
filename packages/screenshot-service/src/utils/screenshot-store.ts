import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { config } from "../config";
import { ScreenshotError } from "./errors";
import type { ScreenshotRenderBox } from "./browser-pool";

export type ScreenshotVariant = "strict" | "fast";

interface ScreenshotVariantMeta {
  variant: ScreenshotVariant;
  generatedAt: string;
  elapsed: number;
  renderBox: ScreenshotRenderBox;
}

export interface ScreenshotMeta {
  currentHash?: string;
  generatedAt: string;
  elapsed: number;
  history: string[];
  renderBoxes?: Record<string, ScreenshotRenderBox>;
  variants?: Record<string, ScreenshotVariantMeta>;
}

export function computeScreenshotHash(
  code: string,
  configData: Record<string, unknown>,
  width: number,
  height: number,
  fullPage = false,
  identity: Record<string, unknown> = {},
): string {
  const input = [
    code,
    JSON.stringify(configData),
    String(width),
    String(height),
    String(fullPage),
    String(config.snapshotVersion),
    "render-box-v2",
    JSON.stringify(identity),
  ].join(":");

  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function getProjectDir(projectId: string): string {
  return path.join(config.dataDir, projectId);
}

function getScreenshotPath(
  projectId: string,
  pageId: string,
  hash: string,
  variant: ScreenshotVariant = "strict",
): string {
  const suffix = variant === "strict" ? "" : `.${variant}`;
  return path.join(getProjectDir(projectId), `${pageId}.${hash}${suffix}.png`);
}

function getVariantMetaKey(hash: string, variant: ScreenshotVariant): string {
  return `${hash}:${variant}`;
}

function getMetaPath(projectId: string, pageId: string): string {
  return path.join(getProjectDir(projectId), `${pageId}.meta.json`);
}

function getCurrentScreenshotPath(
  projectId: string,
  pageId: string,
): string {
  return path.join(getProjectDir(projectId), `${pageId}.png`);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function screenshotExists(
  projectId: string,
  pageId: string,
  hash: string,
  variant: ScreenshotVariant = "strict",
): Promise<boolean> {
  const filePath = getScreenshotPath(projectId, pageId, hash, variant);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readScreenshot(
  projectId: string,
  pageId: string,
  hash?: string,
  variant: ScreenshotVariant = "strict",
): Promise<Buffer | null> {
  let filePath: string;
  if (hash) {
    filePath = getScreenshotPath(projectId, pageId, hash, variant);
  } else {
    // Read current version via meta
    const meta = await readMeta(projectId, pageId);
    if (meta?.currentHash) {
      filePath = getScreenshotPath(projectId, pageId, meta.currentHash);
    } else {
      // Fallback: read current version directly (pageId.png)
      filePath = getCurrentScreenshotPath(projectId, pageId);
    }
  }

  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function writeScreenshot(
  projectId: string,
  pageId: string,
  hash: string,
  buffer: Buffer,
  elapsed: number,
  renderBox: ScreenshotRenderBox,
  variant: ScreenshotVariant = "strict",
): Promise<void> {
  const dir = getProjectDir(projectId);
  await ensureDir(dir);

  const filePath = getScreenshotPath(projectId, pageId, hash, variant);
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, filePath);

    if (variant === "strict") {
      // Update current copy only after the hash-addressed file is complete.
      const currentPath = getCurrentScreenshotPath(projectId, pageId);
      await fs.copyFile(filePath, currentPath);
      await updateMeta(projectId, pageId, hash, elapsed, renderBox);
    } else {
      await updateVariantMeta(projectId, pageId, hash, variant, elapsed, renderBox);
    }
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw new ScreenshotError(
      "SCREENSHOT_WRITE_ERROR",
      "截图文件写入失败",
      error,
    );
  }
}

export async function readScreenshotRenderBox(
  projectId: string,
  pageId: string,
  hash: string,
  variant: ScreenshotVariant = "strict",
): Promise<ScreenshotRenderBox | undefined> {
  const meta = await readMeta(projectId, pageId);
  if (variant !== "strict") {
    return meta?.variants?.[getVariantMetaKey(hash, variant)]?.renderBox;
  }
  return meta?.renderBoxes?.[hash];
}

async function readMeta(
  projectId: string,
  pageId: string,
): Promise<ScreenshotMeta | null> {
  const metaPath = getMetaPath(projectId, pageId);
  try {
    const content = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(content) as ScreenshotMeta;
  } catch {
    return null;
  }
}

export async function readScreenshotMeta(
  projectId: string,
  pageId: string,
): Promise<ScreenshotMeta | null> {
  return readMeta(projectId, pageId);
}

async function updateMeta(
  projectId: string,
  pageId: string,
  hash: string,
  elapsed: number,
  renderBox: ScreenshotRenderBox,
): Promise<void> {
  const metaPath = getMetaPath(projectId, pageId);
  const dir = getProjectDir(projectId);
  await ensureDir(dir);

  const existing = await readMeta(projectId, pageId);
  const history = existing?.history || [];

  // Add current hash to history if not already there
  if (!history.includes(hash)) {
    history.unshift(hash);
  }

  // Keep only the most recent N entries
  const trimmedHistory = history.slice(0, config.maxHistoryFiles);
  const renderBoxes = Object.fromEntries(
    trimmedHistory
      .map((itemHash) => {
        const box = itemHash === hash ? renderBox : existing?.renderBoxes?.[itemHash];
        return box ? [itemHash, box] : undefined;
      })
      .filter((entry): entry is [string, ScreenshotRenderBox] => Boolean(entry)),
  );

  const meta: ScreenshotMeta = {
    currentHash: hash,
    generatedAt: new Date().toISOString(),
    elapsed,
    history: trimmedHistory,
    renderBoxes,
    variants: pruneVariants(existing?.variants, trimmedHistory),
  };

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
}

function pruneVariants(
  variants: ScreenshotMeta["variants"],
  history: string[],
): ScreenshotMeta["variants"] {
  if (!variants) return undefined;
  const historySet = new Set(history);
  return Object.fromEntries(
    Object.entries(variants).filter(([key]) => {
      const [hash] = key.split(":");
      return historySet.has(hash);
    }),
  );
}

async function updateVariantMeta(
  projectId: string,
  pageId: string,
  hash: string,
  variant: ScreenshotVariant,
  elapsed: number,
  renderBox: ScreenshotRenderBox,
): Promise<void> {
  const metaPath = getMetaPath(projectId, pageId);
  const dir = getProjectDir(projectId);
  await ensureDir(dir);

  const existing = await readMeta(projectId, pageId);
  const variants = {
    ...(existing?.variants || {}),
    [getVariantMetaKey(hash, variant)]: {
      variant,
      generatedAt: new Date().toISOString(),
      elapsed,
      renderBox,
    },
  };
  const variantEntries = Object.entries(variants)
    .sort((a, b) => Date.parse(b[1].generatedAt) - Date.parse(a[1].generatedAt))
    .slice(0, config.maxHistoryFiles * 2);

  const meta: ScreenshotMeta = {
    currentHash: existing?.currentHash,
    generatedAt: existing?.generatedAt || new Date().toISOString(),
    elapsed: existing?.elapsed || elapsed,
    history: existing?.history || [],
    renderBoxes: existing?.renderBoxes,
    variants: Object.fromEntries(variantEntries),
  };

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
}

export async function cleanupOldScreenshots(
  projectId: string,
  pageId: string,
): Promise<void> {
  const meta = await readMeta(projectId, pageId);
  if (!meta) return;

  const dir = getProjectDir(projectId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return;
  }

  const retainedHashes = new Set(meta.history);
  const retainedVariantFiles = new Set(
    Object.keys(meta.variants || {}).map((key) => {
      const [hash, variant] = key.split(":");
      return `${pageId}.${hash}.${variant}.png`;
    }),
  );

  // Find all screenshot files for this page
  const pageFiles = files.filter(
    (f) => f.startsWith(`${pageId}.`) && f.endsWith(".png") && f !== `${pageId}.png`,
  );

  // Delete files not in history
  for (const file of pageFiles) {
    if (retainedVariantFiles.has(file)) continue;

    // Extract hash from filename: pageId.hash.png or pageId.hash.fast.png
    const parts = file.split(".");
    if (parts.length >= 3) {
      const fileHash = parts[1];
      if (!retainedHashes.has(fileHash)) {
        await fs.unlink(path.join(dir, file)).catch(() => {});
      }
    }
  }
}
