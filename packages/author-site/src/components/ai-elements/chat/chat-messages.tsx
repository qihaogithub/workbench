"use client";

import { useRef } from "react";
import type { ImageAttachment } from "@opencode-workbench/agent-client";
import type { UserChoiceResponse } from "./services/stream-service";
import {
  Message,
  AssistantMessage,
  type ChatMessage,
} from "@/components/ai-elements";
import { Bot, ArrowDown } from "lucide-react";

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
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  handleSend: (
    content: string,
    images?: ImageAttachment[],
    options?: {
      source: "system_auto_repair";
      displayMessage: NonNullable<ChatMessage["autoRepair"]>;
    },
  ) => void;
  onUserChoiceResponse: (requestId: string, choice: UserChoiceResponse) => void;
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
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  if (messages.length === 0 && !isStreaming) {
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
      {messages.map((msg) => {
        if (msg.role === "user" || msg.kind === "auto_repair") {
          return (
            <Message
              key={msg.id}
              message={msg}
              isStreaming={isStreaming}
              onEditResend={onEditResend}
              allMessages={messages}
              setMessages={setMessages}
              handleSend={handleSend}
            />
          );
        }
        return (
          <AssistantMessage
            key={msg.id}
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
      })}

      {isStreaming && (
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
