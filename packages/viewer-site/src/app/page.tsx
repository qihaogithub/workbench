"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  FileCode,
  X,
  Check,
  ArrowLeft,
  Settings,
  ChevronRight,
} from "lucide-react";
import {
  getProjects,
  getProjectData,
  getDemoSchema,
  getThumbnailUrl,
  getCompiledJsUrl,
} from "@/lib/api";
import type {
  ProjectsIndex,
  PublishedProject,
  PublishedDemoPage,
  PreviewSize,
} from "@/lib/api";
import { StaticPreviewPanel } from "@/components/StaticPreviewPanel";
import { StaticConfigPanel } from "@/components/StaticConfigPanel";

type SortOption = "newest" | "oldest" | "name";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "最新更新" },
  { value: "oldest", label: "最早更新" },
  { value: "name", label: "名称" },
];

function parsePath(pathname: string): {
  view: "list" | "project" | "demo";
  projectId?: string;
  demoId?: string;
} {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return { view: "list" };
  if (segments.length === 1)
    return { view: "project", projectId: segments[0] };
  return { view: "demo", projectId: segments[0], demoId: segments[1] };
}

function buildTreeItems(
  demoPages: PublishedDemoPage[],
  demoFolders: PublishedProject["demoFolders"],
): Array<
  | { type: "folder"; id: string; name: string; order: number }
  | { type: "page"; page: PublishedDemoPage }
> {
  const items: Array<
    | { type: "folder"; id: string; name: string; order: number }
    | { type: "page"; page: PublishedDemoPage }
  > = [];

  const rootFolders = demoFolders
    .filter((f) => !f.parentId)
    .sort((a, b) => a.order - b.order);
  const rootPages = demoPages
    .filter((p) => !p.parentId)
    .sort((a, b) => a.order - b.order);

  let fi = 0;
  let pi = 0;
  while (fi < rootFolders.length || pi < rootPages.length) {
    const folder = rootFolders[fi];
    const page = rootPages[pi];
    if (folder && (!page || folder.order <= page.order)) {
      items.push({
        type: "folder",
        id: folder.id,
        name: folder.name,
        order: folder.order,
      });
      fi++;
    } else if (page) {
      items.push({ type: "page", page });
      pi++;
    }
  }

  return items;
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
                ? getThumbnailUrl(project.id)
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

function ProjectPreviewPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<PublishedProject | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getProjectData(projectId)
      .then(setProject)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [projectId]);

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

  const treeItems = buildTreeItems(project.demoPages, project.demoFolders);

  return (
    <div className="flex flex-col h-full">
      <Header name={project.name} onBack={() => router.push("/")} />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {treeItems.map((item) => {
            if (item.type === "folder") {
              const folderPages = project.demoPages.filter(
                (p) => p.parentId === item.id,
              );
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="text-sm font-medium mb-2">{item.name}</div>
                  <div className="space-y-1">
                    {folderPages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() =>
                          router.push(`/${projectId}/${page.id}`)
                        }
                        className="flex items-center gap-1.5 w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        <ChevronRight className="h-3 w-3 shrink-0" />
                        <span className="truncate">{page.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            const page = item.page;
            const compiledUrl = getCompiledJsUrl(
              projectId,
              page.compiledJsPath,
            );
            return (
              <button
                key={page.id}
                onClick={() => router.push(`/${projectId}/${page.id}`)}
                className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent text-left"
              >
                <div
                  className="relative w-full overflow-hidden"
                  style={{
                    aspectRatio: "375 / 812",
                    maxHeight: "300px",
                  }}
                >
                  <StaticPreviewPanel compiledJsUrl={compiledUrl} />
                </div>
                <div className="p-2">
                  <span className="truncate text-xs font-medium group-hover:text-accent-foreground">
                    {page.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DemoPreviewPage({
  projectId,
  demoId,
}: {
  projectId: string;
  demoId: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState<PublishedProject | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [configData, setConfigData] = useState<Record<string, unknown>>({});
  const [demoSchemas, setDemoSchemas] = useState<
    Array<{ demoId: string; demoName: string; schema: string }>
  >([]);

  useEffect(() => {
    getProjectData(projectId)
      .then(async (data) => {
        setProject(data);

        const schemas: Array<{
          demoId: string;
          demoName: string;
          schema: string;
        }> = [];

        const currentPage = data.demoPages.find((p) => p.id === demoId);
        if (currentPage?.schemaPath) {
          try {
            const schema = await getDemoSchema(
              projectId,
              currentPage.schemaPath,
            );
            schemas.push({
              demoId: currentPage.id,
              demoName: currentPage.name,
              schema: JSON.stringify(schema),
            });
          } catch {}
        }

        setDemoSchemas(schemas);

        const defaults: Record<string, unknown> = {};
        for (const s of schemas) {
          try {
            const parsed = JSON.parse(s.schema);
            if (parsed.properties) {
              for (const [key, prop] of Object.entries(
                parsed.properties as Record<string, Record<string, unknown>>,
              )) {
                if (prop.default !== undefined) {
                  defaults[key] = prop.default;
                }
              }
            }
          } catch {}
        }

        if (data.projectConfigSchema) {
          try {
            const parsed = JSON.parse(data.projectConfigSchema);
            if (parsed.properties) {
              for (const [key, prop] of Object.entries(
                parsed.properties as Record<string, Record<string, unknown>>,
              )) {
                if (prop.default !== undefined) {
                  defaults[key] = prop.default;
                }
              }
            }
          } catch {}
        }

        const saved = localStorage.getItem(`config:${projectId}:${demoId}`);
        if (saved) {
          try {
            setConfigData({ ...defaults, ...JSON.parse(saved) });
          } catch {
            setConfigData(defaults);
          }
        } else {
          setConfigData(defaults);
        }
      })
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [projectId, demoId]);

  const handleConfigChange = useCallback(
    (newData: Record<string, unknown>) => {
      setConfigData(newData);
      try {
        localStorage.setItem(
          `config:${projectId}:${demoId}`,
          JSON.stringify(newData),
        );
      } catch {}
    },
    [projectId, demoId],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header name="" onBack={() => router.push(`/${projectId}`)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col h-full">
        <Header name="" onBack={() => router.push(`/${projectId}`)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-destructive">
            加载失败：{error?.message || "项目不存在"}
          </div>
        </div>
      </div>
    );
  }

  const currentPage = project.demoPages.find((p) => p.id === demoId);
  if (!currentPage) {
    return (
      <div className="flex flex-col h-full">
        <Header name="" onBack={() => router.push(`/${projectId}`)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-destructive">页面不存在</div>
        </div>
      </div>
    );
  }

  const compiledUrl = getCompiledJsUrl(projectId, currentPage.compiledJsPath);
  const hasSchema =
    demoSchemas.length > 0 || !!project.projectConfigSchema;

  return (
    <div className="flex flex-col h-full">
      <Header
        name={currentPage.name}
        onBack={() => router.push(`/${projectId}`)}
        showConfigButton={hasSchema}
        configActive={showConfig}
        onToggleConfig={() => setShowConfig(!showConfig)}
      />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          <StaticPreviewPanel
            compiledJsUrl={compiledUrl}
            configData={configData}
          />
        </div>
        {showConfig && (
          <div className="w-72 border-l border-border shrink-0 overflow-hidden">
            <StaticConfigPanel
              projectConfigSchema={project.projectConfigSchema}
              demoSchemas={demoSchemas}
              configData={configData}
              onConfigChange={handleConfigChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Header({
  name,
  onBack,
  showConfigButton,
  configActive,
  onToggleConfig,
}: {
  name: string;
  onBack: () => void;
  showConfigButton?: boolean;
  configActive?: boolean;
  onToggleConfig?: () => void;
}) {
  return (
    <header className="flex items-center h-14 px-4 border-b border-border shrink-0 gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">返回</span>
      </button>
      {name && <h1 className="text-sm font-semibold">{name}</h1>}
      {showConfigButton && (
        <button
          onClick={onToggleConfig}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors ${
            configActive
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          配置
        </button>
      )}
    </header>
  );
}

export default function ViewerApp() {
  const pathname = usePathname();
  const { view, projectId, demoId } = parsePath(pathname);

  switch (view) {
    case "list":
      return <ProjectListPage />;
    case "project":
      return <ProjectPreviewPage projectId={projectId!} />;
    case "demo":
      return (
        <DemoPreviewPage projectId={projectId!} demoId={demoId!} />
      );
  }
}
