import { fireEvent, render, screen } from "@testing-library/react";
import { DesignSpecConfigPanel } from "./DesignSpecConfigPanel";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";

jest.mock("./DesignSpecWorkspace", () => ({
  useDesignSpecWorkspace: jest.fn(),
}));

jest.mock("./DesignSpecVisuals", () => ({
  CATEGORY_ORDER: [],
  KIND_META: { text: { label: "文字" } },
  Swatch: () => <span aria-hidden="true" />,
  pageLabel: () => "页面 A",
}));

const useWorkspace = useDesignSpecWorkspace as jest.Mock;

describe("DesignSpecConfigPanel", () => {
  it("复用配置项分组节点作为页面绑定入口", () => {
    const setSearch = jest.fn();
    const setBindFilter = jest.fn();
    useWorkspace.mockReturnValue({
      pages: [{ id: "page-a", name: "页面 A" }],
      boundPageIds: new Set(["page-a"]),
      boundIds: new Set(["page:page-a:title"]),
      search: "",
      setSearch,
      bindFilter: "all",
      setBindFilter,
      categoryFilter: "all",
      setCategoryFilter: jest.fn(),
      pool: [{
        id: "page:page-a:title",
        scope: "page",
        pageId: "page-a",
        pageName: "页面 A",
        key: "title",
        title: "标题",
        kind: "text",
      }],
      poolGroups: [["页面 A", [{
        id: "page:page-a:title",
        scope: "page",
        pageId: "page-a",
        pageName: "页面 A",
        key: "title",
        title: "标题",
        kind: "text",
      }]]],
      collapsedGroups: new Set(),
      toggleGroup: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });

    const { rerender } = render(<DesignSpecConfigPanel />);

    expect(screen.getAllByText("页面 A").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("标题")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索规范项")).toBeInTheDocument();
    expect(
      screen.getByText("标题").closest("[data-design-spec-group-items]")
    ).toHaveClass("ml-5");

    expect(screen.queryByText("页面", { exact: true })).not.toBeInTheDocument();
    const pageRow = screen.getByTitle("拖拽页面到规范卡片以绑定页面");
    const dataTransfer = { setData: jest.fn(), effectAllowed: "none", dropEffect: "none" };
    fireEvent.dragStart(pageRow, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "page:page-a");

    // 页面允许被多个页面规范复用，筛选切到“未绑定”也不能隐藏已绑定页面节点。
    useWorkspace.mockReturnValue({
      ...useWorkspace.mock.results[0].value,
      bindFilter: "unbound",
    });
    rerender(<DesignSpecConfigPanel />);
    expect(screen.getByTitle("拖拽页面到规范卡片以绑定页面")).toBeInTheDocument();

    // 没有配置项的页面仍保留展开箭头占位，页面名称不前移。
    useWorkspace.mockReturnValue({
      ...useWorkspace.mock.results[0].value,
      poolGroups: [["页面 A", []]],
    });
    rerender(<DesignSpecConfigPanel />);
    const emptyPageRow = screen.getByText("页面 A").parentElement;
    expect(emptyPageRow?.querySelector("[data-design-spec-expander]")).toHaveClass(
      "invisible",
    );
    expect(emptyPageRow?.querySelector("svg + svg")).toBeTruthy();
  });
});
