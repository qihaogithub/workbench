"use client";

import { useEffect, useState } from "react";

import { getCanvasDocumentEntries } from "./canvas-kernel";
import type { CanvasDocumentNode, CanvasKnowledgeDocument } from "./types";

interface UseCanvasDocumentMarkdownOptions {
  documentNodes: CanvasDocumentNode[];
  onReadKnowledgeDocument?: (document: CanvasKnowledgeDocument) => Promise<string>;
}

export function useCanvasDocumentMarkdown({
  documentNodes,
  onReadKnowledgeDocument,
}: UseCanvasDocumentMarkdownOptions) {
  const [markdownByDocumentId, setMarkdownByDocumentId] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!onReadKnowledgeDocument) return;

    const documentsToLoad = Array.from(
      new Map(
        documentNodes
          .flatMap((node) =>
            getCanvasDocumentEntries(node).map((entry) => [
              entry.knowledgeDocument.id,
              entry.knowledgeDocument,
            ] as const),
          )
          .filter(
            ([documentId]) => markdownByDocumentId[documentId] === undefined,
          ),
      ).values(),
    );

    if (documentsToLoad.length === 0) return;

    let cancelled = false;
    void Promise.all(
      documentsToLoad.map(async (document) => {
        try {
          return {
            id: document.id,
            markdown: await onReadKnowledgeDocument(document),
          };
        } catch {
          return { id: document.id, markdown: "文档内容加载失败" };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setMarkdownByDocumentId((prev) => {
        const next = { ...prev };
        for (const result of results) {
          next[result.id] = result.markdown;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [documentNodes, markdownByDocumentId, onReadKnowledgeDocument]);

  return {
    markdownByDocumentId,
    setMarkdownByDocumentId,
  };
}
