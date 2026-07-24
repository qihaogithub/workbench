"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowRight,
  Info,
  Sparkles,
  GripVertical,
  Move,
} from "lucide-react";
import { cn } from "./utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ConfigFormProps } from "./types";
import type { FieldConfig, FieldGroup, VisibleWhenCondition } from "./schema-parser";
import { parseSchemaToFields } from "./schema-parser";
import { FieldRenderer } from "./FieldRenderer";
import { NoteDialog } from "./NoteDialog";
import { getOrderable, getOrderableHorizontal, getPositionable } from "./validator";
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
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { configFieldMatchesCategoryFilter } from "./config-categories";

function isFieldVisible(
  field: FieldConfig,
  formData: Record<string, unknown>,
): boolean {
  if (!field.visibleWhen) return true;
  return Object.is(formData[field.visibleWhen.field], field.visibleWhen.equals);
}

function buildEffectiveFormData(
  fieldGroups: FieldGroup[],
  formData: Record<string, unknown>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const group of fieldGroups) {
    for (const field of group.fields) {
      if (field.default !== undefined) {
        defaults[field.key] = field.default;
      }
    }
  }
  return { ...defaults, ...formData };
}

function areConfigValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => areConfigValuesEqual(item, right[index]))
    );
  }

  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) => areConfigValuesEqual(left[key], right[key]))
    );
  }

  return false;
}

function areConfigRecordsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => areConfigValuesEqual(left[key], right[key]))
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function FieldGroupSection({
  group,
  formData,
  onChange,
  isFirst,
  sessionId,
  readonly,
  onNoteClick,
}: {
  group: FieldGroup;
  formData: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  isFirst?: boolean;
  sessionId?: string;
  readonly?: boolean;
  onNoteClick: (fieldKey: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="py-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-accent/30 rounded-sm transition-colors">
            <span>
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform rotate-180" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
              )}
            </span>
            <h3 className="text-sm font-medium text-muted-foreground">{group.title}</h3>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-1 pl-6 pr-2 pt-1 pb-1">
            {group.fields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={formData[field.key]}
                onChange={(value) => onChange(field.key, value)}
                sessionId={sessionId}
                readonly={readonly}
                onNoteClick={onNoteClick}
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
  onMoveBackward,
  onMoveForward,
  direction = "vertical",
}: {
  id: string;
  title: string;
  index: number;
  total: number;
  onMoveBackward: () => void;
  onMoveForward: () => void;
  direction?: "vertical" | "horizontal";
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

  const BackwardIcon = direction === "vertical" ? ChevronUp : ChevronLeft;
  const ForwardIcon = direction === "vertical" ? ChevronDown : ChevronRight;

  if (direction === "horizontal") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`group inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border transition-all duration-150 ${
          isDragging
            ? "bg-accent/50 shadow-sm border-accent"
            : "bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-border"
        }`}
      >
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground shrink-0 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-medium text-foreground truncate max-w-[80px]">
          {title}
        </span>
        <div className="flex items-center gap-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMoveBackward();
            }}
          >
            <BackwardIcon className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            disabled={index === total - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveForward();
            }}
          >
            <ForwardIcon className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 py-2 px-2 rounded-lg border transition-all duration-150 ${
        isDragging
          ? "bg-accent/50 shadow-md border-accent"
          : "bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-border"
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground shrink-0 touch-none p-0.5"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">
        {index + 1}
      </span>
      <span className="text-xs font-medium text-foreground flex-1 truncate">
        {title}
      </span>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation();
            onMoveBackward();
          }}
        >
          <BackwardIcon className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          disabled={index === total - 1}
          onClick={(e) => {
            e.stopPropagation();
            onMoveForward();
          }}
        >
          <ForwardIcon className="h-3 w-3" />
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
  direction = "vertical",
}: {
  orderable: string[];
  order: string[];
  defaultOrder: string[];
  titleMap: Record<string, string>;
  onOrderChange: (newOrder: string[]) => void;
  direction?: "vertical" | "horizontal";
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

  const handleMoveBackward = (index: number) => {
    if (index <= 0) return;
    const newOrder = [...order];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    onOrderChange(newOrder);
  };

  const handleMoveForward = (index: number) => {
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
  const sectionTitle = direction === "vertical" ? "组件排序" : "横向排序";
  const strategy = direction === "vertical" ? verticalListSortingStrategy : horizontalListSortingStrategy;
  const DirectionIcon = direction === "vertical" ? ArrowDown : ArrowRight;
  const directionLabel = direction === "vertical" ? "从上到下排列" : "从左到右排列";

  return (
    <div className="py-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-accent/30 rounded-sm transition-colors">
            <span>
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform rotate-180" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
              )}
            </span>
            <h3 className="text-sm font-medium text-muted-foreground">{sectionTitle}</h3>
            <Badge variant="secondary" className="text-xs h-5 font-normal px-1.5 min-w-[20px] justify-center">
              {orderable.length}
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-4 pr-2 pt-1 pb-2">
            {/* Direction indicator */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-2">
              <DirectionIcon className="h-3 w-3" />
              <span>{directionLabel}</span>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={order}
                strategy={strategy}
              >
                {direction === "vertical" ? (
                  <div className="space-y-1">
                    {order.map((key, index) => (
                      <SortableItem
                        key={key}
                        id={key}
                        title={titleMap[key] || key}
                        index={index}
                        total={order.length}
                        onMoveBackward={() => handleMoveBackward(index)}
                        onMoveForward={() => handleMoveForward(index)}
                        direction="vertical"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    {order.map((key, index) => (
                      <div key={key} className="flex items-center gap-1">
                        {index > 0 && (
                          <span className="text-muted-foreground/30 text-[10px] select-none">→</span>
                        )}
                        <SortableItem
                          id={key}
                          title={titleMap[key] || key}
                          index={index}
                          total={order.length}
                          onMoveBackward={() => handleMoveBackward(index)}
                          onMoveForward={() => handleMoveForward(index)}
                          direction="horizontal"
                        />
                      </div>
                    ))}
                  </div>
                )}
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

function PositionControl({
  positionable,
  positions,
  defaultPositions,
  titleMap,
  onPositionsChange,
  previewSize,
  itemSizes,
}: {
  positionable: { items: string[]; defaults?: Record<string, { x: number; y: number }>; size?: { width: number; height: number } };
  positions: Record<string, { x: number; y: number }>;
  defaultPositions: Record<string, { x: number; y: number }>;
  titleMap: Record<string, string>;
  onPositionsChange: (newPositions: Record<string, { x: number; y: number }>) => void;
  previewSize?: { width?: number | string; height?: number | string };
  itemSizes?: Record<string, { width: number; height: number }>;
}) {
  const [open, setOpen] = useState(true);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Calculate canvas dimensions based on positionable.size if provided, otherwise previewSize
  const MAX_CANVAS_WIDTH = 280;
  const MAX_CANVAS_HEIGHT = 200;
  const containerWidth =
    positionable.size?.width ??
    (typeof previewSize?.width === "number" ? previewSize.width : 800);
  const containerHeight =
    positionable.size?.height ??
    (typeof previewSize?.height === "number" ? previewSize.height : 600);
  const aspectRatio = containerWidth / containerHeight;

  let CANVAS_WIDTH: number, CANVAS_HEIGHT: number;
  if (MAX_CANVAS_WIDTH / aspectRatio <= MAX_CANVAS_HEIGHT) {
    CANVAS_WIDTH = MAX_CANVAS_WIDTH;
    CANVAS_HEIGHT = Math.round(MAX_CANVAS_WIDTH / aspectRatio);
  } else {
    CANVAS_HEIGHT = MAX_CANVAS_HEIGHT;
    CANVAS_WIDTH = Math.round(MAX_CANVAS_HEIGHT * aspectRatio);
  }

  // Scale factor: canvas pixels → container pixels
  const scaleFactor = CANVAS_WIDTH / containerWidth;

  const handleCanvasMouseDown = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingKey(key);
  };

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingKey || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const canvasX = Math.max(0, Math.min(e.clientX - rect.left, CANVAS_WIDTH));
      const canvasY = Math.max(0, Math.min(e.clientY - rect.top, CANVAS_HEIGHT));
      let x = Math.round(canvasX / scaleFactor);
      let y = Math.round(canvasY / scaleFactor);
      // 根据元素尺寸约束有效拖拽范围
      const elementWidth = itemSizes?.[draggingKey]?.width ?? 0;
      const elementHeight = itemSizes?.[draggingKey]?.height ?? 0;
      const maxX = containerWidth - elementWidth;
      const maxY = containerHeight - elementHeight;
      x = Math.max(0, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      onPositionsChange({ ...positions, [draggingKey]: { x, y } });
    },
    [draggingKey, positions, onPositionsChange, scaleFactor, CANVAS_WIDTH, CANVAS_HEIGHT, containerWidth, containerHeight, itemSizes],
  );

  const handleCanvasMouseUp = useCallback(() => {
    setDraggingKey(null);
  }, []);

  const handleCoordChange = (key: string, axis: "x" | "y", value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    const elementWidth = itemSizes?.[key]?.width ?? 0;
    const elementHeight = itemSizes?.[key]?.height ?? 0;
    const maxVal = axis === "x" ? containerWidth - elementWidth : containerHeight - elementHeight;
    onPositionsChange({
      ...positions,
      [key]: { ...positions[key], [axis]: Math.max(0, Math.min(num, maxVal)) },
    });
  };

  const handleReset = () => {
    const reset: Record<string, { x: number; y: number }> = {};
    for (const key of positionable.items) {
      reset[key] = defaultPositions[key] || { x: 0, y: 0 };
    }
    onPositionsChange(reset);
  };

  const isDefault = JSON.stringify(positions) === JSON.stringify(defaultPositions);

  // Grid lines at regular intervals in container space (100px)
  const gridInterval = 100;
  const canvasGridInterval = gridInterval * scaleFactor;

  return (
    <div className="py-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-accent/30 rounded-sm transition-colors">
            <span>
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform rotate-180" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
              )}
            </span>
            <h3 className="text-sm font-medium text-muted-foreground">元素定位</h3>
            <Badge variant="secondary" className="text-xs h-5 font-normal px-1.5 min-w-[20px] justify-center">
              {positionable.items.length}
            </Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-4 pr-2 pt-1 pb-2 space-y-2">
            {/* Container info */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
              <span>容器: {containerWidth} × {containerHeight} px</span>
              <span>坐标相对于容器左上角</span>
            </div>

            {/* Mini canvas (scaled representation of the parent container) */}
            <div
              ref={canvasRef}
              className="relative border border-border rounded-md bg-muted/20 cursor-crosshair"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            >
              {/* Grid lines (based on container space) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.15 }}>
                {Array.from({ length: Math.floor(containerWidth / gridInterval) }, (_, i) => (
                  <line key={`v${i}`} x1={(i + 1) * canvasGridInterval} y1={0} x2={(i + 1) * canvasGridInterval} y2={CANVAS_HEIGHT} stroke="currentColor" strokeWidth={0.5} />
                ))}
                {Array.from({ length: Math.floor(containerHeight / gridInterval) }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={(i + 1) * canvasGridInterval} x2={CANVAS_WIDTH} y2={(i + 1) * canvasGridInterval} stroke="currentColor" strokeWidth={0.5} />
                ))}
              </svg>

              {/* Draggable items (positions scaled from container to canvas) */}
              {positionable.items.map((key) => {
                const pos = positions[key] || { x: 0, y: 0 };
                const canvasX = pos.x * scaleFactor;
                const canvasY = pos.y * scaleFactor;
                const size = itemSizes?.[key];
                // 按比例渲染元素实际形状
                const canvasW = size ? size.width * scaleFactor : undefined;
                const canvasH = size ? size.height * scaleFactor : undefined;
                const hasSize = size && size.width > 0 && size.height > 0;
                return (
                  <div
                    key={key}
                    className={`absolute flex items-center justify-center text-[10px] font-medium border cursor-grab active:cursor-grabbing select-none transition-shadow ${
                      draggingKey === key
                        ? "bg-primary/20 text-primary border-primary shadow-md z-10"
                        : "bg-background/80 text-foreground border-border shadow-sm hover:border-primary/50"
                    }`}
                    style={{
                      left: canvasX,
                      top: canvasY,
                      ...(hasSize ? { width: canvasW, height: canvasH } : { padding: '2px 6px' }),
                      borderRadius: 2,
                    }}
                    onMouseDown={(e) => handleCanvasMouseDown(key, e)}
                  >
                    {hasSize ? (
                      <span className="truncate overflow-hidden text-center leading-none" style={{ fontSize: Math.min(10, (canvasW ?? 60) / (titleMap[key]?.length ?? 4) * 1.5) }}>{titleMap[key] || key}</span>
                    ) : (
                      <span className="truncate max-w-[60px]">{titleMap[key] || key}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Coordinate inputs */}
            <div className="space-y-1">
              {positionable.items.map((key) => {
                const pos = positions[key] || { x: 0, y: 0 };
                const elementWidth = itemSizes?.[key]?.width ?? 0;
                const elementHeight = itemSizes?.[key]?.height ?? 0;
                const maxX = containerWidth - elementWidth;
                const maxY = containerHeight - elementHeight;
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-[70px] truncate" title={titleMap[key] || key}>
                      {titleMap[key] || key}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground/60 w-3">X</span>
                      <Input
                        type="number"
                        value={pos.x}
                        onChange={(e) => handleCoordChange(key, "x", e.target.value)}
                        className="h-6 w-16 text-xs px-1.5"
                        min={0}
                        max={maxX}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground/60 w-3">Y</span>
                      <Input
                        type="number"
                        value={pos.y}
                        onChange={(e) => handleCoordChange(key, "y", e.target.value)}
                        className="h-6 w-16 text-xs px-1.5"
                        min={0}
                        max={maxY}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {!isDefault && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleReset}
              >
                恢复默认位置
              </Button>
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
  onSchemaChange,
  initialData,
  readonly,
  className,
  sessionId,
  positionableItemSizes,
  configCategoryFilter,
}: ConfigFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(
    initialData || {},
  );
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const [noteDialogField, setNoteDialogField] = useState<string | null>(null);

  console.log(
    "[ConfigForm] Rendered with schema length:",
    schema?.length,
    "initialData keys:",
    Object.keys(initialData || {}),
  );

  const fieldGroups = useMemo(() => parseSchemaToFields(schema), [schema]);
  const effectiveFormData = useMemo(
    () => buildEffectiveFormData(fieldGroups, formData),
    [fieldGroups, formData],
  );
  const visibleFieldGroups = useMemo(
    () =>
      fieldGroups
        .map((group) => ({
          ...group,
          fields: group.fields.filter((field) =>
            isFieldVisible(field, effectiveFormData) &&
            configFieldMatchesCategoryFilter(field, configCategoryFilter),
          ),
        }))
        .filter((group) => group.fields.length > 0),
    [fieldGroups, effectiveFormData, configCategoryFilter],
  );

  const orderable = useMemo(() => getOrderable(schema), [schema]);
  const orderableH = useMemo(() => getOrderableHorizontal(schema), [schema]);
  const positionable = useMemo(() => getPositionable(schema), [schema]);
  const showLayoutControls = !configCategoryFilter;

  const previewSize = useMemo(() => {
    try {
      const parsed = JSON.parse(schema);
      return parsed.$demo?.previewSize as { width?: number | string; height?: number | string } | undefined;
    } catch {
      return undefined;
    }
  }, [schema]);

  const buildTitleMap = useCallback((keys: string[] | undefined) => {
    if (!keys) return {};
    try {
      const parsed = JSON.parse(schema);
      const properties = parsed.properties || {};
      const map: Record<string, string> = {};
      for (const key of keys) {
        const prop = properties[key] as { title?: string } | undefined;
        map[key] = prop?.title || formatFieldName(key);
      }
      return map;
    } catch {
      return {};
    }
  }, [schema]);

  const titleMap = useMemo(() => buildTitleMap(orderable), [orderable, buildTitleMap]);
  const titleMapH = useMemo(() => buildTitleMap(orderableH), [orderableH, buildTitleMap]);
  const titleMapPos = useMemo(() => buildTitleMap(positionable?.items), [positionable, buildTitleMap]);

  const currentOrder = useMemo(() => {
    if (!orderable) return [];
    const existing = formData.__order as string[] | undefined;
    if (Array.isArray(existing) && existing.length === orderable.length) {
      return existing;
    }
    return [...orderable];
  }, [orderable, formData.__order]);

  const currentOrderH = useMemo(() => {
    if (!orderableH) return [];
    const existing = formData.__orderH as string[] | undefined;
    if (Array.isArray(existing) && existing.length === orderableH.length) {
      return existing;
    }
    return [...orderableH];
  }, [orderableH, formData.__orderH]);

  const currentPositions = useMemo(() => {
    if (!positionable) return {};
    const existing = formData.__positions as Record<string, { x: number; y: number }> | undefined;
    const result: Record<string, { x: number; y: number }> = {};
    for (const key of positionable.items) {
      result[key] = existing?.[key] || positionable.defaults?.[key] || { x: 0, y: 0 };
    }
    return result;
  }, [positionable, formData.__positions]);

  const defaultPositions = useMemo(() => {
    if (!positionable) return {};
    const result: Record<string, { x: number; y: number }> = {};
    for (const key of positionable.items) {
      result[key] = positionable.defaults?.[key] || { x: 0, y: 0 };
    }
    return result;
  }, [positionable]);

  console.log(
    "[ConfigForm] Parsed field groups:",
    fieldGroups.length,
    "groups",
  );

  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      console.log("[ConfigForm] initialData changed, syncing...");
      setFormData((prev) => {
        const merged = { ...prev };
        let changed = false;
        for (const [key, value] of Object.entries(initialData)) {
          if (!(key in merged)) {
            merged[key] = value;
            changed = true;
          }
        }
        if (!changed) return prev;
        console.log(
          "[ConfigForm] Merged formData after initialData sync:",
          merged,
        );
        return merged;
      });
    }
  }, [initialData]);

  useEffect(() => {
    console.log("[ConfigForm] Schema changed, reinitializing form...");
    if (schema) {
      try {
        const parsed = JSON.parse(schema);
        console.log(
          "[ConfigForm] Schema parsed successfully, keys:",
          Object.keys(parsed.properties || {}),
        );
        const properties = parsed.properties || {};
        const required = parsed.required || [];

        const newDefaults: Record<string, unknown> = {};
        Object.entries(properties).forEach(([key, prop]: [string, any]) => {
          newDefaults[key] =
            prop.default ?? (required.includes(key) ? "" : undefined);
        });

        console.log("[ConfigForm] New defaults from schema:", newDefaults);
        setFormData((prev) => {
          const merged = {
            ...newDefaults,
            ...prev,
          };
          if (areConfigRecordsEqual(prev, merged)) return prev;
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
  }, [schema]);

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      const newData = { ...formDataRef.current, [key]: value };
      setFormData(newData);
      onChange({ [key]: value });
    },
    [onChange]
  );

  const handleOrderChange = useCallback((newOrder: string[]) => {
    const newData = { ...formDataRef.current, __order: newOrder };
    setFormData(newData);
    onChange({ __order: newOrder });
  }, [onChange]);

  const handleOrderHChange = useCallback((newOrder: string[]) => {
    const newData = { ...formDataRef.current, __orderH: newOrder };
    setFormData(newData);
    onChange({ __orderH: newOrder });
  }, [onChange]);

  const handlePositionsChange = useCallback((newPositions: Record<string, { x: number; y: number }>) => {
    const newData = { ...formDataRef.current, __positions: newPositions };
    setFormData(newData);
    onChange({ __positions: newPositions });
  }, [onChange]);

  const updateSchemaNote = useCallback(
    (fieldKey: string, noteHtml: string) => {
      if (!onSchemaChange || !schema) return;
      try {
        const parsed = JSON.parse(schema);
        if (parsed.properties?.[fieldKey]) {
          if (!parsed.properties[fieldKey].$demo) {
            parsed.properties[fieldKey].$demo = {};
          }
          parsed.properties[fieldKey].$demo.note = noteHtml;
          onSchemaChange(JSON.stringify(parsed, null, 2));
        }
      } catch (e) {
        console.warn("[ConfigForm] Failed to update schema note:", e);
      }
    },
    [schema, onSchemaChange],
  );

  const deleteSchemaNote = useCallback(
    (fieldKey: string) => {
      if (!onSchemaChange || !schema) return;
      try {
        const parsed = JSON.parse(schema);
        if (parsed.properties?.[fieldKey]?.$demo) {
          delete parsed.properties[fieldKey].$demo.note;
          if (Object.keys(parsed.properties[fieldKey].$demo).length === 0) {
            delete parsed.properties[fieldKey].$demo;
          }
          onSchemaChange(JSON.stringify(parsed, null, 2));
        }
      } catch (e) {
        console.warn("[ConfigForm] Failed to delete schema note:", e);
      }
    },
    [schema, onSchemaChange],
  );

  const handleNoteClick = useCallback((fieldKey: string) => {
    setNoteDialogField(fieldKey);
  }, []);

  const currentNoteField = useMemo(() => {
    if (!noteDialogField) return null;
    for (const group of visibleFieldGroups) {
      const found = group.fields.find((f) => f.key === noteDialogField);
      if (found) return found;
    }
    return null;
  }, [noteDialogField, visibleFieldGroups]);

  const hasVisibleOrderable =
    showLayoutControls && !!orderable && orderable.length >= 2;
  const hasVisibleOrderableH =
    showLayoutControls && !!orderableH && orderableH.length >= 2;
  const hasVisiblePositionable =
    showLayoutControls && !!positionable && positionable.items.length >= 1;
  const hasVisibleConfig =
    visibleFieldGroups.length > 0 ||
    hasVisibleOrderable ||
    hasVisibleOrderableH ||
    hasVisiblePositionable;

  if (!hasVisibleConfig) {
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
          {!configCategoryFilter
            ? "请检查 Schema 格式是否正确"
            : "当前分类下没有可配置字段"}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("h-full", className)}>
      <div className="h-full overflow-y-auto">
        <div className="px-1 pb-4">
          {hasVisibleOrderable && (
            <>
              <OrderControl
                orderable={orderable!}
                order={currentOrder}
                defaultOrder={orderable!}
                titleMap={titleMap}
                onOrderChange={handleOrderChange}
                direction="vertical"
              />
              <Separator className="my-2" />
            </>
          )}
          {hasVisibleOrderableH && (
            <>
              <OrderControl
                orderable={orderableH!}
                order={currentOrderH}
                defaultOrder={orderableH!}
                titleMap={titleMapH}
                onOrderChange={handleOrderHChange}
                direction="horizontal"
              />
              <Separator className="my-2" />
            </>
          )}
          {hasVisiblePositionable && (
            <>
              <PositionControl
                positionable={positionable!}
                positions={currentPositions}
                defaultPositions={defaultPositions}
                titleMap={titleMapPos}
                onPositionsChange={handlePositionsChange}
                previewSize={previewSize}
                itemSizes={positionableItemSizes}
              />
              <Separator className="my-2" />
            </>
          )}
          {visibleFieldGroups.map((group, index) => (
            <div key={index}>
              {index > 0 && <Separator className="my-2" />}
              <FieldGroupSection
                group={group}
                formData={effectiveFormData}
                onChange={handleFieldChange}
                isFirst={index === 0}
                sessionId={sessionId}
                readonly={readonly}
                onNoteClick={handleNoteClick}
              />
            </div>
          ))}
        </div>
      </div>

      {currentNoteField && (
        <NoteDialog
          open={!!noteDialogField}
          onOpenChange={(open) => {
            if (!open) setNoteDialogField(null);
          }}
          fieldTitle={currentNoteField.title}
          noteHtml={currentNoteField.note || ""}
          readonly={readonly}
          onSave={(html) => updateSchemaNote(currentNoteField.key, html)}
          onDelete={() => deleteSchemaNote(currentNoteField.key)}
        />
      )}
    </div>
  );
}
