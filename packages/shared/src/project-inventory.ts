import { decodeMarkdownReferenceUri, encodeMarkdownReferenceUri } from "./markdown-reference";
import type { MarkdownReferenceTarget } from "./markdown-reference";

export const PROJECT_INVENTORY_SCHEMA_VERSION = 2 as const;
export const PROJECT_INVENTORY_GENERATOR_VERSION = "inventory-summary-v2" as const;
export const INVENTORY_GENERATION_MAX_ATTEMPTS = 3;
export const INVENTORY_GENERATION_LEASE_MS = 180_000;

export type InventoryGenerationJobStatus =
  | "pending"
  | "running"
  | "ready"
  | "failed"
  | "superseded";

export type InventoryGenerationErrorCode =
  | "AGENT_UNAVAILABLE"
  | "AUTHORITY_UNAVAILABLE"
  | "STALE_EVIDENCE"
  | "INVALID_EVIDENCE"
  | "INVALID_OUTPUT"
  | "MODEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "REQUEST_TOO_LARGE"
  | "INTERNAL_ERROR";

export interface InventoryGenerationAttemptIdentity {
  taskKey: string;
  generationId: number;
  attemptId: string;
  leaseToken: string;
  leaseOwner: string;
}

export type InventoryResourceType = MarkdownReferenceTarget["kind"];
export type InventoryScope = "local" | "referenced";
export type InventoryRefreshMode = "auto" | "manual";
export type InventorySourceState = "active" | "missing" | "deleted";
export type InventoryGenerationState =
  | "not_required"
  | "pending"
  | "ready"
  | "failed"
  | "disabled";
export type InventoryReviewState =
  | "not_required"
  | "unreviewed"
  | "confirmed"
  | "review_recommended";
export type InventoryFreshness =
  | "fresh"
  | "stale"
  | "rebuilding"
  | "unavailable";
export type InventoryTargetAvailability = "unknown" | "available" | "unavailable";

export interface InventoryEvidenceRef {
  sourceUri: string;
  sourceKind: string;
  contentHash: string;
  selector: string;
  observedWorkspaceRevision?: number;
}

export interface InventoryNativeSemantic {
  name: string;
  aliases: string[];
  description: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface InventoryGeneratedSemantic {
  summary: string;
  sourceFingerprint: string;
  contentHash: string;
  generatorVersion: string;
  generatedAt: string;
  evidenceRefs: InventoryEvidenceRef[];
}

/**
 * Human values are deliberately a separate, field-level overlay. `null`
 * means "fall back to generated/native". The only user-maintained semantic
 * field is the optional resource summary; the remaining fields are audit
 * metadata maintained by the system.
 */
export interface InventoryHumanOverlay {
  summary?: string | null;
  confirmedGeneratedHash?: string | null;
  updatedAt?: string | null;
}

export interface InventoryHumanSemantic {
  summary: string | null;
  confirmedGeneratedHash: string | null;
  updatedAt: string | null;
}

export interface InventoryReferenceDeclaration {
  sourceLocator: string;
  targetUri: string;
  labelSnapshot: string;
  sourceContentHash?: string;
  sourcePosition?: { line: number; column: number };
}

export interface InventoryEntry {
  canonicalUri: string;
  resourceType: InventoryResourceType;
  scope: InventoryScope;
  parentUri: string | null;
  refreshMode: InventoryRefreshMode;
  native: InventoryNativeSemantic;
  generated: InventoryGeneratedSemantic | null;
  human: InventoryHumanSemantic;
  sourceState: InventorySourceState;
  generationState: InventoryGenerationState;
  reviewState: InventoryReviewState;
  declarations?: InventoryReferenceDeclaration[];
}

export interface InventorySnapshot {
  schemaVersion: typeof PROJECT_INVENTORY_SCHEMA_VERSION;
  projectId: string;
  workspaceRevision: number | null;
  workspaceRootHash: string | null;
  catalogFingerprint: string;
  overlayHash: string;
  projectionFingerprint: string;
  generatorVersion: string;
  builtAt: string;
  freshness: InventoryFreshness;
  entries: InventoryEntry[];
}

export interface InventoryOverridesFile {
  schemaVersion: typeof PROJECT_INVENTORY_SCHEMA_VERSION;
  entries: Record<string, InventoryHumanOverlay>;
}

export interface InventoryResolvedSemantic {
  name: string;
  summary: string;
  aliases: string[];
}

export interface InventoryQuery {
  query?: string;
  resourceTypes?: InventoryResourceType[];
  scopes?: InventoryScope[];
  limit?: number;
  cursor?: string;
}

export interface InventoryMatchReason {
  field: "uri" | "id" | "name" | "alias" | "summary" | "resourceType" | "scope";
  value: string;
  score: number;
}

export interface InventoryQueryEntry extends InventoryEntry {
  resolved: InventoryResolvedSemantic;
  matchedBy: InventoryMatchReason[];
  targetAvailability: InventoryTargetAvailability;
}

export interface InventoryQueryResult {
  entries: InventoryQueryEntry[];
  freshness: InventoryFreshness;
  total: number;
  nextCursor: string | null;
  truncated: boolean;
}

export function canonicalInventoryJson(value: unknown): string {
  return JSON.stringify(sortInventoryValue(value));
}

function sortInventoryValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortInventoryValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortInventoryValue(item)]),
  );
}

export function normalizeInventoryHuman(
  overlay: InventoryHumanOverlay | undefined,
): InventoryHumanSemantic {
  return {
    summary: overlay?.summary ?? null,
    confirmedGeneratedHash: overlay?.confirmedGeneratedHash ?? null,
    updatedAt: overlay?.updatedAt ?? null,
  };
}

export function resolveInventorySemantic(
  entry: Pick<InventoryEntry, "native" | "generated" | "human">,
): InventoryResolvedSemantic {
  const generated = entry.generated;
  const human = entry.human;
  return {
    name: entry.native.name,
    summary: human.summary ?? generated?.summary ?? entry.native.description ?? "",
    aliases: [...entry.native.aliases],
  };
}

export function inventorySearchText(entry: InventoryEntry): string {
  const resolved = resolveInventorySemantic(entry);
  return [
    entry.canonicalUri,
    entry.resourceType,
    entry.scope,
    entry.native.name,
    ...resolved.aliases,
    resolved.summary,
  ].join(" ");
}

export function isInventorySnapshot(value: unknown): value is InventorySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<InventorySnapshot>;
  return snapshot.schemaVersion === PROJECT_INVENTORY_SCHEMA_VERSION
    && typeof snapshot.projectId === "string"
    && (snapshot.workspaceRevision === null || typeof snapshot.workspaceRevision === "number")
    && (snapshot.workspaceRootHash === null || typeof snapshot.workspaceRootHash === "string")
    && typeof snapshot.catalogFingerprint === "string"
    && typeof snapshot.overlayHash === "string"
    && typeof snapshot.projectionFingerprint === "string"
    && typeof snapshot.generatorVersion === "string"
    && typeof snapshot.builtAt === "string"
    && isInventoryFreshness(snapshot.freshness)
    && Array.isArray(snapshot.entries)
    && new Set(snapshot.entries.map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as { canonicalUri?: unknown }).canonicalUri : undefined))).size === snapshot.entries.length
    && snapshot.entries.every(isInventoryEntry);
}

export function isInventoryGeneratedSemantic(value: unknown): value is InventoryGeneratedSemantic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const generated = value as Partial<InventoryGeneratedSemantic>;
  return hasOnlyKeys(generated, ["summary", "sourceFingerprint", "contentHash", "generatorVersion", "generatedAt", "evidenceRefs"])
    && typeof generated.summary === "string"
    && typeof generated.sourceFingerprint === "string"
    && typeof generated.contentHash === "string"
    && typeof generated.generatorVersion === "string"
    && typeof generated.generatedAt === "string"
    && Array.isArray(generated.evidenceRefs)
    && generated.evidenceRefs.every(isInventoryEvidenceRef);
}

export function isInventoryEvidenceRef(value: unknown): value is InventoryEvidenceRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reference = value as Partial<InventoryEvidenceRef>;
  const target = typeof reference.sourceUri === "string"
    ? decodeMarkdownReferenceUri(reference.sourceUri)
    : undefined;
  return Boolean(target && reference.sourceUri === encodeMarkdownReferenceUri(target))
    && typeof reference.sourceKind === "string"
    && reference.sourceKind.length > 0
    && reference.sourceKind.length <= 120
    && typeof reference.contentHash === "string"
    && reference.contentHash.length > 0
    && reference.contentHash.length <= 256
    && typeof reference.selector === "string"
    && reference.selector.length > 0
    && reference.selector.length <= 512
    && (reference.observedWorkspaceRevision === undefined
      || Number.isSafeInteger(reference.observedWorkspaceRevision));
}

function isInventoryEntry(value: unknown): value is InventoryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<InventoryEntry>;
  const target = typeof entry.canonicalUri === "string" ? decodeMarkdownReferenceUri(entry.canonicalUri) : undefined;
  return Boolean(target && entry.canonicalUri === encodeMarkdownReferenceUri(target)
    && (entry.resourceType === "project" || entry.resourceType === "page" || entry.resourceType === "document" || entry.resourceType === "config")
    && (entry.scope === "local" || entry.scope === "referenced")
    && (entry.parentUri === null || typeof entry.parentUri === "string")
    && isOneOf(entry.refreshMode, ["auto", "manual"])
    && isInventoryNative(entry.native)
    && (entry.generated === null || isInventoryGeneratedSemantic(entry.generated))
    && isInventoryHuman(entry.human)
    && isOneOf(entry.sourceState, ["active", "missing", "deleted"])
    && isOneOf(entry.generationState, ["not_required", "pending", "ready", "failed", "disabled"])
    && isOneOf(entry.reviewState, ["not_required", "unreviewed", "confirmed", "review_recommended"])
    && (entry.declarations === undefined || isInventoryDeclarations(entry.declarations)));
}

function isInventoryDeclarations(value: unknown): value is InventoryReferenceDeclaration[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const declaration = item as Partial<InventoryReferenceDeclaration>;
    const target = typeof declaration.targetUri === "string"
      ? decodeMarkdownReferenceUri(declaration.targetUri)
      : undefined;
    return typeof declaration.sourceLocator === "string"
      && declaration.sourceLocator.length > 0
      && declaration.sourceLocator.length <= 1_024
      && Boolean(target && declaration.targetUri === encodeMarkdownReferenceUri(target))
      && typeof declaration.labelSnapshot === "string"
      && declaration.labelSnapshot.length <= 512
      && (declaration.sourceContentHash === undefined || typeof declaration.sourceContentHash === "string")
      && (declaration.sourcePosition === undefined
        || (Number.isSafeInteger(declaration.sourcePosition.line)
          && Number.isSafeInteger(declaration.sourcePosition.column)
          && declaration.sourcePosition.line >= 1
          && declaration.sourcePosition.column >= 1));
  });
}

function isInventoryNative(value: unknown): value is InventoryNativeSemantic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const native = value as Partial<InventoryNativeSemantic>;
  return hasOnlyKeys(native, ["name", "aliases", "description", "metadata"])
    && typeof native.name === "string" && Array.isArray(native.aliases) && native.aliases.every((item) => typeof item === "string")
    && (native.description === null || typeof native.description === "string")
    && Boolean(native.metadata && typeof native.metadata === "object" && !Array.isArray(native.metadata));
}

function isInventoryHuman(value: unknown): value is InventoryHumanSemantic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const human = value as Partial<InventoryHumanSemantic>;
  return hasOnlyKeys(human, ["summary", "confirmedGeneratedHash", "updatedAt"])
    && (human.summary === null || typeof human.summary === "string")
    && (human.confirmedGeneratedHash === null || typeof human.confirmedGeneratedHash === "string")
    && (human.updatedAt === null || typeof human.updatedAt === "string");
}

function isInventoryFreshness(value: unknown): value is InventoryFreshness {
  return isOneOf(value, ["fresh", "stale", "rebuilding", "unavailable"]);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}
