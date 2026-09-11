import { describe, expect, it } from "vitest";
import {
  computeBounds,
  readCanvasClipboard,
  remapCanvasSectionsForPaste,
  writeCanvasClipboard,
} from "./canvas-clipboard";

describe("canvas clipboard v2", () => {
  it("persists page identities without page source bytes", () => {
    writeCanvasClipboard({
      version: 2,
      copiedAt: 1,
      sourceProjectId: "source",
      nodes: [],
      pages: [{ id: "home", name: "Home", runtimeType: "high-fidelity-react" }],
      pageLayouts: {},
      pageGroups: [],
      sections: [],
      bounds: null,
    });

    const stored = window.localStorage.getItem("workbench:canvas-clipboard") ?? "";
    expect(stored).not.toContain("index.tsx");
    expect(stored).not.toContain("prototypeHtml");
    expect(readCanvasClipboard()?.pages).toEqual([
      { id: "home", name: "Home", runtimeType: "high-fidelity-react" },
    ]);
  });
});

describe("Section clipboard remapping", () => {
  it("rewrites Section, page, node and nested Section references", () => {
    const result = remapCanvasSectionsForPaste({
      sections: [
        {
          id: "section_a", kind: "section", title: "A", layout: { x: 10, y: 20, width: 100, height: 80 },
          children: [{ kind: "page", id: "page_a" }, { kind: "node", id: "node_a" }, { kind: "section", id: "section_b" }], createdAt: 1, updatedAt: 1,
        },
        {
          id: "section_b", kind: "section", title: "B", layout: { x: 30, y: 40, width: 50, height: 40 },
          children: [], createdAt: 1, updatedAt: 1,
        },
      ],
      pageIdMapping: new Map([["page_a", "page_copy"]]),
      nodeIdMapping: new Map([["node_a", "node_copy"]]),
      offset: { x: 24, y: 32 }, now: 2,
      createId: (() => { let index = 0; return () => `section_copy_${++index}`; })(),
    });
    expect(result.section_copy_1).toMatchObject({
      layout: { x: 34, y: 52 },
      children: [
        { kind: "page", id: "page_copy" },
        { kind: "node", id: "node_copy" },
        { kind: "section", id: "section_copy_2" },
      ],
    });
    expect(result.section_copy_2.createdAt).toBe(2);
  });

  it("includes an empty Section outline in clipboard bounds", () => {
    expect(computeBounds({}, [], [{
      id: "section_a", kind: "section", title: "A", layout: { x: 10, y: 20, width: 100, height: 80 }, children: [], createdAt: 1, updatedAt: 1,
    }])).toEqual({ x: 10, y: 20, width: 100, height: 80 });
  });
});
