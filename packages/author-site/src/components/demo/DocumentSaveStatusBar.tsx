"use client";

import {
  AlertTriangle,
  Check,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDocumentSaveStatusLabel,
  isDocumentSaveAttentionStatus,
  type DocumentSaveSnapshot,
} from "@/lib/document-save-coordinator";
import { cn } from "@/lib/utils";

interface DocumentSaveStatusBarProps {
  snapshot: DocumentSaveSnapshot;
  onRetry?: () => void;
  onRestoreDraft?: () => void;
  onDiscardDraft?: () => void;
  testId?: string;
}

/**
 * 文档保存状态的统一展示。这里不负责触发自动重试，失败后必须由用户
 * 明确点击重试，避免 Authority 异常时产生无界请求并覆盖本地草稿。
 */
export function DocumentSaveStatusBar({
  snapshot,
  onRetry,
  onRestoreDraft,
  onDiscardDraft,
  testId,
}: DocumentSaveStatusBarProps) {
  if (!isDocumentSaveAttentionStatus(snapshot.status)) return null;

  const isError = isDocumentSaveAttentionStatus(snapshot.status);
  const canRetry =
    isError &&
    snapshot.status !== "permission-denied" &&
    snapshot.status !== "conflict" &&
    Boolean(onRetry);
  const canRestore =
    snapshot.status === "conflict" && snapshot.hasLocalDraft && Boolean(onRestoreDraft);
  const canDiscard =
    isError && snapshot.hasLocalDraft && Boolean(onDiscardDraft);

  return (
    <div
      aria-live="polite"
      data-testid={testId ?? "document-save-status"}
      className={cn(
        "flex min-h-9 shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs",
        isError
          ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
          : snapshot.status === "saved"
            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
            : "border-border bg-muted/20 text-muted-foreground",
      )}
    >
      {isError ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      ) : snapshot.status === "saving" ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <Check className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {snapshot.error?.message ?? getDocumentSaveStatusLabel(snapshot.status)}
      </span>
      {snapshot.hasLocalDraft && !snapshot.error && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          已保留本地草稿
        </span>
      )}
      {canRetry && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onRetry}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          重试保存
        </Button>
      )}
      {canRestore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onRestoreDraft}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          恢复本地草稿
        </Button>
      )}
      {canDiscard && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs text-amber-100 hover:text-amber-50"
          onClick={onDiscardDraft}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          放弃本地草稿
        </Button>
      )}
    </div>
  );
}
