"use client";

import { type RefObject, useEffect, useRef } from "react";
import {
  Message,
  AssistantMessage,
  type ChatMessage,
} from "@/components/ai-elements";
import { Bot } from "lucide-react";

interface ChatMessagesProps {
  messages: ChatMessage[];
  currentMessage: ChatMessage;
  isStreaming: boolean;
  messagesEndRef: RefObject<HTMLDivElement>;
}

export function ChatMessages({
  messages,
  currentMessage,
  isStreaming,
  messagesEndRef,
}: ChatMessagesProps) {
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
        if (msg.role === "user") {
          return <Message key={msg.id} message={msg} />;
        }
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
    </>
  );
}
