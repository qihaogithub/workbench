"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  History,
  ImagePlus,
  Loader2,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { ImageAttachment } from "@workbench/shared";
import type { PublishedProject } from "@/lib/api";
import {
  askViewerAi,
  getViewerAiModels,
  type ViewerAiHistoryMessage,
  type ViewerAiModel,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  imageCount?: number;
}

interface StoredViewerChatSession {
  id: string;
  title: string;
  updatedAt: number;
  agentSessionId?: string;
  messages: ViewerAiHistoryMessage[];
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

function createChatSession(messages: ViewerAiHistoryMessage[] = []): StoredViewerChatSession {
  const firstUserMessage = messages.find((message) => message.role === "user");
  return {
    id: `viewer-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: firstUserMessage?.content.slice(0, 24) || "新对话",
    updatedAt: Date.now(),
    messages,
  };
}

function toChatMessages(messages: ViewerAiHistoryMessage[]): ChatMessage[] {
  return messages.map((item) => createMessage(item.role, item.content));
}

function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const data = result.includes(",") ? result.split(",")[1] : result;
      resolve({ data, mimeType: file.type, name: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatSessionTime(updatedAt: number): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(updatedAt);
  } catch {
    return "";
  }
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
  const [chatSessions, setChatSessions] = useState<StoredViewerChatSession[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ViewerAiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const lastQuestionRef = useRef<string>("");
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageKey = useMemo(() => `viewer-ai:${projectId}`, [projectId]);
  const sessionStorageKey = useMemo(
    () => `viewer-ai-session:${projectId}`,
    [projectId],
  );
  const sessionsStorageKey = useMemo(
    () => `viewer-ai-sessions:${projectId}`,
    [projectId],
  );
  const activeSessionStorageKey = useMemo(
    () => `viewer-ai-active-session:${projectId}`,
    [projectId],
  );
  const modelStorageKey = useMemo(
    () => `viewer-ai-model:${projectId}`,
    [projectId],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsedLegacy = raw ? JSON.parse(raw) : [];
      const legacyMessages = Array.isArray(parsedLegacy)
        ? parsedLegacy.filter(
            (item): item is ViewerAiHistoryMessage =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string",
          )
        : [];
      const rawSessions = localStorage.getItem(sessionsStorageKey);
      const parsedSessions = rawSessions ? JSON.parse(rawSessions) : [];
      const nextSessions = Array.isArray(parsedSessions)
        ? parsedSessions
            .filter(
              (item): item is StoredViewerChatSession =>
                item &&
                typeof item.id === "string" &&
                typeof item.title === "string" &&
                Array.isArray(item.messages),
            )
            .map((item) => ({
              ...item,
              messages: item.messages.filter(
                (message): message is ViewerAiHistoryMessage =>
                  message &&
                  (message.role === "user" || message.role === "assistant") &&
                  typeof message.content === "string",
              ),
            }))
        : [];
      const migratedSession =
        nextSessions.length === 0 && legacyMessages.length > 0
          ? [createChatSession(legacyMessages)]
          : nextSessions;
      const sessions =
        migratedSession.length > 0 ? migratedSession : [createChatSession()];
      const storedActiveId = localStorage.getItem(activeSessionStorageKey) || "";
      const activeSession =
        sessions.find((item) => item.id === storedActiveId) || sessions[0];
      setChatSessions(sessions);
      setActiveChatSessionId(activeSession.id);
      setMessages(toChatMessages(activeSession.messages));
      setSessionId(
        activeSession.agentSessionId ||
          localStorage.getItem(sessionStorageKey) ||
          undefined,
      );
      const storedModel = localStorage.getItem(modelStorageKey) || "";
      setSelectedModel((prev) => storedModel || prev);
      setImages([]);
      setError(null);
      setInput("");
      lastQuestionRef.current = "";
    } catch {
      const fallbackSession = createChatSession();
      setMessages([]);
      setChatSessions([fallbackSession]);
      setActiveChatSessionId(fallbackSession.id);
      setSessionId(undefined);
    }
  }, [
    activeSessionStorageKey,
    modelStorageKey,
    sessionsStorageKey,
    storageKey,
    sessionStorageKey,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoadingModels(true);
    getViewerAiModels()
      .then((result) => {
        if (cancelled) return;
        setModels(result.models);
        setSelectedModel((prev) => {
          const stored = prev || result.currentModelId || result.models[0]?.id || "";
          return result.models.some((model) => model.id === stored)
            ? stored
            : result.models[0]?.id || "";
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "模型列表加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!selectedModel) return;
    try {
      localStorage.setItem(modelStorageKey, selectedModel);
    } catch {}
  }, [modelStorageKey, selectedModel]);

  useEffect(() => {
    if (models.length === 0) return;
    setSelectedModel((prev) =>
      prev && models.some((model) => model.id === prev) ? prev : models[0].id,
    );
  }, [models]);

  useEffect(() => {
    try {
      const storedMessages = toStoredMessages(messages);
      localStorage.setItem(storageKey, JSON.stringify(storedMessages));
      localStorage.setItem(activeSessionStorageKey, activeChatSessionId);
      setChatSessions((prev) => {
        if (!activeChatSessionId) return prev;
        const updated = prev.map((item) => {
          if (item.id !== activeChatSessionId) return item;
          const firstUserMessage = storedMessages.find(
            (message) => message.role === "user",
          );
          return {
            ...item,
            title: firstUserMessage?.content.slice(0, 24) || item.title || "新对话",
            updatedAt: Date.now(),
            agentSessionId: sessionId,
            messages: storedMessages,
          };
        });
        localStorage.setItem(sessionsStorageKey, JSON.stringify(updated));
        return updated;
      });
    } catch {
      /* localStorage may be unavailable or full; chat still works in memory. */
    }
  }, [
    activeChatSessionId,
    activeSessionStorageKey,
    messages,
    sessionId,
    sessionsStorageKey,
    storageKey,
  ]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isSending, error]);

  const activePageName =
    project.demoPages.find((page) => page.id === activePageId)?.name ||
    "当前页面";

  const sortedChatSessions = useMemo(
    () => chatSessions.slice().sort((a, b) => b.updatedAt - a.updatedAt),
    [chatSessions],
  );

  const activeChatSession = useMemo(
    () => chatSessions.find((item) => item.id === activeChatSessionId),
    [activeChatSessionId, chatSessions],
  );

  const selectedModelLabel = useMemo(() => {
    const model = models.find((item) => item.id === selectedModel);
    return model?.label || model?.id || "";
  }, [models, selectedModel]);

  const handleSelectChatSession = useCallback(
    (nextSessionId: string) => {
      const nextSession = chatSessions.find((item) => item.id === nextSessionId);
      if (!nextSession) return;
      setActiveChatSessionId(nextSession.id);
      setMessages(toChatMessages(nextSession.messages));
      setSessionId(nextSession.agentSessionId);
      setHistoryDialogOpen(false);
      setImages([]);
      setInput("");
      setError(null);
      lastQuestionRef.current = "";
    },
    [chatSessions],
  );

  const handleNewChatSession = useCallback(() => {
    const nextSession = createChatSession();
    setChatSessions((prev) => [nextSession, ...prev]);
    setActiveChatSessionId(nextSession.id);
    setMessages([]);
    setSessionId(undefined);
    setImages([]);
    setInput("");
    setError(null);
    setHistoryDialogOpen(false);
    lastQuestionRef.current = "";
  }, []);

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if ((!trimmed && images.length === 0) || isSending) return;

      const pendingImages = images;
      const effectiveQuestion = trimmed || "请结合我发送的图片回答。";
      const userMessage = {
        ...createMessage("user", effectiveQuestion),
        imageCount: pendingImages.length || undefined,
      };
      const previousMessages = toStoredMessages(messages).slice(-8);
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setImages([]);
      setError(null);
      setIsSending(true);
      lastQuestionRef.current = effectiveQuestion;

      try {
        const result = await askViewerAi({
          projectId,
          sessionId,
          message: effectiveQuestion,
          model: selectedModel || undefined,
          activePageId,
          activeConfig,
          history: previousMessages,
          images: pendingImages.length > 0 ? pendingImages : undefined,
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
      images,
      isSending,
      messages,
      projectId,
      selectedModel,
      sessionId,
      sessionStorageKey,
    ],
  );

  const handleAddImages = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) return;
    const attachments = await Promise.all(imageFiles.map(fileToImageAttachment));
    setImages((prev) => [...prev, ...attachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleRetry = useCallback(() => {
    const lastQuestion = lastQuestionRef.current;
    if (lastQuestion) void sendQuestion(lastQuestion);
  }, [sendQuestion]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setImages([]);
    setInput("");
    setError(null);
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(sessionStorageKey);
    } catch {}
  }, [sessionStorageKey, storageKey]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      void sendQuestion(input);
    },
    [input, sendQuestion],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 80), 140)}px`;
  }, [input]);

  return (
    <aside
      className={`h-full w-[360px] max-w-[42vw] shrink-0 flex-col border-r border-border bg-background ${
        open ? "flex" : "hidden"
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <MessageCircle className="h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-medium leading-tight">AI 问答</div>
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
          onClick={handleNewChatSession}
          disabled={isSending}
          title="新对话"
        >
          <Plus className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onOpenChange(false)}
          title="收起"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="h-full p-4">
          <div className="flex min-h-full flex-col gap-3">
            {messages.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                  <Bot className="h-10 w-10 text-foreground" />
                </div>
                <div className="mt-5 space-y-2">
                  <h2 className="text-xl font-semibold tracking-normal">AI 助手</h2>
                  <p className="max-w-[280px] text-sm font-medium leading-6 text-muted-foreground">
                    输入自然语言问题，AI 将帮您理解当前项目
                  </p>
                </div>
                <div className="mt-8 space-y-2 text-left">
                  <p className="text-xs font-medium text-muted-foreground">示例问题：</p>
                  <div className="space-y-2">
                    {[
                      "这个页面适合什么场景？",
                      "当前配置项怎么使用？",
                      "帮我解释这个项目",
                    ].map((example) => (
                      <button
                        key={example}
                        type="button"
                        className="block rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
                        onClick={() => setInput(example)}
                      >
                        &quot;{example}&quot;
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[86%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-5 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-card-foreground"
                  }`}
                >
                  {message.content}
                  {message.imageCount ? (
                    <div className="mt-1 text-xs opacity-75">
                      已附加 {message.imageCount} 张图片
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
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
        </div>
      </ScrollArea>

      <form
        className="shrink-0 border-t border-border bg-card p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendQuestion(input);
        }}
      >
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <span
                key={`${image.name}-${index}`}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
              >
                <span className="truncate">{image.name}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setImages((prev) => prev.filter((_, i) => i !== index))
                  }
                  aria-label="移除图片"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="输入问题，按 Enter 发送..."
          className="max-h-[140px] min-h-20 resize-none overflow-hidden rounded-xl px-3 py-3 text-sm leading-5"
          disabled={isSending}
          onKeyDown={handleInputKeyDown}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void handleAddImages(event.target.files)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isSending}
              onClick={() => fileInputRef.current?.click()}
              title="添加图片"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isSending}
              onClick={() => setHistoryDialogOpen(true)}
              title="历史对话"
            >
              <History className="h-4 w-4" />
            </Button>
            <Select
              value={selectedModel}
              onValueChange={setSelectedModel}
              disabled={isSending || isLoadingModels || models.length === 0}
            >
              <SelectTrigger className="h-9 w-[160px] rounded-xl text-sm font-medium">
                <span className="truncate">
                  {isLoadingModels ? "加载模型" : selectedModelLabel || "选择模型"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <span className="flex flex-col">
                      <span>{model.label || model.id}</span>
                      {(model.group || model.provider) && (
                        <span className="text-[10px] text-muted-foreground">
                          {model.group || model.provider}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 rounded-xl"
            disabled={isSending || (!input.trim() && images.length === 0)}
            title={isSending ? "正在生成" : "发送"}
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>历史对话</DialogTitle>
            <DialogDescription>
              切换当前项目的本地问答会话，不会影响预览页面或配置。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full justify-start"
              variant="outline"
              onClick={handleNewChatSession}
              disabled={isSending}
            >
              <Plus className="mr-2 h-4 w-4" />
              新对话
            </Button>
            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {sortedChatSessions.map((session) => {
                const isActive = session.id === activeChatSessionId;
                return (
                  <button
                    key={session.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border border-border px-3 py-3 text-left transition-colors hover:bg-accent",
                      isActive && "border-primary bg-accent",
                    )}
                    disabled={isSending}
                    onClick={() => handleSelectChatSession(session.id)}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {session.title || "新对话"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {session.messages.length} 条消息
                        {formatSessionTime(session.updatedAt)
                          ? ` / ${formatSessionTime(session.updatedAt)}`
                          : ""}
                      </span>
                    </span>
                    {isActive ? (
                      <span className="text-xs text-muted-foreground">当前</span>
                    ) : (
                      <ChevronDown className="-rotate-90 h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
            {activeChatSession && (
              <p className="text-xs text-muted-foreground">
                当前：{activeChatSession.title || "新对话"} / {activeChatSession.messages.length} 条消息
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
