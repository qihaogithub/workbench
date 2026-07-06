import { getActiveCanvasDocumentEntry } from "@workbench/demo-ui/canvas-kernel";
import type { CanvasDocumentNode } from "@workbench/demo-ui/types";
import type { DemoPageMeta, ProjectResourceKind } from "@workbench/shared";

export type SinglePreviewTarget =
  | { kind: "page"; pageId: string }
  | { kind: "document"; documentNodeId: string };

type SinglePreviewHistoryKind = Extract<ProjectResourceKind, "page" | "knowledge_document">;

export interface SinglePreviewResourceHistoryTarget {
  kind: SinglePreviewHistoryKind;
  resourceId: string;
  title: string;
  pageId?: string;
  documentId?: string;
}

export function resolveSinglePreviewResourceHistoryTarget(input: {
  target: SinglePreviewTarget | null;
  demoPages: Array<Pick<DemoPageMeta, "id" | "name">>;
  activeDocumentNode?: CanvasDocumentNode;
}): SinglePreviewResourceHistoryTarget | null {
  const { target, demoPages, activeDocumentNode } = input;

  if (!target) return null;

  if (target.kind === "page") {
    const page = demoPages.find((item) => item.id === target.pageId);
    return {
      kind: "page",
      resourceId: target.pageId,
      title: page?.name ?? target.pageId,
      pageId: target.pageId,
    };
  }

  if (!activeDocumentNode || activeDocumentNode.id !== target.documentNodeId) {
    return null;
  }

  const activeEntry = getActiveCanvasDocumentEntry(activeDocumentNode);
  const documentId = activeEntry?.knowledgeDocument.id;
  if (!activeEntry || !documentId) return null;

  return {
    kind: "knowledge_document",
    resourceId: documentId,
    title: activeEntry.title || activeEntry.knowledgeDocument.title || documentId,
    documentId,
  };
}
