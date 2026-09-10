import { describe, expect, it } from "vitest";

import { buildCanvasPageNavigation } from "./canvas-page-navigation";
import type { CanvasState } from "./types";

function makeState(
  pages: CanvasState["pages"],
  sections: CanvasState["sections"] = {},
  pageGroups: CanvasState["pageGroups"] = {},
): CanvasState {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    pages,
    sections,
    pageGroups,
  };
}

function pageIds(nodes: ReturnType<typeof buildCanvasPageNavigation>["nodes"]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.kind === "page") result.push(node.pageId);
    else result.push(...pageIds(node.children));
  }
  return result;
}

describe("buildCanvasPageNavigation", () => {
  it("按画布从上到下、同一行从左到右排序", () => {
    const result = buildCanvasPageNavigation(
      [
        { id: "right", name: "右", order: 0 },
        { id: "bottom", name: "下", order: 1 },
        { id: "left", name: "左", order: 2 },
      ],
      makeState({
        right: { x: 200, y: 0, width: 100, height: 100 },
        bottom: { x: 0, y: 200, width: 100, height: 100 },
        left: { x: 0, y: 0, width: 100, height: 100 },
      }),
    );

    expect(pageIds(result.nodes)).toEqual(["left", "right", "bottom"]);
    expect(result.pages.map((page) => page.pageId)).toEqual([
      "left",
      "right",
      "bottom",
    ]);
  });

  it("画布布局缺失时回退页面 order", () => {
    const result = buildCanvasPageNavigation([
      { id: "b", name: "B", order: 2 },
      { id: "a", name: "A", order: 1 },
    ]);

    expect(result.pages.map((page) => page.pageId)).toEqual(["a", "b"]);
  });

  it("只读取 Section，不把合并页面 pageGroups 当成目录分组", () => {
    const result = buildCanvasPageNavigation(
      [
        { id: "first", name: "第一张", order: 0 },
        { id: "second", name: "第二张", order: 1 },
      ],
      makeState(
        {
          first: { x: 0, y: 0, width: 100, height: 100 },
          second: { x: 200, y: 0, width: 100, height: 100 },
        },
        {},
        {
          merged: {
            id: "merged",
            kind: "page-group",
            title: "合并页面",
            pages: [
              { id: "first", pageId: "first", title: "第一张" },
              { id: "second", pageId: "second", title: "第二张" },
            ],
            activePageId: "first",
            layout: { x: 0, y: 0, width: 300, height: 100 },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ),
    );

    expect(result.nodes.every((node) => node.kind === "page")).toBe(true);
  });

  it("将 Section 页面放入分组并保持分组外页面不重复", () => {
    const result = buildCanvasPageNavigation(
      [
        { id: "ungrouped", name: "未分组", order: 0 },
        { id: "inside-a", name: "组内 A", order: 1 },
        { id: "inside-b", name: "组内 B", order: 2 },
      ],
      makeState(
        {
          ungrouped: { x: 0, y: 300, width: 100, height: 100 },
          "inside-a": { x: 0, y: 0, width: 100, height: 100 },
          "inside-b": { x: 200, y: 0, width: 100, height: 100 },
        },
        {
          section_1: {
            id: "section_1",
            kind: "section",
            title: "流程",
            layout: { x: 0, y: 0, width: 400, height: 200 },
            children: [
              { kind: "page", id: "inside-b" },
              { kind: "page", id: "inside-a" },
              { kind: "page", id: "inside-a" },
              { kind: "page", id: "missing" },
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ),
    );

    expect(result.nodes[0]).toMatchObject({ kind: "group", title: "流程" });
    expect(pageIds(result.nodes)).toEqual(["inside-a", "inside-b", "ungrouped"]);
  });

  it("支持嵌套 Section，并在循环/悬空数据下保留页面", () => {
    const result = buildCanvasPageNavigation(
      [
        { id: "nested-page", name: "嵌套页", order: 0 },
        { id: "outside", name: "外部页", order: 1 },
      ],
      makeState(
        {
          "nested-page": { x: 20, y: 20, width: 100, height: 100 },
          outside: { x: 500, y: 0, width: 100, height: 100 },
        },
        {
          section_outer: {
            id: "section_outer",
            kind: "section",
            title: "外层",
            layout: { x: 0, y: 0, width: 300, height: 300 },
            children: [{ kind: "section", id: "section_inner" }],
            createdAt: 1,
            updatedAt: 1,
          },
          section_inner: {
            id: "section_inner",
            kind: "section",
            title: "内层",
            layout: { x: 10, y: 10, width: 200, height: 200 },
            children: [
              { kind: "page", id: "nested-page" },
              { kind: "section", id: "section_outer" },
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ),
    );

    expect(pageIds(result.nodes)).toEqual(["outside", "nested-page"]);
    expect(result.pages).toHaveLength(2);
  });
});
