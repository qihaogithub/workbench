import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentComposer } from "./CommentComposer";

describe("CommentComposer", () => {
  it("未激活时保持紧凑输入框，获得焦点后展开工具栏", () => {
    render(
      <CommentComposer
        value=""
        onChange={vi.fn()}
        mentions={[]}
        onMentionsChange={vi.fn()}
        candidates={[]}
        onSubmit={vi.fn()}
      />,
    );

    const textbox = screen.getByRole("textbox");
    const composer = textbox.parentElement?.parentElement as HTMLElement;
    expect(composer).toHaveAttribute("aria-expanded", "false");
    expect(composer.style.height).toBe("40px");
    expect(composer.style.borderRadius).toBe("20px");
    expect(screen.queryByRole("button", { name: "插入表情" })).not.toBeInTheDocument();

    fireEvent.focus(textbox);
    expect(composer).toHaveAttribute("aria-expanded", "true");
    expect(composer.style.height).toBe("");
    expect(composer.style.borderRadius).toBe("12px");
    expect(screen.getByRole("button", { name: "插入表情" })).toBeInTheDocument();

    fireEvent.blur(textbox, { relatedTarget: document.body });
    expect(composer).toHaveAttribute("aria-expanded", "false");
  });

  it("提供表情和 @ / 图片工具，并把表情插入编辑器", async () => {
    const onChange = vi.fn();
    render(
      <CommentComposer
        value=""
        onChange={onChange}
        mentions={[]}
        onMentionsChange={vi.fn()}
        candidates={[]}
        uploadCommentImage={vi.fn()}
      />,
    );

    const textbox = screen.getByRole("textbox");
    expect(screen.queryByRole("button", { name: "插入表情" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送评论" })).toBeDisabled();
    fireEvent.focus(textbox);
    expect(screen.getByRole("button", { name: "插入表情" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "插入表情" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "插入😀" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("😀"));
    expect(screen.getByRole("button", { name: "提及成员" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插入图片" })).toBeInTheDocument();
  });

  it("上传图片后插入 Markdown 图片语法", async () => {
    const onChange = vi.fn();
    const upload = vi.fn().mockResolvedValue({ url: "/api/images/img_1", kind: "image" as const, filename: "截图.png" });
    render(
      <CommentComposer
        value="已有"
        onChange={onChange}
        mentions={[]}
        onMentionsChange={vi.fn()}
        candidates={[]}
        uploadCommentImage={upload}
      />,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    fireEvent.change(input!, { target: { files: [new File(["x"], "截图.png", { type: "image/png" })] } });
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("已有\n![截图.png](/api/images/img_1)\n"));
  });

  it("上传失败时保留正文并提示错误", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("格式不支持"));
    render(
      <CommentComposer
        value="正文"
        onChange={vi.fn()}
        mentions={[]}
        onMentionsChange={vi.fn()}
        candidates={[]}
        uploadCommentImage={upload}
      />,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["x"], "bad.exe")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("格式不支持");
    expect(screen.getByRole("textbox")).toHaveTextContent("正文");
  });

  it("支持从 @ 候选中选择成员，并用 Cmd/Ctrl+Enter 提交", async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <CommentComposer
        value=""
        onChange={onChange}
        mentions={[]}
        onMentionsChange={vi.fn()}
        candidates={[{ id: "user-2", name: "小明", type: "user" }]}
        onSubmit={onSubmit}
      />,
    );
    const textbox = screen.getByRole("textbox");
    textbox.textContent = "@";
    fireEvent.input(textbox);
    fireEvent.keyUp(textbox, { key: "@" });
    const candidate = await screen.findByRole("button", { name: "小明" });
    fireEvent.click(candidate);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("@小明 "));
    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("编辑态把中文取消/保存按钮放在输入框工具栏内", () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(
      <CommentComposer
        value="待保存的评论"
        onChange={vi.fn()}
        mentions={[]}
        onMentionsChange={vi.fn()}
        candidates={[]}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送评论" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
