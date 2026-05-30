"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";
import {
  generateIframeHtml,
  getCachedCompile,
  setCachedCompile,
  invalidateCompileCache,
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
  GridIframeProps,
  PreviewGridProps,
} from "@opencode-workbench/shared/demo";

type AlignmentMode = "center" | "top";

function useAlignmentMode(
  containerRef: RefObject<HTMLElement | null>,
  gridRef: RefObject<HTMLElement | null>,
): AlignmentMode {
  const [mode, setMode] = useState<AlignmentMode>("top");

  useEffect(() => {
    const container = containerRef.current;
    const grid = gridRef.current;
    if (!container || !grid) return;

    const check = () => {
      const containerHeight = container.clientHeight;
      const gridHeight = grid.scrollHeight;
      const padding = 32;
      if (gridHeight + padding < containerHeight) {
        setMode("center");
      } else {
        setMode("top");
      }
    };

    check();

    const ro = new ResizeObserver(() => {
      check();
    });
    ro.observe(container);
    ro.observe(grid);

    return () => ro.disconnect();
  }, [containerRef, gridRef]);

  return mode;
}

function disableIframeScrollbar(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";
  } catch {}
}

function GridIframe({
  sessionId,
  page,
  visible,
  hasChanges,
  configData,
  previewSize,
  rowHeight,
  snapshotVersion,
}: GridIframeProps & { rowHeight?: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
        const resolvedConfig = configDataRef.current
          ? resolveImageUrls(configDataRef.current)
          : {};
        iframe.contentWindow?.postMessage(
          { type: "UPDATE_CONFIG", configData: resolvedConfig },
          "*",
        );
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!visible) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      iframeReadyRef.current = false;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    iframeReadyRef.current = false;

    const load = async () => {
      if (sessionId) {
        const cached = getCachedCompile(sessionId, page.id);
        if (cached) {
          if (cancelled) return;
          mountIframe(cached);
          return;
        }
      }

      try {
        const body: Record<string, unknown> = {};
        if (sessionId) {
          body.sessionId = sessionId;
          body.demoId = page.id;
        } else if (page.code) {
          body.code = page.code;
        } else {
          setIsLoading(false);
          return;
        }

        const res = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (cancelled || !data.success) {
          setIsLoading(false);
          return;
        }

        if (sessionId) {
          setCachedCompile(sessionId, page.id, data.data);
        }
        mountIframe(data.data);
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    };

    const mountIframe = (compileResult: {
      compiledCode: string;
      cssImports: string[];
    }) => {
      if (cancelled) return;

      const resolvedConfig = configDataRef.current
        ? resolveImageUrls(configDataRef.current)
        : {};
      const html = generateIframeHtml({
        compiledCode: compileResult.compiledCode,
        cssImports: compileResult.cssImports,
        configData: resolvedConfig,
      });
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = url;
      setIsLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [visible, sessionId, page.id, page.code, snapshotVersion]);

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
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      disableIframeScrollbar(iframe);
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [isLoading]);

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
        <span className="text-xs text-muted-foreground">{page.name}</span>
      </div>
    );
  }

  if (isLoading) {
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
        style={{
          width: iframeWidth,
          height: iframeHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: "none",
          pointerEvents: "none",
        }}
        title={page.name}
      />
      {hasChanges && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-400" />
      )}
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
  onCardClick,
  changedPageIds,
  configDataMap,
  previewSize,
  snapshotVersion,
  flashCardId,
}: PreviewGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridMeasureRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageIds = demoPages.map((p) => p.id);
  const visiblePages = useVisiblePages(containerRef, pageIds);
  const alignmentMode = useAlignmentMode(containerRef, gridMeasureRef);

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

  const handleCardWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const iframe = e.currentTarget.querySelector("iframe");
    if (!iframe?.contentWindow) return;
    try {
      iframe.contentWindow.scrollBy(0, e.deltaY);
    } catch {}
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activePageId]);

  useEffect(() => {
    if (!sessionId) return;
    return () => {
      invalidateCompileCache(sessionId);
    };
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto preview-grid-scroll"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <style>{`
        .preview-grid-scroll::-webkit-scrollbar {
          display: none;
        }
        ${FLASH_ANIMATION_CSS}
      `}</style>
      <div
        className="min-h-full px-4 pb-4 flex flex-col items-center"
        style={{
          justifyContent: alignmentMode === "center" ? "center" : "flex-start",
        }}
      >
        <div
          ref={gridMeasureRef}
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
                      className={cn(
                        "relative rounded-lg overflow-hidden cursor-pointer transition-all",
                        "border border-border hover:border-primary/50",
                        page.id === activePageId && "border-primary shadow-md ring-1 ring-primary/20",
                        flashCardId === page.id && "animate-grid-card-flash",
                      )}
                      style={{
                        height: "100%",
                        width: `${cardWidth}px`,
                        flexShrink: 0,
                      }}
                      onClick={() => handleCardClick(page.id)}
                      onWheel={handleCardWheel}
                    >
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 z-10 pointer-events-none">
                        <span className="text-xs text-white font-medium truncate block">
                          {page.name}
                        </span>
                      </div>
                      <GridIframe
                        sessionId={sessionId}
                        page={page}
                        visible={visiblePages.has(page.id)}
                        hasChanges={changedPageIds?.has(page.id) ?? false}
                        configData={configDataMap?.[page.id] ?? {}}
                        previewSize={effectiveSize}
                        rowHeight={rowHeight}
                        snapshotVersion={snapshotVersion}
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
