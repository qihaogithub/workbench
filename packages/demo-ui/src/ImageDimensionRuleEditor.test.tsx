import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageDimensionRuleEditor } from "./ImageDimensionRuleEditor";

describe("ImageDimensionRuleEditor", () => {
  it("默认关闭区间并支持单值符号和不限", () => {
    const onChange = vi.fn();
    render(<ImageDimensionRuleEditor axis="H" onChange={onChange} />);

    expect(screen.getByRole("switch", { name: "H区间" })).not.toBeChecked();
    expect(screen.getByLabelText("H尺寸比较符")).toHaveValue("不限");
    expect(screen.getByLabelText("H尺寸比较符").querySelectorAll("option")).toHaveLength(6);

    fireEvent.change(screen.getByLabelText("H尺寸比较符"), { target: { value: ">" } });
    fireEvent.change(screen.getByLabelText("H尺寸具体数值"), { target: { value: "670" } });
    expect(onChange).toHaveBeenLastCalledWith({ min: { value: 670, inclusive: false } });

    fireEvent.change(screen.getByLabelText("H尺寸比较符"), { target: { value: "不限" } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("开启区间后使用一行上下限编辑并在补全后恢复有效", () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(<ImageDimensionRuleEditor axis="H" onChange={onChange} onValidityChange={onValidityChange} />);

    fireEvent.click(screen.getByRole("switch", { name: "H区间" }));
    expect(screen.getByLabelText("H区间下限比较符")).toHaveValue("≤");
    expect(screen.getByLabelText("H区间上限比较符")).toHaveValue("≤");
    fireEvent.change(screen.getByLabelText("H区间下限数值"), { target: { value: "670" } });
    expect(screen.getByRole("alert")).toHaveTextContent("区间需要填写上下限");
    fireEvent.change(screen.getByLabelText("H区间上限数值"), { target: { value: "890" } });

    expect(onChange).toHaveBeenLastCalledWith({
      min: { value: 670, inclusive: true },
      max: { value: 890, inclusive: true },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("阻止反向区间并显示就地错误", () => {
    const onValidityChange = vi.fn();
    render(
      <ImageDimensionRuleEditor
        axis="W"
        rule={{ min: { value: 900, inclusive: true }, max: { value: 670, inclusive: true } }}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("下限不能大于上限");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  it("清空单值规则时保持保存无效", () => {
    const onValidityChange = vi.fn();
    render(
      <ImageDimensionRuleEditor
        axis="W"
        rule={{ min: { value: 320, inclusive: true } }}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("W尺寸比较符"), { target: { value: "=" } });
    fireEvent.change(screen.getByLabelText("W尺寸具体数值"), { target: { value: "" } });

    expect(screen.getByRole("alert")).toHaveTextContent("=需要填写数值");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });
});
