import { buildSinglePreviewNavigableItems } from "../single-preview-navigation";

describe("单页面预览目录", () => {
  it("只生成页面条目，供下拉菜单和前后翻页共用", () => {
    expect(
      buildSinglePreviewNavigableItems([
        { id: "home", name: "首页" },
        { id: "answer", name: "答错" },
      ]),
    ).toEqual([
      { value: "page:home", group: "页面", label: "首页" },
      { value: "page:answer", group: "页面", label: "答错" },
    ]);
  });
});
