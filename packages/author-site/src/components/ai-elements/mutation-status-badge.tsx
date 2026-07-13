"use client";

import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, Eye } from "lucide-react";

/**
 * MutationStatusBadge (WMA-345)
 *
 * AI Chat 中展示的结构化 mutation/preview 状态徽章。
 * 状态来源于 Authority receipt 和 projection ack，而非模型文本。
 */

/** 来自 WorkspaceMutationReceipt 的结构化数据 */
export interface MutationReceiptInfo {
  mutationId: string;
  committed: boolean;
  revision: number;
}

/** 来自 WorkspaceProjectionAck 的结构化数据 */
export interface ProjectionAckInfo {
  revision: number;
  surface: string;
  status: "applied" | "failed";
}

/**
 * 根据 receipt 和 ack 数据计算的展示状态
 */
export type MutationBadgeStatus =
  | "committed" // receipt.committed === true
  | "preview-pending" // projection ack 尚未到达
  | "preview-applied" // projection ack status === "applied"
  | "preview-failed"; // projection ack status === "failed"

/**
 * 根据结构化数据计算展示状态
 */
export function computeMutationBadgeStatus(
  receipt: MutationReceiptInfo | null,
  ack: ProjectionAckInfo | null,
): MutationBadgeStatus {
  // 无 receipt 说明还没提交
  if (!receipt) return "preview-pending";
  // receipt 存在且 committed
  if (receipt.committed) {
    if (!ack) return "committed";
    if (ack.status === "applied") return "preview-applied";
    if (ack.status === "failed") return "preview-failed";
  }
  return "preview-pending";
}

const STATUS_CONFIG: Record<
  MutationBadgeStatus,
  { label: string; icon: typeof Check; tone: string }
> = {
  committed: {
    label: "修改已提交",
    icon: Check,
    tone: "text-green-600 bg-green-500/10 border-green-500/25",
  },
  "preview-pending": {
    label: "预览更新中",
    icon: Loader2,
    tone: "text-yellow-600 bg-yellow-500/10 border-yellow-500/25",
  },
  "preview-applied": {
    label: "预览已应用",
    icon: Eye,
    tone: "text-blue-600 bg-blue-500/10 border-blue-500/25",
  },
  "preview-failed": {
    label: "预览失败",
    icon: AlertCircle,
    tone: "text-red-600 bg-red-500/10 border-red-500/25",
  },
};

export interface MutationStatusBadgeProps {
  receipt: MutationReceiptInfo | null;
  ack: ProjectionAckInfo | null;
  className?: string;
}

export function MutationStatusBadge({
  receipt,
  ack,
  className,
}: MutationStatusBadgeProps) {
  const status = computeMutationBadgeStatus(receipt, ack);
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const isAnimating = status === "preview-pending";

  return (
    <span
      data-testid="mutation-status-badge"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        config.tone,
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", isAnimating && "animate-spin")} />
      {config.label}
    </span>
  );
}
