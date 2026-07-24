"use client";

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { NoteButton } from "./NoteButton";
import { NotePreview, stripHtml } from "./NotePreview";
import { ArrayFieldGroup } from "./ArrayFieldGroup";
import type { FieldConfig } from "./schema-parser";

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
  onNoteClick,
  embedded,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  sessionId?: string;
  readonly?: boolean;
  onNoteClick?: (fieldKey: string) => void;
  embedded?: boolean;
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

    if (field.uiWidget === "richtext") {
      return (
        <Textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.title}`}
          rows={5}
          className="resize-y min-h-[100px]"
        />
      );
    }

    if (field.format === "image") {
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
          value={currentValue?.toString()}
          onValueChange={(val: string) => {
            const index = field.enum!.indexOf(val as any);
            onChange(index >= 0 ? field.enum![index] : val);
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="请选择">{displayValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.enum.map((item, idx) => {
              const itemValue = item?.toString() || "";
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
    field.uiWidget === "richtext" ||
    field.format === "image" ||
    field.type === "array" ||
    (field.maxLength !== undefined && field.maxLength > 100);

  const isTextareaField =
    field.uiWidget === "richtext" ||
    (field.maxLength !== undefined && field.maxLength > 100);

  const hasNote = !embedded && !!field.note && !!stripHtml(field.note);
  const showNoteButton = !embedded && !!onNoteClick && (hasNote || !readonly);

  return (
    <div
      className={cn(
        "py-1.5",
        isComplexField
          ? "flex flex-col gap-2"
          : "flex items-center gap-2",
      )}
    >
      {(isComplexField || !isTextareaField) && (
        <div className="flex items-center gap-1 min-w-0">
          <Label className="text-xs font-medium text-foreground truncate shrink-0 cursor-default">
            {field.title}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          {showNoteButton && (
            <NoteButton
              hasNote={hasNote}
              readonly={readonly}
              onClick={() => onNoteClick!(field.key)}
            />
          )}
        </div>
      )}
      {hasNote && isComplexField && (
        <NotePreview noteHtml={field.note!} />
      )}
      <div className={isComplexField ? "w-full" : "flex-1 min-w-0"}>
        {renderInput()}
      </div>
    </div>
  );
}
