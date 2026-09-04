import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { enumerateSchemaFields } from "@workbench/shared/demo/config-schema-fields";

const DESIGN_SPEC_DIR = "design-spec";
const MANIFEST_PATH = `${DESIGN_SPEC_DIR}/manifest.json`;

export interface PageDesignSpecSyncInput {
  workspacePath: string;
  pageId: string;
  pageName: string;
  schema: string;
}

export interface PageDesignSpecSyncWrite {
  path: string;
  content: string;
}

interface DesignSpecRef {
  scope: "project" | "page";
  pageId?: string;
  fieldKey: string;
}

type DesignSpecTarget =
  | { type: "page"; pageIds: string[] }
  | { type: "config"; refs: DesignSpecRef[] };

interface DesignSpecEntry {
  id: string;
  title: string;
  markdown: string;
  target: DesignSpecTarget;
  autoManagedFieldKey?: string;
}

interface DesignSpecDoc {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  entries: DesignSpecEntry[];
  autoManagedPageId?: string;
}

interface DesignSpecManifest {
  version: number;
  items: Array<Pick<DesignSpecDoc, "id" | "title" | "createdAt" | "updatedAt">>;
}

interface EligibleField {
  key: string;
  title: string;
}

/**
 * 为一个页面的图片/动效配置项生成设计规范写入计划。
 *
 * 该函数不写磁盘，便于被 Workspace Mutation Authority 合并进同一次事务；
 * 非 live 工作区可用 applyPageDesignSpecSync 直接落盘。
 */
export function buildPageDesignSpecSyncWrites(
  input: PageDesignSpecSyncInput,
): PageDesignSpecSyncWrite[] {
  const eligibleFields = collectEligibleFields(input.schema);
  const manifestFile = path.join(input.workspacePath, MANIFEST_PATH);
  const { manifest } = readManifest(manifestFile);
  const existingDoc = manifest.items
    .map((item) => readDoc(input.workspacePath, item.id))
    .find((doc): doc is DesignSpecDoc => doc?.autoManagedPageId === input.pageId);

  if (!existingDoc && eligibleFields.length === 0) return [];

  const now = new Date().toISOString();
  const doc = existingDoc ?? {
    id: generateId("ds"),
    title: pageDesignSpecTitle(input.pageName),
    createdAt: now,
    updatedAt: now,
    entries: [],
    autoManagedPageId: input.pageId,
  };
  const nextEntries = synchronizeEntries(doc.entries, input.pageId, eligibleFields);
  const nextTitle = pageDesignSpecTitle(input.pageName);
  const changed = !existingDoc
    || doc.title !== nextTitle
    || JSON.stringify(doc.entries) !== JSON.stringify(nextEntries);
  if (!changed) return [];

  const nextDoc: DesignSpecDoc = {
    ...doc,
    title: nextTitle,
    updatedAt: now,
    entries: nextEntries,
    autoManagedPageId: input.pageId,
  };
  const nextManifest: DesignSpecManifest = {
    version: manifest.version,
    items: upsertManifestItem(manifest.items, nextDoc),
  };

  return [
    {
      path: `${DESIGN_SPEC_DIR}/spec-${nextDoc.id}.json`,
      content: JSON.stringify(nextDoc, null, 2),
    },
    {
      path: MANIFEST_PATH,
      content: JSON.stringify(nextManifest, null, 2),
    },
  ];
}

/** 将页面设计规范同步计划直接写入非 live 工作区。 */
export function applyPageDesignSpecSync(input: PageDesignSpecSyncInput): void {
  for (const write of buildPageDesignSpecSyncWrites(input)) {
    const absolutePath = path.join(input.workspacePath, write.path);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, write.content, "utf-8");
  }
}

function synchronizeEntries(
  entries: DesignSpecEntry[],
  pageId: string,
  eligibleFields: EligibleField[],
): DesignSpecEntry[] {
  const eligibleByKey = new Map(eligibleFields.map((field) => [field.key, field]));
  const retained = entries.filter(
    (entry) => !entry.autoManagedFieldKey || eligibleByKey.has(entry.autoManagedFieldKey),
  );
  const existingKeys = new Set(
    retained.flatMap((entry) => entry.autoManagedFieldKey ? [entry.autoManagedFieldKey] : []),
  );
  const synchronized = retained.map((entry) => {
    if (!entry.autoManagedFieldKey) return entry;
    const field = eligibleByKey.get(entry.autoManagedFieldKey)!;
    return {
      ...entry,
      title: field.title,
      target: { type: "config" as const, refs: [createPageRef(pageId, field.key)] },
    };
  });

  for (const field of eligibleFields) {
    if (existingKeys.has(field.key)) continue;
    synchronized.push({
      id: generateId("e"),
      title: field.title,
      markdown: "",
      target: { type: "config", refs: [createPageRef(pageId, field.key)] },
      autoManagedFieldKey: field.key,
    });
  }
  return synchronized;
}

function collectEligibleFields(schema: string): EligibleField[] {
  return enumerateSchemaFields(schema)
    .filter((field) => isImageOrMotionField(field.key, field))
    .map((field) => ({ key: field.key, title: field.title }));
}

function isImageOrMotionField(_key: string, field: { type?: string; uiWidget?: string; format?: string }): boolean {
  const type = String(field.type ?? "").toLowerCase();
  const widget = String(field.uiWidget ?? "").toLowerCase();
  const format = String(field.format ?? "").toLowerCase();
  const isImage = type === "image" || type === "imagelist" || format === "image"
    || widget === "image" || widget === "imagelist";
  const isMotion = type === "motion" || widget === "motion"
    || format === "motion";
  return isImage || isMotion;
}

function readManifest(filePath: string): { manifest: DesignSpecManifest } {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DesignSpecManifest>;
    return {
      manifest: {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      },
    };
  } catch {
    return { manifest: { version: 1, items: [] } };
  }
}

function readDoc(workspacePath: string, id: string): DesignSpecDoc | null {
  try {
    const raw = fs.readFileSync(path.join(workspacePath, DESIGN_SPEC_DIR, `spec-${id}.json`), "utf-8");
    const parsed = JSON.parse(raw) as Partial<DesignSpecDoc>;
    if (parsed.id !== id || !Array.isArray(parsed.entries)) return null;
    return {
      ...parsed,
      id,
      title: typeof parsed.title === "string" ? parsed.title : "",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      entries: parsed.entries.map((entry) => normalizeEntry(entry, parsed.autoManagedPageId)),
    } as DesignSpecDoc;
  } catch {
    return null;
  }
}

function normalizeEntry(value: unknown, fallbackPageId?: string): DesignSpecEntry {
  const entry = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacyRefs = normalizeRefs(entry.refs);
  const targetValue = entry.target && typeof entry.target === "object"
    ? entry.target as Record<string, unknown>
    : undefined;
  const target: DesignSpecTarget = targetValue?.type === "config"
    ? { type: "config", refs: normalizeRefs(targetValue.refs) }
    : targetValue?.type === "page"
      ? { type: "page", pageIds: normalizePageIds(targetValue.pageIds) }
      : legacyRefs.length > 0
        ? { type: "config", refs: legacyRefs }
        : { type: "page", pageIds: fallbackPageId ? [fallbackPageId] : [] };
  return {
    id: typeof entry.id === "string" ? entry.id : generateId("e"),
    title: typeof entry.title === "string" ? entry.title : "",
    markdown: typeof entry.markdown === "string" ? entry.markdown : "",
    target,
    autoManagedFieldKey: typeof entry.autoManagedFieldKey === "string"
      ? entry.autoManagedFieldKey
      : undefined,
  };
}

function normalizeRefs(value: unknown): DesignSpecRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const ref = candidate as Partial<DesignSpecRef>;
    if ((ref.scope !== "project" && ref.scope !== "page") || typeof ref.fieldKey !== "string" || !ref.fieldKey) return [];
    const normalized = { scope: ref.scope, pageId: ref.scope === "page" ? ref.pageId : undefined, fieldKey: ref.fieldKey } as DesignSpecRef;
    const key = `${normalized.scope}:${normalized.pageId ?? ""}:${normalized.fieldKey}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function normalizePageIds(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0)))
    : [];
}

function upsertManifestItem(
  items: DesignSpecManifest["items"],
  doc: DesignSpecDoc,
): DesignSpecManifest["items"] {
  const item = { id: doc.id, title: doc.title, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
  const index = items.findIndex((candidate) => candidate.id === doc.id);
  if (index < 0) return [...items, item];
  return items.map((candidate, itemIndex) => itemIndex === index ? item : candidate);
}

function pageDesignSpecTitle(pageName: string): string {
  return `${pageName.trim() || "未命名页面"}设计规范`;
}

function createPageRef(pageId: string, fieldKey: string): DesignSpecRef {
  return { scope: "page", pageId, fieldKey };
}

function generateId(prefix: "ds" | "e"): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}
