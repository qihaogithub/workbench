import { parseCanvasState } from "../canvas-layout-file";

const validSection = {
  id: "section_1",
  kind: "section",
  title: "登录流程",
  layout: { x: 0, y: 0, width: 300, height: 200 },
  children: [{ kind: "page", id: "page_1" }],
  createdAt: 1,
  updatedAt: 1,
};

describe("parseCanvasState Section recovery", () => {
  it("keeps valid Sections while dropping a malformed individual Section", () => {
    const state = parseCanvasState({
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: { page_1: { x: 0, y: 0, width: 100, height: 100 } },
      sections: {
        section_1: validSection,
        section_bad: { ...validSection, id: "section_bad", children: "not-an-array" },
      },
    });

    expect(state?.sections).toEqual({ section_1: validSection });
  });

  it("drops dangling child references without rejecting the rest of the canvas", () => {
    const state = parseCanvasState({
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: { page_1: { x: 0, y: 0, width: 100, height: 100 } },
      sections: {
        section_1: { ...validSection, children: [{ kind: "page", id: "gone" }] },
      },
    });

    expect(state?.sections?.section_1.children).toEqual([]);
  });

  it("strips retired Section collapse and title-visibility fields", () => {
    const state = parseCanvasState({
      viewport: { x: 0, y: 0, zoom: 1 },
      pages: { page_1: { x: 0, y: 0, width: 100, height: 100 } },
      sections: {
        section_1: {
          ...validSection,
          collapsed: true,
          style: { titleVisible: false, color: "#94a3b8", fillOpacity: 35, strokeWidth: 8 },
        },
      },
    });

    expect(state?.sections?.section_1).toEqual({
      ...validSection,
      style: { color: "#94a3b8", fillOpacity: 35 },
    });
  });
});
