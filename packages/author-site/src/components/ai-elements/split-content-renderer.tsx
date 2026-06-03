"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { Streamdown } from "streamdown";
import { code as codePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { splitByFencedCode } from "./split-by-fenced-code";

interface SplitContentRendererProps {
  content: string;
  isStreaming: boolean;
}

export function SplitContentRenderer({
  content,
  isStreaming,
}: SplitContentRendererProps) {
  const blocks = useMemo(() => splitByFencedCode(content), [content]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "code") {
          return (
            <CollapsibleCodeBlock
              key={`code-${i}`}
              code={block.code}
              language={block.language}
              isStreaming={isStreaming}
            />
          );
        }
        if (block.content === "") return null;
        return (
          <div
            key={`text-${i}`}
            className="prose prose-sm dark:prose-invert max-w-none min-w-0 text-[14px]"
          >
            <Streamdown
              plugins={{ code: codePlugin, mermaid, math, cjk }}
              isAnimating={isStreaming}
              caret="block"
              controls={{ table: false, code: true, mermaid: true }}
            >
              {block.content}
            </Streamdown>
          </div>
        );
      })}
    </>
  );
}

interface CollapsibleCodeBlockProps {
  code: string;
  language: string;
  isStreaming: boolean;
}

function CollapsibleCodeBlock({
  code,
  language,
  isStreaming,
}: CollapsibleCodeBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isStreaming) {
      setIsCollapsed(true);
    }
  }, [isStreaming]);

  const handleToggle = useCallback(() => {
    if (!isStreaming) {
      setIsCollapsed((prev) => !prev);
    }
  }, [isStreaming]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }, [code]);

  const lines = code.split("\n").filter(Boolean).length;
  const langDisplay = language || "文本";

  const collapsed = !isStreaming && isCollapsed;
  const fenceMarkdown = `\`\`\`${language}\n${code}\n\`\`\``;

  return (
    <div className="code-card my-2 rounded-lg border border-border/50 overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 w-full text-left",
          !isStreaming &&
            "cursor-pointer select-none hover:bg-muted/50 transition-colors"
        )}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {langDisplay} · {lines} 行
        </span>
        <div className="flex-1" />
        {!collapsed && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="cursor-pointer p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            title="复制代码"
          >
            {copied ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "text-muted-foreground transition-transform flex-shrink-0",
            collapsed ? "-rotate-90" : ""
          )}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {!collapsed && (
        <Streamdown
          plugins={{ code: codePlugin, cjk }}
          isAnimating={isStreaming}
          caret={isStreaming ? "block" : undefined}
          controls={false}
        >
          {fenceMarkdown}
        </Streamdown>
      )}
    </div>
  );
}
