"use client";

import { ChevronDown, FileText, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigPoolItem } from "@/lib/design-specs";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";
import {
  CATEGORY_ORDER,
  KIND_META,
  pageLabel,
  Swatch,
} from "./DesignSpecVisuals";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** 规范项池：页面和配置项使用同一套可拖拽绑定协议。 */
export function DesignSpecConfigPanel() {
  const ws = useDesignSpecWorkspace();
  const isPages = ws.poolView === "pages";
  const pageItems = ws.filteredPages ?? ws.pages;
  const pageConfigCounts = new Map<string, number>();
  for (const page of ws.pages) pageConfigCounts.set(page.id, 0);
  for (const item of ws.pool) {
    if (item.scope === "page" && item.pageId) {
      pageConfigCounts.set(
        item.pageId,
        (pageConfigCounts.get(item.pageId) ?? 0) + 1,
      );
    } else if (item.scope === "project") {
      for (const pageId of item.pageIds ?? ws.pages.map((page) => page.id)) {
        pageConfigCounts.set(pageId, (pageConfigCounts.get(pageId) ?? 0) + 1);
      }
    }
  }
  const hasExtraFilters =
    ws.bindFilter !== "all" || (!isPages && ws.categoryFilter !== "all");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-3 py-2.5">
        <div
          className="flex items-center gap-1.5"
          data-testid="design-spec-filter-row"
        >
          <div
            className="flex w-32 shrink-0 rounded-md bg-secondary p-px"
            role="tablist"
            aria-label="规范项视图"
          >
            <ViewButton
              active={isPages}
              onClick={() => ws.setPoolView?.("pages")}
            >
              页面
            </ViewButton>
            <ViewButton
              active={!isPages}
              onClick={() => ws.setPoolView?.("configs")}
            >
              配置项
            </ViewButton>
          </div>
          <select
            aria-label="页面筛选"
            value={ws.pageFilter ?? "all"}
            onChange={(e) => ws.setPageFilter?.(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md border bg-background px-1.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">全部页面</option>
            {ws.pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name}
              </option>
            ))}
          </select>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="更多筛选"
                title="更多筛选"
                className={cn(
                  "relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  hasExtraFilters && "bg-secondary text-foreground",
                )}
              >
                <ListFilter className="h-4 w-4" />
                {hasExtraFilters && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 size-1 rounded-full bg-primary"
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              sideOffset={6}
              className="w-60 rounded-xl p-3"
            >
              <FilterSection
                title="绑定状态"
                value={ws.bindFilter}
                options={[
                  ["all", "全部"],
                  ["bound", "已绑定"],
                  ["unbound", "未绑定"],
                ]}
                onChange={(value) =>
                  ws.setBindFilter(value as "all" | "bound" | "unbound")
                }
              />
              {!isPages && (
                <FilterSection
                  title="配置项类型"
                  value={ws.categoryFilter}
                  options={[
                    ["all", "全部"],
                    ...CATEGORY_ORDER.map(
                      (kind) =>
                        [kind, KIND_META[kind].label] as [string, string],
                    ),
                  ]}
                  onChange={(value) =>
                    ws.setCategoryFilter(value as typeof ws.categoryFilter)
                  }
                />
              )}
            </PopoverContent>
          </Popover>
        </div>
        <div className="mt-2">
          <input
            className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={isPages ? "搜索页面" : "搜索规范项"}
            value={ws.search}
            onChange={(e) => ws.setSearch(e.target.value)}
            aria-label={isPages ? "搜索页面" : "搜索规范项"}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {isPages ? (
          pageItems.length ? (
            pageItems.map((page) => (
              <PageItem
                key={page.id}
                page={page}
                bound={ws.boundPageIds.has(page.id)}
                count={pageConfigCounts.get(page.id) ?? 0}
              />
            ))
          ) : (
            <EmptyState>无匹配页面</EmptyState>
          )
        ) : ws.poolGroups?.length ? (
          <ConfigGroups groups={ws.poolGroups} />
        ) : (
          <EmptyState>无匹配规范项</EmptyState>
        )}
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-center rounded px-1 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function ConfigGroups({ groups }: { groups: [string, ConfigPoolItem[]][] }) {
  const ws = useDesignSpecWorkspace();
  return (
    <>
      {groups.map(([name, items]) => {
        const page = ws.pages.find((candidate) => candidate.name === name);
        const collapsed = ws.collapsedGroups?.has(name) ?? false;
        const hasItems = items.length > 0;
        return (
          <div key={name} className="mb-1">
            <div
              draggable={Boolean(page)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold",
                page && "cursor-grab hover:bg-accent",
              )}
              onClick={() => hasItems && ws.toggleGroup?.(name)}
              onDragStart={(event) => {
                if (!page) return;
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.dropEffect = "copy";
                event.dataTransfer.setData("text/plain", `page:${page.id}`);
              }}
              title={page ? "拖拽页面到规范卡片以绑定页面" : undefined}
            >
              <ChevronDown
                data-design-spec-expander
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  collapsed && "-rotate-90",
                  !hasItems && "invisible",
                )}
              />
              {page && <FileText className="h-3.5 w-3.5" />}
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                {page && ws.boundPageIds.has(page.id) ? "已绑定 · " : ""}
                {items.length} 项
              </span>
            </div>
            {!collapsed && items.length > 0 && (
              <div data-design-spec-group-items className="ml-5 border-l pl-2">
                {items.map((item) => (
                  <PoolItem
                    key={item.id}
                    item={item}
                    bound={ws.boundIds.has(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function FilterSection({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <section className="pt-3 first:pt-0" aria-label={title}>
      <div className="px-1 pb-1 text-[11px] font-semibold text-muted-foreground">
        {title}
      </div>
      <div
        role="radiogroup"
        aria-label={title}
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted/45 p-1"
      >
        {options.map(([optionValue, label]) => (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={value === optionValue}
            onClick={() => onChange(optionValue)}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === optionValue
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PageItem({
  page,
  bound,
  count,
}: {
  page: { id: string; name: string };
  bound: boolean;
  count: number;
}) {
  return (
    <div
      draggable
      tabIndex={0}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", `page:${page.id}`);
      }}
      className="flex cursor-grab items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      title="拖拽页面到规范卡片以绑定页面"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {page.name}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {count} 项
      </span>
      <span
        className={cn(
          "shrink-0 text-[11px]",
          bound ? "text-foreground/70" : "text-muted-foreground",
        )}
      >
        {bound ? "已绑定" : "未绑定"}
      </span>
    </div>
  );
}

function PoolItem({ item, bound }: { item: ConfigPoolItem; bound: boolean }) {
  const ws = useDesignSpecWorkspace();
  const isImage = item.kind === "image";
  const breadcrumbs =
    item.breadcrumbs && item.breadcrumbs.length > 1
      ? item.breadcrumbs.join(" / ")
      : pageLabel(item);
  return (
    <div
      draggable
      tabIndex={0}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", `pool:${item.id}`);
      }}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        bound && "opacity-80",
      )}
    >
      <span
        draggable={false}
        tabIndex={0}
        className="shrink-0 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onMouseMove={(event) =>
          ws.setHoverPop({ item, x: event.clientX, y: event.clientY })
        }
        onMouseLeave={() => ws.setHoverPop(null)}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          ws.setHoverPop({ item, x: rect.right, y: rect.top });
        }}
        onBlur={() => ws.setHoverPop(null)}
        onClick={isImage ? () => ws.setZoomed(item) : undefined}
        title={isImage ? "查看大图" : undefined}
      >
        <Swatch item={item} />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13px] font-medium",
            bound && "text-muted-foreground",
          )}
        >
          {item.title}
        </div>
        <div
          className="truncate text-[11px] text-muted-foreground"
          title={breadcrumbs}
        >
          {breadcrumbs}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{KIND_META[item.kind].label}</span>
          <span>{pageLabel(item)}</span>
          <span className="rounded-full border px-1">
            {bound ? "已绑定" : "未绑定"}
          </span>
        </div>
      </div>
    </div>
  );
}
