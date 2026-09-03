"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CommentMention,
  CommentThread,
  ConfigCommentTarget,
} from "@workbench/shared";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "../RichTextEditor";
import { renderNoteMarkdown, stripMarkdown } from "../note-html";
import { uploadNoteFile } from "../note-upload";
import { MentionContent, MentionTextarea } from "./MentionPicker";
import type {
  ConfigCommentController,
} from "./types";

export interface ConfigCommentPopoverProps extends ConfigCommentController {
  target: ConfigCommentTarget;
}

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

function sameTarget(left: CommentThread["target"], right: ConfigCommentTarget): boolean {
  if (right.scope === "page" && !right.pageId) return false;
  return left.kind === "config"
    && left.scope === right.scope
    && left.fieldKey === right.fieldKey
    && (right.scope === "project"
      ? !left.pageId && !right.pageId
      : left.pageId === right.pageId);
}

export function ConfigCommentPopover({
  target,
  threads,
  currentUser: _currentUser,
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
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyMentions, setReplyMentions] = useState<Record<string, CommentMention[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingReply, setEditingReply] = useState<{ threadId: string; replyId: string } | null>(null);
  const [editingReplyText, setEditingReplyText] = useState("");
  const [editingReplyMentions, setEditingReplyMentions] = useState<CommentMention[]>([]);

  const targetThreads = useMemo(
    () => threads
      .filter((thread) => sameTarget(thread.target, target))
      .sort((left, right) => right.createdAt - left.createdAt),
    [target, threads],
  );
  const replyCandidates = canMentionAgent
    ? mentionCandidates
    : mentionCandidates.filter((candidate) => candidate.type !== "agent");

  useEffect(() => {
    setDraft("");
    setError(null);
    setEditingId(null);
    setEditingDraft("");
    setEditingReply(null);
    setEditingReplyText("");
    setEditingReplyMentions([]);
    setReplyText({});
    setReplyMentions({});
  }, [target.scope, target.pageId, target.fieldKey]);

  const handleCreate = async () => {
    if (readOnly || !onCreateComment || !stripMarkdown(draft) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreateComment({ target, content: draft.trim() });
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "批注保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (threadId: string) => {
    const content = replyText[threadId]?.trim() ?? "";
    if (readOnly || !onAddReply || !content || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAddReply(threadId, {
        content,
        mentions: replyMentions[threadId],
      });
      setReplyText((current) => ({ ...current, [threadId]: "" }));
      setReplyMentions((current) => ({ ...current, [threadId]: [] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (threadId: string) => {
    if (readOnly || !onUpdateComment || !stripMarkdown(editingDraft) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onUpdateComment(threadId, { content: editingDraft.trim() });
      setEditingId(null);
      setEditingDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "批注更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetResolved = async (threadId: string, resolved: boolean) => {
    if (readOnly || !onSetResolved || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSetResolved(threadId, resolved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新批注状态失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateReply = async () => {
    if (readOnly || !editingReply || !onUpdateReply || !editingReplyText.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onUpdateReply(editingReply.threadId, editingReply.replyId, {
        content: editingReplyText.trim(),
        mentions: editingReplyMentions,
      });
      setEditingReply(null);
      setEditingReplyText("");
      setEditingReplyMentions([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReply = async (threadId: string, replyId: string) => {
    if (readOnly || !onDeleteReply || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDeleteReply(threadId, replyId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复删除失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (threadId: string) => {
    if (readOnly || !onDeleteThread || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDeleteThread(threadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除批注失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card p-4">
      {targetThreads.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted-foreground">
          暂无批注
        </p>
      ) : (
        <section className="space-y-3" aria-label="配置项批注列表">
          {targetThreads.map((thread) => (
            <article key={thread.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">{thread.author.name}</span>
                <span className="text-muted-foreground">{formatTime(thread.createdAt)}</span>
              </div>
              {editingId === thread.id ? (
                <div className="space-y-2">
                  <RichTextEditor content={editingDraft} onChange={setEditingDraft} uploadHandler={uploadNoteFile} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      取消
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!stripMarkdown(editingDraft) || submitting}
                      onClick={() => void handleUpdate(thread.id)}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="markdown-editor-content text-sm text-foreground"
                  dangerouslySetInnerHTML={{ __html: renderNoteMarkdown(thread.content) }}
                />
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {!readOnly && onSetResolved && (
                  <button
                    type="button"
                    disabled={submitting}
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    onClick={() => void handleSetResolved(thread.id, !thread.resolved)}
                  >
                    {thread.resolved ? "重新打开" : "标记解决"}
                  </button>
                )}
                {!readOnly && onUpdateComment && (
                  <button
                    type="button"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => {
                      setEditingId(thread.id);
                      setEditingDraft(thread.content);
                    }}
                  >
                    编辑
                  </button>
                )}
                {!readOnly && onDeleteThread && (
                  <button
                    type="button"
                    disabled={submitting}
                    className="text-destructive/80 transition-colors hover:text-destructive disabled:opacity-50"
                    onClick={() => void handleDelete(thread.id)}
                  >
                    删除
                  </button>
                )}
                {thread.resolved && <span className="text-emerald-600">已解决</span>}
              </div>

              {thread.replies.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border/60 pt-2">
                  {thread.replies.map((reply) => (
                    <div key={reply.id} className="group/reply text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-medium">{reply.author.name}</span>
                          <span className="ml-2 text-muted-foreground">{formatTime(reply.createdAt)}</span>
                        </div>
                        {!readOnly && (onUpdateReply || onDeleteReply) && (
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/reply:opacity-100">
                            {onUpdateReply && (
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setEditingReply({ threadId: thread.id, replyId: reply.id });
                                  setEditingReplyText(reply.content);
                                  setEditingReplyMentions(reply.mentions ?? []);
                                }}
                              >编辑</button>
                            )}
                            {onDeleteReply && (
                              <button
                                type="button"
                                disabled={submitting}
                                className="text-destructive/80 hover:text-destructive disabled:opacity-50"
                                onClick={() => void handleDeleteReply(thread.id, reply.id)}
                              >删除</button>
                            )}
                          </div>
                        )}
                      </div>
                      {editingReply?.threadId === thread.id && editingReply.replyId === reply.id ? (
                        <div className="mt-1 space-y-1.5">
                          <MentionTextarea
                            value={editingReplyText}
                            onChange={setEditingReplyText}
                            mentions={editingReplyMentions}
                            onMentionsChange={setEditingReplyMentions}
                            candidates={replyCandidates}
                            rows={2}
                          />
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingReply(null)}>取消</Button>
                            <Button type="button" size="sm" disabled={!editingReplyText.trim() || submitting} onClick={() => void handleUpdateReply()}>保存</Button>
                          </div>
                        </div>
                      ) : (
                        <MentionContent
                          content={reply.content}
                          mentions={reply.mentions}
                          className="mt-0.5 block text-foreground"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!readOnly && onAddReply && (
                <div className="mt-3 space-y-2">
                  <MentionTextarea
                    value={replyText[thread.id] ?? ""}
                    onChange={(value) => setReplyText((current) => ({ ...current, [thread.id]: value }))}
                    mentions={replyMentions[thread.id] ?? []}
                    onMentionsChange={(mentions) => setReplyMentions((current) => ({ ...current, [thread.id]: mentions }))}
                    candidates={replyCandidates}
                    rows={2}
                    placeholder="回复此批注…"
                    onSubmit={() => void handleReply(thread.id)}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!replyText[thread.id]?.trim() || submitting}
                      onClick={() => void handleReply(thread.id)}
                    >
                      回复
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {!readOnly && onCreateComment && (
        <section className="mt-4 space-y-2 border-t border-border/70 pt-4" aria-label="新增配置项批注">
          <div className="text-sm font-medium">新增批注</div>
          <RichTextEditor content={draft} onChange={setDraft} uploadHandler={uploadNoteFile} />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={!stripMarkdown(draft) || submitting}
              onClick={() => void handleCreate()}
            >
              {submitting ? "保存中…" : "保存批注"}
            </Button>
          </div>
        </section>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}
