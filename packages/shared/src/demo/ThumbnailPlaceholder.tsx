import React from "react";
import { cn } from "./utils";

interface ThumbnailPlaceholderProps {
  pageName?: string;
  className?: string;
}

export function ThumbnailPlaceholder({ pageName, className }: ThumbnailPlaceholderProps) {
  return (
    <div
      className={cn(
        "w-full h-full bg-muted rounded-lg flex flex-col items-center justify-center border border-border/50 gap-2",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-1">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted-foreground/40"
        >
          <rect x="2" y="2" width="20" height="20" rx="3" />
          <path d="M2 8h20" />
          <path d="M8 2v6" />
        </svg>
        {pageName && (
          <span className="text-xs text-muted-foreground/60 truncate max-w-[80%]">
            {pageName}
          </span>
        )}
      </div>
    </div>
  );
}
