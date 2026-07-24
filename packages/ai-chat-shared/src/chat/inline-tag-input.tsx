"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/utils";
import { usePromptInput } from "../prompt-input";

export interface InlineTag {
  id: string;
  type: "project" | "element";
  label: string;
  context: string;
}

export interface ProjectReference {
  id: string;
  name: string;
  category?: string;
  thumbnail?: string;
  demoCount?: number;
  updatedAt?: number;
}

export interface InlineTagInputValue {
  text: string;
  tags: InlineTag[];
}

export interface InlineTagInputHandle {
  insertTag(tag: InlineTag): void;
  clear(): void;
  focus(): void;
  getValue(): InlineTagInputValue;
}

type InputSegment =
  | { type: "text"; value: string }
  | { type: "tag"; tag: InlineTag };

const TAG_DATA_ATTR = "data-tag-id";

function isTagElement(node: Node | null): node is HTMLSpanElement {
  return (
    node instanceof HTMLSpanElement &&
    node.hasAttribute(TAG_DATA_ATTR)
  );
}

function extractSegments(container: HTMLElement): InputSegment[] {
  const segments: InputSegment[] = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (isTagElement(node as HTMLElement)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        if (
          node.nodeType === Node.TEXT_NODE &&
          node.textContent !== null
        ) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  let node: Node | null = walker.firstChild();
  while (node) {
    if (isTagElement(node as HTMLElement)) {
      const tagId = (node as HTMLElement).getAttribute(TAG_DATA_ATTR);
      if (tagId) {
        segments.push({
          type: "tag",
          tag: {
            id: tagId,
            type: ((node as HTMLElement).dataset.tagType || "element") as InlineTag["type"],
            label: (node as HTMLElement).dataset.tagLabel || "",
            context: (node as HTMLElement).dataset.tagContext || "",
          },
        });
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      segments.push({ type: "text", value: node.textContent || "" });
    }
    node = walker.nextSibling();
  }

  return segments;
}

function extractValue(segments: InputSegment[]): InlineTagInputValue {
  const text = segments
    .filter((s) => s.type === "text")
    .map((s) => (s as { type: "text"; value: string }).value)
    .join("");
  const tags = segments
    .filter((s) => s.type === "tag")
    .map((s) => (s as { type: "tag"; tag: InlineTag }).tag);
  return { text, tags };
}

function insertTextAtCursor(text: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function getPreviousSiblingTag(container: HTMLElement): HTMLSpanElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;

  const node = range.startContainer;
  if (node === container && range.startOffset === 0) return null;

  if (node.nodeType === Node.TEXT_NODE) {
    if (range.startOffset === 0) {
      return isTagElement(node.previousSibling)
        ? node.previousSibling
        : null;
    }
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const children = Array.from(node.childNodes);
    const idx = range.startOffset;
    if (idx > 0 && isTagElement(children[idx - 1])) {
      return children[idx - 1] as HTMLSpanElement;
    }
    return null;
  }

  return null;
}

interface InlineTagInputProps {
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  disabled?: boolean;
  className?: string;
  controller?: React.MutableRefObject<InlineTagInputHandle | null>;
  onValueChange?: (value: InlineTagInputValue) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function InlineTagInput({
  placeholder = "输入指令，按 Enter 发送...",
  minHeight = 40,
  maxHeight = 140,
  disabled = false,
  className,
  controller,
  onValueChange,
  onKeyDown,
}: InlineTagInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const tagsMapRef = useRef<Map<string, InlineTag>>(new Map());
  const isComposingRef = useRef(false);
  const promptCtx = usePromptInput();
  const [, forceRender] = useState(0);

  const syncToPromptInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const segments = extractSegments(editor);
    const value = extractValue(segments);
    promptCtx.setText(value.text);
    onValueChange?.(value);
  }, [promptCtx, onValueChange]);

  const insertTag = useCallback(
    (tag: InlineTag) => {
      const editor = editorRef.current;
      if (!editor) return;

      tagsMapRef.current.set(tag.id, tag);

      const sel = window.getSelection();
      let range: Range;

      if (sel && sel.rangeCount > 0) {
        range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
          range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
        }
      } else {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }

      const tagSpan = document.createElement("span");
      tagSpan.setAttribute(TAG_DATA_ATTR, tag.id);
      tagSpan.contentEditable = "false";
      tagSpan.className = cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium align-middle select-none cursor-default group",
        tag.type === "project"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
          : "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
      );

      const iconSpan = document.createElement("span");
      iconSpan.className = "shrink-0 flex items-center";
      tagSpan.appendChild(iconSpan);

      const atText = document.createTextNode(`@${tag.label}`);
      tagSpan.appendChild(atText);

      const removeBtn = document.createElement("span");
      removeBtn.className =
        "ml-0.5 shrink-0 rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer flex items-center";
      removeBtn.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      removeBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        tagSpan.remove();
        tagsMapRef.current.delete(tag.id);
        syncToPromptInput();
        editor.focus();
      });
      tagSpan.appendChild(removeBtn);

      range.deleteContents();
      range.insertNode(tagSpan);

      const space = document.createTextNode("\u00A0");
      range.setStartAfter(tagSpan);
      range.collapse(true);
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);

      sel?.removeAllRanges();
      sel?.addRange(range);

      syncToPromptInput();
      editor.focus();
    },
    [syncToPromptInput],
  );

  const clear = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    tagsMapRef.current.clear();
    editor.innerHTML = "";
    syncToPromptInput();
  }, [syncToPromptInput]);

  const getValue = useCallback((): InlineTagInputValue => {
    const editor = editorRef.current;
    if (!editor) return { text: "", tags: [] };
    const segments = extractSegments(editor);
    return extractValue(segments);
  }, []);

  useImperativeHandle(
    controller,
    () => ({
      insertTag,
      clear,
      focus: () => editorRef.current?.focus(),
      getValue,
    }),
    [insertTag, clear, getValue],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(`[${TAG_DATA_ATTR}]`)) {
        const tagEl = target.closest(`[${TAG_DATA_ATTR}]`) as HTMLElement;
        const removeBtn = target.closest("span:last-child");
        if (removeBtn && removeBtn.parentElement === tagEl) return;
      }
    };

    editor.addEventListener("click", handleClick);
    return () => editor.removeEventListener("click", handleClick);
  }, []);

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    syncToPromptInput();
  }, [syncToPromptInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isComposingRef.current) {
        onKeyDown?.(e);
        return;
      }

      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        syncToPromptInput();
        if (promptCtx.text.trim() || promptCtx.files.length > 0) {
          promptCtx.onSubmit?.({
            text: promptCtx.text.trim(),
            files: promptCtx.files,
          });
        }
        return;
      }

      if (e.key === "Backspace") {

    // ... keep existing Backspace handling
        const editor = editorRef.current;
        if (!editor) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;

        const prevTag = getPreviousSiblingTag(editor);
        if (prevTag) {
          e.preventDefault();
          const tagId = prevTag.getAttribute(TAG_DATA_ATTR);
          if (tagId) tagsMapRef.current.delete(tagId);
          prevTag.remove();
          syncToPromptInput();
          return;
        }
      }

      onKeyDown?.(e);
    },
    [onKeyDown, syncToPromptInput, promptCtx],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (text) {
        insertTextAtCursor(text);
        syncToPromptInput();
      }
    },
    [syncToPromptInput],
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    syncToPromptInput();
  }, [syncToPromptInput]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      forceRender((n) => n + 1);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      style={{
        minHeight: `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
      }}
    >
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={cn(
          "w-full resize-none overflow-y-auto rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/50",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
          disabled && "cursor-not-allowed opacity-50",
        )}
        data-placeholder={placeholder}
        style={{
          minHeight: `${minHeight}px`,
          maxHeight: `${maxHeight}px`,
        }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
      />
    </div>
  );
}
