"use client";

import { useMemo, useRef, useState } from "react";
import { AtSign, Image as ImageIcon, Loader2, Send, Smile } from "lucide-react";
import type { CommentMention } from "@workbench/shared";
import { cn } from "../utils";
import { MentionTextarea, type MentionTextareaHandle } from "./MentionPicker";
import type { CommentImageUploadHandler, MentionCandidate } from "./types";
import { COMMENT_VISUAL_TOKENS } from "./comment-theme";

const EMOJIS = ["😀", "😄", "😂", "😍", "👍", "🙌", "🎉", "✅", "👀", "🔥", "❤️", "✨"];

export interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  mentions: CommentMention[];
  onMentionsChange: (mentions: CommentMention[]) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
  disabled?: boolean;
  submitting?: boolean;
  uploadCommentImage?: CommentImageUploadHandler;
  onSubmit?: () => void;
  /** 编辑态取消回调；传入后在工具栏内渲染中文取消/保存按钮。 */
  onCancel?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
  className?: string;
}

/** 页面评论、回复和配置批注共用的 Figma 风格输入器。 */
export function CommentComposer({
  value,
  onChange,
  mentions,
  onMentionsChange,
  candidates,
  placeholder = "输入评论…",
  autoFocus,
  rows = 3,
  disabled = false,
  submitting = false,
  uploadCommentImage,
  onSubmit,
  onCancel,
  cancelLabel = "取消",
  submitLabel = "保存",
  className,
}: CommentComposerProps) {
  const editorRef = useRef<MentionTextareaHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useMemo(
    () => focused || Boolean(value.trim()) || uploading || Boolean(error),
    [error, focused, uploading, value],
  );

  const handleImage = async (file: File | undefined) => {
    if (!file || !uploadCommentImage || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadCommentImage(file);
      if (!/^\/api\/images\/[A-Za-z0-9._~-]+$/.test(result.url)) {
        throw new Error("图片地址不受信任");
      }
      const alt = [...(result.filename || file.name || "图片")]
        .map((character) => (character === "\r" || character === "\n" ? " " : character))
        .filter((character) => character !== "[" && character !== "]" && character !== "\\")
        .join("");
      editorRef.current?.insertText(`\n![${alt}](${result.url})\n`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div
      aria-busy={uploading || submitting}
      aria-expanded={active}
      className={cn(
        "relative border shadow-inner transition-[border-radius,background-color,border-color,box-shadow] duration-100 ease-out motion-reduce:transition-none",
        active
          ? cn("rounded-xl", COMMENT_VISUAL_TOKENS.input, COMMENT_VISUAL_TOKENS.focus)
          : "h-10 max-h-10 overflow-hidden rounded-full border-transparent bg-[#3a3a3a]",
        className,
      )}
      style={{
        borderRadius: active ? "12px" : "20px",
        height: active ? undefined : "40px",
        maxHeight: active ? undefined : "40px",
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        const relatedTarget = event.relatedTarget as Node | null;
        if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
          setFocused(false);
          setEmojiOpen(false);
        }
      }}
    >
      <MentionTextarea
        ref={editorRef}
        value={value}
        onChange={(next) => {
          setError(null);
          onChange(next);
        }}
        mentions={mentions}
        onMentionsChange={onMentionsChange}
        candidates={candidates}
        rows={active ? rows : 1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onSubmit={onSubmit}
        className={cn(
          "border-0 bg-transparent text-[13px] text-[#f5f5f5] transition-[min-height,padding,border-radius] duration-100 ease-out focus:ring-0 motion-reduce:transition-none empty:before:text-[#b8b8b8]",
          active
            ? "min-h-0 rounded-t-xl rounded-b-none px-3 py-2.5"
            : "min-h-0 flex items-center rounded-full px-3 py-1.5 pr-11 whitespace-nowrap overflow-hidden leading-5",
        )}
        style={{
          minHeight: active ? "56px" : "38px",
          height: active ? undefined : "38px",
          borderRadius: active ? "12px 12px 0 0" : "20px",
        }}
      />
      {!active && (
        <button
          type="button"
          aria-label="发送评论"
          title="发送评论"
          disabled={disabled || submitting || uploading || !value.trim()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onSubmit}
          className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[#777] text-[#bcbcbc] transition-colors hover:bg-[#8a8a8a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7efff] disabled:cursor-not-allowed disabled:opacity-100"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        aria-hidden={!active}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-100 ease-out motion-reduce:transition-none",
          active ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className={cn("min-h-0 flex items-center gap-1 border-t px-2 py-1.5", active ? "border-[#555]" : "border-transparent")}>
        <button
          type="button"
          aria-label="插入表情"
          title="插入表情"
          tabIndex={active ? 0 : -1}
          disabled={disabled || uploading}
          onClick={() => setEmojiOpen((open) => !open)}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#d4d4d4] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Smile className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="提及成员"
          title="提及成员"
          tabIndex={active ? 0 : -1}
          disabled={disabled || uploading}
          onClick={() => {
            editorRef.current?.focus();
            editorRef.current?.insertText("@");
          }}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#d4d4d4] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AtSign className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={uploading ? "图片上传中" : uploadCommentImage ? "插入图片" : "图片上传不可用"}
          title={uploading ? "图片上传中" : uploadCommentImage ? "插入图片" : "图片上传不可用"}
          tabIndex={active ? 0 : -1}
          disabled={disabled || !uploadCommentImage || uploading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#d4d4d4] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <ImageIcon className="h-4 w-4" />}
        </button>
        {uploading && <span className="sr-only" role="status">图片上传中…</span>}
        <input
          ref={fileRef}
          type="file"
          tabIndex={active ? 0 : -1}
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(event) => void handleImage(event.target.files?.[0])}
        />
        {emojiOpen && (
          <div className="absolute bottom-10 left-1 z-50 grid grid-cols-6 gap-1 rounded-lg border border-[#555] bg-[#292929] p-2 shadow-xl" role="menu" aria-label="选择表情">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                aria-label={`插入${emoji}`}
                tabIndex={active ? 0 : -1}
                onClick={() => {
                  editorRef.current?.insertText(emoji);
                  setEmojiOpen(false);
                }}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff]"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto flex items-center gap-2">
          {error && <span className="max-w-44 truncate text-[10px] text-[#ffaaa0]" role="alert">{error}</span>}
          {onCancel && (
            <button
              type="button"
              aria-label={cancelLabel}
              title={cancelLabel}
              tabIndex={active ? 0 : -1}
              disabled={disabled || submitting || uploading}
              onClick={onCancel}
              className="inline-flex h-7 cursor-pointer items-center justify-center rounded-md border border-[#777] px-2.5 text-[11px] font-medium text-[#e6e6e6] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fc2ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            aria-label={onCancel ? submitLabel : "发送评论"}
            title={onCancel ? submitLabel : "发送评论"}
            tabIndex={active ? 0 : -1}
            disabled={disabled || submitting || uploading || !value.trim()}
            onClick={onSubmit}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7efff] disabled:cursor-not-allowed disabled:opacity-50",
              onCancel
                ? "rounded-md bg-[#70bfff] px-2.5 text-[11px] text-[#13202d] hover:bg-[#8dceff]"
                : "w-7 rounded-full bg-[#70bfff] text-[#13202d] hover:bg-[#8dceff] disabled:bg-[#777] disabled:text-[#bcbcbc]",
            )}
          >
            {onCancel ? submitLabel : <Send className="h-3.5 w-3.5" />}
          </button>
        </span>
        </div>
      </div>
    </div>
  );
}
