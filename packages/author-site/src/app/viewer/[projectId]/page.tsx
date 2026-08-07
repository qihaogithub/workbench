"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  PreviewStage,
  PageConfigPanel,
  PreviewModeSwitcher,
  isSchemaEmpty,
} from "../../../../components/demo";
import type {
  PreviewMode,
  PreviewSize,
  CanvasState,
  CanvasPageRuntimeType,
  PreviewStagePage,
} from "../../../../components/demo";
import { mergeConfigToProps } from "@/lib/runtime-props";
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
  const [canvasState, setCanvasState] = useState<CanvasState>({
    viewport: { x: 40, y: 40, zoom: 0.5 },
    pages: {},
  });
  const [configPanelDetailPageId, setConfigPanelDetailPageId] = useState<string | null>(null);
  // 画布模式按需显示：选中页面 ID（仅 canvasConfig=onclick 模式使用）
  const [canvasSelectedPageId, setCanvasSelectedPageId] = useState<string | null>(null);
  const urlConfigDataRef = useRef<Record<string, unknown> | null>(null);
  if (urlConfigDataRef.current === null) {
    urlConfigDataRef.current = parseConfigDataParam(configDataParam);
  }

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
            const merged = urlConfig ? { ...defaults, ...urlConfig } : defaults;
            setConfigData(merged);
            initialConfigDataMap[initialPageId] = merged;
          } else if (urlConfigDataRef.current) {
            setConfigData(urlConfigDataRef.current);
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
            setConfigData((prev) => ({ ...prev, ...msg.configData }));
            setConfigDataMap((prev) => {
              const next = { ...prev };
              for (const pageId of Object.keys(next)) {
                next[pageId] = { ...next[pageId], ...msg.configData };
              }
              return next;
            });
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
  }, []);

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
  }, [activeDemoId]);

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
  }, []);

  const handlePageChange = useCallback(
    (pageId: string) => {
      if (!data) return;
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
    [data, getSafeMergedDefaults]
  );

  const previewStagePages = useMemo<PreviewStagePage[]>(
    () =>
      (data?.demoPages ?? []).map((page) => {
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
          previewSize: page.previewSize,
        };
      }),
    [configDataMap, data],
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

  const activePage = data.demoPages.find((p) => p.id === activeDemoId);
  const activePageSchema = activePage?.schema;
  const hasMultiplePages = data.demoPages.length > 1;

  const hasProjectConfig = !isSchemaEmpty(data.projectConfigSchema);
  const hasPageConfig = !isSchemaEmpty(activePageSchema);
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
      <div className="flex flex-1 overflow-hidden">
        {showPageList && previewMode !== "canvas" && hasMultiplePages && (
          <div className="w-48 border-r shrink-0 flex flex-col">
            <div className="px-3 py-3 border-b">
              <h2 className="text-xs font-medium text-muted-foreground">页面目录</h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {data.demoPages.map((page) => (
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
              pages={data.demoPages.map((page) => ({
                id: page.id,
                name: page.name,
                order: page.order,
                schema: page.schema,
                configData: configDataMap[page.id],
              }))}
              activePageId={activeDemoId}
              detailPageId={
                previewMode === "single" ? activeDemoId : configPanelDetailPageId
              }
              onDetailPageIdChange={setConfigPanelDetailPageId}
              onPageSelect={handlePageChange}
              projectConfigSchema={data.projectConfigSchema}
              onProjectConfigChange={handleProjectConfigChange}
              onPageConfigChange={handlePageConfigChange}
              readonly
              hideDetailHeader={previewMode === "single"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
