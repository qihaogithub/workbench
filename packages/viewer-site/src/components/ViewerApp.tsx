"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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
  Download,
} from "lucide-react";
import {
  getProjects,
  getProjectData,
  getDemoSchema,
  getThumbnailUrl,
  getCompiledJsUrl,
  getProjectScaffoldUrl,
} from "@/lib/api";
import type {
  ProjectsIndex,
  PublishedProject,
  PublishedDemoPage,
} from "@/lib/api";
import { PreviewPanel, PageConfigPanel, PrototypePagePreview } from "@/components/demo";
import { PreviewCanvas } from "@/components/demo";
import type { PreviewMode, CanvasState } from "@/components/demo";
import {
  isSchemaEmpty,
} from "@/components/demo";
import { getDefaultValues, getPreviewSize } from "@/lib/validator";
import type { PreviewSize } from "@opencode-workbench/demo-ui";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ViewerAiDrawer } from "@/components/ViewerAiDrawer";

type SortOption = "newest" | "oldest" | "name";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "最新更新" },
  { value: "oldest", label: "最早更新" },
  { value: "name", label: "名称" },
];

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
): Record<string, unknown> {
  const projectDefaults = projectSchema ? getDefaultValues(projectSchema) : {};
  const pageDefaults = pageSchema ? getDefaultValues(pageSchema) : {};
  return { ...projectDefaults, ...pageDefaults };
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
          <h1 className="text-lg font-semibold shrink-0">资源效果预览</h1>

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
          <div
            className="grid gap-4"
            style={
              {
                "--available-h": "calc(100vh - 56px - 32px)",
                "--row-h": "calc((var(--available-h) - 32px) / 2.5)",
                "--name-h": "44px",
                "--img-h": "calc(var(--row-h) - var(--name-h))",
                "--col-w": "calc(var(--img-h) * 375 / 812)",
                gridTemplateColumns: "repeat(auto-fill, var(--col-w))",
                gridAutoRows: "var(--row-h)",
              } as React.CSSProperties
            }
          >
            {filteredProjects.map((project) => {
              const thumbnailUrl = project.thumbnail
                ? getThumbnailUrl(project.thumbnail)
                : undefined;
              return (
                <button
                  key={project.id}
                  onClick={() => router.push(`/${project.id}`)}
                  className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent text-left"
                >
                  {thumbnailUrl ? (
                    <div
                      className="relative w-full overflow-hidden"
                      style={{ aspectRatio: "375 / 812" }}
                    >
                      <Image
                        src={thumbnailUrl}
                        alt={project.name}
                        fill
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div
                      className="flex w-full items-center justify-center bg-secondary/50"
                      style={{ aspectRatio: "375 / 812" }}
                    >
                      <FileCode className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="p-3">
                    <h2 className="truncate text-sm font-medium group-hover:text-accent-foreground">
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
                );
                initialConfigMap[page.id] = defaults;
              } catch {
                initialConfigMap[page.id] = mergeConfigDefaults(
                  data.projectConfigSchema,
                );
              }
            } else {
              initialConfigMap[page.id] = mergeConfigDefaults(
                data.projectConfigSchema,
              );
            }
          }

          const firstPage = data.demoPages[0];
          const saved = localStorage.getItem(
            `config:${projectId}:${firstPage.id}`,
          );
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              const defaults = initialConfigMap[firstPage.id] || {};
              initialConfigMap[firstPage.id] = { ...defaults, ...parsed };
            } catch {}
          }

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
        const merged = { ...prev, ...newData };
        try {
          localStorage.setItem(
            `config:${projectId}:${activePageId}`,
            JSON.stringify(merged),
          );
        } catch {}
        return merged;
      });
      setConfigDataMap((prev) => ({
        ...prev,
        [activePageId]: { ...(prev[activePageId] ?? {}), ...newData },
      }));
    },
    [projectId, activePageId],
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

  return (
    <div className="flex flex-col h-full">
      <Header
        name={project.name}
        onBack={() => router.push("/")}
        exportHref={getProjectScaffoldUrl(projectId)}
      />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {project && activePage && (
          <ViewerAiDrawer
            open={aiDrawerOpen}
            projectId={projectId}
            project={project}
            activePageId={activePage.id}
            activeConfig={configData}
            onOpenChange={setAiDrawerOpen}
          />
        )}
        {previewMode !== "canvas" && project.demoPages.length > 1 && (
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
            <div className="px-3 py-2.5 border-b border-border">
              <h2 className="text-xs font-medium text-muted-foreground">
                页面目录
              </h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                <TreeList
                  items={tree}
                  activePageId={activePageId}
                  expandedFolders={expandedFolders}
                  onPageClick={handlePageChange}
                  onToggleFolder={toggleFolder}
                  flashPageId={flashDirectoryId}
                />
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex flex-col h-full">
            {project.demoPages.length > 1 && (
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
                    prototypeHtml: p.prototypeHtml,
                    prototypeCss: p.prototypeCss,
                    prototypeMeta: p.prototypeMeta,
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
                className="flex-1 overflow-y-auto"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                <style>{`
                  .preview-single-scroll::-webkit-scrollbar { display: none; }
                `}</style>
                {activePage?.runtimeType === "prototype-html-css" ? (
                  <PrototypePagePreview
                    html={activePage.prototypeHtml}
                    css={activePage.prototypeCss}
                    configData={configData}
                    className="min-h-full"
                  />
                ) : activePage ? (
                  <PreviewPanel
                    compiledJsUrl={compiledUrl}
                    configData={configData}
                    previewSize={previewSize}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>

        {hasSchema && (
          <div className="w-80 border-l border-border shrink-0 flex flex-col">
            <PageConfigPanel
              pages={project.demoPages.map((page) => ({
                id: page.id,
                name: page.name,
                order: page.order,
                schema: pageSchemaMap[page.id],
                configData: configDataMap[page.id],
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
              readonly
              hideDetailHeader={previewMode === "single"}
            />
          </div>
        )}
      </div>
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
    </div>
  );
}

function TreeList({
  items,
  activePageId,
  expandedFolders,
  onPageClick,
  onToggleFolder,
  flashPageId,
  depth = 0,
}: {
  items: TreeItem[];
  activePageId: string;
  expandedFolders: Set<string>;
  onPageClick: (pageId: string) => void;
  onToggleFolder: (folderId: string) => void;
  flashPageId: string | null;
  depth?: number;
}) {
  return (
    <>
      {items.map((item) => {
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
                <TreeList
                  items={item.children}
                  activePageId={activePageId}
                  expandedFolders={expandedFolders}
                  onPageClick={onPageClick}
                  onToggleFolder={onToggleFolder}
                  flashPageId={flashPageId}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => onPageClick(item.id)}
            className={`flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
              item.id === activePageId
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            } ${item.id === flashPageId ? "animate-dir-flash" : ""}`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-xs">{item.name}</span>
          </button>
        );
      })}
    </>
  );
}

function Header({
  name,
  onBack,
  exportHref,
}: {
  name: string;
  onBack: () => void;
  exportHref?: string;
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
      {exportHref && (
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={exportHref} download>
            <Download className="h-4 w-4" />
            导出代码
          </a>
        </Button>
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
