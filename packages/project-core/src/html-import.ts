import fs from "node:fs";
import path from "node:path";
import { parse, serialize } from "parse5";

import {
  HTML_IMPORT_ANALYSIS_VERSION,
  HTML_IMPORT_MAX_DATA_URL_BYTES,
  HTML_IMPORT_MAX_INPUT_BYTES,
  HTML_IMPORT_MAX_TOTAL_DATA_URL_BYTES,
  hashHtmlImportSource,
  sortHtmlImportAnalysisCollections,
  type HtmlImportAnalysis,
  type HtmlImportRejectionCode,
  type HtmlImportResourceClassification,
  type HtmlImportSignal,
  type HtmlResourceReference,
  type HtmlUnsupportedCapability,
} from "./html-import-contract.js";
import { MAX_PROTOTYPE_CSS_LENGTH } from "./constants.js";

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
}

export interface HtmlImportNormalization {
  analysis: HtmlImportAnalysis;
  /** Canonical HTML suitable for the prototype runtime or the future sandbox. */
  normalizedHtml?: string;
  normalizedHash?: string;
}

export class HtmlImportError extends Error {
  readonly code: HtmlImportRejectionCode;
  readonly reasonCodes: string[];
  constructor(code: HtmlImportRejectionCode, message: string = code, reasonCodes: string[] = []) { super(message); this.name = "HtmlImportError"; this.code = code; this.reasonCodes = [...reasonCodes]; }
}

export interface HtmlImportPrototypeGateResult { ok: boolean; reasonCodes: string[]; }
export function validateHtmlImportPrototypeCandidate(html: string, css: string): HtmlImportPrototypeGateResult {
  const reasonCodes: string[] = [];
  if (!html.trim()) reasonCodes.push("PROTOTYPE_HTML_EMPTY");
  if (css.length > MAX_PROTOTYPE_CSS_LENGTH) reasonCodes.push("PROTOTYPE_CSS_TOO_LARGE");
  if (/<\s*script\b/i.test(html)) reasonCodes.push("PROTOTYPE_SCRIPT_FORBIDDEN");
  if (/\son[a-z]+\s*=/i.test(html)) reasonCodes.push("PROTOTYPE_INLINE_EVENT_FORBIDDEN");
  if (/javascript\s*:/i.test(html) || /javascript\s*:/i.test(css)) reasonCodes.push("PROTOTYPE_JAVASCRIPT_URL_FORBIDDEN");
  if (/<\s*(iframe|embed|object)\b/i.test(html)) reasonCodes.push("PROTOTYPE_EMBED_FORBIDDEN");
  if (/<\s*form\b[^>]*\baction\s*=/i.test(html) || /<\s*form\b[^>]*\bmethod\s*=\s*["']?post\b/i.test(html) || /<(?:button|input)\b[^>]*\btype\s*=\s*["']?(?:submit|image)\b/i.test(html)) reasonCodes.push("PROTOTYPE_FORM_ACTION_FORBIDDEN");
  if (/@import\b/i.test(css)) reasonCodes.push("PROTOTYPE_CSS_IMPORT_FORBIDDEN");
  if (/(^|[,{;]\s*)(html|body|:root)\b/i.test(css)) reasonCodes.push("PROTOTYPE_GLOBAL_SELECTOR_FORBIDDEN");
  return { ok: reasonCodes.length === 0, reasonCodes };
}

const EXECUTABLE_TYPES = new Set(["", "application/ecmascript", "application/javascript", "text/ecmascript", "text/javascript", "module"]);
const URL_ATTRIBUTES = new Set(["action", "data", "formaction", "href", "poster", "src", "xlink:href", "srcset", "imagesrcset"]);
const EMBEDS = new Set(["embed", "iframe", "object"]);
const DATA_SCRIPT_TYPES = /^(?:application|text)\/(?:ld\+json|json|json5|applicationmanifest\+json|sql|graphql)$/i;

function classify(value: string): HtmlImportResourceClassification {
  const v = value.trim().toLowerCase();
  if (v.startsWith("#")) return "fragment";
  if (v.startsWith("data:")) return "data";
  if (v.startsWith("blob:")) return "blob";
  if (v.startsWith("javascript:")) return "javascript";
  if (/^(https?:)?\/\//.test(v)) return "remote";
  if (/^[a-z][a-z\d+.-]*:/i.test(v)) return "other";
  return "relative";
}

function dataBytes(value: string): number {
  const comma = value.indexOf(",");
  if (comma < 0) return Buffer.byteLength(value, "utf8");
  const header = value.slice(0, comma).toLowerCase();
  const payload = value.slice(comma + 1);
  if (header.endsWith(";base64")) {
    try { return Buffer.from(payload, "base64").byteLength; } catch { return Buffer.byteLength(payload, "utf8"); }
  }
  try { return Buffer.byteLength(decodeURIComponent(payload), "utf8"); } catch { return Buffer.byteLength(payload, "utf8"); }
}

function text(node: HtmlNode): string {
  return node.nodeName === "#text" ? node.value ?? "" : (node.childNodes ?? []).map(text).join("");
}

function nodePath(parent: string, node: HtmlNode, index: number): string {
  return `${parent}/${node.tagName ?? node.nodeName}[${index}]`;
}

function positivePixels(value: string | undefined): number | undefined {
  const number = value ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

/** Keep the dimensions emitted by the existing Figma HTML importer. */
function detectFigmaViewport(source: string): { width: number; height: number } | undefined {
  const css = source.match(/\.figma-export\s*\{[^}]*?width\s*:\s*([\d.]+)px\s*;?[^}]*?height\s*:\s*([\d.]+)px\s*;?[^}]*?\}/i);
  const inline = source.match(/<[^>]+(?:data-layer|class=["'][^"']*figma-export)[^>]*style=["'][^"']*?width\s*:\s*([\d.]+)px\s*;?[^"']*?height\s*:\s*([\d.]+)px/i);
  const match = css ?? inline;
  const width = positivePixels(match?.[1]);
  const height = positivePixels(match?.[2]);
  return width && height ? { width, height } : undefined;
}

function rejection(capabilities: HtmlUnsupportedCapability[]): HtmlImportRejectionCode {
  if (capabilities.some((x) => x.code === "embedded-browsing-context")) return "HTML_IMPORT_EMBED_UNSUPPORTED";
  if (capabilities.some((x) => ["external-script", "external-module-import", "relative-resource", "remote-resource", "base-url", "data-url-too-large", "css-external-resource"].includes(x.code))) return "HTML_IMPORT_EXTERNAL_RESOURCE_UNSUPPORTED";
  return "HTML_IMPORT_CAPABILITY_RESTRICTED";
}

function addCssReferences(css: string, pathName: string, resources: HtmlResourceReference[], capabilities: HtmlUnsupportedCapability[], tagName = "style"): number {
  let total = 0;
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"'\s)]+)|url\(\s*["']?([^"'\s)]+)/gi)) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (!value) continue;
    const classification = classify(value);
    resources.push({ tagName, attributeName: "css-url", value, classification, path: pathName });
    if (classification !== "fragment" && classification !== "data") capabilities.push({ code: "css-external-resource", path: pathName, detail: value });
    if (classification === "data") total += dataBytes(value);
    if (classification === "data" && dataBytes(value) > HTML_IMPORT_MAX_DATA_URL_BYTES) capabilities.push({ code: "data-url-too-large", path: pathName, detail: `${dataBytes(value)}` });
  }
  return total;
}

function canonicalize(node: HtmlNode, removeInertScripts: boolean): void {
  if (node.attrs) node.attrs.sort((a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value));
  if (node.childNodes) {
    node.childNodes = node.childNodes.filter((child) => {
      if (!removeInertScripts || child.tagName?.toLowerCase() !== "script") return true;
      const type = child.attrs?.find((a) => a.name.toLowerCase() === "type")?.value.trim().toLowerCase() ?? "";
      return EXECUTABLE_TYPES.has(type);
    });
    node.childNodes.forEach((child) => canonicalize(child, removeInertScripts));
  }
}

/** Deterministic, network-free HTML analysis and normalization. */
export function normalizeHtmlImport(source: string): HtmlImportNormalization {
  const sourceHash = hashHtmlImportSource(source);
  const empty = (outcome: HtmlImportAnalysis["outcome"]): HtmlImportNormalization => ({ analysis: { analysisVersion: HTML_IMPORT_ANALYSIS_VERSION, outcome, signals: [], unsupportedCapabilities: [], resourceReferences: [], warnings: [], sourceHash } });
  if (!source.trim()) return empty({ status: "rejected", code: "HTML_IMPORT_INVALID" });
  if (Buffer.byteLength(source, "utf8") > HTML_IMPORT_MAX_INPUT_BYTES) return empty({ status: "rejected", code: "HTML_IMPORT_TOO_LARGE" });
  let document: HtmlNode;
  try { document = parse(source) as unknown as HtmlNode; } catch { return empty({ status: "rejected", code: "HTML_IMPORT_INVALID" }); }

  const signals: HtmlImportSignal[] = [];
  const unsupportedCapabilities: HtmlUnsupportedCapability[] = [];
  const resourceReferences: HtmlResourceReference[] = [];
  let totalData = 0;
  let hasForm = false;
  let title: string | undefined;
  let viewport: { width: number; height: number } | undefined;
  const visit = (node: HtmlNode, parent: string, index: number): void => {
    const itemPath = nodePath(parent, node, index);
    const tag = node.tagName?.toLowerCase();
    const attrs = new Map((node.attrs ?? []).map((a) => [a.name.toLowerCase(), a.value]));
    if (tag === "title") title = text(node).trim() || undefined;
    if (tag === "meta" && attrs.get("name")?.toLowerCase() === "viewport") {
      const content = attrs.get("content") ?? "";
      const width = /(?:^|,)\s*width\s*=\s*(\d+)/i.exec(content)?.[1];
      const height = /(?:^|,)\s*height\s*=\s*(\d+)/i.exec(content)?.[1];
      if (width && height) viewport = { width: Number(width), height: Number(height) };
    }
    if (tag && EMBEDS.has(tag)) unsupportedCapabilities.push({ code: "embedded-browsing-context", path: itemPath, detail: tag });
    if (tag === "base") unsupportedCapabilities.push({ code: "base-url", path: itemPath });
    if (tag === "meta" && attrs.get("http-equiv")?.toLowerCase() === "refresh") unsupportedCapabilities.push({ code: "meta-refresh", path: itemPath });
    if (tag === "form") {
      hasForm = true;
      if (attrs.get("action")?.trim() || attrs.get("method")?.trim().toLowerCase() === "post") unsupportedCapabilities.push({ code: "form-submission", path: itemPath });
    }
    if (tag === "style") {
      const cssData = addCssReferences(text(node), itemPath, resourceReferences, unsupportedCapabilities);
      totalData += cssData;
    }
    if (tag === "script") {
      const type = (attrs.get("type") ?? "").trim().toLowerCase();
      const src = attrs.get("src")?.trim();
      const executable = EXECUTABLE_TYPES.has(type);
      if (src) {
        unsupportedCapabilities.push({ code: "external-script", path: itemPath, detail: src });
        if (classify(src) === "blob") unsupportedCapabilities.push({ code: "blob-script", path: itemPath });
      }
      if (executable) {
        signals.push({ code: type === "module" ? "inline-module-script" : "classic-script", path: itemPath });
        const body = text(node);
        if (type === "module" && /(?:^|[;\n])\s*(?:import\s*(?:\(|[\s{*])|export\s+[^;]*?\sfrom\s*)/m.test(body)) unsupportedCapabilities.push({ code: "external-module-import", path: itemPath });
        if (/\bnew\s+(?:Shared)?Worker\s*\(|\bnavigator\.serviceWorker\.register\s*\(/.test(body)) unsupportedCapabilities.push({ code: body.includes("serviceWorker") ? "service-worker" : "worker", path: itemPath });
        if (/\bwindow\.open\s*\(/.test(body)) unsupportedCapabilities.push({ code: "popup", path: itemPath });
      } else if (!src && (DATA_SCRIPT_TYPES.test(type) || type !== "")) signals.push({ code: "inert-data-script", path: itemPath, detail: type || "unspecified" });
    }
    if (tag) for (const [name, value] of attrs) {
      if (name.startsWith("on")) signals.push({ code: "event-handler-attribute", path: itemPath, detail: name });
      if (name === "style") totalData += addCssReferences(value, `${itemPath}/@style`, resourceReferences, unsupportedCapabilities, tag);
      if (name === "download") unsupportedCapabilities.push({ code: "download", path: itemPath });
      if (!URL_ATTRIBUTES.has(name) || !value.trim()) continue;
      const values = name.endsWith("srcset") ? value.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean) : [value];
      for (const current of values) {
        const classification = classify(current);
        resourceReferences.push({ tagName: tag, attributeName: name, value: current, classification, path: itemPath });
        if (name.endsWith("srcset")) signals.push({ code: "srcset-resource", path: itemPath, detail: name });
        if (classification === "javascript") signals.push({ code: "javascript-url", path: itemPath, detail: name });
        if (classification === "relative") unsupportedCapabilities.push({ code: "relative-resource", path: itemPath, detail: current });
        if (classification === "remote" || classification === "other" || classification === "blob") unsupportedCapabilities.push({ code: "remote-resource", path: itemPath, detail: current });
        if (classification === "data") { signals.push({ code: "data-url-resource", path: itemPath, detail: name }); totalData += dataBytes(current); if (dataBytes(current) > HTML_IMPORT_MAX_DATA_URL_BYTES) unsupportedCapabilities.push({ code: "data-url-too-large", path: itemPath, detail: `${dataBytes(current)}` }); }
      }
    }
    (node.childNodes ?? []).forEach((child, childIndex) => visit(child, itemPath, childIndex));
  };
  visit(document, "", 0);
  const interactive = signals.some((x) => ["classic-script", "inline-module-script", "event-handler-attribute", "javascript-url"].includes(x.code));
  if (hasForm && !interactive) unsupportedCapabilities.push({ code: "form-submission", path: "/html/body/form" });
  if (totalData > HTML_IMPORT_MAX_TOTAL_DATA_URL_BYTES) unsupportedCapabilities.push({ code: "data-url-too-large", path: "/", detail: `${totalData}` });
  const sorted = sortHtmlImportAnalysisCollections({ signals, unsupportedCapabilities, resourceReferences, warnings: [] });
  // A real meta viewport is authoritative; Figma dimensions are the legacy fallback.
  viewport ??= detectFigmaViewport(source);
  const outcome = sorted.unsupportedCapabilities.length ? { status: "rejected" as const, code: rejection(sorted.unsupportedCapabilities) } : { status: "accepted" as const, runtimeType: interactive ? "sandboxed-html" as const : "prototype-html-css" as const };
  canonicalize(document, !interactive);
  const normalizedHtml = serialize(document as never);
  return { analysis: { analysisVersion: HTML_IMPORT_ANALYSIS_VERSION, outcome, ...sorted, ...(title ? { detectedTitle: title } : {}), ...(viewport ? { detectedViewport: viewport } : {}), sourceHash }, normalizedHtml, normalizedHash: hashHtmlImportSource(normalizedHtml) };
}

export const analyzeHtmlImport = (source: string): HtmlImportAnalysis => normalizeHtmlImport(source).analysis;

export interface HtmlImportBranchStageInput { workspacePath: string; pageId: string; page: Record<string, unknown>; source: string; schema: string; css?: string; }
export interface HtmlImportBranchStage { analysis: HtmlImportAnalysis; normalizedHtml: string; stagingPath: string; commit(): void; discard(): void; }

/** Prepare a complete branch workspace copy. No target files are touched until commit(). */
export function stageHtmlImportBranch(input: HtmlImportBranchStageInput): HtmlImportBranchStage {
  if (!input.workspacePath || !fs.existsSync(input.workspacePath) || !fs.statSync(input.workspacePath).isDirectory()) throw new HtmlImportError("HTML_IMPORT_INVALID", "workspacePath 必须是存在的目录");
  if (!input.pageId || path.isAbsolute(input.pageId) || input.pageId !== path.basename(input.pageId) || input.pageId.includes("/") || input.pageId.includes("\\") || input.pageId === "." || input.pageId === "..") throw new HtmlImportError("HTML_IMPORT_INVALID", "pageId 必须是非空单段路径");
  if (!input.schema || typeof input.schema !== "string") throw new HtmlImportError("HTML_IMPORT_INVALID", "schema 必须是 JSON object");
  try { const schema = JSON.parse(input.schema) as unknown; if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error(); } catch { throw new HtmlImportError("HTML_IMPORT_INVALID", "schema 必须是合法 JSON object"); }
  const result = normalizeHtmlImport(input.source);
  if (result.analysis.outcome.status !== "accepted") throw new HtmlImportError(result.analysis.outcome.code);
  const runtimeType = result.analysis.outcome.runtimeType;
  const gate = runtimeType === "prototype-html-css"
    ? validateHtmlImportPrototypeCandidate(result.normalizedHtml ?? "", input.css ?? "")
    : { ok: true, reasonCodes: [] as string[] };
  if (!gate.ok) throw new HtmlImportError("HTML_IMPORT_CAPABILITY_RESTRICTED", `原型页校验失败: ${gate.reasonCodes.join(",")}`, gate.reasonCodes);
  const parent = path.dirname(input.workspacePath);
  const stagingPath = fs.mkdtempSync(path.join(parent, ".html-import-stage-"));
  try {
    fs.cpSync(input.workspacePath, stagingPath, { recursive: true });
    const treePath = path.join(stagingPath, "workspace-tree.json");
    const tree = fs.existsSync(treePath) ? JSON.parse(fs.readFileSync(treePath, "utf8")) as { pages?: Array<Record<string, unknown>>; folders?: unknown[] } : { pages: [], folders: [] };
    if ((tree.pages ?? []).some((page) => page.id === input.pageId) || fs.existsSync(path.join(input.workspacePath, "demos", input.pageId))) throw new HtmlImportError("HTML_IMPORT_INVALID", `页面 id 已存在: ${input.pageId}`);
    const pageDir = path.join(stagingPath, "demos", input.pageId);
    fs.mkdirSync(pageDir, { recursive: true });
    const sourceFile = runtimeType === "sandboxed-html" ? "sandbox.html" : "prototype.html";
    fs.writeFileSync(path.join(pageDir, sourceFile), result.normalizedHtml ?? "", "utf8");
    if (runtimeType === "prototype-html-css") fs.writeFileSync(path.join(pageDir, "prototype.css"), input.css ?? "", "utf8");
    fs.writeFileSync(path.join(pageDir, "config.schema.json"), input.schema, "utf8");
    if (runtimeType === "prototype-html-css") {
      fs.writeFileSync(path.join(pageDir, "prototype.meta.json"), JSON.stringify({ width: result.analysis.detectedViewport?.width ?? 390, height: result.analysis.detectedViewport?.height ?? 844, generatedBy: "project-core", title: result.analysis.detectedTitle }, null, 2) + "\n", "utf8");
    } else {
      const persistedAnalysis = analyzeHtmlImport(result.normalizedHtml ?? "");
      fs.writeFileSync(path.join(pageDir, "html-import.meta.json"), JSON.stringify({
        source: "html-import",
        analysisVersion: persistedAnalysis.analysisVersion,
        sandboxPolicyVersion: 1,
        sourceHash: result.analysis.sourceHash,
        normalizedHash: result.normalizedHash,
        detectedTitle: result.analysis.detectedTitle,
        detectedViewport: result.analysis.detectedViewport,
        viewport: result.analysis.detectedViewport,
      }, null, 2) + "\n", "utf8");
    }
    tree.pages = [...(tree.pages ?? []), { ...input.page, id: input.pageId, runtimeType }];
    fs.writeFileSync(treePath, JSON.stringify(tree, null, 2) + "\n", "utf8");
  } catch (error) { fs.rmSync(stagingPath, { recursive: true, force: true }); throw error; }
  let done = false;
  return { analysis: result.analysis, normalizedHtml: result.normalizedHtml ?? "", stagingPath, commit() {
    if (done) return;
    const backup = path.join(parent, `.html-import-backup-${path.basename(stagingPath).slice(".html-import-stage-".length)}`);
    try {
      fs.renameSync(input.workspacePath, backup);
      fs.renameSync(stagingPath, input.workspacePath);
      fs.rmSync(backup, { recursive: true, force: true });
      done = true;
    } catch (error) {
      try {
        if (fs.existsSync(input.workspacePath) && fs.existsSync(backup)) fs.rmSync(input.workspacePath, { recursive: true, force: true });
        if (fs.existsSync(backup) && !fs.existsSync(input.workspacePath)) fs.renameSync(backup, input.workspacePath);
      } finally {
        fs.rmSync(stagingPath, { recursive: true, force: true });
        fs.rmSync(backup, { recursive: true, force: true });
        done = true;
      }
      throw error;
    }
  }, discard() { if (!done) { fs.rmSync(stagingPath, { recursive: true, force: true }); done = true; } } };
}
