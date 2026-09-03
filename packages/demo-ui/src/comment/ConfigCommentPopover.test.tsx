import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommentTarget, CommentThread } from "@workbench/shared";
import { ConfigCommentPopover } from "./ConfigCommentPopover";

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
    replies: [],
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
  it("筛选当前字段并按最新在前展示多条批注", () => {
    render(
      <ConfigCommentPopover
        target={target}
        threads={[
          thread("old", "较早批注", 10),
          thread("other", "其他字段", 30, { ...target, fieldKey: "subtitle" }),
          thread("new", "最新批注", 20),
        ]}
        readOnly
      />,
    );

    const list = screen.getByRole("region", { name: "配置项批注列表" });
    expect(list.textContent).toContain("最新批注");
    expect(list.textContent).toContain("较早批注");
    expect(list.textContent).not.toContain("其他字段");
    expect(list.textContent!.indexOf("最新批注")).toBeLessThan(list.textContent!.indexOf("较早批注"));
    expect(screen.queryByText("新增批注")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("创作端保留原位编辑并在保存后不关闭浮窗", async () => {
    const onUpdateComment = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfigCommentPopover
        target={target}
        threads={[thread("one", "原内容", 10)]}
        onUpdateComment={onUpdateComment}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByText("取消")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onUpdateComment).toHaveBeenCalledWith("one", { content: expect.any(String) }));
    expect(screen.getByRole("region", { name: "配置项批注列表" })).toBeInTheDocument();
  });
});
