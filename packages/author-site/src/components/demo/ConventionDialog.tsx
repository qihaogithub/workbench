"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ScrollText,
  FileText,
  CheckCircle2,
  Loader2,
  Save,
  Plus,
} from "lucide-react";
import { DocumentEditor } from "@workbench/demo-ui";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

type PageItem = { id: string; name: string };

interface ConventionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  pages: PageItem[];
}

export function ConventionDialog({
  open,
  onOpenChange,
  sessionId,
  pages,
}: ConventionDialogProps) {
  const { toast } = useToast();
  const [activeKey, setActiveKey] = useState<"project" | string>("project");
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [setPageKeys, setSetPageKeys] = useState<Set<string>>(new Set());
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const filePath =
    activeKey === "project"
      ? "convention.md"
      : `demos/${activeKey}/convention.md`;

  useEffect(() => {
    if (!open || !sessionId) return;
    setIsLoading(true);
    setIsCreatingNew(false);

    fetch(
      `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const c = data.data.content ?? "";
          setContent(c);
          setSavedContent(c);
          if (activeKey !== "project" && c) {
            setSetPageKeys((prev) => new Set(prev).add(activeKey));
          }
        } else {
          setContent("");
          setSavedContent("");
        }
      })
      .catch(() => {
        setContent("");
        setSavedContent("");
      })
      .finally(() => setIsLoading(false));
  }, [open, activeKey, sessionId, filePath]);

  const isExisting =
    activeKey === "project" || setPageKeys.has(activeKey) || isCreatingNew;
  const showPlaceholder = !isExisting && activeKey !== "project";
  const hasChanges = content !== savedContent;
  const canSave = isExisting && hasChanges && !isSaving;
  const canCreate = showPlaceholder && content !== "" && !isSaving;

  const handleSave = useCallback(async () => {
    if (!sessionId) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      const data = await res.json();
      if (data.success) {
        setSavedContent(content);
        if (activeKey !== "project") {
          setSetPageKeys((prev) => new Set(prev).add(activeKey));
          setIsCreatingNew(false);
        }
        toast({ title: "保存成功" });
      } else {
        toast({
          title: "保存失败",
          description: data.error?.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "保存失败", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, filePath, content, activeKey, toast]);

  const handleCreate = () => {
    setContent("");
    setSavedContent("");
    setIsCreatingNew(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            公约编辑
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex gap-0 border rounded-md overflow-hidden">
          <div className="w-[200px] shrink-0 border-r bg-muted/30">
            <ScrollArea className="h-full">
              <div className="py-1">
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left",
                    activeKey === "project" && "bg-accent",
                  )}
                  onClick={() => setActiveKey("project")}
                >
                  <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">项目公约</span>
                </button>

                <div className="px-3 py-1.5 mt-1 text-[11px] text-muted-foreground font-medium">
                  页面公约
                </div>

                {pages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left",
                      activeKey === page.id && "bg-accent",
                    )}
                    onClick={() => setActiveKey(page.id)}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{page.name}</span>
                    {setPageKeys.has(page.id) && (
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            {isLoading ? (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : showPlaceholder ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
                <ScrollText className="h-8 w-8" />
                <p className="text-sm">本页面暂未设置公约</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreate}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  创建页面公约
                </Button>
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <DocumentEditor
                  key={`${activeKey}-${open}`}
                  value={content}
                  onChange={setContent}
                  format="markdown"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {hasChanges ? "取消（有未保存的更改）" : "关闭"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!(canSave || canCreate)}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
