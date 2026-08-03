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
    case "high-fidelity-react":
      return "index.tsx";
    case "sketch-scene":
      return "scene.json";
    default:
      return "index.tsx";
  }
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
  const entryFile = getPageEntryFileName(runtimeType);
  return fs.existsSync(path.join(pageDir, entryFile));
}

export function isCompletePageDirFromSnapshot(
  resources: Record<string, string>,
  pageId: string,
  runtimeType?: string,
): boolean {
  const schemaPath = `demos/${pageId}/config.schema.json`;
  if (!(schemaPath in resources)) return false;
  const entryFile = getPageEntryFileName(runtimeType);
  const entryPath = `demos/${pageId}/${entryFile}`;
  return entryPath in resources;
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
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}