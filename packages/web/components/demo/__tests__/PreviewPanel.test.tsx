import { render, screen, waitFor } from "@testing-library/react";
import { PreviewPanel } from "../PreviewPanel";

jest.mock("@/lib/compiler-client", () => ({
  compileCode: jest.fn(),
  clearCompileCache: jest.fn(),
}));

jest.mock("@/lib/component-executor", () => ({
  executeComponent: jest.fn(),
}));

import { compileCode } from "@/lib/compiler-client";
import { executeComponent } from "@/lib/component-executor";

const mockCompileCode = compileCode as jest.MockedFunction<typeof compileCode>;
const mockExecuteComponent = executeComponent as jest.MockedFunction<typeof executeComponent>;

describe("PreviewPanel", () => {
  const mockCode = `export default function Demo({ title }: { title: string }) {
    return <h1>{title}</h1>;
  }`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("应显示加载状态（编译中）", () => {
    mockCompileCode.mockReturnValue(new Promise(() => {})); // 永不 resolve

    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("应正确渲染编译后的组件", async () => {
    const MockComponent = ({ title }: { title: string }) => <h1>{title}</h1>;
    mockCompileCode.mockResolvedValue({
      compiledCode: "compiled-mock-code",
      dependencies: [],
    });
    mockExecuteComponent.mockReturnValue(MockComponent as React.ComponentType<Record<string, unknown>>);

    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
  });

  it("应处理编译错误", async () => {
    mockCompileCode.mockRejectedValue(new Error("语法错误: 第3行"));

    render(<PreviewPanel code={mockCode} configData={{ title: "Test" }} />);

    await waitFor(() => {
      expect(screen.getByText("编译错误")).toBeInTheDocument();
      expect(screen.getByText("语法错误: 第3行")).toBeInTheDocument();
    });
  });

  it("应处理无效代码路径", () => {
    const invalidCode = "E:\\重要文件\\Programming\\file.tsx";

    render(<PreviewPanel code={invalidCode} configData={{ title: "Test" }} />);

    expect(screen.getByText("⚠️ 代码加载失败")).toBeInTheDocument();
    expect(screen.getByText(/检测到无效的代码文件/)).toBeInTheDocument();
  });

  it("应支持自定义 className", async () => {
    const MockComponent = () => <div>Demo</div>;
    mockCompileCode.mockResolvedValue({
      compiledCode: "compiled-mock-code",
      dependencies: [],
    });
    mockExecuteComponent.mockReturnValue(MockComponent as React.ComponentType<Record<string, unknown>>);

    render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        className="custom-class"
      />,
    );

    await waitFor(() => {
      expect(document.querySelector(".custom-class")).toBeInTheDocument();
    });
  });

  it("应支持传入自定义 previewSize", async () => {
    const MockComponent = () => <div>Demo</div>;
    mockCompileCode.mockResolvedValue({
      compiledCode: "compiled-mock-code",
      dependencies: [],
    });
    mockExecuteComponent.mockReturnValue(MockComponent as React.ComponentType<Record<string, unknown>>);

    const { container } = render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        previewSize={{ width: 768, height: 1024 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Demo")).toBeInTheDocument();
    });
  });

  it("应支持 scale 缩放属性", async () => {
    const MockComponent = () => <div>Demo</div>;
    mockCompileCode.mockResolvedValue({
      compiledCode: "compiled-mock-code",
      dependencies: [],
    });
    mockExecuteComponent.mockReturnValue(MockComponent as React.ComponentType<Record<string, unknown>>);

    const { container } = render(
      <PreviewPanel
        code={mockCode}
        configData={{ title: "Test" }}
        previewSize={{ width: 1440, height: 900, scale: 0.5 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Demo")).toBeInTheDocument();
    });
  });

  it("配置变更不应触发重新编译，应直接传递 props", async () => {
    const MockComponent = jest.fn(({ title }: { title: string }) => <h1>{title}</h1>);
    mockCompileCode.mockResolvedValue({
      compiledCode: "compiled-mock-code",
      dependencies: [],
    });
    mockExecuteComponent.mockReturnValue(MockComponent as unknown as React.ComponentType<Record<string, unknown>>);

    const { rerender } = render(
      <PreviewPanel code={mockCode} configData={{ title: "First" }} />,
    );

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    expect(mockCompileCode).toHaveBeenCalledTimes(1);

    // 仅变更 configData，code 不变
    rerender(<PreviewPanel code={mockCode} configData={{ title: "Second" }} />);

    await waitFor(() => {
      expect(screen.getByText("Second")).toBeInTheDocument();
    });

    // compileCode 不应被再次调用
    expect(mockCompileCode).toHaveBeenCalledTimes(1);
  });
});
