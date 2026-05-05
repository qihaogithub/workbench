"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Settings,
  FileText,
  LayoutGrid,
  AlertCircle,
} from "lucide-react";
import {
  getProject,
  getProjectConfig,
  getDemoPages,
  getEmbedIframeUrl,
  type DemoPageWithSchema,
} from "@/lib/api";
import {
  IframeRenderer,
  type IframeRendererHandle,
} from "@/components/iframe-renderer";
import { ConfigPanel } from "@/components/config-panel";
import { ViewerPreviewGrid } from "@/components/viewer-preview-grid";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ProjectDetailResponse,
  ProjectConfig,
} from "@opencode-workbench/shared";

type PreviewMode = "single" | "grid";

export default function ProjectPreviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { data: projectData, error: projectError } =
    useSWR<ProjectDetailResponse>(
      projectId ? `/api/projects/${projectId}` : null,
      () => getProject(projectId),
    );

  const { data: configData } = useSWR<ProjectConfig>(
    projectId ? `/api/projects/${projectId}/config` : null,
    () => getProjectConfig(projectId),
  );

  const { data: demoPagesData } = useSWR<{
    demoPages: DemoPageWithSchema[];
  }>(
    projectId ? `/api/projects/${projectId}/demos?includeSchema=true` : null,
    () => getDemoPages(projectId, { includeSchema: true }),
  );

  const project = projectData?.project;
  const demoPages = demoPagesData?.demoPages || [];
  const hasMultiplePages = demoPages.length > 1;
  const projectSchema = configData?.exists ? configData.schema : undefined;

  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("single");
  const [gridColumns, setGridColumns] = useState<2 | 3 | 4>(2);
  const [configVisible, setConfigVisible] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<IframeRendererHandle>(null);

  useEffect(() => {
    if (demoPages.length > 0 && !activeDemoId) {
      setActiveDemoId(demoPages[0].id);
    }
  }, [demoPages, activeDemoId]);

  const activePage = demoPages.find((p) => p.id === activeDemoId);
  const activePageSchema = activePage?.schema;
  const activePreviewSize = activePage?.previewSize;

  const isMultiPage = demoPages.length > 0;
  const iframeSrc = activeDemoId
    ? getEmbedIframeUrl(projectId, isMultiPage ? activeDemoId : undefined)
    : isMultiPage
      ? undefined
      : getEmbedIframeUrl(projectId);

  const handleConfigChange = useCallback(
    (configData: Record<string, unknown>) => {
      iframeRef.current?.sendConfig(configData);
    },
    [],
  );

  const handleDemoPageChange = useCallback((demoId: string) => {
    setActiveDemoId(demoId);
    setIframeKey((prev) => prev + 1);
  }, []);

  const handleGridCardClick = useCallback((pageId: string) => {
    setActiveDemoId(pageId);
    setPreviewMode("single");
    setIframeKey((prev) => prev + 1);
  }, []);

  if (projectError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <p className="text-destructive">加载项目失败</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {projectError.message}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-primary hover:underline"
          >
            返回列表
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 items-center border-b border-border px-4 shrink-0 gap-3">
        <Link
          href="/"
          className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-semibold">{project.name}</h1>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPreviewMode("single")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
              previewMode === "single"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            单页
          </button>
          <button
            onClick={() => setPreviewMode("grid")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
              previewMode === "grid"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            宫格
          </button>
        </div>

        {previewMode === "single" && hasMultiplePages && (
          <Select value={activeDemoId || undefined} onValueChange={handleDemoPageChange}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="选择页面" />
            </SelectTrigger>
            <SelectContent>
              {demoPages.map((page) => (
                <SelectItem key={page.id} value={page.id}>
                  {page.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {previewMode === "grid" && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">每行</span>
            <Select
              value={String(gridColumns)}
              onValueChange={(v) => setGridColumns(Number(v) as 2 | 3 | 4)}
            >
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setConfigVisible(!configVisible)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
            configVisible
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          配置
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {previewMode === "single" ? (
            iframeSrc ? (
              <IframeRenderer
                key={iframeKey}
                ref={iframeRef}
                src={iframeSrc}
                previewSize={activePreviewSize}
                onLoaded={() => {}}
                onError={(err) => console.error("预览错误:", err)}
                className="h-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-muted-foreground">请选择页面</div>
              </div>
            )
          ) : demoPages.length > 0 ? (
            <ViewerPreviewGrid
              projectId={projectId}
              demoPages={demoPages}
              activePageId={activeDemoId || demoPages[0].id}
              gridColumns={gridColumns}
              onCardClick={handleGridCardClick}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-muted-foreground">暂无页面</div>
            </div>
          )}
        </div>

        {configVisible && (
          <div className="w-80 border-l border-border shrink-0 flex flex-col">
            <div className="flex h-10 items-center border-b border-border px-4 shrink-0">
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">配置面板</span>
            </div>
            <ConfigPanel
              schema={projectSchema}
              pageSchema={activePageSchema}
              onChange={handleConfigChange}
              className="flex-1"
            />
          </div>
        )}
      </div>
    </div>
  );
}
