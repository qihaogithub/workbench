"use client";

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "./utils";
import { FileUploadWidget } from "./widgets";
import { ImageListWidget, type ImageItem } from "./ImageListWidget";
import { ArrayFieldGroup } from "./ArrayFieldGroup";
import { MultiSelect } from "./MultiSelect";
import { CascadeSelect } from "./CascadeSelect";
import type { FieldConfig } from "./schema-parser";
import { createContext, useContext, useMemo } from "react";
import { Check, Edit3, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DocumentEditor,
  type MarkdownReferenceClickHandler,
  type MarkdownReferenceContext,
  type MarkdownReferenceProvider,
} from "./DocumentEditor";
import type { DesignSpecEntryLink, ImageConfigScope, WhiteboardLauncher } from "./types";
import { ImageInputActions } from "./ImageInputActions";

export interface PositionFieldEntry {
  instanceId: string;
  posKey: string;
  fieldPath: string;
  currentValue: { x: number; y: number };
  domOccurrence?: number;
  containerSize?: { width: number; height: number };
}

export interface PositionConfigContextValue {
  registerPositionField(entry: PositionFieldEntry): () => void;
  requestPositionEdit(instanceId: string): void;
  exitPositionEdit(): void;
  activePositionId: string | null;
  dimming: boolean;
  onToggleDimming?: () => void;
}

export const PositionConfigContext = createContext<PositionConfigContextValue | null>(null);

export function usePositionConfig(): PositionConfigContextValue | null {
  return useContext(PositionConfigContext);
}

const SPINE_PACKAGE_ACCEPT = ".zip,.zip.flutter,application/zip,application/x-zip-compressed";

function mergeSpinePackageAccept(value: unknown): string {
  const configured = typeof value === "string" ? value.trim() : "";
  return configured.includes(".zip.flutter")
    ? configured
    : [configured, SPINE_PACKAGE_ACCEPT].filter(Boolean).join(",");
}

function normalizeImageDefaults(raw: unknown): ImageItem[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      typeof item === "string" ? { url: item } : { url: (item as any).url ?? "" }
    );
  }
  if (typeof raw === "string") {
    return [{ url: raw }];
  }
  return undefined;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  sessionId,
  readonly,
  designSpecEntries = [],
  onEditDesignSpec,
  onOpenDesignSpec,
  onEditConfigDefinition,
  embedded,
  fieldPath,
  defaultValueOverride,
  positionInstanceId,
  positionDomOccurrence,
  imageConfigScope,
  pageId,
  onLaunchWhiteboard,
  referenceContext,
  referenceProvider,
  onReferenceClick,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  sessionId?: string;
  readonly?: boolean;
  designSpecEntries?: DesignSpecEntryLink[];
  onEditDesignSpec?: (docId: string, entryId: string) => void;
  onOpenDesignSpec?: (spec: DesignSpecEntryLink, fieldTitle: string, anchor?: { top: number; bottom: number }) => void;
  onEditConfigDefinition?: (fieldKey: string, field: FieldConfig) => void;
  embedded?: boolean;
  fieldPath?: string;
  /** Parent object-array defaults are resolved at the current array index. */
  defaultValueOverride?: unknown;
  positionInstanceId?: string;
  positionDomOccurrence?: number;
  imageConfigScope?: ImageConfigScope;
  pageId?: string;
  onLaunchWhiteboard?: WhiteboardLauncher;
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
}) {
  const effectiveDefault = defaultValueOverride !== undefined
    ? defaultValueOverride
    : field.default;
  const isSingleImageField = field.format === "image" || field.uiWidget === "image";
  const isImageListField = field.uiWidget === "imageList"
    || field.type === "imageList"
    || (field.type === "array" && field.itemsFormat === "image");
  const isInlineControl =
    field.type === "boolean" ||
    field.type === "number" ||
    field.type === "integer" ||
    field.type === "color" ||
    field.format === "color";
  const isImageUploadControl =
    field.uiWidget === "file" ||
    field.uiWidget === "image" ||
    field.uiWidget === "imageList" ||
    field.format === "image" ||
    field.format === "file" ||
    field.format === "video" ||
    field.format === "spine";

  const renderInput = () => {
    if (field.format === "spine") {
      return (
        <FileUploadWidget
          value={value as any}
          onChange={onChange}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={{ ...(field.uiOptions as any), assetKind: "spine", accept: mergeSpinePackageAccept(field.uiOptions?.accept), pageId, configKey: field.key }}
        />
      );
    }

    if (field.uiWidget === "file" || field.uiWidget === "image" || field.format === "video") {
      const upload = (
        <FileUploadWidget
          value={value as any}
          onChange={onChange}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={{ ...(field.uiOptions as any), ...(field.format === "video" ? { mediaType: "video", accept: field.uiOptions?.accept || "video/mp4,video/webm" } : {}) }}
          defaultValue={
            field.format === "video"
              ? (effectiveDefault as any)
              : typeof effectiveDefault === "string"
                ? effectiveDefault
                : undefined
          }
          onWhiteboard={!readonly && isSingleImageField && onLaunchWhiteboard && fieldPath ? () => onLaunchWhiteboard({ scope: imageConfigScope, pageId, fieldPath, ...(typeof value === "string" ? { currentValue: value } : {}) }) : undefined}
        />
      );

      return upload;
    }

    if (field.uiWidget === "imageList") {
      const items = (value as Array<string | ImageItem>) || [];
      const imageItems: ImageItem[] = items.map((item) => {
        if (typeof item === "string") {
          return { url: item };
        }
        return item as ImageItem;
      });

      const maxItems =
        typeof field.uiOptions?.maxItems === "number"
          ? (field.uiOptions.maxItems as number)
          : 20;

      return (
        <ImageListWidget
          value={imageItems}
          onChange={(newItems) => {
            if (field.itemsType === "string") {
              onChange((newItems as ImageItem[]).map((item) => item.url));
            } else {
              onChange(newItems);
            }
          }}
          maxItems={maxItems}
          title={field.title}
          sessionId={sessionId}
          options={field.uiOptions as any}
          defaultValue={normalizeImageDefaults(effectiveDefault)}
          renderItemActions={
            !readonly && onLaunchWhiteboard && fieldPath
              ? (item, index, onUpload) => (
                  <ImageInputActions
                    onUpload={onUpload}
                    onWhiteboard={onLaunchWhiteboard ? () => onLaunchWhiteboard({ scope: imageConfigScope, pageId, fieldPath, listItem: { index, url: item.url } }) : undefined}
                  />
                )
              : undefined
          }
        />
      );
    }

    if (field.uiWidget === "multiselect") {
      const enumValues = field.enum as string[] | undefined;
      const options = (enumValues || []).map((v, i) => ({
        value: v,
        label: field.enumNames?.[i] ?? v,
      }));
      return (
        <MultiSelect
          options={options}
          value={(value as string[]) || []}
          onChange={(v) => onChange(v)}
        />
      );
    }

    if (field.uiWidget === "cascade") {
      return (
        <CascadeSelect
          options={field.options || []}
          value={(value as string[]) || []}
          onChange={(v) => onChange(v)}
        />
      );
    }

    if (field.format === "image" || field.format === "file") {
      const upload = (
        <FileUploadWidget
          value={value as string}
          onChange={onChange}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={field.uiOptions as any}
          defaultValue={
            typeof effectiveDefault === "string" ? effectiveDefault : undefined
          }
          onWhiteboard={!readonly && isSingleImageField && onLaunchWhiteboard && fieldPath ? () => onLaunchWhiteboard({ scope: imageConfigScope, pageId, fieldPath, ...(typeof value === "string" ? { currentValue: value } : {}) }) : undefined}
        />
      );

      return upload;
    }

    if (field.format === "color" || field.type === "color") {
      return (
        <div className="ml-auto flex h-7 w-20 items-center gap-1 rounded-lg bg-black/40 px-1.5 py-1">
          <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px]">
            <input
              type="color"
              value={(value as string) || "#000000"}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`${field.title}颜色选择器`}
              className="size-full cursor-pointer appearance-none border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[4px] [&::-webkit-color-swatch]:border-0"
            />
          </span>
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            aria-label={`${field.title}色值`}
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-sm text-foreground shadow-none focus-visible:ring-0"
          />
        </div>
      );
    }

    if (field.type === "array") {
      if (field.oneOf || field.children) {
        return (
          <ArrayFieldGroup
            field={field}
            value={(value as Record<string, unknown>[]) || []}
            onChange={(newValue) => onChange(newValue)}
            sessionId={sessionId}
            readonly={readonly}
            fieldPath={fieldPath}
            defaultValueOverride={effectiveDefault}
            imageConfigScope={imageConfigScope}
            pageId={pageId}
            onLaunchWhiteboard={onLaunchWhiteboard}
          />
        );
      }

      if (field.itemsType === "object") {
        return (
          <Textarea
            value={JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value));
              } catch {
              }
            }}
            placeholder={`请输入 ${field.title} 的 JSON 数据`}
            rows={6}
            className="resize-y min-h-[100px] font-mono text-xs"
          />
        );
      }

      const items = (value as Array<string | ImageItem>) || [];
      const imageItems: ImageItem[] = items.map((item) => {
        if (typeof item === "string") {
          return { url: item };
        }
        return item as ImageItem;
      });

      const maxItems =
        typeof field.uiOptions?.maxItems === "number"
          ? (field.uiOptions.maxItems as number)
          : 20;

      return (
        <ImageListWidget
          value={imageItems}
          onChange={(newItems) => {
            if (field.itemsType === "string" || !field.itemsType) {
              onChange((newItems as ImageItem[]).map((item) => item.url));
            } else {
              onChange(newItems);
            }
          }}
          maxItems={maxItems}
          title={field.title}
          sessionId={sessionId}
          options={field.uiOptions as any}
          defaultValue={normalizeImageDefaults(effectiveDefault)}
          renderItemActions={
            isImageListField && !readonly && onLaunchWhiteboard && fieldPath
              ? (item, index, onUpload) => (
                  <ImageInputActions
                    onUpload={onUpload}
                    onWhiteboard={() => onLaunchWhiteboard({
                      scope: imageConfigScope,
                      pageId,
                      fieldPath,
                      listItem: { index, url: item.url },
                    })}
                  />
                )
              : undefined
          }
        />
      );
    }

    if (field.type === "boolean") {
      return (
        <div className="flex items-center">
          <Switch
            checked={(value as boolean) || false}
            onCheckedChange={(checked: boolean) => onChange(checked)}
            className="ml-auto h-[21px] w-[39px] border-0 shadow-none data-[state=checked]:bg-[#575765] data-[state=unchecked]:bg-[#3a3a40] [&>span]:size-[17px] [&>span]:data-[state=checked]:translate-x-[18px]"
          />
        </div>
      );
    }

    if (field.type === "number" || field.type === "integer") {
      if (field.minimum !== undefined && field.maximum !== undefined) {
        const currentValue = (value as number) ?? field.default ?? field.minimum;

        return (
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <Input
              type="number"
              value={currentValue.toString()}
              onChange={(event) => {
                const parsed = field.type === "integer"
                  ? parseInt(event.target.value, 10)
                  : parseFloat(event.target.value);
                if (!Number.isNaN(parsed)) onChange(parsed);
              }}
              min={field.minimum}
              max={field.maximum}
              className="h-7 w-[60px] shrink-0 border-0 bg-black/40 px-1.5 text-center font-mono text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
            />
            <Slider
              value={[currentValue]}
              min={field.minimum}
              max={field.maximum}
              step={field.type === "integer" ? 1 : 0.1}
              onValueChange={(values: number[]) => onChange(values[0])}
              className="min-w-[72px] flex-1"
            />
          </div>
        );
      }

      return (
        <Input
          type="number"
          value={(value as number)?.toString() || ""}
          onChange={(e) =>
            onChange(
              field.type === "integer"
                ? parseInt(e.target.value)
                : parseFloat(e.target.value),
            )
          }
          min={field.minimum}
          max={field.maximum}
          className="ml-auto h-7 w-[60px] border-0 bg-black/40 px-1.5 text-center font-mono text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        />
      );
    }

    if (field.enum && field.enum.length > 0) {
      const currentValue = value || field.default || field.enum[0];
      const currentIndex = field.enum.indexOf(currentValue);
      const displayValue =
        field.enumNames?.[currentIndex] || currentValue?.toString();

      return (
        <Select
          value={currentValue?.toString() || undefined}
          onValueChange={(val: string) => {
            const index = field.enum!.indexOf(val as any);
            onChange(index >= 0 ? field.enum![index] : val);
          }}
        >
          <SelectTrigger className="h-9 rounded-lg border-0 bg-black/40 px-3 text-sm shadow-none focus:ring-2 focus:ring-ring">
            <SelectValue placeholder="请选择">{displayValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.enum
              .filter((item) => {
                const v = item?.toString();
                return v !== undefined && v !== "";
              })
              .map((item, idx) => {
                const itemValue = item!.toString();
                return (
                  <SelectItem key={idx} value={itemValue}>
                    {field.enumNames?.[idx] || itemValue}
                  </SelectItem>
                );
              })}
          </SelectContent>
        </Select>
      );
    }

    if (field.type === "richtext") {
      return (
        <RichTextInput
          value={value}
          onChange={onChange}
          field={field}
          readonly={readonly}
          referenceContext={referenceContext}
          referenceProvider={referenceProvider}
          onReferenceClick={onReferenceClick}
          scope={imageConfigScope}
          pageId={pageId}
        />
      );
    }

    if (field.type === "text") {
      return (
        <Textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.title}`}
          rows={3}
          className="h-24 min-h-24 resize-y rounded-lg border-0 bg-black/40 px-3 py-2.5 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        />
      );
    }

    if (field.maxLength && field.maxLength > 100) {
      return (
        <Textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.title}`}
          maxLength={field.maxLength}
          rows={3}
          className="h-24 min-h-24 resize-none rounded-lg border-0 bg-black/40 px-3 py-2.5 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        />
      );
    }

    if (field.positionable) {
      return (
        <PositionFieldInput
          field={field}
          value={value as { x: number; y: number } | undefined}
          onChange={onChange}
          fieldPath={fieldPath}
          instanceId={positionInstanceId}
          domOccurrence={positionDomOccurrence}
        />
      );
    }

    return (
      <Input
        type="text"
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`请输入${field.title}`}
        maxLength={field.maxLength}
        className="h-9 rounded-lg border-0 bg-black/40 px-3 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
      />
    );
  };

  const linkedSpecs = designSpecEntries.filter(
    (entry) => entry.fieldKey === field.key && entry.markdown.trim(),
  );
  const imageDimensions = formatImageDimensions(field.uiOptions);
  const showImageHint =
    imageDimensions !== "—" &&
    (field.uiWidget === "file" ||
      field.uiWidget === "image" ||
      field.uiWidget === "imageList" ||
      field.format === "image" ||
      field.format === "file");
  const fieldLabel = (
    <>
      {field.title}
      {field.required && <span className="ml-0.5 text-red-500">*</span>}
    </>
  );

  return (
    <div
      className={cn(
        "w-full rounded-lg",
        isInlineControl
          ? "flex min-h-7 items-center gap-3"
          : cn("flex flex-col", isImageUploadControl ? "gap-1.5" : "gap-3"),
      )}
    >
      {field.title !== "" && (
      <div className={cn("flex min-w-0 items-center gap-1", isInlineControl ? "min-w-0 flex-1" : "w-full")}>
          <div className="min-w-0 flex-1">
            {linkedSpecs.length > 0 && onOpenDesignSpec ? (
              <div className="flex min-w-0 items-center gap-2">
                {onEditConfigDefinition && !readonly ? (
                  <button
                    type="button"
                    onClick={() => onEditConfigDefinition(field.key, field)}
                    className="min-w-0 max-w-full truncate rounded-sm text-left text-sm font-medium text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`编辑配置项：${field.title}`}
                  >
                    {fieldLabel}
                  </button>
                ) : <Label className="min-w-0 truncate text-sm font-medium text-foreground/70">{fieldLabel}</Label>}
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    if (rect.width || rect.height) {
                      onOpenDesignSpec(linkedSpecs[0], field.title, { top: rect.top, bottom: rect.bottom });
                    } else {
                      onOpenDesignSpec(linkedSpecs[0], field.title);
                    }
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-foreground/55 transition-colors hover:bg-foreground/[0.14] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`查看设计规范：${field.title}`}
                >
                  <FileText className="h-3 w-3" />规范
                </button>
              </div>
            ) : onEditConfigDefinition && !readonly ? (
              <button
                type="button"
                onClick={() => onEditConfigDefinition(field.key, field)}
                className="min-w-0 max-w-full truncate rounded-sm text-left text-sm font-medium text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`编辑配置项：${field.title}`}
              >
                {fieldLabel}
              </button>
            ) : (
              <Label className="block min-w-0 truncate text-sm font-medium text-foreground/70">
                {fieldLabel}
              </Label>
            )}
            {showImageHint && <p className="mt-0.5 truncate text-[13px] font-medium text-foreground/30">{imageDimensions}</p>}
          </div>
        </div>
      )}
      <div className={cn("min-w-0", isInlineControl ? "flex-1" : "w-full")}>
        {renderInput()}
      </div>
    </div>
  );
}

type ImageRule = { operator?: string; value?: number };

function readImageRule(options: Record<string, unknown> | undefined, key: "widthRule" | "heightRule"): ImageRule | undefined {
  const value = options?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const rule = value as Record<string, unknown>;
  return typeof rule.value === "number" && Number.isFinite(rule.value) && typeof rule.operator === "string"
    ? { operator: rule.operator, value: rule.value }
    : undefined;
}

export function formatImageAccept(options?: Record<string, unknown>): string {
  const accept = typeof options?.accept === "string" ? options.accept.trim() : "";
  if (!accept || accept === "image/*" || accept === "*/*") return "不限";
  const labels = accept.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    const raw = item.includes("/") ? item.split("/").pop() ?? item : item.replace(/^\./, "");
    return raw.toLowerCase() === "jpeg" ? "jpg" : raw.toLowerCase();
  });
  return Array.from(new Set(labels)).join("/") || "不限";
}

export function formatImageDimensions(options?: Record<string, unknown>): string {
  const width = readImageRule(options, "widthRule");
  const height = readImageRule(options, "heightRule");
  const rules = [width && `W ${width.operator} ${width.value}px`, height && `H ${height.operator} ${height.value}px`].filter(Boolean);
  return rules.length ? rules.join(" · ") : "—";
}

function PositionFieldInput({
  field,
  value,
  onChange,
  fieldPath,
  instanceId: providedInstanceId,
  domOccurrence,
}: {
  field: FieldConfig;
  value: { x: number; y: number } | undefined;
  onChange: (value: unknown) => void;
  fieldPath?: string;
  instanceId?: string;
  domOccurrence?: number;
}) {
  const posConfig = usePositionConfig();
  const pos = value || { x: 0, y: 0 };
  const posKey = field.positionable?.key || field.key;
  const instanceId = providedInstanceId ?? fieldPath ?? posKey;
  const containerWidth = field.positionable?.size?.width ?? 0;
  const containerHeight = field.positionable?.size?.height ?? 0;

  useEffect(() => {
    if (!posConfig || !fieldPath) return;
    return posConfig.registerPositionField({
      instanceId,
      posKey,
      fieldPath,
      currentValue: pos,
      domOccurrence,
      containerSize: field.positionable?.size,
    });
  }, [posConfig, instanceId, posKey, fieldPath, domOccurrence, pos.x, pos.y, field.positionable?.size]);

  const handleCoordChange = (axis: "x" | "y", val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return;
    const maxVal = axis === "x" ? containerWidth : containerHeight;
    const bounded = containerWidth > 0 || containerHeight > 0
      ? Math.max(0, maxVal > 0 ? Math.min(num, maxVal) : num)
      : num;
    onChange({ ...pos, [axis]: bounded });
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground/60 w-3">X</span>
        <Input
          type="number"
          value={pos.x}
          onChange={(e) => handleCoordChange("x", e.target.value)}
          className="h-6 w-16 text-xs px-1.5"
          min={0}
          max={containerWidth > 0 ? containerWidth : undefined}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground/60 w-3">Y</span>
        <Input
          type="number"
          value={pos.y}
          onChange={(e) => handleCoordChange("y", e.target.value)}
          className="h-6 w-16 text-xs px-1.5"
          min={0}
          max={containerHeight > 0 ? containerHeight : undefined}
        />
      </div>
      {posConfig && (() => {
        const isEditing = posConfig.activePositionId === instanceId;
        return (
          <>
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-2 shrink-0"
              onClick={() => isEditing ? posConfig.exitPositionEdit() : posConfig.requestPositionEdit(instanceId)}
            >
              {isEditing ? <Check className="h-3 w-3 mr-1" /> : <Pencil className="h-3 w-3 mr-1" />}
              {isEditing ? "完成" : "拖动"}
            </Button>
            {isEditing && posConfig.onToggleDimming && (
              <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer shrink-0 select-none">
                <input
                  type="checkbox"
                  checked={posConfig.dimming}
                  onChange={posConfig.onToggleDimming}
                  className="h-3 w-3"
                />
                透明
              </label>
            )}
          </>
        );
      })()}
    </div>
  );
}

function RichTextInput({
  value,
  onChange,
  field,
  readonly,
  referenceContext,
  referenceProvider,
  onReferenceClick,
  scope,
  pageId,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  field: FieldConfig;
  readonly?: boolean;
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  scope?: "project" | "page";
  pageId?: string;
}) {
  const [open, setOpen] = useState(false);
  const richTextReferenceContext = referenceContext && scope
    ? {
        ...referenceContext,
        source: {
          kind: "richtext-field" as const,
          projectId: referenceContext.source.projectId,
          workspaceId: referenceContext.source.workspaceId,
          scope,
          ...(scope === "page" && pageId ? { pageId } : {}),
          fieldKey: field.key,
          jsonPointer: `/${field.key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
        },
      }
    : undefined;

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={readonly}
      >
        <Edit3 className="h-3 w-3 mr-1" />
        编辑
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{field.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <DocumentEditor
              value={(value as string) || ""}
              onChange={(v) => onChange(v)}
              readOnly={readonly}
              referenceContext={richTextReferenceContext}
              referenceProvider={referenceProvider}
              onReferenceClick={onReferenceClick}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
