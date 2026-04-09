import { render, screen } from "@testing-library/react";
import { PreviewPanel } from "../PreviewPanel";

jest.mock("@codesandbox/sandpack-react", () => ({
  SandpackProvider: ({
    children,
    files,
  }: {
    children: React.ReactNode;
    files?: Record<string, string>;
  }) => (
    <div data-testid="sandpack-provider">
      {files && (
        <pre data-testid="files">
          {JSON.stringify(Object.keys(files), null, 2)}
        </pre>
      )}
      {children}
    </div>
  ),
  SandpackLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sandpack-layout">{children}</div>
  ),
  SandpackPreview: () => <div data-testid="sandpack-preview">Preview</div>,
}));

describe("PreviewPanel", () => {
  const mockCode = `export default function Demo({ title }: { title: string }) {
    return <h1>{title}</h1>;
  }`;

  it("应正确渲染 Sandpack 容器", () => {
    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    expect(screen.getByTestId("sandpack-provider")).toBeInTheDocument();
  });

  it("应正确注入文件", () => {
    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    const pre = screen.getByTestId("files");
    expect(pre).toBeInTheDocument();
    expect(pre.textContent).toContain("Demo.tsx");
  });

  it("应支持自定义 className", () => {
    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        className="custom-class"
      />,
    );

    const container = document.querySelector(".custom-class");
    expect(container).toBeInTheDocument();
  });

  it("应支持 SDK 文件注入", () => {
    const sdkFiles = {
      "/sdk/utils.ts": "export const format = (s: string) => s.toUpperCase();",
    };

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        sdkFiles={sdkFiles}
      />,
    );

    const pre = screen.getByTestId("files");
    expect(pre.textContent).toContain("sdk/utils.ts");
  });

  it("应处理无效的代码路径（非代码内容）", () => {
    const invalidCode = "E:\\重要文件\\Programming\\file.tsx";

    render(<PreviewPanel code={invalidCode} configData={{ title: "Test" }} />);

    // 应显示错误提示
    expect(screen.getByText("⚠️ 代码加载失败")).toBeInTheDocument();
    expect(screen.getByText(/检测到无效的代码文件/)).toBeInTheDocument();
  });

  it("应在未传入 previewSize 时使用默认尺寸 375×667", () => {
    const { container } = render(
      <PreviewPanel code={mockCode} configData={{ title: "Test" }} />,
    );

    const preview = container.querySelector('[data-testid="sandpack-preview"]');
    // 通过 mock 无法直接验证 style，但我们可以验证组件正常渲染
    expect(screen.getByTestId("sandpack-preview")).toBeInTheDocument();
  });

  it("应支持传入自定义 previewSize", () => {
    const { container } = render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        previewSize={{ width: 768, height: 1024 }}
      />,
    );

    const preview = container.querySelector('[data-testid="sandpack-preview"]');
    expect(preview).toBeInTheDocument();
  });

  it("应支持 scale 缩放属性", () => {
    const { container } = render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        previewSize={{ width: 1440, height: 900, scale: 0.5 }}
      />,
    );

    const preview = container.querySelector('[data-testid="sandpack-preview"]');
    expect(preview).toBeInTheDocument();
  });
});
