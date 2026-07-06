import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { VisualNodeInfo, VisualPropertyChange } from "@workbench/demo-ui";
import { VisualPropertyPanel } from "./VisualPropertyPanel";
import type { VisualConfigMark } from "../hooks/useVisualEditState";

const selectedNode: VisualNodeInfo = {
  nodeId: "node-1",
  tagName: "DIV",
  domPath: "body > div:nth-child(1)",
  textContent: "标题",
  rect: {
    x: 0,
    y: 0,
    width: 120,
    height: 40,
  },
  computedStyle: {
    width: "120px",
    height: "40px",
    color: "#111111",
  },
  editCapabilities: ["style"],
};

const colorChange: VisualPropertyChange = {
  id: "body > div:nth-child(1):style:color",
  nodeId: "node-1",
  domPath: "body > div:nth-child(1)",
  kind: "style",
  property: "color",
  label: "文字颜色",
  value: "#ff0000",
  previousValue: "#111111",
};

const colorConfigMark: VisualConfigMark = {
  id: "config-mark-1",
  changeId: "body > div:nth-child(1):style:color",
  nodeId: "node-1",
  domPath: "body > div:nth-child(1)",
  kind: "style",
  property: "color",
  label: "文字颜色",
  fieldTitle: "文字颜色",
  fieldKey: "textColor",
  defaultValue: "#111111",
  category: "",
  scope: "page",
};

const selectedNodeWithBackground: VisualNodeInfo = {
  ...selectedNode,
  computedStyle: {
    ...selectedNode.computedStyle,
    backgroundColor: "#99DCA3",
  },
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof VisualPropertyPanel>> = {},
) {
  return render(
    <VisualPropertyPanel
      selectedNode={selectedNode}
      propertyChanges={[]}
      configMarks={[]}
      aiInstruction=""
      usedConfigKeys={[]}
      sessionId="session-1"
      onPropertyChange={jest.fn()}
      onRestoreProperty={jest.fn()}
      onClearChanges={jest.fn()}
      onMarkConfig={jest.fn()}
      onUpdateConfigMark={jest.fn()}
      onRemoveConfigMark={jest.fn()}
      onAiInstructionChange={jest.fn()}
      {...overrides}
    />,
  );
}

describe("VisualPropertyPanel 清空入口", () => {
  it("当前图层没有修改时禁用清空按钮", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "清空" })).toBeDisabled();
  });

  it("当前图层有修改时可清空当前图层设置", () => {
    const onClearChanges = jest.fn();
    renderPanel({
      propertyChanges: [colorChange],
      onClearChanges,
    });

    const clearButton = screen.getByRole("button", { name: "清空" });
    expect(clearButton).toBeEnabled();
    fireEvent.click(clearButton);
    expect(onClearChanges).toHaveBeenCalledTimes(1);
  });
});

describe("VisualPropertyPanel 颜色控件", () => {
  it("颜色设置同时支持 Hex 和明度百分比", () => {
    const onPropertyChange = jest.fn();
    renderPanel({
      selectedNode: selectedNodeWithBackground,
      onPropertyChange,
    });

    expect(screen.getByLabelText("颜色Hex")).toHaveValue("99DCA3");
    expect(screen.getByLabelText("颜色明度")).toHaveValue("100");

    fireEvent.change(screen.getByLabelText("颜色明度"), {
      target: { value: "80" },
    });

    expect(onPropertyChange).toHaveBeenCalledWith(
      selectedNodeWithBackground,
      "backgroundColor",
      "颜色",
      "color-mix(in srgb, #99DCA3 80%, black)",
      "style",
      "#99DCA3",
    );
  });
});

describe("VisualPropertyPanel 布局控件", () => {
  it("布局分组按 Figma 式结构展示尺寸和填充控制", () => {
    const onPropertyChange = jest.fn();
    renderPanel({ onPropertyChange });

    expect(screen.getByText("尺寸")).toBeInTheDocument();
    expect(screen.getByLabelText("布局宽度")).toHaveValue("120");
    expect(screen.getByLabelText("布局高度")).toHaveValue("40");

    fireEvent.click(screen.getByRole("button", { name: "宽度填充" }));

    expect(onPropertyChange).toHaveBeenCalledWith(
      selectedNode,
      "width",
      "宽度",
      "100%",
      "style",
      "120px",
    );
  });
});

describe("VisualPropertyPanel 配置项入口", () => {
  it("AI 修改说明显示在属性列表顶部", () => {
    renderPanel();

    const labels = screen.getAllByText(/AI 修改说明|位置/).map((node) => node.textContent);
    expect(labels[0]).toBe("AI 修改说明");
  });

  it("位置分组使用 X/Y 和 W/H 两行紧凑展示", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "横向位置设为配置项" })).toHaveTextContent("X");
    expect(screen.getByRole("button", { name: "纵向位置设为配置项" })).toHaveTextContent("Y");
    expect(screen.getByRole("button", { name: "宽度设为配置项" })).toHaveTextContent("W");
    expect(screen.getByRole("button", { name: "高度设为配置项" })).toHaveTextContent("H");
    expect(screen.queryByText("横向位置")).not.toBeInTheDocument();
    expect(screen.queryByText("纵向位置")).not.toBeInTheDocument();
  });

  it("点击属性名可创建配置项并打开设置弹窗", () => {
    const onMarkConfig = jest.fn();
    renderPanel({ onMarkConfig });

    fireEvent.click(screen.getByRole("button", { name: "不透明度设为配置项" }));

    expect(onMarkConfig).toHaveBeenCalledWith(
      selectedNode,
      "opacity",
      "不透明度",
      "100",
      "style",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("配置项设置");
  });

  it("已有配置项以顶部信息条展示并可继续编辑", () => {
    renderPanel({ configMarks: [colorConfigMark] });

    const configBar = screen.getByRole("button", { name: /文字颜色 textColor/ });
    expect(configBar).toBeInTheDocument();
    fireEvent.click(configBar);
    expect(screen.getByDisplayValue("textColor")).toBeInTheDocument();
  });
});
