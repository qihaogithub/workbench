import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AssistantMessage } from "../assistant-message";
import { Tool } from "../tool";

jest.mock(
  "streamdown",
  () => ({
    Streamdown: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  }),
  { virtual: true },
);

jest.mock("@streamdown/code", () => ({ code: {} }), { virtual: true });
jest.mock("@streamdown/mermaid", () => ({ mermaid: {} }), { virtual: true });
jest.mock("@streamdown/math", () => ({ math: {} }), { virtual: true });
jest.mock("@streamdown/cjk", () => ({ cjk: {} }), { virtual: true });

describe("AssistantMessage 子 Agent 展示", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
  });

  it("将 delegateTask 运行中状态展示为委派子 Agent 任务块", () => {
    render(
      <AssistantMessage
        parts={[
          {
            type: "tool",
            toolCallId: "delegate-1",
            toolName: "delegateTask",
            status: "running",
            parameters: { task: "检查重复页面" },
          },
        ]}
      />,
    );

    expect(screen.getByText(/子 Agent 正在处理/)).toBeInTheDocument();
    expect(screen.getByText(/检查重复页面/)).toBeInTheDocument();
  });

  it("将后端 in_progress 状态识别为运行中", () => {
    render(
      <AssistantMessage
        isStreaming
        parts={[
          {
            type: "tool",
            toolCallId: "delegate-1",
            toolName: "delegateTask",
            status: "in_progress" as "running",
            parameters: { task: "并行创建页面组 B" },
          },
        ]}
      />,
    );

    expect(screen.getByText(/子 Agent 正在处理/)).toBeInTheDocument();
    expect(screen.getByText(/并行创建页面组 B/)).toBeInTheDocument();
    expect(screen.queryByText(/已完成/)).not.toBeInTheDocument();
  });

  it("展示子 Agent 成功摘要、耗时和文件变更数量", () => {
    render(
      <AssistantMessage
        parts={[
          {
            type: "tool",
            toolCallId: "delegate-1",
            toolName: "delegateTask",
            status: "completed",
            parameters: { task: "整理重复广场页面" },
            result: {
              details: {
                success: true,
                content: "发现 13 个重复页面，已保留 2 个主版本。",
                durationMs: 23000,
                files: [
                  { path: "demos/plaza-mobile_main/index.tsx" },
                  { path: "workspace/workspace-tree.json" },
                ],
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/委派子 Agent/)).toBeInTheDocument();
    expect(screen.getByText(/已完成 · 23s · 修改 2 个文件/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/委派子 Agent/));

    expect(screen.getByText("主 Agent")).toBeInTheDocument();
    expect(screen.getByText("子 Agent")).toBeInTheDocument();
    expect(screen.getByText("整理重复广场页面")).toBeInTheDocument();
    expect(screen.queryByText(/我把这组页面交给你处理/)).not.toBeInTheDocument();
    expect(screen.getByText("发现 13 个重复页面，已保留 2 个主版本。")).toBeInTheDocument();
    expect(screen.queryByText(/已完成这组任务/)).not.toBeInTheDocument();
    expect(screen.queryByText("更新内容")).not.toBeInTheDocument();
    expect(screen.queryByText("技术详情")).not.toBeInTheDocument();
    expect(screen.queryByText("原始详情")).not.toBeInTheDocument();
  });

  it("流式处理中已返回的子 Agent 展示为等待主 Agent 汇总", () => {
    render(
      <AssistantMessage
        isStreaming
        parts={[
          {
            type: "tool",
            toolCallId: "delegate-1",
            toolName: "delegateTask",
            status: "completed",
            parameters: { task: "创建 3 个新页面" },
            result: {},
            details: {
              success: true,
              content: "子 Agent 已写入页面文件。",
              durationMs: 11000,
              files: [{ path: "demos/preheat-homepage_k4m9/index.tsx" }],
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/待主 Agent 汇总/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/委派子 Agent/));

    expect(screen.getByText("主 Agent")).toBeInTheDocument();
    expect(screen.getByText("子 Agent")).toBeInTheDocument();
    expect(screen.getByText("创建 3 个新页面")).toBeInTheDocument();
    expect(screen.queryByText(/完成后告诉我改了哪些文件/)).not.toBeInTheDocument();
    expect(screen.getByText("子 Agent 已写入页面文件。")).toBeInTheDocument();
    expect(screen.queryByText(/主 Agent 正在汇总和收尾/)).not.toBeInTheDocument();
    expect(screen.queryByText("更新内容")).not.toBeInTheDocument();
    expect(screen.queryByText("demos/preheat-homepage_k4m9/index.tsx")).not.toBeInTheDocument();
  });

  it("长主 Agent 任务折叠，长子 Agent 返回完整展示", () => {
    const longTask = `# 创建页面任务\n${"请保留真实委派内容，并完成页面实现。".repeat(25)}`;
    const longContent = `## 执行结果\n${"已创建页面并记录文件变更。".repeat(60)}`;

    render(
      <AssistantMessage
        parts={[
          {
            type: "tool",
            toolCallId: "delegate-1",
            toolName: "delegateTask",
            status: "completed",
            parameters: { task: longTask },
            result: {
              details: {
                success: true,
                content: longContent,
                files: [{ path: "demos/demo-page/index.tsx" }],
              },
            },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByText(/委派子 Agent/));

    expect(screen.getAllByText(/创建页面任务/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/执行结果/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("展开完整消息")).toHaveLength(1);

    fireEvent.click(screen.getAllByText("展开完整消息")[0]);

    expect(screen.getByText("收起消息")).toBeInTheDocument();
  });

  it("展示子 Agent 超时失败状态", () => {
    render(
      <AssistantMessage
        parts={[
          {
            type: "tool",
            toolCallId: "delegate-1",
            toolName: "delegateTask",
            status: "error",
            parameters: { task: "检查所有页面" },
            result: {
              details: {
                success: false,
                error: "Subagent timed out",
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/超时未完成/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/委派子 Agent/));

    expect(screen.getByText("子 Agent")).toBeInTheDocument();
    expect(screen.getByText("Subagent timed out")).toBeInTheDocument();
  });

  it("普通工具仍按原工具操作展示", () => {
    render(
      <AssistantMessage
        parts={[
          {
            type: "tool",
            toolCallId: "read-1",
            toolName: "readFile",
            status: "completed",
            parameters: { path: "src/app/page.tsx" },
          },
        ]}
      />,
    );

    expect(screen.getByText("src/app/page.tsx")).toBeInTheDocument();
    expect(screen.queryByText(/委派子 Agent/)).not.toBeInTheDocument();
  });

  it("将外部授权需求渲染为聊天内授权卡片", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            provider: "dingtalk",
            status: "pending",
            authUrl: "https://login.dingtalk.test/device",
            userCode: "ABCD-1234",
            message: "请在浏览器完成钉钉授权",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            providers: [
              {
                provider: "figma",
                status: "disconnected",
              },
              {
                provider: "dingtalk",
                status: "connected",
                accountLabel: "Ding User",
              },
            ],
          },
        }),
      });
    (global as typeof globalThis & { fetch: typeof fetchMock }).fetch = fetchMock;
    const clickMock = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const continueMock = jest.fn();

    render(
      <AssistantMessage
        messageId="assistant-auth-1"
        onExternalAuthConnected={continueMock}
        parts={[
          {
            type: "tool",
            toolCallId: "dingtalk-1",
            toolName: "dingtalk",
            status: "error",
            details: {
              kind: "external_auth_required",
              provider: "dingtalk",
              reason: "not_connected",
              title: "连接钉钉后继续",
              message: "需要使用你的钉钉权限授权。",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("连接钉钉后继续")).toBeInTheDocument();
    expect(screen.getByText(/需要使用你的钉钉权限授权/)).toBeInTheDocument();
    expect(screen.queryByText(/去设置/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("连接 钉钉"));

    await waitFor(() => expect(clickMock).toHaveBeenCalled());
    expect(await screen.findByText("打开授权页")).toHaveAttribute(
      "href",
      "https://login.dingtalk.test/device",
    );
    expect(await screen.findByText("ABCD-1234")).toBeInTheDocument();

    fireEvent.click(screen.getByText("我已完成授权"));

    await waitFor(() => {
      expect(screen.getByText(/钉钉 已连接：Ding User/)).toBeInTheDocument();
    });
    expect(screen.getByText("已连接")).toBeDisabled();
    expect(screen.getByText("重新检查授权")).toBeInTheDocument();
    await waitFor(() => {
      expect(continueMock).toHaveBeenCalledWith("assistant-auth-1");
    });
  });

  it("授权卡片不折叠进执行过程", () => {
    render(
      <AssistantMessage
        parts={[
          {
            type: "reasoning",
            content: "需要先检查工具权限。",
          },
          {
            type: "tool",
            toolCallId: "dingtalk-1",
            toolName: "dingtalk",
            status: "error",
            details: {
              kind: "external_auth_required",
              provider: "dingtalk",
              reason: "not_connected",
              title: "连接钉钉后继续",
              message: "需要使用你的钉钉权限授权。",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("连接钉钉后继续")).toBeInTheDocument();
    expect(screen.getByText("连接 钉钉")).toBeInTheDocument();
  });

  it("展示轻量处理中动效且不暴露日志入口", () => {
    render(
      <AssistantMessage
        isStreaming
        parts={[
          { type: "text", content: "处理中" },
          {
            type: "tool",
            toolCallId: "delegate-1",
            toolName: "delegateTask",
            status: "running",
            parameters: { task: "检查页面问题" },
          },
        ]}
      />,
    );

    expect(screen.getByText("AI 正在处理")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("检查页面问题");
    expect(screen.queryByText("模型响应")).not.toBeInTheDocument();
    expect(screen.queryByText("日志")).not.toBeInTheDocument();
  });

  it("备用 Tool 组件将 delegateTask 展示为子 Agent 结果", () => {
    render(
      <Tool
        entries={[
          {
            name: "delegateTask",
            kind: "delegate",
            status: "completed",
            parameters: { task: "汇总页面问题" },
            result: {
              details: {
                success: true,
                content: "已完成页面问题汇总。",
                durationMs: 1200,
                files: [{ path: "reports/pages.md" }],
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("委派子 Agent：汇总页面问题")).toBeInTheDocument();

    fireEvent.click(screen.getByText("委派子 Agent：汇总页面问题"));

    expect(screen.getByText("子 Agent 摘要")).toBeInTheDocument();
    expect(screen.getByText("已完成页面问题汇总。")).toBeInTheDocument();
    expect(screen.getByText("reports/pages.md")).toBeInTheDocument();
  });
});
