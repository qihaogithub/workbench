"use client";

/**
 * CommentThreadPopover：评论线程面板。
 * - 展示主评论 + 回复列表 + 锚点元素信息。
 * - 操作：添加回复（支持 @提及）、解决/重新打开、删除线程、删除回复。
 * - @AI 任务显示状态。
 */
import { useCallback, useState } from "react";
import { Bot, Check, RotateCcw, Trash2, X } from "lucide-react";
import type { CommentAuthor, CommentMention, CommentThread } from "@workbench/shared";
import { cn } from "../utils";
import { MentionContent, MentionTextarea } from "./MentionPicker";
import type { AddReplyInput, MentionCandidate } from "./types";

export interface CommentThreadPopoverProps {
  thread: CommentThread;
  currentUser: CommentAuthor | null;
  mentionCandidates: MentionCandidate[];
  canMentionAgent?: boolean;
  left: number;
  top: number;
  onClose: () => void;
  onAddReply: (threadId: string, input: AddReplyInput) => Promise<unknown>;
  onSetResolved: (threadId: string, resolved: boolean) => Promise<unknown>;
  onDeleteThread: (threadId: string) => Promise<unknown>;
  onDeleteReply: (threadId: string, replyId: string) => Promise<unknown>;
}

const AI_STATUS_LABEL: Record<string, { text: string; className: string }> = {
  pending: { text: "排队中", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  processing: { text: "执行中", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  done: { text: "已完成", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  failed: { text: "失败", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (sameDay) return `${hh}:${mm}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  } catch {
    return "";
  }
}

function AuthorBadge({ author }: { author: CommentAuthor }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white",
          author.isAgent ? "bg-violet-500" : author.isAnonymous ? "bg-muted-foreground/60" : "bg-blue-500",
        )}
      >
        {author.isAgent ? <Bot className="h-3 w-3" /> : author.name.slice(0, 1)}
      </span>
      <span className="text-xs font-medium text-foreground">{author.name}</span>
      {author.isAnonymous && !author.isAgent && (
        <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">匿名</span>
      )}
    </span>
  );
}

export function CommentThreadPopover({
  thread,
  currentUser,
  mentionCandidates,
  canMentionAgent,
  left,
  top,
  onClose,
  onAddReply,
  onSetResolved,
  onDeleteThread,
  onDeleteReply,
}: CommentThreadPopoverProps) {
  const [replyText, setReplyText] = useState("");
  const [replyMentions, setReplyMentions] = useState<CommentMention[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const anchor = thread.anchor;
  const aiStatus = thread.aiTaskStatus ? AI_STATUS_LABEL[thread.aiTaskStatus] : null;

  const candidates = canMentionAgent
    ? mentionCandidates
    : mentionCandidates.filter((c) => c.type !== "agent");

  const handleSubmitReply = useCallback(async () => {
    const content = replyText.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onAddReply(thread.id, { content, mentions: replyMentions });
      setReplyText("");
      setReplyMentions([]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "回复失败");
    } finally {
      setSubmitting(false);
    }
  }, [replyText, replyMentions, submitting, onAddReply, thread.id]);

  const handleToggleResolved = useCallback(async () => {
    setActionError(null);
    try {
      await onSetResolved(thread.id, !thread.resolved);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "操作失败");
    }
  }, [onSetResolved, thread.id, thread.resolved]);

  const handleDeleteThread = useCallback(async () => {
    if (!window.confirm("确定删除这条评论及其所有回复吗？")) return;
    setActionError(null);
    try {
      await onDeleteThread(thread.id);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除失败");
    }
  }, [onDeleteThread, thread.id, onClose]);

  const handleDeleteReply = useCallback(
    async (replyId: string) => {
      if (!window.confirm("确定删除这条回复吗？")) return;
      setActionError(null);
      try {
        await onDeleteReply(thread.id, replyId);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "删除失败");
      }
    },
    [onDeleteReply, thread.id],
  );

  return (
    <div
      className="absolute z-40 w-80 -translate-x-1/2 rounded-lg border border-border bg-popover shadow-lg"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <AuthorBadge author={thread.author} />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">{formatTime(thread.createdAt)}</span>
          <button
            type="button"
            onClick={handleToggleResolved}
            title={thread.resolved ? "重新打开" : "标记解决"}
            className={cn(
              "rounded p-1 transition-colors",
              thread.resolved
                ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                : "text-emerald-600 hover:bg-emerald-500/10",
            )}
          >
            {thread.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleDeleteThread}
            title="删除评论"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto px-3 py-2">
        {anchor && (
          <div className="mb-2 rounded border border-border/60 bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="font-mono">&lt;{anchor.tagName}&gt;</span>
              {anchor.componentName && anchor.componentName !== anchor.tagName && (
                <span className="truncate">{anchor.componentName}</span>
              )}
            </div>
            {anchor.textSnippet && (
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {anchor.textSnippet}
              </div>
            )}
          </div>
        )}

        <div className="mb-1">
          <MentionContent content={thread.content} mentions={thread.mentions} className="text-xs text-foreground" />
          {aiStatus && (
            <span className={cn("ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px]", aiStatus.className)}>
              AI {aiStatus.text}
            </span>
          )}
        </div>

        {thread.replies.length > 0 && (
          <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
            {thread.replies.map((reply) => (
              <div key={reply.id} className="group/reply">
                <div className="flex items-center justify-between gap-2">
                  <AuthorBadge author={reply.author} />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{formatTime(reply.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteReply(reply.id)}
                      title="删除回复"
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover/reply:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <MentionContent
                  content={reply.content}
                  mentions={reply.mentions}
                  className="mt-0.5 text-xs text-foreground"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-3 py-2">
        <MentionTextarea
          value={replyText}
          onChange={setReplyText}
          mentions={replyMentions}
          onMentionsChange={setReplyMentions}
          candidates={candidates}
          rows={2}
          placeholder={currentUser ? "回复…（@ 可提及，⌘/Ctrl+Enter 发送）" : "以当前身份回复…"}
          onSubmit={() => void handleSubmitReply()}
        />
        {actionError && <div className="mt-1 text-[11px] text-red-500">{actionError}</div>}
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSubmitReply()}
            disabled={!replyText.trim() || submitting}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "发送中…" : "回复"}
          </button>
        </div>
      </div>
    </div>
  );
}
