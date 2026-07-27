"use client";

import { usePathname, useRouter } from "next/navigation";
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
  Map as MapIcon,
  MessageCircle,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  ArrowLeftRight,
  LogIn,
  LogOut,
  Loader2,
} from "lucide-react";
import {
  getProjects,
  getProjectData,
  getDemoSchema,
  getDataUrl,
  DATA_BASE,
  getThumbnailUrl,
  getScreenshotFileUrl,
  getScreenshotFileMetaUrl,
  getCompiledJsUrl,
  getPublishedFileUrl,
  login,
  setAuthToken,
  getAuthToken,
  createDemoPage,
  reorderDemoPages,
  switchPageRuntime,
  deleteDemoPage,
} from "@/lib/api";
import type {
  ProjectsIndex,
  PublishedProject,
  PublishedDemoPage,
} from "@/lib/api";
import type { DemoPageRuntimeType } from "@workbench/shared";
import {
  extractPrototypeConfigBindingKeys,
  PreviewPanel,
  PageConfigPanel,
  PrototypePagePreview,
  SketchPagePreview,
  IframePreviewFrame,
} from "@/components/demo";
import { PreviewCanvas } from "@/components/demo";
import type { PreviewMode, CanvasState } from "@/components/demo";
import {
  isSchemaEmpty,
} from "@/components/demo";
import { getDefaultValues, getPreviewSize } from "@/lib/validator";
import type { PreviewSize } from "@workbench/demo-ui";
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
import { ViewerAiPanel } from "@/components/ViewerAiPanel";

type SortOption = "newest" | "oldest" | "name";
type ProjectListItem = ProjectsIndex["projects"][number];

const MAX_SCREENSHOT_COVER_ITEMS = 10;
const DEFAULT_SCREENSHOT_ASPECT_RATIO = 9 / 16;
const MIN_SCREENSHOT_ASPECT_RATIO = 0.45;
const MAX_SCREENSHOT_ASPECT_RATIO = 1.8;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;

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
} {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return { view: "list" };
  return { view: "project", projectId: segments[0] };
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
    if (options?.projectId && /^\.\.?\/[^'")\s]*$/.test(value) && IMAGE_EXT_RE.test(value)) {
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
}: {
  projectId: string;
  page: { id: string; name: string; screenshotPath?: string };
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
    const staticImageUrl = page.screenshotPath
      ? getPublishedFileUrl(projectId, page.screenshotPath)
      : null;
    const directImageUrl = staticImageUrl ?? getScreenshotFileUrl(projectId, page.id);
    const metaUrl = getScreenshotFileMetaUrl(projectId, page.id);
    setImageUrl(null);
    setFailed(false);
    setImageUrl(directImageUrl);

    if (staticImageUrl) {
      return () => {
        cancelled = true;
      };
    }

    if (new URL(metaUrl, window.location.href).origin !== window.location.origin) {
      return () => {
        cancelled = true;
      };
    }

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
          setImageUrl(getDataUrl(url));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [projectId, page.id, page.screenshotPath]);

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
}: {
  projectId: string;
  pages: Array<{ id: string; name: string; screenshotPath?: string }>;
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
    return <ScreenshotCover projectId={project.id} pages={pages} />;
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
            <h1 className="text-lg font-semibold leading-none">FlowSite</h1>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              来自 OneFlow 的项目站点
            </p>
          </div>

          <div className="flex-1 flex items-center justify-end gap-2">
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

interface TreeItem {
  type: "folder" | "page";
  id: string;
  name: string;
  order: number;
  parentId?: string | null;
  page?: PublishedDemoPage;
  children?: TreeItem[];
}

function buildTree(
  demoPages: PublishedDemoPage[],
  demoFolders: PublishedProject["demoFolders"],
): TreeItem[] {
  const folderMap = new Map<string, TreeItem>();
  const rootItems: TreeItem[] = [];

  for (const folder of demoFolders) {
    folderMap.set(folder.id, {
      type: "folder",
      id: folder.id,
      name: folder.name,
      order: folder.order,
      parentId: folder.parentId,
      children: [],
    });
  }

  for (const folder of demoFolders) {
    const item = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children!.push(item);
    } else {
      rootItems.push(item);
    }
  }

  for (const page of demoPages) {
    const pageItem: TreeItem = {
      type: "page",
      id: page.id,
      name: page.name,
      order: page.order,
      parentId: page.parentId,
      page,
    };
    if (page.parentId && folderMap.has(page.parentId)) {
      folderMap.get(page.parentId)!.children!.push(pageItem);
    } else {
      rootItems.push(pageItem);
    }
  }

  const sortItems = (items: TreeItem[]) => {
    items.sort((a, b) => a.order - b.order);
    for (const item of items) {
      if (item.children) {
        sortItems(item.children);
      }
    }
  };
  sortItems(rootItems);

  return rootItems;
}

function ProjectPreviewPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<PublishedProject | null>(null);
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
  const [pageSchemaMap, setPageSchemaMap] = useState<Record<string, string>>(
    {},
  );
  const [previewSize, setPreviewSize] = useState<PreviewSize | undefined>();
  const [flashDirectoryId, setFlashDirectoryId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("canvas");
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [configPanelDetailPageId, setConfigPanelDetailPageId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: {},
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const isLoggedIn = sessionId != null;

  useEffect(() => {
    getProjectData(projectId)
      .then(async (data) => {
        setProject(data);
        setCanvasState(
          data.canvasState ?? {
            viewport: { x: 40, y: 40, zoom: 0.5 },
            pages: {},
          },
        );

        if (data.demoFolders.length > 0) {
          setExpandedFolders(new Set(data.demoFolders.map((f) => f.id)));
        }

        const initialConfigMap: Record<string, Record<string, unknown>> = {};
        const schemaMap: Record<string, string> = {};

        if (data.demoPages.length > 0) {
          setActivePageId(data.demoPages[0].id);

          for (const page of data.demoPages) {
            if (page.schemaPath) {
              try {
                const schema = await getDemoSchema(projectId, page.schemaPath);
                const schemaStr = JSON.stringify(schema);
                schemaMap[page.id] = schemaStr;
                const defaults = mergeConfigDefaults(
                  data.projectConfigSchema,
                  schemaStr,
                  data.projectConfigValues,
                  projectId,
                );
                initialConfigMap[page.id] = defaults;
              } catch {
                initialConfigMap[page.id] = mergeConfigDefaults(
                  data.projectConfigSchema,
                  undefined,
                  data.projectConfigValues,
                  projectId,
                );
              }
            } else {
              initialConfigMap[page.id] = mergeConfigDefaults(
                data.projectConfigSchema,
                undefined,
                data.projectConfigValues,
                projectId,
              );
            }
          }

          const firstPage = data.demoPages[0];

          setConfigData(initialConfigMap[firstPage.id] || {});
          if (schemaMap[firstPage.id]) {
            setPreviewSize(getPreviewSize(schemaMap[firstPage.id]));
          }
        }

        setConfigDataMap(initialConfigMap);
        setPageSchemaMap(schemaMap);
      })
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [projectId]);

  const handlePageChange = useCallback(
    (pageId: string) => {
      if (!project) return;
      setActivePageId(pageId);

      const pageConfig = configDataMap[pageId];
      if (pageConfig) {
        setConfigData(pageConfig);
      }

      const schema = pageSchemaMap[pageId];
      if (schema) {
        setPreviewSize(getPreviewSize(schema));
      } else {
        // schema 不可用时，使用页面自带的 previewSize 作为 fallback
        const page = project.demoPages.find((p) => p.id === pageId);
        setPreviewSize(page?.previewSize ?? undefined);
      }
    },
    [project, configDataMap, pageSchemaMap],
  );

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
    },
    [activePageId],
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
    },
    [],
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
        setLoginDialogOpen(false);
        setLoginUsername("");
        setLoginPassword("");
      }
    } catch (err: any) {
      setLoginError(err.message || "登录失败");
    } finally {
      setLoginLoading(false);
    }
  }, [loginUsername, loginPassword]);

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    setSessionId(null);
  }, []);

  const handleAddPage = useCallback(async () => {
    if (!sessionId || !project) return;
    try {
      await createDemoPage(projectId, "新页面", sessionId);
      const updatedProject = await getProjectData(projectId);
      setProject(updatedProject);
      const newPage = updatedProject.demoPages.find(
        (p) => !project.demoPages.find((op) => op.id === p.id)
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
            setPreviewSize(getPreviewSize(schemaStr));
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

  const handleDeletePage = useCallback(async (pageId: string) => {
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
  }, [sessionId, project, projectId, activePageId]);

  const handleMovePage = useCallback(async (pageId: string, direction: "up" | "down") => {
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
        reordered.map((p) => ({ id: p.id, order: p.order, parentId: p.parentId })),
      );
      const updatedProject = await getProjectData(projectId);
      setProject(updatedProject);
    } catch (err: any) {
      console.error("移动页面失败:", err);
    }
  }, [sessionId, project, projectId]);

  const handleRuntimeSwitch = useCallback(async (pageId: string, targetType: DemoPageRuntimeType) => {
    if (!sessionId || !project) return;
    try {
      await switchPageRuntime(projectId, pageId, sessionId, targetType);
      const updatedProject = await getProjectData(projectId);
      setProject(updatedProject);
    } catch (err: any) {
      console.error("切换模块类型失败:", err);
    }
  }, [sessionId, project, projectId]);

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

  const tree = buildTree(project.demoPages, project.demoFolders);
  const activePage = project.demoPages.find((p) => p.id === activePageId);
  const activePageSchema = activePage ? pageSchemaMap[activePage.id] : "";
  const hasProjectConfig = !isSchemaEmpty(project.projectConfigSchema);
  const hasPageConfig = !isSchemaEmpty(activePageSchema);
  const hasSchema = hasProjectConfig || hasPageConfig;
  const hasBothScopes = hasProjectConfig && hasPageConfig;

  const compiledUrl = activePage?.compiledJsPath
    ? getCompiledJsUrl(projectId, activePage.compiledJsPath)
    : "";
  const activeIframeUrl = activePage?.iframeHtmlPath
    ? getPublishedFileUrl(projectId, activePage.iframeHtmlPath)
    : "";

  return (
    <div className="flex flex-col h-full">
      <Header
        name={project.name}
        onBack={() => router.push("/")}
        isLoggedIn={isLoggedIn}
        onLoginClick={() => setLoginDialogOpen(true)}
        onLogoutClick={handleLogout}
      />
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
        {previewMode !== "canvas" && (project.demoPages.length > 1 || isLoggedIn) && (
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
                  demoPages={project.demoPages}
                />
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex-1 min-w-0 overflow-hidden">
    <div className="flex flex-col h-screen overflow-hidden bg-background">
            {project.demoPages.length >= 1 && (
              <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("single")}
                    className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors ${
                      previewMode === "single"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    单页
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("canvas")}
                    className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors ${
                      previewMode === "canvas"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    画布
                  </button>
                </div>
                <div className="flex-1" />
              </div>
            )}
            {previewMode === "canvas" ? (
              <div className="flex-1 overflow-hidden">
                <PreviewCanvas
                  interactionMode="viewer"
                  projectId={projectId}
                  pages={project.demoPages.map((p) => ({
                    id: p.id,
                    name: p.name,
                    order: p.order,
                    runtimeType: p.runtimeType,
                    compiledJsUrl: p.compiledJsPath
                      ? getCompiledJsUrl(projectId, p.compiledJsPath)
                      : undefined,
                    iframeUrl: p.iframeHtmlPath
                      ? getPublishedFileUrl(projectId, p.iframeHtmlPath)
                      : undefined,
                    prototypeHtml: p.prototypeHtml,
                    prototypeCss: p.prototypeCss,
                    prototypeMeta: p.prototypeMeta,
                    sketchScene: p.sketchScene
                      ? JSON.stringify(p.sketchScene)
                      : undefined,
                    sketchMeta: p.sketchMeta,
                    configData: configDataMap[p.id],
                    previewSize: p.previewSize,
                  }))}
                  canvasState={canvasState}
                  onCanvasStateChange={setCanvasState}
                  onPageConfigEdit={(pageId) => {
                    handlePageChange(pageId);
                    setConfigPanelDetailPageId(pageId);
                  }}
                />
              </div>
            ) : (
              <div
                className="preview-single-scroll h-full flex-1 overflow-y-auto p-4"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                <style>{`
                  .preview-single-scroll::-webkit-scrollbar { display: none; }
                `}</style>
                {activeIframeUrl ? (
                  <IframePreviewFrame
                    src={activeIframeUrl}
                    title={activePage?.name ?? "页面预览"}
                    previewSize={previewSize ?? activePage?.previewSize}
                    configData={configData}
                    demoId={activePage?.id}
                  />
                ) : activePage?.runtimeType === "prototype-html-css" ? (
                  <PrototypePagePreview
                    html={activePage.prototypeHtml}
                    css={activePage.prototypeCss}
                    configData={configData}
                    previewSize={previewSize ?? activePage.previewSize}
                    allowScroll
                  />
                ) : activePage?.runtimeType === "sketch-scene" ? (
                  <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-md border bg-background shadow-sm">
                    <SketchPagePreview
                      scene={activePage.sketchScene}
                      configData={configData}
                      previewSize={previewSize ?? activePage.previewSize}
                      fillContainer
                    />
                  </div>
                ) : activePage ? (
                  <PreviewPanel
                    compiledJsUrl={compiledUrl}
                    configData={configData}
                    previewSize={previewSize ?? activePage.previewSize}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>

        {hasSchema && !aiDrawerOpen && (
          <div className="w-80 border-l border-border shrink-0 flex flex-col">
            <PageConfigPanel
              pages={project.demoPages.map((page) => ({
                id: page.id,
                name: page.name,
                order: page.order,
                schema: pageSchemaMap[page.id],
                configData: configDataMap[page.id],
                projectConfigBindings:
                  page.runtimeType === "prototype-html-css"
                    ? extractPrototypeConfigBindingKeys(page.prototypeHtml)
                    : undefined,
              }))}
              activePageId={activePageId}
              detailPageId={
                previewMode === "single" ? activePageId : configPanelDetailPageId
              }
              onDetailPageIdChange={setConfigPanelDetailPageId}
              onPageSelect={handlePageChange}
              projectConfigSchema={project.projectConfigSchema}
              onProjectConfigChange={handleProjectConfigChange}
              onPageConfigChange={handlePageConfigChange}
              onRestoreDefaults={handleRestoreDefaults}
              hideDetailHeader={previewMode === "single"}
            />
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
            <Button
              variant="outline"
              onClick={() => setLoginDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleLogin} disabled={loginLoading}>
              {loginLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
  items: TreeItem[];
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
        if (item.type === "folder") {
          const isExpanded = expandedFolders.has(item.id);
          return (
            <div key={item.id}>
              <button
                onClick={() => onToggleFolder(item.id)}
                className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent/50 text-foreground"
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
                <span className="truncate font-medium text-xs">
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-36 p-1" align="end">
                    <div className="space-y-0.5">
                      <button
                        className={`w-full flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${
                          pageRuntime === "high-fidelity-react" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                        }`}
                        onClick={() => onRuntimeSwitch(item.id, "high-fidelity-react")}
                        disabled={pageRuntime === "high-fidelity-react"}
                      >
                        <FileCode className="h-3.5 w-3.5" />
                        高保真
                      </button>
                      <button
                        className={`w-full flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${
                          pageRuntime === "prototype-html-css" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                        }`}
                        onClick={() => onRuntimeSwitch(item.id, "prototype-html-css")}
                        disabled={pageRuntime === "prototype-html-css"}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        HTML原型
                      </button>
                      <button
                        className={`w-full flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${
                          pageRuntime === "sketch-scene" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
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
}: {
  name: string;
  onBack: () => void;
  isLoggedIn?: boolean;
  onLoginClick?: () => void;
  onLogoutClick?: () => void;
}) {
  return (
    <header className="flex items-center h-12 px-4 border-b border-border shrink-0 gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">返回</span>
      </button>
      {name && <h1 className="text-sm font-semibold">{name}</h1>}
      <div className="flex-1" />
      {onLoginClick !== undefined && (
        isLoggedIn ? (
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
        )
      )}
    </header>
  );
}

export default function ViewerApp() {
  const pathname = usePathname();
  const { view, projectId } = parsePath(pathname);

  switch (view) {
    case "list":
      return <ProjectListPage />;
    case "project":
      return <ProjectPreviewPage projectId={projectId!} />;
  }
}
