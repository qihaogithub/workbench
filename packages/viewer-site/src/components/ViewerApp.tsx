"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type CSSProperties,
  type SyntheticEvent,
  type ErrorInfo,
} from "react";
import Image from "next/image";
import {
  Search,
  SlidersHorizontal,
  FileCode,
  X,
  Check,
  ArrowLeft,
  ChevronRight,
  FileText,
  MessageCircle,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  ArrowLeftRight,
  LogIn,
  LogOut,
  Loader2,
  Bug,
} from "lucide-react";
import {
  getProjects,
  getProjectData,
  getDemoSchema,
  getDesignSpecDoc,
  getDataUrl,
  DATA_BASE,
  getThumbnailUrl,
  getScreenshotFileUrl,
  getScreenshotFileMetaUrl,
  getPublishedFileUrl,
  login,
  setAuthToken,
  getAuthToken,
  createDemoPage,
  reorderDemoPages,
  switchPageRuntime,
  deleteDemoPage,
  issuePublishedHtmlExecution,
} from "@/lib/api";
import { createPublishedPreviewStagePage } from "@/lib/preview-stage-adapter";
import type {
  ProjectsIndex,
  PublishedProject,
  PublishedDemoPage,
  PublishedHtmlExecution,
} from "@/lib/api";
import type {
  CommentAuthor,
  CommentTarget,
  DemoPageRuntimeType,
} from "@workbench/shared";
import { resolveVisibility } from "@workbench/shared";
import type { MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";
import {
  extractPrototypeConfigBindingKeys,
  PageConfigPanel,
  PreviewStage,
  PreviewModeSwitcher,
  CommentLayer,
  CommentPanel,
  useComments,
  filterConfigValuesByType,
} from "@/components/demo";
import type {
  PreviewMode,
  CanvasState,
  PreviewStagePage,
} from "@/components/demo";
import {
  buildPageDirectoryTree,
  type PageDirectoryTreeItem,
} from "@/lib/page-directory-tree";
import {
  CommentUnreadDot,
  countUnresolvedCommentThreads,
  countUnresolvedCommentThreadsByPage,
  filterPageCommentThreads,
  type CanvasCommentDraft,
  type ConfigCommentController,
} from "@workbench/demo-ui/comment";
import {
  createCommentApi,
  getCommentWsUrl,
  getAnonymousId,
  getAnonymousDisplayName,
} from "@/lib/comment-api";
import { isSchemaEmpty } from "@/components/demo";
import { getDefaultValues } from "@/lib/validator";
import { getOfficialHomeUrl } from "@/lib/official-site-url";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedbackPage } from "@/components/FeedbackPage";
import { ViewerAiPanel } from "@/components/ViewerAiPanel";
import {
  hasViewerDocumentContent,
  ViewerDocumentView,
} from "@/components/ViewerDocumentView";

type SortOption = "newest" | "oldest" | "name";
type ProjectListItem = ProjectsIndex["projects"][number];

const MAX_SCREENSHOT_COVER_ITEMS = 10;
const DEFAULT_SCREENSHOT_ASPECT_RATIO = 9 / 16;
const MIN_SCREENSHOT_ASPECT_RATIO = 0.45;
const MAX_SCREENSHOT_ASPECT_RATIO = 1.8;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;

type DesignSpecEntryLink = {
  docId: string;
  docTitle: string;
  entryId: string;
  entryTitle: string;
  markdown: string;
  scope: "project" | "page";
  pageId?: string;
  fieldKey: string;
};

type PageDesignSpecEntryLink = {
  docId: string;
  docTitle: string;
  entryId: string;
  entryTitle: string;
  markdown: string;
  pageId: string;
};

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "最新更新" },
  { value: "oldest", label: "最早更新" },
  { value: "name", label: "名称" },
];

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ViewerApp ErrorBoundary]", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="max-w-lg text-center space-y-4">
            <p className="text-sm font-semibold text-destructive">
              页面渲染错误
            </p>
            <pre className="text-xs text-left bg-muted p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">
              {this.state.error?.message}
              {"\n\n"}
              {this.state.error?.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function parsePath(pathname: string): {
  view: "list" | "project";
  projectId?: string;
  pageId?: string;
} {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return { view: "list" };
  return { view: "project", projectId: segments[0], pageId: segments[1] };
}

function mergeConfigDefaults(
  projectSchema?: string,
  pageSchema?: string,
  projectValues?: Record<string, unknown>,
  projectId?: string,
): Record<string, unknown> {
  const projectDefaults = projectSchema ? getDefaultValues(projectSchema) : {};
  const pageDefaults = pageSchema ? getDefaultValues(pageSchema) : {};
  return resolvePublishedConfigAssetUrls(
    {
      ...projectDefaults,
      ...pageDefaults,
      ...projectValues,
    },
    { projectId },
  );
}

function resolvePublishedConfigAssetUrls(
  data: Record<string, unknown>,
  options?: { projectId?: string },
): Record<string, unknown> {
  function resolveImageUrl(value: string): string {
    if (
      options?.projectId &&
      /^\.\.?\/[^'")\s]*$/.test(value) &&
      IMAGE_EXT_RE.test(value)
    ) {
      const parts = "demos/_".split("/");
      for (const part of value.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") {
          parts.pop();
        } else {
          parts.push(part);
        }
      }
      const resolved = parts.join("/");
      return `${DATA_BASE}/api/projects/${options.projectId}/images/${resolved}`;
    }
    return value;
  }

  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      if (value.startsWith("/data/")) {
        return getDataUrl(value);
      }
      return resolveImageUrl(value);
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === "object") {
      const next: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        next[key] = walk(child);
      }
      return next;
    }
    return value;
  }

  return walk(data) as Record<string, unknown>;
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

function PageScreenshotCell({
  projectId,
  page,
  showOverlay,
  overlayText,
  className,
  style,
  onAspectRatio,
  publishedVersion,
}: {
  projectId: string;
  page: { id: string; name: string; screenshotPath?: string };
  showOverlay: boolean;
  overlayText?: string;
  className?: string;
  style?: CSSProperties;
  onAspectRatio?: (pageId: string, aspectRatio: number) => void;
  publishedVersion?: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cacheBust = publishedVersion
      ? `?v=${encodeURIComponent(publishedVersion)}`
      : "";
    const staticImageUrl = page.screenshotPath
      ? `${getPublishedFileUrl(projectId, page.screenshotPath)}${cacheBust}`
      : null;
    const directImageUrl =
      staticImageUrl ?? getScreenshotFileUrl(projectId, page.id);
    const metaUrl = getScreenshotFileMetaUrl(projectId, page.id);
    setImageUrl(null);
    setFailed(false);
    setImageUrl(directImageUrl);

    if (staticImageUrl) {
      return () => {
        cancelled = true;
      };
    }

    if (
      new URL(metaUrl, window.location.href).origin !== window.location.origin
    ) {
      return () => {
        cancelled = true;
      };
    }

    fetch(metaUrl, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (cancelled) return;
        const payload = result as {
          success?: boolean;
          data?: { url?: unknown };
        } | null;
        const url =
          payload?.success === true && typeof payload.data?.url === "string"
            ? payload.data.url
            : null;

        if (url) {
          setImageUrl(getDataUrl(url));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [projectId, page.id, page.screenshotPath, publishedVersion]);

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
  projectId,
  pages,
  publishedVersion,
}: {
  projectId: string;
  pages: Array<{ id: string; name: string; screenshotPath?: string }>;
  publishedVersion?: string;
}) {
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
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
                  projectId={projectId}
                  page={page}
                  className={
                    isDenseLayout ? "min-w-0" : "h-full max-w-[48%] shrink-0"
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
                  publishedVersion={publishedVersion}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ProjectCover({ project }: { project: ProjectListItem }) {
  const [projectData, setProjectData] = useState<PublishedProject | null>(null);

  useEffect(() => {
    if (project.thumbnail) {
      setProjectData(null);
      return;
    }

    let cancelled = false;
    getProjectData(project.id)
      .then((result) => {
        if (!cancelled) {
          setProjectData(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectData(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project.id, project.thumbnail]);

  if (project.thumbnail) {
    return (
      <Image
        src={getThumbnailUrl(project.thumbnail)}
        alt={project.name}
        fill
        className="object-contain"
        unoptimized
      />
    );
  }

  const pages = projectData?.demoPages ?? [];
  if (pages.length > 0) {
    return (
      <ScreenshotCover
        projectId={project.id}
        pages={pages}
        publishedVersion={projectData?.publishedVersion}
      />
    );
  }

  return <PlaceholderIcon />;
}

function ProjectListPage() {
  const router = useRouter();
  const [data, setData] = useState<ProjectsIndex | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getProjects()
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        filterRef.current &&
        !filterRef.current.contains(event.target as Node)
      ) {
        setShowFilters(false);
      }
    }
    if (showFilters) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFilters]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];

    let projects = [...data.projects];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query)),
      );
    }

    switch (sortBy) {
      case "newest":
        projects.sort((a, b) => b.publishedAt - a.publishedAt);
        break;
      case "oldest":
        projects.sort((a, b) => a.publishedAt - b.publishedAt);
        break;
      case "name":
        projects.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        break;
    }

    return projects;
  }, [data, searchQuery, sortBy]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center gap-4 px-6">
          <div className="flex shrink-0 items-baseline gap-3">
            <Link
              href={getOfficialHomeUrl()}
              aria-label="OneFlow 官网首页"
              className="text-lg font-semibold leading-none hover:opacity-80"
            >
              <h1>OneFlow</h1>
            </Link>
          </div>

          <div className="flex-1 flex items-center justify-end gap-2">
            <button
              onClick={() => router.push("/feedback")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              title="意见反馈"
            >
              <Bug className="h-4 w-4" />
              反馈
            </button>
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="搜索项目..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-48 rounded-md border border-input bg-background pl-9 pr-8 text-sm outline-none transition-all focus:w-64 focus:ring-1 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
                  showFilters
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                筛选
              </button>

              {showFilters && (
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    排序方式
                  </div>
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value);
                        setShowFilters(false);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <span>{option.label}</span>
                      {sortBy === option.value && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container px-6 pt-8 pb-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">加载中...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-20">
            <div className="text-destructive">加载失败：{error.message}</div>
          </div>
        )}

        {data && filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <FileCode className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {searchQuery ? "未找到匹配的项目" : "暂无已发布项目"}
            </p>
          </div>
        )}

        {data && filteredProjects.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProjects.map((project) => {
              return (
                <button
                  key={project.id}
                  onClick={() => router.push(`/${project.id}`)}
                  className="group overflow-hidden rounded-lg border border-border/50 bg-card text-left transition-all duration-300 hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`打开项目 ${project.name}`}
                >
                  <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-muted/80 to-muted">
                    <ProjectCover project={project} />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </div>
                  <div className="p-4">
                    <h2 className="truncate text-base font-medium text-foreground">
                      {project.name}
                    </h2>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function ProjectPreviewPage({ projectId, requestedPageId, commentThreadId, commentReplyId }: { projectId: string; requestedPageId?: string; commentThreadId?: string; commentReplyId?: string }) {
  const router = useRouter();
  const [project, setProject] = useState<PublishedProject | null>(null);
  const [designSpecEntries, setDesignSpecEntries] = useState<
    DesignSpecEntryLink[]
  >([]);
  const [pageDesignSpecEntries, setPageDesignSpecEntries] = useState<
    PageDesignSpecEntryLink[]
  >([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activePageId, setActivePageId] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [configData, setConfigData] = useState<Record<string, unknown>>({});
  const [configDataMap, setConfigDataMap] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [visibilitySessionOverrides, setVisibilitySessionOverrides] = useState<Record<string, unknown>>({});
  const [pageSchemaMap, setPageSchemaMap] = useState<Record<string, string>>(
    {},
  );
  const [sandboxExecutionMap, setSandboxExecutionMap] = useState<
    Record<string, PublishedHtmlExecution | undefined>
  >({});
  const [flashDirectoryId, setFlashDirectoryId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("canvas");
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [configPanelDetailPageId, setConfigPanelDetailPageId] = useState<
    string | null
  >(null);
  const [rightPanelTab, setRightPanelTab] = useState<"config" | "comments">(
    "config",
  );
  const [commentModeActive, setCommentModeActive] = useState(false);
  const [activeCommentThreadId, setActiveCommentThreadId] = useState<
    string | null
  >(null);
  const [canvasCommentDraft, setCanvasCommentDraft] =
    useState<CanvasCommentDraft | null>(null);
  const [canvasSelectedPageId, setCanvasSelectedPageId] = useState<
    string | null
  >(null);
  const [canvasState, setCanvasState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: {},
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionUsername, setSessionUsername] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<string>("guest");
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [visibilityNotice, setVisibilityNotice] = useState<string | null>(null);
  const projectLoadGenerationRef = useRef(0);

  const isLoggedIn = sessionId != null;

  const visibilityResolution = useMemo(() => {
    if (!project) return null;
    return resolveVisibility({
      rules: project.visibilityRules,
      projectConfigValues: project.projectConfigValues,
      projectSchema: project.projectConfigSchema,
      pageIds: project.demoPages.map((page) => page.id),
      regionIds: Object.fromEntries(
        project.demoPages.map((page) => [page.id, page.regionIds ?? []]),
      ),
    }, {
      values: visibilitySessionOverrides,
      fieldKeys: Object.keys(visibilitySessionOverrides),
      allowPageTargets: false,
    }, { roles: [sessionRole] });
  }, [project, sessionRole, visibilitySessionOverrides]);

  const visiblePages = useMemo(() => {
    if (!project) return [];
    if (!visibilityResolution?.valid) return [];
    return project.demoPages.filter(
      (page) => visibilityResolution.pages[page.id]?.visible !== false,
    );
  }, [project, visibilityResolution]);

  const visibleProjectConfigSchema = useMemo(
    () => project?.projectConfigSchema,
    [project?.projectConfigSchema],
  );
  const visiblePageSchemaMap = useMemo(() => {
    const next: Record<string, string> = {};
    for (const page of visiblePages) {
      const schema = pageSchemaMap[page.id];
      if (schema) next[page.id] = schema;
    }
    return next;
  }, [pageSchemaMap, visiblePages]);

  useEffect(() => {
    if (!project || !visibilityResolution) return;
    const requested = requestedPageId
      ? project.demoPages.find((page) => page.id === requestedPageId)
      : undefined;
    const requestedState = requested
      ? visibilityResolution.pages[requested.id]
      : undefined;
    const requestedVisible = requested
      ? !visibilityResolution.valid || requestedState?.visible !== false
      : false;
    const requestedEnabled = requested
      ? !visibilityResolution.valid || requestedState?.enabled !== false
      : false;
    const requestedAvailable = requestedVisible && requestedEnabled;
    const currentVisible = activePageId
      ? visiblePages.find((page) => page.id === activePageId)
      : undefined;
    const currentAvailable = currentVisible && (
      !visibilityResolution.valid
      || visibilityResolution.pages[currentVisible.id]?.enabled !== false
    )
      ? currentVisible
      : undefined;
    const firstAvailable = visiblePages.find(
      (page) => !visibilityResolution.valid || visibilityResolution.pages[page.id]?.enabled !== false,
    );
    const fallbackPage = requestedState?.fallbackPageId
      ? visiblePages.find((page) => page.id === requestedState.fallbackPageId
        && visibilityResolution.pages[page.id]?.enabled !== false)
      : undefined;
    const nextPage = requestedPageId
      ? requestedAvailable
        ? requested
        : fallbackPage ?? firstAvailable
      : currentAvailable ?? firstAvailable;
    if (nextPage && nextPage.id !== activePageId) {
      setActivePageId(nextPage.id);
      setConfigData(configDataMap[nextPage.id] ?? {});
    } else if (!nextPage && activePageId) {
      setActivePageId("");
    }
    setVisibilityNotice(
      requested && !requestedAvailable
        ? requestedState?.message
          ? requestedState.message
          : `页面「${requested.name}」当前${requestedVisible ? "不可用" : "不可见"}，${fallbackPage ? `已按规则切换到备用页面「${fallbackPage.name}」。` : "已切换到可用页面。"}`
        : null,
    );
  }, [activePageId, configDataMap, project, requestedPageId, visibilityResolution, visiblePages]);

  // 评论功能：API 适配器 + WS 地址 + 当前作者身份
  const commentApi = useMemo(() => createCommentApi(projectId), [projectId]);
  const commentWsUrl = useMemo(() => getCommentWsUrl(), []);
  const commentQueryTarget = useMemo<CommentTarget | undefined>(() => undefined, []);
  const commentsData = useComments({
    projectId,
    target: commentQueryTarget,
    api: commentApi,
    wsUrl: commentWsUrl,
  });
  const activePageCommentThreads = useMemo(
    () =>
      filterPageCommentThreads(
        commentsData.threads,
        previewMode === "canvas"
          ? (canvasSelectedPageId ?? activePageId)
          : activePageId,
      ),
    [activePageId, canvasSelectedPageId, commentsData.threads, previewMode],
  );
  const canvasCommentThreads = useMemo(
    () => filterPageCommentThreads(commentsData.threads),
    [commentsData.threads],
  );
  const canvasCommentCounts = useMemo(
    () => countUnresolvedCommentThreadsByPage(canvasCommentThreads),
    [canvasCommentThreads],
  );
  const isProjectCommentScope = previewMode === "canvas";
  const unresolvedCommentCount = countUnresolvedCommentThreads(
    isProjectCommentScope
      ? canvasCommentThreads
      : activePageCommentThreads,
  );
  const commentTabLabel =
    unresolvedCommentCount > 0
      ? `评论：有 ${unresolvedCommentCount} 条未解决评论`
      : "评论";
  const commentUser = useMemo<CommentAuthor | null>(() => {
    if (isLoggedIn && sessionId) {
      return {
        id: sessionId,
        name: sessionUsername || "用户",
        isAnonymous: false,
      };
    }
    return {
      id: getAnonymousId(),
      name: getAnonymousDisplayName(),
      isAnonymous: true,
    };
  }, [isLoggedIn, sessionId, sessionUsername]);
  const configCommentController = useMemo<ConfigCommentController>(
    () => ({
      threads: commentsData.threads,
      currentUser: commentUser,
      mediaBaseUrl: DATA_BASE,
      readOnly: true,
    }),
    [commentUser, commentsData.threads],
  );
  const [commentDeepLinkNotice, setCommentDeepLinkNotice] = useState<string | null>(null);
  const [commentDocumentResourceId, setCommentDocumentResourceId] = useState<string | undefined>();
  const [commentConfigTarget, setCommentConfigTarget] = useState<Extract<CommentTarget, { kind: "config" }> | null>(null);
  const handledCommentDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (previewMode !== "canvas") {
      setCanvasSelectedPageId(null);
    }
  }, [previewMode]);

  useEffect(() => {
    if (!project?.designSpecs?.length) {
      setDesignSpecEntries([]);
      setPageDesignSpecEntries([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      project.designSpecs.map((meta) => getDesignSpecDoc(projectId, meta.id)),
    )
      .then((docs) => {
        const config: DesignSpecEntryLink[] = [];
        const page: PageDesignSpecEntryLink[] = [];
        for (const doc of docs) {
          for (const entry of doc.entries) {
            if (entry.target.type === "config") {
              for (const ref of entry.target.refs) {
                config.push({
                  docId: doc.id,
                  docTitle: doc.title,
                  entryId: entry.id,
                  entryTitle: entry.title,
                  markdown: entry.markdown,
                  ...ref,
                });
              }
            } else {
              for (const pageId of entry.target.pageIds) {
                page.push({
                  docId: doc.id,
                  docTitle: doc.title,
                  entryId: entry.id,
                  entryTitle: entry.title,
                  markdown: entry.markdown,
                  pageId,
                });
              }
            }
          }
        }
        return { config, page };
      })
      .then((entries) => {
        if (!cancelled) {
          setDesignSpecEntries(entries.config);
          setPageDesignSpecEntries(entries.page);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDesignSpecEntries([]);
          setPageDesignSpecEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project, projectId]);

  useEffect(() => {
    const generation = ++projectLoadGenerationRef.current;
    let cancelled = false;
    const isCurrent = () =>
      !cancelled && projectLoadGenerationRef.current === generation;

    setIsLoading(true);
    setError(null);
    setProject(null);
    setConfigData({});
    setConfigDataMap({});
    setVisibilitySessionOverrides({});
    setPageSchemaMap({});
    setSandboxExecutionMap({});
    setActivePageId("");
    setVisibilityNotice(null);

    void getProjectData(projectId)
      .then(async (data) => {
        if (!isCurrent()) return;
        setProject(data);
        setCanvasState(
          data.canvasState ?? {
            viewport: { x: 40, y: 40, zoom: 0.5 },
            pages: {},
          },
        );

        const initialExpandedDirectoryIds = [
          ...data.demoFolders.map((folder) => folder.id),
          ...Object.keys(data.canvasState?.sections ?? {}),
        ];
        setExpandedFolders(new Set(initialExpandedDirectoryIds));

        const initialConfigMap: Record<string, Record<string, unknown>> = {};
        const schemaMap: Record<string, string> = {};

        if (data.demoPages.length > 0) {
          setActivePageId(data.demoPages[0].id);

          const pageResults = await Promise.all(
            data.demoPages.map(async (page) => {
              const pageProjectConfigSchema =
                page.referenceProjectConfigSchema ?? data.projectConfigSchema;
              const pageProjectConfigValues =
                page.referenceProjectConfigValues ?? data.projectConfigValues;
              if (!page.schemaPath) {
                return {
                  pageId: page.id,
                  schema: undefined,
                  config: {
                    ...mergeConfigDefaults(
                      pageProjectConfigSchema,
                      undefined,
                      pageProjectConfigValues,
                      projectId,
                    ),
                    ...(page.pageConfigValues ?? {}),
                  },
                };
              }

              try {
                const schema = await getDemoSchema(projectId, page.schemaPath);
                const schemaStr = JSON.stringify(schema);
                return {
                  pageId: page.id,
                  schema: schemaStr,
                  config: {
                    ...mergeConfigDefaults(
                      pageProjectConfigSchema,
                      schemaStr,
                      pageProjectConfigValues,
                      projectId,
                    ),
                    ...(page.pageConfigValues ?? {}),
                  },
                };
              } catch {
                return {
                  pageId: page.id,
                  schema: undefined,
                  config: {
                    ...mergeConfigDefaults(
                      pageProjectConfigSchema,
                      undefined,
                      pageProjectConfigValues,
                      projectId,
                    ),
                    ...(page.pageConfigValues ?? {}),
                  },
                };
              }
            }),
          );

          if (!isCurrent()) return;
          for (const result of pageResults) {
            initialConfigMap[result.pageId] = result.config;
            if (result.schema) schemaMap[result.pageId] = result.schema;
          }

          const firstPage = data.demoPages[0];

          setConfigData(initialConfigMap[firstPage.id] || {});
        }

        setConfigDataMap(initialConfigMap);
        setPageSchemaMap(schemaMap);
      })
      .catch((loadError: unknown) => {
        if (isCurrent()) {
          setError(
            loadError instanceof Error
              ? loadError
              : new Error(String(loadError)),
          );
        }
      })
      .finally(() => {
        if (isCurrent()) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (previewMode !== "single" || !activePageId || !project) return;
    const page = project.demoPages.find(
      (candidate) => candidate.id === activePageId,
    );
    if (page?.runtimeType !== "sandboxed-html" || !page.sandboxExecutionPath)
      return;
    const current = sandboxExecutionMap[page.id];
    if (current && current.expiresAt > Date.now() + 10_000) return;
    let cancelled = false;
    void issuePublishedHtmlExecution(page.sandboxExecutionPath)
      .then((execution) => {
        if (!cancelled) {
          setSandboxExecutionMap((previous) => ({
            ...previous,
            [page.id]: execution,
          }));
        }
      })
      .catch((executionError: unknown) => {
        if (!cancelled) {
          setError(
            executionError instanceof Error
              ? executionError
              : new Error(String(executionError)),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activePageId, previewMode, project, sandboxExecutionMap]);

  const handlePageChange = useCallback(
    (pageId: string) => {
      if (!project) return;
      const state = visibilityResolution?.valid
        ? visibilityResolution.pages[pageId]
        : undefined;
      if (state?.visible === false || state?.enabled === false) {
        const hiddenPage = project.demoPages.find((page) => page.id === pageId);
        setVisibilityNotice(
          state.message ?? (hiddenPage
            ? `页面「${hiddenPage.name}」当前${state.visible === false ? "不可见" : "不可用"}。`
            : `该页面当前${state.visible === false ? "不可见" : "不可用"}。`),
        );
        return;
      }
      setActivePageId(pageId);

      const pageConfig = configDataMap[pageId];
      if (pageConfig) {
        setConfigData(pageConfig);
      }
    },
    [configDataMap, project, visibilityResolution],
  );

  const handleCommentThreadSelect = useCallback(
    (threadId: string) => {
      const thread = commentsData.threads.find((item) => item.id === threadId);
      if (previewMode === "canvas" && thread?.target.kind === "page") {
        setCanvasSelectedPageId(thread.target.pageId);
        setRightPanelTab("comments");
        handlePageChange(thread.target.pageId);
        setConfigPanelDetailPageId(thread.target.pageId);
      }
      setActiveCommentThreadId(threadId);
      setCommentModeActive(false);
    },
    [commentsData.threads, handlePageChange, previewMode],
  );

  const handleCanvasCommentBadgeClick = useCallback(
    (pageId: string) => {
      setCanvasSelectedPageId(pageId);
      handlePageChange(pageId);
      setConfigPanelDetailPageId(pageId);
      setRightPanelTab("comments");
      setCommentModeActive(false);
      setCanvasCommentDraft(null);
    },
    [handlePageChange],
  );

  const handleReferenceNavigate = useCallback(
    (target: MarkdownReferenceTarget) => {
      if (!project || target.projectId !== projectId) return;
      if (target.kind === "document") {
        setPreviewMode("document");
        return;
      }
      if (target.kind === "project") {
        setPreviewMode("canvas");
        return;
      }
      const page = project.demoPages.find((candidate) => candidate.id === target.pageId);
      if (!page) return;
      setConfigPanelDetailPageId(page.id);
      handlePageChange(page.id);
      setPreviewMode("single");
    },
    [handlePageChange, project, projectId],
  );

  // 评论数据异步加载后消费浏览端深链。目标解析完全基于发布版本中的线程，
  // 不改变 URL，也不登记浏览端访问者为项目参与者。
  useEffect(() => {
    if (!project || !commentThreadId || commentsData.isLoading) return;
    const key = `${commentThreadId}:${commentReplyId ?? ""}`;
    if (handledCommentDeepLinkRef.current === key) return;
    handledCommentDeepLinkRef.current = key;
    const thread = commentsData.threads.find((item) => item.id === commentThreadId);
    if (!thread) {
      setCommentConfigTarget(null);
      setCommentDeepLinkNotice("该评论在当前发布版本中不可用");
      return;
    }
    setCommentDeepLinkNotice(null);
    setActiveCommentThreadId(thread.id);
    setCommentModeActive(false);
    if (thread.target.kind === "page") {
      setCommentConfigTarget(null);
      setPreviewMode("single");
      setRightPanelTab("comments");
      handlePageChange(thread.target.pageId);
      setConfigPanelDetailPageId(thread.target.pageId);
    } else if (thread.target.kind === "config") {
      setPreviewMode("single");
      setRightPanelTab("config");
      setCommentConfigTarget(thread.target);
      if (thread.target.pageId) {
        handlePageChange(thread.target.pageId);
        setConfigPanelDetailPageId(thread.target.pageId);
      }
      setCommentDeepLinkNotice("已打开配置项只读批注");
    } else if (thread.target.kind === "document") {
      setCommentConfigTarget(null);
      setPreviewMode("document");
      setCommentDocumentResourceId(thread.target.resourceId);
      setCommentDeepLinkNotice("已定位到文档评论");
    }
  }, [commentReplyId, commentThreadId, commentsData.isLoading, commentsData.threads, handlePageChange, project]);

  const handleConfigChange = useCallback(
    (newData: Record<string, unknown>) => {
      setConfigData((prev) => {
        const merged = { ...prev };
        for (const [key, val] of Object.entries(newData)) {
          if (val === null || val === undefined) {
            delete merged[key];
          } else {
            merged[key] = val;
          }
        }
        return merged;
      });
      setConfigDataMap((prev) => {
        const pageConfig = { ...(prev[activePageId] ?? {}) };
        for (const [key, val] of Object.entries(newData)) {
          if (val === null || val === undefined) {
            delete pageConfig[key];
          } else {
            pageConfig[key] = val;
          }
        }
        return { ...prev, [activePageId]: pageConfig };
      });
      setVisibilitySessionOverrides((prev) => {
        const filtered = filterConfigValuesByType(
          project?.projectConfigSchema,
          filterConfigValuesByType(pageSchemaMap[activePageId], newData, "business"),
          "business",
        );
        const next = { ...prev };
        for (const [key, val] of Object.entries(filtered)) {
          if (val === null || val === undefined) delete next[key];
          else next[key] = val;
        }
        return next;
      });
    },
    [activePageId, pageSchemaMap, project?.projectConfigSchema],
  );

  const handlePageConfigChange = useCallback(
    (pageId: string, newData: Record<string, unknown>) => {
      if (pageId === activePageId) {
        handleConfigChange(newData);
        return;
      }
      setConfigDataMap((prev) => ({
        ...prev,
        [pageId]: { ...(prev[pageId] ?? {}), ...newData },
      }));
    },
    [activePageId, handleConfigChange],
  );

  const handleProjectConfigChange = useCallback(
    (newData: Record<string, unknown>) => {
      setConfigData((prev) => ({ ...prev, ...newData }));
      setConfigDataMap((prev) => {
        const next = { ...prev };
        for (const pageId of Object.keys(next)) {
          next[pageId] = { ...next[pageId], ...newData };
        }
        return next;
      });
      setVisibilitySessionOverrides((prev) => {
        const filtered = filterConfigValuesByType(
          project?.projectConfigSchema,
          newData,
          "business",
        );
        const next = { ...prev };
        for (const [key, val] of Object.entries(filtered)) {
          if (val === null || val === undefined) delete next[key];
          else next[key] = val;
        }
        return next;
      });
    },
    [project?.projectConfigSchema],
  );

  const handleRestoreDefaults = useCallback(
    (pageId: string) => {
      if (!project) return;
      const pageSchema = pageSchemaMap[pageId];
      const defaults = mergeConfigDefaults(
        project.projectConfigSchema,
        pageSchema,
        project.projectConfigValues,
        projectId,
      );
      setConfigDataMap((prev) => ({ ...prev, [pageId]: defaults }));
      if (pageId === activePageId) {
        setConfigData(defaults);
      }
    },
    [project, pageSchemaMap, projectId, activePageId],
  );

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleLogin = useCallback(async () => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const result = await login(loginUsername, loginPassword);
      if (result) {
        setAuthToken(result.token);
        setSessionId(result.userId);
        setSessionUsername(result.username);
        setSessionRole(result.role || "guest");
        setLoginDialogOpen(false);
        setLoginUsername("");
        setLoginPassword("");
      }
    } catch (err: any) {
      setLoginError(err.message || "登录失败");
    } finally {
      setLoginLoading(false);
    }
  }, [loginPassword, loginUsername, projectId]);

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    setSessionId(null);
    setSessionUsername(null);
    setSessionRole("guest");
  }, []);

  const handleAddPage = useCallback(async () => {
    if (!sessionId || !project) return;
    try {
      await createDemoPage(projectId, "新页面", sessionId);
      const updatedProject = await getProjectData(projectId);
      setProject(updatedProject);
      const newPage = updatedProject.demoPages.find(
        (p) => !project.demoPages.find((op) => op.id === p.id),
      );
      if (newPage) {
        setActivePageId(newPage.id);
        if (newPage.schemaPath) {
          try {
            const schema = await getDemoSchema(projectId, newPage.schemaPath);
            const schemaStr = JSON.stringify(schema);
            const defaults = mergeConfigDefaults(
              updatedProject.projectConfigSchema,
              schemaStr,
              updatedProject.projectConfigValues,
              projectId,
            );
            setConfigData(defaults);
            setConfigDataMap((prev) => ({ ...prev, [newPage.id]: defaults }));
            setPageSchemaMap((prev) => ({ ...prev, [newPage.id]: schemaStr }));
          } catch {
            setConfigData({});
            setConfigDataMap((prev) => ({ ...prev, [newPage.id]: {} }));
          }
        } else {
          setConfigData({});
          setConfigDataMap((prev) => ({ ...prev, [newPage.id]: {} }));
        }
      }
    } catch (err: any) {
      console.error("添加页面失败:", err);
    }
  }, [sessionId, project, projectId]);

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      if (!sessionId || !project) return;
      try {
        await deleteDemoPage(projectId, pageId, sessionId);
        const updatedProject = await getProjectData(projectId);
        setProject(updatedProject);
        if (activePageId === pageId && updatedProject.demoPages.length > 0) {
          setActivePageId(updatedProject.demoPages[0].id);
        }
        setConfigDataMap((prev) => {
          const next = { ...prev };
          delete next[pageId];
          return next;
        });
      } catch (err: any) {
        console.error("删除页面失败:", err);
      }
    },
    [sessionId, project, projectId, activePageId],
  );

  const handleMovePage = useCallback(
    async (pageId: string, direction: "up" | "down") => {
      if (!sessionId || !project) return;
      const pages = [...project.demoPages].sort((a, b) => a.order - b.order);
      const idx = pages.findIndex((p) => p.id === pageId);
      if (idx === -1) return;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= pages.length) return;

      const reordered = [...pages];
      const temp = reordered[idx]!.order;
      reordered[idx]!.order = reordered[targetIdx]!.order;
      reordered[targetIdx]!.order = temp;

      try {
        await reorderDemoPages(
          projectId,
          sessionId,
          reordered.map((p) => ({
            id: p.id,
            order: p.order,
            parentId: p.parentId,
          })),
        );
        const updatedProject = await getProjectData(projectId);
        setProject(updatedProject);
      } catch (err: any) {
        console.error("移动页面失败:", err);
      }
    },
    [sessionId, project, projectId],
  );

  const handleRuntimeSwitch = useCallback(
    async (pageId: string, targetType: DemoPageRuntimeType) => {
      if (!sessionId || !project) return;
      try {
        await switchPageRuntime(projectId, pageId, sessionId, targetType);
        const updatedProject = await getProjectData(projectId);
        setProject(updatedProject);
      } catch (err: any) {
        console.error("切换模块类型失败:", err);
      }
    },
    [sessionId, project, projectId],
  );

  const previewStagePages = useMemo<PreviewStagePage[]>(
    () =>
      visiblePages.map((page) =>
        createPublishedPreviewStagePage({
          projectId,
          page,
          configData: configDataMap[page.id],
          schema: pageSchemaMap[page.id],
          sandboxExecution: sandboxExecutionMap[page.id],
          visibilityStatus: visibilityResolution?.pages[page.id]
            ? {
                visible: visibilityResolution.pages[page.id].visible,
                enabled: visibilityResolution.pages[page.id].enabled,
                unavailable: visibilityResolution.pages[page.id].unavailable,
                message: visibilityResolution.pages[page.id].message,
                fallbackPageId: visibilityResolution.pages[page.id].fallbackPageId,
                fallbackMessage: visibilityResolution.pages[page.id].fallbackMessage,
                alternativeRegion: visibilityResolution.pages[page.id].alternativeRegion,
                reasons: visibilityResolution.pages[page.id].reasons,
              }
            : undefined,
          visibilityRegions: Object.fromEntries(
            Object.entries(visibilityResolution?.regions ?? {})
              .filter(([key]) => key.startsWith(`${page.id}:`))
              .map(([key, state]) => [key, { visible: state.visible, enabled: state.enabled }]),
          ),
        }),
      ),
    [configDataMap, pageSchemaMap, projectId, sandboxExecutionMap, visibilityResolution, visiblePages],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header name="" onBack={() => router.push("/")} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col h-full">
        <Header name="" onBack={() => router.push("/")} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-destructive">
            加载失败：{error?.message || "项目不存在"}
          </div>
        </div>
      </div>
    );
  }

  if (!visibilityResolution?.valid) {
    return (
      <div className="flex h-full flex-col">
        <Header name={project.name} onBack={() => router.push("/")} />
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-lg text-destructive">
            页面状态规则未通过校验，已停止展示该发布版本。请由创作者修复规则并重新发布。
          </div>
        </div>
      </div>
    );
  }

  const availablePages = visiblePages.filter(
    (page) => visibilityResolution.pages[page.id]?.enabled !== false,
  );
  if (availablePages.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <Header name={project.name} onBack={() => router.push("/")} />
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-lg text-muted-foreground">
            当前配置与身份下没有可用页面，请联系创作者调整页面状态规则。
          </div>
        </div>
      </div>
    );
  }

  const tree = buildPageDirectoryTree(visiblePages, project.demoFolders, canvasState);
  const activePage = availablePages.find((p) => p.id === activePageId) ?? availablePages[0];
  const activePageSchema = activePage ? visiblePageSchemaMap[activePage.id] : "";
  const hasProjectConfig = !isSchemaEmpty(visibleProjectConfigSchema);
  const hasPageConfig = !isSchemaEmpty(activePageSchema);
  const hasSchema = hasProjectConfig || hasPageConfig;
  const hasBothScopes = hasProjectConfig && hasPageConfig;
  const hasDocumentContent = hasViewerDocumentContent(
    project.knowledge ?? [],
    project.designSpecs ?? [],
  );
  const configPanelRequirements = visiblePages.find(
    (page) =>
      page.id ===
      (previewMode === "single" ? activePageId : configPanelDetailPageId),
  )?.requirements;

  const configPanel = (
    <PageConfigPanel
      pages={visiblePages.map((page) => ({
        id: page.id,
        name: page.name,
        order: page.order,
        schema: visiblePageSchemaMap[page.id],
        configData: configDataMap[page.id],
        projectConfigSchema: page.referenceProjectConfigSchema,
        projectConfigBindings:
          page.runtimeType === "prototype-html-css"
            ? extractPrototypeConfigBindingKeys(page.prototypeHtml)
            : [],
      }))}
      activePageId={activePageId}
      detailPageId={
        previewMode === "single" ? activePageId : configPanelDetailPageId
      }
      onDetailPageIdChange={setConfigPanelDetailPageId}
      onPageSelect={handlePageChange}
      projectConfigSchema={visibleProjectConfigSchema}
      onProjectConfigChange={handleProjectConfigChange}
      onPageConfigChange={handlePageConfigChange}
      onReferenceClick={({ target }) => handleReferenceNavigate(target)}
      onRestoreDefaults={handleRestoreDefaults}
      requirements={configPanelRequirements}
      mediaBaseUrl={DATA_BASE}
      hideDetailHeader={previewMode === "single"}
      requirementsPosition="beforeConfig"
      hideEmptyRequirements
      designSpecEntries={designSpecEntries}
      pageDesignSpecEntries={pageDesignSpecEntries}
      configComments={configCommentController}
      configCommentDeepLinkTarget={commentConfigTarget}
    />
  );

  const commentsPanel = (
    <CommentPanel
      threads={previewMode === "canvas" ? canvasCommentThreads : activePageCommentThreads}
      currentUserId={commentUser?.id}
      activeThreadId={activeCommentThreadId}
      onSelectThread={handleCommentThreadSelect}
      commentMode={commentModeActive}
      onCommentModeChange={setCommentModeActive}
      groupByPage={previewMode === "canvas"}
      commentPages={visiblePages.map((page) => ({
        id: page.id,
        name: page.name,
        order: page.order,
      }))}
      focusedPageId={previewMode === "canvas" ? canvasSelectedPageId : null}
      createHint={
        previewMode === "canvas"
          ? "点击画布页面后，直接添加页面级评论"
          : undefined
      }
      mediaBaseUrl={DATA_BASE}
    />
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        name={project.name}
        onBack={() => router.push("/")}
        isLoggedIn={isLoggedIn}
        onLoginClick={() => setLoginDialogOpen(true)}
        onLogoutClick={handleLogout}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        hasDocumentContent={hasDocumentContent}
      />
      {visibilityNotice && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {visibilityNotice}
        </div>
      )}
      {commentDeepLinkNotice && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {commentDeepLinkNotice}
        </div>
      )}
      <ErrorBoundary>
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {project && activePage && (
            <ViewerAiPanel
              key={projectId}
              open={aiDrawerOpen}
              projectId={projectId}
              projectName={project.name}
              activePageId={activePage.id}
              activePageName={activePage.name}
              activeConfig={configData}
              onOpenChange={setAiDrawerOpen}
            />
          )}
          {previewMode === "single" &&
            (visiblePages.length > 1 || isLoggedIn) && (
              <div className="w-56 border-r border-border shrink-0 flex flex-col">
                <style>{`
              @keyframes dir-flash {
                0%, 100% { background-color: transparent; }
                50% { background-color: rgba(59, 130, 246, 0.15); }
              }
              .animate-dir-flash {
                animation: dir-flash 0.3s ease-in-out 3;
              }
            `}</style>
                <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                  <h2 className="text-xs font-medium text-muted-foreground">
                    页面目录
                  </h2>
                  {isLoggedIn && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={handleAddPage}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">添加页面</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-0.5">
                    <PageManagerList
                      items={tree}
                      activePageId={activePageId}
                      expandedFolders={expandedFolders}
                      onPageClick={handlePageChange}
                      onToggleFolder={toggleFolder}
                      flashPageId={flashDirectoryId}
                      isLoggedIn={isLoggedIn}
                      onDeletePage={handleDeletePage}
                      onMovePage={handleMovePage}
                      onRuntimeSwitch={handleRuntimeSwitch}
                      demoPages={visiblePages}
                    />
                  </div>
                </ScrollArea>
              </div>
            )}

          <div className="flex-1 min-w-0 overflow-hidden">
            {previewMode === "document" ? (
              <ViewerDocumentView
                projectId={projectId}
                items={project.knowledge ?? []}
                designSpecs={project.designSpecs ?? []}
                references={project.markdownReferences}
                onReferenceNavigate={handleReferenceNavigate}
                commentThreadId={commentThreadId}
                commentReplyId={commentReplyId}
                commentDocumentResourceId={commentDocumentResourceId}
                commentThread={commentThreadId ? commentsData.threads.find((thread) => thread.id === commentThreadId && thread.target.kind === "document") : undefined}
                projectConfigSchema={project.projectConfigSchema}
                pages={visiblePages.map((page) => ({
                  id: page.id,
                  name: page.name,
                  schema: pageSchemaMap[page.id],
                }))}
              />
            ) : (
              <CommentLayer
                projectId={projectId}
                pageId={previewMode === "canvas" ? (canvasSelectedPageId ?? activePageId) : activePageId}
                api={commentApi}
                wsUrl={commentWsUrl}
                currentUser={commentUser}
                mediaBaseUrl={DATA_BASE}
                canMentionAgent={false}
                disabled={false}
                showToggle={false}
                commentMode={commentModeActive}
                onCommentModeChange={setCommentModeActive}
                activeThreadId={activeCommentThreadId}
                onActiveThreadChange={setActiveCommentThreadId}
                threads={activePageCommentThreads}
                onCreateComment={commentsData.createComment}
                onAddReply={commentsData.addReply}
                onUpdateComment={commentsData.updateComment}
                onUpdateReply={commentsData.updateReply}
                onSetResolved={commentsData.setResolved}
                onDeleteThread={commentsData.deleteThread}
                onDeleteReply={commentsData.deleteReply}
                showPins={!hasSchema || rightPanelTab === "comments"}
                canvasCreateDraft={canvasCommentDraft}
                onCanvasCreateDraftChange={setCanvasCommentDraft}
                canvasViewport={previewMode === "canvas" ? canvasState.viewport : undefined}
              >
                <PreviewStage
                  className="h-full bg-background"
                  pages={previewStagePages}
                  activePageId={activePageId}
                  onActivePageChange={handlePageChange}
                  previewMode={previewMode}
                  onPreviewModeChange={setPreviewMode}
                  canvasState={canvasState}
                  onCanvasStateChange={setCanvasState}
                  interactionMode="viewer"
                  showToolbar={visiblePages.length >= 1}
                  canvasProps={{
                    projectId,
                    onPageConfigEdit: (pageId) => {
                      setCanvasSelectedPageId(pageId);
                      handlePageChange(pageId);
                      setConfigPanelDetailPageId(pageId);
                    },
                    commentCounts: canvasCommentCounts,
                    onPageCommentBadgeClick: handleCanvasCommentBadgeClick,
                    onPageComment: commentModeActive
                      ? ({ pageId, pageName, pin, clientX, clientY }) => {
                          setCanvasSelectedPageId(pageId);
                          setRightPanelTab("comments");
                          setCanvasCommentDraft({
                            input: {
                              target: { kind: "page", pageId },
                              anchor: {
                                domPath: "canvas-page",
                                tagName: "canvas-page",
                                componentName: pageName,
                                textSnippet: pageName,
                                snapshot: { attrs: { "data-page-id": pageId } },
                              },
                              pin,
                            },
                            clientX,
                            clientY,
                          });
                        }
                      : undefined,
                    onCanvasClick: () => {
                      setCanvasSelectedPageId(null);
                    },
                  }}
                />
              </CommentLayer>
            )}
          </div>

          {previewMode === "document" ? null : (
            <div className="w-80 border-l border-border shrink-0 flex flex-col">
              {hasSchema ? (
                <Tabs
                  value={rightPanelTab}
                  onValueChange={(v) =>
                    setRightPanelTab(v as "config" | "comments")
                  }
                  className="flex h-full flex-col"
                >
                  <TabsList className="w-full justify-start gap-2 rounded-none border-b px-2 h-12 bg-transparent">
                    <TabsTrigger
                      value="config"
                      title="配置"
                      className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      {rightPanelTab === "config" && <span>配置</span>}
                    </TabsTrigger>
                    <TabsTrigger
                      value="comments"
                      title={commentTabLabel}
                      aria-label={commentTabLabel}
                      className="relative gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {rightPanelTab === "comments" && <span>评论</span>}
                      <CommentUnreadDot count={unresolvedCommentCount} />
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="config"
                    className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden"
                  >
                    {configPanel}
                  </TabsContent>
                  <TabsContent
                    value="comments"
                    className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden"
                  >
                    {commentsPanel}
                  </TabsContent>
                </Tabs>
              ) : (
                <Tabs value="comments" className="flex h-full flex-col">
                  <TabsList className="w-full justify-start gap-2 rounded-none border-b px-2 h-12 bg-transparent">
                    <TabsTrigger
                      value="comments"
                      title={commentTabLabel}
                      aria-label={commentTabLabel}
                      className="relative gap-2 px-2"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>评论</span>
                      <CommentUnreadDot count={unresolvedCommentCount} />
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="comments"
                    className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden"
                  >
                    {commentsPanel}
                  </TabsContent>
                </Tabs>
              )}
            </div>
          )}
        </div>
      </ErrorBoundary>
      {!aiDrawerOpen && (
        <Button
          type="button"
          size="icon"
          className="fixed bottom-4 left-4 z-40 h-11 w-11 rounded-full shadow-lg"
          onClick={() => setAiDrawerOpen(true)}
          title="打开 AI 问答"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      )}

      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>登录创作端</DialogTitle>
            <DialogDescription>
              使用创作端账号登录以管理页面模块
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Input
                placeholder="用户名"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <Input
                type="password"
                placeholder="密码"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            {loginError && (
              <p className="text-xs text-destructive">{loginError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoginDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleLogin} disabled={loginLoading}>
              {loginLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              登录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageManagerList({
  items,
  activePageId,
  expandedFolders,
  onPageClick,
  onToggleFolder,
  flashPageId,
  isLoggedIn,
  onDeletePage,
  onMovePage,
  onRuntimeSwitch,
  demoPages,
  depth = 0,
}: {
  items: PageDirectoryTreeItem[];
  activePageId: string;
  expandedFolders: Set<string>;
  onPageClick: (pageId: string) => void;
  onToggleFolder: (folderId: string) => void;
  flashPageId: string | null;
  isLoggedIn: boolean;
  onDeletePage: (pageId: string) => void;
  onMovePage: (pageId: string, direction: "up" | "down") => void;
  onRuntimeSwitch: (pageId: string, targetType: DemoPageRuntimeType) => void;
  demoPages: PublishedDemoPage[];
  depth?: number;
}) {
  const sortedPages = [...demoPages].sort((a, b) => a.order - b.order);

  return (
    <>
      {items.map((item, idx) => {
        if (item.type === "folder" || item.type === "canvas-group") {
          const isExpanded = expandedFolders.has(item.id);
          return (
            <div key={item.id}>
              <button
                onClick={() => onToggleFolder(item.id)}
                aria-expanded={isExpanded}
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 ${
                  item.type === "canvas-group"
                    ? "text-muted-foreground"
                    : "text-foreground"
                }`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
                <span className="truncate text-xs font-medium">
                  {item.name}
                </span>
              </button>
              {isExpanded && item.children && (
                <PageManagerList
                  items={item.children}
                  activePageId={activePageId}
                  expandedFolders={expandedFolders}
                  onPageClick={onPageClick}
                  onToggleFolder={onToggleFolder}
                  flashPageId={flashPageId}
                  isLoggedIn={isLoggedIn}
                  onDeletePage={onDeletePage}
                  onMovePage={onMovePage}
                  onRuntimeSwitch={onRuntimeSwitch}
                  demoPages={demoPages}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        const pageIdx = sortedPages.findIndex((p) => p.id === item.id);
        const isFirst = pageIdx === 0;
        const isLast = pageIdx === sortedPages.length - 1;
        const pageRuntime = item.page?.runtimeType || "high-fidelity-react";

        const runtimeTypeLabel: Record<string, string> = {
          "high-fidelity-react": "高保真",
          "prototype-html-css": "HTML原型",
          "sketch-scene": "手绘",
        };

        return (
          <div
            key={item.id}
            className={`flex items-center group rounded-md text-sm transition-colors ${
              item.id === activePageId
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            } ${item.id === flashPageId ? "animate-dir-flash" : ""}`}
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
          >
            <button
              onClick={() => onPageClick(item.id)}
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left px-1 py-1.5"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <span className="truncate text-xs block">{item.name}</span>
                <span className="text-[10px] opacity-60 block">
                  {runtimeTypeLabel[pageRuntime] || pageRuntime}
                </span>
              </div>
            </button>
            {isLoggedIn && (
              <div className="flex items-center shrink-0 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5">
                      <ArrowLeftRight className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-36 p-1" align="end">
                    <div className="space-y-0.5">
                      <button
                        className={`w-full flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${
                          pageRuntime === "high-fidelity-react"
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground"
                        }`}
                        onClick={() =>
                          onRuntimeSwitch(item.id, "high-fidelity-react")
                        }
                        disabled={pageRuntime === "high-fidelity-react"}
                      >
                        <FileCode className="h-3.5 w-3.5" />
                        高保真
                      </button>
                      <button
                        className={`w-full flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${
                          pageRuntime === "prototype-html-css"
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground"
                        }`}
                        onClick={() =>
                          onRuntimeSwitch(item.id, "prototype-html-css")
                        }
                        disabled={pageRuntime === "prototype-html-css"}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        HTML原型
                      </button>
                      <button
                        className={`w-full flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${
                          pageRuntime === "sketch-scene"
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => onRuntimeSwitch(item.id, "sketch-scene")}
                        disabled={pageRuntime === "sketch-scene"}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                        手绘
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => onMovePage(item.id, "up")}
                      disabled={isFirst}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">上移</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => onMovePage(item.id, "down")}
                      disabled={isLast}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">下移</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(`确定要删除「${item.name}」吗？`)) {
                          onDeletePage(item.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">删除</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Header({
  name,
  onBack,
  isLoggedIn,
  onLoginClick,
  onLogoutClick,
  previewMode,
  onPreviewModeChange,
  hasDocumentContent = true,
}: {
  name: string;
  onBack: () => void;
  isLoggedIn?: boolean;
  onLoginClick?: () => void;
  onLogoutClick?: () => void;
  previewMode?: PreviewMode;
  onPreviewModeChange?: (mode: PreviewMode) => void;
  hasDocumentContent?: boolean;
}) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center h-14 px-4 border-b border-border shrink-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回</span>
        </button>
        {name && <h1 className="text-sm font-semibold truncate">{name}</h1>}
      </div>
      {previewMode !== undefined && onPreviewModeChange !== undefined && (
        <div className="flex justify-center">
          <PreviewModeSwitcher
            mode={previewMode}
            onModeChange={onPreviewModeChange}
            modes={
              hasDocumentContent
                ? ["single", "canvas", "document"]
                : ["single", "canvas"]
            }
          />
        </div>
      )}
      <div className="flex items-center justify-end">
        {onLoginClick !== undefined &&
          (isLoggedIn ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onLogoutClick}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">退出登录</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onLoginClick}
                >
                  <LogIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">登录以管理页面</p>
              </TooltipContent>
            </Tooltip>
          ))}
      </div>
    </header>
  );
}

export default function ViewerApp() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { view, projectId, pageId } = parsePath(pathname);
  const commentThreadId = searchParams.get("comment") || undefined;
  const commentReplyId = searchParams.get("reply") || undefined;

  if (pathname === "/feedback" || pathname === "/feedback/") {
    return <FeedbackPage />;
  }

  switch (view) {
    case "list":
      return <ProjectListPage />;
    case "project":
      return <ProjectPreviewPage projectId={projectId!} requestedPageId={pageId} commentThreadId={commentThreadId} commentReplyId={commentReplyId} />;
  }
}
