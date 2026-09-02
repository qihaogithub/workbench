"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "./utils";
import type { ConfigChangeMeta, ConfigFormProps } from "./types";
import type { DesignSpecEntryLink } from "./types";
import type { FieldConfig, FieldGroup, VisibleWhenCondition } from "./schema-parser";
import { parseSchemaToFields } from "./schema-parser";
import { getPageTypeLimits } from "./type-limits-store";
import { FieldRenderer, PositionConfigContext, type PositionConfigContextValue, type PositionFieldEntry } from "./FieldRenderer";
import { configFieldMatchesCategoryFilter } from "./config-categories";
import { getPreviewSize } from "./validator";
import { isAtomicConfigField } from "@workbench/shared";

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
      if (p?.type === "object" && !isAtomicConfigField(p) && p?.properties && typeof p.properties === "object" && !Array.isArray(p.properties)) {
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
  designSpecEntries,
  onEditDesignSpec,
  onOpenDesignSpec,
  onEditConfigDefinition,
  imageConfigScope,
  pageId,
  onLaunchWhiteboard,
  referenceContext,
  referenceProvider,
  onReferenceClick,
}: {
  group: FieldGroup;
  formData: Record<string, unknown>;
  onChange: (key: string, value: unknown, meta?: ConfigChangeMeta) => void;
  isFirst?: boolean;
  sessionId?: string;
  readonly?: boolean;
  designSpecEntries?: DesignSpecEntryLink[];
  onEditDesignSpec?: (docId: string, entryId: string) => void;
  onOpenDesignSpec?: (spec: DesignSpecEntryLink, fieldTitle: string, anchor?: { top: number; bottom: number }) => void;
  onEditConfigDefinition?: (fieldKey: string, field: FieldConfig) => void;
  imageConfigScope?: ConfigFormProps["imageConfigScope"];
  pageId?: string;
  onLaunchWhiteboard?: ConfigFormProps["onLaunchWhiteboard"];
  referenceContext?: ConfigFormProps["referenceContext"];
  referenceProvider?: ConfigFormProps["referenceProvider"];
  onReferenceClick?: ConfigFormProps["onReferenceClick"];
}) {
  if (group.title === "") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-5">
          {group.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={formData[field.key]}
              onChange={(value, meta) => onChange(field.key, value, meta)}
              sessionId={sessionId}
              readonly={readonly}
              designSpecEntries={designSpecEntries}
              onEditDesignSpec={onEditDesignSpec}
              onOpenDesignSpec={onOpenDesignSpec}
              onEditConfigDefinition={onEditConfigDefinition}
              fieldPath={field.key}
              imageConfigScope={imageConfigScope}
              pageId={pageId}
              onLaunchWhiteboard={onLaunchWhiteboard}
              referenceContext={referenceContext}
              referenceProvider={referenceProvider}
              onReferenceClick={onReferenceClick}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-5" aria-label={group.title}>
      <h3 className="border-b border-foreground/10 pb-2 text-sm font-medium text-foreground/40">
        {group.title}
      </h3>
      <div className="flex flex-col gap-5">
        {group.fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={formData[field.key]}
            onChange={(value, meta) => onChange(field.key, value, meta)}
            sessionId={sessionId}
            readonly={readonly}
            designSpecEntries={designSpecEntries}
            onEditDesignSpec={onEditDesignSpec}
            onOpenDesignSpec={onOpenDesignSpec}
            onEditConfigDefinition={onEditConfigDefinition}
            fieldPath={field.key}
            imageConfigScope={imageConfigScope}
            pageId={pageId}
            onLaunchWhiteboard={onLaunchWhiteboard}
            referenceContext={referenceContext}
            referenceProvider={referenceProvider}
            onReferenceClick={onReferenceClick}
          />
        ))}
      </div>
    </section>
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
  onPositionFieldPathChange,
  onExitPositionEdit,
  positionEditActiveId,
  positionEditDimming,
  onTogglePositionDimming,
  designSpecEntries,
  onEditDesignSpec,
  onOpenDesignSpec,
  onEditConfigDefinition,
  imageConfigScope,
  pageId,
  onLaunchWhiteboard,
  referenceContext,
  referenceProvider,
  onReferenceClick,
}: ConfigFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(
    () => {
      if (!initialData) return {};
      const pathMap = computeFlattenPathMap(schema);
      return flattenInitialData(initialData, pathMap);
    },
  );


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
    return getPreviewSize(schema);
  }, [schema]);

  const positionRegistryRef = useRef(new Map<string, PositionFieldEntry>());
  const activePositionIdRef = useRef<string | null>(positionEditActiveId ?? null);
  const onPositionFieldPathChangeRef = useRef(onPositionFieldPathChange);
  const onExitPositionEditRef = useRef(onExitPositionEdit);
  activePositionIdRef.current = positionEditActiveId ?? null;
  onPositionFieldPathChangeRef.current = onPositionFieldPathChange;
  onExitPositionEditRef.current = onExitPositionEdit;

  const registerPositionField = useCallback((entry: PositionFieldEntry) => {
    positionRegistryRef.current.set(entry.instanceId, entry);
    onPositionFieldPathChangeRef.current?.(entry.instanceId, entry.fieldPath);
    return () => {
      if (positionRegistryRef.current.get(entry.instanceId) === entry) {
        positionRegistryRef.current.delete(entry.instanceId);
      }
      if (activePositionIdRef.current === entry.instanceId) {
        queueMicrotask(() => {
          if (
            activePositionIdRef.current === entry.instanceId &&
            !positionRegistryRef.current.has(entry.instanceId)
          ) {
            onExitPositionEditRef.current?.();
          }
        });
      }
    };
  }, []);

  const requestPositionEdit = useCallback((instanceId: string) => {
    const entry = positionRegistryRef.current.get(instanceId);
    if (!entry) return;
    onEnterPositionEdit?.({
      id: entry.instanceId,
      fieldPath: entry.fieldPath,
      domKey: entry.posKey,
      domOccurrence: entry.domOccurrence,
      position: entry.currentValue,
    });
  }, [onEnterPositionEdit]);

  const exitPositionEdit = useCallback(() => {
    onExitPositionEdit?.();
  }, [onExitPositionEdit]);

  const positionConfigValue = useMemo((): PositionConfigContextValue => {
    return {
      registerPositionField,
      requestPositionEdit,
      exitPositionEdit,
      activePositionId: positionEditActiveId ?? null,
      dimming: positionEditDimming ?? false,
      onToggleDimming: onTogglePositionDimming,
    };
  }, [
    registerPositionField,
    requestPositionEdit,
    exitPositionEdit,
    positionEditActiveId,
    positionEditDimming,
    onTogglePositionDimming,
  ]);

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
    (key: string, value: unknown, meta?: ConfigChangeMeta) => {
      setFormData((prev) => {
        if (value === undefined || value === null) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: value };
      });
      onChange({ [key]: value ?? null }, meta);
    },
    [onChange]
  );


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
      <div className={cn("min-w-0", className)}>
        <div className="flex flex-col gap-5 pb-2">
          {visibleFieldGroups.map((group, index) => (
            <div key={index}>
              <FieldGroupSection
                group={group}
                formData={effectiveFormData}
                onChange={handleFieldChange}
                isFirst={index === 0}
                sessionId={sessionId}
                readonly={readonly}
                designSpecEntries={designSpecEntries}
                onEditDesignSpec={onEditDesignSpec}
                onOpenDesignSpec={onOpenDesignSpec}
                onEditConfigDefinition={onEditConfigDefinition}
                imageConfigScope={imageConfigScope}
                pageId={pageId}
                onLaunchWhiteboard={onLaunchWhiteboard}
                referenceContext={referenceContext}
                referenceProvider={referenceProvider}
                onReferenceClick={onReferenceClick}
              />
            </div>
          ))}
        </div>
      </div>
    </PositionConfigContext.Provider>
  );
}
