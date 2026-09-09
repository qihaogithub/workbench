import {
  buildCanvasPageNavigation,
  type CanvasPageNavigationGroup,
  type CanvasPageNavigationNode,
} from "@workbench/demo-ui/canvas-page-navigation";
import type { CanvasState } from "@workbench/demo-ui/types";

export type SinglePreviewPage = {
  id: string;
  name: string;
  order?: number;
};

export type SinglePreviewNavigableItem = {
  value: string;
  group: "页面";
  label: string;
  groupId?: string;
  groupLabel?: string;
};

export type SinglePreviewNavigationGroup = {
  id: string;
  label: string;
  items: SinglePreviewNavigableItem[];
};

export type SinglePreviewNavigation = {
  groups: SinglePreviewNavigationGroup[];
  items: SinglePreviewNavigableItem[];
};

function toItem(
  node: Extract<CanvasPageNavigationNode, { kind: "page" }>,
  group?: CanvasPageNavigationGroup,
): SinglePreviewNavigableItem {
  return {
    value: `page:${node.pageId}`,
    group: "页面",
    label: node.name,
    ...(group ? { groupId: group.groupId, groupLabel: group.title } : {}),
  };
}

function flattenGroup(
  group: CanvasPageNavigationGroup,
): SinglePreviewNavigableItem[] {
  return group.children.flatMap((child) =>
    child.kind === "page" ? toItem(child, group) : flattenGroup(child),
  );
}

function collectMenuGroups(
  group: CanvasPageNavigationGroup,
  target: SinglePreviewNavigationGroup[],
): void {
  const directItems = group.children
    .filter((child): child is Extract<CanvasPageNavigationNode, { kind: "page" }> =>
      child.kind === "page",
    )
    .map((page) => toItem(page, group));
  if (directItems.length > 0) {
    target.push({ id: group.groupId, label: group.title, items: directItems });
  }
  for (const child of group.children) {
    if (child.kind === "group") collectMenuGroups(child, target);
  }
}

export function buildSinglePreviewNavigation(
  pages: readonly SinglePreviewPage[],
  canvasState?: Pick<CanvasState, "pages" | "sections">,
): SinglePreviewNavigation {
  const navigation = buildCanvasPageNavigation(
    pages.map((page, index) => ({
      id: page.id,
      name: page.name,
      order: page.order ?? index,
    })),
    canvasState,
  );
  const groups: SinglePreviewNavigationGroup[] = [];
  const items: SinglePreviewNavigableItem[] = [];
  let ungroupedGroup: SinglePreviewNavigationGroup | null = null;

  for (const node of navigation.nodes) {
    if (node.kind === "page") {
      const item = toItem(node);
      if (!ungroupedGroup) {
        ungroupedGroup = { id: "ungrouped", label: "页面", items: [] };
        groups.push(ungroupedGroup);
      }
      ungroupedGroup.items.push(item);
      items.push(item);
      continue;
    }
    const groupItems = flattenGroup(node);
    if (groupItems.length === 0) continue;
    collectMenuGroups(node, groups);
    items.push(...groupItems);
  }

  return { groups, items };
}

/** 单页目录和前后翻页只允许在页面之间导航。 */
export function buildSinglePreviewNavigableItems(
  pages: readonly SinglePreviewPage[],
  canvasState?: Pick<CanvasState, "pages" | "sections">,
): SinglePreviewNavigableItem[] {
  return buildSinglePreviewNavigation(pages, canvasState).items;
}
