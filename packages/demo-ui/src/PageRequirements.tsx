"use client";

import { useCallback, useRef } from "react";
import { renderPageRequirementsMarkdown, stripMarkdown } from "./note-html";

interface PageRequirementsProps {
  /** 页面配置要求 Markdown 内容（含行内软引用 @[名称](key)） */
  markdown: string;
  /** 点击配置项引用 chip 时回调，参数为该配置项 key。 */
  onRefClick?: (configKey: string) => void;
  /** 空文档时是否渲染占位。默认渲染。 */
  showEmptyPlaceholder?: boolean;
  placeholderText?: string;
}

/**
 * 页面配置要求的只读渲染视图。
 * 行内软引用渲染为 chip，通过事件委托将点击冒泡到 onRefClick。
 * 服务端/hydration 期间不挂事件，仅渲染静态 HTML。
 */
export function PageRequirements({
  markdown,
  onRefClick,
  showEmptyPlaceholder = true,
  placeholderText = "暂无配置要求",
}: PageRequirementsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const sanitized = renderPageRequirementsMarkdown(markdown);
  const plainText = stripMarkdown(markdown);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onRefClick) return;
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-ref-key]",
      );
      const key = target?.getAttribute("data-ref-key");
      if (key) onRefClick(key);
    },
    [onRefClick],
  );

  if (!plainText && !showEmptyPlaceholder) return null;

  if (!plainText) {
    return (
      <div className="text-xs text-muted-foreground leading-tight">
        {placeholderText}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="markdown-editor-content text-xs text-muted-foreground leading-tight"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}