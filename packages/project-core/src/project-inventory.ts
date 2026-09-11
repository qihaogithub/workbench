import crypto from "node:crypto";

import {
  canonicalInventoryJson,
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
  normalizeInventoryHuman,
  PROJECT_INVENTORY_GENERATOR_VERSION,
  PROJECT_INVENTORY_SCHEMA_VERSION,
  type InventoryEntry,
  type InventoryEvidenceRef,
  type InventoryGeneratedSemantic,
  type InventoryHumanOverlay,
  type InventoryOverridesFile,
  type InventoryReferenceDeclaration,
  type InventorySnapshot,
  type InventorySourceState,
  type MarkdownReferenceTarget,
} from "@workbench/shared";
import { enumerateSchemaFields } from "@workbench/shared/demo/config-schema-fields";

import { buildCandidateDirectoryEntries } from "./markdown-references/candidate-directory.js";
import type {
  MarkdownLinkRecord,
  ResourceDirectoryEntry,
} from "./markdown-references/types.js";

const MAX_TEXT_FIELD_LENGTH = 4_000;

export interface InventoryProjectInput {
  id: string;
  name: string;
  description?: string | null;
}

export interface InventoryPageInput {
  id: string;
  name: string;
  parentId?: string | null;
  routeKey?: string;
  runtimeType?: string;
  schema?: string;
  sourceState?: InventorySourceState;
  requirementsContentHash?: string;
  conventionContentHash?: string;
}

export interface InventoryDocumentInput {
  id: string;
  title: string;
  description?: string | null;
  fileName?: string;
  aiSummary?: string;
  updatedAt?: string;
  contentHash?: string;
  sourceState?: InventorySourceState;
}

export interface InventoryGovernanceDocumentInput {
  documentKind: "memory" | "project-convention" | "page-convention" | "design-spec";
  id: string;
  title: string;
  contentHash?: string;
  pageId?: string;
  sourceState?: InventorySourceState;
}

export interface InventoryBuildInput {
  project: InventoryProjectInput;
  pages: readonly InventoryPageInput[];
  folders?: readonly { id: string; name: string; parentId?: string | null }[];
  documents?: readonly InventoryDocumentInput[];
  governanceDocuments?: readonly InventoryGovernanceDocumentInput[];
  externalDeclarations?: readonly MarkdownLinkRecord[];
  projectSchema?: string;
  workspaceRevision?: number | null;
  workspaceRootHash?: string | null;
  overrides?: InventoryOverridesFile | null;
  generated?: ReadonlyMap<string, InventoryGeneratedSemantic>;
  previous?: ReadonlyMap<string, InventoryEntry>;
  generationEnabled?: boolean;
  /** Explicit reconcile may enqueue manual-refresh entries as well. */
  forceGeneration?: boolean;
  builtAt?: string;
}

export interface InventoryGenerationRequest {
  canonicalUri: string;
  sourceFingerprint: string;
  evidenceRefs: InventoryEvidenceRef[];
}

export interface InventoryBuildResult {
  snapshot: InventorySnapshot;
  generationRequests: InventoryGenerationRequest[];
}

export class InventoryOverridesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryOverridesError";
  }
}

export function hashInventoryValue(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(canonicalInventoryJson(value))
    .digest("hex");
}

export function validateInventoryOverrides(
  value: unknown,
): InventoryOverridesFile {
  if (!isRecord(value) || value.schemaVersion !== PROJECT_INVENTORY_SCHEMA_VERSION || !isRecord(value.entries)) {
    throw new InventoryOverridesError("INVENTORY_OVERRIDES_INVALID");
  }
  const entries: Record<string, InventoryHumanOverlay> = {};
  for (const [canonicalUri, rawOverlay] of Object.entries(value.entries)) {
    const target = decodeMarkdownReferenceUri(canonicalUri);
    if (!target || encodeMarkdownReferenceUri(target) !== canonicalUri || !isRecord(rawOverlay)) {
      throw new InventoryOverridesError("INVENTORY_OVERRIDES_INVALID_ENTRY");
    }
    const overlay: InventoryHumanOverlay = {};
    for (const key of Object.keys(rawOverlay)) {
      if (!OVERLAY_KEYS.has(key)) {
        throw new InventoryOverridesError("INVENTORY_OVERRIDES_UNKNOWN_FIELD");
      }
    }
    if ("summary" in rawOverlay) overlay.summary = optionalText(rawOverlay.summary);
    if ("confirmedGeneratedHash" in rawOverlay) {
      if (rawOverlay.confirmedGeneratedHash !== null && typeof rawOverlay.confirmedGeneratedHash !== "string") {
        throw new InventoryOverridesError("INVENTORY_OVERRIDES_INVALID_CONFIRMED_HASH");
      }
      overlay.confirmedGeneratedHash = rawOverlay.confirmedGeneratedHash;
    }
    if ("updatedAt" in rawOverlay) {
      if (rawOverlay.updatedAt !== null && typeof rawOverlay.updatedAt !== "string") {
        throw new InventoryOverridesError("INVENTORY_OVERRIDES_INVALID_UPDATED_AT");
      }
      overlay.updatedAt = rawOverlay.updatedAt;
    }
    entries[canonicalUri] = overlay;
  }
  return { schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION, entries };
}

export function buildProjectInventory(input: InventoryBuildInput): InventoryBuildResult {
  const overrides = input.overrides ? validateInventoryOverrides(input.overrides) : null;
  const generated = input.generated ?? new Map<string, InventoryGeneratedSemantic>();
  const generationRequests: InventoryGenerationRequest[] = [];
  const entries: InventoryEntry[] = [];

  const projectUri = encodeMarkdownReferenceUri({ kind: "project", projectId: input.project.id });
  const projectEvidenceRefs = projectEvidence(input);
  const projectFingerprint = sourceFingerprint(projectUri, "project", {
    name: input.project.name,
    description: input.project.description ?? null,
    pages: input.pages.map((page) => ({ id: page.id, name: page.name, routeKey: page.routeKey ?? null })),
    evidenceRefs: projectEvidenceRefs,
  });
  entries.push(withOverlay({
    canonicalUri: projectUri,
    resourceType: "project",
    scope: "local",
    parentUri: null,
    refreshMode: "auto",
    native: {
      name: input.project.name,
      aliases: [],
      description: input.project.description ?? null,
      metadata: {
        pageCount: input.pages.length,
        configFieldCount: enumerateSchemaFields(input.projectSchema ?? "").length,
        hasProjectConfig: Boolean(input.projectSchema),
      },
    },
    generated: retainedGenerated(generated.get(projectUri)),
    human: normalizeInventoryHuman(overrides?.entries[projectUri]),
    sourceState: "active",
    generationState: input.generationEnabled === false ? "disabled" : matchingGenerated(generated.get(projectUri), projectFingerprint) ? "ready" : "pending",
    reviewState: "unreviewed",
  }, overrides?.entries[projectUri], projectFingerprint));
  if (!matchingGenerated(generated.get(projectUri), projectFingerprint) && input.generationEnabled !== false) {
    generationRequests.push({ canonicalUri: projectUri, sourceFingerprint: projectFingerprint, evidenceRefs: projectEvidenceRefs });
  }

  const candidateEntries = buildCandidateDirectoryEntries({
    projectId: input.project.id,
    pages: input.pages.map((page) => ({ id: page.id, name: page.name, parentId: page.parentId, schema: page.schema ?? "" })),
    folders: input.folders,
  });
  const candidatesByUri = new Map(candidateEntries.map((entry) => [encodeMarkdownReferenceUri(entry.target), entry]));

  for (const page of input.pages) {
    const pageUri = encodeMarkdownReferenceUri({ kind: "page", projectId: input.project.id, pageId: page.id });
    const evidenceRefs = pageEvidence(input.project.id, page);
    const pageFingerprint = sourceFingerprint(pageUri, "page", {
      name: page.name,
      routeKey: page.routeKey ?? null,
      runtimeType: page.runtimeType ?? null,
      evidenceRefs,
    });
    const pageEntry = withOverlay({
      canonicalUri: pageUri,
      resourceType: "page",
      scope: "local",
      parentUri: projectUri,
      refreshMode: "auto",
      native: {
        name: page.name,
        aliases: page.routeKey ? [page.routeKey] : [],
        description: null,
        metadata: {
          runtimeType: page.runtimeType ?? null,
          routeKey: page.routeKey ?? null,
        },
      },
      generated: retainedGenerated(generated.get(pageUri)),
      human: normalizeInventoryHuman(overrides?.entries[pageUri]),
      sourceState: page.sourceState ?? "active",
      generationState: page.sourceState && page.sourceState !== "active"
        ? "disabled"
        : input.generationEnabled === false
          ? "disabled"
          : generated.has(pageUri) && matchingGenerated(generated.get(pageUri), pageFingerprint)
            ? "ready"
            : "pending",
      reviewState: "unreviewed",
    }, overrides?.entries[pageUri], pageFingerprint);
    entries.push(pageEntry);
    if (!matchingGenerated(generated.get(pageUri), pageFingerprint)
      && pageEntry.sourceState === "active"
      && input.generationEnabled !== false
      && (pageEntry.refreshMode === "auto" || input.forceGeneration === true)) {
      generationRequests.push({ canonicalUri: pageUri, sourceFingerprint: pageFingerprint, evidenceRefs });
    }

    for (const field of enumerateSchemaFields(page.schema ?? "")) {
      const target: MarkdownReferenceTarget = {
        kind: "config",
        projectId: input.project.id,
        pageId: page.id,
        fieldPath: field.key,
      };
      const canonicalUri = encodeMarkdownReferenceUri(target);
      const candidate = candidatesByUri.get(canonicalUri);
      entries.push(withOverlay({
        canonicalUri,
        resourceType: "config",
        scope: "local",
        parentUri: pageUri,
        refreshMode: "manual",
        native: {
          name: field.title,
          aliases: [field.key],
          description: null,
          metadata: {
            type: field.type,
            format: field.format ?? null,
            category: field.category ?? null,
            defaultPresent: field.default !== undefined,
            isBranch: Boolean(field.isBranch),
            displayPath: candidate?.displayPath ?? field.breadcrumbs.join(" / "),
          },
        },
        generated: null,
        human: normalizeInventoryHuman(overrides?.entries[canonicalUri]),
        sourceState: "active",
        generationState: "not_required",
        reviewState: "not_required",
      }, overrides?.entries[canonicalUri]));
    }
  }

  for (const document of input.documents ?? []) {
    const target: MarkdownReferenceTarget = { kind: "document", projectId: input.project.id, docId: document.id };
    const canonicalUri = encodeMarkdownReferenceUri(target);
    entries.push(withOverlay({
      canonicalUri,
      resourceType: "document",
      scope: "local",
      parentUri: projectUri,
      refreshMode: "manual",
      native: {
        name: document.title,
        aliases: [document.fileName].filter((value): value is string => Boolean(value)),
        description: document.aiSummary ?? document.description ?? null,
        metadata: {
          fileName: document.fileName ?? null,
          updatedAt: document.updatedAt ?? null,
          contentHash: document.contentHash ?? null,
        },
      },
      generated: null,
      human: normalizeInventoryHuman(overrides?.entries[canonicalUri]),
      sourceState: document.sourceState ?? "active",
      generationState: "not_required",
      reviewState: "not_required",
    }, overrides?.entries[canonicalUri]));
  }

  for (const document of input.governanceDocuments ?? []) {
    const target: MarkdownReferenceTarget = {
      kind: "document",
      projectId: input.project.id,
      docId: document.id,
      documentKind: document.documentKind,
    };
    const canonicalUri = encodeMarkdownReferenceUri(target);
    entries.push(withOverlay({
      canonicalUri,
      resourceType: "document",
      scope: "local",
      parentUri: projectUri,
      refreshMode: "manual",
      native: {
        name: document.title,
        aliases: [],
        description: null,
        metadata: {
          documentKind: document.documentKind,
          contentHash: document.contentHash ?? null,
          ...(document.pageId ? { pageId: document.pageId } : {}),
        },
      },
      generated: null,
      human: normalizeInventoryHuman(overrides?.entries[canonicalUri]),
      sourceState: document.sourceState ?? "active",
      generationState: "not_required",
      reviewState: "not_required",
    }, overrides?.entries[canonicalUri]));
  }

  addExternalDeclarations(entries, input.externalDeclarations ?? [], input.project.id);
  const liveUris = new Set(entries.map((entry) => entry.canonicalUri));
  for (const previous of input.previous?.values() ?? []) {
    if (liveUris.has(previous.canonicalUri) || previous.scope !== "local") continue;
    entries.push({
      ...previous,
      parentUri: previous.parentUri ?? projectUri,
      sourceState: "deleted",
      generationState: "disabled",
    });
  }
  const sortedEntries = entries.sort((left, right) => left.canonicalUri.localeCompare(right.canonicalUri));
  const overlayHash = hashInventoryValue(overrides ?? { schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION, entries: {} });
  const catalogFingerprint = hashInventoryValue(sortedEntries.map(stripDerivedFields));
  const projectionFingerprint = hashInventoryValue({
    catalogFingerprint,
    overlayHash,
    generated: sortedEntries
      .filter((entry) => entry.generated)
      .map((entry) => [entry.canonicalUri, entry.generated?.contentHash]),
  });
  return {
    snapshot: {
      schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
      projectId: input.project.id,
      workspaceRevision: input.workspaceRevision ?? null,
      workspaceRootHash: input.workspaceRootHash ?? null,
      catalogFingerprint,
      overlayHash,
      projectionFingerprint,
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      builtAt: input.builtAt ?? new Date().toISOString(),
      freshness: "fresh",
      entries: sortedEntries,
    },
    generationRequests,
  };
}

function withOverlay(entry: InventoryEntry, overlay?: InventoryHumanOverlay, expectedSourceFingerprint?: string): InventoryEntry {
  const human = normalizeInventoryHuman(overlay);
  const generated = entry.generated;
  const confirmed = human.confirmedGeneratedHash;
  return {
    ...entry,
    human,
    reviewState: entry.reviewState === "not_required"
      ? "not_required"
      : generated && expectedSourceFingerprint && generated.sourceFingerprint !== expectedSourceFingerprint
        ? "review_recommended"
      : generated && confirmed && confirmed === generated.contentHash
        ? "confirmed"
        : generated && confirmed && confirmed !== generated.contentHash
          ? "review_recommended"
          : entry.reviewState,
  };
}

function matchingGenerated(
  generated: InventoryGeneratedSemantic | undefined,
  expectedFingerprint: string,
): InventoryGeneratedSemantic | null {
  return generated?.sourceFingerprint === expectedFingerprint ? generated : null;
}

function retainedGenerated(generated: InventoryGeneratedSemantic | undefined): InventoryGeneratedSemantic | null {
  return generated ?? null;
}

function sourceFingerprint(canonicalUri: string, resourceType: string, value: unknown): string {
  return hashInventoryValue({ canonicalUri, resourceType, value, generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION });
}

function projectEvidence(input: InventoryBuildInput): InventoryEvidenceRef[] {
  if (!input.workspaceRootHash) return [];
  return [{
    sourceUri: encodeMarkdownReferenceUri({ kind: "project", projectId: input.project.id }),
    sourceKind: "project-metadata",
    contentHash: input.workspaceRootHash,
    selector: "project-metadata",
    ...(input.workspaceRevision == null ? {} : { observedWorkspaceRevision: input.workspaceRevision }),
  }];
}

function pageEvidence(projectId: string, page: InventoryPageInput): InventoryEvidenceRef[] {
  const refs: InventoryEvidenceRef[] = [];
  const pageUri = encodeMarkdownReferenceUri({ kind: "page", projectId, pageId: page.id });
  if (page.requirementsContentHash) refs.push({ sourceUri: pageUri, sourceKind: "page-requirements", contentHash: page.requirementsContentHash, selector: "document" });
  if (page.conventionContentHash) refs.push({ sourceUri: pageUri, sourceKind: "page-convention", contentHash: page.conventionContentHash, selector: "document" });
  if (page.schema) refs.push({ sourceUri: pageUri, sourceKind: "page-schema", contentHash: hashInventoryValue(page.schema), selector: "schema" });
  return refs;
}

function stripDerivedFields(entry: InventoryEntry): unknown {
  return Object.fromEntries(
    Object.entries(entry).filter(([key]) => key !== "generated" && key !== "human"),
  );
}

function addExternalDeclarations(
  entries: InventoryEntry[],
  records: readonly MarkdownLinkRecord[],
  currentProjectId: string,
): void {
  const grouped = new Map<string, InventoryReferenceDeclaration[]>();
  for (const record of records) {
    if (record.target.projectId === currentProjectId) continue;
    const canonicalUri = encodeMarkdownReferenceUri(record.target);
    const declaration: InventoryReferenceDeclaration = {
      sourceLocator: serializeSourceLocator(record.source),
      targetUri: canonicalUri,
      labelSnapshot: record.labelSnapshot,
      ...(record.contentHash ? { sourceContentHash: record.contentHash } : {}),
      sourcePosition: { line: record.line, column: record.column },
    };
    const declarations = grouped.get(canonicalUri) ?? [];
    declarations.push(declaration);
    grouped.set(canonicalUri, declarations);
  }
  for (const [canonicalUri, declarations] of grouped) {
    entries.push({
      canonicalUri,
      resourceType: targetKindFromUri(canonicalUri),
      scope: "referenced",
      parentUri: entries.find((entry) => entry.resourceType === "project")?.canonicalUri ?? null,
      refreshMode: "manual",
      native: {
        name: declarations[0]?.labelSnapshot || canonicalUri,
        aliases: declarations.map((declaration) => declaration.labelSnapshot).filter(Boolean),
        description: null,
        metadata: { origin: "external-reference" },
      },
      generated: null,
      human: normalizeInventoryHuman(undefined),
      sourceState: "active",
      generationState: "not_required",
      reviewState: "not_required",
      declarations: declarations.sort((left, right) => left.sourceLocator.localeCompare(right.sourceLocator)),
    });
  }
}

function targetKindFromUri(uri: string): MarkdownReferenceTarget["kind"] {
  const match = /^wb:\/\/(?:project|page|document|config)\//.exec(uri);
  if (!match) throw new InventoryOverridesError("INVENTORY_INVALID_CANONICAL_URI");
  return match[0].slice("wb://".length, -1) as MarkdownReferenceTarget["kind"];
}

function serializeSourceLocator(source: MarkdownLinkRecord["source"]): string {
  return Object.entries(source)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > MAX_TEXT_FIELD_LENGTH) {
    throw new InventoryOverridesError("INVENTORY_OVERRIDES_TEXT_TOO_LONG");
  }
  return value;
}

const OVERLAY_KEYS = new Set([
  "summary",
  "confirmedGeneratedHash",
  "updatedAt",
]);

export type { ResourceDirectoryEntry };
