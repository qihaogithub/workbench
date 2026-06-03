"use client";

import { cn } from "@/lib/utils";
import { useCallback, useRef } from "react";

interface CodeBlockFolderProps {
  children: React.ReactNode;
  /** 是否正在流式输出，流式期间不处理折叠 */
  isStreaming?: boolean;
  className?: string;
}

interface FolderState {
  destroy: () => void;
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
      "cb-summary flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-md cursor-pointer hover:bg-muted/50 transition-colors select-none";
    summary.innerHTML = `
      <svg class="cb-chevron h-3.5 w-3.5 text-muted-foreground/60 transition-transform flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      <span class="text-xs text-muted-foreground/80">展开 · ${lines} 行${language ? ` ${language}` : ""} 代码</span>
    `;

    summary.addEventListener("click", () => {
      const isNowCollapsed = wrapper!.classList.toggle("cb-collapsed");
      const chevron = summary.querySelector(".cb-chevron");
      if (chevron) {
        if (isNowCollapsed) {
          chevron.setAttribute(
            "style",
            "transform: rotate(0deg)",
          );
        } else {
          chevron.setAttribute(
            "style",
            "transform: rotate(90deg)",
          );
        }
      }
      summary.querySelector("span")!.textContent = isNowCollapsed
        ? `展开 · ${lines} 行${language ? ` ${language}` : ""} 代码`
        : `折叠 · ${lines} 行${language ? ` ${language}` : ""} 代码`;
    });

    wrapper.parentNode?.insertBefore(summary, wrapper);
  });
}

export function CodeBlockFolder({
  children,
  isStreaming = false,
  className,
}: CodeBlockFolderProps) {
  const stateRef = useRef<FolderState | null>(null);

  const ref = useCallback(
    (container: HTMLDivElement | null) => {
      if (stateRef.current) {
        stateRef.current.destroy();
        stateRef.current = null;
      }

      if (!container || isStreaming) return;

      processCodeBlocks(container);

      stateRef.current = {
        destroy: () => {
          container
            .querySelectorAll(".cb-summary")
            .forEach((el) => el.remove());
          container
            .querySelectorAll(".cb-collapsible")
            .forEach((el) => {
              el.classList.remove("cb-collapsible", "cb-collapsed");
            });
          container
            .querySelectorAll("[data-cb-processed]")
            .forEach((el) => {
              el.removeAttribute("data-cb-processed");
            });
        },
      };
    },
    [isStreaming],
  );

  return (
    <div ref={ref} className={cn("cb-container", className)}>
      {children}
    </div>
  );
}
