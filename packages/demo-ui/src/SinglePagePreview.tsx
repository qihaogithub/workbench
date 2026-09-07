"use client";
import React, { lazy, Suspense, useMemo, useState } from "react";
import { Route } from "lucide-react";
import { resolvePagePresentation } from "@workbench/shared";

import { IframePreviewFrame } from "./IframePreviewFrame";
import { PreviewPanel } from "./PreviewPanel";
import { PrototypePagePreview } from "./PrototypePagePreview";
import { SandboxedHtmlFrame } from "./SandboxedHtmlFrame";
import {
  resolvePagePreviewRenderer,
  resolvePreviewStageSize,
} from "./preview-stage-resolver";
import type { SinglePagePreviewProps } from "./preview-stage-types";
import { cn } from "./utils";
import { PageNavigationOverlay } from "./PageNavigationOverlay";
import { extractHtmlImportFromClipboard } from "./html-import-clipboard";

const SketchPagePreview = lazy(() =>
  import("./SketchPagePreview").then((module) => ({
    default: module.SketchPagePreview,
  })),
);

function DefaultEmptyState() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center">
      <p className="text-sm text-muted-foreground">暂无可预览页面</p>
    </div>
  );
}

function SinglePagePreviewInternal({
  page,
  rendererProps,
  emptyState,
  className,
  onBackgroundClick,
  navigationPages,
  navigationHotspots,
  navigationConnections,
  navigationEditable = false,
  navigationActive: controlledNavigationActive,
  onNavigationActiveChange,
  showNavigationTool = true,
  onCreateNavigation,
  onUpdateNavigationHotspot,
  onUpdateNavigationTarget,
  onDeleteNavigationHotspot,
  onRequestPasteHtmlContent,
}: SinglePagePreviewProps) {
  console.count("[perf] SinglePagePreview render");
  const previewSize = useMemo(
    () => (page ? resolvePreviewStageSize(page) : undefined),
    [page?.presentation, page?.schema],
  );
  const renderer = page ? resolvePagePreviewRenderer(page) : "empty";
  const presentation = useMemo(
    () =>
      page?.presentation ??
      (page?.schema ? resolvePagePresentation(page.schema) : undefined),
    [page?.schema, page?.presentation],
  );
  const [uncontrolledNavigationActive, setUncontrolledNavigationActive] =
    useState(false);
  const navigationActive =
    controlledNavigationActive ?? uncontrolledNavigationActive;
  const setNavigationActive = (active: boolean) => {
    if (controlledNavigationActive === undefined) {
      setUncontrolledNavigationActive(active);
    }
    onNavigationActiveChange?.(active);
  };

  let content: React.ReactNode = emptyState ?? <DefaultEmptyState />;

  if (
    page &&
    renderer === "sandbox-html" &&
    page.sandboxExecutionUrl &&
    page.sandboxChannelId
  ) {
    content = (
      <SandboxedHtmlFrame
        {...rendererProps?.sandbox}
        executionUrl={page.sandboxExecutionUrl}
        channelId={page.sandboxChannelId}
        title={page.name}
        previewSize={previewSize}
        heightBehavior={presentation?.heightBehavior}
      />
    );
  } else if (page && renderer === "published-iframe" && page.iframeUrl) {
    const iframeProps = rendererProps?.iframe;
    content = (
      <IframePreviewFrame
        {...iframeProps}
        src={page.iframeUrl}
        title={page.name}
        previewSize={previewSize}
        configData={page.configData}
        visibilityRegions={Object.fromEntries(
          Object.entries(page.visibilityRegions ?? {})
            .filter(([key]) => key.startsWith(`${page.id}:`))
            .map(([key, state]) => [key.slice(page.id.length + 1), state]),
        )}
        demoId={iframeProps?.demoId ?? page.id}
      />
    );
  } else if (page && renderer === "prototype") {
    const prototypeProps = rendererProps?.prototype;
    content = (
      <PrototypePagePreview
        {...prototypeProps}
        html={page.prototypeHtml}
        css={page.prototypeCss}
        previewSize={previewSize}
        configData={page.configData}
        visibilityRegions={Object.fromEntries(
          Object.entries(page.visibilityRegions ?? {})
            .filter(([key]) => key.startsWith(`${page.id}:`))
            .map(([key, state]) => [key.slice(page.id.length + 1), state]),
        )}
        demoId={prototypeProps?.demoId ?? page.id}
        allowScroll={prototypeProps?.allowScroll ?? true}
      />
    );
  } else if (page && renderer === "sketch") {
    content = (
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-md border bg-background shadow-sm">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              正在加载手绘预览…
            </div>
          }
        >
          <SketchPagePreview
            {...rendererProps?.sketch}
            scene={page.sketchScene}
            previewSize={previewSize}
            configData={page.configData}
            fillContainer={rendererProps?.sketch?.fillContainer ?? true}
          />
        </Suspense>
      </div>
    );
  } else if (
    page &&
    (renderer === "compiled-module" || renderer === "authoring-code")
  ) {
    const highFidelityProps = rendererProps?.highFidelity;
    content = (
      <PreviewPanel
        {...highFidelityProps}
        code={page.code}
        compiledJsUrl={page.compiledJsUrl}
        previewSize={previewSize}
        configData={page.configData}
        demoId={highFidelityProps?.demoId ?? page.id}
      />
    );
  }

  return (
    <div className={cn("relative h-full min-h-0", className)}>
      <style>{`
        .preview-stage-single-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {page && navigationEditable && showNavigationTool && (
        <button type="button" className={cn("absolute right-5 top-5 z-40 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", navigationActive && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}
          aria-label="绘制页面跳转热区" aria-pressed={navigationActive} title="绘制页面跳转热区" onClick={() => setNavigationActive(!navigationActive)}>
          <Route className="h-4 w-4" />
        </button>
      )}
      <div
        data-preview-stage-single-scroll
        data-testid="single-page-preview-import-target"
        tabIndex={onRequestPasteHtmlContent ? 0 : undefined}
        className="preview-stage-single-scroll h-full overflow-y-auto p-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onPointerDownCapture={(event) => {
          if (!onRequestPasteHtmlContent) return;
          const target = event.target as HTMLElement;
          if (
            target.closest(
              "button, input, textarea, select, a, [contenteditable='true']",
            )
          ) {
            return;
          }
          event.currentTarget.focus();
        }}
        onPaste={(event) => {
          if (!onRequestPasteHtmlContent) return;
          const target = event.target as HTMLElement;
          if (
            target.isContentEditable ||
            target.closest("input, textarea, select, [contenteditable='true']")
          ) {
            return;
          }
          if (event.clipboardData.files.length > 0) return;
          const html = extractHtmlImportFromClipboard(event.clipboardData);
          if (!html) return;
          event.preventDefault();
          void onRequestPasteHtmlContent(html);
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          onBackgroundClick?.();
        }}
      >
        {content}
        {page?.visibilityStatus && (page.visibilityStatus.visible === false || page.visibilityStatus.enabled === false || page.visibilityStatus.unavailable === true) && (
          <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center rounded-md bg-slate-900/20">
            <span className="flex flex-col items-center gap-0.5 rounded-md bg-background/90 px-3 py-1.5 text-center text-xs text-muted-foreground shadow-sm">
              <span>{page.visibilityStatus.unavailable ? "业务配置不可用" : page.visibilityStatus.visible === false ? "业务配置已隐藏" : "业务配置已禁用"}</span>
              {page.visibilityStatus.message ? <span className="max-w-[280px] text-[10px]">{page.visibilityStatus.message}</span> : null}
              {page.visibilityStatus.reasons?.length ? (
                <span className="max-w-[280px] truncate text-[10px]">
                  由配置「{[...new Set(page.visibilityStatus.reasons.flatMap((reason) => reason.fieldKeys ?? [reason.fieldKey]))].join("、")}」控制
                </span>
              ) : null}
              {page.visibilityStatus.fallbackPageId ? <span className="text-[10px]">备用页：{page.visibilityStatus.fallbackPageId}</span> : null}
            </span>
          </div>
        )}
        {page && (
          <PageNavigationOverlay
            pageId={page.id}
            pages={navigationPages ?? []}
            hotspots={navigationHotspots}
            connections={navigationConnections}
            enabled={navigationActive}
            visible={navigationActive}
            editable={navigationEditable}
            onCreate={(rect, targetPageId, kind) => {
              onCreateNavigation?.(page.id, rect, targetPageId, kind);
              setNavigationActive(false);
            }}
            onUpdateHotspot={onUpdateNavigationHotspot}
            onUpdateTarget={onUpdateNavigationTarget}
            onDeleteHotspot={onDeleteNavigationHotspot}
          />
        )}
      </div>
    </div>
  );
}

function areSinglePagePreviewPropsEqual(
  prev: SinglePagePreviewProps,
  next: SinglePagePreviewProps,
): boolean {
  if (prev.rendererProps !== next.rendererProps) return false;
  if (prev.onRequestPasteHtmlContent !== next.onRequestPasteHtmlContent) {
    return false;
  }
  if (
    prev.navigationPages !== next.navigationPages ||
    prev.navigationHotspots !== next.navigationHotspots ||
    prev.navigationConnections !== next.navigationConnections ||
    prev.navigationEditable !== next.navigationEditable ||
    prev.navigationActive !== next.navigationActive ||
    prev.showNavigationTool !== next.showNavigationTool ||
    prev.onNavigationActiveChange !== next.onNavigationActiveChange ||
    prev.onCreateNavigation !== next.onCreateNavigation ||
    prev.onUpdateNavigationHotspot !== next.onUpdateNavigationHotspot ||
    prev.onUpdateNavigationTarget !== next.onUpdateNavigationTarget ||
    prev.onDeleteNavigationHotspot !== next.onDeleteNavigationHotspot
  ) {
    return false;
  }
  if (prev.page === next.page) return true;
  const p = prev.page;
  const n = next.page;
  if (!p || !n) return p === n;
  return (
    p.id === n.id &&
    p.code === n.code &&
    p.compiledJsUrl === n.compiledJsUrl &&
    p.prototypeHtml === n.prototypeHtml &&
    p.prototypeCss === n.prototypeCss &&
    p.configData === n.configData &&
    p.previewSize === n.previewSize &&
    p.presentation === n.presentation &&
    p.schema === n.schema &&
    p.runtimeType === n.runtimeType &&
    p.visibilityStatus?.visible === n.visibilityStatus?.visible &&
    p.visibilityStatus?.enabled === n.visibilityStatus?.enabled &&
    p.visibilityStatus?.reasons === n.visibilityStatus?.reasons &&
    p.visibilityRegions === n.visibilityRegions
  );
}

export const SinglePagePreview = React.memo(
  SinglePagePreviewInternal,
  areSinglePagePreviewPropsEqual,
);
