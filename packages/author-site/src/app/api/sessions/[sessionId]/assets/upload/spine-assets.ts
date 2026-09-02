import crypto from "node:crypto";
import path from "node:path";
import yauzl from "yauzl";
import type { SpineAssetManifestV1, SpineAssetRefV1 } from "@workbench/shared";

export const SPINE_ASSET_MAX_ZIP_SIZE = 50 * 1024 * 1024;
export const SPINE_ASSET_MAX_ENTRIES = 512;
export const SPINE_ASSET_MAX_FILE_SIZE = 64 * 1024 * 1024;
export const SPINE_ASSET_MAX_TOTAL_SIZE = 200 * 1024 * 1024;
function isAllowedSpineFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".json") || lower.endsWith(".skel") ||
    lower.endsWith(".skel.bytes") || lower.endsWith(".atlas") ||
    lower.endsWith(".atlas.txt") || /\.(png|jpe?g|webp)$/.test(lower) ||
    /\.(mp3|ogg|wav|m4a)$/.test(lower);
}
function isIgnorablePackageMetadata(name: string): boolean {
  const normalized = name.replaceAll("\\", "/");
  return normalized.startsWith("__MACOSX/")
    || normalized.split("/").some((segment) => segment === ".DS_Store" || segment.startsWith("._"));
}
function isAudio(name: string): boolean { return /\.(mp3|ogg|wav|m4a)$/i.test(name); }
export interface PreparedSpineAsset {
  ref: SpineAssetRefV1;
  manifest: SpineAssetManifestV1;
  /** Validated bytes remain outside the workspace until Authority commits them. */
  files: Array<{ path: string; content: Buffer; sha256: string }>;
  summary: { originalName: string; spineVersion: string; textureCount: number; animations: string[] };
}

function skeleton(name: string) { const n = name.toLowerCase(); return n.endsWith(".json") || n.endsWith(".skel") || n.endsWith(".skel.bytes"); }
function atlas(name: string) { const n = name.toLowerCase(); return n.endsWith(".atlas") || n.endsWith(".atlas.txt"); }
function stem(name: string) { return path.basename(name).toLowerCase().replace(/\.skel\.bytes$|\.skel$|\.atlas\.txt$|\.atlas$|\.json$/, ""); }
function atlasPages(text: string): string[] {
  const result: string[] = [];
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const first = block.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (first && /\.(png|jpe?g|webp)$/i.test(first)) result.push(first);
  }
  return result;
}
function animationNames(data: Buffer): string[] | undefined {
  try {
    const parsed = JSON.parse(data.toString("utf8")) as { animations?: Record<string, unknown> };
    return parsed.animations && typeof parsed.animations === "object" ? Object.keys(parsed.animations) : [];
  } catch { return undefined; }
}
function safeEntryName(name: string): string {
  if (!name || name.length > 512 || name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(name)) throw new Error("INVALID_ZIP_PATH");
  const normalized = path.posix.normalize(name.replaceAll("\\", "/"));
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || normalized.includes("\0")) throw new Error("INVALID_ZIP_PATH");
  if (normalized.split("/").length > 16) throw new Error("ZIP_PATH_TOO_DEEP");
  return normalized;
}

function isSymbolicLink(entry: yauzl.Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

function audioKeys(filePath: string): string[] {
  const normalized = filePath.replaceAll("\\", "/");
  const noExtension = normalized.replace(/\.(mp3|ogg|wav|m4a)$/i, "");
  const base = path.posix.basename(normalized);
  const baseNoExtension = path.posix.basename(noExtension);
  return [...new Set([normalized, `./${normalized}`, noExtension, `./${noExtension}`, base, baseNoExtension])];
}

/** Validates a Spine archive. It deliberately does not write into the workspace. */
export async function prepareSpineAsset(buffer: Buffer, originalName: string): Promise<PreparedSpineAsset> {
  if (buffer.length > SPINE_ASSET_MAX_ZIP_SIZE) throw new Error("ZIP_TOO_LARGE");
  const entries = new Map<string, Buffer>();
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true }, (err, zip) => {
      if (err || !zip) return reject(new Error("INVALID_ZIP"));
      let total = 0;
      let declaredTotal = 0;
      let count = 0;
      const targetPaths = new Set<string>();
      zip.readEntry();
      zip.on("entry", (entry) => {
        try {
          if (++count > SPINE_ASSET_MAX_ENTRIES) throw new Error("TOO_MANY_ZIP_ENTRIES");
          const name = safeEntryName(entry.fileName);
          if (/\/$/.test(name)) { zip.readEntry(); return; }
          if (isSymbolicLink(entry)) throw new Error("SYMLINK_ZIP_ENTRY");
          const folded = name.toLowerCase();
          if (targetPaths.has(folded)) throw new Error("DUPLICATE_ZIP_PATH");
          targetPaths.add(folded);
          if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 100) throw new Error("ZIP_COMPRESSION_RATIO_TOO_HIGH");
          if (entry.uncompressedSize > SPINE_ASSET_MAX_FILE_SIZE || declaredTotal + entry.uncompressedSize > SPINE_ASSET_MAX_TOTAL_SIZE) throw new Error("ZIP_UNCOMPRESSED_TOO_LARGE");
          declaredTotal += entry.uncompressedSize;
          if (isIgnorablePackageMetadata(name)) { zip.readEntry(); return; }
          if (!isAllowedSpineFile(name)) throw new Error("UNSUPPORTED_SPINE_FILE");
          zip.openReadStream(entry, (streamErr, stream) => {
            if (streamErr || !stream) return reject(new Error("INVALID_ZIP_ENTRY"));
            const chunks: Buffer[] = []; let size = 0;
            stream.on("data", (chunk: Buffer) => { size += chunk.length; if (size > SPINE_ASSET_MAX_FILE_SIZE) stream.destroy(new Error("ZIP_FILE_TOO_LARGE")); else chunks.push(chunk); });
            stream.on("error", reject);
            stream.on("end", () => { total += size; entries.set(name, Buffer.concat(chunks)); zip.readEntry(); });
          });
        } catch (e) { reject(e); }
      });
      zip.on("end", resolve); zip.on("error", reject);
    });
  });
  const skeletons = [...entries.keys()].filter(skeleton);
  const atlases = [...entries.keys()].filter(atlas);
  if (!skeletons.length || !atlases.length) throw new Error("SPINE_FILES_MISSING");
  let selected: { skeleton: string; atlas: string; textures: string[]; score: number } | undefined;
  for (const s of skeletons) for (const a of atlases) {
    const refs = atlasPages(entries.get(a)!.toString("utf8"));
    const byBase = new Map([...entries.keys()].map((k) => [path.basename(k).toLowerCase(), k]));
    const textures = refs.map((ref) => byBase.get(path.basename(ref).toLowerCase())).filter((v): v is string => !!v);
    if (!textures.length || textures.length !== refs.length) continue;
    const score = (stem(s) === stem(a) ? 2 : stem(a).startsWith(stem(s)) || stem(s).startsWith(stem(a)) ? 1 : 0);
    if (!selected || score > selected.score) selected = { skeleton: s, atlas: a, textures, score };
  }
  if (!selected) throw new Error("SPINE_ATLAS_TEXTURE_MISSING");
  const skeletonData = entries.get(selected.skeleton)!;
  const versionText = (() => {
    const json = skeletonData.toString("utf8").match(/"spine"\s*:\s*"(4\.[23])/i)?.[1];
    if (json) return json;
    if (!skeletons.find((name) => name === selected!.skeleton)?.toLowerCase().endsWith(".json")) {
      const length = skeletonData[8];
      if (length > 0 && length < 64) {
        const binary = skeletonData.subarray(9, 9 + length).toString("utf8").match(/^(4\.[23])/);
        if (binary) return binary[1];
      }
    }
    return undefined;
  })();
  if (versionText !== "4.2" && versionText !== "4.3") throw new Error("UNSUPPORTED_SPINE_VERSION");
  // Audio tracks are retained with the visual dependency set.  They are not
  // yet played by SpinePlayer, but must survive import for event support and
  // future runtimes instead of making a valid export fail validation.
  const paths = [...new Set([selected.skeleton, selected.atlas, ...selected.textures, ...[...entries.keys()].filter(isAudio)])].sort();
  const sourceHash = crypto.createHash("sha256").update(Buffer.concat(paths.map((p) => Buffer.concat([Buffer.from(p), entries.get(p)!])))).digest("hex");
  const assetId = `spine_${sourceHash}` as `spine_${string}`;
  const files = paths.map((p) => ({ path: p, size: entries.get(p)!.length, sha256: crypto.createHash("sha256").update(entries.get(p)!).digest("hex") }));
  const audio = files.filter((file) => isAudio(file.path)).map((file) => ({ ...file, keys: audioKeys(file.path) }));
  const manifest: SpineAssetManifestV1 = { schemaVersion: 1, kind: "spine", assetId, sourceHash, originalName, spineVersion: versionText, skeleton: selected.skeleton, atlas: selected.atlas, textures: selected.textures, audio, animations: animationNames(skeletonData), files };
  return {
    ref: { kind: "spine", version: 1, assetId },
    manifest,
    files: paths.map((filePath) => ({ filePath, path: filePath, content: entries.get(filePath)!, sha256: crypto.createHash("sha256").update(entries.get(filePath)!).digest("hex") })),
    summary: { originalName, spineVersion: versionText, textureCount: selected.textures.length, animations: manifest.animations ?? [] },
  };
}
