"use client";

import { DocumentEditor } from "./DocumentEditor";
import { sanitizeNoteHtml } from "./note-html";

export type NoteUploadHandler = (
  file: File,
) => Promise<{ url: string; kind: "image" | "video" | "file" }>;

export interface ConfigReferenceCandidate {
  key: string;
  label: string;
}

interface RichTextEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  uploadHandler?: NoteUploadHandler;
  /** 提供时，工具栏显示「插入引用」按钮，可从当前页配置项中选择并插入 @[label](key)。 */
  referenceCandidates?: ConfigReferenceCandidate[];
}

export { sanitizeNoteHtml };

export function RichTextEditor({
  content,
  onChange,
  uploadHandler,
  referenceCandidates,
}: RichTextEditorProps) {
  return (
    <DocumentEditor
      value={content}
      onChange={onChange}
      format="markdown"
      uploadHandler={uploadHandler}
      previewSanitizer={sanitizeNoteHtml}
      referenceCandidates={referenceCandidates}
    />
  );
}