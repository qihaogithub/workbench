"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FilePlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ProjectTemplateMeta } from "@opencode-workbench/shared";

interface TemplateRecommendation {
  templateId: string;
  reason: string;
  confidence: number;
  template?: ProjectTemplateMeta;
}

interface CreateDemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ProjectTemplateMeta[];
  onCreate: (input: { name: string; templateId?: string }) => Promise<void>;
  onRecommendTemplate: (description: string) => Promise<TemplateRecommendation>;
}

const ALL_CATEGORIES = "全部";

function EmptyState({ description }: { description: string }) {
  return (
    <div className="flex min-h-[164px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 text-center">
      <div className="text-sm font-medium text-foreground">没有匹配的模板</div>
      <div className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </div>
    </div>
  );
}

function BlankTemplateCard({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-[164px] cursor-pointer flex-col items-center justify-center rounded-lg border p-4 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/10" : "border-border bg-background",
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-muted/30">
        <FilePlus className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm font-medium">
        空白项目
        {selected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
      </div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">
        从零开始搭建页面结构
      </div>
    </button>
  );
}

function TemplateCard({
  template,
  selected,
  recommended,
  onSelect,
}: {
  template: ProjectTemplateMeta;
  selected: boolean;
  recommended?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-[164px] w-full cursor-pointer flex-col justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/10" : "border-border bg-background",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium">{template.name}</div>
          {recommended && (
            <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              AI 推荐
            </span>
          )}
          {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </div>
        <div className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
          {template.description}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{template.category}</span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5">
          {template.demoCount} 页
        </span>
      </div>
    </button>
  );
}

export function CreateDemoDialog({
  open,
  onOpenChange,
  templates,
  onCreate,
  onRecommendTemplate,
}: CreateDemoDialogProps) {
  const [projectName, setProjectName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [templateQuery, setTemplateQuery] = useState("");
  const [recommendation, setRecommendation] =
    useState<TemplateRecommendation | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const categories = useMemo(
    () => [
      ALL_CATEGORIES,
      ...Array.from(new Set(templates.map((item) => item.category))),
    ],
    [templates],
  );

  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
  const recommendationTemplate =
    recommendation?.template ||
    templates.find((item) => item.id === recommendation?.templateId);
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = templateQuery.trim().toLowerCase();
    return templates.filter((item) => {
      const matchesCategory =
        selectedCategory === ALL_CATEGORIES || item.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!normalizedQuery) return true;
      return [item.name, item.description, item.category]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [selectedCategory, templateQuery, templates]);

  const displayedTemplates = useMemo(() => {
    if (
      !recommendationTemplate ||
      (selectedCategory !== ALL_CATEGORIES &&
        recommendationTemplate.category !== selectedCategory)
    ) {
      return filteredTemplates;
    }

    return [
      recommendationTemplate,
      ...filteredTemplates.filter((item) => item.id !== recommendationTemplate.id),
    ];
  }, [filteredTemplates, recommendationTemplate, selectedCategory]);

  useEffect(() => {
    if (
      selectedTemplateId &&
      !templates.some((template) => template.id === selectedTemplateId)
    ) {
      setSelectedTemplateId(null);
    }
  }, [selectedTemplateId, templates]);

  const closeAndReset = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setProjectName("");
      setSelectedTemplateId(null);
      setSelectedCategory(ALL_CATEGORIES);
      setTemplateQuery("");
      setRecommendation(null);
    }
  };

  const handleBlankSelect = () => {
    setSelectedTemplateId(null);
    setRecommendation(null);
  };

  const handleTemplateSelect = (template: ProjectTemplateMeta) => {
    setSelectedTemplateId(template.id);
    setProjectName((current) => current || template.name);
    if (recommendation?.templateId !== template.id) {
      setRecommendation(null);
    }
  };

  const handleTemplateQueryChange = (value: string) => {
    setTemplateQuery(value);
    if (recommendation) {
      setRecommendation(null);
    }
  };

  useEffect(() => {
    const query = templateQuery.trim();
    if (!open || query.length < 2 || templates.length === 0) {
      setRecommendation(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      onRecommendTemplate(query)
        .then((result) => {
          if (cancelled || templateQuery.trim() !== query) return;
          const template =
            result.template ||
            templates.find((item) => item.id === result.templateId);
          if (template) {
            setSelectedTemplateId(template.id);
          }
          setRecommendation(template ? result : null);
        })
        .catch(() => {
          if (!cancelled) {
            setRecommendation(null);
          }
        });
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [onRecommendTemplate, open, templateQuery, templates]);

  useEffect(() => {
    if (
      recommendation?.templateId &&
      !templates.some((template) => template.id === recommendation.templateId)
    ) {
      setRecommendation(null);
    }
  }, [recommendation, templates]);

  const shouldShowBlankFirst = !recommendationTemplate;
  const shouldShowBlankCard =
    selectedCategory === ALL_CATEGORIES && filteredTemplates.length === templates.length;
  const hasTemplateResults = displayedTemplates.length > 0;
  const hasVisibleCards = shouldShowBlankCard || hasTemplateResults;

  const renderBlankCard = () =>
    shouldShowBlankCard ? (
      <BlankTemplateCard
        selected={!selectedTemplate}
        onSelect={handleBlankSelect}
      />
    ) : null;

  const renderTemplateCards = () =>
    displayedTemplates.map((template) => {
      const isRecommended = template.id === recommendationTemplate?.id;
      return (
        <TemplateCard
          key={template.id}
          template={template}
          selected={template.id === selectedTemplateId}
          recommended={isRecommended}
          onSelect={() => handleTemplateSelect(template)}
        />
      );
    });

  const renderTemplateGrid = () => {
    if (!hasVisibleCards && templates.length > 0) {
      return (
        <div className="sm:col-span-2 lg:col-span-3">
          <EmptyState description="换一个关键词，或清空搜索后查看全部模板。" />
        </div>
      );
    }

    return (
      <>
        {shouldShowBlankFirst && renderBlankCard()}
        {renderTemplateCards()}
        {!shouldShowBlankFirst && renderBlankCard()}
      </>
    );
  };

  const canSubmit = projectName.trim().length > 0;
  const submitHint = selectedTemplate
    ? `将复制「${selectedTemplate.name}」为新项目。`
    : "将创建一个空白项目。";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsCreating(true);
    try {
      if (selectedTemplate) {
        await onCreate({
          name: projectName.trim(),
          templateId: selectedTemplate.id,
        });
      } else {
        await onCreate({ name: projectName.trim() });
      }
      closeAndReset(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="space-y-0">
          <DialogTitle className="sr-only">新建项目</DialogTitle>
          <div className="flex flex-col gap-2 pr-6 sm:flex-row sm:items-center">
            <Label htmlFor="project-name" className="shrink-0">
              项目名称
            </Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="例如：暑期活动页"
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[132px_minmax(0,1fr)]">
          <nav
            aria-label="模板分类"
            className="flex gap-2 overflow-x-auto border-b pb-3 md:max-h-[392px] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:pb-0 md:pr-3"
          >
            {categories.map((category) => (
              <Button
                key={category}
                type="button"
                size="sm"
                variant={selectedCategory === category ? "default" : "ghost"}
                onClick={() => setSelectedCategory(category)}
                className="h-8 shrink-0 justify-start md:w-full"
              >
                {category}
              </Button>
            ))}
          </nav>

          <div className="min-w-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={templateQuery}
                onChange={(event) =>
                  handleTemplateQueryChange(event.target.value)
                }
                placeholder="搜索模板，或描述你想创建的项目"
                className="pl-9"
                aria-label="搜索模板或描述项目需求"
              />
            </div>

            <div className="grid max-h-[332px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {renderTemplateGrid()}
            </div>

            {templates.length === 0 && (
              <p className="text-xs leading-5 text-muted-foreground">
                保存项目为模板后，会在空白项目后方展示模板卡片。
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          <p className="text-xs leading-5 text-muted-foreground">{submitHint}</p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => closeAndReset(false)}
              disabled={isCreating}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={!canSubmit || isCreating}
              onClick={handleSubmit}
            >
              {isCreating ? "创建中..." : "创建项目"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
