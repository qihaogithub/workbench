import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserChoiceCard } from "@workbench/ai-chat-shared/user-choice-card";
import type { MessagePart } from "@workbench/ai-chat-shared/message";

const pendingPart: Extract<MessagePart, { type: "user_choice" }> = {
  type: "user_choice",
  requestId: "choice-1",
  question: "选择布局？",
  description: "这个选择会影响页面结构。",
  options: [
    { optionId: "option_1", label: "左右布局", value: "split" },
    { optionId: "option_2", label: "上下布局", value: "stack" },
  ],
  allowCustom: true,
  status: "pending",
};

describe("UserChoiceCard", () => {
  it("提交预设选项", async () => {
    const user = userEvent.setup();
    const onRespond = jest.fn();

    render(<UserChoiceCard part={pendingPart} onRespond={onRespond} />);

    await user.click(screen.getByRole("button", { name: /左右布局/ }));
    await user.click(screen.getByRole("button", { name: "提交" }));

    expect(onRespond).toHaveBeenCalledWith("choice-1", {
      type: "option",
      optionId: "option_1",
    });
  });

  it("提交其他自定义内容", async () => {
    const user = userEvent.setup();
    const onRespond = jest.fn();

    render(<UserChoiceCard part={pendingPart} onRespond={onRespond} />);

    await user.click(screen.getByRole("button", { name: "其他" }));
    await user.type(screen.getByPlaceholderText("输入你的选择..."), "卡片式布局");
    await user.click(screen.getByRole("button", { name: "提交" }));

    expect(onRespond).toHaveBeenCalledWith("choice-1", {
      type: "custom",
      text: "卡片式布局",
    });
  });

  it("回答后展示已选内容且不再显示提交按钮", () => {
    render(
      <UserChoiceCard
        part={{
          ...pendingPart,
          status: "answered",
          selected: {
            type: "option",
            optionId: "option_2",
            label: "上下布局",
            value: "stack",
          },
        }}
      />,
    );

    expect(screen.getByText("已选择")).toBeInTheDocument();
    expect(screen.getByText("上下布局")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交" })).not.toBeInTheDocument();
  });
});
