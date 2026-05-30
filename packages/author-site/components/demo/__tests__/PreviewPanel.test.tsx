import { render, screen, waitFor } from "@testing-library/react";
import { PreviewPanel } from "@opencode-workbench/shared/demo";

global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("PreviewPanel", () => {
  const mockCode = `export default function Demo({ title }: { title: string }) {
    return <h1>{title}</h1>;
  }`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("应渲染 iframe", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    expect(screen.getByTitle("预览")).toBeInTheDocument();
  });

  it("应显示加载状态（编译中）", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    expect(screen.getByRole("status", { name: "编译中" })).toBeInTheDocument();
  });

  it("应处理编译错误", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: { message: "语法错误: 第3行" } }),
    } as Response);

    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    await waitFor(() => {
      expect(screen.getByText("编译错误")).toBeInTheDocument();
      expect(screen.getByText("语法错误: 第3行")).toBeInTheDocument();
    });
  });

  it("应处理无效代码路径", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const invalidCode = "E:\\重要文件\\Programming\\file.tsx";

    render(<PreviewPanel code={invalidCode} configData={{ title: "Test" }} />);

    expect(screen.getByText("⚠️ 代码加载失败")).toBeInTheDocument();
    expect(screen.getByText(/检测到无效的代码文件/)).toBeInTheDocument();
  });

  it("应渲染 iframe 并正确加载", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { compiledCode: "", dependencies: [], cssImports: [] },
      }),
    } as Response);

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTitle("预览")).toBeInTheDocument();
    });
  });

  it("应支持 scale 缩放属性", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { compiledCode: "", dependencies: [], cssImports: [] },
      }),
    } as Response);

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        previewSize={{ width: 1440, height: 900, scale: 0.5 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTitle("预览")).toBeInTheDocument();
    });
  });

  it("配置变更不应触发重新编译，应发送 UPDATE_CONFIG", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    } as Response);

    const { rerender } = render(
      <PreviewPanel code={mockCode} configData={{ title: "First" }} />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // 仅变更 configData，code 不变
    rerender(<PreviewPanel code={mockCode} configData={{ title: "Second" }} />);

    // fetch 不应被再次调用
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("应支持 sessionId 模式", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    } as Response);

    render(<PreviewPanel sessionId="test-session" configData={{}} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/compile", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("test-session"),
      }));
    });
  });
});
