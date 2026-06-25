import { render, screen } from "@testing-library/react";

import { ChatPlan } from "../chat/chat-plan";

describe("ChatPlan", () => {
  it("展示结构化计划的四种状态", () => {
    render(
      <ChatPlan
        isStreaming
        plan={{
          fallbackText: "",
          items: [
            { id: "inspect", title: "检查现状", status: "completed" },
            { id: "implement", title: "实现功能", status: "in_progress" },
            { id: "verify", title: "验证结果", status: "pending" },
            { id: "fix", title: "修复失败项", status: "failed" },
          ],
        }}
      />,
    );

    expect(screen.getByText("计划")).toBeInTheDocument();
    expect(screen.getByText("检查现状")).toBeInTheDocument();
    expect(screen.getByText("实现功能")).toBeInTheDocument();
    expect(screen.getByText("验证结果")).toBeInTheDocument();
    expect(screen.getByText("修复失败项")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("待处理")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("1 项失败")).toBeInTheDocument();
  });

  it("非 JSON 计划内容走文本回退展示", () => {
    render(
      <ChatPlan
        isStreaming={false}
        plan={{
          items: [],
          fallbackText: "1. 先检查\n2. 再实现",
        }}
      />,
    );

    expect(screen.getByText("计划")).toBeInTheDocument();
    expect(screen.getByText(/先检查/)).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
  });

  it("空计划不渲染", () => {
    const { container } = render(
      <ChatPlan
        isStreaming={false}
        plan={{
          items: [],
          fallbackText: "",
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
