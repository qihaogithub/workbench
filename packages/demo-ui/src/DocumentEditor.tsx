"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Blockquote from "@tiptap/extension-blockquote";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import {
  defaultMarkdownSerializer,
  MarkdownSerializer,
} from "prosemirror-markdown";
import {
  DOMParser as ProseMirrorDOMParser,
  type Node,
} from "@tiptap/pm/model";
import MarkdownIt from "markdown-it";
import {
  Bold,
  CheckSquare,
  Code2,
  Edit3,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  SeparatorHorizontal,
  Underline as UnderlineIcon,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "./utils";

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

export type DocumentEditorFormat = "markdown" | "html";

export interface DocumentEditorProps {
  value: string;
  onChange: (value: string) => void;
  format: DocumentEditorFormat;
  readOnly?: boolean;
  placeholder?: string;
  htmlSanitizer?: (html: string) => string;
  className?: string;
}

function ToolbarButton({
  icon: Icon,
  tooltip,
  active,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  tooltip: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={active}
          onPressedChange={onClick}
          disabled={disabled}
          className="h-7 w-7 p-0 cursor-pointer"
        >
          <Icon className="h-3.5 w-3.5" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function ToolbarSeparator() {
  return <div className="w-px h-4 bg-border mx-1" />;
}

function markdownToHtml(mdText: string): string {
  if (!mdText) return "";
  try {
    return md.render(mdText);
  } catch {
    return mdText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }
}

function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return (
    /(^|\n)\s{0,3}#{1,6}\s+\S/.test(trimmed) ||
    /(^|\n)\s{0,3}[-*+]\s+\S/.test(trimmed) ||
    /(^|\n)\s{0,3}\d+\.\s+\S/.test(trimmed) ||
    /(^|\n)\s{0,3}>+\s+\S/.test(trimmed) ||
    /(^|\n)\s{0,3}```/.test(trimmed) ||
    /(^|\n)\s{0,3}- \[[ xX]\]\s+\S/.test(trimmed) ||
    /(^|\n)\s{0,3}\|.+\|/.test(trimmed) ||
    /\[[^\]]+\]\([^)]+\)/.test(trimmed) ||
    /(\*\*|__)[^\n]+(\*\*|__)/.test(trimmed) ||
    /(^|\s)`[^`\n]+`($|\s)/.test(trimmed)
  );
}

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function escapeMarkdownTableCell(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
    .trim();
  return escaped || " ";
}

function createMarkdownSerializer(): MarkdownSerializer {
  const defaultNodes = defaultMarkdownSerializer.nodes as Record<
    string,
    MarkdownSerializer["nodes"][string]
  >;
  const defaultMarks = defaultMarkdownSerializer.marks as Record<
    string,
    MarkdownSerializer["marks"][string]
  >;

  const nodes: Record<string, MarkdownSerializer["nodes"][string]> = {};

  if (defaultNodes.blockquote) nodes.blockquote = defaultNodes.blockquote;
  if (defaultNodes.heading) nodes.heading = defaultNodes.heading;
  if (defaultNodes.paragraph) nodes.paragraph = defaultNodes.paragraph;
  if (defaultNodes.text) nodes.text = defaultNodes.text;
  if (defaultNodes.image) nodes.image = defaultNodes.image;
  if (defaultNodes.hard_break) nodes.hardBreak = defaultNodes.hard_break;
  if (defaultNodes.code_block) nodes.codeBlock = defaultNodes.code_block;
  if (defaultNodes.horizontal_rule) {
    nodes.horizontalRule = defaultNodes.horizontal_rule;
  }
  if (defaultNodes.bullet_list) nodes.bulletList = defaultNodes.bullet_list;
  if (defaultNodes.ordered_list) nodes.orderedList = defaultNodes.ordered_list;
  if (defaultNodes.list_item) nodes.listItem = defaultNodes.list_item;

  if (defaultNodes.bullet_list) {
    nodes.taskList = (state, node) => {
      state.renderContent(node);
    };
  }

  if (defaultNodes.list_item) {
    nodes.taskItem = (state, node) => {
      const checked = node.attrs.checked === true;
      state.write(checked ? "[x] " : "[ ] ");
      state.renderContent(node);
      state.closeBlock(node);
    };
  }

  nodes.table = (state, node) => {
    const rows: string[][] = [];
    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => {
        cells.push(escapeMarkdownTableCell(cell.textContent));
      });
      rows.push(cells);
    });

    if (rows.length === 0) return;

    const columnCount = Math.max(...rows.map((row) => row.length), 1);
    const normalizeRow = (row: string[]) =>
      Array.from({ length: columnCount }, (_, index) => row[index] ?? " ");
    const header = normalizeRow(rows[0]);
    const bodyRows = rows.slice(1).map(normalizeRow);

    state.write(`| ${header.join(" | ")} |\n`);
    state.write(`| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |\n`);
    bodyRows.forEach((row) => {
      state.write(`| ${row.join(" | ")} |\n`);
    });
    state.closeBlock(node);
  };

  nodes.tableRow = () => {};
  nodes.tableCell = () => {};
  nodes.tableHeader = () => {};

  const marks: Record<string, MarkdownSerializer["marks"][string]> = {};

  if (defaultMarks.strong) marks.bold = defaultMarks.strong;
  if (defaultMarks.em) marks.italic = defaultMarks.em;
  if (defaultMarks.link) marks.link = defaultMarks.link;
  if (defaultMarks.code) marks.code = defaultMarks.code;

  marks.underline = {
    open: "_",
    close: "_",
    mixable: true,
    expelEnclosingWhitespace: true,
  };

  return new MarkdownSerializer(nodes, marks);
}

function editorDocToMarkdown(doc: Node): string {
  try {
    return createMarkdownSerializer().serialize(doc);
  } catch {
    return "";
  }
}

function valueToEditorHtml(value: string, format: DocumentEditorFormat): string {
  return format === "markdown" ? markdownToHtml(value) : value;
}

function editorDocToValue(doc: Node, html: string, format: DocumentEditorFormat): string {
  return format === "markdown" ? editorDocToMarkdown(doc) : html;
}

export function DocumentEditor({
  value,
  onChange,
  format,
  readOnly = false,
  placeholder,
  htmlSanitizer,
  className,
}: DocumentEditorProps) {
  const [previewMode, setPreviewMode] = useState(false);
  const isInitializedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        blockquote: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      Placeholder.configure({
        placeholder:
          placeholder ??
          (format === "markdown"
            ? "输入 Markdown 内容..."
            : "输入配置项说明、设计规范或使用指引..."),
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Blockquote,
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    editable: !readOnly && !previewMode,
    onCreate: ({ editor }) => {
      editor.commands.setContent(valueToEditorHtml(value, format), {
        emitUpdate: false,
      });
      isInitializedRef.current = true;
    },
    onUpdate: ({ editor }) => {
      if (!isInitializedRef.current) return;

      const nextValue = editorDocToValue(
        editor.state.doc,
        editor.getHTML(),
        format,
      );
      if (nextValue !== valueRef.current) {
        onChange(nextValue);
      }
    },
    editorProps: {
      handlePaste: (view, event) => {
        if (format !== "markdown" || readOnly || previewMode) return false;

        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!looksLikeMarkdown(text)) return false;

        event.preventDefault();
        const container = document.createElement("div");
        container.innerHTML = markdownToHtml(text);
        const slice = ProseMirrorDOMParser.fromSchema(
          view.state.schema,
        ).parseSlice(container);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
      attributes: {
        class: cn(
          "markdown-editor-content focus:outline-none min-h-[200px] px-3 py-2 text-sm",
          readOnly ? "cursor-default" : "",
        ),
      },
    },
  });

  useEffect(() => {
    if (!editor || !isInitializedRef.current) return;

    const currentHtml = editor.getHTML();
    const targetHtml = valueToEditorHtml(value, format);
    if (currentHtml !== targetHtml) {
      isInitializedRef.current = false;
      editor.commands.setContent(targetHtml, { emitUpdate: false });
      isInitializedRef.current = true;
    }
  }, [editor, format, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly && !previewMode);
  }, [editor, readOnly, previewMode]);

  const handleAddLink = useCallback(() => {
    if (!editor) return;
    const existingUrl = editor.getAttributes("link").href;
    const url = window.prompt("输入链接地址:", existingUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  if (!editor) return null;

  const previewHtml =
    format === "html" ? (htmlSanitizer ? htmlSanitizer(value) : value) : "";
  const charCount =
    format === "html" ? htmlToPlainText(previewHtml).length : value.length;

  return (
    <div
      className={cn(
        "border rounded-md overflow-hidden flex flex-col h-full",
        className,
      )}
    >
      <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30 flex-wrap">
        <ToolbarButton
          icon={Bold}
          tooltip="加粗"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={Italic}
          tooltip="斜体"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={UnderlineIcon}
          tooltip="下划线"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={readOnly || previewMode}
        />

        <ToolbarSeparator />

        <ToolbarButton
          icon={Heading1}
          tooltip="一级标题"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={Heading2}
          tooltip="二级标题"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={Heading3}
          tooltip="三级标题"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          disabled={readOnly || previewMode}
        />

        <ToolbarSeparator />

        <ToolbarButton
          icon={List}
          tooltip="无序列表"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={ListOrdered}
          tooltip="有序列表"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={CheckSquare}
          tooltip="任务列表"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          disabled={readOnly || previewMode}
        />

        <ToolbarSeparator />

        <ToolbarButton
          icon={Code2}
          tooltip="代码块"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={Quote}
          tooltip="引用块"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={readOnly || previewMode}
        />

        <ToolbarSeparator />

        <ToolbarButton
          icon={LinkIcon}
          tooltip="插入链接"
          active={editor.isActive("link")}
          onClick={handleAddLink}
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={SeparatorHorizontal}
          tooltip="分隔线"
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          disabled={readOnly || previewMode}
        />
        <ToolbarButton
          icon={RemoveFormatting}
          tooltip="清除格式"
          active={false}
          onClick={() =>
            editor.chain().focus().clearNodes().unsetAllMarks().run()
          }
          disabled={readOnly || previewMode}
        />

        <div className="flex-1" />

        <ToolbarButton
          icon={previewMode ? Edit3 : Eye}
          tooltip={previewMode ? "编辑" : "预览"}
          active={previewMode}
          onClick={() => setPreviewMode((prev) => !prev)}
        />
      </div>

      {previewMode ? (
        format === "markdown" ? (
          <div
            className="markdown-editor-content min-h-[200px] px-3 py-2 text-sm overflow-y-auto scrollbar-thin"
            dangerouslySetInnerHTML={{
              __html: markdownToHtml(value || "（无内容）"),
            }}
          />
        ) : (
          <div
            className="markdown-editor-content min-h-[200px] px-3 py-2 text-sm overflow-y-auto scrollbar-thin"
            dangerouslySetInnerHTML={{
              __html: previewHtml || "<p>（无内容）</p>",
            }}
          />
        )
      ) : (
        <EditorContent
          editor={editor}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
        />
      )}

      <div className="px-3 py-1 border-t bg-muted/20 text-xs text-muted-foreground">
        {format === "markdown" ? "Markdown" : "HTML"} · {charCount} 字符
      </div>
    </div>
  );
}
