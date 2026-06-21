"use client";

import { useMemo, useState } from "react";
import { Bot, FilePlus, Layers3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProjectTemplateMeta } from "@opencode-workbench/shared";

type CreateMode = "blank" | "template" | "ai";

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

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: ProjectTemplateMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full cursor-pointer rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{template.name}</div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {template.description}
          </div>
        </div>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
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
  const [mode, setMode] = useState<CreateMode>("blank");
  const [blankName, setBlankName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [aiDescription, setAiDescription] = useState("");
  const [recommendation, setRecommendation] =
    useState<TemplateRecommendation | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);

  const categories = useMemo(
    () => [
      ALL_CATEGORIES,
      ...Array.from(new Set(templates.map((item) => item.category))),
    ],
    [templates],
  );
  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
  const recommendedTemplate =
    recommendation?.template ||
    templates.find((item) => item.id === recommendation?.templateId);
  const activeTemplate = mode === "ai" ? recommendedTemplate : selectedTemplate;
  const filteredTemplates =
    selectedCategory === ALL_CATEGORIES
      ? templates
      : templates.filter((item) => item.category === selectedCategory);

  const closeAndReset = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setMode("blank");
      setBlankName("");
      setProjectName("");
      setSelectedTemplateId(null);
      setSelectedCategory(ALL_CATEGORIES);
      setAiDescription("");
      setRecommendation(null);
    }
  };

  const handleTemplateSelect = (template: ProjectTemplateMeta) => {
    setSelectedTemplateId(template.id);
    setProjectName((current) => current || template.name);
  };

  const handleRecommend = async () => {
    if (!aiDescription.trim()) return;
    setIsRecommending(true);
    try {
      const result = await onRecommendTemplate(aiDescription.trim());
      setRecommendation(result);
      const template =
        result.template || templates.find((item) => item.id === result.templateId);
      if (template) {
        setProjectName(template.name);
      }
    } finally {
      setIsRecommending(false);
    }
  };

  const canCreateBlank = mode === "blank" && blankName.trim().length > 0;
  const canCreateFromTemplate =
    (mode === "template" || mode === "ai") &&
    Boolean(activeTemplate) &&
    projectName.trim().length > 0;
  const canSubmit = canCreateBlank || canCreateFromTemplate;
  const submitText =
    mode === "blank"
      ? "创建"
      : mode === "template"
        ? "从模板创建"
        : "使用推荐模板创建";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsCreating(true);
    try {
      if (mode === "blank") {
        await onCreate({ name: blankName.trim() });
      } else if (activeTemplate) {
        await onCreate({
          name: projectName.trim(),
          templateId: activeTemplate.id,
        });
      }
      closeAndReset(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>
            选择一个起点。空白项目适合从零开始，模板适合复用已有结构。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(value) => setMode(value as CreateMode)}>
          <TabsList className="grid h-11 w-full grid-cols-3 rounded-lg">
            <TabsTrigger value="blank" className="gap-1.5">
              <FilePlus className="h-3.5 w-3.5" />
              空白项目
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-1.5">
              <Layers3 className="h-3.5 w-3.5" />
              模板项目
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              AI 推荐
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="blank"
            className="space-y-4 pt-4 data-[state=inactive]:hidden"
          >
            <div className="grid gap-2">
              <Label htmlFor="blank-name">项目名称</Label>
              <Input
                id="blank-name"
                value={blankName}
                onChange={(event) => setBlankName(event.target.value)}
                placeholder="例如：暑期活动页"
                autoFocus
              />
            </div>
          </TabsContent>

          <TabsContent
            value="template"
            className="space-y-4 pt-4 data-[state=inactive]:hidden"
          >
            {templates.length === 0 ? (
              <EmptyState
                title="还没有模板"
                description="在首页项目卡片右下角打开更多菜单，选择“保存为模板”后就能在这里复用。"
              />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Button
                      key={category}
                      type="button"
                      size="sm"
                      variant={selectedCategory === category ? "default" : "outline"}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
                <div className="grid max-h-60 gap-2 overflow-y-auto pr-1">
                  {filteredTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      selected={template.id === selectedTemplateId}
                      onSelect={() => handleTemplateSelect(template)}
                    />
                  ))}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="template-project-name">新项目名称</Label>
                  <Input
                    id="template-project-name"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder={selectedTemplate?.name || "先选择一个模板"}
                  />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent
            value="ai"
            className="space-y-4 pt-4 data-[state=inactive]:hidden"
          >
            {templates.length === 0 ? (
              <EmptyState
                title="没有可推荐的模板"
                description="AI 只会从已保存模板中推荐。先保存至少一个模板后，再输入需求描述。"
              />
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="ai-description">描述你要创建的项目</Label>
                  <Textarea
                    id="ai-description"
                    value={aiDescription}
                    onChange={(event) => setAiDescription(event.target.value)}
                    placeholder="例如：我要做一个课程售卖活动页，包含顶部 Banner、权益说明和报名按钮"
                    className="min-h-[104px]"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    AI 会从当前模板库中挑选一个最接近的模板。
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-2"
                    disabled={!aiDescription.trim() || isRecommending}
                    onClick={handleRecommend}
                  >
                    <Sparkles className="h-4 w-4" />
                    {isRecommending ? "推荐中..." : "推荐模板"}
                  </Button>
                </div>
                {recommendation && recommendedTemplate && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm font-medium">
                        推荐：{recommendedTemplate.name}
                      </div>
                      <span className="shrink-0 rounded bg-background px-2 py-1 text-xs text-muted-foreground">
                        {Math.round(recommendation.confidence * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      {recommendation.reason}
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Label htmlFor="ai-project-name">新项目名称</Label>
                      <Input
                        id="ai-project-name"
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                        placeholder={recommendedTemplate.name}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => closeAndReset(false)}
            disabled={isCreating}
          >
            取消
          </Button>
          <Button type="button" disabled={!canSubmit || isCreating} onClick={handleSubmit}>
            {isCreating ? "创建中..." : submitText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
