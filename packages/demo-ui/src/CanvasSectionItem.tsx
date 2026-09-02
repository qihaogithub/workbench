"use client";

import { useEffect, useRef, useState } from "react";
import { resolveCanvasTitleMetrics } from "./canvas-utils";
import type { CanvasPageLayout, CanvasSection } from "./types";

interface CanvasSectionItemProps {
  section: CanvasSection;
  selected?: boolean;
  dropTarget?: boolean;
  editable?: boolean;
  startEditing?: boolean;
  zoom?: number;
  onSelect?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onLayoutChange?: (
    id: string,
    layout: CanvasPageLayout,
    operation: "move" | "resize",
  ) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}

/** Background-only canvas container; content remains independently interactive. */
export function CanvasSectionItem({
  section,
  selected = false,
  dropTarget = false,
  editable = false,
  startEditing = false,
  zoom = 1,
  onSelect,
  onRename,
  onLayoutChange,
  onDragStart,
  onDragEnd,
}: CanvasSectionItemProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    kind: "move" | "resize";
    startX: number;
    startY: number;
    layout: CanvasPageLayout;
  } | null>(null);

  useEffect(() => setTitle(section.title), [section.title]);
  useEffect(() => {
    if (startEditing && editable) setEditing(true);
  }, [editable, startEditing]);
  useEffect(() => {
    if (editing) {
      // select() only selects text; it does not reliably transfer focus (notably in jsdom).
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = title.trim() || "分组";
    setTitle(next);
    if (next !== section.title) onRename?.(section.id, next);
  };

  const style = section.style ?? {};
  const sectionColor = style.color ?? "#94a3b8";
  const fillOpacity = style.fillOpacity ?? 12;
  const titleMetrics = resolveCanvasTitleMetrics(zoom);
  const startDrag = (event: React.PointerEvent, kind: "move" | "resize") => {
    if (!editable || editing) return;
    const isTitleButton =
      kind === "move" &&
      event.target instanceof HTMLElement &&
      Boolean(event.target.closest("[data-section-title-button]"));
    // Keep the title button's native click/double-click sequence intact for
    // selection and rename, while the surrounding title bar still starts drag.
    if (!isTitleButton) event.preventDefault();
    event.stopPropagation();
    onSelect?.(section.id);
    onDragStart?.(section.id);
    dragRef.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      layout: section.layout,
    };
    // Capturing on the title button is safe for its click/double-click event,
    // and ensures a title-bar drag continues receiving pointer moves after the
    // pointer leaves the short label.
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    const layout =
      drag.kind === "move"
        ? { ...drag.layout, x: drag.layout.x + dx, y: drag.layout.y + dy }
        : {
            ...drag.layout,
            width: Math.max(80, drag.layout.width + dx),
            height: Math.max(60, drag.layout.height + dy),
          };
    onLayoutChange?.(section.id, layout, drag.kind);
  };
  const finishDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    onDragEnd?.();
  };
  const selectSection = (event: React.MouseEvent) => {
    event.stopPropagation();
    onSelect?.(section.id);
  };
  const edgeHandlers = {
    onPointerDown: (event: React.PointerEvent) => startDrag(event, "move"),
    onPointerMove: moveDrag,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
  };
  return (
    <div
      aria-label={`分组: ${section.title}`}
      className="pointer-events-none absolute box-border"
      style={{
        left: section.layout.x,
        top: section.layout.y,
        width: section.layout.width,
        height: section.layout.height,
        zIndex: section.layout.zIndex ?? -1,
        border: `1px solid ${sectionColor}`,
        borderRadius: 10,
        background: `color-mix(in srgb, ${sectionColor} ${fillOpacity}%, transparent)`,
        boxShadow: dropTarget
          ? "0 0 0 3px hsl(var(--primary) / 0.55)"
          : selected
            ? "0 0 0 1px hsl(var(--primary) / 0.6)"
          : undefined,
      }}
      data-canvas-section-id={section.id}
    >
      {editable && (
        <>
          {/* The edges are the only background hit targets. The interior stays transparent to members. */}
          <button
            type="button"
            aria-label={`选择并移动分组: ${section.title}`}
            className="pointer-events-auto absolute -left-1 -right-1 -top-1 h-2 cursor-move bg-transparent p-0"
            onClick={selectSection}
            {...edgeHandlers}
          />
          <div
            className="pointer-events-auto absolute -bottom-1 -left-1 -right-1 h-2 cursor-move"
            aria-hidden="true"
            {...edgeHandlers}
          />
          <div
            className="pointer-events-auto absolute -bottom-1 -left-1 -top-1 w-2 cursor-move"
            aria-hidden="true"
            {...edgeHandlers}
          />
          <div
            className="pointer-events-auto absolute -bottom-1 -right-1 -top-1 w-2 cursor-move"
            aria-hidden="true"
            {...edgeHandlers}
          />
        </>
      )}
      <div
        className="pointer-events-auto absolute left-0 flex max-w-full items-center gap-1 rounded-t-md border border-b-0 bg-background font-semibold shadow-sm"
        style={{
          top: -titleMetrics.sectionHeight,
          height: titleMetrics.sectionHeight,
          paddingInline: titleMetrics.sectionHorizontalPadding,
          fontSize: titleMetrics.fontSize,
        }}
        onPointerDown={(event) => startDrag(event, "move")}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (editable) setEditing(true);
        }}
      >
          {editing ? (
            <input
              ref={inputRef}
              value={title}
              maxLength={120}
                  aria-label="分组标题"
              className="w-48 bg-transparent outline-none"
              style={{ fontSize: "inherit" }}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") {
                  setTitle(section.title);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="max-w-48 truncate text-left"
              aria-label={`选择分组: ${section.title}，${section.children.length} 个成员，双击改名称`}
              title="双击改名称"
              data-section-title-button
              onClick={() => onSelect?.(section.id)}
            >
              {section.title} · {section.children.length}
            </button>
          )}
        </div>
      {selected && editable && (
        <div
          role="presentation"
          className="pointer-events-auto absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-primary bg-background"
          onPointerDown={(event) => startDrag(event, "resize")}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        />
      )}
    </div>
  );
}
