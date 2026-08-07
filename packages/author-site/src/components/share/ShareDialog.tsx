"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-provider";
import { projectApiClient, ProjectApiError } from "@/lib/project-api";
import { getViewerBaseUrl } from "@/lib/viewer-url";
import { Copy, Loader2, Share2 } from "lucide-react";

type ShareTab = "edit" | "view";
type PublishState = "idle" | "checking" | "publishing" | "published" | "error";

interface ShareDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ projectId, open, onOpenChange }: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<ShareTab>("edit");
  const [publishState, setPublishState] = useState<PublishState>("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const editLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/demo/${projectId}/edit`
      : "";

  const viewerBaseUrl = getViewerBaseUrl();
  const viewLink = viewerBaseUrl
    ? `${viewerBaseUrl.replace(/\/$/, "")}/${projectId}`
    : `/${projectId}`;

  useEffect(() => {
    if (!open) {
      setActiveTab("edit");
      setPublishState("idle");
      setPublishError(null);
      setCopied(false);
    }
  }, [open]);

  const checkPublishStatus = useCallback(async () => {
    setPublishState("checking");
    try {
      const status = await projectApiClient.getPublishStatus(projectId);
      if (status.status === "published") {
        setPublishState("published");
      } else {
        setPublishState("idle");
      }
    } catch {
      setPublishState("error");
      setPublishError("无法获取发布状态");
    }
  }, [projectId]);

  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as ShareTab;
      setActiveTab(tab);
      if (tab === "view") {
        void checkPublishStatus();
      }
    },
    [checkPublishStatus],
  );

  const handlePublish = useCallback(async () => {
    setPublishState("publishing");
    setPublishError(null);
    try {
      await projectApiClient.publishProject(projectId);
      setPublishState("published");
    } catch (error) {
      const message =
        error instanceof ProjectApiError
          ? error.message
          : "发布失败，请重试";
      setPublishState("error");
      setPublishError(message);
    }
  }, [projectId]);

  const handleCopy = useCallback(
    (link: string) => {
      const copyViaInput = (): boolean => {
        const input = linkInputRef.current;
        if (!input) return false;
        try {
          input.focus();
          input.select();
          input.setSelectionRange(0, 99999);
          return document.execCommand("copy");
        } catch {
          return false;
        }
      };

      const showSuccess = () => {
        setCopied(true);
        toast({ title: "已复制" });
        setTimeout(() => setCopied(false), 1500);
      };

      const showError = () => {
        toast({ title: "复制失败，请手动复制", variant: "destructive" });
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
          .writeText(link)
          .then(showSuccess)
          .catch(() => {
            if (copyViaInput()) showSuccess();
            else showError();
          });
        return;
      }

      // 非安全上下文（HTTP LAN）下使用 execCommand。
      // 必须选中弹窗内已渲染的 Input（处于 Dialog focus scope 内），
      // 新建并 focus 一个挂在 body 下的 textarea 会被焦点陷阱抢回焦点导致复制失败。
      if (copyViaInput()) showSuccess();
      else showError();
    },
    [toast],
  );

  const currentLink = activeTab === "edit" ? editLink : viewLink;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full">
            <TabsTrigger value="edit" className="flex-1">
              编辑链接
            </TabsTrigger>
            <TabsTrigger value="view" className="flex-1">
              浏览链接
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-4 space-y-3">
          {activeTab === "view" &&
          (publishState === "checking" || publishState === "publishing") ? (
            <div className="flex flex-col items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>
                {publishState === "publishing" ? "发布中..." : "检查发布状态中..."}
              </span>
            </div>
          ) : activeTab === "view" && publishState !== "published" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                项目尚未发布，需要先发布才能获取浏览链接
              </p>
              {publishState === "error" && publishError && (
                <p className="text-sm text-destructive">{publishError}</p>
              )}
              <div className="flex justify-center gap-2">
                {publishState === "error" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkPublishStatus}
                  >
                    刷新状态
                  </Button>
                )}
                <Button size="sm" onClick={handlePublish}>
                  发布并获取链接
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                ref={linkInputRef}
                readOnly
                value={currentLink}
                className="flex-1 font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                size="icon"
                variant="outline"
                className="shrink-0"
                onClick={() => handleCopy(currentLink)}
                disabled={copied}
              >
                {copied ? (
                  <span className="text-xs text-green-600">已复制</span>
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
