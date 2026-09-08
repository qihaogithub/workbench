"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  SinglePagePreview,
  ConfigForm,
  ConfigScopeWrapper,
  isSchemaEmpty,
  filterConfigValuesByType,
} from "../../../../../components/demo";
import type {
  CanvasPageRuntimeType,
  PreviewSize,
  PreviewStagePage,
} from "../../../../../components/demo";
import { mergeConfigToProps } from "@/lib/runtime-props";
import { getDefaultValues } from "../../../../../lib/validator";
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
import { resolveVisibility } from "@workbench/shared";

interface ViewerDemoPage {
  id: string;
  name: string;
  routeKey?: string;
  order: number;
  parentId: string | null;
  regionIds?: string[];
  code: string;
  schema?: string;
  previewSize?: PreviewSize;
  runtimeType?: CanvasPageRuntimeType;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: Record<string, unknown>;
  sketchScene?: Record<string, unknown>;
  sketchMeta?: Record<string, unknown>;
}

interface ViewerData {
  project: { id: string; name: string; description?: string } | null;
  demoPages: ViewerDemoPage[];
  projectConfigSchema?: string;
  projectConfigValues?: Record<string, unknown>;
  visibilityRules?: unknown;
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
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [visibilityNotice, setVisibilityNotice] = useState<string | null>(null);
  const [visibilitySessionOverrides, setVisibilitySessionOverrides] = useState<Record<string, unknown>>({});
  const [visibilityRuntimeRole, setVisibilityRuntimeRole] = useState("guest");

  const urlConfigDataRef = useRef<Record<string, unknown> | null>(null);
  if (urlConfigDataRef.current === null) {
    urlConfigDataRef.current = parseConfigDataParam(configDataParam);
  }

  const visibilityResolution = useMemo(() => {
    if (!data) return null;
    return resolveVisibility({
      rules: data.visibilityRules,
      projectConfigValues: data.projectConfigValues,
      projectSchema: data.projectConfigSchema,
      pageIds: data.demoPages.map((page) => page.id),
      regionIds: Object.fromEntries(
        data.demoPages.map((page) => [page.id, page.regionIds ?? []]),
      ),
    }, {
      values: visibilitySessionOverrides,
      fieldKeys: Object.keys(visibilitySessionOverrides),
      allowPageTargets: false,
    }, { roles: [visibilityRuntimeRole] });
  }, [data, visibilityRuntimeRole, visibilitySessionOverrides]);

  const visiblePages = useMemo(() => {
    if (!data) return [];
    if (!visibilityResolution?.valid) return data.demoPages;
    return data.demoPages.filter(
      (page) => visibilityResolution.pages[page.id]?.visible !== false,
    );
  }, [data, visibilityResolution]);
  const visibleProjectConfigSchema = useMemo(
    () => data?.projectConfigSchema,
    [data?.projectConfigSchema],
  );

  const getSafeMergedDefaults = useCallback(
    (
      projectSchema: string | undefined,
      pageSchema: string,
      projectValues?: Record<string, unknown>,
    ) => {
      try {
        const defaults = projectSchema
          ? mergeConfigToProps(projectSchema, pageSchema)
          : getDefaultValues(pageSchema);
        return { ...defaults, ...projectValues };
      } catch {
        return { ...getDefaultValues(pageSchema), ...projectValues };
      }
    },
    []
  );

  useEffect(() => {
    applyTheme(themeParam);
  }, [themeParam]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [res, authResult] = await Promise.all([
          fetch(`/api/viewer/${projectId}/data`),
          fetch("/api/auth/me", { cache: "no-store" })
            .then((response) => response.ok ? response.json() : null)
            .catch(() => null),
        ]);
        const result = await res.json();
        if (!result.success) {
          setError(result.error?.message || "加载失败");
          return;
        }
        const runtimeRole = typeof authResult?.data?.role === "string"
          ? authResult.data.role
          : "guest";
        setVisibilityRuntimeRole(runtimeRole);
        setData(result.data);

        const pages = result.data.demoPages as ViewerDemoPage[];
        const pageByRoute = routeParam
          ? pages.find((p: ViewerDemoPage) => p.routeKey === routeParam)
          : undefined;
        const requestedPage = pageByRoute ?? pages.find(
          (p: ViewerDemoPage) => p.id === demoId
        );
        const resolution = resolveVisibility({
          rules: result.data.visibilityRules,
          projectConfigValues: result.data.projectConfigValues,
          projectSchema: result.data.projectConfigSchema,
          pageIds: pages.map((item) => item.id),
          regionIds: Object.fromEntries(pages.map((item) => [item.id, item.regionIds ?? []])),
        }, undefined, { roles: [runtimeRole] });
        const requestedState = requestedPage && resolution.valid
          ? resolution.pages[requestedPage.id]
          : undefined;
        const requestedAvailable = !requestedState
          || (requestedState.visible !== false && requestedState.enabled !== false);
        const fallbackPage = requestedState?.fallbackPageId
          ? pages.find((item) => item.id === requestedState.fallbackPageId
            && resolution.pages[item.id]?.visible !== false
            && resolution.pages[item.id]?.enabled !== false)
          : undefined;
        const page = requestedPage && !requestedAvailable
          ? fallbackPage ?? pages.find((item) => {
              const state = resolution.valid ? resolution.pages[item.id] : undefined;
              return !state || (state.visible !== false && state.enabled !== false);
            })
          : requestedPage;
        if (requestedPage && page?.id !== requestedPage.id) {
          setVisibilityNotice(requestedState?.message ?? `页面「${requestedPage.name}」当前${requestedState?.visible === false ? "不可见" : "不可用"}，${fallbackPage ? `已按规则切换到备用页面「${fallbackPage.name}」。` : "已切换到可用页面。"}`);
        }
        if (page) {
          setActiveDemoId(page.id);
        }
        if (result.data.appGraph?.state) {
          setAppState(result.data.appGraph.state);
        }
        if (page?.schema) {
          const defaults = getSafeMergedDefaults(
            result.data.projectConfigSchema,
            page.schema,
            result.data.projectConfigValues,
          );
          const urlConfig = urlConfigDataRef.current;
          const sessionUrlConfig = urlConfig ? { ...urlConfig } : undefined;
          const merged = sessionUrlConfig ? { ...defaults, ...sessionUrlConfig } : defaults;
          setConfigData(merged);
          setVisibilitySessionOverrides(
            filterConfigValuesByType(
              result.data.projectConfigSchema,
              filterConfigValuesByType(page.schema, sessionUrlConfig ?? {}, "business"),
              "business",
            ),
          );
        } else if (urlConfigDataRef.current) {
          setConfigData({ ...urlConfigDataRef.current });
          setVisibilitySessionOverrides(
            filterConfigValuesByType(
              result.data.projectConfigSchema,
              urlConfigDataRef.current,
              "business",
            ),
          );
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
          const pageSchema = data?.demoPages.find((page) => page.id === activeDemoId)?.schema;
          const sessionConfigData = { ...msg.configData };
          const visibilityValues = filterConfigValuesByType(
            data?.projectConfigSchema,
            filterConfigValuesByType(pageSchema, sessionConfigData, "business"),
            "business",
          );
          setConfigData((prev) => ({ ...prev, ...sessionConfigData }));
          setVisibilitySessionOverrides((prev) => ({ ...prev, ...visibilityValues }));
        }
      } else if (msg.type === "VIEWER_SET_PAGE") {
        if (typeof msg.pageId === "string") {
          handlePageSwitchRef.current(msg.pageId);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activeDemoId, data]);

  const handleConfigChange = useCallback((newData: Record<string, unknown>) => {
    const pageSchema = data?.demoPages.find((page) => page.id === activeDemoId)?.schema;
    const sessionData = { ...newData };
    const visibilityValues = filterConfigValuesByType(
      data?.projectConfigSchema,
      filterConfigValuesByType(pageSchema, sessionData, "business"),
      "business",
    );
    setConfigData((prev) => {
      const merged = { ...prev, ...sessionData };
      postOutgoing({ type: "VIEWER_CONFIG_CHANGE", configData: merged });
      return merged;
    });
    setVisibilitySessionOverrides((prev) => ({ ...prev, ...visibilityValues }));
  }, [activeDemoId, data]);

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
    const state = visibilityResolution?.valid
      ? visibilityResolution.pages[pageId]
      : undefined;
    if (state?.visible === false || state?.enabled === false) {
      setVisibilityNotice(
        state.message ?? `页面「${page.name}」当前${state.visible === false ? "不可见" : "不可用"}。`,
      );
      return;
    }
    setActiveDemoId(pageId);
    syncBrowserUrl(page);
    postOutgoing({ type: "VIEWER_PAGE_CHANGE", pageId });
    if (page?.schema) {
      const defaults = getSafeMergedDefaults(
        data.projectConfigSchema,
        page.schema,
        data.projectConfigValues,
      );
      setConfigData(defaults);
    }
  }, [data, getSafeMergedDefaults, syncBrowserUrl, visibilityResolution]);

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

  const availablePages = visibilityResolution?.valid
    ? visiblePages.filter((page) => visibilityResolution.pages[page.id]?.enabled !== false)
    : visiblePages;
  if (visibilityResolution?.valid && availablePages.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-6 text-center">
        <p className="max-w-lg text-muted-foreground">
          当前配置与身份下没有可用页面，请联系创作者调整页面状态规则。
        </p>
      </div>
    );
  }

  const currentPage = availablePages.find((p) => p.id === activeDemoId) ?? availablePages[0];
  const currentPageSchema = currentPage?.schema
    ? currentPage.schema
    : undefined;
  let previewStagePage: PreviewStagePage | undefined;
  if (currentPage) {
    const runtimeType = currentPage.runtimeType ?? "high-fidelity-react";
    const runtimeData =
      runtimeType === "prototype-html-css"
        ? {
            prototypeHtml: currentPage.prototypeHtml,
            prototypeCss: currentPage.prototypeCss,
            prototypeMeta: currentPage.prototypeMeta,
          }
        : runtimeType === "sketch-scene"
          ? {
              sketchScene: currentPage.sketchScene
                ? JSON.stringify(currentPage.sketchScene)
                : undefined,
              sketchMeta: currentPage.sketchMeta,
            }
          : { code: currentPage.code };
    previewStagePage = {
      id: currentPage.id,
      name: currentPage.name,
      order: currentPage.order,
      runtimeType,
      ...runtimeData,
      configData,
      schema: currentPage.schema,
      previewSize: currentPage.previewSize,
      visibilityStatus: visibilityResolution?.pages[currentPage.id]
        ? {
            visible: visibilityResolution.pages[currentPage.id].visible,
            enabled: visibilityResolution.pages[currentPage.id].enabled,
            unavailable: visibilityResolution.pages[currentPage.id].unavailable,
            message: visibilityResolution.pages[currentPage.id].message,
            fallbackPageId: visibilityResolution.pages[currentPage.id].fallbackPageId,
            fallbackMessage: visibilityResolution.pages[currentPage.id].fallbackMessage,
            alternativeRegion: visibilityResolution.pages[currentPage.id].alternativeRegion,
            reasons: visibilityResolution.pages[currentPage.id].reasons,
          }
        : undefined,
      visibilityRegions: Object.fromEntries(
        Object.entries(visibilityResolution?.regions ?? {})
          .filter(([key]) => key.startsWith(`${currentPage.id}:`))
          .map(([key, state]) => [key, { visible: state.visible, enabled: state.enabled }]),
      ),
    };
  }

  const hasProjectConfig = !isSchemaEmpty(visibleProjectConfigSchema);
  const hasPageConfig = !isSchemaEmpty(currentPageSchema);
  const showProjectConfig = hasProjectConfig;
  const showPageConfig = hasPageConfig;
  const hasBothScopes = showProjectConfig && showPageConfig;
  const hasAnyConfig = showProjectConfig || showPageConfig;

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex flex-1 overflow-hidden">
        {visibilityNotice && (
          <div className="absolute left-0 right-0 top-0 z-20 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {visibilityNotice}
          </div>
        )}
        {showPageList && visiblePages.length > 0 && (
          <div className="w-48 border-r shrink-0 flex flex-col">
            <div className="px-3 py-3 border-b">
              <h2 className="text-xs font-medium text-muted-foreground">页面目录</h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {visiblePages.map((page) => (
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
          <SinglePagePreview
            page={previewStagePage}
            rendererProps={{
              highFidelity: {
                appState,
                routeParams,
                onAppAction: handleAppAction,
              },
            }}
          />
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
                          schema={visibleProjectConfigSchema!}
                          onChange={handleConfigChange}
                          initialData={configData}
                          sessionId={sessionId}
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
