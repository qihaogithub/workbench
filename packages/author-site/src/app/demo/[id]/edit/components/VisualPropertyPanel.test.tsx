import { render, screen } from "@testing-library/react";
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
      nodeStack={[selectedNode]}
      propertyChanges={[]}
      pendingPropertyChanges={[]}
      configMarks={[]}
      pendingConfigMarks={[]}
      aiInstruction=""
      hasPendingAiInstruction={false}
      submission={emptySubmission}
      sending={false}
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

describe("VisualPropertyPanel 发送状态", () => {
  it("已发送同一批属性后禁用发送按钮", () => {
    renderPanel({
      propertyChanges: [colorChange],
      submission: {
        ...emptySubmission,
        status: "sent",
        submittedAt: Date.now(),
        changes: [colorChange],
        prompt: "属性修改",
      },
    });

    expect(screen.getByRole("button", { name: /已发送给 AI/ })).toBeDisabled();
    expect(screen.getByText("本次属性修改已发送给 AI。")).toBeInTheDocument();
  });

  it("AI 处理中产生新草稿后允许再次发送", () => {
    const pendingChange: VisualPropertyChange = {
      ...colorChange,
      value: "#00ff00",
    };

    renderPanel({
      propertyChanges: [pendingChange],
      pendingPropertyChanges: [pendingChange],
      submission: {
        ...emptySubmission,
        status: "sending",
        submittedAt: Date.now(),
        changes: [colorChange],
        prompt: "属性修改",
      },
    });

    expect(screen.getByRole("button", { name: /发送给 AI/ })).toBeEnabled();
    expect(screen.getByText("AI 正在处理上一批修改，新修改可继续发送。")).toBeInTheDocument();
  });
});
