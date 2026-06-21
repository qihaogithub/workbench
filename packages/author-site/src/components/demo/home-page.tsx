"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DemoCard } from "@/components/demo/demo-card";
import { CreateDemoDialog } from "@/components/demo/create-demo-dialog";
import { DeleteConfirmDialog } from "@/components/demo/delete-confirm-dialog";
import { SaveTemplateDialog } from "@/components/demo/save-template-dialog";
import { SettingsButton } from "@/components/settings/settings-button";
import { useToast } from "@/components/ui/toast-provider";
import {
  createDemo,
  deleteDemo,
  recommendProjectTemplate,
  saveDemoAsTemplate,
  useDemos,
  useProjectTemplates,
} from "@/lib/api";
import type { DemoMeta } from "@opencode-workbench/shared";

export function HomePage({ initialDemos }: { initialDemos: DemoMeta[] }) {
  const router = useRouter();
  const { demos, error, revalidate } = useDemos({
    fallbackData: initialDemos,
  });
  const { templates, revalidate: revalidateTemplates } = useProjectTemplates();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DemoMeta | null>(null);
  const [templateTarget, setTemplateTarget] = useState<DemoMeta | null>(null);

  const filteredDemos = useMemo(() => {
    if (!searchQuery) return demos;
    return demos.filter((demo) =>
      demo.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [demos, searchQuery]);

  const handleCreate = async (input: { name: string; templateId?: string }) => {
    const response = await createDemo(input.name, input.templateId);
    if (response.success) {
      toast({
        title: "创建成功",
        description: `项目「${input.name}」已创建`,
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

  const handleSaveTemplate = async (input: {
    category: string;
    name: string;
    description: string;
  }) => {
    if (!templateTarget) return;

    const response = await saveDemoAsTemplate(templateTarget.id, input);
    if (response.success) {
      toast({
        title: "保存成功",
        description: `模板「${input.name}」已创建`,
      });
      revalidateTemplates();
    } else {
      toast({
        variant: "destructive",
        title: "保存失败",
        description: response.error.message,
      });
    }
    setTemplateTarget(null);
  };

  const handleRecommendTemplate = async (description: string) => {
    const response = await recommendProjectTemplate(description);
    if (response.success) return response.data;

    toast({
      variant: "destructive",
      title: "推荐失败",
      description: response.error.message,
    });
    throw new Error(response.error.message);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const response = await deleteDemo(deleteTarget.id);
    if (response.success) {
      toast({
        title: "删除成功",
        description: `项目「${deleteTarget.name}」已删除`,
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
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-destructive">加载失败</p>
          <p className="mt-2 text-muted-foreground">
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
          <div className="mr-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 shadow-sm">
              <span className="text-sm font-bold text-primary-foreground">
                UI
              </span>
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Demo Studio
            </span>
          </div>

          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索项目..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-10 rounded-lg border-0 bg-muted/50 pl-9 pr-4 transition-all focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
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

      <main className="container space-y-8 px-4 py-8">
        {filteredDemos.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-lg text-muted-foreground">
              {searchQuery ? "没有找到匹配的项目" : "暂无项目"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground/70">
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredDemos.map((demo) => (
              <DemoCard
                key={demo.id}
                demo={demo}
                onDelete={() => setDeleteTarget(demo)}
                onSaveAsTemplate={() => setTemplateTarget(demo)}
              />
            ))}
          </div>
        )}

        <CreateDemoDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          templates={templates}
          onCreate={handleCreate}
          onRecommendTemplate={handleRecommendTemplate}
        />

        <SaveTemplateDialog
          open={!!templateTarget}
          onOpenChange={(open) => !open && setTemplateTarget(null)}
          demo={templateTarget}
          onSave={handleSaveTemplate}
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
