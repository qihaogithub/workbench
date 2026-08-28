"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CanvasNavigationConnection,
  CanvasNavigationHotspot,
  CanvasPageData,
} from "./types";

interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
type NavigationDraft = Pick<CanvasNavigationHotspot, "kind" | "rect">;
type ResizeHandle = "nw" | "ne" | "se" | "sw";
type EditGesture =
  | { kind: "move"; hotspot: CanvasNavigationHotspot; point: Point }
  | {
      kind: "resize";
      hotspot: CanvasNavigationHotspot;
      point: Point;
      handle: ResizeHandle;
    };
type Point = { x: number; y: number };

interface PageNavigationOverlayProps {
  pageId: string;
  pages: Pick<CanvasPageData, "id" | "name" | "order">[];
  hotspots?: CanvasNavigationHotspot[];
  connections?: CanvasNavigationConnection[];
  enabled?: boolean;
  visible?: boolean;
  editable?: boolean;
  onCreate?: (rect: NormalizedRect, targetPageId: string, kind: CanvasNavigationHotspot["kind"]) => void;
  /** 告知画布有一个尚未选择目标的新连线，可直接点选其他页面卡片。 */
  onPendingTargetChange?: (draft: NavigationDraft | null) => void;
  onUpdateHotspot?: (hotspotId: string, rect: NormalizedRect) => void;
  onUpdateTarget?: (hotspotId: string, targetPageId: string) => void;
  onDeleteHotspot?: (hotspotId: string) => void;
}

const MIN_HOTSPOT_SIZE = 12;
const POINT_HOTSPOT_SIZE = 0.002;
const HANDLE_CLASS =
  "absolute h-2.5 w-2.5 rounded-sm border border-primary bg-background shadow-sm";

function clampRect(rect: NormalizedRect): NormalizedRect {
  const width = Math.min(1, Math.max(0.001, rect.width));
  const height = Math.min(1, Math.max(0.001, rect.height));
  return {
    x: Math.min(Math.max(0, rect.x), 1 - width),
    y: Math.min(Math.max(0, rect.y), 1 - height),
    width,
    height,
  };
}

/** Shared, normalized hotspot creator and editor for canvas cards and preview. */
export function PageNavigationOverlay({
  pageId,
  pages,
  hotspots = [],
  connections = [],
  enabled = false,
  visible = false,
  editable = false,
  onCreate,
  onPendingTargetChange,
  onUpdateHotspot,
  onUpdateTarget,
  onDeleteHotspot,
}: PageNavigationOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<Point | null>(null);
  const editGestureRef = useRef<EditGesture | null>(null);
  const [draft, setDraft] = useState<NavigationDraft | null>(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    null,
  );
  const [editingRect, setEditingRect] = useState<NormalizedRect | null>(null);

  const toNormalized = useCallback((clientX: number, clientY: number) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)),
    };
  }, []);
  const rectFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const start = startRef.current;
      const end = toNormalized(clientX, clientY);
      if (!start || !end) return null;
      return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
    },
    [toNormalized],
  );
  const selectedHotspot = useMemo(
    () => hotspots.find((hotspot) => hotspot.id === selectedHotspotId),
    [hotspots, selectedHotspotId],
  );
  const targetByHotspotId = useMemo(
    () =>
      new Map(
        connections.map((connection) => [
          connection.source.hotspotId,
          connection.target.pageId,
        ]),
      ),
    [connections],
  );
  const targets = useMemo(
    () =>
      pages
        .filter((page) => page.id !== pageId)
        .slice()
        .sort((left, right) => left.order - right.order),
    [pageId, pages],
  );
  const selectedRect = editingRect ?? selectedHotspot?.rect ?? null;

  const cancel = useCallback(() => {
    const hadDraft = Boolean(draft);
    startRef.current = null;
    editGestureRef.current = null;
    setDraft(null);
    setEditingRect(null);
    setSelectedHotspotId(null);
    if (hadDraft) onPendingTargetChange?.(null);
  }, [draft, onPendingTargetChange]);
  useEffect(() => {
    if (!enabled && draft) cancel();
  }, [cancel, draft, enabled]);
  useEffect(() => {
    if (
      selectedHotspotId &&
      !hotspots.some((hotspot) => hotspot.id === selectedHotspotId)
    )
      cancel();
  }, [cancel, hotspots, selectedHotspotId]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel]);

  const getEditedRect = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, gesture: EditGesture) => {
      const point = toNormalized(event.clientX, event.clientY);
      if (!point) return null;
      const dx = point.x - gesture.point.x;
      const dy = point.y - gesture.point.y;
      const start = gesture.hotspot.rect;
      if (gesture.kind === "move")
        return clampRect({ ...start, x: start.x + dx, y: start.y + dy });
      const right = start.x + start.width;
      const bottom = start.y + start.height;
      const x = gesture.handle.includes("w")
        ? Math.max(0, Math.min(right - 0.001, start.x + dx))
        : start.x;
      const y = gesture.handle.includes("n")
        ? Math.max(0, Math.min(bottom - 0.001, start.y + dy))
        : start.y;
      const width = gesture.handle.includes("e")
        ? Math.max(0.001, Math.min(1 - start.x, start.width + dx))
        : right - x;
      const height = gesture.handle.includes("s")
        ? Math.max(0.001, Math.min(1 - start.y, start.height + dy))
        : bottom - y;
      return clampRect({ x, y, width, height });
    },
    [toNormalized],
  );

  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const hotspotId = target.closest<HTMLElement>("[data-navigation-hotspot]")
      ?.dataset.navigationHotspot;
    const handle = target.closest<HTMLElement>("[data-navigation-handle]")
      ?.dataset.navigationHandle as ResizeHandle | undefined;
    if (hotspotId && visible && editable) {
      const hotspot = hotspots.find((item) => item.id === hotspotId);
      const point = toNormalized(event.clientX, event.clientY);
      if (!hotspot || !point) return;
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      setSelectedHotspotId(hotspotId);
      setEditingRect(hotspot.rect);
      editGestureRef.current = handle
        ? { kind: "resize", hotspot, point, handle }
        : { kind: "move", hotspot, point };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!enabled) {
      if (event.target === event.currentTarget) cancel();
      return;
    }
    const point = toNormalized(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedHotspotId(null);
    setEditingRect(null);
    startRef.current = point;
    setDraft({ kind: "area", rect: { x: point.x, y: point.y, width: 0, height: 0 } });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = editGestureRef.current;
    if (gesture) {
      const rect = getEditedRect(event, gesture);
      if (rect) setEditingRect(rect);
      return;
    }
    if (!startRef.current) return;
    const next = rectFromPointer(event.clientX, event.clientY);
    if (next) setDraft({ kind: "area", rect: next });
  };
  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const gesture = editGestureRef.current;
    if (gesture) {
      const rect = getEditedRect(event, gesture) ?? editingRect;
      editGestureRef.current = null;
      if (rect) {
        setEditingRect(rect);
        onUpdateHotspot?.(gesture.hotspot.id, rect);
      }
      return;
    }
    if (!startRef.current) return;
    const next = rectFromPointer(event.clientX, event.clientY);
    startRef.current = null;
    if (!next) return cancel();
    const isArea =
      next.width * event.currentTarget.clientWidth >= MIN_HOTSPOT_SIZE &&
      next.height * event.currentTarget.clientHeight >= MIN_HOTSPOT_SIZE;
    const draft = isArea
      ? { kind: "area" as const, rect: next }
      : {
          kind: "point" as const,
          rect: clampRect({
            x: Math.min(1 - POINT_HOTSPOT_SIZE, Math.max(0, next.x - POINT_HOTSPOT_SIZE / 2)),
            y: Math.min(1 - POINT_HOTSPOT_SIZE, Math.max(0, next.y - POINT_HOTSPOT_SIZE / 2)),
            width: POINT_HOTSPOT_SIZE,
            height: POINT_HOTSPOT_SIZE,
          }),
        };
    setDraft(draft);
    onPendingTargetChange?.(draft);
  };

  const menuRect = draft?.rect ?? selectedRect;
  if (!(enabled || visible || hotspots.length > 0)) return null;
  return (
    <div
      ref={rootRef}
      className={
        enabled || (visible && editable)
          ? "absolute inset-0 z-30 cursor-crosshair"
          : "pointer-events-none absolute inset-0 z-30"
      }
      aria-label={enabled ? "绘制页面跳转热区" : undefined}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
    >
      {visible &&
        hotspots.map((hotspot) => {
          const isSelected = hotspot.id === selectedHotspotId;
          if (hotspot.kind === "point") return null;
          const rect = isSelected && selectedRect ? selectedRect : hotspot.rect;
          const targetName =
            targets.find(
              (page) => page.id === targetByHotspotId.get(hotspot.id),
            )?.name ?? "未设置";
          return (
            <div
              key={hotspot.id}
              data-navigation-hotspot={hotspot.id}
              aria-label={`页面跳转热区，目标：${targetName}`}
              className={
                isSelected
                  ? "absolute cursor-move rounded border-2 border-primary bg-primary/20 shadow-sm"
                  : "absolute cursor-pointer rounded border-2 border-primary bg-primary/10"
              }
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
            >
              {isSelected &&
                editable &&
                (["nw", "ne", "se", "sw"] as const).map((handle) => (
                  <span
                    key={handle}
                    data-navigation-handle={handle}
                    className={HANDLE_CLASS}
                    style={{
                      left: handle.includes("w") ? 0 : "100%",
                      top: handle.includes("n") ? 0 : "100%",
                      transform: "translate(-50%, -50%)",
                      cursor:
                        handle === "nw" || handle === "se"
                          ? "nwse-resize"
                          : "nesw-resize",
                    }}
                  />
                ))}
            </div>
          );
        })}
      {draft?.kind === "area" && (
        <div
          className="pointer-events-none absolute rounded border-2 border-primary bg-primary/10"
          style={{
            left: `${draft.rect.x * 100}%`,
            top: `${draft.rect.y * 100}%`,
            width: `${draft.rect.width * 100}%`,
            height: `${draft.rect.height * 100}%`,
          }}
        />
      )}
      {menuRect && (
        <div
          className="absolute z-40 max-h-56 w-52 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
          style={{
            left: `${Math.min(72, (menuRect.x + menuRect.width) * 100)}%`,
            top: `${Math.min(72, (menuRect.y + menuRect.height) * 100)}%`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="px-2 py-1 text-xs text-muted-foreground">
            {draft ? "跳转到页面" : "更改跳转目标"}
          </div>
          {targets.map((page) => {
            const active =
              selectedHotspot &&
              targetByHotspotId.get(selectedHotspot.id) === page.id;
            return (
              <button
                key={page.id}
                type="button"
                className={
                  active
                    ? "flex w-full cursor-pointer rounded bg-muted px-2 py-1.5 text-left text-sm"
                    : "flex w-full cursor-pointer rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                }
                onClick={() => {
                  if (draft) onCreate?.(draft.rect, page.id, draft.kind);
                  else if (selectedHotspot)
                    onUpdateTarget?.(selectedHotspot.id, page.id);
                  cancel();
                }}
              >
                {page.name}
              </button>
            );
          })}
          {selectedHotspot && editable && (
            <button
              type="button"
              className="mt-1 flex w-full cursor-pointer rounded border-t px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
              onClick={() => {
                onDeleteHotspot?.(selectedHotspot.id);
                cancel();
              }}
            >
              删除热区
            </button>
          )}
          <button
            type="button"
            className="mt-1 w-full cursor-pointer rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
            onClick={cancel}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
