import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { DATA_DIR } from "./paths";
import { OPTIMIZATION_MIN_BYTES, optimizeRasterImage } from "./image-optimizer";

const IMAGE_STORE_DIR = path.join(DATA_DIR, "image-store");
const BLOBS_DIR = path.join(IMAGE_STORE_DIR, "blobs");
const MANIFEST_PATH = path.join(IMAGE_STORE_DIR, "manifest.json");

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
