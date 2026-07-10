"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** 对话流中需要独立承载状态或操作的卡片共用外框。 */
export function ChatCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-lg border border-border/70 bg-card/80 text-sm text-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 统一“查看详情”入口及详情弹窗，避免各类对话卡片的尺寸和可访问性漂移。 */
export function ChatCardDetailDialog({
  title,
  description,
  children,
  triggerLabel = "查看详情",
  badge,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  triggerLabel?: string;
  badge?: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {triggerLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[82vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <DialogTitle className="text-base leading-6">{title}</DialogTitle>
            {badge}
          </div>
          {description && (
            <DialogDescription className="text-sm leading-5">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
