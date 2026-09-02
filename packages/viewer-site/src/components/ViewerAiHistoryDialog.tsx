"use client";

import { useState } from "react";
import { Clock, Download, Plus, Trash2 } from "lucide-react";

import type { LocalChatSession } from "@workbench/ai-chat-shared";
import { Button } from "@/components/ui/button";
import { PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ViewerAiHistoryDialogProps {
  sessions: LocalChatSession[];
  currentSessionId: string;
  /** AIChat 宿主列宽；用于覆盖 Popover 首次测量异常时的宽度。 */
  popoverWidth?: number | null;
  onSelect: (session: LocalChatSession) => void;
  onDelete: (sessionId: string) => void | Promise<void>;
  onNew: () => void;
}

function exportSession(session: LocalChatSession): void {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          sessionId: session.sessionId,
          exportedAt: new Date().toISOString(),
          session,
          messages: session.messages,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date(session.createdAt)
    .toLocaleDateString("zh-CN")
    .replace(/\//g, "-");
  anchor.href = url;
  anchor.download = `对话记录-${date}-${session.sessionId.slice(0, 8)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ViewerAiHistoryDialog({
  sessions,
  currentSessionId,
  popoverWidth,
  onSelect,
  onDelete,
  onNew,
}: ViewerAiHistoryDialogProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleDelete = async (sessionId: string) => {
    setDeletingId(sessionId);
    try {
      await onDelete(sessionId);
    } catch (error) {
      console.error("Failed to delete local chat session:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = (session: LocalChatSession) => {
    setExportingId(session.sessionId);
    try {
      exportSession(session);
    } finally {
      setExportingId(null);
    }
  };

  // PromptInput 的 p-4 + 加号按钮 w-8 + gap-1，使历史按钮距侧栏左边缘 52px。
  return (
    <PopoverContent
      side="top"
      align="start"
      alignOffset={-52}
      sideOffset={8}
      aria-label="对话历史"
      style={{
        width:
          popoverWidth != null && popoverWidth > 0
            ? `${popoverWidth}px`
            : "min(360px, calc(100vw - 1rem))",
      }}
      className="w-[min(360px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] min-w-0 overflow-hidden rounded-xl border border-muted-foreground/50 bg-popover p-3 shadow-xl"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold leading-5">
              对话历史
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 cursor-pointer px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onNew}
            aria-label="新建对话"
            title="新建对话"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            新建对话
          </Button>
        </div>
        <ScrollArea className="max-h-[min(55vh,340px)] pr-1">
          {sessions.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-sm text-muted-foreground">
              <Clock className="mb-2 h-10 w-10 opacity-40" />
              暂无历史对话
            </div>
          ) : (
            <div className="space-y-1.5">
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-lg border border-muted-foreground/50 p-2 transition-colors hover:bg-muted/70",
                    session.sessionId === currentSessionId &&
                      "border-primary bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer rounded-sm p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelect(session)}
                  >
                    <div className="truncate text-sm font-semibold">
                      {session.title || "新对话"}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
                      aria-label="导出对话"
                      title="导出对话"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleExport(session);
                      }}
                      disabled={exportingId === session.sessionId || deletingId === session.sessionId}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-destructive"
                      aria-label="删除对话"
                      title="删除对话"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(session.sessionId);
                      }}
                      disabled={deletingId === session.sessionId || exportingId === session.sessionId}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </PopoverContent>
  );
}
