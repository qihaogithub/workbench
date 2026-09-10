"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ConfigColorFormat, ConfigDefinitionDraft, ConfigDefinitionKind } from "@workbench/shared/demo/config-schema-definition";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ColorDefinitionFields } from "./ColorDefinitionFields";
import { ImageDimensionRuleEditor } from "./ImageDimensionRuleEditor";

export type ConfigItemEditorMode = "create" | "edit";
export type ConfigItemEditorScope = "page" | "project";

/** The selected plan is presentation state only; execution remains with the caller. */
export type ConfigItemApplyPlan =
  | "schema_only"
  | "bind_and_apply"
  | "ai_required"
  | "unsupported";

export interface ConfigItemApplyPlanSnapshot {
  kind: ConfigItemApplyPlan;
  title?: string;
  description?: string;
}

export interface ConfigItemEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ConfigItemEditorMode;
  scope: ConfigItemEditorScope;
  /** Fully controlled field draft. The implementation deliberately never writes schema or page code. */
  draft: ConfigDefinitionDraft;
  onDraftChange: (draft: ConfigDefinitionDraft) => void;
  /** Limit available field types when the caller can only safely apply a subset. */
  allowedKinds?: readonly ConfigDefinitionKind[];
  /** Optional caller-owned controls for selecting the source property being configured. */
  formPrefix?: ReactNode;
  /** Callers without a required-field persistence contract can hide this control. */
  showRequired?: boolean;
  /** Allows a scoped caller to use its domain terminology (for example, "分类"). */
  groupLabel?: string;
  applyPlan?: ConfigItemApplyPlanSnapshot;
  defaultValueEditor?: ReactNode;
  allowedColorFormats?: readonly ConfigColorFormat[];
  readOnly?: boolean;
  busy?: boolean;
  onSave?: () => void;
  onApply?: () => void;
}

const KINDS: Array<[ConfigDefinitionKind, string]> = [
  ["text", "短文本"], ["textarea", "长文本"], ["richtext", "富文本"],
  ["number", "数字"], ["integer", "整数"], ["boolean", "布尔"],
  ["enum", "枚举"], ["color", "颜色"], ["image", "单图"], ["images", "多图"], ["video", "视频"],
];

const ENUM_WIDGETS = [
  ["select", "下拉选择"],
  ["radio", "单选按钮"],
  ["segmented", "分段控件"],
] as const;

const ACCEPT_OPTIONS = [
  ["image/*", "全部图片"],
  ["image/png,image/jpeg", "PNG / JPEG"],
  ["image/png", "PNG"], ["image/jpeg", "JPEG"],
  ["image/webp", "WebP"], ["image/gif", "GIF"],
] as const;
const BYTES_PER_MB = 1024 * 1024;

const PLAN_COPY: Record<ConfigItemApplyPlan, Required<ConfigItemApplyPlanSnapshot>> = {
  schema_only: {
    kind: "schema_only", title: "仅保存配置", description: "此项只更新字段定义，不改动页面内容。",
  },
  bind_and_apply: {
    kind: "bind_and_apply", title: "可直接应用", description: "保存字段后，可将当前属性的确定性改动直接应用到页面。",
  },
  ai_required: {
    kind: "ai_required", title: "需要 AI 应用", description: "保存字段后，由 AI 生成并应用页面改动。",
  },
  unsupported: {
    kind: "unsupported", title: "当前不支持", description: "此页面类型暂不能把该属性设为配置项。",
  },
};

function isImage(kind: ConfigDefinitionKind) {
  return kind === "image" || kind === "images";
}

function planActionLabel(plan?: ConfigItemApplyPlanSnapshot) {
  switch (plan?.kind) {
    case "bind_and_apply": return "保存并应用";
    case "ai_required": return "保存并交给 AI";
    default: return "保存字段";
  }
}

/**
 * Shared presentation shell for adding/editing exactly one configuration field.
 * It intentionally owns neither schema mutations nor HTML/React/AI apply logic.
 */
export function ConfigItemEditorDialog({
  open, onOpenChange, mode, scope, draft, onDraftChange, applyPlan,
  allowedKinds, formPrefix, showRequired = true, groupLabel = "分组",
  defaultValueEditor, allowedColorFormats, readOnly = false, busy = false, onSave, onApply,
}: ConfigItemEditorDialogProps) {
  const plan = { ...PLAN_COPY[applyPlan?.kind ?? "schema_only"], ...applyPlan };
  const update = (patch: Partial<ConfigDefinitionDraft>) => onDraftChange({ ...draft, ...patch });
  const imageField = isImage(draft.kind);
  const [dimensionValidity, setDimensionValidity] = useState({ width: true, height: true });
  const updateDimensionValidity = useCallback((axis: "width" | "height", valid: boolean) => {
    setDimensionValidity((current) => current[axis] === valid ? current : { ...current, [axis]: valid });
  }, []);
  const dimensionsValid = !imageField || (dimensionValidity.width && dimensionValidity.height);

  useEffect(() => {
    setDimensionValidity({ width: true, height: true });
  }, [draft.key, draft.kind]);
  const canApply = !!onApply && plan.kind !== "unsupported";
  const kindOptions = allowedKinds
    ? KINDS.filter(([kind]) => allowedKinds.includes(kind))
    : KINDS;
  const kindLocked = kindOptions.length <= 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] max-w-2xl flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
          <DialogTitle>{mode === "create" ? "添加配置项" : "编辑配置项"}</DialogTitle>
          <DialogDescription>
            {scope === "page" ? "本页配置" : "项目级共享配置"} · 字段说明请在设计规范中维护。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {formPrefix}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              名称
              <Input value={draft.title} onChange={(event) => update({ title: event.target.value })} disabled={readOnly} autoFocus={mode === "create"} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              {groupLabel}
              <Input value={draft.group ?? ""} onChange={(event) => update({ group: event.target.value || undefined })} disabled={readOnly} placeholder="未分组" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              类型
              <Select value={draft.kind} onValueChange={(kind) => update({
                kind: kind as ConfigDefinitionKind,
                ...(kind === "color" ? { colorFormat: draft.colorFormat ?? "color", default: null } : {}),
              })} disabled={readOnly || kindLocked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{kindOptions.map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            {showRequired && <div className="flex h-10 items-center justify-between self-end rounded-md border px-3">
              <span className="text-sm font-medium">必填</span>
              <Switch checked={!!draft.required} onCheckedChange={(required) => update({ required })} disabled={readOnly} aria-label="必填" />
            </div>}
          </div>

          {draft.kind === "enum" && <div className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              枚举选项（每行一项）
              <Textarea value={(draft.enum ?? []).join("\n")} onChange={(event) => update({ enum: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} disabled={readOnly} />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              展示控件
              <Select value={draft.enumWidget ?? "select"} onValueChange={(enumWidget) => update({ enumWidget: enumWidget as NonNullable<ConfigDefinitionDraft["enumWidget"]> })} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENUM_WIDGETS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <span className="block text-xs font-normal text-muted-foreground">选项较少且需要快速切换时，可使用单选按钮或分段控件。</span>
            </label>
          </div>}

          {draft.kind === "color" && (
            <ColorDefinitionFields
              draft={draft}
              onChange={update}
              readOnly={readOnly}
              allowedFormats={allowedColorFormats}
            />
          )}

          {imageField && <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium">格式限制
              <Select value={draft.accept || "image/*"} onValueChange={(accept) => update({ accept })} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACCEPT_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">文件大小上限（MB）<Input type="number" min="0" step="0.1" value={draft.maxSize === undefined ? "" : draft.maxSize / BYTES_PER_MB} onChange={(event) => update({ maxSize: event.target.value === "" ? undefined : Number(event.target.value) * BYTES_PER_MB })} disabled={readOnly} /></label>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <ImageDimensionRuleEditor axis="W" rule={draft.widthRule} onChange={(widthRule) => update({ widthRule })} onValidityChange={(valid) => updateDimensionValidity("width", valid)} readOnly={readOnly} />
                <ImageDimensionRuleEditor axis="H" rule={draft.heightRule} onChange={(heightRule) => update({ heightRule })} onValidityChange={(valid) => updateDimensionValidity("height", valid)} readOnly={readOnly} />
              </div>
            </div>
          </div>}

          <section className="space-y-2" aria-label="默认值">
            <p className="text-sm font-semibold">默认值</p>
            {defaultValueEditor}
          </section>

          <section className="rounded-lg border p-4" aria-live="polite">
            <p className="text-sm font-semibold">{plan.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
          </section>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <div className="flex gap-2">
            {onSave && <Button type="button" variant={canApply ? "outline" : "default"} onClick={onSave} disabled={busy || readOnly || plan.kind === "unsupported" || !dimensionsValid}>{busy ? "保存中…" : "保存字段"}</Button>}
            {canApply && <Button type="button" onClick={onApply} disabled={busy || readOnly || !dimensionsValid}>{planActionLabel(plan)}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function hasConfigItemEditorConstraint(draft: ConfigDefinitionDraft) {
  return Boolean(draft.widthRule || draft.heightRule);
}
