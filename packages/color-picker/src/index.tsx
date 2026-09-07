"use client";

import * as Popover from "@radix-ui/react-popover";
import * as Slider from "@radix-ui/react-slider";
import Color from "color";
import {
  ColorPickerAlpha as ShadcnColorPickerAlpha,
  ColorPickerEyeDropper as ShadcnColorPickerEyeDropper,
  ColorPickerFormat as ShadcnColorPickerFormat,
  ColorPickerHue as ShadcnColorPickerHue,
  ColorPickerOutput as ShadcnColorPickerOutput,
  ColorPickerSelection as ShadcnColorPickerSelection,
  ShadcnColorPicker,
  type RgbaTuple,
} from "./shadcn-color-picker";
import {
  useCallback,
  useId,
  useMemo,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type ColorPickerFormat = "color" | "opacity" | "color-opacity";
export type ColorPickerValue = string | number | null | undefined;

export interface ColorPreset {
  label: string;
  value: string;
}

export interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface ColorPickerProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "value" | "onChange"
  > {
  format: ColorPickerFormat;
  value?: ColorPickerValue;
  onChange: (value: string | number | null) => void;
  label?: string;
  presets?: readonly ColorPreset[];
  allowEmpty?: boolean;
  recentColors?: readonly string[];
  onRecentColorsChange?: (colors: string[]) => void;
  compact?: boolean;
  /** Keep focus on the trigger for composite editors that own an active text selection. */
  preserveFocusOnOpen?: boolean;
}

const EMPTY_SURFACE_COLOR: RgbaColor = {
  red: 128,
  green: 128,
  blue: 128,
  alpha: 1,
};
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundChannel(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

function roundAlpha(value: number): number {
  return clamp(Math.round(value * 100) / 100, 0, 1);
}

export function parseColor(value: unknown): RgbaColor | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input) return null;

  if (COLOR_PATTERN.test(input)) {
    const raw = input.slice(1);
    const expanded =
      raw.length === 3 || raw.length === 4
        ? raw
            .split("")
            .map((channel) => `${channel}${channel}`)
            .join("")
        : raw;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
      alpha:
        expanded.length === 8
          ? roundAlpha(Number.parseInt(expanded.slice(6, 8), 16) / 255)
          : 1,
    };
  }

  const rgb = input.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+)%?)?\s*\)$/i,
  );
  if (rgb) {
    const alpha =
      rgb[4] === undefined
        ? 1
        : Number(rgb[4]) > 1 && !input.includes("%")
          ? Number(rgb[4]) / 100
          : input.includes("%")
            ? Number(rgb[4]) / 100
            : Number(rgb[4]);
    const red = Number(rgb[1]);
    const green = Number(rgb[2]);
    const blue = Number(rgb[3]);
    if (![red, green, blue, alpha].every(Number.isFinite)) return null;
    return {
      red: roundChannel(red),
      green: roundChannel(green),
      blue: roundChannel(blue),
      alpha: roundAlpha(alpha),
    };
  }

  try {
    const color = Color(input).rgb();
    const [red, green, blue] = color.array();
    return {
      red: roundChannel(red),
      green: roundChannel(green),
      blue: roundChannel(blue),
      alpha: roundAlpha(color.alpha()),
    };
  } catch {
    return null;
  }
}

export function formatHex(color: RgbaColor): string {
  return `#${[color.red, color.green, color.blue]
    .map((channel) => roundChannel(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function formatRgb(color: RgbaColor): string {
  return `rgb(${roundChannel(color.red)}, ${roundChannel(color.green)}, ${roundChannel(color.blue)})`;
}

export function formatRgba(color: RgbaColor): string {
  const alpha = roundAlpha(color.alpha);
  const alphaText =
    alpha === 0 || alpha === 1
      ? String(alpha)
      : alpha.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `rgba(${roundChannel(color.red)}, ${roundChannel(color.green)}, ${roundChannel(color.blue)}, ${alphaText})`;
}

export function formatHsl(color: RgbaColor): string {
  const parsed = Color.rgb([color.red, color.green, color.blue]).hsl();
  const [hue, saturation, lightness] = parsed.array();
  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
}

export function normalizeHex(value: unknown): string | null {
  const input = typeof value === "string" ? value.trim() : value;
  const candidate =
    typeof input === "string" && !input.startsWith("#")
      ? `#${input}`
      : input;
  const color = parseColor(candidate);
  return color ? formatHex(color) : null;
}

function isEmpty(value: ColorPickerValue): boolean {
  return value === null || value === undefined || value === "";
}

function checkerStyle(): CSSProperties {
  return {
    backgroundImage:
      "linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)",
    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
    backgroundSize: "8px 8px",
    backgroundColor: "#f9fafb",
  };
}

function swatchStyle(
  value: ColorPickerValue,
  format: ColorPickerFormat,
): CSSProperties {
  if (format === "opacity") {
    const opacity = typeof value === "number" ? clamp(value, 0, 100) / 100 : 0;
    return {
      background: `linear-gradient(135deg, #111827 0%, #111827 ${opacity * 100}%, #d1d5db ${opacity * 100}%, #d1d5db 100%)`,
    };
  }
  const parsed = parseColor(value) ?? EMPTY_SURFACE_COLOR;
  return {
    backgroundColor:
      format === "color-opacity" ? formatRgba(parsed) : formatHex(parsed),
  };
}

function formatLabel(format: ColorPickerFormat): string {
  if (format === "opacity") return "透明度";
  if (format === "color-opacity") return "颜色与透明度";
  return "颜色";
}

function formatDisplayValue(
  value: ColorPickerValue,
  format: ColorPickerFormat,
): string {
  if (isEmpty(value)) return format === "opacity" ? "未设置" : "无色";
  if (format === "opacity") return `${clamp(Number(value), 0, 100)}%`;
  const parsed = parseColor(value);
  return parsed
    ? format === "color"
      ? formatHex(parsed)
      : formatRgba(parsed)
    : "无效颜色";
}

function ColorSwatch({
  value,
  format,
  empty,
}: {
  value: ColorPickerValue;
  format: ColorPickerFormat;
  empty: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-5 w-5 shrink-0 overflow-hidden rounded border border-black/15"
      style={empty || format === "color-opacity" ? checkerStyle() : undefined}
    >
      {!empty && (
        <span className="absolute inset-0" style={swatchStyle(value, format)} />
      )}
    </span>
  );
}

function tupleToColor(tuple: RgbaTuple): RgbaColor {
  return { red: tuple[0], green: tuple[1], blue: tuple[2], alpha: tuple[3] };
}

export function ColorPicker({
  format,
  value,
  onChange,
  label,
  presets = [],
  allowEmpty = true,
  recentColors = [],
  onRecentColorsChange,
  compact = false,
  preserveFocusOnOpen = false,
  className,
  disabled,
  ...triggerProps
}: ColorPickerProps) {
  const generatedId = useId();
  const pickerLabel = label ?? formatLabel(format);
  const empty = isEmpty(value);
  const parsedValue = parseColor(value);
  const surfaceColor = parsedValue ?? EMPTY_SURFACE_COLOR;
  const normalizedPresets = useMemo(
    () =>
      presets
        .map((preset) => ({ ...preset, value: normalizeHex(preset.value) }))
        .filter((preset): preset is ColorPreset => Boolean(preset.value)),
    [presets],
  );
  const normalizedRecentColors = useMemo(
    () =>
      recentColors
        .map(normalizeHex)
        .filter((color): color is string => Boolean(color)),
    [recentColors],
  );

  const emitColor = useCallback(
    (color: RgbaColor) => {
      onChange(format === "color" ? formatHex(color) : formatRgba(color));
      if (onRecentColorsChange) {
        const nextHex = formatHex(color);
        onRecentColorsChange(
          [
            nextHex,
            ...normalizedRecentColors.filter((item) => item !== nextHex),
          ].slice(0, 8),
        );
      }
    },
    [format, normalizedRecentColors, onChange, onRecentColorsChange],
  );

  const handleCoreChange = useCallback(
    (tuple: RgbaTuple) => emitColor(tupleToColor(tuple)),
    [emitColor],
  );

  const emitOpacity = (nextValue: number) =>
    onChange(clamp(Math.round(nextValue), 0, 100));

  const selectPreset = (presetValue: string) => {
    const preset = parseColor(presetValue);
    if (!preset) return;
    emitColor({
      ...preset,
      alpha: format === "color-opacity" ? surfaceColor.alpha : 1,
    });
  };

  const pickerId = triggerProps.id ?? generatedId;
  const contentLabelId = `${pickerId}-content-label`;
  const contentClassName =
    "z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl outline-none";
  const coreValue = empty || typeof value !== "string" ? undefined : value;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          {...triggerProps}
          disabled={disabled}
          aria-label={triggerProps["aria-label"] ?? `${pickerLabel}选择器`}
          className={`inline-flex min-w-0 items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5 text-left text-sm text-foreground shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "h-8" : "min-h-9"} ${className ?? ""}`}
        >
          <ColorSwatch value={value} format={format} empty={empty} />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            {formatDisplayValue(value, format)}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            ⌄
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={contentClassName}
          sideOffset={6}
          aria-labelledby={contentLabelId}
          data-color-picker-content="true"
          onOpenAutoFocus={(event) => {
            if (preserveFocusOnOpen) event.preventDefault();
          }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id={contentLabelId} className="text-sm font-semibold">
                {pickerLabel}
              </h3>
              {allowEmpty && (
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onChange(null)}
                  disabled={disabled || empty}
                >
                  清除
                </button>
              )}
            </div>

            {format !== "opacity" ? (
                <ShadcnColorPicker
                  value={coreValue}
                  defaultValue="#808080"
                  empty={empty}
                  disabled={disabled}
                  onChange={handleCoreChange}
                className="gap-3"
              >
                <ShadcnColorPickerSelection className="h-40 w-full border border-black/10" />
                <div className="flex items-center gap-3">
                  <ShadcnColorPickerEyeDropper />
                  <div className="grid min-w-0 w-full gap-2">
                    <ShadcnColorPickerHue aria-label={`${pickerLabel}色相`} />
                    {format === "color-opacity" && (
                      <ShadcnColorPickerAlpha aria-label={`${pickerLabel}透明度`} />
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <ShadcnColorPickerOutput aria-label={`${pickerLabel}输入格式`} />
                  <ShadcnColorPickerFormat
                    inputLabelPrefix={pickerLabel}
                    showAlpha={format === "color-opacity"}
                  />
                </div>
                {normalizedPresets.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      预设颜色
                    </p>
                    <div
                      className="grid grid-cols-8 gap-1.5"
                      role="list"
                      aria-label="预设颜色"
                    >
                      {normalizedPresets.map((preset) => (
                        <button
                          type="button"
                          key={`${preset.label}-${preset.value}`}
                          data-color-picker-preset={preset.value}
                          title={`${preset.label} ${preset.value}`}
                          aria-label={`选择预设颜色：${preset.label}`}
                          className="h-7 w-7 rounded-md border border-black/15 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ backgroundColor: preset.value }}
                          onClick={() => selectPreset(preset.value)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {normalizedRecentColors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      最近使用
                    </p>
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="list"
                      aria-label="最近使用颜色"
                    >
                      {normalizedRecentColors.map((recentColor) => (
                        <button
                          type="button"
                          key={recentColor}
                          aria-label={`选择最近使用颜色：${recentColor}`}
                          className="h-6 w-6 rounded-md border border-black/15 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ backgroundColor: recentColor }}
                          onClick={() => selectPreset(recentColor)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </ShadcnColorPicker>
            ) : (
              <div className="space-y-2">
                <Slider.Root
                  value={[typeof value === "number" ? clamp(value, 0, 100) : 100]}
                  min={0}
                  max={100}
                  step={1}
                  disabled={disabled}
                  aria-label={`${pickerLabel}滑块`}
                  className="flex h-5 w-full touch-none items-center"
                  onValueChange={([nextValue]) => emitOpacity(nextValue ?? 0)}
                >
                  <Slider.Track className="relative h-1.5 grow rounded-full bg-muted">
                    <Slider.Range className="absolute h-full rounded-full bg-primary" />
                  </Slider.Track>
                  <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-background bg-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </Slider.Root>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={typeof value === "number" ? clamp(value, 0, 100) : ""}
                    placeholder="未设置"
                    aria-label={`${pickerLabel}数值`}
                    disabled={disabled}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 pr-7 text-right font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => {
                      if (event.target.value === "") return;
                      const nextValue = Number(event.target.value);
                      if (Number.isFinite(nextValue)) emitOpacity(nextValue);
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground"
                  >
                    %
                  </span>
                </div>
              </div>
            )}

            <p className="text-[11px] leading-4 text-muted-foreground">
              {format === "opacity"
                ? "留空表示未设置；0% 表示完全透明。"
                : "支持色板、色相、吸管和 HEX/RGB/CSS/HSL 格式切换。清除后为无色透明。"}
            </p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export { ShadcnColorPicker };
