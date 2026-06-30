import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Message } from "../message";

jest.mock(
  "streamdown",
  () => ({
    Streamdown: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="streamdown-renderer">{children}</div>
    ),
  }),
  { virtual: true },
);

jest.mock("@streamdown/code", () => ({ code: {} }), { virtual: true });
jest.mock("@streamdown/mermaid", () => ({ mermaid: {} }), { virtual: true });
jest.mock("@streamdown/math", () => ({ math: {} }), { virtual: true });
jest.mock("@streamdown/cjk", () => ({ cjk: {} }), { virtual: true });

describe("Message 用户消息展示", () => {
  it("普通 Markdown 用户消息使用 Markdown 渲染器展示", () => {
    const content = [
      "设计以下页面：",
      "| 页面/状态 | 内容和功能 |",
      "| --- | --- |",
      "| 站外引导页 | App WebView 内打开 |",
    ].join("\n");

    render(
      <Message
        message={{
          id: "user-1",
          role: "user",
          content,
        }}
      />,
    );

    expect(screen.getByTestId("user-message-markdown")).toBeInTheDocument();
    expect(screen.getByTestId("streamdown-renderer")).toHaveTextContent(
      "设计以下页面：",
    );
    expect(screen.getByTestId("streamdown-renderer")).toHaveTextContent(
      "站外引导页",
    );
  });
});

describe("Message 自动修复系统任务", () => {
  it.each([
    ["running", "修复中"],
    ["completed", "已修复"],
    ["failed", "修复失败"],
  ] as const)("展示 %s 状态", (status, label) => {
    render(
      <Message
        message={{
          id: "auto-repair-1",
          role: "system",
          kind: "auto_repair",
          content: "检测到预览异常，正在自动修复",
          autoRepair: {
            status,
            title: "检测到预览异常，正在自动修复",
            summary: "AI 将尝试恢复当前页面预览",
            debugDetail: "错误: import 失败",
            hiddenPrompt: "包含完整技术错误的隐藏提示",
          },
        }}
      />,
    );

    expect(screen.getByText("检测到预览异常，正在自动修复")).toBeInTheDocument();
    expect(screen.getByText("AI 将尝试恢复当前页面预览")).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("默认不展示 hidden prompt", () => {
    render(
      <Message
        message={{
          id: "auto-repair-1",
          role: "system",
          kind: "auto_repair",
          content: "检测到预览异常，正在自动修复",
          autoRepair: {
            status: "running",
            title: "检测到预览异常，正在自动修复",
            summary: "AI 将尝试恢复当前页面预览",
            debugDetail: "错误: import 失败",
            hiddenPrompt: "页面: demo_1\n错误: 这是隐藏技术提示",
          },
        }}
      />,
    );

    expect(screen.queryByText(/这是隐藏技术提示/)).not.toBeInTheDocument();
    expect(screen.getByText("查看详情")).toBeInTheDocument();
  });

  it("点击查看详情后用弹窗展示调试详情", async () => {
    const user = userEvent.setup();

    render(
      <Message
        message={{
          id: "auto-repair-1",
          role: "system",
          kind: "auto_repair",
          content: "检测到预览异常，正在自动修复",
          autoRepair: {
            status: "running",
            title: "检测到预览异常，正在自动修复",
            summary: "AI 将尝试恢复当前页面预览",
            debugDetail: "错误: import 失败",
            hiddenPrompt: "页面: demo_1\n错误: 这是隐藏技术提示",
          },
        }}
      />,
    );

    expect(screen.queryByText("错误: import 失败")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看详情" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("自动修复详情")).toBeInTheDocument();
    expect(screen.getByText("错误: import 失败")).toBeInTheDocument();
    expect(screen.queryByText(/这是隐藏技术提示/)).not.toBeInTheDocument();
  });
});
