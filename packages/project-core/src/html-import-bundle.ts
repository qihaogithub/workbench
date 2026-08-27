import crypto from "node:crypto";
import path from "node:path";
import yauzl from "yauzl";

export const HTML_IMPORT_BUNDLE_MAX_FILES = 256;
export const HTML_IMPORT_BUNDLE_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const HTML_IMPORT_BUNDLE_MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface HtmlImportBundleFile {
  path: string;
  content: Buffer;
}

export interface HtmlImportBundleAsset {
  ref: string;
  sourcePath: string;
  content: Buffer;
  contentType: string;
}

export interface HtmlImportBundleResult {
  entryPath: string;
  html: string;
  assets: HtmlImportBundleAsset[];
}

function readZipEntry(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new Error("HTML_IMPORT_BUNDLE_ZIP_INVALID"));
      const chunks: Buffer[] = [];
      let length = 0;
      stream.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > HTML_IMPORT_BUNDLE_MAX_FILE_BYTES) {
          stream.destroy(new Error("HTML_IMPORT_BUNDLE_FILE_INVALID"));
          return;
        }
        chunks.push(chunk);
      });
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

/** Read a ZIP without extracting it to disk. Network input is never accepted here. */
export function readHtmlImportZipBundle(zip: Buffer): Promise<HtmlImportBundleResult> {
  if (zip.length === 0 || zip.length > HTML_IMPORT_BUNDLE_MAX_TOTAL_BYTES)
    return Promise.reject(new Error("HTML_IMPORT_BUNDLE_TOO_LARGE"));
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zip, { lazyEntries: true, validateEntrySizes: true }, (openError, zipfile) => {
      if (openError || !zipfile) return reject(openError ?? new Error("HTML_IMPORT_BUNDLE_ZIP_INVALID"));
      const files: HtmlImportBundleFile[] = [];
      let totalDeclared = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(error);
      };
      zipfile.on("error", fail);
      zipfile.on("entry", async (entry: yauzl.Entry) => {
        if (settled) return;
        if (/\/$/.test(entry.fileName)) return zipfile.readEntry();
        if ((entry.generalPurposeBitFlag & 0x1) !== 0 || files.length >= HTML_IMPORT_BUNDLE_MAX_FILES)
          return fail(new Error("HTML_IMPORT_BUNDLE_FILE_INVALID"));
        totalDeclared += entry.uncompressedSize;
        if (entry.uncompressedSize > HTML_IMPORT_BUNDLE_MAX_FILE_BYTES || totalDeclared > HTML_IMPORT_BUNDLE_MAX_TOTAL_BYTES)
          return fail(new Error("HTML_IMPORT_BUNDLE_TOO_LARGE"));
        try {
          files.push({ path: entry.fileName, content: await readZipEntry(zipfile, entry) });
          zipfile.readEntry();
        } catch (error) {
          fail(error instanceof Error ? error : new Error("HTML_IMPORT_BUNDLE_ZIP_INVALID"));
        }
      });
      zipfile.once("end", () => {
        if (settled) return;
        settled = true;
        try { resolve(normalizeHtmlImportBundle(files)); }
        catch (error) { reject(error); }
      });
      zipfile.readEntry();
    });
  });
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css", ".gif": "image/gif", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
  ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff": "font/woff",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
};

function safeBundlePath(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  const pieces = normalized.split("/");
  if (pieces.some((piece) => !piece || piece === "." || piece === "..")) return null;
  return normalized;
}

function contentType(filePath: string): string {
  return EXTENSION_CONTENT_TYPES[path.posix.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function dataUrl(asset: HtmlImportBundleAsset): string {
  return `data:${asset.contentType};base64,${asset.content.toString("base64")}`;
}

/**
 * Validates already-extracted, user-provided local bundle files and inlines
 * relative resources. ZIP parsing intentionally lives at the boundary layer;
 * this pure function is the one shared policy for ZIP and folder uploads.
 */
export function normalizeHtmlImportBundle(files: HtmlImportBundleFile[]): HtmlImportBundleResult {
  if (files.length === 0 || files.length > HTML_IMPORT_BUNDLE_MAX_FILES)
    throw new Error("HTML_IMPORT_BUNDLE_FILE_COUNT_INVALID");
  let total = 0;
  const byPath = new Map<string, Buffer>();
  for (const file of files) {
    const normalized = safeBundlePath(file.path);
    if (!normalized || !Buffer.isBuffer(file.content) || file.content.length > HTML_IMPORT_BUNDLE_MAX_FILE_BYTES || byPath.has(normalized))
      throw new Error("HTML_IMPORT_BUNDLE_FILE_INVALID");
    total += file.content.length;
    if (total > HTML_IMPORT_BUNDLE_MAX_TOTAL_BYTES) throw new Error("HTML_IMPORT_BUNDLE_TOO_LARGE");
    byPath.set(normalized, file.content);
  }
  const entries = [...byPath.keys()].filter((entry) => /(^|\/)index\.html?$/i.test(entry));
  if (entries.length !== 1) throw new Error("HTML_IMPORT_BUNDLE_ENTRY_INVALID");
  const entryPath = entries[0];
  const html = byPath.get(entryPath)!.toString("utf8");
  if (!Buffer.from(html, "utf8").equals(byPath.get(entryPath)!)) throw new Error("HTML_IMPORT_BUNDLE_ENTRY_INVALID");

  const baseDir = path.posix.dirname(entryPath);
  const assets: HtmlImportBundleAsset[] = [];
  const replacement = new Map<string, string>();
  for (const [sourcePath, content] of byPath) {
    if (sourcePath === entryPath) continue;
    const relative = path.posix.relative(baseDir, sourcePath);
    if (relative.startsWith("../")) continue;
    const ref = crypto.createHash("sha256").update(content).digest("hex");
    const asset = { ref, sourcePath, content, contentType: contentType(sourcePath) };
    assets.push(asset);
    replacement.set(relative, dataUrl(asset));
    replacement.set(`./${relative}`, dataUrl(asset));
  }
  const rewritten = html.replace(/((?:src|href|poster)\s*=\s*["'])([^"'#?]+)(["'])/gi, (all, prefix: string, value: string, suffix: string) =>
    replacement.has(value) ? `${prefix}${replacement.get(value)}${suffix}` : all,
  ).replace(/url\(\s*(["']?)([^"')#?]+)\1\s*\)/gi, (all, quote: string, value: string) =>
    replacement.has(value) ? `url(${quote}${replacement.get(value)}${quote})` : all,
  );
  return { entryPath, html: rewritten, assets };
}
