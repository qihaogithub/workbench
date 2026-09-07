import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ColorPicker,
  formatHsl,
  formatRgba,
  normalizeHex,
  parseColor,
} from "./index";

describe("color values", () => {
  it("normalizes hex and rgba values", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("abc")).toBe("#AABBCC");
    expect(formatRgba(parseColor("#FF000080")!)).toBe("rgba(255, 0, 0, 0.5)");
    expect(formatRgba(parseColor("rgba(10, 20, 30, 65)")!)).toBe(
      "rgba(10, 20, 30, 0.65)",
    );
    expect(formatHsl(parseColor("#60ADFF")!)).toBe("hsl(211, 100%, 69%)");
  });
});

describe("ColorPicker", () => {
  it("clears to null and edits opacity as an integer percentage", () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        format="opacity"
        value={35}
        onChange={onChange}
        label="透明度"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "透明度选择器" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "透明度数值" }), {
      target: { value: "67" },
    });
    expect(onChange).toHaveBeenLastCalledWith(67);
    fireEvent.click(screen.getByRole("button", { name: "清除" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps null distinct from zero opacity", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorPicker
        format="opacity"
        value={null}
        onChange={onChange}
        label="透明度"
      />,
    );

    expect(
      screen.getByRole("button", { name: "透明度选择器" }),
    ).toHaveTextContent("未设置");
    fireEvent.click(screen.getByRole("button", { name: "透明度选择器" }));
    expect(screen.getByRole("spinbutton", { name: "透明度数值" })).toHaveValue(
      null,
    );

    rerender(
      <ColorPicker
        format="opacity"
        value={0}
        onChange={onChange}
        label="透明度"
      />,
    );
    expect(
      screen.getByRole("button", { name: "透明度选择器" }),
    ).toHaveTextContent("0%");
    expect(screen.getByRole("spinbutton", { name: "透明度数值" })).toHaveValue(
      0,
    );
  });

  it("does not show a black fallback for an empty color", () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        format="color"
        value={null}
        onChange={onChange}
        label="颜色"
      />,
    );

    expect(
      screen.getByRole("button", { name: "颜色选择器" }),
    ).toHaveTextContent("无色");
    fireEvent.click(screen.getByRole("button", { name: "颜色选择器" }));
    expect(screen.getByRole("textbox", { name: "颜色Hex值" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "清除" })).toBeDisabled();
  });

  it("updates from editable hex text, including a value without a leading hash", () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        format="color"
        value="#60ADFF"
        onChange={onChange}
        label="颜色"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "颜色选择器" }));
    const input = screen.getByRole("textbox", { name: "颜色Hex值" });
    fireEvent.change(input, { target: { value: "60AD" } });
    expect(input).toHaveValue("60AD");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "60ADFE" } });
    expect(onChange).toHaveBeenLastCalledWith("#60ADFE");
  });

  it("switches input formats without changing the schema format", () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        format="color"
        value="#60ADFF"
        onChange={onChange}
        label="颜色"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "颜色选择器" }));
    fireEvent.change(screen.getByRole("combobox", { name: "颜色输入格式" }), {
      target: { value: "rgb" },
    });
    const input = screen.getByRole("spinbutton", { name: "颜色RGB通道1" });
    expect(input).toHaveValue(96);
    fireEvent.change(input, { target: { value: "37" } });
    expect(onChange).toHaveBeenLastCalledWith("#25ADFF");
  });

  it("uses the browser eyedropper when it is available", async () => {
    const onChange = vi.fn();
    const open = vi.fn().mockResolvedValue({ sRGBHex: "#123456" });
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: vi.fn(() => ({ open })),
    });

    render(
      <ColorPicker
        format="color"
        value="#60ADFF"
        onChange={onChange}
        label="颜色"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "颜色选择器" }));
    fireEvent.click(screen.getByRole("button", { name: "吸管取色" }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("#123456"));
    delete (window as Window & { EyeDropper?: unknown }).EyeDropper;
  });

  it("applies a preset while retaining combined color alpha", () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        format="color-opacity"
        value="rgba(10, 20, 30, 0.35)"
        onChange={onChange}
        label="背景色"
        presets={[{ label: "品牌蓝", value: "#2563EB" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "背景色选择器" }));
    fireEvent.click(
      screen.getByRole("button", { name: "选择预设颜色：品牌蓝" }),
    );
    expect(onChange).toHaveBeenLastCalledWith("rgba(37, 99, 235, 0.35)");
  });

  it("retains zero alpha when replacing a combined color preset", () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        format="color-opacity"
        value="rgba(10, 20, 30, 0)"
        onChange={onChange}
        label="背景色"
        presets={[{ label: "品牌蓝", value: "#2563EB" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "背景色选择器" }));
    fireEvent.click(
      screen.getByRole("button", { name: "选择预设颜色：品牌蓝" }),
    );
    expect(onChange).toHaveBeenLastCalledWith("rgba(37, 99, 235, 0)");
  });
});
