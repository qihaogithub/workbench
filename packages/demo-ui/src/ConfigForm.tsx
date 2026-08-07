"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "./utils";
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
import { FieldRenderer, PositionConfigContext, type PositionConfigContextValue, type PositionFieldEntry } from "./FieldRenderer";
import { NoteDialog } from "./NoteDialog";
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

function computeFlattenPathMap(schema: string): Record<string, string> {
  try {
    const parsed = JSON.parse(schema);
    const properties = parsed.properties;
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
    const map: Record<string, string> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const p = prop as any;
      if (p?.type === "object" && p?.properties && typeof p.properties === "object" && !Array.isArray(p.properties)) {
        if (p.$demo?.positionable) continue;
        for (const nestedKey of Object.keys(p.properties)) {
          map[nestedKey] = key;
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

function flattenInitialData(
  data: Record<string, unknown>,
  pathMap: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const parentKeys = new Set(Object.values(pathMap));
  for (const [key, value] of Object.entries(data)) {
    if (parentKeys.has(key) && isPlainRecord(value)) {
      const nested = value as Record<string, unknown>;
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        result[nestedKey] = nestedValue;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
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

  if (group.title === "") {
    return (
      <div className="py-2">
        <div className="space-y-1 px-2 pt-1 pb-1">
          {group.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={formData[field.key]}
              onChange={(value) => onChange(field.key, value)}
              sessionId={sessionId}
              readonly={readonly}
              onNoteClick={onNoteClick}
              fieldPath={field.key}
            />
          ))}
        </div>
      </div>
    );
  }

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
                fieldPath={field.key}
              />
            ))}
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
    () => {
      if (!initialData) return {};
      const pathMap = computeFlattenPathMap(schema);
      return flattenInitialData(initialData, pathMap);
    },
  );

  const [noteDialogField, setNoteDialogField] = useState<string | null>(null);

  const flattenPathMap = useMemo(() => computeFlattenPathMap(schema), [schema]);
  const flattenedInitialData = useMemo(
    () => (initialData ? flattenInitialData(initialData, flattenPathMap) : undefined),
    [initialData, flattenPathMap],
  );

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

  const previewSize = useMemo(() => {
    try {
      const parsed = JSON.parse(schema);
      return parsed.$demo?.previewSize as { width?: number | string; height?: number | string } | undefined;
    } catch {
      return undefined;
    }
  }, [schema]);

  const positionRegistryRef = useRef(new Map<string, PositionFieldEntry>());
  const positionEditActiveRef = useRef(false);

  const registerPositionField = useCallback((entry: PositionFieldEntry) => {
    positionRegistryRef.current.set(entry.posKey, entry);
    return () => {
      positionRegistryRef.current.delete(entry.posKey);
    };
  }, []);

  const requestPositionEdit = useCallback(() => {
    const entries = Array.from(positionRegistryRef.current.values());
    const posKeys: string[] = entries.map((e) => e.posKey);
    const positions: Record<string, { x: number; y: number }> = {};
    const posKeyMap: Record<string, string> = {};
    for (const entry of entries) {
      positions[entry.posKey] = entry.currentValue;
      posKeyMap[entry.posKey] = entry.fieldPath;
    }
    positionEditActiveRef.current = true;
    onEnterPositionEdit?.(posKeys, positions, posKeyMap);
  }, [onEnterPositionEdit]);

  const exitPositionEdit = useCallback(() => {
    positionEditActiveRef.current = false;
    onExitPositionEdit?.();
  }, [onExitPositionEdit]);

  const positionConfigValue = useMemo((): PositionConfigContextValue => {
    return {
      registerPositionField,
      requestPositionEdit,
      exitPositionEdit,
      positionEditActive: positionEditActive ?? false,
      dimming: positionEditDimming ?? false,
      onToggleDimming: onTogglePositionDimming,
    };
  }, [
    registerPositionField,
    requestPositionEdit,
    exitPositionEdit,
    positionEditActive,
    positionEditDimming,
    onTogglePositionDimming,
  ]);

  const hasPositionEdit = !!onEnterPositionEdit; 

  console.log(
    "[ConfigForm] Parsed field groups:",
    fieldGroups.length,
    "groups",
  );

  useEffect(() => {
    if (flattenedInitialData && Object.keys(flattenedInitialData).length > 0) {
      setFormData((prev) => {
        const merged = { ...prev };
        let changed = false;
        for (const [key, value] of Object.entries(flattenedInitialData)) {
          if (!(key in merged) || !areConfigValuesEqual(merged[key], value)) {
            merged[key] = value;
            changed = true;
          }
        }
        if (!changed) return prev;
        return merged;
      });
    }
  }, [flattenedInitialData]);

  useEffect(() => {
    console.log("[ConfigForm] Schema changed, reinitializing form...");
    if (schema) {
      const newDefaults = buildEffectiveFormData(fieldGroups, {});
      const hasDefaults = Object.keys(newDefaults).length > 0;
      if (!hasDefaults) return;
      setFormData((prev) => {
        const merged = { ...newDefaults, ...prev };
        if (areConfigRecordsEqual(prev, merged)) return prev;
        console.log("[ConfigForm] Merged formData after schema change:", merged);
        return merged;
      });
    }
  }, [schema, fieldGroups]);

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

  if (visibleFieldGroups.length === 0) {
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
    <PositionConfigContext.Provider value={positionConfigValue}>
      <div className={cn("h-full", className)}>
        <div className="h-full overflow-y-auto">
          <div className="px-1 pb-4">
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

        {currentNoteField ? (
          <NoteDialog
            open={!!noteDialogField}
            onOpenChange={(open) => {
              if (!open) setNoteDialogField(null);
            }}
            fieldTitle={currentNoteField.title}
            note={currentNoteField.note || ""}
            readonly={readonly}
            onSave={(markdown) => updateSchemaNote(currentNoteField.key, markdown)}
            onDelete={() => deleteSchemaNote(currentNoteField.key)}
          />
        ) : null}
      </div>
    </PositionConfigContext.Provider>
  );
}
