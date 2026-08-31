import type { CommentTarget, CommentThread } from "@workbench/shared";

/** 按页面或文档 target 筛选线程；没有 target 表示项目级查询。 */
export function filterCommentThreadsByTarget(
  threads: CommentThread[],
  target?: CommentTarget,
): CommentThread[] {
  if (!target) return threads;

  if (target.kind === "page") {
    return threads.filter(
      (thread) =>
        thread.target.kind === "page" && thread.target.pageId === target.pageId,
    );
  }

  return threads.filter(
    (thread) =>
      thread.target.kind === "document" &&
      thread.target.resourceId === target.resourceId,
  );
}

/** 仅保留页面评论；未传 pageId 时表示项目内全部页面评论。 */
export function filterPageCommentThreads(
  threads: CommentThread[],
  pageId?: string,
): CommentThread[] {
  return threads.filter(
    (thread) =>
      thread.target.kind === "page" &&
      (pageId === undefined || thread.target.pageId === pageId),
  );
}

/** “未处理”沿用评论线程的 resolved 状态。 */
export function countUnresolvedCommentThreads(
  threads: CommentThread[],
): number {
  return threads.filter((thread) => !thread.resolved).length;
}
