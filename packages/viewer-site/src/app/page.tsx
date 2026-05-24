"use client";

import useSWR from "swr";
import Image from "next/image";
import Link from "next/link";
import { FolderOpen, FileCode } from "lucide-react";
import { getProjects, getThumbnailUrl } from "@/lib/api";
import type { ProjectListResponse } from "@opencode-workbench/shared";

const fetcher = () => getProjects();

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

      <main className="container px-6 pt-8 pb-4">
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
            {data.projects.map((project) => {
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
