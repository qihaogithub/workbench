"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast-provider";
import {
  Plus,
  Lock,
  FileText,
  MoreVertical,
  Trash2,
  Pencil,
  Eye,
  Loader2,
  Lightbulb,
  FolderOpen,
  ChevronDown,
  Brain,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KnowledgeItem, KnowledgeDocDialogMode } from "./KnowledgeDocDialog";

interface KnowledgePanelProps {
  workingDir?: string;
  onDocSelect?: (item: KnowledgeItem, mode: KnowledgeDocDialogMode) => void;
  onDocAdd?: () => void;
  onMemorySelect?: () => void;
}

export function KnowledgePanel({
  workingDir,
  onDocSelect,
  onDocAdd,
  onMemorySelect,
}: KnowledgePanelProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!workingDir) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/knowledge?workingDir=${encodeURIComponent(workingDir)}`
      );
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [workingDir]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = useCallback(
    async (item: KnowledgeItem) => {
      if (!workingDir) return;
      if (!confirm(`确定要删除「${item.title}」吗？`)) return;
      try {
        const res = await fetch(
          `/api/knowledge/${item.id}?workingDir=${encodeURIComponent(workingDir)}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (data.success) {
          toast({ title: "删除成功" });
          fetchItems();
        } else {
          toast({
            title: "删除失败",
            description: data.error?.message,
            variant: "destructive",
          });
        }
      } catch {
        toast({ title: "删除失败", variant: "destructive" });
      }
    },
    [workingDir, toast, fetchItems]
  );

  // 暴露刷新方法给父组件
  const refresh = useCallback(() => {
    fetchItems();
  }, [fetchItems]);

  // 通过 ref 或回调暴露 refresh — 使用自定义事件
  useEffect(() => {
    const handler = () => fetchItems();
    window.addEventListener("knowledge-updated", handler);
    return () => window.removeEventListener("knowledge-updated", handler);
  }, [fetchItems]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-medium">项目知识库</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => onDocAdd?.()}
        >
          <Plus className="h-3.5 w-3.5" />
          添加
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>暂无知识文档</p>
            <p className="text-xs mt-1">点击「添加」创建知识文档</p>
          </div>
        ) : (
          <div className="pb-4">
            {/* memory.md 文件项 */}
            <div
              className="group flex items-center gap-1.5 py-1 px-2 text-sm hover:bg-accent/50 rounded-sm cursor-pointer transition-colors"
              onClick={() => onMemorySelect?.()}
            >
              <Brain className="h-4 w-4 text-purple-500 shrink-0" />
              <span className="truncate text-foreground flex-1">memory.md</span>
              <span className="text-[10px] text-muted-foreground">AI 记忆</span>
              <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Eye className="h-3 w-3 text-muted-foreground" />
                <Pencil className="h-3 w-3 text-blue-400" />
              </span>
            </div>

            {/* knowledge 根文件夹 */}
            <div className="flex items-center gap-1.5 py-1 px-2">
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-sm font-medium text-foreground">
                knowledge
              </span>
              <span className="text-xs text-muted-foreground ml-1">
                ({items.length})
              </span>
            </div>

            {/* 文件列表 - 树形缩进 */}
            <div className="space-y-0">
              {items.map((item) => (
                <KnowledgeFileItem
                  key={item.id}
                  item={item}
                  onSelect={() => onDocSelect?.(item, "read")}
                  onEdit={() => onDocSelect?.(item, "edit")}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>
          </div>
        )}
      </ScrollArea>

      <div className="px-4 py-2 border-t bg-muted/20">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Lightbulb className="h-3 w-3" />
          AI 对话中会自动参考知识库内容
        </p>
      </div>
    </div>
  );
}

/** 知识库文件树中的单个文件项 */
function KnowledgeFileItem({
  item,
  onSelect,
  onEdit,
  onDelete,
}: {
  item: KnowledgeItem;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isSystem = item.source === "system";

  return (
    <div
      className="group flex items-center gap-1.5 py-1 px-2 text-sm hover:bg-accent/50 rounded-sm cursor-pointer transition-colors"
      style={{ paddingLeft: 24 + 8 }}
      onClick={onSelect}
    >
      {isSystem ? (
        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className="truncate text-foreground flex-1">{item.title}</span>
      {isSystem && (
        <Badge
          variant="secondary"
          className="text-[10px] h-4 px-1 shrink-0"
        >
          系统
        </Badge>
      )}
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Eye className="h-3 w-3 text-muted-foreground" />
        {!isSystem && <Pencil className="h-3 w-3 text-blue-400" />}
      </span>
      {!isSystem && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
