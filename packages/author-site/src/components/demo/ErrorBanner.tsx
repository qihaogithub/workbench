"use client";

import { useState, useMemo, useCallback } from "react";
import type { ValidationError } from "../../../lib/validator";
import { mapToUserFriendly } from "../../../lib/error-mapper";
import type { UserFriendlyError } from "../../../lib/error-mapper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, Wrench } from "lucide-react";

export interface ErrorContext {
  summary: string;
  details: string;
}

interface ErrorBannerProps {
  errors: ValidationError[];
  disabled?: boolean;
  onSendToAI: (context: ErrorContext) => void;
}

export function ErrorBanner({ errors, disabled, onSendToAI }: ErrorBannerProps) {
  const [showDetails, setShowDetails] = useState(false);

  const userFriendly = useMemo<UserFriendlyError>(
    () => mapToUserFriendly(errors),
    [errors],
  );

  const handleSendToAI = useCallback(() => {
    onSendToAI({
      summary: userFriendly.summary,
      details: userFriendly.details,
    });
  }, [userFriendly, onSendToAI]);

  if (errors.length === 0) return null;

  return (
    <div className="shrink-0 border-t bg-yellow-500/5">
      <div className="px-3 py-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
        <span className="flex-1 min-w-0 text-sm text-yellow-800 truncate">
          {userFriendly.summary}
        </span>

        <Button
          size="sm"
          className="h-7 text-xs gap-1.5 shrink-0"
          onClick={handleSendToAI}
          disabled={disabled || !userFriendly.canAutoFix}
        >
          <Wrench className="h-3.5 w-3.5" />
          {disabled ? "请等待 AI 任务完成" : "让 AI 修复"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 shrink-0"
          onClick={() => setShowDetails(!showDetails)}
        >
          <span className="text-xs">详情</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")}
          />
        </Button>
      </div>

      {showDetails && (
        <div className="px-3 pb-2">
          <pre className="p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap max-h-40">
            {userFriendly.details}
          </pre>
        </div>
      )}
    </div>
  );
}
