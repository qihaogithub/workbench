import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentMarkdownEditor } from "./CommentMarkdownEditor";

vi.mock("../RichTextEditor", () => ({
  RichTextEditor: ({
    content,
    onChange,
    placeholder,
  }: {
    content: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <div
      role="textbox"
      aria-label={placeholder}
      contentEditable
      suppressContentEditableWarning
      tabIndex={0}
      data-value={content}
      onInput={(event) => onChange(event.currentTarget.textContent ?? "")}
    />
  ),
}));

describe("CommentMarkdownEditor 焦点时序", () => {
  it("编辑器初次挂载的临时失焦不会触发 onBlur", () => {
    const onBlur = vi.fn();
    const { container } = render(
      <CommentMarkdownEditor value="正文" onChange={() => {}} onBlur={onBlur} />,
    );

    fireEvent.blur(container.firstElementChild!);
    expect(onBlur).not.toHaveBeenCalled();
  });

  it("真正离开编辑器后延迟触发一次 onBlur", async () => {
    const onBlur = vi.fn();
    render(
      <CommentMarkdownEditor value="正文" onChange={() => {}} onBlur={onBlur} />,
    );

    const editor = screen.getByRole("textbox");
    const outside = document.createElement("button");
    document.body.append(outside);
    fireEvent.focus(editor);
    fireEvent.blur(editor, { relatedTarget: outside });

    expect(onBlur).not.toHaveBeenCalled();
    await waitFor(() => expect(onBlur).toHaveBeenCalledTimes(1));
    fireEvent.blur(editor, { relatedTarget: outside });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onBlur).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it("焦点在编辑器内部切换时不触发 onBlur", async () => {
    const onBlur = vi.fn();
    render(
      <CommentMarkdownEditor value="正文" onChange={() => {}} onBlur={onBlur} />,
    );

    const editor = screen.getByRole("textbox");
    const child = document.createElement("button");
    editor.append(child);
    fireEvent.focus(editor);
    fireEvent.blur(editor, { relatedTarget: child });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onBlur).not.toHaveBeenCalled();
  });

  it("失焦检查期间重新聚焦会取消待处理的退出", async () => {
    const onBlur = vi.fn();
    render(
      <CommentMarkdownEditor value="正文" onChange={() => {}} onBlur={onBlur} />,
    );

    const editor = screen.getByRole("textbox");
    const outside = document.createElement("button");
    document.body.append(outside);
    fireEvent.focus(editor);
    fireEvent.blur(editor, { relatedTarget: outside });
    fireEvent.focus(editor);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onBlur).not.toHaveBeenCalled();
    outside.remove();
  });
});
