"use client";

/**
 * CommentPin：单条评论的可视化标记（编号气泡）。
 * - 未解决：蓝色实心；已解决：灰色描边。
 * - @AI 任务显示状态徽标。
 * - 由 CommentLayer 计算绝对定位（left/top）后传入。
 */
import { Bot, Check } from "lucide-react";
import type { CommentThread } from "@workbench/shared";
import { cn } from "../utils";

export interface CommentPinProps {
  thread: CommentThread;
  /** 序号（1 起） */
  index: number;
  left: number;
  top: number;
  active?: boolean;
  onClick?: () => void;
}

const AI_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500",
  processing: "bg-blue-500 animate-pulse",
  done: "bg-emerald-500",
  failed: "bg-red-500",
};

export function CommentPin({
  thread,
  index,
  left,
  top,
  active,
  onClick,
}: CommentPinProps) {
  const resolved = thread.resolved;
  const aiStatus = thread.aiTaskStatus;

  return (
    <button
      type="button"
      onClick={onClick}
      title={resolved ? "已解决的评论" : "查看评论"}
      aria-label={`评论 ${index}`}
      className={cn(
        "group absolute z-30 -translate-x-1/2 -translate-y-1/2",
        "flex items-center justify-center",
      )}
      style={{ left, top }}
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold shadow-sm transition-all",
          resolved
            ? "border-muted-foreground/40 bg-background text-muted-foreground/60 group-hover:border-muted-foreground/70"
            : active
              ? "border-blue-600 bg-blue-600 text-white ring-2 ring-blue-400/50"
              : "border-blue-600 bg-blue-500 text-white group-hover:scale-110 group-hover:bg-blue-600",
        )}
      >
        {resolved ? <Check className="h-3.5 w-3.5" /> : index}
      </span>
      {aiStatus && !resolved && (
        <span
          title={`AI 任务：${aiStatus}`}
          className={cn(
            "absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white",
            AI_STATUS_STYLE[aiStatus] ?? "bg-muted-foreground",
          )}
        >
          <Bot className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}
