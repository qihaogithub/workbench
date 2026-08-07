"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
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
  History,
  ScrollText,
  BookOpen,
  Check,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KnowledgeItem, KnowledgeDocDialogMode } from "./KnowledgeDocDialog";

interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExtracted: boolean;
  textPreview?: string;
  createdAt?: string;
}

interface KnowledgePanelProps {
  workingDir?: string;
  projectId?: string;
  sessionId?: string;
  onDocSelect?: (item: KnowledgeItem, mode: KnowledgeDocDialogMode) => void;
  onDocAdd?: () => void;
  onDocCreated?: (item: KnowledgeItem) => void;
  onDocHistory?: (item: KnowledgeItem) => void;
  onMemorySelect?: () => void;
  onConventionSelect?: () => void;
  onItemsChange?: (items: KnowledgeItem[]) => void;
  onChatFileSelect?: (attachment: ChatAttachment) => void;
}

export function KnowledgePanel({
  workingDir,
  projectId,
  sessionId,
  onDocSelect,
  onDocAdd,
  onDocCreated,
  onDocHistory,
  onMemorySelect,
  onConventionSelect,
  onItemsChange,
  onChatFileSelect,
}: KnowledgePanelProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userExpanded, setUserExpanded] = useState(true);
  const [chatFiles, setChatFiles] = useState<ChatAttachment[]>([]);
  const [chatFilesLoading, setChatFilesLoading] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 批量删除状态（知识库 / 对话文件）
  const [kbBatchMode, setKbBatchMode] = useState(false);
  const [kbSelected, setKbSelected] = useState<Set<string>>(new Set());
  const [chatBatchMode, setChatBatchMode] = useState(false);
  const [chatSelected, setChatSelected] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const userItems = items.filter((item) => item.source !== "system");

  const fetchItems = useCallback(async () => {
    if (!workingDir) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ workingDir });
      if (projectId) params.set("projectId", projectId);
      if (sessionId) params.set("sessionId", sessionId);
      const res = await fetch(
        `/api/knowledge?${params.toString()}`
      );
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
        onItemsChange?.(data.data);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [workingDir, projectId, sessionId, onItemsChange]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const fetchChatFiles = useCallback(async () => {
    if (!sessionId) return;
    setChatFilesLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/attachments`);
      const data = await res.json();
      if (data.success) {
        setChatFiles(data.data || []);
      }
    } catch {
      // 静默失败
    } finally {
      setChatFilesLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchChatFiles();
  }, [fetchChatFiles]);

  // 聊天文件更新后自动刷新
  useEffect(() => {
    const handler = () => {
      fetchChatFiles();
      fetchItems();
    };
    window.addEventListener("chat-attachments-updated", handler);
    return () => window.removeEventListener("chat-attachments-updated", handler);
  }, [fetchChatFiles, fetchItems]);

  const handleConvertToKnowledge = useCallback(
    async (file: ChatAttachment) => {
      if (!workingDir || !sessionId) return;
      if (
        !confirm(
          `将「${file.name}」转为知识库文件？转为知识库后将删除原聊天附件。`,
        )
      )
        return;
      try {
        const contentRes = await fetch(
          `/api/sessions/${sessionId}/attachments?id=${encodeURIComponent(file.id)}`,
        );
        const contentData = await contentRes.json();
        if (!contentData.success) {
          toast({
            title: "转换失败",
            description: contentData.error?.message,
            variant: "destructive",
          });
          return;
        }
        const title = file.name.replace(/\.(md|markdown|txt|text|json|csv)$/i, "");
        const params = new URLSearchParams({ workingDir });
        if (projectId) params.set("projectId", projectId);
        if (sessionId) params.set("sessionId", sessionId);
        const createRes = await fetch(
          `/api/knowledge?${params.toString()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title || file.name,
              description: `从聊天附件转换: ${file.name}`,
              content: contentData.data.text || "",
            }),
          },
        );
        const createData = await createRes.json();
        if (!createData.success) {
          toast({
            title: "转换失败",
            description: createData.error?.message,
            variant: "destructive",
          });
          return;
        }
        await fetch(
          `/api/sessions/${sessionId}/attachments?id=${encodeURIComponent(file.id)}`,
          { method: "DELETE" },
        );
        toast({ title: "已转为知识库文件" });
        onDocCreated?.(createData.data);
        fetchItems();
        fetchChatFiles();
        window.dispatchEvent(new Event("chat-attachments-updated"));
      } catch {
        toast({ title: "转换失败", variant: "destructive" });
      }
    },
    [workingDir, projectId, sessionId, toast, onDocCreated, fetchItems, fetchChatFiles],
  );

  const handleDeleteChatFile = useCallback(
    async (file: ChatAttachment) => {
      if (!sessionId) return;
      if (!confirm(`确定要删除聊天附件「${file.name}」吗？`)) return;
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/attachments?id=${encodeURIComponent(file.id)}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (data.success) {
          toast({ title: "删除成功" });
          fetchChatFiles();
          window.dispatchEvent(new Event("chat-attachments-updated"));
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
    [sessionId, toast, fetchChatFiles],
  );

  const handleDelete = useCallback(
    async (item: KnowledgeItem) => {
      if (!workingDir) return;
      if (!confirm(`确定要删除「${item.title}」吗？`)) return;
      try {
        const params = new URLSearchParams({ workingDir });
        if (projectId) params.set("projectId", projectId);
        if (sessionId) params.set("sessionId", sessionId);
        const res = await fetch(
          `/api/knowledge/${item.id}?${params.toString()}`,
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
    [workingDir, projectId, sessionId, toast, fetchItems]
  );

  // 知识库批量删除
  const handleKbBatchDelete = useCallback(async () => {
    if (kbSelected.size === 0) return;
    if (!confirm(`确定要删除选中的 ${kbSelected.size} 个知识库文档吗？`)) return;
    setBatchDeleting(true);
    try {
      const params = new URLSearchParams({ workingDir: workingDir || "" });
      if (projectId) params.set("projectId", projectId);
      if (sessionId) params.set("sessionId", sessionId);
      let success = true;
      for (const id of Array.from(kbSelected)) {
        const res = await fetch(`/api/knowledge/${id}?${params.toString()}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!data.success) success = false;
      }
      if (success) {
        toast({ title: "批量删除成功" });
      } else {
        toast({ title: "部分删除失败", variant: "destructive" });
      }
      setKbSelected(new Set());
      setKbBatchMode(false);
      fetchItems();
      window.dispatchEvent(new Event("knowledge-updated"));
    } catch {
      toast({ title: "批量删除失败", variant: "destructive" });
      setKbBatchMode(false);
      setKbSelected(new Set());
    } finally {
      setBatchDeleting(false);
    }
  }, [workingDir, projectId, sessionId, kbSelected, toast, fetchItems]);

  // 对话文件批量删除
  const handleChatBatchDelete = useCallback(async () => {
    if (!sessionId || chatSelected.size === 0) return;
    if (!confirm(`确定要删除选中的 ${chatSelected.size} 个对话文件吗？`)) return;
    setBatchDeleting(true);
    try {
      const ids = Array.from(chatSelected)
        .map((id) => encodeURIComponent(id))
        .join(",");
      const res = await fetch(
        `/api/sessions/${sessionId}/attachments?ids=${ids}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.success) {
        toast({ title: "批量删除成功" });
      } else {
        toast({
          title: "删除失败",
          description: data.error?.message,
          variant: "destructive",
        });
      }
      setChatSelected(new Set());
      setChatBatchMode(false);
      fetchChatFiles();
      window.dispatchEvent(new Event("chat-attachments-updated"));
    } catch {
      toast({ title: "批量删除失败", variant: "destructive" });
      setChatBatchMode(false);
      setChatSelected(new Set());
    } finally {
      setBatchDeleting(false);
    }
  }, [sessionId, chatSelected, toast, fetchChatFiles]);

  const toggleKbSelected = useCallback((id: string) => {
    setKbSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleChatSelected = useCallback((id: string) => {
    setChatSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitBatchMode = useCallback(() => {
    setKbBatchMode(false);
    setKbSelected(new Set());
    setChatBatchMode(false);
    setChatSelected(new Set());
  }, []);

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
        const params = new URLSearchParams({ workingDir });
        if (projectId) params.set("projectId", projectId);
        if (sessionId) params.set("sessionId", sessionId);
        const res = await fetch(
          `/api/knowledge?${params.toString()}`,
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
          onDocCreated?.(data.data);
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
    [workingDir, projectId, sessionId, toast, fetchItems, onDocCreated]
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

      {/* 项目公约横幅 */}
      <div
        className="mx-3 mt-2 px-3 py-2.5 rounded-lg border bg-muted/40 dark:bg-muted/20 border-border/60 cursor-pointer hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors"
        onClick={() => onConventionSelect?.()}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-md bg-muted dark:bg-muted">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground">项目公约</div>
            <div className="text-[11px] text-muted-foreground truncate">
              定义项目必须遵守的约定
            </div>
          </div>
          <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
      </div>

      {/* 文件树区域 */}
      <div className="flex-1 mt-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="pb-4">
            {/* 项目知识库 */}
            <div className="mt-1">
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
                {/* 更多按钮（新建/上传/批量删除） */}
                <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
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
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setKbSelected(new Set());
                        setChatSelected(new Set());
                        setChatBatchMode(false);
                        setKbBatchMode(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      批量删除
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
                      batchMode={kbBatchMode}
                      selected={kbSelected.has(item.id)}
                      onToggleSelect={() => toggleKbSelected(item.id)}
                      onSelect={() => onDocSelect?.(item, "read")}
                      onEdit={() => onDocSelect?.(item, "edit")}
                      onHistory={() => onDocHistory?.(item)}
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

            {/* 对话文件 */}
            <div className="mt-1">
              <div
                className="group flex items-center gap-1.5 py-1.5 px-3 text-sm hover:bg-accent/50 rounded-sm cursor-pointer transition-colors"
                onClick={() => setChatExpanded(!chatExpanded)}
              >
                {chatExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <FolderOpen className="h-4 w-4 text-purple-500 shrink-0" />
                <span className="font-medium text-foreground flex-1">
                  对话文件
                </span>
                {!chatBatchMode && chatFiles.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {chatFiles.length}
                  </span>
                )}
                {/* 更多按钮（批量删除） */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
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
                        setChatSelected(new Set());
                        setKbBatchMode(false);
                        setKbSelected(new Set());
                        setChatBatchMode(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      批量删除
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
              {chatExpanded && (
                <div className="space-y-0">
                  {chatFilesLoading ? (
                    <div className="py-2 px-3 text-xs text-muted-foreground" style={{ paddingLeft: 24 + 12 }}>
                      加载中...
                    </div>
                  ) : chatFiles.length === 0 ? (
                    <div className="py-2 px-3 text-xs text-muted-foreground" style={{ paddingLeft: 24 + 12 }}>
                      暂无对话文件
                    </div>
                  ) : (
                    chatFiles.map((file) => (
                      <ChatFileItem
                        key={file.id}
                        file={file}
                        sessionId={sessionId}
                        batchMode={chatBatchMode}
                        selected={chatSelected.has(file.id)}
                        onToggleSelect={() => toggleChatSelected(file.id)}
                        onView={() => onChatFileSelect?.(file)}
                        onConvert={() => handleConvertToKnowledge(file)}
                        onDelete={() => handleDeleteChatFile(file)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 吸底批量操作栏 */}
      {(kbBatchMode || chatBatchMode) && (
        <div className="px-3 py-2 border-t bg-background/95 backdrop-blur flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex-1">
            已选 {kbSelected.size + chatSelected.size}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={exitBatchMode}
            disabled={batchDeleting}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={batchDeleting || kbSelected.size + chatSelected.size === 0}
            onClick={() => {
              if (kbBatchMode) handleKbBatchDelete();
              else handleChatBatchDelete();
            }}
          >
            {batchDeleting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1" />
            )}
            删除
          </Button>
        </div>
      )}

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
  onHistory,
  onDelete,
  batchMode = false,
  selected = false,
  onToggleSelect,
  indent = 24,
}: {
  item: KnowledgeItem;
  onSelect: () => void;
  onEdit?: () => void;
  onHistory?: () => void;
  onDelete?: () => void;
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  indent?: number;
}) {
  return (
    <div
      className="group flex items-center gap-1.5 py-1 px-2 text-sm hover:bg-accent/50 rounded-sm cursor-pointer transition-colors"
      style={{ paddingLeft: indent + 8 }}
      onClick={batchMode ? onToggleSelect : onSelect}
    >
      {batchMode ? (
        <button
          type="button"
          className={`flex items-center justify-center h-4 w-4 rounded border shrink-0 ${
            selected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/40"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className="truncate text-foreground flex-1">{item.title}</span>
      {!batchMode && (
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Eye className="h-3 w-3 text-muted-foreground" />
          {onEdit && <Pencil className="h-3 w-3 text-blue-400" />}
        </span>
      )}
      {!batchMode && onEdit && onDelete && (
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
            {onHistory && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onHistory();
                }}
              >
                <History className="h-3.5 w-3.5 mr-2" />
                历史
              </DropdownMenuItem>
            )}
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

/** 对话文件列表中的单个聊天附件项 */
function ChatFileItem({
  file,
  sessionId,
  onView,
  onConvert,
  onDelete,
  batchMode = false,
  selected = false,
  onToggleSelect,
}: {
  file: ChatAttachment;
  sessionId?: string;
  onView: () => void;
  onConvert: () => void;
  onDelete: () => void;
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const isImage = file.mimeType?.startsWith("image/");
  const imgUrl = sessionId
    ? `/api/sessions/${sessionId}/attachments?id=${encodeURIComponent(file.id)}&raw=1`
    : "";
  return (
    <div
      className="group flex items-center gap-1.5 py-1 px-2 text-sm hover:bg-accent/50 rounded-sm cursor-pointer transition-colors"
      style={{ paddingLeft: 24 + 8 }}
      onClick={batchMode ? onToggleSelect : onView}
    >
      {batchMode ? (
        <button
          type="button"
          className={`flex items-center justify-center h-4 w-4 rounded border shrink-0 ${
            selected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/40"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>
      ) : isImage ? (
        <img
          src={imgUrl}
          alt={file.name}
          className="h-6 w-6 rounded object-cover shrink-0"
        />
      ) : (
        <FileText className="h-4 w-4 text-purple-500 shrink-0" />
      )}
      <span className="truncate text-foreground flex-1">{file.name}</span>
      {file.size ? (
        <span className="text-[10px] text-muted-foreground shrink-0">
          {(file.size / 1024).toFixed(1)}KB
        </span>
      ) : null}
      {!batchMode && (
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
                onView();
              }}
            >
              <Eye className="h-3.5 w-3.5 mr-2" />
              查看
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onConvert();
              }}
            >
              <BookOpen className="h-3.5 w-3.5 mr-2" />
              转为知识库
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
