import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PermissionDialog } from "../permission-dialog";

jest.mock("@opencode-workbench/demo-ui", () => ({
  DocumentEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="计划 Markdown 编辑器"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("PermissionDialog 计划审批", () => {
  it("可在卡片上直接批准原计划", async () => {
    const user = userEvent.setup();
    const onRespond = jest.fn();

    render(
      <PermissionDialog
        variant="inline"
        onRespond={onRespond}
        onCancel={jest.fn()}
        request={{
          sessionId: "session-1",
          options: [
            { optionId: "allow_once", name: "批准执行" },
            { optionId: "reject_once", name: "取消" },
          ],
          toolCall: {
            toolCallId: "approval-1",
            title: "执行计划",
            kind: "execute",
            approvalKind: "plan_approval",
            editable: true,
            initialContent: "## 原计划",
            summary: "## 原计划",
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "批准" }));

    expect(onRespond).toHaveBeenCalledWith("allow_once", "## 原计划");
  });

  it("点击查看计划后使用 Markdown 编辑器编辑并批准计划", async () => {
    const user = userEvent.setup();
    const onRespond = jest.fn();

    render(
      <PermissionDialog
        variant="inline"
        onRespond={onRespond}
        onCancel={jest.fn()}
        request={{
          sessionId: "session-1",
          options: [
            { optionId: "allow_once", name: "批准执行" },
            { optionId: "reject_once", name: "取消" },
          ],
          toolCall: {
            toolCallId: "approval-1",
            title: "执行计划",
            kind: "execute",
            approvalKind: "plan_approval",
            editable: true,
            initialContent: "## 原计划",
            summary: "## 原计划",
          },
        }}
      />,
    );

    expect(screen.getByText("执行计划待确认")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看计划" }));

    const textarea = screen.getByLabelText("计划 Markdown 编辑器");
    expect(textarea).toHaveValue("## 原计划");
    await user.clear(textarea);
    await user.type(textarea, "## 编辑后的计划");
    await user.click(screen.getByRole("button", { name: "批准执行" }));

    expect(onRespond).toHaveBeenCalledWith("allow_once", "## 编辑后的计划");
  });
});
