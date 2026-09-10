import type {
  PublishedDemoPage,
  PublishedProject,
} from "./api";
import {
  buildCanvasPageNavigation,
  type CanvasPageNavigationNode,
} from "@workbench/demo-ui/canvas-page-navigation";
import type { CanvasPageLayout, CanvasState } from "@workbench/demo-ui/types";

export interface PageDirectoryTreeItem {
  type: "folder" | "page" | "canvas-group";
  id: string;
  name: string;
  order: number;
  parentId?: string | null;
  page?: PublishedDemoPage;
  layout?: CanvasPageLayout;
  children?: PageDirectoryTreeItem[];
}

export function buildPageDirectoryTree(
  demoPages: PublishedDemoPage[],
  demoFolders: PublishedProject["demoFolders"],
  canvasState?: CanvasState,
): PageDirectoryTreeItem[] {
  const navigation = buildCanvasPageNavigation(demoPages, canvasState);
  const groupedPageIds = new Set<string>();
  const collectGroupedPageIds = (
    nodes: CanvasPageNavigationNode[],
    grouped: boolean,
  ) => {
    for (const node of nodes) {
      if (node.kind === "page") {
        if (grouped) groupedPageIds.add(node.pageId);
      } else {
        collectGroupedPageIds(node.children, true);
      }
    }
  };
  collectGroupedPageIds(navigation.nodes, false);

  const folderMap = new Map<string, PageDirectoryTreeItem>();
  const rootItems: PageDirectoryTreeItem[] = [];
  const canvasLayouts = canvasState?.pages ?? {};

  for (const folder of demoFolders) {
    folderMap.set(folder.id, {
      type: "folder",
      id: folder.id,
      name: folder.name,
      order: folder.order,
      parentId: folder.parentId,
      children: [],
    });
  }

  for (const folder of demoFolders) {
    const item = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children!.push(item);
    } else {
      rootItems.push(item);
    }
  }

  for (const page of demoPages) {
    if (groupedPageIds.has(page.id)) continue;
    const pageItem: PageDirectoryTreeItem = {
      type: "page",
      id: page.id,
      name: page.name,
      order: page.order,
      parentId: page.parentId,
      page,
      layout: canvasLayouts[page.id],
    };
    if (page.parentId && folderMap.has(page.parentId)) {
      folderMap.get(page.parentId)!.children!.push(pageItem);
    } else {
      rootItems.push(pageItem);
    }
  }

  const toCanvasTreeItem = (
    node: CanvasPageNavigationNode,
  ): PageDirectoryTreeItem => {
    if (node.kind === "page") {
      const page = demoPages.find((candidate) => candidate.id === node.pageId);
      return {
        type: "page",
        id: node.pageId,
        name: node.name,
        order: node.order,
        parentId: page?.parentId,
        page,
        layout: canvasLayouts[node.pageId],
      };
    }
    const children = node.children.map(toCanvasTreeItem);
    return {
      type: "canvas-group",
      id: node.groupId,
      name: node.title,
      order: children[0]?.order ?? Number.MAX_SAFE_INTEGER,
      layout: node.layout,
      children,
    };
  };

  for (const node of navigation.nodes) {
    if (node.kind === "group") rootItems.push(toCanvasTreeItem(node));
  }

  const getFirstLayout = (
    item: PageDirectoryTreeItem,
  ): CanvasPageLayout | undefined => {
    if (item.layout) return item.layout;
    for (const child of item.children ?? []) {
      const layout = getFirstLayout(child);
      if (layout) return layout;
    }
    return undefined;
  };
  const sortItems = (items: PageDirectoryTreeItem[]) => {
    items.sort((a, b) => {
      const layoutA = getFirstLayout(a);
      const layoutB = getFirstLayout(b);
      if (layoutA && layoutB) {
        const yDiff = layoutA.y - layoutB.y;
        if (Math.abs(yDiff) > 1) return yDiff;
        const xDiff = layoutA.x - layoutB.x;
        if (Math.abs(xDiff) > 1) return xDiff;
      } else if (layoutA || layoutB) {
        return layoutA ? -1 : 1;
      }
      return a.order - b.order || a.id.localeCompare(b.id);
    });
    for (const item of items) {
      if (item.children) sortItems(item.children);
    }
  };
  sortItems(rootItems);
  return rootItems;
}
