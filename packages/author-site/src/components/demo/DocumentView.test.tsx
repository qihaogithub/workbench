import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentView } from "./DocumentView";

const toast = jest.fn();

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast }),
}));

jest.mock("@workbench/demo-ui/DocumentEditor", () => ({
  DocumentEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (value: string) => void;
  }) => (
    <div data-testid="document-editor">
      <span data-testid="document-editor-value">{value}</span>
      {onChange && (
        <button
          type="button"
          data-testid="document-editor-edit"
          onClick={() => onChange(`${value}!`)}
        />
      )}
    </div>
  ),
}));

jest.mock("./DesignSpecEditor", () => ({
  DesignSpecEditor: () => <div>design spec</div>,
}));

function jsonResponse(data: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => data });
}

describe("DocumentView knowledge creation", () => {
  beforeEach(() => {
    jest.useRealTimers();
    toast.mockClear();
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/knowledge?") && init?.method === "POST") {
        return jsonResponse({
          success: true,
          data: {
            id: "kb-new",
            title: "未命名文档",
            source: "user",
            description: "未命名文档",
            fileName: "未命名文档.md",
            addedAt: "2026-08-11T00:00:00.000Z",
            updatedAt: "2026-08-11T00:00:00.000Z",
            sizeBytes: 0,
          },
        });
      }
      if (url.includes("/api/knowledge/kb-new") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          success: true,
          data: {
            id: "kb-new",
            title: body.title,
            source: "user",
            description: "未命名文档",
            fileName: "未命名文档.md",
            addedAt: "2026-08-11T00:00:00.000Z",
            updatedAt: "2026-08-11T00:00:00.000Z",
            sizeBytes: 0,
          },
        });
      }
      if (url.startsWith("/api/knowledge/content")) {
        return jsonResponse({ success: true, data: { content: "" } });
      }
      if (url.startsWith("/api/knowledge?")) {
        return jsonResponse({ success: true, data: [] });
      }
      if (url.includes("/attachments")) {
        return jsonResponse({ success: true, data: [] });
      }
      if (url.startsWith("/api/design-specs")) {
        return jsonResponse({ success: true, data: [] });
      }
      return jsonResponse({ success: false }, false);
    }) as jest.Mock;
  });

  it("自动保存完成后不会用列表刷新覆盖当前编辑内容", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/knowledge?") && !init?.method) {
        return jsonResponse({
          success: true,
          data: [{
            id: "kb-existing",
            title: "项目说明",
            source: "user",
            description: "项目说明",
            fileName: "项目说明.md",
            addedAt: "2026-08-12T00:00:00.000Z",
            updatedAt: "2026-08-12T00:00:00.000Z",
            sizeBytes: 0,
          }],
        });
      }
      if (url.startsWith("/api/knowledge/content")) {
        return jsonResponse({ success: true, data: { content: "# 原文" } });
      }
      if (url.includes("/api/knowledge/kb-existing") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          success: true,
          data: {
            id: "kb-existing",
            title: "项目说明",
            source: "user",
            description: "项目说明",
            fileName: "项目说明.md",
            addedAt: "2026-08-12T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            sizeBytes: body.content.length,
          },
        });
      }
      if (url.includes("workspace/files?include=conventions") || url.startsWith("/api/design-specs")) {
        return jsonResponse({ success: true, data: [] });
      }
      return jsonResponse({ success: false }, false);
    }) as jest.Mock;

    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("document-editor-value")).toHaveTextContent("# 原文");
    });
    fireEvent.click(screen.getByTestId("document-editor-edit"));
    expect(screen.getByTestId("document-editor-value")).toHaveTextContent("# 原文!");

    act(() => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/knowledge/kb-existing?"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ content: "# 原文!" }),
        }),
      );
    });
    expect(screen.getByTestId("document-editor-value")).toHaveTextContent("# 原文!");
  });

  it("does not show or load chat attachments in the document view", async () => {
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );

    await screen.findByText("项目知识库");

    expect(screen.queryByText("对话文件")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/attachments"),
    );
  });

  it("project mode maps documentId to the UI id without sending workspace paths", async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/project-1/documents?sessionId=session-1") {
        return jsonResponse({
          success: true,
          data: [{
            projectId: "project-1",
            documentId: "doc-1",
            title: "项目规范",
            description: "项目规范",
            source: "user",
            updatedAt: "2026-09-01T00:00:00.000Z",
            contentHash: "hash",
            sizeBytes: 12,
          }],
        });
      }
      if (url === "/api/projects/project-1/documents/doc-1?sessionId=session-1") {
        return jsonResponse({
          success: true,
          data: {
            projectId: "project-1",
            documentId: "doc-1",
            title: "项目规范",
            description: "项目规范",
            source: "user",
            updatedAt: "2026-09-01T00:00:00.000Z",
            contentHash: "hash",
            sizeBytes: 12,
            content: "# 项目规范",
          },
        });
      }
      if (url.startsWith("/api/design-specs") || url.includes("workspace/files?include=conventions")) {
        return jsonResponse({ success: true, data: [] });
      }
      return jsonResponse({ success: false }, false);
    }) as jest.Mock;

    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
        documentApiMode="project"
      />,
    );

    expect(await screen.findByText("项目规范")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("document-editor")).toHaveTextContent("# 项目规范");
    });
    const calls = (global.fetch as jest.Mock).mock.calls.map(([input]) => String(input));
    expect(calls).toContain("/api/projects/project-1/documents?sessionId=session-1");
    expect(calls).toContain("/api/projects/project-1/documents/doc-1?sessionId=session-1");
    expect(calls.some((url) => url.startsWith("/api/knowledge"))).toBe(false);
  });

  it("creates an unnamed document, opens it, and commits an inline rename", async () => {
    const user = userEvent.setup();
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );

    await user.click(await screen.findByTitle("新建或上传文档"));
    await user.click(screen.getByText("新建"));

    const input = await screen.findByDisplayValue("未命名文档");
    expect(screen.getByTestId("document-editor")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "项目说明{Enter}");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/knowledge/kb-new?"),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ title: "项目说明" }),
        }),
      );
    });
    expect(await screen.findByText("项目说明")).toBeInTheDocument();
  });

  it("shows knowledge history and deletion in the more menu without view or edit shortcuts", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/knowledge?")) {
          return jsonResponse({
            success: true,
            data: [{
              id: "kb-existing",
              title: "项目说明",
              source: "user",
              description: "项目说明",
              fileName: "项目说明.md",
              addedAt: "2026-08-12T00:00:00.000Z",
              updatedAt: "2026-08-12T00:00:00.000Z",
              sizeBytes: 0,
            }],
          });
        }
        if (url.includes("/attachments") || url.startsWith("/api/design-specs")) {
          return jsonResponse({ success: true, data: [] });
        }
        return jsonResponse({ success: false }, false);
      },
    );
    const onDocHistory = jest.fn();
    const user = userEvent.setup();
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
        onDocHistory={onDocHistory}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "打开项目说明的更多操作" }));

    expect(screen.getByRole("menuitem", { name: "历史" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "查看" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "编辑" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "历史" }));
    expect(onDocHistory).toHaveBeenCalledWith(expect.objectContaining({ id: "kb-existing" }));
  });

  it("rejects unsupported uploads without changing the current document", async () => {
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );

    const input = await screen.findByTestId("knowledge-upload-input");
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "guide.pdf", { type: "application/pdf" })] },
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "仅支持 Markdown / TXT 文件",
        variant: "destructive",
      }),
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/knowledge?"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("cancels an inline rename with Escape and commits it on blur", async () => {
    const user = userEvent.setup();
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );
    await user.click(await screen.findByTitle("新建或上传文档"));
    await user.click(screen.getByText("新建"));
    const input = await screen.findByDisplayValue("未命名文档");
    await user.clear(input);
    await user.type(input, "不要保存{Escape}");
    expect(screen.queryByDisplayValue("不要保存")).not.toBeInTheDocument();
    expect(screen.getByText("未命名文档")).toBeInTheDocument();

    await user.click(screen.getByTitle("新建或上传文档"));
    await user.click(screen.getByText("新建"));
    const secondInput = await screen.findByDisplayValue("未命名文档");
    await user.clear(secondInput);
    await user.type(secondInput, "失焦保存");
    fireEvent.blur(secondInput);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/knowledge/kb-new?"),
        expect.objectContaining({ body: JSON.stringify({ title: "失焦保存" }) }),
      );
    });
  });

  it("uploads an accepted text file and opens the created document", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/knowledge?") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          return jsonResponse({
            success: true,
            data: {
              id: "kb-upload",
              title: body.title,
              source: "user",
              description: body.description,
              fileName: "notes.md",
              addedAt: "2026-08-11T00:00:00.000Z",
              updatedAt: "2026-08-11T00:00:00.000Z",
              sizeBytes: body.content.length,
            },
          });
        }
        if (url.startsWith("/api/knowledge/content")) {
          return jsonResponse({ success: true, data: { content: "# Notes" } });
        }
        if (url.startsWith("/api/knowledge?")) return jsonResponse({ success: true, data: [] });
        if (url.includes("/attachments") || url.startsWith("/api/design-specs")) {
          return jsonResponse({ success: true, data: [] });
        }
        return jsonResponse({ success: false }, false);
      },
    );
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );
    const file = new File(["# Notes"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(file, "text", {
      value: jest.fn().mockResolvedValue("# Notes"),
    });

    fireEvent.change(await screen.findByTestId("knowledge-upload-input"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("notes")).toBeInTheDocument();
    expect(await screen.findByTestId("document-editor")).toHaveTextContent("# Notes");
  });

  it("shows an error when reading an accepted upload fails", async () => {
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );
    const file = new File(["notes"], "notes.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", {
      value: jest.fn().mockRejectedValue(new Error("read failed")),
    });

    fireEvent.change(await screen.findByTestId("knowledge-upload-input"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "读取文件失败",
          description: "read failed",
          variant: "destructive",
        }),
      );
    });
    expect(screen.queryByTestId("document-editor")).not.toBeInTheDocument();
  });

  it("preserves the current selection when document creation fails", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/knowledge?") && init?.method === "POST") {
          return jsonResponse(
            { success: false, error: { message: "authority unavailable" } },
            false,
          );
        }
        if (url.startsWith("/api/knowledge?")) {
          return jsonResponse({ success: true, data: [] });
        }
        if (url.includes("/attachments") || url.startsWith("/api/design-specs")) {
          return jsonResponse({ success: true, data: [] });
        }
        return jsonResponse({ success: false }, false);
      },
    );
    const user = userEvent.setup();
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );

    await user.click(await screen.findByTitle("新建或上传文档"));
    await user.click(screen.getByText("新建"));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "创建知识文档失败",
          description: "authority unavailable",
          variant: "destructive",
        }),
      );
    });
    expect(screen.queryByDisplayValue("未命名文档")).not.toBeInTheDocument();
    expect(screen.queryByTestId("document-editor")).not.toBeInTheDocument();
  });

  it("only lists existing conventions and creates a project convention from the add menu", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/workspace/files/") && init?.method === "PUT") {
          return jsonResponse({ success: true, data: { path: "convention.md" } });
        }
        if (url.includes("/workspace/files/")) {
          return jsonResponse({ success: false }, false);
        }
        if (url.startsWith("/api/knowledge?")) return jsonResponse({ success: true, data: [] });
        if (url.includes("/attachments") || url.startsWith("/api/design-specs")) {
          return jsonResponse({ success: true, data: [] });
        }
        return jsonResponse({ success: false }, false);
      },
    );
    const user = userEvent.setup();
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
        userRole="admin"
        pages={[{ id: "page-1", name: "未创建页面公约" }]}
      />,
    );

    expect(await screen.findByText("暂无公约，可通过右上角 + 新建")).toBeInTheDocument();
    expect(screen.queryByText("未创建页面公约")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/sessions/session-1/workspace/files?include=conventions",
    );

    await user.click(screen.getByTitle("新建/添加公约"));
    await user.click(screen.getByText("项目公约", { selector: "div" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/workspace/files/convention.md"),
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("# 项目公约"),
        }),
      );
    });

  });

  it("reuses a document already opened in this view instead of reading it again", async () => {
    (global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/knowledge/content")) {
        return jsonResponse({
          success: true,
          data: { content: url.includes("first.md") ? "第一篇正文" : "第二篇正文" },
        });
      }
      if (url.startsWith("/api/knowledge?")) {
        return jsonResponse({
          success: true,
          data: [
            {
              id: "first",
              title: "第一篇",
              source: "user",
              description: "",
              fileName: "first.md",
              addedAt: "2026-08-12T00:00:00.000Z",
              updatedAt: "2026-08-12T00:00:00.000Z",
              sizeBytes: 10,
            },
            {
              id: "second",
              title: "第二篇",
              source: "user",
              description: "",
              fileName: "second.md",
              addedAt: "2026-08-12T00:00:00.000Z",
              updatedAt: "2026-08-12T00:00:00.000Z",
              sizeBytes: 10,
            },
          ],
        });
      }
      if (url.includes("/attachments") || url.startsWith("/api/design-specs")) {
        return jsonResponse({ success: true, data: [] });
      }
      return jsonResponse({ success: false }, false);
    });
    const user = userEvent.setup();
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        sessionId="session-1"
      />,
    );

    expect(await screen.findByText("第一篇正文")).toBeInTheDocument();
    await user.click(screen.getByText("第二篇"));
    expect(await screen.findByText("第二篇正文")).toBeInTheDocument();
    await user.click(screen.getByText("第一篇"));
    expect(await screen.findByText("第一篇正文")).toBeInTheDocument();

    const contentRequests = (global.fetch as jest.Mock).mock.calls.filter(([input]) =>
      String(input).startsWith("/api/knowledge/content"),
    );
    expect(contentRequests).toHaveLength(2);
  });

  it("reloads the active document after its workspace changes", async () => {
    (global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/knowledge/content")) {
        return jsonResponse({
          success: true,
          data: { content: url.includes("workspace-two") ? "新工作空间正文" : "原工作空间正文" },
        });
      }
      if (url.startsWith("/api/knowledge?")) {
        return jsonResponse({
          success: true,
          data: [{
            id: "shared-id",
            title: "共享名称",
            source: "user",
            description: "",
            fileName: "shared.md",
            addedAt: "2026-08-12T00:00:00.000Z",
            updatedAt: "2026-08-12T00:00:00.000Z",
            sizeBytes: 10,
          }],
        });
      }
      if (url.includes("/attachments") || url.startsWith("/api/design-specs")) {
        return jsonResponse({ success: true, data: [] });
      }
      return jsonResponse({ success: false }, false);
    });
    const { rerender } = render(
      <DocumentView workingDir="/workspace-one" projectId="project-1" sessionId="session-1" />,
    );

    expect(await screen.findByText("原工作空间正文")).toBeInTheDocument();
    rerender(
      <DocumentView workingDir="/workspace-two" projectId="project-2" sessionId="session-2" />,
    );
    expect(await screen.findByText("新工作空间正文")).toBeInTheDocument();

    const contentRequests = (global.fetch as jest.Mock).mock.calls.filter(([input]) =>
      String(input).startsWith("/api/knowledge/content"),
    );
    expect(contentRequests).toHaveLength(2);
  });

  it("keeps the links tray collapsed and switches its relation tabs when opened", async () => {
    (global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/knowledge/content")) {
        return jsonResponse({ success: true, data: { content: "正文" } });
      }
      if (url.startsWith("/api/knowledge?")) {
        return jsonResponse({
          success: true,
          data: [{
            id: "doc-1",
            title: "项目说明",
            source: "user",
            description: "",
            fileName: "project.md",
            addedAt: "2026-08-12T00:00:00.000Z",
            updatedAt: "2026-08-12T00:00:00.000Z",
            sizeBytes: 10,
          }],
        });
      }
      if (url.includes("/markdown-references/outgoing")) {
        return jsonResponse({ success: true, data: { records: [] } });
      }
      if (url.includes("/markdown-references/mentions")) {
        return jsonResponse({ success: true, data: { mentions: [] } });
      }
      if (url.includes("/markdown-references/backlinks")) {
        return jsonResponse({ success: true, data: { records: [] } });
      }
      if (url.includes("/attachments") || url.startsWith("/api/design-specs")) {
        return jsonResponse({ success: true, data: [] });
      }
      return jsonResponse({ success: false }, false);
    });
    const user = userEvent.setup();
    render(
      <DocumentView
        workingDir="/workspace"
        projectId="project-1"
        workspaceId="workspace-1"
        sessionId="session-1"
      />,
    );

    await screen.findByText("正文");
    const toggle = await screen.findByTestId("markdown-reference-tray-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tab", { name: /此文档链接到/ })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("tab", { name: /此文档链接到/ })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: /链接到此文档/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /提及但未链接/ })).toBeInTheDocument();
  });
});
