"use client";

import { useState, useMemo } from "react";
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
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 items-center px-4 gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <Input
              placeholder="搜索 Demo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            新建 Demo
          </Button>
          <SettingsButton />
        </div>
      </header>

      <main className="container py-6 px-4 space-y-8">
        {filteredDemos.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <div className="text-muted-foreground text-lg">
              {searchQuery ? "没有找到匹配的 Demo" : "暂无 Demo"}
            </div>
            {!searchQuery && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="mt-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                创建第一个 Demo
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
