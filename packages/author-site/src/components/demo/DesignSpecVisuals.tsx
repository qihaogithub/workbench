"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  ConfigPoolItem,
  ConfigPoolItemKind,
  DesignSpecRef,
} from "@/lib/design-specs";

export const KIND_META: Record<ConfigPoolItemKind, { label: string }> = {
  color: { label: "色值" },
  text: { label: "文字" },
  image: { label: "图片" },
  number: { label: "数值" },
  motion: { label: "动效" },
};

export const CATEGORY_ORDER: ConfigPoolItemKind[] = [
  "image",
  "motion",
  "color",
  "text",
  "number",
];

export function refToPoolId(ref: DesignSpecRef): string {
  return ref.scope === "project"
    ? `project:${ref.fieldKey}`
    : `page:${ref.pageId || ""}:${ref.fieldKey}`;
}

export function kindText(kind: ConfigPoolItemKind): string {
  if (kind === "color") return "●";
  if (kind === "image") return "🖼";
  if (kind === "motion") return "▶";
  if (kind === "number") return "#";
  return "Aa"; // text
}

function imagePlaceholder(item: ConfigPoolItem, w: number, h: number): string {
  const label = String(item.value ?? item.title);
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#2b3a55"/><text x="50%" y="50%" fill="#8ab4f8" font-size="${Math.round(
      w / 13,
    )}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">${label.slice(
      0,
      6,
    )}</text></svg>`,
  )}`;
}

export function imageSrc(item: ConfigPoolItem, w: number, h: number): string {
  const v = String(item.value ?? "");
  return v.startsWith("data:") || v.startsWith("http") || v.startsWith("/")
    ? v
    : imagePlaceholder(item, w, h);
}

/** 所在页面示意图（SVG data-uri） */
export function pageDiagramSrc(label: string): string {
  const safe = label.replace(/[<>&"]/g, "");
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="100%" height="100%" fill="#1a2233"/><rect x="24" y="24" width="752" height="60" rx="6" fill="#2b3a55"/><rect x="24" y="100" width="752" height="376" rx="6" fill="#242f47"/><text x="50%" y="50%" fill="#8ab4f8" font-size="34" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">${safe} 页面示意</text></svg>`,
  )}`;
}

export function pageLabel(item: ConfigPoolItem): string {
  return item.scope === "project" ? "项目级" : item.pageName || "页面";
}

/** 尺寸格式化：W=xxx H=xxx / W≥xxx H=xxx / W=不限 H=xxx */
export function formatSize(item: ConfigPoolItem): string {
  const s = item.size;
  if (!s) return "—";
  const wStr = s.wAny ? "不限" : s.wMin ? "≥" + s.w : "=" + s.w;
  const hStr = s.hAny ? "不限" : s.hMin ? "≥" + s.h : "=" + s.h;
  return `W${wStr}  H${hStr}`;
}

export function Swatch({
  item,
  size = 26,
}: {
  item: ConfigPoolItem;
  size?: number;
}) {
  if (item.kind === "color") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-md border"
        style={{
          width: size,
          height: size,
          background:
            typeof item.value === "string" ? item.value : "hsl(var(--secondary))",
        }}
      />
    );
  }
  if (item.kind === "image") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-cover bg-center"
        style={{ width: size, height: size, backgroundImage: `url('${imageSrc(item, size, size)}')` }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md border bg-secondary text-foreground"
      style={{ width: size, height: size }}
    >
      <span className="text-[10px] font-semibold">{kindText(item.kind)}</span>
    </span>
  );
}

/** 表格第一列大缩略图：图片显示默认值，色块显示颜色，其余显示固定图标 */
export function KindThumb({ item }: { item: ConfigPoolItem }) {
  if (item.kind === "color") {
    return (
      <div
        className="h-[52px] w-[52px] shrink-0 rounded-md border"
        style={{
          background:
            typeof item.value === "string" ? item.value : "hsl(var(--secondary))",
        }}
      />
    );
  }
  if (item.kind === "image") {
    return (
      <img
        src={imageSrc(item, 52, 52)}
        alt={item.title}
        className="h-[52px] w-[52px] shrink-0 rounded-md border object-cover"
      />
    );
  }
  return (
    <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-md border text-lg text-muted-foreground">
      {kindText(item.kind)}
    </div>
  );
}

export interface HoverPopState {
  item: ConfigPoolItem;
  x: number;
  y: number;
}

/** 配置项悬浮预览：所有类型显示所在页面，图片额外显示默认图。 */
export function HoverPop({ pop }: { pop: HoverPopState | null }) {
  if (!pop) return null;
  const hasImageDefault = pop.item.kind === "image";
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg border bg-popover p-1.5 shadow-2xl"
      style={{ left: pop.x + 14, top: pop.y + 14 }}
    >
      <div className="flex items-stretch gap-2.5">
        {hasImageDefault && (
          <div className="flex h-[240px] w-[240px] shrink-0 items-center justify-center overflow-hidden rounded-md border">
            <img
              src={imageSrc(pop.item, 240, 240)}
              alt={pop.item.title}
              className="h-full w-full object-contain"
            />
          </div>
        )}
        <img
          src={pageDiagramSrc(pageLabel(pop.item))}
          alt="所在页面示意"
          className={
            hasImageDefault
              ? "h-[180px] w-[200px] self-center rounded-md border object-cover"
              : "h-[180px] w-[240px] rounded-md border object-cover"
          }
        />
      </div>
    </div>
  );
}

/** 全屏图片查看：配置项默认图 + 所在页面示意图，滚轮整体缩放、拖拽平移、点击或 Esc 关闭 */
export function ZoomOverlay({
  item,
  onClose,
}: {
  item: ConfigPoolItem;
  onClose: () => void;
}) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setTransform((t) => ({
        ...t,
        x: d.ox + (e.clientX - d.sx),
        y: d.oy + (e.clientY - d.sy),
      }));
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onClose]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setTransform((t) => ({
      ...t,
      scale: Math.min(6, Math.max(0.5, t.scale + (e.deltaY < 0 ? 0.15 : -0.15))),
    }));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center overflow-hidden bg-black/85"
      onClick={onClose}
      onWheel={onWheel}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-zoom-close]")) return;
        dragRef.current = { sx: e.clientX, sy: e.clientY, ox: transform.x, oy: transform.y };
      }}
    >
      <div
        className="flex items-center gap-6"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        <div className="flex items-center">
          {item.kind === "image" ? (
            <img
              src={imageSrc(item, 800, 500)}
              alt={item.title}
              className="max-h-[70vh] max-w-[40vw] rounded-lg bg-black/40 object-contain"
              draggable={false}
            />
          ) : (
            <div
              className="h-[70vh] w-[40vw] max-w-[620px] rounded-lg"
              style={{
                background:
                  typeof item.value === "string" ? item.value : "hsl(var(--secondary))",
              }}
            />
          )}
        </div>
        <div className="flex items-center">
          <img
            src={pageDiagramSrc(pageLabel(item))}
            alt="所在页面示意"
            className="max-h-[70vh] max-w-[40vw] rounded-lg bg-black/40 object-contain"
            draggable={false}
          />
        </div>
      </div>
      <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs text-muted-foreground">
        滚轮整体缩放 · 拖拽平移 · 点击或 Esc 关闭
      </div>
      <button
        data-zoom-close
        className="absolute right-5 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
