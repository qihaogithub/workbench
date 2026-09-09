import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DocumentView } from "./DocumentView";
import type { AuthorDocumentReference } from "./markdown-reference-navigation";

jest.mock("@/components/ui/toast-provider", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@workbench/demo-ui/DocumentEditor", () => ({
  DocumentEditor: ({ value }: { value: string }) => <div data-testid="body">{value}</div>,
}));
jest.mock("./DesignSpecEditor", () => ({
  DesignSpecEditor: ({ docId }: { docId: string }) => <div data-testid="spec">{docId}</div>,
}));
jest.mock("./MarkdownReferenceLinksPanel", () => ({ MarkdownReferenceLinksPanel: () => null }));

const references: Array<[AuthorDocumentReference, string]> = [
  [{ kind: "document", projectId: "p", docId: "kb" }, "knowledge body"],
  [{ kind: "document", projectId: "p", documentKind: "memory", docId: "memory" }, "memory.md"],
  [{ kind: "document", projectId: "p", documentKind: "project-convention", docId: "convention" }, "convention.md"],
  [{ kind: "document", projectId: "p", documentKind: "page-convention", docId: "page" }, "demos/page/convention.md"],
  [{ kind: "document", projectId: "p", documentKind: "design-spec", docId: "spec" }, "spec"],
];

describe("文档深链就绪及单次消费", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input) => {
      const url = String(input);
      let data: unknown = [];
      if (url.startsWith("/api/knowledge?")) data = [{ id: "kb", title: "Knowledge", source: "user", fileName: "kb.md" }];
      if (url.startsWith("/api/knowledge/content")) data = { content: "knowledge body" };
      if (url.startsWith("/api/design-specs?")) data = [{ id: "spec", title: "Spec" }];
      if (url.includes("/workspace/files?")) data = { paths: ["convention.md", "demos/page/convention.md"] };
      if (url.includes("/workspace/files/")) data = { content: decodeURIComponent(url.split("/workspace/files/")[1]) };
      return { ok: true, json: async () => ({ success: true, data }) } as Response;
    });
  });
  it.each(references)("等待列表加载后打开正确分类 %#", async (referenceFocus, expected) => {
    const consumed = jest.fn();
    const props = { workingDir: "/workspace", projectId: "p", sessionId: "s", pages: [{ id: "page", name: "Page" }], referenceFocus, onReferenceFocusConsumed: consumed };
    const view = render(<DocumentView {...props} />);
    await waitFor(() => expect(screen.getByTestId(referenceFocus.documentKind === "design-spec" ? "spec" : "body")).toHaveTextContent(expected));
    expect(consumed).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("AI 记忆"));
    await waitFor(() => expect(screen.getByTestId("body")).toHaveTextContent("memory.md"));
    view.rerender(<DocumentView {...props} pages={[{ id: "page", name: "Renamed" }]} />);
    expect(consumed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("body")).toHaveTextContent("memory.md");
  });
});
