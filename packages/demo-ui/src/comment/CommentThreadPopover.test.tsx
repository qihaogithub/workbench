import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentThread } from "@workbench/shared";
import { CommentThreadPopover } from "./CommentThreadPopover";

const currentUser = { id: "user-1", name: "当前用户", isAnonymous: false };

function createThread(tagName: string): CommentThread {
  return {
    id: `thread-${tagName}`,
    projectId: "project-1",
    target: { kind: "page", pageId: "page-1" },
    anchor: {
      domPath: "canvas-page > img",
      tagName,
      componentName: "图片组件",
      textSnippet: "图片说明",
    },
    content: "评论正文",
    author: currentUser,
    createdAt: 1,
    updatedAt: 1,
    resolved: false,
    replies: [],
  };
}

const handlers = {
  onClose: vi.fn(),
  onAddReply: vi.fn(async () => undefined),
  onUpdateComment: vi.fn(async () => undefined),
  onUpdateReply: vi.fn(async () => undefined),
  onSetResolved: vi.fn(async () => undefined),
  onDeleteThread: vi.fn(async () => undefined),
  onDeleteReply: vi.fn(async () => undefined),
};

function renderPopover(thread: CommentThread) {
  return render(
    <CommentThreadPopover
      thread={thread}
      currentUser={currentUser}
      mentionCandidates={[]}
      left={100}
      top={100}
      {...handlers}
    />,
  );
}

describe("CommentThreadPopover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render the anchor summary in the floating window", () => {
    renderPopover(createThread("img"));

    expect(screen.queryByText("<img>", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("<button>", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("图片组件", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("图片说明", { exact: true })).not.toBeInTheDocument();
  });

  it("uses the resolve menu action to reopen a resolved thread", async () => {
    const thread = createThread("button");
    thread.resolved = true;
    renderPopover(thread);

    fireEvent.click(screen.getAllByRole("button", { name: "更多评论操作" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "标记为未读" }));

    await waitFor(() => expect(handlers.onSetResolved).toHaveBeenCalledWith(thread.id, false));
  });

  it("renders the more menu in a body portal above the scrollable thread content", () => {
    const { container } = renderPopover(createThread("button"));
    fireEvent.click(screen.getAllByRole("button", { name: "更多评论操作" })[0]);

    const menu = screen.getByRole("menu");
    expect(menu.parentElement).toBe(document.body);
    expect(container.contains(menu)).toBe(false);
    expect(menu.className).toContain("fixed");
  });

  it("only exposes edit and delete actions to the matching sender", () => {
    const thread = createThread("button");
    thread.replies = [{
      id: "reply-1",
      author: { id: "user-2", name: "另一位用户", isAnonymous: false },
      content: "回复正文",
      createdAt: 2,
      mentions: [],
    }];
    renderPopover(thread);

    const menus = screen.getAllByRole("button", { name: "更多评论操作" });
    expect(menus).toHaveLength(2);
    fireEvent.click(menus[1]);
    expect(screen.getByRole("menuitem", { name: "编辑评论" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除评论…" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "删除评论…" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("renders edit actions inside the composer toolbar without a duplicate footer", () => {
    const thread = createThread("button");
    renderPopover(thread);
    fireEvent.click(screen.getAllByRole("button", { name: "更多评论操作" })[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑评论" }));

    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送评论" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "取消" })).toHaveLength(1);
  });

  it("closes the delete alertdialog on Escape and restores a usable menu trigger", async () => {
    const thread = createThread("button");
    renderPopover(thread);
    const trigger = screen.getAllByRole("button", { name: "更多评论操作" })[1];
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "删除评论…" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("allows the floating thread window to move with its title handle", () => {
    renderPopover(createThread("button"));
    const handle = screen.getByRole("button", { name: "拖动评论浮窗，可使用方向键移动" });
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });

    const popover = handle.closest("[style]") as HTMLElement;
    expect(popover.style.left).toBe("204px");
    expect(popover.style.top).toBe("164px");
  });
});
