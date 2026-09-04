"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { cn } from "./utils";
import type { ConfigBreadcrumb } from "./types";

const SHEET_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const SHEET_TRANSITION_STYLE = {
  transitionDuration: "300ms",
  transitionTimingFunction: SHEET_EASE,
} as const;
const BACKDROP_TRANSITION_STYLE = {
  transitionDuration: "320ms",
  transitionTimingFunction: SHEET_EASE,
} as const;

export interface ConfigDetailSheetProps {
  open: boolean;
  title: string;
  breadcrumb?: ConfigBreadcrumb[];
  onClose: () => void;
  onNavigate?: (breadcrumb: ConfigBreadcrumb, index: number) => void;
  closeLabel?: string;
  backLabel?: string;
  /** The existing configuration panel that should become inert while open. */
  underlayRef?: RefObject<HTMLElement | null>;
  /**
   * Mark this instance as container-bounded. The component should be rendered
   * inside the referenced host instead of being portaled to the document; this
   * keeps overlay and panel geometry scoped to that host.
   */
  containerRef?: RefObject<HTMLElement | null>;
  /** Override document scrolling lock; bounded container mode defaults to unlocked. */
  lockBodyScroll?: boolean;
  children: ReactNode;
  className?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/**
 * A single, host-owned detail Sheet. Route replacement is deliberately left to
 * the parent: this component never creates a nested Sheet of its own.
 */
export function ConfigDetailSheet({
  open,
  title,
  breadcrumb = [],
  onClose,
  onNavigate,
  closeLabel = "关闭详情",
  backLabel = "返回上一级",
  underlayRef,
  containerRef,
  lockBodyScroll = !containerRef,
  children,
  className,
}: ConfigDetailSheetProps) {
  const [presented, setPresented] = useState(false);
  const sheetRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const previousBodyOverflowRef = useRef<string | null>(null);
  const previousUnderlayStateRef = useRef<{
    inert: boolean;
    ariaHidden: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setPresented(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setPresented(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (lockBodyScroll) {
      previousBodyOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    const underlay = underlayRef?.current;
    if (underlay) {
      previousUnderlayStateRef.current = {
        inert: Boolean((underlay as HTMLElement & { inert?: boolean }).inert),
        ariaHidden: underlay.getAttribute("aria-hidden"),
      };
      (underlay as HTMLElement & { inert?: boolean }).inert = true;
      underlay.setAttribute("aria-hidden", "true");
    }

    // Let the Sheet commit before moving focus so tests and browsers observe
    // the same initial focus behavior in both portal and container modes.
    const focusId = window.setTimeout(() => {
      const first = sheetRef.current && getFocusableElements(sheetRef.current)[0];
      (first ?? closeButtonRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusId);
      if (lockBodyScroll) {
        document.body.style.overflow = previousBodyOverflowRef.current ?? "";
      }
      const previous = previousUnderlayStateRef.current;
      if (underlay && previous) {
        (underlay as HTMLElement & { inert?: boolean }).inert = previous.inert;
        if (previous.ariaHidden === null) underlay.removeAttribute("aria-hidden");
        else underlay.setAttribute("aria-hidden", previous.ariaHidden);
      }
      previousUnderlayStateRef.current = null;
      const previousActive = previousActiveElementRef.current;
      if (previousActive && document.contains(previousActive)) previousActive.focus();
      previousActiveElementRef.current = null;
    };
  }, [lockBodyScroll, open, underlayRef]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !sheetRef.current) return;
    const focusable = getFocusableElements(sheetRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      closeButtonRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onClose]);

  if (!open || typeof document === "undefined") return null;

  const embedded = Boolean(containerRef);
  const content = (
    <div
      className={cn(
        "z-[80] flex justify-end",
        embedded
          ? "absolute inset-0 p-2"
          : "fixed inset-0",
      )}
      style={{ contain: "layout paint" }}
      data-config-detail-sheet="true"
      data-config-detail-sheet-scope={embedded ? "container" : "document"}
    >
      <button
        type="button"
        aria-label={closeLabel}
        className={cn(
          "absolute inset-0 cursor-pointer bg-black/45 transition-opacity duration-[320ms] ease-in-out motion-reduce:transition-none",
          presented ? "opacity-100" : "opacity-0",
        )}
        style={BACKDROP_TRANSITION_STYLE}
        onClick={onClose}
      />
      <aside
        ref={sheetRef}
        role="dialog"
        aria-modal={embedded ? "false" : "true"}
        aria-labelledby="config-detail-sheet-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          embedded
            ? "relative z-10 flex h-full w-[calc(100%-16px)] max-w-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl transition-transform duration-[300ms] ease-in-out motion-reduce:transition-none"
            : "relative z-10 flex h-full w-full max-w-full flex-col overflow-hidden border-l border-border bg-card shadow-2xl transition-transform duration-[300ms] ease-in-out motion-reduce:transition-none sm:w-[500px]",
          presented ? "translate-x-0" : "translate-x-full",
          className,
        )}
        style={SHEET_TRANSITION_STYLE}
      >
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border/80 px-3 py-2">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={backLabel}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <nav aria-label="配置层级" className="min-w-0 flex-1 overflow-x-auto">
            <ol className="flex min-w-max items-center gap-1 text-sm">
              {breadcrumb.map((item, index) => {
                const isCurrent = index === breadcrumb.length - 1;
                return (
                  <li key={`${item.id}:${index}`} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
                    {isCurrent || !onNavigate ? (
                      <span
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "max-w-[190px] truncate",
                          isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {item.label}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigate(item, index)}
                        className="max-w-[190px] cursor-pointer truncate rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {item.label}
                      </button>
                    )}
                  </li>
                );
              })}
              {breadcrumb.length === 0 && (
                <li className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {title}
                </li>
              )}
            </ol>
          </nav>
          <h2 id="config-detail-sheet-title" className="sr-only">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </aside>
    </div>
  );

  return containerRef ? content : createPortal(content, document.body);
}
