"use client";

import { cn } from "@/lib/utils";
import {
  FileText,
  Terminal,
  Edit3,
  FolderOpen,
  Search,
  Code,
  Loader2,
} from "lucide-react";

export interface ToolEntry {
  name: string;
  kind?: "read" | "edit" | "execute";
  status: "running" | "completed" | "error" | "awaiting-approval";
  parameters?: Record<string, unknown>;
  result?: unknown;
}

interface ToolProps {
  /** 文件路径（用于合并显示） */
  path?: string;
  /** 工具条目列表（合并后的） */
  entries: ToolEntry[];
  className?: string;
}

// 获取工具图标
const getToolIcon = (kind?: string) => {
  if (kind === "read") return FileText;
  if (kind === "edit") return Edit3;
  if (kind === "execute") return Terminal;
  return Code;
};

// 根据条目确定整体状态和图标
const getAggregateInfo = (entries: ToolEntry[]) => {
  if (entries.length === 0)
    return { icon: FileText, status: "completed" as const, label: "未知" };

  const hasRunning = entries.some((e) => e.status === "running");
  const hasError = entries.some((e) => e.status === "error");

  // 优先显示编辑图标（写操作），其次读取
  const mainKind =
    entries.find((e) => e.kind === "edit")?.kind || entries[0].kind;
  const icon = getToolIcon(mainKind);

  // 状态优先级：running > error > completed
  let status: "running" | "completed" | "error" = "completed";
  if (hasRunning) status = "running";
  else if (hasError) status = "error";

  // 标签
  const label =
    mainKind === "read"
      ? "读取文件"
      : mainKind === "edit"
        ? "写入文件"
        : "执行命令";

  return { icon, status, label };
};

export function Tool({ path, entries, className }: ToolProps) {
  const { icon: ToolIcon, status } = getAggregateInfo(entries);

  // 提取文件路径（优先使用传入的 path，其次从 entries 的 parameters 或 name 中提取）
  let resolvedPath = path;
  if (!resolvedPath && entries.length > 0) {
    const firstEntry = entries[0];
    resolvedPath =
      (firstEntry.parameters?.path as string) ||
      (firstEntry.parameters?.file_path as string);

    // 如果还是没有，尝试从 name 中提取（格式: "fs/read_text_file › path/to/file"）
    if (!resolvedPath && firstEntry.name.includes("›")) {
      resolvedPath = firstEntry.name.split("›").pop()?.trim();
    }
  }

  // 提取文件名
  const fileName = resolvedPath
    ? resolvedPath.split(/[\/\\]/).pop() || resolvedPath
    : undefined;

  // 状态图标
  const StatusIcon =
    status === "running" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
    ) : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-md text-xs",
        className,
      )}
    >
      {/* 左侧图标 */}
      <span className="text-muted-foreground flex-shrink-0">
        <ToolIcon className="h-4 w-4" />
      </span>

      {/* 文件名 */}
      {fileName ? (
        <span className="text-muted-foreground flex-shrink-0">{fileName}</span>
      ) : (
        <span className="text-muted-foreground/60 flex-shrink-0">未知文件</span>
      )}

      {/* 完整路径（小字） */}
      {resolvedPath && (
        <span className="text-muted-foreground/40 truncate text-[11px] flex-1 min-w-0">
          {resolvedPath}
        </span>
      )}

      {/* 右侧状态 */}
      <div className="flex-shrink-0 ml-auto flex items-center gap-2">
        <span className="text-muted-foreground">
          {status === "running"
            ? "运行中"
            : status === "completed"
              ? "已完成"
              : status === "error"
                ? "错误"
                : "等待"}
        </span>
        {StatusIcon}
      </div>
    </div>
  );
}

// 别名导出,方便在 ai-chat 中使用
export const ToolCall = Tool;
