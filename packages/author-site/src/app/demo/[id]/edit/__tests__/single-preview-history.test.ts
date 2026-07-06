import type { CanvasDocumentNode } from "@workbench/demo-ui/types";

import {
  resolveSinglePreviewResourceHistoryTarget,
  type SinglePreviewTarget,
} from "../single-preview-history";

function makeDocumentNode(): CanvasDocumentNode {
  return {
    id: "node-documents",
    kind: "document",
    title: "资料节点",
    layout: { x: 0, y: 0, width: 320, height: 240 },
    createdAt: 1,
    updatedAt: 1,
    activeDocumentId: "entry-b",
    documents: [
      {
        id: "entry-a",
        title: "需求说明",
        knowledgeDocument: {
          id: "doc-a",
          title: "需求说明",
          description: "A",
          fileName: "a.md",
        },
      },
      {
        id: "entry-b",
        title: "验收清单",
        knowledgeDocument: {
          id: "doc-b",
          title: "验收清单",
          description: "B",
          fileName: "b.md",
        },
      },
    ],
  };
}

describe("单页面资源历史目标", () => {
  it("当前目标为页面时返回页面资源历史目标", () => {
    expect(
      resolveSinglePreviewResourceHistoryTarget({
        target: { kind: "page", pageId: "page-home" },
        demoPages: [{ id: "page-home", name: "首页" }],
      }),
    ).toEqual({
      kind: "page",
      resourceId: "page-home",
      title: "首页",
      pageId: "page-home",
    });
  });

  it("当前目标为文档时返回激活文档的知识文档资源 ID", () => {
    expect(
      resolveSinglePreviewResourceHistoryTarget({
        target: { kind: "document", documentNodeId: "node-documents" },
        demoPages: [],
        activeDocumentNode: makeDocumentNode(),
      }),
    ).toEqual({
      kind: "knowledge_document",
      resourceId: "doc-b",
      title: "验收清单",
      documentId: "doc-b",
    });
  });

  it("没有可解析目标时返回 null", () => {
    const target: SinglePreviewTarget = {
      kind: "document",
      documentNodeId: "missing-node",
    };

    expect(
      resolveSinglePreviewResourceHistoryTarget({
        target,
        demoPages: [],
        activeDocumentNode: makeDocumentNode(),
      }),
    ).toBeNull();
  });
});
