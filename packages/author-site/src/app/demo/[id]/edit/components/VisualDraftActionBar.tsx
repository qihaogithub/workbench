"use client";

import { CheckCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VisualDraftActionState } from "../hooks/useVisualEditState";

interface VisualDraftActionBarProps {
  action: VisualDraftActionState;
  disabled?: boolean;
  onPrimary: () => void;
  onCancel: () => void;
}

export function VisualDraftActionBar({
  action,
  disabled = false,
  onPrimary,
  onCancel,
}: VisualDraftActionBarProps) {
  const PrimaryIcon = action.kind === "save" ? CheckCircle : Send;

  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-3 text-xs"
          disabled={disabled}
          onClick={onPrimary}
        >
          <PrimaryIcon className="h-3.5 w-3.5" />
          {action.label}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-3 text-xs"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
          取消
        </Button>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {action.count} 项修改
      </span>
    </div>
  );
}
