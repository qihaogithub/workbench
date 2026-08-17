"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  ListFilter,
  RotateCcw,
  Save,
} from "lucide-react";
import { ConfigForm } from "./ConfigForm";
import { ConfigScopeWrapper } from "./ConfigScopeWrapper";
import { PageRequirements } from "./PageRequirements";
import { RichTextEditor } from "./RichTextEditor";
import { parseSchemaToFields } from "./schema-parser";
import {
  getAvailableConfigCategories,
  getSchemaFieldCountByCategory,
} from "./config-categories";
import { cn } from "./utils";
import type { DesignSpecEntryLink, PositionableSizeItem } from "./types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const EMPTY_DESIGN_SPEC_ENTRIES: DesignSpecEntryLink[] = [];
export {
  extractCodeConfigBindingKeys,
  extractPrototypeConfigBindingKeys,
} from "./config-binding-utils";

export interface PageConfigPanelPage {
  id: string;
  name: string;
  order?: number;
  schema?: string;
  configData?: Record<string, unknown>;
  /** 引用页使用源项目共享配置 Schema；普通页省略并继承面板项目 Schema。 */
  projectConfigSchema?: string;
  projectConfigBindings?: string[];
  /** 跨项目引用页携带的源项目设计规范，只读展示。 */
  referenceDesignSpecs?: Array<{
    id: string;
    title: string;
    entries: Array<{ id: string; title: string; markdown: string }>;
  }>;
}

interface PageConfigPanelProps {
  pages: PageConfigPanelPage[];
  activePageId?: string;
  detailPageId?: string | null;
  onDetailPageIdChange?: (pageId: string | null) => void;
  onPageSelect?: (pageId: string) => void;
  projectConfigSchema?: string;
  onProjectConfigChange?: (data: Record<string, unknown>) => void;
  onProjectSchemaChange?: (schema: string) => void;
  onPageConfigChange?: (pageId: string, data: Record<string, unknown>) => void;
  onPageSchemaChange?: (pageId: string, schema: string) => void;
  onSaveAsDefaults?: (pageId: string) => void;
  onRestoreDefaults?: (pageId: string) => void;
  onProjectSaveAsDefaults?: () => void;
  onProjectRestoreDefaults?: () => void;
  readonly?: boolean;
  sessionId?: string;
  className?: string;
  title?: string;
  hideDetailHeader?: boolean;
  typeLimits?: Record<string, number>;
  onEnterPositionEdit?: (posKeys: string[], positions: Record<string, { x: number; y: number }>, posKeyMap: Record<string, string>) => void;
  onExitPositionEdit?: () => void;
  positionEditActive?: boolean;
  positionEditDimming?: boolean;
  onTogglePositionDimming?: () => void;
  /** 当前页面的配置要求（页面配置要求文档，Markdown，含行内软引用）。 */
  requirements?: string;
  /** 保存配置要求时回调（由宿主 PUT 持久化）。 */
  onRequirementsChange?: (markdown: string) => void;
  /** 配置要求加载中。 */
  requirementsLoading?: boolean;
  /** 资源规范折叠区的展示位置；创作端由文档视图承载时可隐藏。 */
  requirementsPosition?: "beforeConfig" | "afterConfig" | "hidden";
  /** 只读入口在没有页面资源规范和关联设计规范时隐藏整个折叠区。 */
  hideEmptyRequirements?: boolean;
  /** 使用端可将资源规范与配置项显示为不切换内容的快速定位 Tab。 */
  sectionNavigation?: "none" | "anchorTabs";
  /** 已加载的设计规范绑定，用于配置字段旁的只读入口。 */
  designSpecEntries?: DesignSpecEntryLink[];
  /** 仅创作端提供：跳转到文档视图中的指定规范条目。 */
  onEditDesignSpec?: (docId: string, entryId: string) => void;
  /** 浏览端数据源地址；用于跨站访问创作端全局图床。 */
  mediaBaseUrl?: string;
  /** 创作端设计规范 API 上下文；提供后面板会按需读取绑定。 */
  designSpecApiContext?: { workingDir?: string; sessionId?: string; projectId?: string };
}

function getSortedPages(pages: PageConfigPanelPage[]) {
  return [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 折叠区：标题栏（展开/收起 + 动作）+ 可折叠内容。
 * 内容不做独立滚动，随面板整体滚动；`open` 由父级控制。
 */
function PanelSection({
  title,
  open,
  onToggle,
  actions,
  children,
  collapsible = true,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-sm font-semibold">{title}</span>
          </button>
        ) : (
          <h2 className="min-w-0 flex-1 px-1 py-1 text-sm font-semibold">{title}</h2>
        )}
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {open && <div className="flex flex-col">{children}</div>}
    </section>
  );
}

/** 从页面 schema 提取配置引用候选（key + title/字段名）。 */
function getReferenceCandidates(schema: string | undefined): {
  key: string;
  label: string;
}[] {
  if (!schema) return [];
  try {
    const candidates: { key: string; label: string }[] = [];
    for (const group of parseSchemaToFields(schema)) {
      for (const field of group.fields) {
        candidates.push({
          key: field.key,
          label:
            typeof field.title === "string" && field.title.trim()
              ? field.title
              : field.key,
        });
      }
    }
    return candidates;
  } catch {
    return [];
  }
}

function getScopedProjectConfigSchema(
  schema: string | undefined,
  bindings: string[] | undefined,
): string | undefined {
  // bindings 为 undefined 表示未提供绑定信息（兼容：视为展示全部共享配置）；
  // 调用方对不消费共享配置的页面应显式传入 []，从而不展示共享配置区块。
  if (!schema || bindings === undefined) return schema;

  try {
    const parsed = JSON.parse(schema) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.properties)) return schema;

    const allowedKeys = new Set(bindings);
    const properties = Object.fromEntries(
      Object.entries(parsed.properties).filter(([key]) => allowedKeys.has(key)),
    );
    const nextSchema: Record<string, unknown> = {
      ...parsed,
      properties,
    };

    if (Array.isArray(parsed.required)) {
      nextSchema.required = parsed.required.filter(
        (key): key is string => typeof key === "string" && allowedKeys.has(key),
      );
    }

    return JSON.stringify(nextSchema);
  } catch {
    return schema;
  }
}

interface ScopedPageConfig {
  page: PageConfigPanelPage;
  projectConfigSchema?: string;
}

function ConfigCategoryFilterSelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
}) {
  if (categories.length === 0) return null;

  return (
    <div className="relative flex shrink-0 items-center">
      <ListFilter className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <select
        aria-label="筛选配置分类"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-[128px] cursor-pointer rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">全部分类</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PageConfigPanel({
  pages,
  activePageId,
  detailPageId,
  onDetailPageIdChange,
  onPageSelect,
  projectConfigSchema,
  onProjectConfigChange,
  onProjectSchemaChange,
  onPageConfigChange,
  onPageSchemaChange,
  onSaveAsDefaults,
  onRestoreDefaults,
  onProjectSaveAsDefaults,
  onProjectRestoreDefaults,
  readonly,
  sessionId,
  className,
  title = "配置面板",
  hideDetailHeader = false,
  typeLimits,
  onEnterPositionEdit,
  onExitPositionEdit,
  positionEditActive,
  positionEditDimming,
  onTogglePositionDimming,
  requirements,
  onRequirementsChange,
  requirementsLoading,
  requirementsPosition = "afterConfig",
  hideEmptyRequirements = false,
  sectionNavigation = "none",
  designSpecEntries = EMPTY_DESIGN_SPEC_ENTRIES,
  onEditDesignSpec,
  designSpecApiContext,
  mediaBaseUrl,
}: PageConfigPanelProps) {
  const [internalDetailPageId, setInternalDetailPageId] = useState<
    string | null
  >(null);
  const [configCategoryFilter, setConfigCategoryFilter] = useState("");
  const [configSectionOpen, setConfigSectionOpen] = useState(true);
  const [requirementsSectionOpen, setRequirementsSectionOpen] = useState(true);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [requirementsDraft, setRequirementsDraft] = useState("");
  const [loadedDesignSpecEntries, setLoadedDesignSpecEntries] = useState<DesignSpecEntryLink[]>([]);
  const [saveDefaultsScope, setSaveDefaultsScope] = useState<
    "page" | "project" | null
  >(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const requirementsSectionRef = useRef<HTMLDivElement>(null);
  const configSectionRef = useRef<HTMLDivElement>(null);
  const [activeSectionAnchor, setActiveSectionAnchor] = useState<
    "requirements" | "config"
  >("requirements");

  useEffect(() => {
    if (!designSpecApiContext?.workingDir) return;
    let cancelled = false;
    const params = new URLSearchParams({ workingDir: designSpecApiContext.workingDir });
    if (designSpecApiContext.sessionId) params.set("sessionId", designSpecApiContext.sessionId);
    if (designSpecApiContext.projectId) params.set("projectId", designSpecApiContext.projectId);
    void fetch(`/api/design-specs?${params.toString()}`)
      .then((res) => res.json())
      .then(async (result) => {
        if (!result?.success || !Array.isArray(result.data)) return [];
        return Promise.all(result.data.map(async (meta: { id: string; title: string }) => {
          const res = await fetch(`/api/design-specs/${encodeURIComponent(meta.id)}?${params.toString()}`);
          const docResult = await res.json();
          const doc = docResult?.data;
          if (!docResult?.success || !doc || !Array.isArray(doc.entries)) return [];
          return doc.entries.flatMap((entry: { id: string; title: string; markdown?: string; refs?: Array<{ scope: "project" | "page"; pageId?: string; fieldKey: string }> }) =>
            (entry.refs ?? []).map((ref) => ({
              docId: doc.id,
              docTitle: doc.title || meta.title,
              entryId: entry.id,
              entryTitle: entry.title,
              markdown: entry.markdown ?? "",
              ...ref,
            } satisfies DesignSpecEntryLink)),
          );
        }));
      })
      .then((entryGroups) => {
        if (!cancelled && Array.isArray(entryGroups)) setLoadedDesignSpecEntries(entryGroups.flat());
      })
      .catch(() => { if (!cancelled) setLoadedDesignSpecEntries([]); });
    return () => { cancelled = true; };
  }, [designSpecApiContext?.workingDir, designSpecApiContext?.sessionId, designSpecApiContext?.projectId]);

  const effectiveDesignSpecEntries = designSpecEntries.length > 0 ? designSpecEntries : loadedDesignSpecEntries;
  const [restoreDefaultsScope, setRestoreDefaultsScope] = useState<
    "page" | "project" | null
  >(null);
  const effectiveDetailPageId =
    detailPageId === undefined ? internalDetailPageId : detailPageId;
  const sortedPages = useMemo(() => getSortedPages(pages), [pages]);
  const scopedPages = useMemo<ScopedPageConfig[]>(
    () =>
      sortedPages.map((page) => ({
        page,
        projectConfigSchema: getScopedProjectConfigSchema(
          page.projectConfigSchema ?? projectConfigSchema,
          page.projectConfigBindings,
        ),
      })),
    [projectConfigSchema, sortedPages],
  );
  const availableCategories = useMemo(
    () =>
      getAvailableConfigCategories([
        ...scopedPages.map((item) => item.projectConfigSchema),
        ...sortedPages.map((page) => page.schema),
      ]),
    [scopedPages, sortedPages],
  );

  useEffect(() => {
    if (
      configCategoryFilter &&
      !availableCategories.includes(configCategoryFilter)
    ) {
      setConfigCategoryFilter("");
    }
  }, [availableCategories, configCategoryFilter]);

  const filteredPages = useMemo(() => {
    if (!configCategoryFilter) return scopedPages;
    return scopedPages.filter(
      ({ page, projectConfigSchema: scopedProjectConfigSchema }) =>
        getSchemaFieldCountByCategory(
          scopedProjectConfigSchema,
          configCategoryFilter,
        ) + getSchemaFieldCountByCategory(page.schema, configCategoryFilter) >
        0,
    );
  }, [configCategoryFilter, scopedPages]);
  const selectedPageConfig =
    scopedPages.find((item) => item.page.id === effectiveDetailPageId) ?? null;
  const selectedPage = selectedPageConfig?.page ?? null;
  const sharedAffectedPages = useMemo(
    () =>
      scopedPages
        .filter(
          ({ projectConfigSchema: scopedProjectConfigSchema }) =>
            getSchemaFieldCountByCategory(
              scopedProjectConfigSchema,
              configCategoryFilter,
            ) > 0,
        )
        .map(({ page }) => page),
    [configCategoryFilter, scopedPages],
  );

  useEffect(() => {
    setEditingRequirements(false);
    setRequirementsDraft(requirements ?? "");
  }, [effectiveDetailPageId, requirements]);

  const openPageDetail = (pageId: string) => {
    onPageSelect?.(pageId);
    setInternalDetailPageId(pageId);
    onDetailPageIdChange?.(pageId);
  };

  const closePageDetail = () => {
    setInternalDetailPageId(null);
    onDetailPageIdChange?.(null);
  };

  if (!selectedPage) {
    return (
      <div className={cn("flex h-full flex-col bg-card", className)}>
        <div className="border-b px-4 py-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-sm font-medium">{title}</h2>
            <ConfigCategoryFilterSelect
              value={configCategoryFilter}
              onChange={setConfigCategoryFilter}
              categories={availableCategories}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {sortedPages.length === 0 ? (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 text-center">
              <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">暂无页面</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                添加页面后即可配置页面内容
              </p>
            </div>
          ) : filteredPages.length > 0 ? (
            <div className="space-y-1">
              {filteredPages.map(({ page, projectConfigSchema: scopedProjectConfigSchema }) => {
                const sharedCount = getSchemaFieldCountByCategory(
                  scopedProjectConfigSchema,
                  configCategoryFilter,
                );
                const pageCount = getSchemaFieldCountByCategory(
                  page.schema,
                  configCategoryFilter,
                );
                const totalCount = sharedCount + pageCount;
                const isActive = page.id === activePageId;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => openPageDetail(page.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "border-primary/30 bg-primary/10"
                        : "border-transparent",
                    )}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {page.name}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          totalCount > 0
                            ? "bg-muted text-foreground"
                            : "bg-muted/50 text-muted-foreground",
                        )}
                      >
                        {totalCount}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 text-center">
              <ListFilter className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">没有匹配的配置项</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                换一个配置分类查看
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const pageCount = getSchemaFieldCountByCategory(
    selectedPage.schema,
    configCategoryFilter,
  );
  const selectedProjectConfigSchema = selectedPageConfig?.projectConfigSchema;
  const selectedProjectCount = getSchemaFieldCountByCategory(
    selectedProjectConfigSchema,
    configCategoryFilter,
  );
  const showSharedConfig =
    selectedProjectCount > 0 && !!selectedProjectConfigSchema;
  const showPageConfig = pageCount > 0 && !!selectedPage.schema;
  const referenceDesignSpecs = selectedPage.referenceDesignSpecs ?? [];
  const scopedDesignSpecEntries = effectiveDesignSpecEntries.filter(
    (entry) =>
      entry.scope === "project" ||
      (entry.scope === "page" && entry.pageId === selectedPage.id),
  );
  const hasRequirements = Boolean(requirements?.trim());
  const shouldShowRequirements =
    requirementsPosition !== "hidden" &&
    (!hideEmptyRequirements ||
      requirementsLoading ||
      editingRequirements ||
      hasRequirements ||
      scopedDesignSpecEntries.length > 0);
  const configData = selectedPage.configData ?? {};
  const saveDefaultsEnabled =
    !readonly &&
    !!selectedPage?.schema &&
    Object.keys(configData).length > 0;
  const showSectionNavigation =
    sectionNavigation === "anchorTabs" &&
    shouldShowRequirements &&
    (showSharedConfig || showPageConfig);

  const scrollToSection = (section: "requirements" | "config") => {
    const container = contentContainerRef.current;
    const target =
      section === "requirements"
        ? requirementsSectionRef.current
        : configSectionRef.current;
    if (!container || !target) return;

    setActiveSectionAnchor(section);
    const top = target.offsetTop - container.offsetTop;
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top, behavior: "smooth" });
    } else {
      container.scrollTop = top;
    }
  };

  return (
    <div className={cn("flex h-full flex-col bg-card", className)}>
      {!hideDetailHeader && (
        <div className="border-b px-4 py-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={closePageDetail}
                aria-label="返回所有页面"
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="min-w-0 truncate text-sm font-medium">
                {selectedPage.name}
              </h2>
            </div>
            <ConfigCategoryFilterSelect
              value={configCategoryFilter}
              onChange={setConfigCategoryFilter}
              categories={availableCategories}
            />
          </div>
        </div>
      )}
      {showSectionNavigation && (
        <nav
          aria-label="配置内容快速定位"
          className="flex shrink-0 gap-1 border-b bg-card px-4 pt-2"
        >
          {([
            ["requirements", "资源规范"],
            ["config", "配置项"],
          ] as const).map(([section, label]) => (
            <button
              key={section}
              type="button"
              aria-pressed={activeSectionAnchor === section}
              onClick={() => scrollToSection(section)}
              className={cn(
                "cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeSectionAnchor === section
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <div ref={contentContainerRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          <div ref={configSectionRef}>
          <PanelSection
            title="配置项"
            open={configSectionOpen}
            onToggle={() => setConfigSectionOpen((current) => !current)}
            collapsible={!showSectionNavigation}
            actions={
              <>
                {onRestoreDefaults && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setRestoreDefaultsScope("page")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    恢复
                  </Button>
                )}
                {!readonly && onSaveAsDefaults && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={!saveDefaultsEnabled}
                    onClick={() => setSaveDefaultsScope("page")}
                  >
                    <Save className="h-3.5 w-3.5" />
                    保存
                  </Button>
                )}
              </>
            }
          >
            {showSharedConfig && (
              <section className="flex flex-col">
                <div className="mb-3 mt-2 flex items-center gap-2 pl-5">
                  <span className="text-sm font-semibold">共享配置</span>
                  {sharedAffectedPages.length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="cursor-pointer rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {sharedAffectedPages.length}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="bottom"
                        className="w-56 p-1"
                      >
                        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                          受影响页面
                        </div>
                        {sharedAffectedPages.map((page) => (
                          <button
                            key={page.id}
                            type="button"
                            onClick={() => onPageSelect?.(page.id)}
                            className="block w-full cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {page.name}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                <ConfigScopeWrapper scope="project" hideHeader>
                  <ConfigForm
                    key={`project-${selectedPage.id}-${selectedProjectConfigSchema}`}
                    schema={selectedProjectConfigSchema!}
                    onChange={(data) => onProjectConfigChange?.(data)}
                    onSchemaChange={onProjectSchemaChange}
                    initialData={configData}
                    sessionId={sessionId}
                    readonly={readonly}
                    configCategoryFilter={configCategoryFilter}
                    typeLimits={typeLimits}
                    designSpecEntries={effectiveDesignSpecEntries.filter((entry) => entry.scope === "project")}
                    onEditDesignSpec={onEditDesignSpec}
                  />
                </ConfigScopeWrapper>
              </section>
            )}

            {showPageConfig && (
              <section className="flex flex-col">
                <div className="mb-3 mt-2 flex items-center gap-2 pl-5">
                  <span className="text-sm font-semibold">本页配置</span>
                </div>
                <ConfigScopeWrapper scope="page" hideHeader>
                <ConfigForm
                  key={`page-${selectedPage.id}-${selectedPage.schema}`}
                  schema={selectedPage.schema!}
                  onChange={(data) => onPageConfigChange?.(selectedPage.id, data)}
                  onSchemaChange={(schema) =>
                    onPageSchemaChange?.(selectedPage.id, schema)
                  }
                  initialData={configData}
                  sessionId={sessionId}
                  readonly={readonly}
                  configCategoryFilter={configCategoryFilter}
                  typeLimits={typeLimits}
                  onEnterPositionEdit={onEnterPositionEdit}
                  onExitPositionEdit={onExitPositionEdit}
                  positionEditActive={positionEditActive}
                  positionEditDimming={positionEditDimming}
                  onTogglePositionDimming={onTogglePositionDimming}
                  designSpecEntries={effectiveDesignSpecEntries.filter((entry) => entry.scope === "page" && entry.pageId === selectedPage.id)}
                  onEditDesignSpec={onEditDesignSpec}
                />
              </ConfigScopeWrapper>
            </section>
          )}

          {!showSharedConfig && !showPageConfig && (
            <div className="flex min-h-[180px] flex-col items-center justify-center px-4 text-center">
              <ListFilter className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">没有匹配的配置项</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                换一个配置分类查看
              </p>
            </div>
          )}
          </PanelSection>
          </div>

          {referenceDesignSpecs.length > 0 && (
            <PanelSection
              title="设计规范"
              open={requirementsSectionOpen}
              onToggle={() => setRequirementsSectionOpen((current) => !current)}
            >
              <div className="space-y-4 pt-3">
                {referenceDesignSpecs.map((spec) => (
                  <section key={spec.id} className="rounded-md border p-3">
                    <h3 className="text-sm font-medium">{spec.title}</h3>
                    {spec.entries.map((entry) => (
                      <div key={entry.id} className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {entry.title}
                        </p>
                        {entry.markdown.trim() && (
                          <PageRequirements markdown={entry.markdown} />
                        )}
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </PanelSection>
          )}

          {shouldShowRequirements && (
            <div
              ref={requirementsSectionRef}
              className={requirementsPosition === "beforeConfig" ? "order-first" : undefined}
            >
          <PanelSection
            title="资源规范"
            open={requirementsSectionOpen}
            onToggle={() => setRequirementsSectionOpen((current) => !current)}
            collapsible={!showSectionNavigation}
            actions={
              requirementsLoading ? null : editingRequirements ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setEditingRequirements(false);
                      setRequirementsDraft(requirements ?? "");
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => {
                      onRequirementsChange?.(requirementsDraft);
                      setEditingRequirements(false);
                    }}
                  >
                    <Save className="h-3.5 w-3.5" />
                    保存
                  </Button>
                </>
              ) : !readonly && onRequirementsChange ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => {
                    setRequirementsDraft(requirements ?? "");
                    setEditingRequirements(true);
                  }}
                >
                  编辑
                </Button>
              ) : null
            }
          >
            {requirementsLoading ? (
              <div className="py-4 text-xs text-muted-foreground">
                加载中...
              </div>
            ) : editingRequirements ? (
              <div className="flex flex-col gap-2 pt-2">
                <RichTextEditor
                  content={requirementsDraft}
                  onChange={setRequirementsDraft}
                  referenceCandidates={getReferenceCandidates(
                    selectedPage.schema,
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  输入 @ 或使用工具栏「插入引用」选择当前页配置项，以 @[名称](key) 形式引用。
                </p>
              </div>
            ) : hasRequirements || scopedDesignSpecEntries.length > 0 ? (
              <div className="space-y-4 pt-2">
                {hasRequirements && (
                  <PageRequirements markdown={requirements!} allowExternalMedia mediaBaseUrl={mediaBaseUrl} />
                )}
                {scopedDesignSpecEntries.map((entry) => (
                  <section key={`${entry.docId}:${entry.entryId}`} className="rounded-md border p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {entry.docTitle} · {entry.entryTitle}
                    </p>
                    {entry.markdown.trim() ? (
                      <div className="mt-2">
                        <PageRequirements markdown={entry.markdown} allowExternalMedia mediaBaseUrl={mediaBaseUrl} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">暂无说明</p>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[120px] flex-col items-center justify-center px-4 text-center">
                <FileText className="mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">暂无资源规范</p>
                {!readonly && onRequirementsChange && (
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    点击右上角「编辑」添加页面配置要求
                  </p>
                )}
              </div>
            )}
          </PanelSection>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={saveDefaultsScope !== null}
        onOpenChange={(open) => {
          if (!open) setSaveDefaultsScope(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>保存为默认配置</DialogTitle>
            <DialogDescription>
              {saveDefaultsScope === "project"
                ? `将使用当前共享配置值覆盖项目级默认配置，影响 ${sharedAffectedPages.length} 个页面，所有页面将使用新默认值。确认保存？`
                : "将使用当前本页配置覆盖默认配置，新项目或新增页面将使用新默认值。确认保存？"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveDefaultsScope(null)}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (saveDefaultsScope === "project") {
                  onProjectSaveAsDefaults?.();
                } else if (saveDefaultsScope === "page" && selectedPage) {
                  onSaveAsDefaults?.(selectedPage.id);
                }
                setSaveDefaultsScope(null);
              }}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={restoreDefaultsScope !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreDefaultsScope(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>恢复默认配置</DialogTitle>
            <DialogDescription>
              {restoreDefaultsScope === "project"
                ? "将共享配置值恢复为项目级初始默认值，所有修改将丢失。确认恢复？"
                : "将当前页面配置恢复为初始默认值，所有修改将丢失。确认恢复？"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRestoreDefaultsScope(null)}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (restoreDefaultsScope === "project") {
                  onProjectRestoreDefaults?.();
                } else if (restoreDefaultsScope === "page" && selectedPage) {
                  onRestoreDefaults?.(selectedPage.id);
                }
                setRestoreDefaultsScope(null);
              }}
            >
              确认恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
