"use client";

import { Clock, MessageSquare, Plus, Trash2 } from "lucide-react";

import type { LocalChatSession } from "@workbench/ai-chat-shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ViewerAiHistoryDialogProps {
  open: boolean;
  sessions: LocalChatSession[];
  currentSessionId: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (session: LocalChatSession) => void;
  onDelete: (sessionId: string) => void;
  onNew: () => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffMinutes < 24 * 60) return `${Math.floor(diffMinutes / 60)} 小时前`;
  return date.toLocaleDateString("zh-CN");
}

export function ViewerAiHistoryDialog({
  open,
  sessions,
  currentSessionId,
  onOpenChange,
  onSelect,
  onDelete,
  onNew,
}: ViewerAiHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            对话历史
          </DialogTitle>
          <DialogDescription>
            历史保存在当前浏览器中，并按项目隔离。
          </DialogDescription>
        </DialogHeader>
        <Button onClick={onNew} className="w-full cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          新建对话
        </Button>
        <ScrollArea className="h-[320px] pr-3">
          {sessions.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-sm text-muted-foreground">
              <Clock className="mb-2 h-10 w-10 opacity-40" />
              暂无历史对话
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className={cn(
                    "flex w-full items-center gap-1 rounded-lg border p-1 transition-colors hover:bg-muted",
                    session.sessionId === currentSessionId &&
                      "border-primary bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer rounded-md p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelect(session)}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {session.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatTime(session.updatedAt)}</span>
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {session.messages.length}
                        </span>
                      </div>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                    aria-label="删除对话"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(session.sessionId);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
