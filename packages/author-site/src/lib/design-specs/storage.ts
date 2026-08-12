import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
import type { DesignSpecDoc, DesignSpecEntry, DesignSpecMeta } from "./types";

/**
 * 设计规范数据层：负责 `workspace/design-spec/` 目录的读写。
 *
 * 只存“条目结构 + 说明文字 + 对配置项的引用”，不存配置值。
 * 目录索引用 `manifest.json`，单份文档用 `spec-{id}.json`。
 *
 * live workspace 写入由调用方（API route）通过 workspace mutation authority
 * 提交，本层提供纯 fs 能力 + 内容构造，便于复用。
 */

export const DESIGN_SPEC_DIR = "design-spec";
const MANIFEST_FILE = "manifest.json";

export interface DesignSpecManifest {
  version: number;
  items: DesignSpecMeta[];
}

export function designSpecDir(workingDir: string): string {
  return path.join(workingDir, DESIGN_SPEC_DIR);
}

export function designSpecFilePath(workingDir: string, id: string): string {
  return path.join(designSpecDir(workingDir), `spec-${id}.json`);
}

export function generateDesignSpecId(): string {
  return `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateEntryId(): string {
  return `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 读取 manifest，不存在时返回空 */
export function readDesignSpecManifest(
  workingDir: string,
): DesignSpecManifest {
  const manifestPath = path.join(designSpecDir(workingDir), MANIFEST_FILE);
  try {
    if (!fs.existsSync(manifestPath)) return { version: 1, items: [] };
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Partial<DesignSpecManifest>;
    return {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { version: 1, items: [] };
  }
}

function writeManifest(workingDir: string, manifest: DesignSpecManifest): void {
  const dir = designSpecDir(workingDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

/** 文档元信息（用于 manifest） */
function toMeta(doc: DesignSpecDoc): DesignSpecMeta {
  return {
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** 列表：返回文档元信息 */
export function listDesignSpecDocs(workingDir: string): DesignSpecMeta[] {
  return readDesignSpecManifest(workingDir).items;
}

/** 读取单份文档，不存在返回 null */
export function readDesignSpecDoc(
  workingDir: string,
  id: string,
): DesignSpecDoc | null {
  const filePath = designSpecFilePath(workingDir, id);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<DesignSpecDoc>;
    if (!parsed.id || parsed.id !== id) return null;
    return {
      id: parsed.id,
      title: parsed.title || "",
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      autoManagedPageId:
        typeof parsed.autoManagedPageId === "string"
          ? parsed.autoManagedPageId
          : undefined,
    };
  } catch {
    return null;
  }
}

/** 构造一份新文档（默认空 entries），无副作用（供 live mutation 使用） */
export function buildNewDesignSpecDoc(title: string): DesignSpecDoc {
  const now = new Date().toISOString();
  return {
    id: generateDesignSpecId(),
    title: title.trim() || "未命名规范",
    createdAt: now,
    updatedAt: now,
    entries: [],
  };
}

/** 构造一份新文档并直接写入（非 live 分支） */
export function createDesignSpecDoc(
  workingDir: string,
  title: string,
): DesignSpecDoc {
  const doc = buildNewDesignSpecDoc(title);
  // 直接写文件 + 更新 manifest
  writeDocFile(workingDir, doc);
  upsertManifestItem(workingDir, doc);
  return doc;
}

/** 保存文档（整体覆盖 entries/title），并更新时间戳 + manifest */
export function saveDesignSpecDoc(
  workingDir: string,
  doc: DesignSpecDoc,
): DesignSpecDoc {
  const updated: DesignSpecDoc = {
    ...doc,
    updatedAt: new Date().toISOString(),
    entries: Array.isArray(doc.entries) ? doc.entries : [],
    autoManagedPageId: doc.autoManagedPageId,
  };
  writeDocFile(workingDir, updated);
  upsertManifestItem(workingDir, updated);
  return updated;
}

/** 删除文档，并从 manifest 移除；返回是否删除成功 */
export function deleteDesignSpecDoc(
  workingDir: string,
  id: string,
): boolean {
  const filePath = designSpecFilePath(workingDir, id);
  const existed = fs.existsSync(filePath);
  if (existed) fs.rmSync(filePath, { force: true });
  const manifest = readDesignSpecManifest(workingDir);
  const next = manifest.items.filter((item) => item.id !== id);
  if (next.length !== manifest.items.length) {
    manifest.items = next;
    writeManifest(workingDir, manifest);
  }
  return existed;
}

function writeDocFile(workingDir: string, doc: DesignSpecDoc): void {
  const dir = designSpecDir(workingDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    designSpecFilePath(workingDir, doc.id),
    JSON.stringify(doc, null, 2),
    "utf-8",
  );
}

function upsertManifestItem(workingDir: string, doc: DesignSpecDoc): void {
  const manifest = readDesignSpecManifest(workingDir);
  const idx = manifest.items.findIndex((item) => item.id === doc.id);
  const meta = toMeta(doc);
  if (idx >= 0) manifest.items[idx] = meta;
  else manifest.items.push(meta);
  writeManifest(workingDir, manifest);
}

/** 构造待提交的 mutation 内容（live workspace 用），返回 { manifest, docFile } 新内容 */
export function buildDesignSpecMutation(
  workingDir: string,
  doc: DesignSpecDoc,
): { manifestContent: string; docContent: string } {
  const dir = designSpecDir(workingDir);
  const manifest = readDesignSpecManifest(workingDir);
  const idx = manifest.items.findIndex((item) => item.id === doc.id);
  const meta = toMeta(doc);
  if (idx >= 0) manifest.items[idx] = meta;
  else manifest.items.push(meta);
  return {
    manifestContent: JSON.stringify(manifest, null, 2),
    docContent: JSON.stringify(doc, null, 2),
  };
}

export function buildDesignSpecDeleteMutation(
  workingDir: string,
  id: string,
): { manifestContent: string; docPath: string } {
  const manifest = readDesignSpecManifest(workingDir);
  manifest.items = manifest.items.filter((item) => item.id !== id);
  return {
    manifestContent: JSON.stringify(manifest, null, 2),
    docPath: `design-spec/spec-${id}.json`,
  };
}

/** 哈希（用于 mutation expectedHash） */
export function hashText(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** 校验文档属主路径安全（防止路径穿越），文档名仅允许安全字符 */
export function isSafeDocId(id: string): boolean {
  return /^ds_[A-Za-z0-9_]+(_[A-Za-z0-9]+)?$/.test(id);
}

/** 归一化条目：去重 refs、补齐字段 */
export function normalizeEntry(source: Partial<DesignSpecEntry>): DesignSpecEntry {
  const refs = Array.isArray(source.refs)
    ? source.refs
        .filter(
          (r) =>
            r &&
            (r.scope === "project" || r.scope === "page") &&
            typeof r.fieldKey === "string" &&
            r.fieldKey.length > 0,
        )
        .map((r) => ({
          scope: r.scope,
          pageId: r.scope === "page" ? r.pageId : undefined,
          fieldKey: r.fieldKey,
        }))
    : [];
  const seen = new Set<string>();
  const uniqueRefs = refs.filter((r) => {
    const key = `${r.scope}:${r.pageId || ""}:${r.fieldKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    id: typeof source.id === "string" && source.id ? source.id : generateEntryId(),
    title: typeof source.title === "string" ? source.title : "",
    markdown: typeof source.markdown === "string" ? source.markdown : "",
    refs: uniqueRefs,
    autoManagedFieldKey:
      typeof source.autoManagedFieldKey === "string"
        ? source.autoManagedFieldKey
        : undefined,
  };
}
