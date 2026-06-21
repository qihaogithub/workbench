import { fireEvent, render, screen } from "@testing-library/react";

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

    expect(screen.getByText("子 Agent 摘要")).toBeInTheDocument();
    expect(screen.getByText(/发现 13 个重复页面/)).toBeInTheDocument();
    expect(screen.getByText("demos/plaza-mobile_main/index.tsx")).toBeInTheDocument();
    expect(screen.getByText("workspace/workspace-tree.json")).toBeInTheDocument();
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

    expect(screen.getByText("失败原因")).toBeInTheDocument();
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
