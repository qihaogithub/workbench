"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  use,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ConfigItemEditorDialog } from "@workbench/demo-ui/ConfigItemEditorDialog";
import {
  extractCodeConfigBindingKeys,
  extractPrototypeConfigBindingKeys,
} from "@workbench/demo-ui/config-binding-utils";
import {
  getSchemaFieldCountByBindings,
  getSchemaFieldCountByCategory,
} from "@workbench/demo-ui/config-categories";
import { invalidateCompileCache } from "@workbench/demo-ui/compile-cache";
import { isSchemaEmpty } from "@workbench/demo-ui/validator";
import { PreviewModeSwitcher } from "@workbench/demo-ui/PreviewModeSwitcher";
import { PreviewStage } from "@workbench/demo-ui/PreviewStage";
import type {
  PreviewMode,
  PreviewSize,
  PositionEditTarget,
  ScreenshotRenderBox,
} from "@workbench/demo-ui/types";
import type {
  PositionableSizeItem,
  VisualNodeInfo,
  VisualNodeTreeItem,
  VisualPropertyChangeKind,
} from "@workbench/demo-ui/iframe-types";
import type { PreviewStagePage } from "@workbench/demo-ui/preview-stage-types";
import type {
  CommentAuthor,
  CommentTarget,
  DocumentCommentAnchor,
  DemoPageRuntimeType,
  HtmlImportMeta,
  ProjectType,
  PageSnapshotInput,
  ProjectAuthoringPreferences,
  PrototypePageMeta,
  SketchSceneDocument,
  SchemaDefinitionMutation,
} from "@workbench/shared";
import type { WorkspaceMutationReceipt } from "@workbench/shared/contracts";
import {
  applyPagePresentationToSchema,
  resolvePagePresentation,
  type PagePresentationProfile,
} from "@workbench/shared";
import type { ConfigDefinitionDraft } from "@workbench/shared/demo/config-schema-definition";
import { applyTextPatches, type TextPatch } from "@workbench/prototype-core";
import { createAuthorCommentApi } from "@/lib/comment-api-client";
import {
  CommentUnreadDot,
  countUnresolvedCommentThreads,
  filterPageCommentThreads,
  useComments,
  type CanvasCommentDraft,
} from "@workbench/demo-ui/comment";
import { getBrowserAgentServiceUrl } from "@/lib/runtime-config";
import {
  createDefaultSketchScene,
  parseSketchSceneDocument,
} from "@workbench/sketch-core";
import {
  useScreenshotGeneration,
  type ScreenshotBatchPageInput,
  type ScreenshotPriority,
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
import { analyzeConfigDefinitionImpact } from "@/lib/config-definition-impact";
import { applyCollabTextPatches } from "@/lib/prototype-collab-patches";
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
import { getPersistablePageContent } from "@/lib/page-content-state";
import { readWorkspaceAuthoritySnapshotFromBrowser } from "@/lib/workspace-authority-browser-client";
import { Button } from "@/components/ui/button";
import { DesignSpecWorkspaceProvider } from "@/components/demo/DesignSpecWorkspace";
import { HtmlFileDropZone } from "@/components/demo/HtmlFileDropZone";
import { PageViewportControl } from "@/components/demo/PageViewportControl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type {
  AutoRepairTrigger,
  VisualPropertyAutoSend,
} from "@workbench/ai-chat-shared/ai-chat";
import type { ChatMessage } from "@workbench/ai-chat-shared/message";
import type { StreamService } from "@workbench/ai-chat-shared/stream-service";
import type {
  ChatElementRef,
  ChatPageRef,
} from "@workbench/ai-chat-shared/element-selection";
import { getAgentClient } from "@/lib/agent-client";
import { useConsoleBuffer } from "@/components/demo/useConsoleBuffer";
import { useEditorDiagnostics } from "@/components/demo/useEditorDiagnostics";
import { ResizablePanelGroup, ResizablePanel } from "@/components/ui/resizable";
import {
  Bot,
  Layers,
  Loader2,
  Settings,
  Trash2,
  MoreVertical,
  Eye,
  Copy,
  MousePointer2,
  FileText,
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
  Share2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  MessageSquare,
  MessageSquarePlus,
  Send,
  SlidersHorizontal,
  SquarePen,
} from "lucide-react";

const automaticScreenshotGenerationEnabled =
  process.env.NEXT_PUBLIC_AUTOMATIC_SCREENSHOT_GENERATION !== "false";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBanner } from "@/components/demo/ErrorBanner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type {
  KnowledgeItem,
  KnowledgeDocDialogMode,
} from "@/components/demo/KnowledgeDocDialog";
import { useCollabDocument } from "@/hooks/useCollabDocument";
import { VisualEditSidebar } from "./components/VisualEditSidebar";
import {
  resolveCanvasRightPanelTab,
  type RightPanelTab,
} from "./right-panel-tab";
import {
  useVisualEditState,
  getNodeLabel,
  buildVisualSelectionPrompt,
} from "./hooks/useVisualEditState";
import {
  markWorkspaceDocumentChanged,
  useVersionControl,
} from "./hooks/useVersionControl";
import { useWorkspaceAuthorityState } from "./hooks/useWorkspaceAuthorityState";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { getExitSaveState } from "./exit-save-state";
import {
  resolveSinglePreviewResourceHistoryTarget,
  type SinglePreviewTarget,
} from "./single-preview-history";
import {
  getAnnotationsFromCanvasState,
  getCanvasDocumentEntries,
  withCanvasAnnotationNodes,
} from "@workbench/demo-ui/canvas-kernel";
import { CanvasDocumentContent } from "@workbench/demo-ui/CanvasDocumentContent";
import { normalizeCanvasPageLayouts } from "@workbench/demo-ui/canvas-layout";
import { useCanvasDocumentMarkdown } from "@workbench/demo-ui/useCanvasDocumentMarkdown";
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
  SnapshotQuality,
  SnapshotRejectionReason,
  ImageConfigTarget,
} from "@workbench/demo-ui/types";
import type { WhiteboardCommitTarget } from "@/components/demo/WhiteboardDialog";
import { WHITEBOARD_AUTHORING_ENABLED } from "@/lib/authoring-feature-flags";
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
import {
  hasLoadedPrototypeHtml,
  loadCanvasPageContent,
  type ReferencedDesignSpecEntry,
} from "@/lib/canvas-page-content-loader";
import { useDemos } from "@/lib/api";
import {
  resolveSketchEditorEngine,
  type SketchEditorEngine,
} from "@/lib/sketch-editor-engine";
import type { ActiveViewContext } from "@workbench/ai-chat-shared/active-view-context";
import { sanitizeHydratedMessages } from "@/lib/sanitize-hydrated-messages";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";

const CommentLayer = dynamic(
  () => import("@workbench/demo-ui/comment").then((m) => m.CommentLayer),
  { ssr: false, loading: () => null },
);
const CommentPanel = dynamic(
  () => import("@workbench/demo-ui/comment").then((m) => m.CommentPanel),
  { ssr: false, loading: () => null },
);
const PageConfigPanel = dynamic(
  () =>
    import("@workbench/demo-ui/PageConfigPanel").then((m) => m.PageConfigPanel),
  { ssr: false, loading: () => null },
);
const WhiteboardDialog = dynamic(
  () =>
    import("@/components/demo/WhiteboardDialog").then(
      (m) => m.WhiteboardDialog,
    ),
  { ssr: false, loading: () => null },
);
const DeferredAuthorAIChat = dynamic(
  () =>
    import("@/components/ai-elements/deferred-author-ai-chat").then(
      (module) => module.DeferredAuthorAIChat,
    ),
  { ssr: false, loading: () => null },
);
const VisualPropertyPanel = dynamic(
  () =>
    import("./components/VisualPropertyPanel").then(
      (m) => m.VisualPropertyPanel,
    ),
  { ssr: false, loading: () => null },
);
const SketchEditorEngineStage = dynamic(
  () =>
    import("./components/SketchEditorEngineHost").then(
      (m) => m.SketchEditorEngineStage,
    ),
  { ssr: false, loading: () => null },
);
const SketchEditorEngineProvider = dynamic(
  () =>
    import("./components/SketchEditorEngineHost").then(
      (m) => m.SketchEditorEngineProvider,
    ),
  { ssr: false, loading: () => null },
);

function SketchEditorEngineBoundary({
  engine,
  scene,
  onSceneChange,
  children,
}: {
  engine: SketchEditorEngine | null;
  scene: SketchSceneDocument;
  onSceneChange: (scene: SketchSceneDocument) => void;
  children: ReactNode;
}) {
  if (!engine) return <>{children}</>;
  return (
    <SketchEditorEngineProvider
      engine={engine}
      scene={scene}
      onSceneChange={onSceneChange}
    >
      {children}
    </SketchEditorEngineProvider>
  );
}
const ProjectSettingsDialog = dynamic(
  () =>
    import("@/components/project-settings-dialog").then(
      (m) => m.ProjectSettingsDialog,
    ),
  { ssr: false, loading: () => null },
);
const ShareDialog = dynamic(
  () => import("@/components/share/ShareDialog").then((m) => m.ShareDialog),
  { ssr: false, loading: () => null },
);
const DemoPageTree = dynamic(
  () => import("@/components/demo/DemoPageTree").then((m) => m.DemoPageTree),
  { ssr: false, loading: () => null },
);
const WorkspaceFileTree = dynamic(
  () =>
    import("@/components/demo/WorkspaceFileTree").then(
      (m) => m.WorkspaceFileTree,
    ),
  { ssr: false, loading: () => null },
);
const WorkspaceCodeDialog = dynamic(
  () =>
    import("@/components/demo/WorkspaceCodeDialog").then(
      (m) => m.WorkspaceCodeDialog,
    ),
  { ssr: false, loading: () => null },
);
const DocumentView = dynamic(
  () => import("@/components/demo/DocumentView").then((m) => m.DocumentView),
  { ssr: false, loading: () => null },
);
const DocumentModeRightPanel = dynamic(
  () =>
    import("@/components/demo/DocumentModeRightPanel").then(
      (m) => m.DocumentModeRightPanel,
    ),
  { ssr: false, loading: () => null },
);
const KnowledgeDocDialog = dynamic(
  () =>
    import("@/components/demo/KnowledgeDocDialog").then(
      (m) => m.KnowledgeDocDialog,
    ),
  { ssr: false, loading: () => null },
);
const ResourceHistoryDialog = dynamic(
  () =>
    import("@/components/demo/ResourceHistoryDialog").then(
      (m) => m.ResourceHistoryDialog,
    ),
  { ssr: false, loading: () => null },
);

interface DemoEditPageProps {
  params: Promise<{
    id: string;
  }>;
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

function shouldCaptureFullPage(
  presentation?: PagePresentationProfile,
): boolean {
  return presentation?.heightBehavior !== "fixed";
}

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
      title: string;
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

type DemoPage = DemoPageMeta & { previewSize?: PreviewSize };

const runtimeTypeLabels: Record<DemoPageRuntimeType, string> = {
  "high-fidelity-react": "高保真 React",
  "prototype-html-css": "HTML/CSS 原型",
  "sandboxed-html": "隔离交互 HTML",
  "sketch-scene": "手绘页面",
};

function getEffectiveRuntimeType(
  page?: Pick<DemoPage, "runtimeType"> | null,
): DemoPageRuntimeType {
  if (page?.runtimeType === "prototype-html-css") return "prototype-html-css";
  if (page?.runtimeType === "sandboxed-html") return "sandboxed-html";
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

  return `请把当前页面从「${sourceLabel}」转换为「${targetLabel}」，并保持产品意图、页面结构、配置字段和视觉层级一致。

页面名称: ${input.pageName}
页面 ID: ${input.pageId}

必须处理的文件:
- demos/${input.pageId}/index.tsx
- demos/${input.pageId}/config.schema.json
- demos/${input.pageId}/prototype.html
- demos/${input.pageId}/prototype.css
- workspace-tree.json

通用要求:
- 先读取当前页面已有源文件，不要凭空重做页面。
- 目标运行时文件生成完成并自检通过后，再更新 workspace-tree.json 中该页面的 runtimeType。
- 保留源运行时文件作为回退，不要删除 index.tsx、prototype.html 或 prototype.css。
- 不要新增无关页面、文件夹或依赖。
- 转换后检查目标运行时的配置 Schema 仍是合法 JSON。

先用 readPreinstalledSkill({ name: 'page-runtime-conversion' }) 读取完整转换规范，按其中的视觉 ground truth 约束、分运行时细则和自检清单执行。`;
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

interface PrototypeVisualHistoryEntry {
  pageId: string;
  changeId: string;
  before: string;
  after: string;
  forwardPatches: TextPatch[];
  inversePatches: TextPatch[];
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

function projectAuthoritySnapshotResources(resources: Record<string, string>) {
  const parseJson = <T,>(value: string | undefined): T | undefined => {
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  };
  const tree = parseJson<{
    pages?: DemoPageMeta[];
    folders?: DemoFolderMeta[];
  }>(resources["workspace-tree.json"]);
  const demoPages = Array.isArray(tree?.pages) ? tree.pages : [];
  const demoFolders = Array.isArray(tree?.folders) ? tree.folders : [];
  const demos: Record<string, RuntimeConversionFileSnapshot> = {};
  for (const page of demoPages) {
    const prefix = `demos/${page.id}/`;
    const schema = resources[`${prefix}config.schema.json`];
    const code = resources[`${prefix}index.tsx`];
    const prototypeHtml = resources[`${prefix}prototype.html`];
    const sketchScene = resources[`${prefix}sketch.scene.json`];
    const sandboxHtml = resources[`${prefix}sandbox.html`];
    if (!schema || (!code && !prototypeHtml && !sketchScene && !sandboxHtml))
      continue;
    demos[page.id] = {
      code: code ?? "",
      schema,
      prototypeHtml,
      prototypeCss: resources[`${prefix}prototype.css`],
      prototypeMeta: parseJson<PrototypePageMeta>(
        resources[`${prefix}prototype.meta.json`],
      ),
      sketchScene,
      sketchMeta: parseJson<Record<string, unknown>>(
        resources[`${prefix}sketch.meta.json`],
      ),
    };
  }
  return {
    demoPages,
    demoFolders,
    multi: {
      demos,
      projectConfigSchema: resources["project.config.schema.json"],
      projectConfigValues: parseJson<Record<string, unknown>>(
        resources["project.config.values.json"],
      ),
    },
  };
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

function nextPageLayoutsDiffer(
  current: Record<string, CanvasPageLayout>,
  next: Record<string, CanvasPageLayout>,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (currentKeys.length !== nextKeys.length) return true;
  return nextKeys.some((pageId) => {
    const cur = current[pageId];
    const nxt = next[pageId];
    if (!cur || !nxt) return true;
    return (
      cur.x !== nxt.x ||
      cur.y !== nxt.y ||
      cur.width !== nxt.width ||
      cur.height !== nxt.height
    );
  });
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

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  const result = { ...obj };
  let current: Record<string, unknown> = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const existing = current[key];
    if (Array.isArray(existing)) {
      current[key] = [...existing];
    } else if (typeof existing === "object" && existing !== null) {
      current[key] = { ...(existing as Record<string, unknown>) };
    } else {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

function getSchemaGroupKeys(schema: string): Set<string> {
  try {
    const parsed = JSON.parse(schema);
    const props = parsed.properties;
    if (!props || typeof props !== "object" || Array.isArray(props))
      return new Set();
    const groups = new Set<string>();
    for (const [key, prop] of Object.entries(props)) {
      const p = prop as Record<string, unknown>;
      if (
        p?.type === "object" &&
        p?.properties &&
        !(p.$demo as Record<string, unknown>)?.positionable
      ) {
        groups.add(key);
      }
    }
    return groups;
  } catch {
    return new Set();
  }
}

function flattenNestedDelta(
  data: Record<string, unknown>,
  schema: string,
): Record<string, unknown> {
  const groupKeys = getSchemaGroupKeys(schema);
  const result: Record<string, unknown> = {};
  for (const groupKey of groupKeys) {
    const groupVal = data[groupKey];
    if (groupVal && typeof groupVal === "object" && !Array.isArray(groupVal)) {
      Object.assign(result, groupVal as Record<string, unknown>);
    }
  }
  Object.assign(result, data);
  for (const groupKey of groupKeys) {
    delete result[groupKey];
  }
  return result;
}

function getCanvasContentHistorySignature(state: CanvasState): string {
  return JSON.stringify({
    pages: state.pages ?? {},
    sections: state.sections ?? {},
    pageGroups: state.pageGroups ?? {},
    nodes: state.nodes ?? {},
    layers: state.layers ?? {},
    hiddenKnowledgeDocumentIds: state.hiddenKnowledgeDocumentIds ?? [],
  });
}

export default function DemoEditPage({ params }: DemoEditPageProps) {
  const router = useRouter();
  const { id: demoId } = use(params);
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
  const [droppedHtmlFiles, setDroppedHtmlFiles] = useState<File[]>();

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
  const [whiteboardTarget, setWhiteboardTarget] =
    useState<WhiteboardCommitTarget | null>(null);
  const projectConfigValuesRef = useRef(projectConfigValues);
  projectConfigValuesRef.current = projectConfigValues;
  const projectConfigPersistQueueRef = useRef<Promise<boolean>>(
    Promise.resolve(true),
  );
  const [pageSchemaMap, setPageSchemaMap] = useState<Record<string, string>>(
    {},
  );
  const [referencePageRequirements, setReferencePageRequirements] = useState<
    Record<string, string>
  >({});
  const [referencePageDesignSpecEntries, setReferencePageDesignSpecEntries] =
    useState<Record<string, ReferencedDesignSpecEntry[]>>({});
  const [referencePageProjectSchemas, setReferencePageProjectSchemas] =
    useState<Record<string, string>>({});
  const pageSchemaMapRef = useRef(pageSchemaMap);
  pageSchemaMapRef.current = pageSchemaMap;
  const [requirementsMap, setRequirementsMap] = useState<
    Record<string, string>
  >({});
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [designSpecFocus, setDesignSpecFocus] = useState<{
    docId: string;
    entryId: string;
  } | null>(null);
  const [pageCodes, setPageCodes] = useState<Record<string, string>>({});
  const pageCodesRef = useRef(pageCodes);
  pageCodesRef.current = pageCodes;
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
  const [pageSandboxMap, setPageSandboxMap] = useState<
    Record<string, { html?: string; meta?: HtmlImportMeta }>
  >({});
  const pageSandboxMapRef = useRef(pageSandboxMap);
  pageSandboxMapRef.current = pageSandboxMap;
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
  const [sandboxExecutionMap, setSandboxExecutionMap] = useState<
    Record<string, { url?: string; channelId?: string }>
  >({});
  const [sketchEditing, setSketchEditing] = useState(false);
  const [pagePreviewSizeMap, setPagePreviewSizeMap] = useState<
    Record<string, PreviewSize>
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

  const [positionEditMode, setPositionEditMode] = useState<{
    enabled: boolean;
    target: PositionEditTarget | null;
  }>({ enabled: false, target: null });
  const positionEditTargetRef = useRef<PositionEditTarget | null>(null);
  const positionEditEnabledRef = useRef(false);
  positionEditTargetRef.current = positionEditMode.target;
  positionEditEnabledRef.current = positionEditMode.enabled;

  const [positionEditDimming, setPositionEditDimming] = useState(true);

  const positionFieldPathRef = useRef<Record<string, string>>({});

  const handleEnterPositionEdit = useCallback((target: PositionEditTarget) => {
    positionFieldPathRef.current[target.id] = target.fieldPath;
    positionEditTargetRef.current = target;
    setPositionEditMode({ enabled: true, target });
    setPositionEditDimming((previous) =>
      positionEditEnabledRef.current ? previous : true,
    );
  }, []);

  const handlePositionFieldPathChange = useCallback(
    (instanceId: string, fieldPath: string) => {
      positionFieldPathRef.current[instanceId] = fieldPath;
      const activeTarget = positionEditTargetRef.current;
      if (
        !activeTarget ||
        activeTarget.id !== instanceId ||
        activeTarget.fieldPath === fieldPath
      ) {
        return;
      }
      const nextTarget = { ...activeTarget, fieldPath };
      positionEditTargetRef.current = nextTarget;
      setPositionEditMode((previous) =>
        previous.target?.id === instanceId &&
        previous.target.fieldPath !== fieldPath
          ? { ...previous, target: nextTarget }
          : previous,
      );
    },
    [],
  );

  const handleExitPositionEdit = useCallback(() => {
    positionFieldPathRef.current = {};
    positionEditTargetRef.current = null;
    positionEditEnabledRef.current = false;
    setPositionEditMode({ enabled: false, target: null });
  }, []);

  const handleTogglePositionDimming = useCallback(() => {
    setPositionEditDimming((prev) => !prev);
  }, []);

  const handlePageConfigPanelChangeRef = useRef<
    (pageId: string, data: Record<string, unknown>) => void
  >(() => {});

  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  });

  const [agentSessionId, setAgentSessionId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialPageLoading, setIsInitialPageLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [initialPageError, setInitialPageError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const [sessionId, setSessionId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");

  const [workspacePath, setWorkspacePath] = useState("");
  const [previewSize, setPreviewSize] = useState<PreviewSize>();
  const [temporaryPresentation, setTemporaryPresentation] =
    useState<PagePresentationProfile>();

  useEffect(() => bindKeyboardShortcuts(), [bindKeyboardShortcuts]);

  useEffect(() => {
    resetCommandHistory();
  }, [resetCommandHistory, sessionId]);

  // ── Session 续期：每 30 分钟续一次，避免 2h 到期后保存/协同失效 ─────
  const sessionRenewIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  useEffect(() => {
    if (!sessionId) return;
    if (sessionRenewIntervalRef.current)
      clearInterval(sessionRenewIntervalRef.current);
    const renew = () => {
      fetch(`/api/sessions/${sessionId}/renew`, { method: "POST" }).catch(
        () => {},
      );
    };
    renew();
    sessionRenewIntervalRef.current = setInterval(renew, 30 * 60 * 1000);
    return () => {
      if (sessionRenewIntervalRef.current)
        clearInterval(sessionRenewIntervalRef.current);
    };
  }, [sessionId]);

  const [demoName, setDemoName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [exitState, setExitState] = useState<"saving" | "confirm">("saving");
  const [exitErrorLabel, setExitErrorLabel] = useState<string | null>(null);
  const exitHandlingRef = useRef(false);
  const exitCancelledRef = useRef(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [saveVersionDialogOpen, setSaveVersionDialogOpen] = useState(false);
  const [versionNameInput, setVersionNameInput] = useState("");
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
  const [projectType, setProjectType] = useState<ProjectType>("standard");
  const [projectAuthoringPreferences, setProjectAuthoringPreferences] =
    useState<ProjectAuthoringPreferences | undefined>(undefined);
  const [userAuthoringPreferences, setUserAuthoringPreferences] = useState<
    UserAuthoringPreferences | undefined
  >(undefined);
  // ── Workspace sync refs（Yjs-First: 替代 AutosaveScheduler）──────────
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const scheduleWorkspaceSyncRef = useRef<() => void>(() => {});
  const flushSyncWorkspaceRef = useRef<() => Promise<void>>(() =>
    Promise.resolve(),
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
    enabled: Boolean(demoId && workspaceId && sessionId),
  });
  const appliedAuthorityProjectionRevisionRef = useRef(0);
  const pendingAuthorityProjectionRevisionRef = useRef(0);
  const authorityProjectionChainRef = useRef<Promise<void>>(Promise.resolve());

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
  useEffect(() => setTemporaryPresentation(undefined), [activeDemoId]);
  const [runtimeConversions, setRuntimeConversions] = useState<
    Record<string, RuntimeConversionState>
  >({});
  const runtimeConversionsRef = useRef(runtimeConversions);
  runtimeConversionsRef.current = runtimeConversions;
  const [singlePreviewTarget, setSinglePreviewTarget] =
    useState<SinglePreviewTarget | null>(null);
  const activeDemoIdRef = useRef(activeDemoId);
  activeDemoIdRef.current = activeDemoId;
  // A page switch owns both the page id and its page-scoped content. Autosave
  // must not observe the interval between requesting a page and committing its
  // complete snapshot.
  const pageSwitchInFlightRef = useRef(false);
  const pageSwitchRequestRef = useRef(0);
  const pageSwitchDeferredSyncRef = useRef(false);
  useEffect(() => {
    if (activeDemoId) {
      loadPageRequirements(activeDemoId);
    }
    // 切换页面时重新加载该页配置要求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDemoId]);
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
    rebaseRemoteCanvasState,
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
    enabled: automaticScreenshotGenerationEnabled,
    pageIds: screenshotPageIds,
  });
  // ── 截图再生：集中标记 + 持久化管线后统一触发 ──
  const structuralDirtyPageIdsRef = useRef<Set<string>>(new Set());
  const pendingPrototypeScreenshotPageIdsRef = useRef<Set<string>>(new Set());

  const markScreenshotDirty = useCallback(
    (pageId: string) => {
      invalidatePageScreenshot(pageId);
      structuralDirtyPageIdsRef.current.add(pageId);
    },
    [invalidatePageScreenshot],
  );

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

  const activePreviewScreenshotUrl = useMemo(() => {
    const state = pageScreenshots[activeDemoId];
    if (!state?.screenshotUrl || !state.hash || !state.expectedHash) {
      return undefined;
    }
    if (state.hash !== state.expectedHash) return undefined;
    if (
      !isCanvasScreenshotRenderBoxCompatible(
        state.renderBox,
        pagePreviewSizeMap[activeDemoId],
      )
    ) {
      return undefined;
    }
    return state.screenshotUrl;
  }, [activeDemoId, pagePreviewSizeMap, pageScreenshots]);

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
        presentation: resolvePagePresentation(pageSchemaMap[page.id] ?? ""),
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

      if (page.runtimeType === "sandboxed-html") {
        const sandbox = pageSandboxMapRef.current[page.id] ?? {};
        if (!sandbox.html || !sandbox.meta) return null;
        return {
          ...common,
          runtimeType: "sandboxed-html",
          sandboxHtml: sandbox.html,
          htmlImportMeta: sandbox.meta,
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
    [
      activeDemoId,
      code,
      configDataMap,
      pageCodes,
      pagePreviewSizeMap,
      pageSchemaMap,
    ],
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
        .filter(
          (p) =>
            p.runtimeType !== "prototype-html-css" &&
            p.runtimeType !== "sketch-scene",
        )
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
          const renderMode: "strict" = "strict";
          return [
            {
              ...snapshotInput,
              fullPage: shouldCaptureFullPage(snapshotInput.presentation),
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
  const pageConfigPersistTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const persistPageConfigValues = useCallback(
    (pageId: string, values: Record<string, unknown>) => {
      if (!sessionId) return;
      const timers = pageConfigPersistTimersRef.current;
      if (timers[pageId]) clearTimeout(timers[pageId]);
      timers[pageId] = setTimeout(async () => {
        try {
          await fetch(`/api/sessions/${sessionId}/files/${pageId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ configValues: values }),
          });
        } catch {
          // 静默失败，不影响用户操作
        }
      }, 500);
    },
    [sessionId],
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
      if (!automaticScreenshotGenerationEnabled) return;
      const timers = screenshotRegenerateTimerRef.current;
      if (timers[pageId]) clearTimeout(timers[pageId]);
      timers[pageId] = setTimeout(() => {
        const config = configOverride ?? configDataMapRef.current[pageId] ?? {};
        const page = demoPages.find((item) => item.id === pageId);
        if (!page) {
          delete timers[pageId];
          return;
        }
        if (
          page.runtimeType === "prototype-html-css" ||
          page.runtimeType === "sketch-scene"
        ) {
          delete timers[pageId];
          return;
        }
        const snapshotInput = buildScreenshotPageInput(page, config, pageCode);
        if (!snapshotInput) {
          delete timers[pageId];
          return;
        }
        const regenerateInput: PageSnapshotInput = snapshotInput.runtimeType
          ? (snapshotInput as PageSnapshotInput)
          : { ...snapshotInput, runtimeType: "high-fidelity-react" };
        const { width, height } = getScreenshotRequestSize(
          pagePreviewSizeMap[pageId],
        );
        regeneratePageSnapshot(
          pageId,
          regenerateInput,
          width,
          height,
          shouldCaptureFullPage(regenerateInput.presentation),
          getScreenshotPriority(pageId),
          "strict" as const,
          pageScreenshots[pageId]?.renderBox?.height,
        );
        delete timers[pageId];
      }, 3000);
    },
    [
      buildScreenshotPageInput,
      demoPages,
      getScreenshotPriority,
      pageScreenshots,
      regeneratePageSnapshot,
      pagePreviewSizeMap,
    ],
  );
  const scheduleScreenshotRegenerateRef = useRef<
    typeof scheduleScreenshotRegenerate
  >(scheduleScreenshotRegenerate);
  scheduleScreenshotRegenerateRef.current = scheduleScreenshotRegenerate;

  const regenerateCanvasScreenshots = useCallback(async () => {
    if (!automaticScreenshotGenerationEnabled) return;
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

  const flushPendingPrototypeScreenshots = useCallback(() => {
    const pageIds = [...pendingPrototypeScreenshotPageIdsRef.current];
    pendingPrototypeScreenshotPageIdsRef.current.clear();
    for (const pageId of pageIds) {
      const page = demoPages.find((item) => item.id === pageId);
      if (!page) continue;
      const config = configDataMapRef.current[pageId] ?? {};
      const snapshotInput = buildScreenshotPageInput(page, config);
      if (!snapshotInput) continue;
      const { width, height } = getScreenshotRequestSize(
        pagePreviewSizeMap[pageId],
      );
      const priority = getScreenshotPriority(pageId);
      regeneratePageSnapshot(
        pageId,
        snapshotInput as Parameters<typeof regeneratePageSnapshot>[1],
        width,
        height,
        shouldCaptureFullPage(snapshotInput.presentation),
        priority,
        "strict" as const,
        pageScreenshots[pageId]?.renderBox?.height,
      );
    }
  }, [
    demoPages,
    buildScreenshotPageInput,
    pagePreviewSizeMap,
    getScreenshotPriority,
    regeneratePageSnapshot,
    pageScreenshots,
  ]);

  // 首屏优先加载单页 iframe；批量截图延后到预览 ready 或用户进入画布后。
  useEffect(() => {
    if (!automaticScreenshotGenerationEnabled) return;
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
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("config");
  const [chatElement, setChatElement] = useState<ChatElementRef | null>(null);
  const [chatPageRefs, setChatPageRefs] = useState<ChatPageRef[]>([]);
  const { demos } = useDemos();
  const projectReferences = useMemo(
    () =>
      demos.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        thumbnail: d.thumbnail,
        demoCount: d.demoCount,
        updatedAt: d.updatedAt,
      })),
    [demos],
  );
  const [triggerAutoSend, setTriggerAutoSend] = useState<
    string | AutoRepairTrigger | VisualPropertyAutoSend | null
  >(null);

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
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<
    "admin" | "editor" | "creator" | "readonly" | ""
  >("");
  const collabUser = useMemo(
    () => ({
      userId: sessionId || "anonymous",
      username: currentUsername || "当前用户",
    }),
    [currentUsername, sessionId],
  );

  // 评论功能：API 适配器 + WS 地址 + 当前作者身份（创作端可 @AI）
  const commentApi = useMemo(() => createAuthorCommentApi(demoId), [demoId]);
  const commentWsUrl = useMemo(
    () => `${getBrowserAgentServiceUrl().replace(/^http/, "ws")}/ws/comments`,
    [],
  );
  const commentUser = useMemo<CommentAuthor | null>(() => {
    if (!currentUserId) return null;
    return {
      id: currentUserId,
      name: currentUsername || "当前用户",
      isAnonymous: false,
    };
  }, [currentUserId, currentUsername]);
  // 评论状态：页面级统一管理，CommentLayer（预览区）与右侧栏评论 tab 共享
  const [commentModeActive, setCommentModeActive] = useState(false);
  const [activeCommentThreadId, setActiveCommentThreadId] = useState<
    string | null
  >(null);
  const [activeDocumentCommentTarget, setActiveDocumentCommentTarget] =
    useState<CommentTarget | null>(null);
  const [documentCommentSelection, setDocumentCommentSelection] =
    useState<DocumentCommentAnchor | null>(null);
  const [canvasCommentDraft, setCanvasCommentDraft] =
    useState<CanvasCommentDraft | null>(null);
  const activePageCommentTarget = useMemo<CommentTarget>(
    () => ({ kind: "page", pageId: activeDemoId }),
    [activeDemoId],
  );
  const commentQueryTarget = useMemo<CommentTarget | undefined>(() => {
    if (previewMode === "canvas") {
      return canvasEditingPageId
        ? { kind: "page", pageId: canvasEditingPageId }
        : undefined;
    }
    return activePageCommentTarget;
  }, [activePageCommentTarget, canvasEditingPageId, previewMode]);
  const commentsData = useComments({
    projectId: demoId,
    target: commentQueryTarget,
    api: commentApi,
    wsUrl: commentWsUrl,
    enabled: Boolean(activeDemoId),
  });
  const documentCommentsData = useComments({
    projectId: demoId,
    target: activeDocumentCommentTarget ?? {
      kind: "document",
      resourceId: "",
      resourceLabel: "",
    },
    api: commentApi,
    wsUrl: commentWsUrl,
    enabled: Boolean(activeDocumentCommentTarget),
  });
  const activePageCommentThreads = useMemo(
    () => filterPageCommentThreads(commentsData.threads, activeDemoId),
    [activeDemoId, commentsData.threads],
  );
  const isProjectCommentScope =
    previewMode === "canvas" && !canvasEditingPageId;
  const unresolvedCommentCount = countUnresolvedCommentThreads(
    isProjectCommentScope
      ? filterPageCommentThreads(commentsData.threads)
      : activePageCommentThreads,
  );
  const commentTabLabel =
    unresolvedCommentCount > 0
      ? `评论：有 ${unresolvedCommentCount} 条未解决评论`
      : "评论";
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
            index:
              focusedPage?.runtimeType === "prototype-html-css"
                ? `demos/${focusedPageId}/prototype.html`
                : focusedPage?.runtimeType === "sketch-scene"
                  ? `demos/${focusedPageId}/sketch.scene.json`
                  : `demos/${focusedPageId}/index.tsx`,
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
            sinceStart: payload.sinceStart ?? payload.sinceShellStart,
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
        if (
          source !== "collab" &&
          syncCollab &&
          activeCodeCollab.isSyncedForCurrentDescriptor
        ) {
          replaceCollabText(activeCodeCollab.ytext, newCode);
        }
        setCode((prev) => (prev === newCode ? prev : newCode));
        codeRef.current = newCode;
        if (targetPageId) {
          pageCodesRef.current = {
            ...pageCodesRef.current,
            [targetPageId]: newCode,
          };
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
        if (
          source !== "collab" &&
          syncCollab &&
          activeSchemaCollab.isSyncedForCurrentDescriptor
        ) {
          replaceCollabText(activeSchemaCollab.ytext, newSchema);
        }
        const oldSchema = schemaRef.current;
        setSchema(newSchema);
        schemaRef.current = newSchema;
        if (targetPageId) {
          pageSchemaMapRef.current = {
            ...pageSchemaMapRef.current,
            [targetPageId]: newSchema,
          };
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
      activeCodeCollab.isSyncedForCurrentDescriptor,
      activeCodeCollab.ytext,
      activeSchemaCollab.isSyncedForCurrentDescriptor,
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
    (
      html: string,
      sourcePatch?: { before: string; patches: TextPatch[] },
    ): boolean => {
      const pageId = activeDemoIdRef.current;
      if (!pageId) return false;
      if (
        sourcePatch &&
        !applyCollabTextPatches(
          activePrototypeHtmlCollab.isSyncedForCurrentDescriptor
            ? activePrototypeHtmlCollab.ytext
            : null,
          sourcePatch.before,
          html,
          sourcePatch.patches,
        )
      ) {
        return false;
      }
      setPagePrototypeMap((prev) => ({
        ...prev,
        [pageId]: {
          ...(prev[pageId] ?? {}),
          html,
        },
      }));
      markScreenshotDirty(pageId);
      persistPrototypePageDraft(pageId, { html });
      markWorkspaceChanged();
      return true;
    },
    [
      activePrototypeHtmlCollab.isSyncedForCurrentDescriptor,
      activePrototypeHtmlCollab.ytext,
      markScreenshotDirty,
      markWorkspaceChanged,
      persistPrototypePageDraft,
    ],
  );

  const prototypeVisualHistoryRef = useRef<
    Record<
      string,
      {
        undo: PrototypeVisualHistoryEntry[];
        redo: PrototypeVisualHistoryEntry[];
      }
    >
  >({});

  const getPrototypeVisualHistory = useCallback((pageId: string) => {
    const existing = prototypeVisualHistoryRef.current[pageId];
    if (existing) return existing;
    const created = { undo: [], redo: [] };
    prototypeVisualHistoryRef.current[pageId] = created;
    return created;
  }, []);

  const applyActivePrototypeVisualPropertyChange = useCallback(
    (
      node: VisualNodeInfo,
      property: string,
      value: string,
      kind: VisualPropertyChangeKind,
    ) => {
      const pageId = activeDemoIdRef.current;
      const currentHtml = pageId
        ? activePrototypeHtmlCollab.isSyncedForCurrentDescriptor &&
          activePrototypeHtmlCollab.ytext
          ? activePrototypeHtmlCollab.ytext.toString()
          : pagePrototypeMapRef.current[pageId]?.html
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
      const applied = applyPrototypeHtmlToActivePage(
        result.html,
        result.forwardPatches
          ? { before: currentHtml, patches: result.forwardPatches }
          : undefined,
      );
      if (applied && result.forwardPatches && result.inversePatches) {
        const history = getPrototypeVisualHistory(pageId);
        history.undo.push({
          pageId,
          changeId: `${node.domPath || node.nodeId}:${kind}:${property}`,
          before: currentHtml,
          after: result.html,
          forwardPatches: result.forwardPatches,
          inversePatches: result.inversePatches,
        });
        if (history.undo.length > 100) history.undo.shift();
        history.redo = [];
      }
      return applied;
    },
    [
      activePrototypeHtmlCollab.isSyncedForCurrentDescriptor,
      activePrototypeHtmlCollab.ytext,
      applyPrototypeHtmlToActivePage,
      getPrototypeVisualHistory,
    ],
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
  const activePageForVisualAccess = demoPages.find(
    (page) => page.id === activeDemoId,
  );
  const activePageIsTemplate = Boolean(
    (activePageForVisualAccess as { isTemplatePage?: boolean } | undefined)
      ?.isTemplatePage,
  );
  const canUseVisualEditor =
    currentUserRole === "admin" ||
    (currentUserRole !== "" && !activePageIsTemplate);
  const visualEditState = useVisualEditState({
    codeRef,
    schemaRef,
    projectConfigSchema,
    activeDemoIdRef,
    sessionId,
    activeDemoId,
    projectId: demoId,
    canUseVisualEditor,
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
    selectedVisualNode,
    setSelectedVisualNode,
    visualNodeStack,
    setVisualNodeStack,
    visualPanelHoverNodeId,
    setVisualPanelHoverNodeId,
    visualPropertyChanges,
    setVisualPropertyChanges,
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
    visualAnnotationMode,
    setVisualAnnotationMode,
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
    visualConfigFieldKey,
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

  const handlePrototypeVisualTextChange = useCallback(
    (node: VisualNodeInfo, nextText: string, previousText: string) => {
      const pageId = activeDemoIdRef.current;
      const bindingKey =
        node.binding?.kind === "text" ? node.binding.key.trim() : "";
      if (bindingKey) {
        const nextPageConfig = {
          ...(configDataMapRef.current[pageId] ?? {}),
          [bindingKey]: nextText,
        };
        configDataMapRef.current = {
          ...configDataMapRef.current,
          [pageId]: nextPageConfig,
        };
        setConfigDataMap((previous) => ({
          ...previous,
          [pageId]: nextPageConfig,
        }));
        persistPageConfigValues(pageId, nextPageConfig);
        markScreenshotDirty(pageId);
        markWorkspaceChanged();
        return;
      }

      handleVisualPropertyChange(
        node,
        "text",
        "文本",
        nextText,
        "text",
        previousText,
      );
    },
    [
      handleVisualPropertyChange,
      markScreenshotDirty,
      markWorkspaceChanged,
      persistPageConfigValues,
    ],
  );

  const applyPrototypeVisualHistory = useCallback(
    (direction: "undo" | "redo"): "applied" | "empty" | "conflict" => {
      const pageId = activeDemoIdRef.current;
      const history = getPrototypeVisualHistory(pageId);
      const source = direction === "undo" ? history.undo : history.redo;
      const destination = direction === "undo" ? history.redo : history.undo;
      const entry = source.pop();
      if (!entry) return "empty";

      const currentHtml =
        activePrototypeHtmlCollab.isSyncedForCurrentDescriptor &&
        activePrototypeHtmlCollab.ytext
          ? activePrototypeHtmlCollab.ytext.toString()
          : (pagePrototypeMapRef.current[pageId]?.html ?? "");
      const expectedCurrent = direction === "undo" ? entry.after : entry.before;
      if (currentHtml !== expectedCurrent) {
        source.push(entry);
        return "conflict";
      }

      const patches =
        direction === "undo" ? entry.inversePatches : entry.forwardPatches;
      const nextHtml = applyTextPatches(currentHtml, patches);
      const expectedNext = direction === "undo" ? entry.before : entry.after;
      if (
        nextHtml !== expectedNext ||
        !applyPrototypeHtmlToActivePage(nextHtml, {
          before: currentHtml,
          patches,
        })
      ) {
        source.push(entry);
        return "conflict";
      }

      destination.push(entry);
      if (direction === "undo") {
        setVisualPropertyChanges((previous) =>
          previous.filter((change) => change.id !== entry.changeId),
        );
      }
      return "applied";
    },
    [
      activePrototypeHtmlCollab.isSyncedForCurrentDescriptor,
      activePrototypeHtmlCollab.ytext,
      applyPrototypeHtmlToActivePage,
      getPrototypeVisualHistory,
      setVisualPropertyChanges,
    ],
  );

  const [visualLayerTreeRequestKey, setVisualLayerTreeRequestKey] = useState(0);
  const [visualLayerTreeNodes, setVisualLayerTreeNodes] = useState<
    VisualNodeTreeItem[]
  >([]);
  const [hiddenVisualNodeIds, setHiddenVisualNodeIds] = useState<string[]>([]);
  const [staticPrototypeRequestKey, setStaticPrototypeRequestKey] = useState(0);
  const pendingStaticPrototypeConversionRef =
    useRef<RuntimeConversionState | null>(null);
  const [pageSnapshots, setPageSnapshots] = useState<
    Record<
      string,
      {
        html: string;
        css: string;
        quality: SnapshotQuality;
        rejectionReasons: SnapshotRejectionReason[];
      }
    >
  >({});
  const pendingSnapshotPageIdRef = useRef<string | null>(null);
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
    setVisualLayerTreeNodes((current) => (current.length === 0 ? current : []));
    setHiddenVisualNodeIds((current) => (current.length === 0 ? current : []));
    setVisualLayerTreeRequestKey((key) => key + 1);
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
      // 队列曾失败时不能永久阻止发布；以最新值在 Authority 基线下重试。
      const saved = await persistProjectConfigValues(
        projectConfigValuesRef.current,
      );
      if (!saved) {
        throw new Error("共享配置保存失败，请重试后再发布");
      }
    },
    onSaveComplete: flushPendingPrototypeScreenshots,
  });
  const {
    publishStatus,
    setPublishStatus,
    publishing,
    unpublishing,
    versionHistory,
    pageVersionHistories,
    restoring,
    previewVersion,
    setPreviewVersion,
    publishedVersion,
    loadVersionHistory,
    loadPageVersionHistories,
    handlePublish,
    handleUnpublish,
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

  useEffect(() => {
    const markPublishedSnapshotStale = () => {
      setPublishStatus(markWorkspaceDocumentChanged);
    };
    window.addEventListener("design-spec-updated", markPublishedSnapshotStale);
    window.addEventListener("knowledge-updated", markPublishedSnapshotStale);
    return () => {
      window.removeEventListener(
        "design-spec-updated",
        markPublishedSnapshotStale,
      );
      window.removeEventListener(
        "knowledge-updated",
        markPublishedSnapshotStale,
      );
    };
  }, [setPublishStatus]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCreateVersionWithScreenshot = useCallback(
    async (versionName?: string) => {
      const result = await handleCreateVersion(versionName);
      if (result) {
        flushPendingPrototypeScreenshots();
      }
      return result;
    },
    [handleCreateVersion, flushPendingPrototypeScreenshots],
  );

  const handlePublishWithScreenshot = useCallback(async () => {
    await handlePublish();
    flushPendingPrototypeScreenshots();
  }, [handlePublish, flushPendingPrototypeScreenshots]);

  useEffect(() => {
    if (!activeCodeCollab.isSyncedForCurrentDescriptor) return;
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
    activeCodeCollab.isSyncedForCurrentDescriptor,
    activeCodeCollab.value,
    activeCodeCollab.ytext,
    applyDemoSnapshot,
  ]);

  useEffect(() => {
    if (!activeSchemaCollab.isSyncedForCurrentDescriptor) return;
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
    activeSchemaCollab.isSyncedForCurrentDescriptor,
    activeSchemaCollab.value,
    activeSchemaCollab.ytext,
    applyDemoSnapshot,
  ]);

  useEffect(() => {
    if (!activePrototypeHtmlCollab.isSyncedForCurrentDescriptor) return;
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
    markScreenshotDirty(currentPageId);
  }, [
    activePrototypeHtmlCollab.isSyncedForCurrentDescriptor,
    activePrototypeHtmlCollab.value,
    activePrototypeHtmlCollab.ytext,
    markScreenshotDirty,
  ]);

  useEffect(() => {
    if (!activePrototypeCssCollab.isSyncedForCurrentDescriptor) return;
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
    markScreenshotDirty(currentPageId);
  }, [
    activePrototypeCssCollab.isSyncedForCurrentDescriptor,
    activePrototypeCssCollab.value,
    activePrototypeCssCollab.ytext,
    markScreenshotDirty,
  ]);

  useEffect(() => {
    if (!activeSketchSceneCollab.isSyncedForCurrentDescriptor) return;
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
    markScreenshotDirty(currentPageId);
  }, [
    activeSketchSceneCollab.isSyncedForCurrentDescriptor,
    activeSketchSceneCollab.value,
    activeSketchSceneCollab.ytext,
    markScreenshotDirty,
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
    const rebased = rebaseRemoteCanvasState(remoteState);
    if (rebased.conflicts.length > 0) {
      toast({
        title: "画布协作冲突",
        description: `以下对象被同时修改：${rebased.conflicts.join("、")}。已保留本地草稿，请刷新后手动确认。`,
        variant: "destructive",
      });
    }
  }, [
    canvasLayoutCollab.status,
    canvasLayoutCollab.value,
    rebaseRemoteCanvasState,
    toast,
  ]);

  useEffect(() => {
    if (canvasLayoutCollab.status !== "synced" || !hasUnsavedCanvasChanges)
      return;
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

  const handlePageRename = useCallback(
    async (pageId: string, name: string): Promise<boolean> => {
      if (!sessionId) return false;
      try {
        const res = await fetch(`/api/projects/${demoId}/demos/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, name }),
        });
        const data = await res.json();
        if (!data.success) {
          toast({
            title: "更新失败",
            description: data.error?.message,
            variant: "destructive",
          });
          return false;
        }

        setDemoPages((prev) =>
          prev.map((page) => (page.id === pageId ? { ...page, name } : page)),
        );
        handleWorkspaceTreeChanged();
        toast({ title: "名称已更新" });
        return true;
      } catch {
        toast({ title: "更新失败", variant: "destructive" });
        return false;
      }
    },
    [demoId, handleWorkspaceTreeChanged, sessionId, toast],
  );

  useEffect(() => {
    const loadDemo = async () => {
      let bootstrapReady = false;
      try {
        setIsLoading(true);
        setBootstrapError(null);
        setInitialPageError(null);

        const userAuthoringPreferencesPromise = fetch(
          "/api/user/authoring-preferences",
        );
        void userAuthoringPreferencesPromise
          .then(async (response) => {
            if (!response.ok) return;
            const data = await response.json();
            if (data.success) {
              setUserAuthoringPreferences(data.data?.preferences);
            }
          })
          .catch(() => {
            // 用户偏好不是编辑器启动门禁，失败时使用默认值。
          });

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
        setDemoName(sessionData.data.project?.name || demoId);
        setCurrentThumbnail(sessionData.data.project?.thumbnail);
        setProjectType(
          sessionData.data.project?.projectType === "template"
            ? "template"
            : "standard",
        );
        setProjectAuthoringPreferences(
          sessionData.data.project?.authoringPreferences,
        );
        setDemoPages(sessionData.data.demoPages || []);
        setDemoFolders(sessionData.data.demoFolders || []);
        setProjectConfigSchema(sessionData.data.projectConfigSchema);
        projectConfigSchemaRef.current = sessionData.data.projectConfigSchema;
        setProjectConfigValues(sessionData.data.projectConfigValues ?? {});
        const initialPageId = sessionData.data.activePageId || "";
        setActiveDemoId(initialPageId);
        activeDemoIdRef.current = initialPageId;

        bootstrapReady = true;
        setIsLoading(false);

        let initialPageFiles: Record<string, unknown> | null = null;
        if (initialPageId) {
          setIsInitialPageLoading(true);
          const pageFilesRes = await fetch(
            `/api/sessions/${sessionData.data.sessionId}/files/${initialPageId}`,
          );
          if (!pageFilesRes.ok) {
            throw new Error("加载当前页失败");
          }
          const pageFilesData = await pageFilesRes.json();
          if (!pageFilesData.success) {
            throw new Error(pageFilesData.error?.message || "加载当前页失败");
          }
          initialPageFiles = pageFilesData.data;
        }

        const multi = {
          ...sessionData.data,
          demos:
            initialPageId && initialPageFiles
              ? { [initialPageId]: initialPageFiles }
              : {},
        };
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
        const previewSizeMap: Record<string, PreviewSize> = {};
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
          const demoIds = Object.keys(multi.demos);
          const targetDemoId =
            initialPageId && demoIds.includes(initialPageId)
              ? initialPageId
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
        codeRef.current = loadedCode;
        setSchema(loadedSchema);
        schemaRef.current = loadedSchema;
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
              configValues?: Record<string, unknown>;
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
            allDefaults[pageId] = {
              ...allDefaults[pageId],
              ...(demo.configValues ?? {}),
            };
            if (demo.schema) {
              allDefaults[pageId] = flattenNestedDelta(
                allDefaults[pageId],
                demo.schema,
              );
            }
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
        pageCodesRef.current = codes;
        pageSchemaMapRef.current = {
          ...pageSchemaMapRef.current,
          ...schemas,
        };
        setPageCodes(codes);
        setPagePrototypeMap(prototypes);
        setPageSketchMap(sketches);
        setPageSchemaMap((prev) => mergeLoadedPageSchemas(prev, schemas));

        const size = getPreviewSize(loadedSchema);
        setPreviewSize(size);
        setAgentSessionId(sessionData.data.sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        if (bootstrapReady) {
          setInitialPageError(message);
        } else {
          setBootstrapError(message);
          toastRef.current({
            title: "加载失败",
            description: message,
            variant: "destructive",
          });
        }
      } finally {
        setIsLoading(false);
        setIsInitialPageLoading(false);
      }
    };

    loadDemo();
  }, [demoId, loadAttempt]);

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
    markScreenshotDirty(currentPageId);
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
    // 代码变更后标记截图脏，持久化管线完成后再触发截图再生
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePageConfigPanelChange = useCallback(
    (pageId: string, data: Record<string, unknown>) => {
      const schema = pageSchemaMapRef.current[pageId];
      const dataClean = schema ? flattenNestedDelta(data, schema) : data;
      const prevClean = schema
        ? flattenNestedDelta(configDataMapRef.current[pageId] ?? {}, schema)
        : (configDataMapRef.current[pageId] ?? {});
      const nextPageConfig = { ...prevClean, ...dataClean };
      setConfigDataMap((prev) => ({
        ...prev,
        [pageId]: nextPageConfig,
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleWhiteboardCommitted = useCallback(
    (target: WhiteboardCommitTarget, values: Record<string, unknown>) => {
      if (target.scope === "project") {
        setProjectConfigValues(values);
        return;
      }
      if (!target.pageId) return;
      setConfigDataMap((current) => ({ ...current, [target.pageId!]: values }));
    },
    [],
  );

  const launchWhiteboard = useCallback((target: ImageConfigTarget) => {
    if (
      (target.scope !== "page" && target.scope !== "project") ||
      !target.fieldPath
    )
      return;
    setWhiteboardTarget({
      scope: target.scope,
      ...(target.pageId ? { pageId: target.pageId } : {}),
      fieldPath: target.fieldPath,
      ...(target.listItem ? { listItem: target.listItem } : {}),
      ...(target.currentValue ? { currentValue: target.currentValue } : {}),
      ...(target.onCommit ? { onCommit: target.onCommit } : {}),
    });
  }, []);

  handlePageConfigPanelChangeRef.current = handlePageConfigPanelChange;

  const loadPageRequirements = useCallback(
    async (pageId: string) => {
      if (!sessionId) return;
      setRequirementsLoading(true);
      try {
        const response = await fetch(
          `/api/projects/${demoId}/demos/${pageId}/requirements?sessionId=${encodeURIComponent(sessionId)}`,
        );
        const data = await response.json().catch(() => null);
        if (response.ok && data?.success) {
          setRequirementsMap((prev) => ({
            ...prev,
            [pageId]: data.data?.requirements ?? "",
          }));
        }
      } catch {
        // 读取失败不阻断编辑，配置要求保持为空
      } finally {
        setRequirementsLoading(false);
      }
    },
    [demoId, sessionId],
  );

  const handlePageRequirementsChange = useCallback(
    async (pageId: string, markdown: string) => {
      if (!sessionId) return;
      setRequirementsMap((prev) => ({ ...prev, [pageId]: markdown }));
      try {
        await fetch(`/api/projects/${demoId}/demos/${pageId}/requirements`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, requirements: markdown }),
        });
      } catch {
        // 静默失败，下次进入编辑态仍可重新保存
      }
    },
    [demoId, sessionId],
  );

  const handlePositionChange = useCallback(
    (key: string, x: number, y: number) => {
      const pageId = activeDemoIdRef.current;
      if (!pageId) return;
      if (positionEditTargetRef.current?.id !== key) return;
      const fieldPath = positionFieldPathRef.current[key];
      if (!fieldPath) return;
      const currentConfig = configDataMapRef.current[pageId] || {};
      const newConfig = setNestedValue(currentConfig, fieldPath, { x, y });
      handlePageConfigPanelChangeRef.current(pageId, newConfig);
    },
    [],
  );

  const handlePositionDrag = useCallback((key: string) => {
    // 拖动过程是 iframe 内的临时交互事务，只由 transform 呈现。
    // 此处不写入 React 配置状态，避免每帧重渲染表单与预览；
    // pointerup 的 POSITION_CHANGE 会一次性提交最终坐标。
    if (positionEditTargetRef.current?.id !== key) return;
  }, []);

  const handleProjectConfigPanelChange = useCallback(
    (data: Record<string, unknown>) => {
      const nextProjectConfigValues = {
        ...projectConfigValuesRef.current,
        ...data,
      };
      // 立即更新 ref，保证紧跟在本次输入后的发布会等待这次保存。
      projectConfigValuesRef.current = nextProjectConfigValues;
      setProjectConfigValues(nextProjectConfigValues);
      void persistProjectConfigValues(nextProjectConfigValues);
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
        return next;
      });
    },
    [demoPages, persistProjectConfigValues],
  );

  const handleSchemaChange = useCallback(
    (newSchema: string) => {
      replaceCollabText(
        activeSchemaCollab.isSyncedForCurrentDescriptor
          ? activeSchemaCollab.ytext
          : null,
        newSchema,
      );
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
    [
      activeSchemaCollab.isSyncedForCurrentDescriptor,
      activeSchemaCollab.ytext,
      code,
    ],
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

  const handleSavePagePresentation = useCallback(
    (presentation: PagePresentationProfile) => {
      const pageId = activeDemoIdRef.current;
      if (!pageId) return;
      const currentSchema = pageSchemaMapRef.current[pageId];
      if (!currentSchema) {
        toast({
          title: "无法保存展示尺寸",
          description: "页面配置尚未加载。",
          variant: "destructive",
        });
        return;
      }
      try {
        const nextSchema = applyPagePresentationToSchema(
          currentSchema,
          presentation,
        );
        handlePageSchemaChange(pageId, nextSchema);
        const nextSize = { ...presentation.viewport };
        setPagePreviewSizeMap((current) => ({
          ...current,
          [pageId]: nextSize,
        }));
        setPreviewSize(nextSize);
        setTemporaryPresentation(undefined);
        markScreenshotDirty(pageId);
        markWorkspaceChanged();
        toast({
          title: "已设为页面默认视口",
          description: `${presentation.viewport.width}×${presentation.viewport.height}`,
        });
      } catch (error) {
        toast({
          title: "无法保存展示尺寸",
          description: error instanceof Error ? error.message : "页面配置无效",
          variant: "destructive",
        });
      }
    },
    [handlePageSchemaChange, markScreenshotDirty, markWorkspaceChanged, toast],
  );

  const handlePageDefinitionChange = useCallback(
    (pageId: string, mutation: SchemaDefinitionMutation) => {
      handlePageSchemaChange(pageId, mutation.schema);
      setConfigDataMap((previous) => {
        const current = previous[pageId] ?? {};
        const next = { ...current, ...mutation.valuePlan.setDefaults };
        for (const key of mutation.valuePlan.removeKeys) delete next[key];
        persistPageConfigValues(pageId, next);
        return { ...previous, [pageId]: next };
      });
      markScreenshotDirty(pageId);
      markWorkspaceChanged();
    },
    [
      handlePageSchemaChange,
      markScreenshotDirty,
      markWorkspaceChanged,
      persistPageConfigValues,
    ],
  );

  const handleSaveAsDefaults = useCallback(
    (pageId: string, defaultValues?: Record<string, unknown>) => {
      const currentSchema = pageSchemaMapRef.current[pageId];
      const currentConfig = defaultValues ?? configDataMapRef.current[pageId];
      if (!currentSchema || !currentConfig) {
        toast({
          title: "保存失败",
          description: "未找到配置数据",
          variant: "destructive",
        });
        return;
      }

      try {
        const schemaObj = JSON.parse(currentSchema);
        if (!schemaObj.properties || typeof schemaObj.properties !== "object") {
          toast({
            title: "保存失败",
            description: "Schema 中无 properties 定义",
            variant: "destructive",
          });
          return;
        }

        const metaKeys = new Set<string>();
        let updatedCount = 0;
        for (const [key, value] of Object.entries(currentConfig)) {
          if (metaKeys.has(key)) continue;
          if (!(key in schemaObj.properties)) continue;
          if (
            schemaObj.properties[key] &&
            typeof schemaObj.properties[key] === "object"
          ) {
            schemaObj.properties[key].default = value;
            updatedCount++;
          }
        }

        const newSchema = JSON.stringify(schemaObj, null, 2);
        handlePageSchemaChange(pageId, newSchema);
        persistPageConfigValues(pageId, currentConfig);
        toast({
          title: "配置已保存",
          description: `已更新 ${updatedCount} 个字段的默认值`,
        });
      } catch {
        toast({
          title: "保存失败",
          description: "无法解析当前 Schema",
          variant: "destructive",
        });
      }
    },
    [handlePageSchemaChange, persistPageConfigValues, toast],
  );

  const handleRestoreDefaults = useCallback(
    (pageId: string) => {
      const pageSchema = pageSchemaMapRef.current[pageId];
      if (!pageSchema) return;
      try {
        const mergedDefaults = mergeConfigToProps(
          projectConfigSchemaRef.current,
          pageSchema,
        );
        handlePageConfigPanelChange(pageId, mergedDefaults);
      } catch {
        // Schema 冲突等异常场景静默忽略
      }
    },
    [handlePageConfigPanelChange],
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
      for (const pageId of affectedPageIds) {
        markScreenshotDirty(pageId);
      }
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
        return next;
      });

      markWorkspaceChanged();
    },
    [
      demoPages,
      getSafeMergedDefaults,
      markScreenshotDirty,
      markWorkspaceChanged,
      projectSchemaCollab.ytext,
    ],
  );

  const handleProjectDefinitionChange = useCallback(
    (mutation: SchemaDefinitionMutation) => {
      handleProjectSchemaChange(mutation.schema);
      const nextProjectValues = {
        ...projectConfigValuesRef.current,
        ...mutation.valuePlan.setDefaults,
      };
      for (const key of mutation.valuePlan.removeKeys)
        delete nextProjectValues[key];
      projectConfigValuesRef.current = nextProjectValues;
      setProjectConfigValues(nextProjectValues);
      void persistProjectConfigValues(nextProjectValues);
      setConfigDataMap((previous) => {
        const next: Record<string, Record<string, unknown>> = {};
        for (const [pageId, values] of Object.entries(previous)) {
          next[pageId] = { ...values, ...mutation.valuePlan.setDefaults };
          for (const key of mutation.valuePlan.removeKeys)
            delete next[pageId][key];
        }
        return next;
      });
    },
    [handleProjectSchemaChange, persistProjectConfigValues],
  );

  const handleConfigDefinitionSendToAI = useCallback(
    (scope: "project" | "page", mutation: SchemaDefinitionMutation) => {
      const changedKeys = [
        ...mutation.diff.added,
        ...mutation.diff.updated,
        ...mutation.diff.deleted,
      ];
      const targetPageIds =
        scope === "project"
          ? demoPages.map((page) => page.id)
          : activeDemoIdRef.current
            ? [activeDemoIdRef.current]
            : [];
      const bindings = targetPageIds.flatMap((pageId) => {
        const page = demoPages.find((item) => item.id === pageId);
        if (!page) return [];
        const keys =
          page.runtimeType === "prototype-html-css"
            ? extractPrototypeConfigBindingKeys(pagePrototypeMap[pageId]?.html)
            : extractCodeConfigBindingKeys(pageCodes[pageId], changedKeys);
        return keys
          .filter((key) => changedKeys.includes(key))
          .map((key) => `- ${page.name} (${pageId})：${key}`);
      });
      const operation = mutation.diff.deleted.length
        ? "清理已删除字段的页面消费"
        : mutation.diff.typeChanged.length
          ? "适配已变更字段类型的页面消费"
          : "让页面接入新增或更新的字段";
      const aiPrompt = `【目标】${operation}\n\n【作用域】${scope === "project" ? "项目级共享配置" : "当前页面配置"}\n【页面】${targetPageIds.map((id) => demoPages.find((page) => page.id === id)?.name ?? id).join("、")}\n\n【Schema 变更】\n- 新增：${mutation.diff.added.join("、") || "无"}\n- 更新：${mutation.diff.updated.join("、") || "无"}\n- 删除：${mutation.diff.deleted.join("、") || "无"}\n- 类型变化：${mutation.diff.typeChanged.join("、") || "无"}\n- 已保存的 Schema 定义已在工作区生效；请读取对应 config.schema.json 确认完整规则。\n\n【已发现页面绑定】\n${bindings.join("\n") || "- 暂未发现绑定；如需页面展示新字段，请按现有页面模式接入。"}\n\n【必须完成】\n1. 修改受影响页面的 React props 或原型 data-bind-* / {{fieldKey}} 绑定；保持现有视觉效果。\n2. 清理已删除字段的引用，或适配类型变化；不要扩大配置范围。\n3. 检查页面配置要求和设计规范中的相关引用，必要时更新引用。\n\n【验收】\n完成 Schema 校验与配置预览联动，并在回复中报告 workspace mutation receipt 与验证结果。`;
      setTabValue("ai");
      setTriggerAutoSend(aiPrompt);
      toast({ title: "定义已保存，正在交给 AI 同步页面" });
    },
    [demoPages, pageCodes, pagePrototypeMap, toast],
  );

  const handleConfigDefinitionAnalyze = useCallback(
    (scope: "project" | "page", mutation: SchemaDefinitionMutation) => {
      const report = analyzeConfigDefinitionImpact({
        scope,
        pageId: activeDemoIdRef.current ?? undefined,
        mutation,
        pages: demoPages.map((page) => ({
          pageId: page.id,
          pageName: page.name,
          runtimeType: page.runtimeType,
          code: pageCodes[page.id],
          prototypeHtml: pagePrototypeMap[page.id]?.html,
          requirements:
            requirementsMap[page.id] ?? referencePageRequirements[page.id],
        })),
      });
      return {
        risk: report.risk,
        boundPages: report.boundPages.map(({ pageName, keys }) => ({
          pageName,
          keys,
        })),
        requirementRefCount: report.requirementRefs.length,
        designSpecRefCount: 0,
      };
    },
    [
      demoPages,
      pageCodes,
      pagePrototypeMap,
      referencePageRequirements,
      requirementsMap,
    ],
  );

  const handleProjectSaveAsDefaults = useCallback(
    (defaultValues?: Record<string, unknown>) => {
      const currentSchema = projectConfigSchemaRef.current;
      const currentConfig = defaultValues ?? projectConfigValuesRef.current;
      if (!currentSchema || !currentConfig) {
        toast({
          title: "保存失败",
          description: "未找到配置数据",
          variant: "destructive",
        });
        return;
      }

      try {
        const schemaObj = JSON.parse(currentSchema);
        if (!schemaObj.properties || typeof schemaObj.properties !== "object") {
          toast({
            title: "保存失败",
            description: "Schema 中无 properties 定义",
            variant: "destructive",
          });
          return;
        }

        let updatedCount = 0;
        for (const [key, value] of Object.entries(currentConfig)) {
          if (!(key in schemaObj.properties)) continue;
          if (
            schemaObj.properties[key] &&
            typeof schemaObj.properties[key] === "object"
          ) {
            schemaObj.properties[key].default = value;
            updatedCount++;
          }
        }

        const newSchema = JSON.stringify(schemaObj, null, 2);
        handleProjectSchemaChange(newSchema);
        void persistProjectConfigValues(currentConfig);
        toast({
          title: "共享配置已保存",
          description: `已更新 ${updatedCount} 个字段的默认值`,
        });
      } catch {
        toast({
          title: "保存失败",
          description: "无法解析当前 Schema",
          variant: "destructive",
        });
      }
    },
    [handleProjectSchemaChange, persistProjectConfigValues, toast],
  );

  const handleProjectRestoreDefaults = useCallback(() => {
    const projectSchema = projectConfigSchemaRef.current;
    if (!projectSchema) return;
    try {
      const projectDefaults = getDefaultValues(projectSchema);
      handleProjectConfigPanelChange(projectDefaults);
    } catch {
      // Schema 冲突等异常场景静默忽略
    }
  }, [handleProjectConfigPanelChange]);

  const updatePageSchemaMapFromLoad = useCallback(
    (pageId: string, loadedSchema: string) => {
      pageSchemaMapRef.current = {
        ...pageSchemaMapRef.current,
        [pageId]: loadedSchema,
      };
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
    if (!sessionId || demoPages.length === 0) {
      return "";
    }
    // 单页首次进入时，活动页内容可能尚未进入按页缓存（例如 bootstrap
    // 只返回了页面树）。画布模式原本会补齐所有页面，导致“切到画布再切回
    // 单页”看起来像修复了白屏。单页只补齐当前页，画布继续补齐全部页面。
    const candidatePages =
      previewMode === "canvas"
        ? demoPages
        : demoPages.filter((page) => page.id === activeDemoId);

    return candidatePages
      .filter((page) => {
        if (page.runtimeType === "prototype-html-css") {
          return !hasLoadedPrototypeHtml(pagePrototypeMap[page.id]?.html);
        }
        if (page.runtimeType === "sketch-scene") {
          return pageSketchMap[page.id] === undefined;
        }
        if (page.runtimeType === "sandboxed-html") {
          return (
            pageSandboxMap[page.id] === undefined ||
            sandboxExecutionMap[page.id] === undefined
          );
        }
        return pageCodes[page.id] === undefined;
      })
      .map((page) => page.id)
      .join("\0");
  }, [
    activeDemoId,
    demoPages,
    pageCodes,
    pagePrototypeMap,
    pageSandboxMap,
    pageSketchMap,
    previewMode,
    sandboxExecutionMap,
    sessionId,
  ]);

  useEffect(() => {
    if (!sessionId || !canvasMissingPageIdsKey) return;

    const missingPageIds = canvasMissingPageIdsKey.split("\0");
    if (missingPageIds.length === 0) return;

    let cancelled = false;

    const loadMissingPageContent = async () => {
      try {
        const loadedPages = await Promise.all(
          missingPageIds.map(async (pageId) => {
            const page = demoPages.find((item) => item.id === pageId);
            if (!page) return null;
            try {
              const data = await loadCanvasPageContent({
                page,
                projectId: demoId,
                sessionId,
              });
              return {
                pageId,
                code: data.code ?? "",
                schema: data.schema ?? "",
                configData: data.configData,
                prototypeHtml: data.prototypeHtml,
                prototypeCss: data.prototypeCss,
                prototypeMeta: data.prototypeMeta as
                  | PrototypePageMeta
                  | undefined,
                sandboxHtml: data.sandboxHtml,
                htmlImportMeta: data.htmlImportMeta as
                  | HtmlImportMeta
                  | undefined,
                sketchScene: data.sketchScene,
                sketchMeta: data.sketchMeta,
                sandboxExecutionUrl: data.sandboxExecutionUrl,
                sandboxChannelId: data.sandboxChannelId,
              };
            } catch (error) {
              // 删除页面会让已经发出的画布补齐请求收到 404。此时 effect
              // 通常已经因页面树更新而清理；若响应恰好先到，也应按陈旧
              // 请求处理，避免把正常删除竞态打印成控制台错误。
              const pageStillExists = demoPagesRef.current.some(
                (item) => item.id === pageId,
              );
              if (cancelled || !pageStillExists) return null;
              console.error("加载画布页面内容失败:", pageId, error);
              return null;
            }
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
        const nextSandboxes: Record<
          string,
          { html?: string; meta?: HtmlImportMeta }
        > = {};
        const nextSchemas: Record<string, string> = {};
        const nextDefaults: Record<string, Record<string, unknown>> = {};
        const nextPreviewSizes: Record<string, PreviewSize> = {};
        const nextSandboxExecutions: Record<
          string,
          { url?: string; channelId?: string }
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
          if (
            page.sandboxHtml !== undefined ||
            page.htmlImportMeta !== undefined
          ) {
            nextSandboxes[page.pageId] = {
              html: page.sandboxHtml,
              meta: page.htmlImportMeta,
            };
          }
          nextDefaults[page.pageId] = {
            ...getSafeMergedDefaults(page.schema),
            ...(page.configData ?? {}),
          };
          if (
            page.sandboxExecutionUrl !== undefined ||
            page.sandboxChannelId !== undefined
          ) {
            nextSandboxExecutions[page.pageId] = {
              url: page.sandboxExecutionUrl,
              channelId: page.sandboxChannelId,
            };
          }
          const size = getPreviewSize(page.schema);
          if (size) {
            nextPreviewSizes[page.pageId] = size;
          }
        }

        if (!loadedPages.some((page) => page !== null)) return;

        setPageCodes((prev) => ({ ...prev, ...nextCodes }));
        setPagePrototypeMap((prev) => ({ ...prev, ...nextPrototypes }));
        setPageSketchMap((prev) => ({ ...prev, ...nextSketches }));
        setPageSandboxMap((prev) => ({ ...prev, ...nextSandboxes }));
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
        setSandboxExecutionMap((prev) => ({
          ...prev,
          ...nextSandboxExecutions,
        }));
      } catch (err) {
        console.error("加载预览页面内容失败:", err);
      }
    };

    void loadMissingPageContent();

    return () => {
      cancelled = true;
    };
  }, [
    canvasMissingPageIdsKey,
    demoId,
    demoPages,
    getSafeMergedDefaults,
    sessionId,
  ]);

  const handleConfigPanelPageSelect = useCallback(
    async (
      pageId: string,
      suppliedPage?: DemoPageMeta,
      {
        focusCanvas = true,
        openConfigDetail = true,
      }: { focusCanvas?: boolean; openConfigDetail?: boolean } = {},
    ) => {
      rememberActivePageSchema();
      if (!sessionId) return;
      const requestId = ++pageSwitchRequestRef.current;
      pageSwitchInFlightRef.current = true;
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
        pageSwitchDeferredSyncRef.current = true;
      }
      try {
        const selectedPage =
          suppliedPage ?? demoPages.find((page) => page.id === pageId);
        if (!selectedPage) return;
        const data = await loadCanvasPageContent({
          page: selectedPage,
          projectId: demoId,
          sessionId,
        });
        if (requestId !== pageSwitchRequestRef.current) return;
        {
          const prototypeMeta = data.prototypeMeta as
            | PrototypePageMeta
            | undefined;
          const nextCode = data.code ?? "";
          const nextSchema = data.schema ?? "";
          pageCodesRef.current = {
            ...pageCodesRef.current,
            [pageId]: nextCode,
          };
          pageSchemaMapRef.current = {
            ...pageSchemaMapRef.current,
            [pageId]: nextSchema,
          };
          setPageCodes((prev) => ({ ...prev, [pageId]: nextCode }));
          if (
            data.prototypeHtml !== undefined ||
            data.prototypeCss !== undefined
          ) {
            setPagePrototypeMap((prev) => ({
              ...prev,
              [pageId]: {
                html: data.prototypeHtml,
                css: data.prototypeCss,
                meta: prototypeMeta,
              },
            }));
          }
          if (
            data.sandboxHtml !== undefined ||
            data.htmlImportMeta !== undefined
          ) {
            setPageSandboxMap((prev) => ({
              ...prev,
              [pageId]: {
                html: data.sandboxHtml,
                meta: data.htmlImportMeta as HtmlImportMeta | undefined,
              },
            }));
          }
          if (
            data.sandboxExecutionUrl !== undefined ||
            data.sandboxChannelId !== undefined
          ) {
            setSandboxExecutionMap((prev) => ({
              ...prev,
              [pageId]: {
                url: data.sandboxExecutionUrl,
                channelId: data.sandboxChannelId,
              },
            }));
          }
          updatePageSchemaMapFromLoad(pageId, nextSchema);
          setConfigDataMap((prev) => {
            const defaults = getSafeMergedDefaults(nextSchema);
            return {
              ...prev,
              [pageId]: {
                ...defaults,
                ...(data.configData ?? {}),
              },
            };
          });
          if (data.requirements !== undefined) {
            setReferencePageRequirements((prev) => ({
              ...prev,
              [pageId]: data.requirements ?? "",
            }));
          }
          if (data.designSpecEntries !== undefined) {
            setReferencePageDesignSpecEntries((prev) => ({
              ...prev,
              [pageId]: data.designSpecEntries ?? [],
            }));
          }
          if (data.projectConfigSchema !== undefined) {
            setReferencePageProjectSchemas((prev) => ({
              ...prev,
              [pageId]: data.projectConfigSchema ?? "",
            }));
          }
          const size = getPreviewSize(nextSchema);
          if (size) {
            setPagePreviewSizeMap((prev) => ({
              ...prev,
              [pageId]: size,
            }));
          }
          // Commit the requested page's identity and all editor projections in
          // one React update. The refs above make the same snapshot available
          // to any synchronous persistence path immediately.
          setCode(nextCode);
          codeRef.current = nextCode;
          setSchema(nextSchema);
          schemaRef.current = nextSchema;
          setEditorContent(buildFigmaText(nextCode, nextSchema));
          setPreviewSize(size);
          setSinglePreviewTarget({ kind: "page", pageId });
          setActiveDemoId(pageId);
          activeDemoIdRef.current = pageId;
          if (previewMode === "canvas") {
            if (openConfigDetail) {
              setConfigPanelOverviewRequested(false);
            } else {
              setConfigPanelDetailPageId(null);
              setConfigPanelOverviewRequested(true);
            }
            if (focusCanvas) {
              focusCanvasPage(pageId);
            } else {
              setCanvasEditingPageId(pageId);
            }
          }
        }
      } catch (err) {
        if (requestId === pageSwitchRequestRef.current) {
          console.error("加载页面失败:", err);
        }
      } finally {
        if (requestId === pageSwitchRequestRef.current) {
          pageSwitchInFlightRef.current = false;
          if (pageSwitchDeferredSyncRef.current) {
            pageSwitchDeferredSyncRef.current = false;
            scheduleWorkspaceSyncRef.current();
          }
        }
      }
    },
    [
      focusCanvasPage,
      demoId,
      demoPages,
      getSafeMergedDefaults,
      previewMode,
      rememberActivePageSchema,
      sessionId,
      setCanvasEditingPageId,
      updatePageSchemaMapFromLoad,
    ],
  );
  const handleConfigPanelPageSelectRef = useRef(handleConfigPanelPageSelect);
  handleConfigPanelPageSelectRef.current = handleConfigPanelPageSelect;
  const handlePreviewHtmlFilesDrop = useCallback(
    (files: File[]) => {
      if (!sessionId) {
        toast({
          title: "未创建 Session",
          description: "请等待编辑器初始化后重试。",
          variant: "destructive",
        });
        return;
      }
      setDroppedHtmlFiles(files);
    },
    [sessionId, toast],
  );
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
      setPageSandboxMap((prev) => {
        const next = { ...prev };
        pageIds.forEach((pageId) => delete next[pageId]);
        return next;
      });
      setSandboxExecutionMap((prev) => {
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

      // 删除页面会改变剩余页面的索引。若某些页面没有显式保存的画布布局，
      // 它们会回退到基于索引的初始布局（computeInitialCanvasLayout），导致位置漂移。
      // 因此在删除前，先把剩余页面的当前有效位置固化进 canvasState.pages。
      const currentState = canvasStateRef.current;
      const effectiveLayouts = normalizeCanvasPageLayouts(
        previousPages,
        currentState.pages,
      );
      const nextPages: Record<string, CanvasPageLayout> = {};
      for (const page of remaining) {
        const layout = effectiveLayouts[page.id];
        if (layout) nextPages[page.id] = layout;
      }
      const navigation = currentState.navigation;
      const navigationReferencesDeletedPage =
        Object.values(navigation?.hotspots ?? {}).some((hotspot) =>
          deleted.has(hotspot.pageId),
        ) ||
        Object.values(navigation?.connections ?? {}).some(
          (connection) =>
            deleted.has(connection.source.pageId) ||
            deleted.has(connection.target.pageId),
        );
      if (
        nextPageLayoutsDiffer(currentState.pages, nextPages) ||
        navigationReferencesDeletedPage
      ) {
        const nextHotspots = Object.fromEntries(
          Object.entries(navigation?.hotspots ?? {}).filter(
            ([, hotspot]) => !deleted.has(hotspot.pageId),
          ),
        );
        const nextConnections = Object.fromEntries(
          Object.entries(navigation?.connections ?? {}).filter(
            ([, connection]) =>
              !deleted.has(connection.source.pageId) &&
              !deleted.has(connection.target.pageId) &&
              Boolean(nextHotspots[connection.source.hotspotId]),
          ),
        );
        setCanvasState({
          ...currentState,
          pages: nextPages,
          ...(navigation
            ? {
                navigation: {
                  hotspots: nextHotspots,
                  connections: nextConnections,
                },
              }
            : {}),
        });
      }

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
    [clearPageLocalCaches, handleWorkspaceTreeChanged, setCanvasState],
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
          // schema 从源页面的 config.schema.json 原始内容写入
          if (srcPage.schema) {
            files.schema = srcPage.schema;
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

  // 画布粘贴 HTML：交给页面树现有的可信 Figma 自动导入 / 工作台分流。
  const handlePasteHtmlContent = useCallback(
    async (html: string) => {
      if (!sessionId) {
        toast({
          title: "未创建 Session",
          description: "请先进入编辑模式",
          variant: "destructive",
        });
        return;
      }

      setDroppedHtmlFiles([
        new File([html], "clipboard-import.html", { type: "text/html" }),
      ]);
    },
    [sessionId, toast],
  );

  // 创建引用页
  const handleCreateReferences = useCallback(
    async (input: {
      pages: CanvasPageData[];
      pageLayouts: Record<string, CanvasPageLayout>;
      pageGroups: CanvasPageGroup[];
      sourceProjectId: string;
    }): Promise<{ pageIdMapping: Map<string, string> }> => {
      const pageIdMapping = new Map<string, string>();
      if (!sessionId) return { pageIdMapping };

      try {
        const sourcePageIds = input.pages.map((p) => p.id);
        const newPages = await projectApiClient.createReferencePages(
          demoId,
          input.sourceProjectId,
          sourcePageIds,
          sessionId,
        );

        newPages.forEach((newPage, index) => {
          pageIdMapping.set(input.pages[index]?.id ?? "", newPage.id);
        });

        setDemoPages((current) =>
          [...current, ...newPages].sort((a, b) => a.order - b.order),
        );
        handleWorkspaceTreeChanged();
        toast({
          title:
            newPages.length === 1
              ? `已引用页面「${newPages[0].name}」`
              : `已引用 ${newPages.length} 个页面`,
        });
      } catch (err) {
        console.error("创建引用页失败:", err);
        toast({
          title: "创建引用页失败",
          variant: "destructive",
        });
      }

      return { pageIdMapping };
    },
    [demoId, sessionId, handleWorkspaceTreeChanged, toast, projectApiClient],
  );

  // 查看引用页源项目
  const handleViewSourcePage = useCallback(
    (pageId: string) => {
      const page = demoPages.find((p) => p.id === pageId);
      if (page?.reference?.sourceProjectId) {
        router.push(`/demo/${page.reference.sourceProjectId}/edit`);
      }
    },
    [demoPages, router],
  );

  const handleSinglePreviewPageSelect = useCallback(
    async (pageId: string) => {
      if (!confirmDiscardVisualPropertyWork()) return;
      handleClearVisualProperties();
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
          const nextRuntimeType = conversion.targetRuntimeType;
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
    async (
      files: AiFileChange[],
      authoritySnapshot?: {
        state: { revision: number };
        resources: Record<string, string>;
      },
    ) => {
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

      if (authoritySnapshot) {
        // Keep the live Yjs tree aligned with the exact Authority revision we
        // are about to project. Otherwise an already-open room can flush its
        // pre-creation tree and erase the newly published page from disk.
        replaceCollabText(
          workspaceTreeCollab.ytext,
          authoritySnapshot.resources["workspace-tree.json"] ?? "",
        );
      } else {
        handleWorkspaceTreeChanged();
      }

      const previousPageIds = new Set(demoPages.map((page) => page.id));
      const previousActiveId = activeDemoIdRef.current;

      try {
        let multi: ReturnType<
          typeof projectAuthoritySnapshotResources
        >["multi"] & {
          demoPages?: DemoPageMeta[];
          demoFolders?: DemoFolderMeta[];
        };
        let rawPages: DemoPageMeta[];
        let snapshotFolders: DemoFolderMeta[];
        if (authoritySnapshot) {
          const projected = projectAuthoritySnapshotResources(
            authoritySnapshot.resources,
          );
          multi = projected.multi;
          rawPages = projected.demoPages;
          snapshotFolders = projected.demoFolders;
        } else {
          const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
          if (!filesRes.ok) throw new Error("刷新页面列表失败");
          const filesData = await filesRes.json();
          if (!filesData.success)
            throw new Error(filesData.error?.message || "刷新页面列表失败");
          multi = filesData.data;
          rawPages = multi.demoPages || [];
          snapshotFolders = multi.demoFolders || [];
        }
        const pagesWithSize = rawPages.map((page: DemoPageMeta) => {
          const pageSchema = multi.demos?.[page.id]?.schema;
          return {
            ...page,
            previewSize: pageSchema ? getPreviewSize(pageSchema) : undefined,
          };
        });
        setDemoPages(pagesWithSize);
        setDemoFolders(snapshotFolders);
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
        const previewSizeMap: Record<string, PreviewSize> = {};
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

        pageCodesRef.current = codes;
        pageSchemaMapRef.current = {
          ...pageSchemaMapRef.current,
          ...schemas,
        };
        setPageCodes(codes);
        setPagePrototypeMap(prototypes);
        setPageSketchMap(sketches);
        setConfigDataMap((prev) => {
          const merged: Record<string, Record<string, unknown>> = {};
          for (const pageId of Object.keys(allDefaults)) {
            merged[pageId] = {
              ...allDefaults[pageId],
              ...(prev[pageId] || {}),
            };
          }
          return merged;
        });
        setPageSchemaMap((prev) => mergeLoadedPageSchemas(prev, schemas));
        setPagePreviewSizeMap(previewSizeMap);

        if (!authoritySnapshot) markWorkspaceChanged();
        for (const pageId of pageIds) {
          markScreenshotDirty(pageId);
        }
        recordDiagnosticEvent({
          category: "ai",
          name: "ai.files_change_marked_workspace_dirty",
          traceId,
          details: {
            reason: authoritySnapshot
              ? "authority_snapshot_projection"
              : "agent_file_change",
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
        if (pageIdentityChanged) {
          toast({
            title: "页面列表已刷新",
          });
        }
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
      markScreenshotDirty,
      markWorkspaceChanged,
      previewMode,
      projectSchemaCollab.ytext,
      workspaceTreeCollab.ytext,
      reconcileRuntimeConversionsAfterAiFiles,
      recordDiagnosticEvent,
      sessionId,
      setFocusCanvasPageId,
      toast,
    ],
  );

  const handleWorkspaceMutationCommitted = useCallback(
    (receipt: WorkspaceMutationReceipt) => {
      const affectsPageProjection = receipt.resources.some((resource) =>
        isAiFileChangeRefreshTarget(resource.path),
      );
      if (!affectsPageProjection || !sessionId || !workspaceId) return;

      pendingAuthorityProjectionRevisionRef.current = Math.max(
        pendingAuthorityProjectionRevisionRef.current,
        receipt.revision,
      );
      const queuedAt = performance.now();
      authorityProjectionChainRef.current = authorityProjectionChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const minimumRevision = pendingAuthorityProjectionRevisionRef.current;
          const snapshot = await readWorkspaceAuthoritySnapshotFromBrowser({
            projectId: demoId,
            workspaceId,
            sessionId,
          });
          if (
            snapshot.state.revision < minimumRevision ||
            snapshot.state.revision <=
              appliedAuthorityProjectionRevisionRef.current
          )
            return;

          await handleAiFilesChange(
            receipt.resources.map((resource) => ({
              path: resource.path,
              action:
                resource.action === "deleted"
                  ? "deleted"
                  : resource.beforeHash === null
                    ? "created"
                    : "modified",
            })),
            snapshot,
          );
          appliedAuthorityProjectionRevisionRef.current =
            snapshot.state.revision;
          recordDiagnosticEvent({
            category: "ai",
            name: "ai.authority_snapshot_projected",
            details: {
              receiptRevision: receipt.revision,
              snapshotRevision: snapshot.state.revision,
              queueMs: Math.round(performance.now() - queuedAt),
              resources: receipt.resources.map((resource) => resource.path),
            },
          });
        })
        .catch((error) => {
          recordDiagnosticEvent({
            category: "ai",
            name: "ai.authority_snapshot_projection_failed",
            level: "warn",
            details: {
              receiptRevision: receipt.revision,
              message: error instanceof Error ? error.message : "未知错误",
            },
          });
        });
    },
    [
      demoId,
      handleAiFilesChange,
      recordDiagnosticEvent,
      sessionId,
      workspaceId,
    ],
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.data?.username) {
          setCurrentUsername((current: string) =>
            current === data.data.username ? current : data.data.username,
          );
        }
        if (data?.success && data.data?.id) {
          setCurrentUserId((current: string) =>
            current === data.data.id ? current : data.data.id,
          );
        }
        if (data?.success && typeof data.data?.role === "string") {
          setCurrentUserRole(data.data.role);
        }
      })
      .catch(() => {});
  }, []);

  // loadVersionHistory, loadPageVersionHistories, publish status effect,
  // and handlePublish moved to useVersionControl hook

  const persistActivePageToSession = useCallback(async () => {
    const pageId = activeDemoIdRef.current;
    if (!sessionId || !pageId) {
      throw new Error("未选中页面或 Session 未创建");
    }
    if (pageSwitchInFlightRef.current) {
      throw new Error("页面切换尚未完成，已阻止保存");
    }
    const pageContent = getPersistablePageContent({
      pageId,
      pageCodes: pageCodesRef.current,
      pageSchemaMap: pageSchemaMapRef.current,
    });
    if (!pageContent) {
      throw new Error("当前页面内容尚未完整加载，已阻止保存");
    }

    const saveRes = await fetch(`/api/sessions/${sessionId}/files/${pageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: pageContent.code,
        schema: pageContent.schema,
        prototypeHtml: pagePrototypeMapRef.current[pageId]?.html,
        prototypeCss: pagePrototypeMapRef.current[pageId]?.css,
        prototypeMeta: pagePrototypeMapRef.current[pageId]?.meta,
        sketchScene: pageSketchMapRef.current[pageId]?.scene,
        sketchMeta: pageSketchMapRef.current[pageId]?.meta,
        localizeImages: false,
      }),
    });

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
  }, [sessionId]);

  const handleSketchSceneChange = useCallback(
    (scene: SketchSceneDocument) => {
      if (!activeDemoId) return;
      const sceneText = JSON.stringify(scene, null, 2);
      replaceCollabText(
        activeSketchSceneCollab.isSyncedForCurrentDescriptor
          ? activeSketchSceneCollab.ytext
          : null,
        sceneText,
      );
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
      markScreenshotDirty(activeDemoId);
      markWorkspaceChanged();
    },
    [
      activeDemoId,
      activeSketchSceneCollab.isSyncedForCurrentDescriptor,
      activeSketchSceneCollab.ytext,
      markScreenshotDirty,
      markWorkspaceChanged,
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
      if (pageSwitchInFlightRef.current) {
        pageSwitchDeferredSyncRef.current = true;
        return;
      }
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
          // Post-sync: regenerate screenshots for structurally dirty pages
          const dirtyPages = [...structuralDirtyPageIdsRef.current];
          structuralDirtyPageIdsRef.current.clear();
          for (const pageId of dirtyPages) {
            const page = demoPages.find((item) => item.id === pageId);
            if (
              page &&
              (page.runtimeType === "prototype-html-css" ||
                page.runtimeType === "sketch-scene")
            ) {
              pendingPrototypeScreenshotPageIdsRef.current.add(pageId);
            } else {
              scheduleScreenshotRegenerateRef.current(pageId);
            }
          }
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
    if (pageSwitchInFlightRef.current) {
      pageSwitchDeferredSyncRef.current = true;
      return;
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

  // Cleanup delayed work on unmount so old sessions cannot receive stale writes.
  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
      for (const timer of Object.values(pageConfigPersistTimersRef.current)) {
        clearTimeout(timer);
      }
      pageConfigPersistTimersRef.current = {};
      for (const timer of Object.values(screenshotRegenerateTimerRef.current)) {
        clearTimeout(timer);
      }
      screenshotRegenerateTimerRef.current = {};
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
  const { hasGenuineExitBlock, hasPendingExitWork } = getExitSaveState({
    hasUnsavedCanvasChanges,
    hasPendingWorkspaceFlush,
    hasUnsavedChanges,
    workspaceFlushError,
    hasOfflineOrErrorCollab: exitSyncStatuses.some(
      (status) => status === "error" || status === "offline",
    ),
    syncInFlight: syncInFlightRef.current,
    syncDebounceScheduled: syncDebounceRef.current !== null,
  });

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
    if (exitHandlingRef.current) return;
    exitHandlingRef.current = true;
    exitCancelledRef.current = false;

    const finishExit = () => {
      exitHandlingRef.current = false;
      if (exitCancelledRef.current) return;
      router.push("/");
    };

    try {
      if (hasGenuineExitBlock) {
        setExitErrorLabel(workspaceFlushError ?? "最新修改尚未确认同步完成");
        setExitState("confirm");
        setShowExitDialog(true);
        return;
      }

      if (!hasPendingExitWork) {
        finishExit();
        return;
      }

      setExitErrorLabel(null);
      setExitState("saving");
      setShowExitDialog(true);
      await flushBeforeExit();
      finishExit();
    } catch (error) {
      console.warn("[Exit] Failed to flush before exit:", error);
      setExitErrorLabel(
        error instanceof Error ? error.message : "保存失败，请重试或直接退出",
      );
      setExitState("confirm");
      setShowExitDialog(true);
    } finally {
      exitHandlingRef.current = false;
    }
  }, [
    flushBeforeExit,
    hasGenuineExitBlock,
    hasPendingExitWork,
    router,
    workspaceFlushError,
  ]);

  const handleStayOnPage = () => {
    exitHandlingRef.current = false;
    exitCancelledRef.current = true;
    setShowExitDialog(false);
  };

  const handleDirectExit = () => {
    exitHandlingRef.current = false;
    exitCancelledRef.current = false;
    setShowExitDialog(false);
    router.push("/");
  };

  const handleExitDialogOpenChange = (open: boolean) => {
    if (!open) {
      exitHandlingRef.current = false;
      exitCancelledRef.current = true;
    }
    setShowExitDialog(open);
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
          markScreenshotDirty(demoId);
          setPagePrototypeMap((prev) => ({
            ...prev,
            [demoId]: {
              ...(prev[demoId] ?? {}),
              [fileType === "prototypeHtml" ? "html" : "css"]: content,
            },
          }));
        } else if (fileType === "sketchScene") {
          markScreenshotDirty(demoId);
          setPageSketchMap((prev) => ({
            ...prev,
            [demoId]: {
              ...(prev[demoId] ?? {}),
              scene: content,
            },
          }));
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
      markScreenshotDirty,
      markWorkspaceChanged,
      setPagePrototypeMap,
      setPageSketchMap,
    ],
  );

  const activeDemoPage = demoPages.find((page) => page.id === activeDemoId);
  const activePersistedPresentation = useMemo(
    () => resolvePagePresentation(pageSchemaMap[activeDemoId] ?? schema),
    [activeDemoId, pageSchemaMap, schema],
  );
  const previewStagePages = useMemo<PreviewStagePage[]>(() => {
    const activeCodePageId =
      pageCodes[activeDemoId] === code ? activeDemoId : undefined;

    return demoPages.map((page) => {
      const runtimeData =
        page.runtimeType === "sandboxed-html"
          ? {
              sandboxExecutionUrl: sandboxExecutionMap[page.id]?.url,
              sandboxChannelId: sandboxExecutionMap[page.id]?.channelId,
            }
          : page.runtimeType === "prototype-html-css"
            ? {
                prototypeHtml: pagePrototypeMap[page.id]?.html,
                prototypeCss: pagePrototypeMap[page.id]?.css,
                prototypeMeta: pagePrototypeMap[page.id]?.meta,
              }
            : page.runtimeType === "sketch-scene"
              ? {
                  sketchScene: pageSketchMap[page.id]?.scene,
                  sketchMeta: pageSketchMap[page.id]?.meta,
                }
              : {
                  code: resolvePreviewPageCode({
                    pageId: page.id,
                    pageCodes,
                    activeCodePageId,
                    activeCode: code,
                  }),
                };

      const snapshot = pageSnapshots[page.id];
      const prototypeSnapshot =
        page.runtimeType === "prototype-html-css" && pagePrototypeMap[page.id]
          ? {
              snapshotHtml: pagePrototypeMap[page.id].html,
              snapshotCss: pagePrototypeMap[page.id].css,
              snapshotQuality: "good" as SnapshotQuality,
              snapshotRejectionReasons: [],
            }
          : undefined;

      const presentation = resolvePagePresentation(
        pageSchemaMap[page.id] ?? "",
      );
      const pageSchemaKnown = Object.prototype.hasOwnProperty.call(
        pageSchemaMap,
        page.id,
      );
      const projectSchema =
        referencePageProjectSchemas[page.id] ?? projectConfigSchema;
      const consumesProjectConfig =
        page.runtimeType === "prototype-html-css" ||
        page.runtimeType === "high-fidelity-react" ||
        page.runtimeType === "sketch-scene";
      const runtimeSourceKnown =
        !consumesProjectConfig ||
        (page.runtimeType === "prototype-html-css"
          ? Object.prototype.hasOwnProperty.call(pagePrototypeMap, page.id)
          : page.runtimeType === "high-fidelity-react"
            ? Object.prototype.hasOwnProperty.call(pageCodes, page.id)
            : page.runtimeType === "sketch-scene"
              ? Object.prototype.hasOwnProperty.call(pageSketchMap, page.id)
              : true);
      const projectConfigBindings =
        page.runtimeType === "prototype-html-css"
          ? extractPrototypeConfigBindingKeys(pagePrototypeMap[page.id]?.html)
          : page.runtimeType === "high-fidelity-react" ||
              page.runtimeType === "sketch-scene"
            ? extractCodeConfigBindingKeys(
                pageCodes[page.id],
                getSchemaPropertyKeys(projectSchema),
              )
            : [];
      const configCount =
        pageSchemaKnown &&
        (!consumesProjectConfig ||
          (projectSchema !== undefined && runtimeSourceKnown))
          ? getSchemaFieldCountByCategory(pageSchemaMap[page.id]) +
            getSchemaFieldCountByBindings(projectSchema, projectConfigBindings)
          : undefined;
      return {
        id: page.id,
        name: page.name,
        runtimeType: page.runtimeType,
        order: page.order,
        isReference: !!page.reference,
        sourceProjectId: page.reference?.sourceProjectId,
        ...runtimeData,
        configData: configDataMap[page.id],
        schema: pageSchemaMap[page.id],
        configCount,
        presentation,
        previewSize: presentation?.viewport,
        canvasPreviewSize:
          pagePreviewSizeMap[page.id] ?? presentation?.viewport,
        ...(snapshot || prototypeSnapshot),
      };
    });
  }, [
    activeDemoId,
    code,
    configDataMap,
    demoPages,
    pageCodes,
    pagePreviewSizeMap,
    pagePrototypeMap,
    pageSketchMap,
    projectConfigSchema,
    referencePageProjectSchemas,
    sandboxExecutionMap,
    pageSchemaMap,
    pageSnapshots,
    previewSize,
    temporaryPresentation,
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
  const visualEditActive =
    canUseVisualEditor &&
    previewMode === "single" &&
    !singlePreviewViewingDocument &&
    rightPanelTab === "edit" &&
    !commentModeActive;

  useEffect(() => {
    if (
      !visualEditActive ||
      activeDemoPage?.runtimeType !== "prototype-html-css"
    ) {
      return;
    }
    const handlePrototypeHistoryShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input,textarea,select,[contenteditable]:not([contenteditable='false'])",
        )
      ) {
        return;
      }
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const direction =
        modifier && key === "z"
          ? event.shiftKey
            ? "redo"
            : "undo"
          : modifier && event.ctrlKey && key === "y"
            ? "redo"
            : null;
      if (!direction) return;
      const result = applyPrototypeVisualHistory(direction);
      if (result === "empty") return;
      event.preventDefault();
      if (result === "conflict") {
        toast({
          title: "无法撤销可视化修改",
          description: "页面源码已被其他编辑更新，请重新选择元素后再修改。",
          variant: "destructive",
        });
      }
    };
    window.addEventListener("keydown", handlePrototypeHistoryShortcut);
    return () =>
      window.removeEventListener("keydown", handlePrototypeHistoryShortcut);
  }, [
    activeDemoPage?.runtimeType,
    applyPrototypeVisualHistory,
    toast,
    visualEditActive,
  ]);

  useEffect(() => {
    if (previewMode !== "single" || singlePreviewViewingDocument) return;
    setVisualPanelHoverNodeId(null);
  }, [previewMode, singlePreviewViewingDocument, setVisualPanelHoverNodeId]);

  const activeSketchEditorEngine = resolveSketchEditorEngine({
    enginePreference: projectAuthoringPreferences?.sketchEditorEngine,
    userEnginePreference: userAuthoringPreferences?.sketchEditorEngine,
    previewMode,
    runtimeType: activeDemoPage?.runtimeType,
    sketchEditing,
    viewingDocument: singlePreviewViewingDocument,
  });
  const nativeSketchEditingActive = activeSketchEditorEngine === "native";

  const handleSubmitVisualDraftAction = useCallback(() => {
    handleSendVisualPropertiesToAI();
  }, [handleSendVisualPropertiesToAI]);

  const handleAddNodeToChat = useCallback(
    (node: VisualNodeInfo) => {
      if (!activeDemoId) return;
      const label = getNodeLabel(node);
      const context = buildVisualSelectionPrompt(node, activeDemoId);
      setChatElement({
        id: `elem-${Date.now()}`,
        label,
        context,
      });
    },
    [activeDemoId],
  );

  const handleAddToChat = useCallback(() => {
    if (!selectedVisualNode) return;
    handleAddNodeToChat(selectedVisualNode);
  }, [selectedVisualNode, handleAddNodeToChat]);

  const handleAddPagesToChat = useCallback((pageIds: string[]) => {
    if (pageIds.length === 0) return;
    const uniquePageIds = Array.from(new Set(pageIds)).filter(Boolean);
    const refs = uniquePageIds
      .map((pageId) => {
        const page = demoPagesRef.current.find((item) => item.id === pageId);
        if (!page) return null;
        return {
          id: `page-${pageId}`,
          label: page.name,
          context: `当前项目的页面：${page.name}\n- 页面ID: ${pageId}\n- 页面名称: ${page.name}\n- 源码文件: demos/${pageId}/index.tsx`,
        };
      })
      .filter((page): page is ChatPageRef => page !== null);
    if (refs.length === 0) return;
    setChatPageRefs(refs);
  }, []);

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

    if (!targetChanged) return;
    setVisualPanelHoverNodeId(null);
  }, [activeDemoId, previewMode, singlePreviewViewingDocument]);
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

  const singlePreviewNavigableItems = useMemo(() => {
    const items: { value: string; group: "页面" | "文档"; label: string }[] =
      [];
    for (const page of demoPages) {
      items.push({ value: `page:${page.id}`, group: "页面", label: page.name });
    }
    for (const node of singlePreviewDocumentNodes) {
      items.push({
        value: `document:${node.id}`,
        group: "文档",
        label: node.title,
      });
    }
    return items;
  }, [demoPages, singlePreviewDocumentNodes]);
  const singlePreviewCurrentIndex = singlePreviewNavigableItems.findIndex(
    (item) => item.value === singlePreviewSelectValue,
  );
  const handleSinglePreviewPrev = useCallback(() => {
    const index = singlePreviewCurrentIndex;
    if (index <= 0) return;
    handleSinglePreviewSelectChange(
      singlePreviewNavigableItems[index - 1].value,
    );
  }, [
    handleSinglePreviewSelectChange,
    singlePreviewCurrentIndex,
    singlePreviewNavigableItems,
  ]);
  const handleSinglePreviewNext = useCallback(() => {
    const index = singlePreviewCurrentIndex;
    if (index < 0 || index >= singlePreviewNavigableItems.length - 1) return;
    handleSinglePreviewSelectChange(
      singlePreviewNavigableItems[index + 1].value,
    );
  }, [
    handleSinglePreviewSelectChange,
    singlePreviewCurrentIndex,
    singlePreviewNavigableItems,
  ]);

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
        | {
            ok: true;
            html: string;
            css: string;
            rejectionReasons: SnapshotRejectionReason[];
          }
        | { ok: false; error: string },
    ) => {
      const conversion = pendingStaticPrototypeConversionRef.current;
      pendingStaticPrototypeConversionRef.current = null;

      if (!conversion) {
        const pageId = pendingSnapshotPageIdRef.current;
        pendingSnapshotPageIdRef.current = null;
        if (result.ok && pageId) {
          const quality: SnapshotQuality =
            result.rejectionReasons.length === 0 ? "good" : "partial";
          setPageSnapshots((prev) => ({
            ...prev,
            [pageId]: {
              html: result.html,
              css: result.css,
              quality,
              rejectionReasons: result.rejectionReasons,
            },
          }));
        }
        return;
      }

      if (!sessionId) return;

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
  // 创作端即使尚未声明字段也保留配置页签，用户可从空态打开定义管理器创建首个字段。
  const hasAnyConfig = showProjectConfig || showPageConfig || !!activeDemoPage;
  const canvasRightPanelTab = resolveCanvasRightPanelTab(
    rightPanelTab,
    hasAnyConfig,
  );
  const effectiveRightPanelTab = canUseVisualEditor
    ? rightPanelTab
    : rightPanelTab === "comments"
      ? "comments"
      : "config";
  useEffect(() => {
    if (!canUseVisualEditor && rightPanelTab === "edit") {
      setRightPanelTab("config");
    }
  }, [canUseVisualEditor, rightPanelTab]);
  const isConfigPanelVisible =
    (previewMode === "single" && !singlePreviewViewingDocument) ||
    previewMode === "canvas" ||
    previewMode === "document";
  const handlePreviewModeChange = useCallback(
    (nextMode: PreviewMode) => {
      if (nextMode === previewMode) return;
      if (nextMode === "single") {
        setSinglePreviewTarget(
          activeDemoId ? { kind: "page", pageId: activeDemoId } : null,
        );
        setPreviewMode("single");
        return;
      }
      if (nextMode === "document") {
        setPreviewMode("document");
        return;
      }
      if (!confirmDiscardVisualPropertyWork()) return;
      handleClearVisualProperties();
      if (!initialCanvasFitRequestedRef.current) {
        initialCanvasFitRequestedRef.current = true;
        setFitCanvasToScreenOnMount(true);
      }
      setPreviewMode("canvas");
    },
    [
      previewMode,
      activeDemoId,
      setSinglePreviewTarget,
      setPreviewMode,
      confirmDiscardVisualPropertyWork,
      handleClearVisualProperties,
      setFitCanvasToScreenOnMount,
    ],
  );
  const visualConfigUsedKeys = getSchemaPropertyKeys(
    schema,
    projectConfigSchema,
  );
  const visualConfigDraft = useMemo<ConfigDefinitionDraft>(
    () => ({
      key: visualConfigFieldKey,
      title: visualConfigTitle,
      kind: selectedVisualConfigCandidate?.kind ?? "text",
      default: visualConfigDefaultValue,
      group: visualConfigCategory || undefined,
    }),
    [
      selectedVisualConfigCandidate?.kind,
      visualConfigCategory,
      visualConfigDefaultValue,
      visualConfigFieldKey,
      visualConfigTitle,
    ],
  );
  const handleVisualConfigDraftChange = useCallback(
    (draft: ConfigDefinitionDraft) => {
      handleVisualConfigTitleChange(draft.title);
      setVisualConfigDefaultValue(
        typeof draft.default === "string"
          ? draft.default
          : String(draft.default ?? ""),
      );
      setVisualConfigCategory(draft.group ?? "");
    },
    [
      handleVisualConfigTitleChange,
      setVisualConfigCategory,
      setVisualConfigDefaultValue,
    ],
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

  if (bootstrapError) {
    return (
      <div className="flex h-screen items-center justify-center px-6">
        <div className="max-w-md space-y-4 text-center">
          <p className="text-base font-medium">编辑器加载失败</p>
          <p className="text-sm text-muted-foreground">{bootstrapError}</p>
          <Button onClick={() => setLoadAttempt((current) => current + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新加载
          </Button>
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
                : version.note || "命名版本",
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
        title: version.note || `修改了${version.demoName || version.demoId}`,
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

  const toolbarCenter =
    previewMode === "single" &&
    (demoPages.length > 0 || singlePreviewDocumentNodes.length > 0) ? (
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={
            singlePreviewNavigableItems.length === 0 ||
            singlePreviewCurrentIndex <= 0
          }
          onClick={handleSinglePreviewPrev}
          title="上一页"
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select
          value={singlePreviewSelectValue || undefined}
          onValueChange={handleSinglePreviewSelectChange}
        >
          <SelectTrigger
            aria-label="选择预览对象"
            className="h-7 w-auto flex-[0_1_auto] justify-start gap-0 rounded-md border-transparent bg-transparent px-2 text-xs font-medium text-foreground shadow-none data-[placeholder]:text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:ring-0"
          >
            <SelectValue placeholder="选择页面" />
          </SelectTrigger>
          <SelectContent>
            {singlePreviewNavigableItems.filter((item) => item.group === "页面")
              .length > 0 && (
              <SelectGroup>
                <SelectLabel>页面</SelectLabel>
                {singlePreviewNavigableItems
                  .filter((item) => item.group === "页面")
                  .map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
              </SelectGroup>
            )}
            {singlePreviewNavigableItems.filter((item) => item.group === "文档")
              .length > 0 && (
              <SelectGroup>
                <SelectLabel>文档</SelectLabel>
                {singlePreviewNavigableItems
                  .filter((item) => item.group === "文档")
                  .map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={
            singlePreviewNavigableItems.length === 0 ||
            singlePreviewCurrentIndex < 0 ||
            singlePreviewCurrentIndex >= singlePreviewNavigableItems.length - 1
          }
          onClick={handleSinglePreviewNext}
          title="下一页"
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    ) : undefined;

  const viewportControl = activePersistedPresentation ? (
    <PageViewportControl
      presentation={activePersistedPresentation}
      temporaryPresentation={temporaryPresentation}
      onTemporaryChange={setTemporaryPresentation}
      onSaveDefault={handleSavePagePresentation}
    />
  ) : undefined;

  return (
    <div
      className="flex flex-col h-screen bg-background"
      data-testid="editor-ready"
    >
      <div className="flex items-center px-6 py-4 border-b bg-card">
        <div className="flex flex-1 items-center gap-4">
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
            onClick={() => setProjectSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
            <span className="text-xs">项目设置</span>
          </Button>
          {!automaticScreenshotGenerationEnabled && (
            <Badge
              variant="outline"
              className="hidden border-amber-300 bg-amber-50 text-amber-800 md:inline-flex"
              title="本地完整服务仍在运行；仅暂停编辑页自动截图。使用 pnpm dev:visual-full 验证画布截图和缩略图。"
            >
              开发：自动截图已暂停
            </Badge>
          )}
        </div>
        <div className="flex flex-1 items-center justify-center">
          <PreviewModeSwitcher
            mode={previewMode}
            onModeChange={handlePreviewModeChange}
          />
        </div>
        <div className="flex flex-1 items-center justify-end gap-3">
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
            variant="outline"
            className="gap-2"
            title="分享"
            onClick={() => setShowShareDialog(true)}
          >
            <Share2 className="h-4 w-4" />
            分享
          </Button>
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
          <div className="flex items-center">
            <Button
              onClick={async () => {
                await handlePublishWithScreenshot();
              }}
              disabled={publishButtonDisabled}
              variant={!publishButtonDisabled ? "default" : "outline"}
              className={`gap-2 ${publishStatus === "published" ? "rounded-r-none" : ""}`}
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
            {publishStatus === "published" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={!publishButtonDisabled ? "default" : "outline"}
                    size="icon"
                    className="rounded-l-none border-l-0"
                    disabled={unpublishing}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1" align="end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-destructive hover:text-destructive"
                    disabled={unpublishing}
                    onClick={() => setShowUnpublishDialog(true)}
                  >
                    {unpublishing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        撤销中...
                      </>
                    ) : (
                      "撤销发布"
                    )}
                  </Button>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <DesignSpecWorkspaceProvider
          workingDir={workspacePath || undefined}
          sessionId={sessionId}
          projectId={demoId}
        >
          <SketchEditorEngineBoundary
            engine={activeSketchEditorEngine}
            scene={activeSketchScene}
            onSceneChange={handleSketchSceneChange}
          >
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
                    {previewMode !== "document" && (
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
                    )}
                    <TabsTrigger
                      value="code"
                      title="代码"
                      className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                    >
                      <FolderOpen className="h-4 w-4" />
                      {tabValue === "code" && <span>代码</span>}
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
                    forceMount
                    className="flex-1 flex flex-col mt-0 min-h-0 min-w-0 data-[state=inactive]:hidden"
                  >
                    <DeferredAuthorAIChat
                      ready={!isInitialPageLoading}
                      key={agentSessionId}
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
                      onWorkspaceMutationCommitted={
                        handleWorkspaceMutationCommitted
                      }
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
                                [activeDemoIdRef.current]:
                                  data.data.schema || "",
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
                              error instanceof Error
                                ? error.message
                                : "未知错误",
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
                            toast({
                              title: "会话不存在",
                              variant: "destructive",
                            });
                            return;
                          }
                          const sessionData = await sessionRes.json();
                          if (
                            !sessionData.success ||
                            sessionData.data?.isExpired
                          ) {
                            toast({
                              title: "会话已过期",
                              variant: "destructive",
                            });
                            return;
                          }

                          const messagesRes = await fetch(
                            `/api/sessions/${newSessionId}/messages`,
                          );
                          const messagesData = await messagesRes.json();
                          setAiMessages(
                            messagesData.success &&
                              Array.isArray(messagesData.data)
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
                              error instanceof Error
                                ? error.message
                                : "未知错误",
                            variant: "destructive",
                          });
                        }
                      }}
                      triggerAutoSend={triggerAutoSend}
                      onTriggerAutoSendHandled={() => {
                        setTriggerAutoSend(null);
                        handleVisualPropertyAutoSendHandled();
                      }}
                      selectedElement={chatElement}
                      onRemoveElement={() => setChatElement(null)}
                      selectedPages={chatPageRefs}
                      onRemovePages={() => setChatPageRefs([])}
                      projects={projectReferences}
                      externalStreamServiceRef={streamServiceRef}
                      errorBanner={
                        errorBannerVisible &&
                        validationResult.errors.length > 0 ? (
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
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <WorkspaceFileTree
                        sessionId={sessionId}
                        showKnowledge={true}
                        onFileSelect={async (filePath, editable) => {
                          try {
                            if (filePath.startsWith(".ai-attachments/")) {
                              const attachmentId = filePath.split("/")[1];
                              const metaRes = await fetch(
                                `/api/sessions/${sessionId}/attachments?id=${encodeURIComponent(attachmentId)}`,
                              );
                              const metaData = await metaRes.json();
                              if (
                                metaData.success &&
                                metaData.data.metadata?.mimeType?.startsWith(
                                  "image/",
                                )
                              ) {
                                window.open(
                                  `/api/sessions/${sessionId}/attachments?id=${encodeURIComponent(attachmentId)}&raw=1`,
                                  "_blank",
                                );
                                return;
                              }
                              const res = await fetch(
                                `/api/sessions/${sessionId}/attachments?id=${encodeURIComponent(attachmentId)}`,
                              );
                              const data = await res.json();
                              if (data.success) {
                                setWsCodeDialogData({
                                  filePath: data.data.metadata.name,
                                  content: data.data.text,
                                  editable: false,
                                });
                                setWsCodeDialogOpen(true);
                              } else {
                                toast({
                                  title: "加载聊天文件失败",
                                  description: data.error?.message,
                                  variant: "destructive",
                                });
                              }
                              return;
                            }
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
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="pages"
                    forceMount
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
                      htmlImportInitialFiles={droppedHtmlFiles}
                      onHtmlImportInitialFilesConsumed={() =>
                        setDroppedHtmlFiles(undefined)
                      }
                      onHtmlImportPreviewStatus={(status) => {
                        recordDiagnosticEvent({
                          category: "preview",
                          name: `sandbox.preview.${status.replace(/-/g, "_")}`,
                          level: [
                            "runtime-error",
                            "timeout",
                            "left-document",
                            "incomplete",
                          ].includes(status)
                            ? "warn"
                            : "info",
                          details: { runtimeType: "sandboxed-html", status },
                        });
                      }}
                      activeDemoId={activeDemoId}
                      onPageSelect={async (pageId) => {
                        if (editingPageId === pageId) return;
                        await handleConfigPanelPageSelect(pageId);
                      }}
                      onPageRename={handlePageRename}
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
                          const res = await fetch(
                            `/api/projects/${demoId}/demos`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                sessionId,
                                name: `${page.name} - 副本`,
                                sourcePageId: pageId,
                              }),
                            },
                          );
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
                      onRequestRuntimeConversion={
                        handleRequestRuntimeConversion
                      }
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
                            onClick={() => setSaveVersionDialogOpen(true)}
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
                                保存为版本
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
                          {publishedVersion &&
                            publishStatus === "published" && (
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
                                              restoring ===
                                              event.version.versionId
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
                                              restoring ===
                                              event.version.versionId
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
              </ResizablePanel>
              <ResizablePanel
                className={`relative flex flex-col overflow-hidden bg-background ${
                  previewMode === "document"
                    ? ""
                    : "border rounded-lg shadow-sm"
                }`}
              >
                <div className="flex-1 overflow-hidden">
                  {previewMode === "document" ? (
                    <DocumentView
                      workingDir={workspacePath || undefined}
                      projectId={demoId}
                      sessionId={sessionId}
                      pages={demoPages.map((p) => ({ id: p.id, name: p.name }))}
                      onCommentTargetChange={setActiveDocumentCommentTarget}
                      onDocumentCommentSelection={(documentAnchor) => {
                        setActiveCommentThreadId(null);
                        setDocumentCommentSelection(documentAnchor);
                      }}
                      onItemsChange={setKnowledgeItems}
                      onItemsLoaded={(items) => setKnowledgeItems(items)}
                      onDocHistory={(item) => setKbHistoryItem(item)}
                      onDocDeleted={() => {
                        window.dispatchEvent(new Event("knowledge-updated"));
                      }}
                      designSpecFocus={designSpecFocus}
                    />
                  ) : (
                    <>
                      <style>{`
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
                      <CommentLayer
                        projectId={demoId}
                        pageId={activeDemoId}
                        api={commentApi}
                        wsUrl={commentWsUrl}
                        currentUser={commentUser}
                        canMentionAgent
                        disabled={false}
                        showToggle={false}
                        commentMode={commentModeActive}
                        onCommentModeChange={setCommentModeActive}
                        activeThreadId={activeCommentThreadId}
                        onActiveThreadChange={setActiveCommentThreadId}
                        threads={activePageCommentThreads}
                        onCreateComment={commentsData.createComment}
                        onAddReply={commentsData.addReply}
                        onUpdateComment={commentsData.updateComment}
                        onUpdateReply={commentsData.updateReply}
                        onSetResolved={commentsData.setResolved}
                        onDeleteThread={commentsData.deleteThread}
                        onDeleteReply={commentsData.deleteReply}
                        onRetryAiTask={commentsData.retryAiTask}
                        showPins={
                          previewMode === "canvas"
                            ? canvasRightPanelTab === "comments"
                            : rightPanelTab === "comments"
                        }
                        canvasCreateDraft={canvasCommentDraft}
                        onCanvasCreateDraftChange={setCanvasCommentDraft}
                      >
                        <HtmlFileDropZone
                          onFilesDrop={handlePreviewHtmlFilesDrop}
                        >
                          <PreviewStage
                            pages={previewStagePages}
                            activePageId={activeDemoId}
                            onActivePageChange={(pageId) =>
                              handleSinglePreviewSelectChange(`page:${pageId}`)
                            }
                            previewMode={previewMode}
                            onPreviewModeChange={handlePreviewModeChange}
                            canvasState={canvasState}
                            onCanvasStateChange={setCanvasState}
                            interactionMode="editor"
                            singlePagePresentationOverride={
                              temporaryPresentation
                            }
                            selectorSlot={
                              previewMode === "single" &&
                              (demoPages.length > 0 ||
                                singlePreviewDocumentNodes.length > 0) ? (
                                <>
                                  {activeDemoPage?.runtimeType ===
                                    "sketch-scene" && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className={`h-7 w-7 ${
                                        sketchEditing
                                          ? "border-emerald-500/80 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
                                          : ""
                                      }`}
                                      title={
                                        sketchEditing
                                          ? "退出手绘编辑"
                                          : "手绘编辑"
                                      }
                                      aria-label="手绘编辑"
                                      aria-pressed={sketchEditing}
                                      onClick={() =>
                                        setSketchEditing((current) => !current)
                                      }
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
                                    onClick={() =>
                                      void handleOpenSinglePreviewHistory()
                                    }
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
                                  {visualEditActive && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className={`h-7 w-7 ${
                                        visualAnnotationMode
                                          ? "border-amber-500/80 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
                                          : ""
                                      }`}
                                      aria-pressed={visualAnnotationMode}
                                      onClick={handleStartVisualAnnotation}
                                      title={
                                        visualAnnotationMode
                                          ? "退出批注模式"
                                          : "批注模式"
                                      }
                                    >
                                      <MessageSquarePlus className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {visualEditActive &&
                                    visualAnnotations.filter(
                                      (annotation) => !annotation.resolved,
                                    ).length > 0 &&
                                    !visualAnnotationMode && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 border-blue-500/50 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
                                        onClick={
                                          handleSendVisualAnnotationsToAI
                                        }
                                        title="发送批注给 AI"
                                      >
                                        <Send className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                </>
                              ) : undefined
                            }
                            toolbarCenter={toolbarCenter}
                            onSinglePagePrevious={handleSinglePreviewPrev}
                            onSinglePageNext={handleSinglePreviewNext}
                            toolbarTrailing={
                              previewMode === "single" &&
                              !singlePreviewViewingDocument ? (
                                <div className="flex min-w-0 items-center gap-2">
                                  {viewportControl}
                                  {activeRuntimeConversion ? (
                                    <div className="flex min-w-0 items-center gap-1">
                                      <Badge
                                        variant={
                                          activeRuntimeConversion.status ===
                                          "failed"
                                            ? "destructive"
                                            : activeRuntimeConversion.status ===
                                                "completed"
                                              ? "secondary"
                                              : "outline"
                                        }
                                        className="h-6 max-w-[180px] rounded-md px-2 text-[11px] font-normal"
                                        title={activeRuntimeConversion.message}
                                      >
                                        {(activeRuntimeConversion.status ===
                                          "running" ||
                                          activeRuntimeConversion.status ===
                                            "applying") && (
                                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                        )}
                                        {activeRuntimeConversion.status ===
                                        "completed"
                                          ? "转换完成"
                                          : activeRuntimeConversion.status ===
                                              "failed"
                                            ? "转换失败"
                                            : "转换中"}
                                      </Badge>
                                      {activeRuntimeConversion.status ===
                                        "failed" && (
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
                                            activeRuntimeConversion.message ||
                                            "重试转换"
                                          }
                                        >
                                          <RefreshCw className="mr-1 h-3 w-3" />
                                          重试
                                        </Button>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              ) : undefined
                            }
                            singlePageProps={{
                              emptyState: (
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
                              ),
                              onBackgroundClick: () => {
                                handleVisualSelect(null, []);
                                setVisualPanelHoverNodeId(null);
                              },
                              rendererProps: {
                                prototype: {
                                  sessionId,
                                  demoId: activeDemoId,
                                  allowScroll: true,
                                  visualEditMode: visualEditActive,
                                  visualAnnotationMode,
                                  visualAnnotations,
                                  onVisualAnnotationCreate: (
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
                                                  text:
                                                    trimmedText || "样式修改",
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
                                  },
                                  visualHoverNodeId: visualEditActive
                                    ? visualPanelHoverNodeId
                                    : null,
                                  selectedVisualNodeId:
                                    selectedVisualNode?.domPath ||
                                    selectedVisualNode?.nodeId ||
                                    null,
                                  hiddenVisualNodeIds,
                                  visualLayerTreeNodes,
                                  visualPropertyChanges,
                                  onVisualSelect: handleVisualSelect,
                                  onVisualSelectStack: setVisualNodeStack,
                                  onVisualTextChange:
                                    handlePrototypeVisualTextChange,
                                  onToggleNodeHidden:
                                    handleToggleVisualNodeHidden,
                                  visualNodeTreeRequestKey:
                                    visualLayerTreeRequestKey,
                                  onVisualNodeTreeChange:
                                    setVisualLayerTreeNodes,
                                },
                                sketch: {
                                  fillContainer: true,
                                },
                                highFidelity: {
                                  sessionId,
                                  demoId: activeDemoId,
                                  placeholderScreenshotUrl:
                                    activePreviewScreenshotUrl,
                                  onConsoleEntry: handleDiagnosticConsoleEntry,
                                  onError: handlePreviewError,
                                  isAutoRepairing,
                                  onContentLoaded: (details) => {
                                    recordDiagnosticEvent({
                                      category: "preview",
                                      name: "preview.content_loaded",
                                      details: {
                                        pageId: activeDemoId,
                                        mode: "single",
                                        requestId: details?.requestId,
                                      },
                                    });
                                    setSinglePreviewLoaded((current) =>
                                      current ? current : true,
                                    );
                                    const ackRevision =
                                      workspaceFlushRevisionRef.current;
                                    previewTrackerRef.current.ackPreview(
                                      ackRevision,
                                      "active-preview",
                                    );
                                    pendingSnapshotPageIdRef.current =
                                      activeDemoIdRef.current;
                                    setStaticPrototypeRequestKey(
                                      (key) => key + 1,
                                    );
                                  },
                                  onPositionableSizes: handlePositionableSizes,
                                  visualEditMode: visualEditActive,
                                  visualHoverNodeId: visualEditActive
                                    ? visualPanelHoverNodeId
                                    : null,
                                  selectedVisualNodeId:
                                    selectedVisualNode?.domPath ||
                                    selectedVisualNode?.nodeId ||
                                    null,
                                  hiddenVisualNodeIds,
                                  visualLayerTreeNodes,
                                  visualPropertyChanges,
                                  visualAnnotations,
                                  onVisualSelect: handleVisualSelect,
                                  onVisualSelectStack: setVisualNodeStack,
                                  visualNodeTreeRequestKey:
                                    visualLayerTreeRequestKey,
                                  onVisualNodeTreeChange:
                                    setVisualLayerTreeNodes,
                                  staticPrototypeRequestKey,
                                  onStaticPrototypeSnapshot:
                                    handleStaticPrototypeSnapshot,
                                  onVisualInlineEdit: handleVisualInlineEdit,
                                  visualAnnotationMode,
                                  onVisualAnnotationCreate: (
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
                                                  text:
                                                    trimmedText || "样式修改",
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
                                  },
                                  positionEditMode,
                                  positionEditDimming,
                                  onPositionChange: handlePositionChange,
                                  onPositionDrag: handlePositionDrag,
                                  onPositionEditExit: handleExitPositionEdit,
                                },
                              },
                            }}
                            canvasProps={{
                              editable: true,
                              sessionId,
                              projectId: demoId,
                              onRequestDeletePages: requestDeletePages,
                              onAddPagesToChat: handleAddPagesToChat,
                              onRequestPastePages: handlePastePages,
                              onRequestCreateReferences: handleCreateReferences,
                              onRequestPasteHtmlContent: handlePasteHtmlContent,
                              onViewSource: handleViewSourcePage,
                              focusPageId: focusCanvasPageId,
                              onVisiblePageIdsChange: setVisibleCanvasPageIds,
                              editingPageId: canvasEditingPageId ?? undefined,
                              screenshotUrls: canvasScreenshotUrls,
                              screenshotRenderBoxes:
                                canvasScreenshotRenderBoxes,
                              onConsoleEntry: handleDiagnosticConsoleEntry,
                              onError: handlePreviewError,
                              onPositionableSizes: handlePositionableSizes,
                              knowledgeDocuments: canvasKnowledgeDocuments,
                              fitToScreenOnMount: fitCanvasToScreenOnMount,
                              onFitToScreenOnMountComplete:
                                handleInitialCanvasFitComplete,
                              onCreateKnowledgeDocument:
                                createCanvasKnowledgeDocument,
                              onUpdateKnowledgeDocument:
                                updateCanvasKnowledgeDocument,
                              onReadKnowledgeDocument:
                                readCanvasKnowledgeDocument,
                              onPageConfigEdit: (pageId, options) => {
                                if (options?.openConfigDetail === false) {
                                  setConfigPanelDetailPageId(null);
                                  setConfigPanelOverviewRequested(true);
                                } else {
                                  setConfigPanelDetailPageId(pageId);
                                }
                                void handleConfigPanelPageSelect(
                                  pageId,
                                  undefined,
                                  {
                                    focusCanvas: false,
                                    openConfigDetail: options?.openConfigDetail,
                                  },
                                );
                              },
                              onPageRename: handlePageRename,
                              onPageComment: commentModeActive
                                ? ({
                                    pageId,
                                    pageName,
                                    pin,
                                    clientX,
                                    clientY,
                                  }) => {
                                    setRightPanelTab("comments");
                                    setCanvasCommentDraft({
                                      input: {
                                        target: { kind: "page", pageId },
                                        anchor: {
                                          domPath: "canvas-page",
                                          tagName: "canvas-page",
                                          componentName: pageName,
                                          textSnippet: pageName,
                                          snapshot: {
                                            attrs: { "data-page-id": pageId },
                                          },
                                        },
                                        pin,
                                      },
                                      clientX,
                                      clientY,
                                    });
                                  }
                                : undefined,
                              onCanvasClick: () => {
                                clearCanvasSelection();
                                setCanvasEditingPageId(null);
                                setConfigPanelDetailPageId(null);
                                setConfigPanelOverviewRequested(true);
                              },
                            }}
                            renderSingleContent={({
                              activePage,
                              resolvedPreviewSize,
                            }) => {
                              if (
                                singlePreviewViewingDocument &&
                                activeSinglePreviewDocumentNode
                              ) {
                                return (
                                  <div className="h-full overflow-y-auto p-4">
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
                                  </div>
                                );
                              }
                              if (
                                activePage?.runtimeType === "sketch-scene" &&
                                sketchEditing
                              ) {
                                return (
                                  <div className="h-full overflow-y-auto p-4">
                                    <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-md border bg-background shadow-sm">
                                      <div className="min-h-0 flex-1 overflow-hidden">
                                        <SketchEditorEngineStage
                                          scene={activeSketchScene}
                                          configData={configData}
                                          previewSize={resolvedPreviewSize}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return undefined;
                            }}
                          />
                        </HtmlFileDropZone>
                      </CommentLayer>
                    </>
                  )}
                </div>
                {(isInitialPageLoading || initialPageError) && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/85 backdrop-blur-sm">
                    {isInitialPageLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在加载当前页…
                      </div>
                    ) : (
                      <div className="max-w-sm space-y-3 px-6 text-center">
                        <p className="text-sm font-medium">当前页加载失败</p>
                        <p className="text-xs text-muted-foreground">
                          {initialPageError}
                        </p>
                        <Button
                          size="sm"
                          onClick={() =>
                            setLoadAttempt((current) => current + 1)
                          }
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          重试
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </ResizablePanel>

              {isConfigPanelVisible && (
                <ResizablePanel className="relative flex flex-col overflow-hidden border-l bg-card">
                  {previewMode === "document" ? (
                    <DocumentModeRightPanel
                      target={activeDocumentCommentTarget}
                      threads={documentCommentsData.threads}
                      currentUserId={currentUserId || undefined}
                      currentUser={commentUser}
                      mentionCandidates={[]}
                      canMentionAgent={true}
                      activeThreadId={activeCommentThreadId}
                      onSelectThread={(id) => {
                        setActiveCommentThreadId(id);
                        setCommentModeActive(false);
                      }}
                      onCreateComment={documentCommentsData.createComment}
                      selectionDraft={documentCommentSelection}
                      onSelectionDraftHandled={() =>
                        setDocumentCommentSelection(null)
                      }
                      unresolvedCount={
                        documentCommentsData.threads.filter(
                          (thread) => !thread.resolved,
                        ).length
                      }
                    />
                  ) : previewMode === "single" ? (
                    <>
                      <Tabs
                        value={effectiveRightPanelTab}
                        onValueChange={(v) =>
                          setRightPanelTab(v as "edit" | "config" | "comments")
                        }
                        className="flex h-full flex-col"
                      >
                        <TabsList className="w-full justify-start gap-2 rounded-none border-b px-2 h-12 bg-transparent">
                          {canUseVisualEditor && (
                            <TabsTrigger
                              value="edit"
                              title="编辑"
                              className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                            >
                              <SquarePen className="h-4 w-4" />
                              {rightPanelTab === "edit" && <span>编辑</span>}
                            </TabsTrigger>
                          )}
                          <TabsTrigger
                            value="config"
                            title="配置"
                            className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                          >
                            <SlidersHorizontal className="h-4 w-4" />
                            {rightPanelTab === "config" && <span>配置</span>}
                          </TabsTrigger>
                          <TabsTrigger
                            value="comments"
                            title={commentTabLabel}
                            aria-label={commentTabLabel}
                            className="relative gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                          >
                            <MessageSquare className="h-4 w-4" />
                            {rightPanelTab === "comments" && <span>评论</span>}
                            <CommentUnreadDot count={unresolvedCommentCount} />
                          </TabsTrigger>
                        </TabsList>
                        {canUseVisualEditor && (
                          <TabsContent
                            value="edit"
                            className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden"
                          >
                            <VisualEditSidebar
                              layerNodes={visualLayerTreeNodes}
                              selectedNodeId={
                                selectedVisualNode?.domPath ||
                                selectedVisualNode?.nodeId ||
                                null
                              }
                              hiddenNodeIds={hiddenVisualNodeIds}
                              getNodeBadgeCount={getVisualNodeChangeCount}
                              onSelectLayer={(node, path) => {
                                handleVisualSelect(node, path);
                              }}
                              onToggleNodeHidden={handleToggleVisualNodeHidden}
                              onHoverLayerNodeId={setVisualPanelHoverNodeId}
                              onAddNodeToChat={handleAddNodeToChat}
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
                                onClearChanges={
                                  handleClearSelectedVisualProperties
                                }
                                onMarkConfig={handleMarkVisualConfig}
                                onUpdateConfigMark={
                                  handleUpdateVisualConfigMark
                                }
                                onRemoveConfigMark={
                                  handleRemoveVisualConfigMark
                                }
                                onAiInstructionChange={setVisualAiInstruction}
                                draftAction={visualDraftAction}
                                draftActionDisabled={visualSendDisabled}
                                onDraftActionPrimary={
                                  handleSubmitVisualDraftAction
                                }
                                onDraftActionCancel={
                                  handleClearVisualProperties
                                }
                                onAddToChat={handleAddToChat}
                              />
                            </VisualEditSidebar>
                          </TabsContent>
                        )}
                        <TabsContent
                          value="config"
                          className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden"
                        >
                          <PageConfigPanel
                            pages={demoPages.map((page) => ({
                              id: page.id,
                              name: page.name,
                              order: page.order,
                              schema:
                                pageSchemaMap[page.id] ||
                                (page.id === activeDemoId ? schema : undefined),
                              configData: configDataMap[page.id],
                              projectConfigSchema:
                                referencePageProjectSchemas[page.id],
                              designSpecEntries:
                                referencePageDesignSpecEntries[page.id],
                              projectConfigBindings:
                                page.runtimeType === "prototype-html-css"
                                  ? extractPrototypeConfigBindingKeys(
                                      pagePrototypeMap[page.id]?.html,
                                    )
                                  : page.runtimeType ===
                                        "high-fidelity-react" ||
                                      page.runtimeType === "sketch-scene"
                                    ? extractCodeConfigBindingKeys(
                                        pageCodes[page.id],
                                        getSchemaPropertyKeys(
                                          referencePageProjectSchemas[
                                            page.id
                                          ] ?? projectConfigSchema,
                                        ),
                                      )
                                    : [],
                            }))}
                            activePageId={activeDemoId}
                            detailPageId={activeDemoId}
                            onDetailPageIdChange={(pageId) => {
                              setConfigPanelDetailPageId(pageId);
                            }}
                            onPageSelect={(pageId, options) =>
                              void handleConfigPanelPageSelect(
                                pageId,
                                undefined,
                                {
                                  openConfigDetail: options?.openConfigDetail,
                                },
                              )
                            }
                            projectConfigSchema={projectConfigSchema}
                            onProjectConfigChange={
                              handleProjectConfigPanelChange
                            }
                            onProjectSchemaChange={handleProjectSchemaChange}
                            onProjectDefinitionChange={
                              handleProjectDefinitionChange
                            }
                            onDefinitionSendToAI={
                              handleConfigDefinitionSendToAI
                            }
                            onDefinitionAnalyze={handleConfigDefinitionAnalyze}
                            onPageConfigChange={handlePageConfigPanelChange}
                            onPageSchemaChange={handlePageSchemaChange}
                            onPageDefinitionChange={handlePageDefinitionChange}
                            onSaveAsDefaults={
                              activeDemoPage?.reference
                                ? undefined
                                : handleSaveAsDefaults
                            }
                            onRestoreDefaults={
                              activeDemoPage?.reference
                                ? undefined
                                : handleRestoreDefaults
                            }
                            onProjectSaveAsDefaults={
                              handleProjectSaveAsDefaults
                            }
                            onProjectRestoreDefaults={
                              handleProjectRestoreDefaults
                            }
                            sessionId={sessionId}
                            onLaunchWhiteboard={
                              WHITEBOARD_AUTHORING_ENABLED
                                ? launchWhiteboard
                                : undefined
                            }
                            hideDetailHeader
                            onEnterPositionEdit={handleEnterPositionEdit}
                            onPositionFieldPathChange={
                              handlePositionFieldPathChange
                            }
                            onExitPositionEdit={handleExitPositionEdit}
                            positionEditActiveId={
                              positionEditMode.target?.id ?? null
                            }
                            positionEditDimming={positionEditDimming}
                            onTogglePositionDimming={
                              handleTogglePositionDimming
                            }
                            requirements={
                              activeDemoPage?.reference
                                ? (referencePageRequirements[activeDemoId] ??
                                  "")
                                : (requirementsMap[activeDemoId] ?? "")
                            }
                            onRequirementsChange={(markdown) =>
                              handlePageRequirementsChange(
                                activeDemoId,
                                markdown,
                              )
                            }
                            requirementsLoading={requirementsLoading}
                            requirementsPosition="hidden"
                            readonly={!!activeDemoPage?.reference}
                            designSpecApiContext={{
                              workingDir: workspacePath || undefined,
                              sessionId,
                              projectId: demoId,
                            }}
                            onEditDesignSpec={(docId, entryId) => {
                              setDesignSpecFocus({ docId, entryId });
                              setPreviewMode("document");
                            }}
                          />
                        </TabsContent>
                        <TabsContent
                          value="comments"
                          className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden"
                        >
                          <CommentPanel
                            threads={activePageCommentThreads}
                            currentUserId={currentUserId || undefined}
                            activeThreadId={activeCommentThreadId}
                            onSelectThread={(id) => {
                              setActiveCommentThreadId(id);
                              setCommentModeActive(false);
                            }}
                            commentMode={commentModeActive}
                            onCommentModeChange={setCommentModeActive}
                          />
                        </TabsContent>
                      </Tabs>
                    </>
                  ) : (
                    <Tabs
                      value={canvasRightPanelTab}
                      onValueChange={(v) =>
                        setRightPanelTab(v as "config" | "comments")
                      }
                      className="flex h-full flex-col"
                    >
                      <TabsList className="w-full justify-start gap-2 rounded-none border-b px-2 h-12 bg-transparent">
                        {hasAnyConfig && (
                          <TabsTrigger
                            value="config"
                            title="配置"
                            className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                          >
                            <SlidersHorizontal className="h-4 w-4" />
                            {canvasRightPanelTab === "config" && (
                              <span>配置</span>
                            )}
                          </TabsTrigger>
                        )}
                        <TabsTrigger
                          value="comments"
                          title={commentTabLabel}
                          aria-label={commentTabLabel}
                          className="relative gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                        >
                          <MessageSquare className="h-4 w-4" />
                          {canvasRightPanelTab === "comments" && (
                            <span>评论</span>
                          )}
                          <CommentUnreadDot count={unresolvedCommentCount} />
                        </TabsTrigger>
                      </TabsList>
                      {hasAnyConfig && (
                        <TabsContent
                          value="config"
                          className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden"
                        >
                          <PageConfigPanel
                            pages={demoPages.map((page) => ({
                              id: page.id,
                              name: page.name,
                              order: page.order,
                              schema:
                                pageSchemaMap[page.id] ||
                                (page.id === activeDemoId ? schema : undefined),
                              configData: configDataMap[page.id],
                              projectConfigSchema:
                                referencePageProjectSchemas[page.id],
                              designSpecEntries:
                                referencePageDesignSpecEntries[page.id],
                              projectConfigBindings:
                                page.runtimeType === "prototype-html-css"
                                  ? extractPrototypeConfigBindingKeys(
                                      pagePrototypeMap[page.id]?.html,
                                    )
                                  : page.runtimeType ===
                                        "high-fidelity-react" ||
                                      page.runtimeType === "sketch-scene"
                                    ? extractCodeConfigBindingKeys(
                                        pageCodes[page.id],
                                        getSchemaPropertyKeys(
                                          referencePageProjectSchemas[
                                            page.id
                                          ] ?? projectConfigSchema,
                                        ),
                                      )
                                    : [],
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
                            onPageSelect={(pageId, options) =>
                              void handleConfigPanelPageSelect(
                                pageId,
                                undefined,
                                {
                                  openConfigDetail: options?.openConfigDetail,
                                },
                              )
                            }
                            hideOverviewHeader
                            projectConfigSchema={projectConfigSchema}
                            onProjectConfigChange={
                              handleProjectConfigPanelChange
                            }
                            onProjectSchemaChange={handleProjectSchemaChange}
                            onProjectDefinitionChange={
                              handleProjectDefinitionChange
                            }
                            onDefinitionSendToAI={
                              handleConfigDefinitionSendToAI
                            }
                            onDefinitionAnalyze={handleConfigDefinitionAnalyze}
                            onPageConfigChange={handlePageConfigPanelChange}
                            requirementsPosition="hidden"
                            onPageSchemaChange={handlePageSchemaChange}
                            onPageDefinitionChange={handlePageDefinitionChange}
                            onSaveAsDefaults={
                              activeDemoPage?.reference
                                ? undefined
                                : handleSaveAsDefaults
                            }
                            onRestoreDefaults={
                              activeDemoPage?.reference
                                ? undefined
                                : handleRestoreDefaults
                            }
                            onProjectSaveAsDefaults={
                              handleProjectSaveAsDefaults
                            }
                            onProjectRestoreDefaults={
                              handleProjectRestoreDefaults
                            }
                            sessionId={sessionId}
                            onLaunchWhiteboard={
                              WHITEBOARD_AUTHORING_ENABLED
                                ? launchWhiteboard
                                : undefined
                            }
                            onEnterPositionEdit={handleEnterPositionEdit}
                            onPositionFieldPathChange={
                              handlePositionFieldPathChange
                            }
                            onExitPositionEdit={handleExitPositionEdit}
                            positionEditActiveId={
                              positionEditMode.target?.id ?? null
                            }
                            positionEditDimming={positionEditDimming}
                            onTogglePositionDimming={
                              handleTogglePositionDimming
                            }
                            requirements={
                              requirementsMap[
                                configPanelDetailPageId ?? activeDemoId
                              ] ?? ""
                            }
                            onRequirementsChange={(markdown) =>
                              handlePageRequirementsChange(
                                configPanelDetailPageId ?? activeDemoId,
                                markdown,
                              )
                            }
                            requirementsLoading={requirementsLoading}
                            readonly={!!activeDemoPage?.reference}
                            designSpecApiContext={{
                              workingDir: workspacePath || undefined,
                              sessionId,
                              projectId: demoId,
                            }}
                            onEditDesignSpec={(docId, entryId) => {
                              setDesignSpecFocus({ docId, entryId });
                              setPreviewMode("document");
                            }}
                          />
                        </TabsContent>
                      )}
                      <TabsContent
                        value="comments"
                        className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden"
                      >
                        <CommentPanel
                          threads={activePageCommentThreads}
                          currentUserId={currentUserId || undefined}
                          activeThreadId={activeCommentThreadId}
                          onSelectThread={(id) => {
                            setActiveCommentThreadId(id);
                            setCommentModeActive(false);
                          }}
                          commentMode={commentModeActive}
                          onCommentModeChange={setCommentModeActive}
                          createHint="点击画布页面后，直接添加页面级评论"
                        />
                      </TabsContent>
                    </Tabs>
                  )}
                </ResizablePanel>
              )}
            </ResizablePanelGroup>
          </SketchEditorEngineBoundary>
        </DesignSpecWorkspaceProvider>
      </div>

      {whiteboardTarget ? (
        <WhiteboardDialog
          open
          projectId={demoId}
          sessionId={sessionId}
          target={whiteboardTarget}
          onOpenChange={(open) => {
            if (!open) setWhiteboardTarget(null);
          }}
          onCommitted={handleWhiteboardCommitted}
          onDiagnosticEvent={recordDiagnosticEvent}
        />
      ) : null}

      <ConfigItemEditorDialog
        open={visualConfigDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseVisualConfigDialog();
        }}
        mode="create"
        scope="page"
        draft={visualConfigDraft}
        onDraftChange={handleVisualConfigDraftChange}
        allowedKinds={[visualConfigDraft.kind]}
        showRequired={false}
        groupLabel="分类"
        busy={visualConfigApplying}
        applyPlan={{
          kind: "bind_and_apply",
          title: "保存并应用",
          description:
            "将所选属性设为配置项，并尝试直接应用到页面。无法安全直写时会交给 AI 处理。",
        }}
        formPrefix={
          <div className="space-y-3">
            <label className="block space-y-1.5 text-sm font-medium">
              配置内容
              <Select
                value={visualConfigCandidateId}
                onValueChange={handleVisualConfigCandidateChange}
              >
                <SelectTrigger>
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
            </label>
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
        }
        defaultValueEditor={
          <div className="flex items-center gap-2">
            {visualConfigDraft.kind === "color" && (
              <input
                aria-label="选择默认颜色"
                className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                type="color"
                value={visualConfigDefaultValue || "#000000"}
                onChange={(event) =>
                  setVisualConfigDefaultValue(event.target.value)
                }
              />
            )}
            <Input
              aria-label="默认值"
              value={visualConfigDefaultValue}
              onChange={(event) =>
                setVisualConfigDefaultValue(event.target.value)
              }
              className="font-mono text-xs"
            />
          </div>
        }
        onApply={handleApplyVisualConfig}
      />

      <ProjectSettingsDialog
        open={projectSettingsOpen}
        onOpenChange={setProjectSettingsOpen}
        projectId={demoId}
        currentThumbnail={currentThumbnail}
        onThumbnailChange={(thumbnail) =>
          setCurrentThumbnail(thumbnail ?? undefined)
        }
        currentUserRole={currentUserRole}
        projectType={projectType}
        pages={demoPages}
        onSettingsSaved={() => window.location.reload()}
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

      <Dialog
        open={saveVersionDialogOpen}
        onOpenChange={setSaveVersionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存为版本</DialogTitle>
            <DialogDescription>
              为当前项目状态创建一个命名版本，方便后续追溯和恢复。不填写则使用默认名称。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="version-name">版本名称（可选）</Label>
            <Input
              id="version-name"
              value={versionNameInput}
              onChange={(e) => setVersionNameInput(e.target.value)}
              placeholder="例如：v1.0、首页改版、修复样式问题"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSaveVersionDialogOpen(false);
                  void handleCreateVersionWithScreenshot(
                    versionNameInput || undefined,
                  );
                  setVersionNameInput("");
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSaveVersionDialogOpen(false);
                setVersionNameInput("");
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                setSaveVersionDialogOpen(false);
                void handleCreateVersionWithScreenshot(
                  versionNameInput || undefined,
                );
                setVersionNameInput("");
              }}
            >
              保存版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExitDialog} onOpenChange={handleExitDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {exitState === "saving" ? "正在保存" : "保存未完成"}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {exitState === "saving" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  正在保存最新修改，完成后将自动返回首页。
                </>
              ) : (
                (exitErrorLabel ?? "最新修改尚未确认同步完成。")
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleDirectExit}>
              {exitState === "saving" ? "直接退出" : "仍然退出"}
            </Button>
            <Button onClick={handleStayOnPage}>
              {exitState === "saving" ? "关闭" : "继续编辑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareDialog
        projectId={demoId}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
      />

      <Dialog open={showUnpublishDialog} onOpenChange={setShowUnpublishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>撤销发布</DialogTitle>
            <DialogDescription>
              撤销后，使用端将无法访问该项目。确认撤销？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowUnpublishDialog(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={unpublishing}
              onClick={async () => {
                await handleUnpublish();
                setShowUnpublishDialog(false);
              }}
            >
              {unpublishing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  撤销中...
                </>
              ) : (
                "撤销发布"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
