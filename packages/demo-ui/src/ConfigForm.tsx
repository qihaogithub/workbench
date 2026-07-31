"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, Info, Pencil, Sparkles } from "lucide-react";
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
import { getPageTypeLimits } from "./type-limits-store";
import { FieldRenderer } from "./FieldRenderer";
import { NoteDialog } from "./NoteDialog";
import { getPositionable } from "./validator";
import { Button } from "@/components/ui/button";
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

function PositionControl({
  positionable,
  positions,
  defaultPositions,
  titleMap,
  onPositionsChange,
  previewSize,
  itemSizes,
  onEnterPositionEdit,
  onExitPositionEdit,
  positionEditActive,
  dimming,
  onToggleDimming,
}: {
  positionable: { items: string[]; defaults?: Record<string, { x: number; y: number }>; size?: { width: number; height: number } };
  positions: Record<string, { x: number; y: number }>;
  defaultPositions: Record<string, { x: number; y: number }>;
  titleMap: Record<string, string>;
  onPositionsChange: (newPositions: Record<string, { x: number; y: number }>) => void;
  previewSize?: { width?: number | string; height?: number | string };
  itemSizes?: Record<string, { width: number; height: number }>;
  onEnterPositionEdit?: (items: string[], positions: Record<string, { x: number; y: number }>) => void;
  onExitPositionEdit?: () => void;
  positionEditActive?: boolean;
  dimming?: boolean;
  onToggleDimming?: () => void;
}) {
  const [open, setOpen] = useState(true);

  const containerWidth =
    positionable.size?.width ??
    (typeof previewSize?.width === "number" ? previewSize.width : 800);
  const containerHeight =
    positionable.size?.height ??
    (typeof previewSize?.height === "number" ? previewSize.height : 600);

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

  const handleToggleEdit = () => {
    if (positionEditActive) {
      onExitPositionEdit?.();
    } else {
      onEnterPositionEdit?.(positionable.items, positions);
    }
  };

  const isDefault = JSON.stringify(positions) === JSON.stringify(defaultPositions);

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
            {/* 模式状态栏 + 编辑位置按钮 */}
            <div className="space-y-2">
              {positionEditActive && (
                <div className="flex items-center justify-between gap-2 bg-accent/20 rounded px-2 py-1.5">
                  <span className="text-xs font-medium text-foreground">位置编辑中</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={dimming ?? true}
                        onChange={() => onToggleDimming?.()}
                        className="h-3 w-3 cursor-pointer accent-primary"
                      />
                      置灰
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => onExitPositionEdit?.()}
                    >
                      完成
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
                <span>容器: {containerWidth} × {containerHeight} px</span>
                {!positionEditActive && onEnterPositionEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={handleToggleEdit}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    编辑
                  </Button>
                )}
              </div>
            </div>

            {/* 坐标输入 */}
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
  sessionId,
  positionableItemSizes,
  configCategoryFilter,
  typeLimits,
  className,
  onEnterPositionEdit,
  onExitPositionEdit,
  positionEditActive,
  positionEditDimming,
  onTogglePositionDimming,
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

  const fieldGroups = useMemo(() => parseSchemaToFields(schema, typeLimits || getPageTypeLimits()), [schema, typeLimits]);
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

  const titleMapPos = useMemo(() => buildTitleMap(positionable?.items), [positionable, buildTitleMap]);

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
        if (
          "__positions" in initialData &&
          !areConfigValuesEqual(prev.__positions, initialData.__positions)
        ) {
          merged.__positions = initialData.__positions;
          changed = true;
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
      setFormData((prev) => {
        if (value === undefined || value === null) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: value };
      });
      onChange({ [key]: value ?? null });
    },
    [onChange]
  );

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

  const hasVisiblePositionable =
    showLayoutControls && !!positionable && positionable.items.length >= 1;
  const hasVisibleConfig =
    visibleFieldGroups.length > 0 ||
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
                onEnterPositionEdit={onEnterPositionEdit}
                onExitPositionEdit={onExitPositionEdit}
                positionEditActive={positionEditActive}
                dimming={positionEditDimming}
                onToggleDimming={onTogglePositionDimming}
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
