import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ImportFromFigmaDialog } from "./ImportFromFigmaDialog";
import { projectApiClient } from "@/lib/project-api";

const mockToast = jest.fn();

jest.mock("@/components/ui/toast-provider", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@workbench/demo-ui", () => ({
  SandboxedHtmlFrame: ({ title }: { title: string }) => <div>安全预览：{title}</div>,
}));
jest.mock("@/lib/project-api", () => ({
  projectApiClient: {
    prepareHtmlImport: jest.fn(),
    commitHtmlImport: jest.fn(),
    cancelHtmlImport: jest.fn(),
  },
}));

function createHtmlFile(name: string, content = "<!doctype html><html></html>"): File {
  const file = new File([content], name, { type: "text/html" });
  Object.defineProperty(file, "text", { configurable: true, value: jest.fn().mockResolvedValue(content) });
  return file;
}

function prepared(filename: string, index = 1) {
  return {
    draftId: `draft-${index}`,
    filename,
    name: filename.replace(/\.html?$/i, ""),
    confirmationRequired: false,
    recommendation: {
      version: 1 as const,
      mode: "responsive-page" as const,
      viewport: { width: 1440, height: 900 },
      heightBehavior: "content" as const,
      preset: "desktop" as const,
      source: "recommended" as const,
    },
    execution: { executionUrl: `/api/html-sandbox/executions/${index}`, channelId: `channel-${index}`, expiresAt: Date.now() + 60_000 },
    analysis: {
      outcome: { status: "accepted" as const, runtimeType: "sandboxed-html" as const },
      presentation: { confidence: "low" as const },
      detectedViewport: undefined,
      unsupportedCapabilities: [],
      warnings: [],
    },
  };
}

describe("ImportFromFigmaDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (projectApiClient.prepareHtmlImport as jest.Mock).mockImplementation(
      async (_project: string, _session: string, filename: string) => prepared(filename),
    );
    (projectApiClient.commitHtmlImport as jest.Mock).mockImplementation(
      async (_project: string, _session: string, draftId: string, _presentation: unknown, name: string) => ({ page: { id: draftId, name, order: 1 } }),
    );
    (projectApiClient.cancelHtmlImport as jest.Mock).mockResolvedValue(undefined);
  });

  it("文件选择后先 prepare，并只用安全执行 URL 预览", async () => {
    (projectApiClient.prepareHtmlImport as jest.Mock).mockResolvedValueOnce({ ...prepared("dashboard.html"), confirmationRequired: true });
    render(<ImportFromFigmaDialog open onOpenChange={jest.fn()} projectId="proj-1" sessionId="session-1" onPageCreated={jest.fn()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("dashboard.html")] } });

    expect(await screen.findByText("安全预览：dashboard.html")).toBeInTheDocument();
    expect(projectApiClient.prepareHtmlImport).toHaveBeenCalledWith("proj-1", "session-1", "dashboard.html", expect.stringContaining("doctype"), "dashboard");
    expect(screen.getByText("需要确认尺寸")).toBeInTheDocument();
  });

  it("合并分析结果时会将重复的兼容性提示去重", async () => {
    (projectApiClient.prepareHtmlImport as jest.Mock).mockResolvedValueOnce({
      ...prepared("script.html"),
      analysis: {
        ...prepared("script.html").analysis,
        unsupportedCapabilities: [{ code: "external-script" }],
        warnings: [{ code: "external-script" }],
      },
    });
    render(<ImportFromFigmaDialog open onOpenChange={jest.fn()} projectId="proj-1" sessionId="session-1" onPageCreated={jest.fn()} />);

    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("script.html")] } });

    expect(await screen.findByText("兼容性提示 (1)")).toBeInTheDocument();
    expect(screen.getAllByText("external-script")).toHaveLength(1);
  });

  it("显示受限资源的类型和文档位置", async () => {
    (projectApiClient.prepareHtmlImport as jest.Mock).mockResolvedValueOnce({
      ...prepared("resource.html"),
      analysis: {
        ...prepared("resource.html").analysis,
        resourceReferences: [{ classification: "remote", tagName: "img", attributeName: "src", path: "/html[0]/body[0]/img[0]" }],
      },
    });
    render(<ImportFromFigmaDialog open onOpenChange={jest.fn()} projectId="proj-1" sessionId="session-1" onPageCreated={jest.fn()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("resource.html")] } });
    expect(await screen.findByText("受限资源 (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("受限资源 (1)"));
    expect(screen.getByText(/remote · img\[src\]/)).toBeInTheDocument();
  });

  it("部分兼容项必须由用户明确确认后才能提交", async () => {
    (projectApiClient.prepareHtmlImport as jest.Mock).mockResolvedValueOnce({
      ...prepared("limited.html"),
      confirmationRequired: true,
      analysis: {
        ...prepared("limited.html").analysis,
        compatibility: "degraded",
        unsupportedCapabilities: [{ code: "remote-resource" }],
      },
    });
    render(<ImportFromFigmaDialog open onOpenChange={jest.fn()} projectId="proj-1" sessionId="session-1" onPageCreated={jest.fn()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("limited.html")] } });
    await screen.findByText("安全预览：limited.html");
    expect(screen.getByRole("button", { name: /导入并创建页面/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /导入并创建页面/ })).toBeEnabled();
  });

  it("可信 Figma 导出物无需确认勾选即可导入", async () => {
    (projectApiClient.prepareHtmlImport as jest.Mock).mockResolvedValueOnce({
      ...prepared("figma.html"),
      confirmationRequired: false,
      analysis: {
        ...prepared("figma.html").analysis,
        compatibility: "degraded",
        source: { kind: "figma-export", confirmationBypassEligible: true },
        unsupportedCapabilities: [{ code: "remote-resource" }],
      },
    });
    render(<ImportFromFigmaDialog open onOpenChange={jest.fn()} projectId="proj-1" sessionId="session-1" onPageCreated={jest.fn()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("figma.html")] } });
    await screen.findByText("安全预览：figma.html");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /导入并创建页面/ })).toBeEnabled();
  });

  it("批量文件逐项原子 commit，并保留文件名作为默认页面名", async () => {
    (projectApiClient.prepareHtmlImport as jest.Mock)
      .mockImplementationOnce(async () => prepared("a.html", 1))
      .mockImplementationOnce(async () => prepared("b.html", 2));
    const onPageCreated = jest.fn();
    render(<ImportFromFigmaDialog open onOpenChange={jest.fn()} projectId="proj-1" sessionId="session-1" onPageCreated={onPageCreated} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("a.html"), createHtmlFile("b.html")] } });
    await waitFor(() => expect(projectApiClient.prepareHtmlImport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /导入并创建页面/ }));

    await waitFor(() => expect(projectApiClient.commitHtmlImport).toHaveBeenCalledTimes(2));
    expect(projectApiClient.commitHtmlImport).toHaveBeenNthCalledWith(1, "proj-1", "session-1", "draft-1", expect.any(Object), "a", true);
    expect(projectApiClient.commitHtmlImport).toHaveBeenNthCalledWith(2, "proj-1", "session-1", "draft-2", expect.any(Object), "b", true);
    expect(onPageCreated).toHaveBeenCalledTimes(2);
  });

  it("设备预设只改变最终展示视口，不修改送入 prepare 的 HTML", async () => {
    render(<ImportFromFigmaDialog open onOpenChange={jest.fn()} projectId="proj-1" sessionId="session-1" onPageCreated={jest.fn()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("page.html", "<html><body>original</body></html>")] } });
    await screen.findByText("安全预览：page.html");
    fireEvent.click(screen.getByRole("button", { name: /手机/ }));
    fireEvent.click(screen.getByRole("button", { name: /导入并创建页面/ }));
    await waitFor(() => expect(projectApiClient.commitHtmlImport).toHaveBeenCalled());
    expect(projectApiClient.commitHtmlImport).toHaveBeenCalledWith("proj-1", "session-1", "draft-1", expect.objectContaining({ viewport: { width: 390, height: 844 }, preset: "mobile" }), "page", true);
    expect(projectApiClient.prepareHtmlImport).toHaveBeenCalledWith("proj-1", "session-1", "page.html", "<html><body>original</body></html>", "page");
  });

  it("关闭工作台会取消仍未提交的私有 draft", async () => {
    const onOpenChange = jest.fn();
    render(<ImportFromFigmaDialog open onOpenChange={onOpenChange} projectId="proj-1" sessionId="session-1" onPageCreated={jest.fn()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("page.html")] } });
    await screen.findByText("安全预览：page.html");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(projectApiClient.cancelHtmlImport).toHaveBeenCalledWith("proj-1", "session-1", "draft-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("commit 失败时保留文件和原因供重试", async () => {
    (projectApiClient.commitHtmlImport as jest.Mock).mockRejectedValueOnce(new Error("WORKSPACE_INVALID_OPERATION"));
    render(<ImportFromFigmaDialog open onOpenChange={jest.fn()} projectId="proj-1" sessionId="session-1" onPageCreated={jest.fn()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [createHtmlFile("page.html")] } });
    await screen.findByText("安全预览：page.html");
    fireEvent.click(screen.getByRole("button", { name: /导入并创建页面/ }));
    expect(await screen.findByText("WORKSPACE_INVALID_OPERATION")).toBeInTheDocument();
    expect(screen.getByText("page.html")).toBeInTheDocument();
  });
});
