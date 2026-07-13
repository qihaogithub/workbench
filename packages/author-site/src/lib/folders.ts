import path from "path";
import type { DemoFolderMeta, DemoPageMeta } from "@workbench/shared";
import {
  readWorkspaceTree,
  writeWorkspaceTree,
  deleteWorkspaceDemoPage,
} from "./fs-utils";

export function readFoldersMeta(workspacePath: string): DemoFolderMeta[] {
  return readWorkspaceTree(workspacePath).folders;
}

export function generateFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getFolderDepth(
  folderId: string,
  folders: DemoFolderMeta[],
): number {
  let depth = 0;
  let current = folders.find((f) => f.id === folderId);
  while (current?.parentId) {
    depth++;
    current = folders.find((f) => f.id === current!.parentId);
  }
  return depth;
}

export function isDescendant(
  folderId: string,
  targetParentId: string,
  folders: DemoFolderMeta[],
): boolean {
  let current = folders.find((f) => f.id === targetParentId);
  while (current) {
    if (current.id === folderId) return true;
    current = folders.find((f) => f.id === current!.parentId);
  }
  return false;
}

export function createDemoFolder(
  workspacePath: string,
  name: string,
  parentId?: string | null,
): DemoFolderMeta | null {
  const tree = readWorkspaceTree(workspacePath);
  const folders = tree.folders;

  if (parentId) {
    const parent = folders.find((f) => f.id === parentId);
    if (!parent) return null;
    if (getFolderDepth(parentId, folders) >= 3) return null;
  }

  const sameParent = folders.filter(
    (f) => (f.parentId ?? null) === (parentId ?? null),
  );
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((f) => f.order)) + 1 : 0;

  const folder: DemoFolderMeta = {
    id: generateFolderId(),
    name: name.trim() || "新建文件夹",
    parentId: parentId ?? null,
    order: nextOrder,
  };

  tree.folders.push(folder);
  writeWorkspaceTree(workspacePath, tree);
  return folder;
}

export function updateDemoFolder(
  workspacePath: string,
  folderId: string,
  patch: { name?: string; parentId?: string | null; order?: number },
): DemoFolderMeta | null {
  const tree = readWorkspaceTree(workspacePath);
  const index = tree.folders.findIndex((f) => f.id === folderId);
  if (index === -1) return null;

  if (patch.parentId !== undefined && patch.parentId !== null) {
    const targetParent = tree.folders.find((f) => f.id === patch.parentId);
    if (!targetParent) return null;
    if (isDescendant(folderId, patch.parentId, tree.folders)) return null;
    if (getFolderDepth(folderId, tree.folders) + 1 > 3) return null;
  }

  const existing = tree.folders[index];
  tree.folders[index] = {
    ...existing,
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.parentId !== undefined && { parentId: patch.parentId }),
    ...(patch.order !== undefined && { order: patch.order }),
  };

  writeWorkspaceTree(workspacePath, tree);
  return tree.folders[index];
}

export function deleteDemoFolder(
  workspacePath: string,
  folderId: string,
  deleteContents: boolean = false,
): { success: boolean; deletedPageIds?: string[] } {
  const tree = readWorkspaceTree(workspacePath);
  const index = tree.folders.findIndex((f) => f.id === folderId);
  if (index === -1) return { success: false };

  const deletedPageIds: string[] = [];

  if (deleteContents) {
    const descendantFolderIds = new Set<string>();
    const collectDescendants = (parentId: string) => {
      for (const f of tree.folders) {
        if (f.parentId === parentId) {
          descendantFolderIds.add(f.id);
          collectDescendants(f.id);
        }
      }
    };
    collectDescendants(folderId);
    descendantFolderIds.add(folderId);

    const pages = tree.pages;
    for (const page of pages) {
      if (page.parentId && descendantFolderIds.has(page.parentId)) {
        const wsId = path.basename(workspacePath);
        deleteWorkspaceDemoPage(wsId, page.id);
        deletedPageIds.push(page.id);
      }
    }

    tree.folders = tree.folders.filter((f) => !descendantFolderIds.has(f.id));
    tree.pages = tree.pages.filter((p) => !deletedPageIds.includes(p.id));
    writeWorkspaceTree(workspacePath, tree);
  } else {
    tree.folders = tree.folders.filter((f) => f.id !== folderId);
    for (const f of tree.folders) {
      if (f.parentId === folderId) {
        f.parentId =
          tree.folders.find((fo) => fo.id === folderId)?.parentId ?? null;
      }
    }

    let changed = false;
    for (const p of tree.pages) {
      if (p.parentId === folderId) {
        p.parentId =
          tree.folders.find((fo) => fo.id === folderId)?.parentId ?? null;
        changed = true;
      }
    }

    writeWorkspaceTree(workspacePath, tree);
  }

  return { success: true, deletedPageIds };
}

export function reorderDemoPages(
  workspacePath: string,
  pageUpdates: Array<{ id: string; order: number; parentId: string | null }>,
  folderUpdates?: Array<{ id: string; order: number; parentId: string | null }>,
): boolean {
  const tree = readWorkspaceTree(workspacePath);

  for (const u of pageUpdates) {
    const idx = tree.pages.findIndex((p) => p.id === u.id);
    if (idx !== -1) {
      tree.pages[idx] = {
        ...tree.pages[idx],
        order: u.order,
        parentId: u.parentId,
      };
    }
  }

  if (folderUpdates && folderUpdates.length > 0) {
    for (const u of folderUpdates) {
      const idx = tree.folders.findIndex((f) => f.id === u.id);
      if (idx !== -1) {
        tree.folders[idx] = {
          ...tree.folders[idx],
          order: u.order,
          parentId: u.parentId,
        };
      }
    }
  }

  writeWorkspaceTree(workspacePath, tree);
  return true;
}
