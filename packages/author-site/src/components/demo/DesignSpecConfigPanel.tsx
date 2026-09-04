"use client";

import { ChevronDown, FileText, Folder, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigPoolItem } from "@/lib/design-specs";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";
import {
  CATEGORY_ORDER,
  KIND_META,
  Swatch,
  type HoverPopState,
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
          <div role="tree" aria-label="配置项树" data-design-spec-config-tree>
            <ConfigGroups groups={ws.poolGroups} />
          </div>
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
        const tree = buildConfigTree(items);
        return (
          <div
            key={page?.id ?? name}
            className="mb-1"
            data-design-spec-page-tree
          >
            <div
              role="treeitem"
              aria-level={1}
              aria-selected={false}
              aria-expanded={hasItems ? !collapsed : undefined}
              draggable={Boolean(page)}
              tabIndex={0}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold",
                page && "cursor-grab hover:bg-accent",
              )}
              onClick={() => hasItems && ws.toggleGroup?.(name)}
              onKeyDown={(event) => {
                if (!hasItems || (event.key !== "Enter" && event.key !== " ")) {
                  return;
                }
                event.preventDefault();
                ws.toggleGroup?.(name);
              }}
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
              <div
                role="group"
                data-design-spec-group-items
                className="ml-5 border-l pl-1"
              >
                {tree.map((node) => (
                  <ConfigTreeNode
                    key={node.key}
                    node={node}
                    pageKey={page?.id ?? name}
                    level={2}
                    boundIds={ws.boundIds}
                    collapsedGroups={ws.collapsedGroups}
                    toggleGroup={ws.toggleGroup}
                    setHoverPop={ws.setHoverPop}
                    setZoomed={ws.setZoomed}
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

interface ConfigTreeNode {
  /** Stable path assembled from the canonical schema key. */
  key: string;
  title: string;
  item?: ConfigPoolItem;
  children: ConfigTreeNode[];
}

/**
 * Turns the recursive schema catalogue into a layer-like tree. `breadcrumbs`
 * carry the human labels (including oneOf branch labels), while the canonical
 * key keeps similarly named fields in separate branches.
 */
function buildConfigTree(items: ConfigPoolItem[]): ConfigTreeNode[] {
  const roots: ConfigTreeNode[] = [];
  const nodes = new Map<string, ConfigTreeNode>();

  for (const item of items) {
    const labels = item.breadcrumbs?.filter((label) => label.trim()) ?? [];
    const displayLabels = labels.length > 0 ? labels : [item.title];
    const stableParts = splitSchemaPath(item.key);
    const depth = Math.max(displayLabels.length, stableParts.length, 1);
    let parent: ConfigTreeNode[] = roots;
    let parentKey = "root";

    for (let index = 0; index < depth; index += 1) {
      const label = displayLabels[index] ?? stableParts[index] ?? item.title;
      const part = stableParts[index] ?? `label:${label}`;
      const nodeKey = `${parentKey}/${part}`;
      let node = nodes.get(nodeKey);
      if (!node) {
        node = { key: nodeKey, title: label, children: [] };
        nodes.set(nodeKey, node);
        parent.push(node);
      }
      if (index === depth - 1) node.item = item;
      parent = node.children;
      parentKey = nodeKey;
    }
  }

  return roots;
}

/** Split `modules[type=image].image` into `modules`, `[type=image]`, `image`. */
function splitSchemaPath(key: string): string[] {
  const parts: string[] = [];
  let segment = "";
  let bracketDepth = 0;
  const pushSegment = () => {
    if (segment) parts.push(segment);
    segment = "";
  };

  for (const character of key) {
    if (character === "[" ) bracketDepth += 1;
    if (character === "]" ) bracketDepth = Math.max(0, bracketDepth - 1);
    if (character === "." && bracketDepth === 0) {
      pushSegment();
      continue;
    }
    segment += character;
  }
  pushSegment();

  // Array/oneOf markers are part of a property segment in the canonical key;
  // split the marker out so it can become its own synthetic tree group.
  return parts.flatMap((part) => {
    const matches = part.match(/[^\[\]]+|\[[^\]]*\]/g);
    return matches?.length ? matches : [part];
  });
}

function ConfigTreeNode({
  node,
  pageKey,
  level,
  boundIds,
  collapsedGroups,
  toggleGroup,
  setHoverPop,
  setZoomed,
}: {
  node: ConfigTreeNode;
  pageKey: string;
  level: number;
  boundIds: Set<string>;
  collapsedGroups?: Set<string>;
  toggleGroup?: (name: string) => void;
  setHoverPop: (value: HoverPopState | null) => void;
  setZoomed: (value: ConfigPoolItem | null) => void;
}) {
  const hasChildren = node.children.length > 0;
  const collapseKey = `${pageKey}/${node.key}`;
  const collapsed = collapsedGroups?.has(collapseKey) ?? false;
  const item = node.item;

  return (
    <div data-design-spec-tree-node>
      <div
        role="treeitem"
        aria-level={level}
        aria-selected={false}
        aria-expanded={hasChildren ? !collapsed : undefined}
        draggable={Boolean(item)}
        tabIndex={0}
        onClick={() => {
          if (hasChildren) toggleGroup?.(collapseKey);
        }}
        onKeyDown={(event) => {
          if (!hasChildren || (event.key !== "Enter" && event.key !== " ")) {
            return;
          }
          event.preventDefault();
          toggleGroup?.(collapseKey);
        }}
        onDragStart={(event) => {
          if (!item) return;
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("text/plain", `pool:${item.id}`);
        }}
        className={cn(
          "flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          item && "cursor-grab active:cursor-grabbing",
          item && boundIds.has(item.id) && "opacity-80",
        )}
        title={item?.breadcrumbs?.join(" / ") || (item ? item.title : undefined)}
      >
        <ChevronDown
          data-design-spec-expander
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            collapsed && "-rotate-90",
            !hasChildren && "invisible",
          )}
        />
        {item ? (
          <PoolItemContent
            item={item}
            bound={boundIds.has(item.id)}
            setHoverPop={setHoverPop}
            setZoomed={setZoomed}
          />
        ) : (
          <>
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {node.title}
            </span>
          </>
        )}
      </div>
      {!collapsed && hasChildren && (
        <div role="group" className="ml-4 border-l pl-1">
          {node.children.map((child) => (
            <ConfigTreeNode
              key={child.key}
              node={child}
              pageKey={pageKey}
              level={level + 1}
              boundIds={boundIds}
              collapsedGroups={collapsedGroups}
              toggleGroup={toggleGroup}
              setHoverPop={setHoverPop}
              setZoomed={setZoomed}
            />
          ))}
        </div>
      )}
    </div>
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

function PoolItemContent({
  item,
  bound,
  setHoverPop,
  setZoomed,
}: {
  item: ConfigPoolItem;
  bound: boolean;
  setHoverPop: (value: HoverPopState | null) => void;
  setZoomed: (value: ConfigPoolItem | null) => void;
}) {
  const isImage = item.kind === "image";
  return (
    <>
      <span
        draggable={false}
        tabIndex={0}
        className="shrink-0 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onMouseMove={(event) =>
          setHoverPop({ item, x: event.clientX, y: event.clientY })
        }
        onMouseLeave={() => setHoverPop(null)}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHoverPop({ item, x: rect.right, y: rect.top });
        }}
        onBlur={() => setHoverPop(null)}
        onClick={(event) => {
          event.stopPropagation();
          if (isImage) setZoomed(item);
        }}
        title={isImage ? "查看大图" : undefined}
      >
        <Swatch item={item} />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13px] font-medium",
          bound && "text-muted-foreground",
        )}
      >
        {item.title}
      </span>
    </>
  );
}
