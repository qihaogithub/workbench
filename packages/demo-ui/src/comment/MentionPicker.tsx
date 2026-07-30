"use client";

/**
 * @提及相关组件：
 * - MentionPicker：候选人弹出列表
 * - MentionTextarea：带 @ 触发逻辑的输入框（检测 "@xxx" → 弹出选择器 → 插入提及）
 * - MentionContent：渲染评论内容，将 "@名称" 高亮
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Bot, User } from "lucide-react";
import type { CommentMention } from "@workbench/shared";
import { cn } from "../utils";
import type { MentionCandidate } from "./types";

/* ------------------------------------------------------------------ */
/* MentionPicker                                                       */
/* ------------------------------------------------------------------ */

export interface MentionPickerProps {
  candidates: MentionCandidate[];
  /** "@" 之后已输入的过滤文本 */
  query: string;
  onSelect: (candidate: MentionCandidate) => void;
  onDismiss?: () => void;
  className?: string;
}

export function MentionPicker({
  candidates,
  query,
  onSelect,
  className,
}: MentionPickerProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (filtered.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md",
          className,
        )}
      >
        无匹配的提及对象
      </div>
    );
  }

  return (
    <div
      className={cn(
        "max-h-44 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md",
        className,
      )}
      onMouseDown={(e) => e.preventDefault()}
    >
      {filtered.map((candidate, index) => (
        <button
          key={`${candidate.type}:${candidate.id}`}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
            index === activeIndex
              ? "bg-accent text-accent-foreground"
              : "text-foreground",
          )}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => onSelect(candidate)}
        >
          {candidate.type === "agent" ? (
            <Bot className="h-3.5 w-3.5 shrink-0 text-violet-500" />
          ) : (
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{candidate.name}</span>
          {candidate.type === "agent" && (
            <span className="ml-auto shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-500">
              AI
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MentionTextarea                                                     */
/* ------------------------------------------------------------------ */

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  mentions: CommentMention[];
  onMentionsChange: (mentions: CommentMention[]) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Cmd/Ctrl + Enter 触发 */
  onSubmit?: () => void;
  rows?: number;
  className?: string;
}

interface ActiveMention {
  start: number;
  query: string;
}

function detectActiveMention(text: string, cursor: number): ActiveMention | null {
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1])) {
        return { start: i, query: text.slice(i + 1, cursor) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

export function MentionTextarea({
  value,
  onChange,
  mentions,
  onMentionsChange,
  candidates,
  placeholder,
  autoFocus,
  onSubmit,
  rows = 3,
  className,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = useState<ActiveMention | null>(null);

  const updateActive = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      setActive(null);
      return;
    }
    setActive(detectActiveMention(el.value, el.selectionStart ?? el.value.length));
  }, []);

  const handleChange = (next: string) => {
    onChange(next);
    requestAnimationFrame(updateActive);
  };

  const handleSelect = (candidate: MentionCandidate) => {
    if (!active) return;
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const before = value.slice(0, active.start);
    const after = value.slice(cursor);
    const insert = `@${candidate.name} `;
    const next = before + insert + after;
    onChange(next);
    if (!mentions.some((m) => m.id === candidate.id && m.type === candidate.type)) {
      onMentionsChange([
        ...mentions,
        { type: candidate.type, id: candidate.id, name: candidate.name },
      ]);
    }
    setActive(null);
    requestAnimationFrame(() => {
      if (el) {
        const pos = before.length + insert.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (active && e.key === "Escape") {
      e.preventDefault();
      setActive(null);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => handleChange(e.target.value)}
        onSelect={updateActive}
        onClick={updateActive}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setTimeout(() => setActive(null), 120);
        }}
        className={cn(
          "w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
          className,
        )}
      />
      {active && candidates.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-56">
          <MentionPicker
            candidates={candidates}
            query={active.query}
            onSelect={handleSelect}
            onDismiss={() => setActive(null)}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MentionContent                                                      */
/* ------------------------------------------------------------------ */

export interface MentionContentProps {
  content: string;
  mentions?: CommentMention[];
  className?: string;
}

export function MentionContent({ content, mentions, className }: MentionContentProps) {
  const nodes = useMemo(() => {
    if (!mentions || mentions.length === 0) return null;
    const names = [...new Set(mentions.map((m) => m.name))].sort(
      (a, b) => b.length - a.length,
    );
    const pattern = new RegExp(
      `@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "g",
    );
    const parts: Array<string | { name: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      parts.push({ name: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return parts;
  }, [content, mentions]);

  if (!nodes) {
    return <span className={cn("whitespace-pre-wrap break-words", className)}>{content}</span>;
  }

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {nodes.map((part, index) =>
        typeof part === "string" ? (
          <Fragment key={index}>{part}</Fragment>
        ) : (
          <span
            key={index}
            className="rounded bg-blue-500/15 px-0.5 font-medium text-blue-600 dark:text-blue-400"
          >
            @{part.name}
          </span>
        ),
      )}
    </span>
  );
}
