import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { VisualNodeInfo, VisualPropertyChange } from "@opencode-workbench/demo-ui";
import { VisualPropertyPanel } from "./VisualPropertyPanel";
import type { VisualPropertySubmission } from "../hooks/useVisualEditState";

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

const emptySubmission: VisualPropertySubmission = {
  status: "idle",
  submittedAt: null,
  changes: [],
  configMarks: [],
  instruction: "",
  prompt: "",
  error: null,
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof VisualPropertyPanel>> = {},
) {
  return render(
    <VisualPropertyPanel
      selectedNode={selectedNode}
      propertyChanges={[]}
      pendingPropertyChanges={[]}
      configMarks={[]}
      aiInstruction=""
      submission={emptySubmission}
      usedConfigKeys={[]}
      sessionId="session-1"
      onPropertyChange={jest.fn()}
      onRestoreProperty={jest.fn()}
      onClearChanges={jest.fn()}
      onMarkConfig={jest.fn()}
      onUpdateConfigMark={jest.fn()}
      onRemoveConfigMark={jest.fn()}
      onAiInstructionChange={jest.fn()}
      onSendToAI={jest.fn()}
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
