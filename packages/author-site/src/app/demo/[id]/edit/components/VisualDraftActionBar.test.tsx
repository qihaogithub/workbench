import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VisualDraftActionBar } from "./VisualDraftActionBar";

describe("VisualDraftActionBar", () => {
  it("保存型草稿显示保存和取消", async () => {
    const user = userEvent.setup();
    const onPrimary = jest.fn();
    const onCancel = jest.fn();

    render(
      <VisualDraftActionBar
        action={{ count: 2, kind: "save", label: "保存" }}
        onPrimary={onPrimary}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("2 项修改")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("AI 型草稿显示发送给AI并支持禁用", () => {
    render(
      <VisualDraftActionBar
        action={{ count: 1, kind: "send", label: "发送给AI" }}
        disabled
        onPrimary={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("1 项修改")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送给AI" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
  });
});
