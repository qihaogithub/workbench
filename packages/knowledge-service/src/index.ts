import fs from "node:fs";
import path from "node:path";

import {
  buildKnowledgeReport,
  canAccessKnowledgeItem,
  compareKnowledgeItemsByAuthority,
  filterKnowledgeItems,
  type AccessContext,
  type KnowledgeIndexJob,
  type KnowledgeItem,
  type KnowledgeReadingMap,
} from "@opencode-workbench/knowledge-core";

interface WorkspaceTreeFile {
  pages?: Array<{
    id?: unknown;
    name?: unknown;
    file?: unknown;
    path?: unknown;
    order?: unknown;
  }>;
}

interface WorkspaceKnowledgeManifest {
  items?: Array<{
    id?: unknown;
    title?: unknown;
    path?: unknown;
    fileName?: unknown;
    description?: unknown;
    tags?: unknown;
    addedAt?: unknown;
    updatedAt?: unknown;
  }>;
}

export interface KnowledgeFileStoreOptions {
  dataDir: string;
}

export interface TemplateIndexInput {
  templateId: string;
  templateName: string;
  templateDescription: string;
  workspacePath: string;
}

export interface SearchInput {
  query: string;
  context: AccessContext;
  limit?: number;
  sourceTypes?: KnowledgeItem["sourceType"][];
  tags?: string[];
}

export interface RelatedInput {
  itemId: string;
  context: AccessContext;
  limit?: number;
}

export interface ReportInput {
  question: string;
  context: AccessContext;
  limit?: number;
  missingHints?: string[];
  riskHints?: string[];
}

export interface KnowledgeOrganizerResult {
  summary: string;
  keywords: string[];
  tags: string[];
}

export interface KnowledgeOrganizer {
  summarize(entry: {
    title: string;
    path: string;
    summary: string;
  }): Promise<KnowledgeOrganizerResult>;
}

export interface RetrievalBackend {
  search(input: SearchInput): KnowledgeItem[];
  read(input: { itemId: string; context: AccessContext; original?: boolean }): KnowledgeItem | null;
  related(input: RelatedInput): KnowledgeItem[];
  report(input: ReportInput): ReturnType<typeof buildKnowledgeReport>;
}

const READING_MAP_RELATIVE_ROOT = "knowledge/templates";

export class KnowledgeFileStore {
  readonly dataDir: string;
  readonly knowledgeDir: string;
  readonly jobsDir: string;
  readonly templatesDir: string;

  constructor(options: KnowledgeFileStoreOptions) {
    this.dataDir = options.dataDir;
    this.knowledgeDir = path.join(options.dataDir, "knowledge");
    this.jobsDir = path.join(this.knowledgeDir, "index-jobs");
    this.templatesDir = path.join(this.knowledgeDir, "templates");
  }

  writeIndexJob(job: KnowledgeIndexJob): KnowledgeIndexJob {
    writeJson(path.join(this.jobsDir, `${job.id}.json`), job);
    return job;
  }

  readIndexJob(jobId: string): KnowledgeIndexJob | null {
    return readJson<KnowledgeIndexJob>(path.join(this.jobsDir, `${safeFileName(jobId)}.json`));
  }

  listIndexJobs(): KnowledgeIndexJob[] {
    if (!fs.existsSync(this.jobsDir)) return [];
    return fs
      .readdirSync(this.jobsDir)
      .filter((fileName) => fileName.endsWith(".json"))
      .map((fileName) => readJson<KnowledgeIndexJob>(path.join(this.jobsDir, fileName)))
      .filter((job): job is KnowledgeIndexJob => Boolean(job))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  writeTemplateReadingMap(templateId: string, map: KnowledgeReadingMap): string {
    const relativePath = `${READING_MAP_RELATIVE_ROOT}/${templateId}/reading-map.json`;
    writeJson(path.join(this.dataDir, relativePath), map);
    return relativePath;
  }

  readTemplateReadingMap(templateId: string): KnowledgeReadingMap | null {
    return readJson<KnowledgeReadingMap>(
      path.join(this.dataDir, READING_MAP_RELATIVE_ROOT, safeFileName(templateId), "reading-map.json"),
    );
  }
}

export class BasicRetrievalBackend implements RetrievalBackend {
  constructor(private readonly items: KnowledgeItem[]) {}

  search(input: SearchInput): KnowledgeItem[] {
    const queryTokens = tokenize(input.query);
    const tagSet = new Set(input.tags ?? []);
    const filtered = filterKnowledgeItems(this.items, input.context, "search").filter((item) => {
      if (input.sourceTypes && !input.sourceTypes.includes(item.sourceType)) return false;
      if (tagSet.size > 0 && !item.tags.some((tag) => tagSet.has(tag))) return false;
      if (queryTokens.length === 0) return true;
      return scoreItem(item, queryTokens) > 0;
    });
    return filtered
      .sort((left, right) => {
        const scoreDiff = scoreItem(right, queryTokens) - scoreItem(left, queryTokens);
        if (scoreDiff !== 0) return scoreDiff;
        return compareKnowledgeItemsByAuthority(left, right);
      })
      .slice(0, input.limit ?? 10);
  }

  read(input: { itemId: string; context: AccessContext; original?: boolean }): KnowledgeItem | null {
    const item = this.items.find((candidate) => candidate.id === input.itemId);
    if (!item) return null;
    const capability = input.original ? "readOriginal" : "readSummary";
    return canAccessKnowledgeItem(item, input.context, capability).allowed ? item : null;
  }

  related(input: RelatedInput): KnowledgeItem[] {
    const source = this.items.find((item) => item.id === input.itemId);
    if (!source || !canAccessKnowledgeItem(source, input.context, "related").allowed) {
      return [];
    }
    const relatedIds = new Set([
      source.id,
      ...source.relations.map((relation) => relation.targetId),
      ...this.items
        .filter((item) => item.relations.some((relation) => relation.targetId === source.id))
        .map((item) => item.id),
    ]);
    return filterKnowledgeItems(
      this.items.filter((item) => relatedIds.has(item.id)),
      input.context,
      "related",
    ).slice(0, input.limit ?? 10);
  }

  report(input: ReportInput) {
    const items = this.search({
      query: input.question,
      context: input.context,
      limit: input.limit ?? 8,
    });
    return buildKnowledgeReport({
      question: input.question,
      context: input.context,
      items,
      missing: input.missingHints,
      risks: input.riskHints,
    });
  }
}

export function createTemplateIndexJob(
  store: KnowledgeFileStore,
  input: TemplateIndexInput,
): KnowledgeIndexJob {
  const now = new Date().toISOString();
  return store.writeIndexJob({
    id: `kjob_${input.templateId}_${Date.now()}`,
    targetType: "template",
    targetId: input.templateId,
    targetTitle: input.templateName,
    targetDescription: input.templateDescription,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    workspacePath: input.workspacePath,
    itemCount: 0,
  });
}

export function indexTemplateSnapshot(
  store: KnowledgeFileStore,
  input: TemplateIndexInput,
): KnowledgeIndexJob {
  const job = createTemplateIndexJob(store, input);
  return runBasicTemplateIndexJob(store, job.id);
}

export function runBasicTemplateIndexJob(
  store: KnowledgeFileStore,
  jobId: string,
): KnowledgeIndexJob {
  const job = store.readIndexJob(jobId);
  if (!job || job.targetType !== "template" || !job.workspacePath) {
    throw new Error("INDEX_JOB_NOT_FOUND");
  }
  const workspacePath = job.workspacePath;
  const running = store.writeIndexJob({
    ...job,
    status: "running",
    updatedAt: new Date().toISOString(),
  });

  try {
    const templateMeta = readTemplateMetaFromWorkspace(running.targetId, workspacePath);
    const readingMap = generateTemplateReadingMap({
      templateId: running.targetId,
      templateName: running.targetTitle ?? templateMeta.name,
      templateDescription: running.targetDescription ?? templateMeta.description,
      workspacePath,
    });
    const readingMapPath = store.writeTemplateReadingMap(running.targetId, readingMap);
    return store.writeIndexJob({
      ...running,
      status: "ready",
      updatedAt: new Date().toISOString(),
      readingMapPath,
      itemCount:
        readingMap.structure.pages.length +
        readingMap.structure.configs.length +
        readingMap.structure.knowledgeDocuments.length,
    });
  } catch (error) {
    return store.writeIndexJob({
      ...running,
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function markTemplateKnowledgeStale(
  store: KnowledgeFileStore,
  templateId: string,
  reason: string,
): KnowledgeIndexJob | null {
  const latest = store
    .listIndexJobs()
    .find((job) => job.targetType === "template" && job.targetId === templateId);
  if (!latest) return null;
  return store.writeIndexJob({
    ...latest,
    status: "stale",
    statusReason: reason,
    updatedAt: new Date().toISOString(),
  });
}

export async function enrichTemplateReadingMap(
  store: KnowledgeFileStore,
  templateId: string,
  organizer: KnowledgeOrganizer,
): Promise<KnowledgeReadingMap | null> {
  const map = store.readTemplateReadingMap(templateId);
  if (!map) return null;
  const enrichedEntries = await Promise.all(
    map.localSummaries.map(async (entry) => {
      const result = await organizer.summarize(entry);
      return {
        ...entry,
        summary: result.summary || entry.summary,
      };
    }),
  );
  const enrichedMap: KnowledgeReadingMap = {
    ...map,
    localSummaries: enrichedEntries,
    structure: {
      ...map.structure,
      pages: replaceEntries(map.structure.pages, enrichedEntries),
      configs: replaceEntries(map.structure.configs, enrichedEntries),
      knowledgeDocuments: replaceEntries(map.structure.knowledgeDocuments, enrichedEntries),
    },
  };
  store.writeTemplateReadingMap(templateId, enrichedMap);
  return enrichedMap;
}

export function generateTemplateReadingMap(input: {
  templateId: string;
  templateName: string;
  templateDescription: string;
  workspacePath: string;
  now?: string;
}): KnowledgeReadingMap {
  const now = input.now ?? new Date().toISOString();
  const pages = readWorkspacePages(input.workspacePath);
  const configs = readWorkspaceConfigs(input.workspacePath);
  const knowledgeDocuments = readWorkspaceKnowledgeDocuments(input.workspacePath);
  const originalEntries = [
    ...pages,
    ...configs,
    ...knowledgeDocuments,
  ];

  return {
    id: `reading-map:${input.templateId}`,
    targetType: "template",
    targetId: input.templateId,
    overview: {
      title: input.templateName,
      scene: input.templateDescription,
      pageCount: pages.length,
      configCount: configs.length,
      knowledgeCount: knowledgeDocuments.length,
      updatedAt: now,
    },
    structure: {
      pages,
      configs,
      knowledgeDocuments,
      assets: [],
    },
    localSummaries: originalEntries,
    taskEntries: buildTaskEntries(pages, configs, knowledgeDocuments),
    originalEntries,
  };
}

function readTemplateMetaFromWorkspace(
  templateId: string,
  workspacePath: string,
): { name: string; description: string } {
  const templateJsonPath = path.join(path.dirname(workspacePath), "template.json");
  const parsed = readJson<{ name?: unknown; description?: unknown }>(templateJsonPath);
  return {
    name: typeof parsed?.name === "string" ? parsed.name : templateId,
    description:
      typeof parsed?.description === "string" ? parsed.description : "模板基础阅读地图",
  };
}

function readWorkspacePages(workspacePath: string) {
  const tree = readJson<WorkspaceTreeFile>(path.join(workspacePath, "workspace-tree.json"));
  return (tree?.pages ?? [])
    .map((page, index) => {
      const id = typeof page.id === "string" ? page.id : `page-${index + 1}`;
      const title = typeof page.name === "string" ? page.name : id;
      const filePath =
        typeof page.file === "string"
          ? page.file
          : typeof page.path === "string"
            ? page.path
            : `pages/${id}.tsx`;
      return {
        id,
        title,
        name: title,
        path: filePath,
        summary: `页面：${title}`,
        order: typeof page.order === "number" ? page.order : index,
      };
    })
    .sort((left, right) => left.order - right.order)
    .map(({ order: _order, name: _name, ...entry }) => entry);
}

function readWorkspaceConfigs(workspacePath: string) {
  const configPath = path.join(workspacePath, "project.config.schema.json");
  if (!fs.existsSync(configPath)) return [];
  const schema = readJson<{ title?: unknown; properties?: Record<string, unknown> }>(configPath);
  const propertyNames = schema?.properties ? Object.keys(schema.properties) : [];
  return [
    {
      id: "project-config-schema",
      title: typeof schema?.title === "string" ? schema.title : "项目配置",
      path: "project.config.schema.json",
      summary: propertyNames.length > 0 ? `包含配置项：${propertyNames.join(", ")}` : "项目配置 Schema",
    },
  ];
}

function readWorkspaceKnowledgeDocuments(workspacePath: string) {
  const knowledgeDir = path.join(workspacePath, "knowledge");
  const manifest = readJson<WorkspaceKnowledgeManifest>(path.join(knowledgeDir, "manifest.json"));
  if (manifest?.items?.length) {
    return manifest.items
      .map((item, index) => {
        const manifestPath =
          typeof item.path === "string"
            ? item.path
            : typeof item.fileName === "string"
              ? item.fileName
              : "";
        const fileName = safeKnowledgeRelativePath(manifestPath);
        if (!fileName) return null;
        return {
          id: typeof item.id === "string" ? item.id : `knowledge-${index + 1}`,
          title: typeof item.title === "string" ? item.title : fileName,
          path: `knowledge/${fileName}`,
          summary:
            typeof item.description === "string" && item.description.trim()
              ? item.description
              : `知识文档：${fileName}`,
          tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [],
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  if (!fs.existsSync(knowledgeDir)) return [];
  return fs
    .readdirSync(knowledgeDir)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => ({
      id: `knowledge:${fileName}`,
      title: fileName.replace(/\.md$/, ""),
      path: `knowledge/${fileName}`,
      summary: `知识文档：${fileName}`,
    }));
}

function safeKnowledgeRelativePath(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^knowledge\//, "");
  if (!normalized || path.isAbsolute(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.includes("..") || parts.some((part) => part.trim() === "")) return null;
  if (!normalized.endsWith(".md")) return null;
  return normalized;
}

function buildTaskEntries(
  pages: Array<{ path: string }>,
  configs: Array<{ path: string }>,
  docs: Array<{ path: string }>,
) {
  const entries = [
    {
      taskType: "修改页面",
      description: "先阅读相关页面摘要，再打开页面原文。",
      recommendedPaths: pages.map((page) => page.path),
    },
    {
      taskType: "修改配置",
      description: "先确认配置 Schema，再结合知识文档判断业务约束。",
      recommendedPaths: [...configs.map((config) => config.path), ...docs.map((doc) => doc.path)],
    },
    {
      taskType: "排查异常",
      description: "从页面、配置和知识文档三个入口交叉确认。",
      recommendedPaths: [...pages, ...configs, ...docs].map((entry) => entry.path),
    },
  ];
  return entries.filter((entry) => entry.recommendedPaths.length > 0);
}

function replaceEntries<T extends { id: string; summary: string }>(
  entries: T[],
  enrichedEntries: Array<{ id: string; summary: string }>,
): T[] {
  const summaryById = new Map(enrichedEntries.map((entry) => [entry.id, entry.summary]));
  return entries.map((entry) => ({
    ...entry,
    summary: summaryById.get(entry.id) ?? entry.summary,
  }));
}

function tokenize(query: string): string[] {
  const baseTokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
  const cjkTokens = baseTokens.flatMap((token) => {
    const chars = [...token].filter((char) => /\p{Script=Han}/u.test(char));
    if (chars.length < 2) return [];
    return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
  });
  return [...new Set([...baseTokens, ...cjkTokens])];
}

function scoreItem(item: KnowledgeItem, queryTokens: string[]): number {
  const haystack = [
    item.title,
    item.summary,
    ...item.tags,
    ...item.keywords,
    item.contentSnippet ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}
