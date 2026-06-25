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
import { RichTextEditor, sanitizeNoteHtml } from "./RichTextEditor";
import { stripHtml } from "./NotePreview";

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldTitle: string;
  noteHtml: string;
  readonly?: boolean;
  onSave: (html: string) => void;
  onDelete: () => void;
}

export function NoteDialog({
  open,
  onOpenChange,
  fieldTitle,
  noteHtml,
  readonly,
  onSave,
  onDelete,
}: NoteDialogProps) {
  const [editContent, setEditContent] = useState(noteHtml);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasExistingNote = !!stripHtml(noteHtml);
  const hasContentChanged = editContent !== noteHtml;

  useEffect(() => {
    if (open) {
      setEditContent(noteHtml);
      setConfirmDelete(false);
    }
  }, [open, noteHtml]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setEditContent(noteHtml);
        setConfirmDelete(false);
      }
      onOpenChange(nextOpen);
    },
    [noteHtml, onOpenChange],
  );

  const handleSave = useCallback(() => {
    const sanitized = sanitizeNoteHtml(editContent);
    const plainText = stripHtml(sanitized);
    onSave(plainText ? sanitized : "");
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
              dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(noteHtml) }}
            />
          ) : (
            <RichTextEditor content={editContent} onChange={setEditContent} />
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
