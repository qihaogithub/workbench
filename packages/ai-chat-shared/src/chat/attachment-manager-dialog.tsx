"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { X, Upload, Image as ImageIcon, FileText } from "lucide-react";
import type { PromptInputFile } from "../prompt-input";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface AttachmentManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: PromptInputFile[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
}

export function AttachmentManagerDialog({
  open,
  onOpenChange,
  files,
  onAddFiles,
  onRemoveFile,
}: AttachmentManagerDialogProps) {
  const addInputRef = useRef<HTMLInputElement>(null);

  const imageCount = files.filter((f) => f.type.startsWith("image/")).length;
  const otherCount = files.length - imageCount;

  const handleAdd = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(event.target.files || []);
    if (newFiles.length > 0) onAddFiles(newFiles);
    event.target.value = "";
  };

  const titleParts: string[] = [];
  if (imageCount > 0) titleParts.push(`${imageCount} 张图片`);
  if (otherCount > 0) titleParts.push(`${otherCount} 个文件`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            附件管理
            {titleParts.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({titleParts.join("，")})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-shrink-0 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => addInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            添加图片
          </Button>
          <input
            ref={addInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleAdd}
            className="hidden"
          />
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {files.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无附件
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pr-1">
              {files.map((file) => {
                const isImage = file.type.startsWith("image/");
                return (
                  <div
                    key={file.id}
                    className="group relative flex flex-col rounded-lg border bg-muted p-2"
                  >
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      onClick={() => onRemoveFile(file.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {isImage && file.url ? (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full aspect-square object-cover rounded mb-1.5"
                      />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center bg-muted-foreground/10 rounded mb-1.5">
                        {isImage ? (
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        ) : (
                          <FileText className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {file.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatSize(file.size)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
