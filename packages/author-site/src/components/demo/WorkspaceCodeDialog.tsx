"use client";

import { useState, useEffect } from "react";
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
import { MemoryMarkdownEditor } from "./MemoryMarkdownEditor";
import { getFileLanguage, getFileEditorType } from "@/lib/workspace-file-utils";

interface WorkspaceCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  content: string;
  editable: boolean;
  onSave: (content: string) => Promise<void>;
  onSaved?: (params: { filePath: string; content: string }) => void;
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
}: WorkspaceCodeDialogProps) {
  const [editContent, setEditContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  const language = getFileLanguage(filePath);
  const editorType = getFileEditorType(filePath);

  // 打开弹窗时重置状态
  useEffect(() => {
    if (open) {
      setEditContent(content);
      setHasChanges(false);
    }
  }, [open, content]);

  const handleChange = (value: string) => {
    setEditContent(value);
    setHasChanges(value !== content);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editContent);
    toast({ title: "代码已复制" });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editContent);
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
                  可编辑
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
            <MemoryMarkdownEditor
              key={filePath}
              value={editContent}
              onChange={handleChange}
              readOnly={!editable}
            />
          ) : (
            <CodeEditor
              value={editContent}
              onChange={editable ? handleChange : undefined}
              language={language}
              readOnly={!editable}
              height="100%"
            />
          )}
        </div>

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
