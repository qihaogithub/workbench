import { describe, expect, it } from "vitest";

import { buildPageDirectoryTree } from "@/lib/page-directory-tree";
import type { PublishedDemoPage } from "@/lib/api";

function page(
  id: string,
  name: string,
  order: number,
  parentId: string | null = null,
): PublishedDemoPage {
  return { id, name, order, parentId } as PublishedDemoPage;
}

describe("buildPageDirectoryTree", () => {
  it("优先展示画布 Section，并从文件夹树中移除已收纳页面", () => {
    const tree = buildPageDirectoryTree(
      [
        page("folder-page", "文件夹页", 0, "folder_a"),
        page("section-page", "分组页", 1, "folder_a"),
        page("outside", "未分组页", 2),
      ],
      [{ id: "folder_a", name: "原文件夹", order: 0, parentId: null }],
      {
        viewport: { x: 0, y: 0, zoom: 1 },
        pages: {
          "section-page": { x: 0, y: 0, width: 100, height: 100 },
          "folder-page": { x: 0, y: 200, width: 100, height: 100 },
          outside: { x: 200, y: 200, width: 100, height: 100 },
        },
        sections: {
          section_a: {
            id: "section_a",
            kind: "section",
            title: "画布分组",
            layout: { x: 0, y: 0, width: 150, height: 150 },
            children: [{ kind: "page", id: "section-page" }],
            createdAt: 1,
            updatedAt: 1,
          },
        },
      },
    );

    expect(tree.map((item) => `${item.type}:${item.name}`)).toEqual([
      "canvas-group:画布分组",
      "folder:原文件夹",
      "page:未分组页",
    ]);
    expect(tree[1]?.children?.map((item) => item.name)).toEqual(["文件夹页"]);
  });

  it("按画布坐标排序 Section 内页面，并保留嵌套树", () => {
    const tree = buildPageDirectoryTree(
      [page("right", "右", 0), page("left", "左", 1)],
      [],
      {
        viewport: { x: 0, y: 0, zoom: 1 },
        pages: {
          right: { x: 200, y: 0, width: 100, height: 100 },
          left: { x: 0, y: 0, width: 100, height: 100 },
        },
        sections: {
          section_a: {
            id: "section_a",
            kind: "section",
            title: "分组",
            layout: { x: 0, y: 0, width: 400, height: 150 },
            children: [
              { kind: "page", id: "right" },
              { kind: "page", id: "left" },
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        },
      },
    );

    expect(tree[0]?.type).toBe("canvas-group");
    expect(tree[0]?.children?.map((item) => item.name)).toEqual(["左", "右"]);
  });
});
