"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DemoPageMeta, ProjectType } from "@workbench/shared";
import { Loader2 } from "lucide-react";
import { CoverImageSettingsPanel } from "@/components/cover-image-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-provider";

type EditorRole = "admin" | "editor" | "creator" | "readonly" | "";

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currentThumbnail?: string;
  onThumbnailChange: (thumbnail: string | null) => void;
  currentUserRole: EditorRole;
  projectType: ProjectType;
  pages: DemoPageMeta[];
  onSettingsSaved: () => void;
}

async function readResponse(response: Response): Promise<{ success: boolean; error?: { message?: string } }> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    return { success: false, error: { message: body?.error?.message || "保存失败" } };
  }
  return { success: true };
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  projectId,
  currentThumbnail,
  onThumbnailChange,
  currentUserRole,
  projectType,
  pages,
  onSettingsSaved,
}: ProjectSettingsDialogProps) {
  const { toast } = useToast();
  const isAdmin = currentUserRole === "admin";
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isSavingProjectType, setIsSavingProjectType] = useState(false);
  const [isSavingPages, setIsSavingPages] = useState(false);

  useEffect(() => {
    if (open) setSelectedPageIds(new Set());
  }, [open]);

  const selectedCount = selectedPageIds.size;
  const selectedAreAllTemplatePages = useMemo(
    () => selectedCount > 0 && pages.filter((page) => selectedPageIds.has(page.id)).every((page) => page.isTemplatePage),
    [pages, selectedPageIds, selectedCount],
  );

  const saveProjectType = useCallback(async (isTemplate: boolean) => {
    setIsSavingProjectType(true);
    try {
      const result = await readResponse(await fetch(`/api/demos/${encodeURIComponent(projectId)}/template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTemplate }),
      }));
      if (!result.success) throw new Error(result.error?.message);
      toast({ title: isTemplate ? "已设为模板项目" : "已取消模板项目" });
      onSettingsSaved();
    } catch (error) {
      toast({ title: "项目模板设置失败", description: error instanceof Error ? error.message : "网络错误", variant: "destructive" });
    } finally {
      setIsSavingProjectType(false);
    }
  }, [onSettingsSaved, projectId, toast]);

  const savePages = useCallback(async (isTemplatePage: boolean) => {
    const pageIds = [...selectedPageIds];
    if (pageIds.length === 0) return;
    setIsSavingPages(true);
    try {
      const result = await readResponse(await fetch(`/api/demos/${encodeURIComponent(projectId)}/template-pages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageIds, isTemplatePage }),
      }));
      if (!result.success) throw new Error(result.error?.message);
      toast({ title: isTemplatePage ? "页面已设为模板页" : "页面已取消模板页" });
      setSelectedPageIds(new Set());
      onSettingsSaved();
    } catch (error) {
      toast({ title: "模板页设置失败", description: error instanceof Error ? error.message : "网络错误", variant: "destructive" });
    } finally {
      setIsSavingPages(false);
    }
  }, [onSettingsSaved, projectId, selectedPageIds, toast]);

  const togglePage = useCallback((pageId: string) => {
    setSelectedPageIds((previous) => {
      const next = new Set(previous);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>项目设置</DialogTitle>
          <DialogDescription>管理项目封面{isAdmin ? "及模板页规则" : "。"}</DialogDescription>
        </DialogHeader>

        <CoverImageSettingsPanel
          projectId={projectId}
          currentThumbnail={currentThumbnail}
          onThumbnailChange={onThumbnailChange}
        />

        {isAdmin && (
          <section className="space-y-4 border-t pt-5" aria-labelledby="project-template-settings-title">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 id="project-template-settings-title" className="text-sm font-medium">模板设置</h3>
                <p className="mt-1 text-sm text-muted-foreground">模板项目的现有页面会自动设为模板页；取消项目模板不会改变已有页面标记。</p>
              </div>
              <Switch
                aria-label="设为模板项目"
                checked={projectType === "template"}
                disabled={isSavingProjectType}
                onCheckedChange={saveProjectType}
              />
            </div>

            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <p className="text-sm font-medium">页面模板标记</p>
                <span className="text-xs text-muted-foreground">已选择 {selectedCount} 页</span>
              </div>
              <div className="max-h-56 divide-y overflow-y-auto">
                {pages.map((page) => (
                  <label key={page.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      aria-label={`选择页面 ${page.name}`}
                      className="h-4 w-4 rounded border-input"
                      checked={selectedPageIds.has(page.id)}
                      onChange={() => togglePage(page.id)}
                      disabled={isSavingPages}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{page.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{page.routeKey || `/${page.id}`}</span>
                    </span>
                    <span className={page.isTemplatePage ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
                      {page.isTemplatePage ? "模板页" : "普通页"}
                    </span>
                  </label>
                ))}
                {pages.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">暂无页面</p>}
              </div>
              <div className="flex justify-end gap-2 border-t p-3">
                <Button variant="outline" size="sm" disabled={selectedCount === 0 || isSavingPages || selectedAreAllTemplatePages} onClick={() => savePages(true)}>
                  {isSavingPages ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  设为模板页
                </Button>
                <Button variant="outline" size="sm" disabled={selectedCount === 0 || isSavingPages} onClick={() => savePages(false)}>
                  取消模板页
                </Button>
              </div>
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
