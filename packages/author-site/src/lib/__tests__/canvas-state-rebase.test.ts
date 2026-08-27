import type { CanvasState } from "@workbench/demo-ui/types";

import { rebaseCanvasState } from "../canvas-state-rebase";

const base: CanvasState = {
  viewport: { x: 0, y: 0, zoom: 1 },
  pages: { page_a: { x: 0, y: 0, width: 100, height: 100 } },
  sections: {},
  nodes: {},
};

describe("rebaseCanvasState", () => {
  it("replays a local Section mutation beside a remote page mutation", () => {
    const local: CanvasState = {
      ...base,
      sections: {
        section_a: {
          id: "section_a", kind: "section", title: "本地分区",
          layout: { x: 0, y: 0, width: 200, height: 160 }, children: [],
          createdAt: 1, updatedAt: 1,
        },
      },
    };
    const remote: CanvasState = {
      ...base,
      pages: { page_a: { x: 50, y: 40, width: 100, height: 100 } },
    };

    const result = rebaseCanvasState(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.state.pages.page_a.x).toBe(50);
    expect(result.state.sections?.section_a?.title).toBe("本地分区");
  });

  it("reports divergent updates to the same Section without overwriting remote", () => {
    const section = {
      id: "section_a", kind: "section" as const, title: "原始",
      layout: { x: 0, y: 0, width: 200, height: 160 }, children: [], createdAt: 1, updatedAt: 1,
    };
    const common = { ...base, sections: { section_a: section } };
    const local = { ...common, sections: { section_a: { ...section, title: "本地标题" } } };
    const remote = { ...common, sections: { section_a: { ...section, title: "远端标题" } } };

    const result = rebaseCanvasState(common, local, remote);
    expect(result.conflicts).toEqual(["sections:section_a"]);
    expect(result.state.sections?.section_a?.title).toBe("远端标题");
  });
});
