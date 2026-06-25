import { fireEvent, render, screen } from "@testing-library/react";

import {
  PromptInput,
  PromptInputBody,
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
});
