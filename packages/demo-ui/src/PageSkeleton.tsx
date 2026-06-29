import React from "react";
import { cn } from "./utils";

interface PageSkeletonProps {
  pageName?: string;
  className?: string;
}

export function PageSkeleton({ pageName, className }: PageSkeletonProps) {
  return (
    <div
      className={cn(
        "w-full h-full bg-muted/50 rounded-lg flex items-start justify-start p-2 border border-border/30",
        className,
      )}
    >
      {pageName && (
        <span className="text-xs text-muted-foreground/50 truncate">
          {pageName}
        </span>
      )}
    </div>
  );
}
