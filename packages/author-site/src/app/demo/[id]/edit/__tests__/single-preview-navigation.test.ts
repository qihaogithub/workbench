import {
  buildSinglePreviewNavigation,
  buildSinglePreviewNavigableItems,
} from "../single-preview-navigation";

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

  it("按画布顺序生成分组，并让翻页序列与分组菜单一致", () => {
    const navigation = buildSinglePreviewNavigation(
      [
        { id: "bottom", name: "下方", order: 0 },
        { id: "inside", name: "组内", order: 1 },
        { id: "top", name: "上方", order: 2 },
      ],
      {
        pages: {
          bottom: { x: 0, y: 300, width: 100, height: 100 },
          inside: { x: 0, y: 0, width: 100, height: 100 },
          top: { x: 200, y: 0, width: 100, height: 100 },
        },
        sections: {
          section_a: {
            id: "section_a",
            kind: "section",
            title: "流程",
            layout: { x: 0, y: 0, width: 400, height: 200 },
            children: [{ kind: "page", id: "inside" }],
            createdAt: 1,
            updatedAt: 1,
          },
        },
      },
    );

    expect(navigation.groups.map((group) => group.label)).toEqual([
      "流程",
      "页面",
    ]);
    expect(navigation.items.map((item) => item.value)).toEqual([
      "page:inside",
      "page:top",
      "page:bottom",
    ]);
    expect(navigation.groups[0]?.items[0]).toMatchObject({
      groupId: "section_a",
      groupLabel: "流程",
    });
  });
});
