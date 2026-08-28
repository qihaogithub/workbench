import type {
  CanvasFreeNode,
  CanvasPageLayout,
  CanvasSection,
  CanvasSectionChild,
  CanvasState,
} from "./types";

export interface CanvasSectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SECTION_ID_PREFIX = "section_";

function isFiniteLayout(layout: CanvasPageLayout): boolean {
  return [layout.x, layout.y, layout.width, layout.height].every(Number.isFinite)
    && layout.width > 0
    && layout.height > 0;
}

function compareChildren(a: CanvasSectionChild, b: CanvasSectionChild): number {
  return a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
}

function canAddSectionChild(
  parents: Map<string, string>,
  parentId: string,
  childId: string,
): boolean {
  if (parentId === childId || parents.has(childId)) return false;
  let cursor: string | undefined = parentId;
  while (cursor) {
    if (cursor === childId) return false;
    cursor = parents.get(cursor);
  }
  return true;
}

/**
 * Produces the canonical Section graph. Invalid references, multiple parents
 * and cycles are discarded deterministically instead of being repaired by
 * mutating pages or free nodes.
 */
export function normalizeCanvasSections(
  sections: Record<string, CanvasSection> | undefined,
  available: { pages: Record<string, CanvasPageLayout>; nodes: Record<string, CanvasFreeNode> },
): Record<string, CanvasSection> {
  if (!sections) return {};

  const candidates = Object.entries(sections)
    .filter(([id, section]) =>
      section.id === id &&
      section.kind === "section" &&
      id.startsWith(SECTION_ID_PREFIX) &&
      Boolean(section.title.trim()) &&
      isFiniteLayout(section.layout),
    )
    .sort(([a], [b]) => a.localeCompare(b));
  const knownSectionIds = new Set(candidates.map(([id]) => id));
  const candidateSections = Object.fromEntries(candidates);
  const parents = new Map<string, string>();
  const normalized: Record<string, CanvasSection> = {};

  for (const [id, section] of candidates) {
    const accepted: CanvasSectionChild[] = [];
    const seen = new Set<string>();
    for (const child of [...section.children].sort(compareChildren)) {
      const key = `${child.kind}:${child.id}`;
      if (seen.has(key)) continue;
      const valid =
        (child.kind === "page" && Boolean(available.pages[child.id])) ||
        (child.kind === "node" && Boolean(available.nodes[child.id])) ||
        (child.kind === "section" && knownSectionIds.has(child.id));
      if (!valid) continue;
      const childLayout = child.kind === "page"
        ? available.pages[child.id]
        : child.kind === "node"
          ? available.nodes[child.id]?.layout
          : candidateSections[child.id]?.layout;
      if (!childLayout || !sectionContainsLayout(section.layout, childLayout)) {
        continue;
      }
      if (child.kind === "section" && !canAddSectionChild(parents, id, child.id)) {
        continue;
      }
      if (child.kind !== "section" && parents.has(key)) continue;
      parents.set(child.kind === "section" ? child.id : key, id);
      accepted.push({ kind: child.kind, id: child.id });
      seen.add(key);
    }
    const style = section.style && {
      ...(section.style.color ? { color: section.style.color } : {}),
      ...(section.style.fillOpacity !== undefined
        ? { fillOpacity: Math.max(0, Math.min(100, section.style.fillOpacity)) }
        : {}),
    };
    normalized[id] = {
      id,
      kind: "section",
      title: section.title.trim().slice(0, 120),
      layout: { ...section.layout },
      ...(style && Object.keys(style).length > 0 ? { style } : {}),
      children: accepted,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
    };
  }
  return normalized;
}

export function getCanvasSectionParents(
  sections: Record<string, CanvasSection> | undefined,
): Map<string, string> {
  const parents = new Map<string, string>();
  for (const section of Object.values(sections ?? {})) {
    for (const child of section.children) {
      parents.set(`${child.kind}:${child.id}`, section.id);
    }
  }
  return parents;
}

interface CanvasLayoutUnit {
  id: string;
  bounds: CanvasSectionBounds;
  pageIds: string[];
  nodeIds: string[];
  sectionIds: string[];
}

function expandBounds(bounds: CanvasSectionBounds | undefined, layout: CanvasPageLayout): CanvasSectionBounds {
  if (!bounds) return { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
  const right = Math.max(bounds.x + bounds.width, layout.x + layout.width);
  const bottom = Math.max(bounds.y + bounds.height, layout.y + layout.height);
  return { x: Math.min(bounds.x, layout.x), y: Math.min(bounds.y, layout.y), width: right - Math.min(bounds.x, layout.x), height: bottom - Math.min(bounds.y, layout.y) };
}

/**
 * Rearranges root Section units and ungrouped objects without changing any
 * member's local relationship to its Section. Page groups are excluded.
 */
export function computeCanvasSectionAutoLayout(
  state: CanvasState,
  options: { columns?: number; gap?: number } = {},
): Pick<CanvasState, "pages" | "nodes" | "sections"> {
  const columns = Math.max(1, options.columns ?? 3);
  const gap = Math.max(0, options.gap ?? 48);
  const sections = state.sections ?? {};
  const nodes = state.nodes ?? {};
  const parents = getCanvasSectionParents(sections);
  const units: CanvasLayoutUnit[] = [];

  const appendSectionUnit = (rootId: string) => {
    let bounds: CanvasSectionBounds | undefined;
    const pageIds: string[] = [];
    const nodeIds: string[] = [];
    const sectionIds: string[] = [];
    const visit = (sectionId: string) => {
      const section = sections[sectionId];
      if (!section) return;
      sectionIds.push(sectionId);
      bounds = expandBounds(bounds, section.layout);
      for (const child of section.children) {
        if (child.kind === "section") visit(child.id);
        if (child.kind === "page" && state.pages[child.id]) {
          pageIds.push(child.id);
          bounds = expandBounds(bounds, state.pages[child.id]);
        }
        if (child.kind === "node" && nodes[child.id]) {
          nodeIds.push(child.id);
          bounds = expandBounds(bounds, nodes[child.id].layout);
        }
      }
    };
    visit(rootId);
    if (bounds) units.push({ id: `section:${rootId}`, bounds, pageIds, nodeIds, sectionIds });
  };

  for (const sectionId of Object.keys(sections).sort()) {
    if (!parents.has(`section:${sectionId}`)) appendSectionUnit(sectionId);
  }
  for (const [pageId, layout] of Object.entries(state.pages)) {
    if (!parents.has(`page:${pageId}`)) units.push({ id: `page:${pageId}`, bounds: { ...layout }, pageIds: [pageId], nodeIds: [], sectionIds: [] });
  }
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!parents.has(`node:${nodeId}`)) units.push({ id: `node:${nodeId}`, bounds: { ...node.layout }, pageIds: [], nodeIds: [nodeId], sectionIds: [] });
  }

  const ordered = [...units].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x || a.id.localeCompare(b.id));
  const maxWidth = Math.max(0, ...ordered.map((unit) => unit.bounds.width));
  const nextPages = { ...state.pages };
  const nextNodes = { ...nodes };
  const nextSections = { ...sections };
  let rowY = 0;

  for (let rowStart = 0; rowStart < ordered.length; rowStart += columns) {
    const row = ordered.slice(rowStart, rowStart + columns);
    const rowHeight = Math.max(...row.map((unit) => unit.bounds.height));
    row.forEach((unit, column) => {
      const targetX = column * (maxWidth + gap);
      const dx = targetX - unit.bounds.x;
      const dy = rowY - unit.bounds.y;
      for (const pageId of unit.pageIds) {
        const layout = nextPages[pageId];
        if (layout) nextPages[pageId] = { ...layout, x: layout.x + dx, y: layout.y + dy };
      }
      for (const nodeId of unit.nodeIds) {
        const node = nextNodes[nodeId];
        if (node) nextNodes[nodeId] = { ...node, layout: { ...node.layout, x: node.layout.x + dx, y: node.layout.y + dy } };
      }
      for (const sectionId of unit.sectionIds) {
        const section = nextSections[sectionId];
        if (section) nextSections[sectionId] = { ...section, layout: { ...section.layout, x: section.layout.x + dx, y: section.layout.y + dy } };
      }
    });
    rowY += rowHeight + gap;
  }
  return { pages: nextPages, nodes: nextNodes, sections: nextSections };
}

export function sectionContainsPoint(section: CanvasSection, point: { x: number; y: number }): boolean {
  const { x, y, width, height } = section.layout;
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

/** A member belongs to a Section only when its full outer bounds fit. */
export function sectionContainsLayout(
  section: CanvasSectionBounds,
  layout: CanvasSectionBounds,
): boolean {
  return layout.x >= section.x && layout.y >= section.y &&
    layout.x + layout.width <= section.x + section.width &&
    layout.y + layout.height <= section.y + section.height;
}

export function findInnermostSectionAtPoint(
  sections: Record<string, CanvasSection> | undefined,
  point: { x: number; y: number },
): CanvasSection | undefined {
  return Object.values(sections ?? {})
    .filter((section) => sectionContainsPoint(section, point))
    .sort((a, b) => a.layout.width * a.layout.height - b.layout.width * b.layout.height || b.layout.zIndex! - a.layout.zIndex!)[0];
}

/** Returns the visually innermost Section that completely contains an item. */
export function findInnermostSectionContainingLayout(
  sections: Record<string, CanvasSection> | undefined,
  layout: CanvasSectionBounds,
): CanvasSection | undefined {
  return Object.values(sections ?? {})
    .filter((section) => sectionContainsLayout(section.layout, layout))
    .sort((a, b) => a.layout.width * a.layout.height - b.layout.width * b.layout.height || a.id.localeCompare(b.id))[0];
}

/** Reparents a page or free node after a completed drag; page groups are intentionally unsupported. */
export function assignCanvasObjectToSection(
  state: CanvasState,
  child: { kind: "page" | "node"; id: string },
  layout: CanvasPageLayout,
): CanvasState {
  const target = findInnermostSectionContainingLayout(state.sections, layout)?.id;
  let changed = false;
  const sections = Object.fromEntries(Object.entries(state.sections ?? {}).map(([id, section]) => {
    const withoutChild = section.children.filter(
      (entry) => entry.kind !== child.kind || entry.id !== child.id,
    );
    const children = id === target ? [...withoutChild, child].sort(compareChildren) : withoutChild;
    if (children.length !== section.children.length || children.some((entry, index) => entry !== section.children[index])) changed = true;
    return [id, changed ? { ...section, children } : section];
  }));
  return changed ? { ...state, sections } : state;
}

/** Nests a dragged Section under a non-descendant Section, or releases it at root. */
export function assignCanvasSectionToSection(
  state: CanvasState,
  sectionId: string,
  layout: CanvasPageLayout,
): CanvasState {
  const source = state.sections?.[sectionId];
  if (!source) return state;
  const descendants = new Set<string>([sectionId]);
  const visit = (id: string) => {
    for (const child of state.sections?.[id]?.children ?? []) {
      if (child.kind === "section" && !descendants.has(child.id)) {
        descendants.add(child.id);
        visit(child.id);
      }
    }
  };
  visit(sectionId);
  const candidate = Object.values(state.sections ?? {})
    .filter((section) => !descendants.has(section.id) && sectionContainsLayout(section.layout, layout))
    .sort((a, b) => a.layout.width * a.layout.height - b.layout.width * b.layout.height || a.id.localeCompare(b.id))[0];
  const target = candidate?.id;
  const nextSections: Record<string, CanvasSection> = {};
  let changed = false;
  for (const [id, section] of Object.entries(state.sections ?? {})) {
    const without = section.children.filter((child) => child.kind !== "section" || child.id !== sectionId);
    const children = id === target ? [...without, { kind: "section" as const, id: sectionId }].sort(compareChildren) : without;
    const membershipChanged = children.length !== section.children.length || children.some((child, index) => child.kind !== section.children[index]?.kind || child.id !== section.children[index]?.id);
    nextSections[id] = membershipChanged ? { ...section, children } : section;
    changed ||= membershipChanged;
  }
  return changed ? { ...state, sections: nextSections } : state;
}

/**
 * Moves a Section as a unit, keeping every direct and nested member at its
 * existing offset. Membership is deliberately left unchanged here: callers
 * reconcile it once when the drag finishes, rather than on every pointer move.
 */
export function moveCanvasSectionWithChildren(
  state: CanvasState,
  sectionId: string,
  layout: CanvasPageLayout,
): CanvasState {
  const source = state.sections?.[sectionId];
  if (!source) return state;
  const dx = layout.x - source.layout.x;
  const dy = layout.y - source.layout.y;
  if (dx === 0 && dy === 0) return state;

  const pageIds = new Set<string>();
  const nodeIds = new Set<string>();
  const sectionIds = new Set<string>();
  const visit = (id: string) => {
    if (sectionIds.has(id)) return;
    sectionIds.add(id);
    for (const child of state.sections?.[id]?.children ?? []) {
      if (child.kind === "page") pageIds.add(child.id);
      else if (child.kind === "node") nodeIds.add(child.id);
      else visit(child.id);
    }
  };
  visit(sectionId);

  const now = Date.now();
  const sections = Object.fromEntries(
    Object.entries(state.sections ?? {}).map(([id, section]) => {
      if (!sectionIds.has(id)) return [id, section];
      const nextLayout = id === sectionId
        ? layout
        : { ...section.layout, x: section.layout.x + dx, y: section.layout.y + dy };
      return [id, { ...section, layout: nextLayout, updatedAt: now }];
    }),
  );
  const pages = { ...state.pages };
  for (const id of pageIds) {
    const pageLayout = pages[id];
    if (pageLayout) pages[id] = { ...pageLayout, x: pageLayout.x + dx, y: pageLayout.y + dy };
  }
  const nodes = state.nodes && { ...state.nodes };
  for (const id of nodeIds) {
    const node = nodes?.[id];
    if (node) {
      nodes[id] = {
        ...node,
        layout: { ...node.layout, x: node.layout.x + dx, y: node.layout.y + dy },
        updatedAt: now,
      };
    }
  }
  return { ...state, pages, ...(nodes ? { nodes } : {}), sections };
}

function getChildLayout(state: CanvasState, child: CanvasSectionChild): CanvasPageLayout | undefined {
  if (child.kind === "page") return state.pages[child.id];
  if (child.kind === "node") return state.nodes?.[child.id]?.layout;
  return state.sections?.[child.id]?.layout;
}

/** Expands a Section boundary to cover its direct members without moving them. */
export function fitCanvasSectionToChildren(
  state: CanvasState,
  sectionId: string,
  padding = 24,
): CanvasState {
  const section = state.sections?.[sectionId];
  if (!section) return state;
  let bounds: CanvasSectionBounds | undefined;
  for (const child of section.children) {
    const layout = getChildLayout(state, child);
    if (layout) bounds = expandBounds(bounds, layout);
  }
  if (!bounds) return state;
  const layout = {
    ...section.layout,
    x: Math.min(section.layout.x, bounds.x - padding),
    y: Math.min(section.layout.y, bounds.y - padding),
    width: Math.max(section.layout.x + section.layout.width, bounds.x + bounds.width + padding) - Math.min(section.layout.x, bounds.x - padding),
    height: Math.max(section.layout.y + section.layout.height, bounds.y + bounds.height + padding) - Math.min(section.layout.y, bounds.y - padding),
  };
  return { ...state, sections: { ...state.sections, [sectionId]: { ...section, layout } } };
}

/** Releases every direct member whose bounds are no longer fully inside its Section. */
export function reconcileCanvasSectionMembership(state: CanvasState): CanvasState {
  let changed = false;
  const sections = Object.fromEntries(Object.entries(state.sections ?? {}).map(([id, section]) => {
    const children = section.children.filter((child) => {
      const layout = getChildLayout(state, child);
      return Boolean(layout && sectionContainsLayout(section.layout, layout));
    });
    if (children.length === section.children.length) return [id, section];
    changed = true;
    return [id, { ...section, children }];
  }));
  return changed ? { ...state, sections } : state;
}

export function createCanvasSection(input: {
  id: string;
  layout: CanvasPageLayout;
  now?: number;
  title?: string;
}): CanvasSection {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    kind: "section",
    title: input.title?.trim().slice(0, 120) || "Section",
    layout: input.layout,
    children: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Removes a Section tree while releasing every page and free-node member. */
export function removeCanvasSection(
  state: CanvasState,
  sectionId: string,
): CanvasState {
  const sections = { ...(state.sections ?? {}) };
  if (!sections[sectionId]) return state;
  const descendants = new Set<string>([sectionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const section of Object.values(sections)) {
      if (!descendants.has(section.id)) continue;
      for (const child of section.children) {
        if (child.kind === "section" && !descendants.has(child.id)) {
          descendants.add(child.id);
          changed = true;
        }
      }
    }
  }
  for (const id of descendants) delete sections[id];
  const nextSections = Object.fromEntries(Object.entries(sections).map(([id, section]) => [
    id,
    { ...section, children: section.children.filter((child) => child.kind !== "section" || !descendants.has(child.id)) },
  ]));
  return {
    ...state,
    sections: nextSections,
  };
}
