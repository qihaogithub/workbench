export type KnowledgeSourceType =
  | "system-rule"
  | "current-project"
  | "linked-template"
  | "template-library"
  | "session";

export type KnowledgeKind =
  | "knowledge-doc"
  | "page"
  | "config"
  | "asset"
  | "business-rule"
  | "design-rule"
  | "operation-guide"
  | "index-artifact"
  | "system-rule"
  | "template-summary"
  | "session-context";

export type TrustLevel =
  | "hard-constraint"
  | "current-fact"
  | "default-reference"
  | "reference-sample"
  | "ai-summary";

export type KnowledgeVisibility =
  | "system-internal"
  | "author-private"
  | "project-agent"
  | "published-viewer"
  | "template-library"
  | "ops-admin";

export type KnowledgeCapability =
  | "search"
  | "readSummary"
  | "readOriginal"
  | "related"
  | "report"
  | "manageIndexJob";

export type PrincipalType =
  | "author"
  | "visitor"
  | "author-ai"
  | "viewer-ai"
  | "system-task"
  | "ops-admin";

export type AccessSurface =
  | "author"
  | "viewer"
  | "agent-service"
  | "worker"
  | "admin"
  | "system";

export type AccessPurpose =
  | "edit-assist"
  | "readonly-qa"
  | "template-recommendation"
  | "project-diagnosis"
  | "index-generation"
  | "ops-debug";

export type AccessDenyReason =
  | "capability-not-requested"
  | "capability-not-allowed"
  | "visibility-denied"
  | "tenant-scope-denied";

export interface TenantScope {
  projectId?: string;
  templateId?: string;
  organizationId?: string;
}

export interface AccessContext {
  principalType: PrincipalType;
  principalId: string;
  tenantScope: TenantScope;
  surface: AccessSurface;
  purpose: AccessPurpose;
  capabilities: KnowledgeCapability[];
}

export interface KnowledgeRelation {
  type: string;
  targetId: string;
  description?: string;
}

export interface KnowledgePermissions {
  capabilities: KnowledgeCapability[];
  principalTypes?: PrincipalType[];
}

export interface DerivedKnowledgeSource {
  itemId: string;
  jobId?: string;
  version?: number;
}

export interface KnowledgeItem {
  id: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  kind: KnowledgeKind;
  title: string;
  summary: string;
  tags: string[];
  keywords: string[];
  relations: KnowledgeRelation[];
  trustLevel: TrustLevel;
  visibility: KnowledgeVisibility[];
  permissions: KnowledgePermissions;
  derivedFrom?: DerivedKnowledgeSource[];
  version: number;
  updatedAt: string;
  readPath: string;
  contentSnippet?: string;
}

export type KnowledgeIndexJobStatus =
  | "pending"
  | "running"
  | "ready"
  | "failed"
  | "partial"
  | "stale";

export interface KnowledgeIndexJob {
  id: string;
  targetType: "template" | "project" | "system";
  targetId: string;
  targetTitle?: string;
  targetDescription?: string;
  status: KnowledgeIndexJobStatus;
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
  workspacePath?: string;
  readingMapPath?: string;
  itemCount: number;
  error?: string;
}

export interface ReadingMapEntry {
  id: string;
  title: string;
  path: string;
  summary: string;
}

export interface ReadingMapTaskEntry {
  taskType: string;
  description: string;
  recommendedPaths: string[];
}

export interface KnowledgeReadingMap {
  id: string;
  targetType: "template" | "project";
  targetId: string;
  overview: {
    title: string;
    scene: string;
    pageCount: number;
    configCount: number;
    knowledgeCount: number;
    updatedAt: string;
  };
  structure: {
    pages: ReadingMapEntry[];
    configs: ReadingMapEntry[];
    knowledgeDocuments: ReadingMapEntry[];
    assets: ReadingMapEntry[];
  };
  localSummaries: ReadingMapEntry[];
  taskEntries: ReadingMapTaskEntry[];
  originalEntries: ReadingMapEntry[];
}

export interface KnowledgeReportSource {
  path: string;
  trustLevel: TrustLevel;
  sourceType: KnowledgeSourceType;
}

export interface KnowledgeReport {
  id: string;
  question: string;
  createdAt: string;
  contextKey: string;
  sections: {
    summary: string;
    materials: Array<{
      title: string;
      summary: string;
      trustLevel: TrustLevel;
      sourceType: KnowledgeSourceType;
      readPath: string;
    }>;
    sources: KnowledgeReportSource[];
    trustLevels: TrustLevel[];
    scope: string;
    recommendedOriginals: string[];
    missing: string[];
    risks: string[];
  };
}

const TRUST_ORDER: Record<TrustLevel, number> = {
  "hard-constraint": 0,
  "current-fact": 1,
  "default-reference": 2,
  "reference-sample": 3,
  "ai-summary": 4,
};

const SOURCE_ORDER: Record<KnowledgeSourceType, number> = {
  "system-rule": 0,
  "current-project": 1,
  "linked-template": 2,
  "template-library": 3,
  session: 4,
};

const VISIBILITY_ORDER: Record<KnowledgeVisibility, number> = {
  "system-internal": 0,
  "author-private": 1,
  "project-agent": 2,
  "published-viewer": 3,
  "template-library": 4,
  "ops-admin": 5,
};

const VISIBILITY_BY_PRINCIPAL: Record<PrincipalType, KnowledgeVisibility[]> = {
  author: ["author-private", "project-agent", "published-viewer", "template-library"],
  visitor: ["published-viewer", "template-library"],
  "author-ai": [
    "system-internal",
    "author-private",
    "project-agent",
    "published-viewer",
    "template-library",
  ],
  "viewer-ai": ["published-viewer", "template-library"],
  "system-task": [
    "system-internal",
    "author-private",
    "project-agent",
    "published-viewer",
    "template-library",
    "ops-admin",
  ],
  "ops-admin": [
    "system-internal",
    "author-private",
    "project-agent",
    "published-viewer",
    "template-library",
    "ops-admin",
  ],
};

export function compareKnowledgeItemsByAuthority(
  left: KnowledgeItem,
  right: KnowledgeItem,
): number {
  const trustDiff = TRUST_ORDER[left.trustLevel] - TRUST_ORDER[right.trustLevel];
  if (trustDiff !== 0) return trustDiff;
  const sourceDiff = SOURCE_ORDER[left.sourceType] - SOURCE_ORDER[right.sourceType];
  if (sourceDiff !== 0) return sourceDiff;
  const visibilityDiff =
    Math.min(...left.visibility.map((visibility) => VISIBILITY_ORDER[visibility])) -
    Math.min(...right.visibility.map((visibility) => VISIBILITY_ORDER[visibility]));
  if (visibilityDiff !== 0) return visibilityDiff;
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function canAccessKnowledgeItem(
  item: KnowledgeItem,
  context: AccessContext,
  capability: KnowledgeCapability,
): { allowed: true } | { allowed: false; reason: AccessDenyReason } {
  if (!context.capabilities.includes(capability)) {
    return { allowed: false, reason: "capability-not-requested" };
  }

  if (!item.permissions.capabilities.includes(capability)) {
    return { allowed: false, reason: "capability-not-allowed" };
  }

  if (
    item.permissions.principalTypes &&
    !item.permissions.principalTypes.includes(context.principalType)
  ) {
    return { allowed: false, reason: "visibility-denied" };
  }

  if (!hasTenantScope(item, context)) {
    return { allowed: false, reason: "tenant-scope-denied" };
  }

  const visible = VISIBILITY_BY_PRINCIPAL[context.principalType] ?? [];
  if (!item.visibility.some((visibility) => visible.includes(visibility))) {
    return { allowed: false, reason: "visibility-denied" };
  }

  return { allowed: true };
}

function hasTenantScope(item: KnowledgeItem, context: AccessContext): boolean {
  if (item.sourceType === "current-project") {
    return !context.tenantScope.projectId || item.sourceId === context.tenantScope.projectId;
  }
  if (item.sourceType === "linked-template") {
    return !context.tenantScope.templateId || item.sourceId === context.tenantScope.templateId;
  }
  return true;
}

export function filterKnowledgeItems(
  items: KnowledgeItem[],
  context: AccessContext,
  capability: KnowledgeCapability,
): KnowledgeItem[] {
  return items
    .filter((item) => canAccessKnowledgeItem(item, context, capability).allowed)
    .sort(compareKnowledgeItemsByAuthority);
}

export function buildReportCacheKey(question: string, context: AccessContext): string {
  return JSON.stringify({
    question: question.trim(),
    principalType: context.principalType,
    principalId: context.principalId,
    tenantScope: context.tenantScope,
    surface: context.surface,
    purpose: context.purpose,
    capabilities: [...context.capabilities].sort(),
  });
}

export function buildKnowledgeReport(input: {
  question: string;
  context: AccessContext;
  items: KnowledgeItem[];
  missing?: string[];
  risks?: string[];
  recommendedReadPaths?: string[];
  now?: string;
}): KnowledgeReport {
  const accessibleItems = filterKnowledgeItems(input.items, input.context, "report");
  const recommendedOriginals =
    input.recommendedReadPaths ??
    accessibleItems
      .filter((item) => canAccessKnowledgeItem(item, input.context, "readOriginal").allowed)
      .map((item) => item.readPath);
  const trustLevels = [...new Set(accessibleItems.map((item) => item.trustLevel))];

  return {
    id: `report_${hashText(buildReportCacheKey(input.question, input.context)).slice(0, 12)}`,
    question: input.question,
    createdAt: input.now ?? new Date().toISOString(),
    contextKey: buildReportCacheKey(input.question, input.context),
    sections: {
      summary: accessibleItems.length
        ? `围绕“${input.question}”找到 ${accessibleItems.length} 条可用资料。`
        : `围绕“${input.question}”未找到当前主体可用资料。`,
      materials: accessibleItems.map((item) => ({
        title: item.title,
        summary: item.summary,
        trustLevel: item.trustLevel,
        sourceType: item.sourceType,
        readPath: item.readPath,
      })),
      sources: accessibleItems.map((item) => ({
        path: item.readPath,
        trustLevel: item.trustLevel,
        sourceType: item.sourceType,
      })),
      trustLevels,
      scope: `${input.context.surface}/${input.context.purpose}`,
      recommendedOriginals,
      missing: input.missing ?? [],
      risks: input.risks ?? [],
    },
  };
}

export function mapLegacyKnowledgeSource(
  source: "system" | "user" | "template" | "summary",
): Pick<KnowledgeItem, "sourceType" | "trustLevel" | "visibility"> {
  if (source === "system") {
    return {
      sourceType: "system-rule",
      trustLevel: "hard-constraint",
      visibility: ["system-internal", "project-agent"],
    };
  }
  if (source === "user") {
    return {
      sourceType: "current-project",
      trustLevel: "current-fact",
      visibility: ["author-private"],
    };
  }
  if (source === "template") {
    return {
      sourceType: "linked-template",
      trustLevel: "default-reference",
      visibility: ["template-library"],
    };
  }
  return {
    sourceType: "current-project",
    trustLevel: "ai-summary",
    visibility: ["author-private"],
  };
}

function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}
