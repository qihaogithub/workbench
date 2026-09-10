import type {
  CanvasPageData,
  CanvasPageLayout,
  CanvasSection,
  CanvasState,
} from "./types";

export interface CanvasPageNavigationPage {
  kind: "page";
  pageId: string;
  name: string;
  order: number;
}

export interface CanvasPageNavigationGroup {
  kind: "group";
  groupId: string;
  title: string;
  layout?: CanvasPageLayout;
  children: CanvasPageNavigationNode[];
}

export type CanvasPageNavigationNode =
  | CanvasPageNavigationPage
  | CanvasPageNavigationGroup;

export interface CanvasPageNavigation {
  nodes: CanvasPageNavigationNode[];
  pages: CanvasPageNavigationPage[];
}

interface NavigationItem {
  id: string;
  kind: "page" | "section";
  name: string;
  order: number;
  layout?: CanvasPageLayout;
}

function compareNavigationItems(a: NavigationItem, b: NavigationItem): number {
  if (a.layout && b.layout) {
    const yDiff = a.layout.y - b.layout.y;
    if (Math.abs(yDiff) > 1) return yDiff;
    const xDiff = a.layout.x - b.layout.x;
    if (Math.abs(xDiff) > 1) return xDiff;
  } else if (a.layout || b.layout) {
    // A missing canvas layout falls back to the persisted page/folder order,
    // while known canvas items keep their visual position ahead of it.
    return a.layout ? -1 : 1;
  }

  return a.order - b.order || a.id.localeCompare(b.id);
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed === "Section" ? "分组" : trimmed || "分组";
}

function getSectionChildren(
  section: CanvasSection,
  pageIds: Set<string>,
  sectionIds: Set<string>,
): Array<{ kind: "page" | "section"; id: string }> {
  const seen = new Set<string>();
  const children: Array<{ kind: "page" | "section"; id: string }> = [];
  for (const child of section.children) {
    if (child.kind !== "page" && child.kind !== "section") continue;
    if (!pageIds.has(child.id) && !sectionIds.has(child.id)) continue;
    if (seen.has(`${child.kind}:${child.id}`)) continue;
    seen.add(`${child.kind}:${child.id}`);
    children.push({ kind: child.kind, id: child.id });
  }
  return children;
}

/**
 * Builds the read-only page navigation projection shared by the author menu
 * and viewer directory. Canvas Sections are presentation groups only; this
 * function never mutates the canvas state or the persisted page folders.
 */
export function buildCanvasPageNavigation(
  pages: readonly Pick<CanvasPageData, "id" | "name" | "order">[],
  canvasState?: Pick<CanvasState, "pages" | "sections">,
): CanvasPageNavigation {
  const pageById = new Map(
    pages.map((page) => [
      page.id,
      {
        kind: "page" as const,
        pageId: page.id,
        name: page.name,
        order: page.order,
      },
    ]),
  );
  const pageIds = new Set(pageById.keys());
  const layouts = canvasState?.pages ?? {};
  const sections = canvasState?.sections ?? {};
  const sectionIds = new Set(Object.keys(sections));

  const sectionItems = new Map<string, NavigationItem>();
  for (const [sectionId, section] of Object.entries(sections)) {
    sectionItems.set(sectionId, {
      id: sectionId,
      kind: "section",
      name: normalizeTitle(section.title),
      order: Number.MAX_SAFE_INTEGER,
      layout: section.layout,
    });
  }

  const pageItems = new Map<string, NavigationItem>();
  for (const page of pageById.values()) {
    pageItems.set(page.pageId, {
      id: page.pageId,
      kind: "page",
      name: page.name,
      order: page.order,
      layout: layouts[page.pageId],
    });
  }

  const childrenBySection = new Map<
    string,
    Array<{ kind: "page" | "section"; id: string }>
  >();
  const sectionParents = new Map<string, string>();

  for (const [sectionId, section] of Object.entries(sections).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const children = getSectionChildren(section, pageIds, sectionIds);
    childrenBySection.set(sectionId, children);
    for (const child of children) {
      if (child.kind === "section") {
        if (!sectionParents.has(child.id) && child.id !== sectionId) {
          sectionParents.set(child.id, sectionId);
        }
      }
    }
  }

  const rootSectionIds = Object.keys(sections).filter(
    (sectionId) => !sectionParents.has(sectionId),
  );
  // A malformed cycle can give every Section a parent. Pick one stable root
  // so the cycle is still traversed once and its pages can fall back safely.
  if (rootSectionIds.length === 0 && sectionIds.size > 0) {
    rootSectionIds.push([...sectionIds].sort((a, b) => a.localeCompare(b))[0]);
  }
  const renderedSections = new Set<string>();
  const renderedPages = new Set<string>();

  const getChildSortItem = (
    child: { kind: "page" | "section"; id: string },
  ): NavigationItem =>
    child.kind === "page"
      ? pageItems.get(child.id) ?? {
          id: child.id,
          kind: "page",
          name: child.id,
          order: Number.MAX_SAFE_INTEGER,
        }
      : sectionItems.get(child.id) ?? {
          id: child.id,
          kind: "section",
          name: "分组",
          order: Number.MAX_SAFE_INTEGER,
        };

  const buildSection = (
    sectionId: string,
    ancestry: Set<string>,
  ): CanvasPageNavigationGroup | null => {
    if (ancestry.has(sectionId) || renderedSections.has(sectionId)) return null;
    const section = sections[sectionId];
    if (!section) return null;

    const nextAncestry = new Set(ancestry).add(sectionId);
    const children = [...(childrenBySection.get(sectionId) ?? [])].sort((a, b) =>
      compareNavigationItems(getChildSortItem(a), getChildSortItem(b)),
    );
    const nodes: CanvasPageNavigationNode[] = [];

    for (const child of children) {
      if (child.kind === "section") {
        const nested = buildSection(child.id, nextAncestry);
        if (nested) nodes.push(nested);
        continue;
      }
      if (renderedPages.has(child.id)) continue;
      const page = pageById.get(child.id);
      if (!page) continue;
      renderedPages.add(child.id);
      nodes.push(page);
    }

    if (nodes.length === 0) return null;
    renderedSections.add(sectionId);
    return {
      kind: "group",
      groupId: sectionId,
      title: normalizeTitle(section.title),
      layout: section.layout,
      children: nodes,
    };
  };

  const roots: CanvasPageNavigationNode[] = [];
  const sortedRootSections = rootSectionIds.sort((a, b) =>
    compareNavigationItems(sectionItems.get(a)!, sectionItems.get(b)!),
  );
  for (const sectionId of sortedRootSections) {
    const section = buildSection(sectionId, new Set());
    if (section) roots.push(section);
  }

  const ungroupedPages = [...pageById.values()]
    .filter((page) => !renderedPages.has(page.pageId))
    .sort((a, b) =>
      compareNavigationItems(pageItems.get(a.pageId)!, pageItems.get(b.pageId)!),
    );
  roots.push(...ungroupedPages);

  const getRootSortItem = (node: CanvasPageNavigationNode): NavigationItem =>
    node.kind === "page"
      ? pageItems.get(node.pageId)!
      : sectionItems.get(node.groupId)!;
  roots.sort((a, b) =>
    compareNavigationItems(getRootSortItem(a), getRootSortItem(b)),
  );

  const pagesInNavigation: CanvasPageNavigationPage[] = [];
  const flatten = (nodes: CanvasPageNavigationNode[]) => {
    for (const node of nodes) {
      if (node.kind === "page") pagesInNavigation.push(node);
      else flatten(node.children);
    }
  };
  flatten(roots);

  // Malformed Section data should never hide a page from the menu.
  const missingPages = [...pageById.values()]
    .filter((page) => !pagesInNavigation.some((item) => item.pageId === page.pageId))
    .sort((a, b) =>
      compareNavigationItems(pageItems.get(a.pageId)!, pageItems.get(b.pageId)!),
    );
  roots.push(...missingPages);
  pagesInNavigation.push(...missingPages);

  return { nodes: roots, pages: pagesInNavigation };
}
