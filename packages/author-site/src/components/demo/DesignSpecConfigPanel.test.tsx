import { fireEvent, render, screen, within } from "@testing-library/react";
import { DesignSpecConfigPanel } from "./DesignSpecConfigPanel";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";

jest.mock("./DesignSpecWorkspace", () => ({
  useDesignSpecWorkspace: jest.fn(),
}));

jest.mock("./DesignSpecVisuals", () => ({
  CATEGORY_ORDER: ["image", "motion", "color", "text", "number"],
  KIND_META: {
    text: { label: "文字" },
    image: { label: "图片" },
    motion: { label: "动效" },
    color: { label: "色值" },
    number: { label: "数值" },
  },
  Swatch: () => <span aria-hidden="true" />,
  pageLabel: () => "页面 A",
}));

const useWorkspace = useDesignSpecWorkspace as jest.Mock;

describe("DesignSpecConfigPanel", () => {
  it("复用配置项分组节点作为页面绑定入口", () => {
    const setSearch = jest.fn();
    const setBindFilter = jest.fn();
    const workspace = {
      pages: [{ id: "page-a", name: "页面 A" }],
      boundPageIds: new Set(["page-a"]),
      boundIds: new Set(["page:page-a:title"]),
      search: "",
      setSearch,
      bindFilter: "all",
      setBindFilter,
      categoryFilter: "all",
      setCategoryFilter: jest.fn(),
      pool: [
        {
          id: "page:page-a:title",
          scope: "page",
          pageId: "page-a",
          pageName: "页面 A",
          key: "title",
          title: "标题",
          kind: "text",
        },
      ],
      poolGroups: [
        [
          "页面 A",
          [
            {
              id: "page:page-a:title",
              scope: "page",
              pageId: "page-a",
              pageName: "页面 A",
              key: "title",
              title: "标题",
              kind: "text",
            },
          ],
        ],
      ],
      collapsedGroups: new Set(),
      toggleGroup: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    };
    useWorkspace.mockReturnValue(workspace);

    const { rerender } = render(<DesignSpecConfigPanel />);

    expect(screen.getAllByText("页面 A").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("标题")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索规范项")).toBeInTheDocument();
    expect(
      screen.getByText("标题").closest("[data-design-spec-group-items]"),
    ).toHaveClass("ml-5");

    const filterRow = screen.getByTestId("design-spec-filter-row");
    expect(
      Array.from(filterRow.querySelectorAll('[role="tab"]')).map(
        (tab) => tab.textContent,
      ),
    ).toEqual(["页面", "配置项"]);
    expect(screen.getByRole("tab", { name: "配置项" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("combobox", { name: "页面筛选" })).toHaveValue(
      "all",
    );
    expect(screen.getByText("已绑定 · 1 项")).toBeInTheDocument();
    const pageRow = screen.getByTitle("拖拽页面到规范卡片以绑定页面");
    const dataTransfer = {
      setData: jest.fn(),
      effectAllowed: "none",
      dropEffect: "none",
    };
    fireEvent.dragStart(pageRow, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "text/plain",
      "page:page-a",
    );
    fireEvent.click(pageRow);
    expect(useWorkspace.mock.results[0].value.toggleGroup).toHaveBeenCalledWith(
      "页面 A",
    );

    useWorkspace.mockReturnValue({
      ...workspace,
      collapsedGroups: new Set(["页面 A"]),
    });
    rerender(<DesignSpecConfigPanel />);
    expect(screen.queryByText("标题")).not.toBeInTheDocument();
    expect(screen.getByTitle("拖拽页面到规范卡片以绑定页面")).toHaveTextContent(
      "1 项",
    );

    // 页面允许被多个页面规范复用，筛选切到“未绑定”也不能隐藏已绑定页面节点。
    useWorkspace.mockReturnValue({
      ...workspace,
      bindFilter: "unbound",
    });
    rerender(<DesignSpecConfigPanel />);
    expect(
      screen.getByTitle("拖拽页面到规范卡片以绑定页面"),
    ).toBeInTheDocument();

    // 没有配置项的页面仍保留展开箭头占位，页面名称不前移。
    useWorkspace.mockReturnValue({
      ...workspace,
      poolGroups: [["页面 A", []]],
    });
    rerender(<DesignSpecConfigPanel />);
    const emptyPageRow = screen.getByTitle("拖拽页面到规范卡片以绑定页面");
    expect(
      emptyPageRow?.querySelector("[data-design-spec-expander]"),
    ).toHaveClass("invisible");
    expect(emptyPageRow?.querySelector("svg + svg")).toBeTruthy();
  });

  it("支持页面/配置项双模式和嵌套配置项拖拽", () => {
    const setPoolView = jest.fn();
    const setPageFilter = jest.fn();
    const setBindFilter = jest.fn();
    const setCategoryFilter = jest.fn();
    const branch = {
      id: "page:page-a:modules[type=image]",
      scope: "page" as const,
      pageId: "page-a",
      pageName: "页面 A",
      key: "modules[type=image]",
      title: "图片模块",
      breadcrumbs: ["内容模块", "图片模块"],
      kind: "text" as const,
      isBranch: true,
    };
    const nested = {
      id: "page:page-a:modules[type=image].image",
      scope: "page" as const,
      pageId: "page-a",
      pageName: "页面 A",
      key: "modules[type=image].image",
      title: "图片",
      breadcrumbs: ["内容模块", "图片模块", "图片"],
      kind: "image" as const,
    };
    const workspace = {
      poolView: "configs",
      setPoolView,
      pageFilter: "all",
      setPageFilter,
      pages: [{ id: "page-a", name: "页面 A" }],
      filteredPages: [{ id: "page-a", name: "页面 A" }],
      filteredPool: [branch, nested],
      pool: [branch, nested],
      poolGroups: [["页面 A", [branch, nested]]],
      boundPageIds: new Set(),
      boundIds: new Set(),
      search: "",
      setSearch: jest.fn(),
      bindFilter: "all",
      setBindFilter,
      categoryFilter: "all",
      setCategoryFilter,
      collapsedGroups: new Set(),
      toggleGroup: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    };
    useWorkspace.mockReturnValue(workspace);

    const { rerender } = render(<DesignSpecConfigPanel />);
    expect(screen.getAllByText("图片").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("内容模块")).toBeInTheDocument();
    expect(screen.getByText("图片模块")).toBeInTheDocument();
    const configTree = screen.getByRole("tree", { name: "配置项树" });
    expect(
      within(configTree).getByText("内容模块").closest('[role="treeitem"]'),
    ).toHaveAttribute("aria-level", "2");
    expect(
      within(configTree).getByText("图片模块").closest('[role="treeitem"]'),
    ).toHaveAttribute("aria-level", "3");
    const branchRow = within(configTree)
      .getByText("图片模块")
      .closest('[role="treeitem"]');
    expect(branchRow).toHaveAttribute("draggable", "true");
    const branchTransfer = { setData: jest.fn(), effectAllowed: "none" };
    fireEvent.dragStart(branchRow!, { dataTransfer: branchTransfer });
    expect(branchTransfer.effectAllowed).toBe("copy");
    expect(branchTransfer.setData).toHaveBeenCalledWith(
      "text/plain",
      `pool:${branch.id}`,
    );
    expect(
      within(configTree).getByText("图片").closest('[role="treeitem"]'),
    ).toHaveAttribute("aria-level", "4");
    expect(
      screen.queryByText("内容模块 / 图片模块 / 图片"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("未绑定")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("图片模块"));
    expect(workspace.toggleGroup).toHaveBeenCalledWith(
      expect.stringContaining("page-a/root/modules/[type=image]"),
    );
    const configRow = screen
      .getByTitle("内容模块 / 图片模块 / 图片")
      .closest('[draggable="true"]');
    expect(configRow).not.toBeNull();
    const configTransfer = { setData: jest.fn(), effectAllowed: "none" };
    fireEvent.dragStart(configRow!, { dataTransfer: configTransfer });
    expect(configTransfer.setData).toHaveBeenCalledWith(
      "text/plain",
      `pool:${nested.id}`,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "页面筛选" }), {
      target: { value: "page-a" },
    });
    expect(setPageFilter).toHaveBeenCalledWith("page-a");

    fireEvent.click(screen.getByRole("button", { name: "更多筛选" }));
    expect(
      screen.getByRole("region", { name: "绑定状态" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "配置项类型" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "配置项类型" }))
        .getAllByRole("radio")
        .map((option) => option.textContent?.trim()),
    ).toEqual(["全部", "图片", "动效", "色值", "文字", "数值"]);
    fireEvent.click(screen.getByRole("radio", { name: "已绑定" }));
    fireEvent.click(screen.getByRole("radio", { name: "图片" }));
    expect(setBindFilter).toHaveBeenCalledWith("bound");
    expect(setCategoryFilter).toHaveBeenCalledWith("image");

    fireEvent.click(screen.getByRole("tab", { name: "页面" }));
    expect(setPoolView).toHaveBeenCalledWith("pages");

    useWorkspace.mockReturnValue({
      ...workspace,
      poolView: "pages",
      filteredPages: [{ id: "page-a", name: "页面 A" }],
    });
    rerender(<DesignSpecConfigPanel />);
    expect(
      screen.queryByText("内容模块 / 图片模块 / 图片"),
    ).not.toBeInTheDocument();
    const pageRow = screen.getByTitle("拖拽页面到规范卡片以绑定页面");
    expect(pageRow).toHaveTextContent("页面 A");
    expect(
      screen.getByRole("region", { name: "绑定状态" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "配置项类型" }),
    ).not.toBeInTheDocument();
    const dataTransfer = { setData: jest.fn(), effectAllowed: "none" };
    fireEvent.dragStart(pageRow, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "text/plain",
      "page:page-a",
    );
  });
});
