import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommentTarget, CommentThread } from "@workbench/shared";
import { ConfigCommentPopover } from "./ConfigCommentPopover";

// Keep Milkdown real: a mocked contenteditable never exercises its async
// lifecycle or the focus changes caused by mounting multiple editors.
if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
}
if (!Range.prototype.getBoundingClientRect) {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
    }),
  });
}

const target: CommentTarget = {
  kind: "config",
  scope: "page",
  pageId: "page-1",
  fieldKey: "title",
  fieldTitleSnapshot: "页面标题",
};

const currentThread: CommentThread = {
  id: "thread-1",
  projectId: "project-1",
  target,
  content: "原内容",
  author: { id: "author-1", name: "作者", isAnonymous: false },
  createdAt: 10,
  updatedAt: 10,
  resolved: false,
  replies: [],
};

describe("ConfigCommentPopover 编辑焦点竞态", () => {
  it.each([false, true])(
    "真实编辑器持续可编辑（StrictMode=%s）",
    async (strict) => {
      const onUpdateComment = vi.fn().mockResolvedValue(undefined);
      const panel = (
        <ConfigCommentPopover
          target={target}
          threads={[currentThread]}
          currentUser={currentThread.author}
          onCreateComment={vi.fn().mockResolvedValue(undefined)}
          onUpdateComment={onUpdateComment}
        />
      );
      const { container } = render(
        strict ? <StrictMode>{panel}</StrictMode> : panel,
      );
      await waitFor(() =>
        expect(container.querySelector(".ProseMirror")).toBeTruthy(),
      );

      const button = screen.getByRole("button", { name: "编辑批注" });
      fireEvent.pointerDown(button);
      fireEvent.click(button);

      await waitFor(() =>
        expect(container.querySelector("article .ProseMirror")).toBeTruthy(),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const editor = container.querySelector<HTMLElement>(
        "article .ProseMirror",
      );
      expect(container.querySelectorAll("article .ProseMirror")).toHaveLength(
        1,
      );
      expect(editor).toBeInTheDocument();
      expect(editor).toHaveFocus();
      expect(editor).toHaveAttribute("contenteditable", "true");
      expect(editor).toHaveTextContent("原内容");
      expect(onUpdateComment).not.toHaveBeenCalled();

      // Simulate the DOM mutation produced by typing in a real contenteditable.
      // Wait for the real Markdown listener/autosave chain rather than assuming
      // its debounce has fired after a fixed delay on a busy test worker.
      await act(async () => {
        editor!.querySelector("p")!.textContent = "修改后的正文";
        fireEvent.input(editor!, {
          inputType: "insertText",
          data: "修改后的正文",
        });
      });
      await waitFor(
        () =>
          expect(onUpdateComment).toHaveBeenCalledWith(
            "thread-1",
            expect.objectContaining({ content: "修改后的正文" }),
          ),
        { timeout: 5000 },
      );
      expect(editor).toHaveFocus();
      act(() => button.focus());
      await waitFor(() =>
        expect(container.querySelector("article .ProseMirror")).toBeNull(),
      );
    },
  );
});
