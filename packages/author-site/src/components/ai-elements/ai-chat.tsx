"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Conversation,
  ConversationContent,
  PermissionDialog,
  type ChatMessage,
} from "@/components/ai-elements";
import { HistoryDialog } from "@/components/ai-elements/history-dialog";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { useChatMessages } from "./chat/hooks/use-chat-messages";
import { useChatStream } from "./chat/hooks/use-chat-stream";
import { useChatModels } from "./chat/hooks/use-chat-models";
import { ChatMessages } from "./chat/chat-messages";
import { ChatPlan } from "./chat/chat-plan";
import { ChatInput } from "./chat/chat-input";
import type { PermissionRequest } from "./chat/services/stream-service";
import { X, FileText, ArrowDown } from "lucide-react";

interface AIChatProps {
  sessionId: string;
  agentSessionId: string;
  workingDir?: string;
  projectId?: string;
  demoId?: string;
  workspaceId?: string;
  onCodeUpdate?: (code: string, source?: "ai-realtime" | "ai-finish") => void;
  onSchemaUpdate?: (schema: string, source?: "ai-realtime" | "ai-finish") => void;
  onFilesChange?: (
    files: Array<{ path: string; action: "created" | "modified" | "deleted" }>,
  ) => void;
  onSnapshotReady?: () => void;
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
  triggerAutoSend?: string | null;
  onTriggerAutoSendHandled?: () => void;
  /** 错误提示横幅，渲染在输入框上方 */
  errorBanner?: React.ReactNode;
  /** AI 更新了 .md 记忆文件时的回调，用于打开编辑器查看 */
  onMemoryUpdate?: (filePath: string) => void;
}

export function AIChat({
  sessionId,
  agentSessionId,
  workingDir,
  projectId,
  demoId,
  workspaceId,
  onCodeUpdate,
  onSchemaUpdate,
  onFilesChange,
  onSnapshotReady,
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

  const {
    modelState,
    currentSupportsImages,
    currentAvailableDepths,
    handleModelChange,
    handleDepthChange,
    handleModelsEvent,
    handleModelError,
    resetModelState,
  } = useChatModels({ agentSessionId, workingDir });

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
    handlePermissionResponse,
    handlePermissionCancel,
  } = useChatStream({
    sessionId,
    agentSessionId,
    workingDir,
    demoId,
    onCodeUpdate,
    onSchemaUpdate,
    onFilesChange,
    onSnapshotReady,
    messagesRef,
    setMessages,
    setIsStreaming,
    setStreamContent,
    currentMessageRef,
    setCurrentMessage,
    onModelsEvent: handleModelsEvent,
    onModelStateError: handleModelError,
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
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const onTriggerAutoSendHandledRef = useRef(onTriggerAutoSendHandled);
  onTriggerAutoSendHandledRef.current = onTriggerAutoSendHandled;

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 100;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsUserScrolling(!isNearBottom);
  }, []);

  useEffect(() => {
    if (isUserScrolling) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, streamContent, isUserScrolling]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setIsUserScrolling(false);
  }, []);

  const handleCancelStream = useCallback(() => {
    handleCancel(streamContent, currentMessage);
  }, [handleCancel, streamContent, currentMessage]);

  const handleHistoryClick = useCallback(() => {
    if (isStreaming) {
      toast({ title: "AI 输出中，无法切换对话" });
      return;
    }
    setHistoryDialogOpen(true);
  }, [isStreaming, toast]);

  useEffect(() => {
    if (triggerAutoSend && !isStreaming) {
      handleSendRef.current(triggerAutoSend);
      onTriggerAutoSendHandledRef.current?.();
    }
  }, [triggerAutoSend, isStreaming]);

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
            onRollback={handleRollback}
            onEditResend={handleEditResend}
            messagesRef={messagesRef}
            setMessages={setMessages}
            handleSend={handleSend}
          />
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

      <ChatPlan plan={plan} isStreaming={isStreaming} />

      {errorBanner}

      <ChatInput
        onSubmit={handleSend}
        onCancel={handleCancelStream}
        isStreaming={isStreaming}
        currentSupportsImages={currentSupportsImages}
        onHistoryClick={handleHistoryClick}
        onModelChange={handleModelChange}
        onDepthChange={handleDepthChange}
        currentModelId={modelState.currentModelId}
        currentDepth={modelState.currentDepth}
        availableDepths={currentAvailableDepths}
        models={modelState.models}
        canSwitch={modelState.canSwitch}
        isModelLoading={modelState.isLoading}
      />

      <HistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        projectId={projectId || sessionId}
        workspaceId={workspaceId}
        currentSessionId={currentSessionId}
        onSelectSession={onSelectSession || (() => {})}
        onNewSession={onNewSession || (() => {})}
      />

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
