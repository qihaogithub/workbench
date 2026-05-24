"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PreviewPanel, ConfigForm, PreviewGrid, invalidateCompileCache, ConfigScopeWrapper } from "../../../../../components/demo";
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
import { mergeConfigToProps, SchemaConflictError } from "@/lib/runtime-props";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AIChat } from "@/components/ai-elements/ai-chat";
import { type ChatMessage } from "@/components/ai-elements";
import {
  ResizablePanelGroup,
  ResizablePanel,
} from "@/components/ui/resizable";
import {
  Bot,
  Layers,
  Loader2,
  ImageIcon,
  Pencil,
  Trash2,
  MoreVertical,
  Eye,
  Copy,
  LayoutGrid,
  FileText,
  ZoomIn,
  ZoomOut,
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
import { CodeViewDialog } from "@/components/demo/code-view-dialog";
import { ValidationPanel } from "@/components/demo/ValidationPanel";
import { CoverImageDialog } from "@/components/cover-image-dialog";
import { DemoPageTree } from "@/components/demo/DemoPageTree";
import type { DemoPageMeta, DemoFolderMeta } from "@opencode-workbench/shared";

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

  const [configDataMap, setConfigDataMap] = useState<Record<string, Record<string, unknown>>>({});

  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  });

  const [agentSessionId, setAgentSessionId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [sessionId, setSessionId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [tempWorkspace, setTempWorkspace] = useState("");
  const [previewSize, setPreviewSize] =
    useState<import("../../../../../components/demo/types").PreviewSize>();

  const [demoName, setDemoName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [currentThumbnail, setCurrentThumbnail] = useState<string | undefined>(undefined);

  // 多页面状态
  const [demoPages, setDemoPages] = useState<DemoPageMeta[]>([]);
  const [demoFolders, setDemoFolders] = useState<DemoFolderMeta[]>([]);
  const [activeDemoId, setActiveDemoId] = useState<string>("");
  const activeDemoIdRef = useRef(activeDemoId);
  activeDemoIdRef.current = activeDemoId;
  const [projectConfigSchema, setProjectConfigSchema] = useState<string | undefined>(undefined);

  // 预览模式状态
  const [previewMode, setPreviewMode] = useState<PreviewMode>('single');
  const [gridColumns, setGridColumns] = useState<2 | 3 | 4>(2);
  const [gridScale, setGridScale] = useState(1.0);

  // 页面管理编辑状态
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingPageName, setEditingPageName] = useState("");

  const [viewCodeDialogOpen, setViewCodeDialogOpen] = useState(false);
  const [viewCodeData, setViewCodeData] = useState<{
    code: string;
    schema: string;
    pageName: string;
    pageId: string;
  }>({ code: "", schema: "", pageName: "", pageId: "" });

  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiIsStreaming, setAiIsStreaming] = useState(false);
  const [aiStreamContent, setAiStreamContent] = useState("");
  const [aiCurrentMessage, setAiCurrentMessage] = useState<ChatMessage>({
    role: "assistant",
    content: "",
    parts: [],
  });

  const schemaRegenerateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  const configData = configDataMap[activeDemoId] ?? {};

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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

        console.log(`[loadDemo] 开始加载 demo: ${demoId}`);

        // 并行获取项目名称
        const demosRes = await fetch("/api/demos");
        const demosData = await demosRes.json();
        if (demosData.success) {
          const demo = demosData.data.find(
            (d: { id: string; name: string; thumbnail?: string }) => d.id === demoId,
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

        console.log(`[loadDemo] Session API 响应状态: ${sessionRes.status}`);

        if (!sessionRes.ok) {
          throw new Error("创建 Session 失败");
        }

        const sessionData = await sessionRes.json();
        console.log(`[loadDemo] Session API JSON:`, sessionData);

        if (!sessionData.success) {
          throw new Error(sessionData.error?.message || "创建 Session 失败");
        }

        console.log("[loadDemo] Session 创建成功, sessionId:", sessionData.data.sessionId);
        setSessionId(sessionData.data.sessionId);
        setWorkspaceId(sessionData.data.workspaceId || "");
        setTempWorkspace(sessionData.data.tempWorkspace || "");

        const filesRes = await fetch(
          `/api/sessions/${sessionData.data.sessionId}/files`,
        );
        console.log(`[loadDemo] Files API 响应状态: ${filesRes.status}`);
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
        const pagesWithSize = rawPages.map((page: { id: string; name: string; order: number; parentId: string | null; createdAt: number; updatedAt: number }) => ({
          ...page,
          previewSize: multi.demos?.[page.id]?.schema
            ? getPreviewSize(multi.demos[page.id].schema)
            : undefined,
        }));
        setDemoPages(pagesWithSize);
        setDemoFolders(multi.demoFolders || []);
        setProjectConfigSchema(multi.projectConfigSchema);

        let loadedCode = "";
        let loadedSchema = "";
        let initialDemoId = "";

        if (multi.demos && Object.keys(multi.demos).length > 0) {
          const sortedPageIds = rawPages.map((p: { id: string }) => p.id);
          const demoIds = Object.keys(multi.demos);
          const targetDemoId = sortedPageIds.length > 0
            ? (sortedPageIds.includes(demoId as string)
              ? demoId as string
              : sortedPageIds[0])
            : (demoIds.includes(demoId as string)
              ? demoId as string
              : demoIds[0]);
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

        const defaults = getSafeMergedDefaults(loadedSchema);
        if (initialDemoId) {
          setConfigDataMap({ [initialDemoId]: defaults });
        }

        const result = validateAll(loadedCode, loadedSchema);
        setValidationResult(result);

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

    const result = validateAll(parsed.code, parsed.schema);
    setValidationResult(result);

    const defaults = getSafeMergedDefaults(parsed.schema);
    setConfigDataMap((prev) => ({
      ...prev,
      [activeDemoIdRef.current]: { ...defaults, ...(prev[activeDemoIdRef.current] ?? {}) },
    }));

    const size = getPreviewSize(parsed.schema);
    setPreviewSize(size);
  }, []);

  const handleConfigChange = useCallback((data: Record<string, unknown>) => {
    setConfigDataMap((prev) => ({
      ...prev,
      [activeDemoIdRef.current]: { ...(prev[activeDemoIdRef.current] ?? {}), ...data },
    }));
  }, []);

  const handleSchemaChange = useCallback((newSchema: string) => {
    setSchema(newSchema);
    setEditorContent((prev) => {
      const currentCode = extractCodeFromFigma(prev) || code;
      return buildFigmaText(currentCode, newSchema);
    });
  }, [code]);

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

  const handleSave = async () => {
    console.log(`[handleSave] 开始保存, sessionId: "${sessionId}"`);

    if (!sessionId) {
      console.error('[handleSave] sessionId 为空!');
      toast({
        title: "保存失败",
        description: "Session 未创建，请刷新页面重试",
        variant: "destructive",
      });
      return;
    }

    if (!activeDemoId) {
      console.error('[handleSave] activeDemoId 为空!');
      toast({
        title: "保存失败",
        description: "未选中页面，请先选择要保存的页面",
        variant: "destructive",
      });
      return;
    }

    if (!validationResult.isValid) {
      const errors = validationResult.errors.filter(e => e.severity === "error");
      const warnings = validationResult.errors.filter(e => e.severity === "warning");

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

      console.log(`[handleSave] 发送 PUT 请求到 /api/sessions/${sessionId}/files`);
      const saveRes = await fetch(`/api/sessions/${sessionId}/files/${activeDemoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, schema }),
      });

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

  // 处理 AI 代码更新
  const handleCodeUpdate = useCallback(
    (newCode: string) => {
      console.log(
        "[DemoEditPage] handleCodeUpdate called, newCode length:",
        newCode.length,
      );
      console.log(
        "[DemoEditPage] Current schema before update:",
        schema ? "exists" : "missing",
      );
      setCode(newCode);
      if (sessionId && activeDemoId) {
        invalidateCompileCache(sessionId, activeDemoId);
      }
      setEditorContent((prev) => {
        const updatedContent = buildFigmaText(
          newCode,
          extractSchemaFromFigma(prev) || schema,
        );
        console.log(
          "[DemoEditPage] editorContent updated, new length:",
          updatedContent.length,
        );
        return updatedContent;
      });
      // 同时触发验证
      if (schema) {
        const result = validateAll(newCode, schema);
        console.log("[DemoEditPage] Validation result:", result);
        setValidationResult(result);

        // 代码变更时重置 configData 为空，让组件默认值生效
        setConfigDataMap((prev) => ({
          ...prev,
          [activeDemoIdRef.current]: {},
        }));
      }

      // 防抖触发 Schema 自动重新生成
      // 如果 AI 在 1.5 秒内也更新了 Schema，则取消自动生成（避免覆盖 AI 的 Schema）
      if (schemaRegenerateTimerRef.current) {
        clearTimeout(schemaRegenerateTimerRef.current);
      }
      schemaRegenerateTimerRef.current = setTimeout(async () => {
        schemaRegenerateTimerRef.current = null;
        if (!sessionId) return;

        try {
          console.log("[DemoEditPage] 自动重新生成 Schema...");
          const res = await fetch("/api/generate-schema", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, demoId: activeDemoId }),
          });
          const data = await res.json();

          if (data.success && data.data?.schema) {
            const newSchemaStr = JSON.stringify(data.data.schema, null, 2);
            console.log("[DemoEditPage] Schema 自动生成成功");

            setSchema((prevSchema) => {
              try {
                const prevObj = JSON.parse(prevSchema);
                const newObj = data.data.schema;
                const prevKeys = Object.keys(prevObj.properties || {});
                const newKeys = Object.keys(newObj.properties || {});
                const keysChanged =
                  prevKeys.length !== newKeys.length ||
                  prevKeys.some((k) => !newKeys.includes(k));

                if (!keysChanged) {
                  console.log("[DemoEditPage] Schema 字段未变化，跳过更新");
                  return prevSchema;
                }

                console.log("[DemoEditPage] Schema 字段有变化，更新配置面板");
                return newSchemaStr;
              } catch {
                return newSchemaStr;
              }
            });

            setEditorContent((prev) => {
              const currentCode = extractCodeFromFigma(prev) || newCode;
              return buildFigmaText(currentCode, newSchemaStr);
            });

            setPreviewSize(getPreviewSize(newSchemaStr));

            const newDefaults = getSafeMergedDefaults(data.data.schema);
            setConfigDataMap((prev) => ({
              ...prev,
              [activeDemoIdRef.current]: { ...(prev[activeDemoIdRef.current] ?? {}), ...newDefaults },
            }));

            const currentCode = codeRef.current;
            if (currentCode) {
              const result = validateAll(currentCode, newSchemaStr);
              setValidationResult(result);
            }
          }
        } catch (err) {
          console.warn("[DemoEditPage] Schema 自动生成失败:", err);
        }
      }, 1500);
    },
    [schema, sessionId],
  );

  // 处理 AI Schema 更新
  const handleSchemaUpdate = useCallback((newSchema: string) => {
    console.log(
      "[DemoEditPage] handleSchemaUpdate called, newSchema length:",
      newSchema.length,
    );

    // AI 主动更新了 Schema，取消自动重新生成的防抖定时器
    if (schemaRegenerateTimerRef.current) {
      clearTimeout(schemaRegenerateTimerRef.current);
      schemaRegenerateTimerRef.current = null;
      console.log("[DemoEditPage] 已取消 Schema 自动重新生成定时器");
    }

    setSchema(newSchema);
    setEditorContent((prev) => {
      const updatedContent = buildFigmaText(
        extractCodeFromFigma(prev) || code,
        newSchema,
      );
      console.log(
        "[DemoEditPage] editorContent updated after schema change, new length:",
        updatedContent.length,
      );
      return updatedContent;
    });
    const size = getPreviewSize(newSchema);
    console.log("[DemoEditPage] Preview size calculated:", size);
    setPreviewSize(size);
    // 更新 configData 为新的默认值
    try {
      const newConfigData = getSafeMergedDefaults(newSchema);
      setConfigDataMap((prev) => {
        const current = prev[activeDemoIdRef.current] ?? {};
        const merged = { ...current, ...newConfigData };
        if (newConfigData.__order) {
          merged.__order = newConfigData.__order;
        }
        return { ...prev, [activeDemoIdRef.current]: merged };
      });
    } catch (e) {
      console.error(
        "[DemoEditPage] Failed to parse schema for default values:",
        e,
      );
    }

    const currentCode = codeRef.current;
    if (currentCode) {
      const result = validateAll(currentCode, newSchema);
      setValidationResult(result);
    }
  }, []);

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
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              "保存"
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
              defaultValue="ai"
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
                    <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                      {demoPages.length}
                    </Badge>
                  )}
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
                      const body: Record<string, unknown> = { demoId, forceNew: true };
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
                        toast({ title: "新建对话失败", variant: "destructive" });
                        return;
                      }
                      setSessionId(data.data.sessionId);
                      setWorkspaceId(data.data.workspaceId || "");
                      setTempWorkspace(data.data.tempWorkspace || "");
                      setAgentSessionId(`demo-${demoId}-${Date.now()}`);
                      setAiMessages([]);
                      setAiCurrentMessage({ role: "assistant", content: "", parts: [] });
                      setAiIsStreaming(false);
                      setAiStreamContent("");
                      if (!existingWorkspaceId) {
                        setCode(data.data.code || "");
                        setSchema(data.data.schema || "");
                        setEditorContent(buildFigmaText(data.data.code || "", data.data.schema || ""));
                        const defaults = getSafeMergedDefaults(data.data.schema || "");
                        setConfigDataMap((prev) => ({
                          ...prev,
                          [activeDemoIdRef.current]: defaults,
                        }));
                        const result = validateAll(data.data.code || "", data.data.schema || "");
                        setValidationResult(result);
                        const size = getPreviewSize(data.data.schema || "");
                        setPreviewSize(size);
                      }
                      toast({ title: "已创建新对话" });
                    } catch (error) {
                      toast({
                        title: "新建对话失败",
                        description: error instanceof Error ? error.message : "未知错误",
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

                      const sessionRes = await fetch(`/api/sessions/${newSessionId}`);
                      if (!sessionRes.ok) {
                        toast({ title: "会话不存在", variant: "destructive" });
                        return;
                      }
                      const sessionData = await sessionRes.json();
                      if (!sessionData.success || sessionData.data?.isExpired) {
                        toast({ title: "会话已过期", variant: "destructive" });
                        return;
                      }

                      const messagesRes = await fetch(`/api/sessions/${newSessionId}/messages`);
                      const messagesData = await messagesRes.json();
                      setAiMessages(messagesData.success ? (messagesData.data || []) : []);
                      setAiCurrentMessage({ role: "assistant", content: "", parts: [] });
                      setAiIsStreaming(false);
                      setAiStreamContent("");
                      const { getAgentClient } = await import("@/lib/agent-client");
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
                        description: error instanceof Error ? error.message : "未知错误",
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
                    if (sessionId) {
                      try {
                        const res = await fetch(`/api/sessions/${sessionId}/files/${pageId}`);
                        const data = await res.json();
                        if (data.success) {
                          setCode(data.data.code);
                          setSchema(data.data.schema);
                          setEditorContent(buildFigmaText(data.data.code, data.data.schema));
                          setConfigDataMap((prev) => {
                            if (prev[pageId]) return prev;
                            const defaults = getSafeMergedDefaults(data.data.schema);
                            return { ...prev, [pageId]: defaults };
                          });
                          const result = validateAll(data.data.code, data.data.schema);
                          setValidationResult(result);
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
                      const res = await fetch(`/api/projects/${demoId}/demos/${pageId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId, name }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setDemoPages((prev) =>
                          prev.map((p) => (p.id === pageId ? { ...p, name } : p))
                        );
                        toast({ title: "名称已更新" });
                      } else {
                        toast({ title: "更新失败", description: data.error?.message, variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "更新失败", variant: "destructive" });
                    }
                  }}
                  onPageCopy={async (pageId) => {
                    if (!sessionId) {
                      toast({ title: "未创建 Session", variant: "destructive" });
                      return;
                    }
                    const page = demoPages.find(p => p.id === pageId);
                    if (!page) return;
                    try {
                      const res = await fetch(`/api/projects/${demoId}/demos`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId, name: `${page.name} - 副本`, sourcePageId: pageId }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setDemoPages((prev) => [...prev, data.data].sort((a, b) => a.order - b.order));
                        toast({ title: "页面复制成功" });
                      } else {
                        toast({ title: "复制失败", description: data.error?.message, variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "复制失败", variant: "destructive" });
                    }
                  }}
                  onPageDelete={async (pageId) => {
                    if (!sessionId) {
                      toast({ title: "未创建 Session", variant: "destructive" });
                      return;
                    }
                    if (demoPages.length <= 1) {
                      toast({ title: "无法删除", description: "至少需要保留一个页面", variant: "destructive" });
                      return;
                    }
                    const page = demoPages.find(p => p.id === pageId);
                    if (!page || !confirm(`确定要删除页面「${page.name}」吗？`)) return;
                    try {
                      const res = await fetch(
                        `/api/projects/${demoId}/demos/${pageId}?sessionId=${encodeURIComponent(sessionId)}`,
                        { method: "DELETE" }
                      );
                      const data = await res.json();
                      if (data.success) {
                        setDemoPages((prev) => prev.filter((p) => p.id !== pageId));
                        if (activeDemoId === pageId) {
                          const remaining = demoPages.filter((p) => p.id !== pageId);
                          const nextPage = remaining[0];
                          if (nextPage) {
                            setActiveDemoId(nextPage.id);
                            const fileRes = await fetch(`/api/sessions/${sessionId}/files/${nextPage.id}`);
                              const fileData = await fileRes.json();
                              if (fileData.success) {
                                setCode(fileData.data.code);
                                setSchema(fileData.data.schema);
                                setEditorContent(buildFigmaText(fileData.data.code, fileData.data.schema));
                                setConfigDataMap((prev) => {
                                  const rest = { ...prev };
                                  delete rest[pageId];
                                  if (!rest[nextPage.id]) {
                                    const defaults = getSafeMergedDefaults(fileData.data.schema);
                                    rest[nextPage.id] = defaults;
                                  }
                                  return rest;
                                });
                              const result = validateAll(fileData.data.code, fileData.data.schema);
                              setValidationResult(result);
                              const size = getPreviewSize(fileData.data.schema);
                              setPreviewSize(size);
                            }
                          }
                        }
                        toast({ title: "页面已删除" });
                      } else {
                        toast({ title: "删除失败", description: data.error?.message, variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "删除失败", variant: "destructive" });
                    }
                  }}
                  onViewCode={async (pageId) => {
                    if (!sessionId) return;
                    const page = demoPages.find(p => p.id === pageId);
                    if (!page) return;
                    try {
                      const res = await fetch(`/api/sessions/${sessionId}/files/${pageId}`);
                      const data = await res.json();
                      if (data.success) {
                        setActiveDemoId(pageId);
                        setCode(data.data.code);
                        setSchema(data.data.schema);
                        setEditorContent(buildFigmaText(data.data.code, data.data.schema));
                        setConfigDataMap((prev) => {
                          if (prev[pageId]) return prev;
                          const defaults = getSafeMergedDefaults(data.data.schema);
                          return { ...prev, [pageId]: defaults };
                        });
                        const result = validateAll(data.data.code, data.data.schema);
                        setValidationResult(result);
                        const size = getPreviewSize(data.data.schema);
                        setPreviewSize(size);
                        setViewCodeData({
                          code: data.data.code,
                          schema: data.data.schema,
                          pageName: page.name,
                          pageId: page.id,
                        });
                        setViewCodeDialogOpen(true);
                      }
                    } catch {
                      toast({ title: "加载代码失败", variant: "destructive" });
                    }
                  }}
                />
              </TabsContent>
            </Tabs>
          </ResizablePanel>

          <ResizablePanel className="relative border rounded-lg overflow-hidden bg-background shadow-sm flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
              <Button
                variant={previewMode === 'single' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setPreviewMode('single')}
              >
                <FileText className="h-3.5 w-3.5" />
                单页
              </Button>
              <Button
                variant={previewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setPreviewMode('grid')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                宫格
              </Button>
              <div className="flex-1" />
              {previewMode === 'single' && demoPages.length > 1 && (
                <Select value={activeDemoId} onValueChange={async (pageId) => {
                  setActiveDemoId(pageId);
                  if (sessionId) {
                    try {
                      const res = await fetch(`/api/sessions/${sessionId}/files/${pageId}`);
                      const data = await res.json();
                      if (data.success) {
                        setCode(data.data.code);
                        setSchema(data.data.schema);
                        setEditorContent(buildFigmaText(data.data.code, data.data.schema));
                        setConfigDataMap((prev) => {
                          if (prev[pageId]) return prev;
                          const defaults = getSafeMergedDefaults(data.data.schema);
                          return { ...prev, [pageId]: defaults };
                        });
                        const result = validateAll(data.data.code, data.data.schema);
                        setValidationResult(result);
                        const size = getPreviewSize(data.data.schema);
                        setPreviewSize(size);
                      }
                    } catch (err) {
                      console.error("加载页面失败:", err);
                    }
                  }
                }}>
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
              {previewMode === 'grid' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">每行</span>
                  <Select value={String(gridColumns)} onValueChange={(v) => setGridColumns(Number(v) as 2 | 3 | 4)}>
                    <SelectTrigger className="h-7 w-16 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {previewMode === 'grid' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">缩放</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setGridScale(s => Math.max(0.5, s - 0.1))}
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs w-10 text-center tabular-nums">
                    {Math.round(gridScale * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setGridScale(s => Math.min(2.0, s + 0.1))}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {previewMode === 'single' ? (
                <div
                  className="p-4 h-full overflow-y-auto preview-single-scroll"
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
                  />
                </div>
              ) : (
                <PreviewGrid
                  sessionId={sessionId}
                  demoPages={demoPages}
                  activePageId={activeDemoId}
                  gridColumns={gridColumns}
                  gridScale={gridScale}
                  onGridScaleChange={setGridScale}
                  onGridColumnsChange={setGridColumns}
                  onCardClick={(pageId) => {
                    if (pageId === activeDemoId) return;
                    setActiveDemoId(pageId);
                    const clickedPage = demoPages.find(p => p.id === pageId) as (DemoPageMeta & { previewSize?: import("../../../../../components/demo/types").PreviewSize }) | undefined;
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
                            setEditorContent(buildFigmaText(data.data.code, data.data.schema));
                            setConfigDataMap((prev) => {
                              if (prev[pageId]) return prev;
                              const defaults = getSafeMergedDefaults(data.data.schema);
                              return { ...prev, [pageId]: defaults };
                            });
                            const result = validateAll(data.data.code, data.data.schema);
                            setValidationResult(result);
                            const size = getPreviewSize(data.data.schema);
                            setPreviewSize(size);
                          }
                        })
                        .catch((err) => console.error("加载页面失败:", err));
                    }
                  }}
                  configDataMap={configDataMap}
                  previewSize={previewSize}
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
                {!validationResult.isValid && validationResult.errors.length > 0 && (
                  <ValidationPanel errors={validationResult.errors} />
                )}
                {projectConfigSchema && (
                  <ConfigScopeWrapper scope="project" hideHeader={!projectConfigSchema}>
                    <ConfigForm
                      key={`project-${projectConfigSchema}`}
                      schema={projectConfigSchema}
                      onChange={(data) => {
                        setConfigDataMap((prev) => {
                          const next = { ...prev };
                          for (const pageId of Object.keys(next)) {
                            next[pageId] = { ...next[pageId], ...data };
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

                {projectConfigSchema && (
                  <div className="h-[2px] bg-border my-3" />
                )}

                <ConfigScopeWrapper scope="page" pageName={demoPages.find(p => p.id === activeDemoId)?.name} hideHeader={!projectConfigSchema}>
                  <ConfigForm
                    key={schema}
                    schema={schema}
                    onChange={handleConfigChange}
                    onSchemaChange={handleSchemaChange}
                    initialData={configData}
                    sessionId={sessionId}
                  />
                </ConfigScopeWrapper>
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
        onThumbnailChange={(thumbnail) => setCurrentThumbnail(thumbnail ?? undefined)}
      />

      <CodeViewDialog
        open={viewCodeDialogOpen}
        onOpenChange={setViewCodeDialogOpen}
        code={viewCodeData.code}
        schema={viewCodeData.schema}
        pageName={viewCodeData.pageName}
        sessionId={sessionId}
        demoId={viewCodeData.pageId}
        onSave={async (type, content) => {
          if (!sessionId) return;
          const body = type === "code" ? { code: content } : { schema: content };
          const res = await fetch(`/api/sessions/${sessionId}/files/${viewCodeData.pageId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!data.success) {
            throw new Error(data.error?.message || "保存失败");
          }
          if (type === "code") {
            setCode(content);
            setEditorContent(buildFigmaText(content, schema));
            const result = validateAll(content, schema);
            setValidationResult(result);
          } else {
            setSchema(content);
            setEditorContent(buildFigmaText(code, content));
            const defaults = getSafeMergedDefaults(content);
            setConfigDataMap((prev) => ({
              ...prev,
              [activeDemoIdRef.current]: { ...(prev[activeDemoIdRef.current] ?? {}), ...defaults },
            }));
            const result = validateAll(code, content);
            setValidationResult(result);
            const size = getPreviewSize(content);
            setPreviewSize(size);
          }
        }}
      />
    </div>
  );
}
