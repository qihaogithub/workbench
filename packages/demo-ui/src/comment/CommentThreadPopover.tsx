"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Check, MoreHorizontal, RotateCcw, X } from "lucide-react";
import type { CommentAuthor, CommentMention, CommentThread } from "@workbench/shared";
import { cn } from "../utils";
import { renderNoteMarkdown } from "../note-html";
import { AI_STATUS_LABEL } from "./comment-status";
import { CommentComposer } from "./CommentComposer";
import { COMMENT_VISUAL_TOKENS, commentAvatarColor } from "./comment-theme";
import { usePopoverDrag } from "./usePopoverDrag";
import type {
  AddReplyInput,
  CommentImageUploadHandler,
  MentionCandidate,
  UpdateCommentContentInput,
  MentionCandidateSearch,
  CommentDeliverySummary,
} from "./types";

export interface CommentThreadPopoverProps {
  thread: CommentThread;
  currentUser: CommentAuthor | null;
  mentionCandidates: MentionCandidate[];
  searchMentionCandidates?: MentionCandidateSearch;
  canMentionAgent?: boolean;
  left: number;
  top: number;
  mediaBaseUrl?: string;
  uploadCommentImage?: CommentImageUploadHandler;
  onClose: () => void;
  onAddReply: (threadId: string, input: AddReplyInput) => Promise<unknown>;
  onUpdateComment: (threadId: string, input: UpdateCommentContentInput) => Promise<unknown>;
  onUpdateReply: (threadId: string, replyId: string, input: UpdateCommentContentInput) => Promise<unknown>;
  onSetResolved: (threadId: string, resolved: boolean) => Promise<unknown>;
  onDeleteThread: (threadId: string) => Promise<unknown>;
  onDeleteReply: (threadId: string, replyId: string) => Promise<unknown>;
  onRetryAiTask?: (threadId: string) => Promise<unknown>;
  onRetryDingtalkNotifications?: (threadId: string, replyId?: string) => Promise<unknown>;
}

export function CommentDeliveryStatus({ summary, onRetry }: { summary?: CommentDeliverySummary; onRetry?: () => void }) {
  if (!summary || summary.total <= 0) return null;
  const failed = summary.failed ?? 0;
  return <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#bdbdbd]" role="status">
    钉钉通知：{failed > 0 ? `失败 ${failed}` : summary.pending ? `发送中 ${summary.pending}` : `已发送 ${summary.submitted ?? summary.total}`}
    {failed > 0 && onRetry && <button type="button" className="underline" onClick={() => void onRetry()}>重试</button>}
  </span>;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function Avatar({ author, size = "normal" }: { author: CommentAuthor; size?: "normal" | "small" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        size === "small" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]",
      )}
      style={{ backgroundColor: commentAvatarColor(author) }}
      aria-hidden="true"
    >
      {author.isAgent ? <Bot className={size === "small" ? "h-3 w-3" : "h-3.5 w-3.5"} /> : author.name.slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

function AuthorLine({ author, createdAt }: { author: CommentAuthor; createdAt: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar author={author} />
      <span className="truncate text-xs font-semibold text-[#f3f3f3]">{author.name}</span>
      {author.isAnonymous && <span className="rounded bg-white/10 px-1 text-[10px] text-[#bdbdbd]">匿名</span>}
      <time className="shrink-0 text-[11px] text-[#b5b5b5]" dateTime={new Date(createdAt).toISOString()}>{formatTime(createdAt)}</time>
    </div>
  );
}

function MarkdownContent({ content, mediaBaseUrl, className }: { content: string; mediaBaseUrl?: string; className?: string }) {
  return (
    <div
      className={cn("comment-markdown min-w-0 break-words text-[13px] leading-5 text-[#ededed] [&_a]:text-[#79c7ff] [&_img]:my-1 [&_img]:max-h-48 [&_img]:max-w-full [&_img]:rounded-md", className)}
      dangerouslySetInnerHTML={{ __html: renderNoteMarkdown(content, { mediaBaseUrl }) }}
    />
  );
}

function MoreMenu({
  open,
  onToggle,
  onResolve,
  resolved,
  canDelete,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  onResolve?: () => void;
  resolved?: boolean;
  canDelete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const menuWidth = menuRect?.width || 176;
    const menuHeight = menuRect?.height || 128;
    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
    const left = Math.min(
      Math.max(8, triggerRect.right - menuWidth),
      Math.max(8, viewportWidth - menuWidth - 8),
    );
    const below = triggerRect.bottom + 8;
    const above = triggerRect.top - menuHeight - 8;
    const top = below + menuHeight <= viewportHeight - 8 || above < 8 ? Math.max(8, below) : above;
    setPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const onViewportChange = () => updatePosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, updatePosition]);

  if (!onResolve && !onEdit && !canDelete) return null;

  return (
    <span className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="更多评论操作"
        title="更多"
        onClick={onToggle}
        className={cn("inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#dedede] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]", open && "bg-[#3e5578] text-white")}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[120] min-w-40 rounded-xl border border-[#4e4e4e] bg-[#292929] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,.48)]"
              role="menu"
              style={position ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: "hidden" }}
            >
              {onResolve && (
                <button type="button" role="menuitem" onClick={() => { triggerRef.current?.focus(); onResolve(); }} className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs text-[#f5f5f5] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]">
                  {resolved ? "标记为未读" : "标记为已解决"}
                </button>
              )}
              {onEdit && (
                <button type="button" role="menuitem" onClick={() => { triggerRef.current?.focus(); onEdit(); }} className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs text-[#f5f5f5] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]">编辑评论</button>
              )}
              {canDelete && onDelete && (
                <button type="button" role="menuitem" onClick={() => { triggerRef.current?.focus(); onDelete(); }} className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-xs text-[#ffaaa0] hover:bg-[#ff4b3d]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]">删除评论…</button>
              )}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

type DeleteTarget = { kind: "thread" } | { kind: "reply"; replyId: string };

export function CommentThreadPopover({
  thread,
  currentUser,
  mentionCandidates,
  searchMentionCandidates,
  canMentionAgent,
  left,
  top,
  mediaBaseUrl,
  uploadCommentImage,
  onClose,
  onAddReply,
  onUpdateComment,
  onUpdateReply,
  onSetResolved,
  onDeleteThread,
  onDeleteReply,
  onRetryAiTask,
  onRetryDingtalkNotifications,
}: CommentThreadPopoverProps) {
  const [replyText, setReplyText] = useState("");
  const [replyMentions, setReplyMentions] = useState<CommentMention[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingThread, setEditingThread] = useState(false);
  const [editingThreadText, setEditingThreadText] = useState("");
  const [editingThreadMentions, setEditingThreadMentions] = useState<CommentMention[]>([]);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyText, setEditingReplyText] = useState("");
  const [editingReplyMentions, setEditingReplyMentions] = useState<CommentMention[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);
  const candidates = canMentionAgent ? mentionCandidates : mentionCandidates.filter((candidate) => candidate.type !== "agent");
  const aiStatus = thread.aiTaskStatus ? AI_STATUS_LABEL[thread.aiTaskStatus] : null;
  const threadDelivery = (thread as CommentThread & { dingtalkDelivery?: CommentDeliverySummary }).dingtalkDelivery;
  const canEditThread = currentUser?.id === thread.author.id;
  const replies = useMemo(
    () => [...thread.replies].sort((a, b) => a.createdAt - b.createdAt),
    [thread.replies],
  );

  const clampedLeft = useMemo(() => {
    const width = 360;
    const viewport = typeof window === "undefined" ? 1200 : window.innerWidth;
    return Math.min(Math.max(width / 2 + 8, left), Math.max(width / 2 + 8, viewport - width / 2 - 8));
  }, [left]);
  const clampedTop = Math.max(8, top);
  const viewport = typeof window === "undefined" ? { width: 1200, height: 800 } : { width: window.innerWidth, height: window.innerHeight };
  const popoverWidth = 360;
  const minLeft = popoverWidth / 2 + 8;
  const maxLeft = Math.max(minLeft, viewport.width - popoverWidth / 2 - 8);
  const { position, dragging, dragHandleProps } = usePopoverDrag(clampedLeft, clampedTop, {
    resetKey: thread.id,
    minLeft,
    maxLeft,
    minTop: 8,
    maxTop: Math.max(8, viewport.height - 180),
  });

  const requestDelete = useCallback((target: DeleteTarget) => {
    const activeElement = document.activeElement;
    deleteReturnFocusRef.current = activeElement instanceof HTMLElement && popoverRef.current?.contains(activeElement)
      ? activeElement
      : null;
    setDeleteTarget(target);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null);
    requestAnimationFrame(() => {
      const previous = deleteReturnFocusRef.current;
      if (previous?.isConnected) {
        previous.focus();
      } else {
        popoverRef.current?.querySelector<HTMLElement>('[aria-label="更多评论操作"]')?.focus();
      }
    });
  }, []);

  useEffect(() => {
    if (!deleteTarget) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDeleteDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDeleteDialog, deleteTarget]);

  const handleReply = useCallback(async () => {
    const content = replyText.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onAddReply(thread.id, { content, mentions: replyMentions });
      setReplyText("");
      setReplyMentions([]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "回复失败");
    } finally {
      setSubmitting(false);
    }
  }, [onAddReply, replyMentions, replyText, submitting, thread.id]);

  const saveThreadEdit = useCallback(async () => {
    const content = editingThreadText.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onUpdateComment(thread.id, { content, mentions: editingThreadMentions });
      setEditingThread(false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "保存修改失败");
    } finally {
      setSubmitting(false);
    }
  }, [editingThreadMentions, editingThreadText, onUpdateComment, submitting, thread.id]);

  const saveReplyEdit = useCallback(async () => {
    const content = editingReplyText.trim();
    if (!editingReplyId || !content || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onUpdateReply(thread.id, editingReplyId, { content, mentions: editingReplyMentions });
      setEditingReplyId(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "保存修改失败");
    } finally {
      setSubmitting(false);
    }
  }, [editingReplyId, editingReplyMentions, editingReplyText, onUpdateReply, submitting, thread.id]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    closeDeleteDialog();
    setActionError(null);
    try {
      if (target.kind === "thread") {
        await onDeleteThread(thread.id);
        onClose();
      } else {
        await onDeleteReply(thread.id, target.replyId);
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const toggleResolved = async () => {
    setMenu(null);
    setActionError(null);
    try {
      await onSetResolved(thread.id, !thread.resolved);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  return (
    <>
      {deleteTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4" onMouseDown={closeDeleteDialog}>
          <div ref={dialogRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="comment-delete-title" aria-describedby="comment-delete-description" className="w-[min(320px,100%)] rounded-xl border border-[#505050] bg-[#2b2b2b] text-[#f4f4f4] shadow-[0_18px_45px_rgba(0,0,0,.6)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#505050] px-4 py-3">
              <h2 id="comment-delete-title" className="text-sm font-semibold">删除评论</h2>
              <button type="button" aria-label="关闭删除确认" onClick={closeDeleteDialog} className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#d4d4d4] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]"><X className="h-4 w-4" /></button>
            </div>
            <p id="comment-delete-description" className="px-4 py-4 text-xs leading-5 text-[#e1e1e1]">确定删除这条评论吗？删除评论线程时，其所有回复也会一并删除。</p>
            <div className="flex justify-end gap-2 border-t border-[#505050] px-4 py-3">
              <button type="button" onClick={closeDeleteDialog} className="cursor-pointer rounded-md border border-[#777] px-3 py-1 text-xs hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]">取消</button>
              <button type="button" onClick={() => void confirmDelete()} className="cursor-pointer rounded-md bg-[#ffc0c0] px-3 py-1 text-xs font-semibold text-[#3c1616] hover:bg-[#ffd1d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff]">删除</button>
            </div>
          </div>
        </div>
      )}
      <div
        ref={popoverRef}
        className={cn("absolute z-40 w-[min(360px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl", COMMENT_VISUAL_TOKENS.card)}
        style={{ left: position.left, top: position.top }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-10 items-center justify-between border-b border-[#505050] px-3">
          <span
            {...dragHandleProps}
            className={cn("flex-1 cursor-move touch-none select-none text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]", dragging && "cursor-grabbing")}
          >
            评论
          </span>
          <div className="flex items-center gap-1">
            <MoreMenu open={menu === "header"} onToggle={() => setMenu(menu === "header" ? null : "header")} onResolve={toggleResolved} resolved={thread.resolved} canDelete={canEditThread} onDelete={() => { setMenu(null); requestDelete({ kind: "thread" }); }} />
            <button type="button" aria-label={thread.resolved ? "标记为未读" : "标记为已解决"} title={thread.resolved ? "标记为未读" : "标记为已解决"} onClick={() => void toggleResolved()} className={cn("inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]", thread.resolved ? "text-[#b9b9b9] hover:bg-white/10" : "text-[#ededed] hover:bg-[#2f5f77]")}>
              {thread.resolved ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            </button>
            <button type="button" aria-label="关闭评论" title="关闭" onClick={onClose} className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#d4d4d4] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="max-h-[min(510px,calc(100vh-120px))] overflow-y-auto px-4 py-3">
          <article className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <AuthorLine author={thread.author} createdAt={thread.createdAt} />
              <MoreMenu open={menu === "thread"} onToggle={() => setMenu(menu === "thread" ? null : "thread")} onEdit={canEditThread ? () => { setMenu(null); setEditingThreadText(thread.content); setEditingThreadMentions(thread.mentions ?? []); setEditingThread(true); } : undefined} canDelete={canEditThread} onDelete={canEditThread ? () => { setMenu(null); requestDelete({ kind: "thread" }); } : undefined} />
            </div>
            {editingThread ? (
              <div className="mt-2">
                <CommentComposer value={editingThreadText} onChange={setEditingThreadText} mentions={editingThreadMentions} onMentionsChange={setEditingThreadMentions} candidates={candidates} searchMentionCandidates={searchMentionCandidates} rows={2} autoFocus uploadCommentImage={uploadCommentImage} submitting={submitting} onCancel={() => setEditingThread(false)} onSubmit={() => void saveThreadEdit()} />
              </div>
            ) : <MarkdownContent content={thread.content} mediaBaseUrl={mediaBaseUrl} className="mt-2 pl-8" />}
            <CommentDeliveryStatus summary={threadDelivery} onRetry={onRetryDingtalkNotifications ? () => onRetryDingtalkNotifications(thread.id) : undefined} />
            {aiStatus && <span className={cn("mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px]", aiStatus.className)}>AI {aiStatus.text}{thread.aiTaskStatus === "failed" && onRetryAiTask && <button type="button" onClick={() => void onRetryAiTask(thread.id)} className="underline">重试</button>}</span>}
          </article>

          {replies.map((reply) => {
            const canEditReply = currentUser?.id === reply.author.id;
            return (
              <article key={reply.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <AuthorLine author={reply.author} createdAt={reply.createdAt} />
                  <MoreMenu open={menu === reply.id} onToggle={() => setMenu(menu === reply.id ? null : reply.id)} onEdit={canEditReply ? () => { setMenu(null); setEditingReplyId(reply.id); setEditingReplyText(reply.content); setEditingReplyMentions(reply.mentions ?? []); } : undefined} canDelete={canEditReply} onDelete={canEditReply ? () => { setMenu(null); requestDelete({ kind: "reply", replyId: reply.id }); } : undefined} />
                </div>
                {editingReplyId === reply.id ? (
                  <div className="mt-2 pl-8"><CommentComposer value={editingReplyText} onChange={setEditingReplyText} mentions={editingReplyMentions} onMentionsChange={setEditingReplyMentions} candidates={candidates} searchMentionCandidates={searchMentionCandidates} rows={2} autoFocus uploadCommentImage={uploadCommentImage} submitting={submitting} onCancel={() => setEditingReplyId(null)} onSubmit={() => void saveReplyEdit()} /></div>
                ) : <MarkdownContent content={reply.content} mediaBaseUrl={mediaBaseUrl} className="mt-2 pl-8" />}
                <CommentDeliveryStatus summary={(reply as typeof reply & { dingtalkDelivery?: CommentDeliverySummary }).dingtalkDelivery} onRetry={onRetryDingtalkNotifications ? () => onRetryDingtalkNotifications(thread.id, reply.id) : undefined} />
              </article>
            );
          })}
        </div>

        <footer className="p-3">
          <CommentComposer value={replyText} onChange={setReplyText} mentions={replyMentions} onMentionsChange={setReplyMentions} candidates={candidates} searchMentionCandidates={searchMentionCandidates} placeholder="回复" uploadCommentImage={uploadCommentImage} submitting={submitting} onSubmit={() => void handleReply()} />
          {actionError && <div className="mt-2 text-[11px] text-[#ffaaa0]" role="alert">{actionError}</div>}
        </footer>
      </div>
    </>
  );
}
