"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  Message,
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputAddImage,
  PromptInputModelSelect,
  PromptInputHeader,
  usePromptInputAttachments,
  AssistantMessage,
  PermissionDialog,
  type ChatMessage,
  type PromptInputMessage,
} from "@/components/ai-elements";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { HistoryDialog } from "@/components/ai-elements/history-dialog";
import {
  AgentStream,
  type StreamEvent,
} from "@opencode-workbench/agent-client";
import { Bot, Sparkles, History } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";
import {
  applyModelConfigs,
  UNCONFIGURED_DEFAULT,
  type ResolvedModel,
} from "@/lib/ai-models";
import type { MessagePart } from "@/components/ai-elements";

const PromptInputAttachmentsDisplay = () => {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <Attachment
          data={attachment}
          key={attachment.id}
          onRemove={() => attachments.remove(attachment.id)}
        >
          <AttachmentPreview />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
};

interface PermissionRequest {
  sessionId: string;
  options: Array<{
    optionId: string;
    name: string;
  }>;
  toolCall: {
    toolCallId: string;
    title?: string;
    kind?: string;
  };
}

interface AIChatProps {
  sessionId: string;
  agentSessionId: string;
  workingDir?: string;
  projectId?: string;
  workspaceId?: string;
  onCodeUpdate?: (code: string) => void;
  onSchemaUpdate?: (schema: string) => void;
  onFilesChange?: (
    files: Array<{ path: string; action: "created" | "modified" | "deleted" }>,
  ) => void;
  externalMessages?: ChatMessage[];
  externalIsStreaming?: boolean;
  externalStreamContent?: string;
  externalCurrentMessage?: ChatMessage;
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onIsStreamingChange?: (isStreaming: boolean) => void;
  onStreamContentChange?: (content: string) => void;
  onCurrentMessageChange?: (message: ChatMessage) => void;
  onNewSession?: (workspaceId?: string) => void;
  onSelectSession?: (sessionId: string, workspaceId?: string) => void;
  currentSessionId?: string;
}

const DEFAULT_CURRENT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "",
  parts: [],
};

export function AIChat({
  sessionId,
  agentSessionId,
  workingDir,
  projectId,
  workspaceId,
  onCodeUpdate,
  onSchemaUpdate,
  onFilesChange,
  externalMessages,
  externalIsStreaming,
  externalStreamContent,
  externalCurrentMessage,
  onMessagesChange,
  onIsStreamingChange,
  onStreamContentChange,
  onCurrentMessageChange,
  onNewSession,
  onSelectSession,
  currentSessionId,
}: AIChatProps) {
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const { toast } = useToast();

  // 1. Messages 状态处理
  const isControlled = externalMessages !== undefined;
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const messages = isControlled ? externalMessages : internalMessages;

  // 使用 ref 同步追踪最新 messages，防止并发覆盖
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      if (isControlled) {
        const prev = messagesRef.current || [];
        const newMessages =
          typeof updater === "function" ? updater(prev) : updater;
        messagesRef.current = newMessages; // 关键：立刻同步更新 ref
        onMessagesChange?.(newMessages);
      } else {
        setInternalMessages((prev) => {
          const newMessages =
            typeof updater === "function" ? updater(prev) : updater;
          messagesRef.current = newMessages;
          return newMessages;
        });
      }
    },
    [isControlled, onMessagesChange],
  );

  // 2. isStreaming 状态处理
  const isStreamingControlled = externalIsStreaming !== undefined;
  const [internalIsStreaming, setInternalIsStreaming] = useState(false);
  const isStreaming = isStreamingControlled
    ? externalIsStreaming
    : internalIsStreaming;
  const setIsStreaming = isStreamingControlled
    ? onIsStreamingChange!
    : setInternalIsStreaming;

  // 3. streamContent 状态处理
  const streamContentControlled = externalStreamContent !== undefined;
  const [internalStreamContent, setInternalStreamContent] = useState("");
  const streamContent = streamContentControlled
    ? externalStreamContent
    : internalStreamContent;
  const setStreamContent = streamContentControlled
    ? onStreamContentChange!
    : setInternalStreamContent;

  // 4. currentMessage 状态处理 (修复核心)
  const currentMessageControlled = externalCurrentMessage !== undefined;
  const [internalCurrentMessage, setInternalCurrentMessage] =
    useState<ChatMessage>(DEFAULT_CURRENT_MESSAGE);
  const currentMessage = currentMessageControlled
    ? externalCurrentMessage
    : internalCurrentMessage;

  // 使用 ref 追踪绝对最新值，解决 WebSocket 密集事件下的状态跳闪问题
  const currentMessageRef = useRef(currentMessage);
  useEffect(() => {
    currentMessageRef.current = currentMessage;
  }, [currentMessage]);

  const setCurrentMessage = useCallback(
    (updater: ChatMessage | ((prev: ChatMessage) => ChatMessage)) => {
      if (currentMessageControlled) {
        // 永远从 ref 拿最底层的新数据，而不是从可能会滞后的 prop 拿
        const prev = currentMessageRef.current || DEFAULT_CURRENT_MESSAGE;
        const newMessage =
          typeof updater === "function" ? updater(prev) : updater;

        currentMessageRef.current = newMessage; // 关键：立刻同步更新 ref，供下一次毫秒级调用读取
        onCurrentMessageChange?.(newMessage);
      } else {
        setInternalCurrentMessage((prev) => {
          const newMessage =
            typeof updater === "function" ? updater(prev) : updater;
          currentMessageRef.current = newMessage;
          return newMessage;
        });
      }
    },
    [currentMessageControlled, onCurrentMessageChange],
  );

  const streamRef = useRef<AgentStream | null>(null);
  const streamSessionIdRef = useRef<string>("");
  const modelStreamRef = useRef<AgentStream | null>(null);

  // 待处理的权限请求
  const [pendingPermissionRequest, setPendingPermissionRequest] =
    useState<PermissionRequest | null>(null);

  // Plan 状态
  const [plan, setPlan] = useState<string>("");

  // 模型状态
  const [modelState, setModelState] = useState<{
    currentModelId: string;
    models: ResolvedModel[];
    canSwitch: boolean;
    isLoading: boolean;
  }>({
    currentModelId: "",
    models: [],
    canSwitch: false,
    isLoading: true,
  });

  // console.log(
  //   "[AIChat] Props received - workingDir:",
  //   workingDir,
  //   "agentSessionId:",
  //   agentSessionId,
  // );

  // 自动滚动到底部
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  // 清理流
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.close();
      }
      if (modelStreamRef.current) {
        modelStreamRef.current.close();
      }
    };
  }, []);

  // 会话切换时关闭旧流，防止旧流事件污染新会话状态
  useEffect(() => {
    if (streamRef.current && streamSessionIdRef.current && streamSessionIdRef.current !== sessionId) {
      console.log(
        "[AIChat] Session changed from",
        streamSessionIdRef.current,
        "to",
        sessionId,
        "- closing old stream",
      );
      streamRef.current.close();
      streamRef.current = null;
      streamSessionIdRef.current = "";
      setIsStreaming(false);
      setStreamContent("");
      setCurrentMessage({
        role: "assistant",
        content: "",
        parts: [],
      });
      // 会话切换时重置模型状态
      setModelState({
        currentModelId: "",
        models: [],
        canSwitch: false,
        isLoading: true,
      });
    }
  }, [sessionId, setIsStreaming, setStreamContent, setCurrentMessage]);

  // agentSessionId 变化时建立持久连接，提前获取模型列表
  useEffect(() => {
    if (!agentSessionId) return;

    const setupModelStream = async () => {
      const { getAgentClient } = await import("@/lib/agent-client");
      const agentClient = getAgentClient();
      const stream = agentClient.stream(agentSessionId);
      modelStreamRef.current = stream;

      let connected = false;
      stream.on("status", (event: StreamEvent) => {
        if (event.status === "connected" && !connected) {
          connected = true;
          const ws = (stream as any).ws;
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "get_models" }));
          }
        }
      });

      stream.on("models", (event: StreamEvent) => {
        setModelState((prev) => ({
          currentModelId: event.currentModelId || prev.currentModelId,
          models: event.models ? applyModelConfigs(event.models) : prev.models,
          canSwitch: event.canSwitch ?? prev.canSwitch,
          isLoading: false,
        }));
      });

      stream.on("error", (event: StreamEvent) => {
        const isModelError =
          event.error?.code === "SESSION_NOT_FOUND" ||
          event.error?.code === "GET_MODELS_ERROR";
        if (isModelError) {
          console.warn("[AIChat] Model info error:", event.error?.message);
          setModelState((prev) => ({ ...prev, isLoading: false }));
        }
      });
    };

    setupModelStream();

    return () => {
      if (modelStreamRef.current) {
        modelStreamRef.current.close();
        modelStreamRef.current = null;
      }
    };
  }, [agentSessionId]);

  // 处理发送消息
  const handleSend = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isStreaming || !agentSessionId) return;

    // 添加用户消息
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: userMessage.trim(),
      },
    ]);

    // 创建流式连接
    try {
      setIsStreaming(true);
      setStreamContent("");

      const { getAgentClient } = await import("@/lib/agent-client");
      const agentClient = getAgentClient();

      console.log(
        "[AIChat] Creating WebSocket stream for session:",
        agentSessionId,
      );

      // 每次发送消息时创建新的流连接
      const stream = agentClient.stream(agentSessionId);
      streamRef.current = stream;
      streamSessionIdRef.current = sessionId;

      const streamId = sessionId;

      console.log("[AIChat] WebSocket URL:", (stream as any).url);

      let accumulatedContent = "";
      let reasoningContent = "";
      let connectionEstablished = false;

      // 重置 Plan
      setPlan("");

      // 重置当前消息状态
      setCurrentMessage({
        role: "assistant",
        content: "",
        parts: [],
      });

      // 监听流式文本 - 追加到 parts 数组的最后一个 TextPart
      stream.on("stream", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        connectionEstablished = true;
        if (event.content) {
          accumulatedContent += event.content;
          setStreamContent(accumulatedContent);

          setCurrentMessage((prev) => {
            const parts = prev.parts || [];
            const lastPart = parts[parts.length - 1];

            // 如果最后一个 part 是 text，追加内容
            if (lastPart && lastPart.type === "text") {
              return {
                ...prev,
                content: accumulatedContent,
                parts: [
                  ...parts.slice(0, -1),
                  { ...lastPart, content: lastPart.content + event.content! },
                ],
              };
            }

            // 否则创建新的 TextPart
            return {
              ...prev,
              content: accumulatedContent,
              parts: [...parts, { type: "text", content: event.content! }],
            };
          });
        }
      });

      // 监听思考过程 - 追加到 parts 数组
      stream.on("thought", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        if (event.content) {
          setCurrentMessage((prev) => {
            const parts = prev.parts || [];
            const lastPart = parts[parts.length - 1];

            // 如果最后一个 part 是 reasoning 且内容不太长，追加
            if (
              lastPart &&
              lastPart.type === "reasoning" &&
              lastPart.content.length < 500
            ) {
              return {
                ...prev,
                parts: [
                  ...parts.slice(0, -1),
                  {
                    ...lastPart,
                    content: lastPart.content + event.content!,
                  },
                ],
              };
            }

            // 否则创建新的 ReasoningPart
            return {
              ...prev,
              parts: [
                ...parts,
                {
                  type: "reasoning",
                  content: event.content!,
                  timestamp: Date.now(),
                },
              ],
            };
          });
        }
      });

      // 监听 Plan 更新
      stream.on("plan", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        if (event.content) {
          setPlan((prev) => prev + event.content);
        }
      });

      // 监听模型列表更新
      stream.on("models", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        setModelState((prev) => ({
          currentModelId: event.currentModelId || prev.currentModelId,
          models: event.models ? applyModelConfigs(event.models) : prev.models,
          canSwitch: event.canSwitch ?? prev.canSwitch,
          isLoading: false,
        }));
      });

      // 监听工具调用开始 - 添加新的 ToolCallPart
      stream.on("tool_call", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        const eventAny = event as any;

        // 打印完整事件以便调试
        console.log("[AIChat] Tool Call Event:", event);

        // 从 ACP 协议中提取工具信息
        // 优先使用 name 字段，其次从 title 中提取
        let toolName = "未知工具";
        if (eventAny.name) {
          toolName = eventAny.name;
        } else if (eventAny.toolName) {
          toolName = eventAny.toolName;
        } else if (event.title) {
          // 从 title 中提取工具名（格式: "fs/read_text_file › path/to/file"）
          toolName = event.title.includes("›")
            ? event.title.split("›")[0].trim()
            : event.title;
        }

        // 提取参数
        const parameters = eventAny.arguments || eventAny.parameters || {};

        // 从 title 中提取路径
        let extractedPath: string | undefined;
        if (event.title && event.title.includes("›")) {
          extractedPath = event.title.split("›").pop()?.trim();
        }

        // 合并参数中的路径
        const finalParameters = {
          ...parameters,
          path: extractedPath || parameters.path || parameters.file_path,
        };

        // 使用后端发送的状态，如果没有则默认为 running
        const toolStatus = event.toolCallStatus || "running";
        console.log(
          "[AIChat] Tool status from backend:",
          event.toolCallStatus,
          "-> using:",
          toolStatus,
        );

        setCurrentMessage((prev) => {
          const parts = prev.parts || [];
          const toolCallId = event.toolCallId || `tool-${Date.now()}`;

          return {
            ...prev,
            parts: [
              ...parts,
              {
                type: "tool",
                toolCallId,
                toolName,
                status: toolStatus as "running" | "completed" | "error",
                parameters: finalParameters,
              },
            ],
          };
        });
      });

      // 监听工具调用状态更新 - 根据 toolCallId 更新对应的 ToolCallPart
      stream.on("tool_call_update", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        console.log("[AIChat] Tool Call Update Event:", event);

        setCurrentMessage((prev) => {
          const parts = prev.parts || [];
          const toolCallId = event.toolCallId;

          if (!toolCallId) {
            console.warn("[AIChat] tool_call_update 缺少 toolCallId");
            return prev;
          }

          // 查找并更新对应的工具 part
          const updatedParts = parts.map((part) => {
            if (part.type === "tool" && part.toolCallId === toolCallId) {
              console.log(
                "[AIChat] Found matching tool part:",
                toolCallId,
                "current status:",
                part.status,
                "-> new status:",
                event.toolCallStatus,
              );

              const newStatus =
                event.toolCallStatus === "completed"
                  ? "completed"
                  : event.toolCallStatus === "failed"
                    ? "error"
                    : event.toolCallStatus === "in_progress"
                      ? "running"
                      : part.status;

              // 提取结果
              let result = part.result;
              if (event.content) {
                try {
                  // 尝试解析 JSON 结果
                  result = JSON.parse(event.content);
                } catch {
                  result = event.content;
                }
              }

              // 如果失败，提取错误信息
              if (event.toolCallStatus === "failed" && !result) {
                result = {
                  error: "工具执行失败",
                  details: event.error?.message || "未知错误",
                };
              }

              console.log("[AIChat] Updated tool part status to:", newStatus);

              return {
                ...part,
                status: newStatus,
                result,
              };
            }
            return part;
          });

          return { ...prev, parts: updatedParts };
        });
      });

      // 监听权限请求
      stream.on("permission_request", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        if (event.permissionRequest) {
          setPendingPermissionRequest(
            event.permissionRequest as PermissionRequest,
          );
        }
      });

      // 监听文件操作（实时文件变更追踪）
      const realtimeFilesRef = new Map<
        string,
        { action: string; content?: string }
      >();
      let fileUpdateTimer: NodeJS.Timeout | null = null;

      // 处理实时文件变更的辅助函数
      const processRealtimeFiles = () => {
        const files = Array.from(realtimeFilesRef.entries()).map(
          ([path, info]) => ({
            path,
            action: info.action as "created" | "modified" | "deleted",
            content: info.content,
          }),
        );

        console.log(
          "[AIChat] processRealtimeFiles called with:",
          files.map((f) => ({ path: f.path, hasContent: !!f.content })),
        );

        // 通知父组件
        if (files.length > 0) {
          onFilesChange?.(files);
          console.log("[AIChat] onFilesChange callback invoked");

          // 实时提取代码和 schema 更新
          for (const file of files) {
            // 优化：使用精确路径匹配，避免误匹配（如 index.tsx.bak）
            const normalizedPath = file.path.replace(/\\/g, "/");
            const isCodeFile =
              normalizedPath.endsWith("index.tsx") ||
              normalizedPath.endsWith("index.ts") ||
              normalizedPath.endsWith("Demo.tsx") ||
              normalizedPath.endsWith("Demo.ts");

            if (isCodeFile && file.content) {
              console.log(
                "[AIChat] Code update detected:",
                file.path,
                "content length:",
                file.content.length,
              );
              onCodeUpdate?.(file.content);
            } else if (
              normalizedPath.endsWith("config.schema.json") &&
              file.content
            ) {
              console.log(
                "[AIChat] Schema update detected:",
                file.path,
                "content length:",
                file.content.length,
              );
              onSchemaUpdate?.(file.content);
            }
          }
        }
      };

      stream.on("file_operation", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        console.log("[AIChat] file_operation event received:", event);
        if (event.fileOperation) {
          const { method, path, content } = event.fileOperation;
          console.log("[AIChat] file_operation details:", {
            method,
            path,
            contentLength: content?.length,
          });

          // 仅处理文件写入操作
          if (method === "fs/write_text_file" && path) {
            // 更新累计文件变更（去重）
            realtimeFilesRef.set(path, {
              action: "modified",
              content,
            });

            // 防抖：100ms 后批量通知
            if (fileUpdateTimer) {
              clearTimeout(fileUpdateTimer);
            }

            // 优化：防抖时间从 100ms 增加到 300ms，避免批量更新被拆分
            fileUpdateTimer = setTimeout(() => {
              console.log(
                "[AIChat] Debounce timer triggered, processing files:",
                Array.from(realtimeFilesRef.keys()),
              );
              processRealtimeFiles();
              fileUpdateTimer = null;
            }, 300);
          }
        }
      });

      stream.on("finish", async (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) {
          console.log("[AIChat] Ignoring finish event from stale stream");
          stream.close();
          return;
        }
        // 完成流式响应,将当前消息添加到消息列表
        const currentMsg = currentMessageRef.current;
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            accumulatedContent ||
            event.content ||
            "抱歉，我没有收到有效的回复。",
          parts: currentMsg.parts,
        };

        const updatedMessages = [...messagesRef.current, assistantMessage];
        setMessages(updatedMessages);
        // 重置 currentMessage，避免思维链重复显示
        setCurrentMessage({
          role: "assistant",
          content: "",
          parts: [],
        });
        setStreamContent("");
        setIsStreaming(false);
        stream.close();
        streamRef.current = null;

        // 持久化消息历史到文件系统
        try {
          const now = Date.now();
          const messagesToSave = updatedMessages.map((m, i) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: now - (updatedMessages.length - i) * 1000,
          }));
          await fetch(`/api/sessions/${sessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: messagesToSave }),
          });
        } catch (e) {
          console.warn("[AIChat] Failed to persist messages:", e);
        }

        // 首条消息时更新会话标题
        if (messagesRef.current.length === 0 && userMessage.trim()) {
          try {
            const title = userMessage.trim().slice(0, 50) + (userMessage.trim().length > 50 ? "..." : "");
            await fetch(`/api/sessions/${sessionId}/meta`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title }),
            });
          } catch (e) {
            console.warn("[AIChat] Failed to update session title:", e);
          }
        }

        // 清理文件更新定时器：先处理待处理的文件变更，再清除
        if (fileUpdateTimer) {
          clearTimeout(fileUpdateTimer);
          fileUpdateTimer = null;
          processRealtimeFiles();
        }

        // 处理文件变更（优先使用 event.files，兜底使用 realtimeFiles）
        const finalFiles =
          event.files && event.files.length > 0
            ? event.files
            : Array.from(realtimeFilesRef.entries()).map(([path, info]) => ({
                path,
                action: info.action as "created" | "modified" | "deleted",
                content: info.content,
              }));

        console.log(
          "[AIChat] finish event - finalFiles:",
          finalFiles.map((f) => ({ path: f.path, hasContent: !!f.content })),
        );

        let codeFileUpdatedWithContent = false;
        let schemaFileUpdatedWithContent = false;

        if (finalFiles.length > 0) {
          onFilesChange?.(finalFiles);

          for (const file of finalFiles) {
            const normalizedPath = file.path.replace(/\\/g, "/");
            const isCodeFile =
              normalizedPath.endsWith("index.tsx") ||
              normalizedPath.endsWith("index.ts") ||
              normalizedPath.endsWith("Demo.tsx") ||
              normalizedPath.endsWith("Demo.ts");

            if (isCodeFile) {
              if ("content" in file && typeof file.content === "string" && file.content.length > 0) {
                console.log("[AIChat] Finish - code update:", file.path);
                codeFileUpdatedWithContent = true;
                onCodeUpdate?.(file.content);
              } else {
                console.warn("[AIChat] Finish - code file found but content is missing:", file.path);
              }
            } else if (normalizedPath.endsWith("config.schema.json")) {
              if ("content" in file && typeof file.content === "string") {
                console.log("[AIChat] Finish - schema update:", file.path);
                schemaFileUpdatedWithContent = true;
                onSchemaUpdate?.(file.content);
              }
            }
          }
        }

        if (!codeFileUpdatedWithContent || !schemaFileUpdatedWithContent) {
          console.log(
            "[AIChat] Code or schema not updated via file_operation events, fetching via HTTP API. codeUpdated:",
            codeFileUpdatedWithContent,
            "schemaUpdated:",
            schemaFileUpdatedWithContent,
          );
          try {
            const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
            if (filesRes.ok) {
              const filesData = await filesRes.json();
              if (filesData.success && filesData.data) {
                const { code, schema } = filesData.data;

                if (code && !codeFileUpdatedWithContent) {
                  console.log("[AIChat] Applying code update from HTTP API, length:", code.length);
                  onCodeUpdate?.(code);
                }
                if (schema && !schemaFileUpdatedWithContent) {
                  console.log("[AIChat] Applying schema update from HTTP API, length:", schema.length);
                  onSchemaUpdate?.(schema);
                }

                if (!codeFileUpdatedWithContent || !schemaFileUpdatedWithContent) {
                  const fetchedFiles = [];
                  if (!codeFileUpdatedWithContent) {
                    fetchedFiles.push({ path: "index.tsx", action: "modified" as const, content: code });
                  }
                  if (!schemaFileUpdatedWithContent) {
                    fetchedFiles.push({ path: "config.schema.json", action: "modified" as const, content: schema });
                  }
                  if (fetchedFiles.length > 0) {
                    onFilesChange?.(fetchedFiles);
                  }
                }
              }
            }
          } catch (error) {
            console.error("[AIChat] Error fetching files via HTTP:", error);
          }
        }

        // 清空实时文件缓存
        realtimeFilesRef.clear();
      });

      stream.on("error", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        // 如果连接未建立且发生错误，降级到非流式模式
        if (!connectionEstablished) {
          console.warn("WebSocket 连接失败，降级到非流式模式");
          stream.close();
          streamRef.current = null;
          // 这里不显示错误消息，因为会在 catch 中处理
          return;
        }

        // 过滤模型列表获取的内部错误，不显示给用户
        const isModelError =
          event.error?.code === "SESSION_NOT_FOUND" ||
          event.error?.code === "GET_MODELS_ERROR";
        if (isModelError) {
          console.warn("[AIChat] Model info error:", event.error?.message);
          setModelState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `错误: ${event.error?.message || "WebSocket 连接失败，请检查 Agent Service 是否运行"}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
        setStreamContent("");
        setIsStreaming(false);
        if (streamRef.current) {
          streamRef.current.close();
          streamRef.current = null;
        }
      });

      // 等待 WebSocket 连接建立（最多等待 3 秒）
      const connectionTimeout = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("WebSocket 连接超时"));
        }, 3000);

        const checkConnection = () => {
          const ws = (stream as any).ws;
          if (ws?.readyState === WebSocket.OPEN) {
            clearTimeout(timeout);
            stream.off("status", onStatus);
            connectionEstablished = true;
            resolve();
          }
        };

        const onStatus = (event: StreamEvent) => {
          if (event.status === "connected") {
            checkConnection();
          }
        };

        stream.on("status", onStatus);

        // 立即检查
        setTimeout(checkConnection, 50);
      });

      await connectionTimeout;

      // 发送消息
      console.log("[AIChat] Sending message with workingDir:", workingDir);
      stream.send(userMessage, `msg-${Date.now()}`, {
        timeout: 120000,
        stream: true,
        workingDir,
      });
    } catch (error) {
      // WebSocket 失败，降级到非流式 HTTP
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
              timeout: 120000,
              stream: false,
            },
          },
        );

        if (!result.success) {
          throw new Error(result.error?.message || "Agent 请求失败");
        }

        const aiReply = result.data?.content || "抱歉，我没有收到有效的回复。";

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: aiReply,
        };

        const httpUpdatedMessages = [...messagesRef.current, assistantMessage];
        setMessages(httpUpdatedMessages);

        // 持久化消息历史到文件系统（非流式降级路径）
        try {
          const httpNow = Date.now();
          const messagesToSave = httpUpdatedMessages.map((m, i) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: httpNow - (httpUpdatedMessages.length - i) * 1000,
          }));
          await fetch(`/api/sessions/${sessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: messagesToSave }),
          });
        } catch (e) {
          console.warn("[AIChat] Failed to persist messages (HTTP):", e);
        }

        // 处理文件变更
        if (result.data?.files && result.data.files.length > 0) {
          onFilesChange?.(result.data.files);

          // 从文件变更中提取代码和 schema 更新
          for (const file of result.data.files) {
            // 优化：使用精确路径匹配
            const normalizedPath = file.path.replace(/\\/g, "/");
            const isCodeFile =
              normalizedPath.endsWith("index.tsx") ||
              normalizedPath.endsWith("index.ts") ||
              normalizedPath.endsWith("Demo.tsx") ||
              normalizedPath.endsWith("Demo.ts");

            if (isCodeFile) {
              if ("content" in file && typeof file.content === "string") {
                console.log("[AIChat] HTTP - code update:", file.path);
                onCodeUpdate?.(file.content);
              }
            } else if (normalizedPath.endsWith("config.schema.json")) {
              if ("content" in file && typeof file.content === "string") {
                console.log("[AIChat] HTTP - schema update:", file.path);
                onSchemaUpdate?.(file.content);
              }
            }
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
        if (streamRef.current) {
          streamRef.current.close();
          streamRef.current = null;
        }
      }
    }
  }, [
    isStreaming,
    agentSessionId,
    sessionId,
    workingDir,
    onCodeUpdate,
    onSchemaUpdate,
    onFilesChange,
    setMessages,
    setIsStreaming,
    setStreamContent,
    setCurrentMessage,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // 处理 PromptInput 提交
  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const hasText = Boolean(message.text);
      const hasAttachments = Boolean(message.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }

      handleSend(message.text || "处理附件文件");
    },
    [handleSend],
  );

  // 处理权限响应
  const handlePermissionResponse = useCallback(
    (optionId: string) => {
      // 通过 WebSocket 发送权限响应
      const ws = (streamRef.current as any)?.ws;
      if (ws && ws.readyState === WebSocket.OPEN && pendingPermissionRequest) {
        ws.send(
          JSON.stringify({
            type: "permission_response",
            permissionId: pendingPermissionRequest.toolCall.toolCallId,
            optionId,
          }),
        );
      }
      setPendingPermissionRequest(null);
    },
    [pendingPermissionRequest],
  );

  // 取消权限请求
  const handlePermissionCancel = useCallback(() => {
    // 发送拒绝响应
    handlePermissionResponse("reject_once");
  }, [handlePermissionResponse]);

  // 取消流式响应
  const handleCancel = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
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
    // 重置 currentMessage，避免思维链重复显示
    setCurrentMessage({
      role: "assistant",
      content: "",
      parts: [],
    });
  }, [streamContent, currentMessage.parts]);

  // 当前模型是否支持图片输入(用于条件渲染图片按钮)
  const currentSupportsImages =
    modelState.models.find((m) => m.id === modelState.currentModelId)
      ?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages;

  // 切换模型
  const handleModelChange = useCallback(
    (modelId: string) => {
      if (modelId === modelState.currentModelId) return;

      setModelState((prev) => ({ ...prev, isLoading: true }));

      const ws = (modelStreamRef.current as any)?.ws;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "set_model", modelId }));
      }
    },
    [modelState.currentModelId],
  );

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Bot className="h-12 w-12 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium">AI 助手</p>
                <p className="text-sm text-muted-foreground">
                  输入自然语言指令，AI 将帮您修改代码
                </p>
              </div>
              <div className="pt-4 space-y-2 text-left max-w-sm">
                <p className="text-xs text-muted-foreground">示例指令：</p>
                <div className="space-y-1">
                  <p className="text-xs bg-muted px-2 py-1 rounded">
                    &quot;把标题改成轮播图&quot;
                  </p>
                  <p className="text-xs bg-muted px-2 py-1 rounded">
                    &quot;添加一个按钮组件&quot;
                  </p>
                  <p className="text-xs bg-muted px-2 py-1 rounded">
                    &quot;修改配色方案为蓝色&quot;
                  </p>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            // 用户消息使用原有样式
            if (msg.role === "user") {
              return <Message key={msg.id} message={msg} />;
            }
            // Assistant 消息使用统一卡片，传递 parts 属性
            return (
              <AssistantMessage
                key={msg.id}
                content={msg.content}
                reasonings={msg.reasonings}
                tools={msg.tools}
                parts={msg.parts}
              />
            );
          })}

          {/* 当前 AI 响应消息（流式/加载/完成中） */}
          {isStreaming && (
            <AssistantMessage
              content={currentMessage.content || undefined}
              reasonings={currentMessage.reasonings}
              tools={currentMessage.tools}
              parts={currentMessage.parts}
              isStreaming={true}
            />
          )}

          <div ref={messagesEndRef} />
        </ConversationContent>
      </Conversation>

      {/* Plan 展示 - 输入框顶部 */}
      {plan && (
        <div className="flex-shrink-0 border-t border-border/40">
          <details className="group">
            <summary className="flex items-center justify-between px-4 py-1.5 text-[11px] text-muted-foreground/60 cursor-pointer hover:bg-muted/30 transition-colors list-none select-none">
              <div className="flex items-center gap-1.5">
                <svg
                  className="h-3 w-3 transition-transform group-open:rotate-90 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <span className="truncate">Plan</span>
              </div>
              <span className="text-[10px] text-muted-foreground/40 flex-shrink-0">
                {isStreaming ? "生成中..." : "已完成"}
              </span>
            </summary>
            <div className="px-4 py-2 border-t border-border/20 text-[11px] text-muted-foreground/60">
              <div className="whitespace-pre-wrap break-words">{plan}</div>
            </div>
          </details>
        </div>
      )}

      {/* 输入区域 */}
      <PromptInput
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        status={isStreaming ? "streaming" : "idle"}
        className="flex-shrink-0"
        globalDrop
        multiple
      >
        <PromptInputHeader>
          <PromptInputAttachmentsDisplay />
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea placeholder="输入指令，按 Enter 发送..." />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {currentSupportsImages && <PromptInputAddImage />}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", isStreaming && "opacity-40 cursor-not-allowed")}
              disabled={isStreaming}
              onClick={() => {
                if (isStreaming) {
                  toast({ title: "AI 输出中，无法切换对话" });
                  return;
                }
                setHistoryDialogOpen(true);
              }}
            >
              <History className="h-4 w-4" />
            </Button>
            <PromptInputModelSelect
              currentModelId={modelState.currentModelId}
              models={modelState.models}
              canSwitch={modelState.canSwitch}
              onModelChange={handleModelChange}
              isLoading={modelState.isLoading}
            />
          </PromptInputTools>
          <PromptInputSubmit />
        </PromptInputFooter>
      </PromptInput>

      {/* 历史记录对话框 */}
      <HistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        projectId={projectId || sessionId}
        workspaceId={workspaceId}
        currentSessionId={currentSessionId}
        onSelectSession={onSelectSession || (() => {})}
        onNewSession={onNewSession || (() => {})}
      />

      {/* 权限请求对话框 */}
      {pendingPermissionRequest && (
        <PermissionDialog
          request={pendingPermissionRequest}
          onRespond={handlePermissionResponse}
          onCancel={handlePermissionCancel}
        />
      )}
    </div>
  );
}
