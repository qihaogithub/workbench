"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem } from "./CanvasPageItem";
import { CanvasToolbar } from "./CanvasToolbar";
import { cn } from "./utils";
import type { PreviewCanvasProps, CanvasState, CanvasPageLayout } from "./types";
import { generateThumbnailMeta } from "./thumbnail-generator";
import { collectThumbnailLayoutScript } from "./thumbnail-collector";
import type { ThumbnailMeta } from "./thumbnail-types";

const DEFAULT_PAGE_SIZE = { width: 375, height: 812 };
const THUMBNAIL_IFRAME_CONCURRENCY = 2;
const THUMBNAIL_COLLECT_DELAY = 800;
const THUMBNAIL_COLLECT_TIMEOUT = 8000;

function computeInitialLayout(
  pages: PreviewCanvasProps["pages"],
): Record<string, CanvasPageLayout> {
  const layout: Record<string, CanvasPageLayout> = {};
  const cols = 3;
  const gap = 40;

  pages.forEach((page, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = DEFAULT_PAGE_SIZE.width;
    const h = DEFAULT_PAGE_SIZE.height;

    layout[page.id] = {
      x: col * (w + gap),
      y: row * (h + gap),
      width: w,
      height: h,
      zIndex: i,
    };
  });

  return layout;
}

export function PreviewCanvas({
  editable = false,
  sessionId,
  projectId,
  pages,
  canvasState: externalState,
  onCanvasStateChange,
  onPageConfigEdit,
  onCanvasClick,
  className,
  editingPageId,
}: PreviewCanvasProps) {
  const [internalState, setInternalState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: computeInitialLayout(pages),
  });
  const [thumbnailMetaMap, setThumbnailMetaMap] = useState<Record<string, ThumbnailMeta>>({});
  const [generatingPages, setGeneratingPages] = useState<Set<string>>(new Set());

  const canvasState = externalState || internalState;

  const effectivePages = useMemo(() => {
    const baseLayout = computeInitialLayout(pages);
    return { ...baseLayout, ...canvasState.pages };
  }, [canvasState.pages, pages]);

  const updateState = useCallback(
    (updater: (prev: CanvasState) => CanvasState) => {
      const newState = updater(canvasState);
      if (externalState) {
        onCanvasStateChange(newState);
      } else {
        setInternalState(newState);
      }
    },
    [canvasState, externalState, onCanvasStateChange],
  );

  const collectThumbnailFromIframe = useCallback(
    async (pageId: string, code: string, configData: Record<string, unknown>): Promise<ThumbnailMeta> => {
      let compiledCode = code;
      let cssImports: string[] = [];

      if (code && code.trim().length > 0) {
        try {
          const body: Record<string, unknown> = { code };
          if (sessionId) {
            body.sessionId = sessionId;
          }
          const response = await fetch("/api/compile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const result = await response.json();
          if (result.success && result.data?.compiledCode) {
            compiledCode = result.data.compiledCode;
            cssImports = result.data.cssImports || [];
          }
        } catch (err) {
          console.error(`编译失败 [${pageId}]:`, err);
        }
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`缩略图采集超时: ${pageId}`));
        }, THUMBNAIL_COLLECT_TIMEOUT);

        const { generateIframeHtml } = require("./iframe-template");
        const html = generateIframeHtml({
          compiledCode,
          cssImports,
          configData,
          supportUrlMode: false,
        });

        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:375px;height:812px;pointer-events:none;opacity:0;";
        iframe.sandbox.add("allow-scripts", "allow-same-origin");

        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        iframe.src = url;

        let collectTimer: ReturnType<typeof setTimeout> | null = null;

        const handleMessage = (event: MessageEvent) => {
          if (event.source !== iframe.contentWindow) return;

          const { type, payload, error } = event.data;

          if (type === "READY") {
            if (collectTimer) clearTimeout(collectTimer);
            collectTimer = setTimeout(() => {
              collectTimer = null;
              iframe.contentWindow?.postMessage(
                { type: "COLLECT_THUMBNAIL_LAYOUT" },
                "*",
              );
            }, THUMBNAIL_COLLECT_DELAY);
          }

          if (type === "COMPONENT_READY") {
            if (collectTimer) clearTimeout(collectTimer);
            collectTimer = setTimeout(() => {
              collectTimer = null;
              iframe.contentWindow?.postMessage(
                { type: "COLLECT_THUMBNAIL_LAYOUT" },
                "*",
              );
            }, 200);
          }

          if (type === "THUMBNAIL_LAYOUT_RESULT") {
            cleanup();
            try {
              const meta = generateThumbnailMeta(payload);
              resolve(meta);
            } catch (e) {
              reject(e);
            }
            return;
          }

          if (type === "THUMBNAIL_LAYOUT_ERROR") {
            cleanup();
            reject(new Error(error || "缩略图采集失败"));
            return;
          }
        };

        const handleLoad = () => {
          hideIframeScrollbar(iframe);
        };

        const hideIframeScrollbar = (el: HTMLIFrameElement) => {
          try {
            const doc = el.contentDocument;
            if (!doc) return;
            const style = doc.createElement("style");
            style.textContent = "html { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none !important; }";
            doc.head.appendChild(style);
          } catch {}
        };

        iframe.addEventListener("load", handleLoad);
        window.addEventListener("message", handleMessage);

        const cleanup = () => {
          clearTimeout(timeout);
          if (collectTimer) {
            clearTimeout(collectTimer);
            collectTimer = null;
          }
          window.removeEventListener("message", handleMessage);
          iframe.removeEventListener("load", handleLoad);
          iframe.remove();
          URL.revokeObjectURL(url);
        };

        document.body.appendChild(iframe);
      });
    },
    [sessionId],
  );

  const generateMissingThumbnails = useCallback(async () => {
    const missingPages = pages.filter(
      (p) => !p.thumbnailMeta && !generatingPages.has(p.id) && p.code,
    );

    if (missingPages.length === 0) return;

    const queue = [...missingPages];

    const processNext = async () => {
      const page = queue.shift();
      if (!page || !page.code) return;

      setGeneratingPages((prev) => new Set(prev).add(page.id));

      try {
        const meta = await collectThumbnailFromIframe(
          page.id,
          page.code,
          page.configData || {},
        );
        setThumbnailMetaMap((prev) => ({ ...prev, [page.id]: meta }));
        onPageThumbnailGenerated?.(page.id, meta);
      } catch (error) {
        console.error(`缩略图生成失败 [${page.id}]:`, error);
      } finally {
        setGeneratingPages((prev) => {
          const next = new Set(prev);
          next.delete(page.id);
          return next;
        });
        if (queue.length > 0) {
          processNext();
        }
      }

      if (queue.length > 1 && THUMBNAIL_IFRAME_CONCURRENCY > 1) {
        const batch = queue.splice(0, THUMBNAIL_IFRAME_CONCURRENCY - 1);
        await Promise.all(
          batch.map(async (p) => {
            if (!p.code) return;
            setGeneratingPages((prev) => new Set(prev).add(p.id));
            try {
              const meta = await collectThumbnailFromIframe(
                p.id,
                p.code,
                p.configData || {},
              );
              setThumbnailMetaMap((prev) => ({ ...prev, [p.id]: meta }));
              onPageThumbnailGenerated?.(p.id, meta);
            } catch (error) {
              console.error(`缩略图生成失败 [${p.id}]:`, error);
            } finally {
              setGeneratingPages((prev) => {
                const next = new Set(prev);
                next.delete(p.id);
                return next;
              });
            }
          }),
        );
      }
    };

    for (let i = 0; i < THUMBNAIL_IFRAME_CONCURRENCY && queue.length > 0; i++) {
      processNext();
    }
  }, [pages, generatingPages, collectThumbnailFromIframe]);

  useEffect(() => {
    setThumbnailMetaMap((prev) => {
      const next: Record<string, ThumbnailMeta> = {};
      let changed = false;
      for (const p of pages) {
        if (p.thumbnailMeta) {
          next[p.id] = p.thumbnailMeta;
        } else if (prev[p.id]) {
          next[p.id] = prev[p.id];
        }
        if (!next[p.id] && prev[p.id]) changed = true;
        if (next[p.id] && !prev[p.id]) changed = true;
      }
      return changed ? next : prev;
    });
  }, [pages]);

  useEffect(() => {
    if (pages.length > 0) {
      generateMissingThumbnails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.map((p) => `${p.id}:${p.code ? '1' : '0'}`).join(",")]);

  const handleCanvasClick = useCallback(() => {
    onCanvasClick?.();
  }, [onCanvasClick]);

  const handleLayoutChange = useCallback(
    (pageId: string, layout: CanvasPageLayout) => {
      updateState((prev) => ({
        ...prev,
        pages: { ...prev.pages, [pageId]: layout },
      }));
    },
    [updateState],
  );

  const pagesWithMeta = useMemo(
    () =>
      pages.map((p) => ({
        ...p,
        thumbnailMeta: p.thumbnailMeta || thumbnailMetaMap[p.id],
      })),
    [pages, thumbnailMetaMap],
  );

  return (
    <div className={cn("w-full h-full relative overflow-hidden bg-muted/30", className)}>
      {editable && (
        <CanvasToolbar
          zoom={canvasState.viewport.zoom}
          onZoomChange={(zoom) =>
            updateState((prev) => ({
              ...prev,
              viewport: { ...prev.viewport, zoom },
            }))
          }
          onReset={() =>
            updateState((prev) => ({
              pages: computeInitialLayout(pages),
              viewport: { x: 40, y: 40, zoom: 0.5 },
            }))
          }
        />
      )}

      <CanvasViewport
        viewport={canvasState.viewport}
        onViewportChange={(viewport) =>
          updateState((prev) => ({ ...prev, viewport }))
        }
        editable={editable}
        onCanvasClick={handleCanvasClick}
      >
        {pagesWithMeta.map((page) => (
          <CanvasPageItem
            key={page.id}
            page={page}
            layout={effectivePages[page.id] || {
              x: 0,
              y: 0,
              width: DEFAULT_PAGE_SIZE.width,
              height: DEFAULT_PAGE_SIZE.height,
            }}
            editable={editable}
            isEditing={editingPageId === page.id}
            zoom={canvasState.viewport.zoom}
            sessionId={sessionId}
            onLayoutChange={handleLayoutChange}
            onConfigEdit={onPageConfigEdit}
          />
        ))}
      </CanvasViewport>
    </div>
  );
}

let _onPageThumbnailGenerated: ((pageId: string, meta: ThumbnailMeta) => void) | undefined;

export function setOnPageThumbnailGenerated(
  handler: (pageId: string, meta: ThumbnailMeta) => void,
) {
  _onPageThumbnailGenerated = handler;
}

function onPageThumbnailGenerated(pageId: string, meta: ThumbnailMeta) {
  _onPageThumbnailGenerated?.(pageId, meta);
}
