"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RichTextEditor, type NoteUploadHandler } from "./RichTextEditor";
import { renderNoteMarkdown, stripMarkdown } from "./note-html";

/** 默认上传实现：投递到 author-site 图床 /api/images/upload（同源，随 Cookie 鉴权） */
async function uploadNoteFile(
  file: File,
): Promise<{ url: string; kind: "image" | "video" | "file" }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("当前仅支持上传图片，视频/通用附件上传能力即将上线");
  }
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/images/upload", {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  if (!res.ok) {
    try {
      const body = await res.json();
      const message = body?.error?.message || `上传失败（HTTP ${res.status}）`;
      throw new Error(message);
    } catch {
      throw new Error(`上传失败（HTTP ${res.status}）`);
    }
  }
  const json = await res.json();
  const data = json?.data;
  if (!data?.url) throw new Error("上传成功但缺少资源地址");
  return { url: data.url, kind: "image" };
}

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldTitle: string;
  /** 备注 Markdown 内容 */
  note: string;
  readonly?: boolean;
  onSave: (markdown: string) => void;
  onDelete: () => void;
  uploadHandler?: NoteUploadHandler;
}

export function NoteDialog({
  open,
  onOpenChange,
  fieldTitle,
  note,
  readonly,
  onSave,
  onDelete,
  uploadHandler,
}: NoteDialogProps) {
  const [editContent, setEditContent] = useState(note);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasExistingNote = !!stripMarkdown(note);
  const hasContentChanged = editContent !== note;

  useEffect(() => {
    if (open) {
      setEditContent(note);
      setConfirmDelete(false);
    }
  }, [open, note]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setEditContent(note);
        setConfirmDelete(false);
      }
      onOpenChange(nextOpen);
    },
    [note, onOpenChange],
  );

  const handleSave = useCallback(() => {
    const plainText = stripMarkdown(editContent);
    onSave(plainText ? editContent : "");
    onOpenChange(false);
  }, [editContent, onSave, onOpenChange]);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
    setConfirmDelete(false);
    onOpenChange(false);
  }, [confirmDelete, onDelete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{fieldTitle} - 备注</DialogTitle>
          <DialogDescription className="sr-only">
            {readonly ? "查看备注内容" : "编辑备注内容"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {readonly ? (
            <div
              className="markdown-editor-content px-3 py-2 text-sm overflow-y-auto h-full rounded-md border"
              dangerouslySetInnerHTML={{ __html: renderNoteMarkdown(note) }}
            />
          ) : (
            <RichTextEditor
              content={editContent}
              onChange={setEditContent}
              uploadHandler={uploadHandler ?? uploadNoteFile}
            />
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <div>
            {!readonly && hasExistingNote && (
              confirmDelete ? (
                <span className="text-xs text-destructive">
                  确定删除此备注？
                  <button
                    type="button"
                    className="text-xs text-destructive underline ml-1"
                    onClick={handleDelete}
                  >
                    确认
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline ml-1"
                    onClick={() => setConfirmDelete(false)}
                  >
                    取消
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="text-xs text-destructive/70 hover:text-destructive underline"
                  onClick={handleDelete}
                >
                  删除备注
                </button>
              )
            )}
          </div>
          <div className="flex gap-2">
            {readonly ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                关闭
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  disabled={!hasContentChanged}
                  onClick={handleSave}
                >
                  保存
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}