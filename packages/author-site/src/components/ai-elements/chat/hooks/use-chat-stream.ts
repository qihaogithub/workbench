"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage } from "@/components/ai-elements";
import type { StreamEvent } from "@opencode-workbench/agent-client";
import { StreamService, type PermissionRequest } from "../services/stream-service";
import {
  updateTextPart,
  addThoughtPart,
  addToolPart,
  updateToolPart,
} from "../utils/chat-stream-utils";
import {
  processFileChanges,
  extractCodeAndSchemaUpdates,
  type FileChangeEntry,
} from "../utils/chat-file-utils";
import {
  persistMessages,
  updateSessionTitle,
  fetchSessionFiles,
} from "../services/message-service";

const DEFAULT_CURRENT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "",
  parts: [],
};

interface UseChatStreamOptions {
  sessionId: string;
  agentSessionId: string;
  workingDir?: string;
  demoId?: string;
  onCodeUpdate?: (code: string) => void;
  onSchemaUpdate?: (schema: string) => void;
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
  setStreamContent: (
    updater: string | ((prev: string) => string),
  ) => void;
  currentMessageRef: React.MutableRefObject<ChatMessage>;
  setCurrentMessage: (
    updater: ChatMessage | ((prev: ChatMessage) => ChatMessage),
  ) => void;
  onModelsEvent?: (event: StreamEvent) => void;
  onModelStateError?: () => void;
}

export function useChatStream(options: UseChatStreamOptions) {
  const {
    sessionId,
    agentSessionId,
    workingDir,
    demoId,
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
  } = options;

  const [plan, setPlan] = useState<string>("");
  const [pendingPermissionRequest, setPendingPermissionRequest] =
    useState<PermissionRequest | null>(null);
  const [silenceSeconds, setSilenceSeconds] = useState<number | null>(null);

  const streamServiceRef = useRef<StreamService | null>(null);
  const streamSessionIdRef = useRef<string>("");
  const lastEventAtRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

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
  }, [sessionId, setIsStreaming, setStreamContent, setCurrentMessage, stopSilenceTracking]);

  const handleSend = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || !agentSessionId) return;

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: userMessage.trim(),
        },
      ]);

      try {
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
              parts: updateTextPart(prev.parts || [], content, accumulatedContent),
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
            setIsStreaming(false);

            await persistMessages(sessionId, updatedMessages);
            await updateSessionTitle(
              sessionId,
              userMessage,
              messagesRef.current.length === 0,
            );

            if (fileUpdateTimer) {
              clearTimeout(fileUpdateTimer);
              fileUpdateTimer = null;
              processRealtimeFiles();
            }

            const finalFiles: FileChangeEntry[] =
              result.files && result.files.length > 0
                ? result.files
                : Array.from(realtimeFilesRef.entries()).map(
                    ([path, info]) => ({
                      path,
                      action: info.action as
                        | "created"
                        | "modified"
                        | "deleted",
                      content: info.content,
                    }),
                  );

            if (finalFiles.length > 0) {
              onFilesChange?.(finalFiles);
            }

            const { codeUpdated, schemaUpdated } =
              finalFiles.length > 0
                ? extractCodeAndSchemaUpdates(finalFiles, {
                    onCodeUpdate,
                    onSchemaUpdate,
                  })
                : { codeUpdated: false, schemaUpdated: false };

            if (!codeUpdated || !schemaUpdated) {
              const filesData = await fetchSessionFiles(sessionId, demoId);
              if (filesData) {
                const { code, schema } = filesData;
                if (code && !codeUpdated) onCodeUpdate?.(code);
                if (schema && !schemaUpdated) onSchemaUpdate?.(schema);

                const fetchedFiles: FileChangeEntry[] = [];
                if (!codeUpdated && code)
                  fetchedFiles.push({
                    path: "index.tsx",
                    action: "modified",
                    content: code,
                  });
                if (!schemaUpdated && schema)
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
              content: "WebSocket 连接失败，请检查 Agent Service 是否运行（http://localhost:3201）",
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

        streamService.sendMessage(userMessage, workingDir);
        streamService.startKeepalive();
        startSilenceTracking();
      } catch (error) {
        console.warn("WebSocket 失败，使用非流式模式:", error);

        try {
          const { getAgentClient } = await import("@/lib/agent-client");
          const agentClient = getAgentClient();

          const result = await agentClient.sendMessage(
            agentSessionId,
            userMessage,
            {
              workingDir,
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
            onFilesChange?.(result.data.files);
            const { codeUpdated, schemaUpdated } =
              extractCodeAndSchemaUpdates(result.data.files, {
                onCodeUpdate,
                onSchemaUpdate,
              });

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
    [setIsStreaming, setMessages, setStreamContent, setCurrentMessage, stopSilenceTracking],
  );

  return {
    plan,
    setPlan,
    pendingPermissionRequest,
    silenceSeconds,
    handleSend,
    handleCancel,
    handlePermissionResponse,
    handlePermissionCancel,
  };
}
