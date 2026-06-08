"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DemoCard } from "@/components/demo/demo-card";
import { CreateDemoDialog } from "@/components/demo/create-demo-dialog";
import { DeleteConfirmDialog } from "@/components/demo/delete-confirm-dialog";
import { useDemos, createDemo, deleteDemo } from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { SettingsButton } from "@/components/settings/settings-button";
import type { DemoMeta } from "@opencode-workbench/shared";

export function HomePage({ initialDemos }: { initialDemos: DemoMeta[] }) {
  const router = useRouter();
  const { demos, error, revalidate } = useDemos({
    fallbackData: initialDemos,
  });
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DemoMeta | null>(null);

  const filteredDemos = useMemo(() => {
    if (!searchQuery) return demos;
    return demos.filter((demo) =>
      demo.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [demos, searchQuery]);

  // 为无封面的项目自动补生缺失截图
  const ensureTriggeredRef = useRef(false);
  useEffect(() => {
    if (ensureTriggeredRef.current || demos.length === 0) return;
    ensureTriggeredRef.current = true;

    const projectsNeedingScreenshots = demos.filter(
      (d) => !d.thumbnail && d.demoPages && d.demoPages.length > 0,
    );

    if (projectsNeedingScreenshots.length === 0) return;

    let hasGenerated = false;

    // 并行触发所有无封面项目的截图补生
    Promise.all(
      projectsNeedingScreenshots.map((d) =>
        fetch("/api/screenshots/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: d.id }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success && result.data?.generated > 0) {
              hasGenerated = true;
            }
          })
          .catch(() => {
            // 静默失败
          }),
      ),
    ).then(() => {
      // 如果有新截图生成，延迟后刷新列表以展示新截图
      if (hasGenerated) {
        setTimeout(() => revalidate(), 5000);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demos]);

  const handleCreate = async (name: string) => {
    const response = await createDemo(name);
    if (response.success) {
      toast({
        title: "创建成功",
        description: `Demo「${name}」已创建`,
      });
      router.push(`/demo/${response.data.id}/edit`);
    } else {
      toast({
        variant: "destructive",
        title: "创建失败",
        description: response.error.message,
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const response = await deleteDemo(deleteTarget.id);
    if (response.success) {
      toast({
        title: "删除成功",
        description: `Demo「${deleteTarget.name}」已删除`,
      });
      revalidate();
    } else {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: response.error.message,
      });
    }
    setDeleteTarget(null);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-destructive text-lg">加载失败</p>
          <p className="text-muted-foreground mt-2">
            {error instanceof Error ? error.message : "未知错误"}
          </p>
          <Button onClick={() => revalidate()} className="mt-4">
            重试
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center px-4">
          {/* 左侧品牌标识 */}
          <div className="flex items-center gap-2 mr-8">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
              <span className="text-sm font-bold text-primary-foreground">
                UI
              </span>
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Demo Studio
            </span>
          </div>

          {/* 搜索框 - 居中 */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索项目..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 h-10 bg-muted/50 border-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring transition-all"
            />
          </div>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              size="sm"
              className="gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              添加项目
            </Button>
            <SettingsButton />
          </div>
        </div>
      </header>

      <main className="container py-8 px-4 space-y-8">
        {filteredDemos.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-muted-foreground text-lg">
              {searchQuery ? "没有找到匹配的项目" : "暂无项目"}
            </div>
            <div className="text-muted-foreground/70 text-sm mt-1">
              {searchQuery ? "尝试其他关键词" : "点击「添加项目」开始创建"}
            </div>
            {!searchQuery && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="mt-6 gap-2"
              >
                <Plus className="h-4 w-4" />
                创建第一个项目
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredDemos.map((demo) => (
              <DemoCard
                key={demo.id}
                demo={demo}
                onDelete={() => setDeleteTarget(demo)}
              />
            ))}
          </div>
        )}

        <CreateDemoDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          onCreate={handleCreate}
        />

        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onConfirm={handleDelete}
          demoName={deleteTarget?.name || ""}
        />
      </main>
    </div>
  );
}
