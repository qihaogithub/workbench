"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link as LinkIcon, RemoveFormatting } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

const ALLOWED_TAGS = ["p", "strong", "em", "u", "ul", "ol", "li", "a", "br"];

function sanitizeNoteHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const DOMPurify = require("dompurify");
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "target"],
    ALLOW_DATA_ATTR: false,
  });
}

export { sanitizeNoteHtml };

function ToolbarButton({
  icon: Icon,
  tooltip,
  active,
  onClick,
}: {
  icon: React.ElementType;
  tooltip: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={active}
          onPressedChange={onClick}
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

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        hardBreak: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder: "输入配置项说明、设计规范或使用指引...",
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[200px] max-h-[360px] overflow-y-auto px-3 py-2 text-sm",
      },
    },
  });

  if (!editor) return null;

  const handleAddLink = () => {
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
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30 flex-wrap">
        <ToolbarButton
          icon={Bold}
          tooltip="加粗 (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          tooltip="斜体 (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={UnderlineIcon}
          tooltip="下划线 (Ctrl+U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton
          icon={List}
          tooltip="无序列表"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          tooltip="有序列表"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton
          icon={LinkIcon}
          tooltip="插入链接 (Ctrl+K)"
          active={editor.isActive("link")}
          onClick={handleAddLink}
        />
        <ToolbarButton
          icon={RemoveFormatting}
          tooltip="清除格式"
          active={false}
          onClick={() =>
            editor.chain().focus().clearNodes().unsetAllMarks().run()
          }
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
