import * as fs from "fs";
import * as path from "path";
import { validateWorkspacePathSegment } from "@workbench/shared/workspace-path";

export const WORKSPACE_TREE_FILENAME = "workspace-tree.json";

export interface WorkspacePage {
  id: string;
  name: string;
  routeKey?: string;
  order: number;
  parentId: string | null;
  runtimeType?: string;
}

export interface WorkspaceTree {
  folders: unknown[];
  pages: WorkspacePage[];
}

export interface WorkspacePageDiagnostic {
  pageId: string | null;
  code: "INVALID_PAGE_ID" | "INCOMPLETE_PAGE" | "INVALID_WORKSPACE_TREE";
  reason: string;
  source: "workspace-tree" | "filesystem";
}

export function getPageEntryFileName(runtimeType?: string): string {
  switch (runtimeType) {
    case "prototype-html-css":
      return "prototype.html";
    case "sandboxed-html":
      return "sandbox.html";
    case "high-fidelity-react":
      return "index.tsx";
    case "sketch-scene":
      return "sketch.scene.json";
    default:
      throw new Error(`Unknown page runtime: ${runtimeType ?? "missing"}`);
  }
}

const RUNTIME_ENTRY_FILES = [
  ["prototype-html-css", "prototype.html"],
  ["sandboxed-html", "sandbox.html"],
  ["high-fidelity-react", "index.tsx"],
  ["sketch-scene", "sketch.scene.json"],
] as const;

/** Infer only when the persisted runtime is absent; explicit unknown values fail closed. */
export function resolvePageRuntimeType(
  pageDir: string,
  runtimeType?: string,
): string | undefined {
  if (runtimeType !== undefined) {
    return RUNTIME_ENTRY_FILES.some(([candidate]) => candidate === runtimeType)
      ? runtimeType
      : undefined;
  }
  const matches = RUNTIME_ENTRY_FILES.filter(([, fileName]) =>
    fs.existsSync(path.join(pageDir, fileName)),
  );
  return matches.length === 1 ? matches[0][0] : undefined;
}

export function resolvePageRuntimeTypeFromSnapshot(
  resources: Record<string, string>,
  pageId: string,
  runtimeType?: string,
): string | undefined {
  if (runtimeType !== undefined) {
    return RUNTIME_ENTRY_FILES.some(([candidate]) => candidate === runtimeType)
      ? runtimeType
      : undefined;
  }
  const matches = RUNTIME_ENTRY_FILES.filter(([, fileName]) =>
    `demos/${pageId}/${fileName}` in resources,
  );
  return matches.length === 1 ? matches[0][0] : undefined;
}

export function getWorkspaceTreePath(workingDir: string): string {
  return path.join(workingDir, WORKSPACE_TREE_FILENAME);
}

export function getPageDir(workingDir: string, pageId: string): string {
  return path.join(workingDir, "demos", pageId);
}

export function isSafePageId(pageId: string): boolean {
  return validateWorkspacePathSegment(pageId).ok;
}

function generatePageSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20)
    .replace(/-$/, "");
  return slug || "page";
}

function isValidRouteKey(routeKey: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(routeKey);
}

function makeUniqueRouteKey(base: string, used: Set<string>): string {
  const normalizedBase = isValidRouteKey(base) ? base : generatePageSlug(base);
  let candidate = normalizedBase || "page";
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${normalizedBase || "page"}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/** Normalize page route keys before writing the page tree through Authority. */
export function normalizeWorkspacePageRouteKeys<T extends WorkspacePage>(pages: T[]): T[] {
  const used = new Set<string>();
  return pages.map((page) => {
    const current = typeof page.routeKey === "string" ? page.routeKey.trim() : "";
    if (current && isValidRouteKey(current) && !used.has(current)) {
      used.add(current);
      return page;
    }
    return {
      ...page,
      routeKey: makeUniqueRouteKey(current || page.name || page.id, used),
    };
  });
}

export function isCompletePageDir(
  workingDir: string,
  pageId: string,
  runtimeType?: string,
): boolean {
  const pageDir = getPageDir(workingDir, pageId);
  if (!fs.existsSync(pageDir)) return false;
  if (!fs.existsSync(path.join(pageDir, "config.schema.json"))) return false;
  const resolvedRuntimeType = resolvePageRuntimeType(pageDir, runtimeType);
  if (!resolvedRuntimeType) return false;
  let entryFile: string;
  try {
    entryFile = getPageEntryFileName(resolvedRuntimeType);
  } catch {
    return false;
  }
  if (!fs.existsSync(path.join(pageDir, entryFile))) return false;
  if (resolvedRuntimeType === "sandboxed-html") {
    return fs.existsSync(path.join(pageDir, "html-import.meta.json"));
  }
  return true;
}

export function isCompletePageDirFromSnapshot(
  resources: Record<string, string>,
  pageId: string,
  runtimeType?: string,
): boolean {
  const schemaPath = `demos/${pageId}/config.schema.json`;
  if (!(schemaPath in resources)) return false;
  const resolvedRuntimeType = resolvePageRuntimeTypeFromSnapshot(resources, pageId, runtimeType);
  if (!resolvedRuntimeType) return false;
  let entryFile: string;
  try {
    entryFile = getPageEntryFileName(resolvedRuntimeType);
  } catch {
    return false;
  }
  const entryPath = `demos/${pageId}/${entryFile}`;
  if (!(entryPath in resources)) return false;
  return resolvedRuntimeType !== "sandboxed-html" ||
    `demos/${pageId}/html-import.meta.json` in resources;
}

export function formatPageEntry(
  pageId: string,
  runtimeType?: string,
): { indexPath: string; schemaPath: string } {
  const entryFile = getPageEntryFileName(runtimeType);
  return {
    indexPath: `demos/${pageId}/${entryFile}`,
    schemaPath: `demos/${pageId}/config.schema.json`,
  };
}

export function readWorkspaceTree(workingDir: string): WorkspaceTree {
  const treePath = getWorkspaceTreePath(workingDir);
  if (!fs.existsSync(treePath)) {
    return { folders: [], pages: [] };
  }
  const parsed = JSON.parse(
    fs.readFileSync(treePath, "utf-8"),
  ) as Partial<WorkspaceTree>;
  return {
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
  };
}

export function listPagesWithDiagnostics(
  workingDir: string,
): { pages: WorkspacePage[]; diagnostics: WorkspacePageDiagnostic[] } {
  const tree = readWorkspaceTree(workingDir);
  const diagnostics: WorkspacePageDiagnostic[] = [];
  const pages = tree.pages.flatMap((page) => {
    if (typeof page.id !== "string" || !isSafePageId(page.id)) {
      diagnostics.push({
        pageId: typeof page.id === "string" ? page.id : null,
        code: "INVALID_PAGE_ID",
        reason: "page id must be one Unicode-safe path segment",
        source: "workspace-tree",
      });
      return [];
    }
    if (!isCompletePageDir(workingDir, page.id, page.runtimeType)) {
      diagnostics.push({
        pageId: page.id,
        code: "INCOMPLETE_PAGE",
        reason: "page metadata exists but its schema or runtime entry is incomplete",
        source: "filesystem",
      });
      return [];
    }
    return [{
      ...page,
      runtimeType: resolvePageRuntimeType(getPageDir(workingDir, page.id), page.runtimeType),
    }];
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { pages, diagnostics };
}

export function listPages(workingDir: string): WorkspacePage[] {
  return listPagesWithDiagnostics(workingDir).pages;
}

export function listPagesFromSnapshotWithDiagnostics(
  resources: Record<string, string>,
): { pages: WorkspacePage[]; diagnostics: WorkspacePageDiagnostic[] } {
  const treeContent = resources[WORKSPACE_TREE_FILENAME];
  if (!treeContent) return { pages: [], diagnostics: [] };

  let tree: WorkspaceTree;
  try {
    const parsed = JSON.parse(treeContent) as Partial<WorkspaceTree>;
    tree = {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    };
  } catch {
    return {
      pages: [],
      diagnostics: [{
        pageId: null,
        code: "INVALID_WORKSPACE_TREE",
        reason: "workspace-tree.json is not valid JSON",
        source: "workspace-tree",
      }],
    };
  }

  const diagnostics: WorkspacePageDiagnostic[] = [];
  const pages = tree.pages.flatMap((page) => {
    if (typeof page.id !== "string" || !isSafePageId(page.id)) {
      diagnostics.push({
        pageId: typeof page.id === "string" ? page.id : null,
        code: "INVALID_PAGE_ID",
        reason: "page id must be one Unicode-safe path segment",
        source: "workspace-tree",
      });
      return [];
    }
    if (!isCompletePageDirFromSnapshot(resources, page.id, page.runtimeType)) {
      diagnostics.push({
        pageId: page.id,
        code: "INCOMPLETE_PAGE",
        reason: "page metadata exists but its schema or runtime entry is incomplete",
        source: "filesystem",
      });
      return [];
    }
    return [{
      ...page,
      runtimeType: resolvePageRuntimeTypeFromSnapshot(resources, page.id, page.runtimeType),
    }];
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { pages, diagnostics };
}
