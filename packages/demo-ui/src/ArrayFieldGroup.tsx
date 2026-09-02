"use client";

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  GripVertical,
  ChevronDown,
  Plus,
  Info,
  Trash2,
} from "lucide-react";
import { cn } from "./utils";
import { Button } from "@/components/ui/button";
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
import type { ImageConfigScope, WhiteboardLauncher } from "./types";

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
  sortableId,
  isOpen,
  onToggle,
  onRemove,
  readonly,
  children,
}: {
  field: FieldConfig;
  item: Record<string, unknown>;
  index: number;
  sortableId: string;
  isOpen: boolean;
  onToggle: () => void;
  onRemove: () => void;
  readonly?: boolean;
  children?: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const title = getItemTitle(field, item, index);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex min-h-9 flex-col rounded-lg bg-foreground/[0.07] p-2 transition-[background-color,box-shadow,opacity,transform] duration-200",
        isOpen ? "gap-2.5" : "gap-0",
        isDragging
          ? "bg-foreground/[0.11] shadow-md"
          : "hover:bg-foreground/[0.09]",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {!readonly && (
            <button
              type="button"
              className="shrink-0 cursor-grab touch-none text-foreground/40 transition-colors hover:text-foreground/70 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`拖动${title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            className="flex min-w-0 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onToggle}
            aria-expanded={isOpen}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-foreground/40 transition-transform duration-200",
                !isOpen && "-rotate-90",
              )}
            />
            <span className="truncate text-sm font-normal leading-5 text-foreground">{title}</span>
          </button>
        </div>

        {!readonly && (
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 rounded-none p-0 text-foreground/40 hover:bg-transparent hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`删除${title}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export interface ArrayFieldGroupProps {
  field: FieldConfig;
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
  sessionId?: string;
  readonly?: boolean;
  fieldPath?: string;
  defaultValueOverride?: unknown;
  imageConfigScope?: ImageConfigScope;
  pageId?: string;
  onLaunchWhiteboard?: WhiteboardLauncher;
}

function AddMenu({
  field,
  value,
  onSelect,
}: {
  field: FieldConfig;
  value: Record<string, unknown>[];
  onSelect: (variantValue?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function countByType(items: Record<string, unknown>[], discriminator: string, variantValue: unknown): number {
    return items.filter((item) => item[discriminator] === variantValue).length;
  }

  const hasAllLimited = field.oneOf?.variants.every((variant) => {
    if (!variant.maxItems || variant.maxItems <= 0) return false;
    const count = countByType(value, field.oneOf!.discriminator, variant.value);
    return count >= variant.maxItems;
  });

  if (field.oneOf && field.oneOf.variants.length > 1) {
    return (
      <div className="relative w-full">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-full justify-center gap-2 rounded-lg bg-foreground/[0.07] px-2 text-[13px] font-semibold text-foreground/40 hover:bg-foreground/[0.09] hover:text-foreground/70"
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          disabled={hasAllLimited}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <Plus className="h-3.5 w-3.5" />
          添加
        </Button>
        {open && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-foreground/10 bg-popover p-1 shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
          >
            {field.oneOf.variants.map((variant) => {
              const atLimit = variant.maxItems != null && variant.maxItems > 0
                && countByType(value, field.oneOf!.discriminator, variant.value) >= variant.maxItems;
              return (
                <button
                  key={String(variant.value)}
                  type="button"
                  role="menuitem"
                  className={cn(
                    "flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    atLimit
                      ? "cursor-not-allowed text-muted-foreground/45"
                      : "cursor-pointer text-foreground hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07]"
                  )}
                  disabled={atLimit}
                  onClick={() => {
                    if (!atLimit) {
                      onSelect(String(variant.value));
                      setOpen(false);
                    }
                  }}
                >
                  <span className="min-w-0 truncate">{variant.title}</span>
                  {variant.maxItems != null && variant.maxItems > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground/60">
                      ({countByType(value, field.oneOf!.discriminator, variant.value)}/{variant.maxItems})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (hasAllLimited) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 w-full justify-center gap-2 rounded-lg bg-foreground/[0.07] px-2 text-[13px] font-semibold text-foreground/40 hover:bg-foreground/[0.09] hover:text-foreground/70"
      onClick={() => onSelect()}
    >
      <Plus className="h-3.5 w-3.5" />
      添加
    </Button>
  );
}

export function ArrayFieldGroup({
  field,
  value,
  onChange,
  sessionId,
  readonly,
  fieldPath,
  defaultValueOverride,
  imageConfigScope,
  pageId,
  onLaunchWhiteboard,
}: ArrayFieldGroupProps) {
  const sortableIdSequenceRef = useRef(0);
  const createSortableId = useCallback(
    () => `${field.key}-sortable-${sortableIdSequenceRef.current++}`,
    [field.key],
  );
  const [itemIds, setItemIds] = useState(() => value.map(createSortableId));
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

  // 保持拖拽标识与项本身绑定，而不是绑定数组位置。外部仅增删数据时，
  // 补齐或截断标识；组件内部的增删与排序会在对应 handler 中同步移动标识。
  useEffect(() => {
    setItemIds((previousIds) => {
      if (previousIds.length === value.length) return previousIds;
      if (previousIds.length > value.length) return previousIds.slice(0, value.length);
      return [
        ...previousIds,
        ...Array.from(
          { length: value.length - previousIds.length },
          createSortableId,
        ),
      ];
    });
  }, [value.length, createSortableId]);

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
      setItemIds((previousIds) => [...previousIds, createSortableId()]);
      onChange(newValue);
    },
    [field, value, onChange, createSortableId],
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
      setItemIds((previousIds) => previousIds.filter((_, itemIndex) => itemIndex !== index));
      onChange(newValue);
    },
    [value, onChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const newValue = arrayMove(value, oldIndex, newIndex);
      setItemIds((previousIds) => arrayMove(previousIds, oldIndex, newIndex));
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
    [itemIds, value, onChange],
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
    <div className="flex flex-col gap-2.5 pt-2.5">
      {!isEmpty && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={itemIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2.5">
              {value.map((item, index) => {
                const isOpen = openItems.has(index);
                const sortableId = itemIds[index] ?? `${field.key}-pending-${index}`;
                const visibleFields = getVisibleFields(item);
                const defaultItem = Array.isArray(defaultValueOverride)
                  ? defaultValueOverride[index]
                  : undefined;

                return (
                  <ArrayItemHeader
                    key={sortableId}
                    field={field}
                    item={item}
                    index={index}
                    sortableId={sortableId}
                    isOpen={isOpen}
                    onToggle={() => toggleItem(index)}
                    onRemove={() => handleRemove(index)}
                    readonly={readonly}
                  >
                    <Collapsible open={isOpen}>
                      <CollapsibleContent>
                        <div className="flex flex-col gap-2.5 pl-[22px] pt-2.5">
                          {visibleFields.length === 0 ? (
                            <div className="py-2 text-center">
                              <p className="text-[10px] text-muted-foreground">无配置项</p>
                            </div>
                          ) : (
                            visibleFields.map((childField) => (
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
                                fieldPath={`${fieldPath ?? field.key}[${index}].${childField.key}`}
                                defaultValueOverride={
                                  defaultItem && typeof defaultItem === "object" && !Array.isArray(defaultItem)
                                    ? (defaultItem as Record<string, unknown>)[childField.key]
                                    : undefined
                                }
                                imageConfigScope={imageConfigScope}
                                pageId={pageId}
                                onLaunchWhiteboard={onLaunchWhiteboard}
                                positionInstanceId={
                                  childField.positionable
                                    ? `${field.key}:${sortableId}:${childField.key}`
                                    : undefined
                                }
                                positionDomOccurrence={
                                  childField.positionable
                                    ? value
                                        .slice(0, index)
                                        .reduce((occurrence, previousItem) => {
                                          const previousField = getVisibleFields(previousItem).find(
                                            (candidate) =>
                                              candidate.positionable &&
                                              (candidate.positionable.key || candidate.key) ===
                                                (childField.positionable?.key || childField.key),
                                          );
                                          return previousField ? occurrence + 1 : occurrence;
                                        }, 0)
                                    : undefined
                                }
                              />
                            ))
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </ArrayItemHeader>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-foreground/20 bg-black/40 py-6 text-center">
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
        <div className="flex pt-0">
          <AddMenu field={field} value={value} onSelect={handleAdd} />
        </div>
      )}
    </div>
  );
}
