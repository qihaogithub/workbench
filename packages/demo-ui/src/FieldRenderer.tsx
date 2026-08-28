"use client";

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEffect, useRef, useState } from "react";
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
import { Check, ChevronDown, Edit3, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentEditor } from "./DocumentEditor";
import { PageRequirements } from "./PageRequirements";
import type { DesignSpecEntryLink } from "./types";

export interface PositionFieldEntry {
  posKey: string;
  fieldPath: string;
  currentValue: { x: number; y: number };
  containerSize?: { width: number; height: number };
}

export interface PositionConfigContextValue {
  registerPositionField(entry: PositionFieldEntry): () => void;
  requestPositionEdit(): void;
  exitPositionEdit(): void;
  positionEditActive: boolean;
  dimming: boolean;
  onToggleDimming?: () => void;
}

export const PositionConfigContext = createContext<PositionConfigContextValue | null>(null);

export function usePositionConfig(): PositionConfigContextValue | null {
  return useContext(PositionConfigContext);
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
  onEditConfigDefinition,
  embedded,
  fieldPath,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  sessionId?: string;
  readonly?: boolean;
  designSpecEntries?: DesignSpecEntryLink[];
  onEditDesignSpec?: (docId: string, entryId: string) => void;
  onEditConfigDefinition?: (fieldKey: string, field: FieldConfig) => void;
  embedded?: boolean;
  fieldPath?: string;
}) {
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
    field.format === "video";

  const renderInput = () => {
    if (field.uiWidget === "file" || field.uiWidget === "image" || field.format === "video") {
      return (
        <FileUploadWidget
          value={value as any}
          onChange={onChange}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={{ ...(field.uiOptions as any), ...(field.format === "video" ? { mediaType: "video", accept: field.uiOptions?.accept || "video/mp4,video/webm" } : {}) }}
          defaultValue={
            typeof field.default === "string" ? field.default : undefined
          }
        />
      );
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
          defaultValue={normalizeImageDefaults(field.default)}
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
      return (
        <FileUploadWidget
          value={value as string}
          onChange={onChange}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={field.uiOptions as any}
          defaultValue={
            typeof field.default === "string" ? field.default : undefined
          }
        />
      );
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
          defaultValue={normalizeImageDefaults(field.default)}
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
            {onEditConfigDefinition && !readonly ? (
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
      {linkedSpecs.length > 0 && (
        <DesignSpecCards specs={linkedSpecs} onEditDesignSpec={onEditDesignSpec} />
      )}
    </div>
  );
}

const DESIGN_SPEC_COLLAPSED_CONTENT_HEIGHT = 116;

function DesignSpecCards({ specs, onEditDesignSpec }: {
  specs: DesignSpecEntryLink[];
  onEditDesignSpec?: (docId: string, entryId: string) => void;
}) {
  return <div className="flex flex-col gap-3">
    {specs.map((spec) => (
      <DesignSpecCard
        key={`${spec.docId}:${spec.entryId}`}
        spec={spec}
        onEdit={onEditDesignSpec ? () => onEditDesignSpec(spec.docId, spec.entryId) : undefined}
      />
    ))}
  </div>;
}

function DesignSpecCard({ spec, onEdit }: { spec: DesignSpecEntryLink; onEdit?: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const measure = () => {
      const content = contentRef.current;
      setOverflows(Boolean(content && content.scrollHeight > DESIGN_SPEC_COLLAPSED_CONTENT_HEIGHT + 1));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" || !contentRef.current
      ? undefined
      : new ResizeObserver(measure);
    if (contentRef.current) observer?.observe(contentRef.current);
    return () => observer?.disconnect();
  }, [spec.markdown]);

  return (
    <section className="rounded-lg bg-foreground/[0.05] p-3">
      <div className="flex min-h-[22px] items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-lg font-bold leading-[22px] text-foreground/60">
          {spec.entryTitle || "未命名设计规范"}
        </h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`编辑设计规范：${spec.entryTitle || "未命名设计规范"}`}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/40 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {spec.markdown.trim() && (
        <div
          ref={contentRef}
          className={cn("mt-3 overflow-hidden", expanded ? "" : "max-h-[116px]")}
        >
          <PageRequirements
            markdown={spec.markdown}
            className="!max-w-none !text-sm !leading-[1.5] !text-foreground/60 [&_h1]:!text-base [&_h2]:!text-base [&_h3]:!text-sm [&_h4]:!text-sm"
          />
        </div>
      )}
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="-mx-3 -mb-3 mt-3 flex h-8 w-[calc(100%+24px)] items-center justify-center gap-0.5 border-t border-foreground/10 text-xs text-foreground/40 transition-colors hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "收起" : "展开"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
      )}
    </section>
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
}: {
  field: FieldConfig;
  value: { x: number; y: number } | undefined;
  onChange: (value: unknown) => void;
  fieldPath?: string;
}) {
  const posConfig = usePositionConfig();
  const pos = value || { x: 0, y: 0 };
  const posKey = field.positionable?.key || field.key;
  const containerWidth = field.positionable?.size?.width ?? 0;
  const containerHeight = field.positionable?.size?.height ?? 0;

  useEffect(() => {
    if (!posConfig || !fieldPath) return;
    return posConfig.registerPositionField({
      posKey,
      fieldPath,
      currentValue: pos,
      containerSize: field.positionable?.size,
    });
  }, [posConfig, posKey, fieldPath, pos.x, pos.y, field.positionable?.size]);

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
        const isEditing = posConfig.positionEditActive;
        return (
          <>
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-2 shrink-0"
              onClick={() => isEditing ? posConfig.exitPositionEdit() : posConfig.requestPositionEdit()}
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
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  field: FieldConfig;
  readonly?: boolean;
}) {
  const [open, setOpen] = useState(false);

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
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
