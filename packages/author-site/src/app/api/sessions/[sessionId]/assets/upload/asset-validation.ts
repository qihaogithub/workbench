const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"];
const VIDEO_HEADER_SCAN_BYTES = 64 * 1024;
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".svga", ".lottie", ".riv", ".json", ".skel", ".atlas", ".zip", ".mp4", ".webm"]);
const OCTET_STREAM_EXTENSIONS = new Set([".svga", ".lottie", ".riv", ".skel", ".atlas"]);
const ZIP_MIME_TYPES = new Set(["", "application/octet-stream", "application/zip", "application/x-zip-compressed", "application/x-compressed"]);

export function getFileExtension(filename: string): string { const dot = filename.lastIndexOf("."); return dot < 0 ? "" : filename.slice(dot).toLowerCase(); }
/** Flutter exporters commonly name a normal ZIP bundle `*.zip.flutter`. */
export function isSpinePackageFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".zip") || lower.endsWith(".zip.flutter");
}
export function hasAllowedAssetExtension(filename: string): boolean {
  return isSpinePackageFilename(filename) || ALLOWED_EXTENSIONS.has(getFileExtension(filename));
}

function hasMp4FtypBox(buffer: Buffer): boolean {
  const scanLimit = Math.min(buffer.length, VIDEO_HEADER_SCAN_BYTES);
  let offset = 0;

  while (offset + 8 <= scanLimit) {
    const declaredSize = buffer.readUInt32BE(offset);
    const boxType = buffer.toString("ascii", offset + 4, offset + 8);
    let boxSize = declaredSize;
    let headerSize = 8;

    if (declaredSize === 1) {
      if (offset + 16 > scanLimit) return false;
      const largeSizeHigh = buffer.readUInt32BE(offset + 8);
      const largeSizeLow = buffer.readUInt32BE(offset + 12);
      const maxSafeHigh = Math.floor(Number.MAX_SAFE_INTEGER / 0x100000000);
      if (largeSizeHigh > maxSafeHigh) return false;
      boxSize = largeSizeHigh * 0x100000000 + largeSizeLow;
      if (boxSize < 16) return false;
      headerSize = 16;
    } else if (declaredSize === 0) {
      // A zero-sized box consumes the rest of the file. It cannot be followed
      // by a separate ftyp box, and accepting it would make the scan unsafe.
      return false;
    }

    if (boxSize < headerSize || boxSize > scanLimit - offset || boxSize > buffer.length - offset) {
      return false;
    }

    if (boxType === "ftyp") {
      // ftyp contains at least a major brand and a minor version.
      return boxSize >= headerSize + 8;
    }

    offset += boxSize;
  }

  return false;
}

function hasExpectedVideoContainer(buffer: Buffer, extension: string): boolean {
  return extension === ".mp4" ? hasMp4FtypBox(buffer)
    : extension === ".webm" ? buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) : false;
}
export function isAllowedAssetFile(file: File, buffer?: Buffer): boolean {
  const extension = getFileExtension(file.name);
  if (!hasAllowedAssetExtension(file.name)) return false;
  if (extension === ".json") return file.type === "" || file.type === "application/json";
  if (isSpinePackageFilename(file.name)) return ZIP_MIME_TYPES.has(file.type);
  if (extension === ".mp4" || extension === ".webm") return buffer ? hasExpectedVideoContainer(buffer, extension) : ALLOWED_VIDEO_MIME_TYPES.includes(file.type);
  if (OCTET_STREAM_EXTENSIONS.has(extension)) return file.type === "" || file.type === "application/octet-stream";
  return ALLOWED_MIME_TYPES.includes(file.type);
}
