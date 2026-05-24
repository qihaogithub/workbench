"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import Image from "next/image";
import Link from "next/link";
import { Search, SlidersHorizontal, FileCode, X, Check } from "lucide-react";
import { getProjects, getThumbnailUrl } from "@/lib/api";
import type { ProjectListResponse } from "@opencode-workbench/shared";

const fetcher = () => getProjects();

type SortOption = "newest" | "oldest" | "name";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "最新更新" },
  { value: "oldest", label: "最早更新" },
  { value: "name", label: "名称" },
];

export default function ProjectListPage() {
  const { data, error, isLoading } = useSWR<ProjectListResponse>(
    "/api/projects",
    fetcher
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

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
          (p.description && p.description.toLowerCase().includes(query))
      );
    }

    switch (sortBy) {
      case "newest":
        projects.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      case "oldest":
        projects.sort((a, b) => a.updatedAt - b.updatedAt);
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
              {searchQuery ? "未找到匹配的项目" : "暂无项目"}
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
              const thumbnailUrl = getThumbnailUrl(project.thumbnail);
              return (
                <Link
                  key={project.id}
                  href={`/${project.id}`}
                  className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent"
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
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
