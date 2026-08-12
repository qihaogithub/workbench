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
import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import type { CommentThread } from "@workbench/shared";
import { cn } from "../utils";
import { CommentCreatePopover } from "./CommentCreatePopover";
import { CommentSidebar } from "./CommentSidebar";
import type { CommentApiAdapter, CreateCommentInput, MentionCandidate } from "./types";

export interface CanvasCommentTarget {
  pageId: string;
  pageName: string;
}

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
  /** 画布点击选中的页面；传入时在侧栏直接完成页面级评论。 */
  canvasCommentTarget?: CanvasCommentTarget | null;
  onCanvasCommentTargetChange?: (target: CanvasCommentTarget | null) => void;
  api?: CommentApiAdapter;
  onCreateComment?: (input: CreateCommentInput) => Promise<CommentThread>;
  canMentionAgent?: boolean;
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
  canvasCommentTarget,
  onCanvasCommentTargetChange,
  api,
  onCreateComment,
  canMentionAgent = false,
  className,
}: CommentPanelProps) {
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);

  useEffect(() => {
    if (!canvasCommentTarget || !api) return;
    let cancelled = false;
    void api.listMentionCandidates().then((candidates) => {
      if (!cancelled) setMentionCandidates(candidates);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, canvasCommentTarget]);

  const canvasDraft = canvasCommentTarget
    ? {
        pageId: canvasCommentTarget.pageId,
        anchor: {
          domPath: "canvas-page",
          tagName: "canvas-page",
          componentName: canvasCommentTarget.pageName,
          textSnippet: canvasCommentTarget.pageName,
          snapshot: { attrs: { "data-page-id": canvasCommentTarget.pageId } },
        },
        pin: { xRatio: 0.5, yRatio: 0.5 },
      }
    : null;
  const canvasPageName = canvasCommentTarget?.pageName;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <CommentSidebar
        threads={threads}
        currentUserId={currentUserId}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        showHeader={false}
        className="min-h-0 flex-1"
      />
      {canvasDraft && canvasPageName && onCreateComment && (
        <div className="shrink-0 border-t border-border p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            页面级评论：{canvasPageName}
          </p>
          <CommentCreatePopover
            embedded
            draft={canvasDraft}
            mentionCandidates={mentionCandidates}
            canMentionAgent={canMentionAgent}
            left={0}
            top={0}
            onCancel={() => onCanvasCommentTargetChange?.(null)}
            onSubmit={async (input) => {
              const thread = await onCreateComment(input);
              onCanvasCommentTargetChange?.(null);
              onSelectThread(thread.id);
              onCommentModeChange(false);
              return thread;
            }}
          />
        </div>
      )}
      {canCreateComment && (
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => onCommentModeChange(!commentMode)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-4 text-xs font-medium transition-colors",
                commentMode
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {commentMode ? "退出评论模式" : "添加评论"}
            </button>
          </div>
          {commentMode && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              {createHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
