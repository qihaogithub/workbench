"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { DocumentEditor } from "@workbench/demo-ui";
import { cn } from "@/lib/utils";
import type { DesignSpecEntry, DesignSpecRef } from "@/lib/design-specs";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";
import {
  formatSize,
  KIND_META,
  KindThumb,
  pageLabel,
  refToPoolId,
} from "./DesignSpecVisuals";

interface DesignSpecEditorProps {
  docId: string;
  focusEntryId?: string;
}

export function DesignSpecEditor({ docId, focusEntryId }: DesignSpecEditorProps) {
  const ws = useDesignSpecWorkspace();

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

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {/* 中栏：卡片列表 */}
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-y-auto p-4",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData("text/plain");
          if (raw.startsWith("pool:")) ws.addEntryWithItem(raw.slice(5));
        }}
      >
        {doc.entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border text-center text-sm text-muted-foreground">
            拖入配置项以创建规范
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {doc.entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                open={ws.openIds.has(entry.id)}
              />
            ))}
          </div>
        )}
        <button
          className="absolute bottom-5 right-5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
          title="新建条目"
          onClick={() => ws.addEntry()}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  open,
}: {
  entry: DesignSpecEntry;
  open: boolean;
}) {
  const ws = useDesignSpecWorkspace();
  const [dragover, setDragover] = useState(false);

  const poolByRef = (ref: DesignSpecRef) => {
    const id = refToPoolId(ref);
    return ws.pool.find((p) => p.id === id);
  };

  const validRefs = entry.refs.filter((r) => poolByRef(r));
  const staleRefs = entry.refs.filter((r) => !poolByRef(r));
  const hasRefs = entry.refs.length > 0;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", "entry:" + entry.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragover(false);
        const raw = e.dataTransfer.getData("text/plain");
        if (raw.startsWith("pool:")) ws.bindRef(raw.slice(5), entry.id);
        else if (raw.startsWith("entry:")) ws.reorderEntry(raw.slice(6), entry.id);
      }}
      className={cn(
        "overflow-hidden rounded-lg border bg-card transition-colors",
        dragover && "border-ring bg-accent/40",
      )}
    >
      {/* 头部 */}
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-accent/50"
        onClick={() => ws.toggleEntry(entry.id)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <input
          className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:bg-background focus:border focus:border-border"
          value={entry.title}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => ws.renameEntry(entry.id, e.target.value)}
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {entry.refs.length} 项配置
        </span>
        <button
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
          title="删除条目"
          onClick={(e) => {
            e.stopPropagation();
            ws.deleteEntry(entry.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 展开内容 */}
      {open && (
        <div className="border-t px-3 py-3">
          {/* 已绑定的配置项表格 */}
          {hasRefs && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="w-[52px] py-1 pr-2 font-medium"></th>
                  <th className="py-1 pr-2 font-medium">配置项</th>
                  <th className="py-1 pr-2 font-medium">格式</th>
                  <th className="py-1 font-medium">尺寸</th>
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
                      <td className="font-medium">{item.title}</td>
                      <td className="text-muted-foreground">
                        {item.format || "—"}
                      </td>
                      <td className="pr-7 text-muted-foreground">
                        {formatSize(item)}
                      </td>
                      <button
                        className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive group-hover/trow:inline-flex"
                        title="解绑"
                        onClick={() => ws.unbindRef(refToPoolId(ref), entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
                    <button
                      className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive group-hover/trow:inline-flex"
                      title="解绑"
                      onClick={() => ws.unbindRef(refToPoolId(ref), entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Markdown 说明 */}
          <div className={cn(hasRefs && "mt-3")}>
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                说明
              </span>
            </div>
            <DocumentEditor
              value={entry.markdown}
              onChange={(markdown) => ws.setMarkdown(entry.id, markdown)}
              placeholder="写点说明…"
              className="h-[260px] min-h-[220px] overflow-hidden rounded-md border"
            />
          </div>
        </div>
      )}
    </div>
  );
}
