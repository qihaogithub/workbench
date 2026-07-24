"use client";

import { useState, useCallback, useRef } from "react";
import {
  GripVertical,
  ChevronDown,
  X,
  Plus,
  Info,
} from "lucide-react";
import { cn } from "./utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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
import { FieldRenderer } from "./FieldRenderer";
import type { FieldConfig } from "./schema-parser";

function createItemDefault(
  field: FieldConfig,
  variantValue?: string,
): Record<string, unknown> {
  if (field.oneOf) {
    const variant = variantValue
      ? field.oneOf.variants.find((v) => v.value === variantValue)
      : field.oneOf.variants[0];
    if (!variant) return {};
    const item: Record<string, unknown> = {
      [field.oneOf.discriminator]: variant.value,
    };
    for (const f of variant.fields) {
      item[f.key] = f.default ?? "";
    }
    return item;
  }

  if (field.children) {
    const item: Record<string, unknown> = {};
    for (const f of field.children) {
      item[f.key] = f.default ?? "";
    }
    return item;
  }

  return {};
}

function getItemTitle(
  field: FieldConfig,
  item: Record<string, unknown>,
  index: number,
): string {
  if (field.oneOf) {
    const discriminator = field.oneOf.discriminator;
    const itemType = item[discriminator];
    const variant = field.oneOf.variants.find((v) => v.value === itemType);
    if (variant) return variant.title;
  }

  if (field.uiOptions) {
    const titleField = field.uiOptions.itemTitleField as string | undefined;
    if (titleField && item[titleField]) {
      return String(item[titleField]);
    }
  }

  return `项目 ${index + 1}`;
}

function ArrayItemHeader({
  field,
  item,
  index,
  isOpen,
  onToggle,
  onTypeChange,
  onRemove,
  readonly,
}: {
  field: FieldConfig;
  item: Record<string, unknown>;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onTypeChange: (newType: string) => void;
  onRemove: () => void;
  readonly?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(index) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const title = getItemTitle(field, item, index);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1 py-1.5 px-2 rounded-md border transition-all",
        isDragging
          ? "bg-accent/50 shadow-sm border-accent"
          : "bg-muted/30 border-border/50",
      )}
    >
      {!readonly && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none p-0.5"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        className="flex items-center gap-1 flex-1 min-w-0 text-left"
        onClick={onToggle}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
        />
        <span className="text-xs font-medium truncate">{title}</span>
      </button>

      {field.oneOf && (
        <Select
          value={String(item[field.oneOf.discriminator] ?? "")}
          onValueChange={onTypeChange}
          disabled={readonly}
        >
          <SelectTrigger className="h-6 w-28 text-[10px] px-1.5 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.oneOf.variants.map((v) => (
              <SelectItem key={String(v.value)} value={String(v.value)}>
                {v.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!readonly && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export interface ArrayFieldGroupProps {
  field: FieldConfig;
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
  sessionId?: string;
  readonly?: boolean;
}

function AddMenu({
  field,
  onSelect,
}: {
  field: FieldConfig;
  onSelect: (variantValue?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  if (field.oneOf && field.oneOf.variants.length > 1) {
    return (
      <div className="relative inline-block">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        >
          <Plus className="h-3 w-3 mr-1" />
          添加{field.title || "项目"}
        </Button>
        {open && (
          <div
            ref={menuRef}
            className="absolute bottom-full left-0 mb-1 min-w-[120px] bg-popover border border-border rounded-md shadow-md z-50 py-1"
          >
            {field.oneOf.variants.map((variant) => (
              <button
                key={String(variant.value)}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer"
                onClick={() => {
                  onSelect(String(variant.value));
                  setOpen(false);
                }}
              >
                {variant.title}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={() => onSelect()}
    >
      <Plus className="h-3 w-3 mr-1" />
      添加{field.title || "项目"}
    </Button>
  );
}

export function ArrayFieldGroup({
  field,
  value,
  onChange,
  sessionId,
  readonly,
}: ArrayFieldGroupProps) {
  const [openItems, setOpenItems] = useState<Set<number>>(() => {
    const collapsed =
      field.uiOptions?.collapsed !== undefined
        ? !field.uiOptions.collapsed
        : false;
    if (collapsed && value.length > 0) {
      return new Set([0]);
    }
    return new Set();
  });

  const maxItems =
    typeof field.uiOptions?.maxItems === "number"
      ? (field.uiOptions.maxItems as number)
      : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleAdd = useCallback(
    (variantValue?: string) => {
      const newItem = createItemDefault(field, variantValue);
      const newValue = [...value, newItem];
      const newIndex = newValue.length - 1;
      setOpenItems((prev) => {
        const next = new Set(prev);
        next.add(newIndex);
        return next;
      });
      onChange(newValue);
    },
    [field, value, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      const newValue = value.filter((_, i) => i !== index);
      setOpenItems((prev) => {
        const next = new Set(prev);
        next.delete(index);
        const adjusted = new Set<number>();
        for (const i of next) {
          adjusted.add(i > index ? i - 1 : i);
        }
        return adjusted;
      });
      onChange(newValue);
    },
    [value, onChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = Number(active.id);
      const newIndex = Number(over.id);
      const newValue = arrayMove(value, oldIndex, newIndex);
      setOpenItems((prev) => {
        const next = new Set<number>();
        for (const i of prev) {
          if (i === oldIndex) next.add(newIndex);
          else if (i === newIndex) next.add(oldIndex);
          else next.add(i);
        }
        return next;
      });
      onChange(newValue);
    },
    [value, onChange],
  );

  const handleTypeChange = useCallback(
    (index: number, newType: string) => {
      const item = { ...value[index] };
      const discriminator = field.oneOf!.discriminator;
      item[discriminator] = newType;
      const variant = field.oneOf!.variants.find((v) => String(v.value) === newType);
      if (variant) {
        for (const f of variant.fields) {
          if (item[f.key] === undefined) {
            item[f.key] = f.default ?? "";
          }
        }
      }
      const newValue = [...value];
      newValue[index] = item;
      onChange(newValue);
    },
    [field, value, onChange],
  );

  const handleItemFieldChange = useCallback(
    (index: number, key: string, newVal: unknown) => {
      const newValue = [...value];
      const item = { ...newValue[index], [key]: newVal };
      newValue[index] = item;
      onChange(newValue);
    },
    [value, onChange],
  );

  const toggleItem = useCallback((index: number) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const canAdd = maxItems === undefined || value.length < maxItems;
  const isEmpty = value.length === 0;

  const getVisibleFields = (item: Record<string, unknown>): FieldConfig[] => {
    if (field.oneOf) {
      const itemType = String(item[field.oneOf.discriminator] ?? "");
      const variant = field.oneOf.variants.find(
        (v) => String(v.value) === itemType,
      );
      return variant?.fields ?? [];
    }
    return field.children ?? [];
  };

  return (
    <div className="space-y-1.5">
      {!isEmpty && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={value.map((_, i) => String(i))}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {value.map((item, index) => {
                const isOpen = openItems.has(index);
                const visibleFields = getVisibleFields(item);

                return (
                  <div key={index} className="space-y-1">
                    <ArrayItemHeader
                      field={field}
                      item={item}
                      index={index}
                      isOpen={isOpen}
                      onToggle={() => toggleItem(index)}
                      onTypeChange={(newType) =>
                        handleTypeChange(index, newType)
                      }
                      onRemove={() => handleRemove(index)}
                      readonly={readonly}
                    />
                    <Collapsible open={isOpen}>
                      <CollapsibleContent>
                        <div className="pl-6 pr-2 pt-1 pb-2 space-y-1 bg-muted/10 rounded-b-md">
                          {visibleFields.map((childField) => (
                            <FieldRenderer
                              key={childField.key}
                              field={childField}
                              value={item[childField.key]}
                              onChange={(val) =>
                                handleItemFieldChange(
                                  index,
                                  childField.key,
                                  val,
                                )
                              }
                              sessionId={sessionId}
                              readonly={readonly}
                              embedded
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-6 text-center bg-muted/20 rounded-md border border-dashed border-border">
          <Info className="h-5 w-5 text-muted-foreground/50 mb-1" />
          <p className="text-xs text-muted-foreground">
            暂无{field.title || "项目"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            点击下方按钮添加第一个{field.title || "项目"}
          </p>
        </div>
      )}

      {canAdd && !readonly && (
        <div className="flex justify-center pt-1">
          <AddMenu field={field} onSelect={handleAdd} />
        </div>
      )}
    </div>
  );
}
