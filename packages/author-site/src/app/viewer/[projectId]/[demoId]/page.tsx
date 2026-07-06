"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PreviewPanel, ConfigForm, ConfigScopeWrapper, isSchemaEmpty } from "../../../../../components/demo";
import type { PreviewSize } from "../../../../../components/demo";
import { mergeConfigToProps } from "@/lib/runtime-props";
import { getDefaultValues, getPreviewSize } from "../../../../../lib/validator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, Loader2 } from "lucide-react";
import type {
  AppGraph,
  AppGraphValidationResult,
} from "@workbench/shared";
import type { AppActionPayload } from "@workbench/demo-ui";
import {
  isViewerAppActionResolution,
  resolveViewerAppAction,
} from "@/lib/viewer-app-graph-runtime";

interface ViewerDemoPage {
  id: string;
  name: string;
  routeKey?: string;
  order: number;
  parentId: string | null;
  code: string;
  schema?: string;
  previewSize?: PreviewSize;
}

interface ViewerData {
  project: { id: string; name: string; description?: string } | null;
  demoPages: ViewerDemoPage[];
  projectConfigSchema?: string;
  appGraph?: AppGraph;
  appGraphValidation?: AppGraphValidationResult;
}

type ViewerIncomingMessage =
  | { type: "VIEWER_SET_CONFIG"; configData: Record<string, unknown> }
  | { type: "VIEWER_SET_PAGE"; pageId: string };

type ViewerOutgoingMessage =
  | { type: "VIEWER_READY" }
  | { type: "VIEWER_CONFIG_CHANGE"; configData: Record<string, unknown> }
  | { type: "VIEWER_PAGE_CHANGE"; pageId: string };

function postOutgoing(msg: ViewerOutgoingMessage) {
  window.parent.postMessage(msg, "*");
}

function parseConfigDataParam(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return null;
}

function applyTheme(theme: string | null) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.remove("dark");
  } else if (theme === "dark") {
    root.classList.add("dark");
  }
}

export default function ViewerDemoPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const demoId = params.demoId as string;
  const searchParams = useSearchParams();

  const configParam = searchParams.get("config");
  const configWidthParam = searchParams.get("configWidth");
  const toolbarParam = searchParams.get("toolbar");
  const themeParam = searchParams.get("theme");
  const backgroundParam = searchParams.get("background");
  const configDataParam = searchParams.get("configData");
  const pageListParam = searchParams.get("pageList");
  const routeParam = searchParams.get("route") || searchParams.get("routeKey");

  const showConfig = configParam !== "false";
  const configWidth = configWidthParam ? parseInt(configWidthParam, 10) : 320;
  const showToolbar = toolbarParam !== "false";
  const showPageList = pageListParam === "true";
  const previewBackground = backgroundParam || "#fff";

  const [data, setData] = useState<ViewerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configVisible, setConfigVisible] = useState(showConfig);
  const [activeDemoId, setActiveDemoId] = useState(demoId);
  const [configData, setConfigData] = useState<Record<string, unknown>>({});
  const [appState, setAppState] = useState<Record<string, unknown>>({});
  const [routeParams, setRouteParams] = useState<Record<string, unknown>>({});
  const [previewSize, setPreviewSize] = useState<PreviewSize | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>();

  const urlConfigDataRef = useRef<Record<string, unknown> | null>(null);
  if (urlConfigDataRef.current === null) {
    urlConfigDataRef.current = parseConfigDataParam(configDataParam);
  }

  const getSafeMergedDefaults = useCallback(
    (projectSchema: string | undefined, pageSchema: string) => {
      try {
        if (projectSchema) {
          return mergeConfigToProps(projectSchema, pageSchema);
        }
        return getDefaultValues(pageSchema);
      } catch {
        return getDefaultValues(pageSchema);
      }
    },
    []
  );

  useEffect(() => {
    applyTheme(themeParam);
  }, [themeParam]);

  useEffect(() => {
    setActiveDemoId(demoId);
  }, [demoId]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/viewer/${projectId}/data`);
        const result = await res.json();
        if (!result.success) {
          setError(result.error?.message || "加载失败");
          return;
        }
        setData(result.data);

        const pages = result.data.demoPages as ViewerDemoPage[];
        const pageByRoute = routeParam
          ? pages.find((p: ViewerDemoPage) => p.routeKey === routeParam)
          : undefined;
        const page = pageByRoute ?? pages.find(
          (p: ViewerDemoPage) => p.id === demoId
        );
        if (page) {
          setActiveDemoId(page.id);
        }
        if (result.data.appGraph?.state) {
          setAppState(result.data.appGraph.state);
        }
        if (page?.schema) {
          const defaults = getSafeMergedDefaults(
            result.data.projectConfigSchema,
            page.schema
          );
          const urlConfig = urlConfigDataRef.current;
          const merged = urlConfig ? { ...defaults, ...urlConfig } : defaults;
          setConfigData(merged);
          setPreviewSize(getPreviewSize(page.schema));
        } else if (urlConfigDataRef.current) {
          setConfigData(urlConfigDataRef.current);
        }

        // 创建 session 以支持图片上传
        try {
          const sessionRes = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ demoId }),
          });
          const sessionData = await sessionRes.json();
          if (sessionData?.data?.sessionId) {
            setSessionId(sessionData.data.sessionId);
          }
        } catch {
          // 静默失败，不影响配置面板其他功能
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [projectId, demoId, routeParam, getSafeMergedDefaults]);

  const isReadyRef = useRef(false);
  useEffect(() => {
    if (!isLoading && !error && data && !isReadyRef.current) {
      isReadyRef.current = true;
      postOutgoing({ type: "VIEWER_READY" });
    }
  }, [isLoading, error, data]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ViewerIncomingMessage;
      if (!msg || typeof msg !== "object" || !msg.type) return;

      if (msg.type === "VIEWER_SET_CONFIG") {
        if (msg.configData && typeof msg.configData === "object") {
          setConfigData((prev) => ({ ...prev, ...msg.configData }));
        }
      } else if (msg.type === "VIEWER_SET_PAGE") {
        if (typeof msg.pageId === "string") {
          handlePageSwitchRef.current(msg.pageId);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleConfigChange = useCallback((newData: Record<string, unknown>) => {
    setConfigData((prev) => {
      const merged = { ...prev, ...newData };
      postOutgoing({ type: "VIEWER_CONFIG_CHANGE", configData: merged });
      return merged;
    });
  }, []);

  const syncBrowserUrl = useCallback((page: ViewerDemoPage) => {
    const query = new URLSearchParams(window.location.search);
    if (page.routeKey) {
      query.set("route", page.routeKey);
    }
    const search = query.toString();
    window.history.replaceState(
      null,
      "",
      `/viewer/${projectId}/${page.id}${search ? `?${search}` : ""}`,
    );
  }, [projectId]);

  const handlePageSwitch = useCallback((pageId: string) => {
    if (!data) return;
    const page = data.demoPages.find((p) => p.id === pageId);
    if (!page) return;
    setActiveDemoId(pageId);
    syncBrowserUrl(page);
    postOutgoing({ type: "VIEWER_PAGE_CHANGE", pageId });
    if (page?.schema) {
      const defaults = getSafeMergedDefaults(data.projectConfigSchema, page.schema);
      setConfigData(defaults);
      setPreviewSize(getPreviewSize(page.schema));
    }
  }, [data, getSafeMergedDefaults, syncBrowserUrl]);

  const handleAppAction = useCallback((message: AppActionPayload & { pageId?: string }) => {
    if (!data?.appGraph) return;

    const result = resolveViewerAppAction({
      appGraph: data.appGraph,
      pages: data.demoPages,
      message,
      previousState: appState,
    });

    if (!isViewerAppActionResolution(result)) {
      if (result.error === "ACTION_MISSING" && result.routeKey) {
        console.warn(`[viewer] 未声明的页面动作: ${result.routeKey}.${result.event}`);
      } else if (result.error === "TARGET_MISSING" && result.routeKey) {
        console.warn(`[viewer] 动作目标页面不存在: ${result.routeKey}`);
      }
      return;
    }

    setAppState(result.nextState);
    setRouteParams(result.routeParams);
    if (result.targetPageId) {
      handlePageSwitch(result.targetPageId);
    }
  }, [appState, data, handlePageSwitch]);

  const handlePageSwitchRef = useRef(handlePageSwitch);
  handlePageSwitchRef.current = handlePageSwitch;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <p className="text-destructive">{error || "项目不存在"}</p>
        </div>
      </div>
    );
  }

  const currentPage = data.demoPages.find((p) => p.id === activeDemoId);
  const currentPageSchema = currentPage?.schema;

  const hasProjectConfig = !isSchemaEmpty(data.projectConfigSchema);
  const hasPageConfig = !isSchemaEmpty(currentPageSchema);
  const showProjectConfig = hasProjectConfig;
  const showPageConfig = hasPageConfig;
  const hasBothScopes = showProjectConfig && showPageConfig;
  const hasAnyConfig = showProjectConfig || showPageConfig;

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex flex-1 overflow-hidden">
        {showPageList && data.demoPages.length > 0 && (
          <div className="w-48 border-r shrink-0 flex flex-col">
            <div className="px-3 py-3 border-b">
              <h2 className="text-xs font-medium text-muted-foreground">页面目录</h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {data.demoPages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => handlePageSwitch(page.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      page.id === activeDemoId
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    {page.name}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex-1 overflow-hidden relative" style={{ backgroundColor: previewBackground }}>
          {/* 悬浮配置按钮 */}
          {showConfig && (
            <button
              onClick={() => setConfigVisible(!configVisible)}
              className={`absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-background/90 border shadow-sm transition-colors ${
                configVisible
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
          <div
            className="p-4 h-full overflow-y-auto preview-single-scroll"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <style>{`
              .preview-single-scroll::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {currentPage && (
              <PreviewPanel
                code={currentPage.code}
                demoId={currentPage.id}
                configData={configData}
                appState={appState}
                routeParams={routeParams}
                previewSize={previewSize}
                onAppAction={handleAppAction}
              />
            )}
          </div>
        </div>

        {configVisible && showConfig && (
          <div
            className="border-l shrink-0 flex flex-col"
            style={{ width: configWidth }}
          >
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-medium">配置面板</h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 flex flex-col">
                {hasAnyConfig && (
                  <>
                    {showProjectConfig && (
                      <ConfigScopeWrapper scope="project" hideHeader={!hasBothScopes}>
                        <ConfigForm
                          key={`project-${data.projectConfigSchema}`}
                          schema={data.projectConfigSchema!}
                          onChange={handleConfigChange}
                          initialData={configData}
                          sessionId={sessionId}
                          readonly
                        />
                      </ConfigScopeWrapper>
                    )}

                    {showProjectConfig && showPageConfig && (
                      <div className="h-[2px] bg-border my-3" />
                    )}

                    {showPageConfig && (
                      <ConfigScopeWrapper scope="page" pageName={currentPage?.name} hideHeader={!hasBothScopes}>
                        <ConfigForm
                          key={`page-${activeDemoId}`}
                          schema={currentPageSchema!}
                          onChange={handleConfigChange}
                          initialData={configData}
                          sessionId={sessionId}
                          readonly
                        />
                      </ConfigScopeWrapper>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
