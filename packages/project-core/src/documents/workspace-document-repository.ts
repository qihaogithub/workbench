import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import { DocumentApplicationError } from "./errors.js";
import type {
  DocumentAuthorityPort,
  DocumentCreateInput,
  DocumentDeleteInput,
  DocumentListIssueRecord,
  DocumentListRecord,
  DocumentRecord,
  DocumentRepositoryDeleteResult,
  DocumentRepositoryListResult,
  DocumentRepositoryPort,
  DocumentRestoreInput,
  DocumentRevisionDetail,
  DocumentUpdateInput,
} from "./types.js";

interface WorkspaceManifestItem {
  id: string;
  title: string;
  source?: "system" | "user";
  description?: string;
  fileName: string;
  addedAt?: string;
  updatedAt?: string;
  sizeBytes?: number;
  readonly?: boolean;
  [key: string]: unknown;
}

interface WorkspaceManifest {
  version?: number;
  items: WorkspaceManifestItem[];
}

function hashText(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function safeDocumentId(): string {
  return `kb_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeFileName(title: string): string {
  return title
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "untitled";
}

function ensureInsideKnowledge(fileName: string): string {
  const base = path.basename(fileName);
  if (base !== fileName || base === "manifest.json" || !/^[^/\\]+\.(md|markdown|mdown)$/i.test(base)) {
    throw new DocumentApplicationError({ code: "DOCUMENT_INVALID", message: "文档文件名不合法" });
  }
  return base;
}

function cloneManifest(value: WorkspaceManifest): WorkspaceManifest {
  return { version: value.version ?? 1, items: value.items.map((item) => ({ ...item })) };
}

function readManifest(workspacePath: string): { manifest: WorkspaceManifest; raw: string | null } {
  const manifestPath = path.join(workspacePath, "knowledge", "manifest.json");
  if (!fs.existsSync(manifestPath)) return { manifest: { version: 1, items: [] }, raw: null };
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceManifest>;
    return {
      raw,
      manifest: {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        items: Array.isArray(parsed.items) ? parsed.items.filter((item): item is WorkspaceManifestItem => Boolean(item && typeof item.id === "string" && typeof item.fileName === "string" && typeof item.title === "string")) : [],
      },
    };
  } catch {
    throw new DocumentApplicationError({ code: "DOCUMENT_INVALID", message: "知识库 manifest 无法解析" });
  }
}

function itemToRecord(projectId: string, workspacePath: string, item: WorkspaceManifestItem, contentOverride?: string): DocumentRecord {
  const storageFileName = ensureInsideKnowledge(item.fileName);
  const filePath = path.join(workspacePath, "knowledge", storageFileName);
  if (contentOverride === undefined && !fs.existsSync(filePath)) {
    throw new DocumentApplicationError({ code: "DOCUMENT_NOT_FOUND", message: "文档正文不存在" });
  }
  const content = contentOverride ?? fs.readFileSync(filePath, "utf8");
  const updatedAt = item.updatedAt ?? item.addedAt ?? new Date(0).toISOString();
  const addedAt = item.addedAt ?? updatedAt;
  return {
    projectId,
    documentId: item.id,
    title: item.title,
    description: item.description ?? item.title,
    content,
    addedAt,
    updatedAt,
    contentHash: hashText(content),
    source: item.source === "system" ? "system" : "user",
    ...(item.readonly ? { readonly: true } : {}),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    storageFileName,
    storageWorkspacePath: workspacePath,
  };
}

function itemToListRecord(projectId: string, workspacePath: string, item: WorkspaceManifestItem): DocumentListRecord | DocumentListIssueRecord {
  const storageFileName = ensureInsideKnowledge(item.fileName);
  const filePath = path.join(workspacePath, "knowledge", storageFileName);
  const updatedAt = item.updatedAt ?? item.addedAt ?? new Date(0).toISOString();
  const addedAt = item.addedAt ?? updatedAt;
  const common = {
    projectId,
    documentId: item.id,
    title: item.title,
    source: "user" as const,
    ...(item.readonly ? { readonly: true } : {}),
    storageFileName,
    storageWorkspacePath: workspacePath,
  };
  if (!fs.existsSync(filePath)) {
    return {
      ...common,
      code: "source_missing",
      sourceState: "missing",
      repairable: true,
    };
  }
  const sizeBytes = fs.statSync(filePath).size;
  return {
    ...common,
    description: item.description ?? item.title,
    addedAt,
    updatedAt,
    sizeBytes,
    sourceState: "active",
  };
}

function projectWorkspacePath(dataDir: string, projectId: string): string {
  return path.join(dataDir, "projects", projectId, "workspace");
}

export interface WorkspaceDocumentRepositoryOptions {
  dataDir: string;
  authority?: DocumentAuthorityPort;
}

export class WorkspaceDocumentRepository implements DocumentRepositoryPort {
  private readonly dataDir: string;
  private readonly authority?: DocumentAuthorityPort;

  constructor(options: WorkspaceDocumentRepositoryOptions) {
    this.dataDir = options.dataDir;
    this.authority = options.authority;
  }

  workspacePath(projectId: string, context?: { workspacePath?: string }): string {
    return context?.workspacePath ?? projectWorkspacePath(this.dataDir, projectId);
  }

  list(projectId: string, context?: { workspacePath?: string }): DocumentRepositoryListResult {
    const workspacePath = this.workspacePath(projectId, context);
    const { manifest } = readManifest(workspacePath);
    const entries = manifest.items
      .filter((item) => item.source !== "system")
      .map((item) => itemToListRecord(projectId, workspacePath, item));
    return {
      items: entries.filter((item): item is DocumentListRecord => item.sourceState === "active"),
      issues: entries.filter((item): item is DocumentListIssueRecord => item.sourceState === "missing"),
    };
  }

  getMetadata(locator: { projectId: string; documentId: string }, context?: { workspacePath?: string }): DocumentListRecord | DocumentListIssueRecord | null {
    const workspacePath = this.workspacePath(locator.projectId, context);
    const { manifest } = readManifest(workspacePath);
    const item = manifest.items.find((entry) => entry.id === locator.documentId);
    if (!item || item.source === "system") return null;
    return itemToListRecord(locator.projectId, workspacePath, item);
  }

  get(locator: { projectId: string; documentId: string }, context?: { workspacePath?: string }): DocumentRecord | null {
    const workspacePath = this.workspacePath(locator.projectId, context);
    const { manifest } = readManifest(workspacePath);
    const item = manifest.items.find((entry) => entry.id === locator.documentId);
    if (!item || item.source === "system") return null;
    try {
      return itemToRecord(locator.projectId, workspacePath, item);
    } catch (error) {
      if (error instanceof DocumentApplicationError && error.code === "DOCUMENT_NOT_FOUND") return null;
      throw error;
    }
  }

  async create(input: DocumentCreateInput): Promise<DocumentRecord> {
    const workspacePath = this.workspacePath(input.projectId, input);
    const knowledgeDir = path.join(workspacePath, "knowledge");
    const { manifest, raw } = readManifest(workspacePath);
    const title = input.title.trim();
    if (!title || typeof input.content !== "string") throw new DocumentApplicationError({ code: "DOCUMENT_INVALID", message: "标题和正文不能为空" });
    const base = sanitizeFileName(title);
    let fileName = `${base}.md`;
    let index = 2;
    while (manifest.items.some((item) => item.fileName === fileName) || fs.existsSync(path.join(knowledgeDir, fileName))) fileName = `${base}_${index++}.md`;
    const now = new Date().toISOString();
    const item: WorkspaceManifestItem = { id: safeDocumentId(), title, source: "user", description: input.description?.trim() || title, fileName, addedAt: now, updatedAt: now, sizeBytes: Buffer.byteLength(input.content, "utf8") };
    const next = cloneManifest(manifest);
    next.items.push(item);
    const authority = await this.persist(input, workspacePath, fileName, input.content, raw, next, "create_document", true);
    return { ...itemToRecord(input.projectId, workspacePath, item, input.content), ...(authority ? { authorityRevision: authority.revision, authorityRootHash: authority.rootHash } : {}) };
  }

  async update(input: DocumentUpdateInput): Promise<DocumentRecord> {
    const workspacePath = this.workspacePath(input.locator.projectId, input);
    const { manifest, raw } = readManifest(workspacePath);
    const index = manifest.items.findIndex((item) => item.id === input.locator.documentId);
    if (index < 0) throw new DocumentApplicationError({ code: "DOCUMENT_NOT_FOUND", message: "文档不存在" });
    const current = manifest.items[index];
    if (current.source === "system" || current.readonly) throw new DocumentApplicationError({ code: "DOCUMENT_READONLY", message: "系统只读文档不能修改" });
    if (input.title !== undefined && !input.title.trim()) {
      throw new DocumentApplicationError({ code: "DOCUMENT_INVALID", message: "标题不能为空" });
    }
    const next = cloneManifest(manifest);
    const updated: WorkspaceManifestItem = { ...current, ...(input.title === undefined ? {} : { title: input.title.trim() }), ...(input.description === undefined ? {} : { description: input.description.trim() }), updatedAt: new Date().toISOString() };
    if (input.content !== undefined) updated.sizeBytes = Buffer.byteLength(input.content, "utf8");
    next.items[index] = updated;
    const content = input.content ?? fs.readFileSync(path.join(workspacePath, "knowledge", ensureInsideKnowledge(current.fileName)), "utf8");
    const authority = await this.persist(input, workspacePath, ensureInsideKnowledge(current.fileName), content, raw, next, "update_document", false);
    return { ...itemToRecord(input.locator.projectId, workspacePath, updated, content), ...(authority ? { authorityRevision: authority.revision, authorityRootHash: authority.rootHash } : {}) };
  }

  async remove(input: DocumentDeleteInput): Promise<DocumentRepositoryDeleteResult> {
    const workspacePath = this.workspacePath(input.locator.projectId, input);
    const { manifest, raw } = readManifest(workspacePath);
    const index = manifest.items.findIndex((item) => item.id === input.locator.documentId);
    if (index < 0) throw new DocumentApplicationError({ code: "DOCUMENT_NOT_FOUND", message: "文档不存在" });
    const item = manifest.items[index];
    if (item.source === "system" || item.readonly) throw new DocumentApplicationError({ code: "DOCUMENT_READONLY", message: "系统只读文档不能删除" });
    const deleted = itemToListRecord(input.locator.projectId, workspacePath, item);
    const record = deleted.sourceState === "active"
      ? itemToRecord(input.locator.projectId, workspacePath, item)
      : undefined;
    const next = cloneManifest(manifest);
    next.items.splice(index, 1);
    const authority = await this.persist(input, workspacePath, ensureInsideKnowledge(item.fileName), null, raw, next, "delete_document", false, deleted.sourceState === "active");
    return {
      deleted,
      ...(record ? { record } : {}),
      ...(authority ? { authorityRevision: authority.revision, authorityRootHash: authority.rootHash } : {}),
    };
  }

  async restore(input: DocumentRestoreInput, revision: DocumentRevisionDetail): Promise<DocumentRecord> {
    const workspacePath = this.workspacePath(input.locator.projectId, input);
    const { manifest, raw } = readManifest(workspacePath);
    const existingIndex = manifest.items.findIndex((item) => item.id === input.locator.documentId);
    const existing = existingIndex >= 0 ? manifest.items[existingIndex] : undefined;
    if (existing?.source === "system" || existing?.readonly) {
      throw new DocumentApplicationError({ code: "DOCUMENT_READONLY", message: "系统只读文档不能恢复" });
    }
    const title = revision.title?.trim() || existing?.title || "恢复的文档";
    let fileName = ensureInsideKnowledge(existing?.fileName ?? `${sanitizeFileName(title)}.md`);
    if (!existing) {
      const base = fileName.replace(/\.md$/i, "");
      let index = 2;
      while (
        manifest.items.some((item) => item.fileName === fileName) ||
        fs.existsSync(path.join(workspacePath, "knowledge", fileName))
      ) {
        fileName = `${base}_${index++}.md`;
      }
    }
    const now = new Date().toISOString();
    const item: WorkspaceManifestItem = { ...(existing ?? {}), id: input.locator.documentId, title, source: "user", description: revision.description?.trim() || existing?.description || title, fileName, addedAt: existing?.addedAt ?? now, updatedAt: now, sizeBytes: Buffer.byteLength(revision.content, "utf8") };
    const next = cloneManifest(manifest);
    if (existingIndex >= 0) next.items[existingIndex] = item;
    else next.items.push(item);
    const authority = await this.persist(input, workspacePath, fileName, revision.content, raw, next, "restore_document", false);
    return { ...itemToRecord(input.locator.projectId, workspacePath, item, revision.content), ...(authority ? { authorityRevision: authority.revision, authorityRootHash: authority.rootHash } : {}) };
  }

  private async persist(input: DocumentCreateInput | DocumentUpdateInput | DocumentDeleteInput | DocumentRestoreInput, workspacePath: string, fileName: string, content: string | null, previousManifest: string | null, nextManifest: WorkspaceManifest, reason: string, expectedAbsent: boolean, sourceExists = true): Promise<{ revision: number; rootHash: string } | undefined> {
    const nextRaw = JSON.stringify(nextManifest, null, 2);
    const isLive = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(workspacePath, ".workspace.json"), "utf8"))?.scope === "live"; } catch { return false; }
    })();
    if (isLive) {
      if (!this.authority || !input.workspaceId || !input.sessionId) throw new DocumentApplicationError({ code: "DOCUMENT_AUTHORITY_NOT_READY", message: "live Workspace 文档写入需要 Authority session" });
      const operations: WorkspaceMutationOperation[] = [];
      if (content === null) {
        if (sourceExists) operations.push({ type: "delete_path", path: `knowledge/${fileName}`, expectedHash: hashText(fs.readFileSync(path.join(workspacePath, "knowledge", fileName), "utf8")) });
      } else {
        const contentPath = path.join(workspacePath, "knowledge", fileName);
        const previousContent = !expectedAbsent && fs.existsSync(contentPath) ? fs.readFileSync(contentPath, "utf8") : undefined;
        operations.push({ type: "put_text", path: `knowledge/${fileName}`, content, ...(expectedAbsent ? { expectedAbsent: true } : previousContent === undefined ? {} : { expectedHash: hashText(previousContent) }) });
      }
      operations.push({ type: "put_text", path: "knowledge/manifest.json", content: nextRaw, ...(previousManifest === null ? { expectedAbsent: true } : { expectedHash: hashText(previousManifest) }) });
      // The authority receipt is intentionally not written back by this adapter;
      // its projection owns the live workspace materialization.
      const projectId = "projectId" in input ? input.projectId : input.locator.projectId;
      try {
        return await this.authority.commit({ projectId, workspaceId: input.workspaceId, sessionId: input.sessionId, baseRevision: input.baseRevision ?? 0, reason, operations });
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
        const documentCode = code === "WORKSPACE_RESOURCE_CONFLICT" || code === "WORKSPACE_EXTERNAL_DRIFT"
          ? "DOCUMENT_AUTHORITY_CONFLICT"
          : code === "WORKSPACE_AUTHORITY_BACKUP_MISSING"
            ? "DOCUMENT_AUTHORITY_BACKUP_MISSING"
            : "DOCUMENT_AUTHORITY_NOT_READY";
        const details = typeof error === "object" && error !== null && "details" in error
          ? (error as { details?: unknown }).details
          : undefined;
        throw new DocumentApplicationError({
          code: documentCode,
          message: error instanceof Error ? error.message : "Workspace Authority 写入失败",
          ...(details === undefined ? {} : { details }),
          recoverable: code === "WORKSPACE_RESOURCE_CONFLICT" || code === "WORKSPACE_EXTERNAL_DRIFT",
        });
      }
    }
    fs.mkdirSync(path.join(workspacePath, "knowledge"), { recursive: true });
    const target = path.join(workspacePath, "knowledge", fileName);
    if (content === null) {
      if (sourceExists) fs.rmSync(target, { force: true });
    } else {
      fs.writeFileSync(target, content, "utf8");
    }
    fs.writeFileSync(path.join(workspacePath, "knowledge", "manifest.json"), nextRaw, "utf8");
    return undefined;
  }
}
