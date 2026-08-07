"use client";

import { DocumentEditor } from "./DocumentEditor";
import { sanitizeNoteHtml } from "./note-html";

export type NoteUploadHandler = (
  file: File,
) => Promise<{ url: string; kind: "image" | "video" | "file" }>;

interface RichTextEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  uploadHandler?: NoteUploadHandler;
}

export { sanitizeNoteHtml };

export function RichTextEditor({
  content,
  onChange,
  uploadHandler,
}: RichTextEditorProps) {
  return (
    <DocumentEditor
      value={content}
      onChange={onChange}
      format="markdown"
      uploadHandler={uploadHandler}
      previewSanitizer={sanitizeNoteHtml}
    />
  );
}