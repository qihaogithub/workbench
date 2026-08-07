"use client";

import { BookOpen, FileText, Map as MapIcon } from "lucide-react";

import type { PreviewMode } from "./types";
import { cn } from "./utils";

export interface PreviewModeSwitcherProps {
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  /** 需要展示的视图模式，默认全部 */
  modes?: PreviewMode[];
  className?: string;
}

const MODE_META: Record<PreviewMode, { label: string; icon: typeof FileText }> =
  {
    single: { label: "单页", icon: FileText },
    canvas: { label: "画布", icon: MapIcon },
    document: { label: "文档", icon: BookOpen },
  };

export function PreviewModeSwitcher({
  mode,
  onModeChange,
  modes = ["single", "canvas", "document"],
  className,
}: PreviewModeSwitcherProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-border bg-background p-0.5",
        className,
      )}
    >
      {modes.map((item) => {
        const meta = MODE_META[item];
        const Icon = meta.icon;
        const active = mode === item;
        return (
          <button
            key={item}
            type="button"
            data-preview-mode={item}
            aria-pressed={active}
            onClick={() => onModeChange(item)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}