import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

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

export interface GlobalImageStoreEntry {
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
  images: GlobalImageStoreEntry[];
}

export interface UploadImageResult {
  success: true;
  imageId: string;
  url: string;
  sha256: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  deduplicated: boolean;
}

export interface UploadImageError {
  success: false;
  error: string;
}

let dataDirCache: string | null = null;

function getRootDataDir(): string {
  if (dataDirCache) return dataDirCache;

  if (process.env.DATA_DIR) {
    dataDirCache = path.resolve(process.env.DATA_DIR);
    return dataDirCache;
  }

  let current = path.resolve(process.cwd());
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      dataDirCache = path.join(current, "data");
      return dataDirCache;
    }
    current = path.dirname(current);
  }

  dataDirCache = path.join(process.cwd(), "data");
  return dataDirCache;
}

function getImageStoreDir(): string {
  return path.join(getRootDataDir(), "image-store");
}

function getBlobsDir(): string {
  return path.join(getImageStoreDir(), "blobs");
}

function getManifestPath(): string {
  return path.join(getImageStoreDir(), "manifest.json");
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

function readManifest(): ImageStoreManifest {
  const manifestPath = getManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, images: [] };
  }
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as ImageStoreManifest;
  } catch {
    return { version: 1, images: [] };
  }
}

function writeManifest(manifest: ImageStoreManifest): void {
  const blobsDir = getBlobsDir();
  if (!fs.existsSync(blobsDir)) {
    fs.mkdirSync(blobsDir, { recursive: true });
  }
  fs.writeFileSync(getManifestPath(), JSON.stringify(manifest, null, 2), "utf-8");
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

export function uploadToGlobalImageStore(params: {
  buffer: Buffer;
  filename: string;
  sourceType: ImageSourceType;
  sourceUrl?: string;
  projectId?: string;
  createdBy?: string;
}): UploadImageResult | UploadImageError {
  const { buffer, filename, sourceType, sourceUrl, projectId, createdBy = "ai-agent" } = params;

  if (buffer.length > MAX_FILE_SIZE) {
    return { success: false, error: "Image too large (>10MB)" };
  }

  const ext = getExt(filename);
  if (!SUPPORTED_FORMATS.has(ext)) {
    return { success: false, error: `Unsupported format ".${ext}"` };
  }

  const sha256 = computeSha256(buffer);
  const mimeType = getMimeType(filename);
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
      mimeType: existing.mimeType,
      deduplicated: true,
    };
  }

  const imageId = generateImageId();
  const blobDir = getBlobsDir();
  if (!fs.existsSync(blobDir)) {
    fs.mkdirSync(blobDir, { recursive: true });
  }

  const blobFilename = `${sha256.slice(0, 16)}.${ext}`;
  const blobPath = path.join(blobDir, blobFilename);
  fs.writeFileSync(blobPath, buffer);

  const dimensions = readImageDimensions(buffer, ext);

  const entry: GlobalImageStoreEntry = {
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
    mimeType,
    deduplicated: false,
  };
}
