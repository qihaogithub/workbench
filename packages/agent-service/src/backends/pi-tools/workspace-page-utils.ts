import * as fs from "fs";
import * as path from "path";

export const WORKSPACE_TREE_FILENAME = "workspace-tree.json";

export interface WorkspacePage {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
  runtimeType?: string;
}

export interface WorkspaceTree {
  folders: unknown[];
  pages: WorkspacePage[];
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
  return /^[A-Za-z0-9_-]+$/.test(pageId) && !pageId.includes("..");
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

export function listPages(workingDir: string): WorkspacePage[] {
  const tree = readWorkspaceTree(workingDir);
  return tree.pages
    .filter((page) => isSafePageId(page.id) && isCompletePageDir(workingDir, page.id, page.runtimeType))
    .map((page) => ({
      ...page,
      runtimeType: resolvePageRuntimeType(getPageDir(workingDir, page.id), page.runtimeType),
    }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
