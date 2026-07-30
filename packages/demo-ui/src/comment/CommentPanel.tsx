"use client";

/**
 * CommentPanel：嵌入右侧栏的评论面板（评论 tab 内容）。
 *
 * 统一"添加评论"入口（切换评论模式按钮）+ 评论列表（CommentSidebar），
 * 供创作端与浏览端复用，保证两端评论交互与 UI 一致。
 * 两端唯一差异在于 CommentLayer 的 canMentionAgent（浏览端不能 @AI），
 * 与本组件无关。
 */
import { MessageSquarePlus } from "lucide-react";
import type { CommentThread } from "@workbench/shared";
import { cn } from "../utils";
import { CommentSidebar } from "./CommentSidebar";

export interface CommentPanelProps {
  threads: CommentThread[];
  currentUserId?: string;
  activeThreadId?: string | null;
  onSelectThread: (threadId: string) => void;
  /** 评论模式开关（受控） */
  commentMode: boolean;
  onCommentModeChange: (mode: boolean) => void;
  className?: string;
}

export function CommentPanel({
  threads,
  currentUserId,
  activeThreadId,
  onSelectThread,
  commentMode,
  onCommentModeChange,
  className,
}: CommentPanelProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => onCommentModeChange(!commentMode)}
          className={cn(
            "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-3 text-xs font-medium transition-colors",
            commentMode
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {commentMode ? "退出评论模式" : "添加评论"}
        </button>
        {commentMode && (
          <span className="text-[10px] text-muted-foreground">
            点击页面内容定位评论
          </span>
        )}
      </div>
      <CommentSidebar
        threads={threads}
        currentUserId={currentUserId}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        className="min-h-0 flex-1"
      />
    </div>
  );
}
