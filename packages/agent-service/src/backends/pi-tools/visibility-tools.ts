import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  createWorkspaceResourceRegistry,
  hashWorkspaceContent,
  normalizeWorkspaceResourcePath,
} from "@workbench/project-core/workspace-resource-registry";
import {
  parseVisibilityRules,
  extractDeclaredRegionIds,
  resolveVisibility,
  validateVisibilityRules,
  visibilityRulesToJson,
  type VisibilityRulesDocument,
  type VisibilityValidationIssue,
} from "@workbench/shared";
import type { WorkspaceMutationRequest } from "@workbench/shared/contracts";
import { Type, type Static } from "typebox";

import type { AgentConfig } from "../../core/types";
import {
  resolveLiveWorkspaceMutationContext,
  WorkspaceMutationAuthorityError,
  type WorkspaceAuthoritySnapshot,
} from "../../workspace/workspace-mutation-authority";
import { aiMutationDeniedResult, assertAiMutationAllowed } from "./ai-mutation-policy";
import { formatAuthorityCommitSummary } from "./authority-result-summary";
import { validatePreviewFileWrite } from "./preview-validation";
import {
  getPageEntryFileName,
  isSafePageId,
  type WorkspacePage,
  type WorkspacePageDiagnostic,
  type WorkspaceTree,
} from "./workspace-page-utils";

/**
 * The visibility tools deliberately expose a small, structured surface to the
 * Agent.  They remove the need for the model to infer page ids or region ids
 * from display names, and make a multi-file behavior change one Authority
 * mutation instead of a sequence of independent writes.
 */

const MAX_DRAFTS = 128;
const DRAFT_TTL_MS = 10 * 60_000;
const registry = createWorkspaceResourceRegistry();

const InspectVisibilityParams = Type.Object({
  includeRules: Type.Optional(Type.Boolean({ description: "Include the current rule document in the response." })),
});
type InspectVisibilityParams = Static<typeof InspectVisibilityParams>;

const ValidateVisibilityParams = Type.Object({
  rules: Type.String({ minLength: 2, maxLength: 2_000_000, description: "Candidate project.visibility-rules.json content." }),
});
type ValidateVisibilityParams = Static<typeof ValidateVisibilityParams>;

const ExplainVisibilityParams = Type.Object({
  includeInactive: Type.Optional(Type.Boolean({ description: "Include rules whose condition is not currently matched." })),
});
type ExplainVisibilityParams = Static<typeof ExplainVisibilityParams>;

const RulesDocumentParams = Type.Object({
  rules: Type.String({ minLength: 2, maxLength: 2_000_000, description: "Existing visibility rules document." }),
});
type RulesDocumentParams = Static<typeof RulesDocumentParams>;

const DraftChange = Type.Object({
  path: Type.String({ minLength: 1, maxLength: 300, description: "Managed workspace resource path." }),
  content: Type.String({ maxLength: 2_000_000, description: "Complete replacement content for the resource." }),
});

const PrepareVisibilityDraftParams = Type.Object({
  changes: Type.Array(DraftChange, { minItems: 1, maxItems: 32, description: "Code, schema, config value and visibility rule replacements." }),
});
type PrepareVisibilityDraftParams = Static<typeof PrepareVisibilityDraftParams>;

const CommitVisibilityDraftParams = Type.Object({
  draftId: Type.String({ minLength: 1, maxLength: 100, description: "Draft id returned by prepareConfigVisibilityDraft." }),
  confirm: Type.Boolean({ description: "Explicit confirmation that the approved behavior draft may be committed." }),
});
type CommitVisibilityDraftParams = Static<typeof CommitVisibilityDraftParams>;

interface VisibilityPageFact {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
  routeKey?: string;
  runtimeType?: string;
  entryPath: string;
  schemaPath: string;
  regionIds: string[];
  configKeys: string[];
  configFields: VisibilityConfigFieldFact[];
}

export interface VisibilityConfigFieldFact {
  key: string;
  type: "resource" | "business";
}

export interface VisibilityWorkspaceFacts {
  revision: number;
  rootHash: string;
  pages: VisibilityPageFact[];
  projectConfigKeys: string[];
  projectConfigFields: VisibilityConfigFieldFact[];
  projectConfigSchema?: string;
  projectConfigValues?: Record<string, unknown>;
  pageSchemas: Record<string, string>;
  pageDiagnostics: WorkspacePageDiagnostic[];
  rules?: VisibilityRulesDocument;
}

interface DraftRecord {
  id: string;
  sessionId: string;
  projectId: string;
  workspaceId: string;
  baseRevision: number;
  baseRootHash: string;
  operations: WorkspaceMutationRequest["operations"];
  changedPaths: string[];
  impact: VisibilityDraftImpact;
  expiresAt: number;
}

interface FailedDraftRecord {
  id: string;
  sessionId: string;
  projectId: string;
  workspaceId: string;
  baseRevision: number;
  baseRootHash: string;
  changes: PrepareVisibilityDraftParams["changes"];
  changedPaths: string[];
  error: string;
  issues: VisibilityValidationIssue[];
  createdAt: number;
  expiresAt: number;
}

export interface VisibilityDraftImpact {
  changedPaths: string[];
  affectedPages: string[];
  affectedRegions: string[];
  hiddenPagesAtPublishedDefaults: string[];
  disabledPagesAtPublishedDefaults: string[];
  unavailablePagesAtPublishedDefaults: string[];
  validationIssues: VisibilityValidationIssue[];
}

const drafts = new Map<string, DraftRecordWithApproval>();

export interface ConfigVisibilityApprovalRequest {
  draftId: string;
  title?: string;
  summary: string;
  impact: VisibilityDraftImpact;
}

export type ConfigVisibilityApprovalHandler = (
  toolCallId: string,
  request: ConfigVisibilityApprovalRequest,
  signal?: AbortSignal,
) => Promise<boolean>;

interface ConfigVisibilityApprovalRecord {
  approvalId: string;
  approvalKind: "config_visibility";
  draftId: string;
  payloadHash: string;
  sessionId: string;
  projectId: string;
  workspaceId: string;
  approverUserId: string;
  approverRole: "admin" | "editor";
  authorizationSource: string;
  baseRevision: number;
  baseRootHash: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number;
}

interface DraftRecordWithApproval extends DraftRecord {
  approval?: ConfigVisibilityApprovalRecord;
}

function failedDraftDirectory(workspaceId: string): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const workspaceKey = crypto.createHash("sha256").update(workspaceId).digest("hex").slice(0, 32);
  return path.join(dataDir, "agent-visibility-drafts", workspaceKey, "failed");
}

function approvalDirectory(workspaceId: string): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const workspaceKey = crypto.createHash("sha256").update(workspaceId).digest("hex").slice(0, 32);
  return path.join(dataDir, "agent-visibility-drafts", workspaceKey, "approvals");
}

function persistApprovalRecord(record: ConfigVisibilityApprovalRecord): boolean {
  try {
    const directory = approvalDirectory(record.workspaceId);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${record.approvalId}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function persistFailedDraft(
  config: AgentConfig,
  context: NonNullable<Awaited<ReturnType<typeof getWorkspaceSnapshot>>>["live"],
  snapshot: WorkspaceAuthoritySnapshot,
  changes: PrepareVisibilityDraftParams["changes"],
  error: string,
  issues: VisibilityValidationIssue[] = [],
): string | undefined {
  if (!context) return undefined;
  const now = Date.now();
  const id = `visibility_failed_${crypto.randomBytes(8).toString("hex")}`;
  const record: FailedDraftRecord = {
    id,
    sessionId: config.sessionId,
    projectId: context.projectId,
    workspaceId: context.workspaceId,
    baseRevision: snapshot.state.revision,
    baseRootHash: snapshot.state.rootHash,
    changes,
    changedPaths: changes.map((change) => normalizeWorkspaceResourcePath(change.path.replace(/^\.\//, "")) || change.path),
    error,
    issues,
    createdAt: now,
    expiresAt: now + DRAFT_TTL_MS,
  };
  try {
    const directory = failedDraftDirectory(context.workspaceId);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${id}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return id;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObject(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function schemaKeys(raw: string | undefined): string[] {
  const parsed = parseObject(raw);
  return parsed && isRecord(parsed.properties) ? Object.keys(parsed.properties) : [];
}

function schemaFields(raw: string | undefined): VisibilityConfigFieldFact[] {
  const parsed = parseObject(raw);
  if (!parsed || !isRecord(parsed.properties)) return [];
  return Object.entries(parsed.properties).map(([key, field]) => {
    const record = isRecord(field) ? field : {};
    const uiOptions = isRecord(record["ui:options"]) ? record["ui:options"] : undefined;
    const demo = isRecord(record["$demo"]) ? record["$demo"] : undefined;
    const marker = uiOptions?.configType ?? demo?.configType ?? record["x-config-type"];
    return { key, type: marker === "business" ? "business" : "resource" };
  });
}

function parseTree(raw: string | undefined): { tree: WorkspaceTree; diagnostics: WorkspacePageDiagnostic[] } {
  const parsed = parseObject(raw);
  const diagnostics: WorkspacePageDiagnostic[] = [];
  const pages = Array.isArray(parsed?.pages)
    ? parsed.pages.filter((page): page is WorkspacePage => {
        if (!isRecord(page) || typeof page.id !== "string" || !isSafePageId(page.id)) {
          diagnostics.push({
            pageId: isRecord(page) && typeof page.id === "string" ? page.id : null,
            code: "INVALID_PAGE_ID",
            reason: "page id must be one Unicode-safe path segment",
            source: "workspace-tree",
          });
          return false;
        }
        if (
          typeof page.name !== "string" ||
          typeof page.order !== "number" ||
          !Number.isSafeInteger(page.order) ||
          (page.parentId !== null && typeof page.parentId !== "string")
        ) {
          diagnostics.push({
            pageId: page.id,
            code: "INVALID_WORKSPACE_TREE",
            reason: "page metadata has an invalid shape",
            source: "workspace-tree",
          });
          return false;
        }
        return true;
      })
    : [];
  return { tree: {
    folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
    pages,
  }, diagnostics };
}

function declaredRegionIds(resources: Record<string, string>, pageId: string): string[] {
  return extractDeclaredRegionIds(
    ["index.tsx", "prototype.html"].map(
      (fileName) => resources[`demos/${pageId}/${fileName}`],
    ),
  );
}

function pageRuntimeType(page: WorkspacePage): string | undefined {
  if (typeof page.runtimeType === "string") return page.runtimeType;
  return undefined;
}

export function buildVisibilityWorkspaceFacts(
  resources: Record<string, string>,
  state: Pick<WorkspaceAuthoritySnapshot["state"], "revision" | "rootHash"> = { revision: 0, rootHash: "" },
): VisibilityWorkspaceFacts {
  const parsedTree = parseTree(resources["workspace-tree.json"]);
  const tree = parsedTree.tree;
  const projectConfigSchema = resources["project.config.schema.json"];
  const projectConfigValues = parseObject(resources["project.config.values.json"]);
  const pageSchemas: Record<string, string> = {};
  const pages = tree.pages
    .slice()
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((page) => {
      const schemaPath = `demos/${page.id}/config.schema.json`;
      const schema = resources[schemaPath];
      if (schema !== undefined) pageSchemas[page.id] = schema;
      const runtimeType = pageRuntimeType(page);
      let entryFile = "index.tsx";
      if (runtimeType) {
        try { entryFile = getPageEntryFileName(runtimeType); } catch { /* malformed metadata remains inspectable */ }
      }
      return {
        id: page.id,
        name: page.name,
        order: page.order,
        parentId: page.parentId,
        ...(typeof (page as WorkspacePage & { routeKey?: unknown }).routeKey === "string"
          ? { routeKey: (page as WorkspacePage & { routeKey: string }).routeKey }
          : {}),
        ...(runtimeType ? { runtimeType } : {}),
        entryPath: `demos/${page.id}/${entryFile}`,
        schemaPath,
        regionIds: declaredRegionIds(resources, page.id),
        configKeys: schemaKeys(schema),
        configFields: schemaFields(schema),
      };
    });
  const pageDiagnostics = [...parsedTree.diagnostics];
  for (const page of tree.pages) {
    if (!resources[`demos/${page.id}/config.schema.json`]) {
      pageDiagnostics.push({
        pageId: page.id,
        code: "INCOMPLETE_PAGE",
        reason: "page metadata exists but config.schema.json is missing",
        source: "filesystem",
      });
    }
  }
  return {
    revision: state.revision,
    rootHash: state.rootHash,
    pages,
    projectConfigKeys: schemaKeys(projectConfigSchema),
    projectConfigFields: schemaFields(projectConfigSchema),
    projectConfigSchema,
    projectConfigValues,
    pageSchemas,
    pageDiagnostics,
    rules: parseVisibilityRules(resources["project.visibility-rules.json"]),
  };
}

function readWorkspaceResources(workingDir: string, snapshot?: WorkspaceAuthoritySnapshot): Record<string, string> {
  if (snapshot) return { ...snapshot.resources };
  const resources: Record<string, string> = {};
  const read = (resourcePath: string) => {
    const absolute = path.join(workingDir, resourcePath);
    if (fs.existsSync(absolute)) resources[resourcePath] = fs.readFileSync(absolute, "utf8");
  };
  ["workspace-tree.json", "project.config.schema.json", "project.config.values.json", "project.visibility-rules.json"].forEach(read);
  const tree = parseTree(resources["workspace-tree.json"]).tree;
  for (const page of tree.pages) {
    for (const fileName of ["index.tsx", "prototype.html", "prototype.css", "sandbox.html", "config.schema.json", "config.values.json"]) {
      read(`demos/${page.id}/${fileName}`);
    }
  }
  return resources;
}

async function getWorkspaceSnapshot(config: AgentConfig): Promise<{ live: NonNullable<ReturnType<typeof resolveLiveWorkspaceMutationContext>> | null; snapshot: WorkspaceAuthoritySnapshot; resources: Record<string, string> } | null> {
  if (!config.workingDir) return null;
  const live = resolveLiveWorkspaceMutationContext(config.workingDir);
  if (live) {
    const snapshot = await live.authority.getSnapshot(live.projectId, live.workspaceId);
    return { live, snapshot, resources: readWorkspaceResources(config.workingDir, snapshot) };
  }
  const resources = readWorkspaceResources(config.workingDir);
  return {
    live: null,
    snapshot: {
      state: {
        revision: 0,
        rootHash: "",
        resourceHashes: Object.fromEntries(Object.entries(resources).map(([key, value]) => [key, hashWorkspaceContent(value)])),
      } as WorkspaceAuthoritySnapshot["state"],
      resources,
    },
    resources,
  };
}

function success(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function failure(message: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], details, isError: true };
}

function formatFacts(facts: VisibilityWorkspaceFacts, includeRules: boolean): string {
  const pageLines = facts.pages.map((page) => [
    `- ${page.id} (${page.name})`,
    `  runtime: ${page.runtimeType ?? "unknown"}`,
    `  entry: ${page.entryPath}`,
    `  schema: ${page.schemaPath}`,
    `  configKeys: ${page.configKeys.join(", ") || "(none)"}`,
    `  configTypes: ${page.configFields.map((field) => `${field.key}[${field.type}]`).join(", ") || "(none)"}`,
    `  regionIds: ${page.regionIds.join(", ") || "(none)"}`,
  ].join("\n"));
  const lines = [
    `Authority revision: ${facts.revision}`,
    `Project config keys: ${facts.projectConfigKeys.join(", ") || "(none)"}`,
    `Project config types: ${facts.projectConfigFields.map((field) => `${field.key}[${field.type}]`).join(", ") || "(none)"}`,
    "Pages:",
    ...(pageLines.length ? pageLines : ["- (none)"]),
  ];
  if (facts.pageDiagnostics.length > 0) {
    lines.push(
      "Page diagnostics:",
      ...facts.pageDiagnostics.map((item) => `- ${item.code}: ${item.pageId ?? "<unknown>"} — ${item.reason}`),
    );
  }
  if (includeRules) lines.push("Rules:", facts.rules ? JSON.stringify(facts.rules, null, 2) : "(none)");
  return lines.join("\n");
}

export function summarizeVisibilityDraftImpact(
  facts: VisibilityWorkspaceFacts,
  rules: VisibilityRulesDocument | undefined,
  changedPaths: string[],
): VisibilityDraftImpact {
  const pageIds = facts.pages.map((page) => page.id);
  const regionIds = Object.fromEntries(facts.pages.map((page) => [page.id, page.regionIds]));
  const resolution = rules
    ? resolveVisibility({
        rules,
        projectSchema: facts.projectConfigSchema,
        projectConfigValues: facts.projectConfigValues,
        pageIds,
        regionIds,
        pageSchemas: facts.pageSchemas,
      })
    : null;
  const affectedPages = new Set<string>();
  const affectedRegions = new Set<string>();
  for (const changedPath of changedPaths) {
    const match = /^demos\/([^/]+)\//.exec(changedPath);
    if (match) affectedPages.add(match[1]);
  }
  for (const rule of rules?.rules ?? []) {
    if (rule.target.type === "page") affectedPages.add(rule.target.pageId);
    else {
      affectedPages.add(rule.target.pageId);
      affectedRegions.add(`${rule.target.pageId}:${rule.target.regionId}`);
    }
  }
  return {
    changedPaths,
    affectedPages: [...affectedPages].sort(),
    affectedRegions: [...affectedRegions].sort(),
    hiddenPagesAtPublishedDefaults: resolution?.valid
      ? Object.values(resolution.pages).filter((state) => state.hidden).map((state) => state.pageId)
      : [],
    disabledPagesAtPublishedDefaults: resolution?.valid
      ? Object.values(resolution.pages).filter((state) => state.disabled).map((state) => state.pageId)
      : [],
    unavailablePagesAtPublishedDefaults: resolution?.valid
      ? Object.values(resolution.pages).filter((state) => state.unavailable).map((state) => state.pageId)
      : [],
    validationIssues: resolution?.issues ?? [],
  };
}

function pruneDrafts(now = Date.now()): void {
  for (const [id, draft] of drafts) if (draft.expiresAt <= now) drafts.delete(id);
  while (drafts.size > MAX_DRAFTS) {
    const first = drafts.keys().next().value;
    if (!first) break;
    drafts.delete(first);
  }
}

function candidateResourcePath(resourcePath: string): boolean {
  if (resourcePath === "project.config.schema.json"
    || resourcePath === "project.config.values.json"
    || resourcePath === "project.visibility-rules.json") return true;
  const match = /^demos\/([^/]+)\/(?:index\.tsx|prototype\.html|prototype\.css|sandbox\.html|config\.schema\.json|config\.values\.json)$/.exec(resourcePath);
  return Boolean(match?.[1] && isSafePageId(match[1]));
}

function validateDraftChanges(
  config: AgentConfig,
  facts: VisibilityWorkspaceFacts,
  resources: Record<string, string>,
  changes: PrepareVisibilityDraftParams["changes"],
): { operations: WorkspaceMutationRequest["operations"]; paths: string[]; facts: VisibilityWorkspaceFacts; rules: VisibilityRulesDocument; issues: VisibilityValidationIssue[] } | { error: string } {
  const unique = new Set<string>();
  const operations: WorkspaceMutationRequest["operations"] = [];
  const merged = { ...resources };
  for (const change of changes) {
    const resourcePath = normalizeWorkspaceResourcePath(change.path.replace(/^\.\//, ""));
    if (!resourcePath || !candidateResourcePath(resourcePath)) return { error: `不允许在配置联动草稿中修改资源「${change.path}」` };
    if (unique.has(resourcePath)) return { error: `资源「${resourcePath}」重复` };
    unique.add(resourcePath);
    const pageMatch = /^demos\/([^/]+)\//.exec(resourcePath);
    const decision = assertAiMutationAllowed(config, resourcePath, {
      content: change.content,
      pageIds: pageMatch ? [pageMatch[1]] : undefined,
      workflow: "visibility-draft",
    });
    if (!decision.allowed) return { error: decision.message ?? "FILE_ACCESS_DENIED" };
    const descriptor = registry.describe(resourcePath);
    if (!descriptor || !descriptor.text) return { error: `资源「${resourcePath}」不是受管文本资源` };
    try {
      registry.assertTextWrite(resourcePath, change.content);
      if (pageMatch && (resourcePath.endsWith("index.tsx") || resourcePath.endsWith("prototype.html") || resourcePath.endsWith("sandbox.html") || resourcePath.endsWith("config.schema.json"))) {
        const runtimeType = facts.pages.find((page) => page.id === pageMatch[1])?.runtimeType;
        const validation = validatePreviewFileWrite(resourcePath, change.content, runtimeType);
        if (validation && !validation.ok) return { error: validation.issues.map((issue) => issue.message).join("; ") };
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "受管资源校验失败" };
    }
    const current = resources[resourcePath];
    operations.push({
      type: "put_text",
      path: resourcePath,
      content: change.content,
      ...(current === undefined
        ? { expectedAbsent: true }
        : { expectedHash: hashWorkspaceContent(current) }),
    });
    merged[resourcePath] = change.content;
  }
  if (!unique.has("project.visibility-rules.json")) return { error: "联动草稿必须同时包含 project.visibility-rules.json" };
  const nextFacts = buildVisibilityWorkspaceFacts(merged, facts);
  const rules = parseVisibilityRules(merged["project.visibility-rules.json"]);
  if (!rules) return { error: "project.visibility-rules.json 不是有效的版本化规则文档" };
  const validation = validateVisibilityRules(rules, {
    pageIds: nextFacts.pages.map((page) => page.id),
    regionIds: Object.fromEntries(nextFacts.pages.map((page) => [page.id, page.regionIds])),
    projectSchema: nextFacts.projectConfigSchema,
    pageSchemas: nextFacts.pageSchemas,
  });
  return { operations, paths: [...unique].sort(), facts: nextFacts, rules, issues: validation.issues };
}

export function createInspectConfigVisibilityTool(config: AgentConfig): AgentTool<typeof InspectVisibilityParams> {
  return {
    name: "inspectConfigVisibility",
    label: "Inspect Config Visibility",
    description: "Read authoritative project/page config keys, stable page IDs, declared region IDs and current visibility rules before planning a configuration behavior change.",
    parameters: InspectVisibilityParams,
    execute: async (_toolCallId: string, args: InspectVisibilityParams) => {
      try {
        const context = await getWorkspaceSnapshot(config);
        if (!context) return failure("当前 Agent 没有绑定可读 Workspace");
        const facts = buildVisibilityWorkspaceFacts(context.resources, context.snapshot.state);
        return success(formatFacts(facts, args.includeRules === true), { success: true, facts });
      } catch (error) {
        return failure(error instanceof Error ? error.message : "读取配置联动上下文失败");
      }
    },
  };
}

export function createValidateConfigVisibilityTool(config: AgentConfig): AgentTool<typeof ValidateVisibilityParams> {
  return {
    name: "validateConfigVisibility",
    label: "Validate Config Visibility",
    description: "Validate a candidate visibility-rules document against the authoritative page tree, project schema, page schemas and explicit region declarations.",
    parameters: ValidateVisibilityParams,
    execute: async (_toolCallId: string, args: ValidateVisibilityParams) => {
      try {
        const context = await getWorkspaceSnapshot(config);
        if (!context) return failure("当前 Agent 没有绑定可读 Workspace");
        const facts = buildVisibilityWorkspaceFacts(context.resources, context.snapshot.state);
        const validation = validateVisibilityRules(args.rules, {
          pageIds: facts.pages.map((page) => page.id),
          regionIds: Object.fromEntries(facts.pages.map((page) => [page.id, page.regionIds])),
          projectSchema: facts.projectConfigSchema,
          pageSchemas: facts.pageSchemas,
        });
        const text = validation.valid ? "visibility rules valid" : validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
        return validation.valid
          ? success(text, { success: true, valid: true, document: validation.document })
          : { ...failure(text, { success: false, valid: false, issues: validation.issues }), details: { success: false, valid: false, issues: validation.issues } };
      } catch (error) {
        return failure(error instanceof Error ? error.message : "规则校验失败");
      }
    },
  };
}

function visibilityContextForFacts(facts: VisibilityWorkspaceFacts) {
  return {
    pageIds: facts.pages.map((page) => page.id),
    regionIds: Object.fromEntries(facts.pages.map((page) => [page.id, page.regionIds])),
    projectSchema: facts.projectConfigSchema,
    pageSchemas: facts.pageSchemas,
  };
}

function visibilityTargetLabel(target: VisibilityRulesDocument["rules"][number]["target"]): string {
  return target.type === "page" ? `page:${target.pageId}` : `region:${target.pageId}:${target.regionId}`;
}

function visibilityConditionLabel(condition: VisibilityRulesDocument["rules"][number]["condition"]): string {
  if (condition.kind === "truthy") return "truthy";
  if (condition.kind === "equals") return `equals ${JSON.stringify(condition.value)}`;
  if (condition.kind === "oneOf") return `oneOf ${JSON.stringify(condition.values)}`;
  return `${condition.kind} (${condition.conditions.map((predicate) => `${predicate.source.fieldKey} ${visibilityConditionLabel(predicate.condition)}`).join(", ")})`;
}

export function createExplainConfigVisibilityTool(config: AgentConfig): AgentTool<typeof ExplainVisibilityParams> {
  return {
    name: "explainConfigVisibility",
    label: "Explain Config Visibility",
    description: "Explain which configuration visibility rules are active, their source fields, targets, effects and safe fallback strategies without changing the workspace.",
    parameters: ExplainVisibilityParams,
    execute: async (_toolCallId: string, args: ExplainVisibilityParams) => {
      try {
        const context = await getWorkspaceSnapshot(config);
        if (!context) return failure("当前 Agent 没有绑定可读 Workspace");
        const facts = buildVisibilityWorkspaceFacts(context.resources, context.snapshot.state);
        const validation = validateVisibilityRules(context.resources["project.visibility-rules.json"] ?? { version: 1, rules: [] }, visibilityContextForFacts(facts));
        if (!validation.valid || !validation.document) return failure("当前联动规则无效", { valid: false, issues: validation.issues });
        const resolution = resolveVisibility({
          rules: validation.document,
          projectSchema: facts.projectConfigSchema,
          projectConfigValues: facts.projectConfigValues,
          pageIds: facts.pages.map((page) => page.id),
          regionIds: Object.fromEntries(facts.pages.map((page) => [page.id, page.regionIds])),
          pageSchemas: facts.pageSchemas,
        });
        const lines = validation.document.rules.flatMap((rule) => {
          const targetState = rule.target.type === "page" ? resolution.pages[rule.target.pageId] : resolution.regions[`${rule.target.pageId}:${rule.target.regionId}`];
          const active = targetState?.reasons.some((reason) => reason.ruleId === rule.id) ?? false;
          if (!args.includeInactive && !active) return [];
          const sources = rule.condition.kind === "all" || rule.condition.kind === "any"
            ? rule.condition.conditions.map((predicate) => predicate.source.fieldKey)
            : rule.source ? [rule.source.fieldKey] : [];
          const contextLabel = rule.context ? ` context=${rule.context.kind}:${rule.context.value}` : "";
          const strategyLabel = rule.strategy ? ` strategy=${rule.strategy.kind}${rule.strategy.kind === "fallback-page" ? `:${rule.strategy.pageId}` : rule.strategy.kind === "alternative-region" ? `:${rule.strategy.pageId}:${rule.strategy.regionId}` : ""}` : "";
          return [`- ${rule.id}: ${active ? "active" : "inactive"}; source=${[...new Set(sources)].join(",")}; condition=${visibilityConditionLabel(rule.condition)}; target=${visibilityTargetLabel(rule.target)}; effect=${rule.effect}${strategyLabel}${contextLabel}`];
        });
        return success(lines.length ? lines.join("\n") : "没有匹配的联动规则", { success: true, valid: true, resolution, rules: validation.document.rules });
      } catch (error) {
        return failure(error instanceof Error ? error.message : "解释配置联动失败");
      }
    },
  };
}

export function createRepairConfigVisibilityTool(config: AgentConfig): AgentTool<typeof RulesDocumentParams> {
  return {
    name: "repairConfigVisibility",
    label: "Repair Config Visibility",
    description: "Validate and canonicalize an existing visibility rules document. It only returns a safe repaired candidate and never writes files or drops unknown fields silently.",
    parameters: RulesDocumentParams,
    execute: async (_toolCallId: string, args: RulesDocumentParams) => {
      try {
        const context = await getWorkspaceSnapshot(config);
        if (!context) return failure("当前 Agent 没有绑定可读 Workspace");
        const facts = buildVisibilityWorkspaceFacts(context.resources, context.snapshot.state);
        const validation = validateVisibilityRules(args.rules, visibilityContextForFacts(facts));
        if (!validation.valid || !validation.document) return failure("规则不能安全修复：请根据校验问题人工修正", { success: false, valid: false, issues: validation.issues, repairedRules: null });
        return success("规则已通过严格校验，可使用规范化文档替换原文件", { success: true, valid: true, repairedRules: visibilityRulesToJson(validation.document), issues: [] });
      } catch (error) {
        return failure(error instanceof Error ? error.message : "修复配置联动失败");
      }
    },
  };
}

function migrateVisibilityRulesInput(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.rules)) return raw;
  const migrateCondition = (condition: unknown): unknown => {
    if (!isRecord(condition)) return condition;
    if (condition.kind === "in" && Array.isArray(condition.values)) return { ...condition, kind: "oneOf" };
    if ((condition.kind === "all" || condition.kind === "any") && Array.isArray(condition.conditions)) {
      return {
        ...condition,
        conditions: condition.conditions.map((predicate) => {
          if (!isRecord(predicate)) return predicate;
          return { ...predicate, condition: migrateCondition(predicate.condition) };
        }),
      };
    }
    return condition;
  };
  return {
    ...raw,
    version: 1,
    rules: raw.rules.map((rule) => {
      if (!isRecord(rule)) return rule;
      const condition = migrateCondition(rule.condition);
      if (isRecord(condition) && (condition.kind === "all" || condition.kind === "any")) {
        const { source: _redundantSource, ...rest } = rule;
        void _redundantSource;
        return { ...rest, condition };
      }
      return { ...rule, condition };
    }),
  };
}

export function createMigrateConfigVisibilityTool(config: AgentConfig): AgentTool<typeof RulesDocumentParams> {
  return {
    name: "migrateConfigVisibility",
    label: "Migrate Config Visibility",
    description: "Migrate the documented legacy version-0/in condition spelling and redundant composite source to the current visibility protocol, then validate it against the authoritative workspace.",
    parameters: RulesDocumentParams,
    execute: async (_toolCallId: string, args: RulesDocumentParams) => {
      try {
        const context = await getWorkspaceSnapshot(config);
        if (!context) return failure("当前 Agent 没有绑定可读 Workspace");
        const raw = JSON.parse(args.rules) as unknown;
        const migrated = migrateVisibilityRulesInput(raw);
        const facts = buildVisibilityWorkspaceFacts(context.resources, context.snapshot.state);
        const validation = validateVisibilityRules(migrated, visibilityContextForFacts(facts));
        if (!validation.valid || !validation.document) return failure("规则迁移后未通过严格校验", { success: false, valid: false, issues: validation.issues, migratedRules: null });
        return success("规则迁移完成，可在用户确认后作为草稿提交", { success: true, valid: true, migratedRules: visibilityRulesToJson(validation.document), issues: [] });
      } catch (error) {
        return failure(error instanceof Error ? error.message : "迁移配置联动失败");
      }
    },
  };
}

export function createPrepareConfigVisibilityDraftTool(config: AgentConfig): AgentTool<typeof PrepareVisibilityDraftParams> {
  return {
    name: "prepareConfigVisibilityDraft",
    label: "Prepare Config Visibility Draft",
    description: "Validate and stage a multi-file configuration behavior change. It never writes the workspace; commitConfigVisibilityDraft applies all files in one Authority mutation after explicit approval.",
    parameters: PrepareVisibilityDraftParams,
    execute: async (_toolCallId: string, args: PrepareVisibilityDraftParams) => {
      let workspaceContext: Awaited<ReturnType<typeof getWorkspaceSnapshot>> = null;
      try {
        workspaceContext = await getWorkspaceSnapshot(config);
        if (!workspaceContext?.live) return failure("配置联动草稿必须运行在 live Workspace Authority 上");
        const facts = buildVisibilityWorkspaceFacts(workspaceContext.resources, workspaceContext.snapshot.state);
        const result = validateDraftChanges(config, facts, workspaceContext.resources, args.changes);
        if ("error" in result) {
          const failedDraftId = persistFailedDraft(config, workspaceContext.live, workspaceContext.snapshot, args.changes, result.error);
          return failure(result.error, { error: "draft_validation_failed", failedDraftId });
        }
        const validation = validateVisibilityRules(result.rules, {
          pageIds: result.facts.pages.map((page) => page.id),
          regionIds: Object.fromEntries(result.facts.pages.map((page) => [page.id, page.regionIds])),
          projectSchema: result.facts.projectConfigSchema,
          pageSchemas: result.facts.pageSchemas,
        });
        if (!validation.valid) {
          const failedDraftId = persistFailedDraft(config, workspaceContext.live, workspaceContext.snapshot, args.changes, "联动规则未通过校验", validation.issues);
          return failure("联动规则未通过校验", { success: false, valid: false, issues: validation.issues, failedDraftId });
        }
        pruneDrafts();
        const id = `visibility_draft_${crypto.randomBytes(8).toString("hex")}`;
        const impact = summarizeVisibilityDraftImpact(result.facts, result.rules, result.paths);
        drafts.set(id, {
          id,
          sessionId: config.sessionId,
          ...(config.runId ? { runId: config.runId } : {}),
          projectId: workspaceContext.live.projectId,
          workspaceId: workspaceContext.live.workspaceId,
          baseRevision: workspaceContext.snapshot.state.revision,
          baseRootHash: workspaceContext.snapshot.state.rootHash,
          operations: result.operations,
          changedPaths: result.paths,
          impact,
          expiresAt: Date.now() + DRAFT_TTL_MS,
        });
        return success(`已准备配置联动草稿 ${id}。Workspace 尚未改变；提交前需要用户确认这份具体草稿。`, {
          success: true,
          status: "awaiting_approval",
          draftId: id,
          expiresAt: Date.now() + DRAFT_TTL_MS,
          impact,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "准备配置联动草稿失败";
        const failedDraftId = workspaceContext?.live && workspaceContext.snapshot
          ? persistFailedDraft(config, workspaceContext.live, workspaceContext.snapshot, args.changes, message)
          : undefined;
        return failure(message, { error: "draft_prepare_failed", failedDraftId });
      }
    },
  };
}

export function createCommitConfigVisibilityDraftTool(
  config: AgentConfig,
  approvalHandler?: ConfigVisibilityApprovalHandler,
): AgentTool<typeof CommitVisibilityDraftParams> {
  return {
    name: "commitConfigVisibilityDraft",
    label: "Commit Config Visibility Draft",
    description: "Commit a previously prepared configuration behavior draft as one Workspace Mutation Authority transaction. Requires confirm=true and explicit approval of this exact draft.",
    parameters: CommitVisibilityDraftParams,
    execute: async (toolCallId: string, args: CommitVisibilityDraftParams, signal?: AbortSignal) => {
      if (!args.confirm) return failure("提交配置联动草稿前必须提供 confirm=true", { error: "confirmation_required" });
      pruneDrafts();
      const draft = drafts.get(args.draftId);
      if (!draft) return failure("配置联动草稿不存在、已过期或不属于当前会话", { error: "draft_not_found" });
      if (draft.sessionId !== config.sessionId) return failure("配置联动草稿不属于当前会话", { error: "draft_session_mismatch" });
      const context = await getWorkspaceSnapshot(config);
      if (!context?.live) return failure("配置联动草稿必须运行在 live Workspace Authority 上");
      if (context.live.projectId !== draft.projectId || context.live.workspaceId !== draft.workspaceId) return failure("配置联动草稿 Workspace 不匹配", { error: "draft_workspace_mismatch" });
      try {
        const snapshot = context.snapshot;
        if (snapshot.state.revision !== draft.baseRevision || snapshot.state.rootHash !== draft.baseRootHash) {
          return failure("Workspace 已发生变化，请重新准备配置联动草稿", {
            error: "draft_base_conflict",
            expectedRevision: draft.baseRevision,
            actualRevision: snapshot.state.revision,
            expectedRootHash: draft.baseRootHash,
            actualRootHash: snapshot.state.rootHash,
          });
        }
        for (const operation of draft.operations) {
          if (operation.type !== "put_text") continue;
          const pageMatch = /^demos\/([^/]+)\//.exec(operation.path);
          const decision = assertAiMutationAllowed(config, operation.path, {
            content: operation.content,
            pageIds: pageMatch ? [pageMatch[1]] : undefined,
            workflow: "visibility-draft",
          });
          if (!decision.allowed) return aiMutationDeniedResult(decision, operation.path);
        }
        const auth = config.authorAuthorization;
        if (!auth || !auth.userId || !auth.role || auth.expiresAt <= Date.now() || auth.projectId !== draft.projectId) {
          return failure("配置联动草稿需要有效的 author 会话确认", { error: "unverified" });
        }
        const payloadHash = hashWorkspaceContent(JSON.stringify(draft.operations));
        let approval = draft.approval;
        if (approval && (
          approval.expiresAt <= Date.now()
          || approval.payloadHash !== payloadHash
          || approval.sessionId !== config.sessionId
          || approval.projectId !== draft.projectId
          || approval.workspaceId !== draft.workspaceId
          || approval.baseRevision !== draft.baseRevision
          || approval.baseRootHash !== draft.baseRootHash
          || approval.approverUserId !== auth.userId
          || approval.approverRole !== auth.role
          || approval.authorizationSource !== auth.source
        )) {
          approval = undefined;
          draft.approval = undefined;
        }
        if (!approval) {
          if (!approvalHandler) return failure("配置联动草稿确认不可用，请重新打开创作端会话", { error: "approval_unavailable" });
          const approved = await approvalHandler(toolCallId, {
            draftId: draft.id,
            title: "确认配置联动草稿",
            summary: JSON.stringify({ draftId: draft.id, changedPaths: draft.changedPaths, impact: draft.impact }, null, 2),
            impact: draft.impact,
          }, signal);
          if (!approved) return failure("用户未批准这份配置联动草稿", { error: "config_visibility_approval_rejected", draftId: draft.id });
          const approvedBy = config.authorAuthorization;
          if (!approvedBy || !approvedBy.userId || !approvedBy.role || approvedBy.expiresAt <= Date.now()
            || approvedBy.userId !== auth.userId || approvedBy.role !== auth.role
            || approvedBy.projectId !== draft.projectId || approvedBy.source !== auth.source) {
            return failure("配置联动草稿确认期间 author 会话已变化或过期，请重新准备", { error: "approval_authorization_changed", draftId: draft.id });
          }
          approval = {
            approvalId: `config_visibility_approval_${crypto.randomBytes(8).toString("hex")}`,
            approvalKind: "config_visibility",
            draftId: draft.id,
            payloadHash,
            sessionId: config.sessionId,
            projectId: draft.projectId,
            workspaceId: draft.workspaceId,
            approverUserId: approvedBy.userId,
            approverRole: approvedBy.role,
            authorizationSource: approvedBy.source,
            baseRevision: draft.baseRevision,
            baseRootHash: draft.baseRootHash,
            createdAt: Date.now(),
            expiresAt: Date.now() + DRAFT_TTL_MS,
          };
          draft.approval = approval;
          if (!persistApprovalRecord(approval)) {
            draft.approval = undefined;
            return failure("无法持久化配置联动确认记录，未提交 Workspace", { error: "approval_persist_failed", draftId: draft.id });
          }
        }
        const request: WorkspaceMutationRequest = {
          mutationId: crypto.randomUUID(),
          projectId: draft.projectId,
          workspaceId: draft.workspaceId,
          sessionId: config.sessionId,
          baseRevision: draft.baseRevision,
          baseRootHash: draft.baseRootHash,
          actor: config.mutationActor ?? "ai",
          reason: "config_visibility_draft_commit",
          operations: draft.operations,
        };
        const receipt = await context.live.authority.mutate(request);
        approval.consumedAt = Date.now();
        persistApprovalRecord(approval);
        drafts.delete(draft.id);
        return success(`配置联动草稿已原子提交，mutationId=${receipt.mutationId}，revision=${receipt.revision}${formatAuthorityCommitSummary(receipt)}`, {
          success: true,
          status: "committed",
          receipt,
          impact: draft.impact,
        });
      } catch (error) {
        const code = error instanceof WorkspaceMutationAuthorityError ? error.code : "WORKSPACE_MUTATION_FAILED";
        return failure(error instanceof Error ? error.message : code, {
          error: code,
          draftId: draft.id,
          ...(error instanceof WorkspaceMutationAuthorityError ? (error.details ?? {}) : {}),
        });
      }
    },
  };
}
