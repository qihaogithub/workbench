import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  DocumentNameDialog,
  getNextAvailableTitle,
} from "./DocumentNameDialog";

describe("DocumentNameDialog", () => {
  it("为默认名称自动补齐第一个未占用的序号", () => {
    expect(
      getNextAvailableTitle("设计规范", ["设计规范 1", "设计规范 3"]),
    ).toBe("设计规范 2");
    expect(getNextAvailableTitle("新页面规范", [])).toBe("新页面规范 1");
  });

  it("禁止空标题提交，并在 Enter 时提交去空格后的标题", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(
      <DocumentNameDialog
        open
        title="新建文档"
        label="文档标题"
        defaultValue="默认标题"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    const input = screen.getByLabelText("文档标题");
    const submit = screen.getByRole("button", { name: "创建" });
    await user.clear(input);
    expect(submit).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(input, "  我的文档  ");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("我的文档"));
  });

  it("取消和 Escape 只关闭弹窗，不触发确认", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <DocumentNameDialog
        open
        title="新建文档"
        label="文档标题"
        defaultValue="默认标题"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
