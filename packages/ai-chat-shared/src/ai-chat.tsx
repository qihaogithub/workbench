"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Conversation, ConversationContent } from "./conversation";
import { PermissionDialog } from "./permission-dialog";
import type { ChatMessage } from "./message";
import { HistoryDialog } from "./history-dialog";
import { useToast } from "./ui/toast-provider";
import { Button } from "./ui/button";
import { useChatMessages } from "./chat/hooks/use-chat-messages";
import { useChatStream } from "./chat/hooks/use-chat-stream";
import { useChatModels } from "./chat/hooks/use-chat-models";
import { buildFullModelId } from "./lib/ai-models";
import { ChatMessages } from "./chat/chat-messages";
import { ChatPlan } from "./chat/chat-plan";
import { ChatInput } from "./chat/chat-input";
import type { PermissionRequest } from "./chat/services/stream-service";
import type { StreamService } from "./chat/services/stream-service";
import type { ActiveViewContext } from "./lib/active-view-context";
import type { AgentMode, ViewerContext } from "@workbench/agent-client";
import { X, FileText, ArrowDown } from "lucide-react";

export interface AutoRepairTrigger {
  kind: "auto_repair";
  visibleTitle: string;
  visibleSummary: string;
  hiddenPrompt: string;
  debugDetail?: string;
}

export interface VisualPropertyAutoSend {
  kind: "visual_property";
  visibleTitle: string;
  visibleSummary: string;
  hiddenPrompt: string;
}

export type TriggerAutoSend = string | AutoRepairTrigger | VisualPropertyAutoSend;

function QueuedMessagesTray({
  messages,
  onCancelQueuedMessage,
}: {
  messages: ChatMessage[];
  onCancelQueuedMessage: (queueId: string) => void;
}) {
  if (messages.length === 0) return null;

  return (
    <div
      data-testid="queued-messages-tray"
      className="flex max-h-48 flex-col items-end gap-2 overflow-y-auto px-4 pb-2"
    >
      {messages.map((message) => {
        const imageCount =
          message.parts?.filter((part) => part.type === "image").length ?? 0;
        const fileCount =
          message.parts?.filter((part) => part.type === "file").length ?? 0;

        return (
          <div
            key={message.id || message.queueId}
            className="w-fit max-w-[min(82%,34rem)] rounded-lg border border-border/60 bg-muted px-3 py-2.5 text-sm text-foreground shadow-sm"
          >
            <div className="max-w-full truncate font-medium leading-5">
              {message.content ||
                (fileCount > 0
                  ? "读取附件文件"
                  : imageCount > 0
                    ? "处理附件图片"
                    : "待发送消息")}
            </div>
            {(imageCount > 0 || fileCount > 0) && (
              <div className="mt-1 text-xs text-muted-foreground">
                {[
                  imageCount > 0 ? `${imageCount} 张图片` : "",
                  fileCount > 0 ? `${fileCount} 个文件` : "",
                ].filter(Boolean).join("，")}
              </div>
            )}
            <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>等待发送</span>
              {message.queueId && (
                <button
                  type="button"
                  onClick={() => onCancelQueuedMessage(message.queueId!)}
                  className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3 w-3" />
                  取消
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface AIChatProps {
  sessionId: string;
  agentSessionId: string;
  /**
   * 行为模式，默认 "workbench"。
   * viewer-readonly：只读工具集、系统提示词与上下文由 agent-service 服务端注入，
   * 输入框仅支持图片附件，消息不做会话持久化。
   */
  mode?: AgentMode;
  /** viewer-readonly 模式下随消息上报的浏览端上下文（当前页面/配置值） */
  viewerContext?: ViewerContext;
  workingDir?: string;
  projectId?: string;
  demoId?: string;
  activeViewContext?: ActiveViewContext;
  workspaceId?: string;
  onCodeUpdate?: (code: string, source?: "ai-realtime" | "ai-finish") => void;
  onSchemaUpdate?: (schema: string, source?: "ai-realtime" | "ai-finish") => void;
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
  triggerAutoSend?: TriggerAutoSend | null;
  onTriggerAutoSendHandled?: () => void;
  /** 错误提示横幅，渲染在输入框上方 */
  errorBanner?: React.ReactNode;
  /** AI 更新了 .md 记忆文件时的回调，用于打开编辑器查看 */
  onMemoryUpdate?: (filePath: string) => void;
  /** 编辑页诊断事件回调，不参与 Agent 协议 */
  onDiagnosticEvent?: (event: {
    name: string;
    traceId?: string;
    level?: "info" | "warn" | "error";
    details?: Record<string, unknown>;
  }) => void;
  beforeSend?: () => Promise<void> | void;
  /** 外部 StreamService 引用，用于控制台数据转发等场景 */
  externalStreamServiceRef?: React.MutableRefObject<StreamService | null>;
  /** 由宿主接管历史入口；viewer-site 使用项目级本地历史。 */
  onHistoryOpen?: () => void;
}

export function AIChat({
  sessionId,
  agentSessionId,
  mode = "workbench",
  viewerContext,
  workingDir,
  projectId,
  demoId,
  activeViewContext,
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
  triggerAutoSend,
  onTriggerAutoSendHandled,
  errorBanner,
  onMemoryUpdate,
  onDiagnosticEvent,
  beforeSend,
  externalStreamServiceRef,
  onHistoryOpen,
}: AIChatProps) {
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const { toast } = useToast();

  const {
    messages,
    setMessages,
    messagesRef,
    isStreaming,
    setIsStreaming,
    streamContent,
    setStreamContent,
    currentMessage,
    setCurrentMessage,
    currentMessageRef,
  } = useChatMessages({
    externalMessages,
    onMessagesChange,
    externalCurrentMessage,
    onCurrentMessageChange,
    externalIsStreaming,
    onIsStreamingChange,
    externalStreamContent,
    onStreamContentChange,
  });

  const modelPersistenceKey = useMemo(
    () => projectId || workspaceId || workingDir || agentSessionId,
    [agentSessionId, projectId, workspaceId, workingDir],
  );

  const {
    modelState,
    currentAvailableDepths,
    currentSupportsImages,
    handleModelChange,
    handleDepthChange,
    handleModelsEvent,
    handleModelError,
    resetModelState,
  } = useChatModels({
    agentSessionId,
    workingDir,
    projectId,
    persistenceKey: modelPersistenceKey,
    mode,
  });

  const selectedModelId = useMemo(
    () =>
      buildFullModelId(
        modelState.currentModelId,
        modelState.currentDepth ?? undefined,
        modelState.models,
      ) ||
      modelState.currentModelId ||
      undefined,
    [modelState.currentDepth, modelState.currentModelId, modelState.models],
  );

  const {
    plan,
    pendingPermissionRequest,
    silenceSeconds,
    memoryFilePathsRef,
    handleSend,
    handleCancel,
    handleRegenerate,
    handleRollback,
    handleEditResend,
    handleCancelQueuedMessage,
    handlePermissionResponse,
    handlePermissionCancel,
    handleUserChoiceResponse,
  } = useChatStream({
    sessionId,
    agentSessionId,
    mode,
    viewerContext,
    workingDir,
    projectId,
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
    onModelsEvent: handleModelsEvent,
    onModelStateError: handleModelError,
    selectedModelId,
    onDiagnosticEvent,
    beforeSend,
    externalStreamServiceRef,
  });

  const [memoryUpdateFiles, setMemoryUpdateFiles] = useState<string[]>([]);

  useEffect(() => {
    if (!isStreaming && memoryFilePathsRef.current.size > 0) {
      const files = Array.from(memoryFilePathsRef.current);
      memoryFilePathsRef.current.clear();
      setMemoryUpdateFiles((prev) => [...prev, ...files]);
    }
  }, [isStreaming, memoryFilePathsRef]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const isAutoScrollingRef = useRef(false);
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const onTriggerAutoSendHandledRef = useRef(onTriggerAutoSendHandled);
  onTriggerAutoSendHandledRef.current = onTriggerAutoSendHandled;

  const handleScroll = useCallback(() => {
    // 忽略程序触发的滚动事件，避免竞态条件
    if (isAutoScrollingRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 100;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    const wasUserScrolling = isUserScrollingRef.current;
    isUserScrollingRef.current = !isNearBottom;
    setIsUserScrolling(!isNearBottom);
    // 用户滚回底部时，恢复自动滚动
    if (wasUserScrolling && isNearBottom) {
      isAutoScrollingRef.current = false;
    }
  }, []);

  // 监听滚动容器内容高度变化，确保子组件（如 ExecutionPhase）内容增长时也自动滚动
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (isUserScrollingRef.current) return;
      isAutoScrollingRef.current = true;
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
        isAutoScrollingRef.current = false;
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isUserScrollingRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    // 流式输出时用即时滚动跟上内容增长，非流式时用平滑滚动
    const behavior: ScrollBehavior = isStreaming ? "instant" : "smooth";
    isAutoScrollingRef.current = true;
    // 等 DOM 渲染完成后再滚动
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
      if (behavior === "instant") {
        isAutoScrollingRef.current = false;
      } else {
        const timer = setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 400);
      }
    });
  }, [messages, streamContent, isStreaming, currentMessage]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isUserScrollingRef.current = false;
    setIsUserScrolling(false);
    isAutoScrollingRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 400);
  }, []);

  const handleCancelStream = useCallback(() => {
    handleCancel(streamContent, currentMessage);
  }, [handleCancel, streamContent, currentMessage]);

  const handleHistoryClick = useCallback(() => {
    if (isStreaming) {
      toast({ title: "AI 输出中，无法切换对话" });
      return;
    }
    if (onHistoryOpen) {
      onHistoryOpen();
      return;
    }
    setHistoryDialogOpen(true);
  }, [isStreaming, onHistoryOpen, toast]);

  useEffect(() => {
    if (triggerAutoSend && !isStreaming) {
      if (typeof triggerAutoSend === "string") {
        handleSendRef.current(triggerAutoSend);
      } else {
        handleSendRef.current(
          triggerAutoSend.hiddenPrompt,
          undefined,
          triggerAutoSend.kind === "auto_repair"
            ? {
                source: "system_auto_repair",
                displayMessage: {
                  status: "running",
                  title: triggerAutoSend.visibleTitle,
                  summary: triggerAutoSend.visibleSummary,
                  debugDetail: triggerAutoSend.debugDetail,
                  hiddenPrompt: triggerAutoSend.hiddenPrompt,
                },
              }
            : {
                source: "visual_property",
                visualPropertyDisplayMessage: {
                  title: triggerAutoSend.visibleTitle,
                  summary: triggerAutoSend.visibleSummary,
                  hiddenPrompt: triggerAutoSend.hiddenPrompt,
                },
              },
        );
      }
      onTriggerAutoSendHandledRef.current?.();
    }
  }, [triggerAutoSend, isStreaming]);

  const queuedMessages = messages.filter((message) => message.queueStatus);

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent ref={scrollContainerRef} onScroll={handleScroll}>
          <ChatMessages
            messages={messages}
            currentMessage={currentMessage}
            isStreaming={isStreaming}
            isUserScrolling={isUserScrolling}
            onScrollToBottom={scrollToBottom}
            onRegenerate={handleRegenerate}
            onExternalAuthConnected={handleRegenerate}
            onRollback={handleRollback}
            externalAuthSessionId={agentSessionId}
            onEditResend={handleEditResend}
            messagesRef={messagesRef}
            setMessages={setMessages}
            handleSend={handleSend}
            onUserChoiceResponse={handleUserChoiceResponse}
          />
          {pendingPermissionRequest && (
            <PermissionDialog
              request={pendingPermissionRequest}
              onRespond={handlePermissionResponse}
              onCancel={handlePermissionCancel}
              variant="inline"
            />
          )}
        </ConversationContent>
      </Conversation>

      {memoryUpdateFiles.length > 0 && (
        <div className="flex flex-col gap-1 px-4">
          {memoryUpdateFiles.map((filePath) => (
            <div
              key={filePath}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-md text-sm"
            >
              <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
              <span className="flex-1 text-blue-300 min-w-0 truncate">
                AI 更新了项目记忆
                <span className="text-blue-400/60 ml-1 font-mono text-xs">
                  {filePath}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
                onClick={() => {
                  onMemoryUpdate?.(filePath);
                  setMemoryUpdateFiles((prev) =>
                    prev.filter((f) => f !== filePath),
                  );
                }}
              >
                查看变更
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setMemoryUpdateFiles((prev) =>
                    prev.filter((f) => f !== filePath),
                  )
                }
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {isStreaming && silenceSeconds != null && silenceSeconds >= 60 && (
        <div className="flex items-center gap-1.5 px-4 pb-1 text-xs text-muted-foreground">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              silenceSeconds >= 180
                ? "bg-red-500 animate-pulse"
                : "bg-yellow-500/70"
            }`}
          />
          <span>已运行 {silenceSeconds} 秒</span>
        </div>
      )}

      <ChatPlan plan={plan} isStreaming={isStreaming} />

      {errorBanner}

      <QueuedMessagesTray
        messages={queuedMessages}
        onCancelQueuedMessage={handleCancelQueuedMessage}
      />

      <ChatInput
        onSubmit={handleSend}
        onCancel={handleCancelStream}
        isStreaming={isStreaming}
        agentSessionId={agentSessionId}
        onHistoryClick={handleHistoryClick}
        onModelChange={handleModelChange}
        onDepthChange={handleDepthChange}
        currentModelId={modelState.currentModelId}
        currentDepth={modelState.currentDepth}
        availableDepths={currentAvailableDepths}
        models={modelState.models}
        canSwitch={modelState.canSwitch}
        isModelLoading={modelState.isLoading}
        supportsImages={mode === "viewer-readonly" || currentSupportsImages}
        supportsFiles
        supportsHistory={mode !== "viewer-readonly" || Boolean(onHistoryOpen)}
      />

      {mode !== "viewer-readonly" && (
        <HistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          projectId={projectId || sessionId}
          workspaceId={workspaceId}
          currentSessionId={currentSessionId}
          onSelectSession={onSelectSession || (() => {})}
          onNewSession={onNewSession || (() => {})}
        />
      )}

    </div>
  );
}
