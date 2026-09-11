import type {
  ConfigCommentTarget as SharedConfigCommentTarget,
  PagePresentationProfile,
} from "@workbench/shared";
import type { WorkspaceMutationReceipt } from "@workbench/shared/contracts";
import type {
  ConsoleLogPayload,
  PositionableSizeItem,
  VisualAnnotation,
  VisualInlineEditPayload,
  VisualNodeInfo,
  VisualNodeTreeItem,
  VisualPropertyChange,
  VisualStyleChange,
  AppActionPayload,
  PreviewLifecycleIdentity,
} from "./iframe-types";
import type { FieldConfig } from "./schema-parser";
import type { ConfigFieldType } from "./config-categories";
import type {
  MarkdownReferenceClickHandler,
  MarkdownReferenceContext,
  MarkdownReferenceProvider,
} from "./DocumentEditor";
import type { PreviewObservationRegistry } from "./preview-observation-registry";

export type {
  IframeOutMessageType,
  IframeInMessageType,
  ConsoleLogPayload,
  PositionableSizeItem,
  VisualAnnotation,
  VisualEditPatch,
  VisualInlineEditPayload,
  VisualNodeInfo,
  VisualNodeTreeItem,
  VisualNodeRect,
  VisualPropertyChange,
  VisualPropertyChangeKind,
  VisualStyleChange,
  AppActionPayload,
  PreviewLifecycleIdentity,
} from "./iframe-types";

export interface PreviewSize {
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  scale?: number;
}

export interface PreviewContainerSize {
  width: number;
  height: number;
}

export interface PreviewDiagnostic {
  source: "post_generation_validation" | "preview_runtime";
  stage?: string;
  code?: string;
  pageId?: string;
  file?: string;
  message: string;
  instruction?: string;
  moduleName?: string;
  importName?: string;
  codeHash?: string;
  moduleHash?: string;
  requestId?: number;
}

export type PreviewDiagnosticError = Error & {
  previewDiagnostic?: PreviewDiagnostic;
};

export interface PositionableConfig {
  items: string[];
  defaults?: Record<string, PositionItem>;
  size?: { width: number; height: number };
}

export interface PositionItem {
  x: number;
  y: number;
}

export interface DemoMeta {
  previewSize?: PreviewSize;
  positionable?: PositionableConfig;
  [key: string]: unknown;
}

export interface DemoSchema extends Record<string, unknown> {
  $demo?: DemoMeta;
  $schema?: string;
  title?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface PreviewPanelProps {
  code?: string;
  sessionId?: string;
  demoId?: string;
  compiledJsUrl?: string;
  cssImports?: string[];
  configData?: Record<string, unknown>;
  /** Authority revision frozen when the current render generation starts. */
  previewRevision?: number;
  previewObservationRegistry?: PreviewObservationRegistry;
  previewObservationContext?: {
    projectId: string;
    workspaceId: string;
    rootHash?: string;
  };
  appState?: Record<string, unknown>;
  routeParams?: Record<string, unknown>;
  sdkFiles?: Record<string, string>;
  onError?: (error: PreviewDiagnosticError) => void;
  previewSize?: PreviewSize;
  placeholderScreenshotUrl?: string;
  cdnBaseUrl?: string;
  fillContainer?: boolean;
  containerSizeOverride?: PreviewContainerSize;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
  onAppAction?: (action: AppActionPayload & { pageId?: string }) => void;
  onContentHeightChange?: (contentHeight: number) => void;
  onContentLoaded?: (details?: {
    requestId: number;
    previewInstanceId?: string;
    renderGeneration?: number;
    revision?: number;
  }) => void;
  activityState?: "active" | "sleeping";
  effectiveHeight?: number;
  onPositionableSizes?: (sizes: Record<string, PositionableSizeItem>) => void;
  visualEditMode?: boolean;
  visualHoverNodeId?: string | null;
  selectedVisualNodeId?: string | null;
  hiddenVisualNodeIds?: string[];
  visualLayerTreeNodes?: VisualNodeTreeItem[];
  visualPropertyChanges?: VisualPropertyChange[];
  visualAnnotations?: VisualAnnotation[];
  onVisualSelect?: (node: VisualNodeInfo | null) => void;
  onVisualSelectStack?: (nodes: VisualNodeInfo[]) => void;
  visualNodeTreeRequestKey?: number;
  onVisualNodeTreeChange?: (nodes: VisualNodeTreeItem[]) => void;
  staticPrototypeRequestKey?: number;
  onStaticPrototypeSnapshot?: (
    result:
      | {
          ok: true;
          html: string;
          css: string;
          rejectionReasons: SnapshotRejectionReason[];
        }
      | { ok: false; error: string },
  ) => void;
  /** @deprecated 右键图层菜单已由 PreviewPanel 在预览位置内渲染，仅保留兼容旧调用方。 */
  onVisualLayerMenu?: (nodes: VisualNodeInfo[]) => void;
  onVisualInlineEdit?: (payload: VisualInlineEditPayload) => void;
  visualAnnotationMode?: boolean;
  onVisualAnnotationCreate?: (
    node: VisualNodeInfo,
    text?: string,
    annotationId?: string,
    styleChanges?: VisualStyleChange[],
  ) => void;
  /** 当前是否有自动修复正在进行中，控制"正在修复预览"覆盖层的显示 */
  isAutoRepairing?: boolean;
  /** 位置编辑模式配置；一次只激活一个定位字段实例。 */
  positionEditMode?: PositionEditMode;
  /** 位置编辑模式下的置灰开关状态 */
  positionEditDimming?: boolean;
  /** 位置编辑模式下元素拖拽结果回调。第一个参数为定位字段实例 ID。 */
  onPositionChange?: (instanceId: string, x: number, y: number) => void;
  /** 位置编辑模式下拖拽过程中的实时坐标回调（不触发截图再生，仅用于输入框回显） */
  onPositionDrag?: (instanceId: string, x: number, y: number) => void;
  /** 位置编辑模式退出回调 */
  onPositionEditExit?: () => void;
}

export interface PositionEditMode {
  enabled: boolean;
  target: PositionEditTarget | null;
}

/** 宿主与配置表单之间传递的单个定位字段实例。 */
export interface PositionEditTarget {
  /** 稳定的字段实例 ID；数组项必须包含稳定排序 ID，不得只使用数组下标。 */
  id: string;
  /** 宿主配置中的真实字段路径。 */
  fieldPath: string;
  /** 预览 DOM 中声明式 data-pos-key 的值。 */
  domKey: string;
  /** 同一 DOM key 在当前页面中的出现序号。 */
  domOccurrence?: number;
  position: { x: number; y: number };
  boundary?: PositionEditBoundary;
}

export interface PositionEditBoundaryAbsolute {
  mode: "absolute";
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PositionEditBoundaryPadding {
  mode: "padding";
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type PositionEditBoundary =
  | PositionEditBoundaryAbsolute
  | PositionEditBoundaryPadding;

export interface ConfigFormProps {
  schema: string;
  onChange: (data: Record<string, unknown>, meta?: ConfigChangeMeta) => void;
  onSchemaChange?: (schema: string) => void;
  initialData?: Record<string, unknown>;
  readonly?: boolean;
  className?: string;
  sessionId?: string;
  configCategoryFilter?: string;
  /** 可选的字段语义筛选；与分类筛选共同生效。 */
  configTypeFilter?: ConfigFieldType;
  /** 在已由宿主提供更高层信息架构时，隐藏 Schema 字段分组标题。 */
  hideGroupTitles?: boolean;
  /**
   * 标记顶层字段来自项目共享配置。仅在创作端配置面板按需传入；
   * 通用表单及数组内嵌字段不显示来源提示。
   */
  projectSharedSourceHint?: boolean;
  typeLimits?: Record<string, number>;
  onEnterPositionEdit?: (target: PositionEditTarget) => void;
  /** 定位字段实例注册或数组重排后，通知宿主最新真实字段路径。 */
  onPositionFieldPathChange?: (instanceId: string, fieldPath: string) => void;
  onExitPositionEdit?: () => void;
  positionEditActiveId?: string | null;
  positionEditDimming?: boolean;
  onTogglePositionDimming?: () => void;
  /** 与当前配置范围匹配的设计规范条目（宿主加载，只读展示）。 */
  designSpecEntries?: DesignSpecEntryLink[];
  /** 创作端从规范详情跳转至文档视图；浏览端不传。 */
  onEditDesignSpec?: (docId: string, entryId: string) => void;
  /** 打开配置项关联的设计规范侧边气泡。 */
  onOpenDesignSpec?: (
    spec: DesignSpecEntryLink,
    fieldTitle: string,
    anchor?: { top: number; bottom: number },
    trigger?: HTMLElement | null,
  ) => void;
  /** 创作端提供时，字段标题可打开对应的配置定义编辑器；浏览端不传。 */
  onEditConfigDefinition?: (
    fieldKey: string,
    field: FieldConfig,
    schemaFieldPath?: string,
  ) => void;
  /** Per-field capabilities. Omit to retain the legacy readonly behaviour. */
  configItemCapabilities?: ConfigItemCapabilities;
  /** Opens the host-owned config comment flow for a field. */
  onAddConfigComment?: (
    target: ConfigCommentTarget,
    trigger?: HTMLElement | null,
  ) => void;
  /** Returns whether any comment thread exists for a field target. */
  hasConfigComment?: (target: ConfigCommentTarget) => boolean;
  /** 浏览端只在存在批注时展示标签；创作端留空以保留悬浮发现入口。 */
  hideEmptyConfigCommentTag?: boolean;
  /** 配置所在范围。未提供时由宿主自行解析归属。 */
  imageConfigScope?: ImageConfigScope;
  /** page 范围配置所属的页面；项目范围和独立表单可不提供。 */
  pageId?: string;
  /** 当前配置面板页面，用于项目级上传/写入的权限上下文。 */
  configContextPageId?: string;
  /** 无 IO capability：宿主打开白板并负责草稿、提交与持久化。 */
  onLaunchWhiteboard?: WhiteboardLauncher;
  /** Optional typed references for richtext fields and field notes. */
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  /** Open an explicitly opted-in object-array item in the host detail Sheet. */
  onOpenItemDetail?: ConfigItemDetailHandler;
  /** Current Sheet item identity, used to close the route if that item is removed. */
  activeItemDetailId?: string | null;
  activeItemDetailFieldPath?: string;
  onItemDetailInvalidated?: (itemId: string) => void;
}

export interface ConfigBreadcrumb {
  id: string;
  label: string;
  level: number;
}

/** Runtime context passed from an object-array row to the detail Sheet host. */
export interface ConfigItemDetail {
  field: FieldConfig;
  item: Record<string, unknown>;
  index: number;
  itemId: string;
  fieldPath: string;
  /** Canonical schema path without runtime array indexes. */
  schemaFieldPath?: string;
  title: string;
  level: number;
  breadcrumb: ConfigBreadcrumb[];
  parentScrollTop?: number;
  parentFocusKey?: string;
  /** Resolves the current array index after external reorder/collaboration updates. */
  getCurrentIndex?: () => number;
  /** Reads the latest item value after external collaboration updates. */
  getCurrentItem?: () => Record<string, unknown> | undefined;
  onChangeField: (key: string, value: unknown, meta?: ConfigChangeMeta) => void;
}

export type ConfigItemDetailHandler = (detail: ConfigItemDetail) => void;

export interface ConfigItemCapabilities {
  canEditDefinition: boolean;
  canEditValue: boolean;
  canAddComment: boolean;
  reason?: "reference" | "template-page" | "readonly" | "none";
}

export type ConfigCommentTarget = SharedConfigCommentTarget;

export interface ConfigChangeMeta {
  /** The server already durably committed this delta in an atomic mutation. */
  persistence: "committed";
  receipt: WorkspaceMutationReceipt;
}

export type ImageConfigScope = "project" | "page";

/**
 * 白板要编辑的配置图片位置。imageList 同时带下标和 URL，供宿主在提交前确认
 * 该项没有被删除或替换；demo-ui 不保存目标，因此不会留下悬空列表入口。
 */
export interface ImageConfigTarget {
  scope?: ImageConfigScope;
  pageId?: string;
  fieldPath: string;
  listItem?: { index: number; url: string };
  /** Current single-image value; the host may use a local value as a removable background. */
  currentValue?: string;
  onCommit?: (url: string) => void;
}

/** 宿主提供的白板启动能力；demo-ui 不进行项目或网络 IO。 */
export type WhiteboardLauncher = (target: ImageConfigTarget) => void;

/** 配置面板消费的设计规范绑定；设计规范内容不写入 Schema。 */
export interface DesignSpecEntryLink {
  docId: string;
  docTitle: string;
  entryId: string;
  entryTitle: string;
  markdown: string;
  scope: "project" | "page";
  pageId?: string;
  fieldKey: string;
}

/** 页面配置侧边栏顶部消费的页面规范绑定。 */
export interface PageDesignSpecEntryLink {
  docId: string;
  docTitle: string;
  entryId: string;
  entryTitle: string;
  markdown: string;
  pageId: string;
}

/** 外部请求配置面板打开指定字段定义编辑器。 */
export interface ConfigDefinitionFocus {
  scope: "project" | "page";
  fieldKey: string;
  pageId?: string;
}

export type PreviewMode = "single" | "canvas" | "document";

/** 画布工具模式：hand=拖动工具（仅平移画布），select=选择工具（可移动/缩放页面） */
export type CanvasToolMode =
  | "hand"
  | "select"
  | "text"
  | "image"
  | "navigation"
  | "section";

export type CanvasInteractionMode = "readonly" | "viewer" | "editor";

export type CanvasPageSizeMode = "preview" | "custom";

export interface CanvasPageLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  sizeMode?: CanvasPageSizeMode;
  previewSizeKey?: string;
}

export interface CanvasViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasState {
  pages: Record<string, CanvasPageLayout>;
  viewport: CanvasViewportState;
  /** Semantic canvas containers. They never change page resources or page groups. */
  sections?: Record<string, CanvasSection>;
  pageGroups?: Record<string, CanvasPageGroup>;
  hiddenPageIds?: string[];
  nodes?: Record<string, CanvasFreeNode>;
  layers?: CanvasLayersState;
  hiddenKnowledgeDocumentIds?: string[];
  /** 页面间跳转说明；仅画布关系层消费，不改写页面源码。 */
  navigation?: CanvasNavigationState;
}

export interface CanvasNavigationHotspot {
  id: string;
  pageId: string;
  /** area 会显示并可编辑；point 仅作为画布连线的不可见起点。 */
  kind: "area" | "point";
  /** 相对于页面内容区域的归一化矩形。 */
  rect: { x: number; y: number; width: number; height: number };
  createdAt: number;
  updatedAt: number;
}

export interface CanvasNavigationConnection {
  id: string;
  source: { pageId: string; hotspotId: string };
  target: { pageId: string };
  createdAt: number;
  updatedAt: number;
}

export interface CanvasNavigationState {
  hotspots: Record<string, CanvasNavigationHotspot>;
  connections: Record<string, CanvasNavigationConnection>;
}

export type CanvasSaveStatus =
  | "idle"
  | "loading"
  | "saving"
  | "saved"
  | "error";

export type CanvasPageRuntimeType =
  | "prototype-html-css"
  | "sandboxed-html"
  | "high-fidelity-react"
  | "sketch-scene";

export type SnapshotRejectionReason =
  | "cross-origin-css"
  | "canvas"
  | "shadow-dom"
  | "video";

export type SnapshotQuality = "good" | "partial" | "failed";

export interface CanvasPageData {
  id: string;
  name: string;
  runtimeType?: CanvasPageRuntimeType;
  code?: string;
  compiledJsUrl?: string;
  iframeUrl?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: Record<string, unknown>;
  sandboxExecutionUrl?: string;
  sandboxChannelId?: string;
  sketchScene?: string;
  sketchMeta?: Record<string, unknown>;
  configData?: Record<string, unknown>;
  schema?: string; // config.schema.json 原始 JSON 字符串
  /** 未筛选的页面配置总数；未知时省略，画布入口沿用默认详情行为。 */
  configCount?: number;
  isReference?: boolean; // 是否为引用页
  sourceProjectId?: string; // 引用页的源项目 ID
  sourcePageId?: string; // 引用页的源页面 ID
  /** 业务配置驱动的页面状态；创作端保留页面卡片并以置灰方式提示。 */
  visibilityStatus?: {
    visible: boolean;
    enabled: boolean;
    unavailable?: boolean;
    message?: string;
    fallbackPageId?: string;
    fallbackMessage?: string;
    alternativeRegion?: { pageId: string; regionId: string; message?: string };
    reasons?: Array<{
      ruleId: string;
      fieldKey: string;
      fieldKeys?: string[];
      effect: "hidden" | "disabled" | "unavailable";
      strategy?: "unavailable" | "fallback-page" | "alternative-region";
    }>;
  };
  visibilityRegions?: Record<string, { visible: boolean; enabled: boolean }>;
  previewSize?: PreviewSize;
  /** Persisted page viewport semantics. Canvas card geometry remains separate. */
  presentation?: PagePresentationProfile;
  order: number;
  snapshotHtml?: string;
  snapshotCss?: string;
  snapshotHash?: string;
  snapshotQuality?: SnapshotQuality;
  snapshotRejectionReasons?: SnapshotRejectionReason[];
}

/** Stable page identity stored in the canvas clipboard. Page bytes are
 * resolved by the server-side transfer service from a committed source. */
export interface CanvasTransferPageIdentity {
  id: string;
  name: string;
  runtimeType?: CanvasPageRuntimeType;
  sourcePageVersionId?: string;
}

export interface CanvasPageGroupEntry {
  id: string;
  pageId: string;
  title: string;
}

export interface CanvasPageGroup {
  id: string;
  kind: "page-group";
  title: string;
  pages: CanvasPageGroupEntry[];
  activePageId: string;
  layout: CanvasPageLayout;
  directoryCollapsed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CanvasSectionChildKind = "page" | "page-group" | "node" | "section";

export interface CanvasSectionChild {
  kind: CanvasSectionChildKind;
  id: string;
}

export interface CanvasSectionStyle {
  /** One Section color drives the opaque border and translucent fill. */
  color?: string;
  /** Fill alpha as a percentage; the border is always fully opaque. */
  fillOpacity?: number;
}

/**
 * A canvas-only organizational container. Children retain absolute canvas
 * coordinates and move together with their containing Section.
 */
export interface CanvasSection {
  id: string;
  kind: "section";
  title: string;
  layout: CanvasPageLayout;
  style?: CanvasSectionStyle;
  children: CanvasSectionChild[];
  createdAt: number;
  updatedAt: number;
}

export interface CanvasScreenshotState {
  screenshotUrl?: string;
  renderBox?: ScreenshotRenderBox;
  loading: boolean;
  error?: string;
}

export type CanvasPageRenderMode =
  | "screenshot"
  | "iframe"
  | "sleeping-iframe"
  | "prototype"
  | "loading";

export type CanvasFreeNodeKind = "document" | "image" | "text";

export interface CanvasFreeNodeBase {
  id: string;
  kind: CanvasFreeNodeKind;
  title: string;
  layout: CanvasPageLayout;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasDocumentNode extends CanvasFreeNodeBase {
  kind: "document";
  markdown?: string;
  knowledgeDocument?: CanvasKnowledgeDocument;
  documents?: CanvasDocumentEntry[];
  activeDocumentId?: string;
  collapsed?: boolean;
  expandedHeight?: number;
}

export interface CanvasImageNode extends CanvasFreeNodeBase {
  kind: "image";
  src: string;
  fileName?: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
}

export interface CanvasTextNode extends CanvasFreeNodeBase {
  kind: "text";
  text: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  textAlign?: "left" | "center" | "right";
  fontWeight?: 400 | 500 | 600 | 700;
  lineHeight?: number;
  stylePreset?: "body" | "note" | "heading" | "emphasis";
  autoWidth?: boolean;
}

export type CanvasFreeNode =
  | CanvasDocumentNode
  | CanvasImageNode
  | CanvasTextNode;

export interface CanvasLayersState {
  annotations?: {
    nodes?: Record<string, CanvasFreeNode>;
  };
  documents?: {
    nodes?: Record<string, CanvasDocumentNode>;
  };
}

export interface CanvasKnowledgeDocument {
  id: string;
  title: string;
  /** @deprecated Display-only compatibility field; document identity is `id`. */
  fileName?: string;
  description?: string;
}

export interface CanvasDocumentEntry {
  id: string;
  title: string;
  knowledgeDocument: CanvasKnowledgeDocument;
}

export interface CanvasTextNodeSummary {
  id: string;
  title: string;
  text: string;
  layout: CanvasPageLayout;
  relatedPageIds: string[];
  updatedAt: number;
  truncated: boolean;
}

export interface CanvasKnowledgeDocumentCreateInput {
  title: string;
  description?: string;
  content: string;
}

export interface CanvasKnowledgeDocumentUpdateInput {
  title?: string;
  description?: string;
  content?: string;
}

export interface ScreenshotRenderBox {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  bodyWidth: number;
  bodyHeight: number;
  documentWidth: number;
  documentHeight: number;
  fullPage: boolean;
}

export interface AlignmentGuide {
  /** 辅助线类型 */
  type: "vertical" | "horizontal";
  /** 辅助线位置（画布坐标） */
  position: number;
  /** 辅助线范围起点 */
  start: number;
  /** 辅助线范围终点 */
  end: number;
}

export interface AlignmentResult {
  /** 吸附后的布局 */
  layout: CanvasPageLayout;
  /** 是否有吸附发生 */
  snapped: boolean;
  /** 对齐辅助线列表 */
  guides: AlignmentGuide[];
}

export interface DragState {
  pageId: string;
  layout: CanvasPageLayout;
  edge?: ResizeEdge;
}

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface PreviewCanvasProps {
  editable?: boolean;
  interactionMode?: CanvasInteractionMode;
  sessionId?: string;
  projectId?: string;
  pages: CanvasPageData[];
  activePageId?: string;
  canvasState: CanvasState;
  onCanvasStateChange: (state: CanvasState) => void;
  onRequestDeletePages?: (pageIds: string[]) => void | Promise<void>;
  /** 画布选中的页面添加到 AI 对话 */
  onAddPagesToChat?: (pageIds: string[]) => void;
  onPageConfigEdit?: (
    pageId: string,
    options?: { openConfigDetail?: boolean },
  ) => void;
  /** 在画布中重命名项目页面；成功后同步全部页面名称引用。 */
  onPageRename?: (pageId: string, name: string) => Promise<boolean>;
  /** 评论模式下点击画布页面，以其点击位置创建页面级评论。 */
  onPageComment?: (input: {
    pageId: string;
    pageName: string;
    pin: { xRatio: number; yRatio: number };
    clientX: number;
    clientY: number;
  }) => void;
  /** 页面标题旁评论标签点击；宿主负责打开评论面板并同步页面选择。 */
  onPageCommentBadgeClick?: (pageId: string) => void;
  /** 各页面未处理评论数量，供画布标题标签展示。 */
  commentCounts?: Record<string, number>;
  onCanvasClick?: () => void;
  className?: string;
  editingPageId?: string;
  screenshotUrls?: Record<string, string>;
  screenshotRenderBoxes?: Record<string, ScreenshotRenderBox>;
  onConsoleEntry?: (entry: ConsoleLogPayload) => void;
  onError?: (error: Error) => void;
  focusPageId?: string;
  onVisiblePageIdsChange?: (pageIds: string[]) => void;
  fitToScreenOnMount?: boolean;
  onFitToScreenOnMountComplete?: () => void;
  onPositionableSizes?: (sizes: Record<string, PositionableSizeItem>) => void;
  knowledgeDocuments?: CanvasKnowledgeDocument[];
  onCreateKnowledgeDocument?: (
    input: CanvasKnowledgeDocumentCreateInput,
  ) => Promise<CanvasKnowledgeDocument>;
  onUpdateKnowledgeDocument?: (
    id: string,
    input: CanvasKnowledgeDocumentUpdateInput,
  ) => Promise<CanvasKnowledgeDocument>;
  onReadKnowledgeDocument?: (
    document: CanvasKnowledgeDocument,
  ) => Promise<string>;
  /** 粘贴页面时触发，由父组件调用 API 创建页面并返回 ID 映射 */
  onRequestPastePages?: (input: {
    pages: CanvasTransferPageIdentity[];
    pageLayouts: Record<string, CanvasPageLayout>;
    pageGroups: CanvasPageGroup[];
    sourceProjectId?: string;
  }) => Promise<{ pageIdMapping: Map<string, string> }>;
  /** 画布粘贴 HTML 代码时触发，由父组件解析并创建页面 */
  onRequestPasteHtmlContent?: (html: string) => void | Promise<void>;
  /** 跨项目粘贴时创建引用页 */
  onRequestCreateReferences?: (input: {
    pages: CanvasTransferPageIdentity[];
    pageLayouts: Record<string, CanvasPageLayout>;
    pageGroups: CanvasPageGroup[];
    sourceProjectId: string;
  }) => Promise<{ pageIdMapping: Map<string, string> }>;
  /** 查看引用页的源项目 */
  onViewSource?: (pageId: string) => void;
}

export interface PreviewState {
  mode: PreviewMode;
  activePageId: string;
}
