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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

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

// 格式化 JSON
const formatJSON = (data: unknown): string => {
  if (!data) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};

export function Tool({ path, entries, className }: ToolProps) {
  const { icon: ToolIcon, status, label } = getAggregateInfo(entries);
  const [expanded, setExpanded] = useState(false);

  // 提取文件路径
  let resolvedPath = path;
  if (!resolvedPath && entries.length > 0) {
    const firstEntry = entries[0];
    resolvedPath =
      (firstEntry.parameters?.path as string) ||
      (firstEntry.parameters?.file_path as string);
  }

  // 状态图标
  const StatusIcon =
    status === "running" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
    ) : null;

  const statusText =
    status === "running"
      ? "运行中"
      : status === "completed"
        ? "已完成"
        : status === "error"
          ? "错误"
          : "等待";

  return (
    <div
      className={cn(
        "border border-border/40 rounded-lg overflow-hidden",
        className,
      )}
    >
      {/* 工具头部 - 可点击展开 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        {/* 展开/折叠图标 */}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}

        {/* 左侧工具图标 */}
        <span className="text-muted-foreground flex-shrink-0">
          <ToolIcon className="h-4 w-4" />
        </span>

        {/* 工具名称 */}
        <span className="text-sm font-medium flex-shrink-0">
          {entries.length === 1 ? entries[0].name : label}
        </span>

        {/* 文件路径 */}
        {resolvedPath && (
          <span className="text-xs text-muted-foreground/60 truncate flex-1 min-w-0">
            {resolvedPath}
          </span>
        )}

        {/* 右侧状态 */}
        <div className="flex-shrink-0 ml-auto flex items-center gap-2">
          <span
            className={cn(
              "text-xs",
              status === "running" && "text-yellow-600",
              status === "completed" && "text-green-600",
              status === "error" && "text-red-600",
            )}
          >
            {statusText}
          </span>
          {StatusIcon}
        </div>
      </button>

      {/* 工具详情 - 展开时显示 */}
      {expanded && entries.length > 0 && (
        <div className="border-t border-border/40 bg-muted/20">
          {entries.map((entry, index) => (
            <div
              key={index}
              className={cn(
                "px-3 py-2",
                index > 0 && "border-t border-border/40",
              )}
            >
              {/* 入参 */}
              {entry.parameters && Object.keys(entry.parameters).length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] font-medium text-muted-foreground mb-1">
                    入参
                  </div>
                  <pre className="text-xs bg-background/50 rounded-md p-2 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
                    {formatJSON(entry.parameters)}
                  </pre>
                </div>
              )}

              {/* 执行结果 */}
              {entry.result !== undefined && entry.result !== null && (
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground mb-1">
                    结果
                  </div>
                  <pre
                    className={cn(
                      "text-xs bg-background/50 rounded-md p-2 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all",
                      entry.status === "error" && "text-red-600",
                    )}
                  >
                    {formatJSON(entry.result)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 别名导出,方便在 ai-chat 中使用
export const ToolCall = Tool;
