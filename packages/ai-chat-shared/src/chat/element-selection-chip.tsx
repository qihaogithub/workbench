"use client";

import { X, MousePointer2 } from "lucide-react";
import { cn } from "../lib/utils";

export interface ChatElementRef {
  id: string;
  label: string;
  context: string;
}

interface ElementSelectionChipProps {
  element: ChatElementRef;
  onRemove: () => void;
  className?: string;
}

export function ElementSelectionChip({
  element,
  onRemove,
  className,
}: ElementSelectionChipProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-50 px-2.5 py-1 text-xs dark:border-blue-400/30 dark:bg-blue-950",
        className,
      )}
    >
      <MousePointer2 className="h-3 w-3 shrink-0 text-blue-500 dark:text-blue-400" />
      <span className="max-w-[120px] truncate font-medium text-blue-700 dark:text-blue-300">
        {element.label}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 shrink-0 rounded-full p-0.5 text-blue-500 hover:bg-blue-200 dark:text-blue-400 dark:hover:bg-blue-800"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
