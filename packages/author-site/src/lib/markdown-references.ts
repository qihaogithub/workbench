import fs from "node:fs";
import { readReferenceText, readReferenceJson, referenceFile } from "./markdown-reference-directory-io";
import path from "node:path";
import type { NextRequest } from "next/server";
import {
  createEntityResolver,
  createResourceDirectory,
  hashWorkspaceContent,
  InMemoryMarkdownReferenceIndex,
  SqliteMarkdownReferenceIndex,
  type MarkdownReferenceSource,
  type MarkdownReferenceTarget,
  type MarkdownReferenceCandidate,
  type MarkdownLinkRecord,
  type MarkdownReferenceIndexStore,
  type ResourceDirectorySnapshot,
  type ParsedIndexReference,
} from "@workbench/project-core";
import { buildCandidateDirectoryEntries } from "@workbench/project-core/markdown-references";
import { parseMarkdownReferences, decodeMarkdownReferenceUri, MARKDOWN_REFERENCE_INDEX_VERSION } from "@workbench/shared/markdown-reference";
import { isValidWorkspacePathSegment } from "@workbench/shared/workspace-path";
import {
  findWorkspacePath,
  getSessionMeta,
  isSessionExpired,
  readProjectMeta,
  resolveProjectWorkspacePath,
} from "@/lib/fs-utils";

export interface MarkdownReferenceWorkspaceContext {
  projectId: string;
  workspaceId: string;
  workspacePath: string;
  observedRevision?: number;
  observedRootHash?: string;
}

export interface MarkdownReferenceIndexResult {
  context: MarkdownReferenceWorkspaceContext;
  snapshot: ResourceDirectorySnapshot;
  directory: ReturnType<typeof createResourceDirectory>;
  index: MarkdownReferenceIndexStore;
  sources: MarkdownReferenceSource[];
  sourceLabels: Map<string, string>;
  sourceDocuments: Array<{ source: MarkdownReferenceSource; markdown: string; contentHash?: string }>;
}

function sourceKey(source: MarkdownReferenceSource): string {
  switch (source.kind) {
    case "knowledge-document": return `${source.kind}:${source.projectId}:${source.docId}`;
    case "page-requirements":
    case "page-convention": return `${source.kind}:${source.projectId}:${source.pageId}`;
    case "workspace-memory":
    case "project-convention": return `${source.kind}:${source.projectId}`;
    case "design-spec-entry": return `${source.kind}:${source.projectId}:${source.specId}:${source.entryId}`;
    case "config-note": return `${source.kind}:${source.projectId}:${source.scope}:${source.pageId ?? ""}:${source.fieldKey}`;
    case "richtext-field": return `${source.kind}:${source.projectId}:${source.scope}:${source.pageId ?? ""}:${source.fieldKey}:${source.jsonPointer}`;
    case "canvas-local-document": return `${source.kind}:${source.projectId}:${source.nodeId}`;
  }
}

function readWorkspaceMarkdown(workspacePath: string, relativePath: string): string {
  return readReferenceText(workspacePath, relativePath) ?? "";
}

function readWorkspaceJson(workspacePath: string, relativePath: string): Record<string, unknown> | null {
  return readReferenceJson(workspacePath, relativePath);
}

function schemaFields(schema: unknown, prefix: string[] = []): Array<{
  key: string;
  title: string;
  pointer: string;
  note?: string;
  richtext: boolean;
}> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const properties = (schema as Record<string, unknown>).properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  const result: Array<{ key: string; title: string; pointer: string; note?: string; richtext: boolean }> = [];
  for (const [key, raw] of Object.entries(properties as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const property = raw as Record<string, unknown>;
    const pathParts = [...prefix, key];
    const pointer = `/${pathParts.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
    const demo = property.$demo && typeof property.$demo === "object" && !Array.isArray(property.$demo)
      ? property.$demo as Record<string, unknown>
      : undefined;
    const title = typeof property.title === "string" ? property.title : key;
    const note = typeof demo?.note === "string" ? demo.note : undefined;
    const richtext = property.type === "richtext" || property.format === "richtext";
    if (note || richtext) result.push({ key, title, pointer, note, richtext });
    if (property.type === "object") result.push(...schemaFields(property, pathParts));
  }
  return result;
}

function valueAtPointer(value: Record<string, unknown> | null, pointer: string): unknown {
  if (!value) return undefined;
  const parts = pointer.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = value;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveMarkdownReferenceWorkspace(
  request: NextRequest,
  projectId: string,
  userId?: string,
): MarkdownReferenceWorkspaceContext | null {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (sessionId) {
    const session = getSessionMeta(sessionId);
    if (!session || session.demoId !== projectId || (session.userId && session.userId !== userId) || isSessionExpired(session) || !session.workspaceId) {
      return null;
    }
    const workspacePath = findWorkspacePath(session.workspaceId);
    if (!workspacePath) return null;
    const project = readProjectMeta(projectId);
    return { projectId, workspaceId: session.workspaceId, workspacePath, observedRevision: project?.canonicalSyncedRevision, observedRootHash: project?.canonicalSyncedRootHash };
  }
  const project = readProjectMeta(projectId);
  const workspacePath = resolveProjectWorkspacePath(projectId, project?.workspacePath);
  if (!workspacePath) return null;
  return {
    projectId,
    workspaceId: project?.activeWorkspaceId || project?.canonicalSyncedWorkspaceId || "project-workspace",
    observedRevision: project?.canonicalSyncedRevision,
    observedRootHash: project?.canonicalSyncedRootHash,
    workspacePath,
  };
}

export function buildMarkdownReferenceIndex(
  context: MarkdownReferenceWorkspaceContext,
  options: { readMarkdown?: boolean; rebuild?: boolean; maxResourceBytes?: number } = {},
): MarkdownReferenceIndexResult {
  const readMarkdown = options.readMarkdown !== false;
  const readIndexJson = (relativePath: string) => {
    if (options.maxResourceBytes !== undefined) {
      const file = referenceFile(context.workspacePath, relativePath);
      if (file && fs.statSync(file).size > options.maxResourceBytes) {
        throw new Error("REFERENCE_RESOURCE_TOO_LARGE");
      }
    }
    return readWorkspaceJson(context.workspacePath, relativePath);
  };
  const project = readProjectMeta(context.projectId);
  const tree = readIndexJson("workspace-tree.json");
  if (tree && (!Array.isArray(tree.pages) || !Array.isArray(tree.folders))) throw new Error("REFERENCE_DIRECTORY_INVALID_TREE");
  const pages = (tree?.pages ?? []) as NonNullable<ResourceDirectorySnapshot["pages"]>;
  const folders = (tree?.folders ?? []) as Array<{ id: string; name: string; parentId?: string | null }>;
  for (const node of [...pages, ...folders]) {
    if (!node || typeof node.id !== "string" || !isValidWorkspacePathSegment(node.id) || typeof node.name !== "string") throw new Error("REFERENCE_DIRECTORY_INVALID_TREE");
  }
  const parsed = readIndexJson("knowledge/manifest.json");
  if (parsed && !Array.isArray(parsed.items)) throw new Error("REFERENCE_DIRECTORY_INVALID_MANIFEST");
  const parsedItems = parsed && Array.isArray(parsed.items) ? parsed.items : [];
  const documents: Array<Record<string, unknown>> = parsedItems.filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
  );

  const snapshot: ResourceDirectorySnapshot = {
    project: { id: context.projectId, name: project?.name || context.projectId },
    pages,
    documents: documents
      .filter((item) => item.source !== "system" && typeof item.id === "string" && typeof item.title === "string" && typeof item.fileName === "string" && isValidWorkspacePathSegment(item.fileName))
      .map((item) => ({
        id: item.id as string,
        title: item.title as string,
        source: item.source === "system" ? "system" : "user",
        description: typeof item.description === "string" ? item.description : "",
        fileName: item.fileName as string,
        addedAt: typeof item.addedAt === "string" ? item.addedAt : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
        tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
      })),
  };
  const directory = createResourceDirectory(snapshot);
  for (const document of snapshot.documents ?? []) {
    const target = { kind: "document" as const, projectId: context.projectId, docId: document.id };
    if (!referenceFile(context.workspacePath, `knowledge/${document.fileName}`)) {
      const entry = directory.get(target);
      if (entry) directory.add({ ...entry, state: "missing" });
    }
  }
  for (const entry of buildCandidateDirectoryEntries({
    projectId: context.projectId,
    pages: pages.map(page => ({ ...page, schema: JSON.stringify(readIndexJson(`demos/${page.id}/config.schema.json`)) })),
    folders,
  })) directory.add({ ...directory.get(entry.target), ...entry, displayPath: `${snapshot.project.name} / ${entry.displayPath}` });
  const addDocument = (documentKind: "memory" | "project-convention" | "page-convention" | "design-spec", docId: string, label: string, relativePath: string) => {
    if (!referenceFile(context.workspacePath, relativePath)) return;
    const groupLabels = { memory: "AI 记忆", "project-convention": "公约", "page-convention": "公约", "design-spec": "设计规范" };
    const group = groupLabels[documentKind];
    directory.add({ target: { kind: "document", projectId: context.projectId, documentKind, docId }, label, displayPath: `${snapshot.project.name} / ${group} / ${label}`, documentGroup: group, hierarchy: [{ id: `group:documents:${context.projectId}:${documentKind}`, label: group, kind: "group" }] });
  };
  addDocument("memory", "memory", "AI 记忆", "memory.md");
  addDocument("project-convention", "convention", "项目公约", "convention.md");
  for (const page of pages) addDocument("page-convention", page.id, `${page.name} 页面公约`, `demos/${page.id}/convention.md`);
  const specManifest = readIndexJson("design-spec/manifest.json");
  if (specManifest && !Array.isArray(specManifest.items)) throw new Error("REFERENCE_DIRECTORY_INVALID_MANIFEST");
  const specItems = specManifest && Array.isArray(specManifest.items) ? specManifest.items : [];
  for (const item of specItems) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(item.id)) continue;
    addDocument("design-spec", item.id, typeof item.title === "string" ? item.title : item.id, `design-spec/spec-${item.id}.json`);
  }
  snapshot.entries = directory.values();
  const index = new InMemoryMarkdownReferenceIndex();
  const sourceDocs: Array<{ source: MarkdownReferenceSource; markdown: string; contentHash?: string }> = [];
  const sourceLabels = new Map<string, string>();

  for (const document of snapshot.documents ?? []) {
    if (document.source === "system") continue;
    const source: MarkdownReferenceSource = {
      kind: "knowledge-document",
      projectId: context.projectId,
      workspaceId: context.workspaceId,
      docId: document.id,
    };
    const markdown = readMarkdown
      ? readWorkspaceMarkdown(context.workspacePath, path.join("knowledge", document.fileName))
      : "";
    if (readMarkdown) sourceDocs.push({ source, markdown, contentHash: hashWorkspaceContent(markdown) });
    sourceLabels.set(sourceKey(source), document.title);
  }
  for (const page of pages) {
    const source: MarkdownReferenceSource = {
      kind: "page-requirements",
      projectId: context.projectId,
      workspaceId: context.workspaceId,
      pageId: page.id,
    };
    const markdown = readMarkdown
      ? readWorkspaceMarkdown(context.workspacePath, path.join("demos", page.id, "requirements.md"))
      : "";
    if (readMarkdown && markdown) sourceDocs.push({ source, markdown, contentHash: hashWorkspaceContent(markdown) });
    sourceLabels.set(sourceKey(source), page.name);
  }

  // Governance Markdown files are fixed, registered resource keys.  They are
  // not inferred from arbitrary client paths, but can participate in the same
  // derived link graph when present in the workspace.
  const fixedSources: Array<{ source: MarkdownReferenceSource; relativePath: string; label: string }> = [
    {
      source: { kind: "workspace-memory", projectId: context.projectId, workspaceId: context.workspaceId },
      relativePath: "memory.md",
      label: "AI 记忆",
    },
    {
      source: { kind: "project-convention", projectId: context.projectId, workspaceId: context.workspaceId },
      relativePath: "convention.md",
      label: "项目公约",
    },
  ];
  for (const page of pages) {
    fixedSources.push({
      source: { kind: "page-convention", projectId: context.projectId, workspaceId: context.workspaceId, pageId: page.id },
      relativePath: path.join("demos", page.id, "convention.md"),
      label: `${page.name} 页面公约`,
    });
  }
  for (const item of fixedSources) {
    const markdown = readMarkdown ? readWorkspaceMarkdown(context.workspacePath, item.relativePath) : "";
    if (readMarkdown && !markdown) continue;
    if (readMarkdown) sourceDocs.push({ source: item.source, markdown, contentHash: hashWorkspaceContent(markdown) });
    sourceLabels.set(sourceKey(item.source), item.label);
  }

  // Config notes and richtext values are JSON-backed sources.  Their locator
  // is the schema field key plus a JSON pointer, never a client-supplied path.
  const configScopes: Array<{ scope: "project" | "page"; pageId?: string; schemaPath: string; valuesPath: string; label: string }> = [
    { scope: "project", schemaPath: "project.config.schema.json", valuesPath: "project.config.values.json", label: "共享配置" },
    ...pages.map((page) => ({ scope: "page" as const, pageId: page.id, schemaPath: path.join("demos", page.id, "config.schema.json"), valuesPath: path.join("demos", page.id, "config.values.json"), label: page.name })),
  ];
  for (const config of configScopes) {
    const schema = readIndexJson(config.schemaPath);
    if (!schema) continue;
    const values = readIndexJson(config.valuesPath);
    for (const field of schemaFields(schema)) {
      if (field.note?.trim()) {
        const source: MarkdownReferenceSource = {
          kind: "config-note",
          projectId: context.projectId,
          workspaceId: context.workspaceId,
          scope: config.scope,
          ...(config.pageId ? { pageId: config.pageId } : {}),
          fieldKey: field.key,
        };
        sourceDocs.push({ source, markdown: field.note });
        sourceLabels.set(sourceKey(source), `${config.label} / ${field.title} 备注`);
      }
      if (field.richtext) {
        const value = valueAtPointer(values, field.pointer);
        if (typeof value !== "string" || !value.trim()) continue;
        const source: MarkdownReferenceSource = {
          kind: "richtext-field",
          projectId: context.projectId,
          workspaceId: context.workspaceId,
          scope: config.scope,
          ...(config.pageId ? { pageId: config.pageId } : {}),
          fieldKey: field.key,
          jsonPointer: field.pointer,
        };
        sourceDocs.push({ source, markdown: value });
        sourceLabels.set(sourceKey(source), `${config.label} / ${field.title}`);
      }
    }
  }

  // DesignSpec entries are JSON-backed Markdown sources.  The entry ID is the
  // stable locator; the JSON file remains an implementation detail.
  const designSpecManifestPath = path.join(context.workspacePath, "design-spec", "manifest.json");
  try {
    if (!readMarkdown) throw new Error("skip-design-spec-content");
    const manifest = JSON.parse(fs.readFileSync(designSpecManifestPath, "utf-8")) as { items?: unknown };
    const items = Array.isArray(manifest.items) ? manifest.items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const spec = item as { id?: unknown; title?: unknown };
      if (typeof spec.id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(spec.id)) continue;
      const specPath = path.join(context.workspacePath, "design-spec", `spec-${spec.id}.json`);
      let doc: { title?: unknown; entries?: unknown };
      try {
        doc = JSON.parse(fs.readFileSync(specPath, "utf-8")) as { title?: unknown; entries?: unknown };
      } catch {
        continue;
      }
      if (!Array.isArray(doc.entries)) continue;
      for (const entryValue of doc.entries) {
        if (!entryValue || typeof entryValue !== "object") continue;
        const entry = entryValue as { id?: unknown; title?: unknown; markdown?: unknown };
        if (typeof entry.id !== "string" || typeof entry.markdown !== "string" || !entry.markdown) continue;
        const source: MarkdownReferenceSource = {
          kind: "design-spec-entry",
          projectId: context.projectId,
          workspaceId: context.workspaceId,
          specId: spec.id,
          entryId: entry.id,
        };
        sourceDocs.push({ source, markdown: entry.markdown, contentHash: hashWorkspaceContent(entry.markdown) });
        const specLabel = typeof doc.title === "string" ? doc.title : typeof spec.title === "string" ? spec.title : spec.id;
        sourceLabels.set(sourceKey(source), `${specLabel} / ${typeof entry.title === "string" ? entry.title : entry.id}`);
      }
    }
  } catch {
    // DesignSpec is optional; a missing/corrupt manifest must not block other sources.
  }

  if (options.rebuild !== false) index.rebuild({
    directory,
    documents: sourceDocs,
    projectId: context.projectId,
    workspaceId: context.workspaceId,
    authorityRevision: context.observedRevision,
    authorityRootHash: context.observedRootHash,
    parse: (markdown): readonly ParsedIndexReference[] => {
      const parsed = parseMarkdownReferences(markdown);
      return parsed.references.map((reference) => ({
        target: reference.target,
        labelSnapshot: reference.labelSnapshot,
        start: reference.start,
        end: reference.end,
        line: reference.line,
        column: reference.column,
      }));
    },
  });
  return { context, snapshot, directory, index, sources: sourceDocs.map((item) => item.source), sourceLabels, sourceDocuments: sourceDocs };
}

export interface PersistentMarkdownReferenceIndexResult extends Omit<MarkdownReferenceIndexResult, "index"> {
  index: SqliteMarkdownReferenceIndex;
  status: "ready" | "stale";
}

/** Build once for an explicit rebuild operation and persist the derived graph. */
export function rebuildPersistentMarkdownReferenceIndex(
  context: MarkdownReferenceWorkspaceContext,
): PersistentMarkdownReferenceIndexResult {
  const collected = buildMarkdownReferenceIndex(context, { readMarkdown: true, rebuild: false });
  const index = new SqliteMarkdownReferenceIndex();
  const snapshot = index.rebuild({
    projectId: context.projectId,
    directory: collected.directory,
    documents: collected.sourceDocuments,
    workspaceId: context.workspaceId,
    authorityRevision: context.observedRevision,
    authorityRootHash: context.observedRootHash,
    parse: parseIndexReferences,
  });
  return { ...collected, index, status: snapshot ? "ready" : "stale" };
}

/** Open the derived graph for ordinary queries without scanning Workspace files. */
export function openPersistentMarkdownReferenceIndex(
  context: MarkdownReferenceWorkspaceContext,
): PersistentMarkdownReferenceIndexResult {
  const collected = buildMarkdownReferenceIndex(context, { readMarkdown: false, rebuild: false });
  const index = new SqliteMarkdownReferenceIndex();
  const current = index.snapshot({ projectId: context.projectId, workspaceId: context.workspaceId });
  return { ...collected, index, status: isCurrentSnapshot(current, context) ? "ready" : "stale" };
}

export function isCurrentSnapshot(
  snapshot: { authorityRevision?: number; authorityRootHash?: string; parserVersion?: string } | null,
  context: MarkdownReferenceWorkspaceContext,
): boolean {
  if (!snapshot) return false;
  if (snapshot.parserVersion !== MARKDOWN_REFERENCE_INDEX_VERSION) return false;
  if (typeof context.observedRevision === "number" && typeof snapshot.authorityRevision === "number") {
    if (snapshot.authorityRevision < context.observedRevision) return false;
    if (snapshot.authorityRevision === context.observedRevision && context.observedRootHash && snapshot.authorityRootHash !== context.observedRootHash) return false;
  }
  return true;
}

function parseIndexReferences(markdown: string): readonly ParsedIndexReference[] {
  const parsed = parseMarkdownReferences(markdown);
  return parsed.references.map((reference) => ({
    target: reference.target,
    labelSnapshot: reference.labelSnapshot,
    start: reference.start,
    end: reference.end,
    line: reference.line,
    column: reference.column,
  }));
}

export function toCandidateList(
  result: MarkdownReferenceIndexResult,
  query: string,
  kinds?: MarkdownReferenceTarget["kind"][],
): MarkdownReferenceCandidate[] {
  const resolver = createEntityResolver(result.directory, result.context.projectId);
  return resolver.candidates({ allowedTargetKinds: kinds, sameProjectOnly: true }, query);
}

export function serializeLinkRecord(record: MarkdownLinkRecord, sourceLabels: Map<string, string>) {
  const sourceLabel = sourceLabels.get(sourceKey(record.source)) || "未命名文档";
  return {
    source: record.source,
    sourceLabel,
    // Do not echo a cross-project/forbidden target ID: callers must not be
    // able to distinguish a forbidden entity from an unknown one.
    target: record.targetState === "forbidden" ? null : record.target,
    labelSnapshot: record.labelSnapshot,
    start: record.start,
    end: record.end,
    line: record.line,
    column: record.column,
    targetState: record.targetState === "active" ? "resolved" : "unavailable",
  };
}

export function parseTarget(kind: string | null, id: string | null, projectId: string, options: { pageId?: string; fieldPath?: string; documentKind?: string } = {}): MarkdownReferenceTarget | null {
  if (!kind || !id) return null;
  if (id.startsWith("wb://")) {
    const target = decodeMarkdownReferenceUri(id);
    return target?.projectId === projectId && target.kind === kind ? target : null;
  }
  if (kind === "config" && options.pageId && options.fieldPath) return { kind, projectId, pageId: options.pageId, fieldPath: options.fieldPath };
  if (kind === "document" && options.documentKind && options.documentKind !== "knowledge") return decodeMarkdownReferenceUri(`wb://document/${encodeURIComponent(projectId)}/${encodeURIComponent(options.documentKind)}/${encodeURIComponent(id)}`) ?? null;
  if (kind === "project") return { kind, projectId: id };
  if (kind === "page") return { kind, projectId, pageId: id };
  if (kind === "document") return { kind, projectId, docId: id };
  return null;
}
