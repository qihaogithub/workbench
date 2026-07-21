"use client";

import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";

export type PlanItemStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface PlanItem {
  id: string;
  title: string;
  status: PlanItemStatus;
}

export interface PlanState {
  items: PlanItem[];
  fallbackText: string;
}

interface ChatPlanProps {
  plan: PlanState;
  isStreaming: boolean;
}

const STATUS_LABELS: Record<PlanItemStatus, string> = {
  pending: "待处理",
  in_progress: "进行中",
  completed: "已完成",
  failed: "失败",
};

function getStatusIcon(status: PlanItemStatus) {
  if (status === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (status === "in_progress") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  }
  if (status === "failed") {
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />;
}

export function ChatPlan({ plan, isStreaming }: ChatPlanProps) {
  const hasStructuredItems = plan.items.length > 0;
  const hasFallbackText = plan.fallbackText.trim().length > 0;
  if (!hasStructuredItems && !hasFallbackText) return null;

  const completedCount = plan.items.filter((item) => item.status === "completed").length;
  const failedCount = plan.items.filter((item) => item.status === "failed").length;
  const activeCount = plan.items.filter((item) => item.status === "in_progress").length;
  const summary = hasStructuredItems
    ? failedCount > 0
      ? `${failedCount} 项失败`
      : activeCount > 0
        ? `${completedCount}/${plan.items.length} 已完成`
        : completedCount === plan.items.length
          ? "已完成"
          : `${plan.items.length - completedCount} 项待处理`
    : isStreaming
      ? "生成中..."
      : "已完成";

  return (
    <div className="flex-shrink-0 border-t border-border/40">
      <details className="group">
        <summary className="flex items-center justify-between px-4 py-1.5 text-[11px] text-muted-foreground/60 cursor-pointer hover:bg-muted/30 transition-colors list-none select-none">
          <div className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90 flex-shrink-0" />
            <span className="truncate">计划</span>
          </div>
          <span className="text-[10px] text-muted-foreground/40 flex-shrink-0">
            {summary}
          </span>
        </summary>
        <div className="px-4 py-2 border-t border-border/20 text-[11px] text-muted-foreground/60">
          {hasStructuredItems ? (
            <ol className="space-y-1.5">
              {plan.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0">{getStatusIcon(item.status)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-foreground/80">{item.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/45">
                      {STATUS_LABELS[item.status]}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="whitespace-pre-wrap break-words">{plan.fallbackText}</div>
          )}
        </div>
      </details>
    </div>
  );
}
