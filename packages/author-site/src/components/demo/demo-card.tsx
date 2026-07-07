"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import Link from "next/link";
import {
  Copy,
  FolderPen,
  Image,
  Lock,
  MoreVertical,
  Pencil,
  Repeat2,
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
import type { DemoMeta, ProjectTemplateMeta } from "@workbench/shared";

const DEFAULT_CATEGORY = "未分类";
const MAX_SCREENSHOT_COVER_ITEMS = 10;
const DEFAULT_SCREENSHOT_ASPECT_RATIO = 9 / 16;
const MIN_SCREENSHOT_ASPECT_RATIO = 0.45;
const MAX_SCREENSHOT_ASPECT_RATIO = 1.8;

interface DemoCardProps {
  demo: DemoMeta;
  screenshotRevision?: number;
  onDelete: (id: string) => void;
  onSaveAsTemplate: (demo: DemoMeta) => void;
  onDuplicate: (demo: DemoMeta) => void;
  onRename: (demo: DemoMeta) => void;
  onChangeCategory: (demo: DemoMeta) => void;
  onChangeCover: (demo: DemoMeta) => void;
}

interface TemplateProjectCardProps {
  template: ProjectTemplateMeta;
  screenshotRevision?: number;
  onDuplicate: (template: ProjectTemplateMeta) => void;
  onRename: (template: ProjectTemplateMeta) => void;
  onChangeCategory: (template: ProjectTemplateMeta) => void;
  onChangeCover: (template: ProjectTemplateMeta) => void;
  onConvertToProject: (template: ProjectTemplateMeta) => void;
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

function formatCategoryPath(category?: string): string {
  return normalizeCategory(category)
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ");
}

function clampScreenshotAspectRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return DEFAULT_SCREENSHOT_ASPECT_RATIO;
  }

  return Math.min(
    MAX_SCREENSHOT_ASPECT_RATIO,
    Math.max(MIN_SCREENSHOT_ASPECT_RATIO, ratio),
  );
}

function PageScreenshotCell({
  projectId,
  page,
  screenshotRevision = 0,
  showOverlay,
  overlayText,
  className,
  style,
  onAspectRatio,
}: {
  projectId: string;
  page: { id: string; name: string };
  screenshotRevision?: number;
  showOverlay: boolean;
  overlayText?: string;
  className?: string;
  style?: CSSProperties;
  onAspectRatio?: (pageId: string, aspectRatio: number) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const metaUrl = `/api/screenshots/file/${encodeURIComponent(
      projectId,
    )}/${encodeURIComponent(page.id)}?meta=1`;

    setImageUrl(null);
    setFailed(false);

    fetch(metaUrl, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (cancelled) return;
        const payload = result as
          | { success?: boolean; data?: { url?: unknown } }
          | null;
        const url =
          payload?.success === true && typeof payload.data?.url === "string"
            ? payload.data.url
            : null;

        if (url) {
          setImageUrl(url);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, page.id, screenshotRevision]);

  const handleError = useCallback(() => {
    setFailed(true);
  }, []);

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      if (naturalWidth > 0 && naturalHeight > 0) {
        onAspectRatio?.(page.id, naturalWidth / naturalHeight);
      }
    },
    [onAspectRatio, page.id],
  );

  return (
    <div
      className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-sm bg-muted/35 ${className ?? ""}`}
      style={style}
    >
      {!failed && imageUrl ? (
        <img
          src={imageUrl}
          alt={page.name}
          className="h-full w-full object-contain"
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <PagePreviewPlaceholder label={page.name} />
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

function PagePreviewPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background/30"
      style={{
        background:
          "radial-gradient(circle at 22% 18%, rgba(20, 184, 166, 0.18), transparent 34%), radial-gradient(circle at 82% 8%, rgba(245, 158, 11, 0.14), transparent 30%), linear-gradient(135deg, hsl(var(--muted) / 0.72), hsl(var(--background) / 0.72))",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.06)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.05)_1px,transparent_1px)] bg-[size:18px_18px] opacity-50" />
      <div className="relative flex h-[76%] w-[62%] flex-col overflow-hidden rounded border border-foreground/10 bg-background/50 shadow-sm">
        <div className="flex h-3 shrink-0 items-center gap-0.5 border-b border-foreground/10 px-1.5">
          <span className="h-1 w-1 rounded-full bg-foreground/25" />
          <span className="h-1 w-1 rounded-full bg-foreground/10" />
          <span className="h-1 w-1 rounded-full bg-foreground/10" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <div className="h-2 w-2/3 rounded-full bg-foreground/25" />
          <div className="grid flex-1 grid-cols-[1.2fr_0.8fr] gap-1.5">
            <div className="rounded-sm bg-foreground/10" />
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-foreground/10" />
              <div className="h-2 w-3/4 rounded-full bg-foreground/10" />
              <div className="mt-2 h-5 rounded-sm bg-primary/20" />
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function ScreenshotCover({
  demo,
  screenshotRevision,
}: {
  demo: DemoMeta;
  screenshotRevision?: number;
}) {
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const pages = demo.demoPages ?? [];
  const displayPages = pages.slice(0, MAX_SCREENSHOT_COVER_ITEMS);
  const extraCount = pages.length - displayPages.length;

  const weightedPages = useMemo(
    () =>
      displayPages.map((page) => ({
        page,
        aspectRatio: clampScreenshotAspectRatio(
          aspectRatios[page.id] ?? DEFAULT_SCREENSHOT_ASPECT_RATIO,
        ),
      })),
    [aspectRatios, displayPages],
  );
  const rowGroups = useMemo(() => {
    if (weightedPages.length <= 2) {
      return [weightedPages];
    }

    const totalWeight = weightedPages.reduce(
      (sum, item) => sum + item.aspectRatio,
      0,
    );
    let bestSplitIndex = Math.ceil(weightedPages.length / 2);
    let bestBalanceGap = Number.POSITIVE_INFINITY;
    let leadingWeight = 0;

    for (let index = 1; index < weightedPages.length; index += 1) {
      leadingWeight += weightedPages[index - 1].aspectRatio;
      const trailingWeight = totalWeight - leadingWeight;
      const balanceGap = Math.abs(leadingWeight - trailingWeight);

      if (balanceGap <= bestBalanceGap) {
        bestBalanceGap = balanceGap;
        bestSplitIndex = index;
      }
    }

    return [
      weightedPages.slice(0, bestSplitIndex),
      weightedPages.slice(bestSplitIndex),
    ].filter((row) => row.length > 0);
  }, [weightedPages]);

  const handleAspectRatio = useCallback(
    (pageId: string, aspectRatio: number) => {
      const normalizedRatio = clampScreenshotAspectRatio(aspectRatio);
      setAspectRatios((current) => {
        if (current[pageId] === normalizedRatio) {
          return current;
        }
        return { ...current, [pageId]: normalizedRatio };
      });
    },
    [],
  );

  if (displayPages.length === 0) {
    return <PlaceholderIcon />;
  }

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 p-1.5">
      {rowGroups.map((row, rowIndex) => {
        const previousRowsCount = rowGroups
          .slice(0, rowIndex)
          .reduce((sum, currentRow) => sum + currentRow.length, 0);

        return (
          <div
            key={row.map(({ page }) => page.id).join("-")}
            className="flex min-h-0 flex-1 justify-center gap-1"
          >
            {row.map(({ page, aspectRatio }, index) => {
              const displayIndex = previousRowsCount + index;
              const isLast = displayIndex === displayPages.length - 1;
              const isDenseLayout = displayPages.length >= 3;

              return (
                <PageScreenshotCell
                  key={page.id}
                  projectId={demo.id}
                  page={page}
                  screenshotRevision={screenshotRevision}
                  className={
                    isDenseLayout
                      ? "min-w-0"
                      : "h-full max-w-[48%] shrink-0"
                  }
                  style={
                    isDenseLayout
                      ? { flex: `${aspectRatio} 1 0` }
                      : { aspectRatio }
                  }
                  showOverlay={isLast && extraCount > 0}
                  overlayText={
                    isLast && extraCount > 0 ? `+${extraCount}` : undefined
                  }
                  onAspectRatio={handleAspectRatio}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function PlaceholderIcon() {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 18% 18%, rgba(20, 184, 166, 0.24), transparent 30%), radial-gradient(circle at 82% 22%, rgba(245, 158, 11, 0.18), transparent 28%), linear-gradient(135deg, hsl(var(--muted) / 0.82), hsl(var(--background) / 0.78))",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--foreground)/0.055)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground)/0.05)_1px,transparent_1px)] bg-[size:24px_24px] opacity-60" />
      <div className="absolute left-[12%] top-[18%] h-[62%] w-[36%] rounded-md border border-foreground/10 bg-background/50 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
        <div className="h-4 border-b border-foreground/10 px-2 py-1">
          <div className="h-1.5 w-8 rounded-full bg-foreground/25" />
        </div>
        <div className="space-y-2 p-2">
          <div className="h-8 rounded-sm bg-primary/20" />
          <div className="h-1.5 w-3/4 rounded-full bg-foreground/20" />
          <div className="h-1.5 w-1/2 rounded-full bg-foreground/10" />
        </div>
      </div>
      <div className="absolute left-[38%] top-[12%] h-[70%] w-[46%] rounded-md border border-foreground/10 bg-background/60 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
        <div className="grid h-full grid-rows-[20%_1fr] overflow-hidden rounded-md">
          <div className="border-b border-foreground/10 bg-foreground/5 px-3 py-2">
            <div className="h-1.5 w-16 rounded-full bg-foreground/25" />
          </div>
          <div className="grid grid-cols-[0.7fr_1fr] gap-2 p-3">
            <div className="rounded-sm bg-foreground/10" />
            <div className="space-y-1.5">
              <div className="h-2 w-full rounded-full bg-foreground/20" />
              <div className="h-2 w-2/3 rounded-full bg-foreground/10" />
              <div className="mt-2 h-5 w-16 rounded-sm bg-teal-400/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoCard({
  demo,
  screenshotRevision,
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
                className="h-full w-full object-contain"
              />
            ) : demo.demoPages && demo.demoPages.length > 0 ? (
              <div className="h-full w-full">
                <ScreenshotCover
                  demo={demo}
                  screenshotRevision={screenshotRevision}
                />
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
                {formatCategoryPath(demo.category)}
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
  screenshotRevision,
  onDuplicate,
  onRename,
  onChangeCategory,
  onChangeCover,
  onConvertToProject,
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
                className="h-full w-full object-contain"
              />
            ) : template.demoPages && template.demoPages.length > 0 ? (
              <div className="h-full w-full">
                <ScreenshotCover
                  demo={{ ...template, category: template.category }}
                  screenshotRevision={screenshotRevision}
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
                {formatCategoryPath(template.category)}
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
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onConvertToProject(template);
            }}
          >
            <Repeat2 className="mr-2 h-3.5 w-3.5" />
            转为普通项目
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
