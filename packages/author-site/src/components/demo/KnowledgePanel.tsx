"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  ChevronRight,
  ChevronDown,
  Brain,
  Upload,
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
  const [builtinExpanded, setBuiltinExpanded] = useState(true);
  const [userExpanded, setUserExpanded] = useState(true);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const builtinItems = items.filter((item) => item.source === "system");
  const userItems = items.filter((item) => item.source === "user");

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

  // 上传文件处理
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !workingDir) return;

      if (!file.name.endsWith(".md")) {
        toast({
          title: "仅支持 .md 格式文件",
          variant: "destructive",
        });
        return;
      }

      try {
        const content = await file.text();
        const title = file.name.replace(/\.md$/, "");
        const res = await fetch(
          `/api/knowledge?workingDir=${encodeURIComponent(workingDir)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              description: `上传的文档: ${file.name}`,
              content,
            }),
          }
        );
        const data = await res.json();
        if (data.success) {
          toast({ title: "上传成功" });
          fetchItems();
        } else {
          toast({
            title: "上传失败",
            description: data.error?.message,
            variant: "destructive",
          });
        }
      } catch {
        toast({ title: "上传失败", variant: "destructive" });
      }

      // 重置 input 以允许重复上传同一文件
      e.target.value = "";
      setAddMenuOpen(false);
    },
    [workingDir, toast, fetchItems]
  );

  // 监听 knowledge-updated 事件
  useEffect(() => {
    const handler = () => fetchItems();
    window.addEventListener("knowledge-updated", handler);
    return () => window.removeEventListener("knowledge-updated", handler);
  }, [fetchItems]);

  return (
    <div className="flex flex-col h-full">
      {/* AI 记忆横幅 */}
      <div
        className="mx-3 mt-3 px-3 py-2.5 rounded-lg border bg-muted/40 dark:bg-muted/20 border-border/60 cursor-pointer hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors"
        onClick={() => onMemorySelect?.()}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-md bg-muted dark:bg-muted">
            <Brain className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground">AI 记忆</div>
            <div className="text-[11px] text-muted-foreground truncate">
              记录 AI 对项目的理解和偏好
            </div>
          </div>
          <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
      </div>

      {/* 文件树区域 */}
      <ScrollArea className="flex-1 mt-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="pb-4">
            {/* 内置知识库 */}
            <div className="mt-1">
              <div
                className="group flex items-center gap-1.5 py-1.5 px-3 text-sm hover:bg-accent/50 rounded-sm cursor-pointer transition-colors"
                onClick={() => setBuiltinExpanded(!builtinExpanded)}
              >
                {builtinExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="font-medium text-foreground flex-1">
                  内置知识库
                </span>
              </div>
              {builtinExpanded && (
                <div className="space-y-0">
                  {builtinItems.map((item) => (
                    <KnowledgeFileItem
                      key={item.id}
                      item={item}
                      onSelect={() => onDocSelect?.(item, "read")}
                      indent={24}
                    />
                  ))}
                  {builtinItems.length === 0 && (
                    <div className="py-2 px-3 text-xs text-muted-foreground" style={{ paddingLeft: 24 + 12 }}>
                      暂无内置文档
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 项目知识库 */}
            <div className="mt-0.5">
              <div
                className="group flex items-center gap-1.5 py-1.5 px-3 text-sm hover:bg-accent/50 rounded-sm cursor-pointer transition-colors"
                onClick={() => setUserExpanded(!userExpanded)}
              >
                {userExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="font-medium text-foreground flex-1">
                  项目知识库
                </span>
                {/* 添加按钮 */}
                <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    className="w-40 p-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setAddMenuOpen(false);
                        onDocAdd?.();
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      新建文件
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      上传文件
                    </button>
                  </PopoverContent>
                </Popover>
                {/* 隐藏的文件上传 input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              {userExpanded && (
                <div className="space-y-0">
                  {userItems.map((item) => (
                    <KnowledgeFileItem
                      key={item.id}
                      item={item}
                      onSelect={() => onDocSelect?.(item, "read")}
                      onEdit={() => onDocSelect?.(item, "edit")}
                      onDelete={() => handleDelete(item)}
                      indent={24}
                    />
                  ))}
                  {userItems.length === 0 && (
                    <div className="py-2 px-3 text-xs text-muted-foreground" style={{ paddingLeft: 24 + 12 }}>
                      暂无文档，点击 + 添加
                    </div>
                  )}
                </div>
              )}
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
  indent = 24,
}: {
  item: KnowledgeItem;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  indent?: number;
}) {
  const isSystem = item.source === "system";

  return (
    <div
      className="group flex items-center gap-1.5 py-1 px-2 text-sm hover:bg-accent/50 rounded-sm cursor-pointer transition-colors"
      style={{ paddingLeft: indent + 8 }}
      onClick={onSelect}
    >
      {isSystem ? (
        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className="truncate text-foreground flex-1">{item.title}</span>
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Eye className="h-3 w-3 text-muted-foreground" />
        {!isSystem && onEdit && <Pencil className="h-3 w-3 text-blue-400" />}
      </span>
      {!isSystem && onEdit && onDelete && (
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
