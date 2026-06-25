import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { config } from "../config";
import { ScreenshotError } from "./errors";
import type { ScreenshotRenderBox } from "./browser-pool";

export interface ScreenshotMeta {
  currentHash: string;
  generatedAt: string;
  elapsed: number;
  history: string[];
  renderBoxes?: Record<string, ScreenshotRenderBox>;
}

export function computeScreenshotHash(
  code: string,
  configData: Record<string, unknown>,
  width: number,
  height: number,
  fullPage = false,
): string {
  const input = [
    code,
    JSON.stringify(configData),
    String(width),
    String(height),
    String(fullPage),
    String(config.snapshotVersion),
    "render-box-v2",
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
): string {
  return path.join(getProjectDir(projectId), `${pageId}.${hash}.png`);
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
): Promise<boolean> {
  const filePath = getScreenshotPath(projectId, pageId, hash);
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
): Promise<Buffer | null> {
  let filePath: string;
  if (hash) {
    filePath = getScreenshotPath(projectId, pageId, hash);
  } else {
    // Read current version via meta
    const meta = await readMeta(projectId, pageId);
    if (meta) {
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
): Promise<void> {
  const dir = getProjectDir(projectId);
  await ensureDir(dir);

  const filePath = getScreenshotPath(projectId, pageId, hash);
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, filePath);

    // Update current copy only after the hash-addressed file is complete.
    const currentPath = getCurrentScreenshotPath(projectId, pageId);
    await fs.copyFile(filePath, currentPath);

    await updateMeta(projectId, pageId, hash, elapsed, renderBox);
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
): Promise<ScreenshotRenderBox | undefined> {
  const meta = await readMeta(projectId, pageId);
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

  // Find all screenshot files for this page
  const pageFiles = files.filter(
    (f) => f.startsWith(`${pageId}.`) && f.endsWith(".png") && f !== `${pageId}.png`,
  );

  // Delete files not in history
  for (const file of pageFiles) {
    // Extract hash from filename: pageId.hash.png
    const parts = file.split(".");
    if (parts.length === 3) {
      const fileHash = parts[1];
      if (!meta.history.includes(fileHash)) {
        await fs.unlink(path.join(dir, file)).catch(() => {});
      }
    }
  }
}
