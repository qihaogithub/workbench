"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import {
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Save,
  History,
} from "lucide-react";
import { DocumentEditor } from "@workbench/demo-ui";
import type { KnowledgeItem } from "./KnowledgeDocDialog";
import { cn } from "@/lib/utils";

export interface DocumentViewProps {
  workingDir?: string;
  projectId?: string;
  sessionId?: string;
  onItemsChange?: (items: KnowledgeItem[]) => void;
  onItemsLoaded?: (items: KnowledgeItem[]) => void;
  onDocHistory?: (item: KnowledgeItem) => void;
  onAddRequest?: () => void;
}

export function DocumentView({
  workingDir,
  projectId,
  sessionId,
  onItemsChange,
  onItemsLoaded,
  onDocHistory,
  onAddRequest,
}: DocumentViewProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
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
  const activeItem = useMemo(
    () => userItems.find((item) => item.id === activeId) ?? null,
    [userItems, activeId],
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

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const handler = () => fetchItems();
    window.addEventListener("knowledge-updated", handler);
    return () => window.removeEventListener("knowledge-updated", handler);
  }, [fetchItems]);

  // 默认选中第一个用户文档
  useEffect(() => {
    if (!activeId && userItems.length > 0 && !loading) {
      setActiveId(userItems[0].id);
    }
  }, [userItems, activeId, loading]);

  // 加载选中文档内容
  useEffect(() => {
    if (!activeItem || !workingDir) {
      setContent("");
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    fetch(
      `/api/knowledge/content?workingDir=${encodeURIComponent(
        workingDir,
      )}&fileName=${encodeURIComponent(activeItem.fileName)}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setContent(data.data.content || "");
          setDirty(false);
        } else {
          setContent("");
          setDirty(false);
        }
      })
      .catch(() => {
        if (!cancelled) setContent("");
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeItem, workingDir]);

  const handleSave = useCallback(async () => {
    if (!workingDir || !activeItem) return;
    setSaving(true);
    try {
      const params = new URLSearchParams({ workingDir });
      if (projectId) params.set("projectId", projectId);
      if (sessionId) params.set("sessionId", sessionId);
      const res = await fetch(
        `/api/knowledge/${activeItem.id}?${params.toString()}`,
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
      } else {
        toast({
          title: "保存失败",
          description: data.error?.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "保存失败", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [workingDir, activeItem, projectId, sessionId, toast, onItemsChange]);

  const handleCreate = useCallback(() => {
    onAddRequest?.();
  }, [onAddRequest]);

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
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : userItems.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              暂无文档
            </div>
          ) : (
            <div className="p-1.5">
              {userItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    activeItem?.id === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {onDocHistory && (
                    <History
                      className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDocHistory(item);
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 文档编辑区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {activeItem?.title ?? "未选择文档"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {activeItem
                ? activeItem.updatedAt
                  ? `更新于 ${new Date(activeItem.updatedAt).toLocaleString()}`
                  : "Markdown 文档"
                : "从左侧目录选择文档"}
            </div>
          </div>
          {activeItem && (
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
          ) : activeItem ? (
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
    </div>
  );
}