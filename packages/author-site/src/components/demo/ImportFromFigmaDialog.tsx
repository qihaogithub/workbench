"use client";

import { useState } from "react";
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
import { parseFigmaMarkdown } from "../../../lib/markdown-parser";
import type { DemoPageMeta } from "@opencode-workbench/shared";
import { projectApiClient } from "@/lib/project-api";
import { Loader2 } from "lucide-react";

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
  const { toast } = useToast();

  const handleImport = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (!sessionId) {
      toast({ title: "未创建 Session", description: "请先进入编辑模式", variant: "destructive" });
      return;
    }

    const parsed = parseFigmaMarkdown(trimmed);
    if (!parsed.success) {
      toast({
        title: "格式解析失败",
        description: parsed.error || "请确认内容为 Figma 插件导出的 Markdown 格式",
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
      );
      await projectApiClient.updateDemoPageFiles(projectId, page.id, sessionId, {
        code: parsed.code,
        schema: parsed.schema,
      });
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
            将 Figma 插件导出的 Markdown 格式内容粘贴到下方，系统将自动解析并创建页面。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          placeholder={`# OpenCode Workbench Export

## Component Code

\`\`\`tsx
import React from 'react';
...
\`\`\`

## Schema Config

\`\`\`json
{...}
\`\`\``}
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
