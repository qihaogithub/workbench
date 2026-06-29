import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreviewPanel } from "@opencode-workbench/demo-ui";

global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: async () => body,
  } as Response;
}

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

    expect(screen.getByRole("status", { name: "预览加载中" })).toBeInTheDocument();
  });

  it("应处理编译错误", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: false, error: { message: "语法错误: 第3行" } }),
    );

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
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "", dependencies: [], cssImports: [] },
      }),
    );

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
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "", dependencies: [], cssImports: [] },
      }),
    );

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
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

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

  it("有截图占位时应直接渲染截图并隐藏 loading", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        placeholderScreenshotUrl="http://localhost/screenshot.png"
      />,
    );

    const image = await screen.findByAltText("preview placeholder");
    expect(image).toHaveAttribute("src", "http://localhost/screenshot.png");

    await waitFor(() => {
      expect(
        screen.queryByRole("status", { name: "预览加载中" }),
      ).not.toBeInTheDocument();
    });
  });

  it("传入空 code 时应暂停编译，避免切页时用旧代码编译", () => {
    render(
      <PreviewPanel
        code=""
        sessionId="test-session"
        demoId="target-page"
        configData={{ title: "Test" }}
        placeholderScreenshotUrl="http://localhost/screenshot.png"
      />,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByAltText("preview placeholder")).toBeInTheDocument();
  });

  it("收到 LOADED 后应从截图占位切换到真实 iframe", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        placeholderScreenshotUrl="http://localhost/screenshot.png"
      />,
    );

    const image = await screen.findByAltText("preview placeholder");
    fireEvent.load(image);

    const iframe = screen.getByTitle("预览") as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "LOADED" },
          source: iframe.contentWindow,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByAltText("preview placeholder"),
      ).not.toBeInTheDocument();
    });
  });

  it("应通过控制台回调记录预览加载阶段耗时", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    const handleConsoleEntry = jest.fn();
    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        onConsoleEntry={handleConsoleEntry}
      />,
    );

    await waitFor(() => {
      expect(handleConsoleEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "info",
          args: expect.stringContaining('"stage":"compile_done"'),
        }),
      );
    });

    const iframe = screen.getByTitle("预览") as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "READY" },
          source: iframe.contentWindow,
        }),
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "LOADED" },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(handleConsoleEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        args: expect.stringContaining('"stage":"iframe_ready"'),
      }),
    );
    expect(handleConsoleEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        args: expect.stringContaining('"stage":"iframe_loaded"'),
      }),
    );
  });

  it("应向 iframe 同步右侧属性面板的临时状态", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        visualEditMode
        visualHoverNodeId="main>h1:nth-of-type(1)"
        selectedVisualNodeId="main>h1:nth-of-type(1)"
        visualPropertyChanges={[
          {
            id: "change-1",
            nodeId: "main>h1:nth-of-type(1)",
            domPath: "main>h1:nth-of-type(1)",
            kind: "style",
            property: "color",
            label: "颜色",
            value: "#ff0000",
            previousValue: "rgb(0, 0, 0)",
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const iframe = screen.getByTitle("预览") as HTMLIFrameElement;
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "READY" },
          source: iframe.contentWindow,
        }),
      );
    });

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "UPDATE_VISUAL_EDIT_STATE",
          enabled: true,
          hoverNodeId: "main>h1:nth-of-type(1)",
          selectedNodeId: "main>h1:nth-of-type(1)",
          propertyChanges: expect.arrayContaining([
            expect.objectContaining({
              property: "color",
              value: "#ff0000",
            }),
          ]),
        }),
        "*",
      );
    });
  });

  it("应在 iframe 请求打开图层菜单时通知父级", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    const handleVisualLayerMenu = jest.fn();
    const node = {
      nodeId: "main>button:nth-of-type(1)",
      domPath: "main>button:nth-of-type(1)",
      tagName: "button",
      textContent: "去看看",
      rect: { x: 10, y: 20, width: 120, height: 40 },
      editCapabilities: ["annotate", "text", "style"],
    };

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        visualEditMode
        onVisualLayerMenu={handleVisualLayerMenu}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const iframe = screen.getByTitle("预览") as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "VISUAL_SELECT",
            node,
            nodeStack: [node],
            openLayerPicker: true,
          },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(handleVisualLayerMenu).toHaveBeenCalledWith([node]);
  });

  it("应在 iframe 上报空白点击时清空选中和图层栈", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    const handleVisualSelect = jest.fn();
    const handleVisualSelectStack = jest.fn();

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        visualEditMode
        onVisualSelect={handleVisualSelect}
        onVisualSelectStack={handleVisualSelectStack}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const iframe = screen.getByTitle("预览") as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "VISUAL_SELECT",
            node: null,
            nodeStack: [],
          },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(handleVisualSelect).toHaveBeenCalledWith(null);
    expect(handleVisualSelectStack).toHaveBeenCalledWith([]);
  });

  it("应支持 sessionId 模式", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    render(<PreviewPanel sessionId="test-session" configData={{}} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/compile", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("test-session"),
      }));
    });
  });
});
