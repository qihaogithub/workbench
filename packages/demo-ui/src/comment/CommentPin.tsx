"use client";

/** Figma 风格评论图钉：头像堆叠、悬浮摘要与已解决状态。 */
import { Bot, Check } from "lucide-react";
import type { CommentAuthor, CommentThread } from "@workbench/shared";
import { cn } from "../utils";
import { commentAvatarColor } from "./comment-theme";

export interface CommentPinProps {
  thread: CommentThread;
  /** 保留给屏幕阅读器和旧调用方的序号。 */
  index: number;
  left: number;
  top: number;
  active?: boolean;
  onClick?: () => void;
  mediaBaseUrl?: string;
}

function initials(author: CommentAuthor): string {
  if (author.isAgent) return "";
  return author.name.trim().slice(0, 1).toUpperCase() || "?";
}

function Avatar({ author, className }: { author: CommentAuthor; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#252525] text-[10px] font-semibold leading-none text-white", className)}
      style={{ backgroundColor: commentAvatarColor(author) }}
      aria-hidden="true"
    >
      {author.isAgent ? <Bot className="h-3.5 w-3.5" /> : initials(author)}
    </span>
  );
}

function participantAuthors(thread: CommentThread): CommentAuthor[] {
  const authors = [thread.author, ...thread.replies.map((reply) => reply.author)];
  const seen = new Set<string>();
  return authors.filter((author) => {
    if (seen.has(author.id)) return false;
    seen.add(author.id);
    return true;
  });
}

function latestActivity(thread: CommentThread) {
  return thread.replies.reduce(
    (current, reply) => (reply.createdAt > current.createdAt ? reply : current),
    { author: thread.author, content: thread.content, createdAt: thread.createdAt },
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function CommentPin({ thread, index, left, top, active, onClick }: CommentPinProps) {
  const authors = participantAuthors(thread);
  const activity = latestActivity(thread);
  const visibleAuthors = authors.slice(0, 3);
  const hiddenCount = Math.max(0, authors.length - visibleAuthors.length);
  const activitySummary = activity.content.replace(/\s+/g, " ").trim().slice(0, 80);
  const label = `${thread.resolved ? "已解决" : "评论"} ${index}：${activity.author.name}${authors.length > 1 ? `，${authors.length} 位参与者` : ""}${activitySummary ? `，${activitySummary}` : ""}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "group absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-pointer",
        "rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7efff] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
      )}
      style={{ left, top }}
    >
      <span
        className={cn(
          "relative inline-flex h-8 items-center justify-center rounded-full border-[2px] bg-[#252525] shadow-[0_3px_10px_rgba(0,0,0,.45)] transition-[filter,opacity] duration-200 motion-reduce:transition-none",
          visibleAuthors.length > 1 || hiddenCount > 0 ? "px-1" : "w-8",
          "border-transparent",
          thread.resolved && "opacity-65",
          active && (thread.resolved ? "border-[#8b8b8b]" : "border-[#a6ddff] ring-2 ring-[#66c7ff]/40"),
          "group-hover:brightness-110",
        )}
      >
        <span className={cn(
          "pointer-events-none absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-transparent bg-[#252525]",
          active && (thread.resolved ? "border-[#8b8b8b]" : "border-[#66c7ff]"),
        )} />
        {thread.resolved ? (
          <span className="relative z-[1] flex h-6 w-6 items-center justify-center rounded-full bg-[#5d5d5d] text-[#ededed]">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="relative z-[1] flex items-center justify-center">
            {visibleAuthors.map((author, authorIndex) => (
              <Avatar key={author.id} author={author} className={authorIndex > 0 ? "-ml-2" : undefined} />
            ))}
            {hiddenCount > 0 && (
              <span className="-ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#252525] bg-[#555] text-[9px] font-semibold text-white">
                +{hiddenCount}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="pointer-events-none absolute left-8 top-1/2 z-50 w-56 -translate-y-1/2 translate-x-1 opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="block rounded-xl border border-[#4e4e4e] bg-[#292929] px-3 py-2 text-left text-[11px] text-[#f5f5f5] shadow-[0_8px_24px_rgba(0,0,0,.45)]">
          <span className="flex items-center gap-1.5 font-semibold">
            <Avatar author={activity.author} className="h-5 w-5 text-[9px]" />
            <span className="truncate">{activity.author.name}</span>
            <span className="shrink-0 font-normal text-[#b8b8b8]">{formatTime(activity.createdAt)}</span>
          </span>
          <span className="mt-1 block line-clamp-2 whitespace-pre-wrap text-[#e3e3e3]">{activity.content}</span>
        </span>
      </span>
    </button>
  );
}
