"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Copy,
  FileText,
  FolderPen,
  Image,
  Lock,
  MoreVertical,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DemoMeta, ProjectTemplateMeta } from "@opencode-workbench/shared";

const DEFAULT_CATEGORY = "未分类";

interface DemoCardProps {
  demo: DemoMeta;
  onDelete: (id: string) => void;
  onSaveAsTemplate: (demo: DemoMeta) => void;
  onDuplicate: (demo: DemoMeta) => void;
  onRename: (demo: DemoMeta) => void;
  onChangeCategory: (demo: DemoMeta) => void;
  onChangeCover: (demo: DemoMeta) => void;
}

interface TemplateProjectCardProps {
  template: ProjectTemplateMeta;
  onDuplicate: (template: ProjectTemplateMeta) => void;
  onRename: (template: ProjectTemplateMeta) => void;
  onChangeCategory: (template: ProjectTemplateMeta) => void;
  onChangeCover: (template: ProjectTemplateMeta) => void;
  onDelete: (template: ProjectTemplateMeta) => void;
}

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${m}/${d} ${h}:${min}`;
}

function normalizeCategory(category?: string): string {
  return category?.trim() || DEFAULT_CATEGORY;
}

function getGridClass(count: number): string {
  if (count === 1) return "grid-cols-1 grid-rows-1";
  if (count === 2) return "grid-cols-2 grid-rows-1";
  if (count === 3) return "grid-cols-2 grid-rows-2";
  return "grid-cols-2 grid-rows-2";
}

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
    <div className="relative flex items-center justify-center overflow-hidden bg-muted/40">
      {!failed ? (
        <img
          src={url}
          alt={page.name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={handleError}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-muted/60 to-muted">
          <FileText className="h-4 w-4 text-muted-foreground/50" />
          <span className="max-w-full truncate px-1 text-center text-[10px] leading-tight text-muted-foreground/60">
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

function ScreenshotCover({ demo }: { demo: DemoMeta }) {
  const pages = demo.demoPages ?? [];
  const displayPages = pages.slice(0, 4);
  const extraCount = pages.length - 4;

  if (displayPages.length === 0) {
    return <PlaceholderIcon />;
  }

  return (
    <div
      className={`grid ${getGridClass(displayPages.length)} h-full w-full gap-0.5`}
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

export function DemoCard({
  demo,
  onDelete,
  onSaveAsTemplate,
  onDuplicate,
  onRename,
  onChangeCategory,
  onChangeCover,
}: DemoCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const editHref = `/demo/${demo.id}/edit`;

  return (
    <div className="group relative">
      <a
        href={editHref}
        aria-label={`打开项目 ${demo.name}`}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="cursor-pointer overflow-hidden border border-border/50 bg-card transition-all duration-300 hover:border-border/80">
          <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-muted/80 to-muted">
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
            <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </div>

          <CardContent className="p-4">
            <div className="flex min-w-0 items-center gap-2 pr-9">
              <h3 className="truncate text-base font-medium text-foreground">
                {demo.name}
              </h3>
              {demo.locked && (
                <Badge
                  variant="secondary"
                  className="shrink-0 gap-1 px-1.5 py-0 text-[10px]"
                >
                  <Lock className="h-3 w-3" />
                  锁定
                </Badge>
              )}
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2 pr-9 text-xs text-muted-foreground">
              <Badge
                variant="secondary"
                className="shrink-0 px-1.5 py-0 text-[10px]"
              >
                {normalizeCategory(demo.category)}
              </Badge>
              <span className="shrink-0 whitespace-nowrap">
                {formatShortDate(demo.updatedAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      </a>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`打开项目 ${demo.name} 的更多操作`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(true);
            }}
            className="absolute bottom-4 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition-colors duration-200 hover:bg-accent group-hover:opacity-100 focus:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onRename(demo);
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            修改名称
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onChangeCategory(demo);
            }}
          >
            <FolderPen className="mr-2 h-3.5 w-3.5" />
            修改分类
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onChangeCover(demo);
            }}
          >
            <Image className="mr-2 h-3.5 w-3.5" />
            修改封面
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onSaveAsTemplate(demo);
            }}
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            保存为模板
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onDuplicate(demo);
            }}
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            复制当前项目
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs text-destructive focus:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onDelete(demo.id);
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function TemplateProjectCard({
  template,
  onDuplicate,
  onRename,
  onChangeCategory,
  onChangeCover,
  onDelete,
}: TemplateProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative">
      <Link
        href={`/demo/${template.sourceProjectId}/edit`}
        aria-label={`打开模板 ${template.name}`}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="cursor-pointer overflow-hidden border border-border/50 bg-card transition-all duration-300 hover:border-border/80">
          <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-muted/80 to-muted">
            {template.thumbnail ? (
              <img
                src={template.thumbnail}
                alt={template.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : template.demoPages && template.demoPages.length > 0 ? (
              <div className="h-full w-full transition-transform duration-300 group-hover:scale-105">
                <ScreenshotCover
                  demo={{ ...template, category: template.category }}
                />
              </div>
            ) : (
              <PlaceholderIcon />
            )}
            <Badge className="absolute left-3 top-3 px-2 py-0.5 text-[11px]">
              模板
            </Badge>
          </div>

          <CardContent className="p-4">
            <div className="flex min-w-0 items-center gap-2 pr-9">
              <h3 className="truncate text-base font-medium text-foreground">
                {template.name}
              </h3>
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2 pr-9 text-xs text-muted-foreground">
              <Badge
                variant="secondary"
                className="shrink-0 px-1.5 py-0 text-[10px]"
              >
                {normalizeCategory(template.category)}
              </Badge>
              <span className="shrink-0 whitespace-nowrap">
                {formatShortDate(template.updatedAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`打开模板 ${template.name} 的更多操作`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(true);
            }}
            className="absolute bottom-4 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition-colors duration-200 hover:bg-accent group-hover:opacity-100 focus:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onDuplicate(template);
            }}
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            使用此模板新建
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onRename(template);
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            修改名称
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onChangeCategory(template);
            }}
          >
            <FolderPen className="mr-2 h-3.5 w-3.5" />
            修改分类
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onChangeCover(template);
            }}
          >
            <Image className="mr-2 h-3.5 w-3.5" />
            修改封面
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs text-destructive focus:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onDelete(template);
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
