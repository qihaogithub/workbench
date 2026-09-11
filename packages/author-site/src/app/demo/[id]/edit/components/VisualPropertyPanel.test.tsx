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
  it("点击添加到对话时调用回调且不传递点击事件", () => {
    const onAddToChat = jest.fn();
    renderPanel({ onAddToChat });

    fireEvent.click(screen.getByRole("button", { name: "添加到对话" }));

    expect(onAddToChat).toHaveBeenCalledTimes(1);
    expect(onAddToChat).toHaveBeenCalledWith();
  });

  it("从未选中状态切换到选中元素时保持 Hook 调用顺序", () => {
    const { rerender } = renderPanel({ selectedNode: null });

    rerender(
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
      />,
    );

    expect(screen.getByText("位置")).toBeInTheDocument();
  });

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

    fireEvent.click(screen.getByRole("button", { name: "颜色选择器" }));
    expect(screen.getByLabelText("颜色Hex值")).toHaveValue("#99DCA3");
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

  it("支持从紧凑内边距切换为 Figma 式四边独立编辑", () => {
    const onPropertyChange = jest.fn();
    renderPanel({ onPropertyChange });

    fireEvent.click(screen.getByRole("button", { name: "单独设置四边内边距" }));
    fireEvent.change(screen.getByLabelText("上内边距"), {
      target: { value: "12" },
    });

    expect(onPropertyChange).toHaveBeenCalledWith(
      selectedNode,
      "paddingTop",
      "上内边距",
      "12",
      "style",
      undefined,
    );
  });

  it("边框存在时提供四边独立宽度编辑", () => {
    const onPropertyChange = jest.fn();
    renderPanel({
      onPropertyChange,
      selectedNode: {
        ...selectedNode,
        computedStyle: {
          ...selectedNode.computedStyle,
          borderStyle: "solid",
          borderWidth: "1px",
          borderColor: "#111111",
        },
      },
    });

    fireEvent.change(screen.getByLabelText("右边框"), {
      target: { value: "2" },
    });

    expect(onPropertyChange).toHaveBeenCalledWith(
      expect.any(Object),
      "borderRightWidth",
      "右边框",
      "2",
      "style",
      undefined,
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
    expect(screen.getByRole("dialog")).toHaveTextContent("添加配置项");
  });

  it("已有配置项以顶部信息条展示并可继续编辑", () => {
    renderPanel({ configMarks: [colorConfigMark] });

    const configBar = screen.getByRole("button", { name: /文字颜色 textColor/ });
    expect(configBar).toBeInTheDocument();
    fireEvent.click(configBar);
    expect(screen.getByRole("dialog")).toHaveTextContent("编辑配置项");
    expect(screen.getByDisplayValue("文字颜色")).toBeInTheDocument();
  });

  it("点击已有配置项的属性标签可重新编辑并更新默认值", () => {
    const opacityConfigMark: VisualConfigMark = {
      id: "config-mark-2",
      changeId: "body > div:nth-child(1):style:opacity",
      nodeId: "node-1",
      domPath: "body > div:nth-child(1)",
      kind: "style",
      property: "opacity",
      label: "不透明度",
      fieldTitle: "不透明度",
      fieldKey: "opacity",
      defaultValue: "80",
      category: "设计",
      scope: "page",
    };
    const onUpdateConfigMark = jest.fn();
    renderPanel({ configMarks: [opacityConfigMark], onUpdateConfigMark });

    fireEvent.click(screen.getByRole("button", { name: "不透明度编辑配置项" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("编辑配置项");
    expect(onUpdateConfigMark).toHaveBeenCalledWith("config-mark-2", { defaultValue: "100" });
    expect(screen.getByDisplayValue("不透明度")).toBeInTheDocument();
    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
  });

  it("图片配置复用图片格式下拉、W/H 规则与上传式默认值控件", () => {
    const imageNode: VisualNodeInfo = {
      ...selectedNode,
      attrs: { src: "/cover.png" },
      editCapabilities: ["image"],
    };
    const imageMark: VisualConfigMark = {
      id: "config-mark-image",
      changeId: "body > div:nth-child(1):attribute:src",
      nodeId: "node-1",
      domPath: "body > div:nth-child(1)",
      kind: "attribute",
      property: "src",
      label: "替换图片",
      fieldTitle: "封面",
      fieldKey: "coverImage",
      defaultValue: "/cover.png",
      scope: "page",
      widthRule: { min: { value: 320, inclusive: true } },
      heightRule: { max: { value: 900, inclusive: true } },
    };

    const onUpdateConfigMark = jest.fn();
    renderPanel({ selectedNode: imageNode, configMarks: [imageMark], onUpdateConfigMark });
    fireEvent.click(screen.getByRole("button", { name: "封面 coverImage 编辑配置项" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("格式限制");
    expect(screen.getByText("全部图片")).toBeInTheDocument();
    expect(screen.getByLabelText("W尺寸具体数值")).toHaveValue(320);
    expect(screen.getByLabelText("H尺寸具体数值")).toHaveValue(900);
    expect(screen.getByLabelText("上传默认图片")).toHaveAttribute("type", "file");

    fireEvent.change(screen.getByLabelText("W尺寸比较符"), { target: { value: ">" } });
    expect(onUpdateConfigMark).toHaveBeenLastCalledWith("config-mark-image", expect.objectContaining({ widthRule: { min: { value: 320, inclusive: false } } }));

    fireEvent.click(screen.getByText("全部图片"));
    fireEvent.click(screen.getByRole("option", { name: "PNG" }));
    expect(onUpdateConfigMark).toHaveBeenLastCalledWith("config-mark-image", expect.objectContaining({ accept: "image/png" }));
  });
});
