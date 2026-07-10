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

describe("ImportFromFigmaDialog", () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it("支持读取剪贴板内容到导入框", async () => {
    const readText = jest.fn().mockResolvedValue("<!DOCTYPE html><html></html>");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText },
    });

    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /读取剪贴板/ }));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("<!DOCTYPE html><html></html>");
    });
  });

  it("支持上传 HTML 文件到导入框", async () => {
    const html = "<!DOCTYPE html><html><body>Figma Export</body></html>";
    const file = new File([html], "figma-export.html", { type: "text/html" });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: jest.fn().mockResolvedValue(html),
    });

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
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue(html);
    });
  });

  it("上传 HTML 导入时使用文件名作为页面名称", async () => {
    const html = "<!DOCTYPE html><html><body>Figma Export</body></html>";
    const file = new File([html], "成长豆商城.html", { type: "text/html" });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: jest.fn().mockResolvedValue(html),
    });
    (projectApiClient.createDemoPage as jest.Mock).mockResolvedValue({
      id: "page-1",
      name: "成长豆商城",
      order: 1,
    });
    (projectApiClient.updateDemoPageFiles as jest.Mock).mockResolvedValue(undefined);

    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });
    await screen.findByDisplayValue(html);
    fireEvent.click(screen.getByRole("button", { name: "导入并创建页面" }));

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
    (projectApiClient.updateDemoPageFiles as jest.Mock).mockResolvedValue(undefined);

    render(
      <ImportFromFigmaDialog
        open
        onOpenChange={jest.fn()}
        projectId="proj-1"
        sessionId="session-1"
        onPageCreated={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: {
        value: '<!DOCTYPE html><style>.figma-export { width: 375px; height: 812px; }</style><div class="figma-export"></div>',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "导入并创建页面" }));

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
});
