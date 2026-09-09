"use client";

/** 评论输入中的 @ 提及选择与结构化标签输入器。 */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Bot, User } from "lucide-react";
import type { CommentMention } from "@workbench/shared";
import { cn } from "../utils";
import type { MentionCandidate, MentionCandidateSearch } from "./types";

export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const normalized = query.trim().toLowerCase();
  return normalized
    ? candidates.filter((candidate) => candidate.name.toLowerCase().includes(normalized))
    : candidates;
}

export interface MentionPickerProps {
  candidates: MentionCandidate[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (candidate: MentionCandidate) => void;
  status?: "loading" | "error" | "rate-limited";
  className?: string;
}

export function MentionPicker({
  candidates,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  status,
  className,
}: MentionPickerProps) {
  if (candidates.length === 0) {
    return (
      <div className={cn("rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md", className)}>
        {status === "loading" ? "正在搜索…" : status === "rate-limited" ? "搜索过于频繁，请稍后重试" : status === "error" ? "搜索失败，可继续输入" : "无匹配的提及对象"}
      </div>
    );
  }

  return (
    <div className={cn("max-h-44 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md", className)} onMouseDown={(event) => event.preventDefault()}>
      {candidates.map((candidate, index) => (
        <button
          key={`${candidate.type}:${candidate.id}`}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
            index === activeIndex ? "bg-accent text-accent-foreground" : "text-foreground",
          )}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(candidate)}
        >
          {candidate.type === "agent" ? <Bot className="h-3.5 w-3.5 shrink-0 text-violet-500" /> : <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{candidate.name}</span>
          {candidate.type === "agent" && <span className="ml-auto shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-500">AI</span>}
        </button>
      ))}
    </div>
  );
}

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  mentions: CommentMention[];
  onMentionsChange: (mentions: CommentMention[]) => void;
  candidates: MentionCandidate[];
  searchMentionCandidates?: MentionCandidateSearch;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  rows?: number;
  className?: string;
  style?: React.CSSProperties;
}

export interface MentionTextareaHandle {
  focus: () => void;
  insertText: (text: string) => void;
}

interface ActiveMention { start: number; query: string }

export function detectActiveMention(text: string, cursor: number): ActiveMention | null {
  let index = cursor - 1;
  while (index >= 0) {
    const character = text[index];
    if (character === "@") return { start: index, query: text.slice(index + 1, cursor) };
    if (/\s/.test(character)) return null;
    index -= 1;
  }
  return null;
}

function getCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  const text = () => root.innerText ?? root.textContent ?? "";
  if (!selection?.rangeCount) return text().length;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return text().length;
  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function setCaretOffset(root: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  root.focus();
}

function mentionKey(mention: Pick<CommentMention, "type" | "id">): string {
  return `${mention.type}:${mention.id}`;
}

function collectMentions(root: HTMLElement): CommentMention[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-mention-id]")).map((node) => ({
    id: node.dataset.mentionId!,
    type: node.dataset.mentionType as CommentMention["type"],
    name: node.dataset.mentionName!,
  }));
}

function renderEditor(root: HTMLElement, value: string, mentions: CommentMention[]): void {
  root.replaceChildren();
  const ordered = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const pattern = ordered.length
    ? new RegExp(`@(${ordered.map((mention) => mention.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g")
    : null;
  const byName = new Map(ordered.map((mention) => [mention.name, mention]));
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while (pattern && (match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) root.append(document.createTextNode(value.slice(lastIndex, match.index)));
    const mention = byName.get(match[1]);
    if (mention) {
      const tag = document.createElement("span");
      tag.contentEditable = "false";
      tag.dataset.mentionId = mention.id;
      tag.dataset.mentionType = mention.type;
      tag.dataset.mentionName = mention.name;
      tag.className = cn(
        "mx-0.5 inline-flex select-none items-center gap-1 rounded px-1.5 py-0.5 align-baseline font-medium",
        mention.type === "agent" ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-blue-500/15 text-blue-700 dark:text-blue-300",
      );
      const icon = document.createElement("span");
      icon.textContent = "@";
      icon.setAttribute("aria-hidden", "true");
      tag.append(icon, document.createTextNode(mention.name));
      root.append(tag);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length || root.childNodes.length === 0) root.append(document.createTextNode(value.slice(lastIndex)));
}

export const MentionTextarea = forwardRef<MentionTextareaHandle, MentionTextareaProps>(function MentionTextarea({ value, onChange, mentions, onMentionsChange, candidates, searchMentionCandidates, placeholder, autoFocus, onSubmit, rows = 3, className, style }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveMention | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteCandidates, setRemoteCandidates] = useState<MentionCandidate[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error" | "rate-limited">("idle");
  const filtered = useMemo(() => {
    if (!active) return [];
    const local = filterMentionCandidates(candidates, active.query);
    if (remoteCandidates === null) return local;
    return [...local, ...remoteCandidates].filter(
      (candidate, index, all) => all.findIndex((item) => item.type === candidate.type && item.id === candidate.id) === index,
    );
  }, [active, candidates, remoteCandidates]);

  useEffect(() => {
    if (!active || !searchMentionCandidates || !active.query.trim()) {
      setRemoteCandidates(null);
      setSearchStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchStatus("loading");
      void searchMentionCandidates(active.query, { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) {
          setRemoteCandidates(result);
          setSearchStatus("idle");
        }
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error && typeof error === "object" && "status" in error && (error as { status?: number }).status === 429 ? "rate-limited" : "error";
        setRemoteCandidates([]);
        setSearchStatus(status);
      });
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [active, searchMentionCandidates]);

  const updateActive = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setActive(detectActiveMention(editor.innerText ?? editor.textContent ?? "", getCaretOffset(editor)));
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || (editor.innerText ?? editor.textContent ?? "") === value) return;
    renderEditor(editor, value, mentions);
  }, [value, mentions]);

  useEffect(() => { setActiveIndex(0); }, [active?.start, active?.query]);

  const emitInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange((editor.innerText ?? editor.textContent ?? "").replace(/\n$/, ""));
    onMentionsChange(collectMentions(editor));
    requestAnimationFrame(updateActive);
  }, [onChange, onMentionsChange, updateActive]);

  const selectCandidate = useCallback((candidate: MentionCandidate) => {
    const editor = editorRef.current;
    if (!editor || !active) return;
    const cursor = getCaretOffset(editor);
    const text = editor.innerText ?? editor.textContent ?? "";
    const nextMention: CommentMention = { id: candidate.id, name: candidate.name, type: candidate.type };
    const nextMentions = mentions.some((mention) => mentionKey(mention) === mentionKey(nextMention)) ? mentions : [...mentions, nextMention];
    const insert = `@${candidate.name} `;
    const next = text.slice(0, active.start) + insert + text.slice(cursor);
    renderEditor(editor, next, nextMentions);
    onChange(next);
    onMentionsChange(nextMentions);
    setActive(null);
    requestAnimationFrame(() => setCaretOffset(editor, active.start + insert.length));
  }, [active, mentions, onChange, onMentionsChange]);

  const removeAdjacentMention = useCallback((backward: boolean): boolean => {
    const editor = editorRef.current;
    if (!editor) return false;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.getRangeAt(0).collapsed) return false;
    const range = selection.getRangeAt(0);
    let node: Node | null = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = backward ? node.previousSibling : node.nextSibling;
    else node = backward ? node.childNodes[range.startOffset - 1] : node.childNodes[range.startOffset];
    if (!(node instanceof HTMLElement) || !node.dataset.mentionId) return false;
    const offset = getCaretOffset(editor) - (backward ? (node.textContent ?? "").length : 0);
    const key = `${node.dataset.mentionType}:${node.dataset.mentionId}`;
    node.remove();
    onChange(editor.innerText ?? editor.textContent ?? "");
    onMentionsChange(collectMentions(editor).filter((mention) => mentionKey(mention) !== key));
    requestAnimationFrame(() => setCaretOffset(editor, Math.max(0, offset)));
    return true;
  }, [onChange, onMentionsChange]);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    insertText: (text: string) => {
      const editor = editorRef.current;
      if (!editor || !text) return;
      const cursor = getCaretOffset(editor);
      const editorText = editor.innerText ?? editor.textContent ?? "";
      const next = editorText.slice(0, cursor) + text + editorText.slice(cursor);
      renderEditor(editor, next, mentions);
      onChange(next);
      onMentionsChange(collectMentions(editor));
      requestAnimationFrame(() => setCaretOffset(editor, cursor + text.length));
    },
  }), [mentions, onChange, onMentionsChange]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit?.();
      return;
    }
    if (active && filtered.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (event.key === "ArrowDown" ? (index + 1) % filtered.length : (index - 1 + filtered.length) % filtered.length));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectCandidate(filtered[activeIndex]);
        return;
      }
    }
    if (active && event.key === "Escape") {
      event.preventDefault();
      setActive(null);
      return;
    }
    if (event.key === "Backspace" && removeAdjacentMention(true)) event.preventDefault();
    if (event.key === "Delete" && removeAdjacentMention(false)) event.preventDefault();
  };

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        suppressContentEditableWarning
        autoFocus={autoFocus}
        onInput={emitInput}
        onKeyUp={updateActive}
        onClick={updateActive}
        onBlur={() => setTimeout(() => setActive(null), 120)}
        onKeyDown={handleKeyDown}
        style={style}
        className={cn("min-h-[2.5rem] w-full whitespace-pre-wrap break-words rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] focus:outline-none focus:ring-1 focus:ring-ring", rows === 2 ? "min-h-[4rem]" : "min-h-[5.5rem]", className)}
      />
      {active && (candidates.length > 0 || searchMentionCandidates) && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-56">
          <MentionPicker candidates={filtered} activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} onSelect={selectCandidate} status={searchStatus === "idle" ? undefined : searchStatus} />
        </div>
      )}
    </div>
  );
});

MentionTextarea.displayName = "MentionTextarea";

export interface MentionContentProps { content: string; mentions?: CommentMention[]; className?: string }

export function MentionContent({ content, mentions, className }: MentionContentProps) {
  const nodes = useMemo(() => {
    if (!mentions?.length) return null;
    const names = [...new Set(mentions.map((mention) => mention.name))].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`@(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    const parts: Array<string | { name: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
      parts.push({ name: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return parts;
  }, [content, mentions]);
  if (!nodes) return <span className={cn("whitespace-pre-wrap break-words", className)}>{content}</span>;
  return <span className={cn("whitespace-pre-wrap break-words", className)}>{nodes.map((part, index) => typeof part === "string" ? <Fragment key={index}>{part}</Fragment> : <span key={index} className="rounded bg-blue-500/15 px-0.5 font-medium text-blue-600 dark:text-blue-400">@{part.name}</span>)}</span>;
}
