import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ImportFromFigmaDialog } from "./ImportFromFigmaDialog";

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
});
