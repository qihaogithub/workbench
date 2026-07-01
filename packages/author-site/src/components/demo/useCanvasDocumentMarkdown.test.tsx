import { renderHook, waitFor } from "@testing-library/react";
import {
  useCanvasDocumentMarkdown,
  type CanvasDocumentNode,
  type CanvasKnowledgeDocument,
} from "@opencode-workbench/demo-ui";

const document: CanvasKnowledgeDocument = {
  id: "doc-1",
  title: "说明文档",
  fileName: "docs/readme.md",
};

const documentNode: CanvasDocumentNode = {
  id: "node-1",
  kind: "document",
  title: "说明文档",
  knowledgeDocument: document,
  layout: { x: 0, y: 0, width: 320, height: 240 },
  createdAt: 0,
  updatedAt: 0,
};

describe("useCanvasDocumentMarkdown", () => {
  it("空文档列表不触发正文读取", async () => {
    const onReadKnowledgeDocument = jest.fn<Promise<string>, [CanvasKnowledgeDocument]>();

    renderHook(() =>
      useCanvasDocumentMarkdown({
        documentNodes: [],
        onReadKnowledgeDocument,
      }),
    );

    await waitFor(() => {
      expect(onReadKnowledgeDocument).not.toHaveBeenCalled();
    });
  });

  it("传入文档节点后按需读取并缓存 Markdown", async () => {
    const onReadKnowledgeDocument = jest
      .fn<Promise<string>, [CanvasKnowledgeDocument]>()
      .mockResolvedValue("# 文档内容");

    const { result } = renderHook(() =>
      useCanvasDocumentMarkdown({
        documentNodes: [documentNode],
        onReadKnowledgeDocument,
      }),
    );

    await waitFor(() => {
      expect(result.current.markdownByDocumentId["doc-1"]).toBe("# 文档内容");
    });
    expect(onReadKnowledgeDocument).toHaveBeenCalledTimes(1);
    expect(onReadKnowledgeDocument).toHaveBeenCalledWith(document);
  });
});
