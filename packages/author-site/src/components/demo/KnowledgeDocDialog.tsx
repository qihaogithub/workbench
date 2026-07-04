"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Loader2, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { DocumentEditor } from "@opencode-workbench/demo-ui";
import type { CollabRoomDescriptor } from "@opencode-workbench/shared";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import { useCollabDocument, type CollabUser } from "@/hooks/useCollabDocument";

export interface KnowledgeItem {
  id: string;
  title: string;
  source: "system" | "user";
  description: string;
  fileName: string;
  addedAt: string;
  updatedAt: string;
  sizeBytes?: number;
  category?: string;
  tags?: string[];
  aiSummary?: string;
  aiKeywords?: string[];
  summaryStatus?: "ready" | "stale" | "failed";
  readonly?: boolean;
}

export type KnowledgeDocDialogMode = "read" | "edit" | "add";

interface KnowledgeDocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: KnowledgeDocDialogMode;
  item: KnowledgeItem | null;
  workingDir?: string;
  projectId?: string;
  workspaceId?: string;
  sessionId?: string;
  collabUser?: Partial<CollabUser>;
  onSaved: (item?: KnowledgeItem) => void;
}

function replaceCollabText(
  ytext: { toString: () => string; delete: (index: number, length: number) => void; insert: (index: number, text: string) => void } | null,
  value: string,
): void {
  if (!ytext || ytext.toString() === value) return;
  ytext.delete(0, ytext.toString().length);
  if (value) ytext.insert(0, value);
}

/**
 * 知识库文档弹窗 - 支持阅读/编辑/添加
 * 阅读模式下用户条目可切换到编辑模式
 */
export function KnowledgeDocDialog({
  open,
  onOpenChange,
  mode: initialMode,
  item,
  workingDir,
  projectId,
  workspaceId,
  sessionId,
  collabUser,
  onSaved,
}: KnowledgeDocDialogProps) {
  const { toast } = useToast();
  // 内部模式状态，支持从阅读切换到编辑
  const [activeMode, setActiveMode] = useState<KnowledgeDocDialogMode>(initialMode);
  const [content, setContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addContent, setAddContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const collabDescriptor = useMemo<CollabRoomDescriptor | null>(() => {
    if (
      !open ||
      activeMode !== "edit" ||
      !item ||
      item.source === "system" ||
      !projectId ||
      !workspaceId ||
      !sessionId
    ) {
      return null;
    }

    return {
      projectId,
      workspaceId,
      sessionId,
      resourcePath: `knowledge/${item.fileName}`,
      kind: "knowledge-document",
    };
  }, [activeMode, item, open, projectId, sessionId, workspaceId]);
  const collab = useCollabDocument(collabDescriptor, collabUser);

  // 打开弹窗时重置模式并加载数据
  useEffect(() => {
    if (!open) return;
    setActiveMode(initialMode);

    if (initialMode === "add") {
      setAddTitle("");
      setAddDescription("");
      setAddContent("");
      setHasChanges(false);
      return;
    }

    if (item && workingDir) {
      setLoading(true);
      setHasChanges(false);
      readFileContent(workingDir, item.fileName)
        .then((text) => {
          setContent(text);
          setEditContent(text);
          setEditDescription(item.description);
        })
        .catch(() => {
          setContent("");
          setEditContent("");
        })
        .finally(() => setLoading(false));
    }
  }, [open, initialMode, item, workingDir]);

  useEffect(() => {
    if (!collabDescriptor || activeMode !== "edit") return;
    if (collab.status === "connecting" || collab.status === "offline") return;
    setContent(collab.value);
    setEditContent(collab.value);
  }, [activeMode, collab.status, collab.value, collabDescriptor]);

  // 编辑模式变更检测
  useEffect(() => {
    if (activeMode === "edit" && item) {
      setHasChanges(
        editContent !== content || editDescription !== item.description
      );
    }
  }, [editContent, editDescription, content, activeMode, item]);

  const handleSave = async () => {
    if (!workingDir) return;
    setSaving(true);
    try {
      if (activeMode === "add") {
        if (!addTitle.trim() || !addContent.trim()) return;
        const params = new URLSearchParams({ workingDir });
        if (projectId) params.set("projectId", projectId);
        const res = await fetch(
          `/api/knowledge?${params.toString()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: addTitle.trim(),
              description: addDescription.trim(),
              content: addContent,
            }),
          }
        );
        const data = await res.json();
        if (data.success) {
          toast({ title: "添加成功" });
          onSaved(data.data);
          onOpenChange(false);
        } else {
          toast({
            title: "添加失败",
            description: data.error?.message,
            variant: "destructive",
          });
        }
      } else if (activeMode === "edit" && item) {
        if (collabDescriptor) {
          await collab.flush();
        }
        const contentToSave = collabDescriptor
          ? collab.ytext?.toString() ?? editContent
          : editContent;
        const params = new URLSearchParams({ workingDir });
        if (projectId) params.set("projectId", projectId);
        const res = await fetch(
          `/api/knowledge/${item.id}?${params.toString()}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: editDescription,
              content: contentToSave,
            }),
          }
        );
        const data = await res.json();
        if (data.success) {
          setContent(contentToSave);
          setEditContent(contentToSave);
          toast({ title: "保存成功" });
          onSaved(data.data);
          onOpenChange(false);
        } else {
          toast({
            title: "保存失败",
            description: data.error?.message,
            variant: "destructive",
          });
        }
      }
    } catch {
      toast({
        title: activeMode === "add" ? "添加失败" : "保存失败",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // 标题栏
  const renderTitle = () => {
    if (activeMode === "add") {
      return (
        <DialogTitle className="flex items-center gap-2">
          <span className="text-sm">添加知识文档</span>
        </DialogTitle>
      );
    }

    return (
      <DialogTitle className="flex items-center gap-2">
        <Pencil className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">
          {item?.title}
        </span>
        {activeMode === "read" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs px-1.5"
            onClick={() => setActiveMode("edit")}
          >
            <Pencil className="h-3 w-3" />
            编辑
          </Button>
        ) : (
          <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
            编辑中
          </span>
        )}
      </DialogTitle>
    );
  };

  // 内容区
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (activeMode === "add") {
      return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              标题
            </label>
            <Input
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="输入文档标题"
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              描述
            </label>
            <Input
              value={addDescription}
              onChange={(e) => setAddDescription(e.target.value)}
              placeholder="简要描述文档内容"
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-h-0">
            <label className="text-xs font-medium text-muted-foreground">
              内容（Markdown）
            </label>
            <div className="mt-1 h-[300px]">
              <DocumentEditor
                value={addContent}
                onChange={setAddContent}
                format="markdown"
              />
            </div>
          </div>
        </div>
      );
    }

    if (activeMode === "edit") {
      return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              描述
            </label>
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-h-0">
            <DocumentEditor
              value={editContent}
              onChange={(nextValue) => {
                setEditContent(nextValue);
                if (collabDescriptor) {
                  replaceCollabText(collab.ytext, nextValue);
                }
              }}
              format="markdown"
            />
          </div>
          {collabDescriptor && (
            <div className="text-[11px] text-muted-foreground">
              协同状态：{collab.status === "synced" ? "已同步" : collab.status === "saving" ? "保存中" : collab.status === "connecting" ? "连接中" : "离线"}
              {collab.awareness.length > 1 ? ` · ${collab.awareness.length} 人在线` : ""}
            </div>
          )}
        </div>
      );
    }

    // 阅读模式 - 使用 Streamdown 渲染 Markdown
    return (
      <div className="markdown-editor-content text-sm overflow-y-auto h-full scrollbar-thin px-3 py-2">
        <Streamdown plugins={{ code, cjk }} controls={{ table: false, code: true }}>
          {content || "（无内容）"}
        </Streamdown>
      </div>
    );
  };

  // 底部按钮
  const renderFooter = () => {
    if (activeMode === "add") {
      return (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !addTitle.trim() || !addContent.trim()}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            添加
          </Button>
        </DialogFooter>
      );
    }

    if (activeMode === "edit") {
      return (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (hasChanges) {
                setEditContent(content);
                setEditDescription(item?.description || "");
              }
              setActiveMode("read");
            }}
          >
            {hasChanges ? "取消编辑（有未保存的更改）" : "返回阅读"}
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" />
                保存
              </>
            )}
          </Button>
        </DialogFooter>
      );
    }

    // 阅读模式
    return (
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      </DialogFooter>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>{renderTitle()}</DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col border rounded-md overflow-hidden p-4">
          {renderContent()}
        </div>

        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}

/** 读取知识库文件内容 */
async function readFileContent(
  workingDir: string,
  fileName: string
): Promise<string> {
  const res = await fetch(
    `/api/knowledge/content?workingDir=${encodeURIComponent(workingDir)}&fileName=${encodeURIComponent(fileName)}`
  );
  if (res.ok) {
    const data = await res.json();
    if (data.success) {
      return data.data.content;
    }
  }
  return "";
}
