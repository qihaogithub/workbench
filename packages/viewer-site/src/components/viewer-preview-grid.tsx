"use client";

import React, { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { getEmbedIframeUrl } from "@/lib/api";

interface PreviewSize {
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  scale?: number;
}

interface GridPageItem {
  id: string;
  name: string;
  order: number;
  previewSize?: PreviewSize;
}

function getPreviewAspectRatio(previewSize?: PreviewSize): string {
  const w =
    previewSize && typeof previewSize.width === "number"
      ? previewSize.width
      : null;
  const h =
    previewSize && typeof previewSize.height === "number"
      ? previewSize.height
      : null;
  if (w && h) return `${w}/${h}`;
  return "375/812";
}

function useVisiblePages(
  containerRef: RefObject<HTMLElement | null>,
  pages: GridPageItem[],
  bufferCount: number = 1,
): Set<string> {
  const [visiblePages, setVisiblePages] = useState<Set<string>>(new Set());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageId = entry.target.getAttribute("data-page-id");
            if (!pageId) continue;
            if (entry.isIntersecting) {
              next.add(pageId);
              const idx = pages.findIndex((p) => p.id === pageId);
              for (
                let i = Math.max(0, idx - bufferCount);
                i <= Math.min(pages.length - 1, idx + bufferCount);
                i++
              ) {
                next.add(pages[i].id);
              }
            } else {
              next.delete(pageId);
            }
          }
          return next;
        });
      },
      { root: container, rootMargin: "100% 0px" },
    );

    const cards = container.querySelectorAll("[data-page-id]");
    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [containerRef, pages, bufferCount]);

  return visiblePages;
}

interface ViewerGridCardProps {
  projectId: string;
  page: GridPageItem;
  visible: boolean;
  configData?: Record<string, unknown>;
}

function ViewerGridCard({
  projectId,
  page,
  visible,
  configData,
}: ViewerGridCardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [cardWidth, setCardWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const configDataRef = useRef(configData);
  configDataRef.current = configData;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!configData || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "UPDATE_CONFIG", configData },
      "*",
    );
  }, [configData]);

  if (!visible) {
    return (
      <div
        ref={wrapperRef}
        className="w-full h-full bg-muted/50 flex items-center justify-center"
      >
        <span className="text-xs text-muted-foreground">{page.name}</span>
      </div>
    );
  }

  const iframeWidth =
    page.previewSize && typeof page.previewSize.width === "number"
      ? page.previewSize.width
      : 375;
  const iframeHeight =
    page.previewSize && typeof page.previewSize.height === "number"
      ? page.previewSize.height
      : 812;
  const scale =
    cardWidth > 0 ? cardWidth / (typeof iframeWidth === "number" ? iframeWidth : 375) : 0.3;

  return (
    <div ref={wrapperRef} className="relative w-full h-full overflow-hidden">
      <iframe
        ref={iframeRef}
        src={getEmbedIframeUrl(projectId, page.id)}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: typeof iframeWidth === "number" ? iframeWidth : 375,
          height: typeof iframeHeight === "number" ? iframeHeight : 812,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: "none",
          pointerEvents: "none",
        }}
        title={page.name}
      />
    </div>
  );
}

interface ViewerPreviewGridProps {
  projectId: string;
  demoPages: GridPageItem[];
  activePageId: string;
  gridColumns: 2 | 3 | 4;
  onCardClick: (pageId: string) => void;
  configData?: Record<string, unknown>;
}

export function ViewerPreviewGrid({
  projectId,
  demoPages,
  activePageId,
  gridColumns,
  onCardClick,
  configData,
}: ViewerPreviewGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const visiblePages = useVisiblePages(containerRef, demoPages);

  const handleCardClick = useCallback(
    (pageId: string) => {
      onCardClick(pageId);
    },
    [onCardClick],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activePageId]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-4">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
          gap: "16px",
        }}
      >
        {demoPages.map((page) => {
          const aspectRatio = getPreviewAspectRatio(page.previewSize);
          return (
            <div
              key={page.id}
              data-page-id={page.id}
              ref={activePageId === page.id ? scrollRef : undefined}
              className={cn(
                "relative rounded-lg overflow-hidden cursor-pointer transition-all",
                activePageId === page.id
                  ? "border-2 border-primary ring-2 ring-primary/20 scale-[1.02]"
                  : "border border-border hover:border-primary/50",
              )}
              style={{ aspectRatio }}
              onClick={() => handleCardClick(page.id)}
            >
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 z-10 pointer-events-none">
                <span className="text-xs text-white font-medium truncate block">
                  {page.name}
                </span>
              </div>
              <ViewerGridCard
                projectId={projectId}
                page={page}
                visible={visiblePages.has(page.id)}
                configData={configData}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
