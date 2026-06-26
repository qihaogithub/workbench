"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, RotateCcw, Send, Trash2, X } from "lucide-react";
import type { PublishedProject } from "@/lib/api";
import { askViewerAi, type ViewerAiHistoryMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

interface ViewerAiDrawerProps {
  open: boolean;
  projectId: string;
  project: PublishedProject;
  activePageId: string;
  activeConfig?: Record<string, unknown>;
  onOpenChange: (open: boolean) => void;
}

interface ChatMessage extends ViewerAiHistoryMessage {
  id: string;
}

function toStoredMessages(messages: ChatMessage[]): ViewerAiHistoryMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

function createMessage(role: "user" | "assistant", content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

export function ViewerAiDrawer({
  open,
  projectId,
  project,
  activePageId,
  activeConfig,
  onOpenChange,
}: ViewerAiDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQuestionRef = useRef<string>("");
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const storageKey = useMemo(() => `viewer-ai:${projectId}`, [projectId]);
  const sessionStorageKey = useMemo(
    () => `viewer-ai-session:${projectId}`,
    [projectId],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const nextMessages = Array.isArray(parsed)
        ? parsed
            .filter(
              (item): item is ViewerAiHistoryMessage =>
                item &&
                (item.role === "user" || item.role === "assistant") &&
                typeof item.content === "string",
            )
            .map((item) => createMessage(item.role, item.content))
        : [];
      setMessages(nextMessages);
      setSessionId(localStorage.getItem(sessionStorageKey) || undefined);
      setError(null);
      setInput("");
      lastQuestionRef.current = "";
    } catch {
      setMessages([]);
      setSessionId(undefined);
    }
  }, [storageKey, sessionStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(toStoredMessages(messages)));
    } catch {
      /* localStorage may be unavailable or full; chat still works in memory. */
    }
  }, [messages, storageKey]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isSending, error]);

  const activePageName =
    project.demoPages.find((page) => page.id === activePageId)?.name ||
    "当前页面";

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isSending) return;

      const userMessage = createMessage("user", trimmed);
      const previousMessages = toStoredMessages(messages).slice(-8);
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setError(null);
      setIsSending(true);
      lastQuestionRef.current = trimmed;

      try {
        const result = await askViewerAi({
          projectId,
          sessionId,
          message: trimmed,
          activePageId,
          activeConfig,
          history: previousMessages,
        });
        setSessionId(result.sessionId);
        try {
          localStorage.setItem(sessionStorageKey, result.sessionId);
        } catch {}
        setMessages((prev) => [
          ...prev,
          createMessage("assistant", result.answer || "我没有生成有效回答。"),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "AI 问答失败");
      } finally {
        setIsSending(false);
      }
    },
    [
      activeConfig,
      activePageId,
      isSending,
      messages,
      projectId,
      sessionId,
      sessionStorageKey,
    ],
  );

  const handleRetry = useCallback(() => {
    const lastQuestion = lastQuestionRef.current;
    if (lastQuestion) void sendQuestion(lastQuestion);
  }, [sendQuestion]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setError(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  return (
    <aside
      className={`h-full w-[360px] max-w-[42vw] shrink-0 flex-col border-r border-border bg-background ${
        open ? "flex" : "hidden"
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">AI 问答</div>
          <div className="truncate text-xs text-muted-foreground">
            {project.name} / {activePageName}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleClear}
          disabled={messages.length === 0 || isSending}
          title="清空历史"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onOpenChange(false)}
          title="收起"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {messages.length === 0 && (
            <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
              可以询问当前项目的用途、页面内容、配置项含义或使用建议。
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[86%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-card-foreground"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在生成回答...
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="mb-2">{error}</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isSending || !lastQuestionRef.current}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                重试
              </Button>
            </div>
          )}
          <div ref={scrollAnchorRef} />
        </div>
      </ScrollArea>

      <form
        className="shrink-0 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendQuestion(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="询问这个项目或当前页面..."
          className="max-h-36 min-h-[76px] resize-none"
          disabled={isSending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void sendQuestion(input);
            }
          }}
        />
        <div className="mt-2 flex items-center justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isSending || !input.trim()}
          >
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            发送
          </Button>
        </div>
      </form>
    </aside>
  );
}
