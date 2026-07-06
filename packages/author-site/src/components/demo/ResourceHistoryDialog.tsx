"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { GitCommitHorizontal, Loader2, RotateCcw } from "lucide-react";
import type { ProjectResourceKind, ResourceVersion } from "@workbench/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast-provider";

interface ResourceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  kind: ProjectResourceKind;
  resourceId: string;
  title: string;
  workspaceId?: string;
  sessionId?: string;
  onRestored?: () => void | Promise<void>;
}

interface ResourceVersionHistoryResponse {
  versions: ResourceVersion[];
  currentVersion?: string;
}

export function ResourceHistoryDialog({
  open,
  onOpenChange,
  projectId,
  kind,
  resourceId,
  title,
  workspaceId,
  sessionId,
  onRestored,
}: ResourceHistoryDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [versions, setVersions] = useState<ResourceVersion[]>([]);

  const restoreLabel = useMemo(() => {
    if (kind === "knowledge_document") return "恢复此文档内容";
    if (kind === "page") return "恢复此页面";
    if (kind === "canvas") return "恢复画布布局";
    return "恢复此资源";
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}/resources/${kind}/${resourceId}/versions`)
      .then((response) => response.json())
      .then((payload: { success?: boolean; data?: ResourceVersionHistoryResponse; error?: { message?: string } }) => {
        if (!payload.success || !payload.data) {
          throw new Error(payload.error?.message ?? "读取资源历史失败");
        }
        setVersions(payload.data.versions);
      })
      .catch((error) => {
        toast({
          title: "读取历史失败",
          description: error instanceof Error ? error.message : "未知错误",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [kind, open, projectId, resourceId, toast]);

  const restoreVersion = async (versionId: string) => {
    setRestoring(versionId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/resources/${kind}/${resourceId}/versions/${versionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, sessionId }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? "恢复失败");
      }
      toast({ title: "恢复成功" });
      await onRestored?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "恢复失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>默认展示用户可见的语义历史。</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[52vh] pr-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无历史版本</div>
          ) : (
            <div className="space-y-2">
              {versions.map((version) => (
                <div key={version.id} className="rounded-md border p-3">
                  <div className="flex items-start gap-3">
                    <GitCommitHorizontal className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="truncate text-sm font-medium">{version.note || version.id}</div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{version.source}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {format(version.createdAt, "yyyy-MM-dd HH:mm", { locale: zhCN })} · {version.createdBy}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5"
                      disabled={restoring === version.id}
                      onClick={() => restoreVersion(version.id)}
                    >
                      {restoring === version.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      {restoreLabel}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
