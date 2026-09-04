"use client";

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "./utils";
import { FileUploadWidget } from "./widgets";
import { ImageListWidget, type ImageItem } from "./ImageListWidget";
import { ArrayFieldGroup } from "./ArrayFieldGroup";
import { MultiSelect } from "./MultiSelect";
import { CascadeSelect } from "./CascadeSelect";
import { OptionGroup } from "./OptionGroup";
import type { FieldConfig } from "./schema-parser";
import { createContext, useContext } from "react";
import { Check, Edit3, FileText, MessageSquare, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DocumentEditor,
  type MarkdownReferenceClickHandler,
  type MarkdownReferenceContext,
  type MarkdownReferenceProvider,
} from "./DocumentEditor";
import type { ConfigBreadcrumb, ConfigChangeMeta, ConfigCommentTarget, ConfigItemCapabilities, ConfigItemDetailHandler, DesignSpecEntryLink, ImageConfigScope, WhiteboardLauncher } from "./types";
import { ImageInputActions } from "./ImageInputActions";
import { localizeRemoteImageForSession } from "./markdown/remote-image-localizer";

export interface PositionFieldEntry {
  instanceId: string;
  posKey: string;
  fieldPath: string;
  currentValue: { x: number; y: number };
  domOccurrence?: number;
  containerSize?: { width: number; height: number };
}

export interface PositionConfigContextValue {
  registerPositionField(entry: PositionFieldEntry): () => void;
  requestPositionEdit(instanceId: string): void;
  exitPositionEdit(): void;
  activePositionId: string | null;
  dimming: boolean;
  onToggleDimming?: () => void;
}

export const PositionConfigContext = createContext<PositionConfigContextValue | null>(null);

export function usePositionConfig(): PositionConfigContextValue | null {
  return useContext(PositionConfigContext);
}

const SPINE_PACKAGE_ACCEPT = ".zip,.zip.flutter,application/zip,application/x-zip-compressed";

function mergeSpinePackageAccept(value: unknown): string {
  const configured = typeof value === "string" ? value.trim() : "";
  return configured.includes(".zip.flutter")
    ? configured
    : [configured, SPINE_PACKAGE_ACCEPT].filter(Boolean).join(",");
}

function acceptsAudio(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.split(",").some((token) => {
    const normalized = token.trim().toLowerCase();
    return normalized.startsWith("audio/") || normalized.endsWith(".mp3");
  });
}

function normalizeImageDefaults(raw: unknown): ImageItem[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      typeof item === "string" ? { url: item } : { url: (item as any).url ?? "" }
    );
  }
  if (typeof raw === "string") {
    return [{ url: raw }];
  }
  return undefined;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  sessionId,
  readonly,
  designSpecEntries = [],
  onEditDesignSpec,
  onOpenDesignSpec,
  onEditConfigDefinition,
  configItemCapabilities,
  onAddConfigComment,
  hasConfigComment,
  embedded,
  fieldPath,
  schemaFieldPath,
  defaultValueOverride,
  positionInstanceId,
  positionDomOccurrence,
  imageConfigScope,
  pageId,
  configContextPageId,
  onLaunchWhiteboard,
  referenceContext,
  referenceProvider,
  onReferenceClick,
  onOpenItemDetail,
  activeItemDetailId,
  activeItemDetailFieldPath,
  onItemDetailInvalidated,
  breadcrumb,
  arrayDepth,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown, meta?: ConfigChangeMeta) => void;
  sessionId?: string;
  readonly?: boolean;
  designSpecEntries?: DesignSpecEntryLink[];
  onEditDesignSpec?: (docId: string, entryId: string) => void;
  onOpenDesignSpec?: (spec: DesignSpecEntryLink, fieldTitle: string, anchor?: { top: number; bottom: number }, trigger?: HTMLElement | null) => void;
  onEditConfigDefinition?: (fieldKey: string, field: FieldConfig) => void;
  configItemCapabilities?: ConfigItemCapabilities;
  onAddConfigComment?: (target: ConfigCommentTarget, trigger?: HTMLElement | null) => void;
  hasConfigComment?: (target: ConfigCommentTarget) => boolean;
  embedded?: boolean;
  fieldPath?: string;
  /** Canonical schema path used by design-spec links; unlike fieldPath it has no array indexes. */
  schemaFieldPath?: string;
  /** Parent object-array defaults are resolved at the current array index. */
  defaultValueOverride?: unknown;
  positionInstanceId?: string;
  positionDomOccurrence?: number;
  imageConfigScope?: ImageConfigScope;
  pageId?: string;
  configContextPageId?: string;
  onLaunchWhiteboard?: WhiteboardLauncher;
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  onOpenItemDetail?: ConfigItemDetailHandler;
  activeItemDetailId?: string | null;
  activeItemDetailFieldPath?: string;
  onItemDetailInvalidated?: (itemId: string) => void;
  breadcrumb?: ConfigBreadcrumb[];
  arrayDepth?: number;
}) {
  const canEditValue = !readonly && (configItemCapabilities?.canEditValue ?? true);
  const canEditDefinition = !readonly && !field.isConst && (!schemaFieldPath || schemaFieldPath === field.key)
    && (configItemCapabilities?.canEditDefinition ?? Boolean(onEditConfigDefinition));
  // A read-only host still needs the entry point to inspect existing threads;
  // the popover controller owns whether write controls are available.
  const canShowCommentTag = Boolean(onAddConfigComment) && (
    (configItemCapabilities?.canAddComment ?? true) || Boolean(hasConfigComment)
  );
  const effectiveReadonly = !canEditValue;
  const effectiveDefault = defaultValueOverride !== undefined
    ? defaultValueOverride
    : field.default;
  const isSingleImageField = field.format === "image" || field.uiWidget === "image";
  const isImageListField = field.uiWidget === "imageList"
    || field.type === "imageList"
    || (field.type === "array" && field.itemsFormat === "image");
  const isInlineControl =
    field.type === "boolean" ||
    field.type === "number" ||
    field.type === "integer" ||
    field.type === "color" ||
    field.format === "color";
  const isImageUploadControl =
    field.uiWidget === "file" ||
    field.uiWidget === "image" ||
    field.uiWidget === "imageList" ||
    field.format === "image" ||
    field.format === "file" ||
    field.format === "video" ||
    field.format === "spine";

  const renderInput = () => {
    if (field.format === "spine") {
      return (
        <FileUploadWidget
          value={value as any}
          onChange={onChange}
          disabled={effectiveReadonly}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={{ ...(field.uiOptions as any), assetKind: "spine", accept: mergeSpinePackageAccept(field.uiOptions?.accept), pageId, contextPageId: configContextPageId, configKey: field.key, configScope: imageConfigScope }}
        />
      );
    }

    if (field.uiWidget === "file" || field.uiWidget === "image" || field.format === "video") {
      const upload = (
        <FileUploadWidget
          value={value as any}
          onChange={onChange}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={{
            ...(field.uiOptions as any),
            ...(field.format === "video"
              ? { mediaType: "video", accept: field.uiOptions?.accept || "video/mp4,video/webm" }
              : acceptsAudio(field.uiOptions?.accept)
                ? { mediaType: "audio" }
                : {}),
          }}
          defaultValue={
            field.format === "video"
              ? (effectiveDefault as any)
              : typeof effectiveDefault === "string"
                ? effectiveDefault
                : undefined
          }
          disabled={effectiveReadonly}
          onWhiteboard={!effectiveReadonly && isSingleImageField && onLaunchWhiteboard && fieldPath ? () => onLaunchWhiteboard({ scope: imageConfigScope, pageId, fieldPath, ...(typeof value === "string" ? { currentValue: value } : {}) }) : undefined}
        />
      );

      return upload;
    }

    if (field.uiWidget === "imageList") {
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
          onChange={(newItems) => {
            if (field.itemsType === "string") {
              onChange((newItems as ImageItem[]).map((item) => item.url));
            } else {
              onChange(newItems);
            }
          }}
          maxItems={maxItems}
          disabled={effectiveReadonly}
          title={field.title}
          sessionId={sessionId}
          options={{
            ...(field.uiOptions as any),
            ...(acceptsAudio(field.uiOptions?.accept) ? { mediaType: "audio" } : {}),
          }}
          defaultValue={normalizeImageDefaults(effectiveDefault)}
          renderItemActions={
            !effectiveReadonly && onLaunchWhiteboard && fieldPath
              ? (item, index, onUpload) => (
                  <ImageInputActions
                    onUpload={onUpload}
                    onWhiteboard={onLaunchWhiteboard ? () => onLaunchWhiteboard({ scope: imageConfigScope, pageId, fieldPath, listItem: { index, url: item.url } }) : undefined}
                  />
                )
              : undefined
          }
        />
      );
    }

    if (field.uiWidget === "multiselect") {
      const enumValues = field.enum as string[] | undefined;
      const options = (enumValues || []).map((v, i) => ({
        value: v,
        label: field.enumNames?.[i] ?? v,
      }));
      return (
        <MultiSelect
          options={options}
          value={(value as string[]) || []}
          onChange={(v) => onChange(v)}
          disabled={effectiveReadonly}
        />
      );
    }

    if (field.uiWidget === "cascade") {
      return (
        <CascadeSelect
          options={field.options || []}
          value={(value as string[]) || []}
          onChange={(v) => onChange(v)}
          disabled={effectiveReadonly}
        />
      );
    }

    if ((field.uiWidget === "radio" || field.uiWidget === "segmented") && field.enum && field.enum.length > 0) {
      const currentValue = value !== undefined && value !== null
        ? value
        : effectiveDefault !== undefined && effectiveDefault !== null
          ? effectiveDefault
          : field.enum[0];
      const currentIndex = field.enum.findIndex((item) => Object.is(item, currentValue));
      const options = field.enum.map((item, index) => ({
        // Indexes keep the DOM value stable even when an enum contains numbers.
        value: String(index),
        label: field.enumNames?.[index] ?? String(item),
      }));

      return (
        <OptionGroup
          variant={field.uiWidget}
          options={options}
          value={currentIndex >= 0 ? String(currentIndex) : undefined}
          onChange={(nextIndex) => {
            const index = Number(nextIndex);
            if (Number.isInteger(index) && index >= 0 && index < field.enum!.length) {
              onChange(field.enum![index]);
            }
          }}
          name={`config-${fieldPath ?? field.key}`}
          ariaLabel={field.title || "单选项"}
          disabled={effectiveReadonly}
        />
      );
    }

    if (field.format === "image" || field.format === "file") {
      const upload = (
        <FileUploadWidget
          value={value as string}
          onChange={onChange}
          label={field.title}
          required={field.required}
          sessionId={sessionId}
          options={field.uiOptions as any}
          defaultValue={
            typeof effectiveDefault === "string" ? effectiveDefault : undefined
          }
          disabled={effectiveReadonly}
          onWhiteboard={!effectiveReadonly && isSingleImageField && onLaunchWhiteboard && fieldPath ? () => onLaunchWhiteboard({ scope: imageConfigScope, pageId, fieldPath, ...(typeof value === "string" ? { currentValue: value } : {}) }) : undefined}
        />
      );

      return upload;
    }

    if (field.format === "color" || field.type === "color") {
      return (
        <div className="ml-auto flex h-7 w-full min-w-[132px] max-w-[180px] items-center gap-1 overflow-hidden rounded-lg bg-black/40 px-1.5 py-1">
          <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px]">
            <input
              type="color"
              disabled={effectiveReadonly}
              value={(value as string) || "#000000"}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`${field.title}颜色选择器`}
              className="size-full cursor-pointer appearance-none border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[4px] [&::-webkit-color-swatch]:border-0"
            />
          </span>
          <Input
            disabled={effectiveReadonly}
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            aria-label={`${field.title}色值`}
            className="h-full min-w-0 flex-1 truncate border-0 bg-transparent p-0 font-mono text-sm text-foreground shadow-none focus-visible:ring-0"
          />
        </div>
      );
    }

    if (field.type === "array") {
      if (field.oneOf || field.children) {
        return (
          <ArrayFieldGroup
            field={field}
            value={(value as Record<string, unknown>[]) || []}
            onChange={(newValue, meta) => onChange(newValue, meta)}
            sessionId={sessionId}
            readonly={effectiveReadonly}
            fieldPath={fieldPath}
            schemaFieldPath={schemaFieldPath}
            defaultValueOverride={effectiveDefault}
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
            breadcrumb={breadcrumb}
            arrayDepth={arrayDepth}
          />
        );
      }

      if (field.itemsType === "object") {
        return (
          <Textarea
            disabled={effectiveReadonly}
            value={JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value));
              } catch {
              }
            }}
            placeholder={`请输入 ${field.title} 的 JSON 数据`}
            rows={6}
            className="resize-y min-h-[100px] font-mono text-xs"
          />
        );
      }

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
          onChange={(newItems) => {
            if (field.itemsType === "string" || !field.itemsType) {
              onChange((newItems as ImageItem[]).map((item) => item.url));
            } else {
              onChange(newItems);
            }
          }}
          maxItems={maxItems}
          disabled={effectiveReadonly}
          title={field.title}
          sessionId={sessionId}
          options={field.uiOptions as any}
          defaultValue={normalizeImageDefaults(effectiveDefault)}
          renderItemActions={
            isImageListField && !effectiveReadonly && onLaunchWhiteboard && fieldPath
              ? (item, index, onUpload) => (
                  <ImageInputActions
                    onUpload={onUpload}
                    onWhiteboard={() => onLaunchWhiteboard({
                      scope: imageConfigScope,
                      pageId,
                      fieldPath,
                      listItem: { index, url: item.url },
                    })}
                  />
                )
              : undefined
          }
        />
      );
    }

    if (field.type === "boolean") {
      return (
        <div className="flex items-center">
        <Switch
            disabled={effectiveReadonly}
            checked={(value as boolean) || false}
            onCheckedChange={(checked: boolean) => onChange(checked)}
            className="ml-auto h-[21px] w-[39px] border-0 shadow-none data-[state=checked]:bg-[#575765] data-[state=unchecked]:bg-[#3a3a40] [&>span]:size-[17px] [&>span]:data-[state=checked]:translate-x-[18px]"
          />
        </div>
      );
    }

    if (field.type === "number" || field.type === "integer") {
      if (field.minimum !== undefined && field.maximum !== undefined) {
        const currentValue = (value as number) ?? field.default ?? field.minimum;

        return (
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <Input
              disabled={effectiveReadonly}
              type="number"
              value={currentValue.toString()}
              onChange={(event) => {
                const parsed = field.type === "integer"
                  ? parseInt(event.target.value, 10)
                  : parseFloat(event.target.value);
                if (!Number.isNaN(parsed)) onChange(parsed);
              }}
              min={field.minimum}
              max={field.maximum}
              className="h-7 w-[60px] shrink-0 border-0 bg-black/40 px-1.5 text-center font-mono text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
            />
            <Slider
              disabled={effectiveReadonly}
              value={[currentValue]}
              min={field.minimum}
              max={field.maximum}
              step={field.type === "integer" ? 1 : 0.1}
              onValueChange={(values: number[]) => onChange(values[0])}
              className="min-w-[72px] flex-1"
            />
          </div>
        );
      }

      return (
        <Input
          disabled={effectiveReadonly}
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
          className="ml-auto h-7 w-[60px] border-0 bg-black/40 px-1.5 text-center font-mono text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        />
      );
    }

    if (field.enum && field.enum.length > 0) {
      const currentValue = value || field.default || field.enum[0];
      const currentIndex = field.enum.indexOf(currentValue);
      const displayValue =
        field.enumNames?.[currentIndex] || currentValue?.toString();

      return (
        <Select
          disabled={effectiveReadonly}
          value={currentValue?.toString() || undefined}
          onValueChange={(val: string) => {
            const index = field.enum!.indexOf(val as any);
            onChange(index >= 0 ? field.enum![index] : val);
          }}
        >
          <SelectTrigger className="h-9 rounded-lg border-0 bg-black/40 px-3 text-sm shadow-none focus:ring-2 focus:ring-ring">
            <SelectValue placeholder="请选择">{displayValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.enum
              .filter((item) => {
                const v = item?.toString();
                return v !== undefined && v !== "";
              })
              .map((item, idx) => {
                const itemValue = item!.toString();
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

    if (field.type === "richtext") {
      return (
        <RichTextInput
          value={value}
          onChange={onChange}
          field={field}
          sessionId={sessionId}
          readonly={effectiveReadonly}
          referenceContext={referenceContext}
          referenceProvider={referenceProvider}
          onReferenceClick={onReferenceClick}
          scope={imageConfigScope}
          pageId={pageId}
        />
      );
    }

    if (field.type === "text") {
      return (
        <Textarea
          disabled={effectiveReadonly}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.title}`}
          rows={3}
          className="h-24 min-h-24 resize-y rounded-lg border-0 bg-black/40 px-3 py-2.5 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        />
      );
    }

    if (field.maxLength && field.maxLength > 100) {
      return (
        <Textarea
          disabled={effectiveReadonly}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.title}`}
          maxLength={field.maxLength}
          rows={3}
          className="h-24 min-h-24 resize-none rounded-lg border-0 bg-black/40 px-3 py-2.5 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        />
      );
    }

    if (field.positionable) {
      return (
        <PositionFieldInput
          field={field}
          value={value as { x: number; y: number } | undefined}
          onChange={onChange}
          disabled={effectiveReadonly}
          fieldPath={fieldPath}
          instanceId={positionInstanceId}
          domOccurrence={positionDomOccurrence}
        />
      );
    }

    return (
      <Input
        disabled={effectiveReadonly}
        type="text"
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`请输入${field.title}`}
        maxLength={field.maxLength}
        className="h-9 rounded-lg border-0 bg-black/40 px-3 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
      />
    );
  };

  const linkedSpecs = designSpecEntries.filter(
    (entry) => entry.fieldKey === (schemaFieldPath ?? field.key) && entry.markdown.trim(),
  );
  const imageDimensions = formatImageDimensions(field.uiOptions);
  const showImageHint =
    imageDimensions !== "—" &&
    (field.uiWidget === "file" ||
      field.uiWidget === "image" ||
      field.uiWidget === "imageList" ||
      field.format === "image" ||
      field.format === "file");
  const fieldLabel = (
    <>
      {field.title}
      {field.required && <span className="ml-0.5 text-red-500">*</span>}
    </>
  );
  const configCommentScope = imageConfigScope ?? "page";
  const configCommentTarget: ConfigCommentTarget = {
    kind: "config",
    scope: configCommentScope,
    ...(configCommentScope === "page" && pageId ? { pageId } : {}),
    // Comments follow the same canonical schema identity as design-spec refs;
    // runtime array indexes are intentionally absent from this key.
    fieldKey: schemaFieldPath ?? field.key,
    fieldTitleSnapshot: field.title,
  };
  const commentTagActive = hasConfigComment?.(configCommentTarget) ?? false;
  const titleContent = canEditDefinition && onEditConfigDefinition ? (
    <button
      type="button"
      aria-label={`编辑配置项：${field.title}`}
      onClick={() => onEditConfigDefinition(field.key, field)}
      className="flex min-w-0 cursor-pointer items-center truncate rounded-sm text-left text-sm font-medium text-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <span className="truncate">{fieldLabel}</span>
    </button>
  ) : (
    <Label className="block min-w-0 truncate text-sm font-medium text-foreground/70">
      {fieldLabel}
    </Label>
  );
  const tagBaseClassName = "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div
      className={cn(
        "w-full rounded-lg",
        isInlineControl
          ? "flex min-h-7 items-center gap-3"
          : cn("flex flex-col", isImageUploadControl ? "gap-1.5" : "gap-3"),
      )}
    >
      {field.title !== "" && (
      <div className={cn("group flex min-w-0 items-start gap-1", isInlineControl ? "min-w-0 flex-1" : "w-full")}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {titleContent}
            {linkedSpecs.length > 0 && onOpenDesignSpec && (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  onOpenDesignSpec(
                    linkedSpecs[0],
                    field.title,
                    rect.width || rect.height ? { top: rect.top, bottom: rect.bottom } : undefined,
                    event.currentTarget,
                  );
                }}
                className={cn(tagBaseClassName, "bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus-visible:ring-blue-500")}
                aria-label={`查看设计规范：${field.title}`}
              >
                <FileText className="h-3 w-3" />规范
              </button>
            )}
            {canShowCommentTag && onAddConfigComment && (
              <div className="pointer-events-none flex shrink-0 items-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddConfigComment(configCommentTarget, event.currentTarget);
                  }}
                  className={cn(
                    tagBaseClassName,
                    commentTagActive
                      ? "bg-amber-400 text-amber-950 shadow-sm hover:bg-amber-300 focus-visible:ring-amber-400"
                      : "bg-foreground/[0.08] text-foreground/55 hover:bg-foreground/[0.14] hover:text-foreground focus-visible:ring-ring",
                  )}
                  aria-label={`查看或添加批注：${field.title}`}
                >
                  <MessageSquare className="h-3 w-3" />批注
                </button>
              </div>
            )}
          </div>
          {showImageHint && <p className="mt-0.5 truncate text-[13px] font-medium text-foreground/30">{imageDimensions}</p>}
        </div>
      </div>
      )}
      <div className={cn("min-w-0", isInlineControl ? "flex-1" : "w-full")}>
        {renderInput()}
      </div>
    </div>
  );
}

type ImageRule = { operator?: string; value?: number };

function readImageRule(options: Record<string, unknown> | undefined, key: "widthRule" | "heightRule"): ImageRule | undefined {
  const value = options?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const rule = value as Record<string, unknown>;
  return typeof rule.value === "number" && Number.isFinite(rule.value) && typeof rule.operator === "string"
    ? { operator: rule.operator, value: rule.value }
    : undefined;
}

export function formatImageAccept(options?: Record<string, unknown>): string {
  const accept = typeof options?.accept === "string" ? options.accept.trim() : "";
  if (!accept || accept === "image/*" || accept === "*/*") return "不限";
  const labels = accept.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    const raw = item.includes("/") ? item.split("/").pop() ?? item : item.replace(/^\./, "");
    return raw.toLowerCase() === "jpeg" ? "jpg" : raw.toLowerCase();
  });
  return Array.from(new Set(labels)).join("/") || "不限";
}

export function formatImageDimensions(options?: Record<string, unknown>): string {
  const width = readImageRule(options, "widthRule");
  const height = readImageRule(options, "heightRule");
  const rules = [width && `W ${width.operator} ${width.value}px`, height && `H ${height.operator} ${height.value}px`].filter(Boolean);
  return rules.length ? rules.join(" · ") : "—";
}

function PositionFieldInput({
  field,
  value,
  onChange,
  fieldPath,
  instanceId: providedInstanceId,
  domOccurrence,
  disabled = false,
}: {
  field: FieldConfig;
  value: { x: number; y: number } | undefined;
  onChange: (value: unknown) => void;
  fieldPath?: string;
  instanceId?: string;
  domOccurrence?: number;
  disabled?: boolean;
}) {
  const posConfig = usePositionConfig();
  const pos = value || { x: 0, y: 0 };
  const posKey = field.positionable?.key || field.key;
  const instanceId = providedInstanceId ?? fieldPath ?? posKey;
  const containerWidth = field.positionable?.size?.width ?? 0;
  const containerHeight = field.positionable?.size?.height ?? 0;

  useEffect(() => {
    if (!posConfig || !fieldPath) return;
    return posConfig.registerPositionField({
      instanceId,
      posKey,
      fieldPath,
      currentValue: pos,
      domOccurrence,
      containerSize: field.positionable?.size,
    });
  }, [posConfig, instanceId, posKey, fieldPath, domOccurrence, pos.x, pos.y, field.positionable?.size]);

  const handleCoordChange = (axis: "x" | "y", val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return;
    const maxVal = axis === "x" ? containerWidth : containerHeight;
    const bounded = containerWidth > 0 || containerHeight > 0
      ? Math.max(0, maxVal > 0 ? Math.min(num, maxVal) : num)
      : num;
    onChange({ ...pos, [axis]: bounded });
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground/60 w-3">X</span>
        <Input
          type="number"
          value={pos.x}
          onChange={(e) => handleCoordChange("x", e.target.value)}
          disabled={disabled}
          className="h-6 w-16 text-xs px-1.5"
          min={0}
          max={containerWidth > 0 ? containerWidth : undefined}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground/60 w-3">Y</span>
        <Input
          type="number"
          value={pos.y}
          onChange={(e) => handleCoordChange("y", e.target.value)}
          disabled={disabled}
          className="h-6 w-16 text-xs px-1.5"
          min={0}
          max={containerHeight > 0 ? containerHeight : undefined}
        />
      </div>
      {posConfig && (() => {
        const isEditing = posConfig.activePositionId === instanceId;
        return (
          <>
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-2 shrink-0"
              disabled={disabled}
              onClick={() => isEditing ? posConfig.exitPositionEdit() : posConfig.requestPositionEdit(instanceId)}
            >
              {isEditing ? <Check className="h-3 w-3 mr-1" /> : <Pencil className="h-3 w-3 mr-1" />}
              {isEditing ? "完成" : "拖动"}
            </Button>
            {isEditing && posConfig.onToggleDimming && (
              <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer shrink-0 select-none">
                <input
                  type="checkbox"
                  checked={posConfig.dimming}
                  disabled={disabled}
                  onChange={posConfig.onToggleDimming}
                  className="h-3 w-3"
                />
                透明
              </label>
            )}
          </>
        );
      })()}
    </div>
  );
}

function RichTextInput({
  value,
  onChange,
  field,
  sessionId,
  readonly,
  referenceContext,
  referenceProvider,
  onReferenceClick,
  scope,
  pageId,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  field: FieldConfig;
  sessionId?: string;
  readonly?: boolean;
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  scope?: "project" | "page";
  pageId?: string;
}) {
  const [open, setOpen] = useState(false);
  const localizeRemoteImage = sessionId
    ? (url: string) => localizeRemoteImageForSession(sessionId, url)
    : undefined;
  const richTextReferenceContext = referenceContext && scope
    ? {
        ...referenceContext,
        source: {
          kind: "richtext-field" as const,
          projectId: referenceContext.source.projectId,
          workspaceId: referenceContext.source.workspaceId,
          scope,
          ...(scope === "page" && pageId ? { pageId } : {}),
          fieldKey: field.key,
          jsonPointer: `/${field.key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
        },
      }
    : undefined;

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={readonly}
      >
        <Edit3 className="h-3 w-3 mr-1" />
        编辑
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{field.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <DocumentEditor
              value={(value as string) || ""}
              onChange={(v) => onChange(v)}
              readOnly={readonly}
              localizeRemoteImage={localizeRemoteImage}
              referenceContext={richTextReferenceContext}
              referenceProvider={referenceProvider}
              onReferenceClick={onReferenceClick}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
