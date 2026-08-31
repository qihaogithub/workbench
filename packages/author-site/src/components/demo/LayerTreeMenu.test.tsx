import { fireEvent, render, screen, within } from "@testing-library/react";
import { LayerTreeMenu, type VisualNodeTreeItem } from "@workbench/demo-ui";

const nodes: VisualNodeTreeItem[] = [
  {
    nodeId: "page",
    domPath: "body",
    tagName: "BODY",
    rect: { x: 0, y: 0, width: 375, height: 812 },
    editCapabilities: ["style"],
    children: [
      {
        nodeId: "target",
        domPath: "body > main:nth-child(1)",
        tagName: "MAIN",
        rect: { x: 0, y: 0, width: 375, height: 600 },
        editCapabilities: ["style"],
        children: [],
      },
    ],
  },
];

describe("LayerTreeMenu 预览选中联动", () => {
  it("预览选中深层图层后会把对应项滚动到可视区域", () => {
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(<LayerTreeMenu nodes={nodes} selectedNodeId="target" />);

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
  });
});

describe("LayerTreeMenu 编辑侧栏操作", () => {
  it("panel 模式下仅为悬浮/聚焦态准备显隐和添加到对话入口", () => {
    const onToggleNodeHidden = jest.fn();
    const onAddNodeToChat = jest.fn();
    const onSelectNode = jest.fn();
    const targetNode = nodes[0].children?.[0];
    expect(targetNode).toBeDefined();

    render(
      <LayerTreeMenu
        variant="panel"
        collapsed={false}
        nodes={nodes}
        onToggleNodeHidden={onToggleNodeHidden}
        onAddNodeToChat={onAddNodeToChat}
        onSelectNode={onSelectNode}
      />,
    );

    const targetRow = screen.getAllByRole("treeitem")[1];
    expect(targetRow).toHaveClass("group");

    const addButton = within(targetRow).getByRole("button", {
      name: "添加到对话",
    });
    const toggleButton = within(targetRow).getByRole("button", {
      name: "临时隐藏图层",
    });

    expect(addButton).toHaveClass("opacity-0", "group-hover:opacity-100");
    expect(addButton).toHaveClass("group-focus-within:opacity-100");
    expect(addButton).toHaveClass(
      "pointer-events-none",
      "group-hover:pointer-events-auto",
    );
    expect(toggleButton).toHaveClass("opacity-0", "group-hover:opacity-100");
    expect(toggleButton).toHaveClass("group-focus-within:opacity-100");
    expect(toggleButton).toHaveClass(
      "pointer-events-none",
      "group-hover:pointer-events-auto",
    );

    fireEvent.mouseEnter(targetRow);
    fireEvent.click(addButton);

    expect(onAddNodeToChat).toHaveBeenCalledWith(targetNode);
    expect(onSelectNode).not.toHaveBeenCalled();

    fireEvent.click(toggleButton);
    expect(onToggleNodeHidden).toHaveBeenCalledWith(targetNode);
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it("隐藏图层时仍提供带可访问名称的显示入口", () => {
    const hiddenNode = nodes[0].children?.[0];

    render(
      <LayerTreeMenu
        variant="panel"
        collapsed={false}
        nodes={nodes}
        hiddenNodeIds={[hiddenNode?.domPath ?? ""]}
        onToggleNodeHidden={jest.fn()}
      />,
    );

    const targetRow = screen.getAllByRole("treeitem")[1];
    const toggleButton = within(targetRow).getByRole("button", {
      name: "临时显示图层",
    });
    expect(toggleButton).toHaveAttribute("title", "临时显示图层");
    expect(toggleButton).toHaveClass("opacity-0");
  });

  it("menu 模式不增加添加到对话入口并保持显隐按钮常显", () => {
    render(
      <LayerTreeMenu
        nodes={nodes}
        onToggleNodeHidden={jest.fn()}
        onAddNodeToChat={jest.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "添加到对话" })).not.toBeInTheDocument();
    const targetRow = screen.getAllByRole("menuitem")[1];
    expect(
      within(targetRow).getByRole("button", { name: "临时隐藏图层" }),
    ).not.toHaveClass("opacity-0");
  });
});
