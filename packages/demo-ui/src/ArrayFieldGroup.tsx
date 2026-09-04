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
import type { ConfigBreadcrumb, ConfigChangeMeta, ConfigCommentTarget, ConfigItemCapabilities, ConfigItemDetailHandler, DesignSpecEntryLink, ImageConfigScope, WhiteboardLauncher } from "./types";
import type { MarkdownReferenceClickHandler, MarkdownReferenceContext, MarkdownReferenceProvider } from "./DocumentEditor";

function getFieldDefault(field: FieldConfig): unknown {
  if (field.default !== undefined) return field.default;
  if (field.type === "array") return [];
  if (field.type === "object") return {};
  return "";
}

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
      item[f.key] = getFieldDefault(f);
    }
    return item;
  }

  if (field.children) {
    const item: Record<string, unknown> = {};
    for (const f of field.children) {
      item[f.key] = getFieldDefault(f);
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
  const itemTitleTemplate = field.itemTitleTemplate;
  if (itemTitleTemplate) {
    const oneBasedIndex = index + 1;
    return itemTitleTemplate
      .replace(/\{index\}/g, String(oneBasedIndex).padStart(2, "0"))
      .replace(/\{index1\}/g, String(oneBasedIndex));
  }

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

function getItemIdentity(item: Record<string, unknown>): string {
  for (const key of ["id", "key", "uid", "uuid"]) {
    const value = item[key];
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      if (normalized) return `id:${key}:${normalized}`;
    }
  }
  try {
    return `json:${JSON.stringify(item)}`;
  } catch {
    return "json:[unserializable]";
  }
}

function reconcileItemIds(
  previousIds: string[],
  previousItems: Record<string, unknown>[],
  nextItems: Record<string, unknown>[],
  createId: () => string,
): string[] {
  const availableByIdentity = new Map<string, string[]>();
  previousItems.forEach((item, index) => {
    const id = previousIds[index];
    if (!id) return;
    const identity = getItemIdentity(item);
    const ids = availableByIdentity.get(identity) ?? [];
    ids.push(id);
    availableByIdentity.set(identity, ids);
  });

  const used = new Set<string>();
  const nextIds = nextItems.map((item, index) => {
    const identity = getItemIdentity(item);
    const ids = availableByIdentity.get(identity);
    const matched = ids?.find((id) => !used.has(id));
    if (matched) {
      used.add(matched);
      return matched;
    }

    // A field edit changes the JSON fingerprint. Preserve the same-position
    // ID in that case so an open Sheet route keeps targeting the edited item.
    const samePosition = previousIds[index];
    if (samePosition && !used.has(samePosition)) {
      used.add(samePosition);
      return samePosition;
    }

    const created = createId();
    used.add(created);
    return created;
  });
  return nextIds;
}

function ArrayItemHeader({
  field,
  item,
  index,
  sortableId,
  sortable = false,
  isOpen,
  onToggle,
  onOpenDetail,
  onRemove,
  readonly,
  children,
}: {
  field: FieldConfig;
  item: Record<string, unknown>;
  index: number;
  sortableId: string;
  sortable?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onOpenDetail?: () => void;
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
  } = useSortable({ id: sortableId, disabled: !sortable });

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
      <div className="group flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {!readonly && sortable && (
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
            className="flex min-w-0 flex-1 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onOpenDetail ?? onToggle}
            aria-expanded={onOpenDetail ? undefined : isOpen}
            aria-haspopup={onOpenDetail ? "dialog" : undefined}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-foreground/40 transition-transform duration-200",
                onOpenDetail ? "-rotate-90" : !isOpen && "-rotate-90",
              )}
            />
            <span className="truncate text-sm font-normal leading-5 text-foreground">{title}</span>
          </button>
        </div>

        {!readonly && (
          <div className="pointer-events-none flex shrink-0 items-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
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
  onChange: (value: Record<string, unknown>[], meta?: ConfigChangeMeta) => void;
  sessionId?: string;
  readonly?: boolean;
  fieldPath?: string;
  /** Canonical schema path without array indexes, shared by design-spec refs. */
  schemaFieldPath?: string;
  defaultValueOverride?: unknown;
  imageConfigScope?: ImageConfigScope;
  pageId?: string;
  configContextPageId?: string;
  onLaunchWhiteboard?: WhiteboardLauncher;
  configItemCapabilities?: ConfigItemCapabilities;
  onEditConfigDefinition?: (fieldKey: string, field: FieldConfig) => void;
  onAddConfigComment?: (target: ConfigCommentTarget, trigger?: HTMLElement | null) => void;
  hasConfigComment?: (target: ConfigCommentTarget) => boolean;
  designSpecEntries?: DesignSpecEntryLink[];
  onEditDesignSpec?: (docId: string, entryId: string) => void;
  onOpenDesignSpec?: (spec: DesignSpecEntryLink, fieldTitle: string, anchor?: { top: number; bottom: number }, trigger?: HTMLElement | null) => void;
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  onOpenItemDetail?: ConfigItemDetailHandler;
  activeItemDetailId?: string | null;
  activeItemDetailFieldPath?: string;
  onItemDetailInvalidated?: (itemId: string) => void;
  breadcrumb?: ConfigBreadcrumb[];
  arrayDepth?: number;
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
  schemaFieldPath,
  defaultValueOverride,
  imageConfigScope,
  pageId,
  configContextPageId,
  onLaunchWhiteboard,
  configItemCapabilities,
  onEditConfigDefinition,
  onAddConfigComment,
  hasConfigComment,
  designSpecEntries,
  onEditDesignSpec,
  onOpenDesignSpec,
  referenceContext,
  referenceProvider,
  onReferenceClick,
  onOpenItemDetail,
  activeItemDetailId,
  activeItemDetailFieldPath,
  onItemDetailInvalidated,
  breadcrumb = [],
  arrayDepth = 1,
}: ArrayFieldGroupProps) {
  // Sorting is an explicit schema capability. Parent and child arrays each
  // make their own declaration, so a nested hierarchy never inherits the
  // parent's sort policy.
  const sortable = field.sortable === true;
  const sortableIdSequenceRef = useRef(0);
  const createSortableId = useCallback(
    () => `${field.key}-sortable-${sortableIdSequenceRef.current++}`,
    [field.key],
  );
  const [itemIds, setItemIds] = useState(() => value.map(createSortableId));
  const itemIdsRef = useRef(itemIds);
  itemIdsRef.current = itemIds;
  const previousItemsRef = useRef(value);
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

  // 保持拖拽标识与项本身绑定，而不是绑定数组位置。外部协同或恢复默认
  // 可能在不改变数组长度的情况下重排数据，因此按业务 id / 内容指纹复用
  // 标识；字段编辑在无法匹配指纹时回退到原位置，避免打开的 Sheet 失联。
  useEffect(() => {
    const previousItems = previousItemsRef.current;
    setItemIds((previousIds) => {
      const nextIds = reconcileItemIds(previousIds, previousItems, value, createSortableId);
      return nextIds.every((id, index) => id === previousIds[index])
        ? previousIds
        : nextIds;
    });
    previousItemsRef.current = value;
  }, [value, createSortableId]);

  useEffect(() => {
    if (
      !activeItemDetailId ||
      !onItemDetailInvalidated ||
      (fieldPath ?? field.key) !== activeItemDetailFieldPath ||
      itemIds.includes(activeItemDetailId)
    ) return;
    onItemDetailInvalidated(activeItemDetailId);
  }, [activeItemDetailFieldPath, activeItemDetailId, field.key, fieldPath, itemIds, onItemDetailInvalidated]);

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
      const removedId = itemIdsRef.current[index];
      if (removedId) onItemDetailInvalidated?.(removedId);
      onChange(newValue);
    },
    [value, onChange, onItemDetailInvalidated],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!sortable) return;
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
    [itemIds, value, onChange, sortable],
  );

  const valueRef = useRef(value);
  valueRef.current = value;

  const handleItemFieldChange = useCallback(
    (index: number, key: string, newVal: unknown, meta?: ConfigChangeMeta, itemId?: string) => {
      const newValue = [...valueRef.current];
      const currentIndex = itemId
        ? itemIdsRef.current.indexOf(itemId)
        : index;
      if (currentIndex < 0 || currentIndex >= newValue.length) return;
      const item = { ...newValue[currentIndex], [key]: newVal };
      newValue[currentIndex] = item;
      onChange(newValue, meta);
    },
    [onChange],
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

  const getSchemaChildPath = (childKey: string, item: Record<string, unknown>): string => {
    const parentPath = schemaFieldPath ?? field.key;
    if (field.oneOf) {
      const discriminator = field.oneOf.discriminator;
      const variantValue = item[discriminator];
      const marker = `${discriminator}=${String(variantValue)}`;
      return `${parentPath}[${marker}].${childKey}`;
    }
    return `${parentPath}[].${childKey}`;
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
                const title = getItemTitle(field, item, index);
                const detailPresentation = field.detailPresentation ?? "inline";
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
                    sortable={sortable}
                    isOpen={isOpen}
                    onToggle={() => toggleItem(index)}
                    onOpenDetail={
                      onOpenItemDetail && detailPresentation === "sheet"
                        ? () => onOpenItemDetail({
                            field,
                            item,
                            index,
                            itemId: sortableId,
                            fieldPath: fieldPath ?? field.key,
                            schemaFieldPath: schemaFieldPath ?? field.key,
                            title,
                            level: arrayDepth + 1,
                            breadcrumb: [
                              ...breadcrumb,
                              {
                                id: `${fieldPath ?? field.key}:items`,
                                label: field.detailBreadcrumbTitle ?? field.title,
                                level: arrayDepth + 1,
                              },
                              { id: sortableId, label: title, level: arrayDepth + 2 },
                            ],
                            getCurrentIndex: () => itemIdsRef.current.indexOf(sortableId),
                            getCurrentItem: () => {
                              const currentIndex = itemIdsRef.current.indexOf(sortableId);
                              return currentIndex >= 0 ? valueRef.current[currentIndex] : undefined;
                            },
                            onChangeField: (key, newVal, meta) =>
                              handleItemFieldChange(index, key, newVal, meta, sortableId),
                          })
                        : undefined
                    }
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
                                onChange={(val, meta) =>
                                  handleItemFieldChange(
                                    index,
                                    childField.key,
                                    val,
                                    meta,
                                    sortableId,
                                  )
                                }
                                sessionId={sessionId}
                                readonly={readonly}
                                embedded
                                fieldPath={`${fieldPath ?? field.key}[${index}].${childField.key}`}
                                schemaFieldPath={getSchemaChildPath(childField.key, item)}
                                defaultValueOverride={
                                  defaultItem && typeof defaultItem === "object" && !Array.isArray(defaultItem)
                                    ? (defaultItem as Record<string, unknown>)[childField.key]
                                    : undefined
                                }
                                imageConfigScope={imageConfigScope}
                                pageId={pageId}
                                configContextPageId={configContextPageId}
                                onLaunchWhiteboard={onLaunchWhiteboard}
                                configItemCapabilities={configItemCapabilities}
                                onEditConfigDefinition={onEditConfigDefinition}
                                onAddConfigComment={onAddConfigComment}
                                hasConfigComment={hasConfigComment}
                                designSpecEntries={designSpecEntries}
                                onEditDesignSpec={onEditDesignSpec}
                                onOpenDesignSpec={onOpenDesignSpec}
                                referenceContext={referenceContext}
                                referenceProvider={referenceProvider}
                                onReferenceClick={onReferenceClick}
                                onOpenItemDetail={onOpenItemDetail}
                                activeItemDetailId={activeItemDetailId}
                                activeItemDetailFieldPath={activeItemDetailFieldPath}
                                onItemDetailInvalidated={onItemDetailInvalidated}
                                breadcrumb={[
                                  ...breadcrumb,
                                  { id: sortableId, label: title, level: arrayDepth + 1 },
                                ]}
                                arrayDepth={arrayDepth + 1}
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
