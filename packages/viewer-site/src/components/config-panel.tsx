"use client";

import { useMemo, useState, useEffect } from "react";
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
import { Sparkles } from "lucide-react";

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

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between py-1.5">
        <Label className="text-xs font-medium text-foreground">
          {field.title}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
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
          <Label className="text-xs font-medium text-foreground">
            {field.title}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
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
        <Label className="text-xs font-medium text-foreground">
          {field.title}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
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
        <Label className="text-xs font-medium text-foreground">
          {field.title}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
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
        <Label className="text-xs font-medium text-foreground">
          {field.title}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
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
        <Label className="text-xs font-medium text-foreground">
          {field.title}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
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
      <Label className="text-xs font-medium text-foreground">
        {field.title}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
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

  useEffect(() => {
    setFormData(defaults);
    onChange(defaults);
  }, [schema]);

  const handleFieldChange = (key: string, value: unknown) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    onChange(newData);
  };

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Sparkles className="mb-4 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">暂无配置项</p>
      </div>
    );
  }

  return (
    <ScrollArea className={className}>
      <div className="px-3 pb-4">
        {fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={formData[field.key]}
            onChange={(value) => handleFieldChange(field.key, value)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
