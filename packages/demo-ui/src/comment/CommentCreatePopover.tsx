"use client";

/**
 * CommentCreatePopover：创建评论输入框。
 * - 在评论模式下点击页面后弹出，定位在点击位置。
 * - 支持 @提及（创作端可 @用户/AI，浏览端仅 @用户）。
 * - 提交后调用 createComment，携带捕获的锚点元素与 pin 坐标。
 */
import { useCallback, useState } from "react";
import { X } from "lucide-react";
import type { CommentMention } from "@workbench/shared";
import { MentionTextarea } from "./MentionPicker";
import type { CreateCommentInput, MentionCandidate } from "./types";

export interface CommentCreatePopoverProps {
  /** 创建评论的输入（不含 content/mentions），由点击捕获 */
  draft: Omit<CreateCommentInput, "content" | "mentions">;
  mentionCandidates: MentionCandidate[];
  canMentionAgent?: boolean;
  left: number;
  top: number;
  onCancel: () => void;
  onSubmit: (input: CreateCommentInput) => Promise<unknown>;
}

export function CommentCreatePopover({
  draft,
  mentionCandidates,
  canMentionAgent,
  left,
  top,
  onCancel,
  onSubmit,
}: CommentCreatePopoverProps) {
  const [content, setContent] = useState("");
  const [mentions, setMentions] = useState<CommentMention[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = canMentionAgent
    ? mentionCandidates
    : mentionCandidates.filter((c) => c.type !== "agent");

  const handleSubmit = useCallback(async () => {
    const text = content.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ ...draft, content: text, mentions });
    } catch (err) {
      setError(err instanceof Error ? err.message : "评论提交失败");
      setSubmitting(false);
    }
  }, [content, mentions, submitting, onSubmit, draft]);

  return (
    <div
      className="absolute z-50 w-72 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 shadow-lg"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          添加评论
          {draft.anchor && (
            <span className="ml-1 font-mono text-[10px]">&lt;{draft.anchor.tagName}&gt;</span>
          )}
        </span>
        <button
          type="button"
          onClick={onCancel}
          title="取消"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <MentionTextarea
        value={content}
        onChange={setContent}
        mentions={mentions}
        onMentionsChange={setMentions}
        candidates={candidates}
        rows={3}
        autoFocus
        placeholder="输入评论…（@ 可提及，⌘/Ctrl+Enter 提交）"
        onSubmit={() => void handleSubmit()}
      />

      {error && <div className="mt-1 text-[11px] text-red-500">{error}</div>}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!content.trim() || submitting}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "提交中…" : "评论"}
        </button>
      </div>
    </div>
  );
}
