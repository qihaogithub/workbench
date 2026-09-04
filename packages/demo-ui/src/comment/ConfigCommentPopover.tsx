"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn("markdown-editor-content min-w-0", className)}
      dangerouslySetInnerHTML={{ __html: renderNoteMarkdown(content) }}
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
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
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
  mentionCandidates = [],
  canMentionAgent = false,
  readOnly = false,
  onCreateComment,
  onAddReply,
  onUpdateComment,
  onUpdateReply,
  onSetResolved,
  onDeleteThread,
  onDeleteReply,
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
      if (!window.confirm("确定删除这条批注及其所有回复吗？")) return;
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
      if (!window.confirm("确定删除这条回复吗？")) return;
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
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {targetThreads.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted-foreground">
            暂无批注
          </p>
        ) : (
          <section className="space-y-2.5" aria-label="配置项批注列表">
            {targetThreads.map((thread) => (
              <article
                key={thread.id}
                className={cn(
                  "rounded-lg border border-border/70 bg-muted/20 p-3",
                  thread.resolved && "opacity-80",
                )}
              >
                <div className="mb-2 flex min-w-0 items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="min-w-0 max-w-[45%] truncate text-xs font-medium text-foreground sm:max-w-[12rem]">
                      {thread.author.name}
                    </span>
                    <time
                      dateTime={new Date(thread.createdAt).toISOString()}
                      className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground"
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
                      {onUpdateComment && (
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
                      {onDeleteThread && (
                        <IconButton
                          label="删除批注"
                          className="hover:bg-destructive/10 hover:text-destructive"
                          disabled={submitting}
                          onClick={() => void handleDeleteThread(thread.id)}
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
                          : "text-muted-foreground",
                      )}
                    >
                      {thread.resolved ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          className="h-3.5 w-3.5 text-muted-foreground"
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
                      canMentionAgent={canMentionAgent}
                      placeholder="修改批注…"
                      autoFocus
                      onBlur={handleEditingBlur}
                      onCancel={cancelEditing}
                      uploadHandler={uploadNoteFile}
                    />
                    <div className="flex min-h-5 items-center justify-end gap-2 text-[11px]">
                      {editingState === "saving" && (
                        <span className="text-muted-foreground">
                          自动保存中…
                        </span>
                      )}
                      {editingState === "saved" && (
                        <span className="text-emerald-600">已自动保存</span>
                      )}
                      {editingError && (
                        <>
                          <span className="text-destructive">
                            {editingError}
                          </span>
                          <IconButton
                            label="重试保存批注"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => void saveEditing()}
                            disabled={editingState === "saving"}
                            className="h-6 w-6 text-destructive"
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
                    className="text-sm text-foreground"
                  />
                )}

                {thread.replies.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-border/60 pt-2">
                    {thread.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="rounded-md bg-background/40 p-2"
                      >
                        <div className="mb-1 flex min-w-0 items-center gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="min-w-0 max-w-[45%] truncate text-xs font-medium text-foreground sm:max-w-[12rem]">
                              {reply.author.name}
                            </span>
                            <time
                              dateTime={new Date(reply.createdAt).toISOString()}
                              className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground"
                            >
                              {formatTime(reply.createdAt)}
                            </time>
                          </div>
                          {!readOnly && (
                            <div className="flex shrink-0 items-center gap-0.5">
                              {onUpdateReply && (
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
                              {onDeleteReply && (
                                <IconButton
                                  label="删除回复"
                                  className="hover:bg-destructive/10 hover:text-destructive"
                                  disabled={submitting}
                                  onClick={() =>
                                    void handleDeleteReply(thread.id, reply.id)
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
                              canMentionAgent={canMentionAgent}
                              placeholder="修改回复…"
                              autoFocus
                              uploadHandler={uploadNoteFile}
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
                                className="text-primary"
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
                            className="text-xs text-foreground"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {replyThreadId === thread.id && !readOnly && onAddReply && (
                  <div className="mt-3 flex items-end gap-2 border-t border-border/60 pt-2">
                    <div className="min-w-0 flex-1 rounded-md border border-border/80 bg-background">
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
                        canMentionAgent={canMentionAgent}
                        placeholder="回复此批注…"
                        autoFocus
                        onSubmit={() => void handleReply(thread.id)}
                        uploadHandler={uploadNoteFile}
                      />
                    </div>
                    <IconButton
                      label="发送回复"
                      className="mb-1 text-primary"
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
          <p className="mt-2 text-xs text-destructive">{actionError}</p>
        )}
      </div>

      {!readOnly && onCreateComment && (
        <section
          className="shrink-0 border-t border-border/80 bg-muted/20 p-3 sm:p-4"
          aria-label="新增配置项批注"
        >
          <div className="rounded-lg border border-border/80 bg-background shadow-inner">
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
              canMentionAgent={canMentionAgent}
              placeholder="添加批注…"
              onSubmit={() => void handleCreate()}
              onBlur={() => void handleCreate()}
              uploadHandler={uploadNoteFile}
            />
          </div>
          <div className="flex min-h-5 items-center justify-end gap-2 pt-1 text-[11px]">
            {newState === "saving" && (
              <span className="text-muted-foreground">添加中…</span>
            )}
            {newState === "saved" && (
              <span className="text-emerald-600">已添加</span>
            )}
            {newError && <span className="text-destructive">{newError}</span>}
            {newError && (
              <IconButton
                label="重试添加批注"
                className="h-6 w-6 text-destructive"
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
  );
}
