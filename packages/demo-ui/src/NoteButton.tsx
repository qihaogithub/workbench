"use client";

import { MessageSquarePlus, StickyNote } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NoteButtonProps {
  hasNote: boolean;
  readonly?: boolean;
  onClick: () => void;
}

export function NoteButton({ hasNote, readonly, onClick }: NoteButtonProps) {
  if (!hasNote && readonly) {
    return null;
  }

  const tooltipText = readonly
    ? "查看备注"
    : hasNote
      ? "编辑备注"
      : "添加备注";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={`inline-flex items-center justify-center shrink-0 rounded-sm transition-colors ${
            hasNote
              ? "text-primary hover:text-primary/80"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          }`}
        >
          {hasNote ? (
            <StickyNote className="h-3.5 w-3.5" />
          ) : (
            <MessageSquarePlus className="h-3.5 w-3.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
