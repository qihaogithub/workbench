"use client";

import { useState, useMemo, useCallback } from "react";
import type { ValidationError } from "../../../lib/validator";
import { mapToUserFriendly } from "../../../lib/error-mapper";
import type { UserFriendlyError } from "../../../lib/error-mapper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, X, Wrench } from "lucide-react";

export interface ErrorContext {
  summary: string;
  details: string;
  code: string;
  schema: string;
}

interface ErrorBannerProps {
  errors: ValidationError[];
  code: string;
  schema: string;
  disabled?: boolean;
  onSendToAI: (context: ErrorContext) => void;
  onDismiss?: () => void;
}

function SeverityBadge({ errors }: { errors: ValidationError[] }) {
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warningCount = errors.filter((e) => e.severity === "warning").length;
  const infoCount = errors.filter((e) => e.severity === "info").length;

  return (
    <span className="inline-flex items-center gap-1.5">
      {errorCount > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive">
          {errorCount} 错误
        </span>
      )}
      {warningCount > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-700">
          {warningCount} 警告
        </span>
      )}
      {infoCount > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-700">
          {infoCount} 提示
        </span>
      )}
    </span>
  );
}

export function ErrorBanner({ errors, code, schema, disabled, onSendToAI, onDismiss }: ErrorBannerProps) {
  const [showDetails, setShowDetails] = useState(false);

  const userFriendly = useMemo<UserFriendlyError>(
    () => mapToUserFriendly(errors),
    [errors],
  );

  const handleSendToAI = useCallback(() => {
    onSendToAI({
      summary: userFriendly.summary,
      details: userFriendly.details,
      code,
      schema,
    });
  }, [userFriendly, code, schema, onSendToAI]);

  if (errors.length === 0) return null;

  return (
    <div className={cn("border-b bg-yellow-500/5")}>
      <div className="px-4 py-2.5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-yellow-800">{userFriendly.summary}</span>
              <SeverityBadge errors={errors} />
            </div>

            {showDetails && (
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap max-h-48">
                {userFriendly.details}
              </pre>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleSendToAI}
              disabled={disabled || !userFriendly.canAutoFix}
            >
              <Wrench className="h-3.5 w-3.5" />
              {disabled ? "请等待 AI 任务完成" : "让 AI 修复"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={() => setShowDetails(!showDetails)}
            >
              <span className="text-xs text-muted-foreground mr-1">详情</span>
              <ChevronDown
                className={cn("h-3 w-3 text-muted-foreground transition-transform", showDetails && "rotate-180")}
              />
            </Button>

            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onDismiss}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
