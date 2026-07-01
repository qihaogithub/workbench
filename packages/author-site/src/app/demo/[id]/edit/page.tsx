"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  PreviewPanel,
  PreviewCanvas,
  LayerTreeMenu,
  PageConfigPanel,
  invalidateCompileCache,
  isSchemaEmpty,
} from "../../../../../components/demo";
import type {
  PositionableSizeItem,
  PreviewSize,
  ScreenshotRenderBox,
  VisualNodeInfo,
  VisualNodeTreeItem,
} from "../../../../../components/demo";
import {
  useScreenshotGeneration,
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
import { flushWorkspaceCollab } from "@/lib/client-workspace-flush";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AIChat, type AutoRepairTrigger } from "@/components/ai-elements/ai-chat";
import { type ChatMessage } from "@/components/ai-elements";
import type { StreamService } from "@/components/ai-elements/chat/services/stream-service";
import { useConsoleBuffer } from "@/components/demo/useConsoleBuffer";
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
  FileText,
  Map,
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { CoverImageDialog } from "@/components/cover-image-dialog";
import { DemoPageTree } from "@/components/demo/DemoPageTree";
import { WorkspaceFileTree } from "@/components/demo/WorkspaceFileTree";
import { WorkspaceCodeDialog } from "@/components/demo/WorkspaceCodeDialog";
import { KnowledgePanel } from "@/components/demo/KnowledgePanel";
import { KnowledgeDocDialog, type KnowledgeItem, type KnowledgeDocDialogMode } from "@/components/demo/KnowledgeDocDialog";
import { useCollabDocument } from "@/hooks/useCollabDocument";
import { VisualPropertyPanel } from "./components/VisualPropertyPanel";
import { useVisualEditState } from "./hooks/useVisualEditState";
import { useVersionControl } from "./hooks/useVersionControl";
import type {
  CanvasState,
  CanvasKnowledgeDocument,
  CanvasKnowledgeDocumentCreateInput,
  CanvasKnowledgeDocumentUpdateInput,
  PreviewDiagnosticError,
} from "@opencode-workbench/demo-ui";
import type {
  DemoFiles,
  DemoPageMeta,
  DemoFolderMeta,
  PageVersionHistoryResponse,
  PageVersionInfo,
  VersionHistoryResponse,
  VersionInfo,
  WorkspaceTree,
} from "@opencode-workbench/shared";
import { projectApiClient } from "@/lib/project-api";
import type { ActiveViewContext } from "@/lib/agent/active-view-context";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

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

type PreviewRuntimeErrorContext = NonNullable<
  ActiveViewContext["previewDiagnostic"]
>;

function parsePreviewDimension(value: string | number | undefined): number | undefined {
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

function getSchemaPropertyKeys(...schemas: Array<string | undefined | null>): string[] {
  const keys = new Set<string>();
  for (const schema of schemas) {
    if (!schema) continue;
    try {
      const parsed = JSON.parse(schema) as { properties?: Record<string, unknown> };
      for (const key of Object.keys(parsed.properties || {})) {
        keys.add(key);
      }
    } catch {
      // 忽略坏 schema，保存入口仍会做完整校验。
    }
  }
  return Array.from(keys);
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

function toCanvasKnowledgeDocument(item: KnowledgeItem): CanvasKnowledgeDocument {
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

function replaceCollabText(ytext: { toString: () => string; delete: (index: number, length: number) => void; insert: (index: number, text: string) => void } | null, value: string): void {
  if (!ytext || ytext.toString() === value) return;
  ytext.delete(0, ytext.toString().length);
  if (value) ytext.insert(0, value);
}

const WORKSPACE_FLUSH_DELAY_MS = 1200;

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

export default function DemoEditPage({ params }: DemoEditPageProps) {
  const router = useRouter();
  const { id: demoId } = params;
  const { toast } = useToast();
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
  const [pageSchemaMap, setPageSchemaMap] = useState<Record<string, string>>({});
  const pageSchemaMapRef = useRef(pageSchemaMap);
  pageSchemaMapRef.current = pageSchemaMap;
  const [pageCodes, setPageCodes] = useState<Record<string, string>>({});
  const [pagePreviewSizeMap, setPagePreviewSizeMap] = useState<Record<string, import("@opencode-workbench/demo-ui").PreviewSize>>({});
  const [positionableItemSizes, setPositionableItemSizes] = useState<Record<string, PositionableSizeItem>>({});
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
  const [tempWorkspace, setTempWorkspace] = useState("");
  const [previewSize, setPreviewSize] =
    useState<import("@opencode-workbench/demo-ui").PreviewSize>();

  const [demoName, setDemoName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasPendingWorkspaceFlush, setHasPendingWorkspaceFlush] = useState(false);
  const [workspaceFlushRevision, setWorkspaceFlushRevision] = useState(0);
  const [workspaceFlushError, setWorkspaceFlushError] = useState<string | null>(null);
  const workspaceFlushRevisionRef = useRef(0);
  const [currentThumbnail, setCurrentThumbnail] = useState<string | undefined>(
    undefined,
  );
  const markWorkspaceChanged = useCallback(() => {
    setHasUnsavedChanges(true);
    setHasPendingWorkspaceFlush(true);
    setWorkspaceFlushError(null);
    setWorkspaceFlushRevision((current) => {
      const next = current + 1;
      workspaceFlushRevisionRef.current = next;
      return next;
    });
  }, []);

  // 多页面状态
  const [demoPages, setDemoPages] = useState<DemoPageMeta[]>([]);
  const [demoFolders, setDemoFolders] = useState<DemoFolderMeta[]>([]);
  const [activeDemoId, setActiveDemoId] = useState<string>("");
  const activeDemoIdRef = useRef(activeDemoId);
  activeDemoIdRef.current = activeDemoId;
  const suppressNextCanvasCollabPushRef = useRef(false);
  const [projectConfigSchema, setProjectConfigSchema] = useState<
    string | undefined
  >(undefined);
  const projectConfigSchemaRef = useRef<string | undefined>(projectConfigSchema);
  projectConfigSchemaRef.current = projectConfigSchema;
  const [configPanelDetailPageId, setConfigPanelDetailPageId] = useState<string | null>(null);

  const {
    previewMode,
    setPreviewMode,
    canvasState,
    setCanvasState,
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
  const lastAppliedCanvasCollabValueRef = useRef<string | null>(null);
  const [fitCanvasToScreenOnMount, setFitCanvasToScreenOnMount] = useState(false);
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
  const [visibleCanvasPageIds, setVisibleCanvasPageIds] = useState<string[]>([]);
  const visibleCanvasPageIdSet = useMemo(
    () => new Set(visibleCanvasPageIds),
    [visibleCanvasPageIds],
  );
  const nearbyCanvasPageIdSet = useMemo(() => {
    const nearby = new Set<string>();
    if (previewMode !== "canvas") return nearby;

    const orderedPageIds = demoPages.map((page) => page.id);
    const seedPageIds = new Set(
      [
        ...visibleCanvasPageIds,
        canvasEditingPageId ?? activeDemoId,
      ].filter(Boolean),
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
    regeneratePage,
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
            if (!state.screenshotUrl || state.loading) return false;
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
            if (!state.screenshotUrl || state.loading) return false;
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
      return priority === "active" || priority === "visible" ? "fast" : "strict";
    },
    [getScreenshotPriority],
  );

  const buildScreenshotBatchPages = useCallback(() => {
    const priorityWeight: Record<ScreenshotPriority, number> = {
      active: 0,
      visible: 1,
      nearby: 2,
      thumbnail: 3,
      background: 4,
    };

    return demoPages
      .filter((p) =>
        hasPreviewPageCode({
          pageId: p.id,
          pageCodes,
          activeCodePageId:
            pageCodes[activeDemoId] === code ? activeDemoId : undefined,
          activeCode: code,
        }),
      )
      .map((p, index) => {
        const pageCode = resolvePreviewPageCode({
          pageId: p.id,
          pageCodes,
          activeCodePageId:
            pageCodes[activeDemoId] === code ? activeDemoId : undefined,
          activeCode: code,
        });
        const { width, height } = getScreenshotRequestSize(
          pagePreviewSizeMap[p.id],
        );
        const priority = getScreenshotPriority(p.id);
        const renderMode = getScreenshotRenderMode(p.id);
        return {
          pageId: p.id,
          code: pageCode,
          configData: configDataMap[p.id] || {},
          width,
          height,
          fullPage: CANVAS_SCREENSHOT_FULL_PAGE,
          priority,
          renderMode,
          measuredHeight: pageScreenshots[p.id]?.renderBox?.height,
          index,
        };
      })
      .sort((a, b) => {
        const priorityDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
        return priorityDiff === 0 ? a.index - b.index : priorityDiff;
      })
      .map(({ index: _index, ...page }) => page);
  }, [
    code,
    activeDemoId,
    configDataMap,
    demoPages,
    getScreenshotRenderMode,
    getScreenshotPriority,
    pageCodes,
    pageScreenshots,
    pagePreviewSizeMap,
  ]);

  // 截图 debounce 再生定时器
  const configDataMapRef = useRef(configDataMap);
  configDataMapRef.current = configDataMap;
  const screenshotRegenerateTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // debounce 3s 触发单页截图再生
  const scheduleScreenshotRegenerate = useCallback((
    pageId: string,
    pageCode: string,
    configOverride?: Record<string, unknown>,
  ) => {
    const timers = screenshotRegenerateTimerRef.current;
    if (timers[pageId]) clearTimeout(timers[pageId]);
    timers[pageId] = setTimeout(() => {
      const config = configOverride ?? configDataMapRef.current[pageId] ?? {};
      const { width, height } = getScreenshotRequestSize(pagePreviewSizeMap[pageId]);
      regeneratePage(
        pageId,
        pageCode,
        config,
        width,
        height,
        CANVAS_SCREENSHOT_FULL_PAGE,
        getScreenshotPriority(pageId),
        getScreenshotRenderMode(pageId),
        pageScreenshots[pageId]?.renderBox?.height,
      );
      delete timers[pageId];
    }, 3000);
  }, [
    getScreenshotPriority,
    getScreenshotRenderMode,
    pageScreenshots,
    regeneratePage,
    pagePreviewSizeMap,
  ]);

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
    const canStartBatch =
      previewMode === "canvas" || (previewMode === "single" && singlePreviewLoaded);
    if (canStartBatch && demoPages.length > 0 && !isScreenshotGenerating) {
      const pages = buildScreenshotBatchPages();
      if (pages.length > 0) {
        initialScreenshotBatchStartedRef.current = true;
        startBatchGeneration(pages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, singlePreviewLoaded, buildScreenshotBatchPages]);

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
  const [kbDocDialogMode, setKbDocDialogMode] = useState<KnowledgeDocDialogMode>("read");
  const [kbDocDialogItem, setKbDocDialogItem] = useState<KnowledgeItem | null>(null);
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
      if (!tempWorkspace) {
        throw new Error("工作空间未初始化");
      }

      const res = await fetch(
        `/api/knowledge?workingDir=${encodeURIComponent(tempWorkspace)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: input.title,
            description: input.description ?? input.title,
            content: input.content,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "添加知识文档失败");
      }

      upsertKnowledgeItem(data.data);
      window.dispatchEvent(new Event("knowledge-updated"));
      return toCanvasKnowledgeDocument(data.data);
    },
    [tempWorkspace, upsertKnowledgeItem],
  );

  const updateCanvasKnowledgeDocument = useCallback(
    async (
      id: string,
      input: CanvasKnowledgeDocumentUpdateInput,
    ): Promise<CanvasKnowledgeDocument> => {
      if (!tempWorkspace) {
        throw new Error("工作空间未初始化");
      }

      const res = await fetch(
        `/api/knowledge/${id}?workingDir=${encodeURIComponent(tempWorkspace)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "保存知识文档失败");
      }

      upsertKnowledgeItem(data.data);
      window.dispatchEvent(new Event("knowledge-updated"));
      return toCanvasKnowledgeDocument(data.data);
    },
    [tempWorkspace, upsertKnowledgeItem],
  );

  const readCanvasKnowledgeDocument = useCallback(
    async (document: CanvasKnowledgeDocument): Promise<string> => {
      if (!tempWorkspace) return "";
      const res = await fetch(
        `/api/knowledge/content?workingDir=${encodeURIComponent(tempWorkspace)}&fileName=${encodeURIComponent(document.fileName)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "读取知识文档失败");
      }
      return data.data.content;
    },
    [tempWorkspace],
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
  const [rightPanelTab, setRightPanelTab] = useState("property");
  const [fileView, setFileView] = useState<"doc" | "code">("doc");
  const [triggerAutoSend, setTriggerAutoSend] = useState<string | AutoRepairTrigger | null>(null);
  // visualEditMode and related state moved to useVisualEditState hook

  // Console buffer for forwarding iframe console logs to agent-service
  const streamServiceRef = useRef<StreamService | null>(null);
  const autoPreviewRepairCountsRef = useRef<Map<string, number>>(new globalThis.Map());
  const { handleConsoleEntry } = useConsoleBuffer(streamServiceRef);

  // publishStatus, versionHistory, and related state moved to useVersionControl hook
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const collabUser = useMemo(
    () => ({
      userId: sessionId || "anonymous",
      username: currentUsername || "当前用户",
    }),
    [currentUsername, sessionId],
  );
  const activeCodeCollab = useCollabDocument(
    sessionId && workspaceId && activeDemoId
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
  const [previewRuntimeError, setPreviewRuntimeError] =
    useState<PreviewRuntimeErrorContext | null>(null);

  const schemaRegenerateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const configData = configDataMap[activeDemoId] ?? {};
  // visualConfigCandidates and selectedVisualConfigCandidate moved to useVisualEditState hook
  const activeViewContext = useMemo<ActiveViewContext>(() => {
    const focusedPageId =
      previewMode === "canvas"
        ? (canvasEditingPageId ?? undefined)
        : (activeDemoId || undefined);
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
  }, [activeDemoId, canvasEditingPageId, demoPages, previewMode, previewRuntimeError]);

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
        file: diagnostic.file || (pageId ? `demos/${pageId}/index.tsx` : undefined),
      };
      setPreviewRuntimeError(normalizedDiagnostic);

      const repairCount = pageId
        ? autoPreviewRepairCountsRef.current.get(pageId) ?? 0
        : 0;
      if (pageId && repairCount < 2) {
        autoPreviewRepairCountsRef.current.set(pageId, repairCount + 1);
        setTabValue("ai");
        const hiddenPrompt = `当前页面预览诊断失败，请自动修复一次。

页面: ${pageId}
文件: demos/${pageId}/index.tsx
触发来源: ${normalizedDiagnostic.source ?? "preview_runtime"}
阶段: ${normalizedDiagnostic.stage ?? "runtime"}
错误代码: ${normalizedDiagnostic.code ?? "unknown"}
错误: ${normalizedDiagnostic.message || "组件运行时发生错误"}
修复指引: ${normalizedDiagnostic.instruction ?? "请修复当前页面代码后确保预览可以重新编译和导入。"}

要求:
- 保持页面原有产品意图、视觉结构和配置字段不变。
- 优先使用 @preview/sdk 的受控能力，避免未登记依赖和不存在的 named import。
- 如果错误指向重复顶层声明或多个 default export，请删除重复拼接块，只保留一个完整 React 组件模块。
- 修复后不要新增无关文件。`;
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
      }
    },
    [activeDemoId, canvasEditingPageId, previewMode],
  );

  useEffect(() => {
    setPreviewRuntimeError(null);
  }, [activeDemoId]);

  /**
   * Unified snapshot application entry.
   * Atomically updates code, schema, editorContent, previewSize, configData, and snapshotVersion.
   */
  const applyDemoSnapshot = useCallback(
    (params: {
      code?: string;
      schema?: string;
      source: "ai-realtime" | "ai-finish" | "manual-load" | "page-switch" | "collab";
    }) => {
      const { code: newCode, schema: newSchema, source } = params;
      const targetPageId = activeDemoIdRef.current;

      if (newCode !== undefined) {
        if (source !== "collab") {
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
        if (source !== "collab") {
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
        const currentCode = newCode ?? extractCodeFromFigma(prev) ?? codeRef.current;
        const currentSchema = newSchema ?? extractSchemaFromFigma(prev) ?? schemaRef.current;
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
      markWorkspaceChanged,
      sessionId,
      activeDemoId,
    ],
  );

  const setStringTriggerAutoSend: Dispatch<SetStateAction<string | null>> =
    useCallback((nextValue) => {
      setTriggerAutoSend((prev) => {
        const stringPrev = typeof prev === "string" ? prev : null;
        return typeof nextValue === "function"
          ? nextValue(stringPrev)
          : nextValue;
      });
    }, []);

  // Visual edit state hook
  const visualEditState = useVisualEditState({
    codeRef,
    schemaRef,
    projectConfigSchema,
    activeDemoIdRef,
    sessionId,
    activeDemoId,
    applyDemoSnapshot,
    markWorkspaceChanged,
    setConfigDataMap,
    setTabValue,
    setTriggerAutoSend: setStringTriggerAutoSend,
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
  const [visualLayerTreeRequestKey, setVisualLayerTreeRequestKey] = useState(0);
  const [visualLayerTreeNodes, setVisualLayerTreeNodes] = useState<VisualNodeTreeItem[]>([]);

  const propertyPanelActive = previewMode === "single" && rightPanelTab === "property";

  useEffect(() => {
    if (propertyPanelActive) return;
    setVisualPanelHoverNodeId(null);
    setVisualLayerTreeOpen(false);
  }, [propertyPanelActive, setVisualPanelHoverNodeId]);

  useEffect(() => {
    setVisualLayerTreeNodes([]);
    setVisualLayerTreeOpen(false);
  }, [activeDemoId]);

  useEffect(() => {
    const hasPendingVisualWork =
      visualPendingPropertyChanges.length > 0 ||
      visualPendingConfigMarks.length > 0 ||
      hasPendingVisualAiInstruction;
    if (!hasPendingVisualWork) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [
    hasPendingVisualAiInstruction,
    visualPendingConfigMarks.length,
    visualPendingPropertyChanges.length,
  ]);

  const handleAiStreamingChange = useCallback(
    (isStreaming: boolean) => {
      setAiIsStreaming(isStreaming);
      handleVisualPropertySubmissionStreamingChange(isStreaming);
    },
    [handleVisualPropertySubmissionStreamingChange],
  );

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
    handleRestoreVersion,
    handlePreviewPageVersion,
    handleRestorePageVersion,
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
    markWorkspaceChanged();
  }, [
    activeCodeCollab.status,
    activeCodeCollab.value,
    activeCodeCollab.ytext,
    applyDemoSnapshot,
    markWorkspaceChanged,
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
    markWorkspaceChanged();
  }, [
    activeSchemaCollab.status,
    activeSchemaCollab.value,
    activeSchemaCollab.ytext,
    applyDemoSnapshot,
    markWorkspaceChanged,
  ]);

  useEffect(() => {
    if (projectSchemaCollab.status !== "synced") return;
    if (projectSchemaCollab.value === projectConfigSchema) return;
    if (
      projectSchemaCollab.value === "" &&
      projectConfigSchemaRef.current &&
      !isSchemaEmpty(projectConfigSchemaRef.current)
    ) {
      replaceCollabText(projectSchemaCollab.ytext, projectConfigSchemaRef.current);
      return;
    }
    setProjectConfigSchema(projectSchemaCollab.value);
    markWorkspaceChanged();
  }, [
    markWorkspaceChanged,
    projectConfigSchema,
    projectSchemaCollab.status,
    projectSchemaCollab.value,
    projectSchemaCollab.ytext,
  ]);

  const syncWorkspaceFileToCollab = useCallback(
    async (
      resourcePath: string,
      ytext: { toString: () => string; delete: (index: number, length: number) => void; insert: (index: number, text: string) => void } | null,
    ) => {
      if (!sessionId || !ytext) return;
      const response = await fetch(
        `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(resourcePath)}`,
      );
      const result = await response.json();
      if (!response.ok || !result.success || typeof result.data?.content !== "string") {
        throw new Error(result.error?.message || "刷新协同资源失败");
      }
      replaceCollabText(ytext, result.data.content);
    },
    [sessionId],
  );

  const handleWorkspaceTreeChanged = useCallback(() => {
    markWorkspaceChanged();
    void syncWorkspaceFileToCollab("workspace-tree.json", workspaceTreeCollab.ytext)
      .catch((error) => {
        console.warn("[collab] 刷新页面树协同文档失败", error);
      });
  }, [markWorkspaceChanged, syncWorkspaceFileToCollab, workspaceTreeCollab.ytext]);

  useEffect(() => {
    if (workspaceTreeCollab.status !== "synced" || !workspaceTreeCollab.value.trim()) return;
    let parsed: WorkspaceTree;
    try {
      parsed = JSON.parse(workspaceTreeCollab.value) as WorkspaceTree;
    } catch {
      return;
    }
    if (!Array.isArray(parsed.pages) || !Array.isArray(parsed.folders)) return;

    const current = JSON.stringify({
      pages: demoPages.map(({ id, name, routeKey, order, parentId }) => ({
        id,
        name,
        routeKey,
        order,
        parentId,
      })),
      folders: demoFolders,
    });
    const incoming = JSON.stringify({
      pages: parsed.pages.map(({ id, name, routeKey, order, parentId }) => ({
        id,
        name,
        routeKey,
        order,
        parentId,
      })),
      folders: parsed.folders,
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
    markWorkspaceChanged();
  }, [
    demoFolders,
    demoPages,
    markWorkspaceChanged,
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
    if (JSON.stringify(remoteState) === JSON.stringify(canvasStateRef.current)) {
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
    if (canvasLayoutCollab.status !== "synced" || !hasUnsavedCanvasChanges) return;
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
    setErrorBannerVisible(hasErrors);
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
            (d: { id: string; name: string; thumbnail?: string }) =>
              d.id === demoId,
          );
          if (demo) {
            setDemoName(demo.name);
            setCurrentThumbnail(demo.thumbnail);
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
        setTempWorkspace(sessionData.data.tempWorkspace || "");

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
        if (multi.projectConfigSchema) {
          replaceCollabText(projectSchemaCollab.ytext, multi.projectConfigSchema);
        }

        // 记录每个页面的 previewSize
        const previewSizeMap: Record<string, import("@opencode-workbench/demo-ui").PreviewSize> = {};
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
        const schemas: Record<string, string> = {};
        if (multi.demos) {
          for (const [pageId, demo] of Object.entries(multi.demos) as [
            string,
            { code: string; schema: string },
          ][]) {
            allDefaults[pageId] = getSafeMergedDefaults(demo.schema);
            schemas[pageId] = demo.schema;
            codes[pageId] = demo.code;
          }
        } else if (initialDemoId) {
          allDefaults[initialDemoId] = getSafeMergedDefaults(loadedSchema);
          schemas[initialDemoId] = loadedSchema;
        }
        setConfigDataMap(allDefaults);
        setPageCodes(codes);
        setPageSchemaMap((prev) => mergeLoadedPageSchemas(prev, schemas));

        const size = getPreviewSize(loadedSchema);
        setPreviewSize(size);

        // 初始化 Agent 会话
        setAgentSessionId(sessionData.data.sessionId);
      } catch (error) {
        toast({
          title: "加载失败",
          description: error instanceof Error ? error.message : "未知错误",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadDemo();
  }, [demoId, toast]);

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
      if (currentCode) {
        scheduleScreenshotRegenerate(currentPageId, currentCode, nextPageConfig);
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
        const currentCode =
          resolvePreviewPageCode({
            pageId,
            pageCodes,
            activeCodePageId:
              pageCodes[activeDemoIdRef.current] === codeRef.current
                ? activeDemoIdRef.current
                : undefined,
            activeCode: codeRef.current,
          });
        if (currentCode) {
          scheduleScreenshotRegenerate(pageId, currentCode, nextPageConfig);
        }
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageCodes],
  );

  const handleProjectConfigPanelChange = useCallback(
    (data: Record<string, unknown>) => {
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
          if (!pageCode) continue;
          scheduleScreenshotRegenerate(
            page.id,
            pageCode,
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

  const handleProjectSchemaChange = useCallback((newSchema: string) => {
    replaceCollabText(projectSchemaCollab.ytext, newSchema);
    setProjectConfigSchema(newSchema);
    projectConfigSchemaRef.current = newSchema;
  }, [projectSchemaCollab.ytext]);

  // 安全合并项目级 + 页面级 Schema 默认值
  const getSafeMergedDefaults = useCallback(
    (pageSchema: string) => {
      try {
        return mergeConfigToProps(projectConfigSchema, pageSchema);
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
    [projectConfigSchema],
  );

  const updatePageSchemaMapFromLoad = useCallback((pageId: string, loadedSchema: string) => {
    setPageSchemaMap((prev) => mergeLoadedPageSchemas(prev, { [pageId]: loadedSchema }));
  }, []);

  const rememberActivePageSchema = useCallback(() => {
    const currentPageId = activeDemoIdRef.current;
    const currentSchema = schemaRef.current;
    if (!currentPageId || !currentSchema || isSchemaEmpty(currentSchema)) return;
    setPageSchemaMap((prev) =>
      mergeLoadedPageSchemas(prev, { [currentPageId]: currentSchema }),
    );
  }, []);

  useEffect(() => {
    if (previewMode !== "canvas" || !sessionId || demoPages.length === 0) return;

    const missingPageIds = demoPages
      .map((page) => page.id)
      .filter((pageId) => pageCodes[pageId] === undefined);
    if (missingPageIds.length === 0) return;

    let cancelled = false;

    const loadMissingPageCodes = async () => {
      try {
        const loadedPages = await Promise.all(
          missingPageIds.map(async (pageId) => {
            const res = await fetch(`/api/sessions/${sessionId}/files/${pageId}`);
            const data = await res.json();
            if (!data.success) return null;
            return {
              pageId,
              code: data.data.code ?? "",
              schema: data.data.schema ?? "",
            };
          }),
        );
        if (cancelled) return;

        const nextCodes: Record<string, string> = {};
        const nextSchemas: Record<string, string> = {};
        const nextDefaults: Record<string, Record<string, unknown>> = {};
        const nextPreviewSizes: Record<
          string,
          import("@opencode-workbench/demo-ui").PreviewSize
        > = {};

        for (const page of loadedPages) {
          if (!page) continue;
          nextCodes[page.pageId] = page.code;
          nextSchemas[page.pageId] = page.schema;
          nextDefaults[page.pageId] = getSafeMergedDefaults(page.schema);
          const size = getPreviewSize(page.schema);
          if (size) {
            nextPreviewSizes[page.pageId] = size;
          }
        }

        if (Object.keys(nextCodes).length === 0) return;

        setPageCodes((prev) => ({ ...prev, ...nextCodes }));
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
  }, [
    demoPages,
    getSafeMergedDefaults,
    pageCodes,
    previewMode,
    sessionId,
  ]);

  const handleConfigPanelPageSelect = useCallback(
    async (pageId: string) => {
      rememberActivePageSchema();
      setActiveDemoId(pageId);
      activeDemoIdRef.current = pageId;
      if (pagePreviewSizeMap[pageId]) {
        setPreviewSize(pagePreviewSizeMap[pageId]);
      }
      if (previewMode === "canvas") {
        focusCanvasPage(pageId);
        setCanvasEditingPageId(pageId);
      }
      if (!sessionId) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/files/${pageId}`);
        const data = await res.json();
        if (data.success) {
          setPageCodes((prev) => ({
            ...prev,
            [pageId]: data.data.code,
          }));
          setCode(data.data.code);
          setSchema(data.data.schema);
          updatePageSchemaMapFromLoad(pageId, data.data.schema);
          setEditorContent(buildFigmaText(data.data.code, data.data.schema));
          setConfigDataMap((prev) => {
            if (prev[pageId]) return prev;
            const defaults = getSafeMergedDefaults(data.data.schema);
            return { ...prev, [pageId]: defaults };
          });
          const size = getPreviewSize(data.data.schema);
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

  const handleAiFilesChange = useCallback(
    async (files: AiFileChange[]) => {
      const hasWorkspaceStructureChange = files.some((file) => {
        const normalizedPath = file.path.replace(/\\/g, "/");
        return (
          normalizedPath === "workspace-tree.json" ||
          normalizedPath.startsWith("demos/")
        );
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
        const pagesWithSize = rawPages.map(
          (page: DemoPageMeta) => ({
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
        if (multi.projectConfigSchema) {
          replaceCollabText(projectSchemaCollab.ytext, multi.projectConfigSchema);
        }

        const pageIds = rawPages.map((page: DemoPageMeta) => page.id);
        const newPageIds = pageIds.filter((pageId: string) => !previousPageIds.has(pageId));
        const nextActiveId = pageIds.includes(previousActiveId)
          ? previousActiveId
          : pageIds[0];

        const codes: Record<string, string> = {};
        const allDefaults: Record<string, Record<string, unknown>> = {};
        const schemas: Record<string, string> = {};
        const previewSizeMap: Record<string, import("@opencode-workbench/demo-ui").PreviewSize> = {};
        if (multi.demos) {
          for (const [pageId, demo] of Object.entries(multi.demos) as [
            string,
            { code: string; schema: string },
          ][]) {
            codes[pageId] = demo.code;
            allDefaults[pageId] = getSafeMergedDefaults(demo.schema);
            schemas[pageId] = demo.schema;
            const pagePreviewSize = getPreviewSize(demo.schema);
            if (pagePreviewSize) {
              previewSizeMap[pageId] = pagePreviewSize;
            }
          }
        }

        setPageCodes(codes);
        setConfigDataMap(allDefaults);
        setPageSchemaMap((prev) => mergeLoadedPageSchemas(prev, schemas));
        setPagePreviewSizeMap(previewSizeMap);

        if (nextActiveId && multi.demos?.[nextActiveId]) {
          const target = multi.demos[nextActiveId];
          setActiveDemoId(nextActiveId);
          activeDemoIdRef.current = nextActiveId;
          setCode(target.code || "");
          setSchema(target.schema || "");
          setPageSchemaMap((prev) => ({
            ...prev,
            [nextActiveId]: target.schema || "",
          }));
          setEditorContent(buildFigmaText(target.code || "", target.schema || ""));
          setPreviewSize(getPreviewSize(target.schema || ""));
        } else {
          setActiveDemoId("");
          activeDemoIdRef.current = "";
          setCode("");
          setSchema("");
          setEditorContent(buildFigmaText("", ""));
          setPreviewSize(undefined);
        }

        if (previewMode === "canvas" && newPageIds.length > 0) {
          setFocusCanvasPageId(newPageIds[0]);
        }

        const pageCountChanged = pageIds.length !== previousPageIds.size;
        const pageIdentityChanged =
          pageCountChanged || pageIds.some((pageId: string) => !previousPageIds.has(pageId));
        toast({ title: pageIdentityChanged ? "页面列表已刷新" : "页面结构已更新" });
      } catch (error) {
        toast({
          title: "刷新页面列表失败",
          description: error instanceof Error ? error.message : "未知错误",
          variant: "destructive",
        });
      }
    },
    [
      demoPages,
      getSafeMergedDefaults,
      handleWorkspaceTreeChanged,
      previewMode,
      sessionId,
      setFocusCanvasPageId,
      toast,
    ],
  );

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.success && data.data?.username) {
          setCurrentUsername(data.data.username);
        }
      })
      .catch(() => {});
  }, []);

  // loadVersionHistory, loadPageVersionHistories, publish status effect, handlePublish,
  // and handleRestoreVersion moved to useVersionControl hook

  const persistActivePageToSession = async () => {
    if (!sessionId || !activeDemoId) {
      throw new Error("未选中页面或 Session 未创建");
    }

    const saveRes = await fetch(
      `/api/sessions/${sessionId}/files/${activeDemoId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, schema }),
      },
    );

    if (!saveRes.ok) {
      throw new Error("保存当前页面到临时工作区失败");
    }
  };

  // handlePreviewPageVersion and handleRestorePageVersion moved to useVersionControl hook
  // handleCreateVersion moved to useVersionControl hook
  // hasPendingChanges moved to useVersionControl hook

  useEffect(() => {
    if (!sessionId || !workspaceId) {
      setHasPendingWorkspaceFlush(false);
      setWorkspaceFlushError(null);
      return;
    }
  }, [sessionId, workspaceId]);

  const persistWorkspaceToProject = useCallback(async () => {
    if (!sessionId) return;
    const response = await fetch(`/api/sessions/${sessionId}/persist-workspace`, {
      method: "POST",
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(
        result?.error?.message || "同步项目当前工作区失败",
      );
    }
  }, [sessionId]);

  useEffect(() => {
    if (!hasPendingWorkspaceFlush || !sessionId || !workspaceId) return;

    const revisionAtStart = workspaceFlushRevision;
    const timer = window.setTimeout(() => {
      flushWorkspaceCollab(demoId, workspaceId, sessionId)
        .then(() => persistWorkspaceToProject())
        .then(() => {
          if (workspaceFlushRevisionRef.current !== revisionAtStart) return;
          setHasPendingWorkspaceFlush(false);
          setWorkspaceFlushError(null);
        })
        .catch((error) => {
          if (workspaceFlushRevisionRef.current !== revisionAtStart) return;
          setWorkspaceFlushError(
            error instanceof Error ? error.message : "协同草稿同步失败",
          );
        });
    }, WORKSPACE_FLUSH_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    demoId,
    hasPendingWorkspaceFlush,
    persistWorkspaceToProject,
    sessionId,
    workspaceFlushRevision,
    workspaceId,
  ]);

  const exitSyncStatuses = [
    activeCodeCollab.status,
    activeSchemaCollab.status,
    projectSchemaCollab.status,
    workspaceTreeCollab.status,
    canvasLayoutCollab.status,
  ];
  const hasExitSyncRisk =
    hasPendingWorkspaceFlush ||
    workspaceFlushError !== null ||
    (hasUnsavedChanges &&
      exitSyncStatuses.some((status) =>
        status === "error" ||
        status === "offline" ||
        status === "saving" ||
        status === "connecting",
      ));

  const flushBeforeExit = useCallback(async () => {
    const shouldPersistWorkspace =
      hasPendingWorkspaceFlush || hasUnsavedChanges;
    if (hasUnsavedCanvasChanges) {
      await flushCanvasState();
    }
    try {
      if (hasPendingWorkspaceFlush) {
        await flushWorkspaceCollab(demoId, workspaceId, sessionId);
      }
      if (shouldPersistWorkspace) {
        await persistWorkspaceToProject();
      }
      setHasPendingWorkspaceFlush(false);
      setWorkspaceFlushError(null);
    } catch (error) {
      setWorkspaceFlushError(
        error instanceof Error ? error.message : "协同草稿同步失败",
      );
      throw error;
    }
  }, [
    demoId,
    flushCanvasState,
    hasUnsavedChanges,
    hasPendingWorkspaceFlush,
    hasUnsavedCanvasChanges,
    persistWorkspaceToProject,
    sessionId,
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
      applyDemoSnapshot({ code: newCode, source });
    },
    [applyDemoSnapshot],
  );

  // 处理 AI Schema 更新 — 通过 applyDemoSnapshot 统一应用
  const handleSchemaUpdate = useCallback(
    (newSchema: string, source: "ai-realtime" | "ai-finish" = "ai-realtime") => {
      applyDemoSnapshot({ schema: newSchema, source });
    },
    [applyDemoSnapshot],
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
      const fileType = normalizedPath.endsWith("index.tsx") ? "code" : "schema";

      if (demoId && demoId === activeDemoId) {
        applyDemoSnapshot({
          [fileType === "code" ? "code" : "schema"]: content,
          source: "manual-load",
        });
      }
      markWorkspaceChanged();
    },
    [activeDemoId, applyDemoSnapshot, markWorkspaceChanged],
  );

  const activePreviewSize = useMemo(() => {
    if (activeDemoId) {
      const schemaForActivePage = pageSchemaMap[activeDemoId];
      const sizeFromSchema = schemaForActivePage
        ? getPreviewSize(schemaForActivePage)
        : undefined;
      return sizeFromSchema ?? pagePreviewSizeMap[activeDemoId] ?? previewSize;
    }
    return schema ? getPreviewSize(schema) ?? previewSize : previewSize;
  }, [activeDemoId, pagePreviewSizeMap, pageSchemaMap, previewSize, schema]);

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

  const hasProjectConfig = !isSchemaEmpty(projectConfigSchema);
  const hasPageConfig = !isSchemaEmpty(schema);
  const showProjectConfig = hasProjectConfig;
  const showPageConfig = hasPageConfig;
  const hasBothScopes = showProjectConfig && showPageConfig;
  const hasAnyConfig = showProjectConfig || showPageConfig;
  const isConfigPanelVisible = previewMode === "single" || hasAnyConfig;
  const visualConfigUsedKeys = getSchemaPropertyKeys(schema, projectConfigSchema);
  const activePageName =
    demoPages.find((page) => page.id === activeDemoId)?.name || activeDemoId;
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
              : version.sessionId === "restore" || version.note?.includes("恢复")
                ? "恢复项目"
                : "命名版本",
        savedAt: version.savedAt,
        savedBy: getVersionSavedBy(version.savedBy),
        version,
        isLatestProject: index === 0,
      };
    }),
    ...pageVersions.map((version): HistoryEvent => ({
      id: `page-${version.demoId}-${version.versionId}`,
      kind: "page",
      title: `修改了${version.demoName || version.demoId}`,
      savedAt: version.savedAt,
      version,
    })),
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
    activeCodeCollab.status,
    activeSchemaCollab.status,
    projectSchemaCollab.status,
    workspaceTreeCollab.status,
    canvasLayoutCollab.status,
  ];
  let collabStatusLabel = "已自动保存";
  if (workspaceFlushError) {
    collabStatusLabel = "同步失败";
  } else if (hasPendingWorkspaceFlush) {
    collabStatusLabel = "同步中";
  } else if (collabStatuses.includes("error")) {
    collabStatusLabel = "协同异常";
  } else if (collabStatuses.includes("offline")) {
    collabStatusLabel = "离线待同步";
  } else if (collabStatuses.includes("saving")) {
    collabStatusLabel = "同步中";
  } else if (collabStatuses.includes("connecting")) {
    collabStatusLabel = "连接中";
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
            variant={!publishButtonDisabled ? 'default' : 'outline'}
            className="gap-2"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {publishingButtonText}
              </>
            ) : publishStatus === 'published' ? (
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
          <ResizablePanel className="flex flex-col border-r bg-card">
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
                  workingDir={tempWorkspace || undefined}
                  projectId={demoId}
                  demoId={activeDemoId}
                  activeViewContext={activeViewContext}
                  workspaceId={workspaceId || undefined}
                  onCodeUpdate={handleCodeUpdate}
                  onSchemaUpdate={handleSchemaUpdate}
                  onFilesChange={handleAiFilesChange}
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
                      setTempWorkspace(data.data.tempWorkspace || "");
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
                        messagesData.success ? messagesData.data || [] : [],
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
                      workingDir={tempWorkspace || undefined}
                      onItemsChange={setKnowledgeItems}
                      onDocCreated={upsertKnowledgeItem}
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
                          setPageCodes((prev) => ({
                            ...prev,
                            [pageId]: data.data.code,
                          }));
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
                          const size = getPreviewSize(data.data.schema);
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
                  onPageDelete={async (pageId) => {
                    if (!sessionId) {
                      toast({
                        title: "未创建 Session",
                        variant: "destructive",
                      });
                      return;
                    }
                    const page = demoPages.find((p) => p.id === pageId);
                    if (!page || !confirm(`确定要删除页面「${page.name}」吗？`))
                      return;
                    try {
                      const res = await fetch(
                        `/api/projects/${demoId}/demos/${pageId}?sessionId=${encodeURIComponent(sessionId)}`,
                        { method: "DELETE" },
                      );
                      const data = await res.json();
                      if (data.success) {
                        handleWorkspaceTreeChanged();
                        setDemoPages((prev) =>
                          prev.filter((p) => p.id !== pageId),
                        );
                        setPageCodes((prev) => {
                          const rest = { ...prev };
                          delete rest[pageId];
                          return rest;
                        });
                        setConfigDataMap((prev) => {
                          const rest = { ...prev };
                          delete rest[pageId];
                          return rest;
                        });
                        setPagePreviewSizeMap((prev) => {
                          const rest = { ...prev };
                          delete rest[pageId];
                          return rest;
                        });
                        if (activeDemoId === pageId) {
                          const remaining = demoPages.filter(
                            (p) => p.id !== pageId,
                          );
                          const nextPage = remaining[0];
                          if (nextPage) {
                            setActiveDemoId(nextPage.id);
                            activeDemoIdRef.current = nextPage.id;
                            const fileRes = await fetch(
                              `/api/sessions/${sessionId}/files/${nextPage.id}`,
                            );
                            const fileData = await fileRes.json();
                            if (fileData.success) {
                              setPageCodes((prev) => ({
                                ...prev,
                                [nextPage.id]: fileData.data.code,
                              }));
                              setCode(fileData.data.code);
                              setSchema(fileData.data.schema);
                              setPageSchemaMap((prev) => ({
                                ...prev,
                                [nextPage.id]: fileData.data.schema,
                              }));
                              setEditorContent(
                                buildFigmaText(
                                  fileData.data.code,
                                  fileData.data.schema,
                                ),
                              );
                              setConfigDataMap((prev) => {
                                if (!prev[nextPage.id]) {
                                  const defaults = getSafeMergedDefaults(
                                    fileData.data.schema,
                                  );
                                  return {
                                    ...prev,
                                    [nextPage.id]: defaults,
                                  };
                                }
                                return prev;
                              });
                              const size = getPreviewSize(fileData.data.schema);
                              setPreviewSize(size);
                            }
                          } else {
                            setActiveDemoId("");
                            activeDemoIdRef.current = "";
                            setCode("");
                            setSchema("");
                            setEditorContent(buildFigmaText("", ""));
                            setPreviewSize(undefined);
                          }
                        }
                        toast({ title: "页面已删除" });
                      } else {
                        toast({
                          title: "删除失败",
                          description: data.error?.message,
                          variant: "destructive",
                        });
                      }
                    } catch {
                      toast({ title: "删除失败", variant: "destructive" });
                    }
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
                            publishStatus === 'published' ? 'secondary' :
                            publishStatus === 'unpublished_changes' ? 'default' :
                            'outline'
                          }
                        >
                          {publishStatus === 'published' && '已发布'}
                          {publishStatus === 'unpublished_changes' && '有未发布变更'}
                          {publishStatus === 'never_published' && '未发布'}
                        </Badge>
                      )}
                      {publishedVersion && publishStatus === 'published' && (
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
                      <p className="text-xs mt-1">内容会自动保存，需要时可命名重要版本</p>
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
                              const isProjectLike =
                                event.kind === "project" || event.kind === "page-restore";
                              const restoreVersion =
                                event.kind === "project" || event.kind === "page-restore"
                                  ? event.version
                                  : null;
                              return (
                                <div
                                  key={event.id}
                                  className="group flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                                >
                                  <span className="w-10 shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                                    {format(event.savedAt, 'HH:mm', { locale: zhCN })}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                    {event.title}
                                    {event.kind === "project" && (
                                      <span className="ml-3 inline-flex max-w-[110px] align-middle items-center gap-1 truncate text-xs font-normal text-muted-foreground">
                                        <User className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{event.savedBy}</span>
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex w-[96px] shrink-0 items-center justify-end gap-1">
                                    {event.kind === "page" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handlePreviewPageVersion(event.version)}
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
                                        onClick={() => handleRestorePageVersion(event.version)}
                                        disabled={restoring === event.version.versionId}
                                        className="h-7 gap-1 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                      >
                                        {restoring === event.version.versionId ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <RotateCcw className="h-3 w-3" />
                                        )}
                                        恢复
                                      </Button>
                                    )}
                                    {isProjectLike &&
                                      restoreVersion &&
                                      !(event.kind === "project" && event.isLatestProject) && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRestoreVersion(restoreVersion)}
                                        disabled={restoring === restoreVersion.versionId}
                                        className="h-7 gap-1 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                      >
                                        {restoring === restoreVersion.versionId ? (
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
          <ResizablePanel className="relative border rounded-lg overflow-hidden bg-background shadow-sm flex flex-col">
            <div className="flex-1 overflow-hidden">
              {previewMode === "canvas" ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
                    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        onClick={() => setPreviewMode("single")}
                        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        单页
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors bg-accent text-accent-foreground"
                      >
                        <Map className="h-3.5 w-3.5" />
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
                        configData: configDataMap[p.id],
                        previewSize: pagePreviewSizeMap[p.id],
                      }))}
                      canvasState={canvasState}
                      onCanvasStateChange={setCanvasState}
                      focusPageId={focusCanvasPageId}
                      onVisiblePageIdsChange={setVisibleCanvasPageIds}
                      editingPageId={canvasEditingPageId ?? undefined}
                      screenshotUrls={canvasScreenshotUrls}
                      screenshotRenderBoxes={canvasScreenshotRenderBoxes}
                      onConsoleEntry={handleConsoleEntry}
                      onError={handlePreviewError}
                      onPositionableSizes={handlePositionableSizes}
                      knowledgeDocuments={canvasKnowledgeDocuments}
                      fitToScreenOnMount={fitCanvasToScreenOnMount}
                      onFitToScreenOnMountComplete={handleInitialCanvasFitComplete}
                      onCreateKnowledgeDocument={createCanvasKnowledgeDocument}
                      onUpdateKnowledgeDocument={updateCanvasKnowledgeDocument}
                      onReadKnowledgeDocument={readCanvasKnowledgeDocument}
                      onPageConfigEdit={(pageId) => {
                        rememberActivePageSchema();
                        setCanvasEditingPageId(pageId);
                        setConfigPanelDetailPageId(pageId);
                        setActiveDemoId(pageId);
                        activeDemoIdRef.current = pageId;
                        if (sessionId) {
                          fetch(`/api/sessions/${sessionId}/files/${pageId}`)
                            .then((res) => res.json())
                            .then((data) => {
                              if (data.success) {
                                setPageCodes((prev) => ({
                                  ...prev,
                                  [pageId]: data.data.code,
                                }));
                                setCode(data.data.code);
                                setSchema(data.data.schema);
                                updatePageSchemaMapFromLoad(
                                  pageId,
                                  data.data.schema,
                                );
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
                                const size = getPreviewSize(data.data.schema);
                                setPreviewSize(size);
                              }
                            })
                            .catch((err) => console.error("加载页面失败:", err));
                        }
                      }}
                      onCanvasClick={() => {
                        clearCanvasSelection();
                        setCanvasEditingPageId(null);
                        setConfigPanelDetailPageId(null);
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
                        <Map className="h-3.5 w-3.5" />
                        画布
                      </button>
                    </div>
                    <div className="flex-1" />
                    <Popover
                      open={visualLayerTreeOpen}
                      onOpenChange={(open) => {
                        setVisualLayerTreeOpen(open);
                        if (open) {
                          setRightPanelTab("property");
                          setVisualLayerTreeRequestKey((key) => key + 1);
                        } else {
                          setVisualPanelHoverNodeId(null);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          title="图层"
                        >
                          <Layers className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-auto border-0 bg-transparent p-0 shadow-none"
                      >
                        <LayerTreeMenu
                          title="当前页面图层"
                          nodes={visualLayerTreeNodes}
                          scrollClassName="layer-tree-menu-scrollbar"
                          selectedNodeId={
                            selectedVisualNode?.domPath ||
                            selectedVisualNode?.nodeId ||
                            null
                          }
                          emptyText="正在采集页面图层..."
                          onHoverNodeIdChange={setVisualPanelHoverNodeId}
                          onSelectNode={(node, path) => {
                            handleVisualSelect(node, path);
                            setVisualLayerTreeOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    {demoPages.length > 1 && (
                      <Select
                        value={activeDemoId}
                        onValueChange={async (pageId) => {
                          if (!confirmDiscardVisualPropertyWork()) return;
                          handleClearVisualProperties();
                          setActiveDemoId(pageId);
                          // 同步设置 previewSize，避免 fetch 期间用旧尺寸渲染
                          if (pagePreviewSizeMap[pageId]) {
                            setPreviewSize(pagePreviewSizeMap[pageId]);
                          }
                          if (sessionId) {
                            try {
                              const res = await fetch(
                                `/api/sessions/${sessionId}/files/${pageId}`,
                              );
                              const data = await res.json();
                              if (data.success) {
                                setPageCodes((prev) => ({
                                  ...prev,
                                  [pageId]: data.data.code,
                                }));
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
                                const size = getPreviewSize(data.data.schema);
                                setPreviewSize(size);
                              }
                            } catch (err) {
                              console.error("加载页面失败:", err);
                            }
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue placeholder="选择页面" />
                        </SelectTrigger>
                        <SelectContent>
                          {demoPages.map((page) => (
                            <SelectItem key={page.id} value={page.id}>
                              {page.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div
                    className="relative flex-1 overflow-y-auto p-4 preview-single-scroll"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                    onClick={(event) => {
                      if (event.target !== event.currentTarget) return;
                      handleVisualSelect(null, []);
                      setVisualLayerTreeOpen(false);
                      setVisualPanelHoverNodeId(null);
                    }}
                  >
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
                    <PreviewPanel
                      code={
                        activeDemoId ? (pageCodes[activeDemoId] ?? "") : code
                      }
                      sessionId={sessionId}
                      demoId={activeDemoId}
                      configData={configData}
                      previewSize={activePreviewSize}
                      placeholderScreenshotUrl={
                        pageScreenshots[activeDemoId]?.screenshotUrl
                      }
                      onConsoleEntry={handleConsoleEntry}
                      onContentLoaded={() => {
                        setSinglePreviewLoaded(true);
                        if (activeDemoId) {
                          autoPreviewRepairCountsRef.current.delete(activeDemoId);
                        }
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
                      visualPropertyChanges={visualPropertyChanges}
                      visualAnnotations={visualAnnotations}
                      onVisualHover={setHoveredVisualNode}
                      onVisualSelect={handleVisualSelect}
                      onVisualSelectStack={(nodes) => {
                        if (nodes.length > 0) {
                          handleVisualSelect(nodes[nodes.length - 1], nodes);
                        } else {
                          handleVisualSelect(null, []);
                        }
                      }}
                      visualNodeTreeRequestKey={visualLayerTreeRequestKey}
                      onVisualNodeTreeChange={setVisualLayerTreeNodes}
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
                        if (annotationId && !trimmedText && !hasStyleChanges) {
                          setVisualAnnotations((prev) =>
                            prev.filter((annotation) => annotation.id !== annotationId),
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
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>

          {isConfigPanelVisible && (
            <ResizablePanel className="border-l bg-card flex flex-col">
              {previewMode === "single" ? (
                <Tabs
                  value={rightPanelTab}
                  onValueChange={setRightPanelTab}
                  className="flex h-full min-h-0 flex-col"
                >
                  <TabsList className="grid h-11 w-full grid-cols-2 rounded-none border-b bg-transparent px-2">
                    <TabsTrigger value="config">配置</TabsTrigger>
                    <TabsTrigger value="property">属性</TabsTrigger>
                  </TabsList>
                  <TabsContent value="config" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <PageConfigPanel
                      pages={demoPages.map((page) => ({
                        id: page.id,
                        name: page.name,
                        order: page.order,
                        schema:
                          pageSchemaMap[page.id] ||
                          (page.id === activeDemoId ? schema : undefined),
                        configData: configDataMap[page.id],
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
                  </TabsContent>
                  <TabsContent value="property" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                    <VisualPropertyPanel
                      selectedNode={selectedVisualNode}
                      sessionId={sessionId}
                      nodeStack={visualNodeStack}
                      propertyChanges={visualPropertyChanges}
                      pendingPropertyChanges={visualPendingPropertyChanges}
                      configMarks={visualConfigMarks}
                      pendingConfigMarks={visualPendingConfigMarks}
                      aiInstruction={visualAiInstruction}
                      hasPendingAiInstruction={hasPendingVisualAiInstruction}
                      submission={visualPropertySubmission}
                      sending={visualPropertySending}
                      usedConfigKeys={visualConfigUsedKeys}
                      onPropertyChange={handleVisualPropertyChange}
                      onRestoreProperty={handleRestoreVisualProperty}
                      onClearChanges={handleClearVisualProperties}
                      onMarkConfig={handleMarkVisualConfig}
                      onUpdateConfigMark={handleUpdateVisualConfigMark}
                      onRemoveConfigMark={handleRemoveVisualConfigMark}
                      onAiInstructionChange={setVisualAiInstruction}
                      onSendToAI={handleSendVisualPropertiesToAI}
                    />
                  </TabsContent>
                </Tabs>
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
                  }))}
                  activePageId={activeDemoId}
                  detailPageId={configPanelDetailPageId}
                  onDetailPageIdChange={(pageId) => {
                    setConfigPanelDetailPageId(pageId);
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
        workingDir={tempWorkspace || undefined}
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
              {previewVersion?.version.demoName || activePageName} 的只读历史内容
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
            <Button onClick={handleStayOnPage}>
              继续编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
