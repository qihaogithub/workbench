"use client";

import { ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigPoolItem } from "@/lib/design-specs";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";
import {
  CATEGORY_ORDER,
  KIND_META,
  pageLabel,
  Swatch,
} from "./DesignSpecVisuals";

/** 右侧栏「规范项」页签：页面与配置项统一绑定池。 */
export function DesignSpecConfigPanel() {
  const ws = useDesignSpecWorkspace();
  // 页面绑定是多对多关系；页面节点始终保留，避免“未绑定”筛选阻断复用。
  // bindFilter 只作用于配置项条目，由 workspace.filteredPool 负责处理。
  const visibleGroups = ws.poolGroups;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <input
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          placeholder="搜索规范项"
          value={ws.search}
          onChange={(e) => ws.setSearch(e.target.value)}
        />
        <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-secondary p-0.5">
          {(["all", "bound", "unbound"] as const).map((f) => (
            <button
              key={f}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] transition-colors",
                ws.bindFilter === f
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => ws.setBindFilter(f)}
            >
              {f === "all" ? "全部" : f === "bound" ? "已绑定" : "未绑定"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-2">
        <FilterChip
          active={ws.categoryFilter === "all"}
          onClick={() => ws.setCategoryFilter("all")}
        >
          全部
        </FilterChip>
        {CATEGORY_ORDER.filter((k) => ws.pool.some((p) => p.kind === k)).map(
          (k) => (
            <FilterChip
              key={k}
              active={ws.categoryFilter === k}
              onClick={() => ws.setCategoryFilter(k)}
            >
              {KIND_META[k].label}
            </FilterChip>
          ),
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visibleGroups.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            无匹配规范项
          </div>
        ) : (
          visibleGroups.map(([groupName, items]) => {
            const collapsed = ws.collapsedGroups.has(groupName);
            const hasItems = items.length > 0;
            const page = ws.pages.find((candidate) => candidate.name === groupName);
            return (
              <div key={groupName} className="mb-1">
                <div
                  draggable={Boolean(page)}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold",
                    page && "cursor-grab hover:bg-accent active:cursor-grabbing",
                  )}
                  onClick={() => {
                    if (hasItems) ws.toggleGroup(groupName);
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
                  {page && <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{groupName}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {page && ws.boundPageIds.has(page.id) ? "已绑定 · " : ""}{items.length} 项
                  </span>
                </div>
                {!collapsed && items.length > 0 && (
                  <div
                    data-design-spec-group-items
                    className="ml-5 border-l border-border/50 pl-2"
                  >
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
          })
        )}
      </div>
    </div>
  );
}

function FilterChip({
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
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
        active
          ? "border-transparent bg-secondary text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PoolItem({ item, bound }: { item: ConfigPoolItem; bound: boolean }) {
  const ws = useDesignSpecWorkspace();
  const isImage = item.kind === "image";
  const openHoverPreview = (x: number, y: number) => {
    ws.setHoverPop({ item, x, y });
  };
  return (
    <div
      draggable
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.dropEffect = "copy";
        e.dataTransfer.setData("text/plain", "pool:" + item.id);
      }}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        bound && "opacity-80",
      )}
    >
      <span
        draggable={false}
        tabIndex={0}
        className={cn(
          "shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "cursor-pointer",
        )}
        onMouseMove={(e) => openHoverPreview(e.clientX, e.clientY)}
        onMouseLeave={() => ws.setHoverPop(null)}
        onFocus={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          openHoverPreview(rect.right, rect.top);
        }}
        onBlur={() => ws.setHoverPop(null)}
        onClick={
          isImage
            ? () => {
                ws.setZoomed(item);
              }
            : undefined
        }
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
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{KIND_META[item.kind].label}</span>
          <span>{pageLabel(item)}</span>
          {bound && (
            <span className="rounded-full border px-1 text-[10px]">已绑定</span>
          )}
        </div>
      </div>
    </div>
  );
}
