"use client";

import { DocumentEditor } from "./DocumentEditor";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

const ALLOWED_TAGS = [
  "p",
  "strong",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "br",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "pre",
  "code",
  "hr",
  "label",
  "input",
  "div",
  "span",
];

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "type",
  "checked",
  "disabled",
  "data-type",
  "data-checked",
];

function sanitizeNoteHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const DOMPurify = require("dompurify");
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
  });
}

export { sanitizeNoteHtml };

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  return (
    <DocumentEditor
      value={content}
      onChange={onChange}
      format="html"
      htmlSanitizer={sanitizeNoteHtml}
    />
  );
}
