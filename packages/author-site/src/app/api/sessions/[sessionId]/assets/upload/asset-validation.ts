const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"];
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".svga", ".lottie", ".riv", ".json", ".skel", ".atlas", ".zip", ".mp4", ".webm"]);
const OCTET_STREAM_EXTENSIONS = new Set([".svga", ".lottie", ".riv", ".skel", ".atlas"]);
const ZIP_MIME_TYPES = new Set(["", "application/octet-stream", "application/zip", "application/x-zip-compressed", "application/x-compressed"]);

export function getFileExtension(filename: string): string { const dot = filename.lastIndexOf("."); return dot < 0 ? "" : filename.slice(dot).toLowerCase(); }
export function hasAllowedAssetExtension(filename: string): boolean { return ALLOWED_EXTENSIONS.has(getFileExtension(filename)); }
function hasExpectedVideoContainer(buffer: Buffer, extension: string): boolean {
  return extension === ".mp4" ? buffer.length >= 8 && buffer.subarray(4, 8).toString("ascii") === "ftyp"
    : extension === ".webm" ? buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) : false;
}
export function isAllowedAssetFile(file: File, buffer?: Buffer): boolean {
  const extension = getFileExtension(file.name);
  if (!hasAllowedAssetExtension(file.name)) return false;
  if (extension === ".json") return file.type === "" || file.type === "application/json";
  if (extension === ".zip") return ZIP_MIME_TYPES.has(file.type);
  if (extension === ".mp4" || extension === ".webm") return buffer ? hasExpectedVideoContainer(buffer, extension) : ALLOWED_VIDEO_MIME_TYPES.includes(file.type);
  if (OCTET_STREAM_EXTENSIONS.has(extension)) return file.type === "" || file.type === "application/octet-stream";
  return ALLOWED_MIME_TYPES.includes(file.type);
}
