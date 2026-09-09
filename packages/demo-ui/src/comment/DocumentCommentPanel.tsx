"use client";

import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import type { CommentAuthor, CommentTarget, CommentThread, DocumentCommentAnchor } from "@workbench/shared";
import { cn } from "../utils";
import { CommentSidebar } from "./CommentSidebar";
import { CommentCreatePopover } from "./CommentCreatePopover";
import type { CommentImageUploadHandler, CreateCommentInput, MentionCandidate, MentionCandidateSearch } from "./types";

export interface DocumentCommentPanelProps {
  target: CommentTarget | null;
  threads: CommentThread[];
  currentUserId?: string;
  currentUser: CommentAuthor | null;
  mentionCandidates: MentionCandidate[];
  searchMentionCandidates?: MentionCandidateSearch;
  canMentionAgent?: boolean;
  activeThreadId?: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateComment: (input: CreateCommentInput) => Promise<unknown>;
  selectionDraft?: DocumentCommentAnchor | null;
  onSelectionDraftHandled?: () => void;
  uploadCommentImage?: CommentImageUploadHandler;
  mediaBaseUrl?: string;
  className?: string;
}

/** 文档专用评论栏：不进入页面落点模式，只创建整篇文档线程。 */
export function DocumentCommentPanel({
  target, threads, currentUserId, mentionCandidates, searchMentionCandidates, canMentionAgent,
  activeThreadId, onSelectThread, onCreateComment, selectionDraft, onSelectionDraftHandled, uploadCommentImage, mediaBaseUrl, className,
}: DocumentCommentPanelProps) {
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (selectionDraft) {
      setCreating(true);
      onSelectionDraftHandled?.();
    }
  }, [selectionDraft, onSelectionDraftHandled]);
  if (!target || target.kind !== "document") {
    return <div className={cn("flex h-full items-center justify-center text-xs text-muted-foreground", className)}>选择可编辑文档后查看评论</div>;
  }
  const candidates = canMentionAgent && !mentionCandidates.some((candidate) => candidate.type === "agent")
    ? [{ id: "agent", name: "AI 助手", type: "agent" as const }, ...mentionCandidates]
    : mentionCandidates;
  const draft = { target, documentAnchor: selectionDraft ?? { kind: "document" as const, status: "active" as const } };
  return <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
    <CommentSidebar threads={threads} currentUserId={currentUserId} activeThreadId={activeThreadId} onSelectThread={onSelectThread} showHeader={false} mediaBaseUrl={mediaBaseUrl} className="min-h-0 flex-1" />
    <div className="shrink-0 border-t border-border p-3 text-center">
      <button type="button" onClick={() => setCreating(true)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-xs font-medium hover:bg-muted">
        <MessageSquarePlus className="h-3.5 w-3.5" /> 添加评论
      </button>
    </div>
    {creating && <CommentCreatePopover draft={draft} mentionCandidates={candidates} searchMentionCandidates={searchMentionCandidates} canMentionAgent={canMentionAgent} left={160} top={80} uploadCommentImage={uploadCommentImage} onCancel={() => setCreating(false)} onSubmit={async (input) => { await onCreateComment(input); setCreating(false); }} />}
  </div>;
}
