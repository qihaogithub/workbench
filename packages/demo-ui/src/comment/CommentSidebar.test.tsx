import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommentTarget, CommentThread } from "@workbench/shared";
import { CommentSidebar } from "./CommentSidebar";

function createThread(
  id: string,
  target: CommentTarget,
  resolved = false,
): CommentThread {
  return {
    id,
    projectId: "project-1",
    target,
    content: id,
    author: { id: "user-1", name: "用户", isAnonymous: false },
    createdAt: Number(id.replace(/\D/g, "")) || 1,
    updatedAt: 1,
    resolved,
    replies: [],
  };
}

describe("CommentSidebar page grouping", () => {
  it("按页面顺序分组，排除文档评论并定位当前页面", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const threads = [
      createThread("page-b-1", { kind: "page", pageId: "page-b" }),
      createThread("page-a-1", { kind: "page", pageId: "page-a" }, true),
      createThread("document-1", {
        kind: "document",
        resourceId: "docs/brief.md",
        resourceLabel: "需求说明",
      }),
    ];

    render(
      <CommentSidebar
        threads={threads}
        onSelectThread={vi.fn()}
        groupByPage
        commentPages={[
          { id: "page-a", name: "页面 A", order: 0 },
          { id: "page-b", name: "页面 B", order: 1 },
        ]}
        focusedPageId="page-b"
      />,
    );

    const groups = [...document.querySelectorAll<HTMLElement>("[data-comment-page-group]")];
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.textContent)).toEqual([
      expect.stringContaining("页面 A"),
      expect.stringContaining("页面 B"),
    ]);
    expect(screen.queryByText("document-1")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "nearest",
      }),
    );
  });

  it("筛选后仍保持页面分组，未解决筛选隐藏已处理线程", () => {
    const onSelectThread = vi.fn();
    render(
      <CommentSidebar
        threads={[
          createThread("resolved", { kind: "page", pageId: "page-a" }, true),
          createThread("unresolved", { kind: "page", pageId: "page-b" }),
        ]}
        onSelectThread={onSelectThread}
        groupByPage
        commentPages={[
          { id: "page-a", name: "页面 A", order: 0 },
          { id: "page-b", name: "页面 B", order: 1 },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "未解决" }));
    expect(screen.queryByText("resolved")).not.toBeInTheDocument();
    expect(screen.getByText("unresolved")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-comment-page-group]")).toHaveLength(1);
  });
});
