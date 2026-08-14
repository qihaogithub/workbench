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
import { BookOpen, Check, Edit3, ImageIcon, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentEditor } from "./DocumentEditor";
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
  embedded?: boolean;
  fieldPath?: string;
}) {
  const renderInput = () => {
    if (field.uiWidget === "file" || field.uiWidget === "image") {
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

    if (field.format === "color") {
      return (
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={(value as string) || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border-0"
          />
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            className="flex-1 font-mono h-8"
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
          />
        </div>
      );
    }

    if (field.type === "number" || field.type === "integer") {
      if (field.minimum !== undefined && field.maximum !== undefined) {
        const currentValue =
          (value as number) ?? field.default ?? field.minimum;

        const getUnit = (): string => {
          const name = (field.key + field.title).toLowerCase();
          if (
            name.includes("间隔") ||
            name.includes("时间") ||
            name.includes("duration")
          ) {
            return "ms";
          }
          if (
            name.includes("高度") ||
            name.includes("height") ||
            name.includes("宽度") ||
            name.includes("width") ||
            name.includes("大小") ||
            name.includes("size")
          ) {
            return "px";
          }
          return "";
        };

        const unit = getUnit();

        return (
          <div className="flex items-center gap-3 w-full">
            <div className="min-w-[60px] text-left shrink-0">
              <span className="font-mono text-sm font-medium text-foreground">
                {currentValue}
                {unit}
              </span>
            </div>
            <div className="flex-1 min-w-[120px]">
              <Slider
                value={[currentValue]}
                min={field.minimum}
                max={field.maximum}
                step={field.type === "integer" ? 1 : 0.1}
                onValueChange={(vals: number[]) => onChange(vals[0])}
              />
            </div>
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
          className="font-mono h-8"
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
          <SelectTrigger className="h-8">
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
          className="resize-y min-h-[80px]"
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
          className="resize-none"
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
        className="h-8"
      />
    );
  };

  const isComplexField =
    field.uiWidget === "file" ||
    field.uiWidget === "image" ||
    field.uiWidget === "imageList" ||
    field.format === "image" ||
    field.format === "file" ||
    field.type === "array" ||
    field.type === "richtext" ||
    field.type === "text" ||
    (field.maxLength !== undefined && field.maxLength > 100) ||
    !!field.positionable;

  const isTextareaField =
    field.type === "text" ||
    (field.maxLength !== undefined && field.maxLength > 100);

  const linkedSpecs = designSpecEntries.filter((entry) => entry.fieldKey === field.key);

  return (
    <div
      className={cn(
        "py-1.5",
        isComplexField
          ? "flex flex-col gap-2"
          : "flex items-center gap-2",
      )}
    >
      {(field.title !== "" && (isComplexField || !isTextareaField)) && (
        <div className="flex items-center gap-1 min-w-0">
          <Label className="text-xs font-medium text-foreground truncate shrink-0 cursor-default">
            {field.title}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          {linkedSpecs.length > 0 && (
            <DesignSpecIndicator
              specs={linkedSpecs}
              field={field}
              value={value}
              onEditDesignSpec={onEditDesignSpec}
            />
          )}
        </div>
      )}
      <div className={isComplexField ? "w-full" : "flex-1 min-w-0"}>
        {renderInput()}
      </div>
    </div>
  );
}

function DesignSpecIndicator({ specs, field, value, onEditDesignSpec }: {
  specs: DesignSpecEntryLink[];
  field: FieldConfig;
  value: unknown;
  onEditDesignSpec?: (docId: string, entryId: string) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return <>
    <span className="relative inline-flex" onMouseEnter={() => setPreviewOpen(true)} onMouseLeave={() => setPreviewOpen(false)}>
      <button
        type="button"
        aria-label={`查看关联设计规范，共 ${specs.length} 条`}
        onFocus={() => setPreviewOpen(true)}
        onBlur={() => setPreviewOpen(false)}
        onClick={(event) => { event.stopPropagation(); setDialogOpen(true); }}
        className="inline-flex shrink-0 items-center justify-center rounded-sm text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BookOpen className="h-3.5 w-3.5" />
      </button>
      {previewOpen && (
        <span role="tooltip" className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-md border bg-popover px-2.5 py-2 text-left text-xs text-popover-foreground shadow-md">
          <span className="mb-1 block font-medium">关联设计规范</span>
          {specs.map((spec) => <span key={`${spec.docId}:${spec.entryId}`} className="block truncate text-muted-foreground">{spec.docTitle} · {spec.entryTitle}</span>)}
        </span>
      )}
    </span>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader className="sr-only"><DialogTitle>关联设计规范</DialogTitle></DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {specs.map((spec) => <section key={`${spec.docId}:${spec.entryId}`} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{spec.docTitle}</p>
            <h3 className="mt-1 text-sm font-semibold">{spec.entryTitle || "未命名条目"}</h3>
            <DesignSpecConfigTable field={field} value={value} />
            {spec.markdown.trim() ? <DocumentEditor value={spec.markdown} onChange={() => {}} readOnly scrollable={false} className="mt-3" /> : <p className="mt-3 text-sm text-muted-foreground">暂无说明</p>}
            {onEditDesignSpec && <Button className="mt-3" size="sm" onClick={() => { setDialogOpen(false); onEditDesignSpec(spec.docId, spec.entryId); }}>去编辑</Button>}
          </section>)}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function DesignSpecConfigTable({ field, value }: { field: FieldConfig; value: unknown }) {
  const isImage = field.uiWidget === "image" || field.uiWidget === "file" || field.format === "image" || /(?:image|img|logo|banner|pic|thumb|background)/i.test(field.key);
  const isColor = field.format === "color" || field.type === "color";
  const format = isImage && typeof value === "string"
    ? value.split(".").pop()?.toUpperCase() || "—"
    : field.format?.toUpperCase() || "—";

  return <table className="mt-3 w-full border-collapse text-xs">
    <thead><tr className="text-left text-muted-foreground"><th className="w-[52px] py-1 pr-2 font-medium" /><th className="py-1 pr-2 font-medium">配置项</th><th className="py-1 pr-2 font-medium">格式</th><th className="py-1 font-medium">尺寸</th></tr></thead>
    <tbody><tr className="hover:bg-accent/40"><td className="py-1 pr-2"><ConfigSpecThumbnail title={field.title} value={value} isImage={isImage} isColor={isColor} /></td><td className="font-medium">{field.title}</td><td className="text-muted-foreground">{format}</td><td className="text-muted-foreground">—</td></tr></tbody>
  </table>;
}

function ConfigSpecThumbnail({ title, value, isImage, isColor }: { title: string; value: unknown; isImage: boolean; isColor: boolean }) {
  if (isColor) return <span className="block h-[52px] w-[52px] rounded-md border" style={{ background: typeof value === "string" ? value : "hsl(var(--secondary))" }} />;
  if (isImage && typeof value === "string" && value) return <img src={value} alt={title} className="h-[52px] w-[52px] rounded-md border object-cover" />;
  return <span className="flex h-[52px] w-[52px] items-center justify-center rounded-md border text-lg text-muted-foreground">{isImage ? <ImageIcon className="h-5 w-5" /> : "Aa"}</span>;
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
