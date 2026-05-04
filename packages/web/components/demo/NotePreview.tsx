"use client";

interface NotePreviewProps {
  noteHtml: string;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function NotePreview({ noteHtml }: NotePreviewProps) {
  const plainText = stripHtml(noteHtml);
  if (!plainText) return null;

  return (
    <p className="text-xs text-muted-foreground truncate leading-tight">
      {plainText}
    </p>
  );
}
