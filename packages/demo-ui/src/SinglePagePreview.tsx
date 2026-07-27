"use client";

import React from "react";

import { IframePreviewFrame } from "./IframePreviewFrame";
import { PreviewPanel } from "./PreviewPanel";
import { PrototypePagePreview } from "./PrototypePagePreview";
import { SketchPagePreview } from "./SketchPagePreview";
import {
  resolvePagePreviewRenderer,
  resolvePreviewStageSize,
} from "./preview-stage-resolver";
import type { SinglePagePreviewProps } from "./preview-stage-types";
import { cn } from "./utils";

function DefaultEmptyState() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center">
      <p className="text-sm text-muted-foreground">暂无可预览页面</p>
    </div>
  );
}

export function SinglePagePreview({
  page,
  rendererProps,
  emptyState,
  className,
  onBackgroundClick,
}: SinglePagePreviewProps) {
  const previewSize = page ? resolvePreviewStageSize(page) : undefined;
  const renderer = page ? resolvePagePreviewRenderer(page) : "empty";

  let content: React.ReactNode = emptyState ?? <DefaultEmptyState />;

  if (page && renderer === "published-iframe" && page.iframeUrl) {
    const iframeProps = rendererProps?.iframe;
    content = (
      <IframePreviewFrame
        {...iframeProps}
        src={page.iframeUrl}
        title={page.name}
        previewSize={previewSize}
        configData={page.configData}
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
        demoId={prototypeProps?.demoId ?? page.id}
        allowScroll={prototypeProps?.allowScroll ?? true}
      />
    );
  } else if (page && renderer === "sketch") {
    content = (
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-md border bg-background shadow-sm">
        <SketchPagePreview
          {...rendererProps?.sketch}
          scene={page.sketchScene}
          previewSize={previewSize}
          configData={page.configData}
          fillContainer={rendererProps?.sketch?.fillContainer ?? true}
        />
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
      <div
        data-preview-stage-single-scroll
        className="preview-stage-single-scroll h-full overflow-y-auto p-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          onBackgroundClick?.();
        }}
      >
        {content}
      </div>
    </div>
  );
}

