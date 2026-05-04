"use client";

import useSWR from "swr";
import Link from "next/link";
import { FolderOpen, FileCode, Clock } from "lucide-react";
import { getProjects } from "@/lib/api";
import type { ProjectListResponse } from "@opencode-workbench/shared";

const fetcher = () => getProjects();

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function ProjectListPage() {
  const { data, error, isLoading } = useSWR<ProjectListResponse>(
    "/api/projects",
    fetcher
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center px-6">
          <FolderOpen className="mr-2 h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">OpenCode 组件预览</h1>
        </div>
      </header>

      <main className="container px-6 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">加载中...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-20">
            <div className="text-destructive">
              加载失败：{error.message}
            </div>
          </div>
        )}

        {data && data.projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <FileCode className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">暂无项目</p>
          </div>
        )}

        {data && data.projects.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.projects.map((project) => (
              <Link
                key={project.id}
                href={`/${project.id}`}
                className="group rounded-lg border border-border bg-card p-5 transition-colors hover:bg-accent"
              >
                <h2 className="mb-2 text-base font-medium group-hover:text-accent-foreground">
                  {project.name}
                </h2>
                {project.description && (
                  <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                    {project.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {project.demoCount !== undefined && (
                    <span className="flex items-center gap-1">
                      <FileCode className="h-3.5 w-3.5" />
                      {project.demoCount} 页面
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(project.updatedAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
