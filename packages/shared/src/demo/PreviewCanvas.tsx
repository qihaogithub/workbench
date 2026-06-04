"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasPageItem } from "./CanvasPageItem";
import { CanvasToolbar } from "./CanvasToolbar";
import { cn } from "./utils";
import type { PreviewCanvasProps, CanvasState, CanvasPageLayout } from "./types";

const DEFAULT_PAGE_SIZE = { width: 375, height: 812 };

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
  snapshots = {},
  snapshotVersion = 0,
  className,
  editingPageId,
}: PreviewCanvasProps) {
  const [internalState, setInternalState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: computeInitialLayout(pages),
  });
  const [loadingPageIds, setLoadingPageIds] = useState<Set<string>>(new Set());

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

  const ensureMissingSnapshots = useCallback(async () => {
    const missing = pages.filter((p) => !snapshots[p.id] && !loadingPageIds.has(p.id));
    if (missing.length === 0) return;

    setLoadingPageIds((prev) => {
      const next = new Set(prev);
      missing.forEach((p) => next.add(p.id));
      return next;
    });

    try {
      const agentUrl = typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "")
        : "";

      const res = await fetch(
        `${agentUrl}/api/snapshots/generate-batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: projectId || "temp",
            pages: missing.map((p) => ({
              pageId: p.id,
              code: p.code || "",
              configData: p.configData,
              width: DEFAULT_PAGE_SIZE.width,
              height: DEFAULT_PAGE_SIZE.height,
            })),
          }),
        },
      );

      await res.json();
    } catch (error) {
      console.error("补充截图生成失败:", error);
    } finally {
      setLoadingPageIds(new Set());
    }
  }, [pages, snapshots, projectId, loadingPageIds]);

  useEffect(() => {
    if (pages.length > 0) {
      ensureMissingSnapshots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.map((p) => p.id).join(","), Object.keys(snapshots).join(",")]);

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

  const allMissing = pages.length > 0 && pages.every((p) => !snapshots[p.id]);

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
        {pages.map((page) => (
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
            snapshotUrl={snapshots[page.id]}
            snapshotVersion={snapshotVersion}
            sessionId={sessionId}
            onLayoutChange={handleLayoutChange}
            onConfigEdit={onPageConfigEdit}
          />
        ))}
      </CanvasViewport>

      {allMissing && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">正在生成页面快照...</p>
          </div>
        </div>
      )}
    </div>
  );
}
