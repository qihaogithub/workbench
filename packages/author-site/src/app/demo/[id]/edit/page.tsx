"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  PreviewPanel,
  ConfigForm,
  PreviewCanvas,
  PageConfigPanel,
  invalidateCompileCache,
  isSchemaEmpty,
} from "../../../../../components/demo";
import type {
  PositionableSizeItem,
  PreviewSize,
  ScreenshotRenderBox,
  VisualAnnotation,
  VisualEditPatch,
  VisualInlineEditPayload,
  VisualNodeInfo,
  VisualStyleChange,
} from "../../../../../components/demo";
import { useScreenshotGeneration } from "@/components/demo/useScreenshotGeneration";
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
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AIChat } from "@/components/ai-elements/ai-chat";
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
  MessageSquarePlus,
  Settings2,
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
import type {
  DemoFiles,
  DemoPageMeta,
  DemoFolderMeta,
  PageVersionHistoryResponse,
  PageVersionInfo,
  VersionHistoryResponse,
  VersionInfo,
} from "@opencode-workbench/shared";
import { projectApiClient } from "@/lib/project-api";
import type { ActiveViewContext } from "@/lib/agent/active-view-context";
import {
  buildVisualConfigCandidates,
  suggestVisualConfigFieldKey,
  type VisualConfigCandidate,
  type VisualConfigureResult,
} from "@/lib/visual-configurator";
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
  ActiveViewContext["previewRuntimeError"]
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

type HistoryEvent =
  | {
      id: string;
      kind: "project";
      title: "保存项目" | "恢复项目";
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
  const [pageCodes, setPageCodes] = useState<Record<string, string>>({});
  const [pagePreviewSizeMap, setPagePreviewSizeMap] = useState<Record<string, import("@opencode-workbench/shared/demo").PreviewSize>>({});
  const [positionableItemSizes, setPositionableItemSizes] = useState<Record<string, PositionableSizeItem>>({});

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
    useState<import("@opencode-workbench/shared/demo").PreviewSize>();

  const [demoName, setDemoName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentThumbnail, setCurrentThumbnail] = useState<string | undefined>(
    undefined,
  );
  const markWorkspaceChanged = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // 多页面状态
  const [demoPages, setDemoPages] = useState<DemoPageMeta[]>([]);
  const [demoFolders, setDemoFolders] = useState<DemoFolderMeta[]>([]);
  const [activeDemoId, setActiveDemoId] = useState<string>("");
  const activeDemoIdRef = useRef(activeDemoId);
  activeDemoIdRef.current = activeDemoId;
  const [projectConfigSchema, setProjectConfigSchema] = useState<
    string | undefined
  >(undefined);
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
  } = useCanvasWorkspace({
    sessionId,
    projectId: demoId,
  });

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
      );
      delete timers[pageId];
    }, 3000);
  }, [regeneratePage, pagePreviewSizeMap]);

  const regenerateCanvasScreenshots = useCallback(async () => {
    const available = await checkServiceHealth();
    if (!available || demoPages.length === 0) return;

    const pages = demoPages
      .filter((p) => pageCodes[p.id] || code)
      .map((p) => {
        const { width, height } = getScreenshotRequestSize(pagePreviewSizeMap[p.id]);
        return {
          pageId: p.id,
          code: pageCodes[p.id] || code,
          configData: configDataMap[p.id] || {},
          width,
          height,
          fullPage: CANVAS_SCREENSHOT_FULL_PAGE,
        };
      });

    if (pages.length > 0) {
      startBatchGeneration(pages);
    }
  }, [
    checkServiceHealth,
    code,
    configDataMap,
    demoPages,
    pageCodes,
    pagePreviewSizeMap,
    startBatchGeneration,
  ]);

  // 切换到画布模式时触发批量截图，或首次加载时生成截图
  useEffect(() => {
    if (demoPages.length > 0 && !isScreenshotGenerating) {
      const pages = demoPages
        .filter((p) => pageCodes[p.id] || code)
        .map((p) => {
          const { width, height } = getScreenshotRequestSize(pagePreviewSizeMap[p.id]);
          return {
            pageId: p.id,
            code: pageCodes[p.id] || code,
            configData: configDataMap[p.id] || {},
            width,
            height,
            fullPage: CANVAS_SCREENSHOT_FULL_PAGE,
          };
        });
      if (pages.length > 0) {
        startBatchGeneration(pages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);

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
  const [fileView, setFileView] = useState<"doc" | "code">("doc");
  const [triggerAutoSend, setTriggerAutoSend] = useState<string | null>(null);
  const [visualEditMode, setVisualEditMode] = useState(false);
  const [visualAnnotationMode, setVisualAnnotationMode] = useState(false);
  const [hoveredVisualNode, setHoveredVisualNode] =
    useState<VisualNodeInfo | null>(null);
  const [selectedVisualNode, setSelectedVisualNode] =
    useState<VisualNodeInfo | null>(null);
  const [visualAnnotations, setVisualAnnotations] = useState<
    VisualAnnotation[]
  >([]);
  const [visualPatches, setVisualPatches] = useState<VisualEditPatch[]>([]);
  const [visualConfigMode, setVisualConfigMode] = useState(false);
  const [visualConfigNode, setVisualConfigNode] =
    useState<VisualNodeInfo | null>(null);
  const [visualConfigCandidateId, setVisualConfigCandidateId] = useState("");
  const [visualConfigTitle, setVisualConfigTitle] = useState("");
  const [visualConfigFieldKey, setVisualConfigFieldKey] = useState("");
  const [visualConfigDefaultValue, setVisualConfigDefaultValue] = useState("");
  const [visualConfigError, setVisualConfigError] = useState<string | null>(
    null,
  );
  const [visualConfigApplying, setVisualConfigApplying] = useState(false);

  // Console buffer for forwarding iframe console logs to agent-service
  const streamServiceRef = useRef<StreamService | null>(null);
  const autoPreviewRepairPageIdsRef = useRef<Set<string>>(new Set());
  const { handleConsoleEntry } = useConsoleBuffer(streamServiceRef);

  const [publishStatus, setPublishStatus] = useState<'never_published' | 'published' | 'unpublished_changes' | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [versionHistory, setVersionHistory] = useState<VersionHistoryResponse | null>(null);
  const [pageVersionHistories, setPageVersionHistories] = useState<
    Record<string, PageVersionHistoryResponse>
  >({});
  const [restoring, setRestoring] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<
    | {
        scope: "page";
        version: PageVersionInfo;
        files: DemoFiles;
      }
    | null
  >(null);
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [previewRuntimeError, setPreviewRuntimeError] =
    useState<PreviewRuntimeErrorContext | null>(null);

  const schemaRegenerateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const configData = configDataMap[activeDemoId] ?? {};
  const visualConfigCandidates = useMemo(
    () => buildVisualConfigCandidates(visualConfigNode),
    [visualConfigNode],
  );
  const selectedVisualConfigCandidate = useMemo(
    () =>
      visualConfigCandidates.find(
        (candidate) => candidate.id === visualConfigCandidateId,
      ) ?? visualConfigCandidates[0],
    [visualConfigCandidateId, visualConfigCandidates],
  );
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
      previewRuntimeError:
        previewRuntimeError &&
        (!previewRuntimeError.pageId ||
          previewRuntimeError.pageId === focusedPageId)
          ? previewRuntimeError
          : undefined,
    };
  }, [activeDemoId, canvasEditingPageId, demoPages, previewMode, previewRuntimeError]);

  const handlePreviewError = useCallback(
    (error: Error) => {
      const pageId =
        previewMode === "canvas"
          ? (canvasEditingPageId ?? activeDemoId)
          : activeDemoId;
      setPreviewRuntimeError({
        stage: "runtime",
        pageId: pageId || undefined,
        file: pageId ? `demos/${pageId}/index.tsx` : undefined,
        message: error.message || "组件运行时发生错误",
        instruction:
          "请优先检查当前页面的 import、默认导出和渲染逻辑；图标和基础能力优先使用 @preview/sdk。",
      });

      if (pageId && !autoPreviewRepairPageIdsRef.current.has(pageId)) {
        autoPreviewRepairPageIdsRef.current.add(pageId);
        setTabValue("ai");
        setTriggerAutoSend(`当前页面预览运行失败，请自动修复一次。

页面: ${pageId}
文件: demos/${pageId}/index.tsx
错误: ${error.message || "组件运行时发生错误"}

要求:
- 保持页面原有产品意图、视觉结构和配置字段不变。
- 优先使用 @preview/sdk 的受控能力，避免未登记依赖和不存在的 named import。
- 修复后不要新增无关文件。`);
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
      source: "ai-realtime" | "ai-finish" | "manual-load" | "page-switch";
    }) => {
      const { code: newCode, schema: newSchema, source } = params;
      const targetPageId = activeDemoIdRef.current;

      if (newCode !== undefined) {
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
        setHasUnsavedChanges(true);
      }
    },
    [sessionId, activeDemoId],
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
          body: JSON.stringify({ demoId, forceNew: true }),
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

        // 记录每个页面的 previewSize
        const previewSizeMap: Record<string, import("@opencode-workbench/shared/demo").PreviewSize> = {};
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
            if (demo.code) {
              codes[pageId] = demo.code;
            }
          }
        } else if (initialDemoId) {
          allDefaults[initialDemoId] = getSafeMergedDefaults(loadedSchema);
          schemas[initialDemoId] = loadedSchema;
        }
        setConfigDataMap(allDefaults);
        setPageCodes(codes);
        setPageSchemaMap(schemas);

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
          pageCodes[pageId] || (pageId === activeDemoIdRef.current ? codeRef.current : "");
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
          const pageCode = pageCodes[page.id] || code;
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
    [code],
  );

  const handleProjectSchemaChange = useCallback((newSchema: string) => {
    setProjectConfigSchema(newSchema);
  }, []);

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

  const handleConfigPanelPageSelect = useCallback(
    async (pageId: string) => {
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
          setPageSchemaMap((prev) => ({
            ...prev,
            [pageId]: data.data.schema,
          }));
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
      sessionId,
      setCanvasEditingPageId,
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

      markWorkspaceChanged();

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

        const pageIds = rawPages.map((page: DemoPageMeta) => page.id);
        const newPageIds = pageIds.filter((pageId: string) => !previousPageIds.has(pageId));
        const nextActiveId = pageIds.includes(previousActiveId)
          ? previousActiveId
          : pageIds[0];

        const codes: Record<string, string> = {};
        const allDefaults: Record<string, Record<string, unknown>> = {};
        const schemas: Record<string, string> = {};
        const previewSizeMap: Record<string, import("@opencode-workbench/shared/demo").PreviewSize> = {};
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
        setPageSchemaMap(schemas);
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
      markWorkspaceChanged,
      previewMode,
      sessionId,
      setFocusCanvasPageId,
      toast,
    ],
  );

  useEffect(() => {
    projectApiClient.getPublishStatus(demoId).then((result) => {
      setPublishStatus(result.status);
      setPublishedVersion(result.publishedVersion);
    }).catch(() => {
      setPublishStatus(null);
    });
  }, [demoId]);

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

  const loadVersionHistory = useCallback(async () => {
    try {
      const data = await projectApiClient.getVersionHistory(demoId);
      setVersionHistory(data);
    } catch {
      setVersionHistory(null);
    }
  }, [demoId]);

  const loadPageVersionHistories = useCallback(async () => {
    if (demoPages.length === 0) {
      setPageVersionHistories({});
      return;
    }

    const entries = await Promise.all(
      demoPages.map(async (page) => {
        try {
          const history = await projectApiClient.getPageVersionHistory(
            demoId,
            page.id,
          );
          return [page.id, history] as const;
        } catch {
          return null;
        }
      }),
    );

    setPageVersionHistories(
      Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => !!entry)),
    );
  }, [demoId, demoPages]);

  useEffect(() => {
    loadVersionHistory();
  }, [loadVersionHistory]);

  useEffect(() => {
    loadPageVersionHistories();
  }, [loadPageVersionHistories]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const publishResult = await projectApiClient.publishProject(demoId);
      setPublishStatus('published');
      setPublishedVersion(publishResult.publishedVersion);
      toast({
        title: '发布成功',
        description: `版本 ${publishResult.publishedVersion} 已发布到预览端，共 ${publishResult.demoCount} 个页面`,
      });
    } catch (publishErr) {
      toast({
        title: '发布失败',
        description: publishErr instanceof Error ? publishErr.message : '发布失败',
        variant: 'destructive',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleRestoreVersion = async (version: VersionInfo) => {
    if (!confirm(`确定要恢复到 ${version.versionId} 吗？当前状态将被保存为新版本。`)) {
      return;
    }

    setRestoring(version.versionId);
    try {
      const result = await projectApiClient.restoreVersion(demoId, {
        versionId: version.versionId,
        username: currentUsername || '未知用户',
      });

      const syncRes = await fetch(`/api/sessions/${sessionId}/sync-project`, {
        method: 'POST',
      });
      if (!syncRes.ok) {
        throw new Error('同步会话工作区失败');
      }

      const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
      const filesData = await filesRes.json();
      if (filesData.success) {
        const multi = filesData.data;
        const pageIds = (multi.demoPages || []).map(
          (p: { id: string }) => p.id,
        );
        const newActiveId = pageIds.includes(activeDemoId)
          ? activeDemoId
          : pageIds[0];
        const targetDemo = multi.demos?.[newActiveId];

        if (newActiveId && newActiveId !== activeDemoId) {
          setActiveDemoId(newActiveId);
          activeDemoIdRef.current = newActiveId;
        }

        if (targetDemo) {
          applyDemoSnapshot({
            code: targetDemo.code ?? '',
            schema: targetDemo.schema ?? '',
            source: 'manual-load',
          });
        } else {
          setActiveDemoId("");
          activeDemoIdRef.current = "";
          applyDemoSnapshot({
            code: '',
            schema: '',
            source: 'manual-load',
          });
        }

        setDemoPages(
          pageIds.map((id: string) => ({
            id,
            name:
              multi.demoPages.find(
                (p: { id: string }) => p.id === id,
              )?.name || id,
            order: 0,
            parentId: null,
          })),
        );
        setDemoFolders(multi.demoFolders || []);
        setProjectConfigSchema(multi.projectConfigSchema);
      }

      toast({
        title: '恢复成功',
        description: `已恢复到新版本 ${result.newVersionId}`,
      });
      await loadVersionHistory();
      const statusResult = await projectApiClient.getPublishStatus(demoId);
      setPublishStatus(statusResult.status);
      setPublishedVersion(statusResult.publishedVersion);
    } catch (err) {
      toast({
        title: '恢复失败',
        description: err instanceof Error ? err.message : '恢复版本失败',
        variant: 'destructive',
      });
    } finally {
      setRestoring(null);
    }
  };

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

  const handlePreviewPageVersion = async (version: PageVersionInfo) => {
    try {
      const files = await projectApiClient.getPageVersionFiles(
        demoId,
        version.demoId,
        version.versionId,
      );
      setPreviewVersion({ scope: "page", version, files });
    } catch (err) {
      toast({
        title: "预览失败",
        description: err instanceof Error ? err.message : "读取页面版本失败",
        variant: "destructive",
      });
    }
  };

  const handleRestorePageVersion = async (version: PageVersionInfo) => {
    const pageName =
      version.demoName ||
      demoPages.find((page) => page.id === version.demoId)?.name ||
      version.demoId;
    if (!confirm(`确定要将页面「${pageName}」恢复到 ${version.versionId} 吗？`)) {
      return;
    }

    setRestoring(version.versionId);
    try {
      const result = await projectApiClient.restorePageVersion(
        demoId,
        version.demoId,
        version.versionId,
        { sessionId },
      );

      if (activeDemoId !== version.demoId) {
        setActiveDemoId(version.demoId);
        activeDemoIdRef.current = version.demoId;
      }
      applyDemoSnapshot({
        code: result.files.code,
        schema: result.files.schema,
        source: "manual-load",
      });
      setPageCodes((prev) => ({ ...prev, [version.demoId]: result.files.code }));
      setHasUnsavedChanges(false);
      setPublishStatus("unpublished_changes");
      setPreviewVersion(null);

      toast({
        title: "页面恢复成功",
        description: `已生成项目版本 ${result.newVersionId}`,
      });
      await Promise.all([loadVersionHistory(), loadPageVersionHistories()]);
    } catch (err) {
      toast({
        title: "页面恢复失败",
        description: err instanceof Error ? err.message : "恢复页面版本失败",
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
    }
  };

  const handleSave = async (): Promise<boolean> => {
    if (!sessionId) {
      console.error("[handleSave] sessionId 为空!");
      toast({
        title: "保存失败",
        description: "Session 未创建，请刷新页面重试",
        variant: "destructive",
      });
      return false;
    }

    if (!activeDemoId) {
      console.error("[handleSave] activeDemoId 为空!");
      toast({
        title: "保存失败",
        description: "未选中页面，请先选择要保存的页面",
        variant: "destructive",
      });
      return false;
    }

    if (!validationResult.isValid) {
      const errors = validationResult.errors.filter(
        (e) => e.severity === "error",
      );
      const warnings = validationResult.errors.filter(
        (e) => e.severity === "warning",
      );

      if (errors.length > 0) {
        toast({
          title: "保存失败：存在语法错误",
          description: `发现 ${errors.length} 个错误，需要先修复后才能正常预览`,
          variant: "destructive",
        });
      } else if (warnings.length > 0) {
        toast({
          title: "存在配置不一致",
          description: `发现 ${warnings.length} 个警告，保存后预览可能异常`,
        });
      }
    }

    try {
      setIsSaving(true);
      await flushCanvasState();

      const saveRes = await fetch(
        `/api/sessions/${sessionId}/files/${activeDemoId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, schema }),
        },
      );

      if (!saveRes.ok) {
        throw new Error("保存文件失败");
      }

      const activePage = demoPages.find((page) => page.id === activeDemoId);
      await projectApiClient.createPageVersion(demoId, activeDemoId, {
        sessionId,
        note: activePage ? `修改了${activePage.name}` : "修改了页面",
      });

      const saveRes2 = await fetch(`/api/sessions/${sessionId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!saveRes2.ok) {
        throw new Error("合并到 Demo 失败");
      }

      toast({
        title: "保存成功",
        description: "Demo 已更新",
      });

      setHasUnsavedChanges(false);
      setPublishStatus('unpublished_changes');

      loadVersionHistory();
      loadPageVersionHistories();
      return true;
    } catch (error) {
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackClick = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowExitDialog(true);
    } else {
      router.push("/");
    }
  }, [hasUnsavedChanges, router]);

  const handleSaveAndExit = async () => {
    setShowExitDialog(false);
    await handleSave();
    router.push("/");
  };

  const handleDirectExit = async () => {
    setShowExitDialog(false);
    try {
      if (sessionId) {
        const res = await fetch(`/api/sessions/${sessionId}/meta`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "discarded" }),
        });
        if (!res.ok) {
          const data = await res.json();
          console.error("[Exit] Failed to archive session:", sessionId, data);
        }
      }
    } catch (error) {
      console.error("[Exit] Error archiving session:", error);
    } finally {
      router.push("/");
    }
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

  const initializeVisualConfigDialog = useCallback(
    (node: VisualNodeInfo, preferredCandidate?: VisualConfigCandidate) => {
      const candidates = buildVisualConfigCandidates(node);
      const candidate = preferredCandidate ?? candidates[0];
      if (!candidate) {
        toast({
          title: "这个元素暂时不能自动配置化",
          description: "请选择文本、图片或带颜色样式的元素。",
          variant: "destructive",
        });
        return;
      }

      const usedKeys = getSchemaPropertyKeys(schemaRef.current, projectConfigSchema);
      setVisualConfigNode(node);
      setVisualConfigCandidateId(candidate.id);
      setVisualConfigTitle(candidate.fieldTitle);
      setVisualConfigFieldKey(
        suggestVisualConfigFieldKey(candidate.fieldTitle, usedKeys),
      );
      setVisualConfigDefaultValue(candidate.defaultValue);
      setVisualConfigError(null);
    },
    [projectConfigSchema, toast],
  );

  const handleVisualConfigCandidateChange = useCallback(
    (candidateId: string) => {
      const candidate = visualConfigCandidates.find(
        (item) => item.id === candidateId,
      );
      if (!candidate) return;
      const usedKeys = getSchemaPropertyKeys(schemaRef.current, projectConfigSchema);
      setVisualConfigCandidateId(candidate.id);
      setVisualConfigTitle(candidate.fieldTitle);
      setVisualConfigFieldKey(
        suggestVisualConfigFieldKey(candidate.fieldTitle, usedKeys),
      );
      setVisualConfigDefaultValue(candidate.defaultValue);
      setVisualConfigError(null);
    },
    [projectConfigSchema, visualConfigCandidates],
  );

  const handleVisualSelect = useCallback(
    (node: VisualNodeInfo | null) => {
      setSelectedVisualNode(node);
      if (!node) return;

      if (visualConfigMode) {
        initializeVisualConfigDialog(node);
      }
    },
    [initializeVisualConfigDialog, visualConfigMode],
  );

  const handleStartVisualConfig = useCallback(() => {
    if (visualConfigMode) {
      setVisualConfigMode(false);
      setVisualEditMode(false);
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
      setHoveredVisualNode(null);
      return;
    }

    setVisualConfigMode(true);
    setVisualAnnotationMode(false);
    setVisualEditMode(true);
    setSelectedVisualNode(null);
    setHoveredVisualNode(null);
    setVisualConfigError(null);
  }, [visualConfigMode]);

  const handleApplyVisualConfig = useCallback(async () => {
    if (!visualConfigNode || !selectedVisualConfigCandidate) return;

    setVisualConfigApplying(true);
    setVisualConfigError(null);
    try {
      const response = await fetch("/api/visual-configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeRef.current,
          schema: schemaRef.current,
          projectConfigSchema,
          demoId: activeDemoIdRef.current,
          node: visualConfigNode,
          target: {
            kind: selectedVisualConfigCandidate.kind,
            fieldKey: visualConfigFieldKey.trim(),
            title: visualConfigTitle.trim(),
            defaultValue: visualConfigDefaultValue,
            colorProperty: selectedVisualConfigCandidate.colorProperty,
          },
        }),
      });
      const data = (await response.json()) as
        | {
            success: true;
            data: Extract<VisualConfigureResult, { ok: true }>;
          }
        | { success: false; error?: { message?: string } };

      if (!response.ok || !data.success) {
        throw new Error(
          data.success ? "添加配置项失败" : data.error?.message || "添加配置项失败",
        );
      }

      applyDemoSnapshot({
        code: data.data.code,
        schema: data.data.schema,
        source: "manual-load",
      });
      setConfigDataMap((prev) => {
        const pageId = activeDemoIdRef.current;
        return {
          ...prev,
          [pageId]: {
            ...(prev[pageId] ?? {}),
            ...data.data.configPatch,
          },
        };
      });
      markWorkspaceChanged();
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
      toast({ title: "配置项已添加" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "添加配置项失败";
      setVisualConfigError(message);
      toast({
        title: "无法添加配置项",
        description: message,
        variant: "destructive",
      });
    } finally {
      setVisualConfigApplying(false);
    }
  }, [
    applyDemoSnapshot,
    markWorkspaceChanged,
    projectConfigSchema,
    selectedVisualConfigCandidate,
    toast,
    visualConfigDefaultValue,
    visualConfigFieldKey,
    visualConfigNode,
    visualConfigTitle,
  ]);

  const handleCloseVisualConfigDialog = useCallback(() => {
    setVisualConfigNode(null);
    setVisualConfigError(null);
  }, []);

  const visualConfigDialogOpen = !!visualConfigNode;

  const handleVisualConfigTitleChange = useCallback(
    (value: string) => {
      setVisualConfigTitle(value);
      const usedKeys = getSchemaPropertyKeys(schemaRef.current, projectConfigSchema);
      setVisualConfigFieldKey(suggestVisualConfigFieldKey(value, usedKeys));
    },
    [projectConfigSchema],
  );

  const handleStartVisualAnnotation = useCallback(() => {
    if (visualAnnotationMode) {
      const pendingCount = visualAnnotations.filter((item) => !item.resolved).length;
      if (
        pendingCount > 0 &&
        !window.confirm(`当前有 ${pendingCount} 条未发送批注，确定取消并丢弃吗？`)
      ) {
        return;
      }
      setVisualAnnotationMode(false);
      setVisualEditMode(false);
      setVisualConfigMode(false);
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
      setHoveredVisualNode(null);
      setVisualAnnotations((prev) => prev.filter((item) => item.resolved));
      return;
    }

    const next = !visualAnnotationMode;
    setVisualAnnotationMode(next);
    setVisualConfigMode(false);
    setVisualConfigNode(null);
    setVisualEditMode(next);
    setSelectedVisualNode(null);
    setHoveredVisualNode(null);
  }, [visualAnnotationMode, visualAnnotations]);

  const handleSendVisualAnnotationsToAI = useCallback(() => {
    const activeAnnotations = visualAnnotations.filter((item) => !item.resolved);
    if (activeAnnotations.length === 0) {
      return;
    }

    const summary = `请根据 ${activeAnnotations.length} 条页面批注修改当前页面。`;
    const context = activeAnnotations
      .map((annotation, index) => {
        const styleLines =
          annotation.styleChanges && annotation.styleChanges.length > 0
            ? [
                "- 样式修改：",
                ...annotation.styleChanges.map(
                  (change) =>
                    `  - ${change.label}（${change.property}）：${change.previousValue ?? "未设置"} -> ${change.value}`,
                ),
              ]
            : [];
        return [
          `批注 ${index + 1}`,
          `- 评论：${annotation.text}`,
          ...styleLines,
          `- DOM 路径：${annotation.domPath}`,
          `- 节点 ID：${annotation.nodeId}`,
        ].join("\n");
      })
      .join("\n\n");

    const prompt = `${summary}

请优先读取并修改 demos/${activeDemoIdRef.current}/index.tsx。只处理这些批注指向的问题；如果必须修改其他文件，请先说明原因。

<!-- VISUAL_ANNOTATION_CONTEXT
${context}
-->`;

    setTabValue("ai");
    setTriggerAutoSend(prompt);
    setVisualAnnotationMode(false);
    setVisualEditMode(false);
    setSelectedVisualNode(null);
    setVisualAnnotations((prev) =>
      prev.map((item) =>
        item.resolved ? item : { ...item, resolved: true },
      ),
    );
  }, [visualAnnotations]);

  const handleVisualInlineEdit = useCallback(
    (payload: VisualInlineEditPayload) => {
      const patch: VisualEditPatch = {
        id: createVisualId("patch"),
        title: `修改 <${payload.node.tagName}> 文本`,
        file: `demos/${activeDemoIdRef.current}/index.tsx`,
        before: payload.before,
        after: payload.after,
        kind: "text",
        status: "previewed",
        node: payload.node,
      };
      setSelectedVisualNode(payload.node);
      setVisualPatches((prev) => [patch, ...prev]);
      setTabValue("ai");
      toast({
        title: "已生成文本修改建议",
        description: "请在批注面板中接受或拒绝该修改。",
      });
    },
    [toast],
  );

  const handleCreateVisualAnnotation = useCallback(
    (
      text?: string,
      targetNode?: VisualNodeInfo,
      styleChanges?: VisualStyleChange[],
    ) => {
      const node = targetNode ?? selectedVisualNode;
      if (!node) {
        return;
      }
      const annotationText =
        text?.trim() ||
        (styleChanges && styleChanges.length > 0 ? "样式修改" : "待处理的页面批注");
      const annotation: VisualAnnotation = {
        id: createVisualId("note"),
        nodeId: node.nodeId,
        domPath: node.domPath,
        text: annotationText,
        styleChanges,
        createdAt: Date.now(),
      };
      setVisualAnnotations((prev) => [annotation, ...prev]);
    },
    [selectedVisualNode],
  );

  const handleAcceptVisualPatch = useCallback(
    (patch: VisualEditPatch) => {
      if (patch.status === "accepted") return;
      if (patch.kind !== "text") {
        setVisualPatches((prev) =>
          prev.map((item) =>
            item.id === patch.id
              ? { ...item, error: "该类型的写回尚未实现" }
              : item,
          ),
        );
        return;
      }

      const result = replaceUniqueText(
        codeRef.current,
        patch.before,
        patch.after,
      );
      if (result.error || !result.code) {
        setVisualPatches((prev) =>
          prev.map((item) =>
            item.id === patch.id
              ? { ...item, status: "draft", error: result.error }
              : item,
          ),
        );
        toast({
          title: "无法安全写回",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      applyDemoSnapshot({ code: result.code, source: "ai-finish" });
      setVisualPatches((prev) =>
        prev.map((item) =>
          item.id === patch.id
            ? { ...item, status: "accepted", error: undefined }
            : item,
        ),
      );
      toast({ title: "修改已写回代码" });
    },
    [applyDemoSnapshot, toast],
  );

  const handleRejectVisualPatch = useCallback(
    (patchId: string) => {
      setVisualPatches((prev) =>
        prev.map((item) =>
          item.id === patchId ? { ...item, status: "rejected" } : item,
        ),
      );
      if (sessionId && activeDemoId) {
        invalidateCompileCache(sessionId, activeDemoId);
      }
      toast({ title: "已拒绝该修改" });
    },
    [activeDemoId, sessionId, toast],
  );

  const handleSendSelectionToAI = useCallback(() => {
    if (!selectedVisualNode) {
      toast({ title: "请先在预览区选择一个元素" });
      return;
    }
    const prompt = `请只针对当前可视化选区提出修改建议，不要静默扩大范围。

【当前选区】
- 元素：<${selectedVisualNode.tagName}>
- DOM 路径：${selectedVisualNode.domPath}
- className：${selectedVisualNode.className || "无"}
- 文本：${selectedVisualNode.textContent || "无"}
- 页面文件：demos/${activeDemoIdRef.current}/index.tsx

请给出可审阅的局部修改建议；如果必须修改选区外代码，请明确说明影响范围。`;
    setTabValue("ai");
    setTriggerAutoSend(prompt);
  }, [selectedVisualNode, toast]);

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
  const isConfigPanelVisible = hasAnyConfig;
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
          version.sessionId === "restore" || version.note?.includes("恢复")
            ? "恢复项目"
            : "保存项目",
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
  const hasPublishableChanges =
    publishStatus === "never_published" ||
    publishStatus === "unpublished_changes";
  const shouldSaveBeforePublish = hasUnsavedChanges;
  const publishButtonDisabled =
    isSaving ||
    publishing ||
    publishStatus === null ||
    (!hasUnsavedChanges && !hasPublishableChanges);
  const publishButtonText = shouldSaveBeforePublish ? "保存并发布" : "发布";
  const publishingButtonText = shouldSaveBeforePublish
    ? "保存并发布中..."
    : "发布中...";

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
          <Button onClick={handleSave} disabled={isSaving || !hasUnsavedChanges}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              "保存"
            )}
          </Button>
          <Button
            onClick={async () => {
              if (shouldSaveBeforePublish) {
                const saved = await handleSave();
                if (!saved) {
                  return;
                }
              }
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
                  onIsStreamingChange={setAiIsStreaming}
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
                  onTriggerAutoSendHandled={() => setTriggerAutoSend(null)}
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
                  onWorkspaceChange={markWorkspaceChanged}
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
                        markWorkspaceChanged();
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
                        markWorkspaceChanged();
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
                        markWorkspaceChanged();
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
                      <p>暂无版本历史</p>
                      <p className="text-xs mt-1">保存编辑后会记录历史</p>
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
                        code: pageCodes[p.id] || code,
                        configData: configDataMap[p.id],
                        previewSize: pagePreviewSizeMap[p.id],
                      }))}
                      canvasState={canvasState}
                      onCanvasStateChange={setCanvasState}
                      focusPageId={focusCanvasPageId}
                      editingPageId={canvasEditingPageId ?? undefined}
                      screenshotUrls={canvasScreenshotUrls}
                      screenshotRenderBoxes={canvasScreenshotRenderBoxes}
                      onConsoleEntry={handleConsoleEntry}
                      onError={handlePreviewError}
                      onPositionableSizes={setPositionableItemSizes}
                      onPageConfigEdit={(pageId) => {
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
                            })
                            .catch((err) => console.error("加载页面失败:", err));
                        }
                      }}
                      onCanvasClick={() => {
                        clearCanvasSelection();
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
                        onClick={() => setPreviewMode("canvas")}
                        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Map className="h-3.5 w-3.5" />
                        画布
                      </button>
                    </div>
                    <div className="flex-1" />
                    <Button
                      type="button"
                      variant={visualConfigMode ? "default" : "outline"}
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={handleStartVisualConfig}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      {visualConfigMode ? "退出配置化" : "配置化"}
                    </Button>
                    <Button
                      type="button"
                      variant={visualAnnotationMode ? "default" : "outline"}
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={handleStartVisualAnnotation}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      {visualAnnotationMode ? "取消批注" : "批注"}
                    </Button>
                    {visualAnnotationMode && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        disabled={visualAnnotations.filter((item) => !item.resolved).length === 0}
                        onClick={handleSendVisualAnnotationsToAI}
                      >
                        发送批注
                        {visualAnnotations.filter((item) => !item.resolved).length > 0
                          ? ` (${visualAnnotations.filter((item) => !item.resolved).length})`
                          : ""}
                      </Button>
                    )}
                    {demoPages.length > 1 && (
                      <Select
                        value={activeDemoId}
                        onValueChange={async (pageId) => {
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
                  >
                    <style>{`
                      .preview-single-scroll::-webkit-scrollbar {
                        display: none;
                      }
                    `}</style>
                    <PreviewPanel
                      code={
                        activeDemoId ? (pageCodes[activeDemoId] ?? "") : code
                      }
                      sessionId={sessionId}
                      demoId={activeDemoId}
                      configData={configData}
                      previewSize={previewSize}
                      placeholderScreenshotUrl={
                        pageScreenshots[activeDemoId]?.screenshotUrl
                      }
                      onConsoleEntry={handleConsoleEntry}
                      onPositionableSizes={setPositionableItemSizes}
                      visualEditMode={visualEditMode}
                      selectedVisualNodeId={
                        selectedVisualNode?.domPath ||
                        selectedVisualNode?.nodeId ||
                        null
                      }
                      visualAnnotations={visualAnnotations}
                      onVisualHover={setHoveredVisualNode}
                      onVisualSelect={handleVisualSelect}
                      onVisualInlineEdit={handleVisualInlineEdit}
                      visualAnnotationMode={visualAnnotationMode}
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
              <PageConfigPanel
                pages={demoPages.map((page) => ({
                  id: page.id,
                  name: page.name,
                  order: page.order,
                  schema: pageSchemaMap[page.id],
                  configData: configDataMap[page.id],
                }))}
                activePageId={activeDemoId}
                detailPageId={
                  previewMode === "single" ? activeDemoId : configPanelDetailPageId
                }
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
                onPageSchemaChange={(_pageId, nextSchema) =>
                  handleSchemaChange(nextSchema)
                }
                sessionId={sessionId}
                positionableItemSizes={positionableItemSizes}
                hideDetailHeader={previewMode === "single"}
              />
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
        onSaved={() => {
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
            <DialogTitle>未保存的更改</DialogTitle>
            <DialogDescription>
              你有未保存的更改，是否在退出前保存？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleDirectExit}>
              直接退出
            </Button>
            <Button onClick={handleSaveAndExit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                "保存并退出"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
