"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  PreviewStage,
  PageConfigPanel,
  PreviewModeSwitcher,
  isSchemaEmpty,
  filterConfigValuesByType,
} from "../../../../components/demo";
import type {
  PreviewMode,
  PreviewSize,
  CanvasState,
  CanvasPageRuntimeType,
  PreviewStagePage,
} from "../../../../components/demo";
import { mergeConfigToProps } from "@/lib/runtime-props";
import { resolveVisibility } from "@workbench/shared";
import { getDefaultValues } from "../../../../lib/validator";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Loader2,
} from "lucide-react";

interface ViewerDemoPage {
  id: string;
  name: string;
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
  requirements?: string;
}

interface ViewerData {
  project: { id: string; name: string; description?: string } | null;
  demoPages: ViewerDemoPage[];
  projectConfigSchema?: string;
  projectConfigValues?: Record<string, unknown>;
  visibilityRules?: unknown;
  canvasState?: CanvasState;
}

type ViewerIncomingMessage =
  | { type: "VIEWER_SET_CONFIG"; configData: Record<string, unknown> }
  | { type: "VIEWER_SET_MODE"; mode: PreviewMode }
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

export default function ViewerProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const searchParams = useSearchParams();

  const modeParam = searchParams.get("mode") as PreviewMode | null;
  const configParam = searchParams.get("config");
  const configWidthParam = searchParams.get("configWidth");
  const pagesParam = searchParams.get("pages");
  const toolbarParam = searchParams.get("toolbar");
  const modeSwitchParam = searchParams.get("modeSwitch");
  const pageParam = searchParams.get("page");
  const themeParam = searchParams.get("theme");
  const backgroundParam = searchParams.get("background");
  const configDataParam = searchParams.get("configData");
  const pageListParam = searchParams.get("pageList");
  const canvasConfigParam = searchParams.get("canvasConfig");

  const showConfig = configParam !== "false";
  const configWidth = configWidthParam ? parseInt(configWidthParam, 10) : 320;
  const showPages = pagesParam !== "false";
  const showToolbar = toolbarParam !== "false";
  const showModeSwitch = modeSwitchParam !== "false";
  const showPageList = pageListParam === "true";
  const previewBackground = backgroundParam || "#fff";
  // 画布模式配置面板显隐模式：always（常驻，默认）| onclick（按需显示）
  const canvasConfigMode = canvasConfigParam === "onclick" ? "onclick" : "always";

  const [data, setData] = useState<ViewerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeDemoId, setActiveDemoId] = useState<string>("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>(
    modeParam === "single" ? "single" : "canvas"
  );
  const [configData, setConfigData] = useState<Record<string, unknown>>({});
  const [configDataMap, setConfigDataMap] = useState<Record<string, Record<string, unknown>>>({});
  const [visibilitySessionOverrides, setVisibilitySessionOverrides] = useState<Record<string, unknown>>({});
  const [visibilityRuntimeRole, setVisibilityRuntimeRole] = useState("guest");
  const [canvasState, setCanvasState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: {},
  });
  const [configPanelDetailPageId, setConfigPanelDetailPageId] = useState<string | null>(null);
  // 画布模式按需显示：选中页面 ID（仅 canvasConfig=onclick 模式使用）
  const [canvasSelectedPageId, setCanvasSelectedPageId] = useState<string | null>(null);
  const [visibilityNotice, setVisibilityNotice] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!cancelled && typeof result?.data?.role === "string") {
          setVisibilityRuntimeRole(result.data.role);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
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
  const visiblePageSchemas = useMemo(() => {
    const next: Record<string, string | undefined> = {};
    for (const page of visiblePages) {
      next[page.id] = page.schema;
    }
    return next;
  }, [visiblePages]);

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

  // 切换到画布模式时清除选中状态（按需显示模式下配置面板隐藏）
  useEffect(() => {
    if (previewMode === "canvas" && canvasConfigMode === "onclick") {
      setCanvasSelectedPageId(null);
    }
  }, [previewMode, canvasConfigMode]);

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
        setCanvasState(
          result.data.canvasState ?? {
            viewport: { x: 40, y: 40, zoom: 0.5 },
            pages: {},
          },
        );

        const pages = result.data.demoPages as ViewerDemoPage[];
        const initialConfigDataMap: Record<string, Record<string, unknown>> = {};

        if (pages.length > 0) {
          const initialPageId = pageParam && pages.find((p: ViewerDemoPage) => p.id === pageParam)
            ? pageParam
            : pages[0].id;
          setActiveDemoId(initialPageId);

          for (const p of pages) {
            if (p.schema) {
              initialConfigDataMap[p.id] = getSafeMergedDefaults(
                result.data.projectConfigSchema,
                p.schema,
                result.data.projectConfigValues,
              );
            }
          }

          const activePage = pages.find((p: ViewerDemoPage) => p.id === initialPageId);
          if (activePage?.schema) {
            const defaults = initialConfigDataMap[initialPageId] || {};
            const urlConfig = urlConfigDataRef.current;
            const sessionUrlConfig = urlConfig ? { ...urlConfig } : undefined;
            const merged = sessionUrlConfig ? { ...defaults, ...sessionUrlConfig } : defaults;
            setConfigData(merged);
            initialConfigDataMap[initialPageId] = merged;
            setVisibilitySessionOverrides(
              filterConfigValuesByType(
                result.data.projectConfigSchema,
                filterConfigValuesByType(activePage.schema, sessionUrlConfig ?? {}, "business"),
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
        }

        setConfigDataMap(initialConfigDataMap);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [projectId, pageParam, getSafeMergedDefaults]);

  useEffect(() => {
    if (!data || !visibilityResolution) return;
    const requested = pageParam ? data.demoPages.find((page) => page.id === pageParam) : undefined;
    const requestedState = requested
      ? visibilityResolution.pages[requested.id]
      : undefined;
    const requestedVisible = requested
      ? !visibilityResolution.valid || requestedState?.visible !== false
      : false;
    const requestedEnabled = requested
      ? !visibilityResolution.valid || requestedState?.enabled !== false
      : false;
    const requestedAvailable = requestedVisible && requestedEnabled;
    const currentVisible = activeDemoId
      ? visiblePages.find((page) => page.id === activeDemoId)
      : undefined;
    const currentAvailable = currentVisible && (
      !visibilityResolution.valid
      || visibilityResolution.pages[currentVisible.id]?.enabled !== false
    )
      ? currentVisible
      : undefined;
    const firstAvailable = visiblePages.find(
      (page) => !visibilityResolution.valid || visibilityResolution.pages[page.id]?.enabled !== false,
    );
    const fallbackPage = requestedState?.fallbackPageId
      ? visiblePages.find((page) => page.id === requestedState.fallbackPageId
        && visibilityResolution.pages[page.id]?.enabled !== false)
      : undefined;
    const nextPage = pageParam
      ? requestedAvailable
        ? requested
        : fallbackPage ?? firstAvailable
      : currentAvailable ?? firstAvailable;
    if (nextPage && nextPage.id !== activeDemoId) {
      setActiveDemoId(nextPage.id);
      setConfigData(configDataMap[nextPage.id] ?? {});
    } else if (!nextPage && activeDemoId) {
      setActiveDemoId("");
    }
    setVisibilityNotice(
      requested && !requestedAvailable
        ? requestedState?.message
          ? requestedState.message
          : `页面「${requested.name}」当前${requestedVisible ? "不可用" : "不可见"}，${fallbackPage ? `已按规则切换到备用页面「${fallbackPage.name}」。` : "已切换到可用页面。"}`
        : null,
    );
  }, [activeDemoId, configDataMap, data, pageParam, visibilityResolution, visiblePages]);

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

      switch (msg.type) {
        case "VIEWER_SET_CONFIG":
          if (msg.configData && typeof msg.configData === "object") {
            const sessionConfigData = { ...msg.configData };
            const visibilityConfigData = (data?.demoPages ?? []).reduce(
              (values, page) => filterConfigValuesByType(page.schema, values, "business"),
              sessionConfigData,
            );
            const visibilityValues = filterConfigValuesByType(
              data?.projectConfigSchema,
              visibilityConfigData,
              "business",
            );
            setConfigData((prev) => ({ ...prev, ...sessionConfigData }));
            setConfigDataMap((prev) => {
              const next = { ...prev };
              for (const pageId of Object.keys(next)) {
                next[pageId] = { ...next[pageId], ...sessionConfigData };
              }
              return next;
            });
            setVisibilitySessionOverrides((prev) => ({ ...prev, ...visibilityValues }));
          }
          break;
        case "VIEWER_SET_MODE":
          if (msg.mode === "single" || msg.mode === "canvas") {
            setPreviewMode(msg.mode);
          }
          break;
        case "VIEWER_SET_PAGE":
          if (typeof msg.pageId === "string") {
            setActiveDemoId(msg.pageId);
            setConfigPanelDetailPageId(msg.pageId);
            // 按需显示模式下同步选中状态
            if (canvasConfigMode === "onclick" && previewMode === "canvas") {
              setCanvasSelectedPageId(msg.pageId);
            }
          }
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activeDemoId, canvasConfigMode, data, previewMode]);

  const handleConfigChange = useCallback((newData: Record<string, unknown>) => {
    setConfigData((prev) => {
      const merged = { ...prev, ...newData };
      postOutgoing({ type: "VIEWER_CONFIG_CHANGE", configData: merged });
      return merged;
    });
    setConfigDataMap((prev) => ({
      ...prev,
      [activeDemoId]: { ...(prev[activeDemoId] ?? {}), ...newData },
    }));
    setVisibilitySessionOverrides((prev) => {
      const filtered = filterConfigValuesByType(
        data?.projectConfigSchema,
        filterConfigValuesByType(data?.demoPages.find((page) => page.id === activeDemoId)?.schema, newData, "business"),
        "business",
      );
      return { ...prev, ...filtered };
    });
  }, [activeDemoId, data]);

  const handlePageConfigChange = useCallback((pageId: string, newData: Record<string, unknown>) => {
    setConfigData((prev) => {
      const merged = activeDemoId === pageId ? { ...prev, ...newData } : prev;
      if (activeDemoId === pageId) {
        postOutgoing({ type: "VIEWER_CONFIG_CHANGE", configData: merged });
      }
      return merged;
    });
    setConfigDataMap((prev) => ({
      ...prev,
      [pageId]: { ...(prev[pageId] ?? {}), ...newData },
    }));
  }, [activeDemoId]);

  const handleProjectConfigChange = useCallback((newData: Record<string, unknown>) => {
    setConfigData((prev) => {
      const merged = { ...prev, ...newData };
      postOutgoing({ type: "VIEWER_CONFIG_CHANGE", configData: merged });
      return merged;
    });
    setConfigDataMap((prev) => {
      const next = { ...prev };
      for (const pageId of Object.keys(next)) {
        next[pageId] = { ...next[pageId], ...newData };
      }
      return next;
    });
    setVisibilitySessionOverrides((prev) => ({
      ...prev,
      ...filterConfigValuesByType(data?.projectConfigSchema, newData, "business"),
    }));
  }, [data?.projectConfigSchema]);

  const handlePageChange = useCallback(
    (pageId: string) => {
      if (!data) return;
      const state = visibilityResolution?.valid
        ? visibilityResolution.pages[pageId]
        : undefined;
      if (state?.visible === false || state?.enabled === false) {
        const blockedPage = data.demoPages.find((page) => page.id === pageId);
        setVisibilityNotice(
          state.message ?? (blockedPage
            ? `页面「${blockedPage.name}」当前${state.visible === false ? "不可见" : "不可用"}。`
            : `该页面当前${state.visible === false ? "不可见" : "不可用"}。`),
        );
        return;
      }
      setActiveDemoId(pageId);
      setConfigPanelDetailPageId(pageId);
      postOutgoing({ type: "VIEWER_PAGE_CHANGE", pageId });
      const page = data.demoPages.find((p) => p.id === pageId);
      if (page?.schema) {
        const defaults = getSafeMergedDefaults(
          data.projectConfigSchema,
          page.schema,
          data.projectConfigValues,
        );
        setConfigData(defaults);
        setConfigDataMap((prev) => {
          if (prev[pageId]) return prev;
          return { ...prev, [pageId]: defaults };
        });
      }
    },
    [data, getSafeMergedDefaults, visibilityResolution]
  );

  const previewStagePages = useMemo<PreviewStagePage[]>(
    () =>
      visiblePages.map((page) => {
        const runtimeType = page.runtimeType ?? "high-fidelity-react";
        const runtimeData =
          runtimeType === "prototype-html-css"
            ? {
                prototypeHtml: page.prototypeHtml,
                prototypeCss: page.prototypeCss,
                prototypeMeta: page.prototypeMeta,
              }
            : runtimeType === "sketch-scene"
              ? {
                  sketchScene: page.sketchScene
                    ? JSON.stringify(page.sketchScene)
                    : undefined,
                  sketchMeta: page.sketchMeta,
                }
              : { code: page.code };

        return {
          id: page.id,
          name: page.name,
          order: page.order,
          runtimeType,
          ...runtimeData,
          configData: configDataMap[page.id],
          schema: page.schema,
          visibilityStatus: visibilityResolution?.pages[page.id]
            ? {
              visible: visibilityResolution.pages[page.id].visible,
              enabled: visibilityResolution.pages[page.id].enabled,
              unavailable: visibilityResolution.pages[page.id].unavailable,
              message: visibilityResolution.pages[page.id].message,
              fallbackPageId: visibilityResolution.pages[page.id].fallbackPageId,
              fallbackMessage: visibilityResolution.pages[page.id].fallbackMessage,
              alternativeRegion: visibilityResolution.pages[page.id].alternativeRegion,
              reasons: visibilityResolution.pages[page.id].reasons,
              }
            : undefined,
          visibilityRegions: Object.fromEntries(
            Object.entries(visibilityResolution?.regions ?? {})
              .filter(([key]) => key.startsWith(`${page.id}:`))
              .map(([key, state]) => [key, { visible: state.visible, enabled: state.enabled }]),
          ),
        };
      }),
    [configDataMap, visibilityResolution, visiblePages],
  );

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

  const activePage = availablePages.find((p) => p.id === activeDemoId) ?? availablePages[0];
  const activePageSchema = activePage?.schema;
  const hasMultiplePages = visiblePages.length > 1;

  const hasProjectConfig = !isSchemaEmpty(visibleProjectConfigSchema);
  const hasPageConfig = !isSchemaEmpty(activePage ? visiblePageSchemas[activePage.id] : undefined);
  const showProjectConfig = hasProjectConfig;
  const showPageConfig = hasPageConfig;
  const hasBothScopes = showProjectConfig && showPageConfig;
  const hasAnyConfig = showProjectConfig || showPageConfig;

  return (
    <div className="flex flex-col h-screen bg-background">
      {showModeSwitch && (
        <header className="flex h-12 shrink-0 items-center justify-center border-b border-border px-4">
          <PreviewModeSwitcher
            mode={previewMode}
            onModeChange={setPreviewMode}
            modes={["single", "canvas"]}
          />
        </header>
      )}
      {visibilityNotice && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {visibilityNotice}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {showPageList && previewMode !== "canvas" && hasMultiplePages && (
          <div className="w-48 border-r shrink-0 flex flex-col">
            <div className="px-3 py-3 border-b">
              <h2 className="text-xs font-medium text-muted-foreground">页面目录</h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {visiblePages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => handlePageChange(page.id)}
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
          <PreviewStage
            pages={previewStagePages}
            activePageId={activeDemoId}
            onActivePageChange={handlePageChange}
            previewMode={previewMode}
            onPreviewModeChange={setPreviewMode}
            canvasState={canvasState}
            onCanvasStateChange={setCanvasState}
            interactionMode="viewer"
            showToolbar={false}
            canvasProps={{
              projectId,
              editingPageId:
                canvasConfigMode === "onclick"
                  ? canvasSelectedPageId ?? undefined
                  : undefined,
              onPageConfigEdit: (pageId) => {
                handlePageChange(pageId);
                setConfigPanelDetailPageId(pageId);
                if (canvasConfigMode === "onclick") {
                  setCanvasSelectedPageId(pageId);
                }
              },
              onCanvasClick: () => {
                if (canvasConfigMode === "onclick") {
                  setCanvasSelectedPageId(null);
                }
              },
            }}
          />
        </div>

        {showConfig && hasAnyConfig && (
          <div
            className="border-l shrink-0 flex flex-col"
            style={{ width: configWidth }}
          >
            <PageConfigPanel
              pages={visiblePages.map((page) => ({
                id: page.id,
                name: page.name,
                order: page.order,
                schema: visiblePageSchemas[page.id],
                configData: configDataMap[page.id],
              }))}
              activePageId={activeDemoId}
              detailPageId={
                previewMode === "single" ? activeDemoId : configPanelDetailPageId
              }
              onDetailPageIdChange={setConfigPanelDetailPageId}
              onPageSelect={handlePageChange}
              projectConfigSchema={visibleProjectConfigSchema}
              onProjectConfigChange={handleProjectConfigChange}
              onPageConfigChange={handlePageConfigChange}
              requirements={visiblePages.find((page) => page.id === (previewMode === "single" ? activeDemoId : configPanelDetailPageId))?.requirements}
              hideDetailHeader={previewMode === "single"}
              requirementsPosition="beforeConfig"
            />
          </div>
        )}
      </div>
    </div>
  );
}
