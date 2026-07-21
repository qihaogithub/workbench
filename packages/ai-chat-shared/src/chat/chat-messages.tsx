"use client";

import React, { useRef } from "react";
import type { ImageAttachment } from "@workbench/agent-client";
import type { UserChoiceResponse } from "./services/stream-service";
import { Message, type ChatMessage } from "../message";
import { AssistantMessage } from "../assistant-message";
import { Bot, ArrowDown, RefreshCw, MessageSquare } from "lucide-react";
import { cn } from "../lib/utils";
import { ChatCard } from "../chat-card";

function classifyRenderError(error: Error): "data" | "render" {
  const msg = error.message || "";
  if (
    msg.includes("Cannot read propert") ||
    msg.includes("undefined") ||
    msg.includes("null") ||
    msg.includes("is not a function") ||
    msg.includes("of undefined")
  ) {
    return "data";
  }
  return "render";
}

interface MessageErrorBoundaryProps {
  messageId?: string;
  children: React.ReactNode;
  onError?: (info: {
    messageId?: string;
    errorType: "data" | "render";
    errorMessage: string;
  }) => void;
  onJumpToMessage?: (messageId?: string) => void;
}

interface MessageErrorBoundaryState {
  hasError: boolean;
  errorType: "data" | "render" | null;
  lastError: Error | null;
}

class MessageErrorBoundary extends React.Component<
  MessageErrorBoundaryProps,
  MessageErrorBoundaryState
> {
  state: MessageErrorBoundaryState = {
    hasError: false,
    errorType: null,
    lastError: null,
  };

  static getDerivedStateFromError(error: Error): MessageErrorBoundaryState {
    return {
      hasError: true,
      errorType: classifyRenderError(error),
      lastError: error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorType = classifyRenderError(error);
    console.warn(
      `[MessageErrorBoundary][${errorType}] 消息渲染失败`,
      this.props.messageId,
      error.message,
    );
    if (errorType === "data" && this.props.onError) {
      this.props.onError({
        messageId: this.props.messageId,
        errorType,
        errorMessage: error.message,
      });
    }
  }

  componentDidUpdate(prevProps: MessageErrorBoundaryProps) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, errorType: null, lastError: null });
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorType: null, lastError: null });
  };

  render() {
    if (this.state.hasError) {
      const isDataError = this.state.errorType === "data";
      return (
        <ChatCard className="border-destructive/50 bg-destructive/10 my-1">
          <div className="flex items-center gap-2 text-sm p-3">
            <span className="text-destructive/80">
              {isDataError ? "消息数据异常，无法渲染" : "消息渲染出错"}
            </span>
            <button
              type="button"
              onClick={this.handleReset}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors",
                "border border-border/40 bg-background/50 text-muted-foreground hover:bg-muted/30",
              )}
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
            {this.props.messageId && this.props.onJumpToMessage && (
              <button
                type="button"
                onClick={() =>
                  this.props.onJumpToMessage!(this.props.messageId)
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors",
                  "border border-border/40 bg-background/50 text-muted-foreground hover:bg-muted/30",
                )}
              >
                <MessageSquare className="h-3 w-3" />
                定位消息
              </button>
            )}
          </div>
          {this.state.lastError && (
            <p className="mt-1 text-[11px] text-muted-foreground/50 truncate px-3 pb-3">
              {this.state.lastError.message}
            </p>
          )}
        </ChatCard>
      );
    }
    return this.props.children;
  }
}

function hasFileChanges(msg: ChatMessage): boolean {
  if (msg.files && msg.files.length > 0) return true;
  const parts = msg.parts;
  if (!parts || parts.length === 0) return false;
  return parts.some(
    (p) =>
      p.type === "tool" &&
      (p.toolName?.toLowerCase().includes("write") ||
        p.toolName?.toLowerCase().includes("edit") ||
        p.toolName?.toLowerCase().includes("create") ||
        p.toolName?.toLowerCase().includes("delete") ||
        p.toolName?.toLowerCase().includes("bash") ||
        p.toolName?.toLowerCase().includes("exec")),
  );
}

function hasVisibleCurrentMessage(msg: ChatMessage): boolean {
  return Boolean(
    msg.content?.trim() ||
    msg.reasonings?.length ||
    msg.tools?.length ||
    msg.parts?.some((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return part.content.trim().length > 0;
      }
      return true;
    }),
  );
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  currentMessage: ChatMessage;
  isStreaming: boolean;
  isUserScrolling: boolean;
  onScrollToBottom: () => void;
  onRegenerate: (targetAssistantId: string) => void;
  onExternalAuthConnected: (targetAssistantId: string) => void;
  onRollback: (targetAssistantId: string) => void;
  externalAuthSessionId?: string;
  onEditResend: (targetMessageId: string, newContent: string) => void;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  setMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  handleSend: (
    content: string,
    images?: ImageAttachment[],
    options?:
      | {
          source: "system_auto_repair";
          displayMessage: NonNullable<ChatMessage["autoRepair"]>;
        }
      | {
          source: "visual_property";
          visualPropertyDisplayMessage: NonNullable<
            ChatMessage["visualProperty"]
          >;
        },
  ) => void;
  onUserChoiceResponse: (requestId: string, choice: UserChoiceResponse) => void;
  onMessageRenderError?: (info: {
    messageId?: string;
    errorType: "data" | "render";
    errorMessage: string;
  }) => void;
  onJumpToMessage?: (messageId?: string) => void;
}

export function ChatMessages({
  messages,
  currentMessage,
  isStreaming,
  isUserScrolling,
  onScrollToBottom,
  onRegenerate,
  onExternalAuthConnected,
  onRollback,
  externalAuthSessionId,
  onEditResend,
  messagesRef,
  setMessages,
  handleSend,
  onUserChoiceResponse,
  onMessageRenderError,
  onJumpToMessage,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeMessages = (messages ?? []).filter(
    (message) => !message.queueStatus,
  );
  const lastActiveMessage = activeMessages[activeMessages.length - 1];
  const shouldRenderCurrentMessage =
    isStreaming &&
    (hasVisibleCurrentMessage(currentMessage) ||
      lastActiveMessage?.role !== "assistant");

  const renderMessage = (msg: ChatMessage, index: number) => {
    if (msg.role === "user" || msg.kind === "auto_repair") {
      return (
        <Message
          key={msg.id ?? `msg-${msg.role}-${index}`}
          message={msg}
          isStreaming={isStreaming}
          onEditResend={onEditResend}
          allMessages={messages ?? []}
          setMessages={setMessages}
          handleSend={handleSend}
        />
      );
    }
    return (
      <AssistantMessage
        key={msg.id ?? `msg-${msg.role}-${index}`}
        content={msg.content}
        reasonings={msg.reasonings}
        tools={msg.tools}
        parts={msg.parts}
        messageId={msg.id}
        hasFileChanges={hasFileChanges(msg)}
        isStreaming={false}
        onRegenerate={onRegenerate}
        onExternalAuthConnected={onExternalAuthConnected}
        onRollback={onRollback}
        externalAuthSessionId={externalAuthSessionId}
        onUserChoiceResponse={onUserChoiceResponse}
      />
    );
  };

  if ((messages ?? []).length === 0 && !isStreaming) {
    return (
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
    );
  }

  return (
    <>
      {activeMessages.map((msg, index) => (
        <MessageErrorBoundary
          key={`eb-${msg.id ?? `${msg.role}-${index}`}`}
          messageId={msg.id}
          onError={onMessageRenderError}
          onJumpToMessage={onJumpToMessage}
        >
          {renderMessage(msg, index)}
        </MessageErrorBoundary>
      ))}

      {shouldRenderCurrentMessage && (
        <MessageErrorBoundary
          key="eb-streaming"
          messageId="streaming"
          onError={onMessageRenderError}
          onJumpToMessage={onJumpToMessage}
        >
          <AssistantMessage
            content={currentMessage.content || undefined}
            reasonings={currentMessage.reasonings}
            tools={currentMessage.tools}
            parts={currentMessage.parts}
            messageId={currentMessage.id}
            isStreaming={true}
            onExternalAuthConnected={onExternalAuthConnected}
            externalAuthSessionId={externalAuthSessionId}
            onUserChoiceResponse={onUserChoiceResponse}
          />
        </MessageErrorBoundary>
      )}

      {isUserScrolling && isStreaming && (
        <div className="sticky bottom-0 flex justify-center pb-2">
          <button
            onClick={onScrollToBottom}
            className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full shadow-lg text-sm flex items-center gap-1.5 z-10 hover:bg-primary/90 transition-colors"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            回到底部
          </button>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );
}
