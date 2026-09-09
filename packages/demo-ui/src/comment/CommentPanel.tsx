"use client";

/**
 * CommentPanel：嵌入右侧栏的评论面板（评论 tab 内容）。
 *
 * 统一"添加评论"入口（切换评论模式按钮）+ 评论列表（CommentSidebar），
 * 供创作端与浏览端复用，保证两端评论交互与 UI 一致。
 * 两端唯一差异在于 CommentLayer 的 canMentionAgent（浏览端不能 @AI），
 * 与本组件无关。
 *
 * 布局：筛选栏 → 评论列表 → 底部吸底操作栏（添加评论按钮居中）。
 */
import { MessageSquarePlus } from "lucide-react";
import type { CommentThread } from "@workbench/shared";
import { cn } from "../utils";
import { CommentSidebar, type CommentPageMeta } from "./CommentSidebar";

const EMPTY_COMMENT_PAGES: CommentPageMeta[] = [];

export interface CommentPanelProps {
  threads: CommentThread[];
  currentUserId?: string;
  activeThreadId?: string | null;
  onSelectThread: (threadId: string) => void;
  /** 评论模式开关（受控） */
  commentMode: boolean;
  onCommentModeChange: (mode: boolean) => void;
  /** 当前视图是否允许在页面上落点创建评论 */
  canCreateComment?: boolean;
  /** 进入评论模式后的定位提示 */
  createHint?: string;
  /** 画布模式下按页面分组评论。 */
  groupByPage?: boolean;
  /** 画布页面名称与顺序。 */
  commentPages?: CommentPageMeta[];
  /** 当前画布焦点页面，用于自动定位分组。 */
  focusedPageId?: string | null;
  /** 评论正文中的 canonical 图片地址前缀（跨 origin viewer 使用）。 */
  mediaBaseUrl?: string;
  className?: string;
}

export function CommentPanel({
  threads,
  currentUserId,
  activeThreadId,
  onSelectThread,
  commentMode,
  onCommentModeChange,
  canCreateComment = true,
  createHint = "点击页面内容定位评论",
  groupByPage = false,
  commentPages = EMPTY_COMMENT_PAGES,
  focusedPageId = null,
  mediaBaseUrl,
  className,
}: CommentPanelProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <CommentSidebar
        threads={threads}
        currentUserId={currentUserId}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        showHeader={false}
        groupByPage={groupByPage}
        commentPages={commentPages}
        focusedPageId={focusedPageId}
        mediaBaseUrl={mediaBaseUrl}
        className="min-h-0 flex-1"
      />
      {canCreateComment && (
        <div className="shrink-0 border-t border-[#454545] bg-[#242424] p-3">
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => onCommentModeChange(!commentMode)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-4 text-xs font-medium transition-colors",
                commentMode
                  ? "bg-[#70bfff] text-[#13202d] hover:bg-[#8dceff]"
                  : "border border-[#606060] bg-transparent text-[#f3f3f3] hover:bg-white/10",
              )}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {commentMode ? "退出评论模式" : "添加评论"}
            </button>
          </div>
          {commentMode && (
            <p className="mt-2 text-center text-[10px] text-[#a8a8a8]">
              {createHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
