"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
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
              plugins={{ code, mermaid, math, cjk }}
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

  useEffect(() => {
    if (!isStreaming) {
      setIsCollapsed(true);
    }
  }, [isStreaming]);

  const handleToggle = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const lines = code.split("\n").filter(Boolean).length;
  const langLabel = language || "文本";

  const collapsed = !isStreaming && isCollapsed;
  const fenceMarkdown = `\`\`\`${language}\n${code}\n\`\`\``;

  return (
    <div className={cn("my-1 rounded-lg border border-border/50 overflow-hidden")}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2.5 px-3 py-2 w-full cursor-pointer select-none bg-muted/40 hover:bg-muted/70 transition-colors"
      >
        <div className="h-7 w-7 rounded flex items-center justify-center bg-muted-foreground/10 text-muted-foreground/80 flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs font-medium text-foreground/80">
            已生成 {lines} 行 {langLabel} 代码
          </div>
          <div className="text-[10px] text-muted-foreground/60">
            点击{collapsed ? "展开" : "折叠"}查看
          </div>
        </div>
        <div
          className={cn(
            "h-5 w-5 flex items-center justify-center text-muted-foreground/60 transition-transform flex-shrink-0",
            !collapsed && "rotate-90"
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </button>
      {!collapsed && (
        <div>
          <Streamdown
            plugins={{ code, cjk }}
            isAnimating={isStreaming}
            caret={isStreaming ? "block" : undefined}
            controls={{ table: false, code: true }}
          >
            {fenceMarkdown}
          </Streamdown>
        </div>
      )}
    </div>
  );
}
