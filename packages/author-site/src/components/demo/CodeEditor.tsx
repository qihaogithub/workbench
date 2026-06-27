"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import type * as Y from "yjs";
import { yCollab } from "y-codemirror.next";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: "typescript" | "json" | "text";
  readOnly?: boolean;
  height?: string;
  collab?: {
    ytext: Y.Text;
    awareness: unknown;
  };
}

/**
 * CodeMirror 6 封装组件
 * 支持 TypeScript/JSON 语法高亮、只读/编辑模式切换
 */
export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  height = "100%",
  collab,
}: CodeEditorProps) {
  const extensions = useMemo(() => {
    const ext = [];

    // 语言支持
    if (language === "typescript") {
      ext.push(javascript({ typescript: true, jsx: true }));
    } else if (language === "json") {
      ext.push(json());
    }

    // 只读模式
    if (readOnly) {
      ext.push(EditorView.editable.of(false));
    }

    if (collab) {
      ext.push(yCollab(collab.ytext, collab.awareness));
    }

    // 基础样式微调
    ext.push(
      EditorView.theme({
        "&": { fontSize: "13px" },
        ".cm-content": { fontFamily: '"Fira code", "Fira Mono", monospace' },
        ".cm-gutters": { minWidth: "40px" },
      }),
    );

    return ext;
  }, [language, readOnly]);

  return (
    <CodeMirror
      value={collab ? undefined : value}
      onChange={onChange}
      extensions={extensions}
      theme={vscodeDark}
      height={height}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: true,
        autocompletion: !readOnly,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
        tabSize: 2,
      }}
    />
  );
}
