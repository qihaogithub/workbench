"use client";

import { cn } from "@/lib/utils";
import { useLayoutEffect, useRef } from "react";

interface CodeBlockFolderProps {
  children: React.ReactNode;
  isStreaming?: boolean;
  className?: string;
}

const CODE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

const CHEVRON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;

function extractLanguage(pre: HTMLElement): string {
  const code = pre.querySelector("code");
  const className = code?.className || "";
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : "";
}

function findCodeBlockContainer(
  pre: HTMLElement,
  container: HTMLElement,
): HTMLElement {
  let candidate: HTMLElement | null = pre.parentElement;
  while (candidate && candidate !== container) {
    if (
      candidate.tagName.toLowerCase() === "div" &&
      candidate.children.length >= 2
    ) {
      const hasNonPreChild = Array.from(candidate.children).some(
        (child) =>
          child.tagName === "DIV" &&
          !(child as HTMLElement).querySelector("pre"),
      );
      if (hasNonPreChild) return candidate;
    }
    candidate = candidate.parentElement;
  }
  return pre.parentElement || pre;
}

function buildSummaryHTML(lines: number, language: string, isCollapsed: boolean): string {
  const action = isCollapsed ? "展开" : "折叠";
  const langLabel = language ? ` ${language}` : "";
  const borderClass = isCollapsed ? "" : "rounded-b-none";
  return `
    <div class="cb-summary-inner flex items-center gap-2.5 px-3 py-2 cursor-pointer select-none bg-muted/40 hover:bg-muted/70 transition-colors ${borderClass}">
      <div class="cb-icon-wrap h-7 w-7 rounded flex items-center justify-center bg-muted-foreground/10 text-muted-foreground/80 flex-shrink-0">${CODE_ICON_SVG}</div>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-medium text-foreground/80">已生成 ${lines} 行${langLabel} 代码</div>
        <div class="text-[10px] text-muted-foreground/60">点击${action}查看</div>
      </div>
      <div class="cb-chevron-wrap h-5 w-5 flex items-center justify-center text-muted-foreground/60 transition-transform flex-shrink-0">${CHEVRON_SVG}</div>
    </div>
  `;
}

function processCodeBlocks(container: HTMLElement) {
  const pres = Array.from(container.querySelectorAll("pre"));

  pres.forEach((pre) => {
    if (pre.closest(".cb-visual-wrapper")) return;

    const text = pre.textContent || "";
    const lines = text.split("\n").filter(Boolean).length;
    if (lines < 1) return;

    const codeBlockEl = findCodeBlockContainer(pre, container);
    if (codeBlockEl.hasAttribute("data-cb-processed")) return;
    codeBlockEl.setAttribute("data-cb-processed", "true");
    codeBlockEl.classList.add("cb-collapsible", "cb-collapsed");
    codeBlockEl.style.display = "none";

    const language = extractLanguage(pre);

    const summary = document.createElement("div");
    summary.className = "cb-summary";
    summary.innerHTML = buildSummaryHTML(lines, language, true);

    const chevronWrap = summary.querySelector(".cb-chevron-wrap");
    if (chevronWrap instanceof HTMLElement) {
      chevronWrap.style.transform = "rotate(0deg)";
    }

    summary.addEventListener("click", () => {
      const wasCollapsed = codeBlockEl.classList.contains("cb-collapsed");
      const willBeCollapsed = !wasCollapsed;

      if (willBeCollapsed) {
        codeBlockEl.classList.add("cb-collapsed");
        codeBlockEl.style.display = "none";
      } else {
        codeBlockEl.classList.remove("cb-collapsed");
        codeBlockEl.style.display = "";
      }

      summary.innerHTML = buildSummaryHTML(lines, language, willBeCollapsed);

      const newChevron = summary.querySelector(".cb-chevron-wrap");
      if (newChevron instanceof HTMLElement) {
        newChevron.style.transform = willBeCollapsed
          ? "rotate(0deg)"
          : "rotate(90deg)";
      }
    });

    const visualWrapper = document.createElement("div");
    visualWrapper.className = "cb-visual-wrapper";
    codeBlockEl.parentNode?.insertBefore(visualWrapper, codeBlockEl);
    visualWrapper.appendChild(summary);
    visualWrapper.appendChild(codeBlockEl);
  });
}

function cleanupCodeBlocks(container: HTMLElement) {
  container.querySelectorAll(".cb-visual-wrapper").forEach((vw) => {
    const codeBlock = vw.querySelector("[data-cb-processed]") as HTMLElement | null;
    if (codeBlock) {
      codeBlock.classList.remove("cb-collapsible", "cb-collapsed");
      codeBlock.style.display = "";
      codeBlock.removeAttribute("data-cb-processed");
      vw.parentNode?.insertBefore(codeBlock, vw);
    }
    vw.remove();
  });
}

export function CodeBlockFolder({
  children,
  isStreaming = false,
  className,
}: CodeBlockFolderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isStreaming) {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      cleanupCodeBlocks(container);
      return;
    }

    processCodeBlocks(container);

    if (!observerRef.current) {
      const observer = new MutationObserver(() => {
        processCodeBlocks(container);
      });
      observer.observe(container, { childList: true, subtree: true });
      observerRef.current = observer;
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [isStreaming, children]);

  return (
    <div ref={containerRef} className={cn("cb-container", className)}>
      {children}
    </div>
  );
}
