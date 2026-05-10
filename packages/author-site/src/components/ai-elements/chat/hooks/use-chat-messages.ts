"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage } from "@/components/ai-elements";

const DEFAULT_CURRENT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "",
  parts: [],
};

interface UseChatMessagesOptions {
  externalMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
  externalCurrentMessage?: ChatMessage;
  onCurrentMessageChange?: (message: ChatMessage) => void;
  externalIsStreaming?: boolean;
  onIsStreamingChange?: (isStreaming: boolean) => void;
  externalStreamContent?: string;
  onStreamContentChange?: (content: string) => void;
}

export function useChatMessages(options: UseChatMessagesOptions = {}) {
  const {
    externalMessages,
    onMessagesChange,
    externalCurrentMessage,
    onCurrentMessageChange,
    externalIsStreaming,
    onIsStreamingChange,
    externalStreamContent,
    onStreamContentChange,
  } = options;

  // --- Messages ---
  const isMessagesControlled = externalMessages !== undefined;
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const messages = isMessagesControlled ? externalMessages : internalMessages;

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      if (isMessagesControlled) {
        const prev = messagesRef.current || [];
        const newMessages =
          typeof updater === "function" ? updater(prev) : updater;
        messagesRef.current = newMessages;
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
    [isMessagesControlled, onMessagesChange],
  );

  // --- isStreaming ---
  const isStreamingControlled = externalIsStreaming !== undefined;
  const [internalIsStreaming, setInternalIsStreaming] = useState(false);
  const isStreaming = isStreamingControlled
    ? externalIsStreaming
    : internalIsStreaming;
  const setIsStreaming = isStreamingControlled
    ? onIsStreamingChange!
    : setInternalIsStreaming;

  // --- streamContent ---
  const streamContentControlled = externalStreamContent !== undefined;
  const [internalStreamContent, setInternalStreamContent] = useState("");
  const streamContent = streamContentControlled
    ? externalStreamContent
    : internalStreamContent;
  const setStreamContent = useCallback(
    (updater: string | ((prev: string) => string)) => {
      if (streamContentControlled) {
        const prev = internalStreamContent;
        const newContent =
          typeof updater === "function" ? updater(prev) : updater;
        onStreamContentChange?.(newContent);
      } else {
        setInternalStreamContent(updater);
      }
    },
    [streamContentControlled, onStreamContentChange, internalStreamContent],
  );

  // --- currentMessage ---
  const currentMessageControlled = externalCurrentMessage !== undefined;
  const [internalCurrentMessage, setInternalCurrentMessage] =
    useState<ChatMessage>(DEFAULT_CURRENT_MESSAGE);
  const currentMessage = currentMessageControlled
    ? externalCurrentMessage
    : internalCurrentMessage;

  const currentMessageRef = useRef(currentMessage);
  useEffect(() => {
    currentMessageRef.current = currentMessage;
  }, [currentMessage]);

  const setCurrentMessage = useCallback(
    (updater: ChatMessage | ((prev: ChatMessage) => ChatMessage)) => {
      if (currentMessageControlled) {
        const prev = currentMessageRef.current || DEFAULT_CURRENT_MESSAGE;
        const newMessage =
          typeof updater === "function" ? updater(prev) : updater;
        currentMessageRef.current = newMessage;
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

  return {
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
  };
}
