"use client";

import { CheckCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex min-w-0 items-center gap-2">
      <Badge
        variant="secondary"
        className="h-7 shrink-0 rounded-md px-2 text-[11px] font-medium"
      >
        {action.count} 项修改
      </Badge>
      <Button
        type="button"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
        disabled={disabled}
        onClick={onPrimary}
      >
        <PrimaryIcon className="h-3.5 w-3.5" />
        {action.label}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
        onClick={onCancel}
      >
        <X className="h-3.5 w-3.5" />
        取消
      </Button>
    </div>
  );
}
