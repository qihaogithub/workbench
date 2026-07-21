"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  PreviewPanel,
  PrototypePagePreview,
  SketchPagePreview,
  PreviewCanvas,
  LayerTreeMenu,
  PageConfigPanel,
  BUILT_IN_CONFIG_CATEGORIES,
  extractPrototypeConfigBindingKeys,
  invalidateCompileCache,
  isSchemaEmpty,
} from "../../../../../components/demo";
import type {
  PositionableSizeItem,
  PreviewSize,
  ScreenshotRenderBox,
  VisualNodeInfo,
  VisualNodeTreeItem,
  VisualPropertyChangeKind,
} from "../../../../../components/demo";
import type {
  DemoPageRuntimeType,
  ProjectAuthoringPreferences,
  PrototypePageMeta,
  SketchSceneDocument,
} from "@workbench/shared";
import {
  createDefaultSketchScene,
  parseSketchSceneDocument,
} from "@workbench/sketch-core";
import {
  useScreenshotGeneration,
  type ScreenshotBatchPageInput,
  type ScreenshotPriority,
  type ScreenshotRenderMode,
} from "@/components/demo/useScreenshotGeneration";
import { useCanvasWorkspace } from "@/components/demo/useCanvasWorkspace";
import {
  parseFigmaText,
  buildFigmaText,
  extractCodeFromFigma,
  extractSchemaFromFigma,
} from "../../../../../lib/parser";
import {
  validateAll,
  ValidationResult,
  getDefaultValues,
  getPreviewSize,
} from "../../../../../lib/validator";
import {
  mergeConfigToProps,
  mergeConfigWithUserValues,
  SchemaConflictError,
} from "@/lib/runtime-props";
import {
  hasPreviewPageCode,
  resolvePreviewPageCode,
} from "@/lib/preview-page-code";
import { getPrototypePreviewSize } from "@/lib/prototype-preview-size";
import {
  applyPrototypePropertyChange,
  applyPrototypeVisualConfiguration,
  type PrototypeVisualConfigTarget,
  type PrototypeVisualConfigResult,
} from "@/lib/prototype-visual-editor";
import {
  buildAutoPreviewRepairFingerprint,
  getAutoPreviewRepairAttemptCount,
  getPageRepairBudget,
  PAGE_REPAIR_BUDGET_LIMIT,
  recordAutoPreviewRepairAttempt,
} from "@/lib/auto-preview-repair-guard";
import { flushWorkspaceCollab } from "@/lib/client-workspace-flush";
import {
  computeSaveStateFromContext,
  getSaveStatusLabel,
} from "@/lib/workspace-save-state-machine";
import { PreviewProjectionTracker } from "@/lib/preview-projection-tracker";
import { WorkspacePerformanceSampler } from "@/lib/workspace-performance-sampling";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AIChat,
  type AutoRepairTrigger,
  type VisualPropertyAutoSend,
  type ChatMessage,
  type StreamService,
} from "@/components/ai-elements";
import { getAgentClient } from "@/lib/agent-client";
import { useConsoleBuffer } from "@/components/demo/useConsoleBuffer";
import { useEditorDiagnostics } from "@/components/demo/useEditorDiagnostics";
import { ResizablePanelGroup, ResizablePanel } from "@/components/ui/resizable";
import {
  Bot,
  Layers,
  FileCode2,
  Loader2,
  ImageIcon,
  Trash2,
  MoreVertical,
  Eye,
  Copy,
  MousePointer2,
  FileText,
  Map as MapIcon,
  Upload,
  CheckCircle,
  History,
  RotateCcw,
  Clock,
  User,
  RefreshCw,
  FolderOpen,
  ArrowLeft,
  Users,
  Download,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBanner } from "@/components/demo/ErrorBanner";
import { VisualDraftActionBar } from "./components/VisualDraftActionBar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CoverImageDialog } from "@/components/cover-image-dialog";
import { DemoPageTree } from "@/components/demo/DemoPageTree";
import { WorkspaceFileTree } from "@/components/demo/WorkspaceFileTree";
import { WorkspaceCodeDialog } from "@/components/demo/WorkspaceCodeDialog";
import { KnowledgePanel } from "@/components/demo/KnowledgePanel";
import {
  KnowledgeDocDialog,
  type KnowledgeItem,
  type KnowledgeDocDialogMode,
} from "@/components/demo/KnowledgeDocDialog";
import { ResourceHistoryDialog } from "@/components/demo/ResourceHistoryDialog";
import { useCollabDocument } from "@/hooks/useCollabDocument";
import { VisualPropertyPanel } from "./components/VisualPropertyPanel";
import {
  SketchEditorEngineInspectorPanel,
  SketchEditorEngineLayerPanel,
  SketchEditorEngineStage,
  SketchEditorEngineToolbar,
  useSketchEditorEngineHost,
} from "./components/SketchEditorEngineHost";
import { useVisualEditState } from "./hooks/useVisualEditState";
import { useVersionControl } from "./hooks/useVersionControl";
import { useWorkspaceAuthorityState } from "./hooks/useWorkspaceAuthorityState";
import { useCommandHistory } from "./hooks/useCommandHistory";
import {
  resolveSinglePreviewResourceHistoryTarget,
  type SinglePreviewTarget,
} from "./single-preview-history";
import {
  CanvasDocumentContent,
  getAnnotationsFromCanvasState,
  getCanvasDocumentEntries,
  useCanvasDocumentMarkdown,
  withCanvasAnnotationNodes,
} from "@workbench/demo-ui";
import type {
  CanvasDocumentNode,
  CanvasState,
  CanvasKnowledgeDocument,
  CanvasKnowledgeDocumentCreateInput,
  CanvasKnowledgeDocumentUpdateInput,
  CanvasPageData,
  CanvasPageLayout,
  CanvasPageGroup,
  PreviewDiagnosticError,
} from "@workbench/demo-ui";
import type {
  DemoFiles,
  DemoPageMeta,
  DemoFolderMeta,
  PageVersionHistoryResponse,
  PageVersionInfo,
  VersionHistoryResponse,
  VersionInfo,
  WorkspaceTree,
  UserAuthoringPreferences,
} from "@workbench/shared";
import { projectApiClient } from "@/lib/project-api";
import { resolveSketchEditorEngine } from "@/lib/sketch-editor-engine";
import type { ActiveViewContext } from "@/components/ai-elements";
import { sanitizeHydratedMessages } from "@/lib/sanitize-hydrated-messages";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

const VISUAL_PROPERTY_DRAWER_ANIMATION_MS = 200;

interface DemoEditPageProps {
  params: {
    id: string;
  };
}

type AiFileChange = {
  path: string;
  action: "created" | "modified" | "deleted";
  content?: string;
};

type DeletedDemoPageSnapshot = {
  snapshotId: string;
  page: DemoPageMeta;
};

type PreviewRuntimeErrorContext = NonNullable<
  ActiveViewContext["previewDiagnostic"]
>;

function parsePreviewDimension(
  value: string | number | undefined,
): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;

  const parsed = Number.parseFloat(value.replace(/px$/, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getScreenshotRequestSize(previewSize?: PreviewSize): {
  width?: number;
  height?: number;
} {
  return {
    width: parsePreviewDimension(previewSize?.width),
    height: parsePreviewDimension(previewSize?.height),
  };
}

function isCanvasScreenshotRenderBoxCompatible(
  renderBox: ScreenshotRenderBox | undefined,
  previewSize?: PreviewSize,
): renderBox is ScreenshotRenderBox {
  if (!renderBox || !renderBox.fullPage) return false;
  const expectedWidth = parsePreviewDimension(previewSize?.width);
  if (!expectedWidth) return true;
  return Math.abs(renderBox.width - expectedWidth) < 1;
}

const CANVAS_SCREENSHOT_FULL_PAGE = true;

function createVisualId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function replaceUniqueText(
  source: string,
  before: string,
  after: string,
): { code?: string; error?: string } {
  const first = source.indexOf(before);
  if (first === -1) {
    return { error: "当前代码中找不到原始文本，可能来自动态数据或已被修改" };
  }
  const second = source.indexOf(before, first + before.length);
  if (second !== -1) {
    return { error: "原始文本在代码中出现多次，请跳转代码后手动确认修改位置" };
  }
  return {
    code: `${source.slice(0, first)}${after}${source.slice(first + before.length)}`,
  };
}

function getSchemaPropertyKeys(
  ...schemas: Array<string | undefined | null>
): string[] {
  const keys = new Set<string>();
  for (const schema of schemas) {
    if (!schema) continue;
    try {
      const parsed = JSON.parse(schema) as {
        properties?: Record<string, unknown>;
      };
      for (const key of Object.keys(parsed.properties || {})) {
        keys.add(key);
      }
    } catch {
      // 忽略坏 schema，保存入口仍会做完整校验。
    }
  }
  return Array.from(keys);
}

function areConfigValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeDefaultsPreservingUserValues(
  currentConfig: Record<string, unknown>,
  nextDefaults: Record<string, unknown>,
  previousDefaults: Record<string, unknown> = {},
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...nextDefaults };

  for (const [key, currentValue] of Object.entries(currentConfig)) {
    if (!(key in nextDefaults)) {
      merged[key] = currentValue;
      continue;
    }

    if (
      key in previousDefaults &&
      areConfigValuesEqual(currentValue, previousDefaults[key])
    ) {
      merged[key] = nextDefaults[key];
      continue;
    }

    merged[key] = currentValue;
  }

  return merged;
}

const uuidLikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getVersionSavedBy(savedBy?: string): string {
  if (!savedBy || uuidLikePattern.test(savedBy)) {
    return "未知用户";
  }
  return savedBy;
}

function getRestoredPageTitle(version: VersionInfo): string {
  const noteMatch = /从页面\s+(.+?)\s+的历史版本/.exec(version.note ?? "");
  const sessionMatch = /^restore-page-(.+)-v\d+$/.exec(version.sessionId);
  const pageName = noteMatch?.[1] || sessionMatch?.[1] || "页面";
  return `恢复了${pageName}`;
}

function mergeLoadedPageSchemas(
  current: Record<string, string>,
  loaded: Record<string, string>,
): Record<string, string> {
  let changed = false;
  const next = { ...current };

  for (const [pageId, loadedSchema] of Object.entries(loaded)) {
    const existingSchema = current[pageId];
    if (
      existingSchema &&
      !isSchemaEmpty(existingSchema) &&
      (!loadedSchema || isSchemaEmpty(loadedSchema))
    ) {
      continue;
    }
    if (existingSchema !== loadedSchema) {
      next[pageId] = loadedSchema;
      changed = true;
    }
  }

  return changed ? next : current;
}

type HistoryEvent =
  | {
      id: string;
      kind: "project";
      title: "命名版本" | "发布快照" | "自动保存记录" | "恢复项目";
      savedAt: number;
      savedBy: string;
      version: VersionInfo;
      isLatestProject: boolean;
    }
  | {
      id: string;
      kind: "page";
      title: string;
      savedAt: number;
      version: PageVersionInfo;
    }
  | {
      id: string;
      kind: "page-restore";
      title: string;
      savedAt: number;
      version: VersionInfo;
    };

type DemoPage = DemoPageMeta & { runtimeType?: DemoPageRuntimeType; previewSize?: import("@workbench/demo-ui").PreviewSize };

const runtimeTypeLabels: Record<DemoPageRuntimeType, string> = {
  "high-fidelity-react": "高保真 React",
  "prototype-html-css": "HTML/CSS 原型",
  "sketch-scene": "手绘页面",
};

function getEffectiveRuntimeType(
  page?: Pick<DemoPage, "runtimeType"> | null,
): DemoPageRuntimeType {
  if (page?.runtimeType === "prototype-html-css") return "prototype-html-css";
  if (page?.runtimeType === "sketch-scene") return "sketch-scene";
  return "high-fidelity-react";
}

function buildRuntimeConversionPrompt(input: {
  pageId: string;
  pageName: string;
  sourceRuntimeType: DemoPageRuntimeType;
  targetRuntimeType: DemoPageRuntimeType;
}): string {
  const sourceLabel = runtimeTypeLabels[input.sourceRuntimeType];
  const targetLabel = runtimeTypeLabels[input.targetRuntimeType];
  const base = `请把当前页面从「${sourceLabel}」转换为「${targetLabel}」，并保持产品意图、页面结构、配置字段和视觉层级一致。

页面名称: ${input.pageName}
页面 ID: ${input.pageId}

必须处理的文件:
- demos/${input.pageId}/index.tsx
- demos/${input.pageId}/config.schema.json
- demos/${input.pageId}/prototype.html
- demos/${input.pageId}/prototype.css
- demos/${input.pageId}/prototype.meta.json
- workspace-tree.json

通用要求:
- 先读取当前页面已有源文件，不要凭空重做页面。
- 目标运行时文件生成完成并自检通过后，再更新 workspace-tree.json 中该页面的 runtimeType。
- 保留源运行时文件作为回退，不要删除 index.tsx、prototype.html 或 prototype.css。
- 不要新增无关页面、文件夹或依赖。
- 转换后检查目标运行时的配置 Schema 仍是合法 JSON。`;

  if (input.targetRuntimeType === "prototype-html-css") {
    return `${base}

HTML/CSS 原型页目标:
- 从 demos/${input.pageId}/index.tsx 和 config.schema.json 提取可静态表达的界面。
- 写入 demos/${input.pageId}/prototype.html 和 demos/${input.pageId}/prototype.css。
- prototype.html 只保留页面主体结构，不要包含远程 script、远程 stylesheet、iframe 或内联事件处理器。
- prototype.css 内联必要样式，不要通过 @import 拉取远程资源。
- workspace-tree.json 中该页面 runtimeType 设置为 "prototype-html-css"。`;
  }

  return `${base}

高保真 React 页目标:
- 从 demos/${input.pageId}/prototype.html、prototype.css 和 config.schema.json 还原为可交互 React 页面。
- 写入 demos/${input.pageId}/index.tsx，必要时同步更新 config.schema.json。
- React 代码必须使用当前项目已支持的导入和 @preview/sdk 约定，不要引入未登记依赖。
- workspace-tree.json 中该页面 runtimeType 设置为 "high-fidelity-react"。`;
}
type ScreenshotBatchScope = "all" | "canvas-initial";

type RuntimeConversionStatus = "running" | "applying" | "completed" | "failed";

interface RuntimeConversionRequestOptions {
  skipStaticization?: boolean;
  staticizationFailure?: string;
}

interface RuntimeConversionState {
  pageId: string;
  pageName: string;
  sourceRuntimeType: DemoPageRuntimeType;
  targetRuntimeType: DemoPageRuntimeType;
  status: RuntimeConversionStatus;
  traceId: string;
  requestedAt: number;
  message?: string;
}

interface RuntimeConversionFileSnapshot {
  code?: string;
  schema?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: PrototypePageMeta;
  sketchScene?: string;
  sketchMeta?: Record<string, unknown>;
}

function toCanvasKnowledgeDocument(
  item: KnowledgeItem,
): CanvasKnowledgeDocument {
  return {
    id: item.id,
    title: item.title,
    fileName: item.fileName,
    description: item.description,
  };
}

function dedupeHistoryEvents(events: HistoryEvent[]): HistoryEvent[] {
  const seen = new Set<string>();

  return events.filter((event) => {
    if (seen.has(event.id)) {
      return false;
    }
    seen.add(event.id);
    return true;
  });
}

function replaceCollabText(
  ytext: {
    toString: () => string;
    delete: (index: number, length: number) => void;
    insert: (index: number, text: string) => void;
    doc?: { transact: (fn: () => void) => void } | null;
  } | null,
  value: string,
): void {
  if (!ytext || ytext.toString() === value) return;
  // 用 transaction 包裹 delete + insert，确保它们作为单个 Yjs update 传播。
  // 避免中间空态在 sync 过程中被服务端误判为"需要插入磁盘内容"。
  const apply = () => {
    ytext.delete(0, ytext.toString().length);
    if (value) ytext.insert(0, value);
  };
  if (ytext.doc) {
    ytext.doc.transact(apply);
  } else {
    apply();
  }
}

function isAiFileChangeRefreshTarget(normalizedPath: string): boolean {
  return (
    normalizedPath === "workspace-tree.json" ||
    normalizedPath === "project.config.schema.json" ||
    normalizedPath.startsWith("demos/")
  );
}

const WORKSPACE_FLUSH_DELAY_MS = 1200;

type WorkspaceSyncPhase =
  | "persist-active-page"
  | "collab-flush"
  | "persist-workspace";

class WorkspaceSyncStepError extends Error {
  readonly phase: WorkspaceSyncPhase;
  readonly code?: string;
  readonly status?: number;

  constructor(phase: WorkspaceSyncPhase, error: unknown) {
    const message = error instanceof Error ? error.message : "协同草稿同步失败";
    super(message);
    this.name = "WorkspaceSyncStepError";
    this.phase = phase;
    if (error && typeof error === "object") {
      const candidate = error as { code?: unknown; status?: unknown };
      if (typeof candidate.code === "string") this.code = candidate.code;
      if (typeof candidate.status === "number") this.status = candidate.status;
    }
  }
}

async function runWorkspaceSyncStep<T>(
  phase: WorkspaceSyncPhase,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new WorkspaceSyncStepError(phase, error);
  }
}

const WORKSPACE_SYNC_PHASE_LABELS: Record<WorkspaceSyncPhase, string> = {
  "persist-active-page": "页面暂存异常",
  "collab-flush": "协同落盘异常",
  "persist-workspace": "项目同步异常",
};

function getWorkspaceSyncErrorDetails(error: unknown): {
  message: string;
  phase?: WorkspaceSyncPhase;
  errorCode?: string;
  httpStatus?: number;
  /** 用户可读的错误标签，包含失败阶段信息 */
  label: string;
} {
  const message = error instanceof Error ? error.message : "协同草稿同步失败";
  if (error instanceof WorkspaceSyncStepError) {
    const phaseLabel = WORKSPACE_SYNC_PHASE_LABELS[error.phase] ?? error.phase;
    return {
      message,
      phase: error.phase,
      errorCode: error.code,
      httpStatus: error.status,
      label: `保存失败：${phaseLabel}`,
    };
  }
  return { message, label: "保存失败" };
}

function serializeCanvasLayout(projectId: string, state: CanvasState): string {
  return JSON.stringify(
    {
      version: 1,
      projectId,
      updatedAt: Date.now(),
      state,
    },
    null,
    2,
  );
}

function parseCanvasLayoutState(value: string): CanvasState | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as { state?: CanvasState };
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

function arePositionableSizesEqual(
  current: Record<string, PositionableSizeItem>,
  next: Record<string, PositionableSizeItem>,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (currentKeys.length !== nextKeys.length) return false;

  return nextKeys.every((key) => {
    const currentItem = current[key];
    const nextItem = next[key];
    return (
      currentItem?.width === nextItem?.width &&
      currentItem?.height === nextItem?.height
    );
  });
}

function getCanvasContentHistorySignature(state: CanvasState): string {
  return JSON.stringify({
    pages: state.pages ?? {},
    nodes: state.nodes ?? {},
    layers: state.layers ?? {},
    hiddenKnowledgeDocumentIds: state.hiddenKnowledgeDocumentIds ?? [],
  });
}

export default function DemoEditPage({ params }: DemoEditPageProps) {
  const router = useRouter();
  const { id: demoId } = params;
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const handleCommandHistoryError = useCallback(
    (error: unknown, command: { label: string }, phase: "undo" | "redo") => {
      toast({
        title: phase === "undo" ? "撤回失败" : "重做失败",
        description:
          error instanceof Error ? error.message : `${command.label}执行失败`,
        variant: "destructive",
      });
    },
    [toast],
  );
  const commandHistory = useCommandHistory({
    onError: handleCommandHistoryError,
  });
  const {
    bindKeyboardShortcuts,
    canRedo,
    canUndo,
    executeCommand,
    recordCommand,
    redo,
    reset: resetCommandHistory,
    undo,
  } = commandHistory;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [code, setCode] = useState("");
  const [schema, setSchema] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const codeRef = useRef(code);
  codeRef.current = code;
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const [configDataMap, setConfigDataMap] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [projectConfigValues, setProjectConfigValues] = useState<
    Record<string, unknown>
  >({});
  const projectConfigValuesRef = useRef(projectConfigValues);
  projectConfigValuesRef.current = projectConfigValues;
  const projectConfigPersistQueueRef = useRef<Promise<boolean>>(
    Promise.resolve(true),
  );
  const [pageSchemaMap, setPageSchemaMap] = useState<Record<string, string>>(
    {},
  );
  const pageSchemaMapRef = useRef(pageSchemaMap);
  pageSchemaMapRef.current = pageSchemaMap;
  const [pageCodes, setPageCodes] = useState<Record<string, string>>({});
  const [pagePrototypeMap, setPagePrototypeMap] = useState<
    Record<
      string,
      {
        html?: string;
        css?: string;
        meta?: PrototypePageMeta;
      }
    >
  >({});
  const pagePrototypeMapRef = useRef(pagePrototypeMap);
  pagePrototypeMapRef.current = pagePrototypeMap;
  const [pageSketchMap, setPageSketchMap] = useState<
    Record<
      string,
      {
        scene?: string;
        meta?: Record<string, unknown>;
      }
    >
  >({});
  const pageSketchMapRef = useRef(pageSketchMap);
  pageSketchMapRef.current = pageSketchMap;
  const [sketchEditing, setSketchEditing] = useState(false);
  const [pagePreviewSizeMap, setPagePreviewSizeMap] = useState<
    Record<string, import("@workbench/demo-ui").PreviewSize>
  >({});
  const [positionableItemSizes, setPositionableItemSizes] = useState<
    Record<string, PositionableSizeItem>
  >({});
  const handlePositionableSizes = useCallback(
    (sizes: Record<string, PositionableSizeItem>) => {
      setPositionableItemSizes((current) =>
        arePositionableSizesEqual(current, sizes) ? current : sizes,
      );
    },
    [],
  );

  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  });

  const [agentSessionId, setAgentSessionId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const [sessionId, setSessionId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");

  const [workspacePath, setWorkspacePath] = useState("");
  const [previewSize, setPreviewSize] =
    useState<import("@workbench/demo-ui").PreviewSize>();

  useEffect(() => bindKeyboardShortcuts(), [bindKeyboardShortcuts]);

  useEffect(() => {
    resetCommandHistory();
  }, [resetCommandHistory, sessionId]);

  const [demoName, setDemoName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasPendingWorkspaceFlush, setHasPendingWorkspaceFlush] =
    useState(false);
  const [workspaceFlushRevision, setWorkspaceFlushRevision] = useState(0);
  const [workspaceFlushError, setWorkspaceFlushError] = useState<string | null>(
    null,
  );
  const workspaceFlushRevisionRef = useRef(0);
  const [currentThumbnail, setCurrentThumbnail] = useState<string | undefined>(
    undefined,
  );
  const [projectAuthoringPreferences, setProjectAuthoringPreferences] =
    useState<ProjectAuthoringPreferences | undefined>(undefined);
  const [userAuthoringPreferences, setUserAuthoringPreferences] = useState<
    UserAuthoringPreferences | undefined
  >(undefined);
  // ── Workspace sync refs（Yjs-First: 替代 AutosaveScheduler）──────────
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const scheduleWorkspaceSyncRef = useRef<() => void>(() => {});
  const flushSyncWorkspaceRef = useRef<() => Promise<void>>(
    () => Promise.resolve(),
  );
  const previewTrackerRef = useRef<PreviewProjectionTracker>(
    new PreviewProjectionTracker(),
  );
  const performanceSamplerRef = useRef<WorkspacePerformanceSampler>(
    new WorkspacePerformanceSampler(),
  );

  const authorityState = useWorkspaceAuthorityState({
    projectId: demoId,
    workspaceId,
    sessionId,
  });

  const markWorkspaceChanged = useCallback(() => {
    setHasUnsavedChanges(true);
    setHasPendingWorkspaceFlush(true);
    setWorkspaceFlushError(null);
    setWorkspaceFlushRevision((current) => {
      const next = current + 1;
      workspaceFlushRevisionRef.current = next;
      return next;
    });
    // Yjs-First: 触发 debounced workspace sync（替代 AutosaveScheduler）
    scheduleWorkspaceSyncRef.current();
  }, []);

  // 多页面状态
  const [demoPages, setDemoPages] = useState<DemoPage[]>([]);
  const demoPagesRef = useRef<DemoPage[]>([]);
  demoPagesRef.current = demoPages;
  const [demoFolders, setDemoFolders] = useState<DemoFolderMeta[]>([]);
  const [activeDemoId, setActiveDemoId] = useState<string>("");
  const [runtimeConversions, setRuntimeConversions] = useState<
    Record<string, RuntimeConversionState>
  >({});
  const runtimeConversionsRef = useRef(runtimeConversions);
  runtimeConversionsRef.current = runtimeConversions;
  const [singlePreviewTarget, setSinglePreviewTarget] =
    useState<SinglePreviewTarget | null>(null);
  const activeDemoIdRef = useRef(activeDemoId);
  activeDemoIdRef.current = activeDemoId;
  const suppressNextCanvasCollabPushRef = useRef(false);
  const [projectConfigSchema, setProjectConfigSchema] = useState<
    string | undefined
  >(undefined);
  const projectConfigSchemaRef = useRef<string | undefined>(
    projectConfigSchema,
  );
  projectConfigSchemaRef.current = projectConfigSchema;
  const [configPanelDetailPageId, setConfigPanelDetailPageId] = useState<
    string | null
  >(null);
  const [configPanelOverviewRequested, setConfigPanelOverviewRequested] =
    useState(false);

  const {
    previewMode,
    setPreviewMode,
    canvasState,
    setCanvasState: setCanvasStateRaw,
    canvasEditingPageId,
    setCanvasEditingPageId,
    focusCanvasPageId,
    setFocusCanvasPageId,
    focusCanvasPage,
    clearCanvasSelection,
    flushCanvasState,
    hasUnsavedCanvasChanges,
    applyRemoteCanvasState,
    markCanvasChangesSaved,
  } = useCanvasWorkspace({
    sessionId,
    projectId: demoId,
  });
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;
  const suppressCanvasHistoryRef = useRef(false);
  const pendingCanvasHistoryRef = useRef<{
    before: CanvasState;
    after: CanvasState;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const flushPendingCanvasHistory = useCallback(() => {
    const pending = pendingCanvasHistoryRef.current;
    if (!pending) return;
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pendingCanvasHistoryRef.current = null;

    const beforeSignature = getCanvasContentHistorySignature(pending.before);
    const afterSignature = getCanvasContentHistorySignature(pending.after);
    if (beforeSignature === afterSignature) return;

    const before = pending.before;
    const after = pending.after;
    recordCommand({
      label: "画布变更",
      undo: () => {
        suppressCanvasHistoryRef.current = true;
        canvasStateRef.current = before;
        setCanvasStateRaw(before);
        suppressCanvasHistoryRef.current = false;
      },
      redo: () => {
        suppressCanvasHistoryRef.current = true;
        canvasStateRef.current = after;
        setCanvasStateRaw(after);
        suppressCanvasHistoryRef.current = false;
      },
    });
  }, [recordCommand, setCanvasStateRaw]);
  const setCanvasState = useCallback(
    (nextState: CanvasState) => {
      const previousState = canvasStateRef.current;
      canvasStateRef.current = nextState;
      setCanvasStateRaw(nextState);

      if (suppressCanvasHistoryRef.current) return;
      if (
        getCanvasContentHistorySignature(previousState) ===
        getCanvasContentHistorySignature(nextState)
      ) {
        return;
      }

      const existing = pendingCanvasHistoryRef.current;
      if (existing) {
        existing.after = nextState;
        if (existing.timer) clearTimeout(existing.timer);
        existing.timer = setTimeout(flushPendingCanvasHistory, 350);
        return;
      }

      pendingCanvasHistoryRef.current = {
        before: previousState,
        after: nextState,
        timer: setTimeout(flushPendingCanvasHistory, 350),
      };
    },
    [flushPendingCanvasHistory, setCanvasStateRaw],
  );
  useEffect(() => {
    return () => {
      const pending = pendingCanvasHistoryRef.current;
      if (pending?.timer) clearTimeout(pending.timer);
      pendingCanvasHistoryRef.current = null;
    };
  }, []);
  const lastAppliedCanvasCollabValueRef = useRef<string | null>(null);
  const [fitCanvasToScreenOnMount, setFitCanvasToScreenOnMount] =
    useState(false);
  const initialCanvasFitRequestedRef = useRef(false);
  const handleInitialCanvasFitComplete = useCallback(() => {
    setFitCanvasToScreenOnMount(false);
  }, []);
  const [singlePreviewLoaded, setSinglePreviewLoaded] = useState(false);
  const initialScreenshotBatchStartedRef = useRef(false);
  const screenshotPageIds = useMemo(
    () => demoPages.map((page) => page.id),
    [demoPages],
  );
  const [visibleCanvasPageIds, setVisibleCanvasPageIds] = useState<string[]>(
    [],
  );
  const visibleCanvasPageIdSet = useMemo(
    () => new Set(visibleCanvasPageIds),
    [visibleCanvasPageIds],
  );
  const nearbyCanvasPageIdSet = useMemo(() => {
    const nearby = new Set<string>();
    if (previewMode !== "canvas") return nearby;

    const orderedPageIds = demoPages.map((page) => page.id);
    const seedPageIds = new Set(
      [...visibleCanvasPageIds, canvasEditingPageId ?? activeDemoId].filter(
        Boolean,
      ),
    );

    for (const seedPageId of seedPageIds) {
      const index = orderedPageIds.indexOf(seedPageId);
      if (index === -1) continue;

      const before = orderedPageIds[index - 1];
      const after = orderedPageIds[index + 1];
      if (before && !visibleCanvasPageIdSet.has(before)) nearby.add(before);
      if (after && !visibleCanvasPageIdSet.has(after)) nearby.add(after);
    }

    return nearby;
  }, [
    activeDemoId,
    canvasEditingPageId,
    demoPages,
    previewMode,
    visibleCanvasPageIds,
    visibleCanvasPageIdSet,
  ]);

  const {
    pageScreenshots,
    isGenerating: isScreenshotGenerating,
    checkServiceHealth,
    startBatchGeneration,
    regeneratePageSnapshot,
    invalidatePageScreenshot,
    invalidatePageScreenshots,
    getScreenshotUrl,
  } = useScreenshotGeneration({
    projectId: demoId,
    sessionId,
    enabled: true, // 截图常驻生成，不再仅限画布模式
    pageIds: screenshotPageIds,
  });
  const canvasScreenshotUrls = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(pageScreenshots)
          .filter(([id, state]) => {
            if (!state.screenshotUrl) return false;
            if (!state.hash || !state.expectedHash) return false;
            if (state.hash !== state.expectedHash) return false;
            return isCanvasScreenshotRenderBoxCompatible(
              state.renderBox,
              pagePreviewSizeMap[id],
            );
          })
          .map(([id, state]) => [id, state.screenshotUrl!]),
      ),
    [pageScreenshots, pagePreviewSizeMap],
  );
  const canvasScreenshotRenderBoxes = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(pageScreenshots)
          .filter(([id, state]) => {
            if (!state.screenshotUrl) return false;
            if (!state.hash || !state.expectedHash) return false;
            if (state.hash !== state.expectedHash) return false;
            return isCanvasScreenshotRenderBoxCompatible(
              state.renderBox,
              pagePreviewSizeMap[id],
            );
          })
          .map(([id, state]) => [id, state.renderBox!]),
      ),
    [pageScreenshots, pagePreviewSizeMap],
  );

  const getScreenshotPriority = useCallback(
    (pageId: string): ScreenshotPriority => {
      if (pageId === (canvasEditingPageId ?? activeDemoId)) {
        return "active";
      }
      if (previewMode === "canvas" && visibleCanvasPageIdSet.has(pageId)) {
        return "visible";
      }
      if (previewMode === "canvas" && nearbyCanvasPageIdSet.has(pageId)) {
        return "nearby";
      }
      return "background";
    },
    [
      activeDemoId,
      canvasEditingPageId,
      nearbyCanvasPageIdSet,
      previewMode,
      visibleCanvasPageIdSet,
    ],
  );

  const getScreenshotRenderMode = useCallback(
    (pageId: string): ScreenshotRenderMode => {
      const priority = getScreenshotPriority(pageId);
      return priority === "active" || priority === "visible"
        ? "fast"
        : "strict";
    },
    [getScreenshotPriority],
  );

  const buildScreenshotPageInput = useCallback(
    (
      page: DemoPage,
      configOverride?: Record<string, unknown>,
      codeOverride?: string,
    ): ScreenshotBatchPageInput | null => {
      const previewSize = pagePreviewSizeMap[page.id];
      const { width, height } = getScreenshotRequestSize(previewSize);
      const configData = configOverride ?? configDataMap[page.id] ?? {};
      const common = {
        pageId: page.id,
        configData,
        previewSize,
        width,
        height,
      };

      if (page.runtimeType === "prototype-html-css") {
        const prototype = pagePrototypeMapRef.current[page.id] ?? {};
        if (!prototype.html) return null;
        return {
          ...common,
          runtimeType: "prototype-html-css",
          prototypeHtml: prototype.html,
          prototypeCss: prototype.css ?? "",
          prototypeMeta: prototype.meta,
        };
      }

      if (page.runtimeType === "sketch-scene") {
        const sketch = pageSketchMapRef.current[page.id] ?? {};
        if (!sketch.scene) return null;
        let sketchScene: SketchSceneDocument;
        try {
          sketchScene = JSON.parse(sketch.scene) as SketchSceneDocument;
        } catch {
          return null;
        }
        return {
          ...common,
          runtimeType: "sketch-scene",
          sketchScene,
          sketchMeta: sketch.meta,
        };
      }

      const pageCode =
        codeOverride ??
        resolvePreviewPageCode({
          pageId: page.id,
          pageCodes,
          activeCodePageId:
            pageCodes[activeDemoId] === code ? activeDemoId : undefined,
          activeCode: code,
        });
      if (!pageCode) return null;
      return {
        ...common,
        runtimeType: "high-fidelity-react",
        code: pageCode,
      };
    },
    [activeDemoId, code, configDataMap, pageCodes, pagePreviewSizeMap],
  );

  const buildScreenshotBatchPages = useCallback(
    (scope: ScreenshotBatchScope = "all") => {
      const priorityWeight: Record<ScreenshotPriority, number> = {
        active: 0,
        visible: 1,
        nearby: 2,
        thumbnail: 3,
        background: 4,
      };

      return demoPages
        .flatMap((p, index) => {
          const snapshotInput = buildScreenshotPageInput(p);
          if (!snapshotInput) return [];
          const priority = getScreenshotPriority(p.id);
          if (
            scope === "canvas-initial" &&
            priority !== "active" &&
            priority !== "visible" &&
            priority !== "nearby"
          ) {
            return [];
          }
          const renderMode = getScreenshotRenderMode(p.id);
          return [
            {
              ...snapshotInput,
              fullPage: CANVAS_SCREENSHOT_FULL_PAGE,
              priority,
              renderMode,
              measuredHeight: pageScreenshots[p.id]?.renderBox?.height,
              index,
            },
          ];
        })
        .sort((a, b) => {
          const priorityDiff =
            priorityWeight[a.priority] - priorityWeight[b.priority];
          return priorityDiff === 0 ? a.index - b.index : priorityDiff;
        })
        .map(({ index: _index, ...page }) => page);
    },
    [
      code,
      activeDemoId,
      buildScreenshotPageInput,
      configDataMap,
      demoPages,
      getScreenshotRenderMode,
      getScreenshotPriority,
      pageCodes,
      pageScreenshots,
      pagePreviewSizeMap,
    ],
  );

  // 截图 debounce 再生定时器
  const configDataMapRef = useRef(configDataMap);
  configDataMapRef.current = configDataMap;

  const persistProjectConfigValues = useCallback(
    (values: Record<string, unknown>): Promise<boolean> => {
      if (!sessionId) return Promise.resolve(true);
      if (Object.keys(values).length === 0) return Promise.resolve(true);
      const persist = async (): Promise<boolean> => {
        try {
          const res = await fetch(`/api/projects/${demoId}/config-values`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, values }),
          });
          const result = await res.json().catch(() => null);
          if (!res.ok || !result?.success) {
            throw new Error(result?.error?.message || "保存共享配置失败");
          }
          return true;
        } catch (error) {
          toast({
            title: "共享配置保存失败",
            description:
              error instanceof Error
                ? error.message
                : "请稍后重试或重新保存项目。",
            variant: "destructive",
          });
          return false;
        }
      };
      const queued = projectConfigPersistQueueRef.current.then(
        persist,
        persist,
      );
      projectConfigPersistQueueRef.current = queued.catch(() => false);
      return queued;
    },
    [demoId, sessionId, toast],
  );
  const screenshotRegenerateTimerRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  // debounce 3s 触发单页截图再生
  const scheduleScreenshotRegenerate = useCallback(
    (
      pageId: string,
      pageCode?: string,
      configOverride?: Record<string, unknown>,
    ) => {
      const timers = screenshotRegenerateTimerRef.current;
      if (timers[pageId]) clearTimeout(timers[pageId]);
      timers[pageId] = setTimeout(() => {
        const config = configOverride ?? configDataMapRef.current[pageId] ?? {};
        const page = demoPages.find((item) => item.id === pageId);
        if (!page) {
          delete timers[pageId];
          return;
        }
        const snapshotInput = buildScreenshotPageInput(page, config, pageCode);
        if (!snapshotInput) {
          delete timers[pageId];
          return;
        }
        const { width, height } = getScreenshotRequestSize(
          pagePreviewSizeMap[pageId],
        );
        const regenerateInput =
          snapshotInput.runtimeType === "prototype-html-css" ||
          snapshotInput.runtimeType === "sketch-scene"
            ? snapshotInput
            : {
                ...snapshotInput,
                runtimeType: "high-fidelity-react" as const,
              };
        regeneratePageSnapshot(
          pageId,
          regenerateInput,
          width,
          height,
          CANVAS_SCREENSHOT_FULL_PAGE,
          getScreenshotPriority(pageId),
          getScreenshotRenderMode(pageId),
          pageScreenshots[pageId]?.renderBox?.height,
        );
        delete timers[pageId];
      }, 3000);
    },
    [
      buildScreenshotPageInput,
      demoPages,
      getScreenshotPriority,
      getScreenshotRenderMode,
      pageScreenshots,
      regeneratePageSnapshot,
      pagePreviewSizeMap,
    ],
  );

  const regenerateCanvasScreenshots = useCallback(async () => {
    const available = await checkServiceHealth();
    if (!available || demoPages.length === 0) return;

    const pages = buildScreenshotBatchPages();

    if (pages.length > 0) {
      startBatchGeneration(pages);
    }
  }, [
    buildScreenshotBatchPages,
    checkServiceHealth,
    demoPages,
    startBatchGeneration,
  ]);

  // 首屏优先加载单页 iframe；批量截图延后到预览 ready 或用户进入画布后。
  useEffect(() => {
    if (initialScreenshotBatchStartedRef.current) return;
    if (previewMode === "canvas" && visibleCanvasPageIds.length === 0) return;
    const canStartBatch =
      previewMode === "canvas" ||
      (previewMode === "single" && singlePreviewLoaded);
    if (canStartBatch && demoPages.length > 0 && !isScreenshotGenerating) {
      const pages = buildScreenshotBatchPages(
        previewMode === "canvas" ? "canvas-initial" : "all",
      );
      if (pages.length > 0) {
        initialScreenshotBatchStartedRef.current = true;
        startBatchGeneration(pages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    previewMode,
    singlePreviewLoaded,
    buildScreenshotBatchPages,
    visibleCanvasPageIds.length,
  ]);

  // 页面管理编辑状态
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingPageName, setEditingPageName] = useState("");

  // 工作空间代码 Tab 弹窗状态
  const [wsCodeDialogOpen, setWsCodeDialogOpen] = useState(false);
  const [wsCodeDialogData, setWsCodeDialogData] = useState<{
    filePath: string;
    content: string;
    editable: boolean;
  }>({ filePath: "", content: "", editable: false });

  // 知识库文档弹窗状态
  const [kbDocDialogOpen, setKbDocDialogOpen] = useState(false);
  const [kbDocDialogMode, setKbDocDialogMode] =
    useState<KnowledgeDocDialogMode>("read");
  const [kbDocDialogItem, setKbDocDialogItem] = useState<KnowledgeItem | null>(
    null,
  );
  const [kbHistoryItem, setKbHistoryItem] = useState<KnowledgeItem | null>(
    null,
  );
  const [singlePreviewHistoryOpen, setSinglePreviewHistoryOpen] =
    useState(false);
  const [singlePreviewHistoryPreparing, setSinglePreviewHistoryPreparing] =
    useState(false);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);

  const upsertKnowledgeItem = useCallback((item: KnowledgeItem) => {
    setKnowledgeItems((current) => {
      const exists = current.some((existing) => existing.id === item.id);
      if (exists) {
        return current.map((existing) =>
          existing.id === item.id ? item : existing,
        );
      }
      return [...current, item];
    });
  }, []);

  const canvasKnowledgeDocuments = useMemo(
    () =>
      knowledgeItems
        .filter((item) => item.source !== "system")
        .map(toCanvasKnowledgeDocument),
    [knowledgeItems],
  );

  const createCanvasKnowledgeDocument = useCallback(
    async (
      input: CanvasKnowledgeDocumentCreateInput,
    ): Promise<CanvasKnowledgeDocument> => {
      if (!workspacePath) {
        throw new Error("工作空间未初始化");
      }

      const query = new URLSearchParams({
        workingDir: workspacePath,
        projectId: demoId,
      });
      if (sessionId) query.set("sessionId", sessionId);
      const res = await fetch(`/api/knowledge?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          description: input.description ?? input.title,
          content: input.content,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "添加知识文档失败");
      }

      upsertKnowledgeItem(data.data);
      window.dispatchEvent(new Event("knowledge-updated"));
      return toCanvasKnowledgeDocument(data.data);
    },
    [demoId, sessionId, workspacePath, upsertKnowledgeItem],
  );

  const updateCanvasKnowledgeDocument = useCallback(
    async (
      id: string,
      input: CanvasKnowledgeDocumentUpdateInput,
    ): Promise<CanvasKnowledgeDocument> => {
      if (!workspacePath) {
        throw new Error("工作空间未初始化");
      }

      const query = new URLSearchParams({
        workingDir: workspacePath,
        projectId: demoId,
      });
      if (sessionId) query.set("sessionId", sessionId);
      const res = await fetch(`/api/knowledge/${id}?${query.toString()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "保存知识文档失败");
      }

      upsertKnowledgeItem(data.data);
      window.dispatchEvent(new Event("knowledge-updated"));
      return toCanvasKnowledgeDocument(data.data);
    },
    [demoId, sessionId, workspacePath, upsertKnowledgeItem],
  );

  const readCanvasKnowledgeDocument = useCallback(
    async (document: CanvasKnowledgeDocument): Promise<string> => {
      if (!workspacePath) return "";
      const query = new URLSearchParams({
        workingDir: workspacePath,
        fileName: document.fileName,
      });
      const res = await fetch(`/api/knowledge/content?${query.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "读取知识文档失败");
      }
      return data.data.content;
    },
    [workspacePath],
  );
  const canvasKnowledgeDocumentsById = useMemo(
    () =>
      new globalThis.Map(
        canvasKnowledgeDocuments.map((document) => [document.id, document]),
      ),
    [canvasKnowledgeDocuments],
  );
  const singlePreviewRawDocumentNodes = useMemo(() => {
    const nodes = getAnnotationsFromCanvasState(canvasState);
    const hiddenKnowledgeDocumentIds = new Set(
      canvasState.hiddenKnowledgeDocumentIds ?? [],
    );
    const existingKnowledgeDocumentIds = new Set<string>();
    const documentNodes: CanvasDocumentNode[] = [];

    Object.values(nodes).forEach((node) => {
      if (node.kind !== "document") return;
      documentNodes.push(node);
      getCanvasDocumentEntries(node).forEach((entry) => {
        existingKnowledgeDocumentIds.add(entry.knowledgeDocument.id);
      });
    });

    canvasKnowledgeDocuments.forEach((document, index) => {
      if (existingKnowledgeDocumentIds.has(document.id)) return;
      if (hiddenKnowledgeDocumentIds.has(document.id)) return;
      documentNodes.push({
        id: `single-doc-${document.id}`,
        kind: "document",
        title: document.title,
        knowledgeDocument: document,
        layout: {
          x: 80 + index * 28,
          y: 80 + index * 28,
          width: 420,
          height: 360,
        },
        createdAt: 0,
        updatedAt: 0,
      });
    });

    return documentNodes;
  }, [canvasKnowledgeDocuments, canvasState]);
  const activeSinglePreviewRawDocumentNode = useMemo(() => {
    if (singlePreviewTarget?.kind !== "document") return undefined;
    return singlePreviewRawDocumentNodes.find(
      (node) => node.id === singlePreviewTarget.documentNodeId,
    );
  }, [singlePreviewRawDocumentNodes, singlePreviewTarget]);
  const singlePreviewMarkdownDocumentNodes = useMemo(
    () =>
      activeSinglePreviewRawDocumentNode
        ? [activeSinglePreviewRawDocumentNode]
        : [],
    [activeSinglePreviewRawDocumentNode],
  );
  const {
    markdownByDocumentId: singlePreviewDocumentMarkdown,
    setMarkdownByDocumentId: setSinglePreviewDocumentMarkdown,
  } = useCanvasDocumentMarkdown({
    documentNodes: singlePreviewMarkdownDocumentNodes,
    onReadKnowledgeDocument: readCanvasKnowledgeDocument,
  });
  const singlePreviewDocumentNodes = useMemo(
    () =>
      singlePreviewRawDocumentNodes.map((node) => {
        const documentEntries = getCanvasDocumentEntries(node).map((entry) => {
          const knowledgeDocument =
            canvasKnowledgeDocumentsById.get(entry.knowledgeDocument.id) ??
            entry.knowledgeDocument;
          return {
            ...entry,
            title: knowledgeDocument.title,
            knowledgeDocument,
          };
        });
        const activeEntry =
          documentEntries.find((entry) => entry.id === node.activeDocumentId) ??
          documentEntries[0];

        if (documentEntries.length > 1) {
          return {
            ...node,
            documents: documentEntries,
            activeDocumentId: activeEntry?.id ?? node.activeDocumentId,
            markdown: activeEntry
              ? (singlePreviewDocumentMarkdown[
                  activeEntry.knowledgeDocument.id
                ] ?? node.markdown)
              : node.markdown,
          };
        }

        if (activeEntry) {
          return {
            ...node,
            title: activeEntry.knowledgeDocument.title,
            knowledgeDocument: activeEntry.knowledgeDocument,
            markdown:
              singlePreviewDocumentMarkdown[activeEntry.knowledgeDocument.id] ??
              node.markdown,
          };
        }

        return node;
      }),
    [
      canvasKnowledgeDocumentsById,
      singlePreviewDocumentMarkdown,
      singlePreviewRawDocumentNodes,
    ],
  );

  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiIsStreaming, setAiIsStreaming] = useState(false);
  const [aiStreamContent, setAiStreamContent] = useState("");
  const [aiCurrentMessage, setAiCurrentMessage] = useState<ChatMessage>({
    role: "assistant",
    content: "",
    parts: [],
  });

  const [errorBannerVisible, setErrorBannerVisible] = useState(false);
  const [tabValue, setTabValue] = useState("ai");
  const [visualPropertyDrawerOpen, setVisualPropertyDrawerOpen] =
    useState(false);
  const [visualPropertyDrawerMounted, setVisualPropertyDrawerMounted] =
    useState(false);
  const [fileView, setFileView] = useState<"doc" | "code">("doc");
  const [triggerAutoSend, setTriggerAutoSend] = useState<
    string | AutoRepairTrigger | VisualPropertyAutoSend | null
  >(null);
  // visualEditMode and related state moved to useVisualEditState hook

  // 自动修复是否正在进行中：待发送的 auto_repair 触发 或 消息列表中存在 running 状态的 autoRepair
  const isAutoRepairing =
    (triggerAutoSend != null &&
      typeof triggerAutoSend === "object" &&
      "kind" in triggerAutoSend &&
      triggerAutoSend.kind === "auto_repair") ||
    aiMessages.some((msg) => msg.autoRepair?.status === "running");

  // Console buffer for forwarding iframe console logs to agent-service
  const streamServiceRef = useRef<StreamService | null>(null);
  const autoPreviewRepairCountsRef = useRef<Map<string, number>>(
    new globalThis.Map(),
  );
  const { handleConsoleEntry } = useConsoleBuffer(streamServiceRef);

  // publishStatus, versionHistory, and related state moved to useVersionControl hook
  const [currentUsername, setCurrentUsername] = useState<string>("");
  const collabUser = useMemo(
    () => ({
      userId: sessionId || "anonymous",
      username: currentUsername || "当前用户",
    }),
    [currentUsername, sessionId],
  );
  const activeDemoRuntimeTypeForCollab = demoPages.find(
    (page) => page.id === activeDemoId,
  )?.runtimeType;
  const activeCodeCollab = useCollabDocument(
    sessionId &&
      workspaceId &&
      activeDemoId &&
      activeDemoRuntimeTypeForCollab !== "prototype-html-css" &&
      activeDemoRuntimeTypeForCollab !== "sketch-scene"
      ? {
          projectId: demoId,
          workspaceId,
          sessionId,
          resourcePath: `demos/${activeDemoId}/index.tsx`,
          kind: "page-code",
        }
      : null,
    collabUser,
  );
  const activePrototypeHtmlCollab = useCollabDocument(
    sessionId &&
      workspaceId &&
      activeDemoId &&
      activeDemoRuntimeTypeForCollab === "prototype-html-css"
      ? {
          projectId: demoId,
          workspaceId,
          sessionId,
          resourcePath: `demos/${activeDemoId}/prototype.html`,
          kind: "page-prototype-html",
        }
      : null,
    collabUser,
  );
  const activePrototypeCssCollab = useCollabDocument(
    sessionId &&
      workspaceId &&
      activeDemoId &&
      activeDemoRuntimeTypeForCollab === "prototype-html-css"
      ? {
          projectId: demoId,
          workspaceId,
          sessionId,
          resourcePath: `demos/${activeDemoId}/prototype.css`,
          kind: "page-prototype-css",
        }
      : null,
    collabUser,
  );
  const activeSchemaCollab = useCollabDocument(
    sessionId && workspaceId && activeDemoId
      ? {
          projectId: demoId,
          workspaceId,
          sessionId,
          resourcePath: `demos/${activeDemoId}/config.schema.json`,
          kind: "page-schema",
        }
      : null,
    collabUser,
  );
  const activeSketchSceneCollab = useCollabDocument(
    sessionId &&
      workspaceId &&
      activeDemoId &&
      activeDemoRuntimeTypeForCollab === "sketch-scene"
      ? {
          projectId: demoId,
          workspaceId,
          sessionId,
          resourcePath: `demos/${activeDemoId}/sketch.scene.json`,
          kind: "page-sketch-scene",
        }
      : null,
    collabUser,
  );
  const projectSchemaCollab = useCollabDocument(
    sessionId && workspaceId
      ? {
          projectId: demoId,
          workspaceId,
          sessionId,
          resourcePath: "project.config.schema.json",
          kind: "project-schema",
        }
      : null,
    collabUser,
  );
  const workspaceTreeCollab = useCollabDocument(
    sessionId && workspaceId
      ? {
          projectId: demoId,
          workspaceId,
          sessionId,
          resourcePath: "workspace-tree.json",
          kind: "workspace-tree",
        }
      : null,
    collabUser,
  );
  const canvasLayoutCollab = useCollabDocument(
    sessionId && workspaceId
      ? {
          projectId: demoId,
          workspaceId,
          sessionId,
          resourcePath: ".canvas-layout.json",
          kind: "canvas-layout",
        }
      : null,
    collabUser,
  );
  const activePageCollabStatuses =
    activeDemoRuntimeTypeForCollab === "prototype-html-css"
      ? [activePrototypeHtmlCollab.status, activePrototypeCssCollab.status]
      : activeDemoRuntimeTypeForCollab === "sketch-scene"
        ? [activeSketchSceneCollab.status]
        : [activeCodeCollab.status];
  const [previewRuntimeError, setPreviewRuntimeError] =
    useState<PreviewRuntimeErrorContext | null>(null);

  const schemaRegenerateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastPreviewErrorFingerprintRef = useRef<string | null>(null);

  const configData = configDataMap[activeDemoId] ?? {};
  // visualConfigCandidates and selectedVisualConfigCandidate moved to useVisualEditState hook
  const activeViewContext = useMemo<ActiveViewContext>(() => {
    const focusedPageId =
      previewMode === "canvas"
        ? (canvasEditingPageId ?? undefined)
        : activeDemoId || undefined;
    const activePage = demoPages.find((page) => page.id === activeDemoId);
    const focusedPage = focusedPageId
      ? demoPages.find((page) => page.id === focusedPageId)
      : undefined;
    return {
      previewMode,
      activePageId: activeDemoId || undefined,
      activePageName: activePage?.name,
      focusedPageId,
      focusedPageName: focusedPage?.name,
      focusedPagePaths: focusedPageId
        ? {
            index: `demos/${focusedPageId}/index.tsx`,
            schema: `demos/${focusedPageId}/config.schema.json`,
          }
        : undefined,
      previewDiagnostic:
        previewRuntimeError &&
        (!previewRuntimeError.pageId ||
          previewRuntimeError.pageId === focusedPageId)
          ? previewRuntimeError
          : undefined,
      previewRuntimeError:
        previewRuntimeError &&
        (!previewRuntimeError.pageId ||
          previewRuntimeError.pageId === focusedPageId)
          ? previewRuntimeError
          : undefined,
    };
  }, [
    activeDemoId,
    canvasEditingPageId,
    demoPages,
    previewMode,
    previewRuntimeError,
  ]);

  const collabDiagnosticSnapshot = useMemo(
    () => ({
      activeCode: {
        status: activeCodeCollab.status,
        error: activeCodeCollab.error,
        awarenessCount: activeCodeCollab.awareness.length,
        resourcePath: activeDemoId
          ? `demos/${activeDemoId}/index.tsx`
          : undefined,
        kind: "page-code",
      },
      activePrototypeHtml: {
        status: activePrototypeHtmlCollab.status,
        error: activePrototypeHtmlCollab.error,
        awarenessCount: activePrototypeHtmlCollab.awareness.length,
        resourcePath: activeDemoId
          ? `demos/${activeDemoId}/prototype.html`
          : undefined,
        kind: "page-prototype-html",
      },
      activePrototypeCss: {
        status: activePrototypeCssCollab.status,
        error: activePrototypeCssCollab.error,
        awarenessCount: activePrototypeCssCollab.awareness.length,
        resourcePath: activeDemoId
          ? `demos/${activeDemoId}/prototype.css`
          : undefined,
        kind: "page-prototype-css",
      },
      activeSchema: {
        status: activeSchemaCollab.status,
        error: activeSchemaCollab.error,
        awarenessCount: activeSchemaCollab.awareness.length,
        resourcePath: activeDemoId
          ? `demos/${activeDemoId}/config.schema.json`
          : undefined,
        kind: "page-schema",
      },
      activeSketchScene: {
        status: activeSketchSceneCollab.status,
        error: activeSketchSceneCollab.error,
        awarenessCount: activeSketchSceneCollab.awareness.length,
        resourcePath:
          activeDemoId && activeDemoRuntimeTypeForCollab === "sketch-scene"
            ? `demos/${activeDemoId}/sketch.scene.json`
            : undefined,
        kind: "page-sketch-scene",
      },
      projectSchema: {
        status: projectSchemaCollab.status,
        error: projectSchemaCollab.error,
        awarenessCount: projectSchemaCollab.awareness.length,
        resourcePath: "project.config.schema.json",
        kind: "project-schema",
      },
      workspaceTree: {
        status: workspaceTreeCollab.status,
        error: workspaceTreeCollab.error,
        awarenessCount: workspaceTreeCollab.awareness.length,
        resourcePath: "workspace-tree.json",
        kind: "workspace-tree",
      },
      canvasLayout: {
        status: canvasLayoutCollab.status,
        error: canvasLayoutCollab.error,
        awarenessCount: canvasLayoutCollab.awareness.length,
        resourcePath: ".canvas-layout.json",
        kind: "canvas-layout",
      },
    }),
    [
      activeCodeCollab.awareness.length,
      activeCodeCollab.error,
      activeCodeCollab.status,
      activePrototypeCssCollab.awareness.length,
      activePrototypeCssCollab.error,
      activePrototypeCssCollab.status,
      activePrototypeHtmlCollab.awareness.length,
      activePrototypeHtmlCollab.error,
      activePrototypeHtmlCollab.status,
      activeDemoId,
      activeDemoRuntimeTypeForCollab,
      activeSchemaCollab.awareness.length,
      activeSchemaCollab.error,
      activeSchemaCollab.status,
      activeSketchSceneCollab.awareness.length,
      activeSketchSceneCollab.error,
      activeSketchSceneCollab.status,
      canvasLayoutCollab.awareness.length,
      canvasLayoutCollab.error,
      canvasLayoutCollab.status,
      projectSchemaCollab.awareness.length,
      projectSchemaCollab.error,
      projectSchemaCollab.status,
      workspaceTreeCollab.awareness.length,
      workspaceTreeCollab.error,
      workspaceTreeCollab.status,
    ],
  );

  const {
    editorSessionId,
    diagnosticsEnabled,
    remoteWriteFailed: diagnosticsRemoteWriteFailed,
    recordEvent: recordDiagnosticEvent,
    createTraceId: createDiagnosticTraceId,
    exportDiagnostics,
  } = useEditorDiagnostics({
    projectId: demoId,
    sessionId,
    workspaceId,
    activePageId: activeDemoId,
    previewMode,
    getSnapshot: () => ({
      projectId: demoId,
      sessionId,
      workspaceId,
      workspacePath,
      activePageId: activeDemoId,
      previewMode,
      hasUnsavedChanges,
      hasPendingWorkspaceFlush,
      hasUnsavedCanvasChanges,
      workspaceFlushError,
      collab: collabDiagnosticSnapshot,
      previewDiagnostic: previewRuntimeError,
      ai: {
        isStreaming: aiIsStreaming,
        messageCount: aiMessages.length,
      },
      pages: {
        count: demoPages.length,
        activePageName:
          demoPages.find((page) => page.id === activeDemoId)?.name ?? null,
      },
    }),
  });

  const previousCollabSnapshotRef = useRef("");
  useEffect(() => {
    const serialized = JSON.stringify(collabDiagnosticSnapshot);
    if (previousCollabSnapshotRef.current === serialized) return;
    previousCollabSnapshotRef.current = serialized;
    recordDiagnosticEvent({
      category: "collab",
      name: "collab.status_snapshot",
      level: Object.values(collabDiagnosticSnapshot).some(
        (item) => item.status === "error" || item.status === "offline",
      )
        ? "warn"
        : "info",
      details: collabDiagnosticSnapshot,
    });
  }, [collabDiagnosticSnapshot, recordDiagnosticEvent]);

  useEffect(() => {
    if (workspaceFlushRevision === 0) return;
    recordDiagnosticEvent({
      category: "autosave",
      name: "autosave.workspace_changed",
      details: {
        revision: workspaceFlushRevision,
        hasPendingWorkspaceFlush,
        activePageId: activeDemoId,
      },
    });
  }, [
    activeDemoId,
    hasPendingWorkspaceFlush,
    recordDiagnosticEvent,
    workspaceFlushRevision,
  ]);

  const handleDiagnosticConsoleEntry = useCallback(
    (entry: Parameters<typeof handleConsoleEntry>[0]) => {
      handleConsoleEntry(entry);
      if (!entry.args.includes('"source":"preview-runtime"')) return;
      try {
        const payload = JSON.parse(entry.args) as Record<string, unknown>;
        recordDiagnosticEvent({
          category: "preview",
          name: "preview.runtime_event",
          details: {
            level: entry.level,
            stage: payload.stage,
            sinceStart: payload.sinceStart,
            requestId: payload.requestId,
            pageId: activeDemoIdRef.current,
          },
        });
      } catch {
        recordDiagnosticEvent({
          category: "preview",
          name: "preview.runtime_console",
          details: {
            level: entry.level,
            args: entry.args,
          },
        });
      }
    },
    [handleConsoleEntry, recordDiagnosticEvent],
  );

  const handlePreviewError = useCallback(
    (error: PreviewDiagnosticError) => {
      const pageId =
        previewMode === "canvas"
          ? (canvasEditingPageId ?? activeDemoId)
          : activeDemoId;
      const diagnostic = error.previewDiagnostic ?? {
        source: "preview_runtime" as const,
        stage: "runtime",
        pageId: pageId || undefined,
        file: pageId ? `demos/${pageId}/index.tsx` : undefined,
        message: error.message || "组件运行时发生错误",
        instruction:
          "请优先检查当前页面的 import、默认导出和渲染逻辑；图标和基础能力优先使用 @preview/sdk。",
      };
      const normalizedDiagnostic = {
        ...diagnostic,
        pageId: diagnostic.pageId || pageId || undefined,
        file:
          diagnostic.file || (pageId ? `demos/${pageId}/index.tsx` : undefined),
      };
      const repairFingerprint = pageId
        ? buildAutoPreviewRepairFingerprint({
            projectId: demoId,
            pageId,
            diagnostic: normalizedDiagnostic,
          })
        : null;
      const diagnosticFingerprint =
        repairFingerprint ||
        JSON.stringify({
          pageId: normalizedDiagnostic.pageId,
          file: normalizedDiagnostic.file,
          source: normalizedDiagnostic.source,
          stage: normalizedDiagnostic.stage,
          code: normalizedDiagnostic.code,
          message: normalizedDiagnostic.message,
        });
      const isRepeatedPreviewError =
        lastPreviewErrorFingerprintRef.current === diagnosticFingerprint;
      if (!isRepeatedPreviewError) {
        lastPreviewErrorFingerprintRef.current = diagnosticFingerprint;
      }
      recordDiagnosticEvent({
        category: "preview",
        name: isRepeatedPreviewError
          ? "preview.error_repeated"
          : "preview.error",
        level: "error",
        traceId: createDiagnosticTraceId("preview"),
        details: normalizedDiagnostic,
      });
      if (!isRepeatedPreviewError) {
        setPreviewRuntimeError(normalizedDiagnostic);
      }

      // 通知预览投影跟踪器预览渲染失败
      const failedSurface =
        previewMode === "canvas"
          ? ("canvas-preview" as const)
          : ("active-preview" as const);
      previewTrackerRef.current.failPreview(failedSurface);

      const repairCount = repairFingerprint
        ? getAutoPreviewRepairAttemptCount(
            repairFingerprint,
            autoPreviewRepairCountsRef.current,
          )
        : 0;
      if (isRepeatedPreviewError) {
        return;
      }
      // 页面级修复预算检查（跨 fingerprint）
      const pageTotalRepairs = pageId ? getPageRepairBudget(demoId, pageId) : 0;
      if (pageId && pageTotalRepairs >= PAGE_REPAIR_BUDGET_LIMIT) {
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.auto_repair_budget_exhausted",
          level: "error",
          traceId: createDiagnosticTraceId("preview"),
          details: {
            pageId,
            totalRepairs: pageTotalRepairs,
            budgetLimit: PAGE_REPAIR_BUDGET_LIMIT,
          },
        });
        return;
      }
      if (pageId && repairCount < 2) {
        const nextRepairCount = repairFingerprint
          ? recordAutoPreviewRepairAttempt(
              repairFingerprint,
              autoPreviewRepairCountsRef.current,
            )
          : repairCount + 1;
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.auto_repair_triggered",
          level: "warn",
          details: {
            pageId,
            repairCount: nextRepairCount,
            repairFingerprint,
            diagnostic: normalizedDiagnostic,
          },
        });
        setTabValue("ai");
        const isSchemaRelatedError =
          /children|schema|component|map|undefined/i.test(
            normalizedDiagnostic.message || "",
          );
        const schemaHint = isSchemaRelatedError
          ? `\n- 页面 Schema 结构约定:\n  - config.schema.json 中的 "children" 字段是子组件数组，每个元素包含 componentKey、props、children 等字段。\n  - 遍历子组件时使用 children.map(child => renderComponent(child))，不要使用 children.data。\n  - children 本身就是数组，不存在 children.data 属性。\n  - data.json 中的组件树通过 children 数组嵌套，不要用 children.data 访问子组件。`
          : "";
        const hiddenPrompt = `当前页面预览诊断失败，请自动修复一次。

页面: ${pageId}
文件: demos/${pageId}/index.tsx
触发来源: ${normalizedDiagnostic.source ?? "preview_runtime"}
阶段: ${normalizedDiagnostic.stage ?? "runtime"}
错误代码: ${normalizedDiagnostic.code ?? "unknown"}
错误: ${normalizedDiagnostic.message || "组件运行时发生错误"}
修复指引: ${normalizedDiagnostic.instruction ?? "请修复当前页面代码后确保预览可以重新编译和导入。"}

要求:
- 修复前必须先用 readFile 读取 demos/${pageId}/index.tsx 的当前完整内容，确保基于磁盘上的最新版本进行修复。
- 保持页面原有产品意图、视觉结构和配置字段不变。
- 优先使用 @preview/sdk 的受控能力，避免未登记依赖和不存在的 named import。
- 如果错误指向重复顶层声明或多个 default export，请删除重复拼接块，只保留一个完整 React 组件模块。
- 使用 writeFile 时必须输出完整的新文件内容，不要将旧内容与新内容拼接。
- 修复后不要新增无关文件。${schemaHint}`;
        setTriggerAutoSend({
          kind: "auto_repair",
          visibleTitle: "检测到预览异常，正在自动修复",
          visibleSummary: "AI 将尝试恢复当前页面预览",
          hiddenPrompt,
          debugDetail: [
            `页面: ${pageId}`,
            `文件: demos/${pageId}/index.tsx`,
            `来源: ${normalizedDiagnostic.source ?? "preview_runtime"}`,
            `阶段: ${normalizedDiagnostic.stage ?? "runtime"}`,
            `代码: ${normalizedDiagnostic.code ?? "unknown"}`,
            `错误: ${normalizedDiagnostic.message || "组件运行时发生错误"}`,
          ].join("\n"),
        });
      } else if (pageId) {
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.auto_repair_skipped",
          level: "warn",
          details: {
            pageId,
            repairCount,
            repairFingerprint,
            diagnostic: normalizedDiagnostic,
            reason: "repeated_diagnostic_fingerprint",
          },
        });
      }
    },
    [
      activeDemoId,
      canvasEditingPageId,
      createDiagnosticTraceId,
      demoId,
      previewMode,
      recordDiagnosticEvent,
    ],
  );

  useEffect(() => {
    setPreviewRuntimeError((current) => (current === null ? current : null));
  }, [activeDemoId]);

  /**
   * Unified snapshot application entry.
   * Atomically updates code, schema, editorContent, previewSize, configData, and snapshotVersion.
   */
  const applyDemoSnapshot = useCallback(
    (params: {
      code?: string;
      schema?: string;
      source:
        | "ai-realtime"
        | "ai-finish"
        | "manual-load"
        | "page-switch"
        | "collab";
      syncCollab?: boolean;
    }) => {
      const {
        code: newCode,
        schema: newSchema,
        source,
        syncCollab = true,
      } = params;
      const targetPageId = activeDemoIdRef.current;
      recordDiagnosticEvent({
        category: source === "collab" ? "collab" : "ai",
        name: "snapshot.apply",
        traceId: source.startsWith("ai-")
          ? createDiagnosticTraceId("ai-snapshot")
          : undefined,
        details: {
          source,
          pageId: targetPageId,
          hasCode: newCode !== undefined,
          codeLength: newCode?.length,
          hasSchema: newSchema !== undefined,
          schemaLength: newSchema?.length,
        },
      });

      if (newCode !== undefined) {
        if (source !== "collab" && syncCollab) {
          replaceCollabText(activeCodeCollab.ytext, newCode);
        }
        setCode((prev) => (prev === newCode ? prev : newCode));
        codeRef.current = newCode;
        if (targetPageId) {
          setPageCodes((prev) =>
            prev[targetPageId] === newCode
              ? prev
              : { ...prev, [targetPageId]: newCode },
          );
        }
        if (sessionId && targetPageId) {
          invalidateCompileCache(sessionId, targetPageId);
        }
      }

      if (newSchema !== undefined) {
        if (source !== "collab" && syncCollab) {
          replaceCollabText(activeSchemaCollab.ytext, newSchema);
        }
        const oldSchema = schemaRef.current;
        setSchema(newSchema);
        schemaRef.current = newSchema;
        if (targetPageId) {
          setPageSchemaMap((prev) => ({ ...prev, [targetPageId]: newSchema }));
        }
        const size = getPreviewSize(newSchema);
        setPreviewSize(size);
        setPagePreviewSizeMap((prev) => {
          if (!targetPageId || !size) return prev;
          return { ...prev, [targetPageId]: size };
        });

        try {
          setConfigDataMap((prev) => {
            if (!targetPageId) return prev;
            const current = prev[targetPageId] ?? {};
            const merged = mergeConfigWithUserValues(
              current,
              newSchema,
              oldSchema,
            );
            return { ...prev, [targetPageId]: merged };
          });
        } catch (e) {
          console.warn("[DemoEditPage] Failed to merge schema defaults:", e);
        }
      }

      setEditorContent((prev) => {
        const currentCode =
          newCode ?? extractCodeFromFigma(prev) ?? codeRef.current;
        const currentSchema =
          newSchema ?? extractSchemaFromFigma(prev) ?? schemaRef.current;
        return buildFigmaText(currentCode, currentSchema);
      });

      if (source === "ai-realtime" || source === "ai-finish") {
        if (schemaRegenerateTimerRef.current) {
          clearTimeout(schemaRegenerateTimerRef.current);
          schemaRegenerateTimerRef.current = null;
        }
      }

      if (source === "ai-realtime" || source === "ai-finish") {
        markWorkspaceChanged();
      }
    },
    [
      activeCodeCollab.ytext,
      activeSchemaCollab.ytext,
      createDiagnosticTraceId,
      markWorkspaceChanged,
      recordDiagnosticEvent,
      sessionId,
      activeDemoId,
    ],
  );

  const isActivePrototypeVisualPage = useCallback(() => {
    const pageId = activeDemoIdRef.current;
    return demoPages.some(
      (page) => page.id === pageId && page.runtimeType === "prototype-html-css",
    );
  }, [demoPages]);

  const persistPrototypePageDraft = useCallback(
    (
      pageId: string,
      patch: {
        html?: string;
        css?: string;
        meta?: PrototypePageMeta;
        schema?: string;
      },
    ) => {
      if (!sessionId) return;
      const currentPrototype = pagePrototypeMapRef.current[pageId] ?? {};
      void fetch(`/api/sessions/${sessionId}/files/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: patch.schema,
          prototypeHtml: patch.html ?? currentPrototype.html,
          prototypeCss: patch.css ?? currentPrototype.css,
          prototypeMeta: patch.meta ?? currentPrototype.meta,
        }),
      }).catch((error) => {
        console.warn("[prototype] 保存原型页草稿失败", error);
      });
    },
    [sessionId],
  );

  const applyPrototypeHtmlToActivePage = useCallback(
    (html: string) => {
      const pageId = activeDemoIdRef.current;
      if (!pageId) return;
      setPagePrototypeMap((prev) => ({
        ...prev,
        [pageId]: {
          ...(prev[pageId] ?? {}),
          html,
        },
      }));
      invalidatePageScreenshot(pageId);
      scheduleScreenshotRegenerate(
        pageId,
        undefined,
        configDataMapRef.current[pageId],
      );
      persistPrototypePageDraft(pageId, { html });
      markWorkspaceChanged();
    },
    [
      invalidatePageScreenshot,
      markWorkspaceChanged,
      persistPrototypePageDraft,
      scheduleScreenshotRegenerate,
    ],
  );

  const applyActivePrototypeVisualPropertyChange = useCallback(
    (
      node: VisualNodeInfo,
      property: string,
      value: string,
      kind: VisualPropertyChangeKind,
    ) => {
      const pageId = activeDemoIdRef.current;
      const currentHtml = pageId
        ? pagePrototypeMapRef.current[pageId]?.html
        : undefined;
      if (!pageId || currentHtml === undefined) return false;
      const result = applyPrototypePropertyChange(
        currentHtml,
        node,
        property,
        value,
        kind,
      );
      if (!result.ok) {
        return false;
      }
      applyPrototypeHtmlToActivePage(result.html);
      return true;
    },
    [applyPrototypeHtmlToActivePage],
  );

  const applyActivePrototypeVisualConfig = useCallback(
    (params: {
      node: VisualNodeInfo;
      target: PrototypeVisualConfigTarget;
    }): PrototypeVisualConfigResult => {
      const pageId = activeDemoIdRef.current;
      const currentHtml = pageId
        ? pagePrototypeMapRef.current[pageId]?.html
        : undefined;
      if (!pageId || currentHtml === undefined) {
        return { ok: false, error: "当前原型页内容尚未加载" };
      }
      const result = applyPrototypeVisualConfiguration({
        html: currentHtml,
        schema: schemaRef.current,
        node: params.node,
        target: params.target,
      });
      if (!result.ok) return result;
      setPagePrototypeMap((prev) => ({
        ...prev,
        [pageId]: {
          ...(prev[pageId] ?? {}),
          html: result.html,
        },
      }));
      persistPrototypePageDraft(pageId, {
        html: result.html,
        schema: result.schema,
      });
      applyDemoSnapshot({
        schema: result.schema,
        source: "manual-load",
      });
      markWorkspaceChanged();
      return result;
    },
    [applyDemoSnapshot, markWorkspaceChanged, schemaRef],
  );

  // Visual edit state hook
  const visualEditState = useVisualEditState({
    codeRef,
    schemaRef,
    projectConfigSchema,
    activeDemoIdRef,
    sessionId,
    activeDemoId,
    runtimeType: activeDemoRuntimeTypeForCollab,
    applyDemoSnapshot,
    markWorkspaceChanged,
    setConfigDataMap,
    setTabValue,
    setTriggerAutoSend,
    isPrototypeVisualPage: isActivePrototypeVisualPage,
    applyPrototypeVisualPropertyChange:
      applyActivePrototypeVisualPropertyChange,
    applyPrototypeVisualConfig: applyActivePrototypeVisualConfig,
  });
  const {
    hoveredVisualNode,
    setHoveredVisualNode,
    selectedVisualNode,
    setSelectedVisualNode,
    visualNodeStack,
    visualPanelHoverNodeId,
    setVisualPanelHoverNodeId,
    visualPropertyChanges,
    visualConfigMarks,
    visualAiInstruction,
    setVisualAiInstruction,
    visualPropertySubmission,
    visualPendingPropertyChanges,
    visualPendingConfigMarks,
    hasPendingVisualAiInstruction,
    canRetryVisualPropertySubmission,
    visualDraftAction,
    visualPropertySending,
    visualAnnotations,
    setVisualAnnotations,
    visualPatches,
    setVisualPatches,
    visualConfigMode,
    setVisualConfigMode,
    visualConfigNode,
    setVisualConfigNode,
    visualConfigCandidateId,
    setVisualConfigCandidateId,
    visualConfigTitle,
    setVisualConfigTitle,
    visualConfigFieldKey,
    setVisualConfigFieldKey,
    visualConfigDefaultValue,
    setVisualConfigDefaultValue,
    visualConfigCategory,
    setVisualConfigCategory,
    visualConfigError,
    setVisualConfigError,
    visualConfigApplying,
    setVisualConfigApplying,
    visualConfigCandidates,
    selectedVisualConfigCandidate,
    visualConfigDialogOpen,
    handleVisualConfigCandidateChange,
    handleVisualSelect,
    handleVisualPropertyChange,
    handleRestoreVisualProperty,
    handleClearVisualProperties,
    handleClearSelectedVisualProperties,
    handleMarkVisualConfig,
    handleUpdateVisualConfigMark,
    handleRemoveVisualConfigMark,
    handleSendVisualPropertiesToAI,
    confirmDiscardVisualPropertyWork,
    handleVisualPropertyAutoSendHandled,
    handleVisualPropertySubmissionStreamingChange,
    handleStartVisualConfig,
    handleApplyVisualConfig,
    handleCloseVisualConfigDialog,
    handleVisualConfigTitleChange,
    handleStartVisualAnnotation,
    handleSendVisualAnnotationsToAI,
    handleVisualInlineEdit,
    handleCreateVisualAnnotation,
  } = visualEditState;

  const [visualLayerTreeOpen, setVisualLayerTreeOpen] = useState(false);
  const [visualLayerDrawerMounted, setVisualLayerDrawerMounted] =
    useState(false);
  const [visualLayerTreeRequestKey, setVisualLayerTreeRequestKey] = useState(0);
  const [visualLayerTreeNodes, setVisualLayerTreeNodes] = useState<
    VisualNodeTreeItem[]
  >([]);
  const [hiddenVisualNodeIds, setHiddenVisualNodeIds] = useState<string[]>([]);
  const [staticPrototypeRequestKey, setStaticPrototypeRequestKey] = useState(0);
  const pendingStaticPrototypeConversionRef =
    useRef<RuntimeConversionState | null>(null);
  const propertyPanelActive =
    previewMode === "single" && visualPropertyDrawerOpen;
  const hasPendingVisualPropertyWork =
    visualPendingPropertyChanges.length > 0 ||
    visualPendingConfigMarks.length > 0 ||
    hasPendingVisualAiInstruction;

  useEffect(() => {
    if (previewMode !== "single" || !activeDemoId) return;
    const activePage = demoPages.find((page) => page.id === activeDemoId);
    if (
      activePage?.runtimeType === "prototype-html-css" ||
      activePage?.runtimeType === "sketch-scene"
    ) {
      setSinglePreviewLoaded((current) => (current ? current : true));
    }
  }, [activeDemoId, demoPages, previewMode]);

  useEffect(() => {
    if (propertyPanelActive) return;
    setVisualPanelHoverNodeId(null);
    setVisualLayerTreeOpen((current) => (current ? false : current));
  }, [propertyPanelActive, setVisualPanelHoverNodeId]);

  useEffect(() => {
    setVisualLayerTreeNodes((current) => (current.length === 0 ? current : []));
    setHiddenVisualNodeIds((current) => (current.length === 0 ? current : []));
    setVisualLayerTreeOpen((current) => (current ? false : current));
  }, [activeDemoId]);

  const handleToggleVisualNodeHidden = useCallback((node: VisualNodeInfo) => {
    const nodeId = node.domPath || node.nodeId;
    if (!nodeId) return;
    setHiddenVisualNodeIds((current) =>
      current.includes(nodeId)
        ? current.filter((id) => id !== nodeId)
        : [...current, nodeId],
    );
  }, []);

  useEffect(() => {
    if (!hasPendingVisualPropertyWork) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasPendingVisualPropertyWork]);

  const handleAiStreamingChange = useCallback(
    (isStreaming: boolean) => {
      recordDiagnosticEvent({
        category: "ai",
        name: isStreaming ? "ai.stream_started" : "ai.stream_finished",
        details: {
          agentSessionId,
          activePageId: activeDemoIdRef.current,
        },
      });
      setAiIsStreaming((current) =>
        current === isStreaming ? current : isStreaming,
      );
      handleVisualPropertySubmissionStreamingChange(isStreaming);
    },
    [
      agentSessionId,
      handleVisualPropertySubmissionStreamingChange,
      recordDiagnosticEvent,
    ],
  );

  useEffect(() => {
    if (!aiIsStreaming) return;

    const timer = window.setTimeout(async () => {
      const resetStreamingState = (reason: string, agentStatus?: string) => {
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.streaming_stale_state_reset",
          level: "warn",
          details: {
            reason,
            agentSessionId,
            agentStatus,
            activePageId: activeDemoIdRef.current,
          },
        });
        setAiIsStreaming(false);
        setAiStreamContent("");
        setAiCurrentMessage({
          role: "assistant",
          content: "",
          parts: [],
        });
        handleVisualPropertySubmissionStreamingChange(false);
      };

      if (!agentSessionId) {
        resetStreamingState("missing_agent_session");
        return;
      }

      try {
        const response = await getAgentClient().getSession(agentSessionId);
        if (!response.success) {
          resetStreamingState("agent_session_unavailable");
          return;
        }

        const agentStatus = response.data.status;
        if (agentStatus !== "processing" && agentStatus !== "initializing") {
          resetStreamingState("agent_not_processing", agentStatus);
        }
      } catch (error) {
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.streaming_stale_state_probe_failed",
          level: "warn",
          details: {
            agentSessionId,
            message:
              error instanceof Error ? error.message : "检查 Agent 状态失败",
          },
        });
      }
    }, 30_000);

    return () => window.clearTimeout(timer);
  }, [
    agentSessionId,
    aiIsStreaming,
    handleVisualPropertySubmissionStreamingChange,
    recordDiagnosticEvent,
  ]);

  // Version control hook
  const versionControl = useVersionControl({
    demoId,
    sessionId,
    workspaceId,
    activeDemoId,
    activeDemoIdRef,
    currentUsername,
    code,
    schema,
    validationResult,
    demoPages,
    hasUnsavedChanges,
    hasUnsavedCanvasChanges,
    isSaving,
    applyDemoSnapshot,
    flushCanvasState,
    markCanvasChangesSaved,
    setActiveDemoId,
    setDemoPages,
    setDemoFolders,
    setProjectConfigSchema,
    setPageCodes,
    setHasUnsavedChanges,
    setIsSaving,
    beforePublish: async () => {
      if (Object.keys(projectConfigValuesRef.current).length === 0) {
        return;
      }
      const saved = await persistProjectConfigValues(
        projectConfigValuesRef.current,
      );
      if (!saved) {
        throw new Error("共享配置保存失败，请重试后再发布");
      }
    },
  });
  const {
    publishStatus,
    setPublishStatus,
    publishing,
    versionHistory,
    pageVersionHistories,
    restoring,
    previewVersion,
    setPreviewVersion,
    publishedVersion,
    loadVersionHistory,
    loadPageVersionHistories,
    handlePublish,
    handlePreviewPageVersion,
    handleRestorePageVersion,
    handleRestoreProjectVersion,
    hasPendingChanges,
    hasPublishableChanges,
    publishButtonDisabled,
    publishButtonText,
    publishingButtonText,
    handleCreateVersion,
  } = versionControl;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (activeCodeCollab.status !== "synced") return;
    if (activeCodeCollab.value === codeRef.current) return;
    if (activeCodeCollab.value === "" && codeRef.current.trim()) {
      replaceCollabText(activeCodeCollab.ytext, codeRef.current);
      return;
    }
    applyDemoSnapshot({
      code: activeCodeCollab.value,
      source: "collab",
    });
  }, [
    activeCodeCollab.status,
    activeCodeCollab.value,
    activeCodeCollab.ytext,
    applyDemoSnapshot,
  ]);

  useEffect(() => {
    if (activeSchemaCollab.status !== "synced") return;
    if (activeSchemaCollab.value === schemaRef.current) return;
    const currentPageId = activeDemoIdRef.current;
    const knownPageSchema = currentPageId
      ? pageSchemaMapRef.current[currentPageId]
      : undefined;
    if (
      activeSchemaCollab.value === "" &&
      knownPageSchema &&
      !isSchemaEmpty(knownPageSchema)
    ) {
      replaceCollabText(activeSchemaCollab.ytext, knownPageSchema);
      return;
    }
    applyDemoSnapshot({
      schema: activeSchemaCollab.value,
      source: "collab",
    });
  }, [
    activeSchemaCollab.status,
    activeSchemaCollab.value,
    activeSchemaCollab.ytext,
    applyDemoSnapshot,
  ]);

  useEffect(() => {
    if (activePrototypeHtmlCollab.status !== "synced") return;
    const currentPageId = activeDemoIdRef.current;
    if (!currentPageId) return;
    const currentHtml = pagePrototypeMapRef.current[currentPageId]?.html ?? "";
    if (activePrototypeHtmlCollab.value === currentHtml) return;
    if (activePrototypeHtmlCollab.value === "" && currentHtml.trim()) {
      replaceCollabText(activePrototypeHtmlCollab.ytext, currentHtml);
      return;
    }
    pagePrototypeMapRef.current = {
      ...pagePrototypeMapRef.current,
      [currentPageId]: {
        ...(pagePrototypeMapRef.current[currentPageId] ?? {}),
        html: activePrototypeHtmlCollab.value,
      },
    };
    setPagePrototypeMap((current) => ({
      ...current,
      [currentPageId]: {
        ...(current[currentPageId] ?? {}),
        html: activePrototypeHtmlCollab.value,
      },
    }));
    invalidatePageScreenshot(currentPageId);
  }, [
    activePrototypeHtmlCollab.status,
    activePrototypeHtmlCollab.value,
    activePrototypeHtmlCollab.ytext,
    invalidatePageScreenshot,
  ]);

  useEffect(() => {
    if (activePrototypeCssCollab.status !== "synced") return;
    const currentPageId = activeDemoIdRef.current;
    if (!currentPageId) return;
    const currentCss = pagePrototypeMapRef.current[currentPageId]?.css ?? "";
    if (activePrototypeCssCollab.value === currentCss) return;
    if (activePrototypeCssCollab.value === "" && currentCss.trim()) {
      replaceCollabText(activePrototypeCssCollab.ytext, currentCss);
      return;
    }
    pagePrototypeMapRef.current = {
      ...pagePrototypeMapRef.current,
      [currentPageId]: {
        ...(pagePrototypeMapRef.current[currentPageId] ?? {}),
        css: activePrototypeCssCollab.value,
      },
    };
    setPagePrototypeMap((current) => ({
      ...current,
      [currentPageId]: {
        ...(current[currentPageId] ?? {}),
        css: activePrototypeCssCollab.value,
      },
    }));
    invalidatePageScreenshot(currentPageId);
  }, [
    activePrototypeCssCollab.status,
    activePrototypeCssCollab.value,
    activePrototypeCssCollab.ytext,
    invalidatePageScreenshot,
  ]);

  useEffect(() => {
    if (activeSketchSceneCollab.status !== "synced") return;
    const currentPageId = activeDemoIdRef.current;
    if (!currentPageId) return;

    const currentSceneText =
      pageSketchMapRef.current[currentPageId]?.scene ?? "";
    if (activeSketchSceneCollab.value === currentSceneText) return;
    if (activeSketchSceneCollab.value === "" && currentSceneText.trim()) {
      replaceCollabText(activeSketchSceneCollab.ytext, currentSceneText);
      return;
    }

    const remoteScene = parseSketchSceneDocument(activeSketchSceneCollab.value);
    if (!remoteScene) return;

    pageSketchMapRef.current = {
      ...pageSketchMapRef.current,
      [currentPageId]: {
        ...(pageSketchMapRef.current[currentPageId] ?? {}),
        scene: activeSketchSceneCollab.value,
      },
    };
    setPageSketchMap((prev) => ({
      ...prev,
      [currentPageId]: {
        ...(prev[currentPageId] ?? {}),
        scene: activeSketchSceneCollab.value,
      },
    }));
    invalidatePageScreenshot(currentPageId);
    scheduleScreenshotRegenerate(
      currentPageId,
      undefined,
      configDataMapRef.current[currentPageId],
    );
  }, [
    activeSketchSceneCollab.status,
    activeSketchSceneCollab.value,
    activeSketchSceneCollab.ytext,
    invalidatePageScreenshot,
    scheduleScreenshotRegenerate,
  ]);

  useEffect(() => {
    if (projectSchemaCollab.status !== "synced") return;
    if (projectSchemaCollab.value === projectConfigSchema) return;
    if (
      projectSchemaCollab.value === "" &&
      projectConfigSchemaRef.current &&
      !isSchemaEmpty(projectConfigSchemaRef.current)
    ) {
      replaceCollabText(
        projectSchemaCollab.ytext,
        projectConfigSchemaRef.current,
      );
      return;
    }
    setProjectConfigSchema((current) =>
      current === projectSchemaCollab.value
        ? current
        : projectSchemaCollab.value,
    );
  }, [
    projectConfigSchema,
    projectSchemaCollab.status,
    projectSchemaCollab.value,
    projectSchemaCollab.ytext,
  ]);

  const syncWorkspaceFileToCollab = useCallback(
    async (
      resourcePath: string,
      ytext: {
        toString: () => string;
        delete: (index: number, length: number) => void;
        insert: (index: number, text: string) => void;
      } | null,
    ) => {
      if (!sessionId || !ytext) return;
      const response = await fetch(
        `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(resourcePath)}`,
      );
      const result = await response.json();
      if (
        !response.ok ||
        !result.success ||
        typeof result.data?.content !== "string"
      ) {
        throw new Error(result.error?.message || "刷新协同资源失败");
      }
      replaceCollabText(ytext, result.data.content);
    },
    [sessionId],
  );

  const handleWorkspaceTreeChanged = useCallback(() => {
    markWorkspaceChanged();
    void syncWorkspaceFileToCollab(
      "workspace-tree.json",
      workspaceTreeCollab.ytext,
    ).catch((error) => {
      console.warn("[collab] 刷新页面树协同文档失败", error);
    });
  }, [
    markWorkspaceChanged,
    syncWorkspaceFileToCollab,
    workspaceTreeCollab.ytext,
  ]);

  useEffect(() => {
    if (
      workspaceTreeCollab.status !== "synced" ||
      !workspaceTreeCollab.value.trim()
    )
      return;
    let parsed: WorkspaceTree;
    try {
      parsed = JSON.parse(workspaceTreeCollab.value) as WorkspaceTree;
    } catch {
      return;
    }
    if (!Array.isArray(parsed.pages) || !Array.isArray(parsed.folders)) return;

    const normalizePages = (
      pages: Array<
        Pick<
          DemoPage,
          "id" | "name" | "routeKey" | "runtimeType" | "order" | "parentId"
        >
      >,
    ) =>
      pages
        .map(({ id, name, routeKey, runtimeType, order, parentId }) => ({
          id,
          name,
          routeKey: routeKey ?? null,
          runtimeType: runtimeType ?? null,
          order,
          parentId: parentId ?? null,
        }))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const normalizeFolders = (folders: DemoFolderMeta[]) =>
      folders
        .map(({ id, name, order, parentId }) => ({
          id,
          name,
          order,
          parentId: parentId ?? null,
        }))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

    const current = JSON.stringify({
      pages: normalizePages(demoPages),
      folders: normalizeFolders(demoFolders),
    });
    const incoming = JSON.stringify({
      pages: normalizePages(parsed.pages),
      folders: normalizeFolders(parsed.folders),
    });
    if (current === incoming) return;

    setDemoPages(
      parsed.pages
        .map((page) => ({
          ...page,
          previewSize: pagePreviewSizeMap[page.id],
        }))
        .sort((a, b) => a.order - b.order),
    );
    setDemoFolders([...parsed.folders].sort((a, b) => a.order - b.order));
  }, [
    demoFolders,
    demoPages,
    pagePreviewSizeMap,
    workspaceTreeCollab.status,
    workspaceTreeCollab.value,
  ]);

  useEffect(() => {
    if (canvasLayoutCollab.status !== "synced") return;
    if (canvasLayoutCollab.value === lastAppliedCanvasCollabValueRef.current) {
      return;
    }
    lastAppliedCanvasCollabValueRef.current = canvasLayoutCollab.value;
    const remoteState = parseCanvasLayoutState(canvasLayoutCollab.value);
    if (!remoteState) return;
    if (
      JSON.stringify(remoteState) === JSON.stringify(canvasStateRef.current)
    ) {
      return;
    }
    suppressNextCanvasCollabPushRef.current = true;
    applyRemoteCanvasState(remoteState);
  }, [
    applyRemoteCanvasState,
    canvasLayoutCollab.status,
    canvasLayoutCollab.value,
  ]);

  useEffect(() => {
    if (canvasLayoutCollab.status !== "synced" || !hasUnsavedCanvasChanges)
      return;
    if (suppressNextCanvasCollabPushRef.current) {
      suppressNextCanvasCollabPushRef.current = false;
      return;
    }
    replaceCollabText(
      canvasLayoutCollab.ytext,
      serializeCanvasLayout(demoId, canvasState),
    );
  }, [
    canvasLayoutCollab.status,
    canvasLayoutCollab.ytext,
    canvasState,
    demoId,
    hasUnsavedCanvasChanges,
  ]);

  useEffect(() => {
    const hasErrors =
      !validationResult.isValid && validationResult.errors.length > 0;
    setErrorBannerVisible((current) =>
      current === hasErrors ? current : hasErrors,
    );
  }, [validationResult]);

  const handleSendErrorToAI = useCallback(
    (context: { summary: string; details: string }) => {
      const demoId = activeDemoIdRef.current;
      const aiPrompt = `【问题摘要】
${context.summary}

【技术详情】
${context.details}

【相关文件】
- demos/${demoId}/index.tsx — 页面 React 组件代码
- demos/${demoId}/config.schema.json — 页面配置 Schema

请使用 read 工具读取上述文件，分析并修复问题，保持组件原有功能不变。`;

      setTabValue("ai");
      setTriggerAutoSend(aiPrompt);
    },
    [],
  );

  const handleManualCheck = useCallback(() => {
    setIsChecking(true);
    try {
      const result = validateAll(code, schema);
      setValidationResult(result);
    } finally {
      setIsChecking(false);
    }
  }, [code, schema]);

  const handleNameClick = () => {
    setNameDraft(demoName);
    setIsEditingName(true);
  };

  const handleNameSave = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setIsEditingName(false);
      return;
    }
    if (trimmed === demoName) {
      setIsEditingName(false);
      return;
    }

    const res = await fetch(`/api/demos/${demoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (res.ok) {
      setDemoName(trimmed);
      toast({ title: "名称已更新" });
    } else {
      toast({
        title: "更新失败",
        description: "项目名称更新失败",
        variant: "destructive",
      });
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSave();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
    }
  };

  useEffect(() => {
    const loadDemo = async () => {
      try {
        setIsLoading(true);

        // 并行获取项目名称
        const demosRes = await fetch("/api/demos");
        const demosData = await demosRes.json();
        if (demosData.success) {
          const demo = demosData.data.find(
            (d: {
              id: string;
              name: string;
              thumbnail?: string;
              authoringPreferences?: ProjectAuthoringPreferences;
            }) => d.id === demoId,
          );
          if (demo) {
            setDemoName(demo.name);
            setCurrentThumbnail(demo.thumbnail);
            setProjectAuthoringPreferences(demo.authoringPreferences);
          }
        }

        const userAuthoringPreferencesRes = await fetch(
          "/api/user/authoring-preferences",
        );
        if (userAuthoringPreferencesRes.ok) {
          const userAuthoringPreferencesData =
            await userAuthoringPreferencesRes.json();
          if (userAuthoringPreferencesData.success) {
            setUserAuthoringPreferences(
              userAuthoringPreferencesData.data?.preferences,
            );
          }
        }

        const sessionRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demoId }),
        });

        if (!sessionRes.ok) {
          throw new Error("创建 Session 失败");
        }

        const sessionData = await sessionRes.json();

        if (!sessionData.success) {
          throw new Error(sessionData.error?.message || "创建 Session 失败");
        }

        setSessionId(sessionData.data.sessionId);

        setWorkspaceId(sessionData.data.workspaceId || "");
        setWorkspacePath(
          sessionData.data.workspacePath ||
            sessionData.data.tempWorkspace ||
            "",
        );

        const filesRes = await fetch(
          `/api/sessions/${sessionData.data.sessionId}/files`,
        );
        if (!filesRes.ok) {
          throw new Error("加载文件失败");
        }

        const filesData = await filesRes.json();
        if (!filesData.success) {
          throw new Error(filesData.error?.message || "加载文件失败");
        }

        // 多页面格式适配
        const multi = filesData.data;
        const rawPages = multi.demoPages || [];
        const pagesWithSize = rawPages.map(
          (page: {
            id: string;
            name: string;
            runtimeType?: DemoPageRuntimeType;
            order: number;
            parentId: string | null;
          }) => ({
            ...page,
            previewSize: multi.demos?.[page.id]?.schema
              ? getPreviewSize(multi.demos[page.id].schema)
              : undefined,
          }),
        );
        setDemoPages(pagesWithSize);
        setDemoFolders(multi.demoFolders || []);
        setProjectConfigSchema(multi.projectConfigSchema);
        projectConfigSchemaRef.current = multi.projectConfigSchema;

        // 记录每个页面的 previewSize
        const previewSizeMap: Record<
          string,
          import("@workbench/demo-ui").PreviewSize
        > = {};
        for (const page of pagesWithSize) {
          if (page.previewSize) {
            previewSizeMap[page.id] = page.previewSize;
          }
        }
        setPagePreviewSizeMap(previewSizeMap);

        let loadedCode = "";
        let loadedSchema = "";
        let initialDemoId = "";

        if (multi.demos && Object.keys(multi.demos).length > 0) {
          const sortedPageIds = rawPages.map((p: { id: string }) => p.id);
          const demoIds = Object.keys(multi.demos);
          const targetDemoId =
            sortedPageIds.length > 0
              ? sortedPageIds.includes(demoId as string)
                ? (demoId as string)
                : sortedPageIds[0]
              : demoIds.includes(demoId as string)
                ? (demoId as string)
                : demoIds[0];
          const currentDemo = multi.demos[targetDemoId];
          loadedCode = currentDemo.code;
          loadedSchema = currentDemo.schema;
          initialDemoId = targetDemoId;
          setActiveDemoId(targetDemoId);
        } else if (multi.code !== undefined && multi.schema !== undefined) {
          // 旧格式兼容
          loadedCode = multi.code;
          loadedSchema = multi.schema;
        }

        setCode(loadedCode);
        setSchema(loadedSchema);
        setEditorContent(buildFigmaText(loadedCode, loadedSchema));

        const allDefaults: Record<string, Record<string, unknown>> = {};
        const codes: Record<string, string> = {};
        const prototypes: Record<
          string,
          {
            html?: string;
            css?: string;
            meta?: PrototypePageMeta;
          }
        > = {};
        const sketches: Record<
          string,
          {
            scene?: string;
            meta?: Record<string, unknown>;
          }
        > = {};
        const schemas: Record<string, string> = {};
        const loadedProjectConfigValues = multi.projectConfigValues ?? {};
        setProjectConfigValues(loadedProjectConfigValues);
        if (multi.demos) {
          for (const [pageId, demo] of Object.entries(multi.demos) as [
            string,
            {
              code: string;
              schema: string;
              prototypeHtml?: string;
              prototypeCss?: string;
              prototypeMeta?: PrototypePageMeta;
              sketchScene?: string;
              sketchMeta?: Record<string, unknown>;
            },
          ][]) {
            allDefaults[pageId] = getSafeMergedDefaults(
              demo.schema,
              multi.projectConfigSchema,
            );
            allDefaults[pageId] = {
              ...allDefaults[pageId],
              ...loadedProjectConfigValues,
            };
            schemas[pageId] = demo.schema;
            codes[pageId] = demo.code;
            if (
              demo.prototypeHtml !== undefined ||
              demo.prototypeCss !== undefined
            ) {
              prototypes[pageId] = {
                html: demo.prototypeHtml,
                css: demo.prototypeCss,
                meta: demo.prototypeMeta,
              };
            }
            if (
              demo.sketchScene !== undefined ||
              demo.sketchMeta !== undefined
            ) {
              sketches[pageId] = {
                scene: demo.sketchScene,
                meta: demo.sketchMeta,
              };
            }
          }
        } else if (initialDemoId) {
          allDefaults[initialDemoId] = getSafeMergedDefaults(
            loadedSchema,
            multi.projectConfigSchema,
          );
          allDefaults[initialDemoId] = {
            ...allDefaults[initialDemoId],
            ...loadedProjectConfigValues,
          };
          schemas[initialDemoId] = loadedSchema;
        }
        setConfigDataMap(allDefaults);
        setPageCodes(codes);
        setPagePrototypeMap(prototypes);
        setPageSketchMap(sketches);
        setPageSchemaMap((prev) => mergeLoadedPageSchemas(prev, schemas));

        const size = getPreviewSize(loadedSchema);
        setPreviewSize(size);

        // 初始化 Agent 会话
        setAgentSessionId(sessionData.data.sessionId);
      } catch (error) {
        toastRef.current({
          title: "加载失败",
          description: error instanceof Error ? error.message : "未知错误",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadDemo();
  }, [demoId]);

  useEffect(() => {
    const pageId = activeDemoIdRef.current;
    if (pageId && code) {
      setPageCodes((prev) => {
        if (prev[pageId] === code) return prev;
        return { ...prev, [pageId]: code };
      });
    }
  }, [code]);

  // 组件卸载时清理 Schema 自动重新生成定时器
  useEffect(() => {
    return () => {
      if (schemaRegenerateTimerRef.current) {
        clearTimeout(schemaRegenerateTimerRef.current);
      }
    };
  }, []);

  const handleEditorChange = useCallback((value: string) => {
    setEditorContent(value);

    const parsed = parseFigmaText(value);

    if (!parsed.success) {
      setValidationResult({
        isValid: false,
        errors: [
          {
            type: "json_syntax",
            message: parsed.error || "解析错误",
            severity: "error",
            location: { type: "schema" },
            fixSuggestion: {
              action: "fix_json",
              description: "检查代码格式是否正确，确保 Figma 标记语法完整",
            },
          },
        ],
      });
      return;
    }

    setCode(parsed.code);
    setSchema(parsed.schema);

    const currentPageId = activeDemoIdRef.current;
    invalidatePageScreenshot(currentPageId);
    const defaults = getSafeMergedDefaults(parsed.schema);
    setConfigDataMap((prev) => ({
      ...prev,
      [currentPageId]: {
        ...defaults,
        ...(prev[currentPageId] ?? {}),
      },
    }));

    const size = getPreviewSize(parsed.schema);
    setPreviewSize(size);
    setPageSchemaMap((prev) => ({
      ...prev,
      [currentPageId]: parsed.schema,
    }));

    const nextConfig = {
      ...defaults,
      ...(configDataMapRef.current[currentPageId] ?? {}),
    };
    // 代码变更后立即失效旧截图，并 debounce 3s 触发截图再生
    scheduleScreenshotRegenerate(currentPageId, parsed.code, nextConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfigChange = useCallback((data: Record<string, unknown>) => {
    const currentPageId = activeDemoIdRef.current;
    invalidatePageScreenshot(currentPageId);
    setConfigDataMap((prev) => {
      const nextPageConfig = {
        ...(prev[currentPageId] ?? {}),
        ...data,
      };
      const next = {
        ...prev,
        [currentPageId]: nextPageConfig,
      };
      // 配置变更后立即失效旧截图，并 debounce 3s 触发截图再生
      const currentCode = codeRef.current;
      const currentPage = demoPages.find((page) => page.id === currentPageId);
      if (currentCode || currentPage?.runtimeType === "prototype-html-css") {
        scheduleScreenshotRegenerate(
          currentPageId,
          currentCode || undefined,
          nextPageConfig,
        );
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePageConfigPanelChange = useCallback(
    (pageId: string, data: Record<string, unknown>) => {
      invalidatePageScreenshot(pageId);
      setConfigDataMap((prev) => {
        const nextPageConfig = {
          ...(prev[pageId] ?? {}),
          ...data,
        };
        const next = {
          ...prev,
          [pageId]: nextPageConfig,
        };
        const currentCode = resolvePreviewPageCode({
          pageId,
          pageCodes,
          activeCodePageId:
            pageCodes[activeDemoIdRef.current] === codeRef.current
              ? activeDemoIdRef.current
              : undefined,
          activeCode: codeRef.current,
        });
        const page = demoPages.find((item) => item.id === pageId);
        if (currentCode || page?.runtimeType === "prototype-html-css") {
          scheduleScreenshotRegenerate(
            pageId,
            currentCode || undefined,
            nextPageConfig,
          );
        }
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demoPages, pageCodes],
  );

  const handleProjectConfigPanelChange = useCallback(
    (data: Record<string, unknown>) => {
      const nextProjectConfigValues = {
        ...projectConfigValuesRef.current,
        ...data,
      };
      setProjectConfigValues(nextProjectConfigValues);
      void persistProjectConfigValues(nextProjectConfigValues);
      const affectedPageIds = demoPages.map((page) => page.id);
      invalidatePageScreenshots(affectedPageIds);
      setConfigDataMap((prev) => {
        const next = { ...prev };
        for (const pageId of Object.keys(next)) {
          next[pageId] = { ...next[pageId], ...data };
        }
        for (const page of demoPages) {
          if (!next[page.id]) {
            next[page.id] = { ...data };
          }
        }
        for (const page of demoPages) {
          const pageCode = resolvePreviewPageCode({
            pageId: page.id,
            pageCodes,
            activeCodePageId:
              pageCodes[activeDemoId] === code ? activeDemoId : undefined,
            activeCode: code,
          });
          if (!pageCode && page.runtimeType !== "prototype-html-css") continue;
          scheduleScreenshotRegenerate(
            page.id,
            pageCode || undefined,
            next[page.id],
          );
        }
        return next;
      });
    },
    [
      code,
      demoPages,
      invalidatePageScreenshots,
      pageCodes,
      persistProjectConfigValues,
      scheduleScreenshotRegenerate,
    ],
  );

  const handleSchemaChange = useCallback(
    (newSchema: string) => {
      replaceCollabText(activeSchemaCollab.ytext, newSchema);
      setSchema(newSchema);
      const currentPageId = activeDemoIdRef.current;
      if (currentPageId) {
        setPageSchemaMap((prev) => ({ ...prev, [currentPageId]: newSchema }));
      }
      setEditorContent((prev) => {
        const currentCode = extractCodeFromFigma(prev) || code;
        return buildFigmaText(currentCode, newSchema);
      });
    },
    [activeSchemaCollab.ytext, code],
  );

  const handlePageSchemaChange = useCallback(
    (pageId: string, nextSchema: string) => {
      setPageSchemaMap((prev) => ({ ...prev, [pageId]: nextSchema }));
      if (pageId === activeDemoIdRef.current) {
        handleSchemaChange(nextSchema);
      }
    },
    [handleSchemaChange],
  );

  // 安全合并项目级 + 页面级 Schema 默认值
  const getSafeMergedDefaults = useCallback(
    (pageSchema: string, projectSchemaOverride?: string) => {
      try {
        return mergeConfigToProps(
          projectSchemaOverride ?? projectConfigSchemaRef.current,
          pageSchema,
        );
      } catch (err) {
        if (err instanceof SchemaConflictError) {
          toast({
            title: "Schema 冲突",
            description: err.message,
            variant: "destructive",
          });
        }
        return getDefaultValues(pageSchema);
      }
    },
    [toast],
  );

  const handleProjectSchemaChange = useCallback(
    (newSchema: string) => {
      const previousProjectSchema = projectConfigSchemaRef.current;
      replaceCollabText(projectSchemaCollab.ytext, newSchema);
      setProjectConfigSchema(newSchema);
      projectConfigSchemaRef.current = newSchema;

      const affectedPageIds = demoPages.map((page) => page.id);
      invalidatePageScreenshots(affectedPageIds);
      setConfigDataMap((prev) => {
        const next = { ...prev };
        for (const page of demoPages) {
          const pageSchema =
            pageSchemaMapRef.current[page.id] ??
            (page.id === activeDemoIdRef.current ? schemaRef.current : "");
          const nextDefaults = getSafeMergedDefaults(pageSchema, newSchema);
          const previousDefaults = getSafeMergedDefaults(
            pageSchema,
            previousProjectSchema,
          );
          next[page.id] = mergeDefaultsPreservingUserValues(
            prev[page.id] ?? {},
            nextDefaults,
            previousDefaults,
          );
        }

        for (const page of demoPages) {
          const pageCode = resolvePreviewPageCode({
            pageId: page.id,
            pageCodes,
            activeCodePageId:
              pageCodes[activeDemoIdRef.current] === codeRef.current
                ? activeDemoIdRef.current
                : undefined,
            activeCode: codeRef.current,
          });
          if (!pageCode && page.runtimeType !== "prototype-html-css") continue;
          scheduleScreenshotRegenerate(
            page.id,
            pageCode || undefined,
            next[page.id],
          );
        }

        return next;
      });

      markWorkspaceChanged();
    },
    [
      demoPages,
      getSafeMergedDefaults,
      invalidatePageScreenshots,
      markWorkspaceChanged,
      pageCodes,
      projectSchemaCollab.ytext,
      scheduleScreenshotRegenerate,
    ],
  );

  const updatePageSchemaMapFromLoad = useCallback(
    (pageId: string, loadedSchema: string) => {
      setPageSchemaMap((prev) =>
        mergeLoadedPageSchemas(prev, { [pageId]: loadedSchema }),
      );
    },
    [],
  );

  const rememberActivePageSchema = useCallback(() => {
    const currentPageId = activeDemoIdRef.current;
    const currentSchema = schemaRef.current;
    if (!currentPageId || !currentSchema || isSchemaEmpty(currentSchema))
      return;
    setPageSchemaMap((prev) =>
      mergeLoadedPageSchemas(prev, { [currentPageId]: currentSchema }),
    );
  }, []);

  const canvasMissingPageIdsKey = useMemo(() => {
    if (previewMode !== "canvas" || !sessionId || demoPages.length === 0) {
      return "";
    }
    return demoPages
      .map((page) => page.id)
      .filter((pageId) => pageCodes[pageId] === undefined)
      .join("\0");
  }, [demoPages, pageCodes, previewMode, sessionId]);

  useEffect(() => {
    if (!sessionId || !canvasMissingPageIdsKey) return;

    const missingPageIds = canvasMissingPageIdsKey.split("\0");
    if (missingPageIds.length === 0) return;

    let cancelled = false;

    const loadMissingPageCodes = async () => {
      try {
        const loadedPages = await Promise.all(
          missingPageIds.map(async (pageId) => {
            const res = await fetch(
              `/api/sessions/${sessionId}/files/${pageId}`,
            );
            const data = await res.json();
            if (!data.success) return null;
            return {
              pageId,
              code: data.data.code ?? "",
              schema: data.data.schema ?? "",
              prototypeHtml: data.data.prototypeHtml as string | undefined,
              prototypeCss: data.data.prototypeCss as string | undefined,
              prototypeMeta: data.data.prototypeMeta as
                | PrototypePageMeta
                | undefined,
              sketchScene: data.data.sketchScene as string | undefined,
              sketchMeta: data.data.sketchMeta as
                | Record<string, unknown>
                | undefined,
            };
          }),
        );
        if (cancelled) return;

        const nextCodes: Record<string, string> = {};
        const nextPrototypes: Record<
          string,
          {
            html?: string;
            css?: string;
            meta?: PrototypePageMeta;
          }
        > = {};
        const nextSketches: Record<
          string,
          {
            scene?: string;
            meta?: Record<string, unknown>;
          }
        > = {};
        const nextSchemas: Record<string, string> = {};
        const nextDefaults: Record<string, Record<string, unknown>> = {};
        const nextPreviewSizes: Record<
          string,
          import("@workbench/demo-ui").PreviewSize
        > = {};

        for (const page of loadedPages) {
          if (!page) continue;
          nextCodes[page.pageId] = page.code;
          nextSchemas[page.pageId] = page.schema;
          if (
            page.prototypeHtml !== undefined ||
            page.prototypeCss !== undefined
          ) {
            nextPrototypes[page.pageId] = {
              html: page.prototypeHtml,
              css: page.prototypeCss,
              meta: page.prototypeMeta,
            };
          }
          if (page.sketchScene !== undefined || page.sketchMeta !== undefined) {
            nextSketches[page.pageId] = {
              scene: page.sketchScene,
              meta: page.sketchMeta,
            };
          }
          nextDefaults[page.pageId] = getSafeMergedDefaults(page.schema);
          const size = getPreviewSize(page.schema);
          if (size) {
            nextPreviewSizes[page.pageId] = size;
          }
        }

        if (Object.keys(nextCodes).length === 0) return;

        setPageCodes((prev) => ({ ...prev, ...nextCodes }));
        setPagePrototypeMap((prev) => ({ ...prev, ...nextPrototypes }));
        setPageSketchMap((prev) => ({ ...prev, ...nextSketches }));
        setPageSchemaMap((prev) => mergeLoadedPageSchemas(prev, nextSchemas));
        setConfigDataMap((prev) => {
          const next = { ...prev };
          for (const [pageId, defaults] of Object.entries(nextDefaults)) {
            if (!next[pageId]) {
              next[pageId] = defaults;
            }
          }
          return next;
        });
        setPagePreviewSizeMap((prev) => ({ ...prev, ...nextPreviewSizes }));
      } catch (err) {
        console.error("加载画布页面代码失败:", err);
      }
    };

    void loadMissingPageCodes();

    return () => {
      cancelled = true;
    };
  }, [canvasMissingPageIdsKey, getSafeMergedDefaults, sessionId]);

  const handleConfigPanelPageSelect = useCallback(
    async (pageId: string) => {
      rememberActivePageSchema();
      setSinglePreviewTarget({ kind: "page", pageId });
      setActiveDemoId(pageId);
      activeDemoIdRef.current = pageId;
      if (pagePreviewSizeMap[pageId]) {
        setPreviewSize(pagePreviewSizeMap[pageId]);
      }
      if (previewMode === "canvas") {
        setConfigPanelOverviewRequested(false);
        focusCanvasPage(pageId);
        setCanvasEditingPageId(pageId);
      }
      if (!sessionId) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/files/${pageId}`);
        const data = await res.json();
        if (data.success) {
          const prototypeMeta = data.data.prototypeMeta as
            | PrototypePageMeta
            | undefined;
          setPageCodes((prev) => ({
            ...prev,
            [pageId]: data.data.code,
          }));
          if (
            data.data.prototypeHtml !== undefined ||
            data.data.prototypeCss !== undefined
          ) {
            setPagePrototypeMap((prev) => ({
              ...prev,
              [pageId]: {
                html: data.data.prototypeHtml,
                css: data.data.prototypeCss,
                meta: prototypeMeta,
              },
            }));
          }
          setCode(data.data.code);
          setSchema(data.data.schema);
          updatePageSchemaMapFromLoad(pageId, data.data.schema);
          setEditorContent(buildFigmaText(data.data.code, data.data.schema));
          setConfigDataMap((prev) => {
            if (prev[pageId]) return prev;
            const defaults = getSafeMergedDefaults(data.data.schema);
            return { ...prev, [pageId]: defaults };
          });
          const size =
            getPreviewSize(data.data.schema) ??
            getPrototypePreviewSize(prototypeMeta);
          if (size) {
            setPagePreviewSizeMap((prev) => ({
              ...prev,
              [pageId]: size,
            }));
          }
          setPreviewSize(size);
        }
      } catch (err) {
        console.error("加载页面失败:", err);
      }
    },
    [
      focusCanvasPage,
      getSafeMergedDefaults,
      pagePreviewSizeMap,
      previewMode,
      rememberActivePageSchema,
      sessionId,
      setCanvasEditingPageId,
      updatePageSchemaMapFromLoad,
    ],
  );
  const handleConfigPanelPageSelectRef = useRef(handleConfigPanelPageSelect);
  handleConfigPanelPageSelectRef.current = handleConfigPanelPageSelect;
  const fallbackPageId = useMemo(() => {
    if (demoPages.length === 0) return "";
    return [...demoPages].sort((a, b) => a.order - b.order)[0]?.id ?? "";
  }, [demoPages]);

  const clearPageLocalCaches = useCallback(
    (pageIds: string[]) => {
      const deleted = new Set(pageIds);
      setPageCodes((prev) => {
        const next = { ...prev };
        pageIds.forEach((pageId) => delete next[pageId]);
        return next;
      });
      setPagePrototypeMap((prev) => {
        const next = { ...prev };
        pageIds.forEach((pageId) => delete next[pageId]);
        return next;
      });
      setPageSketchMap((prev) => {
        const next = { ...prev };
        pageIds.forEach((pageId) => delete next[pageId]);
        return next;
      });
      setPageSchemaMap((prev) => {
        const next = { ...prev };
        pageIds.forEach((pageId) => delete next[pageId]);
        return next;
      });
      setConfigDataMap((prev) => {
        const next = { ...prev };
        pageIds.forEach((pageId) => delete next[pageId]);
        return next;
      });
      setPagePreviewSizeMap((prev) => {
        const next = { ...prev };
        pageIds.forEach((pageId) => delete next[pageId]);
        return next;
      });
      setRuntimeConversions((prev) => {
        const next = { ...prev };
        pageIds.forEach((pageId) => delete next[pageId]);
        return next;
      });
      pageIds.forEach((pageId) => invalidatePageScreenshot(pageId));
      if (canvasEditingPageId && deleted.has(canvasEditingPageId)) {
        setCanvasEditingPageId(null);
        setConfigPanelDetailPageId(null);
        setConfigPanelOverviewRequested(false);
        clearCanvasSelection();
      }
    },
    [
      canvasEditingPageId,
      clearCanvasSelection,
      invalidatePageScreenshot,
      setCanvasEditingPageId,
    ],
  );

  const applyDeletedPagesLocally = useCallback(
    async (pageIds: string[]) => {
      const deleted = new Set(pageIds);
      const previousPages = demoPagesRef.current;
      const remaining = previousPages
        .filter((page) => !deleted.has(page.id))
        .sort((a, b) => a.order - b.order);
      setDemoPages(remaining);
      clearPageLocalCaches(pageIds);
      handleWorkspaceTreeChanged();

      if (deleted.has(activeDemoIdRef.current)) {
        const nextPage = remaining[0];
        if (nextPage) {
          await handleConfigPanelPageSelectRef.current(nextPage.id);
        } else {
          setActiveDemoId("");
          activeDemoIdRef.current = "";
          setCode("");
          setSchema("");
          setEditorContent(buildFigmaText("", ""));
          setPreviewSize(undefined);
          setSinglePreviewTarget(null);
        }
      }
    },
    [clearPageLocalCaches, handleWorkspaceTreeChanged],
  );

  const restoreDeletedPageSnapshot = useCallback(
    async (snapshot: DeletedDemoPageSnapshot): Promise<DemoPageMeta> => {
      if (!sessionId) throw new Error("当前编辑会话未初始化");
      const response = await fetch(
        `/api/projects/${demoId}/demos/${snapshot.page.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            action: "restoreDeletedSnapshot",
            snapshotId: snapshot.snapshotId,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error?.message || "恢复页面失败");
      }
      return data.data as DemoPageMeta;
    },
    [demoId, sessionId],
  );

  const deletePageWithSnapshot = useCallback(
    async (pageId: string): Promise<DeletedDemoPageSnapshot> => {
      if (!sessionId) throw new Error("当前编辑会话未初始化");
      const response = await fetch(
        `/api/projects/${demoId}/demos/${pageId}?sessionId=${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok || !data.success || !data.data?.snapshotId) {
        throw new Error(data.error?.message || "删除页面失败");
      }
      return data.data as DeletedDemoPageSnapshot;
    },
    [demoId, sessionId],
  );

  const requestDeletePages = useCallback(
    async (pageIds: string[]) => {
      const uniquePageIds = Array.from(new Set(pageIds)).filter(Boolean);
      if (uniquePageIds.length === 0) return;
      const pagesToDelete = uniquePageIds
        .map((pageId) =>
          demoPagesRef.current.find((page) => page.id === pageId),
        )
        .filter((page): page is DemoPageMeta => Boolean(page));
      if (pagesToDelete.length === 0) return;

      const confirmed = confirm(
        pagesToDelete.length === 1
          ? `确定要删除页面「${pagesToDelete[0].name}」吗？`
          : `确定要删除选中的 ${pagesToDelete.length} 个页面吗？`,
      );
      if (!confirmed) return;

      let snapshots: DeletedDemoPageSnapshot[] = [];
      await executeCommand({
        label: pagesToDelete.length === 1 ? "删除页面" : "删除多个页面",
        redo: async () => {
          const nextSnapshots: DeletedDemoPageSnapshot[] = [];
          for (const pageId of uniquePageIds) {
            nextSnapshots.push(await deletePageWithSnapshot(pageId));
          }
          snapshots = nextSnapshots;
          await applyDeletedPagesLocally(uniquePageIds);
          toast({
            title: pagesToDelete.length === 1 ? "页面已删除" : "页面已批量删除",
          });
        },
        undo: async () => {
          if (snapshots.length === 0) {
            throw new Error("缺少页面删除快照，无法撤回");
          }
          const restoredPages: DemoPageMeta[] = [];
          for (const snapshot of [...snapshots].sort(
            (a, b) => (a.page.order ?? 0) - (b.page.order ?? 0),
          )) {
            restoredPages.push(await restoreDeletedPageSnapshot(snapshot));
          }
          setDemoPages((current) =>
            [
              ...current.filter(
                (page) =>
                  !restoredPages.some((restored) => restored.id === page.id),
              ),
              ...restoredPages,
            ].sort((a, b) => a.order - b.order),
          );
          handleWorkspaceTreeChanged();
          const firstRestored = restoredPages[0];
          if (firstRestored) {
            await handleConfigPanelPageSelectRef.current(firstRestored.id);
          }
          toast({
            title:
              pagesToDelete.length === 1 ? "已撤回删除页面" : "已撤回批量删除",
          });
        },
      });
    },
    [
      applyDeletedPagesLocally,
      executeCommand,
      deletePageWithSnapshot,
      handleWorkspaceTreeChanged,
      restoreDeletedPageSnapshot,
      toast,
    ],
  );

  // 跨项目粘贴页面回调
  const handlePastePages = useCallback(
    async (input: {
      pages: CanvasPageData[];
      pageLayouts: Record<string, CanvasPageLayout>;
      pageGroups: CanvasPageGroup[];
    }): Promise<{ pageIdMapping: Map<string, string> }> => {
      const pageIdMapping = new Map<string, string>();
      if (!sessionId) return { pageIdMapping };

      const createdPages: DemoPageMeta[] = [];
      for (const srcPage of input.pages) {
        try {
          const runtimeType = srcPage.runtimeType ?? undefined;
          const newPage = await projectApiClient.createDemoPage(
            demoId,
            srcPage.name,
            sessionId,
            null,
            runtimeType,
          );
          pageIdMapping.set(srcPage.id, newPage.id);
          createdPages.push(newPage);

          // 写入页面内容
          const files: {
            code?: string;
            schema?: string;
            prototypeHtml?: string;
            prototypeCss?: string;
            prototypeMeta?: Record<string, unknown>;
          } = {};
          if (srcPage.code) files.code = srcPage.code;
          if (srcPage.prototypeHtml)
            files.prototypeHtml = srcPage.prototypeHtml;
          if (srcPage.prototypeCss) files.prototypeCss = srcPage.prototypeCss;
          if (srcPage.prototypeMeta)
            files.prototypeMeta = srcPage.prototypeMeta;
          // configData 作为 schema 传入
          if (srcPage.configData) {
            files.schema = JSON.stringify(srcPage.configData, null, 2);
          }
          // 如果源页面没有 code 但有 sketchScene，通过文件更新接口写入
          if (srcPage.sketchScene) {
            files.code = srcPage.sketchScene;
          }
          if (Object.keys(files).length > 0) {
            await projectApiClient.updateDemoPageFiles(
              demoId,
              newPage.id,
              sessionId,
              files,
            );
          }
        } catch (err) {
          console.error(`粘贴页面 "${srcPage.name}" 失败:`, err);
        }
      }

      if (createdPages.length > 0) {
        setDemoPages((current) =>
          [...current, ...createdPages].sort((a, b) => a.order - b.order),
        );
        handleWorkspaceTreeChanged();
        toast({
          title:
            createdPages.length === 1
              ? `已粘贴页面「${createdPages[0].name}」`
              : `已粘贴 ${createdPages.length} 个页面`,
        });
      }

      return { pageIdMapping };
    },
    [demoId, sessionId, handleWorkspaceTreeChanged, toast],
  );

  const handleSinglePreviewPageSelect = useCallback(
    async (pageId: string) => {
      if (!confirmDiscardVisualPropertyWork()) return;
      handleClearVisualProperties();
      setVisualLayerTreeOpen(false);
      setVisualPanelHoverNodeId(null);
      await handleConfigPanelPageSelect(pageId);
    },
    [
      confirmDiscardVisualPropertyWork,
      handleClearVisualProperties,
      handleConfigPanelPageSelect,
    ],
  );

  useEffect(() => {
    if (isLoading || activeDemoId || !fallbackPageId) return;
    void handleConfigPanelPageSelectRef.current(fallbackPageId);
  }, [activeDemoId, fallbackPageId, isLoading]);

  const handleSinglePreviewDocumentSelect = useCallback(
    (documentNodeId: string) => {
      if (!confirmDiscardVisualPropertyWork()) return;
      handleClearVisualProperties();
      handleVisualSelect(null, []);
      setVisualLayerTreeOpen(false);
      setVisualPanelHoverNodeId(null);
      setSinglePreviewTarget({ kind: "document", documentNodeId });
    },
    [
      confirmDiscardVisualPropertyWork,
      handleClearVisualProperties,
      handleVisualSelect,
    ],
  );

  const handleSinglePreviewDocumentActiveChange = useCallback(
    (nodeId: string, documentId: string) => {
      const currentState = canvasStateRef.current;
      const nodes = getAnnotationsFromCanvasState(currentState);
      const node = nodes[nodeId];
      if (!node || node.kind !== "document") return;
      if (
        !getCanvasDocumentEntries(node).some((entry) => entry.id === documentId)
      ) {
        return;
      }
      setCanvasState(
        withCanvasAnnotationNodes(currentState, {
          ...nodes,
          [nodeId]: {
            ...node,
            activeDocumentId: documentId,
            updatedAt: Date.now(),
          },
        }),
      );
    },
    [setCanvasState],
  );

  const reconcileRuntimeConversionsAfterAiFiles = useCallback(
    async (input: {
      pages: DemoPage[];
      demos?: Record<string, RuntimeConversionFileSnapshot>;
      traceId: string;
    }) => {
      if (!sessionId) return;

      const activeConversions = Object.values(
        runtimeConversionsRef.current,
      ).filter(
        (conversion) =>
          conversion.status === "running" || conversion.status === "applying",
      );
      if (activeConversions.length === 0) return;

      const pagesById = new Map(input.pages.map((page) => [page.id, page]));
      for (const conversion of activeConversions) {
        const page = pagesById.get(conversion.pageId);
        const files = input.demos?.[conversion.pageId];
        if (!page || !files) continue;

        if (getEffectiveRuntimeType(page) === conversion.targetRuntimeType) {
          setRuntimeConversions((prev) => ({
            ...prev,
            [conversion.pageId]: {
              ...conversion,
              status: "completed",
              message: `已转换为${runtimeTypeLabels[conversion.targetRuntimeType]}`,
            },
          }));
          toast({
            title: "页面类型已转换",
            description: `${conversion.pageName} 已切换为${runtimeTypeLabels[conversion.targetRuntimeType]}。`,
          });
          continue;
        }

        const hasTargetFiles =
          conversion.targetRuntimeType === "prototype-html-css"
            ? typeof files.prototypeHtml === "string"
            : hasPreviewPageCode({
                pageId: conversion.pageId,
                pageCodes: { [conversion.pageId]: files.code },
              });
        if (!hasTargetFiles) continue;

        setRuntimeConversions((prev) => ({
          ...prev,
          [conversion.pageId]: {
            ...conversion,
            status: "applying",
            message: "正在校验目标运行时文件",
          },
        }));
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.runtime_conversion_applying",
          level: "info",
          traceId: conversion.traceId || input.traceId,
          details: {
            pageId: conversion.pageId,
            targetRuntimeType: conversion.targetRuntimeType,
          },
        });

        try {
          const response = await projectApiClient.switchSessionDemoPageRuntime(
            demoId,
            conversion.pageId,
            {
              sessionId,
              targetRuntimeType: conversion.targetRuntimeType,
              code: files.code,
              schema: files.schema,
              prototypeHtml: files.prototypeHtml,
              prototypeCss: files.prototypeCss,
              prototypeMeta: files.prototypeMeta,
            },
          );
          const nextRuntimeType =
            conversion.targetRuntimeType === "prototype-html-css"
              ? "prototype-html-css"
              : undefined;
          setDemoPages((current) =>
            current.map((item) =>
              item.id === conversion.pageId
                ? {
                    ...item,
                    ...(response.meta ?? {}),
                    runtimeType: nextRuntimeType,
                    previewSize: pagePreviewSizeMap[item.id],
                  }
                : item,
            ),
          );
          setRuntimeConversions((prev) => ({
            ...prev,
            [conversion.pageId]: {
              ...conversion,
              status: "completed",
              message: `已转换为${runtimeTypeLabels[conversion.targetRuntimeType]}`,
            },
          }));
          recordDiagnosticEvent({
            category: "ai",
            name: "ai.runtime_conversion_completed",
            level: "info",
            traceId: conversion.traceId || input.traceId,
            details: {
              pageId: conversion.pageId,
              targetRuntimeType: conversion.targetRuntimeType,
              runtimeValidation: response.runtimeValidation,
            },
          });
          toast({
            title: "页面类型已转换",
            description: `${conversion.pageName} 已切换为${runtimeTypeLabels[conversion.targetRuntimeType]}。`,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "页面类型转换失败";
          setRuntimeConversions((prev) => ({
            ...prev,
            [conversion.pageId]: {
              ...conversion,
              status: "failed",
              message,
            },
          }));
          recordDiagnosticEvent({
            category: "ai",
            name: "ai.runtime_conversion_failed",
            level: "error",
            traceId: conversion.traceId || input.traceId,
            details: {
              pageId: conversion.pageId,
              targetRuntimeType: conversion.targetRuntimeType,
              message,
            },
          });
          toast({
            title: "页面类型转换失败",
            description: message,
            variant: "destructive",
          });
        }
      }
    },
    [demoId, pagePreviewSizeMap, recordDiagnosticEvent, sessionId, toast],
  );

  const handleAiFilesChange = useCallback(
    async (files: AiFileChange[]) => {
      const traceId = createDiagnosticTraceId("ai-files");
      const activePageId = activeDemoIdRef.current;
      const normalizeAiFilePath = (filePath: string) => {
        const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
        if (isAiFileChangeRefreshTarget(normalizedPath)) {
          return normalizedPath;
        }
        if (
          activePageId &&
          (normalizedPath === "index.tsx" ||
            normalizedPath === "config.schema.json")
        ) {
          return `demos/${activePageId}/${normalizedPath}`;
        }
        return normalizedPath;
      };
      recordDiagnosticEvent({
        category: "ai",
        name: "ai.files_change_received",
        traceId,
        details: {
          fileCount: files.length,
          files: files.map((file) => ({
            path: file.path,
            normalizedPath: normalizeAiFilePath(file.path),
            action: file.action,
          })),
        },
      });
      const hasWorkspaceStructureChange = files.some((file) => {
        const normalizedPath = normalizeAiFilePath(file.path);
        return isAiFileChangeRefreshTarget(normalizedPath);
      });
      if (!hasWorkspaceStructureChange || !sessionId) return;

      handleWorkspaceTreeChanged();

      const previousPageIds = new Set(demoPages.map((page) => page.id));
      const previousActiveId = activeDemoIdRef.current;

      try {
        const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
        if (!filesRes.ok) {
          throw new Error("刷新页面列表失败");
        }
        const filesData = await filesRes.json();
        if (!filesData.success) {
          throw new Error(filesData.error?.message || "刷新页面列表失败");
        }

        const multi = filesData.data;
        const rawPages = multi.demoPages || [];
        const pagesWithSize = rawPages.map((page: DemoPageMeta) => ({
          ...page,
          previewSize: multi.demos?.[page.id]?.schema
            ? getPreviewSize(multi.demos[page.id].schema)
            : undefined,
        }));
        setDemoPages(pagesWithSize);
        setDemoFolders(multi.demoFolders || []);
        setProjectConfigSchema(multi.projectConfigSchema);
        projectConfigSchemaRef.current = multi.projectConfigSchema;
        replaceCollabText(
          projectSchemaCollab.ytext,
          multi.projectConfigSchema ?? "",
        );

        const pageIds = rawPages.map((page: DemoPageMeta) => page.id);
        const newPageIds = pageIds.filter(
          (pageId: string) => !previousPageIds.has(pageId),
        );
        const nextActiveId = pageIds.includes(previousActiveId)
          ? previousActiveId
          : pageIds[0];

        const codes: Record<string, string> = {};
        const allDefaults: Record<string, Record<string, unknown>> = {};
        const schemas: Record<string, string> = {};
        const prototypes: Record<
          string,
          {
            html?: string;
            css?: string;
            meta?: PrototypePageMeta;
          }
        > = {};
        const sketches: Record<
          string,
          {
            scene?: string;
            meta?: Record<string, unknown>;
          }
        > = {};
        const previewSizeMap: Record<
          string,
          import("@workbench/demo-ui").PreviewSize
        > = {};
        const loadedProjectConfigValues = multi.projectConfigValues ?? {};
        setProjectConfigValues(loadedProjectConfigValues);
        if (multi.demos) {
          for (const [pageId, demo] of Object.entries(multi.demos) as [
            string,
            RuntimeConversionFileSnapshot,
          ][]) {
            codes[pageId] = demo.code || "";
            try {
              allDefaults[pageId] = mergeConfigToProps(
                multi.projectConfigSchema,
                demo.schema || "",
              );
            } catch (err) {
              if (err instanceof SchemaConflictError) {
                toast({
                  title: "Schema 冲突",
                  description: err.message,
                  variant: "destructive",
                });
              }
              allDefaults[pageId] = getDefaultValues(demo.schema || "");
            }
            allDefaults[pageId] = {
              ...allDefaults[pageId],
              ...loadedProjectConfigValues,
            };
            schemas[pageId] = demo.schema || "";
            if (
              demo.prototypeHtml !== undefined ||
              demo.prototypeCss !== undefined
            ) {
              prototypes[pageId] = {
                html: demo.prototypeHtml,
                css: demo.prototypeCss,
                meta: demo.prototypeMeta,
              };
            }
            if (
              demo.sketchScene !== undefined ||
              demo.sketchMeta !== undefined
            ) {
              sketches[pageId] = {
                scene: demo.sketchScene,
                meta: demo.sketchMeta,
              };
            }
            const pagePreviewSize = getPreviewSize(demo.schema || "");
            if (pagePreviewSize) {
              previewSizeMap[pageId] = pagePreviewSize;
            }
          }
        }

        // Ref-first sync: update refs before setState so autosave reads fresh data
        pagePrototypeMapRef.current = {
          ...pagePrototypeMapRef.current,
          ...prototypes,
        };
        pageSketchMapRef.current = { ...pageSketchMapRef.current, ...sketches };

        setPageCodes(codes);
        setPagePrototypeMap(prototypes);
        setPageSketchMap(sketches);
        setConfigDataMap(allDefaults);
        setPageSchemaMap((prev) => mergeLoadedPageSchemas(prev, schemas));
        setPagePreviewSizeMap(previewSizeMap);

        markWorkspaceChanged();
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.files_change_marked_workspace_dirty",
          traceId,
          details: {
            reason: "agent_file_change",
          },
        });

        if (nextActiveId && multi.demos?.[nextActiveId]) {
          const target = multi.demos[nextActiveId];
          setActiveDemoId(nextActiveId);
          activeDemoIdRef.current = nextActiveId;
          if (nextActiveId === previousActiveId) {
            applyDemoSnapshot({
              code: target.code || "",
              schema: target.schema || "",
              source: "ai-finish",
              syncCollab: false,
            });
          } else {
            const targetCode = target.code || "";
            const targetSchema = target.schema || "";
            setCode(targetCode);
            codeRef.current = targetCode;
            setSchema(targetSchema);
            schemaRef.current = targetSchema;
            setPageSchemaMap((prev) => ({
              ...prev,
              [nextActiveId]: targetSchema,
            }));
            setEditorContent(buildFigmaText(targetCode, targetSchema));
            setPreviewSize(getPreviewSize(targetSchema));
          }
        } else {
          setActiveDemoId("");
          activeDemoIdRef.current = "";
          setCode("");
          codeRef.current = "";
          setSchema("");
          schemaRef.current = "";
          setEditorContent(buildFigmaText("", ""));
          setPreviewSize(undefined);
        }

        if (previewMode === "canvas" && newPageIds.length > 0) {
          setFocusCanvasPageId(newPageIds[0]);
        }

        const pageCountChanged = pageIds.length !== previousPageIds.size;
        const pageIdentityChanged =
          pageCountChanged ||
          pageIds.some((pageId: string) => !previousPageIds.has(pageId));
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.files_change_applied",
          traceId,
          details: {
            pageCount: pageIds.length,
            pageIdentityChanged,
            activePageId: activeDemoIdRef.current,
          },
        });
        await reconcileRuntimeConversionsAfterAiFiles({
          pages: pagesWithSize,
          demos: multi.demos,
          traceId,
        });
        toast({
          title: pageIdentityChanged ? "页面列表已刷新" : "页面结构已更新",
        });
      } catch (error) {
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.files_change_refresh_failed",
          traceId,
          level: "error",
          details: {
            message: error instanceof Error ? error.message : "未知错误",
          },
        });
        toast({
          title: "刷新页面列表失败",
          description: error instanceof Error ? error.message : "未知错误",
          variant: "destructive",
        });
        markWorkspaceChanged();
      }
    },
    [
      demoPages,
      applyDemoSnapshot,
      createDiagnosticTraceId,
      handleWorkspaceTreeChanged,
      markWorkspaceChanged,
      previewMode,
      projectSchemaCollab.ytext,
      reconcileRuntimeConversionsAfterAiFiles,
      recordDiagnosticEvent,
      sessionId,
      setFocusCanvasPageId,
      toast,
    ],
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.data?.username) {
          setCurrentUsername((current) =>
            current === data.data.username ? current : data.data.username,
          );
        }
      })
      .catch(() => {});
  }, []);

  // loadVersionHistory, loadPageVersionHistories, publish status effect,
  // and handlePublish moved to useVersionControl hook

  const persistActivePageToSession = useCallback(async () => {
    if (!sessionId || !activeDemoId) {
      throw new Error("未选中页面或 Session 未创建");
    }

    const saveRes = await fetch(
      `/api/sessions/${sessionId}/files/${activeDemoId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          schema,
          prototypeHtml: pagePrototypeMapRef.current[activeDemoId]?.html,
          prototypeCss: pagePrototypeMapRef.current[activeDemoId]?.css,
          prototypeMeta: pagePrototypeMapRef.current[activeDemoId]?.meta,
          sketchScene: pageSketchMapRef.current[activeDemoId]?.scene,
          sketchMeta: pageSketchMapRef.current[activeDemoId]?.meta,
        }),
      },
    );

    if (!saveRes.ok) {
      const result = await saveRes.json().catch(() => null);
      const error = new Error(
        result?.error?.message || "保存当前页面到临时工作区失败",
      ) as Error & {
        code?: string;
        status?: number;
      };
      if (typeof result?.error?.code === "string") {
        error.code = result.error.code;
      }
      error.status = saveRes.status || 0;
      throw error;
    }
  }, [activeDemoId, code, schema, sessionId]);

  const handleSketchSceneChange = useCallback(
    (scene: SketchSceneDocument) => {
      if (!activeDemoId) return;
      const sceneText = JSON.stringify(scene, null, 2);
      replaceCollabText(activeSketchSceneCollab.ytext, sceneText);
      pageSketchMapRef.current = {
        ...pageSketchMapRef.current,
        [activeDemoId]: {
          ...(pageSketchMapRef.current[activeDemoId] ?? {}),
          scene: sceneText,
        },
      };
      setPageSketchMap((prev) => ({
        ...prev,
        [activeDemoId]: {
          ...(prev[activeDemoId] ?? {}),
          scene: sceneText,
        },
      }));
      invalidatePageScreenshot(activeDemoId);
      markWorkspaceChanged();
      scheduleScreenshotRegenerate(
        activeDemoId,
        undefined,
        configDataMapRef.current[activeDemoId],
      );
    },
    [
      activeDemoId,
      activeSketchSceneCollab.ytext,
      invalidatePageScreenshot,
      markWorkspaceChanged,
      scheduleScreenshotRegenerate,
      setPageSketchMap,
    ],
  );

  const activeSketchScene = useMemo(
    () =>
      parseSketchSceneDocument(
        activeDemoId ? pageSketchMap[activeDemoId]?.scene : undefined,
      ) ?? createDefaultSketchScene(),
    [activeDemoId, pageSketchMap],
  );

  // handlePreviewPageVersion and handleRestorePageVersion moved to useVersionControl hook
  // handleCreateVersion moved to useVersionControl hook
  // hasPendingChanges moved to useVersionControl hook

  useEffect(() => {
    if (!sessionId || !workspaceId) {
      setHasPendingWorkspaceFlush((current) => (current ? false : current));
      setWorkspaceFlushError((current) => (current === null ? current : null));
      return;
    }
  }, [sessionId, workspaceId]);

  const persistWorkspaceToProject = useCallback(async () => {
    if (!sessionId) return;
    const response = await fetch(
      `/api/sessions/${sessionId}/persist-workspace`,
      {
        method: "POST",
      },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      const error = new Error(
        result?.error?.message || "同步项目当前工作区失败",
      ) as Error & {
        code?: string;
        status?: number;
      };
      if (typeof result?.error?.code === "string") {
        error.code = result.error.code;
      }
      error.status = response.status || 0;
      throw error;
    }
  }, [sessionId]);

  const syncWorkspaceToProject = useCallback(async () => {
    await runWorkspaceSyncStep(
      "persist-active-page",
      persistActivePageToSession,
    );
    await runWorkspaceSyncStep("collab-flush", () =>
      flushWorkspaceCollab(demoId, workspaceId, sessionId),
    );
    await runWorkspaceSyncStep("persist-workspace", persistWorkspaceToProject);
  }, [
    demoId,
    persistActivePageToSession,
    persistWorkspaceToProject,
    sessionId,
    workspaceId,
  ]);

  const flushPendingWorkspaceBeforeAiSend = useCallback(async () => {
    if (!hasPendingWorkspaceFlush || !sessionId || !workspaceId) return;

    const revisionAtStart = workspaceFlushRevisionRef.current;
    const traceId = createDiagnosticTraceId("ai-send");
    recordDiagnosticEvent({
      category: "autosave",
      name: "autosave.flush_before_ai_send_started",
      traceId,
      details: {
        revision: revisionAtStart,
        workspaceId,
      },
    });

    const startedAt = Date.now();
    try {
      // Yjs-First: 直接执行完整同步流水线（scheduler 已移除）
      await flushSyncWorkspaceRef.current();
      if (workspaceFlushRevisionRef.current === revisionAtStart) {
        setHasPendingWorkspaceFlush(false);
        setWorkspaceFlushError(null);
      }
      recordDiagnosticEvent({
        category: "autosave",
        name: "autosave.flush_before_ai_send_succeeded",
        traceId,
        details: {
          revision: revisionAtStart,
          elapsedMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      const errorDetails = getWorkspaceSyncErrorDetails(error);
      setWorkspaceFlushError(errorDetails.label);
      recordDiagnosticEvent({
        category: "autosave",
        name: "autosave.flush_before_ai_send_failed",
        traceId,
        level: "error",
        details: {
          revision: revisionAtStart,
          elapsedMs: Date.now() - startedAt,
          ...errorDetails,
        },
      });
      throw error;
    }
  }, [
    createDiagnosticTraceId,
    hasPendingWorkspaceFlush,
    recordDiagnosticEvent,
    sessionId,
    syncWorkspaceToProject,
    workspaceId,
  ]);

  // ── Yjs-First: workspace sync debounce + flush（替代 AutosaveScheduler）────
  const scheduleWorkspaceSync = useCallback(() => {
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      syncDebounceRef.current = null;
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      void (async () => {
        const traceId = createDiagnosticTraceId("autosave");
        const startedAt = Date.now();
        const revisionAtStart = workspaceFlushRevisionRef.current;
        recordDiagnosticEvent({
          category: "autosave",
          name: "autosave.sync_started",
          traceId,
          details: {
            trigger: "debounced",
            revision: revisionAtStart,
          },
        });
        try {
          await syncWorkspaceToProject();
          const elapsedMs = Date.now() - startedAt;
          performanceSamplerRef.current.sampleCommitLatency(elapsedMs);
          setHasPendingWorkspaceFlush(false);
          setWorkspaceFlushError(null);
          recordDiagnosticEvent({
            category: "autosave",
            name: "autosave.sync_succeeded",
            traceId,
            details: {
              trigger: "debounced",
              revision: revisionAtStart,
              elapsedMs,
            },
          });
        } catch (error) {
          const errorDetails = getWorkspaceSyncErrorDetails(error);
          setWorkspaceFlushError(errorDetails.label);
          setHasPendingWorkspaceFlush(false);
          recordDiagnosticEvent({
            category: "autosave",
            name: "autosave.sync_failed",
            traceId,
            level: "error",
            details: {
              trigger: "debounced",
              revision: revisionAtStart,
              elapsedMs: Date.now() - startedAt,
              ...errorDetails,
            },
          });
        } finally {
          syncInFlightRef.current = false;
        }
      })();
    }, 800);
  }, [syncWorkspaceToProject, createDiagnosticTraceId, recordDiagnosticEvent]);
  scheduleWorkspaceSyncRef.current = scheduleWorkspaceSync;

  const flushSyncWorkspace = useCallback(async () => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = null;
    }
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    const traceId = createDiagnosticTraceId("autosave-flush");
    const startedAt = Date.now();
    const revisionAtStart = workspaceFlushRevisionRef.current;
    recordDiagnosticEvent({
      category: "autosave",
      name: "autosave.sync_started",
      traceId,
      details: {
        trigger: "manual",
        revision: revisionAtStart,
        caller: "flushSyncWorkspace",
      },
    });
    try {
      await syncWorkspaceToProject();
      const elapsedMs = Date.now() - startedAt;
      performanceSamplerRef.current.sampleCommitLatency(elapsedMs);
      setHasPendingWorkspaceFlush(false);
      setWorkspaceFlushError(null);
      recordDiagnosticEvent({
        category: "autosave",
        name: "autosave.sync_succeeded",
        traceId,
        details: {
          trigger: "manual",
          revision: revisionAtStart,
          elapsedMs,
        },
      });
    } catch (error) {
      const errorDetails = getWorkspaceSyncErrorDetails(error);
      setWorkspaceFlushError(errorDetails.label);
      setHasPendingWorkspaceFlush(false);
      recordDiagnosticEvent({
        category: "autosave",
        name: "autosave.sync_failed",
        traceId,
        level: "error",
        details: {
          trigger: "manual",
          revision: revisionAtStart,
          elapsedMs: Date.now() - startedAt,
          ...errorDetails,
        },
      });
    } finally {
      syncInFlightRef.current = false;
    }
  }, [syncWorkspaceToProject, createDiagnosticTraceId, recordDiagnosticEvent]);
  flushSyncWorkspaceRef.current = flushSyncWorkspace;

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
    };
  }, []);

  // ── Authority revision 同步 ─────────────────────────────────────────────
  useEffect(() => {
    if (
      authorityState.committedRevision > 0 &&
      authorityState.committedRevision >= workspaceFlushRevisionRef.current &&
      // Yjs-First: 检查 debounce timer 和 in-flight 状态
      syncDebounceRef.current === null &&
      !syncInFlightRef.current
    ) {
      setHasPendingWorkspaceFlush(false);
      setWorkspaceFlushError(null);
    }
  }, [authorityState.committedRevision]);

  // ── 在线/离线事件监听 ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const handleOnline = () => {
      // 重连时触发一次 workspace sync flush
      void flushSyncWorkspaceRef.current();
    };
    const handleOffline = () => {
      // 离线时记录诊断事件，不做主动操作（调度器会停止提交）
      recordDiagnosticEvent({
        category: "autosave",
        name: "autosave.browser_offline",
        details: { timestamp: Date.now() },
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [recordDiagnosticEvent]);

  const authoritySynced =
    authorityState.committedRevision > 0 &&
    authorityState.committedRevision >= workspaceFlushRevisionRef.current;

  const exitSyncStatuses = [
    ...activePageCollabStatuses,
    activeSchemaCollab.status,
    projectSchemaCollab.status,
    workspaceTreeCollab.status,
    canvasLayoutCollab.status,
  ];
  const hasExitSyncRisk =
    (hasPendingWorkspaceFlush && !authoritySynced) ||
    workspaceFlushError !== null ||
    syncInFlightRef.current ||
    syncDebounceRef.current !== null ||
    (hasUnsavedChanges &&
      exitSyncStatuses.some(
        (status) =>
          status === "error" ||
          status === "offline" ||
          status === "saving" ||
          status === "connecting",
      ));

  const flushBeforeExit = useCallback(async () => {
    const shouldPersistWorkspace =
      hasPendingWorkspaceFlush || hasUnsavedChanges;
    const traceId = createDiagnosticTraceId("exit-flush");
    const startedAt = Date.now();
    recordDiagnosticEvent({
      category: "autosave",
      name: "autosave.exit_flush_started",
      traceId,
      details: {
        shouldPersistWorkspace,
        hasPendingWorkspaceFlush,
        hasUnsavedChanges,
        hasUnsavedCanvasChanges,
      },
    });
    if (hasUnsavedCanvasChanges) {
      await flushCanvasState();
    }
    // Yjs-First: flush debounce 队列中的待提交资源
    await flushSyncWorkspaceRef.current();
    try {
      if (hasPendingWorkspaceFlush) {
        await syncWorkspaceToProject();
      } else if (shouldPersistWorkspace) {
        await runWorkspaceSyncStep(
          "persist-workspace",
          persistWorkspaceToProject,
        );
      }
      setHasPendingWorkspaceFlush(false);
      setWorkspaceFlushError(null);
      recordDiagnosticEvent({
        category: "autosave",
        name: "autosave.exit_flush_succeeded",
        traceId,
        details: {
          elapsedMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      const errorDetails = getWorkspaceSyncErrorDetails(error);
      recordDiagnosticEvent({
        category: "autosave",
        name: "autosave.exit_flush_failed",
        traceId,
        level: "error",
        details: {
          elapsedMs: Date.now() - startedAt,
          ...errorDetails,
        },
      });
      setWorkspaceFlushError(errorDetails.label);
      throw error;
    }
  }, [
    createDiagnosticTraceId,
    flushCanvasState,
    hasUnsavedChanges,
    hasPendingWorkspaceFlush,
    hasUnsavedCanvasChanges,
    persistWorkspaceToProject,
    recordDiagnosticEvent,
    sessionId,
    syncWorkspaceToProject,
    workspaceId,
  ]);

  const handleBackClick = useCallback(async () => {
    if (hasExitSyncRisk) {
      setShowExitDialog(true);
      return;
    }

    try {
      await flushBeforeExit();
      router.push("/");
    } catch (error) {
      console.warn("[Exit] Failed to flush before exit:", error);
      setShowExitDialog(true);
    }
  }, [flushBeforeExit, hasExitSyncRisk, router]);

  const handleStayOnPage = () => {
    setShowExitDialog(false);
  };

  const handleDirectExit = () => {
    setShowExitDialog(false);
    router.push("/");
  };

  // 处理 AI 代码更新 — 通过 applyDemoSnapshot 统一应用
  const handleCodeUpdate = useCallback(
    (newCode: string, source: "ai-realtime" | "ai-finish" = "ai-realtime") => {
      recordDiagnosticEvent({
        category: "ai",
        name: "ai.code_update",
        details: {
          source,
          pageId: activeDemoIdRef.current,
          codeLength: newCode.length,
        },
      });
      applyDemoSnapshot({ code: newCode, source });
    },
    [applyDemoSnapshot, recordDiagnosticEvent],
  );

  // 处理 AI Schema 更新 — 通过 applyDemoSnapshot 统一应用
  const handleSchemaUpdate = useCallback(
    (
      newSchema: string,
      source: "ai-realtime" | "ai-finish" = "ai-realtime",
    ) => {
      recordDiagnosticEvent({
        category: "ai",
        name: "ai.schema_update",
        details: {
          source,
          pageId: activeDemoIdRef.current,
          schemaLength: newSchema.length,
        },
      });
      applyDemoSnapshot({ schema: newSchema, source });
    },
    [applyDemoSnapshot, recordDiagnosticEvent],
  );

  // Visual edit handlers (initializeVisualConfigDialog, handleVisualConfigCandidateChange,
  // handleVisualSelect, handleStartVisualConfig, handleApplyVisualConfig,
  // handleCloseVisualConfigDialog, visualConfigDialogOpen, handleVisualConfigTitleChange,
  // handleStartVisualAnnotation, handleSendVisualAnnotationsToAI, handleVisualInlineEdit,
  // handleCreateVisualAnnotation, handleAcceptVisualPatch, handleRejectVisualPatch,
  // handleSendSelectionToAI) moved to useVisualEditState hook

  // 从工作空间文件路径提取 demoId
  function extractDemoIdFromPath(normalizedPath: string): string | null {
    const match = normalizedPath.match(/^demos\/([^/]+)\//);
    return match ? match[1] : null;
  }

  // 处理工作空间文件保存 → 同步预览状态
  const handleWorkspaceFileSaved = useCallback(
    (filePath: string, content: string) => {
      const normalizedPath = filePath.replace(/^\/+/, "");
      const demoId = extractDemoIdFromPath(normalizedPath);
      const fileType = normalizedPath.endsWith("index.tsx")
        ? "code"
        : normalizedPath.endsWith("prototype.html")
          ? "prototypeHtml"
          : normalizedPath.endsWith("prototype.css")
            ? "prototypeCss"
            : normalizedPath.endsWith("sketch.scene.json")
              ? "sketchScene"
              : "schema";

      if (demoId && demoId === activeDemoId) {
        if (fileType === "prototypeHtml" || fileType === "prototypeCss") {
          invalidatePageScreenshot(demoId);
          setPagePrototypeMap((prev) => ({
            ...prev,
            [demoId]: {
              ...(prev[demoId] ?? {}),
              [fileType === "prototypeHtml" ? "html" : "css"]: content,
            },
          }));
          scheduleScreenshotRegenerate(
            demoId,
            undefined,
            configDataMapRef.current[demoId],
          );
        } else if (fileType === "sketchScene") {
          invalidatePageScreenshot(demoId);
          setPageSketchMap((prev) => ({
            ...prev,
            [demoId]: {
              ...(prev[demoId] ?? {}),
              scene: content,
            },
          }));
          scheduleScreenshotRegenerate(
            demoId,
            undefined,
            configDataMapRef.current[demoId],
          );
        } else {
          applyDemoSnapshot({
            [fileType === "code" ? "code" : "schema"]: content,
            source: "manual-load",
          });
        }
      }
      markWorkspaceChanged();
    },
    [
      activeDemoId,
      applyDemoSnapshot,
      invalidatePageScreenshot,
      markWorkspaceChanged,
      scheduleScreenshotRegenerate,
      setPagePrototypeMap,
      setPageSketchMap,
    ],
  );

  const activeDemoPage = demoPages.find((page) => page.id === activeDemoId);
  const activePreviewSize = useMemo(() => {
    if (activeDemoId) {
      const schemaForActivePage = pageSchemaMap[activeDemoId];
      const sizeFromSchema = schemaForActivePage
        ? getPreviewSize(schemaForActivePage)
        : undefined;
      const sizeFromPrototypeMeta = getPrototypePreviewSize(
        pagePrototypeMap[activeDemoId]?.meta,
      );
      return (
        sizeFromSchema ??
        pagePreviewSizeMap[activeDemoId] ??
        sizeFromPrototypeMeta ??
        previewSize
      );
    }
    return schema ? (getPreviewSize(schema) ?? previewSize) : previewSize;
  }, [
    activeDemoId,
    pagePreviewSizeMap,
    pagePrototypeMap,
    pageSchemaMap,
    previewSize,
    schema,
  ]);
  const activeSinglePreviewDocumentNode = useMemo(() => {
    if (singlePreviewTarget?.kind !== "document") return undefined;
    return singlePreviewDocumentNodes.find(
      (node) => node.id === singlePreviewTarget.documentNodeId,
    );
  }, [singlePreviewDocumentNodes, singlePreviewTarget]);
  const effectiveSinglePreviewTarget: SinglePreviewTarget | null =
    activeSinglePreviewDocumentNode && singlePreviewTarget?.kind === "document"
      ? singlePreviewTarget
      : activeDemoId
        ? { kind: "page", pageId: activeDemoId }
        : null;
  const singlePreviewViewingDocument =
    previewMode === "single" &&
    effectiveSinglePreviewTarget?.kind === "document";
  const visualLayerDrawerActive =
    propertyPanelActive && visualLayerTreeOpen && !singlePreviewViewingDocument;
  const activeSketchEditorEngine = resolveSketchEditorEngine({
    enginePreference: projectAuthoringPreferences?.sketchEditorEngine,
    userEnginePreference: userAuthoringPreferences?.sketchEditorEngine,
    previewMode,
    runtimeType: activeDemoPage?.runtimeType,
    sketchEditing,
    viewingDocument: singlePreviewViewingDocument,
  });
  const nativeSketchEditingActive = activeSketchEditorEngine === "native";
  const sketchEditorHost = useSketchEditorEngineHost({
    engine: activeSketchEditorEngine,
    scene: activeSketchScene,
    onSceneChange: handleSketchSceneChange,
  });
  const sketchLayerDrawerActive = nativeSketchEditingActive;
  const layerDrawerMounted =
    (visualLayerDrawerMounted && !singlePreviewViewingDocument) ||
    sketchLayerDrawerActive;
  const layerDrawerActive = visualLayerDrawerActive || sketchLayerDrawerActive;

  useEffect(() => {
    if (visualPropertyDrawerOpen && !singlePreviewViewingDocument) {
      setVisualPropertyDrawerMounted(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisualPropertyDrawerMounted(false);
    }, VISUAL_PROPERTY_DRAWER_ANIMATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [singlePreviewViewingDocument, visualPropertyDrawerOpen]);

  useEffect(() => {
    if (visualLayerDrawerActive) {
      setVisualLayerDrawerMounted(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisualLayerDrawerMounted(false);
    }, VISUAL_PROPERTY_DRAWER_ANIMATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [visualLayerDrawerActive]);

  const handleOpenVisualEditMode = useCallback(() => {
    if (singlePreviewViewingDocument) return;
    setVisualPropertyDrawerOpen(true);
    setVisualLayerTreeOpen(true);
    setVisualLayerTreeRequestKey((key) => key + 1);
  }, [singlePreviewViewingDocument]);

  const handleCloseVisualEditMode = useCallback(() => {
    if (hasPendingVisualPropertyWork) {
      if (!confirmDiscardVisualPropertyWork()) return;
      handleClearVisualProperties();
    }
    setVisualPropertyDrawerOpen(false);
    setVisualLayerTreeOpen(false);
    setVisualPanelHoverNodeId(null);
  }, [
    confirmDiscardVisualPropertyWork,
    handleClearVisualProperties,
    hasPendingVisualPropertyWork,
    setVisualPanelHoverNodeId,
  ]);

  const handleSubmitVisualDraftAction = useCallback(() => {
    const actionKind = visualDraftAction?.kind;
    handleSendVisualPropertiesToAI();
    if (actionKind !== "send") return;
    setVisualPropertyDrawerOpen(false);
    setVisualLayerTreeOpen(false);
    setVisualPanelHoverNodeId(null);
  }, [
    handleSendVisualPropertiesToAI,
    setVisualPanelHoverNodeId,
    visualDraftAction?.kind,
  ]);

  const visualPropertyDrawerTargetRef = useRef({
    activeDemoId,
    previewMode,
    singlePreviewViewingDocument,
  });
  useEffect(() => {
    const previous = visualPropertyDrawerTargetRef.current;
    const targetChanged =
      previous.activeDemoId !== activeDemoId ||
      previous.previewMode !== previewMode ||
      previous.singlePreviewViewingDocument !== singlePreviewViewingDocument;

    visualPropertyDrawerTargetRef.current = {
      activeDemoId,
      previewMode,
      singlePreviewViewingDocument,
    };

    if (!targetChanged || !visualPropertyDrawerOpen) return;
    setVisualPropertyDrawerOpen(false);
    setVisualLayerTreeOpen(false);
    setVisualPanelHoverNodeId(null);
  }, [
    activeDemoId,
    previewMode,
    singlePreviewViewingDocument,
    visualPropertyDrawerOpen,
  ]);
  const singlePreviewHistoryTarget = useMemo(
    () =>
      resolveSinglePreviewResourceHistoryTarget({
        target: effectiveSinglePreviewTarget,
        demoPages,
        activeDocumentNode: activeSinglePreviewDocumentNode,
      }),
    [activeSinglePreviewDocumentNode, demoPages, effectiveSinglePreviewTarget],
  );

  useEffect(() => {
    if (!activeDemoId) return;
    if (!singlePreviewTarget) {
      setSinglePreviewTarget((current) =>
        current ? current : { kind: "page", pageId: activeDemoId },
      );
      return;
    }
    if (
      singlePreviewTarget.kind === "page" &&
      singlePreviewTarget.pageId !== activeDemoId
    ) {
      setSinglePreviewTarget((current) =>
        current?.kind === "page" && current.pageId === activeDemoId
          ? current
          : { kind: "page", pageId: activeDemoId },
      );
      return;
    }
    if (
      singlePreviewTarget.kind === "document" &&
      !singlePreviewDocumentNodes.some(
        (node) => node.id === singlePreviewTarget.documentNodeId,
      )
    ) {
      setSinglePreviewTarget((current) =>
        current?.kind === "page" && current.pageId === activeDemoId
          ? current
          : { kind: "page", pageId: activeDemoId },
      );
    }
  }, [activeDemoId, singlePreviewDocumentNodes, singlePreviewTarget]);

  const singlePreviewSelectValue = useMemo(() => {
    if (effectiveSinglePreviewTarget?.kind === "document") {
      return `document:${effectiveSinglePreviewTarget.documentNodeId}`;
    }
    if (effectiveSinglePreviewTarget?.kind === "page") {
      return `page:${effectiveSinglePreviewTarget.pageId}`;
    }
    return "";
  }, [effectiveSinglePreviewTarget]);
  const handleSinglePreviewSelectChange = useCallback(
    (value: string) => {
      if (value.startsWith("document:")) {
        handleSinglePreviewDocumentSelect(value.slice("document:".length));
        return;
      }
      if (value.startsWith("page:")) {
        void handleSinglePreviewPageSelect(value.slice("page:".length));
      }
    },
    [handleSinglePreviewDocumentSelect, handleSinglePreviewPageSelect],
  );

  const handleSinglePreviewResourceRestored = useCallback(async () => {
    if (!singlePreviewHistoryTarget) return;

    if (
      singlePreviewHistoryTarget.kind === "page" &&
      singlePreviewHistoryTarget.pageId
    ) {
      await handleConfigPanelPageSelect(singlePreviewHistoryTarget.pageId);
      setPublishStatus("unpublished_changes");
      await Promise.all([loadVersionHistory(), loadPageVersionHistories()]);
      return;
    }

    if (
      singlePreviewHistoryTarget.kind === "knowledge_document" &&
      singlePreviewHistoryTarget.documentId
    ) {
      const documentId = singlePreviewHistoryTarget.documentId;
      setSinglePreviewDocumentMarkdown((current) => {
        if (current[documentId] === undefined) {
          return current;
        }
        const next = { ...current };
        delete next[documentId];
        return next;
      });
      window.dispatchEvent(new Event("knowledge-updated"));
    }
  }, [
    handleConfigPanelPageSelect,
    loadPageVersionHistories,
    loadVersionHistory,
    setPublishStatus,
    setSinglePreviewDocumentMarkdown,
    singlePreviewHistoryTarget,
  ]);

  const handleOpenSinglePreviewHistory = useCallback(async () => {
    if (!singlePreviewHistoryTarget) return;

    if (
      singlePreviewHistoryTarget.kind !== "page" ||
      !singlePreviewHistoryTarget.pageId ||
      !hasUnsavedChanges ||
      singlePreviewHistoryTarget.pageId !== activeDemoId
    ) {
      setSinglePreviewHistoryOpen(true);
      return;
    }

    if (!sessionId || !workspaceId) {
      toast({
        title: "无法记录当前页面历史",
        description: "当前编辑会话未初始化，请刷新页面后重试。",
        variant: "destructive",
      });
      return;
    }

    setSinglePreviewHistoryPreparing(true);
    setIsSaving(true);
    try {
      await flushWorkspaceCollab(demoId, workspaceId, sessionId);
      await flushCanvasState();

      const saveRes = await fetch(
        `/api/sessions/${sessionId}/files/${singlePreviewHistoryTarget.pageId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, schema }),
        },
      );
      if (!saveRes.ok) {
        throw new Error("保存当前页面失败");
      }

      await projectApiClient.createPageVersion(
        demoId,
        singlePreviewHistoryTarget.pageId,
        {
          sessionId,
          note: `打开历史前记录${singlePreviewHistoryTarget.title}`,
        },
      );
      setHasUnsavedChanges(false);
      setPublishStatus("unpublished_changes");
      await loadPageVersionHistories();
      setSinglePreviewHistoryOpen(true);
    } catch (error) {
      toast({
        title: "记录页面历史失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setSinglePreviewHistoryPreparing(false);
      setIsSaving(false);
    }
  }, [
    activeDemoId,
    code,
    demoId,
    flushCanvasState,
    hasUnsavedChanges,
    loadPageVersionHistories,
    schema,
    sessionId,
    setPublishStatus,
    singlePreviewHistoryTarget,
    toast,
    workspaceId,
  ]);

  const handleRequestRuntimeConversion = useCallback(
    (
      pageId: string,
      targetRuntimeType: DemoPageRuntimeType,
      options: RuntimeConversionRequestOptions = {},
    ) => {
      const page = demoPages.find((item) => item.id === pageId);
      if (!page) {
        toast({
          title: "未找到页面",
          description: "请刷新页面列表后重试。",
          variant: "destructive",
        });
        return;
      }

      const sourceRuntimeType = getEffectiveRuntimeType(page);
      if (sourceRuntimeType === targetRuntimeType) {
        toast({
          title: "无需转换",
          description: `当前页面已经是${runtimeTypeLabels[targetRuntimeType]}。`,
        });
        return;
      }

      setActiveDemoId(pageId);
      if (previewMode === "canvas") {
        focusCanvasPage(pageId);
      } else {
        setSinglePreviewTarget({ kind: "page", pageId });
      }

      const traceId = createDiagnosticTraceId("runtime-conversion");
      const conversion: RuntimeConversionState = {
        pageId,
        pageName: page.name,
        sourceRuntimeType,
        targetRuntimeType,
        status: "running",
        traceId,
        requestedAt: Date.now(),
        message: `AI 正在生成${runtimeTypeLabels[targetRuntimeType]}内容`,
      };
      setRuntimeConversions((prev) => ({
        ...prev,
        [pageId]: conversion,
      }));
      recordDiagnosticEvent({
        category: "ai",
        name: "ai.runtime_conversion_requested",
        level: "info",
        traceId,
        details: {
          pageId,
          pageName: page.name,
          sourceRuntimeType,
          targetRuntimeType,
        },
      });

      const shouldTryStaticization =
        targetRuntimeType === "prototype-html-css" &&
        sourceRuntimeType === "high-fidelity-react" &&
        !options.skipStaticization;
      if (shouldTryStaticization) {
        if (
          previewMode === "single" &&
          activeDemoIdRef.current === pageId &&
          singlePreviewLoaded
        ) {
          pendingStaticPrototypeConversionRef.current = {
            ...conversion,
            status: "applying",
            message: "正在尝试静态化当前预览 DOM",
          };
          setRuntimeConversions((prev) => ({
            ...prev,
            [pageId]: pendingStaticPrototypeConversionRef.current!,
          }));
          setStaticPrototypeRequestKey((key) => key + 1);
          toast({
            title: "正在尝试静态化页面",
            description: "如果当前预览无法静态化，将自动交给 AI 生成原型页。",
          });
          return;
        }
        options.staticizationFailure =
          "当前页面不在已加载的单页预览中，无法读取可静态化 DOM。";
      }

      const hiddenPrompt = [
        buildRuntimeConversionPrompt({
          pageId,
          pageName: page.name,
          sourceRuntimeType,
          targetRuntimeType,
        }),
        options.staticizationFailure
          ? `程序静态化尝试结果: ${options.staticizationFailure}\n请接管生成目标运行时文件。`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      setTabValue("ai");
      setTriggerAutoSend({
        kind: "auto_repair",
        visibleTitle: `转换为${runtimeTypeLabels[targetRuntimeType]}`,
        visibleSummary: `AI 将基于「${page.name}」现有文件生成目标运行时内容`,
        hiddenPrompt,
        debugDetail: [
          `traceId: ${traceId}`,
          `页面: ${page.name} (${pageId})`,
          `源运行时: ${sourceRuntimeType}`,
          `目标运行时: ${targetRuntimeType}`,
        ].join("\n"),
      });
      toast({ title: `已发送${runtimeTypeLabels[targetRuntimeType]}转换任务` });
    },
    [
      createDiagnosticTraceId,
      demoPages,
      focusCanvasPage,
      previewMode,
      recordDiagnosticEvent,
      singlePreviewLoaded,
      toast,
    ],
  );

  const handleStaticPrototypeSnapshot = useCallback(
    async (
      result:
        | { ok: true; html: string; css: string }
        | { ok: false; error: string },
    ) => {
      const conversion = pendingStaticPrototypeConversionRef.current;
      pendingStaticPrototypeConversionRef.current = null;
      if (!conversion || !sessionId) return;

      if (!result.ok) {
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.runtime_conversion_staticization_failed",
          level: "warn",
          traceId: conversion.traceId,
          details: {
            pageId: conversion.pageId,
            message: result.error,
          },
        });
        handleRequestRuntimeConversion(
          conversion.pageId,
          conversion.targetRuntimeType,
          {
            skipStaticization: true,
            staticizationFailure: result.error,
          },
        );
        return;
      }

      setRuntimeConversions((prev) => ({
        ...prev,
        [conversion.pageId]: {
          ...conversion,
          status: "applying",
          message: "正在校验静态化原型页",
        },
      }));

      try {
        const response = await projectApiClient.switchSessionDemoPageRuntime(
          demoId,
          conversion.pageId,
          {
            sessionId,
            targetRuntimeType: "prototype-html-css",
            code: pageCodes[conversion.pageId],
            schema: pageSchemaMapRef.current[conversion.pageId],
            prototypeHtml: result.html,
            prototypeCss: result.css,
          },
        );
        setPagePrototypeMap((prev) => ({
          ...prev,
          [conversion.pageId]: {
            html: result.html,
            css: result.css,
            meta: prev[conversion.pageId]?.meta,
          },
        }));
        setDemoPages((current) =>
          current.map((item) =>
            item.id === conversion.pageId
              ? {
                  ...item,
                  ...(response.meta ?? {}),
                  runtimeType: "prototype-html-css",
                  previewSize: pagePreviewSizeMap[item.id],
                }
              : item,
          ),
        );
        setRuntimeConversions((prev) => ({
          ...prev,
          [conversion.pageId]: {
            ...conversion,
            status: "completed",
            message: "已通过静态化转换为 HTML/CSS 原型",
          },
        }));
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.runtime_conversion_staticization_completed",
          level: "info",
          traceId: conversion.traceId,
          details: {
            pageId: conversion.pageId,
            runtimeValidation: response.runtimeValidation,
          },
        });
        toast({
          title: "页面类型已转换",
          description: `${conversion.pageName} 已通过静态化切换为 HTML/CSS 原型。`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "静态化原型页校验失败";
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.runtime_conversion_staticization_failed",
          level: "warn",
          traceId: conversion.traceId,
          details: {
            pageId: conversion.pageId,
            message,
          },
        });
        handleRequestRuntimeConversion(
          conversion.pageId,
          conversion.targetRuntimeType,
          {
            skipStaticization: true,
            staticizationFailure: message,
          },
        );
      }
    },
    [
      demoId,
      handleRequestRuntimeConversion,
      pageCodes,
      pagePreviewSizeMap,
      recordDiagnosticEvent,
      sessionId,
      toast,
    ],
  );

  const hasProjectConfig = !isSchemaEmpty(projectConfigSchema);
  const hasPageConfig = !isSchemaEmpty(schema);
  const showProjectConfig = hasProjectConfig;
  const showPageConfig = hasPageConfig;
  const hasBothScopes = showProjectConfig && showPageConfig;
  const hasAnyConfig = showProjectConfig || showPageConfig;
  const isConfigPanelVisible =
    (previewMode === "single" && !singlePreviewViewingDocument) ||
    (previewMode === "canvas" && hasAnyConfig);
  const visualConfigUsedKeys = getSchemaPropertyKeys(
    schema,
    projectConfigSchema,
  );
  const getVisualNodeChangeCount = useCallback(
    (node: VisualNodeInfo) => {
      const matchesNode = (item: { domPath: string; nodeId: string }) =>
        item.domPath === node.domPath || item.nodeId === node.nodeId;
      return (
        visualPropertyChanges.filter(matchesNode).length +
        visualConfigMarks.filter(matchesNode).length
      );
    },
    [visualConfigMarks, visualPropertyChanges],
  );
  const hasPendingVisualDraft =
    visualPendingPropertyChanges.length > 0 ||
    visualPendingConfigMarks.length > 0 ||
    hasPendingVisualAiInstruction;
  const visualPendingConfigKeyConflicts = visualPendingConfigMarks.filter(
    (mark) => visualConfigUsedKeys.includes(mark.fieldKey.trim()),
  );
  const visualSendDisabled =
    visualPropertySending ||
    (!selectedVisualNode &&
      !hasPendingVisualAiInstruction &&
      !canRetryVisualPropertySubmission) ||
    (!hasPendingVisualDraft && !canRetryVisualPropertySubmission) ||
    visualPendingConfigKeyConflicts.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  const activeRuntimeConversion = activeDemoId
    ? runtimeConversions[activeDemoId]
    : undefined;
  const activePageName = activeDemoPage?.name || activeDemoId;
  const projectVersions = versionHistory?.versions ?? [];
  const pageVersions = Object.values(pageVersionHistories).flatMap(
    (history) => history.versions,
  );
  const historyEvents: HistoryEvent[] = dedupeHistoryEvents([
    ...projectVersions.map((version, index): HistoryEvent => {
      if (version.sessionId.startsWith("restore-page-")) {
        return {
          id: `project-page-restore-${version.versionId}`,
          kind: "page-restore",
          title: getRestoredPageTitle(version),
          savedAt: version.savedAt,
          version,
        };
      }

      return {
        id: `project-${version.versionId}`,
        kind: "project",
        title:
          version.type === "publish_snapshot"
            ? "发布快照"
            : version.type === "auto_checkpoint"
              ? "自动保存记录"
              : version.sessionId === "restore" ||
                  version.note?.includes("恢复")
                ? "恢复项目"
                : "命名版本",
        savedAt: version.savedAt,
        savedBy: getVersionSavedBy(version.savedBy),
        version,
        isLatestProject: index === 0,
      };
    }),
    ...pageVersions.map(
      (version): HistoryEvent => ({
        id: `page-${version.demoId}-${version.versionId}`,
        kind: "page",
        title: `修改了${version.demoName || version.demoId}`,
        savedAt: version.savedAt,
        version,
      }),
    ),
  ]).sort((a, b) => b.savedAt - a.savedAt);
  const historyEventTotal = historyEvents.length;
  const historyGroups = historyEvents.reduce<
    Array<{ key: string; label: string; events: HistoryEvent[] }>
  >((groups, event) => {
    const key = format(event.savedAt, "yyyy-MM-dd");
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.events.push(event);
      return groups;
    }

    groups.push({
      key,
      label: format(event.savedAt, "MM月dd日", { locale: zhCN }),
      events: [event],
    });
    return groups;
  }, []);
  // hasPublishableChanges, publishButtonDisabled,
  // publishButtonText, publishingButtonText moved to useVersionControl hook
  const collabStatuses = [
    ...activePageCollabStatuses,
    activeSchemaCollab.status,
    projectSchemaCollab.status,
    workspaceTreeCollab.status,
    canvasLayoutCollab.status,
  ];
  const browserOnline =
    typeof navigator === "undefined" ? true : navigator.onLine;

  // 使用状态机计算保存状态，替换旧的 if/else 链
  const saveStateContext = {
    hasDirtyResources: hasPendingWorkspaceFlush,
    isMutationInFlight:
      hasPendingWorkspaceFlush &&
      workspaceFlushRevision > 0 &&
      !authoritySynced,
    isConnected:
      browserOnline &&
      (authorityState.isConnected || authorityState.committedRevision === 0),
    hasConflict: authorityState.conflict !== null,
    isCanonicalStale:
      authorityState.canonicalStatus === "error" ||
      authorityState.canonicalStatus === "lagging",
    lastSaveError: workspaceFlushError ? new Error(workspaceFlushError) : null,
  };
  const saveState = computeSaveStateFromContext(saveStateContext);
  let collabStatusLabel = getSaveStatusLabel(saveState);
  // 保存失败覆盖：onError 清除 pending 后状态机返回 "autosaved"，但实际是失败
  if (saveState === "autosaved" && workspaceFlushError) {
    collabStatusLabel = workspaceFlushError;
  }
  // AI 流式更新是 UI 特殊状态，优先于状态机显示
  if (aiIsStreaming && browserOnline) {
    collabStatusLabel = "AI 正在更新";
  }
  // 兼容旧协同状态显示（协同文档同步状态）
  if (!workspaceFlushError && !hasPendingWorkspaceFlush) {
    if (collabStatuses.includes("error")) {
      collabStatusLabel = "协同异常";
    } else if (collabStatuses.includes("connecting")) {
      collabStatusLabel = "连接中";
    }
  }
  const collabUsers = workspaceTreeCollab.awareness.filter(
    (presence) => presence.userId !== sessionId,
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleBackClick}
            title="返回首页"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {isEditingName ? (
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={handleNameKeyDown}
              className="h-8 w-64 text-lg font-semibold px-2 py-1"
            />
          ) : (
            <h1
              className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors"
              onClick={handleNameClick}
              title="点击修改名称"
            >
              {demoName || demoId}
            </h1>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setCoverDialogOpen(true)}
          >
            <ImageIcon className="h-4 w-4" />
            <span className="text-xs">设置封面</span>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="撤回 (Cmd/Ctrl+Z)"
              disabled={!canUndo}
              onClick={() => {
                void undo();
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="重做 (Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y)"
              disabled={!canRedo}
              onClick={() => {
                void redo();
              }}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {diagnosticsEnabled && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title={
                diagnosticsRemoteWriteFailed
                  ? "导出诊断包（后端写入曾失败，导出会包含本地缓冲）"
                  : "导出诊断包"
              }
              onClick={async () => {
                try {
                  recordDiagnosticEvent({
                    category: "ui",
                    name: "diagnostics_export_clicked",
                  });
                  await exportDiagnostics();
                  toast({ title: "诊断包已导出" });
                } catch (error) {
                  toast({
                    title: "导出诊断包失败",
                    description:
                      error instanceof Error ? error.message : "未知错误",
                    variant: "destructive",
                  });
                }
              }}
            >
              <Download className="h-3.5 w-3.5" />
              <span>诊断</span>
            </Button>
          )}
          <div className="hidden items-center gap-2 rounded-md border px-2 py-1 text-xs text-muted-foreground md:flex">
            <Users className="h-3.5 w-3.5" />
            <span>{collabStatusLabel}</span>
            {collabUsers.length > 0 && (
              <div className="flex -space-x-1">
                {collabUsers.slice(0, 4).map((presence) => (
                  <span
                    key={`${presence.userId}-${presence.resourcePath}`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-background text-[10px] font-medium text-white"
                    title={presence.username}
                    style={{ backgroundColor: presence.color }}
                  >
                    {presence.username.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Button
            onClick={async () => {
              await handlePublish();
            }}
            disabled={publishButtonDisabled}
            variant={!publishButtonDisabled ? "default" : "outline"}
            className="gap-2"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {publishingButtonText}
              </>
            ) : publishStatus === "published" ? (
              <>
                <CheckCircle className="h-4 w-4" />
                已发布
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {publishButtonText}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup
          sizesKey={isConfigPanelVisible ? "3panel" : "2panel"}
          direction="horizontal"
          defaultSizes={isConfigPanelVisible ? [25, 50, 25] : [25, 75]}
          minSizes={isConfigPanelVisible ? [20, 20, 20] : [20, 30]}
          className="h-full"
        >
          <ResizablePanel className="relative flex flex-col overflow-hidden border-r bg-card">
            <Tabs
              value={tabValue}
              onValueChange={setTabValue}
              className="flex-1 flex flex-col min-h-0 [&>[data-state=active]]:flex-1 [&>[data-state=active]]:flex [&>[data-state=active]]:flex-col [&>[data-state=active]]:min-h-0"
            >
              <TabsList className="w-full justify-start gap-2 rounded-none border-b px-2 h-12 bg-transparent">
                <TabsTrigger
                  value="ai"
                  title="AI 对话"
                  className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                >
                  <Bot className="h-4 w-4" />
                  {tabValue === "ai" && <span>AI 对话</span>}
                </TabsTrigger>
                <TabsTrigger
                  value="pages"
                  title="页面"
                  className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                >
                  <Layers className="h-4 w-4" />
                  {tabValue === "pages" && <span>页面</span>}
                  {tabValue === "pages" && demoPages.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 text-[10px] h-4 px-1"
                    >
                      {demoPages.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="code"
                  title="文件"
                  className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                >
                  <FolderOpen className="h-4 w-4" />
                  {tabValue === "code" && <span>文件</span>}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  title="版本"
                  className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                >
                  <History className="h-4 w-4" />
                  {tabValue === "history" && <span>版本</span>}
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="ai"
                className="flex-1 flex flex-col mt-0 min-h-0 min-w-0 data-[state=inactive]:hidden"
              >
                <AIChat
                  sessionId={sessionId}
                  agentSessionId={agentSessionId}
                  workingDir={workspacePath || undefined}
                  projectId={demoId}
                  demoId={activeDemoId}
                  activeViewContext={activeViewContext}
                  workspaceId={workspaceId || undefined}
                  onCodeUpdate={handleCodeUpdate}
                  onSchemaUpdate={handleSchemaUpdate}
                  onFilesChange={handleAiFilesChange}
                  onDiagnosticEvent={(event) => {
                    recordDiagnosticEvent({
                      category: "ai",
                      name: event.name,
                      traceId: event.traceId,
                      level: event.level,
                      details: event.details,
                    });
                  }}
                  beforeSend={flushPendingWorkspaceBeforeAiSend}
                  onMemoryUpdate={async (filePath) => {
                    try {
                      const res = await fetch(
                        `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
                      );
                      const data = await res.json();
                      if (data.success) {
                        setWsCodeDialogData({
                          filePath: data.data.path,
                          content: data.data.content,
                          editable: data.data.editable,
                        });
                        setWsCodeDialogOpen(true);
                      } else {
                        toast({
                          title: "加载文件失败",
                          description: data.error?.message,
                          variant: "destructive",
                        });
                      }
                    } catch {
                      toast({
                        title: "加载文件失败",
                        variant: "destructive",
                      });
                    }
                  }}
                  externalMessages={aiMessages}
                  externalIsStreaming={aiIsStreaming}
                  externalStreamContent={aiStreamContent}
                  externalCurrentMessage={aiCurrentMessage}
                  onMessagesChange={setAiMessages}
                  onIsStreamingChange={handleAiStreamingChange}
                  onStreamContentChange={setAiStreamContent}
                  onCurrentMessageChange={setAiCurrentMessage}
                  currentSessionId={sessionId}
                  onNewSession={async (existingWorkspaceId) => {
                    try {
                      const body: Record<string, unknown> = {
                        demoId,
                        forceNew: true,
                      };
                      if (existingWorkspaceId) {
                        body.workspaceId = existingWorkspaceId;
                      }
                      const res = await fetch("/api/sessions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                      });
                      const data = await res.json();
                      if (!data.success) {
                        toast({
                          title: "新建对话失败",
                          variant: "destructive",
                        });
                        return;
                      }
                      setSessionId(data.data.sessionId);
                      setWorkspaceId(data.data.workspaceId || "");
                      setWorkspacePath(
                        data.data.workspacePath ||
                          data.data.tempWorkspace ||
                          "",
                      );
                      setAgentSessionId(data.data.sessionId);
                      setAiMessages([]);
                      setAiCurrentMessage({
                        role: "assistant",
                        content: "",
                        parts: [],
                      });
                      setAiIsStreaming(false);
                      setAiStreamContent("");
                      if (!existingWorkspaceId) {
                        setCode(data.data.code || "");
                        setSchema(data.data.schema || "");
                        if (activeDemoIdRef.current) {
                          setPageSchemaMap((prev) => ({
                            ...prev,
                            [activeDemoIdRef.current]: data.data.schema || "",
                          }));
                        }
                        setEditorContent(
                          buildFigmaText(
                            data.data.code || "",
                            data.data.schema || "",
                          ),
                        );
                        const defaults = getSafeMergedDefaults(
                          data.data.schema || "",
                        );
                        setConfigDataMap((prev) => ({
                          ...prev,
                          [activeDemoIdRef.current]: defaults,
                        }));
                        const size = getPreviewSize(data.data.schema || "");
                        setPreviewSize(size);
                      }
                      toast({ title: "已创建新对话" });
                    } catch (error) {
                      toast({
                        title: "新建对话失败",
                        description:
                          error instanceof Error ? error.message : "未知错误",
                        variant: "destructive",
                      });
                    }
                  }}
                  onSelectSession={async (newSessionId) => {
                    try {
                      if (sessionId && sessionId !== newSessionId) {
                        await fetch(`/api/sessions/${sessionId}/meta`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "discarded" }),
                        });
                      }

                      await fetch(`/api/sessions/${newSessionId}/meta`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "editing" }),
                      });

                      const sessionRes = await fetch(
                        `/api/sessions/${newSessionId}`,
                      );
                      if (!sessionRes.ok) {
                        toast({ title: "会话不存在", variant: "destructive" });
                        return;
                      }
                      const sessionData = await sessionRes.json();
                      if (!sessionData.success || sessionData.data?.isExpired) {
                        toast({ title: "会话已过期", variant: "destructive" });
                        return;
                      }

                      const messagesRes = await fetch(
                        `/api/sessions/${newSessionId}/messages`,
                      );
                      const messagesData = await messagesRes.json();
                      setAiMessages(
                        messagesData.success && Array.isArray(messagesData.data)
                          ? sanitizeHydratedMessages(messagesData.data)
                          : [],
                      );
                      setAiCurrentMessage({
                        role: "assistant",
                        content: "",
                        parts: [],
                      });
                      setAiIsStreaming(false);
                      setAiStreamContent("");
                      setAgentSessionId(newSessionId);
                      setSessionId(newSessionId);
                      toast({ title: "已切换会话" });
                    } catch (error) {
                      toast({
                        title: "切换失败",
                        description:
                          error instanceof Error ? error.message : "未知错误",
                        variant: "destructive",
                      });
                    }
                  }}
                  triggerAutoSend={triggerAutoSend}
                  onTriggerAutoSendHandled={() => {
                    setTriggerAutoSend(null);
                    handleVisualPropertyAutoSendHandled();
                  }}
                  externalStreamServiceRef={streamServiceRef}
                  errorBanner={
                    errorBannerVisible && validationResult.errors.length > 0 ? (
                      <ErrorBanner
                        errors={validationResult.errors}
                        disabled={aiIsStreaming}
                        onSendToAI={handleSendErrorToAI}
                        onCheckCode={handleManualCheck}
                        isChecking={isChecking}
                      />
                    ) : null
                  }
                />
              </TabsContent>

              <TabsContent
                value="code"
                className="flex-1 flex flex-col mt-0 min-h-0 min-w-0 data-[state=inactive]:hidden overflow-hidden"
              >
                <div className="flex items-center justify-center gap-1 px-3 py-2 border-b">
                  <div className="flex items-center gap-1 rounded-md border border-border p-0.5 w-full max-w-[200px]">
                    <button
                      type="button"
                      onClick={() => setFileView("doc")}
                      className={`flex-1 justify-center inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors ${fileView === "doc" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      文档
                    </button>
                    <button
                      type="button"
                      onClick={() => setFileView("code")}
                      className={`flex-1 justify-center inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors ${fileView === "code" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <FileCode2 className="h-3.5 w-3.5" />
                      代码
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {fileView === "doc" ? (
                    <KnowledgePanel
                      workingDir={workspacePath || undefined}
                      projectId={demoId}
                      sessionId={sessionId}
                      onItemsChange={setKnowledgeItems}
                      onDocCreated={upsertKnowledgeItem}
                      onDocHistory={(item) => setKbHistoryItem(item)}
                      onDocSelect={(item, mode) => {
                        setKbDocDialogItem(item);
                        setKbDocDialogMode(mode);
                        setKbDocDialogOpen(true);
                      }}
                      onDocAdd={() => {
                        setKbDocDialogItem(null);
                        setKbDocDialogMode("add");
                        setKbDocDialogOpen(true);
                      }}
                      onMemorySelect={async () => {
                        if (!sessionId) return;
                        try {
                          const res = await fetch(
                            `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent("memory.md")}`,
                          );
                          const data = await res.json();
                          if (data.success) {
                            setWsCodeDialogData({
                              filePath: data.data.path,
                              content: data.data.content,
                              editable: data.data.editable,
                            });
                            setWsCodeDialogOpen(true);
                          } else {
                            toast({
                              title: "加载文件失败",
                              description: data.error?.message,
                              variant: "destructive",
                            });
                          }
                        } catch {
                          toast({
                            title: "加载文件失败",
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                  ) : (
                    <WorkspaceFileTree
                      sessionId={sessionId}
                      showKnowledge={true}
                      onFileSelect={async (filePath, editable) => {
                        try {
                          const res = await fetch(
                            `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
                          );
                          const data = await res.json();
                          if (data.success) {
                            setWsCodeDialogData({
                              filePath: data.data.path,
                              content: data.data.content,
                              editable: data.data.editable,
                            });
                            setWsCodeDialogOpen(true);
                          } else {
                            toast({
                              title: "加载文件失败",
                              description: data.error?.message,
                              variant: "destructive",
                            });
                          }
                        } catch {
                          toast({
                            title: "加载文件失败",
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="pages"
                className="flex-1 flex flex-col mt-0 min-h-0 min-w-0 data-[state=inactive]:hidden overflow-hidden"
              >
                <DemoPageTree
                  projectId={demoId}
                  sessionId={sessionId}
                  pages={demoPages}
                  folders={demoFolders}
                  onPagesChange={setDemoPages}
                  onFoldersChange={setDemoFolders}
                  onWorkspaceChange={handleWorkspaceTreeChanged}
                  activeDemoId={activeDemoId}
                  onPageSelect={async (pageId) => {
                    if (editingPageId === pageId) return;
                    setActiveDemoId(pageId);
                    // 同步设置 previewSize，避免 fetch 期间用旧尺寸渲染
                    if (pagePreviewSizeMap[pageId]) {
                      setPreviewSize(pagePreviewSizeMap[pageId]);
                    }
                    if (previewMode === "canvas") {
                      focusCanvasPage(pageId);
                    }
                    if (sessionId) {
                      try {
                        const res = await fetch(
                          `/api/sessions/${sessionId}/files/${pageId}`,
                        );
                        const data = await res.json();
                        if (data.success) {
                          const prototypeMeta = data.data.prototypeMeta as
                            | PrototypePageMeta
                            | undefined;
                          setPageCodes((prev) => ({
                            ...prev,
                            [pageId]: data.data.code,
                          }));
                          if (
                            data.data.prototypeHtml !== undefined ||
                            data.data.prototypeCss !== undefined
                          ) {
                            setPagePrototypeMap((prev) => ({
                              ...prev,
                              [pageId]: {
                                html: data.data.prototypeHtml,
                                css: data.data.prototypeCss,
                                meta: prototypeMeta,
                              },
                            }));
                          }
                          setCode(data.data.code);
                          setSchema(data.data.schema);
                          setPageSchemaMap((prev) => ({
                            ...prev,
                            [pageId]: data.data.schema,
                          }));
                          setEditorContent(
                            buildFigmaText(data.data.code, data.data.schema),
                          );
                          setConfigDataMap((prev) => {
                            if (prev[pageId]) return prev;
                            const defaults = getSafeMergedDefaults(
                              data.data.schema,
                            );
                            return { ...prev, [pageId]: defaults };
                          });
                          const size =
                            getPreviewSize(data.data.schema) ??
                            getPrototypePreviewSize(prototypeMeta);
                          if (size) {
                            setPagePreviewSizeMap((prev) => ({
                              ...prev,
                              [pageId]: size,
                            }));
                          }
                          setPreviewSize(size);
                        }
                      } catch (err) {
                        console.error("加载页面失败:", err);
                      }
                    }
                  }}
                  onPageRename={async (pageId, name) => {
                    if (!sessionId) return;
                    try {
                      const res = await fetch(
                        `/api/projects/${demoId}/demos/${pageId}`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ sessionId, name }),
                        },
                      );
                      const data = await res.json();
                      if (data.success) {
                        setDemoPages((prev) =>
                          prev.map((p) =>
                            p.id === pageId ? { ...p, name } : p,
                          ),
                        );
                        handleWorkspaceTreeChanged();
                        toast({ title: "名称已更新" });
                      } else {
                        toast({
                          title: "更新失败",
                          description: data.error?.message,
                          variant: "destructive",
                        });
                      }
                    } catch {
                      toast({ title: "更新失败", variant: "destructive" });
                    }
                  }}
                  onPageCopy={async (pageId) => {
                    if (!sessionId) {
                      toast({
                        title: "未创建 Session",
                        variant: "destructive",
                      });
                      return;
                    }
                    const page = demoPages.find((p) => p.id === pageId);
                    if (!page) return;
                    try {
                      const res = await fetch(`/api/projects/${demoId}/demos`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          sessionId,
                          name: `${page.name} - 副本`,
                          sourcePageId: pageId,
                        }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setDemoPages((prev) =>
                          [...prev, data.data].sort(
                            (a, b) => a.order - b.order,
                          ),
                        );
                        handleWorkspaceTreeChanged();
                        toast({ title: "页面复制成功" });
                      } else {
                        toast({
                          title: "复制失败",
                          description: data.error?.message,
                          variant: "destructive",
                        });
                      }
                    } catch {
                      toast({ title: "复制失败", variant: "destructive" });
                    }
                  }}
                  onRequestRuntimeConversion={handleRequestRuntimeConversion}
                  onPageDelete={(pageId) => {
                    void requestDeletePages([pageId]);
                  }}
                />
              </TabsContent>

              <TabsContent
                value="history"
                className="flex-1 flex flex-col mt-0 min-h-0 min-w-0 data-[state=inactive]:hidden overflow-auto"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">历史</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleCreateVersion}
                        disabled={isSaving || !hasPendingChanges}
                        className="h-8 gap-1.5"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            创建中...
                          </>
                        ) : (
                          <>
                            <History className="h-3.5 w-3.5" />
                            命名此版本
                          </>
                        )}
                      </Button>
                      {publishStatus && (
                        <Badge
                          variant={
                            publishStatus === "published"
                              ? "secondary"
                              : publishStatus === "unpublished_changes"
                                ? "default"
                                : "outline"
                          }
                        >
                          {publishStatus === "published" && "已发布"}
                          {publishStatus === "unpublished_changes" &&
                            "有未发布变更"}
                          {publishStatus === "never_published" && "未发布"}
                        </Badge>
                      )}
                      {publishedVersion && publishStatus === "published" && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <RefreshCw className="h-3 w-3" />
                          {publishedVersion}
                        </span>
                      )}
                    </div>
                  </div>

                  {historyEvents.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>暂无历史记录</p>
                      <p className="text-xs mt-1">
                        内容会自动保存，需要时可命名重要版本
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {historyGroups.map((group) => (
                        <div key={group.key} className="space-y-1">
                          <div className="pl-2 text-xs font-medium text-muted-foreground">
                            {group.label}
                          </div>
                          <div className="space-y-1">
                            {group.events.map((event) => {
                              return (
                                <div
                                  key={event.id}
                                  className="group flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                                >
                                  <span className="w-10 shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                                    {format(event.savedAt, "HH:mm", {
                                      locale: zhCN,
                                    })}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                    {event.title}
                                    {event.kind === "project" && (
                                      <span className="ml-3 inline-flex max-w-[110px] align-middle items-center gap-1 truncate text-xs font-normal text-muted-foreground">
                                        <User className="h-3 w-3 shrink-0" />
                                        <span className="truncate">
                                          {event.savedBy}
                                        </span>
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex w-[96px] shrink-0 items-center justify-end gap-1">
                                    {event.kind === "page" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handlePreviewPageVersion(
                                            event.version,
                                          )
                                        }
                                        className="h-7 gap-1 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                      >
                                        <Eye className="h-3 w-3" />
                                        查看
                                      </Button>
                                    )}
                                    {event.kind === "page" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleRestorePageVersion(
                                            event.version,
                                          )
                                        }
                                        disabled={
                                          restoring === event.version.versionId
                                        }
                                        className="h-7 gap-1 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                      >
                                        {restoring ===
                                        event.version.versionId ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <RotateCcw className="h-3 w-3" />
                                        )}
                                         恢复
                                      </Button>
                                    )}
                                    {event.kind !== "page" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleRestoreProjectVersion(
                                            event.version,
                                          )
                                        }
                                        disabled={
                                          restoring === event.version.versionId
                                        }
                                        className="h-7 gap-1 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                      >
                                        {restoring ===
                                        event.version.versionId ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <RotateCcw className="h-3 w-3" />
                                        )}
                                        恢复
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <p className="pt-2 pl-4 text-xs text-muted-foreground">
                        共 {historyEventTotal} 条历史
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            {layerDrawerMounted && (
              <div
                className={`absolute inset-0 z-20 flex flex-col border-r bg-card shadow-2xl transition-[opacity,transform] duration-200 ease-out will-change-transform motion-reduce:transform-none motion-reduce:transition-none ${
                  layerDrawerActive
                    ? "translate-x-0 opacity-100"
                    : "pointer-events-none -translate-x-full opacity-0"
                }`}
              >
                <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">图层</span>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-2">
                  {sketchLayerDrawerActive ? (
                    <SketchEditorEngineLayerPanel
                      host={sketchEditorHost}
                      scene={activeSketchScene}
                    />
                  ) : (
                    <LayerTreeMenu
                      title="当前页面图层"
                      nodes={visualLayerTreeNodes}
                      className="h-full w-full rounded-none border-0 bg-transparent p-0 shadow-none"
                      scrollClassName="layer-tree-menu-scrollbar max-h-[calc(100vh-180px)]"
                      selectedNodeId={
                        selectedVisualNode?.domPath ||
                        selectedVisualNode?.nodeId ||
                        null
                      }
                      emptyText="正在采集页面图层..."
                      hiddenNodeIds={hiddenVisualNodeIds}
                      getNodeBadgeCount={getVisualNodeChangeCount}
                      onHoverNodeIdChange={setVisualPanelHoverNodeId}
                      onSelectNode={handleVisualSelect}
                      onToggleNodeHidden={handleToggleVisualNodeHidden}
                    />
                  )}
                </div>
              </div>
            )}
          </ResizablePanel>
          <ResizablePanel className="relative border rounded-lg overflow-hidden bg-background shadow-sm flex flex-col">
            <div className="flex-1 overflow-hidden">
              {previewMode === "canvas" ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
                    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSinglePreviewTarget(
                            activeDemoId
                              ? { kind: "page", pageId: activeDemoId }
                              : null,
                          );
                          setPreviewMode("single");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        单页
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors bg-accent text-accent-foreground"
                      >
                        <MapIcon className="h-3.5 w-3.5" />
                        画布
                      </button>
                    </div>
                    <div className="flex-1" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <PreviewCanvas
                      editable
                      sessionId={sessionId}
                      projectId={demoId}
                      pages={demoPages.map((p) => ({
                        id: p.id,
                        name: p.name,
                        runtimeType: p.runtimeType,
                        order: p.order,
                        code: resolvePreviewPageCode({
                          pageId: p.id,
                          pageCodes,
                          activeCodePageId:
                            pageCodes[activeDemoId] === code
                              ? activeDemoId
                              : undefined,
                          activeCode: code,
                        }),
                        prototypeHtml: pagePrototypeMap[p.id]?.html,
                        prototypeCss: pagePrototypeMap[p.id]?.css,
                        prototypeMeta: pagePrototypeMap[p.id]?.meta,
                        sketchScene: pageSketchMap[p.id]?.scene,
                        sketchMeta: pageSketchMap[p.id]?.meta,
                        configData: configDataMap[p.id],
                        previewSize: pagePreviewSizeMap[p.id],
                      }))}
                      canvasState={canvasState}
                      onCanvasStateChange={setCanvasState}
                      onRequestDeletePages={requestDeletePages}
                      onRequestPastePages={handlePastePages}
                      onRuntimeConversionRequest={
                        handleRequestRuntimeConversion
                      }
                      focusPageId={focusCanvasPageId}
                      onVisiblePageIdsChange={setVisibleCanvasPageIds}
                      editingPageId={canvasEditingPageId ?? undefined}
                      screenshotUrls={canvasScreenshotUrls}
                      screenshotRenderBoxes={canvasScreenshotRenderBoxes}
                      onConsoleEntry={handleDiagnosticConsoleEntry}
                      onError={handlePreviewError}
                      onPositionableSizes={handlePositionableSizes}
                      knowledgeDocuments={canvasKnowledgeDocuments}
                      fitToScreenOnMount={fitCanvasToScreenOnMount}
                      onFitToScreenOnMountComplete={
                        handleInitialCanvasFitComplete
                      }
                      onCreateKnowledgeDocument={createCanvasKnowledgeDocument}
                      onUpdateKnowledgeDocument={updateCanvasKnowledgeDocument}
                      onReadKnowledgeDocument={readCanvasKnowledgeDocument}
                      onPageConfigEdit={(pageId) => {
                        rememberActivePageSchema();
                        setCanvasEditingPageId(pageId);
                        setConfigPanelDetailPageId(pageId);
                        setConfigPanelOverviewRequested(false);
                        setActiveDemoId(pageId);
                        activeDemoIdRef.current = pageId;
                        if (sessionId) {
                          fetch(`/api/sessions/${sessionId}/files/${pageId}`)
                            .then((res) => res.json())
                            .then((data) => {
                              if (data.success) {
                                const prototypeMeta = data.data
                                  .prototypeMeta as
                                  | PrototypePageMeta
                                  | undefined;
                                setPageCodes((prev) => ({
                                  ...prev,
                                  [pageId]: data.data.code,
                                }));
                                if (
                                  data.data.prototypeHtml !== undefined ||
                                  data.data.prototypeCss !== undefined
                                ) {
                                  setPagePrototypeMap((prev) => ({
                                    ...prev,
                                    [pageId]: {
                                      html: data.data.prototypeHtml,
                                      css: data.data.prototypeCss,
                                      meta: prototypeMeta,
                                    },
                                  }));
                                }
                                setCode(data.data.code);
                                setSchema(data.data.schema);
                                updatePageSchemaMapFromLoad(
                                  pageId,
                                  data.data.schema,
                                );
                                setEditorContent(
                                  buildFigmaText(
                                    data.data.code,
                                    data.data.schema,
                                  ),
                                );
                                setConfigDataMap((prev) => {
                                  if (prev[pageId]) return prev;
                                  const defaults = getSafeMergedDefaults(
                                    data.data.schema,
                                  );
                                  return { ...prev, [pageId]: defaults };
                                });
                                const size =
                                  getPreviewSize(data.data.schema) ??
                                  getPrototypePreviewSize(prototypeMeta);
                                if (size) {
                                  setPagePreviewSizeMap((prev) => ({
                                    ...prev,
                                    [pageId]: size,
                                  }));
                                }
                                setPreviewSize(size);
                              }
                            })
                            .catch((err) =>
                              console.error("加载页面失败:", err),
                            );
                        }
                      }}
                      onCanvasClick={() => {
                        clearCanvasSelection();
                        setCanvasEditingPageId(null);
                        setConfigPanelDetailPageId(null);
                        setConfigPanelOverviewRequested(true);
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
                    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors bg-accent text-accent-foreground"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        单页
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirmDiscardVisualPropertyWork()) return;
                          handleClearVisualProperties();
                          if (!initialCanvasFitRequestedRef.current) {
                            initialCanvasFitRequestedRef.current = true;
                            setFitCanvasToScreenOnMount(true);
                          }
                          setPreviewMode("canvas");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <MapIcon className="h-3.5 w-3.5" />
                        画布
                      </button>
                    </div>
                    <div className="flex-1" />
                    {visualDraftAction &&
                    activeDemoPage?.runtimeType !== "sketch-scene" &&
                    propertyPanelActive ? (
                      <VisualDraftActionBar
                        action={visualDraftAction}
                        disabled={visualSendDisabled}
                        onPrimary={handleSubmitVisualDraftAction}
                        onCancel={handleCloseVisualEditMode}
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={`h-7 w-7 ${
                          activeDemoPage?.runtimeType === "sketch-scene"
                            ? sketchEditing
                              ? "border-emerald-500/80 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
                              : ""
                            : propertyPanelActive
                              ? "border-emerald-500/80 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
                              : ""
                        }`}
                        disabled={singlePreviewViewingDocument}
                        title={
                          singlePreviewViewingDocument
                            ? "文档视图不可选择"
                            : activeDemoPage?.runtimeType === "sketch-scene"
                              ? sketchEditing
                                ? "退出手绘编辑"
                                : "手绘编辑"
                              : propertyPanelActive
                                ? "退出选择"
                                : "选择"
                        }
                        aria-label={
                          activeDemoPage?.runtimeType === "sketch-scene"
                            ? "手绘编辑"
                            : "选择"
                        }
                        aria-pressed={
                          activeDemoPage?.runtimeType === "sketch-scene"
                            ? sketchEditing
                            : propertyPanelActive
                        }
                        onClick={() => {
                          if (activeDemoPage?.runtimeType === "sketch-scene") {
                            setSketchEditing((current) => !current);
                          } else {
                            if (propertyPanelActive) {
                              handleCloseVisualEditMode();
                            } else {
                              handleOpenVisualEditMode();
                            }
                          }
                        }}
                      >
                        <MousePointer2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={
                        !singlePreviewHistoryTarget ||
                        singlePreviewHistoryPreparing
                      }
                      onClick={() => void handleOpenSinglePreviewHistory()}
                      title={
                        singlePreviewHistoryTarget
                          ? `${singlePreviewHistoryTarget.title} 历史`
                          : "当前对象没有可用历史"
                      }
                      aria-label="查看当前对象历史"
                    >
                      {singlePreviewHistoryPreparing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <History className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {(demoPages.length > 0 ||
                      singlePreviewDocumentNodes.length > 0) && (
                      <select
                        value={singlePreviewSelectValue}
                        onChange={(event) =>
                          handleSinglePreviewSelectChange(event.target.value)
                        }
                        aria-label="选择预览对象"
                        className="h-7 w-44 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                      >
                        {demoPages.length > 0 && (
                          <optgroup label="页面">
                            {demoPages.map((page) => (
                              <option key={page.id} value={`page:${page.id}`}>
                                {page.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {singlePreviewDocumentNodes.length > 0 && (
                          <optgroup label="文档">
                            {singlePreviewDocumentNodes.map((node) => (
                              <option
                                key={node.id}
                                value={`document:${node.id}`}
                              >
                                {node.title}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                    {activeRuntimeConversion &&
                      !singlePreviewViewingDocument && (
                        <div className="flex min-w-0 items-center gap-1">
                          <Badge
                            variant={
                              activeRuntimeConversion.status === "failed"
                                ? "destructive"
                                : activeRuntimeConversion.status === "completed"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="h-6 max-w-[180px] rounded-md px-2 text-[11px] font-normal"
                            title={activeRuntimeConversion.message}
                          >
                            {(activeRuntimeConversion.status === "running" ||
                              activeRuntimeConversion.status ===
                                "applying") && (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            )}
                            {activeRuntimeConversion.status === "completed"
                              ? "转换完成"
                              : activeRuntimeConversion.status === "failed"
                                ? "转换失败"
                                : "转换中"}
                          </Badge>
                          {activeRuntimeConversion.status === "failed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                handleRequestRuntimeConversion(
                                  activeRuntimeConversion.pageId,
                                  activeRuntimeConversion.targetRuntimeType,
                                )
                              }
                              title={
                                activeRuntimeConversion.message || "重试转换"
                              }
                            >
                              <RefreshCw className="mr-1 h-3 w-3" />
                              重试
                            </Button>
                          )}
                        </div>
                      )}
                  </div>
                  <div className="relative flex-1 min-h-0">
                    <style>{`
                      .preview-single-scroll::-webkit-scrollbar {
                        display: none;
                      }
                      .layer-tree-menu-scrollbar {
                        scrollbar-width: thin;
                        scrollbar-color: hsl(var(--muted-foreground) / 0.35) transparent;
                      }
                      .layer-tree-menu-scrollbar::-webkit-scrollbar {
                        width: 6px;
                      }
                      .layer-tree-menu-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                      }
                      .layer-tree-menu-scrollbar::-webkit-scrollbar-thumb {
                        background: hsl(var(--muted-foreground) / 0.35);
                        border-radius: 999px;
                      }
                      .layer-tree-menu-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: hsl(var(--muted-foreground) / 0.55);
                      }
                    `}</style>
                    <div
                      className="preview-single-scroll h-full overflow-y-auto p-4"
                      style={{
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                      }}
                      onClick={(event) => {
                        if (event.target !== event.currentTarget) return;
                        handleVisualSelect(null, []);
                        setVisualLayerTreeOpen(false);
                        setVisualPanelHoverNodeId(null);
                      }}
                    >
                      {singlePreviewViewingDocument &&
                      activeSinglePreviewDocumentNode ? (
                        <div className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-md border bg-background shadow-sm">
                          <CanvasDocumentContent
                            node={activeSinglePreviewDocumentNode}
                            className="min-h-0 flex-1"
                            contentClassName="px-6 py-5 text-sm"
                            onActiveDocumentChange={
                              handleSinglePreviewDocumentActiveChange
                            }
                          />
                        </div>
                      ) : !activeDemoId ? (
                        <div className="flex h-full min-h-[320px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center">
                          <div className="max-w-sm">
                            <FileText className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" />
                            <p className="text-sm font-medium text-foreground">
                              暂无页面
                            </p>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              请在左侧页面列表点击“添加页面”，或让 AI
                              创建新页面。
                            </p>
                          </div>
                        </div>
                      ) : activeDemoPage?.runtimeType ===
                        "prototype-html-css" ? (
                        <PrototypePagePreview
                          html={pagePrototypeMap[activeDemoId]?.html}
                          css={pagePrototypeMap[activeDemoId]?.css}
                          configData={configData}
                          sessionId={sessionId}
                          demoId={activeDemoId}
                          previewSize={activePreviewSize}
                          allowScroll
                          visualEditMode={propertyPanelActive}
                          visualHoverNodeId={
                            propertyPanelActive ? visualPanelHoverNodeId : null
                          }
                          selectedVisualNodeId={
                            selectedVisualNode?.domPath ||
                            selectedVisualNode?.nodeId ||
                            null
                          }
                          hiddenVisualNodeIds={hiddenVisualNodeIds}
                          visualPropertyChanges={visualPropertyChanges}
                          onVisualHover={setHoveredVisualNode}
                          onVisualSelect={handleVisualSelect}
                          onVisualSelectStack={(nodes) => {
                            if (nodes.length > 0) {
                              handleVisualSelect(
                                nodes[nodes.length - 1],
                                nodes,
                              );
                            } else {
                              handleVisualSelect(null, []);
                            }
                          }}
                          visualNodeTreeRequestKey={visualLayerTreeRequestKey}
                          onVisualNodeTreeChange={setVisualLayerTreeNodes}
                        />
                      ) : activeDemoPage?.runtimeType === "sketch-scene" ? (
                        <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-md border bg-background shadow-sm">
                          <div className="min-h-0 flex-1 overflow-hidden">
                            {sketchEditing ? (
                              <SketchEditorEngineStage
                                host={sketchEditorHost}
                                scene={activeSketchScene}
                                configData={configData}
                                previewSize={activePreviewSize}
                              />
                            ) : (
                              <SketchPagePreview
                                scene={pageSketchMap[activeDemoId]?.scene}
                                configData={configData}
                                previewSize={activePreviewSize}
                                fillContainer
                              />
                            )}
                          </div>
                          {sketchEditing ? (
                            <SketchEditorEngineToolbar
                              host={sketchEditorHost}
                              scene={activeSketchScene}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <PreviewPanel
                          code={
                            activeDemoId
                              ? (pageCodes[activeDemoId] ?? "")
                              : code
                          }
                          sessionId={sessionId}
                          demoId={activeDemoId}
                          configData={configData}
                          previewSize={activePreviewSize}
                          placeholderScreenshotUrl={
                            pageScreenshots[activeDemoId]?.screenshotUrl
                          }
                          onConsoleEntry={handleDiagnosticConsoleEntry}
                          onError={handlePreviewError}
                          isAutoRepairing={isAutoRepairing}
                          onContentLoaded={() => {
                            recordDiagnosticEvent({
                              category: "preview",
                              name: "preview.content_loaded",
                              details: {
                                pageId: activeDemoId,
                                mode: "single",
                              },
                            });
                            setSinglePreviewLoaded((current) =>
                              current ? current : true,
                            );
                            // 通知预览投影跟踪器预览已成功加载
                            const ackRevision =
                              workspaceFlushRevisionRef.current;
                            previewTrackerRef.current.ackPreview(
                              ackRevision,
                              "active-preview",
                            );
                            // TODO: 采集投影延迟采样（需要记录预览开始加载时间戳）
                          }}
                          onPositionableSizes={handlePositionableSizes}
                          visualEditMode={propertyPanelActive}
                          visualHoverNodeId={
                            propertyPanelActive ? visualPanelHoverNodeId : null
                          }
                          selectedVisualNodeId={
                            selectedVisualNode?.domPath ||
                            selectedVisualNode?.nodeId ||
                            null
                          }
                          hiddenVisualNodeIds={hiddenVisualNodeIds}
                          visualPropertyChanges={visualPropertyChanges}
                          visualAnnotations={visualAnnotations}
                          onVisualHover={setHoveredVisualNode}
                          onVisualSelect={handleVisualSelect}
                          onVisualSelectStack={(nodes) => {
                            if (nodes.length > 0) {
                              handleVisualSelect(
                                nodes[nodes.length - 1],
                                nodes,
                              );
                            } else {
                              handleVisualSelect(null, []);
                            }
                          }}
                          visualNodeTreeRequestKey={visualLayerTreeRequestKey}
                          onVisualNodeTreeChange={setVisualLayerTreeNodes}
                          staticPrototypeRequestKey={staticPrototypeRequestKey}
                          onStaticPrototypeSnapshot={
                            handleStaticPrototypeSnapshot
                          }
                          onVisualInlineEdit={handleVisualInlineEdit}
                          visualAnnotationMode={false}
                          onVisualAnnotationCreate={(
                            node,
                            text,
                            annotationId,
                            styleChanges,
                          ) => {
                            setSelectedVisualNode(node);
                            const trimmedText = text?.trim() ?? "";
                            const hasStyleChanges =
                              !!styleChanges && styleChanges.length > 0;
                            if (
                              annotationId &&
                              !trimmedText &&
                              !hasStyleChanges
                            ) {
                              setVisualAnnotations((prev) =>
                                prev.filter(
                                  (annotation) =>
                                    annotation.id !== annotationId,
                                ),
                              );
                              return;
                            }
                            if (trimmedText || hasStyleChanges) {
                              if (annotationId) {
                                setVisualAnnotations((prev) =>
                                  prev.map((annotation) =>
                                    annotation.id === annotationId
                                      ? {
                                          ...annotation,
                                          nodeId: node.nodeId,
                                          domPath: node.domPath,
                                          text: trimmedText || "样式修改",
                                          styleChanges,
                                        }
                                      : annotation,
                                  ),
                                );
                              } else {
                                handleCreateVisualAnnotation(
                                  trimmedText,
                                  node,
                                  styleChanges,
                                );
                              }
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>

          {isConfigPanelVisible && (
            <ResizablePanel className="relative flex flex-col overflow-hidden border-l bg-card">
              {previewMode === "single" ? (
                <>
                  <PageConfigPanel
                    pages={demoPages.map((page) => ({
                      id: page.id,
                      name: page.name,
                      order: page.order,
                      schema:
                        pageSchemaMap[page.id] ||
                        (page.id === activeDemoId ? schema : undefined),
                      configData: configDataMap[page.id],
                      projectConfigBindings:
                        page.runtimeType === "prototype-html-css"
                          ? extractPrototypeConfigBindingKeys(
                              pagePrototypeMap[page.id]?.html,
                            )
                          : undefined,
                    }))}
                    activePageId={activeDemoId}
                    detailPageId={activeDemoId}
                    onDetailPageIdChange={(pageId) => {
                      setConfigPanelDetailPageId(pageId);
                    }}
                    onPageSelect={handleConfigPanelPageSelect}
                    projectConfigSchema={projectConfigSchema}
                    onProjectConfigChange={handleProjectConfigPanelChange}
                    onProjectSchemaChange={handleProjectSchemaChange}
                    onPageConfigChange={handlePageConfigPanelChange}
                    onPageSchemaChange={handlePageSchemaChange}
                    sessionId={sessionId}
                    positionableItemSizes={positionableItemSizes}
                    hideDetailHeader
                  />
                  {visualPropertyDrawerMounted &&
                    !singlePreviewViewingDocument && (
                      <div
                        className={`absolute inset-0 z-20 flex flex-col border-l bg-card shadow-2xl transition-[opacity,transform] duration-200 ease-out will-change-transform ${
                          propertyPanelActive
                            ? "translate-x-0 opacity-100"
                            : "pointer-events-none translate-x-full opacity-0"
                        } motion-reduce:transform-none motion-reduce:transition-none`}
                      >
                        <VisualPropertyPanel
                          selectedNode={selectedVisualNode}
                          sessionId={sessionId}
                          projectId={demoId}
                          pageId={activeDemoId}
                          runtimeType={activeDemoPage?.runtimeType}
                          propertyChanges={visualPropertyChanges}
                          configMarks={visualConfigMarks}
                          aiInstruction={visualAiInstruction}
                          usedConfigKeys={visualConfigUsedKeys}
                          onPropertyChange={handleVisualPropertyChange}
                          onRestoreProperty={handleRestoreVisualProperty}
                          onClearChanges={handleClearSelectedVisualProperties}
                          onMarkConfig={handleMarkVisualConfig}
                          onUpdateConfigMark={handleUpdateVisualConfigMark}
                          onRemoveConfigMark={handleRemoveVisualConfigMark}
                          onAiInstructionChange={setVisualAiInstruction}
                        />
                      </div>
                    )}
                  {sketchLayerDrawerActive && (
                    <div className="absolute inset-0 z-20 flex flex-col border-l bg-card shadow-2xl">
                      <SketchEditorEngineInspectorPanel
                        host={sketchEditorHost}
                        scene={activeSketchScene}
                      />
                    </div>
                  )}
                </>
              ) : (
                <PageConfigPanel
                  pages={demoPages.map((page) => ({
                    id: page.id,
                    name: page.name,
                    order: page.order,
                    schema:
                      pageSchemaMap[page.id] ||
                      (page.id === activeDemoId ? schema : undefined),
                    configData: configDataMap[page.id],
                    projectConfigBindings:
                      page.runtimeType === "prototype-html-css"
                        ? extractPrototypeConfigBindingKeys(
                            pagePrototypeMap[page.id]?.html,
                          )
                        : undefined,
                  }))}
                  activePageId={activeDemoId}
                  detailPageId={
                    configPanelOverviewRequested
                      ? configPanelDetailPageId
                      : (configPanelDetailPageId ?? activeDemoId)
                  }
                  onDetailPageIdChange={(pageId) => {
                    setConfigPanelDetailPageId(pageId);
                    setConfigPanelOverviewRequested(pageId === null);
                    if (pageId === null && previewMode === "canvas") {
                      clearCanvasSelection();
                    }
                  }}
                  onPageSelect={handleConfigPanelPageSelect}
                  projectConfigSchema={projectConfigSchema}
                  onProjectConfigChange={handleProjectConfigPanelChange}
                  onProjectSchemaChange={handleProjectSchemaChange}
                  onPageConfigChange={handlePageConfigPanelChange}
                  onPageSchemaChange={handlePageSchemaChange}
                  sessionId={sessionId}
                  positionableItemSizes={positionableItemSizes}
                />
              )}
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      </div>

      <Dialog
        open={visualConfigDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseVisualConfigDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>添加配置项</DialogTitle>
            <DialogDescription>
              将当前选中的页面元素转换为配置面板中的可编辑字段。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="visual-config-kind">配置内容</Label>
              <Select
                value={visualConfigCandidateId}
                onValueChange={handleVisualConfigCandidateChange}
              >
                <SelectTrigger id="visual-config-kind">
                  <SelectValue placeholder="选择配置内容" />
                </SelectTrigger>
                <SelectContent>
                  {visualConfigCandidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="visual-config-title">显示名称</Label>
                <Input
                  id="visual-config-title"
                  value={visualConfigTitle}
                  onChange={(event) =>
                    handleVisualConfigTitleChange(event.target.value)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="visual-config-key">字段 key</Label>
                <Input
                  id="visual-config-key"
                  value={visualConfigFieldKey}
                  onChange={(event) =>
                    setVisualConfigFieldKey(event.target.value)
                  }
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="visual-config-default">默认值</Label>
              <div className="flex items-center gap-2">
                {selectedVisualConfigCandidate?.kind === "color" && (
                  <span
                    className="h-8 w-8 rounded-md border"
                    style={{ backgroundColor: visualConfigDefaultValue }}
                  />
                )}
                <Input
                  id="visual-config-default"
                  value={visualConfigDefaultValue}
                  onChange={(event) =>
                    setVisualConfigDefaultValue(event.target.value)
                  }
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="visual-config-category">分类</Label>
              <Input
                id="visual-config-category"
                list="visual-config-category-options"
                value={visualConfigCategory}
                onChange={(event) =>
                  setVisualConfigCategory(event.target.value)
                }
                placeholder="可选，例如 设计"
              />
              <datalist id="visual-config-category-options">
                {BUILT_IN_CONFIG_CATEGORIES.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>

            {visualConfigNode && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <div className="truncate">
                  元素：&lt;{visualConfigNode.tagName}&gt;
                  {visualConfigNode.className
                    ? ` .${visualConfigNode.className.split(/\s+/).slice(0, 2).join(".")}`
                    : ""}
                </div>
                {visualConfigNode.textContent && (
                  <div className="mt-1 truncate">
                    文本：{visualConfigNode.textContent}
                  </div>
                )}
              </div>
            )}

            {visualConfigError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {visualConfigError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseVisualConfigDialog}
              disabled={visualConfigApplying}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleApplyVisualConfig}
              disabled={
                visualConfigApplying ||
                !selectedVisualConfigCandidate ||
                !visualConfigFieldKey.trim() ||
                !visualConfigTitle.trim()
              }
              className="gap-2"
            >
              {visualConfigApplying && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CoverImageDialog
        open={coverDialogOpen}
        onOpenChange={setCoverDialogOpen}
        projectId={demoId}
        currentThumbnail={currentThumbnail}
        onThumbnailChange={(thumbnail) =>
          setCurrentThumbnail(thumbnail ?? undefined)
        }
      />

      <WorkspaceCodeDialog
        open={wsCodeDialogOpen}
        onOpenChange={setWsCodeDialogOpen}
        filePath={wsCodeDialogData.filePath}
        content={wsCodeDialogData.content}
        editable={wsCodeDialogData.editable}
        projectId={demoId}
        workspaceId={workspaceId}
        sessionId={sessionId}
        onSave={async (content) => {
          if (!sessionId) return;
          const res = await fetch(
            `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(wsCodeDialogData.filePath)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content }),
            },
          );
          const data = await res.json();
          if (!data.success) {
            throw new Error(data.error?.message || "保存失败");
          }
        }}
        onSaved={({ filePath, content }) => {
          handleWorkspaceFileSaved(filePath, content);
        }}
      />

      <KnowledgeDocDialog
        open={kbDocDialogOpen}
        onOpenChange={setKbDocDialogOpen}
        mode={kbDocDialogMode}
        item={kbDocDialogItem}
        workingDir={workspacePath || undefined}
        projectId={demoId}
        workspaceId={workspaceId}
        sessionId={sessionId}
        collabUser={collabUser}
        onSaved={(item) => {
          if (item) {
            upsertKnowledgeItem(item);
          }
          window.dispatchEvent(new Event("knowledge-updated"));
        }}
      />

      {kbHistoryItem && (
        <ResourceHistoryDialog
          open={Boolean(kbHistoryItem)}
          onOpenChange={(open) => {
            if (!open) setKbHistoryItem(null);
          }}
          projectId={demoId}
          kind="knowledge_document"
          resourceId={kbHistoryItem.id}
          title={`${kbHistoryItem.title} 历史`}
          workspaceId={workspaceId}
          sessionId={sessionId}
          onRestored={() => {
            window.dispatchEvent(new Event("knowledge-updated"));
          }}
        />
      )}

      {singlePreviewHistoryOpen && singlePreviewHistoryTarget && (
        <ResourceHistoryDialog
          open={singlePreviewHistoryOpen}
          onOpenChange={setSinglePreviewHistoryOpen}
          projectId={demoId}
          kind={singlePreviewHistoryTarget.kind}
          resourceId={singlePreviewHistoryTarget.resourceId}
          title={`${singlePreviewHistoryTarget.title} 历史`}
          workspaceId={workspaceId}
          sessionId={sessionId}
          onRestored={handleSinglePreviewResourceRestored}
        />
      )}

      <Dialog
        open={!!previewVersion}
        onOpenChange={(open) => {
          if (!open) setPreviewVersion(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[82vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              页面版本预览
              {previewVersion ? ` ${previewVersion.version.versionId}` : ""}
            </DialogTitle>
            <DialogDescription>
              {previewVersion?.version.demoName || activePageName}{" "}
              的只读历史内容
            </DialogDescription>
          </DialogHeader>
          {previewVersion && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
              <div className="min-h-0">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  index.tsx
                </div>
                <ScrollArea className="h-[46vh] rounded-md border bg-muted/30">
                  <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {previewVersion.files.code}
                  </pre>
                </ScrollArea>
              </div>
              <div className="min-h-0">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  config.schema.json
                </div>
                <ScrollArea className="h-[46vh] rounded-md border bg-muted/30">
                  <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {previewVersion.files.schema}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPreviewVersion(null)}>
              关闭
            </Button>
            {previewVersion && (
              <Button
                onClick={() => handleRestorePageVersion(previewVersion.version)}
                disabled={restoring === previewVersion.version.versionId}
                className="gap-2"
              >
                {restoring === previewVersion.version.versionId && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                恢复到此版本
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改仍在同步</DialogTitle>
            <DialogDescription>
              最新修改尚未确认同步完成。网络恢复或同步完成后可安全退出。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleDirectExit}>
              仍然退出
            </Button>
            <Button onClick={handleStayOnPage}>继续编辑</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
