"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  generateIframeHtml,
  getEffectivePreviewSize,
  parseSizeValue,
  getAspectRatioValue,
  getBaseRowHeight,
  useVisiblePages,
  resolveImageUrls,
  FLASH_ANIMATION_CSS,
} from "@opencode-workbench/shared/demo";
import type {
  PreviewSize,
  GridPageItem,
  PreviewGridProps,
} from "@opencode-workbench/shared/demo";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { LayoutGrid, Columns2, Columns3, Columns4 } from "lucide-react";

function ViewerGridIframe({
  compiledJsUrl,
  cssImports,
  configData,
  previewSize,
  rowHeight,
  visible,
  pageName,
}: {
  compiledJsUrl?: string;
  cssImports?: string[];
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  rowHeight?: number;
  visible: boolean;
  pageName: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cardWidth, setCardWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const configDataRef = useRef(configData);
  configDataRef.current = configData;
  const iframeReadyRef = useRef(false);

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
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      if (event.data?.type === "READY") {
        iframeReadyRef.current = true;
        if (compiledJsUrl) {
          const resolvedConfig = configDataRef.current
            ? resolveImageUrls(configDataRef.current)
            : {};
          iframe.contentWindow?.postMessage(
            {
              type: "UPDATE_CODE",
              code: compiledJsUrl,
              isUrl: true,
              configData: resolvedConfig,
              cssImports: cssImports || [],
            },
            "*",
          );
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [compiledJsUrl, cssImports]);

  useEffect(() => {
    if (!visible) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      iframeReadyRef.current = false;
      return;
    }

    const html = generateIframeHtml({ supportUrlMode: true });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    blobUrlRef.current = url;
    setIsLoading(true);
    iframeReadyRef.current = false;

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [visible]);

  useEffect(() => {
    if (!iframeReadyRef.current || !blobUrlRef.current) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const resolvedConfig = configData ? resolveImageUrls(configData) : {};
    iframe.contentWindow.postMessage(
      { type: "UPDATE_CONFIG", configData: resolvedConfig },
      "*",
    );
  }, [configData]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  if (!visible) {
    return (
      <div
        ref={wrapperRef}
        className="w-full h-full bg-muted/50 flex items-center justify-center"
      >
        <span className="text-xs text-muted-foreground">{pageName}</span>
      </div>
    );
  }

  if (isLoading && !blobUrlRef.current) {
    return (
      <div
        ref={wrapperRef}
        className="w-full h-full bg-muted/30 flex items-center justify-center"
      >
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-muted-foreground" />
      </div>
    );
  }

  if (!blobUrlRef.current) {
    return (
      <div
        ref={wrapperRef}
        className="w-full h-full bg-muted/50 flex items-center justify-center"
      >
        <span className="text-xs text-muted-foreground">加载失败</span>
      </div>
    );
  }

  const effective = getEffectivePreviewSize(previewSize);
  const iframeWidth = parseSizeValue(effective.width) ?? 375;
  const iframeHeight = parseSizeValue(effective.height) ?? 812;
  const scale =
    rowHeight != null && rowHeight > 0
      ? rowHeight / iframeHeight
      : cardWidth > 0
        ? cardWidth / iframeWidth
        : 0.3;

  return (
    <div ref={wrapperRef} className="relative w-full h-full overflow-hidden">
      <iframe
        ref={iframeRef}
        src={blobUrlRef.current}
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => setIsLoading(false)}
        style={{
          width: iframeWidth,
          height: iframeHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: "none",
          pointerEvents: "none",
        }}
        title={pageName}
      />
    </div>
  );
}

export function PreviewGrid({
  sessionId,
  demoPages,
  activePageId,
  gridColumns,
  gridScale = 1.0,
  onGridScaleChange,
  onGridColumnsChange,
  onCardClick,
  configDataMap,
  previewSize,
  snapshotVersion,
}: PreviewGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageIds = demoPages.map((p) => p.id);
  const visiblePages = useVisiblePages(containerRef, pageIds);

  const rows: GridPageItem[][] = [];
  for (let i = 0; i < demoPages.length; i += gridColumns) {
    rows.push(demoPages.slice(i, i + gridColumns));
  }

  const actualRowHeight = getBaseRowHeight(gridColumns) * gridScale;

  const getRowHeight = useCallback(
    (row: GridPageItem[]) => {
      const gapTotal = (row.length - 1) * 16;
      const totalWidth = row.reduce((sum, p) => {
        const size = p.previewSize ?? previewSize;
        return sum + actualRowHeight * getAspectRatioValue(size);
      }, 0);
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const availableWidth = containerWidth - 32;
      if (totalWidth + gapTotal > availableWidth && availableWidth > 0) {
        return actualRowHeight * ((availableWidth - gapTotal) / totalWidth);
      }
      return actualRowHeight;
    },
    [actualRowHeight, previewSize],
  );

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
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">宫格视图</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            {([2, 3, 4] as const).map((col) => {
              const Icon = col === 2 ? Columns2 : col === 3 ? Columns3 : Columns4;
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => onGridColumnsChange(col)}
                  className={cn(
                    "h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                    gridColumns === col && "bg-muted text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">缩放</span>
            <Slider
              value={[gridScale * 100]}
              onValueChange={([v]) => onGridScaleChange?.(v / 100)}
              min={30}
              max={150}
              step={5}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground w-8">
              {Math.round(gridScale * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto preview-grid-scroll"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <style>{`
          .preview-grid-scroll::-webkit-scrollbar {
            display: none;
          }
          ${FLASH_ANIMATION_CSS}
        `}</style>
        <div className="min-h-full px-4 pb-4 flex flex-col items-center justify-start">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              alignItems: "flex-start",
            }}
          >
            {rows.map((row) => {
              const rowHeight = getRowHeight(row);
              return (
                <div
                  key={row.map((p) => p.id).join("-")}
                  style={{
                    display: "flex",
                    gap: "16px",
                    height: `${rowHeight}px`,
                  }}
                >
                  {row.map((page) => {
                    const effectiveSize = page.previewSize ?? previewSize;
                    const aspectRatio = getAspectRatioValue(effectiveSize);
                    const cardWidth = rowHeight * aspectRatio;
                    return (
                      <div
                        key={page.id}
                        data-page-id={page.id}
                        ref={activePageId === page.id ? scrollRef : undefined}
                        className={`relative rounded-lg overflow-hidden cursor-pointer transition-all border ${
                          page.id === activePageId
                            ? "border-primary shadow-md ring-1 ring-primary/20"
                            : "border-border hover:border-primary/50"
                        }`}
                        style={{
                          height: "100%",
                          width: `${cardWidth}px`,
                          flexShrink: 0,
                        }}
                        onClick={() => handleCardClick(page.id)}
                      >
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 z-10 pointer-events-none">
                          <span className="text-xs text-white font-medium truncate block">
                            {page.name}
                          </span>
                        </div>
                        <ViewerGridIframe
                          compiledJsUrl={page.code}
                          cssImports={[]}
                          configData={configDataMap?.[page.id] ?? {}}
                          previewSize={effectiveSize}
                          rowHeight={rowHeight}
                          visible={visiblePages.has(page.id)}
                          pageName={page.name}
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
    </div>
  );
}
