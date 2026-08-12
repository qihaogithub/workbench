"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, FolderOpen, Loader2 } from "lucide-react";
import type { KnowledgeIndexItem } from "@workbench/shared";
import { DocumentEditor } from "@workbench/demo-ui";
import { cn } from "@/lib/utils";
import { getKnowledgeDocContent } from "../lib/api";

interface ViewerDocumentViewProps {
  projectId: string;
  items: KnowledgeIndexItem[];
}

/**
 * 浏览端只读文档视图：展示项目知识库用户文档，不包含 AI 记忆/公约/对话文件。
 */
export function ViewerDocumentView({
  projectId,
  items,
}: ViewerDocumentViewProps) {
  const userItems = useMemo(
    () =>
      items.filter((item) => item.source !== "system").sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", "zh-Hans-CN"),
      ),
    [items],
  );
  const [active, setActive] = useState<KnowledgeIndexItem | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active && userItems.length > 0) {
      setActive(userItems[0]);
    }
  }, [active, userItems]);

  useEffect(() => {
    if (!active) {
      setContent("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    getKnowledgeDocContent(projectId, active.fileName)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, projectId]);

  const handleSelect = useCallback((item: KnowledgeIndexItem) => {
    setActive(item);
  }, []);

  return (
    <div className="flex h-full min-h-0">
      {/* 目录区 */}
      <div className="flex w-1/4 shrink-0 flex-col overflow-hidden border-r bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
            项目知识库
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-1.5">
            {userItems.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                暂无文档
              </div>
            ) : (
              userItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1.5 pr-2 text-sm transition-colors hover:bg-accent/50",
                    active?.id === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground",
                  )}
                  style={{ paddingLeft: 12 }}
                  onClick={() => handleSelect(item)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 文档展示区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {active ? active.title : "未选择文档"}
            </div>
            {active && (
              <div className="text-[11px] text-muted-foreground">
                {active.updatedAt
                  ? `更新于 ${new Date(active.updatedAt).toLocaleString()}`
                  : "Markdown 文档"}
              </div>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : active ? (
            <DocumentEditor
              value={content}
              onChange={() => {}}
              readOnly
              className="h-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <BookOpen className="mr-2 h-4 w-4" />
              从左侧目录选择文档开始浏览
            </div>
          )}
        </div>
      </div>
    </div>
  );
}