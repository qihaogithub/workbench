import crypto from "crypto";

import type {
  KnowledgeIndexItem,
  KnowledgeSummaryStatus,
  SystemKnowledgeDocument,
  SystemKnowledgeSnapshot,
} from "@opencode-workbench/shared";

import { getDb } from "@/lib/db";
import { getModelConfig } from "@/lib/model-config";
import { BUILTIN_KNOWLEDGE_DOCUMENTS } from "./builtin-documents";

const DEFAULT_CATEGORY = "通用";

interface SystemKnowledgeRow {
  id: string;
  title: string;
  description: string;
  file_name: string;
  content: string;
  category: string;
  tags_json: string;
  enabled: number;
  sort_order: number;
  version: number;
  content_hash: string;
  ai_summary: string;
  ai_keywords_json: string;
  summary_status: KnowledgeSummaryStatus;
  summary_error: string | null;
  created_at: number;
  updated_at: number;
  updated_by: string | null;
}

export interface SystemKnowledgeInput {
  title: string;
  description?: string;
  fileName?: string;
  content: string;
  category?: string;
  tags?: string[];
  enabled?: boolean;
  sortOrder?: number;
  aiSummary?: string;
  aiKeywords?: string[];
}

export interface SummaryGenerationResult {
  ok: boolean;
  message: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

export function hashKnowledgeContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function sanitizeKnowledgeFileName(title: string): string {
  const base =
    title
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "untitled";
  return base.endsWith(".md") ? base : `${base}.md`;
}

function safeParseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function rowToDocument(row: SystemKnowledgeRow): SystemKnowledgeDocument {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    fileName: row.file_name,
    content: row.content,
    category: row.category,
    tags: safeParseStringArray(row.tags_json),
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    version: row.version,
    contentHash: row.content_hash,
    aiSummary: row.ai_summary,
    aiKeywords: safeParseStringArray(row.ai_keywords_json),
    summaryStatus: row.summary_status,
    summaryError: row.summary_error || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by || undefined,
    sizeBytes: Buffer.byteLength(row.content, "utf-8"),
  };
}

function fallbackSummary(doc: Pick<SystemKnowledgeDocument, "description" | "content">): string {
  if (doc.description.trim()) return doc.description.trim();
  const compact = doc.content.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

function toIndexItem(doc: SystemKnowledgeDocument): KnowledgeIndexItem {
  return {
    id: doc.id,
    title: doc.title,
    source: "system",
    description: doc.description,
    fileName: doc.fileName,
    addedAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sizeBytes: doc.sizeBytes,
    category: doc.category,
    tags: doc.tags,
    aiSummary: doc.aiSummary.trim() || fallbackSummary(doc),
    aiKeywords: doc.aiKeywords.length > 0 ? doc.aiKeywords : doc.tags,
    summaryStatus: doc.summaryStatus,
    readonly: true,
  };
}

function ensureSeeded(): void {
  const db = getDb();
  const now = nowMs();
  for (const [index, doc] of BUILTIN_KNOWLEDGE_DOCUMENTS.entries()) {
    const existing = db
      .prepare("SELECT id FROM system_knowledge_documents WHERE id = ?")
      .get(doc.id);
    if (existing) continue;

    const contentHash = hashKnowledgeContent(doc.content);
    db.prepare(
      `INSERT INTO system_knowledge_documents (
        id, title, description, file_name, content, category, tags_json,
        enabled, sort_order, version, content_hash, ai_summary, ai_keywords_json,
        summary_status, summary_error, created_at, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, '', ?, 'stale', NULL, ?, ?, ?)`,
    ).run(
      doc.id,
      doc.title,
      doc.description,
      doc.fileName,
      doc.content,
      doc.category || DEFAULT_CATEGORY,
      JSON.stringify(doc.tags || []),
      index,
      contentHash,
      JSON.stringify([]),
      now,
      now,
      "system-seed",
    );
  }
}

function uniqueFileName(fileName: string, excludingId?: string): string {
  const db = getDb();
  const normalized = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
  const base = normalized.replace(/\.md$/, "");
  let candidate = normalized;
  let counter = 2;

  while (true) {
    const row = db
      .prepare("SELECT id FROM system_knowledge_documents WHERE file_name = ?")
      .get(candidate) as { id: string } | undefined;
    if (!row || row.id === excludingId) return candidate;
    candidate = `${base}_${counter}.md`;
    counter += 1;
  }
}

export function listSystemKnowledgeDocuments(options: {
  includeDisabled?: boolean;
} = {}): SystemKnowledgeDocument[] {
  ensureSeeded();
  const rows = getDb()
    .prepare(
      `SELECT * FROM system_knowledge_documents
       ${options.includeDisabled ? "" : "WHERE enabled = 1"}
       ORDER BY sort_order ASC, updated_at DESC`,
    )
    .all() as SystemKnowledgeRow[];
  return rows.map(rowToDocument);
}

export function listSystemKnowledgeIndexItems(): KnowledgeIndexItem[] {
  return listSystemKnowledgeDocuments().map(toIndexItem);
}

export function getSystemKnowledgeDocument(id: string): SystemKnowledgeDocument | null {
  ensureSeeded();
  const row = getDb()
    .prepare("SELECT * FROM system_knowledge_documents WHERE id = ?")
    .get(id) as SystemKnowledgeRow | undefined;
  return row ? rowToDocument(row) : null;
}

export function getSystemKnowledgeDocumentByFileName(
  fileName: string,
): SystemKnowledgeDocument | null {
  ensureSeeded();
  const row = getDb()
    .prepare(
      "SELECT * FROM system_knowledge_documents WHERE file_name = ? AND enabled = 1",
    )
    .get(fileName) as SystemKnowledgeRow | undefined;
  return row ? rowToDocument(row) : null;
}

export async function createSystemKnowledgeDocument(
  input: SystemKnowledgeInput,
  updatedBy = "admin",
): Promise<{ document: SystemKnowledgeDocument; summaryResult: SummaryGenerationResult }> {
  ensureSeeded();
  const id = `kb_sys_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const title = input.title.trim();
  const content = input.content;
  const fileName = uniqueFileName(
    input.fileName?.trim() || sanitizeKnowledgeFileName(title),
  );
  const timestamp = nowMs();
  const contentHash = hashKnowledgeContent(content);
  const sortOrder = input.sortOrder ?? listSystemKnowledgeDocuments({ includeDisabled: true }).length;

  getDb()
    .prepare(
      `INSERT INTO system_knowledge_documents (
        id, title, description, file_name, content, category, tags_json,
        enabled, sort_order, version, content_hash, ai_summary, ai_keywords_json,
        summary_status, summary_error, created_at, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .run(
      id,
      title,
      input.description?.trim() || title,
      fileName,
      content,
      input.category?.trim() || DEFAULT_CATEGORY,
      JSON.stringify(input.tags || []),
      input.enabled === false ? 0 : 1,
      sortOrder,
      contentHash,
      input.aiSummary?.trim() || "",
      JSON.stringify(input.aiKeywords || []),
      input.aiSummary ? "ready" : "stale",
      timestamp,
      timestamp,
      updatedBy,
    );

  const summaryResult = await generateAndSaveSummary(id, updatedBy);
  return { document: getSystemKnowledgeDocument(id)!, summaryResult };
}

export async function updateSystemKnowledgeDocument(
  id: string,
  input: Partial<SystemKnowledgeInput>,
  updatedBy = "admin",
): Promise<{ document: SystemKnowledgeDocument | null; summaryResult: SummaryGenerationResult | null }> {
  const current = getSystemKnowledgeDocument(id);
  if (!current) return { document: null, summaryResult: null };

  const nextContent = input.content ?? current.content;
  const nextHash = hashKnowledgeContent(nextContent);
  const contentChanged = nextHash !== current.contentHash;
  const summaryChanged =
    input.aiSummary !== undefined || input.aiKeywords !== undefined;
  const nextFileName =
    input.fileName !== undefined
      ? uniqueFileName(input.fileName.trim(), id)
      : current.fileName;

  getDb()
    .prepare(
      `UPDATE system_knowledge_documents SET
        title = ?,
        description = ?,
        file_name = ?,
        content = ?,
        category = ?,
        tags_json = ?,
        enabled = ?,
        sort_order = ?,
        version = ?,
        content_hash = ?,
        ai_summary = ?,
        ai_keywords_json = ?,
        summary_status = ?,
        summary_error = ?,
        updated_at = ?,
        updated_by = ?
       WHERE id = ?`,
    )
    .run(
      input.title?.trim() || current.title,
      input.description?.trim() ?? current.description,
      nextFileName,
      nextContent,
      input.category?.trim() || current.category,
      JSON.stringify(input.tags ?? current.tags),
      input.enabled === undefined ? (current.enabled ? 1 : 0) : input.enabled ? 1 : 0,
      input.sortOrder ?? current.sortOrder,
      contentChanged ? current.version + 1 : current.version,
      nextHash,
      input.aiSummary !== undefined ? input.aiSummary.trim() : current.aiSummary,
      JSON.stringify(input.aiKeywords ?? current.aiKeywords),
      contentChanged ? "stale" : summaryChanged ? "ready" : current.summaryStatus,
      contentChanged || summaryChanged ? null : current.summaryError || null,
      nowMs(),
      updatedBy,
      id,
    );

  const summaryResult = contentChanged
    ? await generateAndSaveSummary(id, updatedBy)
    : null;
  return { document: getSystemKnowledgeDocument(id), summaryResult };
}

export function deleteSystemKnowledgeDocument(id: string): boolean {
  ensureSeeded();
  const info = getDb()
    .prepare("DELETE FROM system_knowledge_documents WHERE id = ?")
    .run(id);
  return info.changes > 0;
}

export function createSystemKnowledgeSnapshot(): SystemKnowledgeSnapshot {
  const documents = listSystemKnowledgeDocuments();
  return {
    version: documents.reduce((sum, doc) => sum + doc.version, 0),
    updatedAt: nowIso(),
    documents,
  };
}

async function callSummaryModel(
  document: SystemKnowledgeDocument,
): Promise<{ summary: string; keywords: string[] }> {
  const config = await getModelConfig();
  const backendProviders = config.backendProviders;
  const providers = backendProviders?.providers.filter((provider) => provider.enabled !== false) || [];
  if (providers.length === 0) {
    throw new Error("未配置可用的全局模型供应商");
  }

  const activeProvider =
    providers.find((provider) => provider.id === backendProviders?.activeProviderId) ||
    providers[0];
  const model =
    activeProvider.defaultModel ||
    backendProviders?.activeModelId?.replace(`${activeProvider.id}/`, "") ||
    activeProvider.models[0];
  if (!activeProvider.baseURL || !activeProvider.apiKey || !model) {
    throw new Error("全局模型供应商缺少 baseURL、apiKey 或模型 ID");
  }

  const response = await fetch(
    `${activeProvider.baseURL.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeProvider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是知识库索引助手。请为文档生成简明摘要和关键词，只返回 JSON。",
          },
          {
            role: "user",
            content: [
              `标题：${document.title}`,
              `描述：${document.description}`,
              `分类：${document.category}`,
              `标签：${document.tags.join(", ")}`,
              "正文：",
              document.content.slice(0, 12000),
              "",
              '请返回形如 {"summary":"80字以内摘要","keywords":["关键词1","关键词2"]} 的 JSON。',
            ].join("\n"),
          },
        ],
        temperature: 0.2,
        max_tokens: 300,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`摘要模型请求失败：${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("摘要模型返回为空");

  const jsonText = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText) as { summary?: unknown; keywords?: unknown };
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((item): item is string => typeof item === "string")
    : [];
  if (!summary) throw new Error("摘要模型返回缺少 summary");
  return { summary, keywords: keywords.slice(0, 12) };
}

export async function generateAndSaveSummary(
  id: string,
  updatedBy = "admin",
): Promise<SummaryGenerationResult> {
  const document = getSystemKnowledgeDocument(id);
  if (!document) return { ok: false, message: "文档不存在" };

  try {
    const result = await callSummaryModel(document);
    getDb()
      .prepare(
        `UPDATE system_knowledge_documents SET
          ai_summary = ?,
          ai_keywords_json = ?,
          summary_status = 'ready',
          summary_error = NULL,
          updated_at = ?,
          updated_by = ?
         WHERE id = ?`,
      )
      .run(result.summary, JSON.stringify(result.keywords), nowMs(), updatedBy, id);
    return { ok: true, message: "摘要已生成" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getDb()
      .prepare(
        `UPDATE system_knowledge_documents SET
          summary_status = 'failed',
          summary_error = ?,
          updated_at = ?,
          updated_by = ?
         WHERE id = ?`,
      )
      .run(message, nowMs(), updatedBy, id);
    return { ok: false, message };
  }
}
