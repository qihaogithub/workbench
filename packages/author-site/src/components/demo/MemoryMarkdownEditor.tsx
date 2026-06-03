"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Blockquote from "@tiptap/extension-blockquote";
import { common, createLowlight } from "lowlight";
import {
  defaultMarkdownSerializer,
  MarkdownSerializer,
} from "prosemirror-markdown";
import type { Node } from "@tiptap/pm/model";
import MarkdownIt from "markdown-it";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code2,
  Quote,
  Link as LinkIcon,
  RemoveFormatting,
  Eye,
  Edit3,
  SeparatorHorizontal,
} from "lucide-react";

const lowlight = createLowlight(common);
const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

interface MemoryMarkdownEditorProps {
  value: string;
  onChange: (md: string) => void;
  readOnly?: boolean;
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
          className="h-7 w-7 p-0"
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

function Separator() {
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

  // TipTap v3 uses camelCase, prosemirror-markdown default uses snake_case
  // Map default rules to camelCase names so they match TipTap's doc
  if (defaultNodes.blockquote) nodes.blockquote = defaultNodes.blockquote;
  if (defaultNodes.heading) nodes.heading = defaultNodes.heading;
  if (defaultNodes.paragraph) nodes.paragraph = defaultNodes.paragraph;
  if (defaultNodes.text) nodes.text = defaultNodes.text;
  if (defaultNodes.image) nodes.image = defaultNodes.image;
  if (defaultNodes.hard_break) nodes.hardBreak = defaultNodes.hard_break;
  if (defaultNodes.code_block) nodes.codeBlock = defaultNodes.code_block;
  if (defaultNodes.horizontal_rule)
    nodes.horizontalRule = defaultNodes.horizontal_rule;
  if (defaultNodes.bullet_list) nodes.bulletList = defaultNodes.bullet_list;
  if (defaultNodes.ordered_list) nodes.orderedList = defaultNodes.ordered_list;
  if (defaultNodes.list_item) nodes.listItem = defaultNodes.list_item;

  // taskList: same as bulletList in Markdown output, but with [ ] / [x] items
  if (defaultNodes.bullet_list) {
    nodes.taskList = (state, node) => {
      // Render children; the wrapping <ul data-type="taskList"> is implicit
      // because TipTap puts listItem directly inside taskList.
      // We need custom rendering: each listItem becomes "- [ ] text" or "- [x] text"
      // and lines are joined with newlines
      state.renderContent(node);
    };
  }

  if (defaultNodes.list_item) {
    nodes.taskItem = (state, node) => {
      const checked = node.attrs.checked === true;
      const prefix = checked ? "[x] " : "[ ] ";
      state.write(prefix);
      state.renderContent(node);
      state.closeBlock(node);
    };
  }

  const marks: Record<string, MarkdownSerializer["marks"][string]> = {};

  // TipTap v3 uses "bold" and "italic" mark names, prosemirror-markdown default uses "strong" and "em"
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
    const serializer = createMarkdownSerializer();
    return serializer.serialize(doc);
  } catch {
    return "";
  }
}

export function MemoryMarkdownEditor({
  value,
  onChange,
  readOnly = false,
}: MemoryMarkdownEditorProps) {
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
        codeBlock: false,
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
        placeholder: "输入 Markdown 内容...",
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Blockquote,
    ],
    content: "",
    editable: !readOnly && !previewMode,
    onCreate: ({ editor }) => {
      const html = markdownToHtml(value);
      if (html) {
        editor.commands.setContent(html, { emitUpdate: false });
      }
      isInitializedRef.current = true;
    },
    onUpdate: ({ editor }) => {
      if (!isInitializedRef.current) {
        return;
      }
      try {
        const md = editorDocToMarkdown(editor.state.doc);
        if (md !== valueRef.current) {
          onChange(md);
        }
      } catch {
        // ignore serialization errors
      }
    },
    editorProps: {
      attributes: {
        class: cn(
          "markdown-editor-content focus:outline-none min-h-[200px] px-3 py-2 text-sm",
          readOnly ? "cursor-default" : "",
        ),
      },
    },
  });

  // Re-sync editor content when value changes externally (e.g., reload from server)
  useEffect(() => {
    if (!editor || !isInitializedRef.current) return;
    const currentHtml = editor.getHTML();
    const targetHtml = markdownToHtml(value);
    if (targetHtml && currentHtml !== targetHtml) {
      isInitializedRef.current = false;
      editor.commands.setContent(targetHtml, { emitUpdate: false });
      isInitializedRef.current = true;
    }
  }, [editor, value]);

  // Update editor's editable state when previewMode or readOnly changes
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

  const mdCharCount = value.length;

  return (
    <div className="border rounded-md overflow-hidden flex flex-col h-full">
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

        <Separator />

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

        <Separator />

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

        <Separator />

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

        <Separator />

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
        <div className="markdown-editor-content min-h-[200px] px-3 py-2 text-sm overflow-y-auto scrollbar-thin">
          <Streamdown
            plugins={{ code, cjk }}
            controls={{ table: false, code: true }}
          >
            {value || "（无内容）"}
          </Streamdown>
        </div>
      ) : (
        <EditorContent
          editor={editor}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
        />
      )}

      <div className="px-3 py-1 border-t bg-muted/20 text-xs text-muted-foreground">
        Markdown · {mdCharCount} 字符
      </div>
    </div>
  );
}
