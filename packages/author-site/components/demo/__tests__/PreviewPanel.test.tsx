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
  let getBoundingClientRectSpy: jest.SpyInstance<DOMRect, []> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    getBoundingClientRectSpy?.mockRestore();
    getBoundingClientRectSpy = undefined;
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

  it("空代码等待加载时不应显示预览加载中", async () => {
    render(<PreviewPanel code="" configData={{ title: "Test" }} />);

    expect(await screen.findByText("等待页面代码加载")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "预览加载中" })).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("应处理编译错误", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: false, error: { message: "语法错误: 第3行" } }),
    );

    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    await waitFor(() => {
      expect(screen.getByText("正在修复预览")).toBeInTheDocument();
      expect(screen.queryByText("语法错误: 第3行")).not.toBeInTheDocument();
    });
  });

  it("编译错误诊断应保留页面和源码定位信息", async () => {
    const onError = jest.fn();
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: false,
        error: {
          message: "页面运行时契约校验失败",
          details: {
            pageId: "page_1",
            codeHash: "abc123",
            issues: [
              {
                stage: "module_parse",
                code: "GENERATED_MODULE_BINDING_CONFLICT",
                message: "预览编译生成模块的顶层绑定 jsx 发生冲突",
                instruction: "请由系统侧调整编译隔离或生成绑定命名。",
              },
            ],
          },
        },
      }),
    );

    render(
      <PreviewPanel
        code={mockCode}
        demoId="page_1"
        configData={{ title: "Test" }}
        onError={onError}
      />,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          previewDiagnostic: expect.objectContaining({
            pageId: "page_1",
            file: "demos/page_1/index.tsx",
            stage: "module_parse",
            code: "GENERATED_MODULE_BINDING_CONFLICT",
            codeHash: "abc123",
          }),
        }),
      );
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

  it("fillContainer 应在父级尺寸变化但 ResizeObserver 未回调时重新计算 iframe 缩放", async () => {
    let measuredRect = { width: 1200, height: 800 };
    getBoundingClientRectSpy = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(
        () =>
          ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: measuredRect.width,
            bottom: measuredRect.height,
            width: measuredRect.width,
            height: measuredRect.height,
            toJSON: () => ({}),
          }) as DOMRect,
      );

    const previewSize = { width: 1000, height: 500 };
    const { rerender } = render(
      <PreviewPanel
        compiledJsUrl="/preview/page.js"
        fillContainer
        previewSize={previewSize}
      />,
    );

    const iframe = (await screen.findByTitle("预览")) as HTMLIFrameElement;
    await waitFor(() => {
      expect(iframe.style.transform).toBe("scale(1.2)");
      expect(iframe.style.top).toBe("100px");
      expect(iframe.style.left).toBe("0px");
    });

    measuredRect = { width: 1000, height: 500 };
    rerender(
      <PreviewPanel
        compiledJsUrl="/preview/page.js"
        fillContainer
        previewSize={previewSize}
      />,
    );

    await waitFor(() => {
      expect(iframe.style.transform).toBe("scale(1)");
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

  it("父级回调重建不应重启已加载的预览请求", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    const { rerender } = render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        onError={jest.fn()}
        onConsoleEntry={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
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
          data: { type: "LOADED", requestId: 1 },
          source: iframe.contentWindow,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("status", { name: "预览加载中" }),
      ).not.toBeInTheDocument();
    });

    rerender(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        onError={jest.fn()}
        onConsoleEntry={jest.fn()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("status", { name: "预览加载中" }),
    ).not.toBeInTheDocument();
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
          data: { type: "LOADED", requestId: 1 },
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

  it("应忽略旧请求的 LOADED 消息，避免切页时显示旧页面", async () => {
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
          data: { type: "LOADED", requestId: 0 },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(screen.getByAltText("preview placeholder")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "LOADED", requestId: 1 },
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

  it("空代码过渡不应占用新的预览请求版本", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    const { rerender } = render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        placeholderScreenshotUrl="http://localhost/screenshot.png"
      />,
    );

    const image = await screen.findByAltText("preview placeholder");
    fireEvent.load(image);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const iframe = screen.getByTitle("预览") as HTMLIFrameElement;

    rerender(
      <PreviewPanel
        code=""
        configData={{ title: "Test" }}
        placeholderScreenshotUrl="http://localhost/screenshot.png"
      />,
    );

    expect(await screen.findByText("等待页面代码加载")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "LOADED", requestId: 1 },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(screen.getByText("等待页面代码加载")).toBeInTheDocument();

    rerender(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        placeholderScreenshotUrl="http://localhost/screenshot.png"
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "LOADED", requestId: 2 },
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
          data: { type: "LOADED", requestId: 1 },
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

  it("应在 iframe 请求打开图层菜单时在预览区渲染本地菜单", async () => {
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
            contextMenuPoint: { x: 24, y: 32 },
          },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(screen.getByRole("menu", { name: "预览区图层" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /去看看/ })).toBeInTheDocument();
    expect(handleVisualLayerMenu).not.toHaveBeenCalled();
  });

  it("应按请求采集 iframe 内正式图层树", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    const handleVisualNodeTreeChange = jest.fn();
    const { rerender } = render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        visualNodeTreeRequestKey={0}
        onVisualNodeTreeChange={handleVisualNodeTreeChange}
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

    rerender(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        visualNodeTreeRequestKey={1}
        onVisualNodeTreeChange={handleVisualNodeTreeChange}
      />,
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        { type: "COLLECT_VISUAL_NODE_TREE" },
        "*",
      );
    });

    const tree = [
      {
        nodeId: "main:nth-of-type(1)",
        domPath: "main:nth-of-type(1)",
        tagName: "main",
        rect: { x: 0, y: 0, width: 320, height: 480 },
        editCapabilities: ["annotate", "style", "structure"],
        children: [
          {
            nodeId: "main:nth-of-type(1)>button:nth-of-type(1)",
            domPath: "main:nth-of-type(1)>button:nth-of-type(1)",
            tagName: "button",
            textContent: "去看看",
            rect: { x: 10, y: 20, width: 120, height: 40 },
            editCapabilities: ["annotate", "text", "style", "structure"],
            children: [],
          },
        ],
      },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "VISUAL_NODE_TREE_RESULT", nodes: tree },
          source: iframe.contentWindow,
        }),
      );
    });

    expect(handleVisualNodeTreeChange).toHaveBeenCalledWith(tree);
  });

  it("图层树菜单应支持注入项目滚动条样式", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "compiled", dependencies: [], cssImports: [] },
      }),
    );

    const node = {
      nodeId: "main>section:nth-of-type(1)",
      domPath: "main>section:nth-of-type(1)",
      tagName: "section",
      rect: { x: 10, y: 20, width: 120, height: 40 },
      editCapabilities: ["annotate", "style", "structure"],
      children: [],
    };

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        visualEditMode
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
            nodeTree: node,
            openLayerPicker: true,
            contextMenuPoint: { x: 24, y: 32 },
          },
          source: iframe.contentWindow,
        }),
      );
    });

    const menu = screen.getByRole("menu", { name: "预览区图层" });
    expect(menu.querySelector(".layer-tree-menu-scrollbar")).toBeInTheDocument();
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

  it("点击预览外层空白区域时应清空选中和图层栈", async () => {
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
        selectedVisualNodeId="main>button:nth-of-type(1)"
        onVisualSelect={handleVisualSelect}
        onVisualSelectStack={handleVisualSelectStack}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const iframe = screen.getByTitle("预览") as HTMLIFrameElement;
    const previewContainer = iframe.parentElement?.parentElement;
    expect(previewContainer).toBeTruthy();

    fireEvent.click(previewContainer!);

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
