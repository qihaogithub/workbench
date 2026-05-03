"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Settings,
  Palette,
  Ruler,
  Type,
  Image,
  Eye,
  Layout,
  ArrowUpDown,
  GripVertical,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ConfigFormProps } from "./types";
import { ImageListWidget, ImageItem } from "./ImageListWidget";
import { FileUploadWidget } from "./widgets";
import { getOrderable } from "../../lib/validator";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  uiWidget?: string;
  uiOptions?: Record<string, unknown>;
}

interface FieldGroup {
  title: string;
  icon?: string;
  fields: FieldConfig[];
  color?: string;
}

function parseSchemaToFields(schema: string): FieldGroup[] {
  try {
    const parsed = JSON.parse(schema);
    const properties = parsed.properties || {};
    const required = parsed.required || [];

    // 智能分组：根据字段名的前缀或类型分组
    const groups: Record<string, FieldConfig[]> = {};
    const ungrouped: FieldConfig[] = [];

    Object.entries(properties).forEach(([key, prop]: [string, any]) => {
      const field: FieldConfig = {
        key,
        title: prop.title || formatFieldName(key),
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
        uiWidget: prop["ui:widget"],
        uiOptions: prop["ui:options"],
      };

      // 尝试智能分组
      const groupName = detectGroup(key, prop);
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(field);
    });

    // 转换为 FieldGroup 数组
    return Object.entries(groups).map(([title, fields], index) => ({
      title,
      fields,
      color: getGroupColor(index),
    }));
  } catch {
    return [];
  }
}

function formatFieldName(key: string): string {
  // 将 camelCase 或 snake_case 转换为易读格式
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function detectGroup(key: string, prop: any): string {
  // 根据字段名检测分组
  if (
    key.startsWith("color") ||
    key.endsWith("Color") ||
    prop.format === "color"
  ) {
    return "颜色配置";
  }
  if (
    key.startsWith("size") ||
    key.endsWith("Size") ||
    key.endsWith("Width") ||
    key.endsWith("Height")
  ) {
    return "尺寸设置";
  }
  if (
    key.startsWith("text") ||
    key.endsWith("Text") ||
    key.endsWith("Title") ||
    key.endsWith("Content")
  ) {
    return "文本内容";
  }
  if (
    key.startsWith("image") ||
    key.endsWith("Image") ||
    key.endsWith("Url") ||
    key.endsWith("Icon")
  ) {
    return "图片资源";
  }
  if (
    key.startsWith("show") ||
    key.startsWith("hide") ||
    key.startsWith("enable") ||
    key.startsWith("disable")
  ) {
    return "显示选项";
  }
  if (
    key.startsWith("animation") ||
    key.endsWith("Animation") ||
    key.endsWith("Transition")
  ) {
    return "动画效果";
  }
  if (
    key.startsWith("layout") ||
    key.endsWith("Layout") ||
    key.endsWith("Position")
  ) {
    return "布局设置";
  }

  return "基础配置";
}

function getGroupColor(index: number): string {
  const colors = [
    "from-blue-500 to-cyan-500",
    "from-purple-500 to-pink-500",
    "from-green-500 to-emerald-500",
    "from-orange-500 to-yellow-500",
    "from-red-500 to-rose-500",
    "from-indigo-500 to-blue-500",
  ];
  return colors[index % colors.length];
}

function FieldRenderer({
  field,
  value,
  onChange,
  sessionId,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  sessionId?: string;
}) {
  const renderInput = () => {
    // 图片上传 - 单图
    if (field.uiWidget === "file" || field.uiWidget === "image") {
      return (
        <FileUploadWidget
          value={value as string}
          onChange={onChange}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={field.uiOptions as any}
        />
      );
    }

    // 图片列表 - 多图
    if (field.uiWidget === "imageList" || field.type === "array") {
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
          onChange={(newItems) => onChange(newItems)}
          maxItems={maxItems}
          title={field.title}
          sessionId={sessionId}
          options={field.uiOptions as any}
        />
      );
    }

    // 富文本 - 文本域
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

    // 颜色选择器
    if (field.format === "color" || field.type === "color") {
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

    // 布尔值 - 开关
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

    // 数字范围 - 滑块
    if (field.type === "number" || field.type === "integer") {
      if (field.minimum !== undefined && field.maximum !== undefined) {
        const currentValue =
          (value as number) ?? field.default ?? field.minimum;

        // 从字段名或 title 推断单位
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

    // 枚举值 - 下拉选择
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

    // 长文本 - 文本域
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

    // 默认 - 文本输入
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
    field.type === "array" ||
    (field.maxLength !== undefined && field.maxLength > 100);

  const isTextareaField =
    field.uiWidget === "richtext" ||
    (field.maxLength !== undefined && field.maxLength > 100);

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
        <Label className="text-xs font-medium text-foreground truncate shrink-0 cursor-default">
          {field.title}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
      )}
      <div className={isComplexField ? "w-full" : "flex-1 min-w-0"}>{renderInput()}</div>
    </div>
  );
}

function getGroupIcon(title: string): LucideIcon {
  switch (title) {
    case "基础配置":
      return Settings;
    case "颜色配置":
      return Palette;
    case "尺寸设置":
      return Ruler;
    case "文本内容":
      return Type;
    case "图片资源":
      return Image;
    case "显示选项":
      return Eye;
    case "动画效果":
      return Sparkles;
    case "布局设置":
      return Layout;
    default:
      return Settings;
  }
}

function FieldGroupSection({
  group,
  formData,
  onChange,
  isFirst,
  sessionId,
}: {
  group: FieldGroup;
  formData: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  isFirst?: boolean;
  sessionId?: string;
}) {
  const Icon = getGroupIcon(group.title);
  const [open, setOpen] = useState(true);

  return (
    <div className="py-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 py-2 cursor-pointer hover:bg-accent/50 rounded-md transition-colors">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <h3 className="text-sm font-medium text-muted-foreground">{group.title}</h3>
            <Badge variant="secondary" className="text-xs h-5 font-normal">
              {group.fields.length} 字段
            </Badge>
            <span className="ml-auto">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform rotate-180" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
              )}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-1 pl-6 pr-2 pt-1 pb-2">
            {group.fields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={formData[field.key]}
                onChange={(value) => onChange(field.key, value)}
                sessionId={sessionId}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SortableItem({
  id,
  title,
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  id: string;
  title: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 py-1.5 px-1 rounded-md transition-colors duration-150 ${
        isDragging ? "bg-accent/50 shadow-sm" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs font-mono text-muted-foreground w-4 text-center shrink-0">
        {index + 1}
      </span>
      <span className="text-xs font-medium text-foreground flex-1 truncate">
        {title}
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={index === total - 1}
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function OrderControl({
  orderable,
  order,
  defaultOrder,
  titleMap,
  onOrderChange,
}: {
  orderable: string[];
  order: string[];
  defaultOrder: string[];
  titleMap: Record<string, string>;
  onOrderChange: (newOrder: string[]) => void;
}) {
  const [open, setOpen] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newOrder = [...order];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    onOrderChange(newOrder);
  };

  const handleMoveDown = (index: number) => {
    if (index >= order.length - 1) return;
    const newOrder = [...order];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    onOrderChange(newOrder);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    onOrderChange(arrayMove(order, oldIndex, newIndex));
  };

  const handleReset = () => {
    onOrderChange([...defaultOrder]);
  };

  const isDefault = order.join(",") === defaultOrder.join(",");

  return (
    <div className="py-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 py-2 cursor-pointer hover:bg-accent/50 rounded-md transition-colors">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
            <h3 className="text-sm font-medium text-muted-foreground">组件排序</h3>
            <Badge variant="secondary" className="text-xs h-5 font-normal">
              {orderable.length} 项
            </Badge>
            <span className="ml-auto">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform rotate-180" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
              )}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-4 pr-2 pt-1 pb-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={order}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-0.5">
                  {order.map((key, index) => (
                    <SortableItem
                      key={key}
                      id={key}
                      title={titleMap[key] || key}
                      index={index}
                      total={order.length}
                      onMoveUp={() => handleMoveUp(index)}
                      onMoveDown={() => handleMoveDown(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {!isDefault && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleReset}
                >
                  恢复默认顺序
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function ConfigForm({
  schema,
  onChange,
  initialData,
  readonly,
  className,
  sessionId,
}: ConfigFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(
    initialData || {},
  );

  console.log(
    "[ConfigForm] Rendered with schema length:",
    schema?.length,
    "initialData keys:",
    Object.keys(initialData || {}),
  );

  const fieldGroups = useMemo(() => parseSchemaToFields(schema), [schema]);

  const orderable = useMemo(() => getOrderable(schema), [schema]);

  const titleMap = useMemo(() => {
    if (!orderable) return {};
    try {
      const parsed = JSON.parse(schema);
      const properties = parsed.properties || {};
      const map: Record<string, string> = {};
      for (const key of orderable) {
        const prop = properties[key] as { title?: string } | undefined;
        map[key] = prop?.title || formatFieldName(key);
      }
      return map;
    } catch {
      return {};
    }
  }, [schema, orderable]);

  const currentOrder = useMemo(() => {
    if (!orderable) return [];
    const existing = formData.__order as string[] | undefined;
    if (Array.isArray(existing) && existing.length === orderable.length) {
      return existing;
    }
    return [...orderable];
  }, [orderable, formData.__order]);

  console.log(
    "[ConfigForm] Parsed field groups:",
    fieldGroups.length,
    "groups",
  );

  // 同步 initialData 变化
  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      console.log("[ConfigForm] initialData changed, syncing...");
      setFormData((prev) => {
        // 保留用户已修改的值，但添加新字段的默认值
        const merged = { ...prev };
        for (const [key, value] of Object.entries(initialData)) {
          if (!(key in merged)) {
            merged[key] = value;
          }
        }
        console.log(
          "[ConfigForm] Merged formData after initialData sync:",
          merged,
        );
        return merged;
      });
    }
  }, [initialData]);

  // 当 schema 变化时，重新初始化表单
  useEffect(() => {
    console.log("[ConfigForm] Schema changed, reinitializing form...");
    if (schema && initialData) {
      try {
        const parsed = JSON.parse(schema);
        console.log(
          "[ConfigForm] Schema parsed successfully, keys:",
          Object.keys(parsed.properties || {}),
        );
        const properties = parsed.properties || {};
        const required = parsed.required || [];

        // 解析新 schema 的默认值
        const newDefaults: Record<string, unknown> = {};
        Object.entries(properties).forEach(([key, prop]: [string, any]) => {
          newDefaults[key] =
            prop.default ?? (required.includes(key) ? "" : undefined);
        });

        console.log("[ConfigForm] New defaults from schema:", newDefaults);
        setFormData((prev) => {
          const merged = {
            ...newDefaults,
            ...prev, // 保留用户已修改的值
          };
          console.log(
            "[ConfigForm] Merged formData after schema change:",
            merged,
          );
          return merged;
        });
      } catch (e) {
        console.warn("[ConfigForm] Failed to parse schema for form reset:", e);
      }
    }
  }, [schema, initialData]);

  const handleFieldChange = (key: string, value: unknown) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    onChange(newData);
  };

  const handleOrderChange = (newOrder: string[]) => {
    const newData = { ...formData, __order: newOrder };
    setFormData(newData);
    onChange(newData);
  };

  if (fieldGroups.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-64 text-center",
          className,
        )}
      >
        <div className="relative mb-4">
          <Sparkles className="h-12 w-12 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground">暂无配置项</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          请检查 Schema 格式是否正确
        </p>
      </div>
    );
  }

  return (
    <div className={cn("h-full", className)}>
      <ScrollArea className="h-full">
        <div className="px-1 pb-4">
          {orderable && orderable.length >= 2 && (
            <>
              <OrderControl
                orderable={orderable}
                order={currentOrder}
                defaultOrder={orderable}
                titleMap={titleMap}
                onOrderChange={handleOrderChange}
              />
              <div className="h-px bg-slate-600/30 mx-2 my-2" />
            </>
          )}
          {fieldGroups.map((group, index) => (
            <div key={index}>
              {index > 0 && (
                <div className="h-px bg-slate-600/30 mx-2 my-2" />
              )}
              <FieldGroupSection
                group={group}
                formData={formData}
                onChange={handleFieldChange}
                isFirst={index === 0}
                sessionId={sessionId}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
