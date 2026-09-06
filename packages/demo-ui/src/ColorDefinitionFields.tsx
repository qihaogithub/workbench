"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@workbench/color-picker";
import type {
  ConfigColorFormat,
  ConfigColorPreset,
  ConfigDefinitionDraft,
} from "@workbench/shared/demo/config-schema-definition";

const COLOR_FORMATS: Array<[ConfigColorFormat, string]> = [
  ["color", "颜色"],
  ["opacity", "透明度"],
  ["color-opacity", "颜色 + 透明度"],
];

export interface ColorDefinitionFieldsProps {
  draft: ConfigDefinitionDraft;
  onChange: (patch: Partial<ConfigDefinitionDraft>) => void;
  readOnly?: boolean;
  allowedFormats?: readonly ConfigColorFormat[];
}

export function ColorDefinitionFields({ draft, onChange, readOnly = false, allowedFormats }: ColorDefinitionFieldsProps) {
  const format = draft.colorFormat ?? "color";
  const formatOptions = allowedFormats
    ? COLOR_FORMATS.filter(([value]) => allowedFormats.includes(value))
    : COLOR_FORMATS;
  const presets = draft.colorPresets ?? [];
  const updatePreset = (index: number, patch: Partial<ConfigColorPreset>) => {
    onChange({
      colorPresets: presets.map((preset, presetIndex) => presetIndex === index ? { ...preset, ...patch } : preset),
    });
  };

  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-semibold">颜色配置</legend>
      <label className="block space-y-1.5 text-sm font-medium">
        值类型
        <select
          value={format}
          disabled={readOnly}
          aria-label="颜色值类型"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => onChange({
            colorFormat: event.target.value as ConfigColorFormat,
            default: null,
            ...(event.target.value === "opacity" ? { colorPresets: undefined } : {}),
          })}
        >
          {formatOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <p className="text-xs leading-5 text-muted-foreground">
        {format === "opacity"
          ? "保存为 0–100 的整数；留空表示未设置，0% 表示完全透明。"
          : format === "color-opacity"
            ? "保存为可直接用于 CSS 的 rgba(...)；清除后为空值。"
            : "保存为 #RRGGBB；清除后为空值。"}
      </p>
      {format !== "opacity" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">预设颜色</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={readOnly}
              onClick={() => onChange({
                colorPresets: [...presets, { label: "颜色 " + (presets.length + 1), value: "#000000" }],
              })}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />添加预设
            </button>
          </div>
          {presets.length === 0 ? (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">未设置预设颜色。</p>
          ) : (
            <div className="space-y-2">
              {presets.map((preset, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,132px)_32px] items-center gap-2">
                  <Input
                    value={preset.label}
                    aria-label={"预设颜色 " + (index + 1) + " 名称"}
                    disabled={readOnly}
                    onChange={(event) => updatePreset(index, { label: event.target.value })}
                    placeholder="名称"
                  />
                  <ColorPicker
                    format="color"
                    value={preset.value}
                    label={"预设颜色 " + (index + 1)}
                    allowEmpty={false}
                    compact
                    disabled={readOnly}
                    className="w-full"
                    onChange={(value) => {
                      if (typeof value === "string") updatePreset(index, { value });
                    }}
                  />
                  <button
                    type="button"
                    aria-label={"删除预设颜色 " + (index + 1)}
                    disabled={readOnly}
                    className="inline-flex h-9 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    onClick={() => onChange({ colorPresets: presets.filter((_, presetIndex) => presetIndex !== index) })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
