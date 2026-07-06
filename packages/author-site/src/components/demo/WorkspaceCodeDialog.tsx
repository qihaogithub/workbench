"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { CodeEditor } from "./CodeEditor";
import { DocumentEditor } from "@workbench/demo-ui";
import type { CollabResourceKind, CollabRoomDescriptor } from "@workbench/shared";
import { useCollabDocument } from "@/hooks/useCollabDocument";
import { getFileLanguage, getFileEditorType } from "@/lib/workspace-file-utils";

interface WorkspaceCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  content: string;
  editable: boolean;
  onSave: (content: string) => Promise<void>;
  onSaved?: (params: { filePath: string; content: string }) => void;
  projectId?: string;
  workspaceId?: string;
  sessionId?: string;
}

/**
 * 工作空间代码查看/编辑弹窗
 * 使用 CodeMirror 6 展示代码，支持只读/编辑模式
 */
export function WorkspaceCodeDialog({
  open,
  onOpenChange,
  filePath,
  content,
  editable,
  onSave,
  onSaved,
  projectId,
  workspaceId,
  sessionId,
}: WorkspaceCodeDialogProps) {
  const [editContent, setEditContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const hasLocalEditRef = useRef(false);
  const { toast } = useToast();

  const language = getFileLanguage(filePath);
  const editorType = getFileEditorType(filePath);
  const collabKind = getCollabResourceKind(filePath);
  const collabDescriptor: CollabRoomDescriptor | null =
    open && editable && projectId && workspaceId && sessionId && collabKind
      ? {
          projectId,
          workspaceId,
          sessionId,
          resourcePath: filePath.replace(/^\/+/, ""),
          kind: collabKind,
        }
      : null;
  const collab = useCollabDocument(collabDescriptor, {
    userId: sessionId,
    username: "当前用户",
  });
  const useCollab = Boolean(collabDescriptor && collab.ytext && collab.provider);

  // 打开弹窗时重置状态
  useEffect(() => {
    if (open) {
      hasLocalEditRef.current = false;
      setEditContent(content);
      setHasChanges(false);
    }
  }, [open, content]);

  useEffect(() => {
    if (!open || !useCollab) return;
    if (
      collab.status === "synced" &&
      collab.value === "" &&
      content !== "" &&
      !hasLocalEditRef.current
    ) {
      replaceCollabText(collab.ytext, content);
      return;
    }
    if (collab.status !== "synced" && collab.value === "") return;
    if (collab.value === editContent) return;
    setEditContent(collab.value);
    setHasChanges(true);
    onSaved?.({ filePath, content: collab.value });
  }, [
    collab.status,
    collab.value,
    collab.ytext,
    content,
    editContent,
    filePath,
    onSaved,
    open,
    useCollab,
  ]);

  const handleChange = (value: string) => {
    const isInitialCollabEmpty =
      useCollab &&
      collab.status !== "synced" &&
      value === "" &&
      editContent !== "" &&
      !hasLocalEditRef.current;
    if (isInitialCollabEmpty) return;

    hasLocalEditRef.current = true;
    setEditContent(value);
    setHasChanges(value !== content);
    if (useCollab) {
      onSaved?.({ filePath, content: value });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editContent);
    toast({ title: "代码已复制" });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (useCollab) {
        await collab.flush();
      } else {
        await onSave(editContent);
      }
      onSaved?.({ filePath, content: editContent });
      toast({ title: "保存成功" });
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const fileName = filePath.split("/").pop() || filePath;
  const collabUsers = collab.awareness.filter((presence) => presence.userId !== sessionId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground">
                {filePath}
              </span>
              {editable ? (
                <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                  {useCollab ? getCollabStatusText(collab.status) : "可编辑"}
                </span>
              ) : (
                <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                  只读
                </span>
              )}
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-1" />
              复制
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col border rounded-md overflow-hidden">
          {editorType === "markdown" ? (
            <DocumentEditor
              key={filePath}
              value={editContent}
              onChange={handleChange}
              format="markdown"
              readOnly={!editable}
            />
          ) : (
            <CodeEditor
              value={editContent}
              onChange={editable ? handleChange : undefined}
              language={language}
              readOnly={!editable}
              height="100%"
              collab={
                useCollab && collab.ytext && collab.provider
                  ? {
                      ytext: collab.ytext,
                      awareness: collab.provider.awareness,
                    }
                  : undefined
              }
            />
          )}
        </div>

        {useCollab && (
          <div className="flex min-h-6 items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{collab.error || getCollabStatusDescription(collab.status)}</span>
            {collabUsers.length > 0 && (
              <div className="flex items-center gap-1">
                {collabUsers.slice(0, 4).map((presence) => (
                  <span
                    key={`${presence.userId}-${presence.resourcePath}`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium text-white"
                    title={presence.username}
                    style={{ backgroundColor: presence.color }}
                  >
                    {presence.username.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {hasChanges ? "取消（有未保存的更改）" : "关闭"}
          </Button>
          {editable && (
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function replaceCollabText(
  ytext: { toString: () => string; delete: (index: number, length: number) => void; insert: (index: number, text: string) => void } | null,
  value: string,
): void {
  if (!ytext || ytext.toString() === value) return;
  ytext.delete(0, ytext.toString().length);
  if (value) ytext.insert(0, value);
}

function getCollabResourceKind(filePath: string): CollabResourceKind | null {
  const normalized = filePath.replace(/^\/+/, "");
  if (/^demos\/[^/]+\/index\.tsx$/.test(normalized)) return "page-code";
  if (/^demos\/[^/]+\/config\.schema\.json$/.test(normalized)) return "page-schema";
  if (normalized === "project.config.schema.json") return "project-schema";
  if (normalized === "workspace-tree.json") return "workspace-tree";
  if (normalized === ".canvas-layout.json") return "canvas-layout";
  return null;
}

function getCollabStatusText(status: string): string {
  if (status === "saving") return "同步中";
  if (status === "offline") return "离线待同步";
  if (status === "error") return "协同异常";
  if (status === "synced") return "草稿已实时保存";
  return "连接中";
}

function getCollabStatusDescription(status: string): string {
  if (status === "saving") return "正在将协同草稿写入工作区";
  if (status === "offline") return "协同连接已断开，本地更改会在重连后继续同步";
  if (status === "error") return "协同连接异常，请稍后重试";
  if (status === "synced") return "草稿会实时保存到当前工作区，点击保存会生成项目版本";
  return "正在连接协同编辑服务";
}
