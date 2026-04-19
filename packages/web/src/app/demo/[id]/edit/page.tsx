"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PreviewPanel, ConfigForm } from "../../../../../components/demo";
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
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AIChat } from "@/components/ai-elements/ai-chat";
import { type ChatMessage } from "@/components/ai-elements";
import {
  ResizablePanelGroup,
  ResizablePanel,
} from "@/components/ui/resizable";
import {
  Bot,
  Code2,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

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

  const [configData, setConfigData] = useState<Record<string, unknown>>({});

  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  });

  const [agentSessionId, setAgentSessionId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [sessionId, setSessionId] = useState("");
  const [tempWorkspace, setTempWorkspace] = useState("");
  const [previewSize, setPreviewSize] =
    useState<import("../../../../../components/demo/types").PreviewSize>();

  const [demoName, setDemoName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiIsStreaming, setAiIsStreaming] = useState(false);
  const [aiStreamContent, setAiStreamContent] = useState("");
  const [aiCurrentMessage, setAiCurrentMessage] = useState<ChatMessage>({
    role: "assistant",
    content: "",
    parts: [],
  });

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
            (d: { id: string; name: string }) => d.id === demoId,
          );
          if (demo) {
            setDemoName(demo.name);
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

        const loadedCode = filesData.data.code;
        const loadedSchema = filesData.data.schema;

        setCode(loadedCode);
        setSchema(loadedSchema);
        setEditorContent(buildFigmaText(loadedCode, loadedSchema));

        const defaults = getDefaultValues(loadedSchema);
        setConfigData(defaults);

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
          },
        ],
      });
      return;
    }

    setCode(parsed.code);
    setSchema(parsed.schema);

    const result = validateAll(parsed.code, parsed.schema);
    setValidationResult(result);

    const defaults = getDefaultValues(parsed.schema);
    setConfigData((prev) => ({ ...defaults, ...prev }));

    const size = getPreviewSize(parsed.schema);
    setPreviewSize(size);
  }, []);

  const handleConfigChange = useCallback((data: Record<string, unknown>) => {
    setConfigData(data);
  }, []);

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

    if (!validationResult.isValid) {
      toast({
        title: "保存失败",
        description: "请修复所有错误后再保存",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);

      console.log(`[handleSave] 发送 PUT 请求到 /api/sessions/${sessionId}/files`);
      const saveRes = await fetch(`/api/sessions/${sessionId}/files`, {
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
      }
    },
    [schema],
  );

  // 处理 AI Schema 更新
  const handleSchemaUpdate = useCallback((newSchema: string) => {
    console.log(
      "[DemoEditPage] handleSchemaUpdate called, newSchema length:",
      newSchema.length,
    );
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
      const schemaObj = JSON.parse(newSchema);
      console.log(
        "[DemoEditPage] Schema parsed successfully, keys:",
        Object.keys(schemaObj),
      );
      const newConfigData = getDefaultValues(schemaObj);
      console.log("[DemoEditPage] New default config data:", newConfigData);
      setConfigData((prev) => {
        const merged = {
          ...newConfigData,
          ...prev, // 保留用户已修改的配置
        };
        console.log("[DemoEditPage] Merged config data:", merged);
        return merged;
      });
    } catch (e) {
      console.error(
        "[DemoEditPage] Failed to parse schema for default values:",
        e,
      );
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
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={!validationResult.isValid || isSaving}
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
          defaultSizes={[35, 35, 30]}
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
                <TabsTrigger value="code" className="gap-2">
                  <Code2 className="h-4 w-4" />
                  代码编辑
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
                  onNewSession={async () => {
                    console.log("新建对话");
                  }}
                  onSelectSession={(newSessionId) => {
                    console.log("切换到会话:", newSessionId);
                  }}
                />
              </TabsContent>

              <TabsContent
                value="code"
                className="flex-1 flex flex-col mt-0 h-full data-[state=inactive]:hidden"
              >
                <div className="flex-1 relative w-full">
                  <Textarea
                    value={editorContent}
                    onChange={(e) => handleEditorChange(e.target.value)}
                    spellCheck={false}
                    className="w-full h-full resize-none outline-none font-mono text-sm bg-zinc-950 text-zinc-100 border-0 rounded-none"
                    style={{ tabSize: 2 }}
                    placeholder={`${"=== DEMO CODE ==="}
// 在此处粘贴 React 组件代码

${"=== DEMO SCHEMA ==="}
// 在此处粘贴 JSON Schema 配置

${"=== END ==="}`}
                  />
                </div>

                {validationResult.errors.length > 0 && (
                  <ScrollArea className="h-[120px] border-t bg-destructive/5">
                    <div className="p-3 space-y-2">
                      {validationResult.errors.map((error, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-2 text-xs"
                        >
                          <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                          <span className="text-destructive">
                            {error.type === "json_syntax"
                              ? "[语法]"
                              : error.type === "props_mismatch"
                                ? "[不匹配]"
                                : error.type === "required_missing"
                                  ? "[必填]"
                                  : "[警告]"}{" "}
                            {error.message}
                            {error.line && ` (第 ${error.line} 行)`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <div className="px-4 py-2 border-t bg-muted/50 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span>{editorContent.length} 字符</span>
                    <span>{editorContent.split("\n").length} 行</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {validationResult.isValid ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="text-green-500">有效</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 text-destructive" />
                        <span className="text-destructive">
                          {validationResult.errors.length} 个错误
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </ResizablePanel>

          <ResizablePanel className="p-4 bg-muted/30">
            <div className="h-full border rounded-lg overflow-hidden bg-background shadow-sm">
              <PreviewPanel
                code={code}
                configData={configData}
                previewSize={previewSize}
              />
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
              <div className="p-4">
                <ConfigForm
                  schema={schema}
                  onChange={handleConfigChange}
                  initialData={configData}
                />
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
