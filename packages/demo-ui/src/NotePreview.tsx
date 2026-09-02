"use client";

import { renderNoteMarkdown, stripMarkdown } from "./note-html";
import { useMarkdownImageLightbox } from "./MarkdownImageLightbox";
import "./markdown-image-lightbox.css";

interface NotePreviewProps {
  /** 备注 Markdown 内容 */
  markdown: string;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function NotePreview({ markdown }: NotePreviewProps) {
  const { handleMarkdownImageClick, lightbox } = useMarkdownImageLightbox();
  const plainText = stripMarkdown(markdown);
  if (!plainText) return null;

  return (
    <>
      <div
        className="markdown-editor-content markdown-image-previewable text-xs text-muted-foreground leading-tight"
        onClick={handleMarkdownImageClick}
        dangerouslySetInnerHTML={{ __html: renderNoteMarkdown(markdown) }}
      />
      {lightbox}
    </>
  );
}
