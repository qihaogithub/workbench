"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DocumentEditor,
  type MarkdownReferenceClickHandler,
  type MarkdownReferenceContext,
  type MarkdownReferenceProvider,
} from "@workbench/demo-ui";
import { cn } from "@/lib/utils";
import type { DesignSpecEntry, DesignSpecRef } from "@/lib/design-specs";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";
import {
  formatSize,
  KIND_META,
  KindThumb,
  refToPoolId,
} from "./DesignSpecVisuals";
import { localizeRemoteImageForSession } from "@workbench/demo-ui/markdown/remote-image-localizer";
import {
  getDesignSpecDropPosition,
  type DesignSpecDropPosition,
} from "./design-spec-order";

interface DesignSpecEditorProps {
  docId: string;
  focusEntryId?: string;
  readOnly?: boolean;
  workspaceId?: string;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  onEditConfigDefinition?: (target: DesignSpecRef) => void;
}

export function DesignSpecEditor({
  docId,
  focusEntryId,
  readOnly = false,
  workspaceId,
  referenceProvider,
  onReferenceClick,
  onEditConfigDefinition,
}: DesignSpecEditorProps) {
  const ws = useDesignSpecWorkspace();
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [overEntryId, setOverEntryId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DesignSpecDropPosition | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 选中当前设计规范文档；离开时清空
  const setActiveDocIdRef = useRef(ws.setActiveDocId);
  setActiveDocIdRef.current = ws.setActiveDocId;
  useEffect(() => {
    setActiveDocIdRef.current(docId);
  }, [docId]);
  useEffect(() => {
    return () => setActiveDocIdRef.current(null);
  }, []);
  useEffect(() => {
    if (focusEntryId) ws.openEntry(focusEntryId);
  }, [focusEntryId, ws.openEntry]);

  const clearDragState = useCallback(() => {
    setActiveEntryId(null);
    setOverEntryId(null);
    setDropPosition(null);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveEntryId(String(event.active.id));
    setOverEntryId(null);
    setDropPosition(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setOverEntryId(null);
      setDropPosition(null);
      return;
    }
    const activeRect = active.rect.current.translated ?? active.rect.current.initial;
    const overRect = over.rect;
    if (!activeRect || !overRect) return;
    setOverEntryId(String(over.id));
    setDropPosition(getDesignSpecDropPosition(activeRect, overRect, getDragPointerY(event)));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const sourceId = String(event.active.id);
      const targetId = event.over ? String(event.over.id) : null;
      const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
      // DragOver state can lag behind the final pointer event, so recompute the side at drop time.
      const position =
        (event.over && activeRect
          ? getDesignSpecDropPosition(activeRect, event.over.rect, getDragPointerY(event))
          : dropPosition);
      clearDragState();
      if (!targetId || !position || sourceId === targetId) return;
      ws.reorderEntry(sourceId, targetId, position);
    },
    [clearDragState, dropPosition, ws],
  );

  if (ws.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ws.doc) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        设计规范文档不存在
      </div>
    );
  }

  const doc = ws.doc;
  const activeEntry = activeEntryId
    ? doc.entries.find((entry) => entry.id === activeEntryId) ?? null
    : null;

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      {/* 中栏：卡片列表 */}
      <div
        data-testid="design-spec-scroll-area"
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-y-auto p-4",
        )}
        onDragOver={(e) => {
          if (readOnly) return;
          const types = Array.from(e.dataTransfer.types);
          if (!types.includes("text/plain")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (readOnly) return;
          e.preventDefault();
          const raw = e.dataTransfer.getData("text/plain");
          if (raw.startsWith("pool:")) ws.addEntryWithItem(raw.slice(5));
          else if (raw.startsWith("page:")) ws.addEntryWithPage(raw.slice(5));
        }}
      >
        {doc.entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border text-center text-sm text-muted-foreground">
            拖入页面或配置项以创建规范
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={clearDragState}
          >
            <SortableContext
              items={doc.entries.map((entry) => entry.id)}
              strategy={verticalListSortingStrategy}
            >
              <div data-testid="design-spec-sortable-list" className="flex flex-col gap-3">
                {doc.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    docId={doc.id}
                    entry={entry}
                    open={ws.openIds.has(entry.id)}
                    readOnly={readOnly}
                    workspaceId={workspaceId}
                    referenceProvider={referenceProvider}
                    onReferenceClick={onReferenceClick}
                    onEditConfigDefinition={onEditConfigDefinition}
                    isDropTarget={overEntryId === entry.id}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
              {activeEntry ? <EntryCardOverlay entry={activeEntry} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      {!readOnly && (
        <div className="absolute bottom-5 right-5 z-10">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
            title="新建页面规范"
            onClick={() => ws.addEntry()}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function EntryCard({
  docId,
  entry,
  open,
  readOnly,
  workspaceId,
  referenceProvider,
  onReferenceClick,
  onEditConfigDefinition,
  isDropTarget,
}: {
  docId: string;
  entry: DesignSpecEntry;
  open: boolean;
  readOnly: boolean;
  workspaceId?: string;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  onEditConfigDefinition?: (target: DesignSpecRef) => void;
  isDropTarget: boolean;
}) {
  const ws = useDesignSpecWorkspace();
  const [nativeDragover, setNativeDragover] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: readOnly });
  const localizeRemoteImage = useMemo(
    () =>
      !readOnly && ws.sessionId
        ? (url: string) => localizeRemoteImageForSession(ws.sessionId!, url)
        : undefined,
    [readOnly, ws.sessionId],
  );

  const poolByRef = (ref: DesignSpecRef) => {
    const id = refToPoolId(ref);
    return ws.pool.find((p) => p.id === id);
  };

  const configTarget = entry.target.type === "config" ? entry.target : null;
  const isConfigSpec = configTarget !== null;
  const refs = configTarget?.refs ?? [];
  const validRefs = refs.filter((r) => poolByRef(r));
  const staleRefs = refs.filter((r) => !poolByRef(r));
  const hasRefs = refs.length > 0;
  const pageIds = entry.target.type === "page" ? entry.target.pageIds : [];
  const boundPages = pageIds.map((pageId) => ({
    id: pageId,
    name: ws.pages.find((page) => page.id === pageId)?.name ?? pageId,
  }));
  const bindingCount = isConfigSpec ? refs.length : pageIds.length;
  const bindingStatus = bindingCount === 0
    ? "待绑定"
    : isConfigSpec
      ? "配置项规范"
      : "页面规范";

  const isNativeDrop = (event: React.DragEvent) => {
    return Array.from(event.dataTransfer.types).includes("text/plain");
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "relative",
        isDragging && "z-10 opacity-30",
      )}
    >
      <div
      onDragOver={(e) => {
        if (readOnly) return;
        if (!isNativeDrop(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setNativeDragover(true);
      }}
      onDragLeave={() => setNativeDragover(false)}
      onDrop={(e) => {
        if (readOnly) return;
        if (!isNativeDrop(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setNativeDragover(false);
        const raw = e.dataTransfer.getData("text/plain");
        if (raw.startsWith("pool:")) ws.bindRef(raw.slice(5), entry.id);
        else if (raw.startsWith("page:")) ws.bindPage(entry.id, raw.slice(5));
      }}
      className={cn(
        "group overflow-hidden rounded-lg border bg-card transition-[background-color,border-color,box-shadow] duration-200",
        nativeDragover && "border-ring bg-accent/40",
        isDropTarget &&
          "border-primary bg-accent/60 shadow-[0_0_0_2px_hsl(var(--primary)/0.12)]",
      )}
    >
      {/* 头部 */}
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-accent/50"
        onClick={() => ws.toggleEntry(entry.id)}
      >
        <button
          type="button"
          aria-label={`拖动排序${entry.title}`}
          title="拖动排序"
          className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <input
          className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:bg-background focus:border focus:border-border"
          value={entry.title}
          readOnly={readOnly}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => ws.renameEntry(entry.id, e.target.value)}
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {bindingCount === 0
            ? bindingStatus
            : isConfigSpec
              ? `${refs.length} 项配置`
              : `${pageIds.length} 个页面`}
        </span>
        {!readOnly && <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-destructive"
          title="删除条目"
          onClick={(e) => {
            e.stopPropagation();
            ws.deleteEntry(entry.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>}
      </div>

      {/* 展开内容 */}
      {open && (
        <div className="border-t px-3 py-3">
          {/* 已绑定的配置项表格 */}
          {isConfigSpec && hasRefs && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="w-[52px] py-1 pr-2 font-medium"></th>
                  <th className="py-1 pr-2 font-medium">配置项</th>
                  <th className="py-1 pr-2 font-medium">格式</th>
                  <th className="py-1 font-medium">尺寸</th>
                  <th className="w-0 p-0">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {validRefs.map((ref) => {
                  const item = poolByRef(ref)!;
                  return (
                    <tr
                      key={refToPoolId(ref)}
                      className="group/trow relative hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <td className="py-1 pr-2">
                        <div
                          tabIndex={0}
                          role="button"
                          aria-label={`预览${item.title}`}
                          onMouseMove={(e) =>
                            ws.setHoverPop({
                              item,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                          onMouseLeave={() => ws.setHoverPop(null)}
                          onFocus={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            ws.setHoverPop({ item, x: rect.right, y: rect.top });
                          }}
                          onBlur={() => ws.setHoverPop(null)}
                          onClick={() => {
                            if (item.kind === "image") ws.setZoomed(item);
                          }}
                          className={cn(
                            "inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            item.kind === "image" ? "cursor-zoom-in" : "cursor-pointer",
                          )}
                        >
                          <KindThumb item={item} />
                        </div>
                      </td>
                      <td className="font-medium"><div>{item.title}</div>{item.breadcrumbs && item.breadcrumbs.length > 1 && <div className="text-[11px] font-normal text-muted-foreground">{item.breadcrumbs.join(" / ")}</div>}</td>
                      <td className="text-muted-foreground">
                        {item.format || "—"}
                      </td>
                      <td className="pr-7 text-muted-foreground">
                        {formatSize(item)}
                      </td>
                      <td className="w-0 p-0 text-right">
                        {!readOnly && <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/trow:opacity-100 group-focus-within/trow:opacity-100">
                          {onEditConfigDefinition && !item.isConst && !item.key.includes(".") && !item.key.includes("[") && <button
                            type="button"
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title="编辑配置项"
                            aria-label={`编辑配置项：${item.title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditConfigDefinition(ref);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>}
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title="解绑"
                            aria-label={`解绑配置项：${item.title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              ws.unbindRef(refToPoolId(ref), entry.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>}
                      </td>
                    </tr>
                  );
                })}
                {staleRefs.map((ref) => (
                  <tr
                    key={`stale-${refToPoolId(ref)}`}
                    className="relative group/trow text-muted-foreground"
                  >
                    <td className="py-1 pr-2">
                      <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-md border bg-secondary text-muted-foreground">
                        ?
                      </span>
                    </td>
                    <td className="italic">已失效引用</td>
                    <td>-</td>
                    <td className="pr-7">-</td>
                    <td className="w-0 p-0 text-right">
                      {!readOnly && <button
                        className="hidden rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive group-hover/trow:inline-flex"
                        title="解绑"
                        onClick={() => ws.unbindRef(refToPoolId(ref), entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 已绑定的页面名称 */}
          {boundPages.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">页面</div>
              <div className="flex flex-col gap-1">
                {boundPages.map((page) => (
                  <div
                    key={page.id}
                    aria-label={`绑定页面：${page.name}`}
                    className="group flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{page.name}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        title="解绑页面"
                        aria-label={`解绑页面：${page.name}`}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/15 hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          ws.unbindPage(page.id, entry.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Markdown 说明 */}
          <div className={cn(isConfigSpec && hasRefs && "mt-3")}>
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                说明
              </span>
            </div>
            <DocumentEditor
              documentKey={`${docId}:${entry.id}`}
              value={entry.markdown}
              onChange={(markdown) => ws.setMarkdown(entry.id, markdown)}
              localizeRemoteImage={localizeRemoteImage}
              readOnly={readOnly}
              referenceContext={
                ws.projectId && workspaceId
                  ? ({
                      source: {
                        kind: "design-spec-entry",
                        projectId: ws.projectId,
                        workspaceId,
                        specId: docId,
                        entryId: entry.id,
                      },
                      policy: {
                        allowedTargetKinds: ["project", "page", "document"],
                        sameProjectOnly: true,
                        allowUnresolved: false,
                      },
                    } satisfies MarkdownReferenceContext)
                  : undefined
              }
              referenceProvider={referenceProvider}
              onReferenceClick={onReferenceClick}
              placeholder="写点说明…"
              scrollable={false}
              className="rounded-md border"
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function EntryCardOverlay({ entry }: { entry: DesignSpecEntry }) {
  const bindingCount = entry.target.type === "config"
    ? entry.target.refs.length
    : entry.target.pageIds.length;
  const bindingLabel = entry.target.type === "config" ? "项配置" : "个页面";

  return (
    <div className="w-full max-w-2xl rounded-lg border border-primary/60 bg-card/95 shadow-xl ring-2 ring-primary/15">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="h-4 w-4 shrink-0 text-primary" />
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.title}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {bindingCount > 0 ? `${bindingCount} ${bindingLabel}` : "待绑定"}
        </span>
      </div>
    </div>
  );
}

function getDragPointerY(event: {
  activatorEvent: Event;
  delta: { y: number };
}): number | undefined {
  const activatorEvent = event.activatorEvent;
  if ("clientY" in activatorEvent && typeof activatorEvent.clientY === "number") {
    return activatorEvent.clientY + event.delta.y;
  }
  return undefined;
}
