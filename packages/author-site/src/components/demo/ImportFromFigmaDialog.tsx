"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { parseFigmaImportContent } from "../../../lib/markdown-parser";
import type { DemoPageMeta } from "@workbench/shared";
import { projectApiClient } from "@/lib/project-api";
import { Clipboard, Loader2, Upload } from "lucide-react";

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
  const [content, setContent] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isReadingClipboard, setIsReadingClipboard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const handlePasteFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      toast({
        title: "无法读取剪贴板",
        description: "当前浏览器不支持剪贴板读取，请直接粘贴到输入框。",
        variant: "destructive",
      });
      return;
    }

    setIsReadingClipboard(true);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast({ title: "剪贴板为空", description: "没有可导入的 HTML 或 Markdown 内容。" });
        return;
      }
      setContent(text);
      toast({ title: "已读取剪贴板", description: "内容已填入导入框。" });
    } catch (err) {
      toast({
        title: "读取剪贴板失败",
        description: err instanceof Error ? err.message : "请检查浏览器剪贴板权限。",
        variant: "destructive",
      });
    } finally {
      setIsReadingClipboard(false);
    }
  };

  const handleUploadHtmlFile = async (file: File | undefined) => {
    if (!file) return;
    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".html") && !filename.endsWith(".htm") && file.type !== "text/html") {
      toast({
        title: "文件类型不支持",
        description: "请选择 .html 或 .htm 文件。",
        variant: "destructive",
      });
      return;
    }

    try {
      const text = await file.text();
      if (!text.trim()) {
        toast({
          title: "HTML 文件为空",
          description: "请选择包含 Figma 导出代码的 HTML 文件。",
          variant: "destructive",
        });
        return;
      }
      setContent(text);
      toast({ title: "HTML 文件已读取", description: `已载入 ${file.name}` });
    } catch (err) {
      toast({
        title: "读取文件失败",
        description: err instanceof Error ? err.message : "无法读取所选 HTML 文件。",
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (!sessionId) {
      toast({ title: "未创建 Session", description: "请先进入编辑模式", variant: "destructive" });
      return;
    }

    const parsed = parseFigmaImportContent(trimmed);
    if (!parsed.success) {
      toast({
        title: "格式解析失败",
        description: parsed.error || "请确认内容为 Figma 插件导出的 HTML 或旧版 Markdown 格式",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    try {
      const page = await projectApiClient.createDemoPage(
        projectId,
        "从Figma导入的页面",
        sessionId,
        undefined,
        parsed.kind === "prototype" ? "prototype-html-css" : undefined,
      );
      if (parsed.kind === "prototype") {
        await projectApiClient.updateDemoPageFiles(projectId, page.id, sessionId, {
          prototypeHtml: parsed.prototypeHtml,
          prototypeCss: parsed.prototypeCss,
        });
      } else {
        await projectApiClient.updateDemoPageFiles(projectId, page.id, sessionId, {
          code: parsed.code,
          schema: parsed.schema,
        });
      }
      onPageCreated(page);
      toast({ title: "导入成功", description: `已创建页面「${page.name}」` });
      setContent("");
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "导入失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>从 Figma 导入</DialogTitle>
          <DialogDescription>
            将 Figma 插件导出的 HTML 代码粘贴到下方，或直接从剪贴板/HTML 文件载入；旧版 Markdown 导出仍可继续导入。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handlePasteFromClipboard}
            disabled={isImporting || isReadingClipboard}
          >
            {isReadingClipboard ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Clipboard className="h-4 w-4" />
            )}
            读取剪贴板
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <Upload className="h-4 w-4" />
            上传 HTML
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(event) => {
              void handleUploadHtmlFile(event.target.files?.[0]);
            }}
          />
        </div>
        <Textarea
          autoFocus
          placeholder={`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Figma Export</title>
</head>
<body>
  <div class="figma-export">...</div>
</body>
</html>

<!-- 也兼容旧版 # Workbench Export Markdown -->`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[200px] font-mono text-sm"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={!content.trim() || isImporting}>
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            导入并创建页面
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
