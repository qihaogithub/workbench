"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  ListFilter,
  Settings,
} from "lucide-react";
import { ConfigForm } from "./ConfigForm";
import { ConfigScopeWrapper } from "./ConfigScopeWrapper";
import {
  getAvailableConfigCategories,
  getSchemaFieldCountByCategory,
} from "./config-categories";
import { cn } from "./utils";
import type { PositionableSizeItem } from "./types";

export interface PageConfigPanelPage {
  id: string;
  name: string;
  order?: number;
  schema?: string;
  configData?: Record<string, unknown>;
  projectConfigBindings?: string[];
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
  readonly?: boolean;
  sessionId?: string;
  positionableItemSizes?: Record<string, PositionableSizeItem>;
  className?: string;
  title?: string;
  hideDetailHeader?: boolean;
}

function getSortedPages(pages: PageConfigPanelPage[]) {
  return [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

const PROTOTYPE_TEXT_BINDING_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const PROTOTYPE_ATTRIBUTE_BINDING_RE =
  /\bdata-bind-(?:text|src|href|style-color|style-background-color|style-border-color)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g;

export function extractPrototypeConfigBindingKeys(html?: string | null): string[] {
  if (!html) return [];

  const keys = new Set<string>();
  for (const match of html.matchAll(PROTOTYPE_TEXT_BINDING_RE)) {
    if (match[1]) keys.add(match[1]);
  }
  for (const match of html.matchAll(PROTOTYPE_ATTRIBUTE_BINDING_RE)) {
    const key = match[1] ?? match[2] ?? match[3];
    if (key) keys.add(key);
  }
  return [...keys];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getScopedProjectConfigSchema(
  schema: string | undefined,
  bindings: string[] | undefined,
): string | undefined {
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
  readonly,
  sessionId,
  positionableItemSizes,
  className,
  title = "配置面板",
  hideDetailHeader = false,
}: PageConfigPanelProps) {
  const [internalDetailPageId, setInternalDetailPageId] = useState<
    string | null
  >(null);
  const [configCategoryFilter, setConfigCategoryFilter] = useState("");
  const [showSharedAffectedPages, setShowSharedAffectedPages] = useState(false);
  const effectiveDetailPageId =
    detailPageId === undefined ? internalDetailPageId : detailPageId;
  const sortedPages = useMemo(() => getSortedPages(pages), [pages]);
  const scopedPages = useMemo<ScopedPageConfig[]>(
    () =>
      sortedPages.map((page) => ({
        page,
        projectConfigSchema: getScopedProjectConfigSchema(
          projectConfigSchema,
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
    setShowSharedAffectedPages(false);
  }, [effectiveDetailPageId, configCategoryFilter]);

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
  const configData = selectedPage.configData ?? {};

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
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {showSharedConfig && (
            <section className="flex flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">共享配置</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSharedAffectedPages((current) => !current)}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={showSharedAffectedPages}
                >
                  影响 {sharedAffectedPages.length} 个页面
                </button>
              </div>
              {showSharedAffectedPages && (
                <div className="mb-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="mb-1 text-xs text-muted-foreground">
                    受影响页面
                  </div>
                  <ul className="space-y-1">
                    {sharedAffectedPages.map((page) => (
                      <li
                        key={page.id}
                        className="truncate text-xs text-foreground/80"
                      >
                        {page.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
                />
              </ConfigScopeWrapper>
            </section>
          )}

          {showPageConfig && (
            <section className="flex flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">本页配置</span>
                </div>
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
                  positionableItemSizes={positionableItemSizes}
                  readonly={readonly}
                  configCategoryFilter={configCategoryFilter}
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
        </div>
      </div>
    </div>
  );
}
