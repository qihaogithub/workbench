"use client";

import { useState, useCallback, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Settings, AlertCircle } from "lucide-react";
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
import type { ProjectDetailResponse, ProjectConfig } from "@opencode-workbench/shared";

export default function DemoPreviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const demoId = params.demoId as string;

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

  const projectSchema = configData?.exists ? configData.schema : undefined;
  const currentPage = demoPagesData?.demoPages.find((p) => p.id === demoId);
  const currentPageSchema = currentPage?.schema;
  const currentPreviewSize = currentPage?.previewSize;

  const [configVisible, setConfigVisible] = useState(true);
  const iframeRef = useRef<IframeRendererHandle>(null);

  const isMultiPage =
    (demoPagesData?.demoPages?.length || 0) > 0;
  const iframeSrc = isMultiPage
    ? getEmbedIframeUrl(projectId, demoId)
    : getEmbedIframeUrl(projectId);

  const handleConfigChange = useCallback(
    (configData: Record<string, unknown>) => {
      iframeRef.current?.sendConfig(configData);
    },
    [],
  );

  if (projectError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <p className="text-destructive">加载项目失败</p>
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

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 items-center border-b border-border px-4 shrink-0 gap-3">
        <Link
          href={`/${projectId}`}
          className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-semibold">
          {projectData?.project?.name || "加载中..."}
        </h1>

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
          <IframeRenderer
            ref={iframeRef}
            src={iframeSrc}
            previewSize={currentPreviewSize}
            onLoaded={() => {}}
            onError={(err) => console.error("预览错误:", err)}
            className="h-full"
          />
        </div>

        {configVisible && (
          <div className="w-80 border-l border-border shrink-0 flex flex-col">
            <div className="flex h-10 items-center border-b border-border px-4 shrink-0">
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">配置面板</span>
            </div>
            <ConfigPanel
              schema={projectSchema}
              pageSchema={currentPageSchema}
              onChange={handleConfigChange}
              className="flex-1"
            />
          </div>
        )}
      </div>
    </div>
  );
}
