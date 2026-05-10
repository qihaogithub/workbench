"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface TimelineProps {
  children: ReactNode;
  className?: string;
  title?: string;
  defaultExpanded?: boolean;
}

export function Timeline({
  children,
  className,
  title = "处理过程",
  defaultExpanded = false,
}: TimelineProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn("space-y-1", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="font-medium">{title}</span>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {isExpanded && (
        <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

interface TimelineItemProps {
  children: ReactNode;
  className?: string;
  indicator?: ReactNode;
  status?: "running" | "completed" | "error" | "pending";
}

export function TimelineItem({
  children,
  className,
  status = "pending",
}: TimelineItemProps) {
  const statusIcons = {
    running: (
      <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
    ),
    completed: (
      <svg
        className="h-3 w-3 text-muted-foreground/50"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
    error: (
      <svg
        className="h-3 w-3 text-muted-foreground/50"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
    pending: <div className="h-3 w-3 rounded-full bg-muted-foreground/20" />,
  };

  const Icon = statusIcons[status];

  return (
    <div className={cn("flex gap-2 items-start", className)}>
      {/* 图标 */}
      <div className="flex-shrink-0 mt-0.5">{Icon}</div>
      {/* 内容 */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
