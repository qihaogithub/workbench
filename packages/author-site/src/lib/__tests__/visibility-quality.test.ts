import { describe, expect, it } from "@jest/globals";
import { findVisibilityDeadLinks } from "../visibility-quality";

describe("findVisibilityDeadLinks", () => {
  it("reports canvas navigation and app graph references to hidden pages", () => {
    const issues = findVisibilityDeadLinks({
      hiddenPageIds: ["member"],
      pageIds: ["home", "member"],
      canvasState: {
        pages: {},
        viewport: { x: 0, y: 0, zoom: 1 },
        navigation: {
          hotspots: {},
          connections: {
            c1: {
              id: "c1",
              source: { pageId: "home", hotspotId: "h1" },
              target: { pageId: "member" },
              createdAt: 1,
              updatedAt: 1,
            },
          },
        },
      },
      appGraph: {
        version: 1,
        entry: "home",
        pages: {
          home: { pageId: "home", title: "首页" },
          member: { pageId: "member", title: "会员" },
        },
        actions: [{ from: "home", event: "openMember", to: "member" }],
        state: {},
      },
    });
    expect(issues.map((issue) => issue.source)).toEqual(["canvas-navigation", "app-graph-action"]);
    expect(issues.every((issue) => issue.targetPageId === "member")).toBe(true);
  });

  it("does not flag unrelated links or unknown target ids", () => {
    const issues = findVisibilityDeadLinks({
      hiddenPageIds: ["member"],
      pageIds: ["home", "member"],
      appGraph: {
        version: 1,
        entry: "home",
        pages: { home: { pageId: "home", title: "首页" } },
        actions: [{ from: "home", event: "noop", to: "missing" }],
        state: {},
      },
    });
    expect(issues).toEqual([]);
  });
});
