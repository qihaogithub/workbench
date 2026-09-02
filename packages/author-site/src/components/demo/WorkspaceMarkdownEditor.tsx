"use client";

import { DocumentEditor, type DocumentRemoteImageHandler } from "@workbench/demo-ui";

interface WorkspaceMarkdownEditorProps {
  value: string;
  onChange: (md: string) => void;
  readOnly?: boolean;
  localizeRemoteImage?: DocumentRemoteImageHandler;
}

export function WorkspaceMarkdownEditor({
  value,
  onChange,
  readOnly = false,
  localizeRemoteImage,
}: WorkspaceMarkdownEditorProps) {
  return (
    <DocumentEditor
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      localizeRemoteImage={localizeRemoteImage}
    />
  );
}
