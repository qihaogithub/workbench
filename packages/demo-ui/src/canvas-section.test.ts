import { describe, expect, it } from "vitest";
import {
  assignCanvasObjectToSection,
  assignCanvasSectionToSection,
  computeCanvasSectionAutoLayout,
  fitCanvasSectionToChildren,
  moveCanvasSectionWithChildren,
  normalizeCanvasSections,
  reconcileCanvasSectionMembership,
  removeCanvasSection,
  sectionContainsLayout,
} from "./canvas-section";
import type { CanvasFreeNode, CanvasPageLayout, CanvasSection } from "./types";

const layout: CanvasPageLayout = { x: 0, y: 0, width: 100, height: 80 };

function section(id: string, children: CanvasSection["children"] = []): CanvasSection {
  return {
    id,
    kind: "section",
    title: id,
    layout,
    children,
    createdAt: 1,
    updatedAt: 1,
  };
}

const textNode: CanvasFreeNode = {
  id: "node_1",
  kind: "text",
  title: "note",
  layout,
  text: "note",
  fontSize: 16,
  color: "#111111",
  createdAt: 1,
  updatedAt: 1,
};

describe("canvas Section graph", () => {
  it("keeps only one deterministic parent and rejects cycles and dangling references", () => {
    const sections = normalizeCanvasSections(
      {
        section_a: section("section_a", [
          { kind: "page", id: "page_1" },
          { kind: "section", id: "section_b" },
          { kind: "node", id: "missing" },
        ]),
        section_b: section("section_b", [
          { kind: "page", id: "page_1" },
          { kind: "section", id: "section_a" },
        ]),
      },
      { pages: { page_1: layout }, nodes: { node_1: textNode } },
    );

    expect(sections.section_a.children).toEqual([
      { kind: "page", id: "page_1" },
      { kind: "section", id: "section_b" },
    ]);
    expect(sections.section_b.children).toEqual([]);
  });

  it("drops persisted members that are no longer fully inside their Section", () => {
    const sections = normalizeCanvasSections(
      {
        section_a: {
          ...section("section_a", [{ kind: "page", id: "page_1" }]),
          layout: { x: 0, y: 0, width: 100, height: 100 },
        },
      },
      { pages: { page_1: { x: 80, y: 0, width: 40, height: 80 } }, nodes: {} },
    );

    expect(sections.section_a.children).toEqual([]);
  });

  it("deleting a Section releases page and free-node members", () => {
    const result = removeCanvasSection(
      {
        viewport: { x: 0, y: 0, zoom: 1 },
        pages: { page_1: layout },
        nodes: { node_1: textNode },
        sections: {
          section_a: section("section_a", [
            { kind: "page", id: "page_1" },
            { kind: "section", id: "section_b" },
          ]),
          section_b: section("section_b", [{ kind: "node", id: "node_1" }]),
        },
      },
      "section_a",
    );

    expect(result.pages.page_1).toEqual(layout);
    expect(result.nodes?.node_1).toEqual(textNode);
    expect(result.sections).toEqual({});
  });

  it("releases members by default when a Section is deleted", () => {
    const result = removeCanvasSection(
      {
        viewport: { x: 0, y: 0, zoom: 1 },
        pages: { page_1: layout },
        nodes: { node_1: textNode },
        sections: { section_a: section("section_a", [{ kind: "page", id: "page_1" }, { kind: "node", id: "node_1" }]) },
      },
      "section_a",
    );
    expect(result.pages.page_1).toEqual(layout);
    expect(result.nodes?.node_1).toEqual(textNode);
    expect(result.sections).toEqual({});
  });

  it("assigns only fully-contained objects to the innermost Section and releases them outside", () => {
    const state = {
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: { page_1: { x: 20, y: 20, width: 20, height: 20 } },
      sections: {
        section_a: { ...section("section_a"), layout: { x: 0, y: 0, width: 100, height: 100 } },
        section_b: { ...section("section_b"), layout: { x: 10, y: 10, width: 50, height: 50 } },
      },
    };
    const assigned = assignCanvasObjectToSection(state, { kind: "page", id: "page_1" }, state.pages.page_1);
    expect(assigned.sections?.section_b.children).toEqual([{ kind: "page", id: "page_1" }]);
    const partiallyCovered = assignCanvasObjectToSection(assigned, { kind: "page", id: "page_1" }, { x: 45, y: 20, width: 20, height: 20 });
    expect(partiallyCovered.sections?.section_b.children).toEqual([]);
    expect(partiallyCovered.sections?.section_a.children).toEqual([{ kind: "page", id: "page_1" }]);
    const released = assignCanvasObjectToSection(partiallyCovered, { kind: "page", id: "page_1" }, { x: 300, y: 300, width: 20, height: 20 });
    expect(released.sections?.section_b.children).toEqual([]);
  });

  it("automatically releases nested Sections when their full bounds leave the parent", () => {
    const state = {
      viewport: { x: 0, y: 0, zoom: 1 }, pages: {},
      sections: {
        section_a: { ...section("section_a"), layout: { x: 0, y: 0, width: 200, height: 200 } },
        section_b: { ...section("section_b"), layout: { x: 20, y: 20, width: 80, height: 80 } },
      },
    };
    const nested = assignCanvasSectionToSection(state, "section_b", state.sections.section_b.layout);
    expect(nested.sections?.section_a.children).toEqual([{ kind: "section", id: "section_b" }]);
    const moved = {
      ...nested,
      sections: {
        ...nested.sections,
        section_b: { ...nested.sections!.section_b, layout: { x: 160, y: 20, width: 80, height: 80 } },
      },
    };
    expect(reconcileCanvasSectionMembership(moved).sections?.section_a.children).toEqual([]);
  });

  it("moves a Section and every direct or nested member by the same delta", () => {
    const state = {
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: {
        page_1: { x: 30, y: 40, width: 60, height: 40 },
        page_2: { x: 160, y: 160, width: 60, height: 40 },
      },
      nodes: { node_1: { ...textNode, layout: { x: 175, y: 220, width: 40, height: 30 } } },
      sections: {
        section_a: { ...section("section_a", [{ kind: "page", id: "page_1" }, { kind: "section", id: "section_b" }]), layout: { x: 0, y: 0, width: 300, height: 300 } },
        section_b: { ...section("section_b", [{ kind: "page", id: "page_2" }, { kind: "node", id: "node_1" }]), layout: { x: 140, y: 140, width: 120, height: 120 } },
      },
    };

    const result = moveCanvasSectionWithChildren(state, "section_a", { x: 50, y: 80, width: 300, height: 300 });

    expect(result.sections?.section_a.layout).toMatchObject({ x: 50, y: 80 });
    expect(result.sections?.section_b.layout).toMatchObject({ x: 190, y: 220 });
    expect(result.pages.page_1).toMatchObject({ x: 80, y: 120 });
    expect(result.pages.page_2).toMatchObject({ x: 210, y: 240 });
    expect(result.nodes?.node_1.layout).toMatchObject({ x: 225, y: 300 });
  });

  it("can expand a Section to its member bounds and detects complete containment", () => {
    const state = {
      viewport: { x: 0, y: 0, zoom: 1 }, pages: { page_1: { x: 80, y: 0, width: 100, height: 80 } },
      sections: { section_a: { ...section("section_a", [{ kind: "page", id: "page_1" }]), layout: { x: 0, y: 0, width: 100, height: 80 } } },
    };
    expect(fitCanvasSectionToChildren(state, "section_a", 10).sections?.section_a.layout).toMatchObject({ x: 0, width: 190 });
    expect(sectionContainsLayout(state.sections.section_a.layout, state.pages.page_1)).toBe(false);
  });

  it("moves a root Section and all of its descendants as one auto-layout unit", () => {
    const result = computeCanvasSectionAutoLayout({
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: {
        page_1: { x: 110, y: 110, width: 100, height: 80 },
        page_2: { x: 700, y: 50, width: 100, height: 80 },
      },
      nodes: { node_1: { ...textNode, layout: { x: 140, y: 220, width: 100, height: 50 } } },
      sections: {
        section_a: { ...section("section_a", [{ kind: "page", id: "page_1" }, { kind: "node", id: "node_1" }]), layout: { x: 100, y: 100, width: 200, height: 200 } },
      },
    }, { columns: 2, gap: 40 });
    const sectionDx = result.sections?.section_a.layout.x! - 100;
    const sectionDy = result.sections?.section_a.layout.y! - 100;
    expect(result.pages.page_1.x - 110).toBe(sectionDx);
    expect(result.pages.page_1.y - 110).toBe(sectionDy);
    expect(result.nodes?.node_1.layout.x! - 140).toBe(sectionDx);
  });
});
