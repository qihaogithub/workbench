"use client";

/**
 * CommentThreadPopover：评论线程面板。
 * - 展示主评论 + 回复列表 + 锚点元素信息。
 * - 操作：添加回复（支持 @提及）、解决/重新打开、删除线程、删除回复。
 * - @AI 任务显示状态。
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Bot, Check, GripVertical, MessageSquare, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import type { CommentAuthor, CommentMention, CommentThread } from "@workbench/shared";
import { cn } from "../utils";
import { AI_STATUS_LABEL } from "./comment-status";
import { MentionContent, MentionTextarea } from "./MentionPicker";
import type { AddReplyInput, MentionCandidate, UpdateCommentContentInput } from "./types";

export interface CommentThreadPopoverProps {
  thread: CommentThread;
  currentUser: CommentAuthor | null;
  mentionCandidates: MentionCandidate[];
  canMentionAgent?: boolean;
  left: number;
  top: number;
  onClose: () => void;
  onAddReply: (threadId: string, input: AddReplyInput) => Promise<unknown>;
  onUpdateComment: (threadId: string, input: UpdateCommentContentInput) => Promise<unknown>;
  onUpdateReply: (threadId: string, replyId: string, input: UpdateCommentContentInput) => Promise<unknown>;
  onSetResolved: (threadId: string, resolved: boolean) => Promise<unknown>;
  onDeleteThread: (threadId: string) => Promise<unknown>;
  onDeleteReply: (threadId: string, replyId: string) => Promise<unknown>;
  /** @AI 失败后重试（重新入队） */
  onRetryAiTask?: (threadId: string) => Promise<unknown>;
}

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
  onUpdateComment,
  onUpdateReply,
  onSetResolved,
  onDeleteThread,
  onDeleteReply,
  onRetryAiTask,
}: CommentThreadPopoverProps) {
  const [replyText, setReplyText] = useState("");
  const [replyMentions, setReplyMentions] = useState<CommentMention[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [editingThread, setEditingThread] = useState(false);
  const [editingThreadText, setEditingThreadText] = useState("");
  const [editingThreadMentions, setEditingThreadMentions] = useState<CommentMention[]>([]);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyText, setEditingReplyText] = useState("");
  const [editingReplyMentions, setEditingReplyMentions] = useState<CommentMention[]>([]);

  // 拖拽：基于初始定位的偏移量
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const anchor = thread.anchor;
  const aiStatus = thread.aiTaskStatus ? AI_STATUS_LABEL[thread.aiTaskStatus] : null;

  const candidates = canMentionAgent
    ? mentionCandidates
    : mentionCandidates.filter((c) => c.type !== "agent");

  // 视口钳制：弹窗宽 320px（w-80）、居中于 left，垂直顶部对齐 top。
  // 靠边时向内收缩，避免溢出视口。
  const clampedLeft = useMemo(() => {
    const w = 320;
    const offset = left + dragOffset.x;
    const half = w / 2;
    const min = half;
    const max = Math.max(half, window.innerWidth - half);
    return Math.min(max, Math.max(min, offset));
  }, [left, dragOffset.x]);
  const clampedTop = useMemo(() => {
    const offset = top + dragOffset.y;
    return Math.max(8, offset);
  }, [top, dragOffset.y]);

  /* ---- 拖拽：标题栏按住拖动弹窗 ---- */
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: dragOffset.x,
        origY: dragOffset.y,
      };
      const onMove = (ev: MouseEvent) => {
        const start = dragStartRef.current;
        if (!start) return;
        setDragOffset({
          x: start.origX + (ev.clientX - start.startX),
          y: start.origY + (ev.clientY - start.startY),
        });
      };
      const onUp = () => {
        dragStartRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [dragOffset],
  );

  const handleRetryAiTask = useCallback(async () => {
    if (!onRetryAiTask || retrying) return;
    setRetrying(true);
    setActionError(null);
    try {
      await onRetryAiTask(thread.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "重试失败");
    } finally {
      setRetrying(false);
    }
  }, [onRetryAiTask, retrying, thread.id]);

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

  /** 回复指定对象：预填 @被回复人 并聚焦输入框 */
  const handleReplyTo = useCallback(
    (author: CommentAuthor) => {
      const mention: CommentMention = author.isAgent
        ? { type: "agent", id: "agent", name: author.name }
        : { type: "user", id: author.id, name: author.name };
      const already = replyMentions.some(
        (m) => m.type === mention.type && m.id === mention.id,
      );
      setReplyText((prev) => {
        const mentionText = `@${mention.name} `;
        const trimmed = prev.trimEnd();
        return trimmed ? `${trimmed} ${mentionText}` : mentionText;
      });
      if (!already) {
        setReplyMentions((prev) => [...prev, mention]);
      }
      setActionError(null);
    },
    [replyMentions],
  );

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

  const startThreadEdit = useCallback(() => {
    setEditingThreadText(thread.content);
    setEditingThreadMentions(thread.mentions ?? []);
    setEditingThread(true);
    setActionError(null);
  }, [thread.content, thread.mentions]);

  const saveThreadEdit = useCallback(async () => {
    const content = editingThreadText.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onUpdateComment(thread.id, { content, mentions: editingThreadMentions });
      setEditingThread(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存修改失败");
    } finally {
      setSubmitting(false);
    }
  }, [editingThreadText, editingThreadMentions, submitting, onUpdateComment, thread.id]);

  const startReplyEdit = useCallback((reply: CommentThread["replies"][number]) => {
    setEditingReplyId(reply.id);
    setEditingReplyText(reply.content);
    setEditingReplyMentions(reply.mentions ?? []);
    setActionError(null);
  }, []);

  const saveReplyEdit = useCallback(async () => {
    const content = editingReplyText.trim();
    if (!editingReplyId || !content || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onUpdateReply(thread.id, editingReplyId, { content, mentions: editingReplyMentions });
      setEditingReplyId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "保存修改失败");
    } finally {
      setSubmitting(false);
    }
  }, [editingReplyId, editingReplyText, editingReplyMentions, submitting, onUpdateReply, thread.id]);

  return (
    <div
      className="absolute z-40 w-80 -translate-x-1/2 rounded-lg border border-border bg-popover shadow-lg"
      style={{ left: clampedLeft, top: clampedTop }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex cursor-move items-center gap-1.5 border-b border-border px-2 py-1.5 select-none"
        onMouseDown={handleDragStart}
        title="拖动调整位置"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
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
            <button type="button" onClick={startThreadEdit} title="编辑评论" className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
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
          {editingThread ? (
            <div className="space-y-1.5">
              <MentionTextarea value={editingThreadText} onChange={setEditingThreadText} mentions={editingThreadMentions} onMentionsChange={setEditingThreadMentions} candidates={candidates} rows={2} autoFocus onSubmit={() => void saveThreadEdit()} />
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setEditingThread(false)} className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">取消</button>
                <button type="button" onClick={() => void saveThreadEdit()} disabled={!editingThreadText.trim() || submitting} className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50">保存</button>
              </div>
            </div>
          ) : <MentionContent content={thread.content} mentions={thread.mentions} className="text-xs text-foreground" />}
          {aiStatus && (
            <span className={cn("ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px]", aiStatus.className)}>
              AI {aiStatus.text}
              {thread.aiTaskStatus === "failed" && onRetryAiTask && (
                <button
                  type="button"
                  onClick={() => void handleRetryAiTask()}
                  title="重新处理"
                  className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-background/40 px-1.5 py-0.5 text-[10px] font-medium text-current transition-colors hover:bg-background/70 disabled:opacity-50"
                  disabled={retrying}
                >
                  <RotateCcw className={cn("h-2.5 w-2.5", retrying && "animate-spin")} />
                  {retrying ? "重试中…" : "重试"}
                </button>
              )}
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
                      onClick={() => handleReplyTo(reply.author)}
                      title="回复该条"
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/reply:opacity-100"
                    >
                      <MessageSquare className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => startReplyEdit(reply)} title="编辑回复" className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/reply:opacity-100">
                      <Pencil className="h-3 w-3" />
                    </button>
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
                {editingReplyId === reply.id ? (
                  <div className="mt-1 space-y-1.5">
                    <MentionTextarea value={editingReplyText} onChange={setEditingReplyText} mentions={editingReplyMentions} onMentionsChange={setEditingReplyMentions} candidates={candidates} rows={2} autoFocus onSubmit={() => void saveReplyEdit()} />
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setEditingReplyId(null)} className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">取消</button>
                      <button type="button" onClick={() => void saveReplyEdit()} disabled={!editingReplyText.trim() || submitting} className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50">保存</button>
                    </div>
                  </div>
                ) : <MentionContent content={reply.content} mentions={reply.mentions} className="mt-0.5 text-xs text-foreground" />}
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
