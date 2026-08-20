import type { VirtualFile } from "@workbench/editable-snapshot-core";
import html2canvas from "html2canvas";

/** The viewport used by the two replay frames. Values are CSS pixels. */
export interface FidelityViewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface RgbaComparison {
  width: number;
  height: number;
  sizeMismatch: boolean;
  changedPixelRatio: number;
  meanAbsoluteError: number;
  maxChannelDelta: number;
  comparedPixels: number;
}

export interface FidelityReplayOptions {
  /** A document is accepted to make the function usable by an offscreen page. */
  document?: Document;
  timeoutMs?: number;
  /** A small settle period after load allows fonts/layout to finish. */
  settleMs?: number;
}

export interface FidelityReplayResult {
  faithful: Uint8Array;
  workspace: Uint8Array;
  warnings: string[];
  viewport: FidelityViewport;
}

export interface ReferenceRewriteResult {
  content: string;
  warnings: string[];
  rewrittenCount: number;
}

const EMPTY_DATA_URL = "data:,";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SETTLE_MS = 50;

function normalisePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function stripUrlDecoration(value: string): { path: string; suffix: string } {
  const hash = value.indexOf("#");
  const query = value.indexOf("?");
  let cut = value.length;
  if (hash >= 0) cut = Math.min(cut, hash);
  if (query >= 0) cut = Math.min(cut, query);
  return { path: value.slice(0, cut), suffix: value.slice(cut) };
}

function isRemoteReference(value: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
}

function fileMap(files: VirtualFile[]): Map<string, VirtualFile> {
  const map = new Map<string, VirtualFile>();
  for (const file of files) {
    const key = normalisePath(file.path);
    map.set(key, file);
    map.set(`/${key}`, file);
  }
  return map;
}

function resolveLocalFile(reference: string, basePath: string, files: Map<string, VirtualFile>): { file?: VirtualFile; suffix: string } {
  const trimmed = reference.trim();
  const { path, suffix } = stripUrlDecoration(trimmed);
  if (!path || isRemoteReference(path) || path.startsWith("#")) return { suffix };
  const candidates = path.startsWith("/")
    ? [normalisePath(path)]
    : [normalisePath(`${dirname(basePath)}/${path}`), normalisePath(path)];
  for (const candidate of candidates) {
    const file = files.get(candidate) ?? files.get(`/${candidate}`);
    if (file) return { file, suffix };
  }
  return { suffix };
}

function bytesToBase64(bytes: Uint8Array): string {
  // Do not spread a large capture into String.fromCharCode: faithful captures
  // can be tens of megabytes and the argument limit is implementation-defined.
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    let chunkString = "";
    for (let index = 0; index < chunk.length; index += 1) chunkString += String.fromCharCode(chunk[index]);
    binary += chunkString;
  }
  return btoa(binary);
}

/** Converts a virtual file into a browser-loadable, self-contained data URL. */
export function virtualFileToDataUrl(file: VirtualFile): string {
  return `data:${file.mediaType || "application/octet-stream"};base64,${bytesToBase64(file.content)}`;
}

function materializeReferencedFile(file: VirtualFile, files: Map<string, VirtualFile>, warnings: string[], count: { value: number }, seen: Set<string>): string {
  const key = normalisePath(file.path);
  if (seen.has(key)) return virtualFileToDataUrl(file);
  seen.add(key);
  let content: string | undefined;
  if (/css/i.test(file.mediaType) || /\.css$/i.test(file.path)) {
    content = rewriteCss(textContent(file), key, files, warnings, count, seen);
  } else if (/html/i.test(file.mediaType) || /\.html?$/i.test(file.path)) {
    const nested = rewriteVirtualFileReferencesDetailed(textContent(file), [...files.values()], key);
    content = addOfflineCsp(nested.content);
    warnings.push(...nested.warnings);
    count.value += nested.rewrittenCount;
  }
  seen.delete(key);
  return content === undefined
    ? virtualFileToDataUrl(file)
    : `data:${file.mediaType || "text/plain"};base64,${bytesToBase64(new TextEncoder().encode(content))}`;
}

function rewriteCss(css: string, basePath: string, files: Map<string, VirtualFile>, warnings: string[], count: { value: number }, seen = new Set<string>()): string {
  return css.replace(/url\(\s*(['"]?)([^'"\)]*?)\1\s*\)/gi, (whole, quote: string, rawReference: string) => {
    const reference = rawReference.trim();
    if (!reference || reference.startsWith("data:") || reference.startsWith("#")) return whole;
    const resolved = resolveLocalFile(reference, basePath, files);
    if (!resolved.file) {
      if (isRemoteReference(reference)) warnings.push(`blocked external CSS resource: ${reference}`);
      return isRemoteReference(reference) ? `url(${EMPTY_DATA_URL})` : whole;
    }
    count.value += 1;
    return `url(${materializeReferencedFile(resolved.file, files, warnings, count, seen)}${resolved.suffix})`;
  });
}

function rewriteSrcset(value: string, basePath: string, files: Map<string, VirtualFile>, warnings: string[], count: { value: number }): string {
  return value.split(",").map((candidate) => {
    const match = candidate.trim().match(/^(\S+)(\s+.*)?$/);
    if (!match) return candidate;
    const resolved = resolveLocalFile(match[1], basePath, files);
    if (!resolved.file) {
      if (isRemoteReference(match[1])) warnings.push(`blocked external srcset resource: ${match[1]}`);
      return candidate;
    }
    count.value += 1;
    return `${materializeReferencedFile(resolved.file, files, warnings, count, new Set())}${resolved.suffix}${match[2] ?? ""}`;
  }).join(",");
}

/**
 * Rewrites references in an HTML/CSS virtual file to data URLs.
 *
 * This deliberately has no DOM dependency: it is also used by tests and by
 * the offscreen document before an iframe has finished creating its DOM.
 */
export function rewriteVirtualFileReferencesDetailed(source: string, filesInput: VirtualFile[], basePath: string): ReferenceRewriteResult {
  const files = fileMap(filesInput);
  const warnings: string[] = [];
  const count = { value: 0 };
  let content = rewriteCss(source, basePath, files, warnings, count);

  // Inline style blocks and style attributes need the CSS base path of the
  // containing document. This also handles CSS url(...) in HTML attributes.
  content = content.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_whole, open: string, css: string, close: string) =>
    `${open}${rewriteCss(css, basePath, files, warnings, count)}${close}`,
  );
  content = content.replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (_whole, prefix: string, quote: string, css: string) =>
    `${prefix}${quote}${rewriteCss(css, basePath, files, warnings, count)}${quote}`,
  );

  content = content.replace(/(\b(?:srcset|imagesrcset)\s*=\s*)(["'])([\s\S]*?)\2/gi, (_whole, prefix: string, quote: string, value: string) =>
    `${prefix}${quote}${rewriteSrcset(value, basePath, files, warnings, count)}${quote}`,
  );
  content = content.replace(/(\b(?:src|href|poster|data|background|action|formaction)\s*=\s*)(["'])([\s\S]*?)\2/gi, (_whole, prefix: string, quote: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("data:") || /^javascript:/i.test(trimmed)) return `${prefix}${quote}${value}${quote}`;
    const resolved = resolveLocalFile(trimmed, basePath, files);
    if (!resolved.file) {
      if (isRemoteReference(trimmed)) warnings.push(`blocked external document resource: ${trimmed}`);
      // A remote URL must not survive into an offline replay. Keep navigational
      // links inert; broken media uses an empty data URL.
      const replacement = /^(?:href|action)\s*=/i.test(prefix) ? "#" : EMPTY_DATA_URL;
      return `${prefix}${quote}${replacement}${quote}`;
    }
    count.value += 1;
    return `${prefix}${quote}${materializeReferencedFile(resolved.file, files, warnings, count, new Set())}${resolved.suffix}${quote}`;
  });
  return { content, warnings: [...new Set(warnings)], rewrittenCount: count.value };
}

/** Short form for callers that only need the rewritten source. */
export function rewriteVirtualFileReferences(source: string, files: VirtualFile[], basePath: string): string {
  return rewriteVirtualFileReferencesDetailed(source, files, basePath).content;
}

function textContent(file: VirtualFile): string {
  return new TextDecoder().decode(file.content);
}

function addOfflineCsp(html: string): string {
  const csp = "default-src 'none'; img-src data: blob:; style-src data: blob: 'unsafe-inline'; font-src data: blob:; media-src data: blob:; frame-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; script-src 'none'; worker-src 'none'";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (match) => `${match}${meta}`);
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFrame(frame: HTMLIFrameElement, timeoutMs: number, settleMs: number, warnings: string[]): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve();
    };
    frame.addEventListener("load", finish, { once: true });
    timeoutHandle = setTimeout(() => {
      warnings.push("fidelity replay load timed out; captured the current frame");
      finish();
    }, timeoutMs);
  });
  await wait(settleMs);
  const doc = frame.contentDocument;
  if (!doc) {
    warnings.push("fidelity replay produced no document");
    return;
  }
  const images = Array.from(doc.images);
  await Promise.all(images.filter((image) => !image.complete).map((image) => new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
  try {
    await doc.fonts?.ready;
  } catch {
    warnings.push("font readiness could not be observed");
  }
}

async function frameToPng(frame: HTMLIFrameElement, viewport: FidelityViewport): Promise<Uint8Array> {
  const scale = Math.max(0.01, viewport.deviceScaleFactor ?? 1);
  const frameDocument = frame.contentDocument;
  if (!frameDocument) throw new Error("fidelity replay frame document is unavailable");
  // Drawing an SVG foreignObject that contains HTML makes Chrome's canvas
  // origin-unclean even when every asset is a local data URL. html2canvas's
  // DOM/CSS renderer avoids that browser security boundary. It remains an
  // approximation, so the report names the renderer and never treats the PNG
  // as proof of interaction equivalence.
  const canvas = await html2canvas(frameDocument.documentElement, {
    backgroundColor: "#ffffff",
    width: viewport.width,
    height: viewport.height,
    windowWidth: viewport.width,
    windowHeight: viewport.height,
    scale,
    useCORS: false,
    allowTaint: false,
    foreignObjectRendering: false,
    logging: false,
    removeContainer: true,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("could not encode fidelity PNG");
  return new Uint8Array(await blob.arrayBuffer());
}

async function renderOne(file: VirtualFile, files: VirtualFile[], basePath: string, viewport: FidelityViewport, doc: Document, options: Required<Pick<FidelityReplayOptions, "timeoutMs" | "settleMs">>, warnings: string[]): Promise<Uint8Array> {
  const rewritten = rewriteVirtualFileReferencesDetailed(textContent(file), files, basePath);
  warnings.push(...rewritten.warnings.map((warning) => `${basePath}: ${warning}`));
  const html = addOfflineCsp(rewritten.content);
  const frame = doc.createElement("iframe");
  // Keep the iframe same-origin with the offscreen document so its laid-out
  // DOM can be serialized for rasterisation. No `allow-scripts` token is ever
  // granted; CSP also supplies a second, independent script-src `none` gate.
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.referrerPolicy = "no-referrer";
  Object.assign(frame.style, {
    position: "fixed", left: "-100000px", top: "0", width: `${viewport.width}px`, height: `${viewport.height}px`,
    border: "0", visibility: "hidden", pointerEvents: "none",
  });
  const htmlUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  frame.src = htmlUrl;
  doc.body.appendChild(frame);
  try {
    await waitForFrame(frame, options.timeoutMs, options.settleMs, warnings);
    return await frameToPng(frame, viewport);
  } finally {
    URL.revokeObjectURL(htmlUrl);
    frame.remove();
  }
}

/** Replay both bundle entries in hidden, script-disabled, offline iframes. */
export async function renderFidelity(files: VirtualFile[], viewport: FidelityViewport, options: FidelityReplayOptions = {}): Promise<FidelityReplayResult> {
  const doc = options.document ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc?.body) throw new Error("renderFidelity must run in a browser document");
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new Error("fidelity viewport must have positive width and height");
  }
  const map = fileMap(files);
  const faithfulFile = map.get("faithful/snapshot.html");
  const workspaceFile = map.get("workspace/index.html");
  if (!faithfulFile || !workspaceFile) throw new Error("bundle must contain faithful/snapshot.html and workspace/index.html");
  const warnings: string[] = [];
  const defaults = { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, settleMs: options.settleMs ?? DEFAULT_SETTLE_MS };
  const faithful = await renderOne(faithfulFile, files, "faithful/snapshot.html", viewport, doc, defaults, warnings);
  const workspace = await renderOne(workspaceFile, files, "workspace/index.html", viewport, doc, defaults, warnings);
  return { faithful, workspace, warnings: [...new Set(warnings)], viewport };
}

/** Alias used by callers that describe the operation as a pair render. */
export const renderFidelityPair = renderFidelity;

/** Compare two tightly-packed RGBA byte arrays. */
export function compareRgba(left: Uint8Array, right: Uint8Array, width: number, height: number): RgbaComparison {
  const validDimensions = Number.isInteger(width) && Number.isInteger(height) && width >= 0 && height >= 0;
  const expectedLength = validDimensions ? width * height * 4 : -1;
  const sizeMismatch = !validDimensions || left.length !== right.length || left.length !== expectedLength || right.length !== expectedLength;
  const comparedPixels = validDimensions ? Math.min(left.length, right.length, expectedLength) - (Math.min(left.length, right.length, expectedLength) % 4) : 0;
  const pixelCount = comparedPixels / 4;
  let changedPixels = 0;
  let totalDelta = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < comparedPixels; index += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(left[index + channel] - right[index + channel]);
      totalDelta += delta;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
      if (delta !== 0) changed = true;
    }
    if (changed) changedPixels += 1;
  }
  return {
    width, height, sizeMismatch,
    changedPixelRatio: pixelCount ? changedPixels / pixelCount : 0,
    meanAbsoluteError: comparedPixels ? totalDelta / comparedPixels : 0,
    maxChannelDelta,
    comparedPixels: pixelCount,
  };
}
