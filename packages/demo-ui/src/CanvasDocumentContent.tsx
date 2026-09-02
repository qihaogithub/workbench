"use client";

import type { MouseEvent } from "react";

import {
  getActiveCanvasDocumentEntry,
  getCanvasDocumentEntries,
} from "./canvas-kernel";
import type { CanvasDocumentNode } from "./types";
import { cn } from "./utils";
import { renderPageRequirementsMarkdown } from "./note-html";
import { decodeMarkdownReferenceUri } from "@workbench/shared/markdown-reference";
import type { MarkdownReferenceClickHandler } from "./DocumentEditor";

interface CanvasDocumentContentProps {
  node: CanvasDocumentNode;
  className?: string;
  contentClassName?: string;
  onActiveDocumentChange?: (nodeId: string, documentId: string) => void;
  onReferenceClick?: MarkdownReferenceClickHandler;
}

export function CanvasDocumentContent({
  node,
  className,
  contentClassName,
  onActiveDocumentChange,
  onReferenceClick,
}: CanvasDocumentContentProps) {
  const documentEntries = getCanvasDocumentEntries(node);
  const activeDocumentEntry = getActiveCanvasDocumentEntry(node);
  const renderedMarkdown = renderPageRequirementsMarkdown(
    node.markdown || "文档内容加载中...",
  );
  const handleReferenceClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-reference-uri]");
    if (!target) return;
    const uri = target.getAttribute("data-reference-uri");
    if (!uri) return;
    const reference = decodeMarkdownReferenceUri(uri);
    if (!reference) return;
    event.preventDefault();
    event.stopPropagation();
    onReferenceClick?.({ target: reference, labelSnapshot: target.textContent?.trim() || "" });
  };

  if (documentEntries.length > 1) {
    return (
      <div className={cn("flex h-full min-h-0", className)}>
        <div className="scrollbar-thin w-40 shrink-0 overflow-auto border-r bg-muted/30 py-2">
          {documentEntries.map((entry) => {
            const active = entry.id === activeDocumentEntry?.id;
            return (
              <button
                key={entry.id}
                type="button"
                className={cn(
                  "block w-full truncate px-3 py-2 text-left text-xs transition-colors hover:bg-background/80",
                  active
                    ? "bg-background font-medium text-foreground"
                    : "text-muted-foreground",
                )}
                title={entry.title}
                onClick={(event) => {
                  event.stopPropagation();
                  onActiveDocumentChange?.(node.id, entry.id);
                }}
              >
                {entry.title}
              </button>
            );
          })}
        </div>
        <div
          className={cn(
            "markdown-editor-content scrollbar-thin h-full min-w-0 flex-1 overflow-auto px-4 py-3 text-sm",
            contentClassName,
          )}
          onClick={handleReferenceClick}
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "markdown-editor-content scrollbar-thin h-full overflow-auto px-4 py-3 text-sm",
        className,
        contentClassName,
      )}
      onClick={handleReferenceClick}
      dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
    />
  );
}
