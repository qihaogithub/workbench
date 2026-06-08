"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { MoreVertical, Trash2, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DemoMeta } from "@opencode-workbench/shared";

interface DemoCardProps {
  demo: DemoMeta;
  onDelete: (id: string) => void;
}

/**
 * 格式化日期为 ISO 格式字符串（locale-independent）
 * 避免 toLocaleDateString 在 Node.js 与浏览器间产生不同输出导致 Hydration 不匹配
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${h}:${min}`;
}

/** 根据页面数量返回 CSS grid 布局类名 */
function getGridClass(count: number): string {
  if (count === 1) return "grid-cols-1 grid-rows-1";
  if (count === 2) return "grid-cols-2 grid-rows-1";
  if (count === 3) return "grid-cols-2 grid-rows-2";
  return "grid-cols-2 grid-rows-2";
}

/** 单个页面截图格 */
function PageScreenshotCell({
  projectId,
  page,
  showOverlay,
  overlayText,
}: {
  projectId: string;
  page: { id: string; name: string };
  showOverlay: boolean;
  overlayText?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = `/api/screenshots/file/${projectId}/${page.id}`;

  const handleError = useCallback(() => {
    setFailed(true);
  }, []);

  return (
    <div className="relative overflow-hidden bg-muted/40 flex items-center justify-center">
      {!failed ? (
        <img
          src={url}
          alt={page.name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={handleError}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full w-full bg-gradient-to-br from-muted/60 to-muted gap-1">
          <FileText className="h-4 w-4 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/60 truncate px-1 text-center max-w-full leading-tight">
            {page.name}
          </span>
        </div>
      )}
      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <span className="text-sm font-medium text-foreground">
            {overlayText}
          </span>
        </div>
      )}
    </div>
  );
}

/** 截图拼接封面组件 */
function ScreenshotCover({ demo }: { demo: DemoMeta }) {
  const pages = demo.demoPages ?? [];
  // 最多展示 4 个页面截图
  const displayPages = pages.slice(0, 4);
  const extraCount = pages.length - 4;

  if (displayPages.length === 0) {
    return <PlaceholderIcon />;
  }

  return (
    <div
      className={`grid ${getGridClass(displayPages.length)} gap-0.5 h-full w-full`}
    >
      {displayPages.map((page, index) => {
        const isLast = index === displayPages.length - 1;
        return (
          <PageScreenshotCell
            key={page.id}
            projectId={demo.id}
            page={page}
            showOverlay={isLast && extraCount > 0}
            overlayText={
              isLast && extraCount > 0 ? `+${extraCount}` : undefined
            }
          />
        );
      })}
    </div>
  );
}

/** 默认占位图标 */
function PlaceholderIcon() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background/50">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-muted-foreground/60"
        >
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      </div>
    </div>
  );
}

export function DemoCard({ demo, onDelete }: DemoCardProps) {
  return (
    <Link href={`/demo/${demo.id}/edit`}>
      <Card className="group overflow-hidden transition-all duration-300 hover:border-border/80 cursor-pointer bg-card border border-border/50">
        <div className="relative aspect-video bg-gradient-to-br from-muted/80 to-muted overflow-hidden">
          {demo.thumbnail ? (
            <img
              src={demo.thumbnail}
              alt={demo.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : demo.demoPages && demo.demoPages.length > 0 ? (
            <div className="h-full w-full transition-transform duration-300 group-hover:scale-105">
              <ScreenshotCover demo={demo} />
            </div>
          ) : (
            <PlaceholderIcon />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-base truncate text-foreground">
                {demo.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5">
                更新于 {formatDate(demo.updatedAt)}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.preventDefault()}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors duration-200 shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive text-xs"
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete(demo.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
