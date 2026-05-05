import type { DemoPageMeta, DemoFolderMeta } from "@opencode-workbench/shared";

type DemoPageItem = DemoPageMeta | DemoFolderMeta;

export interface FlatTreeItem {
  item: DemoPageMeta | DemoFolderMeta;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

export function flattenTree(
  pages: DemoPageMeta[],
  folders: DemoFolderMeta[],
  expandedFolders: Set<string>,
): FlatTreeItem[] {
  const result: FlatTreeItem[] = [];

  function walk(parentId: string | null, depth: number) {
    const childFolders = folders
      .filter(f => (f.parentId ?? null) === parentId)
      .sort((a, b) => a.order - b.order);
    const childPages = pages
      .filter(p => (p.parentId ?? null) === parentId)
      .sort((a, b) => a.order - b.order);

    for (const folder of childFolders) {
      const isExpanded = expandedFolders.has(folder.id);
      const hasChildren = folders.some(f => (f.parentId ?? null) === folder.id)
        || pages.some(p => (p.parentId ?? null) === folder.id);
      result.push({ item: folder, depth, isExpanded, hasChildren });
      if (isExpanded) {
        walk(folder.id, depth + 1);
      }
    }

    for (const page of childPages) {
      result.push({ item: page, depth, isExpanded: false, hasChildren: false });
    }
  }

  walk(null, 0);
  return result;
}

export function findItemById(
  id: string,
  pages: DemoPageMeta[],
  folders: DemoFolderMeta[],
): DemoPageItem | null {
  const folder = folders.find(f => f.id === id);
  if (folder) return folder;
  const page = pages.find(p => p.id === id);
  if (page) return page;
  return null;
}

export function reorderSiblings<T extends { id: string; order: number; parentId: string | null }>(
  items: T[],
  targetParentId: string | null,
  activeId: string,
  overId: string,
): T[] {
  const siblings = items.filter(i => (i.parentId ?? null) === targetParentId);
  const nonSiblings = items.filter(i => (i.parentId ?? null) !== targetParentId);

  const activeIdx = siblings.findIndex(s => s.id === activeId);
  const overIdx = siblings.findIndex(s => s.id === overId);
  if (activeIdx === -1 || overIdx === -1) return items;

  const reordered = arrayMoveImmutable(siblings, activeIdx, overIdx);
  const withNewOrders = reordered.map((item, index) => ({ ...item, order: index }));

  return [...nonSiblings, ...withNewOrders];
}

function arrayMoveImmutable<T>(array: T[], from: number, to: number): T[] {
  const result = [...array];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

export function getDescendantFolderIds(folderId: string, folders: DemoFolderMeta[]): string[] {
  const result: string[] = [];
  function collect(parentId: string) {
    for (const f of folders) {
      if ((f.parentId ?? null) === parentId) {
        result.push(f.id);
        collect(f.id);
      }
    }
  }
  collect(folderId);
  return result;
}

export function isDescendantLocal(folderId: string, targetParentId: string, folders: DemoFolderMeta[]): boolean {
  let current = folders.find(f => f.id === targetParentId);
  while (current) {
    if (current.id === folderId) return true;
    current = folders.find(f => f.id === current!.parentId);
  }
  return false;
}
