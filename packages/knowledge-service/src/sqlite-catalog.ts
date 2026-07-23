import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const MINIMUM_SAFE_SQLITE_VERSION = "3.51.3";
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const CHUNK_SIZE = 1_600;
const CHUNK_OVERLAP = 160;

export interface SqliteKnowledgeCatalogOptions {
  dataDir: string;
  databasePath?: string;
}

export interface TemplateProjectDescriptor {
  projectId: string;
  name: string;
  description: string;
  workspacePath: string;
  revision: number;
  rootHash: string;
  updatedAt: number;
}

export interface KnowledgeSearchOptions {
  query: string;
  currentProjectId?: string;
  limit?: number;
}

export interface KnowledgeSearchHit {
  sourceRef: string;
  projectId: string;
  projectName: string;
  documentId: string;
  title: string;
  path: string;
  kind: string;
  revision: number;
  rootHash: string;
  snippet: string;
  score: number;
}

export interface KnowledgeSource {
  sourceRef: string;
  projectId: string;
  projectName: string;
  documentId: string;
  title: string;
  path: string;
  kind: string;
  revision: number;
  rootHash: string;
  content: string;
}

export interface KnowledgeCatalogStats {
  sqliteVersion: string;
  databasePath: string;
  activeProjects: number;
  documents: number;
  chunks: number;
  pendingJobs: number;
  failedJobs: number;
}

interface IndexedDocument {
  id: string;
  path: string;
  title: string;
  kind: string;
  content: string;
}

interface ProjectFile {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  projectType?: unknown;
  templateSettings?: {
    description?: unknown;
  };
  canonicalSyncedRevision?: unknown;
  canonicalSyncedRootHash?: unknown;
  updatedAt?: unknown;
}

interface WorkspaceTreeFile {
  pages?: Array<{
    id?: unknown;
    name?: unknown;
  }>;
}

interface KnowledgeManifestFile {
  items?: Array<{
    title?: unknown;
    description?: unknown;
    path?: unknown;
    fileName?: unknown;
  }>;
}

export class SqliteKnowledgeCatalog {
  readonly databasePath: string;
  private readonly db: Database.Database;

  constructor(options: SqliteKnowledgeCatalogOptions) {
    const knowledgeDir = path.join(options.dataDir, "knowledge");
    fs.mkdirSync(knowledgeDir, { recursive: true });
    this.databasePath =
      options.databasePath ?? path.join(knowledgeDir, "knowledge.db");
    this.db = new Database(this.databasePath, { timeout: 5_000 });
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("synchronous = FULL");
    const sqliteVersion = this.sqliteVersion();
    if (compareVersions(sqliteVersion, MINIMUM_SAFE_SQLITE_VERSION) < 0) {
      this.db.close();
      throw new Error(
        `SQLITE_VERSION_UNSAFE: ${sqliteVersion}; requires >= ${MINIMUM_SAFE_SQLITE_VERSION}`,
      );
    }
    this.initializeSchema();
  }

  close(): void {
    this.db.close();
  }

  sqliteVersion(): string {
    return (
      this.db.prepare("SELECT sqlite_version() AS version").get() as {
        version: string;
      }
    ).version;
  }

  syncTemplateProject(
    descriptor: TemplateProjectDescriptor,
  ): { changed: boolean; documentCount: number; chunkCount: number } {
    const existing = this.db
      .prepare(
        "SELECT revision, root_hash AS rootHash, active FROM knowledge_sources WHERE project_id = ?",
      )
      .get(descriptor.projectId) as
      | { revision: number; rootHash: string; active: number }
      | undefined;
    if (
      existing?.active === 1 &&
      existing.revision === descriptor.revision &&
      existing.rootHash === descriptor.rootHash
    ) {
      return { changed: false, documentCount: 0, chunkCount: 0 };
    }

    const documents = collectWorkspaceDocuments(descriptor);
    const chunks = documents.flatMap((document) =>
      chunkDocument(descriptor.projectId, document),
    );
    const jobId = `kjob_${descriptor.projectId}_${Date.now()}`;
    this.db
      .prepare(
        `INSERT INTO knowledge_jobs
          (id, project_id, revision, root_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        jobId,
        descriptor.projectId,
        descriptor.revision,
        descriptor.rootHash,
        Date.now(),
        Date.now(),
      );

    const write = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE knowledge_jobs
             SET status = 'running', updated_at = ?
           WHERE id = ?`,
        )
        .run(Date.now(), jobId);
      this.db
        .prepare(
          `INSERT INTO knowledge_sources
            (project_id, name, description, revision, root_hash, active, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(project_id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             revision = excluded.revision,
             root_hash = excluded.root_hash,
             active = 1,
             updated_at = excluded.updated_at`,
        )
        .run(
          descriptor.projectId,
          descriptor.name,
          descriptor.description,
          descriptor.revision,
          descriptor.rootHash,
          descriptor.updatedAt,
        );
      this.db
        .prepare("DELETE FROM knowledge_chunks_fts WHERE project_id = ?")
        .run(descriptor.projectId);
      this.db
        .prepare("DELETE FROM knowledge_documents WHERE project_id = ?")
        .run(descriptor.projectId);

      const insertDocument = this.db.prepare(
        `INSERT INTO knowledge_documents
          (id, project_id, path, title, kind, content, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertChunk = this.db.prepare(
        `INSERT INTO knowledge_chunks
          (id, document_id, project_id, ordinal, title, path, kind, text, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertFts = this.db.prepare(
        `INSERT INTO knowledge_chunks_fts
          (chunk_id, project_id, title, path, text, search_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const document of documents) {
        insertDocument.run(
          document.id,
          descriptor.projectId,
          document.path,
          document.title,
          document.kind,
          document.content,
          descriptor.updatedAt,
        );
      }
      for (const chunk of chunks) {
        insertChunk.run(
          chunk.id,
          chunk.documentId,
          descriptor.projectId,
          chunk.ordinal,
          chunk.title,
          chunk.path,
          chunk.kind,
          chunk.text,
          chunk.searchText,
        );
        insertFts.run(
          chunk.id,
          descriptor.projectId,
          chunk.title,
          chunk.path,
          chunk.text,
          chunk.searchText,
        );
      }
      this.db
        .prepare(
          `UPDATE knowledge_jobs
             SET status = 'ready', document_count = ?, chunk_count = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(documents.length, chunks.length, Date.now(), jobId);
    });

    try {
      write();
    } catch (error) {
      this.db
        .prepare(
          `UPDATE knowledge_jobs
             SET status = 'failed', error = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(error instanceof Error ? error.message : String(error), Date.now(), jobId);
      throw error;
    }
    return {
      changed: true,
      documentCount: documents.length,
      chunkCount: chunks.length,
    };
  }

  deactivateMissingProjects(activeProjectIds: readonly string[]): number {
    const activeIds = new Set(activeProjectIds);
    const rows = this.db
      .prepare("SELECT project_id AS projectId FROM knowledge_sources WHERE active = 1")
      .all() as Array<{ projectId: string }>;
    const missing = rows
      .map((row) => row.projectId)
      .filter((projectId) => !activeIds.has(projectId));
    if (missing.length === 0) return 0;
    const deactivate = this.db.transaction(() => {
      const updateSource = this.db.prepare(
        "UPDATE knowledge_sources SET active = 0, updated_at = ? WHERE project_id = ?",
      );
      const deleteFts = this.db.prepare(
        "DELETE FROM knowledge_chunks_fts WHERE project_id = ?",
      );
      for (const projectId of missing) {
        updateSource.run(Date.now(), projectId);
        deleteFts.run(projectId);
      }
    });
    deactivate();
    return missing.length;
  }

  search(options: KnowledgeSearchOptions): KnowledgeSearchHit[] {
    const match = buildFtsQuery(options.query);
    if (!match) return [];
    const limit = clamp(options.limit ?? 10, 1, 50);
    const params: Array<string | number> = [match];
    let currentProjectFilter = "";
    if (options.currentProjectId) {
      currentProjectFilter = "AND f.project_id <> ?";
      params.push(options.currentProjectId);
    }
    params.push(limit);
    const rows = this.db
      .prepare(
        `SELECT
           f.chunk_id AS chunkId,
           f.project_id AS projectId,
           s.name AS projectName,
           c.document_id AS documentId,
           c.title,
           c.path,
           c.kind,
           s.revision,
           s.root_hash AS rootHash,
           snippet(knowledge_chunks_fts, 4, '[', ']', ' … ', 32) AS snippet,
           bm25(knowledge_chunks_fts, 0.0, 0.0, 5.0, 2.0, 1.0, 1.5) AS score
         FROM knowledge_chunks_fts AS f
         JOIN knowledge_chunks AS c ON c.id = f.chunk_id
         JOIN knowledge_sources AS s ON s.project_id = f.project_id
         WHERE knowledge_chunks_fts MATCH ?
           AND s.active = 1
           ${currentProjectFilter}
         ORDER BY score ASC, s.updated_at DESC
         LIMIT ?`,
      )
      .all(...params) as Array<{
      chunkId: string;
      projectId: string;
      projectName: string;
      documentId: string;
      title: string;
      path: string;
      kind: string;
      revision: number;
      rootHash: string;
      snippet: string;
      score: number;
    }>;
    return rows.map((row) => ({
      sourceRef: encodeSourceRef(row.chunkId),
      projectId: row.projectId,
      projectName: row.projectName,
      documentId: row.documentId,
      title: row.title,
      path: row.path,
      kind: row.kind,
      revision: row.revision,
      rootHash: row.rootHash,
      snippet: row.snippet,
      score: row.score,
    }));
  }

  read(sourceRef: string): KnowledgeSource | null {
    const chunkId = decodeSourceRef(sourceRef);
    if (!chunkId) return null;
    const row = this.db
      .prepare(
        `SELECT
           c.id AS chunkId,
           c.project_id AS projectId,
           s.name AS projectName,
           d.id AS documentId,
           d.title,
           d.path,
           d.kind,
           d.content,
           s.revision,
           s.root_hash AS rootHash
         FROM knowledge_chunks AS c
         JOIN knowledge_documents AS d ON d.id = c.document_id
         JOIN knowledge_sources AS s ON s.project_id = c.project_id
         WHERE c.id = ? AND s.active = 1`,
      )
      .get(chunkId) as
      | {
          projectId: string;
          projectName: string;
          documentId: string;
          title: string;
          path: string;
          kind: string;
          content: string;
          revision: number;
          rootHash: string;
        }
      | undefined;
    if (!row) return null;
    return { sourceRef, ...row };
  }

  stats(): KnowledgeCatalogStats {
    const count = (sql: string): number =>
      (this.db.prepare(sql).get() as { count: number }).count;
    return {
      sqliteVersion: this.sqliteVersion(),
      databasePath: this.databasePath,
      activeProjects: count(
        "SELECT COUNT(*) AS count FROM knowledge_sources WHERE active = 1",
      ),
      documents: count("SELECT COUNT(*) AS count FROM knowledge_documents"),
      chunks: count("SELECT COUNT(*) AS count FROM knowledge_chunks"),
      pendingJobs: count(
        "SELECT COUNT(*) AS count FROM knowledge_jobs WHERE status IN ('pending', 'running')",
      ),
      failedJobs: count(
        "SELECT COUNT(*) AS count FROM knowledge_jobs WHERE status = 'failed'",
      ),
    };
  }

  async backup(destinationPath: string): Promise<void> {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    await this.db.backup(destinationPath);
  }

  integrityCheck(): boolean {
    const row = this.db.prepare("PRAGMA quick_check").get() as {
      quick_check: string;
    };
    return row.quick_check === "ok";
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        revision INTEGER NOT NULL,
        root_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES knowledge_sources(project_id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        title TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, path)
      );

      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES knowledge_sources(project_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        title TEXT NOT NULL,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        search_text TEXT NOT NULL,
        UNIQUE(document_id, ordinal)
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project
        ON knowledge_chunks(project_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_documents_project
        ON knowledge_documents(project_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
        chunk_id UNINDEXED,
        project_id UNINDEXED,
        title,
        path,
        text,
        search_text,
        tokenize = 'unicode61'
      );

      CREATE TABLE IF NOT EXISTS knowledge_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        root_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        document_count INTEGER NOT NULL DEFAULT 0,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_jobs_project_updated
        ON knowledge_jobs(project_id, updated_at DESC);

      PRAGMA user_version = 1;
    `);
  }
}

export function discoverTemplateProjects(
  dataDir: string,
): TemplateProjectDescriptor[] {
  const projectsDir = path.join(dataDir, "projects");
  if (!fs.existsSync(projectsDir)) return [];
  const descriptors: TemplateProjectDescriptor[] = [];
  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectPath = path.join(projectsDir, entry.name);
    const project = readJson<ProjectFile>(path.join(projectPath, "project.json"));
    if (!project || project.projectType !== "template") continue;
    const workspacePath = path.join(projectPath, "workspace");
    if (!fs.existsSync(workspacePath)) continue;
    const updatedAt =
      typeof project.updatedAt === "number" ? project.updatedAt : Date.now();
    const revision =
      typeof project.canonicalSyncedRevision === "number"
        ? project.canonicalSyncedRevision
        : updatedAt;
    descriptors.push({
      projectId:
        typeof project.id === "string" && project.id ? project.id : entry.name,
      name:
        typeof project.name === "string" && project.name
          ? project.name
          : entry.name,
      description:
        typeof project.templateSettings?.description === "string"
          ? project.templateSettings.description
          : typeof project.description === "string"
            ? project.description
            : "",
      workspacePath,
      revision,
      rootHash:
        typeof project.canonicalSyncedRootHash === "string" &&
        project.canonicalSyncedRootHash
          ? project.canonicalSyncedRootHash
          : digestWorkspace(workspacePath),
      updatedAt,
    });
  }
  return descriptors.sort((left, right) =>
    left.projectId.localeCompare(right.projectId),
  );
}

export function reconcileTemplateProjects(
  catalog: SqliteKnowledgeCatalog,
  dataDir: string,
): {
  activeProjects: number;
  indexedProjects: number;
  deactivatedProjects: number;
  documentCount: number;
  chunkCount: number;
} {
  const descriptors = discoverTemplateProjects(dataDir);
  let indexedProjects = 0;
  let documentCount = 0;
  let chunkCount = 0;
  for (const descriptor of descriptors) {
    const result = catalog.syncTemplateProject(descriptor);
    if (result.changed) indexedProjects += 1;
    documentCount += result.documentCount;
    chunkCount += result.chunkCount;
  }
  const deactivatedProjects = catalog.deactivateMissingProjects(
    descriptors.map((descriptor) => descriptor.projectId),
  );
  return {
    activeProjects: descriptors.length,
    indexedProjects,
    deactivatedProjects,
    documentCount,
    chunkCount,
  };
}

function collectWorkspaceDocuments(
  descriptor: TemplateProjectDescriptor,
): IndexedDocument[] {
  const documents = new Map<string, IndexedDocument>();
  const addDocument = (
    relativePath: string,
    title: string,
    kind: string,
    content: string,
  ): void => {
    const normalized = normalizeRelativePath(relativePath);
    const trimmed = content.trim();
    if (!normalized || !trimmed) return;
    documents.set(normalized, {
      id: stableId("document", `${descriptor.projectId}:${normalized}`),
      path: normalized,
      title: title.trim() || normalized,
      kind,
      content: trimmed,
    });
  };

  addDocument(
    "project.json",
    descriptor.name,
    "project-overview",
    [descriptor.name, descriptor.description].filter(Boolean).join("\n\n"),
  );

  const knowledgeDir = path.join(descriptor.workspacePath, "knowledge");
  const manifest = readJson<KnowledgeManifestFile>(
    path.join(knowledgeDir, "manifest.json"),
  );
  const manifestTitles = new Map<string, { title: string; description: string }>();
  for (const item of manifest?.items ?? []) {
    const rawPath =
      typeof item.path === "string"
        ? item.path
        : typeof item.fileName === "string"
          ? item.fileName
          : "";
    const normalized = normalizeKnowledgePath(rawPath);
    if (!normalized) continue;
    manifestTitles.set(normalized, {
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title
          : path.basename(normalized),
      description:
        typeof item.description === "string" ? item.description.trim() : "",
    });
  }
  if (fs.existsSync(knowledgeDir)) {
    for (const filePath of walkFiles(knowledgeDir)) {
      if (!/\.(md|markdown|mdown)$/i.test(filePath)) continue;
      const relative = normalizeRelativePath(
        path.relative(descriptor.workspacePath, filePath),
      );
      if (!relative) continue;
      const knowledgeRelative = normalizeRelativePath(
        path.relative(knowledgeDir, filePath),
      );
      const meta = knowledgeRelative
        ? manifestTitles.get(knowledgeRelative)
        : undefined;
      const content = readText(filePath);
      addDocument(
        relative,
        meta?.title ?? path.basename(filePath),
        "knowledge-document",
        [meta?.description, content].filter(Boolean).join("\n\n"),
      );
    }
  }

  const tree = readJson<WorkspaceTreeFile>(
    path.join(descriptor.workspacePath, "workspace-tree.json"),
  );
  for (const page of tree?.pages ?? []) {
    if (typeof page.id !== "string" || !page.id) continue;
    const pageDir = path.join(descriptor.workspacePath, "demos", page.id);
    const parts: string[] = [];
    for (const fileName of [
      "index.tsx",
      "prototype.html",
      "prototype.css",
      "config.schema.json",
      "sketch.scene.json",
    ]) {
      const content = readText(path.join(pageDir, fileName));
      if (content) parts.push(`# ${fileName}\n${content}`);
    }
    addDocument(
      `demos/${page.id}`,
      typeof page.name === "string" ? page.name : page.id,
      "page",
      parts.join("\n\n"),
    );
  }

  for (const fileName of [
    "project.config.schema.json",
    "project.config.values.json",
    "app.graph.json",
  ]) {
    const content = readText(path.join(descriptor.workspacePath, fileName));
    if (content) {
      addDocument(fileName, fileName, "project-config", content);
    }
  }
  return [...documents.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function chunkDocument(projectId: string, document: IndexedDocument) {
  const chunks: Array<{
    id: string;
    documentId: string;
    ordinal: number;
    title: string;
    path: string;
    kind: string;
    text: string;
    searchText: string;
  }> = [];
  const compact = document.content.replace(/\r\n/g, "\n");
  let offset = 0;
  let ordinal = 0;
  while (offset < compact.length) {
    const end = Math.min(compact.length, offset + CHUNK_SIZE);
    const text = compact.slice(offset, end);
    const id = stableId(
      "chunk",
      `${projectId}:${document.id}:${ordinal}:${text}`,
    );
    chunks.push({
      id,
      documentId: document.id,
      ordinal,
      title: document.title,
      path: document.path,
      kind: document.kind,
      text,
      searchText: expandSearchText(
        `${document.title} ${document.path} ${text}`,
      ),
    });
    if (end >= compact.length) break;
    offset = Math.max(offset + 1, end - CHUNK_OVERLAP);
    ordinal += 1;
  }
  return chunks;
}

function expandSearchText(value: string): string {
  return tokenize(value).join(" ");
}

function buildFtsQuery(value: string): string | null {
  const tokens = tokenize(value).slice(0, 32);
  if (tokens.length === 0) return null;
  return tokens
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" OR ");
}

function tokenize(value: string): string[] {
  const baseTokens = value
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
  const cjkTokens = baseTokens.flatMap((token) => {
    const chars = [...token].filter((char) => /\p{Script=Han}/u.test(char));
    if (chars.length < 2) return chars;
    return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
  });
  return [...new Set([...baseTokens, ...cjkTokens])];
}

function digestWorkspace(workspacePath: string): string {
  const hash = crypto.createHash("sha256");
  for (const filePath of walkFiles(workspacePath)) {
    const relative = normalizeRelativePath(path.relative(workspacePath, filePath));
    if (!relative) continue;
    const stat = fs.statSync(filePath);
    hash.update(relative);
    hash.update(String(stat.size));
    if (stat.size <= MAX_SOURCE_BYTES) {
      hash.update(fs.readFileSync(filePath));
    } else {
      hash.update(String(stat.mtimeMs));
    }
  }
  return hash.digest("hex");
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  visit(root);
  return files.sort();
}

function readText(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readJson<T>(filePath: string): T | null {
  const content = readText(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function normalizeKnowledgePath(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^knowledge\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    !/\.(md|markdown|mdown)$/i.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizeRelativePath(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..")
  ) {
    return null;
  }
  return normalized;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function encodeSourceRef(chunkId: string): string {
  return `knowledge://${chunkId}`;
}

function decodeSourceRef(sourceRef: string): string | null {
  if (!sourceRef.startsWith("knowledge://")) return null;
  const value = sourceRef.slice("knowledge://".length);
  return /^chunk_[a-f0-9]{24}$/.test(value) ? value : null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}
