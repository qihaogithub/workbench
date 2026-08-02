"use client";

import { DocumentEditor } from "@workbench/demo-ui";

interface WorkspaceMarkdownEditorProps {
  value: string;
  onChange: (md: string) => void;
  readOnly?: boolean;
}

export function WorkspaceMarkdownEditor({
  value,
  onChange,
  readOnly = false,
}: WorkspaceMarkdownEditorProps) {
  return (
    <DocumentEditor
      value={value}
      onChange={onChange}
      format="markdown"
      readOnly={readOnly}
    />
  );
}
