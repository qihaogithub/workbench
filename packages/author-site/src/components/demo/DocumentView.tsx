"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import {
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  ScrollText,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentEditor } from "@workbench/demo-ui";
import type { KnowledgeItem } from "./KnowledgeDocDialog";
import { cn } from "@/lib/utils";

interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExtracted: boolean;
  textPreview?: string;
  createdAt?: string;
}

export interface PageItem {
  id: string;
  name: string;
}

/** 右侧编辑区当前打开的目标：知识库文档 / AI 记忆 / 项目公约 / 页面公约 */
type ActiveTarget =
  | { kind: "knowledge"; item: KnowledgeItem }
  | { kind: "memory" }
  | { kind: "convention" }
  | { kind: "pageConvention"; page: PageItem };

/** 解析 workspace files 接口中的路径（memory/convention/pageConvention） */
function resolveWorkspaceFilePath(target: ActiveTarget): string | null {
  if (target.kind === "memory") return "memory.md";
  if (target.kind === "convention") return "convention.md";
  if (target.kind === "pageConvention") return `demos/${target.page.id}/convention.md`;
  return null;
}

export interface DocumentViewProps {
  workingDir?: string;
  projectId?: string;
  sessionId?: string;
  pages?: PageItem[];
  onItemsChange?: (items: KnowledgeItem[]) => void;
  onItemsLoaded?: (items: KnowledgeItem[]) => void;
  onDocHistory?: (item: KnowledgeItem) => void;
  onAddRequest?: () => void;
  onChatFileSelect?: (file: ChatAttachment) => void;
  onChatFileConvert?: (file: ChatAttachment) => void;
  onChatFileDelete?: (file: ChatAttachment) => void;
  onDocDeleted?: (item: KnowledgeItem) => void;
}

export function DocumentView({
  workingDir,
  projectId,
  sessionId,
  pages = [],
  onItemsChange,
  onItemsLoaded,
  onDocHistory,
  onAddRequest,
  onChatFileSelect,
  onChatFileConvert,
  onChatFileDelete,
  onDocDeleted,
}: DocumentViewProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null);
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [userExpanded, setUserExpanded] = useState(true);
  const [conventionExpanded, setConventionExpanded] = useState(true);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [chatFiles, setChatFiles] = useState<ChatAttachment[]>([]);
  const [chatFilesLoading, setChatFilesLoading] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(true);
  const contentRef = useRef(content);
  contentRef.current = content;

  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;
  const onItemsLoadedRef = useRef(onItemsLoaded);
  onItemsLoadedRef.current = onItemsLoaded;

  const userItems = useMemo(
    () => items.filter((item) => item.source !== "system"),
    [items],
  );

  const fetchItems = useCallback(async () => {
    if (!workingDir) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ workingDir });
      if (projectId) params.set("projectId", projectId);
      if (sessionId) params.set("sessionId", sessionId);
      const res = await fetch(`/api/knowledge?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
        onItemsChangeRef.current?.(data.data);
        onItemsLoadedRef.current?.(data.data);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [workingDir, projectId, sessionId]);

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
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetchChatFiles();
  }, [fetchChatFiles]);

  useEffect(() => {
    const handler = () => {
      fetchItems();
      fetchChatFiles();
    };
    window.addEventListener("knowledge-updated", handler);
    window.addEventListener("chat-attachments-updated", handler);
    return () => {
      window.removeEventListener("knowledge-updated", handler);
      window.removeEventListener("chat-attachments-updated", handler);
    };
  }, [fetchItems, fetchChatFiles]);

  // 默认选中第一个用户文档
  useEffect(() => {
    if (!activeTarget && userItems.length > 0 && !loading) {
      setActiveTarget({ kind: "knowledge", item: userItems[0] });
    }
  }, [activeTarget, userItems, loading]);

  // 加载当前目标内容
  useEffect(() => {
    if (!activeTarget) {
      setContent("");
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    setDirty(false);

    const load = async () => {
      try {
        let text = "";
        if (activeTarget.kind === "knowledge") {
          if (!workingDir) return;
          const res = await fetch(
            `/api/knowledge/content?workingDir=${encodeURIComponent(
              workingDir,
            )}&fileName=${encodeURIComponent(activeTarget.item.fileName)}`,
          );
          const data = await res.json();
          if (data.success) text = data.data.content || "";
        } else {
          if (!sessionId) return;
          const filePath = resolveWorkspaceFilePath(activeTarget);
          if (!filePath) return;
          const res = await fetch(
            `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
          );
          const data = await res.json();
          if (data.success) text = data.data.content || "";
        }
        if (!cancelled) setContent(text);
      } catch {
        if (!cancelled) setContent("");
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeTarget, workingDir, sessionId]);

  const handleSave = useCallback(async () => {
    if (!activeTarget) return;
    setSaving(true);
    try {
      if (activeTarget.kind === "knowledge") {
        if (!workingDir) return;
        const params = new URLSearchParams({ workingDir });
        if (projectId) params.set("projectId", projectId);
        if (sessionId) params.set("sessionId", sessionId);
        const res = await fetch(
          `/api/knowledge/${activeTarget.item.id}?${params.toString()}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: contentRef.current }),
          },
        );
        const data = await res.json();
        if (data.success) {
          setDirty(false);
          toast({ title: "保存成功" });
          onItemsChange?.(data.data ? [data.data] : []);
          window.dispatchEvent(new Event("knowledge-updated"));
          return;
        }
        throw new Error(data.error?.message || "保存失败");
      } else {
        if (!sessionId) return;
        const filePath = resolveWorkspaceFilePath(activeTarget);
        if (!filePath) return;
        const res = await fetch(
          `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: contentRef.current }),
          },
        );
        const data = await res.json();
        if (data.success) {
          setDirty(false);
          toast({ title: "保存成功" });
          return;
        }
        throw new Error(data.error?.message || "保存失败");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      toast({ title: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [activeTarget, workingDir, projectId, sessionId, toast, onItemsChange]);

  const handleCreate = useCallback(() => {
    onAddRequest?.();
  }, [onAddRequest]);

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
          { method: "DELETE" },
        );
        const data = await res.json();
        if (data.success) {
          toast({ title: "删除成功" });
          if (
            activeTarget?.kind === "knowledge" &&
            activeTarget.item.id === item.id
          ) {
            setActiveTarget(null);
          }
          onDocDeleted?.(item);
          fetchItems();
          window.dispatchEvent(new Event("knowledge-updated"));
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
    [workingDir, projectId, sessionId, activeTarget, toast, onDocDeleted, fetchItems],
  );

  const isActive = (target: ActiveTarget) =>
    activeTarget?.kind === target.kind &&
    (target.kind !== "knowledge" ||
      (activeTarget.kind === "knowledge" &&
        activeTarget.item.id === target.item.id));

  const headerTitle = activeTarget
    ? activeTarget.kind === "memory"
      ? "AI 记忆"
      : activeTarget.kind === "convention"
        ? "项目公约"
        : activeTarget.kind === "pageConvention"
          ? `${activeTarget.page.name} 公约`
          : activeTarget.item.title
    : "未选择文档";

  const headerSub = activeTarget
    ? activeTarget.kind === "knowledge"
      ? activeTarget.item.updatedAt
        ? `更新于 ${new Date(activeTarget.item.updatedAt).toLocaleString()}`
        : "Markdown 文档"
      : activeTarget.kind === "pageConvention"
        ? `页面公约 · ${activeTarget.page.name}`
        : "Markdown 文档"
    : "从左侧目录选择文档";

  return (
    <div className="flex h-full min-h-0">
      {/* 目录区 */}
      <div className="flex w-1/4 shrink-0 flex-col overflow-hidden border-r bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
            目录
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="新建文档"
            onClick={handleCreate}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-1.5">
            {/* AI 记忆 */}
            <div
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                isActive({ kind: "memory" })
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
              onClick={() => setActiveTarget({ kind: "memory" })}
            >
              <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">AI 记忆</span>
            </div>

            {/* 项目公约（文件夹：项目公约 + 各页面公约） */}
            <div className="mt-1">
              <div
                className="group flex cursor-pointer items-center gap-1.5 rounded-sm py-1.5 px-2 text-sm transition-colors hover:bg-accent/50"
                onClick={() => setConventionExpanded(!conventionExpanded)}
              >
                {conventionExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="flex-1 font-medium text-foreground">
                  项目公约
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="新建/添加公约"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="bottom" className="w-40 p-1">
                    <div
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setActiveTarget({ kind: "convention" });
                      }}
                    >
                      <ScrollText className="h-3.5 w-3.5" />
                      项目公约
                    </div>
                    <div
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setPagePickerOpen(true);
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      页面公约
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {conventionExpanded && (
                <div className="space-y-0">
                  {/* 项目公约（根） */}
                  <div
                    className={cn(
                      "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-sm transition-colors hover:bg-accent/50",
                      isActive({ kind: "convention" })
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground",
                    )}
                    style={{ paddingLeft: 24 + 8 }}
                    onClick={() => setActiveTarget({ kind: "convention" })}
                  >
                    <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">项目公约</span>
                  </div>
                  {/* 各页面公约 */}
                  {pages.map((page) => (
                    <div
                      key={page.id}
                      className={cn(
                        "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-sm transition-colors hover:bg-accent/50",
                        activeTarget?.kind === "pageConvention" &&
                          activeTarget.page.id === page.id
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground",
                      )}
                      style={{ paddingLeft: 24 + 8 }}
                      onClick={() =>
                        setActiveTarget({ kind: "pageConvention", page })
                      }
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {page.name}
                      </span>
                    </div>
                  ))}
                  {pages.length === 0 && (
                    <div
                      className="px-3 py-2 text-xs text-muted-foreground"
                      style={{ paddingLeft: 24 + 12 }}
                    >
                      暂无页面
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 项目知识库 */}
            <div className="mt-1">
              <div
                className="group flex cursor-pointer items-center gap-1.5 rounded-sm py-1.5 px-2 text-sm transition-colors hover:bg-accent/50"
                onClick={() => setUserExpanded(!userExpanded)}
              >
                {userExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="flex-1 font-medium text-foreground">
                  项目知识库
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                  title="新建文档"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreate();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {userExpanded && (
                <div className="space-y-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : userItems.length === 0 ? (
                    <div
                      className="px-3 py-2 text-xs text-muted-foreground"
                      style={{ paddingLeft: 24 + 12 }}
                    >
                      暂无文档，点击 + 添加
                    </div>
                  ) : (
                    userItems.map((item) => (
                      <KnowledgeFileItem
                        key={item.id}
                        item={item}
                        active={
                          activeTarget?.kind === "knowledge" &&
                          activeTarget.item.id === item.id
                        }
                        onSelect={() =>
                          setActiveTarget({ kind: "knowledge", item })
                        }
                        onEdit={() =>
                          setActiveTarget({ kind: "knowledge", item })
                        }
                        onDelete={() => handleDelete(item)}
                        onHistory={
                          onDocHistory
                            ? () => onDocHistory(item)
                            : undefined
                        }
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 对话文件 */}
            <div className="mt-1">
              <div
                className="group flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors hover:bg-accent/50"
                onClick={() => setChatExpanded(!chatExpanded)}
              >
                {chatExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <FolderOpen className="h-4 w-4 shrink-0 text-purple-500" />
                <span className="flex-1 font-medium text-foreground">
                  对话文件
                </span>
                {!chatFilesLoading && chatFiles.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {chatFiles.length}
                  </span>
                )}
              </div>
              {chatExpanded && (
                <div className="space-y-0">
                  {chatFilesLoading ? (
                    <div
                      className="px-3 py-2 text-xs text-muted-foreground"
                      style={{ paddingLeft: 24 + 12 }}
                    >
                      加载中...
                    </div>
                  ) : chatFiles.length === 0 ? (
                    <div
                      className="px-3 py-2 text-xs text-muted-foreground"
                      style={{ paddingLeft: 24 + 12 }}
                    >
                      暂无对话文件
                    </div>
                  ) : (
                    chatFiles.map((file) => (
                      <ChatFileItem
                        key={file.id}
                        file={file}
                        sessionId={sessionId}
                        onView={() => onChatFileSelect?.(file)}
                        onConvert={
                          onChatFileConvert
                            ? () => onChatFileConvert(file)
                            : undefined
                        }
                        onDelete={
                          onChatFileDelete
                            ? () => onChatFileDelete(file)
                            : undefined
                        }
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 文档编辑区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{headerTitle}</div>
            <div className="text-[11px] text-muted-foreground">{headerSub}</div>
          </div>
          {activeTarget && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleSave}
              disabled={saving || !dirty || contentLoading}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              保存
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 p-4">
          {contentLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeTarget ? (
            <DocumentEditor
              value={content}
              onChange={(next) => {
                setContent(next);
                setDirty(true);
              }}
              format="markdown"
              className="h-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              请从左侧目录选择文档开始编辑
            </div>
          )}
        </div>
      </div>

      {/* 选择页面（用于新建页面公约） */}
      <Dialog open={pagePickerOpen} onOpenChange={setPagePickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>选择页面</DialogTitle>
          </DialogHeader>
          <div className="py-1">
            {pages.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                暂无页面
              </div>
            ) : (
              pages.map((page) => (
                <div
                  key={page.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    setActiveTarget({ kind: "pageConvention", page });
                    setPagePickerOpen(false);
                  }}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{page.name}</span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 项目知识库单个文件项 */
function KnowledgeFileItem({
  item,
  active,
  onSelect,
  onEdit,
  onHistory,
  onDelete,
}: {
  item: KnowledgeItem;
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onHistory?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-sm transition-colors hover:bg-accent/50",
        active ? "bg-accent text-accent-foreground" : "text-foreground",
      )}
      style={{ paddingLeft: 24 + 8 }}
      onClick={onSelect}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Eye className="h-3 w-3 text-muted-foreground" />
        {onEdit && <Pencil className="h-3 w-3 text-blue-400" />}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
            title="更多"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEdit && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" />
              编辑
            </DropdownMenuItem>
          )}
          {onHistory && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onHistory();
              }}
            >
              <MoreVertical className="h-3.5 w-3.5 mr-2" />
              历史
            </DropdownMenuItem>
          )}
          {onDelete && (
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
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** 对话文件单个聊天附件项 */
function ChatFileItem({
  file,
  sessionId,
  onView,
  onConvert,
  onDelete,
}: {
  file: ChatAttachment;
  sessionId?: string;
  onView: () => void;
  onConvert?: () => void;
  onDelete?: () => void;
}) {
  const isImage = file.mimeType?.startsWith("image/");
  const imgUrl = sessionId
    ? `/api/sessions/${sessionId}/attachments?id=${encodeURIComponent(
        file.id,
      )}&raw=1`
    : "";
  return (
    <div
      className="group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-sm transition-colors hover:bg-accent/50"
      style={{ paddingLeft: 24 + 8 }}
      onClick={onView}
    >
      {isImage ? (
        <img
          src={imgUrl}
          alt={file.name}
          className="h-6 w-6 shrink-0 rounded object-cover"
        />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-purple-500" />
      )}
      <span className="min-w-0 flex-1 truncate text-foreground">
        {file.name}
      </span>
      {file.size ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {(file.size / 1024).toFixed(1)}KB
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
            title="更多"
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
          {onConvert && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onConvert();
              }}
            >
              <BookOpen className="h-3.5 w-3.5 mr-2" />
              转为知识库
            </DropdownMenuItem>
          )}
          {onDelete && (
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
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}