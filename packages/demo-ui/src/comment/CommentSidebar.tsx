"use client";

/**
 * CommentSidebar：页面评论列表侧栏。
 * - 筛选：全部 / @我的 / 未解决。
 * - 点击列表项定位到对应评论（高亮 pin + 打开线程面板）。
 */
import { useMemo, useState } from "react";
import { Bot, CheckCircle2, MessageSquare, X } from "lucide-react";
import type { CommentThread } from "@workbench/shared";
import { cn } from "../utils";
import { MentionContent } from "./MentionPicker";
import { threadMentionsUser } from "./useComments";
import type { CommentFilter } from "./types";

export interface CommentSidebarProps {
  threads: CommentThread[];
  currentUserId?: string;
  activeThreadId?: string | null;
  onSelectThread: (threadId: string) => void;
  /** 关闭回调；不传则不显示关闭按钮（如嵌入右侧栏 tab 时） */
  onClose?: () => void;
  /** 是否显示顶部标题栏（标题 + 未解决数量）；嵌入已有标题的容器时可隐藏 */
  showHeader?: boolean;
  className?: string;
}

const FILTERS: Array<{ value: CommentFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "mentionsMe", label: "@我的" },
  { value: "unresolved", label: "未解决" },
];

export function CommentSidebar({
  threads,
  currentUserId,
  activeThreadId,
  onSelectThread,
  onClose,
  showHeader = true,
  className,
}: CommentSidebarProps) {
  const [filter, setFilter] = useState<CommentFilter>("all");

  const filtered = useMemo(() => {
    let list = threads;
    if (filter === "unresolved") list = list.filter((t) => !t.resolved);
    if (filter === "mentionsMe") list = list.filter((t) => threadMentionsUser(t, currentUserId));
    // 未解决优先，其次按创建时间倒序
    return [...list].sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
  }, [threads, filter, currentUserId]);

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      {showHeader && (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            评论
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              {threads.filter((t) => !t.resolved).length}
            </span>
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="关闭评论列表"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 筛选 */}
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            暂无评论
          </div>
        ) : (
          filtered.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={cn(
                "block w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                activeThreadId === thread.id && "bg-muted/70",
                thread.resolved && "opacity-60",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white",
                    thread.author.isAgent
                      ? "bg-violet-500"
                      : thread.author.isAnonymous
                        ? "bg-muted-foreground/60"
                        : "bg-blue-500",
                  )}
                >
                  {thread.author.isAgent ? <Bot className="h-2.5 w-2.5" /> : thread.author.name.slice(0, 1)}
                </span>
                <span className="truncate text-[11px] font-medium text-foreground">
                  {thread.author.name}
                </span>
                {thread.aiTaskStatus && !thread.resolved && (
                  <span className="ml-auto flex items-center gap-0.5 rounded bg-violet-500/15 px-1 py-0.5 text-[9px] text-violet-500">
                    <Bot className="h-2.5 w-2.5" />
                    {thread.aiTaskStatus}
                  </span>
                )}
                {thread.resolved && (
                  <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-500" />
                )}
              </div>
              <MentionContent
                content={thread.content}
                mentions={thread.mentions}
                className="mt-1 line-clamp-2 text-[11px] text-muted-foreground"
              />
              {thread.replies.length > 0 && (
                <div className="mt-1 text-[10px] text-muted-foreground/70">
                  {thread.replies.length} 条回复
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
