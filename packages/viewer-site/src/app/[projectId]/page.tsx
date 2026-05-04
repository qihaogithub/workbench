"use client";

import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Settings, FileCode, AlertCircle } from "lucide-react";
import { getProject, getProjectConfig, getEmbedIframeUrl } from "@/lib/api";
import { IframeRenderer } from "@/components/iframe-renderer";
import { ConfigPanel } from "@/components/config-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ProjectDetailResponse, ProjectConfig } from "@opencode-workbench/shared";

export default function ProjectPreviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { data: projectData, error: projectError } =
    useSWR<ProjectDetailResponse>(
      projectId ? `/api/projects/${projectId}` : null,
      () => getProject(projectId)
    );

  const { data: configData } = useSWR<ProjectConfig>(
    projectId ? `/api/projects/${projectId}/config` : null,
    () => getProjectConfig(projectId)
  );

  const project = projectData?.project;
  const demoPages = project?.demoPages || [];
  const hasMultiplePages = demoPages.length > 1;
  const hasConfig = configData?.exists && !!configData?.schema;

  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const [configVisible, setConfigVisible] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (demoPages.length > 0 && !activeDemoId) {
      setActiveDemoId(demoPages[0].id);
    }
  }, [demoPages, activeDemoId]);

  const isMultiPage = demoPages.length > 0;
  const iframeSrc = activeDemoId
    ? getEmbedIframeUrl(projectId, isMultiPage ? activeDemoId : undefined)
    : isMultiPage
    ? undefined
    : getEmbedIframeUrl(projectId);

  const handleConfigChange = useCallback(
    (configData: Record<string, unknown>) => {
      const iframe = document.querySelector(
        "iframe"
      ) as HTMLIFrameElement | null;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: "UPDATE_CONFIG", configData },
          "*"
        );
      }
    },
    []
  );

  const handleDemoPageChange = useCallback((demoId: string) => {
    setActiveDemoId(demoId);
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
      <header className="flex h-14 items-center border-b border-border px-4 shrink-0">
        <Link
          href="/"
          className="mr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-semibold mr-4">{project.name}</h1>

        {hasMultiplePages && (
          <Tabs
            value={activeDemoId || undefined}
            onValueChange={handleDemoPageChange}
          >
            <TabsList className="h-8">
              {demoPages.map((page) => (
                <TabsTrigger key={page.id} value={page.id} className="h-6 text-xs">
                  {page.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {hasConfig && (
          <button
            onClick={() => setConfigVisible(!configVisible)}
            className={`ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
              configVisible
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            配置
          </button>
        )}

        {!hasMultiplePages && !hasConfig && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileCode className="h-3.5 w-3.5" />
            单页面项目
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          {iframeSrc ? (
            <IframeRenderer
              key={iframeKey}
              src={iframeSrc}
              onLoaded={() => {}}
              onError={(err) => console.error("预览错误:", err)}
              className="rounded-lg"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-muted-foreground">请选择页面</div>
            </div>
          )}
        </div>

        {configVisible && hasConfig && configData?.schema && (
          <div className="w-80 border-l border-border shrink-0">
            <div className="flex h-10 items-center border-b border-border px-4">
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">配置面板</span>
            </div>
            <ConfigPanel
              schema={configData.schema}
              onChange={handleConfigChange}
              className="h-[calc(100%-2.5rem)]"
            />
          </div>
        )}
      </div>
    </div>
  );
}
