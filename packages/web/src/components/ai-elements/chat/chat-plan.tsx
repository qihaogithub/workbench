"use client";

interface ChatPlanProps {
  plan: string;
  isStreaming: boolean;
}

export function ChatPlan({ plan, isStreaming }: ChatPlanProps) {
  if (!plan) return null;

  return (
    <div className="flex-shrink-0 border-t border-border/40">
      <details className="group">
        <summary className="flex items-center justify-between px-4 py-1.5 text-[11px] text-muted-foreground/60 cursor-pointer hover:bg-muted/30 transition-colors list-none select-none">
          <div className="flex items-center gap-1.5">
            <svg
              className="h-3 w-3 transition-transform group-open:rotate-90 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span className="truncate">Plan</span>
          </div>
          <span className="text-[10px] text-muted-foreground/40 flex-shrink-0">
            {isStreaming ? "生成中..." : "已完成"}
          </span>
        </summary>
        <div className="px-4 py-2 border-t border-border/20 text-[11px] text-muted-foreground/60">
          <div className="whitespace-pre-wrap break-words">{plan}</div>
        </div>
      </details>
    </div>
  );
}
