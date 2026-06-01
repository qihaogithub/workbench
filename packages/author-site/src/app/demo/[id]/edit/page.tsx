"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PreviewPanel,
  ConfigForm,
  PreviewGrid,
  invalidateCompileCache,
  ConfigScopeWrapper,
  isSchemaEmpty,
} from "../../../../../components/demo";
import type { PreviewMode } from "../../../../../components/demo";
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
import { ResizablePanelGroup, ResizablePanel } from "@/components/ui/resizable";
import {
  Bot,
  Layers,
  FileCode2,
  Loader2,
  ImageIcon,
  Pencil,
  Trash2,
  MoreVertical,
  Eye,
  Copy,
  LayoutGrid,
  FileText,
  ShieldCheck,
  Upload,
  CheckCircle,
  History,
  RotateCcw,
  Clock,
  User,
  RefreshCw,
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
import { CoverImageDialog } from "@/components/cover-image-dialog";
import { DemoPageTree } from "@/components/demo/DemoPageTree";
import { WorkspaceFileTree } from "@/components/demo/WorkspaceFileTree";
import { WorkspaceCodeDialog } from "@/components/demo/WorkspaceCodeDialog";
import type { DemoPageMeta, DemoFolderMeta, VersionHistoryResponse, VersionInfo } from "@opencode-workbench/shared";
import { projectApiClient } from "@/lib/project-api";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface DemoEditPageProps {
  params: {
    id: string;
  };
}

export default function DemoEditPage({ params }: DemoEditPageProps) {
  const router = useRouter();
  const { id: demoId } = params;
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [code, setCode] = useState("");
  const [schema, setSchema] = useState("");
  const [editorContent, setEditorContent] = useState("");

  const [configDataMap, setConfigDataMap] = useState<
    Record<string, Record<string, unknown>>
  >({});

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
  const [currentThumbnail, setCurrentThumbnail] = useState<string | undefined>(
    undefined,
  );

  // 多页面状态
  const [demoPages, setDemoPages] = useState<DemoPageMeta[]>([]);
  const [demoFolders, setDemoFolders] = useState<DemoFolderMeta[]>([]);
  const [activeDemoId, setActiveDemoId] = useState<string>("");
  const activeDemoIdRef = useRef(activeDemoId);
  activeDemoIdRef.current = activeDemoId;
  const [projectConfigSchema, setProjectConfigSchema] = useState<
    string | undefined
  >(undefined);

  // 预览模式状态
  const [previewMode, setPreviewMode] = useState<PreviewMode>("single");
  const [gridColumns, setGridColumns] = useState<2 | 3 | 4>(2);
  const [gridScale, setGridScale] = useState(1.0);
  const [flashGridCardId, setFlashGridCardId] = useState<string | null>(null);

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
  const [triggerAutoSend, setTriggerAutoSend] = useState<string | null>(null);
  const [snapshotVersion, setSnapshotVersion] = useState(0);

  const [publishStatus, setPublishStatus] = useState<'never_published' | 'published' | 'unpublished_changes' | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [versionHistory, setVersionHistory] = useState<VersionHistoryResponse | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null);

  const schemaRegenerateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const configData = configDataMap[activeDemoId] ?? {};

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

      if (newCode !== undefined) {
        setCode((prev) => (prev === newCode ? prev : newCode));
        if (sessionId && activeDemoId) {
          invalidateCompileCache(sessionId, activeDemoId);
        }
      }

      if (newSchema !== undefined) {
        setSchema(newSchema);
        setPreviewSize(getPreviewSize(newSchema));

        // Merge config defaults using the new schema with smart merge strategy
        try {
          setConfigDataMap((prev) => {
            const current = prev[activeDemoIdRef.current] ?? {};
            const merged = mergeConfigWithUserValues(
              current,
              newSchema,
              schema, // Pass old schema to detect user modifications
            );
            return { ...prev, [activeDemoIdRef.current]: merged };
          });
        } catch (e) {
          console.warn("[DemoEditPage] Failed to merge schema defaults:", e);
        }
      }

      // Update editorContent from the latest code+schema
      setEditorContent((prev) => {
        const currentCode = newCode ?? extractCodeFromFigma(prev) ?? code;
        const currentSchema =
          newSchema ?? extractSchemaFromFigma(prev) ?? schema;
        return buildFigmaText(currentCode, currentSchema);
      });

      // Increment snapshot version to drive PreviewPanel and ConfigForm updates
      setSnapshotVersion((v) => v + 1);

      if (source === "ai-realtime" || source === "ai-finish") {
        // Cancel any pending schema auto-regeneration
        if (schemaRegenerateTimerRef.current) {
          clearTimeout(schemaRegenerateTimerRef.current);
          schemaRegenerateTimerRef.current = null;
        }
      }
    },
    [code, schema, sessionId],
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
            createdAt: number;
            updatedAt: number;
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
        if (multi.demos) {
          for (const [pageId, demo] of Object.entries(multi.demos) as [
            string,
            { schema: string },
          ][]) {
            allDefaults[pageId] = getSafeMergedDefaults(demo.schema);
          }
        } else if (initialDemoId) {
          allDefaults[initialDemoId] = getSafeMergedDefaults(loadedSchema);
        }
        setConfigDataMap(allDefaults);

        const size = getPreviewSize(loadedSchema);
        setPreviewSize(size);

        // 初始化 Agent 会话
        const { getAgentClient } = await import("@/lib/agent-client");
        const agentClient = getAgentClient();
        const newAgentSessionId = `demo-${demoId}-${Date.now()}`;
        setAgentSessionId(newAgentSessionId);
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

    const defaults = getSafeMergedDefaults(parsed.schema);
    setConfigDataMap((prev) => ({
      ...prev,
      [activeDemoIdRef.current]: {
        ...defaults,
        ...(prev[activeDemoIdRef.current] ?? {}),
      },
    }));

    const size = getPreviewSize(parsed.schema);
    setPreviewSize(size);
  }, []);

  const handleConfigChange = useCallback((data: Record<string, unknown>) => {
    setConfigDataMap((prev) => ({
      ...prev,
      [activeDemoIdRef.current]: {
        ...(prev[activeDemoIdRef.current] ?? {}),
        ...data,
      },
    }));
  }, []);

  const handleSchemaChange = useCallback(
    (newSchema: string) => {
      setSchema(newSchema);
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

  useEffect(() => {
    projectApiClient.getPublishStatus(demoId).then((result) => {
      setPublishStatus(result.status);
      setPublishedVersion(result.publishedVersion);
    }).catch(() => {
      setPublishStatus(null);
    });
  }, [demoId]);

  const loadVersionHistory = useCallback(async () => {
    try {
      const data = await projectApiClient.getVersionHistory(demoId);
      setVersionHistory(data);
    } catch {
      setVersionHistory(null);
    }
  }, [demoId]);

  useEffect(() => {
    loadVersionHistory();
  }, [loadVersionHistory]);

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
        username: 'user',
      });
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

  const handleSave = async () => {
    if (!sessionId) {
      console.error("[handleSave] sessionId 为空!");
      toast({
        title: "保存失败",
        description: "Session 未创建，请刷新页面重试",
        variant: "destructive",
      });
      return;
    }

    if (!activeDemoId) {
      console.error("[handleSave] activeDemoId 为空!");
      toast({
        title: "保存失败",
        description: "未选中页面，请先选择要保存的页面",
        variant: "destructive",
      });
      return;
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

      setPublishStatus('unpublished_changes');

      loadVersionHistory();

      router.push("/");
    } catch (error) {
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    try {
      if (sessionId) {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const data = await res.json();
          console.error("[Cancel] Failed to delete session:", sessionId, data);
          toast({
            title: "清理失败",
            description:
              data.error?.message || "Session 清理失败，可能需要手动清理",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("[Cancel] Error deleting session:", error);
      toast({
        title: "清理失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      router.push("/");
    }
  };

  // 处理 AI 代码更新 — 通过 applyDemoSnapshot 统一应用
  const handleCodeUpdate = useCallback(
    (newCode: string) => {
      applyDemoSnapshot({ code: newCode, source: "ai-realtime" });
    },
    [applyDemoSnapshot],
  );

  // 处理 AI Schema 更新 — 通过 applyDemoSnapshot 统一应用
  const handleSchemaUpdate = useCallback(
    (newSchema: string) => {
      applyDemoSnapshot({ schema: newSchema, source: "ai-realtime" });
    },
    [applyDemoSnapshot],
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

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
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
            onClick={handleManualCheck}
            disabled={isChecking}
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs">
              {isChecking ? "检查中..." : "检查代码"}
            </span>
          </Button>
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
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
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
            onClick={handlePublish}
            disabled={
              publishing ||
              publishStatus === 'published' ||
              publishStatus === null
            }
            variant={publishStatus === 'unpublished_changes' ? 'default' : 'outline'}
            className="gap-2"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                发布中...
              </>
            ) : publishStatus === 'published' ? (
              <>
                <CheckCircle className="h-4 w-4" />
                已发布
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                发布
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          defaultSizes={[25, 50, 25]}
          minSizes={[20, 20, 20]}
          className="h-full"
        >
          <ResizablePanel className="flex flex-col border-r bg-card">
            <Tabs
              value={tabValue}
              onValueChange={setTabValue}
              className="flex-1 flex flex-col min-h-0 [&>[data-state=active]]:flex-1 [&>[data-state=active]]:flex [&>[data-state=active]]:flex-col [&>[data-state=active]]:min-h-0"
            >
              <TabsList className="w-full justify-start rounded-none border-b px-2 h-12 bg-transparent">
                <TabsTrigger value="ai" className="gap-2">
                  <Bot className="h-4 w-4" />
                  AI 对话
                </TabsTrigger>
                <TabsTrigger value="pages" className="gap-2">
                  <Layers className="h-4 w-4" />
                  页面
                  {demoPages.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 text-[10px] h-4 px-1"
                    >
                      {demoPages.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="code" className="gap-2">
                  <FileCode2 className="h-4 w-4" />
                  代码
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2">
                  <History className="h-4 w-4" />
                  版本
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
                  workspaceId={workspaceId || undefined}
                  onCodeUpdate={handleCodeUpdate}
                  onSchemaUpdate={handleSchemaUpdate}
                  onSnapshotReady={() => {
                    // AI finish snapshot applied — bump version to trigger PreviewPanel recompile & ConfigForm rebuild
                    setSnapshotVersion((v) => v + 1);
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
                      setAgentSessionId(`demo-${demoId}-${Date.now()}`);
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
                      const { getAgentClient } =
                        await import("@/lib/agent-client");
                      const agentClient = getAgentClient();
                      try {
                        await agentClient.getSession(newSessionId);
                        setAgentSessionId(newSessionId);
                      } catch {
                        setAgentSessionId(`demo-${demoId}-${Date.now()}`);
                      }
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
                <WorkspaceFileTree
                  sessionId={sessionId}
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
                  activeDemoId={activeDemoId}
                  onPageSelect={async (pageId) => {
                    if (editingPageId === pageId) return;
                    setActiveDemoId(pageId);
                    if (previewMode === "grid") {
                      setFlashGridCardId(pageId);
                      setTimeout(() => setFlashGridCardId(null), 1600);
                    }
                    if (sessionId) {
                      try {
                        const res = await fetch(
                          `/api/sessions/${sessionId}/files/${pageId}`,
                        );
                        const data = await res.json();
                        if (data.success) {
                          setCode(data.data.code);
                          setSchema(data.data.schema);
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
                    if (demoPages.length <= 1) {
                      toast({
                        title: "无法删除",
                        description: "至少需要保留一个页面",
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
                        setDemoPages((prev) =>
                          prev.filter((p) => p.id !== pageId),
                        );
                        if (activeDemoId === pageId) {
                          const remaining = demoPages.filter(
                            (p) => p.id !== pageId,
                          );
                          const nextPage = remaining[0];
                          if (nextPage) {
                            setActiveDemoId(nextPage.id);
                            const fileRes = await fetch(
                              `/api/sessions/${sessionId}/files/${nextPage.id}`,
                            );
                            const fileData = await fileRes.json();
                            if (fileData.success) {
                              setCode(fileData.data.code);
                              setSchema(fileData.data.schema);
                              setEditorContent(
                                buildFigmaText(
                                  fileData.data.code,
                                  fileData.data.schema,
                                ),
                              );
                              setConfigDataMap((prev) => {
                                const rest = { ...prev };
                                delete rest[pageId];
                                if (!rest[nextPage.id]) {
                                  const defaults = getSafeMergedDefaults(
                                    fileData.data.schema,
                                  );
                                  rest[nextPage.id] = defaults;
                                }
                                return rest;
                              });
                              const size = getPreviewSize(fileData.data.schema);
                              setPreviewSize(size);
                            }
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
                      <span className="text-sm font-medium">当前版本</span>
                      {versionHistory && (
                        <Badge variant="default">{versionHistory.currentVersion}</Badge>
                      )}
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

                  {!versionHistory || versionHistory.versions.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>暂无版本历史</p>
                      <p className="text-xs mt-1">保存编辑后会创建版本记录</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {versionHistory.versions.map((version, index) => {
                        const isLatest = index === 0;
                        return (
                          <div
                            key={version.versionId}
                            className={`p-3 rounded-lg border ${isLatest ? 'border-primary/30 bg-primary/5' : 'border-border'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{version.versionId}</span>
                                {isLatest && <Badge variant="default" className="text-[10px] h-4 px-1">最新</Badge>}
                                {version.sessionId === 'restore' && <Badge variant="secondary" className="text-[10px] h-4 px-1">恢复</Badge>}
                              </div>
                              <Button
                                variant={isLatest ? 'ghost' : 'ghost'}
                                size="sm"
                                onClick={() => handleRestoreVersion(version)}
                                disabled={restoring === version.versionId || isLatest}
                                className="h-7 gap-1 text-xs"
                              >
                                {restoring === version.versionId ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3 w-3" />
                                )}
                                {isLatest ? '当前' : '恢复'}
                              </Button>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(version.savedAt, 'MM-dd HH:mm', { locale: zhCN })}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {version.savedBy}
                              </span>
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {version.fileCount} 文件
                              </span>
                            </div>
                            {version.note && (
                              <p className="mt-1 text-xs text-muted-foreground truncate">{version.note}</p>
                            )}
                          </div>
                        );
                      })}
                      <p className="text-center text-xs text-muted-foreground pt-2">
                        共 {versionHistory.totalVersions} 个版本
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

            </Tabs>
          </ResizablePanel>

          <ResizablePanel className="relative border rounded-lg overflow-hidden bg-background shadow-sm flex flex-col">
            <div className="flex-1 overflow-hidden">
              {previewMode === "single" ? (
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
                        onClick={() => setPreviewMode("grid")}
                        className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        宫格
                      </button>
                    </div>
                    <div className="flex-1" />
                    {demoPages.length > 1 && (
                      <Select
                        value={activeDemoId}
                        onValueChange={async (pageId) => {
                          setActiveDemoId(pageId);
                          if (sessionId) {
                            try {
                              const res = await fetch(
                                `/api/sessions/${sessionId}/files/${pageId}`,
                              );
                              const data = await res.json();
                              if (data.success) {
                                setCode(data.data.code);
                                setSchema(data.data.schema);
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
                    className="flex-1 overflow-y-auto p-4 preview-single-scroll"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    <style>{`
                      .preview-single-scroll::-webkit-scrollbar {
                        display: none;
                      }
                    `}</style>
                    <PreviewPanel
                      code={code}
                      sessionId={sessionId}
                      demoId={activeDemoId}
                      configData={configData}
                      previewSize={previewSize}
                      snapshotVersion={snapshotVersion}
                    />
                  </div>
                </div>
              ) : (
                <PreviewGrid
                  sessionId={sessionId}
                  demoPages={demoPages}
                  activePageId={activeDemoId}
                  showModeToggle
                  onPreviewModeChange={setPreviewMode}
                  gridColumns={gridColumns}
                  gridScale={gridScale}
                  onGridScaleChange={setGridScale}
                  onGridColumnsChange={setGridColumns}
                  onCardClick={(pageId) => {
                    if (pageId === activeDemoId) return;
                    setActiveDemoId(pageId);
                    const clickedPage = demoPages.find(
                      (p) => p.id === pageId,
                    ) as
                      | (DemoPageMeta & {
                          previewSize?: import("@opencode-workbench/shared/demo").PreviewSize;
                        })
                      | undefined;
                    if (clickedPage?.previewSize) {
                      setPreviewSize(clickedPage.previewSize);
                    }
                    if (sessionId) {
                      fetch(`/api/sessions/${sessionId}/files/${pageId}`)
                        .then((res) => res.json())
                        .then((data) => {
                          if (data.success) {
                            setCode(data.data.code);
                            setSchema(data.data.schema);
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
                  configDataMap={configDataMap}
                  previewSize={previewSize}
                  snapshotVersion={snapshotVersion}
                  flashCardId={flashGridCardId ?? undefined}
                />
              )}
            </div>
          </ResizablePanel>

          <ResizablePanel className="border-l bg-card flex flex-col">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-medium">配置面板</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                修改配置项，预览区将实时更新
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 flex flex-col">
                {hasAnyConfig && (
                  <>
                    {showProjectConfig && (
                      <ConfigScopeWrapper
                        scope="project"
                        hideHeader={!hasBothScopes}
                      >
                        <ConfigForm
                          key={`project-${projectConfigSchema}`}
                          schema={projectConfigSchema!}
                          onChange={(data) => {
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
                          }}
                          onSchemaChange={handleProjectSchemaChange}
                          initialData={configData}
                          sessionId={sessionId}
                        />
                      </ConfigScopeWrapper>
                    )}

                    {showProjectConfig && showPageConfig && (
                      <div className="h-[2px] bg-border my-3" />
                    )}

                    {showPageConfig && (
                      <ConfigScopeWrapper
                        scope="page"
                        pageName={demoPages.find((p) => p.id === activeDemoId)?.name}
                        hideHeader={!hasBothScopes}
                      >
                        <ConfigForm
                          key={`${activeDemoId}-${snapshotVersion}`}
                          schema={schema}
                          onChange={handleConfigChange}
                          onSchemaChange={handleSchemaChange}
                          initialData={configData}
                          sessionId={sessionId}
                        />
                      </ConfigScopeWrapper>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

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
      />
    </div>
  );
}
