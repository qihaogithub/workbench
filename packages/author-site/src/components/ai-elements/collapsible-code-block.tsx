"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface CodeBlockFolderProps {
  children: React.ReactNode;
  isStreaming?: boolean;
  className?: string;
}

function processCodeBlocks(container: HTMLElement) {
  const pres = Array.from(container.querySelectorAll("pre"));

  pres.forEach((pre) => {
    if (pre.hasAttribute("data-cb-processed")) return;

    const text = pre.textContent || "";
    const lines = text.split("\n").filter(Boolean).length;
    if (lines <= 5) return;

    pre.setAttribute("data-cb-processed", "true");

    let wrapper: HTMLElement | null = pre.parentElement;
    while (wrapper && wrapper !== container) {
      const tagName = wrapper.tagName.toLowerCase();
      if (tagName === "div" && wrapper.children.length >= 2) {
        const hasHeader = Array.from(wrapper.children).some(
          (child) =>
            child.tagName === "DIV" &&
            !(child as HTMLElement).querySelector("pre"),
        );
        if (hasHeader) break;
      }
      wrapper = wrapper.parentElement;
    }
    if (!wrapper || wrapper === container) {
      wrapper = pre.parentElement || pre;
    }

    const code = pre.querySelector("code");
    const langClass = code?.className || "";
    const langMatch = langClass.match(/language-(\w+)/);
    const language = langMatch ? langMatch[1] : "";

    wrapper.classList.add("cb-collapsible", "cb-collapsed");

    const summary = document.createElement("div");
    summary.className =
      "cb-summary flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer select-none bg-muted/30 hover:bg-muted/50 transition-colors";
    summary.innerHTML = `
      <svg class="cb-chevron h-3.5 w-3.5 text-muted-foreground/60 transition-transform flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      <span class="text-xs text-muted-foreground/80">展开 · ${lines} 行${language ? ` ${language}` : ""} 代码</span>
    `;

    summary.addEventListener("click", () => {
      const isNowCollapsed = wrapper!.classList.toggle("cb-collapsed");
      const chevron = summary.querySelector(".cb-chevron");
      if (chevron) {
        (chevron as HTMLElement).style.transform = isNowCollapsed
          ? "rotate(0deg)"
          : "rotate(90deg)";
      }
      const span = summary.querySelector("span");
      if (span) {
        span.textContent = isNowCollapsed
          ? `展开 · ${lines} 行${language ? ` ${language}` : ""} 代码`
          : `折叠 · ${lines} 行${language ? ` ${language}` : ""} 代码`;
      }
    });

    wrapper.parentNode?.insertBefore(summary, wrapper);
  });
}

function cleanupCodeBlocks(container: HTMLElement) {
  container.querySelectorAll(".cb-summary").forEach((el) => el.remove());
  container.querySelectorAll(".cb-collapsible").forEach((el) => {
    el.classList.remove("cb-collapsible", "cb-collapsed");
  });
  container.querySelectorAll("[data-cb-processed]").forEach((el) => {
    el.removeAttribute("data-cb-processed");
  });
}

export function CodeBlockFolder({
  children,
  isStreaming = false,
  className,
}: CodeBlockFolderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || isStreaming) return;

    // 立即处理一次
    processCodeBlocks(container);

    // MutationObserver 处理异步渲染（Shiki 主题加载等延迟渲染）
    const observer = new MutationObserver(() => {
      processCodeBlocks(container);
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanupCodeBlocks(container);
    };
  }, [isStreaming, children]);

  return (
    <div ref={containerRef} className={cn("cb-container", className)}>
      {children}
    </div>
  );
}
