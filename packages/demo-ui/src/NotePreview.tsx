"use client";

import { renderNoteMarkdown, stripMarkdown } from "./note-html";

interface NotePreviewProps {
  /** 备注 Markdown 内容 */
  markdown: string;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function NotePreview({ markdown }: NotePreviewProps) {
  const plainText = stripMarkdown(markdown);
  if (!plainText) return null;

  return (
    <div
      className="markdown-editor-content text-xs text-muted-foreground leading-tight"
      dangerouslySetInnerHTML={{ __html: renderNoteMarkdown(markdown) }}
    />
  );
}