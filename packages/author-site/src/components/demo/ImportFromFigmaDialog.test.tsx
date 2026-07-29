import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ImportFromFigmaDialog } from "./ImportFromFigmaDialog";
import { projectApiClient } from "@/lib/project-api";

const mockToast = jest.fn();

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/lib/project-api", () => ({
  projectApiClient: {
    createDemoPage: jest.fn(),
    updateDemoPageFiles: jest.fn(),
  },
}));

function createHtmlFile(name: string, content: string, size = 1024): File {
  const file = new File([content], name, { type: "text/html" });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn().mockResolvedValue(content),
  });
  return file;
}

describe("ImportFromFigmaDialog", () => {
  beforeEach(() => {
    mockToast.mockClear();
    (projectApiClient.createDemoPage as jest.Mock).mockReset();
    (projectApiClient.updateDemoPageFiles as jest.Mock).mockReset();
  });

  it("通过文件选择器添加多个文件并显示在列表中", async () => {
    const html = "<!DOCTYPE html><html></html>";
    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.multiple).toBe(true);

    const files = [
      createHtmlFile("page-a.html", html),
      createHtmlFile("page-b.html", html),
    ];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => {
      expect(screen.getByText("page-a.html")).toBeInTheDocument();
    });
    expect(screen.getByText("page-b.html")).toBeInTheDocument();
  });

  it("批量导入时为每个文件创建一个页面", async () => {
    const html = "<!DOCTYPE html><html><body>Figma Export</body></html>";
    (projectApiClient.createDemoPage as jest.Mock)
      .mockResolvedValueOnce({ id: "page-a", name: "page-a", order: 1 })
      .mockResolvedValueOnce({ id: "page-b", name: "page-b", order: 2 });
    (projectApiClient.updateDemoPageFiles as jest.Mock).mockResolvedValue({});
    const onPageCreated = jest.fn();

    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={onPageCreated}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          createHtmlFile("page-a.html", html),
          createHtmlFile("page-b.html", html),
        ],
      },
    });

    await screen.findByText("page-a.html");
    fireEvent.click(screen.getByRole("button", { name: /导入并创建页面/ }));

    await waitFor(() => {
      expect(onPageCreated).toHaveBeenCalledTimes(2);
    });
    expect(onPageCreated).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "page-a" }),
    );
    expect(onPageCreated).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "page-b" }),
    );
    expect(projectApiClient.createDemoPage).toHaveBeenCalledTimes(2);
  });

  it("上传 HTML 导入时使用文件名作为页面名称", async () => {
    const html = "<!DOCTYPE html><html><body>Figma Export</body></html>";
    (projectApiClient.createDemoPage as jest.Mock).mockResolvedValue({
      id: "page-1",
      name: "成长豆商城",
      order: 1,
    });
    (projectApiClient.updateDemoPageFiles as jest.Mock).mockResolvedValue({});

    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createHtmlFile("成长豆商城.html", html)] },
    });

    await screen.findByText("成长豆商城.html");
    fireEvent.click(screen.getByRole("button", { name: /导入并创建页面/ }));

    await waitFor(() => {
      expect(projectApiClient.createDemoPage).toHaveBeenCalledWith(
        "proj-1",
        "成长豆商城",
        "session-1",
        undefined,
        "prototype-html-css",
      );
    });
  });

  it("导入 Figma HTML 时持久化设计稿尺寸", async () => {
    const page = { id: "page-1", name: "从Figma导入的页面", order: 1 };
    (projectApiClient.createDemoPage as jest.Mock).mockResolvedValue(page);
    (projectApiClient.updateDemoPageFiles as jest.Mock).mockResolvedValue({});

    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          createHtmlFile(
            "page.html",
            '<!DOCTYPE html><style>.figma-export { width: 375px; height: 812px; }</style><div class="figma-export"></div>',
          ),
        ],
      },
    });

    await screen.findByText("page.html");
    fireEvent.click(screen.getByRole("button", { name: /导入并创建页面/ }));

    await waitFor(() => {
      expect(projectApiClient.updateDemoPageFiles).toHaveBeenCalledWith(
        "proj-1",
        "page-1",
        "session-1",
        expect.objectContaining({
          prototypeMeta: { width: 375, height: 812, generatedBy: "figma-import" },
          schema: '{"type":"object","properties":{}}',
        }),
      );
    });
  });

  it("可以从文件列表中移除已添加的文件", async () => {
    const html = "<!DOCTYPE html><html></html>";
    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          createHtmlFile("a.html", html),
          createHtmlFile("b.html", html),
        ],
      },
    });

    await screen.findByText("a.html");
    expect(screen.getByText("b.html")).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector(".lucide-x") || btn.innerHTML.includes("lucide-x"),
    );
    expect(removeButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText("a.html")).not.toBeInTheDocument();
    });
    expect(screen.getByText("b.html")).toBeInTheDocument();
  });

  it("跳过非 HTML 文件", async () => {
    const txtFile = new File(["text"], "notes.txt", { type: "text/plain" });
    const htmlContent = "<!DOCTYPE html><html></html>";
    const htmlFile = createHtmlFile("valid.html", htmlContent);

    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [txtFile, htmlFile] } });

    await waitFor(() => {
      expect(screen.getByText("valid.html")).toBeInTheDocument();
    });
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "跳过不支持的文件" }),
    );
  });

  it("拖入文件后显示在列表中", async () => {
    const html = "<!DOCTYPE html><html></html>";
    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    const dropZone = document.querySelector('[class*="border-dashed"]')!;
    expect(dropZone).not.toBeNull();
    const file = createHtmlFile("drag-me.html", html);
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("drag-me.html")).toBeInTheDocument();
    });
  });

  it("批量导入时每个文件使用去扩展名后的文件名作为页面名称", async () => {
    const html = "<!DOCTYPE html><html></html>";
    (projectApiClient.createDemoPage as jest.Mock)
      .mockResolvedValueOnce({ id: "p1", name: "a", order: 1 })
      .mockResolvedValueOnce({ id: "p2", name: "b", order: 2 });
    (projectApiClient.updateDemoPageFiles as jest.Mock).mockResolvedValue({});

    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          createHtmlFile("a.html", html),
          createHtmlFile("b.html", html),
        ],
      },
    });

    await screen.findByText("a.html");
    fireEvent.click(screen.getByRole("button", { name: /导入并创建页面/ }));

    await waitFor(() => {
      expect(projectApiClient.createDemoPage).toHaveBeenCalledTimes(2);
    });
    expect(projectApiClient.createDemoPage).toHaveBeenNthCalledWith(
      1,
      "proj-1", "a", "session-1", undefined, "prototype-html-css",
    );
    expect(projectApiClient.createDemoPage).toHaveBeenNthCalledWith(
      2,
      "proj-1", "b", "session-1", undefined, "prototype-html-css",
    );
  });
});
