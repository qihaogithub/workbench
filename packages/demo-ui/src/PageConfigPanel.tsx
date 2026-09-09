"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { enumerateSchemaFields } from "@workbench/shared/demo/config-schema-fields";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { ConfigForm } from "./ConfigForm";
import { ConfigDetailSheet } from "./ConfigDetailSheet";
import { FieldRenderer, PositionConfigContext, type PositionConfigContextValue, type PositionFieldEntry } from "./FieldRenderer";
import { ConfigCommentPopover } from "./comment/ConfigCommentPopover";
import type { ConfigCommentController } from "./comment/types";
import { filterCommentThreadsByTarget } from "./comment/comment-thread-scope";
import { PageRequirements } from "./PageRequirements";
import { RichTextEditor } from "./RichTextEditor";
import type {
  MarkdownReferenceClickHandler,
  MarkdownReferenceContext,
  MarkdownReferenceProvider,
} from "./DocumentEditor";
import type { DemoPageMeta } from "@workbench/shared";
import { ConfigItemEditorDialog, type ConfigItemApplyPlanSnapshot } from "./ConfigItemEditorDialog";
import { localizeRemoteImageForSession } from "./markdown/remote-image-localizer";
import {
  applySchemaDefinitionCommand,
  readConfigDefinitionFieldAtPath,
  readConfigDefinitionFields,
  type ConfigDefinitionDraft,
  type SchemaDefinitionMutation,
} from "@workbench/shared/demo/config-schema-definition";
import type { ConfigDefinitionImpactSummary } from "./ConfigDefinitionManagerDialog";
import {
  buildEffectiveFieldData,
  isFieldVisible,
  parseSchemaToFields,
  type FieldConfig,
} from "./schema-parser";
import {
  getAvailableConfigCategories,
  getSchemaFieldCountByBindings,
  getSchemaFieldCountByCategory,
  getSchemaFieldCountByType,
} from "./config-categories";
import { cn } from "./utils";
import type { ConfigBreadcrumb, ConfigChangeMeta, ConfigCommentTarget, ConfigDefinitionFocus, ConfigItemCapabilities, ConfigItemDetail, DesignSpecEntryLink, PageDesignSpecEntryLink, PositionEditTarget, PositionableSizeItem, WhiteboardLauncher } from "./types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const EMPTY_DESIGN_SPEC_ENTRIES: DesignSpecEntryLink[] = [];
const EMPTY_PAGE_DESIGN_SPEC_ENTRIES: PageDesignSpecEntryLink[] = [];
const EMPTY_SCHEMA = '{\n  "type": "object",\n  "properties": {}\n}';
const CONFIG_TYPE_SECTIONS = [
  { type: "business" as const, title: "业务配置" },
  { type: "resource" as const, title: "资源配置" },
] as const;
export {
  extractCodeConfigBindingKeys,
  extractPrototypeConfigBindingKeys,
} from "./config-binding-utils";

export interface PageConfigPanelPage {
  id: string;
  name: string;
  order?: number;
  /** 页面来源/模板元数据；宿主可据此计算配置项能力矩阵。 */
  reference?: DemoPageMeta["reference"];
  isTemplatePage?: boolean;
  schema?: string;
  configData?: Record<string, unknown>;
  /** 引用页使用源项目共享配置 Schema；普通页省略并继承面板项目 Schema。 */
  projectConfigSchema?: string;
  projectConfigBindings?: string[];
  /** 页面级设计规范绑定；引用页由宿主从源项目映射后传入。 */
  designSpecEntries?: DesignSpecEntryLink[];
  /** 页面规范绑定；仅在绑定页面的配置侧边栏顶部展示。 */
  pageDesignSpecEntries?: PageDesignSpecEntryLink[];
  /** 配置定义和值的独立能力；项目级和页面级可分别控制。 */
  configItemCapabilities?: {
    project?: ConfigItemCapabilities;
    page?: ConfigItemCapabilities;
  };
}

type DefinitionEditorState = {
  mode: "create" | "edit";
  scope: "page" | "project";
  draft: ConfigDefinitionDraft;
  originalKey?: string;
  schemaFieldPath?: string;
};

type ActiveDesignSpec =
  | {
      kind: "config";
      spec: DesignSpecEntryLink;
      fieldTitle: string;
      anchor?: { top: number; bottom: number };
    }
  | {
      kind: "page";
      spec: PageDesignSpecEntryLink;
      fieldTitle: string;
      anchor?: { top: number; bottom: number };
    };

type ActiveConfigComment = {
  target: ConfigCommentTarget;
  fieldTitle: string;
  anchor?: { top: number; bottom: number };
};

function isSameDesignSpec(
  active: ActiveDesignSpec | null,
  next: ActiveDesignSpec,
) {
  return active?.kind === next.kind
    && active.spec.docId === next.spec.docId
    && active.spec.entryId === next.spec.entryId;
}

type DesignSpecPanelBounds = {
  left: number;
  /** 配置栏左侧可供气泡使用的宽度。 */
  availableLeftWidth: number;
};

type OverlayPlacement = {
  top: number;
  maxHeight: number;
  /** 用于箭头定位的当前触发器中心。 */
  anchorCenter: number;
  /** 受 maxHeight 限制后的浮窗高度，用于箭头钳制。 */
  height: number;
};

const OVERLAY_VIEWPORT_MARGIN = 16;
const OVERLAY_ARROW_MARGIN = 18;

function clampOverlayValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveOverlayPlacement({
  anchorCenter,
  bubbleHeight,
  viewportHeight,
}: {
  anchorCenter: number;
  bubbleHeight: number;
  viewportHeight: number;
}): OverlayPlacement {
  const maxHeight = Math.max(0, viewportHeight - OVERLAY_VIEWPORT_MARGIN * 2);
  const fallbackHeight = Math.min(240, maxHeight);
  const height = Math.min(
    maxHeight,
    Number.isFinite(bubbleHeight) && bubbleHeight > 0 ? bubbleHeight : fallbackHeight,
  );
  const maxTop = Math.max(
    OVERLAY_VIEWPORT_MARGIN,
    viewportHeight - OVERLAY_VIEWPORT_MARGIN - height,
  );
  const idealTop = anchorCenter - height / 2;

  return {
    top: clampOverlayValue(idealTop, OVERLAY_VIEWPORT_MARGIN, maxTop),
    maxHeight,
    anchorCenter,
    height,
  };
}

function newConfigDefinitionDraft(schema: string): ConfigDefinitionDraft {
  const keys = new Set(readConfigDefinitionFields(schema).map((field) => field.key));
  let index = 1;
  while (keys.has(`field_${index}`)) index += 1;
  return { key: `field_${index}`, title: "新配置项", kind: "text", default: "" };
}

function buildDefaultValueSchema(draft: ConfigDefinitionDraft) {
  const property: Record<string, unknown> = { title: draft.title || "默认值", default: draft.default };
  if (draft.kind === "number") property.type = "number";
  else if (draft.kind === "integer") property.type = "integer";
  else if (draft.kind === "boolean") property.type = "boolean";
  else if (draft.kind === "enum") {
    property.type = "string";
    property.enum = draft.enum ?? [];
    if (draft.enumWidget === "radio" || draft.enumWidget === "segmented") property["ui:widget"] = draft.enumWidget;
  }
  else if (draft.kind === "color") {
    const format = draft.colorFormat ?? "color";
    property.type = format === "opacity" ? ["number", "null"] : ["string", "null"];
    property.format = format;
    if (format === "opacity") {
      property.minimum = 0;
      property.maximum = 100;
    } else if (draft.colorPresets?.length) {
      property["ui:options"] = { colorPresets: draft.colorPresets };
    }
  }
  else if (draft.kind === "image") { property.type = "string"; property.format = "image"; property["ui:options"] = { group: "", accept: draft.accept, maxSize: draft.maxSize, widthRule: draft.widthRule, heightRule: draft.heightRule }; }
  else if (draft.kind === "images") { property.type = "array"; property.items = { type: "string", format: "image" }; property["ui:options"] = { group: "", accept: draft.accept, maxSize: draft.maxSize, widthRule: draft.widthRule, heightRule: draft.heightRule }; }
  else { property.type = "string"; if (draft.kind === "textarea") property["ui:widget"] = "textarea"; if (draft.kind === "richtext") property.format = "richtext"; }
  return JSON.stringify({ type: "object", properties: { [draft.key]: property } });
}

export interface PageConfigPanelProps {
  pages: PageConfigPanelPage[];
  activePageId?: string;
  detailPageId?: string | null;
  onDetailPageIdChange?: (pageId: string | null) => void;
  /** 选择页面；零配置页面只请求画布定位，不打开配置详情。 */
  onPageSelect?: (
    pageId: string,
    options?: { openConfigDetail?: boolean },
  ) => void;
  projectConfigSchema?: string;
  onProjectConfigChange?: (data: Record<string, unknown>, meta?: ConfigChangeMeta) => void;
  onProjectSchemaChange?: (schema: string) => void;
  /** 管理器的定义变更；宿主负责应用运行值清理计划并进入协同持久化链路。 */
  onProjectDefinitionChange?: (mutation: SchemaDefinitionMutation) => void | Promise<void>;
  /** 字段批注数据与写入能力；浏览端可传入 readOnly 控制器。 */
  configComments?: ConfigCommentController;
  /** 兼容未接入共享气泡的宿主，打开字段批注入口。 */
  onAddConfigComment?: (target: ConfigCommentTarget, trigger?: HTMLElement | null) => void;
  onPageConfigChange?: (pageId: string, data: Record<string, unknown>, meta?: ConfigChangeMeta) => void;
  onPageSchemaChange?: (pageId: string, schema: string) => void;
  onPageDefinitionChange?: (pageId: string, mutation: SchemaDefinitionMutation) => void | Promise<void>;
  onDefinitionSendToAI?: (scope: "project" | "page", mutation: SchemaDefinitionMutation) => void;
  onDefinitionAnalyze?: (scope: "project" | "page", mutation: SchemaDefinitionMutation) => ConfigDefinitionImpactSummary;
  onSaveAsDefaults?: (pageId: string, values?: Record<string, unknown>) => void;
  onRestoreDefaults?: (pageId: string) => void;
  onProjectSaveAsDefaults?: (values?: Record<string, unknown>) => void;
  onProjectRestoreDefaults?: () => void;
  readonly?: boolean;
  sessionId?: string;
  className?: string;
  title?: string;
  /** 一级页面列表是否隐藏标题栏；详情页头部不受影响。 */
  hideOverviewHeader?: boolean;
  hideDetailHeader?: boolean;
  typeLimits?: Record<string, number>;
  onEnterPositionEdit?: (target: PositionEditTarget) => void;
  onPositionFieldPathChange?: (instanceId: string, fieldPath: string) => void;
  onExitPositionEdit?: () => void;
  positionEditActiveId?: string | null;
  positionEditDimming?: boolean;
  onTogglePositionDimming?: () => void;
  /** 当前页面的配置要求（页面配置要求文档，Markdown，含行内软引用）。 */
  requirements?: string;
  /** 保存配置要求时回调（由宿主 PUT 持久化）。 */
  onRequirementsChange?: (markdown: string) => void;
  /** 配置要求加载中。 */
  requirementsLoading?: boolean;
  /** 页面需求 Markdown 的项目实体引用上下文。 */
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  /** 资源规范折叠区的展示位置；创作端由文档视图承载时可隐藏。 */
  requirementsPosition?: "beforeConfig" | "afterConfig" | "hidden";
  /** 只读入口在没有页面资源规范时隐藏整个折叠区。 */
  hideEmptyRequirements?: boolean;
  /** 已加载的设计规范绑定，用于配置字段旁的只读入口。 */
  designSpecEntries?: DesignSpecEntryLink[];
  /** 已加载的页面规范绑定，用于当前页面配置侧边栏顶部。 */
  pageDesignSpecEntries?: PageDesignSpecEntryLink[];
  /** 仅创作端提供：跳转到文档视图中的指定规范条目。 */
  onEditDesignSpec?: (docId: string, entryId: string) => void;
  /** 外部请求打开指定配置字段的定义编辑器。 */
  configDefinitionFocus?: ConfigDefinitionFocus | null;
  /** 外部配置字段焦点已被消费。 */
  onConfigDefinitionFocusConsumed?: () => void;
  /** 浏览端数据源地址；用于跨站访问创作端全局图床。 */
  mediaBaseUrl?: string;
  /** 创作端设计规范 API 上下文；提供后面板会按需读取绑定。 */
  designSpecApiContext?: { workingDir?: string; sessionId?: string; projectId?: string };
  /** 无 IO 白板启动 capability；仅创作端宿主提供。 */
  onLaunchWhiteboard?: WhiteboardLauncher;
}

function getSortedPages(pages: PageConfigPanelPage[]) {
  return [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDetailFields(
  field: ConfigItemDetail["field"],
  item: Record<string, unknown>,
) {
  let fields: FieldConfig[];
  if (field.oneOf) {
    const itemType = String(item[field.oneOf.discriminator] ?? "");
    fields = field.oneOf.variants.find(
      (variant) => String(variant.value) === itemType,
    )?.fields ?? [];
  } else {
    fields = field.children ?? [];
  }
  const effectiveItem = buildEffectiveFieldData(fields, item);
  return fields.filter((childField) =>
    isFieldVisible(childField, effectiveItem),
  );
}

/**
 * 折叠区：标题栏（展开/收起 + 动作）+ 可折叠内容。
 * 内容不做独立滚动，随面板整体滚动；`open` 由父级控制。
 */
function PanelSection({
  title,
  open,
  onToggle,
  actions,
  children,
  collapsible = true,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 pb-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="inline-flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-0 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-[15px] font-semibold leading-none text-foreground">{title}</span>
          </button>
        ) : (
          <h2 className="flex h-7 min-w-0 flex-1 items-center text-[15px] font-semibold leading-none text-foreground">{title}</h2>
        )}
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </div>
      {open && <div className="flex flex-col">{children}</div>}
    </section>
  );
}

/** 从页面 schema 提取配置引用候选（key + title/字段名）。 */
function getReferenceCandidates(schema: string | undefined): {
  key: string;
  label: string;
}[] {
  if (!schema) return [];
  try {
    const candidates: { key: string; label: string }[] = [];
    for (const group of parseSchemaToFields(schema)) {
      for (const field of group.fields) {
        candidates.push({
          key: field.key,
          label:
            typeof field.title === "string" && field.title.trim()
              ? field.title
              : field.key,
        });
      }
    }
    return candidates;
  } catch {
    return [];
  }
}

function getScopedProjectConfigSchema(
  schema: string | undefined,
  bindings: string[] | undefined,
): string | undefined {
  // bindings 为 undefined 表示未提供绑定信息（兼容：视为展示全部共享配置）；
  // 调用方对不消费共享配置的页面应显式传入 []，从而不展示共享配置区块。
  if (!schema || bindings === undefined) return schema;

  try {
    const parsed = JSON.parse(schema) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.properties)) return schema;

    const allowedKeys = new Set(bindings);
    const properties = Object.fromEntries(
      Object.entries(parsed.properties).filter(([key]) => allowedKeys.has(key)),
    );
    const nextSchema: Record<string, unknown> = {
      ...parsed,
      properties,
    };

    if (Array.isArray(parsed.required)) {
      nextSchema.required = parsed.required.filter(
        (key): key is string => typeof key === "string" && allowedKeys.has(key),
      );
    }

    return JSON.stringify(nextSchema);
  } catch {
    return schema;
  }
}

interface ScopedPageConfig {
  page: PageConfigPanelPage;
  projectConfigSchema?: string;
}

function ConfigCategoryFilterSelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
}) {
  if (categories.length === 0) return null;

  return (
    <div className="relative flex shrink-0 items-center">
      <ListFilter className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <select
        aria-label="筛选配置分类"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-[128px] cursor-pointer rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">全部分类</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PageConfigPanel({
  pages,
  activePageId,
  detailPageId,
  onDetailPageIdChange,
  onPageSelect,
  projectConfigSchema,
  onProjectConfigChange,
  onProjectSchemaChange,
  onProjectDefinitionChange,
  configComments,
  onAddConfigComment,
  onPageConfigChange,
  onPageSchemaChange,
  onPageDefinitionChange,
  onDefinitionSendToAI,
  onDefinitionAnalyze,
  onSaveAsDefaults,
  onRestoreDefaults,
  onProjectSaveAsDefaults,
  onProjectRestoreDefaults,
  readonly,
  sessionId,
  className,
  title = "配置面板",
  hideOverviewHeader = false,
  hideDetailHeader = false,
  typeLimits,
  onEnterPositionEdit,
  onPositionFieldPathChange,
  onExitPositionEdit,
  positionEditActiveId,
  positionEditDimming,
  onTogglePositionDimming,
  requirements,
  onRequirementsChange,
  requirementsLoading,
  referenceContext,
  referenceProvider,
  onReferenceClick,
  requirementsPosition = "afterConfig",
  hideEmptyRequirements = false,
  designSpecEntries = EMPTY_DESIGN_SPEC_ENTRIES,
  pageDesignSpecEntries = EMPTY_PAGE_DESIGN_SPEC_ENTRIES,
  onEditDesignSpec,
  configDefinitionFocus,
  onConfigDefinitionFocusConsumed,
  designSpecApiContext,
  mediaBaseUrl,
  onLaunchWhiteboard,
}: PageConfigPanelProps) {
  const localizeRemoteImage = useMemo(
    () =>
      !readonly && sessionId
        ? (url: string) => localizeRemoteImageForSession(sessionId, url)
        : undefined,
    [readonly, sessionId],
  );
  const [internalDetailPageId, setInternalDetailPageId] = useState<
    string | null
  >(null);
  const [configCategoryFilter, setConfigCategoryFilter] = useState("");
  const [configActionsOpen, setConfigActionsOpen] = useState(false);
  const [saveDefaultsScope, setSaveDefaultsScope] = useState<
    "page" | "project" | null
  >(null);
  const [requirementsSectionOpen, setRequirementsSectionOpen] = useState(true);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [requirementsDraft, setRequirementsDraft] = useState("");
  const [loadedDesignSpecEntries, setLoadedDesignSpecEntries] = useState<DesignSpecEntryLink[]>([]);
  const [loadedPageDesignSpecEntries, setLoadedPageDesignSpecEntries] = useState<PageDesignSpecEntryLink[]>([]);
  const [definitionEditor, setDefinitionEditor] = useState<DefinitionEditorState | null>(null);
  const [definitionSaving, setDefinitionSaving] = useState(false);
  const [activeDesignSpec, setActiveDesignSpec] = useState<ActiveDesignSpec | null>(null);
  const [activeConfigComment, setActiveConfigComment] = useState<ActiveConfigComment | null>(null);
  const [designSpecPanelBounds, setDesignSpecPanelBounds] =
    useState<DesignSpecPanelBounds | null>(null);
  const [overlayPlacement, setOverlayPlacement] =
    useState<OverlayPlacement | null>(null);
  const configPanelRef = useRef<HTMLDivElement | null>(null);
  const configContentRef = useRef<HTMLDivElement | null>(null);
  const sheetTriggerRef = useRef<HTMLElement | null>(null);
  const sheetParentScrollTopRef = useRef(0);
  const sheetPageIdRef = useRef<string | null>(null);
  const sheetActivePositionIdRef = useRef<string | null>(positionEditActiveId ?? null);
  const sheetOnExitPositionEditRef = useRef(onExitPositionEdit);
  sheetActivePositionIdRef.current = positionEditActiveId ?? null;
  sheetOnExitPositionEditRef.current = onExitPositionEdit;
  const designSpecPanelRef = useRef<HTMLElement | null>(null);
  const designSpecTriggerRef = useRef<HTMLElement | null>(null);
  const configCommentPanelRef = useRef<HTMLElement | null>(null);
  const configCommentTriggerRef = useRef<HTMLElement | null>(null);
  const [sheetRoute, setSheetRoute] = useState<ConfigItemDetail | null>(null);

  const toggleDesignSpec = useCallback((next: ActiveDesignSpec, trigger?: HTMLElement | null) => {
    designSpecTriggerRef.current = trigger ?? null;
    setActiveConfigComment(null);
    configCommentTriggerRef.current = null;
    setActiveDesignSpec((current) => isSameDesignSpec(current, next) ? null : next);
  }, []);

  const isSameConfigComment = useCallback(
    (current: ActiveConfigComment | null, next: ConfigCommentTarget) => Boolean(
      current
      && current.target.scope === next.scope
      && current.target.fieldKey === next.fieldKey
      && (next.scope === "project"
        ? !current.target.pageId && !next.pageId
        : current.target.pageId === next.pageId),
    ),
    [],
  );

  const handleOpenConfigComment = useCallback((target: ConfigCommentTarget, trigger?: HTMLElement | null) => {
    if (!configComments) {
      onAddConfigComment?.(target, trigger);
      return;
    }
    configCommentTriggerRef.current = trigger ?? null;
    const rect = trigger?.getBoundingClientRect();
    setActiveDesignSpec(null);
    designSpecTriggerRef.current = null;
    setActiveConfigComment((current) => (
      isSameConfigComment(current, target)
        ? null
        : {
            target,
            fieldTitle: target.fieldTitleSnapshot || target.fieldKey,
            anchor: rect && (rect.width || rect.height)
              ? { top: rect.top, bottom: rect.bottom }
              : undefined,
          }
    ));
  }, [configComments, isSameConfigComment, onAddConfigComment]);

  useEffect(() => {
    if (!designSpecApiContext?.workingDir) return;
    let cancelled = false;
    const params = new URLSearchParams({ workingDir: designSpecApiContext.workingDir });
    if (designSpecApiContext.sessionId) params.set("sessionId", designSpecApiContext.sessionId);
    if (designSpecApiContext.projectId) params.set("projectId", designSpecApiContext.projectId);
    void fetch(`/api/design-specs?${params.toString()}`)
      .then((res) => res.json())
      .then(async (result) => {
        if (!result?.success || !Array.isArray(result.data)) return [];
        return Promise.all(result.data.map(async (meta: { id: string; title: string }) => {
          const res = await fetch(`/api/design-specs/${encodeURIComponent(meta.id)}?${params.toString()}`);
          const docResult = await res.json();
          const doc = docResult?.data;
          if (!docResult?.success || !doc || !Array.isArray(doc.entries)) return { config: [], page: [] };
          const config: DesignSpecEntryLink[] = [];
          const page: PageDesignSpecEntryLink[] = [];
          for (const entry of doc.entries as Array<{
            id: string;
            title: string;
            markdown?: string;
            target?: { type?: string; refs?: Array<{ scope: "project" | "page"; pageId?: string; fieldKey: string }>; pageIds?: string[] };
          }>) {
            if (entry.target?.type === "config") {
              for (const ref of entry.target.refs ?? []) {
                config.push({
                  docId: doc.id,
                  docTitle: doc.title || meta.title,
                  entryId: entry.id,
                  entryTitle: entry.title,
                  markdown: entry.markdown ?? "",
                  ...ref,
                });
              }
            } else if (entry.target?.type === "page") {
              for (const pageId of entry.target.pageIds ?? []) {
                page.push({
                  docId: doc.id,
                  docTitle: doc.title || meta.title,
                  entryId: entry.id,
                  entryTitle: entry.title,
                  markdown: entry.markdown ?? "",
                  pageId,
                });
              }
            }
          }
          return { config, page };
        }));
      })
      .then((entryGroups) => {
        if (!cancelled && Array.isArray(entryGroups)) {
          setLoadedDesignSpecEntries(entryGroups.flatMap((group) => group.config));
          setLoadedPageDesignSpecEntries(entryGroups.flatMap((group) => group.page));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedDesignSpecEntries([]);
          setLoadedPageDesignSpecEntries([]);
        }
      });
    return () => { cancelled = true; };
  }, [designSpecApiContext?.workingDir, designSpecApiContext?.sessionId, designSpecApiContext?.projectId]);

  const [restoreDefaultsScope, setRestoreDefaultsScope] = useState<
    "page" | "project" | null
  >(null);
  const effectiveDetailPageId =
    detailPageId === undefined ? internalDetailPageId : detailPageId;
  const selectedPageDesignSpecEntries = effectiveDetailPageId
    ? pages.find((page) => page.id === effectiveDetailPageId)?.designSpecEntries
    : undefined;
  const selectedPagePageDesignSpecEntries = effectiveDetailPageId
    ? pages.find((page) => page.id === effectiveDetailPageId)?.pageDesignSpecEntries
    : undefined;
  const effectiveDesignSpecEntries =
    designSpecEntries.length > 0
      ? designSpecEntries
      : selectedPageDesignSpecEntries !== undefined
        ? selectedPageDesignSpecEntries
        : loadedDesignSpecEntries;
  const effectivePageDesignSpecEntries =
    pageDesignSpecEntries.length > 0
      ? pageDesignSpecEntries
      : selectedPagePageDesignSpecEntries !== undefined
        ? selectedPagePageDesignSpecEntries
        : loadedPageDesignSpecEntries;
  useEffect(() => {
    setActiveDesignSpec(null);
    setActiveConfigComment(null);
    designSpecTriggerRef.current = null;
    configCommentTriggerRef.current = null;
  }, [effectiveDetailPageId, configCategoryFilter]);
  useEffect(() => {
    if (!activeDesignSpec && !activeConfigComment) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !designSpecPanelRef.current?.contains(target)
        && !designSpecTriggerRef.current?.contains(target)
        && !configCommentPanelRef.current?.contains(target)
        && !configCommentTriggerRef.current?.contains(target)
      ) {
        setActiveDesignSpec(null);
        setActiveConfigComment(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [activeDesignSpec, activeConfigComment]);
  useLayoutEffect(() => {
    if ((!activeDesignSpec && !activeConfigComment) || !configPanelRef.current) {
      setDesignSpecPanelBounds(null);
      return;
    }

    const updateBounds = () => {
      const rect = configPanelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDesignSpecPanelBounds({
        left: rect.left,
        availableLeftWidth: rect.left,
      });
    };

    updateBounds();
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(updateBounds);
    observer?.observe(configPanelRef.current);
    window.addEventListener("resize", updateBounds);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [activeDesignSpec, activeConfigComment]);
  useLayoutEffect(() => {
    if ((!activeDesignSpec && !activeConfigComment) || !designSpecPanelBounds) {
      setOverlayPlacement(null);
      return;
    }

    const overlay = designSpecPanelRef.current ?? configCommentPanelRef.current;
    if (!overlay) return;

    const fallbackAnchor = activeDesignSpec?.anchor ?? activeConfigComment?.anchor;

    const updatePlacement = () => {
      const viewportHeight = typeof window === "undefined"
        ? 0
        : Math.max(0, window.visualViewport?.height ?? window.innerHeight);
      if (!viewportHeight) return;

      const trigger = activeDesignSpec
        ? designSpecTriggerRef.current
        : configCommentTriggerRef.current;
      const triggerRect = trigger?.getBoundingClientRect();
      const hasTriggerRect = Boolean(
        triggerRect
        && Number.isFinite(triggerRect.top)
        && Number.isFinite(triggerRect.bottom)
        && (triggerRect.width > 0 || triggerRect.height > 0),
      );
      const anchorCenter = hasTriggerRect && triggerRect
        ? (triggerRect.top + triggerRect.bottom) / 2
        : fallbackAnchor && Number.isFinite(fallbackAnchor.top) && Number.isFinite(fallbackAnchor.bottom)
          ? (fallbackAnchor.top + fallbackAnchor.bottom) / 2
          : viewportHeight / 2;
      const next = resolveOverlayPlacement({
        anchorCenter,
        bubbleHeight: overlay.getBoundingClientRect().height,
        viewportHeight,
      });

      setOverlayPlacement((current) => (
        current
        && current.top === next.top
        && current.maxHeight === next.maxHeight
        && current.anchorCenter === next.anchorCenter
        && current.height === next.height
          ? current
          : next
      ));
    };

    updatePlacement();
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(updatePlacement);
    observer?.observe(overlay);
    const scrollContainer = configContentRef.current;
    scrollContainer?.addEventListener("scroll", updatePlacement, { passive: true });
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    window.visualViewport?.addEventListener("resize", updatePlacement);
    return () => {
      observer?.disconnect();
      scrollContainer?.removeEventListener("scroll", updatePlacement);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      window.visualViewport?.removeEventListener("resize", updatePlacement);
    };
  }, [activeDesignSpec, activeConfigComment, designSpecPanelBounds]);
  const sortedPages = useMemo(() => getSortedPages(pages), [pages]);
  const scopedPages = useMemo<ScopedPageConfig[]>(
    () =>
      sortedPages.map((page) => ({
        page,
        projectConfigSchema: getScopedProjectConfigSchema(
          page.projectConfigSchema ?? projectConfigSchema,
          page.projectConfigBindings,
        ),
      })),
    [projectConfigSchema, sortedPages],
  );
  const availableCategories = useMemo(
    () =>
      getAvailableConfigCategories([
        ...scopedPages.map((item) => item.projectConfigSchema),
        ...sortedPages.map((page) => page.schema),
      ]),
    [scopedPages, sortedPages],
  );

  useEffect(() => {
    if (
      configCategoryFilter &&
      !availableCategories.includes(configCategoryFilter)
    ) {
      setConfigCategoryFilter("");
    }
  }, [availableCategories, configCategoryFilter]);

  const filteredPages = useMemo(() => {
    if (!configCategoryFilter) return scopedPages;
    return scopedPages.filter(
      ({ page, projectConfigSchema: scopedProjectConfigSchema }) =>
        getSchemaFieldCountByCategory(
          scopedProjectConfigSchema,
          configCategoryFilter,
        ) + getSchemaFieldCountByCategory(page.schema, configCategoryFilter) >
        0,
    );
  }, [configCategoryFilter, scopedPages]);
  const selectedPageConfig =
    scopedPages.find((item) => item.page.id === effectiveDetailPageId) ?? null;
  const selectedPage = selectedPageConfig?.page ?? null;
  const selectedProjectConfigSchema = selectedPageConfig?.projectConfigSchema;
  const selectedPageSpecs = selectedPage
    ? effectivePageDesignSpecEntries.filter(
        (entry) => entry.pageId === selectedPage.id && entry.markdown.trim(),
      )
    : [];

  const openDefinitionEditor = (
    scope: "page" | "project",
    key?: string,
    schemaFieldPath?: string,
  ) => {
    if (!selectedPage) return;
    if (readonly) return;
    const capabilities = scope === "project"
      ? selectedPage.configItemCapabilities?.project
      : selectedPage.configItemCapabilities?.page;
    if (capabilities && !capabilities.canEditDefinition) return;
    setActiveDesignSpec(null);
    setActiveConfigComment(null);
    designSpecTriggerRef.current = null;
    configCommentTriggerRef.current = null;
    const targetSchema = scope === "project"
      ? selectedProjectConfigSchema || EMPTY_SCHEMA
      : selectedPage.schema || EMPTY_SCHEMA;
    const requestedFieldPath = schemaFieldPath?.trim() || (
      key && (key.includes(".") || key.includes("[")) ? key : undefined
    );
    const existing = key
      ? requestedFieldPath
        ? readConfigDefinitionFieldAtPath(targetSchema, requestedFieldPath)
        : readConfigDefinitionFields(targetSchema).find((field) => field.key === key)
      : undefined;
    if (key && !existing) return;
    setDefinitionEditor(existing
      ? {
          mode: "edit",
          scope,
          draft: existing,
          originalKey: existing.key,
          schemaFieldPath: requestedFieldPath,
        }
      : { mode: "create", scope, draft: newConfigDefinitionDraft(targetSchema) });
  };

  const hasConfigComment = useCallback(
    (target: ConfigCommentTarget) =>
      filterCommentThreadsByTarget(configComments?.threads ?? [], target).length > 0,
    [configComments?.threads],
  );
  const hideEmptyConfigCommentTag = configComments?.readOnly === true;

  const consumedConfigDefinitionFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!configDefinitionFocus) {
      consumedConfigDefinitionFocusRef.current = null;
      return;
    }
    const focusKey = [
      configDefinitionFocus.scope,
      configDefinitionFocus.pageId ?? "",
      configDefinitionFocus.fieldKey,
    ].join(":");
    if (consumedConfigDefinitionFocusRef.current === focusKey || !selectedPage) {
      return;
    }
    if (
      configDefinitionFocus.scope === "page" &&
      configDefinitionFocus.pageId !== selectedPage.id
    ) {
      return;
    }
    consumedConfigDefinitionFocusRef.current = focusKey;
    const focusSchema = configDefinitionFocus.scope === "project"
      ? selectedProjectConfigSchema || EMPTY_SCHEMA
      : selectedPage.schema || EMPTY_SCHEMA;
    const catalogField = enumerateSchemaFields(focusSchema).find((field) => field.key === configDefinitionFocus.fieldKey);
    if (catalogField && !catalogField.isBranch) {
      openDefinitionEditor(configDefinitionFocus.scope, catalogField.key);
    }
    onConfigDefinitionFocusConsumed?.();
    // The focus request is consumed immediately; the parent clears it so a
    // normal rerender cannot reopen the same dialog.
  }, [
    configDefinitionFocus,
    selectedPage?.id,
    selectedPage?.schema,
    selectedProjectConfigSchema,
  ]);

  const definitionImpact = useMemo<ConfigItemApplyPlanSnapshot | undefined>(() => {
    if (!definitionEditor || !selectedPage) return undefined;
    const isProject = definitionEditor.scope === "project";
    const targetSchema = isProject ? selectedProjectConfigSchema || EMPTY_SCHEMA : selectedPage.schema || EMPTY_SCHEMA;
    try {
      const mutation = applySchemaDefinitionCommand(targetSchema, definitionEditor.mode === "create"
        ? { type: "field.add", field: definitionEditor.draft }
        : {
            type: "field.update",
            key: definitionEditor.originalKey!,
            path: definitionEditor.schemaFieldPath,
            patch: definitionEditor.draft,
          });
      const impact = onDefinitionAnalyze?.(definitionEditor.scope, mutation);
      if (impact?.risk === "ai_required") {
        return { kind: "ai_required", title: "需要 AI 应用", description: "该定义变更会影响已绑定页面。保存定义后，请确认页面同步任务。" };
      }
      return { kind: "schema_only", title: "仅保存字段", description: isProject ? "将更新共享字段定义；不会自动改写任何页面源码。" : "将更新字段定义；不会覆盖当前预览中已编辑的配置值。" };
    } catch (error) {
      return { kind: "unsupported", title: "暂不能保存", description: error instanceof Error ? error.message : "字段定义无效" };
    }
  }, [definitionEditor, onDefinitionAnalyze, selectedPage, selectedProjectConfigSchema]);

  const saveDefinitionEditor = async () => {
    if (!definitionEditor || !selectedPage) return;
    const targetSchema = definitionEditor.scope === "project"
      ? selectedProjectConfigSchema || EMPTY_SCHEMA
      : selectedPage.schema || EMPTY_SCHEMA;
    try {
      const mutation = applySchemaDefinitionCommand(targetSchema, definitionEditor.mode === "create"
        ? { type: "field.add", field: definitionEditor.draft }
        : {
            type: "field.update",
            key: definitionEditor.originalKey!,
            path: definitionEditor.schemaFieldPath,
            patch: definitionEditor.draft,
          });
      setDefinitionSaving(true);
      if (definitionEditor.scope === "project") {
        await onProjectDefinitionChange?.(mutation);
      } else {
        await onPageDefinitionChange?.(selectedPage.id, mutation);
      }
      setDefinitionEditor(null);
    } catch {
      // The host reports persistence failures. Keep the draft open for retry.
    } finally {
      setDefinitionSaving(false);
    }
  };
  const sharedAffectedPages = useMemo(
    () =>
      scopedPages
        .filter(
          ({ projectConfigSchema: scopedProjectConfigSchema }) =>
            getSchemaFieldCountByCategory(
              scopedProjectConfigSchema,
              configCategoryFilter,
            ) > 0,
        )
        .map(({ page }) => page),
    [configCategoryFilter, scopedPages],
  );

  useEffect(() => {
    setEditingRequirements(false);
    setRequirementsDraft(requirements ?? "");
  }, [effectiveDetailPageId, requirements]);

  const openPageDetail = (pageId: string, hasConfig: boolean) => {
    onPageSelect?.(pageId, { openConfigDetail: hasConfig });
    if (!hasConfig) return;
    setInternalDetailPageId(pageId);
    onDetailPageIdChange?.(pageId);
  };

  const closePageDetail = () => {
    setInternalDetailPageId(null);
    onDetailPageIdChange?.(null);
  };

  const sheetHistoryRef = useRef<ConfigItemDetail[]>([]);
  const sheetPositionRegistryRef = useRef<Map<string, PositionFieldEntry>>(new Map());

  const openConfigItemSheet = useCallback((detail: ConfigItemDetail) => {
    const scrollTop = configContentRef.current?.scrollTop ?? 0;
    sheetParentScrollTopRef.current = scrollTop;
    sheetPageIdRef.current = selectedPage?.id ?? null;
    if (sheetRoute) sheetHistoryRef.current.push(sheetRoute);
    sheetTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setSheetRoute({
      ...detail,
      breadcrumb: detail.breadcrumb.filter((item, index, all) =>
        index === 0 || item.id !== all[index - 1]?.id,
      ),
      onChangeField: (key, value, meta) => {
        detail.onChangeField(key, value, meta);
        setSheetRoute((current) => current && current.itemId === detail.itemId
          ? { ...current, item: { ...current.item, [key]: value } }
          : current);
      },
      parentScrollTop: scrollTop,
      parentFocusKey: detail.itemId,
    });
  }, [selectedPage?.id, sheetRoute]);

  useEffect(() => {
    setSheetRoute((current) => {
      if (!current) return current;
      const latestItem = current.getCurrentItem?.();
      if (!latestItem || latestItem === current.item) return current;
      return { ...current, item: latestItem };
    });
  }, [selectedPage?.configData]);

  const handleSheetBack = useCallback(() => {
    const previous = sheetHistoryRef.current.pop();
    if (previous) {
      setSheetRoute(previous);
      return;
    }
    setSheetRoute(null);
  }, []);

  const handleSheetBreadcrumb = useCallback((_: ConfigBreadcrumb, index: number) => {
    if (!sheetRoute) return;
    const target = sheetHistoryRef.current
      .slice()
      .reverse()
      .find((candidate) => candidate.breadcrumb.length - 1 <= index);
    if (target) {
      sheetHistoryRef.current = sheetHistoryRef.current.slice(0, sheetHistoryRef.current.lastIndexOf(target));
      setSheetRoute(target);
    } else {
      sheetHistoryRef.current = [];
      setSheetRoute(null);
    }
  }, [sheetRoute]);

  const handleItemDetailInvalidated = useCallback((itemId: string) => {
    if (sheetRoute?.itemId !== itemId) return;
    sheetHistoryRef.current = [];
    sheetPageIdRef.current = null;
    setSheetRoute(null);
  }, [sheetRoute?.itemId]);

  useLayoutEffect(() => {
    if (sheetRoute) return;
    const scrollContainer = configContentRef.current;
    if (scrollContainer) {
      // Preserve the current list position when the Sheet closes. Browsers
      // may clamp this value after a delete, so use the nearest valid offset.
      const max = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      scrollContainer.scrollTop = Math.min(sheetParentScrollTopRef.current, max);
    }
    const trigger = sheetTriggerRef.current;
    if (trigger && document.contains(trigger)) trigger.focus();
    else configContentRef.current?.focus();
    sheetTriggerRef.current = null;
  }, [sheetRoute]);

  useEffect(() => {
    if (sheetRoute && (!selectedPage || sheetPageIdRef.current !== selectedPage.id || sheetRoute.fieldPath.length === 0)) {
      sheetHistoryRef.current = [];
      setSheetRoute(null);
      sheetPageIdRef.current = null;
    }
  }, [selectedPage, sheetRoute]);

  const sheetPositionContext = useMemo<PositionConfigContextValue>(() => ({
    registerPositionField: (entry) => {
      sheetPositionRegistryRef.current.set(entry.instanceId, entry);
      onPositionFieldPathChange?.(entry.instanceId, entry.fieldPath);
      return () => {
        if (sheetPositionRegistryRef.current.get(entry.instanceId) === entry) {
          sheetPositionRegistryRef.current.delete(entry.instanceId);
        }
        if (sheetActivePositionIdRef.current === entry.instanceId) {
          queueMicrotask(() => {
            if (
              sheetActivePositionIdRef.current === entry.instanceId &&
              !sheetPositionRegistryRef.current.has(entry.instanceId)
            ) {
              sheetOnExitPositionEditRef.current?.();
            }
          });
        }
      };
    },
    requestPositionEdit: (instanceId) => {
      const entry = sheetPositionRegistryRef.current.get(instanceId);
      if (!entry) return;
      onEnterPositionEdit?.({
        id: entry.instanceId,
        fieldPath: entry.fieldPath,
        domKey: entry.posKey,
        domOccurrence: entry.domOccurrence,
        position: entry.currentValue,
      });
    },
    exitPositionEdit: () => onExitPositionEdit?.(),
    activePositionId: positionEditActiveId ?? null,
    dimming: positionEditDimming ?? false,
    onToggleDimming: onTogglePositionDimming,
  }), [onEnterPositionEdit, onExitPositionEdit, onPositionFieldPathChange, onTogglePositionDimming, positionEditActiveId, positionEditDimming]);

  if (!selectedPage) {
    return (
      <div className={cn("flex h-full flex-col bg-card", className)}>
        {(!hideOverviewHeader || availableCategories.length > 0) && (
          <div className="border-b border-border/80 px-4 py-3">
            <div
              className={cn(
                "flex min-w-0 items-center gap-3",
                hideOverviewHeader ? "justify-end" : "justify-between",
              )}
            >
              {!hideOverviewHeader && (
                <h2 className="min-w-0 truncate text-[15px] font-semibold">{title}</h2>
              )}
              <ConfigCategoryFilterSelect
                value={configCategoryFilter}
                onChange={setConfigCategoryFilter}
                categories={availableCategories}
              />
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sortedPages.length === 0 ? (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 text-center">
              <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">暂无页面</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                添加页面后即可配置页面内容
              </p>
            </div>
          ) : filteredPages.length > 0 ? (
            <div className="space-y-1">
              {filteredPages.map(({ page, projectConfigSchema: scopedProjectConfigSchema }) => {
                const sharedCount = getSchemaFieldCountByBindings(
                  page.projectConfigSchema ?? projectConfigSchema,
                  page.projectConfigBindings,
                  configCategoryFilter,
                );
                const pageCount = getSchemaFieldCountByCategory(
                  page.schema,
                  configCategoryFilter,
                );
                const totalCount = sharedCount + pageCount;
                const isActive = page.id === activePageId;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => openPageDetail(page.id, totalCount > 0)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "border-primary/35 bg-primary/10"
                        : "",
                    )}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {page.name}
                      </div>
                    </div>
                    {totalCount > 0 && (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                          {totalCount}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 text-center">
              <ListFilter className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">没有匹配的配置项</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                换一个配置分类查看
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const pageConfigTypeCounts = Object.fromEntries(
    CONFIG_TYPE_SECTIONS.map(({ type }) => [
      type,
      getSchemaFieldCountByType(selectedPage.schema, type, configCategoryFilter),
    ]),
  ) as Record<(typeof CONFIG_TYPE_SECTIONS)[number]["type"], number>;
  const projectConfigTypeCounts = Object.fromEntries(
    CONFIG_TYPE_SECTIONS.map(({ type }) => [
      type,
      getSchemaFieldCountByBindings(
        selectedPage.projectConfigSchema ?? projectConfigSchema,
        selectedPage.projectConfigBindings,
        configCategoryFilter,
        type,
      ),
    ]),
  ) as Record<(typeof CONFIG_TYPE_SECTIONS)[number]["type"], number>;
  const visibleConfigCount = [
    ...Object.values(pageConfigTypeCounts),
    ...Object.values(projectConfigTypeCounts),
  ].reduce(
    (count, value) => count + value,
    0,
  );
  const showSemanticSeparation = CONFIG_TYPE_SECTIONS.every(
    ({ type }) => pageConfigTypeCounts[type] + projectConfigTypeCounts[type] > 0,
  );
  const projectCapabilities = selectedPage.configItemCapabilities?.project;
  const pageCapabilities = selectedPage.configItemCapabilities?.page;
  const isReferencePage = Boolean(selectedPage.reference);
  const canCreateProjectConfig =
    Boolean(onProjectDefinitionChange) &&
    (projectCapabilities?.canEditDefinition ?? !readonly);
  const canCreatePageConfig =
    Boolean(onPageDefinitionChange) &&
    (pageCapabilities?.canEditDefinition ?? !readonly);
  const canAddConfig = !readonly && (canCreateProjectConfig || canCreatePageConfig);
  const canRestorePageDefaults =
    Boolean(onRestoreDefaults) && (pageCapabilities?.canEditValue ?? !readonly);
  const canRestoreProjectDefaults =
    Boolean(onProjectRestoreDefaults) &&
    (projectCapabilities?.canEditValue ?? !readonly);
  const canSavePageDefaults =
    !isReferencePage &&
    Boolean(onSaveAsDefaults) && (pageCapabilities?.canEditValue ?? !readonly);
  const canSaveProjectDefaults =
    !isReferencePage &&
    Boolean(onProjectSaveAsDefaults) &&
    (projectCapabilities?.canEditValue ?? !readonly);
  const restoreDefaultsTarget = canRestorePageDefaults
    ? "page"
    : canRestoreProjectDefaults
      ? "project"
      : null;
  const saveDefaultsTarget = canSavePageDefaults
    ? "page"
    : canSaveProjectDefaults
      ? "project"
      : null;
  const showConfigActions =
    canAddConfig ||
    restoreDefaultsTarget !== null ||
    saveDefaultsTarget !== null;
  const configDefinitionCreateScope = canCreatePageConfig ? "page" : "project";
  const hasRequirements = Boolean(requirements?.trim());
  const shouldShowRequirements =
    requirementsPosition !== "hidden" &&
    (!hideEmptyRequirements ||
      requirementsLoading ||
      editingRequirements ||
      hasRequirements);
  const configData = selectedPage.configData ?? {};
  const activeDesignSpecOptions = activeDesignSpec
    && activeDesignSpec.kind === "config"
    ? effectiveDesignSpecEntries.filter((entry) =>
        entry.fieldKey === activeDesignSpec.spec.fieldKey &&
        entry.scope === activeDesignSpec.spec.scope &&
        (entry.scope !== "page" || entry.pageId === activeDesignSpec.spec.pageId) &&
        entry.markdown.trim(),
      )
    : [];
  const hasRoomForSideBubble =
    designSpecPanelBounds !== null &&
    designSpecPanelBounds.availableLeftWidth >= 320 &&
    typeof window !== "undefined" &&
    window.innerWidth >= 768;
  const activeOverlayAnchor = activeDesignSpec?.anchor ?? activeConfigComment?.anchor;
  const overlayTop = overlayPlacement?.top ?? OVERLAY_VIEWPORT_MARGIN;
  const overlayMaxHeight = overlayPlacement
    ? `${overlayPlacement.maxHeight}px`
    : "calc(100dvh - 32px)";
  const overlayHeight = overlayPlacement?.height ?? 240;
  const overlayAnchorCenter = overlayPlacement?.anchorCenter
    ?? (activeOverlayAnchor
      ? (activeOverlayAnchor.top + activeOverlayAnchor.bottom) / 2
      : undefined);
  const bubbleArrowTop = overlayAnchorCenter === undefined
    ? 36
    : clampOverlayValue(
        overlayAnchorCenter - overlayTop,
        OVERLAY_ARROW_MARGIN,
        Math.max(OVERLAY_ARROW_MARGIN, overlayHeight - OVERLAY_ARROW_MARGIN),
      );
  const designSpecBubble = activeDesignSpec && designSpecPanelBounds && (
    <aside
      ref={designSpecPanelRef}
      aria-label="设计规范"
      className="fixed z-[70] flex max-w-[calc(100vw-16px)] flex-col overflow-visible rounded-xl border border-border/70 bg-card shadow-[0_20px_55px_-20px_rgb(0_0_0_/_0.65)] ring-1 ring-black/5"
      style={hasRoomForSideBubble
        ? {
            top: `${overlayTop}px`,
            left: Math.max(8, designSpecPanelBounds.left - Math.min(380, designSpecPanelBounds.availableLeftWidth - 20) - 12),
            width: Math.min(380, designSpecPanelBounds.availableLeftWidth - 20),
            maxHeight: overlayMaxHeight,
          }
        : { top: `${overlayTop}px`, right: 8, left: 8, maxHeight: overlayMaxHeight }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 z-0 h-0 w-0 border-y-[8px] border-y-transparent border-l-[8px] border-l-card"
        style={{ top: bubbleArrowTop - 8 }}
      />
      <div className="relative z-10 flex min-h-14 shrink-0 items-center gap-3 rounded-t-xl border-b border-border/70 bg-muted/30 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold tracking-tight">{activeDesignSpec.fieldTitle}</h3>
        </div>
        {onEditDesignSpec && (
          <button
            type="button"
            onClick={() => onEditDesignSpec(activeDesignSpec.spec.docId, activeDesignSpec.spec.entryId)}
            aria-label="编辑规范"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveDesignSpec(null)}
          aria-label="关闭设计规范"
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {activeDesignSpec.kind === "config" && activeDesignSpecOptions.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/80 px-3 py-2">
          {activeDesignSpecOptions.map((spec) => (
            <button
              key={`${spec.docId}:${spec.entryId}`}
              type="button"
              onClick={() => setActiveDesignSpec({ kind: "config", spec, fieldTitle: activeDesignSpec.fieldTitle, anchor: activeDesignSpec.anchor })}
              className={cn(
                "max-w-[180px] shrink-0 truncate rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                spec.entryId === activeDesignSpec.spec.entryId
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {spec.entryTitle || "未命名规范"}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card p-4">
        <PageRequirements
          markdown={activeDesignSpec.spec.markdown}
          allowExternalMedia
          mediaBaseUrl={mediaBaseUrl}
          className="!max-w-none !text-sm !leading-[1.65]"
        />
      </div>
    </aside>
  );
  const configCommentBubble = activeConfigComment && designSpecPanelBounds && configComments && (
    <aside
      ref={configCommentPanelRef}
      aria-label="配置项批注"
      className="fixed z-[70] flex max-w-[calc(100vw-16px)] flex-col overflow-visible rounded-xl border border-border/70 bg-card shadow-[0_20px_55px_-20px_rgb(0_0_0_/_0.65)] ring-1 ring-black/5"
      style={hasRoomForSideBubble
        ? {
            top: `${overlayTop}px`,
            left: Math.max(8, designSpecPanelBounds.left - Math.min(380, designSpecPanelBounds.availableLeftWidth - 20) - 12),
            width: Math.min(380, designSpecPanelBounds.availableLeftWidth - 20),
            maxHeight: overlayMaxHeight,
          }
        : { top: `${overlayTop}px`, right: 8, left: 8, maxHeight: overlayMaxHeight }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 z-0 h-0 w-0 border-y-[8px] border-y-transparent border-l-[8px] border-l-card"
        style={{ top: bubbleArrowTop - 8 }}
      />
      <div className="relative z-10 flex min-h-14 shrink-0 items-center gap-3 rounded-t-xl border-b border-border/70 bg-muted/30 px-4 py-2.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {activeConfigComment.fieldTitle}
        </h3>
        <button
          type="button"
          onClick={() => {
            setActiveConfigComment(null);
            configCommentTriggerRef.current = null;
          }}
          aria-label="关闭批注"
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ConfigCommentPopover target={activeConfigComment.target} {...configComments} />
    </aside>
  );
  const sheetCurrentIndex = sheetRoute
    ? Math.max(0, sheetRoute.getCurrentIndex?.() ?? sheetRoute.index)
    : 0;
  const sheetItem = sheetRoute?.item;
  const sheetFields = sheetRoute
    ? getDetailFields(sheetRoute.field, sheetItem ?? sheetRoute.item)
    : [];
  const sheetSchemaChildPath = (fieldKey: string) => {
    const parentPath = sheetRoute?.schemaFieldPath ?? sheetRoute?.field.key ?? "";
    if (sheetRoute?.field.oneOf) {
      const discriminator = sheetRoute.field.oneOf.discriminator;
      return `${parentPath}[${discriminator}=${String((sheetItem ?? sheetRoute.item)[discriminator])}].${fieldKey}`;
    }
    return `${parentPath}[].${fieldKey}`;
  };
  const sheetFieldContent = sheetRoute && (
    <PositionConfigContext.Provider value={sheetPositionContext}>
      <div className="flex min-w-0 flex-col gap-5">
        {sheetFields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/20 px-4 py-8 text-center text-sm text-muted-foreground">
            无配置项
          </div>
        ) : (
          sheetFields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={(sheetItem ?? sheetRoute.item)[field.key]}
              onChange={(value, meta) => sheetRoute.onChangeField(field.key, value, meta)}
              sessionId={sessionId}
              readonly={readonly}
              embedded
              fieldPath={`${sheetRoute.fieldPath}[${sheetCurrentIndex}].${field.key}`}
              schemaFieldPath={sheetSchemaChildPath(field.key)}
              imageConfigScope="page"
              pageId={selectedPage.id}
              configContextPageId={selectedPage.id}
              configItemCapabilities={selectedPage.configItemCapabilities?.page}
              designSpecEntries={effectiveDesignSpecEntries.filter((entry) => entry.scope === "page" && entry.pageId === selectedPage.id)}
              onEditDesignSpec={onEditDesignSpec}
              onOpenDesignSpec={(spec, fieldTitle, anchor, trigger) =>
                toggleDesignSpec({ kind: "config", spec, fieldTitle, anchor }, trigger)}
              onEditConfigDefinition={onPageDefinitionChange
                ? (key, _field, schemaFieldPath) => openDefinitionEditor("page", key, schemaFieldPath)
                : undefined}
              onAddConfigComment={configComments || onAddConfigComment ? handleOpenConfigComment : undefined}
              hasConfigComment={configComments ? hasConfigComment : undefined}
              hideEmptyConfigCommentTag={hideEmptyConfigCommentTag}
              onLaunchWhiteboard={onLaunchWhiteboard}
              referenceContext={referenceContext}
              referenceProvider={referenceProvider}
              onReferenceClick={onReferenceClick}
              onOpenItemDetail={openConfigItemSheet}
              activeItemDetailId={sheetRoute.itemId}
              activeItemDetailFieldPath={sheetRoute.fieldPath}
              onItemDetailInvalidated={handleItemDetailInvalidated}
              breadcrumb={sheetRoute.breadcrumb}
              arrayDepth={sheetRoute.level}
              positionInstanceId={field.positionable ? `${sheetRoute.itemId}:${field.key}` : undefined}
            />
          ))
        )}
      </div>
    </PositionConfigContext.Provider>
  );
  return (
    <div ref={configPanelRef} className={cn("relative isolate flex h-full flex-col overflow-hidden bg-card", className)}>
      {!hideDetailHeader && (
        <div className="border-b border-border/80 px-4 py-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={closePageDetail}
                aria-label="返回所有页面"
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="min-w-0 truncate text-[15px] font-semibold">
                {selectedPage.name}
              </h2>
            </div>
            <ConfigCategoryFilterSelect
              value={configCategoryFilter}
              onChange={setConfigCategoryFilter}
              categories={availableCategories}
            />
          </div>
        </div>
      )}
      {typeof document !== "undefined" && (designSpecBubble || configCommentBubble) && createPortal(designSpecBubble || configCommentBubble, document.body)}
      <div ref={configContentRef} tabIndex={-1} className={cn("min-h-0 flex-1 overflow-y-auto p-4", showConfigActions && "pb-20")}>
        <div className="flex flex-col gap-5">
          {selectedPageSpecs.length > 0 && (
            <section className="order-[-1] flex flex-col">
              <div className="flex flex-col gap-1">
                {selectedPageSpecs.map((spec) => (
                  <button
                    key={`${spec.docId}:${spec.entryId}:${spec.pageId}`}
                    type="button"
                    onPointerDown={(event) => {
                      designSpecTriggerRef.current = event.currentTarget;
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      toggleDesignSpec({
                        kind: "page",
                        spec,
                        fieldTitle: spec.entryTitle || "未命名规范",
                        anchor: { top: rect.top, bottom: rect.bottom },
                      }, event.currentTarget);
                    }}
                    className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg bg-muted/45 px-2.5 py-2 text-left text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`查看页面规范：${spec.entryTitle || "未命名规范"}`}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{spec.entryTitle || "未命名规范"}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="flex flex-col">
            {CONFIG_TYPE_SECTIONS.map(({ type, title }, index) => {
              const projectCount = projectConfigTypeCounts[type];
              const pageCount = pageConfigTypeCounts[type];
              if (projectCount + pageCount === 0) return null;
              return (
                <section
                  key={type}
                  aria-labelledby={`config-${type}-heading`}
                  className={cn(
                    "flex flex-col",
                    showSemanticSeparation && index > 0 && "mt-6 border-t border-border/60 pt-5",
                  )}
                >
                  <h3
                    id={`config-${type}-heading`}
                    className={cn(
                      "text-xs font-medium text-muted-foreground",
                      !showSemanticSeparation && "sr-only",
                    )}
                  >
                    {title}
                  </h3>
                  <div className={cn("flex flex-col gap-5", showSemanticSeparation && "mt-3")}>
                    {projectCount > 0 && (
                      <ConfigForm
                        key={`project-${selectedPage.id}-${selectedProjectConfigSchema}-${type}`}
                        schema={selectedProjectConfigSchema!}
                        onChange={(data, meta) => onProjectConfigChange?.(data, meta)}
                        onSchemaChange={onProjectSchemaChange}
                        initialData={configData}
                        sessionId={sessionId}
                        readonly={readonly}
                        configCategoryFilter={configCategoryFilter}
                        configTypeFilter={type}
                        hideGroupTitles
                        projectSharedSourceHint
                        typeLimits={typeLimits}
                        designSpecEntries={effectiveDesignSpecEntries.filter((entry) => entry.scope === "project")}
                        onEditDesignSpec={onEditDesignSpec}
                        onOpenDesignSpec={(spec, fieldTitle, anchor, trigger) => toggleDesignSpec({ kind: "config", spec, fieldTitle, anchor }, trigger)}
                        onEditConfigDefinition={onProjectDefinitionChange ? (key) => openDefinitionEditor("project", key) : undefined}
                        configItemCapabilities={selectedPage.configItemCapabilities?.project}
                        onAddConfigComment={configComments || onAddConfigComment ? handleOpenConfigComment : undefined}
                        hasConfigComment={configComments ? hasConfigComment : undefined}
                        imageConfigScope="project"
                        configContextPageId={selectedPage.id}
                        referenceContext={referenceContext}
                        referenceProvider={referenceProvider}
                        onReferenceClick={onReferenceClick}
                        onLaunchWhiteboard={onLaunchWhiteboard}
                      />
                    )}
                    {pageCount > 0 && (
                      <ConfigForm
                        key={`page-${selectedPage.id}-${selectedPage.schema}-${type}`}
                        schema={selectedPage.schema!}
                        onChange={(data, meta) => onPageConfigChange?.(selectedPage.id, data, meta)}
                        onSchemaChange={(schema) =>
                          onPageSchemaChange?.(selectedPage.id, schema)
                        }
                        initialData={configData}
                        sessionId={sessionId}
                        readonly={readonly}
                        configCategoryFilter={configCategoryFilter}
                        configTypeFilter={type}
                        hideGroupTitles
                        typeLimits={typeLimits}
                        onEnterPositionEdit={onEnterPositionEdit}
                        onPositionFieldPathChange={onPositionFieldPathChange}
                        onExitPositionEdit={onExitPositionEdit}
                        positionEditActiveId={positionEditActiveId}
                        positionEditDimming={positionEditDimming}
                        onTogglePositionDimming={onTogglePositionDimming}
                        designSpecEntries={effectiveDesignSpecEntries.filter((entry) => entry.scope === "page" && entry.pageId === selectedPage.id)}
                        onEditDesignSpec={onEditDesignSpec}
                        onOpenDesignSpec={(spec, fieldTitle, anchor, trigger) => toggleDesignSpec({ kind: "config", spec, fieldTitle, anchor }, trigger)}
                        onEditConfigDefinition={onPageDefinitionChange ? (key) => openDefinitionEditor("page", key) : undefined}
                        configItemCapabilities={selectedPage.configItemCapabilities?.page}
                        onAddConfigComment={configComments || onAddConfigComment ? handleOpenConfigComment : undefined}
                        hasConfigComment={configComments ? hasConfigComment : undefined}
                        imageConfigScope="page"
                        pageId={selectedPage.id}
                        configContextPageId={selectedPage.id}
                        referenceContext={referenceContext}
                        referenceProvider={referenceProvider}
                        onReferenceClick={onReferenceClick}
                        onLaunchWhiteboard={onLaunchWhiteboard}
                        onOpenItemDetail={openConfigItemSheet}
                        activeItemDetailId={sheetRoute?.itemId}
                        activeItemDetailFieldPath={sheetRoute?.fieldPath}
                        onItemDetailInvalidated={handleItemDetailInvalidated}
                      />
                    )}
                  </div>
                </section>
              );
            })}

          {visibleConfigCount === 0 && (
            <div className="flex min-h-[180px] flex-col items-center justify-center px-4 text-center">
              <ListFilter className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">没有匹配的配置项</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                换一个配置分类查看
              </p>
            </div>
          )}
          </section>

          {shouldShowRequirements && (
            <div
              className={requirementsPosition === "beforeConfig" ? "order-first" : undefined}
            >
          <PanelSection
            title="资源规范"
            open={requirementsSectionOpen}
            onToggle={() => setRequirementsSectionOpen((current) => !current)}
            actions={
              requirementsLoading ? null : editingRequirements ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setEditingRequirements(false);
                      setRequirementsDraft(requirements ?? "");
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => {
                      onRequirementsChange?.(requirementsDraft);
                      setEditingRequirements(false);
                    }}
                  >
                    <Save className="h-3.5 w-3.5" />
                    保存
                  </Button>
                </>
              ) : !readonly && onRequirementsChange ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => {
                    setRequirementsDraft(requirements ?? "");
                    setEditingRequirements(true);
                  }}
                >
                  编辑
                </Button>
              ) : null
            }
          >
            {requirementsLoading ? (
              <div className="py-4 text-xs text-muted-foreground">
                加载中...
              </div>
            ) : editingRequirements ? (
              <div className="flex flex-col gap-2 pt-2">
                <RichTextEditor
                  content={requirementsDraft}
                  onChange={setRequirementsDraft}
                  localizeRemoteImage={localizeRemoteImage}
                  referenceCandidates={getReferenceCandidates(
                    selectedPage.schema,
                  )}
                  referenceContext={referenceContext}
                  referenceProvider={referenceProvider}
                  onReferenceClick={onReferenceClick}
                />
                <p className="text-xs text-muted-foreground">
                  输入 @ 或使用工具栏「插入引用」选择当前页配置项，以 @[名称](key) 形式引用。
                </p>
              </div>
            ) : hasRequirements ? (
              <div className="space-y-4 pt-2">
                <PageRequirements
                  markdown={requirements!}
                  allowExternalMedia
                  mediaBaseUrl={mediaBaseUrl}
                  onReferenceClick={onReferenceClick}
                />
              </div>
            ) : (
              <div className="flex min-h-[120px] flex-col items-center justify-center px-4 text-center">
                <FileText className="mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">暂无资源规范</p>
                {!readonly && onRequirementsChange && (
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    点击右上角「编辑」添加页面配置要求
                  </p>
                )}
              </div>
            )}
          </PanelSection>
            </div>
          )}
        </div>
      </div>

      <ConfigDetailSheet
        open={sheetRoute !== null}
        title={sheetRoute?.title ?? "关卡设置"}
        // The first two levels live in the parent configuration panel, not in
        // the Sheet. Keep the full route on `sheetRoute` for back/history
        // semantics, but expose only the currently opened item in the header.
        breadcrumb={sheetRoute?.breadcrumb.slice(-1)}
        onClose={handleSheetBack}
        onNavigate={handleSheetBreadcrumb}
        closeLabel="关闭关卡设置"
        backLabel="返回关卡列表"
        containerRef={configPanelRef}
        underlayRef={configContentRef}
        lockBodyScroll={false}
      >
        {sheetFieldContent}
      </ConfigDetailSheet>

      {showConfigActions && (
        <Popover open={configActionsOpen} onOpenChange={setConfigActionsOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="更多配置操作"
              className="absolute bottom-4 right-4 z-20 h-11 w-11 cursor-pointer rounded-full border-border/90 bg-card/95 text-foreground shadow-lg backdrop-blur transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={8}
            className="z-30 w-48 p-1"
          >
            <div className="flex flex-col gap-0.5">
              {canAddConfig && (
                <button
                  type="button"
                  onClick={() => {
                    setConfigActionsOpen(false);
                    openDefinitionEditor(configDefinitionCreateScope);
                  }}
                  className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm text-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>添加配置项</span>
                </button>
              )}
              {saveDefaultsTarget && (
                <button
                  type="button"
                  onClick={() => {
                    setConfigActionsOpen(false);
                    setSaveDefaultsScope(saveDefaultsTarget);
                  }}
                  className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm text-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Save className="h-4 w-4 shrink-0" />
                  <span>保存为默认</span>
                </button>
              )}
              {restoreDefaultsTarget && (
                <button
                  type="button"
                  onClick={() => {
                    setConfigActionsOpen(false);
                    setRestoreDefaultsScope(restoreDefaultsTarget);
                  }}
                  className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm text-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  <span>恢复默认</span>
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {definitionEditor && (
        <ConfigItemEditorDialog
          open
          onOpenChange={(open) => { if (!open) setDefinitionEditor(null); }}
          mode={definitionEditor.mode}
          scope={definitionEditor.scope}
          draft={definitionEditor.draft}
          onDraftChange={(draft) => setDefinitionEditor((current) => current ? { ...current, draft } : current)}
          applyPlan={definitionImpact}
          defaultValueEditor={
            <ConfigForm
              key={`${definitionEditor.scope}-${definitionEditor.draft.key}-${definitionEditor.draft.kind}`}
              schema={buildDefaultValueSchema(definitionEditor.draft)}
              initialData={{ [definitionEditor.draft.key]: definitionEditor.draft.default }}
              onChange={(values) => {
                const value = values[definitionEditor.draft.key];
                if (value !== undefined) setDefinitionEditor((current) => current ? { ...current, draft: { ...current.draft, default: value } } : current);
              }}
              readonly={readonly}
              configItemCapabilities={
                definitionEditor.scope === "page"
                  ? selectedPage.configItemCapabilities?.page
                  : selectedPage.configItemCapabilities?.project
              }
              imageConfigScope={definitionEditor.scope}
              pageId={definitionEditor.scope === "page" ? selectedPage.id : undefined}
              configContextPageId={selectedPage.id}
            />
          }
          readOnly={readonly}
          busy={definitionSaving}
          onSave={definitionImpact?.kind === "ai_required" ? undefined : saveDefinitionEditor}
        />
      )}

      <Dialog
        open={saveDefaultsScope !== null}
        onOpenChange={(open) => {
          if (!open) setSaveDefaultsScope(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>保存为默认配置</DialogTitle>
            <DialogDescription>
              {saveDefaultsScope === "project"
                ? `将使用当前共享配置值覆盖项目级默认配置，影响 ${sharedAffectedPages.length} 个页面，所有页面将使用新默认值。确认保存？`
                : "将使用当前本页配置覆盖默认配置，新项目或新增页面将使用新默认值。确认保存？"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveDefaultsScope(null)}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (saveDefaultsScope === "project") {
                  onProjectSaveAsDefaults?.();
                } else if (saveDefaultsScope === "page" && selectedPage) {
                  onSaveAsDefaults?.(selectedPage.id);
                }
                setSaveDefaultsScope(null);
              }}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={restoreDefaultsScope !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreDefaultsScope(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>恢复默认配置</DialogTitle>
            <DialogDescription>
              {restoreDefaultsScope === "project"
                ? "将共享配置值恢复为项目级初始默认值，所有修改将丢失。确认恢复？"
                : "将当前页面配置恢复为初始默认值，所有修改将丢失。确认恢复？"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRestoreDefaultsScope(null)}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (restoreDefaultsScope === "project") {
                  onProjectRestoreDefaults?.();
                } else if (restoreDefaultsScope === "page" && selectedPage) {
                  onRestoreDefaults?.(selectedPage.id);
                }
                setRestoreDefaultsScope(null);
              }}
            >
              确认恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
