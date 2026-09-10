"use client";

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import type { CommentMention } from "@workbench/shared";
import { cn } from "../utils";
import { CommentComposer } from "./CommentComposer";
import { COMMENT_VISUAL_TOKENS } from "./comment-theme";
import { usePopoverDrag } from "./usePopoverDrag";
import type {
  CommentImageUploadHandler,
  CreateCommentInput,
  MentionCandidate,
  MentionCandidateSearch,
} from "./types";

export interface CommentCreatePopoverProps {
  draft: Omit<CreateCommentInput, "content" | "mentions">;
  mentionCandidates: MentionCandidate[];
  searchMentionCandidates?: MentionCandidateSearch;
  canMentionAgent?: boolean;
  left: number;
  top: number;
  uploadCommentImage?: CommentImageUploadHandler;
  onCancel: () => void;
  onSubmit: (input: CreateCommentInput) => Promise<unknown>;
}
export function CommentCreatePopover({
  draft,
  mentionCandidates,
  searchMentionCandidates,
  canMentionAgent,
  left,
  top,
  uploadCommentImage,
  onCancel,
  onSubmit,
}: CommentCreatePopoverProps) {
  const [content, setContent] = useState("");
  const [mentions, setMentions] = useState<CommentMention[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = canMentionAgent
    ? mentionCandidates
    : mentionCandidates.filter((candidate) => candidate.type !== "agent");
  const viewport = typeof window === "undefined" ? { width: 1200, height: 800 } : { width: window.innerWidth, height: window.innerHeight };
  const popoverWidth = 360;
  const minLeft = popoverWidth / 2 + 8;
  const maxLeft = Math.max(minLeft, viewport.width - popoverWidth / 2 - 8);
  const { position, dragging, dragHandleProps } = usePopoverDrag(left, top, {
    resetKey: draft.anchor?.domPath ?? `${draft.target.kind}:${draft.target.kind === "page" ? draft.target.pageId : "document"}`,
    minLeft,
    maxLeft,
    minTop: 8,
    maxTop: Math.max(8, viewport.height - 220),
  });

  const handleSubmit = useCallback(async () => {
    const text = content.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ ...draft, content: text, mentions });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评论提交失败");
      setSubmitting(false);
    }
  }, [content, mentions, submitting, onSubmit, draft]);

  return (
    <div
      className={cn("absolute z-50 w-[min(360px,calc(100vw-24px))] -translate-x-1/2 rounded-2xl p-3", COMMENT_VISUAL_TOKENS.card)}
      style={{ left: position.left, top: position.top }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between border-b border-[#4e4e4e] pb-2">
        <span
          {...dragHandleProps}
          className={cn("flex-1 cursor-move touch-none select-none text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]", dragging && "cursor-grabbing")}
        >
          添加评论
          {draft.anchor && (
            <span className="ml-1.5 text-[10px] font-normal text-[#a9a9a9]">&lt;{draft.anchor.tagName}&gt;</span>
          )}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="关闭评论输入"
          title="关闭"
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#d4d4d4] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <CommentComposer
        value={content}
        onChange={setContent}
        mentions={mentions}
        onMentionsChange={setMentions}
        candidates={candidates}
        searchMentionCandidates={searchMentionCandidates}
        autoFocus
        placeholder="输入评论…"
        uploadCommentImage={uploadCommentImage}
        submitting={submitting}
        onSubmit={() => void handleSubmit()}
      />
      {error && <div className={cn("mt-2 text-[11px] text-[#ffaaa0]")} role="alert">{error}</div>}
    </div>
  );
}
