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
import { useChatMessages } from "./chat/hooks/use-chat-messages";
import { useChatStream } from "./chat/hooks/use-chat-stream";
import { useChatModels } from "./chat/hooks/use-chat-models";
import { ChatMessages } from "./chat/chat-messages";
import { ChatPlan } from "./chat/chat-plan";
import { ChatInput } from "./chat/chat-input";
import type { PermissionRequest } from "./chat/services/stream-service";

interface AIChatProps {
  sessionId: string;
  agentSessionId: string;
  workingDir?: string;
  projectId?: string;
  demoId?: string;
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
    handleSend,
    handleCancel,
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
    messagesRef,
    setMessages,
    setIsStreaming,
    setStreamContent,
    currentMessageRef,
    setCurrentMessage,
    onModelsEvent: handleModelsEvent,
    onModelStateError: handleModelError,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

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

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          <ChatMessages
            messages={messages}
            currentMessage={currentMessage}
            isStreaming={isStreaming}
            messagesEndRef={messagesEndRef}
          />
        </ConversationContent>
      </Conversation>

      <ChatPlan plan={plan} isStreaming={isStreaming} />

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
