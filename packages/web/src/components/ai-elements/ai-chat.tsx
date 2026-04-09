"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Conversation,
  ConversationContent,
  Message,
  PromptInput,
  ReasoningDisplay,
  ToolCall,
  type ChatMessage,
  PermissionDialog,
} from "@/components/ai-elements";
import {
  AgentStream,
  type StreamEvent,
} from "@opencode-workbench/agent-client";
import { Bot, Sparkles } from "lucide-react";

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
  onCodeUpdate?: (code: string) => void;
  onSchemaUpdate?: (schema: string) => void;
  onFilesChange?: (
    files: Array<{ path: string; action: "created" | "modified" | "deleted" }>,
  ) => void;
}

export function AIChat({
  sessionId,
  agentSessionId,
  workingDir,
  onCodeUpdate,
  onSchemaUpdate,
  onFilesChange,
}: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const streamRef = useRef<AgentStream | null>(null);

  // 当前正在构建的 Assistant 消息
  const [currentMessage, setCurrentMessage] = useState<ChatMessage>({
    role: "assistant",
    content: "",
    reasoning: undefined,
    reasonings: [],
    tools: [],
  });

  // 待处理的权限请求
  const [pendingPermissionRequest, setPendingPermissionRequest] =
    useState<PermissionRequest | null>(null);

  console.log(
    "[AIChat] Props received - workingDir:",
    workingDir,
    "agentSessionId:",
    agentSessionId,
  );

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
    };
  }, []);

  // 处理发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !agentSessionId) return;

    const userMessage = input.trim();
    setInput("");

    // 添加用户消息
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: userMessage,
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

      console.log("[AIChat] WebSocket URL:", (stream as any).url);

      let accumulatedContent = "";
      let reasoningContent = "";
      let connectionEstablished = false;

      // 重置当前消息状态
      setCurrentMessage({
        role: "assistant",
        content: "",
        reasoning: undefined,
        reasonings: [],
        tools: [],
      });

      // 监听流式文本
      stream.on("stream", (event: StreamEvent) => {
        connectionEstablished = true;
        if (event.content) {
          accumulatedContent += event.content;
          setStreamContent(accumulatedContent);
          setCurrentMessage((prev) => ({
            ...prev,
            content: accumulatedContent,
          }));
        }
      });

      // 监听思考过程 - 支持多次独立思考
      stream.on("thought", (event: StreamEvent) => {
        if (event.content) {
          // 检查是否有新的思考开始（通过事件ID或内容重置）
          setCurrentMessage((prev) => {
            const currentReasonings = prev.reasonings || [];

            // 如果是新的思考片段（通过检查最后一个reasoning是否已经有内容）
            const lastReasoning =
              currentReasonings[currentReasonings.length - 1];

            if (!lastReasoning || lastReasoning.content.length > 500) {
              // 创建新的reasoning条目
              return {
                ...prev,
                reasonings: [
                  ...currentReasonings,
                  {
                    content: event.content!,
                    timestamp: Date.now(),
                  },
                ],
              };
            } else {
              // 追加到最后一个reasoning
              const updatedReasonings = [...currentReasonings];
              updatedReasonings[updatedReasonings.length - 1] = {
                ...lastReasoning,
                content: lastReasoning.content + event.content,
              };
              return {
                ...prev,
                reasonings: updatedReasonings,
              };
            }
          });
        }
      });

      // 监听工具调用开始
      stream.on("tool_call", (event: StreamEvent) => {
        setCurrentMessage((prev) => ({
          ...prev,
          tools: [
            ...(prev.tools || []),
            {
              name: event.title || event.kind || "未知工具",
              status: "running",
              parameters: {
                toolCallId: event.toolCallId,
                kind: event.kind,
                ...(event.title && { title: event.title }),
              },
            },
          ],
        }));
      });

      // 监听工具调用状态更新
      stream.on("tool_call_update", (event: StreamEvent) => {
        setCurrentMessage((prev) => {
          const updatedTools = (prev.tools || []).map((tool, index) => {
            // 通过 toolCallId 匹配
            if (
              event.toolCallId &&
              tool.parameters?.toolCallId === event.toolCallId
            ) {
              const newStatus =
                event.toolCallStatus === "completed"
                  ? "completed"
                  : event.toolCallStatus === "failed"
                    ? "error"
                    : tool.status;

              // 如果失败，尝试从事件中提取错误信息
              let errorResult = event.content || tool.result;
              if (event.toolCallStatus === "failed" && !errorResult) {
                errorResult = {
                  error: "工具执行失败",
                  details: event.error?.message || "未知错误",
                };
              }

              return {
                ...tool,
                status: newStatus,
                result: errorResult,
              };
            }
            // 兜底:匹配最后一个工具
            if (index === prev.tools!.length - 1) {
              const newStatus =
                event.toolCallStatus === "completed"
                  ? "completed"
                  : event.toolCallStatus === "failed"
                    ? "error"
                    : tool.status;

              let errorResult = event.content || tool.result;
              if (event.toolCallStatus === "failed" && !errorResult) {
                errorResult = {
                  error: "工具执行失败",
                  details: event.error?.message || "未知错误",
                };
              }

              return {
                ...tool,
                status: newStatus,
                result: errorResult,
              };
            }
            return tool;
          });
          return { ...prev, tools: updatedTools };
        });
      });

      // 监听权限请求
      stream.on("permission_request", (event: StreamEvent) => {
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

        // 通知父组件
        if (files.length > 0) {
          onFilesChange?.(files);

          // 实时提取代码和 schema 更新
          for (const file of files) {
            if (
              (file.path.includes("index.tsx") ||
                file.path.includes("index.ts")) &&
              file.content
            ) {
              onCodeUpdate?.(file.content);
            } else if (
              file.path.includes("config.schema.json") &&
              file.content
            ) {
              onSchemaUpdate?.(file.content);
            }
          }
        }
      };

      stream.on("file_operation", (event: StreamEvent) => {
        if (event.fileOperation) {
          const { method, path, content } = event.fileOperation;

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

            fileUpdateTimer = setTimeout(() => {
              processRealtimeFiles();
              fileUpdateTimer = null;
            }, 100);
          }
        }
      });

      stream.on("finish", async (event: StreamEvent) => {
        // 完成流式响应,将当前消息添加到消息列表
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            accumulatedContent ||
            event.content ||
            "抱歉，我没有收到有效的回复。",
          reasoning: currentMessage.reasoning,
          reasonings: currentMessage.reasonings,
          tools: currentMessage.tools,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setCurrentMessage({
          role: "assistant",
          content: "",
          reasoning: undefined,
          tools: [],
        });
        setStreamContent("");
        setIsStreaming(false);
        stream.close();
        streamRef.current = null;

        // 清理文件更新定时器
        if (fileUpdateTimer) {
          clearTimeout(fileUpdateTimer);
          fileUpdateTimer = null;
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

        if (finalFiles.length > 0) {
          onFilesChange?.(finalFiles);

          // 从文件变更中提取代码和 schema
          for (const file of finalFiles) {
            if (
              file.path.includes("index.tsx") ||
              file.path.includes("index.ts")
            ) {
              // 文件对象包含 content 属性，可以直接读取
              if ("content" in file && typeof file.content === "string") {
                onCodeUpdate?.(file.content);
              }
            } else if (file.path.includes("config.schema.json")) {
              if ("content" in file && typeof file.content === "string") {
                onSchemaUpdate?.(file.content);
              }
            }
          }
        }

        // 清空实时文件缓存
        realtimeFilesRef.clear();

        // 尝试从内容中提取代码和 schema 更新（作为备选方案）
        try {
          // 提取 index.tsx 代码块
          const codeMatch = accumulatedContent.match(
            /```(?:tsx|tsx?|typescript|javascript)\n([\s\S]*?)```/,
          );
          if (codeMatch && onCodeUpdate) {
            onCodeUpdate(codeMatch[1].trim());
          }

          // 提取 config.schema.json 代码块
          const schemaMatch = accumulatedContent.match(
            /```(?:json:schema|json)\n([\s\S]*?)```/,
          );
          if (schemaMatch && onSchemaUpdate) {
            try {
              const schemaContent = schemaMatch[1].trim();
              // 验证是否为有效的 JSON
              JSON.parse(schemaContent);
              onSchemaUpdate(schemaContent);
            } catch (parseError) {
              console.warn(
                "Failed to parse schema from AI response:",
                parseError,
              );
            }
          }
        } catch {
          // 忽略解析错误
        }
      });

      stream.on("error", (event: StreamEvent) => {
        // 如果连接未建立且发生错误，降级到非流式模式
        if (!connectionEstablished) {
          console.warn("WebSocket 连接失败，降级到非流式模式");
          stream.close();
          streamRef.current = null;
          // 这里不显示错误消息，因为会在 catch 中处理
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

        setMessages((prev) => [...prev, assistantMessage]);

        // 处理文件变更
        if (result.data?.files && result.data.files.length > 0) {
          onFilesChange?.(result.data.files);

          // 从文件变更中提取代码和 schema
          for (const file of result.data.files) {
            if (
              file.path.includes("index.tsx") ||
              file.path.includes("index.ts")
            ) {
              if ("content" in file && typeof file.content === "string") {
                onCodeUpdate?.(file.content);
              }
            } else if (file.path.includes("config.schema.json")) {
              if ("content" in file && typeof file.content === "string") {
                onSchemaUpdate?.(file.content);
              }
            }
          }
        }

        // 尝试从内容中提取代码和 schema 更新（作为备选方案）
        try {
          // 提取 index.tsx 代码块
          const codeMatch = aiReply.match(
            /```(?:tsx|tsx?|typescript|javascript)\n([\s\S]*?)```/,
          );
          if (codeMatch && onCodeUpdate) {
            onCodeUpdate(codeMatch[1].trim());
          }

          // 提取 config.schema.json 代码块
          const schemaMatch = aiReply.match(
            /```(?:json:schema|json)\n([\s\S]*?)```/,
          );
          if (schemaMatch && onSchemaUpdate) {
            try {
              const schemaContent = schemaMatch[1].trim();
              JSON.parse(schemaContent);
              onSchemaUpdate(schemaContent);
            } catch (parseError) {
              console.warn(
                "Failed to parse schema from AI response:",
                parseError,
              );
            }
          }
        } catch {
          // 忽略解析错误
        }
      } catch (httpError) {
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `错误: ${httpError instanceof Error ? httpError.message : "未知错误"}。请确保 Agent Service 已启动（http://localhost:3001）`,
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
    input,
    isStreaming,
    agentSessionId,
    workingDir,
    currentMessage.reasoning,
    currentMessage.reasonings,
    currentMessage.tools,
    onCodeUpdate,
    onSchemaUpdate,
    onFilesChange,
  ]);

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
    if (streamContent) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: streamContent,
        },
      ]);
      setStreamContent("");
    }
  }, [streamContent]);

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

          {messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}

          {/* 流式响应展示 */}
          {isStreaming && currentMessage.content && (
            <Message
              message={{
                id: "streaming",
                role: "assistant",
                content: currentMessage.content,
                reasoning: currentMessage.reasoning,
                tools: currentMessage.tools,
              }}
              isStreaming={true}
            />
          )}

          {/* 加载指示器 - 骨架屏 */}
          {isStreaming && !currentMessage.content && (
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 w-fit max-w-[80%]">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    AI 正在思考...
                  </span>
                </div>
                {/* 骨架屏动画 */}
                <div className="space-y-1.5 pt-2">
                  <div className="h-2 w-48 bg-muted-foreground/20 rounded animate-pulse" />
                  <div
                    className="h-2 w-32 bg-muted-foreground/20 rounded animate-pulse"
                    style={{ animationDelay: "100ms" }}
                  />
                  <div
                    className="h-2 w-40 bg-muted-foreground/20 rounded animate-pulse"
                    style={{ animationDelay: "200ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </ConversationContent>
      </Conversation>

      {/* AI 正在生成状态提示 */}
      {isStreaming && (
        <div className="px-4 py-2 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-t border-primary/20">
          <div className="flex items-center justify-center gap-3">
            <div className="relative">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              <div className="absolute inset-0 blur-sm">
                <Sparkles className="h-4 w-4 text-primary/50" />
              </div>
            </div>
            <span className="text-sm font-medium text-primary">
              AI 正在思考中
            </span>
            <div className="flex gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        onCancel={handleCancel}
        placeholder="输入指令，按 Enter 发送..."
        loading={isStreaming}
        className="flex-shrink-0"
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
