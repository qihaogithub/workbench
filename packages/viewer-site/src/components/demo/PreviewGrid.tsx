"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type { PreviewSize } from "./types";
import { generateIframeHtml } from "@/lib/iframe-template";

const DEFAULT_ASPECT_RATIO = 375 / 812;

function getBaseRowHeight(columns: number): number {
  const map: Record<number, number> = { 2: 500, 3: 380, 4: 300 };
  return map[columns] ?? 380;
}

function getAspectRatioValue(size?: PreviewSize): number {
  const w =
    typeof size?.width === "number"
      ? size.width
      : typeof size?.width === "string"
        ? parseFloat(size.width)
        : 375;
  const h =
    typeof size?.height === "number"
      ? size.height
      : typeof size?.height === "string"
        ? parseFloat(size.height)
        : 812;
  return isNaN(w) || isNaN(h) || h === 0 ? DEFAULT_ASPECT_RATIO : w / h;
}

function useVisiblePages(
  containerRef: React.RefObject<HTMLDivElement | null>,
  pageIds: string[],
  bufferCount = 1,
): Set<string> {
  const [visiblePages, setVisiblePages] = useState<Set<string>>(
    () => new Set(),
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pageIdsRef = useRef(pageIds);
  pageIdsRef.current = pageIds;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageId = entry.target.getAttribute("data-page-id");
            if (!pageId) continue;
            const idx = pageIdsRef.current.indexOf(pageId);
            if (idx === -1) continue;

            if (entry.isIntersecting) {
              next.add(pageId);
              for (
                let i = Math.max(0, idx - bufferCount);
                i <=
                Math.min(pageIdsRef.current.length - 1, idx + bufferCount);
                i++
              ) {
                next.add(pageIdsRef.current[i]);
              }
            } else {
              next.delete(pageId);
            }
          }
          return next;
        });
      },
      {
        root: container,
        rootMargin: "100% 0px",
      },
    );

    return () => {
      observerRef.current?.disconnect();
    };
  }, [containerRef, bufferCount]);

  useEffect(() => {
    const container = containerRef.current;
    const observer = observerRef.current;
    if (!container || !observer) return;

    const cards = container.querySelectorAll("[data-page-id]");
    cards.forEach((card) => observer.observe(card));

    return () => {
      cards.forEach((card) => observer.unobserve(card));
    };
  });

  return visiblePages;
}

interface ViewerGridPageItem {
  id: string;
  name: string;
  compiledJsUrl: string;
  previewSize?: PreviewSize;
}

interface ViewerGridIframeProps {
  page: ViewerGridPageItem;
  visible: boolean;
  rowHeight: number;
  cardWidth: number;
  configData?: Record<string, unknown>;
  isActive: boolean;
  flash: boolean;
  onClick: () => void;
}

function ViewerGridIframe({
  page,
  visible,
  rowHeight,
  cardWidth,
  configData,
  isActive,
  flash,
  onClick,
}: ViewerGridIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeSrcUrl, setIframeSrcUrl] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeReadyRef = useRef(false);
  const configDataRef = useRef(configData);
  configDataRef.current = configData;

  const effectiveSize = page.previewSize ?? {
    width: 375,
    height: 812,
  };
  const iframeWidth =
    typeof effectiveSize.width === "number"
      ? effectiveSize.width
      : parseFloat(String(effectiveSize.width)) || 375;
  const iframeHeight =
    typeof effectiveSize.height === "number"
      ? effectiveSize.height
      : parseFloat(String(effectiveSize.height)) || 812;

  const scale =
    rowHeight > 0 ? rowHeight / iframeHeight : cardWidth > 0 ? cardWidth / iframeWidth : 0.3;

  useEffect(() => {
    if (!visible) return;
    const html = generateIframeHtml({ supportUrlMode: true });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setIframeSrcUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setIframeSrcUrl(null);
      setIframeReady(false);
      iframeReadyRef.current = false;
    };
  }, [visible]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      const { type } = event.data;
      if (type === "READY") {
        iframeReadyRef.current = true;
        setIframeReady(true);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!iframeReady || !iframeRef.current || !page.compiledJsUrl) return;
    const iframe = iframeRef.current;
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "UPDATE_CODE",
        code: page.compiledJsUrl,
        isUrl: true,
        configData: configDataRef.current || {},
        cssImports: [],
      },
      "*",
    );
  }, [iframeReady, page.compiledJsUrl]);

  useEffect(() => {
    if (!iframeReadyRef.current || !iframeRef.current) return;
    const iframe = iframeRef.current;
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "UPDATE_CONFIG",
        configData: configData || {},
      },
      "*",
    );
  }, [configData, iframeReady]);

  if (!visible) {
    return (
      <div
        className="flex items-center justify-center bg-secondary/30 rounded-lg border border-border"
        style={{ width: cardWidth, height: rowHeight }}
        onClick={onClick}
      >
        <span className="text-xs text-muted-foreground truncate px-2">
          {page.name}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-lg border overflow-hidden cursor-pointer transition-shadow ${
        isActive
          ? "border-primary shadow-md ring-1 ring-primary/20"
          : "border-border hover:shadow-sm"
      } ${flash ? "animate-grid-card-flash" : ""}`}
      style={{ width: cardWidth, height: rowHeight }}
      onClick={onClick}
    >
      {iframeSrcUrl && (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-same-origin"
          src={iframeSrcUrl}
          style={{
            width: iframeWidth,
            height: iframeHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            border: "none",
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
          }}
          title={page.name}
        />
      )}
      <div
        className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent"
        style={{ pointerEvents: "none" }}
      >
        <span className="text-xs text-white truncate block">{page.name}</span>
      </div>
    </div>
  );
}

interface PreviewGridProps {
  pages: ViewerGridPageItem[];
  activePageId: string;
  gridColumns: 2 | 3 | 4;
  gridScale: number;
  onGridScaleChange: (scale: number) => void;
  onGridColumnsChange: (columns: 2 | 3 | 4) => void;
  onCardClick: (pageId: string) => void;
  configDataMap?: Record<string, Record<string, unknown>>;
  previewSize?: PreviewSize;
  flashCardId?: string;
}

export function PreviewGrid({
  pages,
  activePageId,
  gridColumns,
  gridScale,
  onGridScaleChange,
  onGridColumnsChange,
  onCardClick,
  configDataMap,
  previewSize,
  flashCardId,
}: PreviewGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const pageIds = useMemo(() => pages.map((p) => p.id), [pages]);
  const visiblePages = useVisiblePages(containerRef, pageIds);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => {
    const result: ViewerGridPageItem[][] = [];
    for (let i = 0; i < pages.length; i += gridColumns) {
      result.push(pages.slice(i, i + gridColumns));
    }
    return result;
  }, [pages, gridColumns]);

  const actualRowHeight = getBaseRowHeight(gridColumns) * gridScale;

  const getRowHeight = useCallback(
    (row: ViewerGridPageItem[]) => {
      const gapTotal = (row.length - 1) * 16;
      const totalWidth = row.reduce((sum, p) => {
        return sum + actualRowHeight * getAspectRatioValue(p.previewSize ?? previewSize);
      }, 0);
      const availableWidth = containerWidth - 32;
      if (totalWidth + gapTotal > availableWidth && availableWidth > 0) {
        return actualRowHeight * ((availableWidth - gapTotal) / totalWidth);
      }
      return actualRowHeight;
    },
    [actualRowHeight, previewSize, containerWidth],
  );

  return (
    <div className="flex flex-col h-full">
      <style>{`
        @keyframes grid-card-flash {
          0%, 100% { box-shadow: 0 0 0 2px rgba(59, 130, 246, 0); }
          50% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.6); }
        }
        .animate-grid-card-flash {
          animation: grid-card-flash 0.4s ease-in-out 2;
        }
      `}</style>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs text-muted-foreground">每行</span>
        {([2, 3, 4] as const).map((n) => (
          <button
            key={n}
            onClick={() => onGridColumnsChange(n)}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              gridColumns === n
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            {n}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {Math.round(gridScale * 100)}%
        </span>
        <button
          onClick={() => onGridScaleChange(Math.max(0.5, gridScale - 0.1))}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          −
        </button>
        <button
          onClick={() => onGridScaleChange(Math.min(2, gridScale + 0.1))}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          +
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4"
      >
        <div className="flex flex-col gap-4 items-center">
          {rows.map((row, rowIdx) => {
            const rowHeight = getRowHeight(row);
            return (
              <div key={rowIdx} className="flex gap-4">
                {row.map((page) => {
                  const aspectRatio = getAspectRatioValue(
                    page.previewSize ?? previewSize,
                  );
                  const cardWidth = rowHeight * aspectRatio;
                  return (
                    <div key={page.id} data-page-id={page.id}>
                      <ViewerGridIframe
                        page={page}
                        visible={visiblePages.has(page.id)}
                        rowHeight={rowHeight}
                        cardWidth={cardWidth}
                        configData={configDataMap?.[page.id]}
                        isActive={page.id === activePageId}
                        flash={page.id === flashCardId}
                        onClick={() => onCardClick(page.id)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
