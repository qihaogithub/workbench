import type { CommentTarget, CommentThread } from "@workbench/shared";
import { describe, expect, it } from "vitest";
import {
  countUnresolvedCommentThreads,
  filterCommentThreadsByTarget,
  filterPageCommentThreads,
} from "./comment-thread-scope";

function createThread(
  id: string,
  target: CommentTarget,
  resolved = false,
): CommentThread {
  return {
    id,
    projectId: "project_1",
    target,
    content: id,
    author: { id: "user_1", name: "用户", isAnonymous: false },
    createdAt: 1,
    updatedAt: 1,
    resolved,
    replies: [],
  };
}

const pageA = createThread("page-a", { kind: "page", pageId: "page_a" });
const pageBResolved = createThread(
  "page-b",
  { kind: "page", pageId: "page_b" },
  true,
);
const documentThread = createThread("document", {
  kind: "document",
  resourceId: "docs/brief.md",
  resourceLabel: "需求说明",
});
const threads = [pageA, pageBResolved, documentThread];

describe("comment thread scope", () => {
  it("按页面 target 筛选，且项目级查询不丢弃任何线程", () => {
    expect(
      filterCommentThreadsByTarget(threads, {
        kind: "page",
        pageId: "page_a",
      }),
    ).toEqual([pageA]);
    expect(filterCommentThreadsByTarget(threads)).toEqual(threads);
  });

  it("项目级红点只统计页面评论，并按 resolved 计数", () => {
    const pageThreads = filterPageCommentThreads(threads);

    expect(pageThreads).toEqual([pageA, pageBResolved]);
    expect(filterPageCommentThreads(threads, "page_a")).toEqual([pageA]);
    expect(countUnresolvedCommentThreads(pageThreads)).toBe(1);
  });
});
