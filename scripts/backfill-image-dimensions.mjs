import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const MANIFEST_PATH = path.join(DATA_DIR, "image-store", "manifest.json");
const BLOBS_DIR = path.join(DATA_DIR, "image-store", "blobs");

function readImageDimensions(buffer, ext) {
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

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));

let updated = 0;
let skipped = 0;
let failed = 0;

for (const entry of manifest.images) {
  if (entry.width != null && entry.height != null) {
    skipped++;
    continue;
  }
  const ext = path.extname(entry.filename).slice(1).toLowerCase();
  const blobFilename = `${entry.sha256.slice(0, 16)}.${ext}`;
  const blobPath = path.join(BLOBS_DIR, blobFilename);
  if (!fs.existsSync(blobPath)) {
    failed++;
    continue;
  }
  const buffer = fs.readFileSync(blobPath);
  const dims = readImageDimensions(buffer, ext);
  if (dims.width != null && dims.height != null) {
    entry.width = dims.width;
    entry.height = dims.height;
    updated++;
  }
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
console.log(`Backfill done: updated=${updated} skipped=${skipped} failed=${failed}`);
