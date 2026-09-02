"use client";

import {
  DocumentEditor,
  type DocumentRemoteImageHandler,
  type MarkdownReferenceClickHandler,
  type MarkdownReferenceContext,
  type MarkdownReferenceProvider,
} from "./DocumentEditor";
import type { MarkdownReferenceCandidate } from "@workbench/shared/markdown-reference";
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
  /** 提供时，粘贴的外链图片会保存到当前会话图床。 */
  localizeRemoteImage?: DocumentRemoteImageHandler;
  /** 提供时，工具栏显示「插入引用」按钮，可从当前页配置项中选择并插入 @[label](key)。 */
  referenceCandidates?: ConfigReferenceCandidate[];
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  onReferenceInserted?: (candidate: MarkdownReferenceCandidate) => void;
}

export { sanitizeNoteHtml };

export function RichTextEditor({
  content,
  onChange,
  uploadHandler,
  localizeRemoteImage,
  referenceCandidates,
  referenceContext,
  referenceProvider,
  onReferenceClick,
  onReferenceInserted,
}: RichTextEditorProps) {
  return (
    <DocumentEditor
      value={content}
      onChange={onChange}
      uploadHandler={uploadHandler}
      localizeRemoteImage={localizeRemoteImage}
      referenceCandidates={referenceCandidates}
      referenceContext={referenceContext}
      referenceProvider={referenceProvider}
      onReferenceClick={onReferenceClick}
      onReferenceInserted={onReferenceInserted}
    />
  );
}
