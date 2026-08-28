import { fireEvent, render, screen } from "@testing-library/react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workbench/ai-chat-shared/ui/select";

describe("共享 Select", () => {
  it("分组下拉不会把视口锁死为触发器高度", () => {
    render(
      <Select defaultValue="jojo/deepseek-v4-flash-vision-exp">
        <SelectTrigger aria-label="选择模型">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>jojo</SelectLabel>
            <SelectItem value="jojo/deepseek-v4-flash-vision-exp">
              deepseek-v4-flash-vision-exp
            </SelectItem>
            <SelectItem value="jojo/Qwen3.8-27B">Qwen3.8-27B</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "选择模型" }));

    const viewport = screen
      .getByRole("option", { name: "deepseek-v4-flash-vision-exp" })
      .closest('[data-radix-select-viewport]');

    expect(viewport).toBeInTheDocument();
    expect(viewport).not.toHaveClass(
      "h-[var(--radix-select-trigger-height)]",
    );
    expect(screen.getByText("Qwen3.8-27B")).toBeVisible();
  });
});
