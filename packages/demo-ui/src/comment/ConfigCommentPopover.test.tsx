import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  CommentMention,
  CommentTarget,
  CommentThread,
} from "@workbench/shared";
import { ConfigCommentPopover } from "./ConfigCommentPopover";

vi.mock("./CommentMarkdownEditor", () => ({
  CommentMarkdownEditor: ({
    value,
    onChange,
    onBlur,
    onSubmit,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    onSubmit?: () => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={placeholder}
      data-document-editor="crepe"
      data-auto-grow="true"
      data-show-top-bar="false"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onSubmit?.();
        }
      }}
    />
  ),
}));

function thread(
  id: string,
  content: string,
  createdAt: number,
  target: CommentTarget = {
    kind: "config",
    scope: "page",
    pageId: "page-1",
    fieldKey: "title",
    fieldTitleSnapshot: "页面标题",
  },
  replies: CommentThread["replies"] = [],
): CommentThread {
  return {
    id,
    projectId: "project-1",
    target,
    content,
    author: { id: `author-${id}`, name: `作者 ${id}`, isAnonymous: false },
    createdAt,
    updatedAt: createdAt,
    resolved: false,
    replies,
  };
}

const target = {
  kind: "config" as const,
  scope: "page" as const,
  pageId: "page-1",
  fieldKey: "title",
  fieldTitleSnapshot: "页面标题",
};

describe("ConfigCommentPopover", () => {
  it("筛选当前字段并按最新在前展示 Markdown，浏览端不显示写入控件", () => {
    render(
      <ConfigCommentPopover
        target={target}
        threads={[
          thread("old", "较早批注", 10),
          thread("other", "其他字段", 30, { ...target, fieldKey: "subtitle" }),
          thread("new", "**最新批注**", 20),
        ]}
        readOnly
      />,
    );

    const list = screen.getByRole("region", { name: "配置项批注列表" });
    expect(list.textContent).toContain("最新批注");
    expect(list.querySelector("strong")).toHaveTextContent("最新批注");
    expect(list.textContent).toContain("较早批注");
    expect(list.textContent).not.toContain("其他字段");
    expect(list.textContent!.indexOf("最新批注")).toBeLessThan(
      list.textContent!.indexOf("较早批注"),
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "新增配置项批注" }),
    ).not.toBeInTheDocument();
  });

  it("将作者、时间和操作入口保持在同一排，并限制作者名宽度", () => {
    const longName = "这是一个非常非常长的批注作者名称";
    const currentThread = {
      ...thread("one", "主批注", 10),
      author: { id: "author-one", name: longName, isAnonymous: false },
    };
    const { container } = render(
      <ConfigCommentPopover
        target={target}
        threads={[currentThread]}
        onUpdateComment={vi.fn()}
      />,
    );

    const author = screen.getByText(longName);
    expect(author).toHaveClass("min-w-0", "max-w-[45%]", "truncate");
    const time = container.querySelector("time");
    expect(time).toHaveClass("shrink-0", "whitespace-nowrap");
    expect(author.parentElement).toHaveClass("flex", "flex-1");
  });

  it("编辑图标进入编辑态，失焦自动保存并回到只读态", async () => {
    const onUpdateComment = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfigCommentPopover
        target={target}
        threads={[thread("one", "原内容", 10)]}
        onUpdateComment={onUpdateComment}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑批注" }));
    const editor = screen.getByRole("textbox", { name: "修改批注…" });
    fireEvent.change(editor, { target: { value: "修改后的 **Markdown**" } });
    fireEvent.blur(editor);

    await waitFor(() =>
      expect(onUpdateComment).toHaveBeenCalledWith("one", {
        content: "修改后的 **Markdown**",
        mentions: [],
      }),
    );
    expect(
      screen.queryByRole("textbox", { name: "修改批注…" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("原内容")).toBeInTheDocument();
  });

  it("点击编辑按钮不会因按钮抢焦点立即退出编辑态", () => {
    const onUpdateComment = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfigCommentPopover
        target={target}
        threads={[thread("one", "原内容", 10)]}
        onUpdateComment={onUpdateComment}
      />,
    );

    const button = screen.getByRole("button", { name: "编辑批注" });
    const pointerDown = createEvent.pointerDown(button);
    fireEvent(button, pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);

    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).not.toBe(button);
    expect(
      screen.getByRole("textbox", { name: "修改批注…" }),
    ).toBeInTheDocument();
    expect(onUpdateComment).not.toHaveBeenCalled();
  });

  it("清空主批注时恢复最近保存内容，不调用空内容接口", async () => {
    const onUpdateComment = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfigCommentPopover
        target={target}
        threads={[thread("one", "原内容", 10)]}
        onUpdateComment={onUpdateComment}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑批注" }));
    const editor = screen.getByRole("textbox", { name: "修改批注…" });
    fireEvent.change(editor, { target: { value: "" } });
    fireEvent.blur(editor);

    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "修改批注…" }),
      ).not.toBeInTheDocument(),
    );
    expect(onUpdateComment).not.toHaveBeenCalled();
    expect(screen.getByText("原内容")).toBeInTheDocument();
  });

  it("新增批注默认无保存按钮，失焦提交并保留 Markdown mentions", async () => {
    const onCreateComment = vi.fn().mockResolvedValue(undefined);
    const mention: CommentMention = { type: "user", id: "u1", name: "小明" };
    render(
      <ConfigCommentPopover
        target={target}
        threads={[]}
        mentionCandidates={[mention]}
        onCreateComment={onCreateComment}
      />,
    );

    const composer = screen.getByRole("region", { name: "新增配置项批注" });
    expect(composer.querySelector('[data-auto-grow="true"]')).toBeTruthy();
    expect(composer.querySelector('[data-show-top-bar="false"]')).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /保存批注/ }),
    ).not.toBeInTheDocument();

    const editor = screen.getByRole("textbox", { name: "添加批注…" });
    fireEvent.change(editor, { target: { value: "新批注" } });
    fireEvent.blur(editor);
    await waitFor(() =>
      expect(onCreateComment).toHaveBeenCalledWith({
        target,
        content: "新批注",
        mentions: [],
      }),
    );
  });

  it("回复图标展开 Markdown 编辑器，发送图标显式提交", async () => {
    const onAddReply = vi.fn().mockResolvedValue(undefined);
    const replies: CommentThread["replies"] = [
      {
        id: "reply-1",
        content: "已有回复",
        author: { id: "u1", name: "小明", isAnonymous: false },
        createdAt: 12,
        mentions: [],
      },
    ];
    render(
      <ConfigCommentPopover
        target={target}
        threads={[thread("one", "主批注", 10, target, replies)]}
        onAddReply={onAddReply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "回复批注" }));
    const editor = screen.getByRole("textbox", { name: "回复此批注…" });
    fireEvent.change(editor, { target: { value: "回复 **内容**" } });
    fireEvent.click(screen.getByRole("button", { name: "发送回复" }));
    await waitFor(() =>
      expect(onAddReply).toHaveBeenCalledWith("one", {
        content: "回复 **内容**",
        mentions: [],
      }),
    );
  });

  it("写入操作均为始终可见的图标按钮并带无障碍名称", () => {
    const replies: CommentThread["replies"] = [
      {
        id: "reply-1",
        content: "已有回复",
        author: { id: "u1", name: "小明", isAnonymous: false },
        createdAt: 12,
      },
    ];
    render(
      <ConfigCommentPopover
        target={target}
        threads={[thread("one", "主批注", 10, target, replies)]}
        onAddReply={vi.fn()}
        onUpdateComment={vi.fn()}
        onUpdateReply={vi.fn()}
        onSetResolved={vi.fn()}
        onDeleteThread={vi.fn()}
        onDeleteReply={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "回复批注" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑批注" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "完成批注" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "删除批注" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("编辑")).not.toBeInTheDocument();
    expect(screen.queryByText("删除")).not.toBeInTheDocument();
  });
});
