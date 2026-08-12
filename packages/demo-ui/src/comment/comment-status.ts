/**
 * @AI 任务状态的中文文案与样式映射。
 * 供侧栏（CommentSidebar）与线程弹窗（CommentThreadPopover）共用，保证两端文案一致。
 */
import type { CommentAiTaskStatus } from "@workbench/shared";

export const AI_STATUS_LABEL: Record<
  CommentAiTaskStatus,
  { text: string; className: string }
> = {
  pending: {
    text: "排队中",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  processing: {
    text: "执行中",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  done: {
    text: "已完成",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    text: "失败",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
};