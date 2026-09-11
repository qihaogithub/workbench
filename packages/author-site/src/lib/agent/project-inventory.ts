import fs from "node:fs";
import path from "node:path";
import {
  buildProjectInventory,
  hashWorkspaceContent,
  type InventoryBuildResult,
  type InventoryGovernanceDocumentInput,
} from "@workbench/project-core";
import {
  PROJECT_INVENTORY_GENERATOR_VERSION,
  PROJECT_INVENTORY_SCHEMA_VERSION,
  type InventoryOverridesFile,
  type InventorySnapshot,
  type InventoryGeneratedSemantic,
} from "@workbench/shared";
import { isValidWorkspacePathSegment } from "@workbench/shared/workspace-path";
import { KnowledgeServiceClient } from "@workbench/knowledge-service/client";
import { listDemoPages, readProjectMeta, readWorkspaceTree } from "@/lib/fs-utils";
import type { MarkdownReferenceWorkspaceContext } from "@/lib/markdown-references";
import { buildMarkdownReferenceIndex } from "@/lib/markdown-references";
import { getWorkspaceAuthorityHealth } from "@/lib/workspace-authority-client";
export { formatInventoryL3, formatInventoryUnavailableL3, projectInventoryEntries, queryProjectInventory, redactUnavailableInventoryEntry } from "./inventory-projection";

const knowledgeService = new KnowledgeServiceClient();

export interface ProjectInventoryContext {
  snapshot: InventorySnapshot;
  generationRequests: InventoryBuildResult["generationRequests"];
  source: "derived" | "workspace";
}

export function buildWorkspaceInventory(
  context: MarkdownReferenceWorkspaceContext,
  generated?: ReadonlyMap<string, InventoryGeneratedSemantic>,
  previous?: ReadonlyMap<string, import("@workbench/shared").InventoryEntry>,
  forceGeneration = false,
): InventoryBuildResult {
  const project = readProjectMeta(context.projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const tree = readWorkspaceTree(context.workspacePath);
  const listedPages = listDemoPages(context.workspacePath);
  const listedById = new Map(listedPages.map((page) => [page.id, page]));
  // Keep declared tree pages even when their runtime files disappeared. The
  // inventory must distinguish a missing source from a page that was removed
  // from the tree; buildProjectInventory can then retain the latter as
  // deleted when a previous generation is supplied.
  const pages = [
    ...tree.pages
      .filter((page) => isValidWorkspacePathSegment(page.id))
      .map((page) => ({
        ...(listedById.get(page.id) ?? page),
        sourceState: listedById.has(page.id) ? "active" as const : "missing" as const,
      })),
    ...listedPages
      .filter((page) => !tree.pages.some((treePage) => treePage.id === page.id))
      .map((page) => ({ ...page, sourceState: "active" as const })),
  ].map((page) => ({
    id: page.id,
    name: page.name,
    parentId: page.parentId,
    routeKey: page.routeKey,
    runtimeType: page.runtimeType,
    schema: readText(context.workspacePath, path.join("demos", page.id, "config.schema.json")) ?? undefined,
    sourceState: page.sourceState ?? "active" as const,
    requirementsContentHash: contentHash(context.workspacePath, path.join("demos", page.id, "requirements.md")),
    conventionContentHash: contentHash(context.workspacePath, path.join("demos", page.id, "convention.md")),
  }));
  const rawManifest = readJson(context.workspacePath, "knowledge/manifest.json");
  const manifestItems = Array.isArray(rawManifest?.items) ? rawManifest.items : [];
  const documents = manifestItems.flatMap((raw) => {
    if (!isRecord(raw) || raw.source === "system" || typeof raw.id !== "string" || typeof raw.title !== "string") return [];
    const fileName = typeof raw.fileName === "string" && isValidWorkspacePathSegment(raw.fileName) ? raw.fileName : undefined;
    return [{
      id: raw.id,
      title: raw.title,
      description: typeof raw.description === "string" ? raw.description : null,
      fileName,
      aiSummary: typeof raw.aiSummary === "string" ? raw.aiSummary : undefined,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
      contentHash: fileName ? contentHash(context.workspacePath, path.join("knowledge", fileName)) : undefined,
      sourceState: fileName && fileExists(context.workspacePath, path.join("knowledge", fileName)) ? "active" as const : "missing" as const,
    }];
  });
  const governanceDocuments: InventoryGovernanceDocumentInput[] = [
    fileExists(context.workspacePath, "memory.md") ? { documentKind: "memory" as const, id: "memory", title: "AI 记忆", contentHash: contentHash(context.workspacePath, "memory.md") } : null,
    fileExists(context.workspacePath, "convention.md") ? { documentKind: "project-convention" as const, id: "convention", title: "项目公约", contentHash: contentHash(context.workspacePath, "convention.md") } : null,
    ...pages.flatMap((page) => fileExists(context.workspacePath, path.join("demos", page.id, "convention.md"))
      ? [{ documentKind: "page-convention" as const, id: page.id, pageId: page.id, title: `${page.name} 页面公约`, contentHash: contentHash(context.workspacePath, path.join("demos", page.id, "convention.md")) }]
      : []),
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
  const specManifest = readJson(context.workspacePath, "design-spec/manifest.json");
  if (Array.isArray(specManifest?.items)) {
    for (const item of specManifest.items) {
      if (!isRecord(item) || typeof item.id !== "string") continue;
      governanceDocuments.push({ documentKind: "design-spec", id: item.id, title: typeof item.title === "string" ? item.title : item.id, contentHash: contentHash(context.workspacePath, path.join("design-spec", `spec-${item.id}.json`)), sourceState: fileExists(context.workspacePath, path.join("design-spec", `spec-${item.id}.json`)) ? "active" : "missing" });
    }
  }
  let externalDeclarations: import("@workbench/project-core").MarkdownLinkRecord[] = [];
  try {
    const references = buildMarkdownReferenceIndex(context, { readMarkdown: true, rebuild: true });
    externalDeclarations = references.index.snapshot()?.records.filter((record) => record.target.projectId !== context.projectId) ?? [];
  } catch {
    externalDeclarations = [];
  }
  const overrides = readOverrides(context.workspacePath);
  return buildProjectInventory({
    project: {
      id: project.id,
      name: project.name,
      description: project.templateSettings?.description ?? project.description ?? null,
    },
    pages,
    folders: tree.folders,
    documents,
    governanceDocuments,
    externalDeclarations,
    projectSchema: readText(context.workspacePath, "project.config.schema.json") ?? undefined,
    workspaceRevision: context.observedRevision ?? null,
    workspaceRootHash: context.observedRootHash ?? hashWorkspaceContent(JSON.stringify(tree)),
    overrides,
    generated,
    previous,
    forceGeneration,
  });
}

export async function getProjectInventory(
  context: MarkdownReferenceWorkspaceContext,
): Promise<ProjectInventoryContext> {
  try {
    const snapshot = await knowledgeService.getInventorySnapshot(context.projectId);
    if (snapshot && snapshot.freshness !== "unavailable") {
      return { snapshot, generationRequests: [], source: "derived" };
    }
  } catch {
    // Fall through to the query endpoint and finally the local directory.
  }
  try {
    const current = await knowledgeService.getInventory(context.projectId, 100);
    if (current.freshness !== "unavailable") {
      return { snapshot: queryResultToSnapshot(context, current), generationRequests: [], source: "derived" };
    }
  } catch {
    // Fall through to a bounded deterministic workspace directory.
  }
  const built = buildWorkspaceInventory(context);
  return { snapshot: built.snapshot, generationRequests: built.generationRequests, source: "workspace" };
}

export async function reconcileProjectInventory(
  context: MarkdownReferenceWorkspaceContext,
  sessionId: string,
): Promise<{ snapshot: InventorySnapshot; generationId: number; queued: number }> {
  const current = await knowledgeService.getInventorySnapshot(context.projectId).catch(() => null);
  const generated = current?.entries
    ? new Map(current.entries.filter((entry) => entry.generated).map((entry) => [entry.canonicalUri, entry.generated!]))
    : undefined;
  const previous = current?.entries ? new Map(current.entries.map((entry) => [entry.canonicalUri, entry])) : undefined;
  const authorityInput = { projectId: context.projectId, workspaceId: context.workspaceId, sessionId };
  const observed = await getWorkspaceAuthorityHealth(authorityInput);
  if (!observed.ready || observed.revision === undefined || !observed.rootHash) {
    throw new Error("INVENTORY_AUTHORITY_UNAVAILABLE");
  }
  const buildContext = { ...context, observedRevision: observed.revision, observedRootHash: observed.rootHash };
  const built = buildWorkspaceInventory(buildContext, generated, previous, true);
  const latest = await getWorkspaceAuthorityHealth(authorityInput);
  if (!latest.ready || latest.revision !== observed.revision || latest.rootHash !== observed.rootHash) {
    throw new Error("INVENTORY_STALE");
  }
  const { generationId } = await knowledgeService.publishInventory(built.snapshot);
  const queued = await knowledgeService.createInventoryJobs(context.projectId, built.generationRequests, built.snapshot.generatorVersion);
  return { snapshot: built.snapshot, generationId, queued };
}

function queryResultToSnapshot(
  context: MarkdownReferenceWorkspaceContext,
  result: Awaited<ReturnType<KnowledgeServiceClient["getInventory"]>>,
): InventorySnapshot {
  return {
    schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
    projectId: context.projectId,
    workspaceRevision: context.observedRevision ?? null,
    workspaceRootHash: context.observedRootHash ?? null,
    catalogFingerprint: "derived",
    overlayHash: "derived",
    projectionFingerprint: "derived",
    generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
    builtAt: new Date().toISOString(),
    freshness: result.freshness,
    entries: result.entries.map(({ resolved: _resolved, matchedBy: _matchedBy, targetAvailability: _targetAvailability, ...entry }) => entry),
  };
}

function readOverrides(workspacePath: string): InventoryOverridesFile | null {
  const value = readJson(workspacePath, "project.inventory-overrides.json");
  return value?.schemaVersion === PROJECT_INVENTORY_SCHEMA_VERSION
    ? value as unknown as InventoryOverridesFile
    : null;
}

function readJson(workspacePath: string, relativePath: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(workspacePath, relativePath), "utf8"));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function readText(workspacePath: string, relativePath: string): string | null {
  try { return fs.readFileSync(path.join(workspacePath, relativePath), "utf8"); } catch { return null; }
}

function contentHash(workspacePath: string, relativePath: string): string | undefined {
  const content = readText(workspacePath, relativePath);
  return content === null ? undefined : hashWorkspaceContent(content);
}

function fileExists(workspacePath: string, relativePath: string): boolean {
  try { return fs.statSync(path.join(workspacePath, relativePath)).isFile(); } catch { return false; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
