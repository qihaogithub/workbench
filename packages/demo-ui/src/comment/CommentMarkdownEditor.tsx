"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CommentMention } from "@workbench/shared";
import { RichTextEditor, type NoteUploadHandler } from "../RichTextEditor";
import type { MarkdownMentionCandidate } from "../DocumentEditor";
import { cn } from "../utils";

export interface CommentMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  mentions?: CommentMention[];
  onMentionsChange?: (mentions: CommentMention[]) => void;
  mentionCandidates?: MarkdownMentionCandidate[];
  canMentionAgent?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
  onBlur?: () => void;
  uploadHandler?: NoteUploadHandler;
  className?: string;
}

/**
 * 批注专用 Markdown 编辑器：隐藏固定顶部工具栏，保留选区浮动工具栏，
 * 并把 @ 提及、快捷提交和失焦事件收敛到一个可复用的轻量适配器。
 */
export function CommentMarkdownEditor({
  value,
  onChange,
  mentions = [],
  onMentionsChange,
  mentionCandidates,
  canMentionAgent,
  placeholder = "添加批注…",
  autoFocus = false,
  onSubmit,
  onCancel,
  onBlur,
  uploadHandler,
  className,
}: CommentMarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasFocusedRef = useRef(false);
  const blurNotifiedRef = useRef(false);
  const blurFrameRef = useRef<number | null>(null);

  const cancelPendingBlur = useCallback(() => {
    const frame = blurFrameRef.current;
    if (frame === null) return;
    // requestAnimationFrame ids and timeout ids are both numeric in browsers.
    // Clearing both keeps the fallback deterministic in jsdom and older WebViews.
    window.cancelAnimationFrame?.(frame);
    window.clearTimeout(frame);
    blurFrameRef.current = null;
  }, []);

  useEffect(() => cancelPendingBlur, [cancelPendingBlur]);

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const relatedTarget = event.relatedTarget as Node | null;
      if (relatedTarget && rootRef.current?.contains(relatedTarget)) return;

      // Milkdown mounts asynchronously. During that transition focus can move
      // through the body (or the edit trigger) before ProseMirror receives it;
      // this is not a real exit from the editor.
      if (!hasFocusedRef.current) return;

      cancelPendingBlur();
      const checkFocus = () => {
        blurFrameRef.current = null;
        const root = rootRef.current;
        if (!root) return;
        const activeElement = document.activeElement;
        if (activeElement && root.contains(activeElement)) return;
        if (blurNotifiedRef.current) return;
        blurNotifiedRef.current = true;
        onBlur?.();
      };
      blurFrameRef.current = window.requestAnimationFrame
        ? window.requestAnimationFrame(checkFocus)
        : window.setTimeout(checkFocus, 0);
    },
    [cancelPendingBlur, onBlur],
  );

  return (
    <div
      ref={rootRef}
      className={cn("config-comment-markdown-editor min-w-0", className)}
      onFocusCapture={() => {
        hasFocusedRef.current = true;
        blurNotifiedRef.current = false;
        cancelPendingBlur();
      }}
      onBlurCapture={handleBlur}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && onCancel) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <RichTextEditor
        content={value}
        onChange={onChange}
        placeholder={placeholder}
        uploadHandler={uploadHandler}
        mentionCandidates={mentionCandidates}
        mentions={mentions}
        onMentionsChange={onMentionsChange}
        canMentionAgent={canMentionAgent}
        showTopBar={false}
        autoGrow
        autoFocus={autoFocus}
        onSubmit={onSubmit}
        className="config-comment-editor"
      />
    </div>
  );
}
