"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  Folder,
  LayoutGrid,
  Search,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CoverImageDialog } from "@/components/cover-image-dialog";
import { DemoCard, TemplateProjectCard } from "@/components/demo/demo-card";
import { DeleteConfirmDialog } from "@/components/demo/delete-confirm-dialog";
import {
  ProjectNameCategoryDialog,
  type ProjectNameCategoryValue,
} from "@/components/demo/project-name-category-dialog";
import { SaveTemplateDialog } from "@/components/demo/save-template-dialog";
import { SettingsButton } from "@/components/settings/settings-button";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";
import {
  createDemo,
  convertProjectTemplate,
  deleteDemo,
  deleteProjectTemplate,
  deleteTemplateCover,
  duplicateDemo,
  saveDemoAsTemplate,
  updateProjectTemplate,
  updateDemo,
  uploadTemplateCover,
  useDemos,
  useProjectTemplates,
} from "@/lib/api";
import type { DemoMeta, ProjectTemplateMeta } from "@workbench/shared";

const DEFAULT_CATEGORY = "未分类";
type SelectedNav =
  | { type: "all" }
  | { type: "project-category"; category: string; exact?: boolean }
  | { type: "templates" }
  | { type: "template-category"; category: string; exact?: boolean };

type DialogAction =
  | { type: "blank" }
  | { type: "duplicate-project"; project: DemoMeta }
  | { type: "duplicate-template"; template: ProjectTemplateMeta }
  | { type: "rename-project"; project: DemoMeta }
  | { type: "change-category"; project: DemoMeta }
  | { type: "rename-template"; template: ProjectTemplateMeta }
  | { type: "change-template-category"; template: ProjectTemplateMeta }
  | null;

function normalizeCategory(category?: string): string {
  return category?.trim() || DEFAULT_CATEGORY;
}

function normalizeCategoryPath(raw: string): { value?: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: "分类不能为空" };
  }

  const parts = trimmed.split("/").map((part) => part.trim());
  if (parts.some((part) => !part)) {
    return { error: "分类路径不能包含空层级" };
  }

  return { value: parts.join("/") };
}

function formatCategoryPath(value: string): string {
  const normalized = normalizeCategoryPath(value);
  return (normalized.value ?? normalizeCategory(value))
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ");
}

interface CategoryTreeNode {
  label: string;
  value: string;
  children: Array<{ label: string; value: string }>;
}

function buildCategoryTree(categories: string[]): CategoryTreeNode[] {
  const nodeMap = new Map<string, CategoryTreeNode>();

  categories.forEach((category) => {
    const normalized =
      normalizeCategoryPath(category).value ?? normalizeCategory(category);
    const [parent, ...rest] = normalized.split("/");
    if (!parent) return;

    const node =
      nodeMap.get(parent) ??
      {
        label: parent,
        value: parent,
        children: [],
      };

    if (rest.length > 0) {
      node.children.push({
        label: rest.join(" / "),
        value: normalized,
      });
    }

    nodeMap.set(parent, node);
  });

  return Array.from(nodeMap.values())
    .map((node) => ({
      ...node,
      children: Array.from(
        new Map(node.children.map((child) => [child.value, child])).values(),
      ).sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

function uniqueCategories(categories: string[]): string[] {
  return Array.from(
    new Set(
      categories.map((category) => {
        const normalized = normalizeCategoryPath(normalizeCategory(category));
        return normalized.value ?? normalizeCategory(category);
      }),
    ),
  ).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function matchesCategorySelection(
  category: string | undefined,
  selected: { category: string; exact?: boolean },
): boolean {
  const normalized = normalizeCategory(category);
  if (selected.exact) {
    return normalized === selected.category;
  }

  return (
    normalized === selected.category ||
    normalized.startsWith(`${selected.category}/`)
  );
}

function BlankProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left"
      aria-label="添加空白项目"
    >
      <Card className="overflow-hidden border-dashed border-border/70 bg-card transition-all duration-300 hover:border-primary/70 hover:bg-accent/30">
        <div className="flex aspect-video items-center justify-center bg-muted/40">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-background/70 transition-transform duration-300 group-hover:scale-105">
            <FilePlus className="h-7 w-7 text-muted-foreground" />
          </div>
        </div>
        <CardContent className="p-4">
          <div className="text-base font-medium text-foreground">空白项目</div>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            从零开始搭建页面结构
          </p>
        </CardContent>
      </Card>
    </button>
  );
}

function NavButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full min-w-max items-center gap-2 rounded-md px-3 text-left text-sm transition-colors hover:bg-accent md:min-w-0",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" && (
        <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

export function HomePage({ initialDemos }: { initialDemos: DemoMeta[] }) {
  const router = useRouter();
  const { demos, error, revalidate } = useDemos({
    fallbackData: initialDemos,
  });
  const { templates, revalidate: revalidateTemplates } = useProjectTemplates();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNav, setSelectedNav] = useState<SelectedNav>({ type: "all" });
  const [templatesExpanded, setTemplatesExpanded] = useState(true);
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [isSubmittingDialog, setIsSubmittingDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DemoMeta | null>(null);
  const [templateDeleteTarget, setTemplateDeleteTarget] =
    useState<ProjectTemplateMeta | null>(null);
  const [templateTarget, setTemplateTarget] = useState<DemoMeta | null>(null);
  const [coverTarget, setCoverTarget] = useState<DemoMeta | null>(null);
  const [templateCoverTarget, setTemplateCoverTarget] =
    useState<ProjectTemplateMeta | null>(null);
  const [screenshotRevision, setScreenshotRevision] = useState(0);

  const projectCategories = useMemo(
    () => uniqueCategories(demos.map((demo) => normalizeCategory(demo.category))),
    [demos],
  );
  const templateCategories = useMemo(
    () => uniqueCategories(templates.map((template) => template.category)),
    [templates],
  );
  const categoryOptions = useMemo(
    () => uniqueCategories([...projectCategories, ...templateCategories]),
    [projectCategories, templateCategories],
  );
  const projectCategoryTree = useMemo(
    () => buildCategoryTree(projectCategories),
    [projectCategories],
  );
  const templateCategoryTree = useMemo(
    () => buildCategoryTree(templateCategories),
    [templateCategories],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredDemos = useMemo(() => {
    return demos.filter((demo) => {
      const category = normalizeCategory(demo.category);
      const matchesNav =
        selectedNav.type === "all" ||
        (selectedNav.type === "project-category" &&
          matchesCategorySelection(category, selectedNav));
      const matchesSearch =
        !normalizedQuery ||
        [demo.name, category, formatCategoryPath(category)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesNav && matchesSearch;
    });
  }, [demos, normalizedQuery, selectedNav]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesNav =
        selectedNav.type === "all" ||
        selectedNav.type === "templates" ||
        (selectedNav.type === "template-category" &&
          matchesCategorySelection(template.category, selectedNav));
      const matchesSearch =
        !normalizedQuery ||
        [
          template.name,
          template.description,
          template.category,
          formatCategoryPath(template.category),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesNav && matchesSearch;
    });
  }, [normalizedQuery, selectedNav, templates]);

  const showProjects =
    selectedNav.type === "all" || selectedNav.type === "project-category";
  const showTemplates =
    selectedNav.type === "all" ||
    selectedNav.type === "templates" || selectedNav.type === "template-category";
  const shouldRenderTemplateSection =
    selectedNav.type !== "all" || filteredTemplates.length > 0;

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
      if (hasGenerated) {
        setTimeout(() => {
          setScreenshotRevision(Date.now());
          revalidate();
        }, 5000);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demos]);

  const handleCreateBlank = async (input: ProjectNameCategoryValue) => {
    const response = await createDemo(input.name, input.category);
    if (response.success) {
      toast({
        title: "创建成功",
        description: `项目「${input.name}」已创建`,
      });
      router.push(`/demo/${response.data.id}/edit`);
      return;
    }

    toast({
      variant: "destructive",
      title: "创建失败",
      description: response.error.message,
    });
  };

  const handleDuplicateProject = async (
    project: DemoMeta,
    input: ProjectNameCategoryValue,
  ) => {
    const response = await duplicateDemo(project.id, input);
    if (response.success) {
      toast({
        title: "复制成功",
        description: `项目「${input.name}」已创建`,
      });
      router.push(`/demo/${response.data.id}/edit`);
      return;
    }

    toast({
      variant: "destructive",
      title: "复制失败",
      description: response.error.message,
    });
  };

  const handleDuplicateTemplate = async (
    template: ProjectTemplateMeta,
    input: ProjectNameCategoryValue,
  ) => {
    const response = await createDemo(input.name, input.category, template.id);
    if (response.success) {
      toast({
        title: "创建成功",
        description: `已基于模板「${template.name}」创建项目`,
      });
      router.push(`/demo/${response.data.id}/edit`);
      return;
    }

    toast({
      variant: "destructive",
      title: "创建失败",
      description: response.error.message,
    });
  };

  const handleRenameProject = async (
    project: DemoMeta,
    input: ProjectNameCategoryValue,
  ) => {
    const response = await updateDemo(project.id, { name: input.name });
    if (response.success) {
      toast({
        title: "更新成功",
        description: `项目已重命名为「${input.name}」`,
      });
      revalidate();
      return;
    }

    toast({
      variant: "destructive",
      title: "更新失败",
      description: response.error.message,
    });
  };

  const handleChangeCategory = async (
    project: DemoMeta,
    input: ProjectNameCategoryValue,
  ) => {
    const response = await updateDemo(project.id, { category: input.category });
    if (response.success) {
      toast({
        title: "更新成功",
        description: `项目已移动到「${input.category}」`,
      });
      revalidate();
      return;
    }

    toast({
      variant: "destructive",
      title: "更新失败",
      description: response.error.message,
    });
  };

  const handleRenameTemplate = async (
    template: ProjectTemplateMeta,
    input: ProjectNameCategoryValue,
  ) => {
    const response = await updateProjectTemplate(template.id, {
      name: input.name,
    });
    if (response.success) {
      toast({
        title: "更新成功",
        description: `模板已重命名为「${input.name}」`,
      });
      revalidateTemplates();
      return;
    }

    toast({
      variant: "destructive",
      title: "更新失败",
      description: response.error.message,
    });
  };

  const handleChangeTemplateCategory = async (
    template: ProjectTemplateMeta,
    input: ProjectNameCategoryValue,
  ) => {
    const response = await updateProjectTemplate(template.id, {
      category: input.category,
    });
    if (response.success) {
      toast({
        title: "更新成功",
        description: `模板已移动到「${input.category}」`,
      });
      revalidateTemplates();
      return;
    }

    toast({
      variant: "destructive",
      title: "更新失败",
      description: response.error.message,
    });
  };

  const handleDialogSubmit = async (input: ProjectNameCategoryValue) => {
    if (!dialogAction) return;
    setIsSubmittingDialog(true);
    try {
      if (dialogAction.type === "blank") {
        await handleCreateBlank(input);
      } else if (dialogAction.type === "duplicate-project") {
        await handleDuplicateProject(dialogAction.project, input);
      } else if (dialogAction.type === "duplicate-template") {
        await handleDuplicateTemplate(dialogAction.template, input);
      } else if (dialogAction.type === "rename-project") {
        await handleRenameProject(dialogAction.project, input);
      } else if (dialogAction.type === "rename-template") {
        await handleRenameTemplate(dialogAction.template, input);
      } else if (dialogAction.type === "change-template-category") {
        await handleChangeTemplateCategory(dialogAction.template, input);
      } else if (dialogAction.type === "change-category") {
        await handleChangeCategory(dialogAction.project, input);
      } else {
        const _exhaustive: never = dialogAction;
        return _exhaustive;
      }
      setDialogAction(null);
    } finally {
      setIsSubmittingDialog(false);
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
        description: `项目「${input.name}」已设为模板`,
      });
      revalidate();
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

  const handleDeleteTemplate = async () => {
    if (!templateDeleteTarget) return;

    const response = await deleteProjectTemplate(templateDeleteTarget.id);
    if (response.success) {
      toast({
        title: "删除成功",
        description: `模板项目「${templateDeleteTarget.name}」已删除`,
      });
      revalidate();
      revalidateTemplates();
    } else {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: response.error.message,
      });
    }
    setTemplateDeleteTarget(null);
  };

  const handleConvertTemplateToProject = async (template: ProjectTemplateMeta) => {
    const response = await convertProjectTemplate(template.id);
    if (response.success) {
      toast({
        title: "转换成功",
        description: `模板「${template.name}」已转为普通项目`,
      });
      revalidate();
      revalidateTemplates();
      return;
    }

    toast({
      variant: "destructive",
      title: "转换失败",
      description: response.error.message,
    });
  };

  const dialogTitle =
    dialogAction?.type === "rename-project"
      ? "修改项目名称"
      : dialogAction?.type === "rename-template"
        ? "修改模板名称"
      : dialogAction?.type === "change-category"
        ? "修改项目分类"
        : dialogAction?.type === "change-template-category"
          ? "修改模板分类"
          : dialogAction?.type === "duplicate-project"
      ? "复制当前项目"
      : dialogAction?.type === "duplicate-template"
        ? "使用此模板新建"
        : "新建空白项目";
  const dialogDescription =
    dialogAction?.type === "rename-project"
      ? `更新「${dialogAction.project.name}」的显示名称。`
      : dialogAction?.type === "rename-template"
        ? `更新模板「${dialogAction.template.name}」的显示名称。`
      : dialogAction?.type === "change-category"
        ? `更新「${dialogAction.project.name}」所在的首页分类。`
        : dialogAction?.type === "change-template-category"
          ? `更新模板「${dialogAction.template.name}」所在的首页分类。`
        : dialogAction?.type === "duplicate-project"
      ? `将复制「${dialogAction.project.name}」为独立项目。`
      : dialogAction?.type === "duplicate-template"
        ? `将使用模板「${dialogAction.template.name}」创建独立项目。`
        : "创建一个不包含页面的空白项目。";
  const dialogDefaultName =
    dialogAction?.type === "rename-project"
      ? dialogAction.project.name
      : dialogAction?.type === "rename-template"
        ? dialogAction.template.name
      : dialogAction?.type === "change-category"
        ? dialogAction.project.name
        : dialogAction?.type === "change-template-category"
          ? dialogAction.template.name
        : dialogAction?.type === "duplicate-project"
      ? `${dialogAction.project.name} 副本`
      : dialogAction?.type === "duplicate-template"
        ? dialogAction.template.name
        : "";
  const dialogDefaultCategory =
    dialogAction?.type === "rename-project"
      ? normalizeCategory(dialogAction.project.category)
      : dialogAction?.type === "rename-template"
        ? normalizeCategory(dialogAction.template.category)
      : dialogAction?.type === "change-category"
        ? normalizeCategory(dialogAction.project.category)
        : dialogAction?.type === "change-template-category"
          ? normalizeCategory(dialogAction.template.category)
        : dialogAction?.type === "duplicate-project"
      ? normalizeCategory(dialogAction.project.category)
      : dialogAction?.type === "duplicate-template"
        ? normalizeCategory(dialogAction.template.category)
        : DEFAULT_CATEGORY;
  const dialogFields =
    dialogAction?.type === "rename-project" ||
    dialogAction?.type === "rename-template"
      ? "name"
      : dialogAction?.type === "change-category" ||
          dialogAction?.type === "change-template-category"
        ? "category"
        : "both";
  const dialogSubmitLabel =
    dialogAction?.type === "blank"
      ? "创建项目"
      : dialogAction?.type === "rename-project" ||
          dialogAction?.type === "rename-template" ||
          dialogAction?.type === "change-category" ||
          dialogAction?.type === "change-template-category"
        ? "保存"
        : dialogAction?.type === "duplicate-project"
          ? "复制项目"
        : "创建项目";
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
          <div className="mr-8 flex items-center">
            <span className="oneflow-wordmark text-lg font-semibold tracking-tight">
              OneFlow
            </span>
          </div>

          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索项目或模板..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-10 rounded-lg border-0 bg-muted/50 pl-9 pr-4 transition-all focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/cli">
                <Terminal className="h-4 w-4" />
                CLI
              </Link>
            </Button>
            <SettingsButton />
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-w-0 md:sticky md:top-24 md:self-start">
            <nav
              aria-label="项目目录"
              className="flex gap-2 overflow-x-auto border-b pb-3 md:flex-col md:overflow-visible md:border-b-0 md:pb-0"
            >
              <NavButton
                active={selectedNav.type === "all"}
                icon={<LayoutGrid className="h-4 w-4 shrink-0" />}
                label="全部项目"
                count={demos.length}
                onClick={() => setSelectedNav({ type: "all" })}
              />
              {projectCategoryTree.map((category) => (
                <div key={category.value} className="min-w-max md:min-w-0">
                  <NavButton
                    active={
                      selectedNav.type === "project-category" &&
                      selectedNav.category === category.value &&
                      !selectedNav.exact
                    }
                    icon={<Folder className="h-4 w-4 shrink-0" />}
                    label={category.label}
                    count={
                      demos.filter((demo) =>
                        matchesCategorySelection(demo.category, {
                          category: category.value,
                        }),
                      ).length
                    }
                    onClick={() =>
                      setSelectedNav({
                        type: "project-category",
                        category: category.value,
                      })
                    }
                  />
                  {category.children.map((child) => (
                    <button
                      key={child.value}
                      type="button"
                      onClick={() =>
                        setSelectedNav({
                          type: "project-category",
                          category: child.value,
                          exact: true,
                        })
                      }
                      className={cn(
                        "mt-1 flex h-8 w-full min-w-max items-center gap-2 rounded-md px-3 text-left text-sm transition-colors hover:bg-accent md:ml-5 md:min-w-0",
                        selectedNav.type === "project-category" &&
                          selectedNav.category === child.value &&
                          selectedNav.exact
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {child.label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {
                          demos.filter((demo) =>
                            matchesCategorySelection(demo.category, {
                              category: child.value,
                              exact: true,
                            }),
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setTemplatesExpanded((current) => !current);
                  setSelectedNav({ type: "templates" });
                }}
                className={cn(
                  "flex h-9 w-full min-w-max items-center gap-2 rounded-md px-3 text-left text-sm transition-colors hover:bg-accent md:min-w-0",
                  selectedNav.type === "templates" ||
                    selectedNav.type === "template-category"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                {templatesExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">模板</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {templates.length}
                </span>
              </button>
              {templatesExpanded &&
                templateCategoryTree.map((category) => (
                  <div key={category.value} className="min-w-max md:min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedNav({
                        type: "template-category",
                        category: category.value,
                      })
                    }
                    className={cn(
                      "flex h-8 min-w-max items-center gap-2 rounded-md px-3 text-left text-sm transition-colors hover:bg-accent md:ml-5 md:min-w-0",
                      selectedNav.type === "template-category" &&
                        selectedNav.category === category.value &&
                        !selectedNav.exact
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {category.label}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {
                        templates.filter(
                          (template) =>
                            matchesCategorySelection(template.category, {
                              category: category.value,
                            }),
                        ).length
                      }
                    </span>
                  </button>
                    {category.children.map((child) => (
                      <button
                        key={child.value}
                        type="button"
                        onClick={() =>
                          setSelectedNav({
                            type: "template-category",
                            category: child.value,
                            exact: true,
                          })
                        }
                        className={cn(
                          "mt-1 flex h-8 min-w-max items-center gap-2 rounded-md px-3 text-left text-sm transition-colors hover:bg-accent md:ml-9 md:min-w-0",
                          selectedNav.type === "template-category" &&
                            selectedNav.category === child.value &&
                            selectedNav.exact
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {child.label}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {
                            templates.filter((template) =>
                              matchesCategorySelection(template.category, {
                                category: child.value,
                                exact: true,
                              }),
                            ).length
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
            </nav>
          </aside>

          <section className="min-w-0 space-y-8">
            {showProjects && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <BlankProjectCard onClick={() => setDialogAction({ type: "blank" })} />
                {filteredDemos.map((demo) => (
                  <DemoCard
                    key={demo.id}
                    demo={demo}
                    screenshotRevision={screenshotRevision}
                    onDelete={() => setDeleteTarget(demo)}
                    onSaveAsTemplate={() => setTemplateTarget(demo)}
                    onDuplicate={() =>
                      setDialogAction({ type: "duplicate-project", project: demo })
                    }
                    onRename={() =>
                      setDialogAction({ type: "rename-project", project: demo })
                    }
                    onChangeCategory={() =>
                      setDialogAction({ type: "change-category", project: demo })
                    }
                    onChangeCover={() => setCoverTarget(demo)}
                  />
                ))}
              </div>
            )}

            {showTemplates && shouldRenderTemplateSection && (
              <div className="space-y-4">
                {filteredTemplates.length === 0 ? (
                  <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    {searchQuery ? "没有找到匹配的模板" : "暂无模板"}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredTemplates.map((template) => (
                      <TemplateProjectCard
                        key={template.id}
                        template={template}
                        screenshotRevision={screenshotRevision}
                        onDuplicate={(item) =>
                          setDialogAction({
                            type: "duplicate-template",
                            template: item,
                          })
                        }
                        onRename={(item) =>
                          setDialogAction({
                            type: "rename-template",
                            template: item,
                          })
                        }
                        onChangeCategory={(item) =>
                          setDialogAction({
                            type: "change-template-category",
                            template: item,
                          })
                        }
                        onChangeCover={(item) => setTemplateCoverTarget(item)}
                        onConvertToProject={handleConvertTemplateToProject}
                        onDelete={(item) => setTemplateDeleteTarget(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <ProjectNameCategoryDialog
          open={!!dialogAction}
          title={dialogTitle}
          description={dialogDescription}
          submitLabel={dialogSubmitLabel}
          fields={dialogFields}
          defaultName={dialogDefaultName}
          defaultCategory={dialogDefaultCategory}
          categories={categoryOptions}
          isSubmitting={isSubmittingDialog}
          onOpenChange={(open) => !open && setDialogAction(null)}
          onSubmit={handleDialogSubmit}
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

        <DeleteConfirmDialog
          open={!!templateDeleteTarget}
          onOpenChange={(open) => !open && setTemplateDeleteTarget(null)}
          onConfirm={handleDeleteTemplate}
          demoName={templateDeleteTarget?.name || ""}
        />

        {coverTarget && (
          <CoverImageDialog
            open={!!coverTarget}
            onOpenChange={(open) => !open && setCoverTarget(null)}
            projectId={coverTarget.id}
            currentThumbnail={coverTarget.thumbnail}
            onThumbnailChange={() => {
              revalidate();
              setCoverTarget(null);
            }}
          />
        )}

        {templateCoverTarget && (
          <CoverImageDialog
            open={!!templateCoverTarget}
            onOpenChange={(open) => !open && setTemplateCoverTarget(null)}
            projectId={templateCoverTarget.id}
            currentThumbnail={templateCoverTarget.thumbnail}
            onUpload={(file) => uploadTemplateCover(templateCoverTarget.id, file)}
            onDelete={() => deleteTemplateCover(templateCoverTarget.id)}
            onThumbnailChange={() => {
              revalidateTemplates();
              setTemplateCoverTarget(null);
            }}
          />
        )}
      </main>
    </div>
  );
}
