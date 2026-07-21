import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Message } from "@workbench/ai-chat-shared/message";

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
  it("可视化属性消息以卡片展示，并可在弹窗中查看完整上下文", async () => {
    const user = userEvent.setup();

    render(
      <Message
        message={{
          id: "visual-property-1",
          role: "user",
          content: "完整的结构化属性修改提示",
          visualProperty: {
            title: "可视化修改已发送给 AI",
            summary: "<div> 商品列表 · 2 项结构化变更",
            hiddenPrompt: "【点击位置图层】\n1. 商品列表\n\n【属性变更】\n标题：旧值 -> 新值",
          },
        }}
      />,
    );

    expect(screen.getByText("可视化修改已发送给 AI")).toBeInTheDocument();
    expect(screen.getByText(/商品列表 · 2 项结构化变更/)).toBeInTheDocument();
    expect(screen.queryByText("完整的结构化属性修改提示")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看详情" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("【点击位置图层】");
    expect(dialog).toHaveTextContent("标题：旧值 -> 新值");
  });

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

  it("排队用户消息展示等待状态并支持取消", async () => {
    const user = userEvent.setup();
    const onCancelQueuedMessage = jest.fn();

    render(
      <Message
        message={{
          id: "user-queued",
          role: "user",
          content: "下一条需求",
          queueId: "queued-1",
          queueStatus: "queued",
        }}
        isStreaming
        onCancelQueuedMessage={onCancelQueuedMessage}
      />,
    );

    expect(screen.getByText("等待发送")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onCancelQueuedMessage).toHaveBeenCalledWith("queued-1");
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
