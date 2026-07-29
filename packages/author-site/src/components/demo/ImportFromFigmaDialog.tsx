"use client";

import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { parseFigmaImportContent } from "../../../lib/markdown-parser";
import type { DemoPageMeta } from "@workbench/shared";
import { projectApiClient } from "@/lib/project-api";
import { Loader2, Upload, FileText, X, CheckCircle2, AlertCircle } from "lucide-react";

const EMPTY_FIGMA_CONFIG_SCHEMA = JSON.stringify({
  type: "object",
  properties: {},
});

function getImportedPageName(filename: string): string {
  const name = filename.replace(/\.html?$/i, "").trim();
  return name || "从Figma导入的页面";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileImportStatus = "idle" | "importing" | "success" | "error";

interface FileEntry {
  file: File;
  id: string;
  status: FileImportStatus;
  errorMessage?: string;
}

interface ImportFromFigmaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sessionId: string | null;
  onPageCreated: (page: DemoPageMeta) => void;
}

export function ImportFromFigmaDialog({
  open,
  onOpenChange,
  projectId,
  sessionId,
  onPageCreated,
}: ImportFromFigmaDialogProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const resetState = useCallback(() => {
    setFiles([]);
    setIsImporting(false);
    setIsDragging(false);
  }, []);

  const validateAndAppendFiles = useCallback(
    (newFiles: File[]) => {
      const validFiles: FileEntry[] = [];
      for (const file of newFiles) {
        const filename = file.name.toLowerCase();
        if (
          !filename.endsWith(".html") &&
          !filename.endsWith(".htm") &&
          file.type !== "text/html"
        ) {
          toast({
            title: "跳过不支持的文件",
            description: `${file.name} 不是 .html/.htm 文件，已跳过。`,
            variant: "destructive",
          });
          continue;
        }
        if (files.some((f) => f.file.name === file.name && f.file.size === file.size)) {
          continue;
        }
        validFiles.push({
          file,
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          status: "idle" as FileImportStatus,
        });
      }
      if (validFiles.length > 0) {
        setFiles((prev) => [...prev, ...validFiles]);
      }
    },
    [files, toast],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        validateAndAppendFiles(Array.from(event.target.files));
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [validateAndAppendFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        validateAndAppendFiles(Array.from(e.dataTransfer.files));
      }
    },
    [validateAndAppendFiles],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateFileStatus = useCallback(
    (id: string, status: FileImportStatus, errorMessage?: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status, errorMessage } : f)),
      );
    },
    [],
  );

  const handleImport = async () => {
    if (files.length === 0) return;

    if (!sessionId) {
      toast({ title: "未创建 Session", description: "请先进入编辑模式", variant: "destructive" });
      return;
    }

    setIsImporting(true);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      updateFileStatus(entry.id, "importing");

      try {
        const text = await entry.file.text();
        if (!text.trim()) {
          updateFileStatus(entry.id, "error", "文件为空");
          failCount++;
          continue;
        }

        const parsed = parseFigmaImportContent(text.trim());
        if (!parsed.success) {
          updateFileStatus(entry.id, "error", parsed.error || "格式解析失败");
          failCount++;
          continue;
        }

        const pageName = getImportedPageName(entry.file.name);
        const page = await projectApiClient.createDemoPage(
          projectId,
          pageName,
          sessionId,
          undefined,
          parsed.kind === "prototype" ? "prototype-html-css" : undefined,
        );

        if (parsed.kind === "prototype") {
          const result = await projectApiClient.updateDemoPageFiles(projectId, page.id, sessionId, {
            prototypeHtml: parsed.prototypeHtml,
            prototypeCss: parsed.prototypeCss,
            prototypeMeta: parsed.prototypeMeta,
            schema: EMPTY_FIGMA_CONFIG_SCHEMA,
            localizeImages: true,
          });
          if (result.imageLocalization && result.imageLocalization.failed > 0) {
            updateFileStatus(entry.id, "success", `${result.imageLocalization.failed} 张图片未本地化`);
          } else {
            updateFileStatus(entry.id, "success");
          }
        } else {
          await projectApiClient.updateDemoPageFiles(projectId, page.id, sessionId, {
            code: parsed.code,
            schema: parsed.schema,
          });
          updateFileStatus(entry.id, "success");
        }

        onPageCreated(page);
        successCount++;
      } catch (err) {
        updateFileStatus(entry.id, "error", err instanceof Error ? err.message : "未知错误");
        failCount++;
      }
    }

    if (successCount > 0) {
      toast({
        title: "批量导入完成",
        description: `成功导入 ${successCount} 个页面${failCount > 0 ? `，${failCount} 个失败` : ""}`,
      });
    }

    setIsImporting(false);
    resetState();
    onOpenChange(false);
  };

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) resetState();
      onOpenChange(open);
    },
    [onOpenChange, resetState],
  );

  const statusIcon = (status: FileImportStatus) => {
    switch (status) {
      case "importing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const statusLabel = (entry: FileEntry) => {
    switch (entry.status) {
      case "importing":
        return <span className="text-xs text-blue-500">导入中...</span>;
      case "success":
        return (
          <span className="text-xs text-emerald-600">
            {entry.errorMessage || "已导入"}
          </span>
        );
      case "error":
        return (
          <span className="text-xs text-destructive truncate max-w-[160px]">
            {entry.errorMessage || "导入失败"}
          </span>
        );
      default:
        return (
          <span className="text-xs text-muted-foreground">
            {formatFileSize(entry.file.size)}
          </span>
        );
    }
  };

  const idleCount = files.filter((f) => f.status === "idle").length;
  const importedCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            从 Figma 导入
          </DialogTitle>
          <DialogDescription>
            拖拽或点击上传 Figma 插件导出的 HTML 文件，支持批量导入多个页面
          </DialogDescription>
        </DialogHeader>

        <div
          className={`group relative rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 ${
            isDragging
              ? "scale-[1.02] border-primary bg-primary/10 shadow-lg"
              : files.length > 0
                ? "border-muted-foreground/20 bg-muted/20 p-4"
                : "border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/10"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          {isDragging ? (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 animate-bounce text-primary" />
              <p className="text-sm font-medium text-primary">释放文件以添加</p>
            </div>
          ) : files.length > 0 ? (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className="h-4 w-4" />
              继续添加文件
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary/10">
                <Upload className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  拖拽 HTML 文件到此处，或
                  <button
                    type="button"
                    className="mx-1 font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                  >
                    点击上传
                  </button>
                </p>
                <p className="mt-1 text-xs text-muted-foreground/50">支持 .html、.htm 格式</p>
              </div>
            </div>
          )}
        </div>

        {files.length > 0 && (
          <div className="max-h-[220px] overflow-y-auto rounded-lg border bg-card">
            {importedCount > 0 && (
              <div className="border-b px-3 py-1.5">
                <span className="text-xs text-muted-foreground">
                  已导入 {importedCount} 个，失败 {errorCount} 个
                </span>
              </div>
            )}
            <div className="divide-y">
              {files.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                    entry.status === "importing" ? "bg-blue-50/50" : ""
                  }`}
                >
                  {statusIcon(entry.status)}
                  <div className="flex-1 min-w-0">
                    <span className="truncate block text-sm">{entry.file.name}</span>
                    {statusLabel(entry)}
                  </div>
                  {entry.status === "idle" && !isImporting && (
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-destructive"
                      onClick={() => removeFile(entry.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={files.length === 0 || isImporting || idleCount === 0}>
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                导入中...
              </>
            ) : (
              `导入并创建页面 (${idleCount})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
