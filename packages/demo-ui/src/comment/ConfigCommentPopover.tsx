"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  Circle,
  MessageSquare,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type {
  CommentMention,
  CommentThread,
  ConfigCommentTarget,
} from "@workbench/shared";
import { cn } from "../utils";
import { renderNoteMarkdown, stripMarkdown } from "../note-html";
import { uploadNoteFile } from "../note-upload";
import { CommentMarkdownEditor } from "./CommentMarkdownEditor";
import { CommentDeliveryStatus } from "./CommentThreadPopover";
import { COMMENT_VISUAL_TOKENS, commentAvatarColor } from "./comment-theme";
import type { ConfigCommentController, MentionCandidate } from "./types";

export interface ConfigCommentPopoverProps extends ConfigCommentController {
  target: ConfigCommentTarget;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function formatTime(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sameTarget(
  left: CommentThread["target"],
  right: ConfigCommentTarget,
): boolean {
  if (right.scope === "page" && !right.pageId) return false;
  return (
    left.kind === "config" &&
    left.scope === right.scope &&
    left.fieldKey === right.fieldKey &&
    (right.scope === "project"
      ? !left.pageId && !right.pageId
      : left.pageId === right.pageId)
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function MarkdownContent({
  content,
  mediaBaseUrl,
  className,
}: {
  content: string;
  mediaBaseUrl?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("markdown-editor-content min-w-0", className)}
      dangerouslySetInnerHTML={{ __html: renderNoteMarkdown(content, { mediaBaseUrl }) }}
    />
  );
}

function IconButton({
  label,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#bdbdbd] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff] disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ConfigAuthorBadge({ author }: { author: { id: string; name: string; isAgent?: boolean } }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: commentAvatarColor(author) }} aria-hidden="true">
        {author.isAgent ? <Bot className="h-3.5 w-3.5" /> : author.name.slice(0, 1).toUpperCase() || "?"}
      </span>
      <span className="min-w-0 max-w-[45%] truncate text-xs font-semibold text-[#f3f3f3]">{author.name}</span>
    </span>
  );
}

function mentionCandidatesFor(
  candidates: MentionCandidate[],
  canMentionAgent: boolean,
): MentionCandidate[] {
  return canMentionAgent
    ? candidates
    : candidates.filter((candidate) => candidate.type !== "agent");
}

export function ConfigCommentPopover({
  target,
  threads,
  currentUser = null,
  uploadCommentImage,
  mediaBaseUrl,
  mentionCandidates = [],
  searchMentionCandidates,
  canMentionAgent = false,
  readOnly = false,
  onCreateComment,
  onAddReply,
  onUpdateComment,
  onUpdateReply,
  onSetResolved,
  onDeleteThread,
  onDeleteReply,
  onRetryDingtalkNotifications,
}: ConfigCommentPopoverProps) {
  const [newDraft, setNewDraft] = useState("");
  const [newMentions, setNewMentions] = useState<CommentMention[]>([]);
  const [newState, setNewState] = useState<SaveState>("idle");
  const [newError, setNewError] = useState<string | null>(null);
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyMentions, setReplyMentions] = useState<
    Record<string, CommentMention[]>
  >({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingMentions, setEditingMentions] = useState<CommentMention[]>([]);
  const [editingState, setEditingState] = useState<SaveState>("idle");
  const [editingError, setEditingError] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<{
    threadId: string;
    replyId: string;
  } | null>(null);
  const [editingReplyText, setEditingReplyText] = useState("");
  const [editingReplyMentions, setEditingReplyMentions] = useState<
    CommentMention[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "thread"; threadId: string } | { kind: "reply"; threadId: string; replyId: string } | null
  >(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);

  const canEdit = useCallback(
    (author: { id: string }) => Boolean(currentUser && currentUser.id === author.id),
    [currentUser],
  );

  const requestDelete = useCallback((target: { kind: "thread"; threadId: string } | { kind: "reply"; threadId: string; replyId: string }) => {
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
        popoverRef.current?.querySelector<HTMLElement>('[aria-label="编辑批注"], [aria-label="更多批注操作"]')?.focus();
      }
    });
  }, []);

  useEffect(() => {
    if (!deleteTarget) return;
    deleteDialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDeleteDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDeleteDialog, deleteTarget]);

  const mountedRef = useRef(true);
  const newDraftRef = useRef("");
  const newMentionsRef = useRef<CommentMention[]>([]);
  const editingIdRef = useRef<string | null>(null);
  const editingBaseRef = useRef("");
  const editingBaseMentionsRef = useRef<CommentMention[]>([]);
  const editingDraftRef = useRef("");
  const editingMentionsRef = useRef<CommentMention[]>([]);
  const editingTimerRef = useRef<number | null>(null);
  const editingInFlightRef = useRef<{
    threadId: string;
    content: string;
    mentions: CommentMention[];
    promise: Promise<unknown>;
    succeeded: boolean | null;
  } | null>(null);
  const editingFinishRequestedRef = useRef(false);
  const editingGenerationRef = useRef(0);
  const editingQueuedRef = useRef<{
    threadId: string;
    content: string;
    mentions: CommentMention[];
  } | null>(null);
  const newSubmittingRef = useRef(false);
  const onUpdateCommentRef = useRef(onUpdateComment);
  const onCreateCommentRef = useRef(onCreateComment);

  onUpdateCommentRef.current = onUpdateComment;
  onCreateCommentRef.current = onCreateComment;
  newDraftRef.current = newDraft;
  newMentionsRef.current = newMentions;
  editingIdRef.current = editingId;
  editingDraftRef.current = editingDraft;
  editingMentionsRef.current = editingMentions;

  const targetThreads = useMemo(
    () =>
      threads
        .filter((thread) => sameTarget(thread.target, target))
        .sort((left, right) => right.createdAt - left.createdAt),
    [target, threads],
  );
  const candidates = useMemo(
    () => mentionCandidatesFor(mentionCandidates, canMentionAgent),
    [canMentionAgent, mentionCandidates],
  );

  const clearEditingTimer = useCallback(() => {
    if (editingTimerRef.current !== null) {
      window.clearTimeout(editingTimerRef.current);
      editingTimerRef.current = null;
    }
  }, []);

  const saveEditing = useCallback(
    async (): Promise<boolean> => {
      const threadId = editingIdRef.current;
      const update = onUpdateCommentRef.current;
      if (!threadId || !update) return true;
      const generation = editingGenerationRef.current;
      const draft = editingDraftRef.current;
      const mentions = editingMentionsRef.current;
      const content = draft.trim();
      if (!stripMarkdown(content)) {
        const restored = editingBaseRef.current;
        const restoredMentions = editingBaseMentionsRef.current;
        setEditingDraft(restored);
        editingDraftRef.current = restored;
        setEditingMentions(restoredMentions);
        editingMentionsRef.current = restoredMentions;
        // If an older non-empty save is still in flight, enqueue the last
        // saved value so clearing the editor cannot leave that older value as
        // the eventual server state. No empty request is ever sent.
        const inFlight = editingInFlightRef.current;
        if (inFlight && restored && inFlight.content !== restored) {
          editingQueuedRef.current = {
            threadId,
            content: restored,
            mentions: restoredMentions,
          };
          setEditingState("dirty");
          return false;
        }
        setEditingState("idle");
        return true;
      }
      if (content === editingBaseRef.current && !editingQueuedRef.current) {
        setEditingState("idle");
        return true;
      }

      const request = {
        threadId,
        content,
        mentions,
      };
      editingQueuedRef.current = request;
      if (editingInFlightRef.current) {
        setEditingState("dirty");
        return false;
      }

      const next = editingQueuedRef.current;
      if (!next) return true;
      editingQueuedRef.current = null;
      setEditingState("saving");
      setEditingError(null);
      const requestPromise = Promise.resolve().then(() =>
        update(next.threadId, {
          content: next.content,
          mentions: next.mentions,
        }),
      );
      editingInFlightRef.current = {
        ...next,
        promise: requestPromise,
        succeeded: null,
      };
      try {
        await requestPromise;
        if (editingInFlightRef.current?.promise === requestPromise) {
          editingInFlightRef.current.succeeded = true;
        }
        if (!mountedRef.current || generation !== editingGenerationRef.current)
          return true;
        if (editingQueuedRef.current) {
          editingInFlightRef.current = null;
          return saveEditing();
        }
        editingBaseRef.current = next.content;
        editingBaseMentionsRef.current = next.mentions;
        setEditingState("saved");
        editingInFlightRef.current = null;
        if (editingFinishRequestedRef.current) {
          editingFinishRequestedRef.current = false;
          editingIdRef.current = null;
          setEditingId(null);
          setEditingError(null);
        }
        return true;
      } catch (cause) {
        if (editingInFlightRef.current?.promise === requestPromise) {
          editingInFlightRef.current.succeeded = false;
        }
        if (mountedRef.current) {
          setEditingError(errorMessage(cause, "批注自动保存失败"));
          setEditingState("error");
        }
        editingInFlightRef.current = null;
        // 保留请求进行期间产生的最新草稿；只有没有更新的排队内容时，
        // 才把失败请求放回队列供“重试”入口提交。
        editingQueuedRef.current = editingQueuedRef.current ?? next;
        return false;
      }
    },
    [],
  );

  const scheduleEditingSave = useCallback(() => {
    clearEditingTimer();
    setEditingState("dirty");
    editingTimerRef.current = window.setTimeout(() => {
      editingTimerRef.current = null;
      void saveEditing();
    }, 800);
  }, [clearEditingTimer, saveEditing]);

  const finishEditing = useCallback(
    async () => {
      clearEditingTimer();
      editingFinishRequestedRef.current = true;
      const saved = await saveEditing();
      if (saved && mountedRef.current) {
        editingFinishRequestedRef.current = false;
        editingIdRef.current = null;
        setEditingId(null);
        setEditingError(null);
      }
      return saved;
    },
    [clearEditingTimer, saveEditing],
  );

  const startEditing = useCallback(
    (thread: CommentThread) => {
      clearEditingTimer();
      editingGenerationRef.current += 1;
      editingQueuedRef.current = null;
      editingInFlightRef.current = null;
      editingFinishRequestedRef.current = false;
      editingBaseRef.current = thread.content;
      editingBaseMentionsRef.current = thread.mentions ?? [];
      editingDraftRef.current = thread.content;
      editingMentionsRef.current = thread.mentions ?? [];
      editingIdRef.current = thread.id;
      setEditingId(thread.id);
      setEditingDraft(thread.content);
      setEditingMentions(thread.mentions ?? []);
      setEditingState("idle");
      setEditingError(null);
      setEditingReply(null);
    },
    [clearEditingTimer],
  );

  const handleEditingBlur = useCallback(() => {
    void finishEditing();
  }, [finishEditing]);

  const handleEditingChange = useCallback(
    (value: string) => {
      setEditingDraft(value);
      editingDraftRef.current = value;
      scheduleEditingSave();
    },
    [scheduleEditingSave],
  );

  const cancelEditing = useCallback(() => {
    clearEditingTimer();
    editingGenerationRef.current += 1;
    editingQueuedRef.current = null;
    editingInFlightRef.current = null;
    editingFinishRequestedRef.current = false;
    const restored = editingBaseRef.current;
    editingDraftRef.current = restored;
    setEditingDraft(restored);
    setEditingMentions(editingBaseMentionsRef.current);
    editingMentionsRef.current = editingBaseMentionsRef.current;
    setEditingError(null);
    editingIdRef.current = null;
    setEditingId(null);
  }, [clearEditingTimer]);

  const handleCreate = useCallback(async () => {
    const content = newDraft.trim();
    const create = onCreateCommentRef.current;
    if (
      readOnly ||
      !create ||
      !stripMarkdown(content) ||
      newSubmittingRef.current
    )
      return;
    newSubmittingRef.current = true;
    setNewState("saving");
    setNewError(null);
    try {
      await create({ target, content, mentions: newMentions });
      if (!mountedRef.current) return;
      setNewDraft("");
      setNewMentions([]);
      setNewState("saved");
    } catch (cause) {
      if (mountedRef.current) {
        setNewState("error");
        setNewError(errorMessage(cause, "批注保存失败"));
      }
    } finally {
      newSubmittingRef.current = false;
    }
  }, [newDraft, newMentions, readOnly, target]);

  const handleReply = useCallback(
    async (threadId: string) => {
      const content = replyText[threadId]?.trim() ?? "";
      if (readOnly || !onAddReply || !content || submitting) return;
      setSubmitting(true);
      setActionError(null);
      try {
        await onAddReply(threadId, {
          content,
          mentions: replyMentions[threadId] ?? [],
        });
        if (!mountedRef.current) return;
        setReplyText((current) => ({ ...current, [threadId]: "" }));
        setReplyMentions((current) => ({ ...current, [threadId]: [] }));
        setReplyThreadId(null);
      } catch (cause) {
        setActionError(errorMessage(cause, "回复失败"));
      } finally {
        setSubmitting(false);
      }
    },
    [onAddReply, readOnly, replyMentions, replyText, submitting],
  );

  const handleUpdateReply = useCallback(async () => {
    if (
      readOnly ||
      !editingReply ||
      !onUpdateReply ||
      !stripMarkdown(editingReplyText) ||
      submitting
    )
      return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onUpdateReply(editingReply.threadId, editingReply.replyId, {
        content: editingReplyText.trim(),
        mentions: editingReplyMentions,
      });
      if (!mountedRef.current) return;
      setEditingReply(null);
      setEditingReplyText("");
      setEditingReplyMentions([]);
    } catch (cause) {
      setActionError(errorMessage(cause, "回复更新失败"));
    } finally {
      setSubmitting(false);
    }
  }, [
    editingReply,
    editingReplyMentions,
    editingReplyText,
    onUpdateReply,
    readOnly,
    submitting,
  ]);

  const handleSetResolved = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (readOnly || !onSetResolved || submitting) return;
      setSubmitting(true);
      setActionError(null);
      try {
        await onSetResolved(threadId, resolved);
      } catch (cause) {
        setActionError(errorMessage(cause, "更新批注状态失败"));
      } finally {
        setSubmitting(false);
      }
    },
    [onSetResolved, readOnly, submitting],
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      if (readOnly || !onDeleteThread || submitting) return;
      setSubmitting(true);
      setActionError(null);
      try {
        await onDeleteThread(threadId);
      } catch (cause) {
        setActionError(errorMessage(cause, "删除批注失败"));
      } finally {
        setSubmitting(false);
      }
    },
    [onDeleteThread, readOnly, submitting],
  );

  const handleDeleteReply = useCallback(
    async (threadId: string, replyId: string) => {
      if (readOnly || !onDeleteReply || submitting) return;
      setSubmitting(true);
      setActionError(null);
      try {
        await onDeleteReply(threadId, replyId);
      } catch (cause) {
        setActionError(errorMessage(cause, "回复删除失败"));
      } finally {
        setSubmitting(false);
      }
    },
    [onDeleteReply, readOnly, submitting],
  );

  const requestDeleteThread = useCallback(
    (threadId: string) => {
      if (!readOnly && onDeleteThread && !submitting) requestDelete({ kind: "thread", threadId });
    },
    [onDeleteThread, readOnly, requestDelete, submitting],
  );

  const requestDeleteReply = useCallback(
    (threadId: string, replyId: string) => {
      if (!readOnly && onDeleteReply && !submitting) requestDelete({ kind: "reply", threadId, replyId });
    },
    [onDeleteReply, readOnly, requestDelete, submitting],
  );

  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target) return;
    closeDeleteDialog();
    if (target.kind === "thread") await handleDeleteThread(target.threadId);
    else await handleDeleteReply(target.threadId, target.replyId);
  }, [closeDeleteDialog, deleteTarget, handleDeleteReply, handleDeleteThread]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      editingGenerationRef.current += 1;
      clearEditingTimer();
      const threadId = editingIdRef.current;
      const content = editingDraftRef.current.trim();
      const mentions = editingMentionsRef.current;
      const update = onUpdateCommentRef.current;
      const inFlight = editingInFlightRef.current;
      if (threadId && update && stripMarkdown(content)) {
        void (async () => {
          // 关闭气泡时先等待已经发出的请求，避免 flush 的最新草稿
          // 与旧请求竞态导致服务端最终落回旧内容。
          if (inFlight) {
            await inFlight.promise.catch(() => undefined);
          }
          if (content === inFlight?.content && inFlight.succeeded) return;
          await Promise.resolve()
            .then(() => update(threadId, { content, mentions }))
            .catch(() => undefined);
        })();
      }
      const newContent = newDraftRef.current.trim();
      if (
        !readOnly &&
        newContent &&
        stripMarkdown(newContent) &&
        onCreateCommentRef.current &&
        !newSubmittingRef.current
      ) {
        newSubmittingRef.current = true;
        void onCreateCommentRef.current({
          target,
          content: newContent,
          mentions: newMentionsRef.current,
        });
      }
    };
  }, [clearEditingTimer, target.scope, target.pageId, target.fieldKey]);

  useEffect(() => {
    clearEditingTimer();
    newSubmittingRef.current = false;
    editingGenerationRef.current += 1;
    editingQueuedRef.current = null;
    editingInFlightRef.current = null;
    editingFinishRequestedRef.current = false;
    editingIdRef.current = null;
    setNewDraft("");
    setNewMentions([]);
    setNewState("idle");
    setNewError(null);
    setReplyThreadId(null);
    setReplyText({});
    setReplyMentions({});
    setEditingId(null);
    setEditingDraft("");
    setEditingMentions([]);
    setEditingState("idle");
    setEditingError(null);
    setEditingReply(null);
    setEditingReplyText("");
    setEditingReplyMentions([]);
    setActionError(null);
  }, [clearEditingTimer, target.scope, target.pageId, target.fieldKey]);

  return (
    <>
      {deleteTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4" onMouseDown={closeDeleteDialog}>
          <div ref={deleteDialogRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="config-comment-delete-title" aria-describedby="config-comment-delete-description" className="w-[min(320px,100%)] rounded-xl border border-[#505050] bg-[#2b2b2b] text-[#f4f4f4] shadow-[0_18px_45px_rgba(0,0,0,.6)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#505050] px-4 py-3"><h2 id="config-comment-delete-title" className="text-sm font-semibold">删除批注</h2><button type="button" aria-label="关闭删除确认" onClick={closeDeleteDialog} className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#d4d4d4] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]"><X className="h-4 w-4" /></button></div>
            <p id="config-comment-delete-description" className="px-4 py-4 text-xs leading-5 text-[#e1e1e1]">确定删除这条批注吗？删除批注线程时，其所有回复也会一并删除。</p>
            <div className="flex justify-end gap-2 border-t border-[#505050] px-4 py-3"><button type="button" onClick={closeDeleteDialog} className="cursor-pointer rounded-md border border-[#777] px-3 py-1 text-xs hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]">取消</button><button type="button" onClick={() => void confirmDelete()} className="cursor-pointer rounded-md bg-[#ffc0c0] px-3 py-1 text-xs font-semibold text-[#3c1616] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff]">删除</button></div>
          </div>
        </div>
      )}
    <div ref={popoverRef} className={cn("flex min-h-0 flex-1 flex-col", COMMENT_VISUAL_TOKENS.card)}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {targetThreads.length === 0 ? (
          <p className="py-5 text-center text-sm text-[#bdbdbd]">
            暂无批注
          </p>
        ) : (
          <section className="space-y-2.5" aria-label="配置项批注列表">
            {targetThreads.map((thread) => (
              <article
                key={thread.id}
                className={cn(
                  "rounded-xl border border-[#4d4d4d] bg-[#303030] p-3",
                  thread.resolved && "opacity-80",
                )}
              >
                <div className="mb-2 flex min-w-0 items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ConfigAuthorBadge author={thread.author} />
                    <time
                      dateTime={new Date(thread.createdAt).toISOString()}
                      className="shrink-0 whitespace-nowrap text-[11px] text-[#b5b5b5]"
                    >
                      {formatTime(thread.createdAt)}
                    </time>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {onAddReply && (
                        <IconButton
                          label="回复批注"
                          onClick={() => {
                            setEditingReply(null);
                            setEditingReplyText("");
                            setEditingReplyMentions([]);
                            setReplyThreadId((current) =>
                              current === thread.id ? null : thread.id,
                            );
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </IconButton>
                      )}
                      {onUpdateComment && canEdit(thread.author) && (
                        <IconButton
                          label="编辑批注"
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            // The browser may apply the button's default focus
                            // after click dispatch even when pointerdown was
                            // prevented. Release it before mounting Milkdown so
                            // autoFocus can settle on the editor instead.
                            const trigger = event.currentTarget;
                            trigger.blur();
                            startEditing(thread);
                            queueMicrotask(() => trigger.blur());
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                      )}
                      {onSetResolved && (
                        <IconButton
                          label={thread.resolved ? "恢复批注" : "完成批注"}
                          className={
                            thread.resolved ? undefined : "text-emerald-600"
                          }
                          disabled={submitting}
                          onClick={() =>
                            void handleSetResolved(thread.id, !thread.resolved)
                          }
                        >
                          {thread.resolved ? (
                            <RotateCcw className="h-4 w-4" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </IconButton>
                      )}
                      {onDeleteThread && canEdit(thread.author) && (
                        <IconButton
                          label="删除批注"
                          className="hover:bg-[#ff4b3d]/15 hover:text-[#ffaaa0]"
                          disabled={submitting}
                          onClick={() => requestDeleteThread(thread.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      )}
                    </div>
                  )}
                  {readOnly && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px]",
                        thread.resolved
                          ? "text-emerald-600"
                          : "text-[#bdbdbd]",
                      )}
                    >
                      {thread.resolved ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          className="h-3.5 w-3.5 text-[#bdbdbd]"
                          aria-hidden="true"
                        />
                      )}
                      {thread.resolved ? "已完成" : "未完成"}
                    </span>
                  )}
                </div>

                {editingId === thread.id ? (
                  <div className="space-y-1.5">
                    <CommentMarkdownEditor
                      value={editingDraft}
                      onChange={handleEditingChange}
                      mentions={editingMentions}
                      onMentionsChange={setEditingMentions}
                      mentionCandidates={candidates}
                      searchMentionCandidates={searchMentionCandidates}
                      canMentionAgent={canMentionAgent}
                      placeholder="修改批注…"
                      autoFocus
                      onBlur={handleEditingBlur}
                      onCancel={cancelEditing}
                      uploadHandler={uploadCommentImage ?? uploadNoteFile}
                    />
                    <div className="flex min-h-5 items-center justify-end gap-2 text-[11px]">
                      {editingState === "saving" && (
                        <span className="text-[#b5b5b5]">
                          自动保存中…
                        </span>
                      )}
                      {editingState === "saved" && (
                        <span className="text-emerald-600">已自动保存</span>
                      )}
                      {editingError && (
                        <>
                          <span className="text-[#ffaaa0]">
                            {editingError}
                          </span>
                          <IconButton
                            label="重试保存批注"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => void saveEditing()}
                            disabled={editingState === "saving"}
                            className="h-6 w-6 text-[#ffaaa0]"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </IconButton>
                        </>
                      )}
                      <IconButton
                        label="取消编辑"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={cancelEditing}
                      >
                        <X className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                ) : (
                  <MarkdownContent
                    content={thread.content}
                    mediaBaseUrl={mediaBaseUrl}
                    className="text-sm text-foreground"
                  />
                )}
                <CommentDeliveryStatus
                  summary={thread.dingtalkDelivery}
                  onRetry={!readOnly && onRetryDingtalkNotifications ? () => onRetryDingtalkNotifications(thread.id) : undefined}
                />

                {thread.replies.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-[#4d4d4d] pt-2">
                    {thread.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="rounded-lg border border-[#454545] bg-[#343434] p-2"
                      >
                        <div className="mb-1 flex min-w-0 items-center gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <ConfigAuthorBadge author={reply.author} />
                            <time
                              dateTime={new Date(reply.createdAt).toISOString()}
                              className="shrink-0 whitespace-nowrap text-[11px] text-[#b5b5b5]"
                            >
                              {formatTime(reply.createdAt)}
                            </time>
                          </div>
                          {!readOnly && (
                            <div className="flex shrink-0 items-center gap-0.5">
                              {onUpdateReply && canEdit(reply.author) && (
                                <IconButton
                                  label="编辑回复"
                                  onClick={() => {
                                    setEditingReply({
                                      threadId: thread.id,
                                      replyId: reply.id,
                                    });
                                    setEditingReplyText(reply.content);
                                    setEditingReplyMentions(
                                      reply.mentions ?? [],
                                    );
                                    setReplyThreadId(null);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </IconButton>
                              )}
                              {onDeleteReply && canEdit(reply.author) && (
                                <IconButton
                                  label="删除回复"
                                  className="hover:bg-[#ff4b3d]/15 hover:text-[#ffaaa0]"
                                  disabled={submitting}
                                  onClick={() =>
                                    requestDeleteReply(thread.id, reply.id)
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconButton>
                              )}
                            </div>
                          )}
                        </div>
                        {editingReply?.threadId === thread.id &&
                        editingReply.replyId === reply.id ? (
                          <div className="space-y-1.5">
                            <CommentMarkdownEditor
                              value={editingReplyText}
                              onChange={setEditingReplyText}
                              mentions={editingReplyMentions}
                              onMentionsChange={setEditingReplyMentions}
                              mentionCandidates={candidates}
                              searchMentionCandidates={searchMentionCandidates}
                              canMentionAgent={canMentionAgent}
                              placeholder="修改回复…"
                              autoFocus
                          uploadHandler={uploadCommentImage ?? uploadNoteFile}
                              onSubmit={() => void handleUpdateReply()}
                            />
                            <div className="flex justify-end gap-1">
                              <IconButton
                                label="取消编辑回复"
                                onPointerDown={(event) =>
                                  event.preventDefault()
                                }
                                onClick={() => {
                                  setEditingReply(null);
                                  setEditingReplyText("");
                                }}
                              >
                                <X className="h-4 w-4" />
                              </IconButton>
                              <IconButton
                                label="提交回复修改"
                                className="text-[#70bfff]"
                                disabled={
                                  !stripMarkdown(editingReplyText) || submitting
                                }
                                onClick={() => void handleUpdateReply()}
                              >
                                <Check className="h-4 w-4" />
                              </IconButton>
                            </div>
                          </div>
                        ) : (
                          <MarkdownContent
                            content={reply.content}
                            mediaBaseUrl={mediaBaseUrl}
                            className="text-xs text-foreground"
                          />
                        )}
                        <CommentDeliveryStatus
                          summary={reply.dingtalkDelivery}
                          onRetry={!readOnly && onRetryDingtalkNotifications ? () => onRetryDingtalkNotifications(thread.id, reply.id) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {replyThreadId === thread.id && !readOnly && onAddReply && (
                  <div className="mt-3 flex items-end gap-2 border-t border-[#4d4d4d] pt-2">
                    <div className="min-w-0 flex-1 rounded-xl border border-[#4d4d4d] bg-[#3a3a3a]">
                      <CommentMarkdownEditor
                        value={replyText[thread.id] ?? ""}
                        onChange={(value) =>
                          setReplyText((current) => ({
                            ...current,
                            [thread.id]: value,
                          }))
                        }
                        mentions={replyMentions[thread.id] ?? []}
                        onMentionsChange={(mentions) =>
                          setReplyMentions((current) => ({
                            ...current,
                            [thread.id]: mentions,
                          }))
                        }
                        mentionCandidates={candidates}
                        searchMentionCandidates={searchMentionCandidates}
                        canMentionAgent={canMentionAgent}
                        placeholder="回复此批注…"
                        autoFocus
                        onSubmit={() => void handleReply(thread.id)}
                        uploadHandler={uploadCommentImage ?? uploadNoteFile}
                      />
                    </div>
                    <IconButton
                      label="发送回复"
                      className="mb-1 text-[#70bfff]"
                      disabled={
                        !stripMarkdown(replyText[thread.id] ?? "") || submitting
                      }
                      onClick={() => void handleReply(thread.id)}
                    >
                      <Send className="h-4 w-4" />
                    </IconButton>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
        {actionError && (
          <p className="mt-2 text-xs text-[#ffaaa0]">{actionError}</p>
        )}
      </div>

      {!readOnly && onCreateComment && (
        <section
          className="shrink-0 border-t border-[#4d4d4d] bg-[#242424] p-3 sm:p-4"
          aria-label="新增配置项批注"
        >
          <div className="rounded-xl border border-[#4d4d4d] bg-[#3a3a3a] shadow-inner">
            <CommentMarkdownEditor
              value={newDraft}
              onChange={(value) => {
                setNewDraft(value);
                setNewState(value ? "dirty" : "idle");
                setNewError(null);
              }}
              mentions={newMentions}
              onMentionsChange={setNewMentions}
              mentionCandidates={candidates}
              searchMentionCandidates={searchMentionCandidates}
              canMentionAgent={canMentionAgent}
              placeholder="添加批注…"
              onSubmit={() => void handleCreate()}
              onBlur={() => void handleCreate()}
              uploadHandler={uploadCommentImage ?? uploadNoteFile}
            />
          </div>
          <div className="flex min-h-5 items-center justify-end gap-2 pt-1 text-[11px]">
            {newState === "saving" && (
              <span className="text-[#b5b5b5]">添加中…</span>
            )}
            {newState === "saved" && (
              <span className="text-emerald-600">已添加</span>
            )}
            {newError && <span className="text-[#ffaaa0]">{newError}</span>}
            {newError && (
              <IconButton
                label="重试添加批注"
                className="h-6 w-6 text-[#ffaaa0]"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => void handleCreate()}
                disabled={newState === "saving"}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </div>
        </section>
      )}
    </div>
    </>
  );
}
