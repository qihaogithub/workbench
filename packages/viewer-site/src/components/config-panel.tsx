"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, StickyNote, MessageSquarePlus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

interface FieldConfig {
  key: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  enumNames?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  format?: string;
  note?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function parseSchemaToFields(schema: string): FieldConfig[] {
  try {
    const parsed = JSON.parse(schema);
    const properties = parsed.properties || {};
    const required = parsed.required || [];

    return Object.entries(properties).map(([key, prop]: [string, any]) => ({
      key,
      title: prop.title || key,
      type: prop.type || "string",
      description: prop.description,
      required: required.includes(key),
      default: prop.default,
      enum: prop.enum,
      enumNames: prop.enumNames,
      minimum: prop.minimum,
      maximum: prop.maximum,
      maxLength: prop.maxLength,
      format: prop.format,
      note: prop.$demo?.note,
    }));
  } catch {
    return [];
  }
}

function extractDefaults(schema: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(schema);
    const properties = parsed.properties || {};
    const defaults: Record<string, unknown> = {};
    Object.entries(properties).forEach(([key, prop]: [string, any]) => {
      if (prop.default !== undefined) {
        defaults[key] = prop.default;
      }
    });
    return defaults;
  } catch {
    return {};
  }
}

function NoteButtonReadonly({
  hasNote,
  onClick,
}: {
  hasNote: boolean;
  onClick: () => void;
}) {
  if (!hasNote) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="inline-flex items-center justify-center shrink-0 rounded-sm text-primary hover:text-primary/80 transition-colors"
        >
          <StickyNote className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        查看备注
      </TooltipContent>
    </Tooltip>
  );
}

function NoteDialogReadonly({
  open,
  onOpenChange,
  fieldTitle,
  noteHtml,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldTitle: string;
  noteHtml: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[480px] flex flex-col">
        <DialogHeader>
          <DialogTitle>{fieldTitle} - 备注</DialogTitle>
          <DialogDescription className="sr-only">查看备注内容</DialogDescription>
        </DialogHeader>
        <div
          className="prose prose-sm max-w-none px-1 text-sm overflow-y-auto max-h-[300px] flex-1"
          dangerouslySetInnerHTML={{ __html: noteHtml }}
        />
        <DialogFooter>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
  onNoteClick,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  onNoteClick: (fieldKey: string) => void;
}) {
  const hasNote = !!field.note && !!stripHtml(field.note);

  const renderLabel = () => (
    <div className="flex items-center gap-1 min-w-0">
      <Label className="text-xs font-medium text-foreground truncate shrink-0 cursor-default">
        {field.title}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <NoteButtonReadonly
        hasNote={hasNote}
        onClick={() => onNoteClick(field.key)}
      />
    </div>
  );

  const renderNoteSummary = () => {
    if (!hasNote) return null;
    const plainText = stripHtml(field.note!);
    if (!plainText) return null;
    return (
      <p className="text-xs text-muted-foreground truncate leading-tight">
        {plainText}
      </p>
    );
  };

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between py-1.5">
        {renderLabel()}
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
      return (
        <div className="py-1.5">
          {renderLabel()}
          <div className="flex items-center gap-3 mt-1">
            <span className="min-w-[40px] text-sm font-mono text-foreground">
              {currentValue}
            </span>
            <Slider
              value={[currentValue]}
              min={field.minimum}
              max={field.maximum}
              step={field.type === "integer" ? 1 : 0.1}
              onValueChange={(vals: number[]) => onChange(vals[0])}
              className="flex-1"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="py-1.5">
        {renderLabel()}
        <Input
          type="number"
          value={(value as number)?.toString() || ""}
          onChange={(e) =>
            onChange(
              field.type === "integer"
                ? parseInt(e.target.value)
                : parseFloat(e.target.value)
            )
          }
          min={field.minimum}
          max={field.maximum}
          className="mt-1 h-8 font-mono"
        />
      </div>
    );
  }

  if (field.enum && field.enum.length > 0) {
    const currentValue = value || field.default || field.enum[0];
    return (
      <div className="py-1.5">
        {renderLabel()}
        <Select
          value={currentValue?.toString()}
          onValueChange={(val: string) => {
            const index = field.enum!.indexOf(val as any);
            onChange(index >= 0 ? field.enum![index] : val);
          }}
        >
          <SelectTrigger className="mt-1 h-8">
            <SelectValue placeholder="请选择" />
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
      </div>
    );
  }

  if (field.format === "color" || field.type === "color") {
    return (
      <div className="py-1.5">
        {renderLabel()}
        <div className="flex gap-2 items-center mt-1">
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
      </div>
    );
  }

  if (field.maxLength && field.maxLength > 100) {
    return (
      <div className="py-1.5">
        {renderLabel()}
        <Textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.title}`}
          maxLength={field.maxLength}
          rows={3}
          className="mt-1 resize-none"
        />
      </div>
    );
  }

  return (
    <div className="py-1.5">
      {renderLabel()}
      {renderNoteSummary()}
      <Input
        type="text"
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`请输入${field.title}`}
        maxLength={field.maxLength}
        className="mt-1 h-8"
      />
    </div>
  );
}

interface ConfigPanelProps {
  schema: string;
  onChange: (configData: Record<string, unknown>) => void;
  className?: string;
}

export function ConfigPanel({ schema, onChange, className }: ConfigPanelProps) {
  const fields = useMemo(() => parseSchemaToFields(schema), [schema]);
  const defaults = useMemo(() => extractDefaults(schema), [schema]);
  const [formData, setFormData] = useState<Record<string, unknown>>(defaults);
  const [noteDialogField, setNoteDialogField] = useState<string | null>(null);

  useEffect(() => {
    setFormData(defaults);
    onChange(defaults);
  }, [schema]);

  const handleFieldChange = (key: string, value: unknown) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    onChange(newData);
  };

  const handleNoteClick = useCallback((fieldKey: string) => {
    setNoteDialogField(fieldKey);
  }, []);

  const currentNoteField = useMemo(() => {
    if (!noteDialogField) return null;
    return fields.find((f) => f.key === noteDialogField) || null;
  }, [noteDialogField, fields]);

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Sparkles className="mb-4 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">暂无配置项</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className={className}>
        <div className="px-3 pb-4">
          {fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={formData[field.key]}
              onChange={(value) => handleFieldChange(field.key, value)}
              onNoteClick={handleNoteClick}
            />
          ))}
        </div>
      </ScrollArea>

      {currentNoteField && currentNoteField.note && (
        <NoteDialogReadonly
          open={!!noteDialogField}
          onOpenChange={(open) => {
            if (!open) setNoteDialogField(null);
          }}
          fieldTitle={currentNoteField.title}
          noteHtml={currentNoteField.note}
        />
      )}
    </TooltipProvider>
  );
}
