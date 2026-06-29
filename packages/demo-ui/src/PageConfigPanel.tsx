"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, FileText, Settings } from "lucide-react";
import { ConfigForm } from "./ConfigForm";
import { ConfigScopeWrapper } from "./ConfigScopeWrapper";
import { cn } from "./utils";
import type { PositionableSizeItem } from "./types";

export interface PageConfigPanelPage {
  id: string;
  name: string;
  order?: number;
  schema?: string;
  configData?: Record<string, unknown>;
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

function getSchemaFieldCount(schema?: string): number {
  if (!schema) return 0;
  try {
    const parsed = JSON.parse(schema);
    if (!parsed.properties || typeof parsed.properties !== "object") {
      return 0;
    }
    return Object.keys(parsed.properties).length;
  } catch {
    return 0;
  }
}

function getSortedPages(pages: PageConfigPanelPage[]) {
  return [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
  const [internalDetailPageId, setInternalDetailPageId] = useState<string | null>(null);
  const effectiveDetailPageId =
    detailPageId === undefined ? internalDetailPageId : detailPageId;
  const sharedCount = useMemo(
    () => getSchemaFieldCount(projectConfigSchema),
    [projectConfigSchema],
  );
  const sortedPages = useMemo(() => getSortedPages(pages), [pages]);
  const selectedPage =
    sortedPages.find((page) => page.id === effectiveDetailPageId) ?? null;

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
          <h2 className="text-sm font-medium">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {sortedPages.map((page) => {
              const pageCount = getSchemaFieldCount(page.schema);
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
        </div>
      </div>
    );
  }

  const pageCount = getSchemaFieldCount(selectedPage.schema);
  const showSharedConfig = sharedCount > 0 && !!projectConfigSchema;
  const showPageConfig = pageCount > 0 && !!selectedPage.schema;
  const configData = selectedPage.configData ?? {};

  return (
    <div className={cn("flex h-full flex-col bg-card", className)}>
      {!hideDetailHeader && (
        <div className="border-b px-4 py-3">
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
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  影响多个页面
                </span>
              </div>
              <ConfigScopeWrapper scope="project" hideHeader>
                <ConfigForm
                  key={`project-${projectConfigSchema}`}
                  schema={projectConfigSchema!}
                  onChange={(data) => onProjectConfigChange?.(data)}
                  onSchemaChange={onProjectSchemaChange}
                  initialData={configData}
                  sessionId={sessionId}
                  readonly={readonly}
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
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  仅当前页面
                </span>
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
                />
              </ConfigScopeWrapper>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
