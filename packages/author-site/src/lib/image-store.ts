import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { DATA_DIR } from "./paths";
import { OPTIMIZATION_MIN_BYTES, optimizeRasterImage } from "./image-optimizer";

const IMAGE_STORE_DIR = path.join(DATA_DIR, "image-store");
const BLOBS_DIR = path.join(IMAGE_STORE_DIR, "blobs");
const MANIFEST_PATH = path.join(IMAGE_STORE_DIR, "manifest.json");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const WHITEBOARD_DRAFT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

const SUPPORTED_FORMATS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export type ImageSourceType =
  | "user_upload"
  | "ai_generated"
  | "remote_url"
  | "session_asset";

export interface ImageStoreEntry {
  id: string;
  sha256: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  sourceType: ImageSourceType;
  sourceUrl?: string;
  createdAt: number;
  createdBy: string;
  projectRefs: string[];
  /** Set only for assets staged by the whiteboard image pipeline. */
  whiteboardManaged?: boolean;
  /** Draft leases are time-bounded so interrupted localization can be collected. */
  whiteboardDrafts?: Record<string, number>;
  /** Durable whiteboard document IDs that still reference this image. */
  whiteboardRefs?: string[];
}

interface ImageStoreManifest {
  version: 1;
  images: ImageStoreEntry[];
}

export interface ImageStoreOptimizationReport {
  dryRun: boolean;
  scanned: number;
  eligible: number;
  optimized: number;
  skipped: number;
  failed: number;
  bytesSaved: number;
}

export interface UploadResult {
  success: true;
  imageId: string;
  url: string;
  sha256: string;
  filename: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  mimeType: string;
  deduplicated: boolean;
}

export interface UploadError {
  success: false;
  error: { code: string; message: string };
}

function ensureImageStoreDir(): void {
  if (!fs.existsSync(BLOBS_DIR)) {
    fs.mkdirSync(BLOBS_DIR, { recursive: true });
  }
}

function readManifest(): ImageStoreManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { version: 1, images: [] };
  }
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw) as ImageStoreManifest;
  } catch {
    return { version: 1, images: [] };
  }
}

function writeManifest(manifest: ImageStoreManifest): void {
  ensureImageStoreDir();
  const tempPath = `${MANIFEST_PATH}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), "utf-8");
  fs.renameSync(tempPath, MANIFEST_PATH);
}

function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function generateImageId(): string {
  return `img_${crypto.randomBytes(10).toString("base64url")}`;
}

function getExt(filename: string): string {
  return path.extname(filename).slice(1).toLowerCase();
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function getBlobPath(entry: Pick<ImageStoreEntry, "sha256" | "filename">): string {
  return path.join(BLOBS_DIR, `${entry.sha256.slice(0, 16)}.${getExt(entry.filename)}`);
}

function readImageDimensions(
  buffer: Buffer,
  ext: string,
): { width?: number; height?: number } {
  try {
    if (ext === "png" && buffer.length > 24) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }
    if (ext === "jpg" || ext === "jpeg") {
      let offset = 2;
      while (offset < buffer.length - 2) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          if (offset + 9 < buffer.length) {
            return {
              height: buffer.readUInt16BE(offset + 5),
              width: buffer.readUInt16BE(offset + 7),
            };
          }
          break;
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
    if (ext === "gif" && buffer.length > 10) {
      return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8),
      };
    }
  } catch {
    // dimensions are optional
  }
  return {};
}

export async function uploadImage(params: {
  buffer: Buffer;
  filename: string;
  sourceType: ImageSourceType;
  sourceUrl?: string;
  projectId?: string;
  createdBy?: string;
}): Promise<UploadResult | UploadError> {
  const { buffer: uploadBuffer, filename, sourceType, sourceUrl, projectId, createdBy = "unknown" } = params;

  if (uploadBuffer.length > MAX_FILE_SIZE) {
    const sizeMB = (uploadBuffer.length / 1024 / 1024).toFixed(1);
    return {
      success: false,
      error: {
        code: "ASSET_TOO_LARGE",
        message: `图片大小超过 10MB 限制 (${sizeMB}MB)`,
      },
    };
  }

  const ext = getExt(filename);
  if (!SUPPORTED_FORMATS.has(ext)) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_FORMAT",
        message: `不支持的图片格式 ".${ext}"，支持: ${[...SUPPORTED_FORMATS].join(", ")}`,
      },
    };
  }

  const { buffer } = await optimizeRasterImage({
    buffer: uploadBuffer,
    extension: ext,
  });

  const sha256 = computeSha256(buffer);
  const mimeType = getMimeType(filename);
  const dimensions = readImageDimensions(buffer, ext);

  ensureImageStoreDir();
  const manifest = readManifest();

  const existing = manifest.images.find((img) => img.sha256 === sha256);
  if (existing) {
    if (projectId && !existing.projectRefs.includes(projectId)) {
      existing.projectRefs.push(projectId);
      writeManifest(manifest);
    }

    return {
      success: true,
      imageId: existing.id,
      url: `/api/images/${existing.id}`,
      sha256: existing.sha256,
      filename: existing.filename,
      sizeBytes: existing.sizeBytes,
      width: existing.width,
      height: existing.height,
      mimeType: existing.mimeType,
      deduplicated: true,
    };
  }

  const imageId = generateImageId();
  const blobFilename = `${sha256.slice(0, 16)}.${ext}`;
  const blobPath = path.join(BLOBS_DIR, blobFilename);

  fs.writeFileSync(blobPath, buffer);

  const entry: ImageStoreEntry = {
    id: imageId,
    sha256,
    filename,
    mimeType,
    sizeBytes: buffer.length,
    width: dimensions.width,
    height: dimensions.height,
    sourceType,
    sourceUrl,
    createdAt: Date.now(),
    createdBy,
    projectRefs: projectId ? [projectId] : [],
  };

  manifest.images.push(entry);
  writeManifest(manifest);

  return {
    success: true,
    imageId,
    url: `/api/images/${imageId}`,
    sha256,
    filename,
    sizeBytes: buffer.length,
    width: dimensions.width,
    height: dimensions.height,
    mimeType,
    deduplicated: false,
  };
}

export function getImage(imageId: string): {
  buffer?: Buffer;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
} {
  const manifest = readManifest();
  const entry = manifest.images.find((img) => img.id === imageId);
  if (!entry) {
    return { error: "Image not found" };
  }

  const blobPath = getBlobPath(entry);

  if (!fs.existsSync(blobPath)) {
    return { error: "Image blob file missing" };
  }

  return {
    buffer: fs.readFileSync(blobPath),
    mimeType: entry.mimeType,
    sizeBytes: entry.sizeBytes,
  };
}

export function getImageInfo(imageId: string): ImageStoreEntry | null {
  const manifest = readManifest();
  return manifest.images.find((img) => img.id === imageId) || null;
}

function canCollectWhiteboardEntry(entry: ImageStoreEntry): boolean {
  return Boolean(entry.whiteboardManaged)
    && (entry.projectRefs?.length ?? 0) === 0
    && (entry.whiteboardRefs?.length ?? 0) === 0
    && Object.keys(entry.whiteboardDrafts ?? {}).length === 0;
}

function removeImageEntry(manifest: ImageStoreManifest, imageId: string): boolean {
  const index = manifest.images.findIndex((entry) => entry.id === imageId);
  if (index < 0) return false;
  const [entry] = manifest.images.splice(index, 1);
  const blobPath = getBlobPath(entry);
  const sharedBlob = manifest.images.some((candidate) => getBlobPath(candidate) === blobPath);
  if (!sharedBlob && fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
  return true;
}

/** Claim a localized image for a private whiteboard draft. */
export function claimWhiteboardDraftImage(
  imageId: string,
  draftId: string,
  expiresAt = Date.now() + 30 * 60_000,
): boolean {
  if (!WHITEBOARD_DRAFT_ID_PATTERN.test(imageId) || !WHITEBOARD_DRAFT_ID_PATTERN.test(draftId) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const manifest = readManifest();
  const entry = manifest.images.find((candidate) => candidate.id === imageId);
  if (!entry) return false;
  entry.whiteboardManaged = true;
  entry.whiteboardDrafts = { ...(entry.whiteboardDrafts ?? {}), [draftId]: expiresAt };
  writeManifest(manifest);
  return true;
}

/** Turn a draft lease into a durable whiteboard-document reference. */
export function attachWhiteboardImage(
  imageId: string,
  whiteboardId: string,
  draftId?: string,
): boolean {
  if (!WHITEBOARD_DRAFT_ID_PATTERN.test(imageId) || !WHITEBOARD_DRAFT_ID_PATTERN.test(whiteboardId)) return false;
  const manifest = readManifest();
  const entry = manifest.images.find((candidate) => candidate.id === imageId);
  if (!entry) return false;
  const refs = new Set(entry.whiteboardRefs ?? []);
  refs.add(whiteboardId);
  const drafts = { ...(entry.whiteboardDrafts ?? {}) };
  if (draftId) delete drafts[draftId];
  entry.whiteboardManaged = true;
  entry.whiteboardRefs = [...refs].sort();
  entry.whiteboardDrafts = Object.keys(drafts).length ? drafts : undefined;
  writeManifest(manifest);
  return true;
}

/** Release one draft lease. Any uniquely whiteboard-owned image becomes collectible. */
export function releaseWhiteboardDraftImages(draftId: string): string[] {
  if (!WHITEBOARD_DRAFT_ID_PATTERN.test(draftId)) return [];
  const manifest = readManifest();
  const removed: string[] = [];
  let changed = false;
  for (const entry of [...manifest.images]) {
    if (!(entry.whiteboardDrafts && draftId in entry.whiteboardDrafts)) continue;
    const drafts = { ...entry.whiteboardDrafts };
    delete drafts[draftId];
    entry.whiteboardDrafts = Object.keys(drafts).length ? drafts : undefined;
    changed = true;
    if (canCollectWhiteboardEntry(entry) && removeImageEntry(manifest, entry.id)) removed.push(entry.id);
  }
  if (changed) writeManifest(manifest);
  return removed;
}

/** Remove expired private draft assets; durable references are never collected. */
export function collectExpiredWhiteboardImages(now = Date.now()): string[] {
  const manifest = readManifest();
  const removed: string[] = [];
  let changed = false;
  for (const entry of [...manifest.images]) {
    if (!entry.whiteboardDrafts) continue;
    const drafts = Object.fromEntries(Object.entries(entry.whiteboardDrafts).filter(([, expiresAt]) => expiresAt > now));
    if (Object.keys(drafts).length !== Object.keys(entry.whiteboardDrafts).length) {
      entry.whiteboardDrafts = Object.keys(drafts).length ? drafts : undefined;
      changed = true;
    }
    if (canCollectWhiteboardEntry(entry) && removeImageEntry(manifest, entry.id)) {
      removed.push(entry.id);
      changed = true;
    }
  }
  if (changed) writeManifest(manifest);
  return removed;
}

/** Mark every image used by a successfully committed V3 document as durable. */
export function attachWhiteboardImages(
  imageIds: readonly string[],
  whiteboardId: string,
  draftId?: string,
): void {
  syncWhiteboardImages(imageIds, whiteboardId, draftId);
}

/**
 * Synchronize the durable image references for one whiteboard revision. The
 * workspace transaction owns the document/config atomicity; this manifest
 * update is deliberately idempotent so a retry can repair bookkeeping after
 * a process interruption. References from the replaced revision are removed
 * only after the workspace transaction has succeeded.
 */
export function syncWhiteboardImages(
  imageIds: readonly string[],
  whiteboardId: string,
  draftId?: string,
  previousImageIds: readonly string[] = [],
): void {
  const validIds = [...new Set(imageIds)].filter((imageId) => WHITEBOARD_DRAFT_ID_PATTERN.test(imageId));
  const previousIds = [...new Set(previousImageIds)].filter((imageId) => WHITEBOARD_DRAFT_ID_PATTERN.test(imageId));
  if ((!validIds.length && !previousIds.length) || !WHITEBOARD_DRAFT_ID_PATTERN.test(whiteboardId)) return;
  const manifest = readManifest();
  const nextIds = new Set(validIds);
  const staleIds = new Set(previousIds.filter((imageId) => !nextIds.has(imageId)));
  let changed = false;
  for (const entry of [...manifest.images]) {
    const imageId = entry.id;
    if (!nextIds.has(imageId) && !staleIds.has(imageId)) continue;
    if (nextIds.has(imageId)) {
      const refs = new Set(entry.whiteboardRefs ?? []);
      if (!refs.has(whiteboardId)) {
        refs.add(whiteboardId);
        entry.whiteboardRefs = [...refs].sort();
        changed = true;
      }
      if (draftId && entry.whiteboardDrafts?.[draftId] !== undefined) {
        const drafts = { ...entry.whiteboardDrafts };
        delete drafts[draftId];
        entry.whiteboardDrafts = Object.keys(drafts).length ? drafts : undefined;
        changed = true;
      }
      if (!entry.whiteboardManaged) {
        entry.whiteboardManaged = true;
        changed = true;
      }
      continue;
    }

    const refs = new Set(entry.whiteboardRefs ?? []);
    if (!refs.delete(whiteboardId)) continue;
    entry.whiteboardRefs = refs.size ? [...refs].sort() : undefined;
    changed = true;
    if (canCollectWhiteboardEntry(entry) && removeImageEntry(manifest, imageId)) {
      changed = true;
    }
  }
  if (changed) writeManifest(manifest);
}

/** Remove one whiteboard's durable references without touching other owners. */
export function detachWhiteboardImages(
  imageIds: readonly string[],
  whiteboardId: string,
): void {
  const validIds = [...new Set(imageIds)].filter((imageId) => WHITEBOARD_DRAFT_ID_PATTERN.test(imageId));
  if (!validIds.length || !WHITEBOARD_DRAFT_ID_PATTERN.test(whiteboardId)) return;
  const manifest = readManifest();
  let changed = false;
  for (const imageId of validIds) {
    const entry = manifest.images.find((candidate) => candidate.id === imageId);
    if (!entry) continue;
    const refs = new Set(entry.whiteboardRefs ?? []);
    if (!refs.delete(whiteboardId)) continue;
    entry.whiteboardRefs = refs.size ? [...refs].sort() : undefined;
    changed = true;
    if (canCollectWhiteboardEntry(entry) && removeImageEntry(manifest, entry.id)) changed = true;
  }
  if (changed) writeManifest(manifest);
}

export function getImageStoreDir(): string {
  return IMAGE_STORE_DIR;
}

/**
 * Re-processes current image-store entries using the same non-resizing upload
 * optimisation rules. Run this only while the author service is stopped, as
 * the manifest remains a file-backed single-writer store.
 */
export async function optimizeStoredImages(options: { dryRun?: boolean } = {}): Promise<ImageStoreOptimizationReport> {
  const dryRun = options.dryRun ?? false;
  const manifest = readManifest();
  const report: ImageStoreOptimizationReport = {
    dryRun,
    scanned: manifest.images.length,
    eligible: 0,
    optimized: 0,
    skipped: 0,
    failed: 0,
    bytesSaved: 0,
  };
  const previousBlobPaths = new Set<string>();

  for (const entry of manifest.images) {
    const extension = getExt(entry.filename);
    if (extension !== "jpg" && extension !== "jpeg" && extension !== "png") {
      report.skipped += 1;
      continue;
    }

    const blobPath = getBlobPath(entry);
    if (!fs.existsSync(blobPath)) {
      report.failed += 1;
      continue;
    }

    try {
      const source = fs.readFileSync(blobPath);
      if (source.length <= OPTIMIZATION_MIN_BYTES) {
        report.skipped += 1;
        continue;
      }

      report.eligible += 1;
      const result = await optimizeRasterImage({ buffer: source, extension });
      if (!result.optimized) {
        report.skipped += 1;
        continue;
      }

      const sha256 = computeSha256(result.buffer);
      if (sha256 === entry.sha256) {
        report.skipped += 1;
        continue;
      }

      if (!dryRun) {
        const optimizedPath = getBlobPath({ sha256, filename: entry.filename });
        if (!fs.existsSync(optimizedPath)) {
          fs.writeFileSync(optimizedPath, result.buffer);
        }

        previousBlobPaths.add(blobPath);
        entry.sha256 = sha256;
        entry.sizeBytes = result.buffer.length;
      }
      report.optimized += 1;
      report.bytesSaved += source.length - result.buffer.length;
    } catch {
      report.failed += 1;
    }
  }

  if (report.optimized === 0 || dryRun) return report;

  writeManifest(manifest);
  for (const previousBlobPath of previousBlobPaths) {
    const stillReferenced = manifest.images.some(
      (entry) => getBlobPath(entry) === previousBlobPath,
    );
    if (!stillReferenced && fs.existsSync(previousBlobPath)) {
      fs.unlinkSync(previousBlobPath);
    }
  }

  return report;
}
