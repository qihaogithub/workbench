"use client";

import { DocumentEditor } from "@opencode-workbench/demo-ui";

interface MemoryMarkdownEditorProps {
  value: string;
  onChange: (md: string) => void;
  readOnly?: boolean;
}

export function MemoryMarkdownEditor({
  value,
  onChange,
  readOnly = false,
}: MemoryMarkdownEditorProps) {
  return (
    <DocumentEditor
      value={value}
      onChange={onChange}
      format="markdown"
      readOnly={readOnly}
    />
  );
}
