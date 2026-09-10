"use client";

import {
  DocumentEditor,
  type DocumentRemoteImageHandler,
  type MarkdownReferenceClickHandler,
  type MarkdownReferenceContext,
  type MarkdownReferenceProvider,
  type MarkdownMentionCandidate,
} from "./DocumentEditor";
import type { CommentMention } from "@workbench/shared";
import type { MarkdownReferenceCandidate } from "@workbench/shared/markdown-reference";
import { sanitizeNoteHtml } from "./note-html";

export type NoteUploadHandler = (
  file: File,
) => Promise<{ url: string; kind: "image" | "video" | "file" }>;

export interface ConfigReferenceCandidate {
  key: string;
  label: string;
}

export interface RichTextEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  uploadHandler?: NoteUploadHandler;
  /** 提供时，粘贴的外链图片会保存到当前会话图床。 */
  localizeRemoteImage?: DocumentRemoteImageHandler;
  /** 提供时，工具栏显示「插入引用」按钮，可从当前页配置项中选择并插入 @[label](key)。 */
  referenceCandidates?: ConfigReferenceCandidate[];
  referenceContext?: MarkdownReferenceContext;
  referenceProvider?: MarkdownReferenceProvider;
  onReferenceClick?: MarkdownReferenceClickHandler;
  onReferenceInserted?: (candidate: MarkdownReferenceCandidate) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
  mentionCandidates?: MarkdownMentionCandidate[];
  searchMentionCandidates?: (
    query: string,
    options?: { signal?: AbortSignal },
  ) => Promise<MarkdownMentionCandidate[]>;
  mentions?: CommentMention[];
  onMentionsChange?: (mentions: CommentMention[]) => void;
  canMentionAgent?: boolean;
  /** 是否显示固定顶部格式工具栏；选区浮动工具栏不受影响。 */
  showTopBar?: boolean;
  /** 让编辑器从单行高度随内容增长，达到上限后在正文区滚动。 */
  autoGrow?: boolean;
  className?: string;
}

export { sanitizeNoteHtml };

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  uploadHandler,
  localizeRemoteImage,
  referenceCandidates,
  referenceContext,
  referenceProvider,
  onReferenceClick,
  onReferenceInserted,
  onSubmit,
  autoFocus,
  mentionCandidates,
  searchMentionCandidates,
  mentions,
  onMentionsChange,
  canMentionAgent,
  showTopBar,
  autoGrow,
  className,
}: RichTextEditorProps) {
  return (
    <DocumentEditor
      value={content}
      onChange={onChange}
      placeholder={placeholder}
      uploadHandler={uploadHandler}
      localizeRemoteImage={localizeRemoteImage}
      referenceCandidates={referenceCandidates}
      referenceContext={referenceContext}
      referenceProvider={referenceProvider}
      onReferenceClick={onReferenceClick}
      onReferenceInserted={onReferenceInserted}
      onSubmit={onSubmit}
      autoFocus={autoFocus}
      mentionCandidates={mentionCandidates}
      searchMentionCandidates={searchMentionCandidates}
      mentions={mentions}
      onMentionsChange={onMentionsChange}
      canMentionAgent={canMentionAgent}
      showTopBar={showTopBar}
      autoGrow={autoGrow}
      className={className}
    />
  );
}
