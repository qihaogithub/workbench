"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
} from "react";
import { cn } from "./utils";
import { generateIframeHtml } from "./iframe-template";
import {
  getCachedCompile,
  setCachedCompile,
  invalidateCompileCache,
} from "./compile-cache";
import {
  getEffectivePreviewSize,
  parseSizeValue,
  getAspectRatioValue,
  getBaseRowHeight,
  useVisiblePages,
  resolveImageUrls,
  FLASH_ANIMATION_CSS,
} from "./preview-grid-utils";
import type {
  PreviewSize,
  GridPageItem,
  PreviewGridProps,
} from "./types";

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

interface GridIframeProps {
  sessionId?: string;
  page: GridPageItem;
  visible: boolean;
  hasChanges?: boolean;
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  rowHeight?: number;
  snapshotVersion?: number;
  cssImports?: string[];
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
  cssImports,
}: GridIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [cardWidth, setCardWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const configDataRef = useRef(configData);
  configDataRef.current = configData;
  const iframeReadyRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const cssImportsRef = useRef(cssImports);
  cssImportsRef.current = cssImports;

  const isAuthorMode = !!sessionId;

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

        if (!isAuthorMode) {
          const resolvedConfig = configDataRef.current
            ? resolveImageUrls(configDataRef.current)
            : {};
          iframe.contentWindow?.postMessage(
            {
              type: "UPDATE_CODE",
              code: page.code,
              isUrl: true,
              configData: resolvedConfig,
              cssImports: cssImportsRef.current || [],
            },
            "*",
          );
        } else {
          const resolvedConfig = configDataRef.current
            ? resolveImageUrls(configDataRef.current)
            : {};
          iframe.contentWindow?.postMessage(
            { type: "UPDATE_CONFIG", configData: resolvedConfig },
            "*",
          );
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isAuthorMode, page.code]);

  useEffect(() => {
    if (!visible) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      iframeReadyRef.current = false;
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    iframeReadyRef.current = false;

    const load = async () => {
      if (isAuthorMode) {
        const currentSessionId = sessionIdRef.current || "";

        const cached = getCachedCompile(currentSessionId, page.id);
        if (cached) {
          if (cancelled) return;
          mountIframeWithCode(cached.compiledCode, cached.cssImports);
          return;
        }

        try {
          const body: Record<string, unknown> = {};
          if (currentSessionId) {
            body.sessionId = currentSessionId;
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
            if (!cancelled) {
              setHasError(true);
              setIsLoading(false);
            }
            return;
          }

          if (currentSessionId) {
            setCachedCompile(currentSessionId, page.id, data.data);
          }
          mountIframeWithCode(
            data.data.compiledCode,
            data.data.cssImports,
          );
        } catch {
          if (!cancelled) {
            setHasError(true);
            setIsLoading(false);
          }
        }
      } else {
        const resolvedConfig = configDataRef.current
          ? resolveImageUrls(configDataRef.current)
          : {};
        const html = generateIframeHtml({
          supportUrlMode: true,
          configData: resolvedConfig,
        });
        if (cancelled) return;

        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);

        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        blobUrlRef.current = url;
        setIsLoading(false);
      }
    };

    const mountIframeWithCode = (
      compiledCode: string,
      codeCssImports: string[],
    ) => {
      if (cancelled) return;

      const resolvedConfig = configDataRef.current
        ? resolveImageUrls(configDataRef.current)
        : {};
      const html = generateIframeHtml({
        compiledCode,
        cssImports: codeCssImports,
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
  }, [visible, isAuthorMode, sessionId, page.id, page.code, snapshotVersion]);

  useEffect(() => {
    if (!iframeReadyRef.current || !blobUrlRef.current) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const resolvedConfig = configData ? resolveImageUrls(configData) : {};

    if (!isAuthorMode) {
      iframe.contentWindow.postMessage(
        { type: "UPDATE_CONFIG", configData: resolvedConfig },
        "*",
      );
    } else {
      iframe.contentWindow.postMessage(
        { type: "UPDATE_CONFIG", configData: resolvedConfig },
        "*",
      );
    }
  }, [configData, isAuthorMode]);

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

  if (hasError || !blobUrlRef.current) {
    return (
      <div
        ref={wrapperRef}
        className="w-full h-full bg-muted/50 flex items-center justify-center"
      >
        <span className="text-xs text-muted-foreground">
          {hasError ? "加载失败" : page.name}
        </span>
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
  onGridColumnsChange,
  onCardClick,
  changedPageIds,
  configDataMap,
  previewSize,
  snapshotVersion,
  flashCardId,
  showToolbar = true,
  className,
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
    <div className={cn("h-full flex flex-col", className)}>
      {showToolbar && (
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-muted-foreground"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="7" height="7" x="3" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" />
              <rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
            <span className="text-sm font-medium">宫格视图</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {([2, 3, 4] as const).map((col) => {
                const isActive = gridColumns === col;
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => onGridColumnsChange(col)}
                    className={cn(
                      "h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                      isActive && "bg-muted text-foreground",
                    )}
                    title={`${col} 列`}
                  >
                    <span className="text-xs font-medium">{col}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">缩放</span>
              <input
                type="range"
                min={30}
                max={150}
                step={5}
                value={Math.round(gridScale * 100)}
                onChange={(e) => onGridScaleChange?.(Number(e.target.value) / 100)}
                className="w-24 h-1.5 accent-primary"
              />
              <span className="text-xs text-muted-foreground w-8">
                {Math.round(gridScale * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

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
        <div
          className="min-h-full px-4 pb-4 flex flex-col items-center"
          style={{
            justifyContent:
              alignmentMode === "center" ? "center" : "flex-start",
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
                          page.id === activePageId &&
                            "border-primary shadow-md ring-1 ring-primary/20",
                          flashCardId === page.id &&
                            "animate-grid-card-flash",
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
    </div>
  );
}
