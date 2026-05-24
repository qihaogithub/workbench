"use client";

import { useState } from "react";
import type { ValidationError } from "../../../lib/validator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  ChevronDown,
  X,
} from "lucide-react";

interface ValidationPanelProps {
  errors: ValidationError[];
  onDismiss?: () => void;
}

function ValidationItem({ error }: { error: ValidationError }) {
  const [showFix, setShowFix] = useState(false);

  const severityConfig = {
    error: {
      icon: AlertCircle,
      iconClass: "text-destructive",
      borderClass: "border-l-destructive",
      bgClass: "bg-destructive/5",
    },
    warning: {
      icon: AlertTriangle,
      iconClass: "text-yellow-500",
      borderClass: "border-l-yellow-500",
      bgClass: "bg-yellow-500/5",
    },
    info: {
      icon: Info,
      iconClass: "text-blue-500",
      borderClass: "border-l-blue-500",
      bgClass: "bg-blue-500/5",
    },
  };

  const config = severityConfig[error.severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "p-3 border-l-2 border-b last:border-b-0",
        config.borderClass,
        config.bgClass,
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.iconClass)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{error.message}</div>

          {error.location && (
            <div className="text-xs text-muted-foreground mt-1">
              位置: {error.location.type === "code" ? "代码" : "Schema"}
              {error.location.line && ` 第 ${error.location.line} 行`}
              {error.location.column && ` 第 ${error.location.column} 列`}
            </div>
          )}

          {error.field && (
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">
              {error.field.path || error.field.name}
            </code>
          )}

          {error.fixSuggestion && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowFix(!showFix)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Lightbulb className="h-3 w-3" />
                修复建议
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showFix && "rotate-180",
                  )}
                />
              </button>
              {showFix && (
                <div className="mt-1.5 p-2 bg-muted rounded text-xs space-y-1">
                  <div>{error.fixSuggestion.description}</div>
                  {error.fixSuggestion.example && (
                    <pre className="p-2 bg-background rounded overflow-x-auto whitespace-pre-wrap">
                      {error.fixSuggestion.example}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ValidationPanel({ errors, onDismiss }: ValidationPanelProps) {
  const errorItems = errors.filter((e) => e.severity === "error");
  const warningItems = errors.filter((e) => e.severity === "warning");
  const infoItems = errors.filter((e) => e.severity === "info");

  if (errors.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">验证结果</span>
          {errorItems.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {errorItems.length} 错误
            </Badge>
          )}
          {warningItems.length > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 bg-yellow-500/15 text-yellow-700 border-yellow-500/25"
            >
              {warningItems.length} 警告
            </Badge>
          )}
          {infoItems.length > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 bg-blue-500/15 text-blue-700 border-blue-500/25"
            >
              {infoItems.length} 提示
            </Badge>
          )}
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onDismiss}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <ScrollArea className="max-h-[240px]">
        {errorItems.map((error, i) => (
          <ValidationItem key={`e-${i}`} error={error} />
        ))}
        {warningItems.map((error, i) => (
          <ValidationItem key={`w-${i}`} error={error} />
        ))}
        {infoItems.map((error, i) => (
          <ValidationItem key={`i-${i}`} error={error} />
        ))}
      </ScrollArea>
    </div>
  );
}
