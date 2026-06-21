"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage } from "@/components/ai-elements";
import type { StreamEvent, ImageAttachment } from "@opencode-workbench/agent-client";
import {
  MissingTransactionalDeleteToolsError,
  StreamService,
  type PermissionRequest,
} from "../services/stream-service";
import {
  updateTextPart,
  addThoughtPart,
  addToolPart,
  updateToolPart,
} from "../utils/chat-stream-utils";
import {
  processFileChanges,
  extractCodeAndSchemaUpdates,
  isCodeFile,
  isSchemaFile,
  normalizePath,
  type FileChangeEntry,
} from "../utils/chat-file-utils";
import {
  persistMessages,
  updateSessionTitle,
  fetchSessionFiles,
} from "../services/message-service";
import {
  buildActiveViewContextPrefix,
  type ActiveViewContext,
} from "@/lib/agent/active-view-context";

const DEFAULT_CURRENT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "",
  parts: [],
};

function isBulkPageDeletionRequest(message: string): boolean {
  return /删|删除|清理/.test(message) &&
    /页面|页/.test(message) &&
    /所有|全部|批量|这些|那些|多个|副本|不需要|冗余/.test(message);
}

interface UseChatStreamOptions {
  sessionId: string;
  agentSessionId: string;
  workingDir?: string;
  demoId?: string;
  activeViewContext?: ActiveViewContext;
  onCodeUpdate?: (code: string, source?: "ai-realtime" | "ai-finish") => void;
  onSchemaUpdate?: (schema: string, source?: "ai-realtime" | "ai-finish") => void;
  onFilesChange?: (
    files: Array<{
      path: string;
      action: "created" | "modified" | "deleted";
    }>,
  ) => void;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  setMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  setIsStreaming: (value: boolean) => void;
  setStreamContent: (updater: string | ((prev: string) => string)) => void;
  currentMessageRef: React.MutableRefObject<ChatMessage>;
  setCurrentMessage: (
    updater: ChatMessage | ((prev: ChatMessage) => ChatMessage),
  ) => void;
  onModelsEvent?: (event: StreamEvent) => void;
  onModelStateError?: () => void;
  externalStreamServiceRef?: React.MutableRefObject<StreamService | null>;
}

export function useChatStream(options: UseChatStreamOptions) {
  const {
    sessionId,
    agentSessionId,
    workingDir,
    demoId,
    activeViewContext,
    onCodeUpdate,
    onSchemaUpdate,
    onFilesChange,
    messagesRef,
    setMessages,
    setIsStreaming,
    setStreamContent,
    currentMessageRef,
    setCurrentMessage,
    onModelsEvent,
    onModelStateError,
    externalStreamServiceRef,
  } = options;

  const [plan, setPlan] = useState<string>("");
  const [pendingPermissionRequest, setPendingPermissionRequest] =
    useState<PermissionRequest | null>(null);
  const [silenceSeconds, setSilenceSeconds] = useState<number | null>(null);

  const streamServiceRef = useRef<StreamService | null>(null);
  const streamSessionIdRef = useRef<string>("");
  const lastEventAtRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const memoryFilePathsRef = useRef<Set<string>>(new Set());

  const SILENCE_THRESHOLD_MS = 30000;
  const SILENCE_TICK_MS = 1000;

  const stopSilenceTracking = useCallback(() => {
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    lastEventAtRef.current = null;
    setSilenceSeconds(null);
  }, []);

  const startSilenceTracking = useCallback(() => {
    lastEventAtRef.current = Date.now();
    setSilenceSeconds(null);
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    silenceTimerRef.current = setInterval(() => {
      if (lastEventAtRef.current == null) return;
      const elapsed = Date.now() - lastEventAtRef.current;
      if (elapsed >= SILENCE_THRESHOLD_MS) {
        setSilenceSeconds(Math.floor(elapsed / 1000));
      } else {
        setSilenceSeconds(null);
      }
    }, SILENCE_TICK_MS);
  }, []);

  const markActivity = useCallback(() => {
    if (lastEventAtRef.current != null) {
      lastEventAtRef.current = Date.now();
    }
  }, []);

  // 清理流
  useEffect(() => {
    return () => {
      streamServiceRef.current?.close();
      stopSilenceTracking();
    };
  }, [stopSilenceTracking]);

  // 会话切换时关闭旧流
  useEffect(() => {
    if (
      streamServiceRef.current?.isActive &&
      streamSessionIdRef.current &&
      streamSessionIdRef.current !== sessionId
    ) {
      streamServiceRef.current.close();
      streamSessionIdRef.current = "";
      stopSilenceTracking();
      setIsStreaming(false);
      setStreamContent("");
      setCurrentMessage({
        role: "assistant",
        content: "",
        parts: [],
      });
    }
  }, [
    sessionId,
    setIsStreaming,
    setStreamContent,
    setCurrentMessage,
    stopSilenceTracking,
  ]);

  const handleSend = useCallback(
    async (userMessage: string, images?: ImageAttachment[]) => {
      if (!userMessage.trim() || !agentSessionId) return;

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: userMessage.trim(),
          parts: images?.map((img) => ({
            type: "image" as const,
            url: `data:${img.mimeType};base64,${img.data}`,
          })) || [],
        },
      ]);

      try {
        memoryFilePathsRef.current.clear();
        setIsStreaming(true);
        setStreamContent("");
        setPlan("");
        setCurrentMessage({
          role: "assistant",
          content: "",
          parts: [],
        });

        const streamService = new StreamService();
        streamServiceRef.current = streamService;
        if (externalStreamServiceRef) {
          externalStreamServiceRef.current = streamService;
        }

        const stream = await streamService.connect(agentSessionId, sessionId);
        streamSessionIdRef.current = sessionId;

        let accumulatedContent = "";

        const realtimeFilesRef = new Map<
          string,
          { action: string; content?: string }
        >();
        let fileUpdateTimer: NodeJS.Timeout | null = null;

        const processRealtimeFiles = () => {
          const files = Array.from(realtimeFilesRef.entries()).map(
            ([path, info]) => ({
              path,
              action: info.action as "created" | "modified" | "deleted",
              content: info.content,
            }),
          );

          if (files.length > 0) {
            processFileChanges(files, {
              onCodeUpdate,
              onSchemaUpdate,
              onFilesChange,
            });
          }
        };

        streamService.setHandlers({
          onStream: (content) => {
            markActivity();
            accumulatedContent += content;
            setStreamContent(accumulatedContent);
            setCurrentMessage((prev) => ({
              ...prev,
              content: accumulatedContent,
              parts: updateTextPart(
                prev.parts || [],
                content,
                accumulatedContent,
              ),
            }));
          },

          onThought: (content) => {
            markActivity();
            setCurrentMessage((prev) => ({
              ...prev,
              parts: addThoughtPart(prev.parts || [], content),
            }));
          },

          onPlan: (content) => {
            markActivity();
            setPlan((prev) => prev + content);
          },

          onModels: (event) => {
            onModelsEvent?.(event);
          },

          onToolCall: (toolCall) => {
            markActivity();
            setCurrentMessage((prev) => ({
              ...prev,
              parts: addToolPart(prev.parts || [], toolCall),
            }));
          },

          onToolUpdate: (update) => {
            markActivity();
            setCurrentMessage((prev) => ({
              ...prev,
              parts: updateToolPart(prev.parts || [], update),
            }));
          },

          onPermission: (request) => {
            setPendingPermissionRequest(request);
          },

          onFileOperation: (operation) => {
            markActivity();
            if (operation.method === "fs/write_text_file" && operation.path) {
              realtimeFilesRef.set(operation.path, {
                action: "modified",
                content: operation.content,
              });

              if (operation.path.endsWith(".md")) {
                memoryFilePathsRef.current.add(operation.path);
              }

              if (fileUpdateTimer) {
                clearTimeout(fileUpdateTimer);
              }

              fileUpdateTimer = setTimeout(() => {
                processRealtimeFiles();
                fileUpdateTimer = null;
              }, 300);
            }
          },

          onFinish: async (result) => {
            streamService.stopKeepalive();
            stopSilenceTracking();
            const currentMsg = currentMessageRef.current;
            const assistantMessage: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content:
                accumulatedContent ||
                result.content ||
                "抱歉，我没有收到有效的回复。",
              parts: currentMsg.parts,
            };

            const updatedMessages = [...messagesRef.current, assistantMessage];
            setMessages(updatedMessages);
            setCurrentMessage({
              role: "assistant",
              content: "",
              parts: [],
            });
            setStreamContent("");

            await persistMessages(sessionId, updatedMessages);
            await updateSessionTitle(
              sessionId,
              userMessage,
              messagesRef.current.length === 0,
            );

            // ── 1. 清除 pending timer（不调用 processRealtimeFiles，避免路径 A 重复触发） ──
            if (fileUpdateTimer) {
              clearTimeout(fileUpdateTimer);
              fileUpdateTimer = null;
            }

            // ── 2. 检测实时流已更新的数据类型 ──
            let realtimeUpdatedCode = false;
            let realtimeUpdatedSchema = false;
            for (const [path, info] of realtimeFilesRef.entries()) {
              const normalizedPath = normalizePath(path);
              if (isCodeFile(normalizedPath) && info.content) realtimeUpdatedCode = true;
              if (isSchemaFile(normalizedPath) && info.content) realtimeUpdatedSchema = true;
            }

            // ── 3. Flush 实时流文件到 UI（保持流式阶段的预览体验） ──
            const pendingRealtimeFiles = Array.from(realtimeFilesRef.entries()).map(
              ([path, info]) => ({
                path,
                action: info.action as "created" | "modified" | "deleted",
                content: info.content,
              }),
            );
            if (pendingRealtimeFiles.length > 0) {
              processFileChanges(pendingRealtimeFiles, {
                onCodeUpdate,
                onSchemaUpdate,
                onFilesChange,
              });
            }

            // ── 4. 构建最终文件列表：realtimeFilesRef 优先，result.files 仅补充缺失文件 ──
            const realtimeFileMap = new Map<string, FileChangeEntry>();
            for (const [path, info] of realtimeFilesRef.entries()) {
              realtimeFileMap.set(path, {
                path,
                action: info.action as "created" | "modified" | "deleted",
                content: info.content,
              });
            }
            if (result.files && result.files.length > 0) {
              for (const f of result.files) {
                if (!realtimeFileMap.has(f.path)) {
                  realtimeFileMap.set(f.path, f);
                }
              }
            }
            const finalFiles = Array.from(realtimeFileMap.values());

            if (finalFiles.length > 0) {
              for (const f of finalFiles) {
                if (f.path && f.path.endsWith(".md")) {
                  memoryFilePathsRef.current.add(f.path);
                }
              }
              onFilesChange?.(finalFiles);
            }

            setIsStreaming(false);

            // ── 5. 从 finalFiles 提取更新，但跳过实时流已更新的数据类型（避免旧值覆盖新值） ──
            const { codeUpdated, schemaUpdated } =
              finalFiles.length > 0
                ? extractCodeAndSchemaUpdates(finalFiles, {
                    onCodeUpdate: realtimeUpdatedCode
                      ? undefined
                      : (code) => onCodeUpdate?.(code, "ai-finish"),
                    onSchemaUpdate: realtimeUpdatedSchema
                      ? undefined
                      : (schema) => onSchemaUpdate?.(schema, "ai-finish"),
                  })
                : { codeUpdated: false, schemaUpdated: false };

            // ── 6. HTTP 兜底：仅在完全没有数据更新时触发 ──
            const effectiveCodeUpdated = realtimeUpdatedCode || codeUpdated;
            const effectiveSchemaUpdated = realtimeUpdatedSchema || schemaUpdated;

            if (!effectiveCodeUpdated && !effectiveSchemaUpdated) {
              const filesData = await fetchSessionFiles(sessionId, demoId);
              if (filesData) {
                const { code, schema } = filesData;
                if (code) onCodeUpdate?.(code, "ai-finish");
                if (schema) onSchemaUpdate?.(schema, "ai-finish");

                const fetchedFiles: FileChangeEntry[] = [];
                if (code)
                  fetchedFiles.push({
                    path: "index.tsx",
                    action: "modified",
                    content: code,
                  });
                if (schema)
                  fetchedFiles.push({
                    path: "config.schema.json",
                    action: "modified",
                    content: schema,
                  });
                if (fetchedFiles.length > 0) onFilesChange?.(fetchedFiles);
              }
            }

            realtimeFilesRef.clear();
          },

          onConnectionError: () => {
            // 连接未建立时的错误处理：重置状态并显示错误
            setIsStreaming(false);
            stopSilenceTracking();
            const errorMessage: ChatMessage = {
              id: `error-${Date.now()}`,
              role: "assistant",
              content:
                "WebSocket 连接失败，请检查 Agent Service 是否运行（http://localhost:3201）",
            };
            setMessages((prev) => [...prev, errorMessage]);
          },

          onError: (error) => {
            streamService.stopKeepalive();
            const isModelError =
              error.code === "SESSION_NOT_FOUND" ||
              error.code === "GET_MODELS_ERROR";
            if (isModelError) {
              onModelStateError?.();
              return;
            }

            const errorMessage: ChatMessage = {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: `错误: ${error.message}`,
            };
            setMessages((prev) => [...prev, errorMessage]);
            setStreamContent("");
            setIsStreaming(false);
            stopSilenceTracking();
          },
        });

        await streamService.waitForConnection(stream);

        // 等待 L3 / capabilities 拼装完成再发送，确保能力缺失能被当前流程捕获
        await streamService.sendMessage(
          userMessage,
          workingDir,
          images,
          demoId,
          activeViewContext,
        );
        streamService.startKeepalive();
        startSilenceTracking();
      } catch (error) {
        if (error instanceof MissingTransactionalDeleteToolsError) {
          streamServiceRef.current?.close();
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: error.message,
          };
          setMessages((prev) => [...prev, errorMessage]);
          setStreamContent("");
          setIsStreaming(false);
          stopSilenceTracking();
          return;
        }

        console.warn("WebSocket 失败，使用非流式模式:", error);

        if (isBulkPageDeletionRequest(userMessage)) {
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: "当前无法建立安全的事务化删除通道。请确认 Agent Service 已重启并刷新页面后再试。",
          };
          setMessages((prev) => [...prev, errorMessage]);
          setStreamContent("");
          setIsStreaming(false);
          stopSilenceTracking();
          streamServiceRef.current?.close();
          return;
        }

        try {
          const { getAgentClient } = await import("@/lib/agent-client");
          const agentClient = getAgentClient();

          const activeViewPrefix = buildActiveViewContextPrefix(activeViewContext);
          const content = activeViewPrefix
            ? `${activeViewPrefix}${userMessage}`
            : userMessage;

          const result = await agentClient.sendMessage(
            agentSessionId,
            content,
            {
              demoId,
              workingDir,
              images,
              options: {
                stream: false,
              },
            },
          );

          if (!result.success) {
            throw new Error(result.error?.message || "Agent 请求失败");
          }

          const aiReply =
            result.data?.content || "抱歉，我没有收到有效的回复。";

          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: aiReply,
          };

          const httpUpdatedMessages = [
            ...messagesRef.current,
            assistantMessage,
          ];
          setMessages(httpUpdatedMessages);

          await persistMessages(sessionId, httpUpdatedMessages);

          if (result.data?.files && result.data.files.length > 0) {
            for (const f of result.data.files) {
              if (f.path && f.path.endsWith(".md")) {
                memoryFilePathsRef.current.add(f.path);
              }
            }
            onFilesChange?.(result.data.files);
            const { codeUpdated, schemaUpdated } = extractCodeAndSchemaUpdates(
              result.data.files,
              {
                onCodeUpdate,
                onSchemaUpdate,
              },
            );

            if (!codeUpdated || !schemaUpdated) {
              const filesData = await fetchSessionFiles(sessionId, demoId);
              if (filesData) {
                const { code, schema } = filesData;
                if (code && !codeUpdated) onCodeUpdate?.(code);
                if (schema && !schemaUpdated) onSchemaUpdate?.(schema);
              }
            }
          } else {
            const filesData = await fetchSessionFiles(sessionId, demoId);
            if (filesData) {
              const { code, schema } = filesData;
              if (code) onCodeUpdate?.(code);
              if (schema) onSchemaUpdate?.(schema);
            }
          }
        } catch (httpError) {
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `错误: ${httpError instanceof Error ? httpError.message : "未知错误"}。请确保 Agent Service 已启动（http://localhost:3201）`,
          };
          setMessages((prev) => [...prev, errorMessage]);
        } finally {
          setIsStreaming(false);
          stopSilenceTracking();
          streamServiceRef.current?.close();
        }
      }
    },
    [
      agentSessionId,
      sessionId,
      workingDir,
      demoId,
      activeViewContext,
      onCodeUpdate,
      onSchemaUpdate,
      onFilesChange,
      setMessages,
      setIsStreaming,
      setStreamContent,
      setCurrentMessage,
      messagesRef,
      currentMessageRef,
      onModelsEvent,
      onModelStateError,
      markActivity,
      startSilenceTracking,
      stopSilenceTracking,
    ],
  );

  const handlePermissionResponse = useCallback(
    (optionId: string) => {
      if (pendingPermissionRequest) {
        streamServiceRef.current?.sendPermissionResponse(
          pendingPermissionRequest.toolCall.toolCallId,
          optionId,
        );
      }
      setPendingPermissionRequest(null);
    },
    [pendingPermissionRequest],
  );

  const handlePermissionCancel = useCallback(() => {
    handlePermissionResponse("reject_once");
  }, [handlePermissionResponse]);

  const handleCancel = useCallback(
    (streamContent: string, currentMessage: ChatMessage) => {
      streamServiceRef.current?.close();
      stopSilenceTracking();
      setIsStreaming(false);
      if (
        streamContent ||
        (currentMessage.parts && currentMessage.parts.length > 0)
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: streamContent || "已取消",
            parts: currentMessage.parts,
          },
        ]);
        setStreamContent("");
      }
      setCurrentMessage({
        role: "assistant",
        content: "",
        parts: [],
      });
    },
    [
      setIsStreaming,
      setMessages,
      setStreamContent,
      setCurrentMessage,
      stopSilenceTracking,
    ],
  );

  const handleRegenerate = useCallback(
    (targetAssistantId: string) => {
      const msgs = messagesRef.current;
      const targetIndex = msgs.findIndex((m) => m.id === targetAssistantId);
      if (targetIndex < 1) return;

      const userMsg = msgs
        .slice(0, targetIndex)
        .reverse()
        .find((m) => m.role === "user");
      if (!userMsg) return;

      const truncated = msgs.slice(0, targetIndex);
      setMessages(truncated);
      persistMessages(sessionId, truncated);

      const imageParts = userMsg.parts?.filter((p) => p.type === "image") || [];
      const images: ImageAttachment[] | undefined = imageParts.length > 0
        ? imageParts.map((p) => {
            if (p.type !== "image") return undefined;
            const match = p.url.match(/^data:(.+);base64,(.+)$/);
            if (match) {
              return { mimeType: match[1], data: match[2], name: "image" } as ImageAttachment;
            }
            return undefined;
          }).filter((img): img is ImageAttachment => img !== undefined)
        : undefined;

      handleSend(userMsg.content, images);
    },
    [messagesRef, setMessages, sessionId, handleSend],
  );

  const handleRollback = useCallback(
    async (targetAssistantId: string) => {
      const msgs = messagesRef.current;
      const targetIndex = msgs.findIndex((m) => m.id === targetAssistantId);
      if (targetIndex < 1) return;

      try {
        await fetch(`/api/agent/${agentSessionId}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assistantMessageId: targetAssistantId }),
        });
      } catch (e) {
        console.warn("[Rollback] File rollback failed:", e);
      }

      const truncated = msgs.slice(0, targetIndex);
      setMessages(truncated);
      await persistMessages(sessionId, truncated);
    },
    [messagesRef, setMessages, sessionId, agentSessionId],
  );

  const handleEditResend = useCallback(
    (targetMessageId: string, newContent: string) => {
      if (!newContent.trim()) return;

      const msgs = messagesRef.current;
      const msgIndex = msgs.findIndex((m) => m.id === targetMessageId);
      if (msgIndex < 0) return;

      const truncated = msgs.slice(0, msgIndex);
      setMessages(truncated);
      persistMessages(sessionId, truncated);

      const msg = msgs[msgIndex];
      const imageParts = msg.parts?.filter((p) => p.type === "image") || [];
      const images: ImageAttachment[] | undefined = imageParts.length > 0
        ? imageParts.map((p) => {
            if (p.type !== "image") return undefined;
            const match = p.url.match(/^data:(.+);base64,(.+)$/);
            if (match) {
              return { mimeType: match[1], data: match[2], name: "image" } as ImageAttachment;
            }
            return undefined;
          }).filter((img): img is ImageAttachment => img !== undefined)
        : undefined;

      handleSend(newContent, images);
    },
    [messagesRef, setMessages, sessionId, handleSend],
  );

  return {
    plan,
    setPlan,
    pendingPermissionRequest,
    silenceSeconds,
    memoryFilePathsRef,
    handleSend,
    handleCancel,
    handleRegenerate,
    handleRollback,
    handleEditResend,
    handlePermissionResponse,
    handlePermissionCancel,
  };
}
