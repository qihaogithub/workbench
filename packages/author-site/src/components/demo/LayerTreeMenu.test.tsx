import { render } from "@testing-library/react";
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
