import { fireEvent, render, screen } from "@testing-library/react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "../prompt-input";

describe("PromptInputTextarea", () => {
  it("长文本自动拉高到最大高度后启用内部滚动", () => {
    const scrollHeightSpy = jest
      .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
      .mockImplementation(function getScrollHeight(
        this: HTMLTextAreaElement,
      ) {
        return this.value.split("\n").length > 3 ? 180 : 72;
      });

    render(
      <PromptInput>
        <PromptInputBody>
          <PromptInputTextarea minHeight={40} maxHeight={120} />
        </PromptInputBody>
      </PromptInput>,
    );

    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, {
      target: { value: "第一行\n第二行\n第三行\n第四行\n第五行" },
    });

    expect(textarea).toHaveStyle({ height: "120px", overflowY: "auto" });

    scrollHeightSpy.mockRestore();
  });

  it("streaming 状态下仍允许输入并按 Enter 提交", () => {
    const onSubmit = jest.fn();

    render(
      <PromptInput status="streaming" onSubmit={onSubmit}>
        <PromptInputBody>
          <PromptInputTextarea />
        </PromptInputBody>
      </PromptInput>,
    );

    const textarea = screen.getByRole("textbox");
    expect(textarea).not.toBeDisabled();

    fireEvent.change(textarea, { target: { value: "下一条消息" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith({
      text: "下一条消息",
      files: [],
    });
  });

  it("streaming 状态下有输入内容时提交消息而不是取消当前回复", () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();

    render(
      <PromptInput status="streaming" onSubmit={onSubmit} onCancel={onCancel}>
        <PromptInputBody>
          <PromptInputTextarea />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputSubmit />
        </PromptInputFooter>
      </PromptInput>,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "排队发送" },
    });
    fireEvent.click(screen.getByRole("button"));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "排队发送",
      files: [],
    });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
