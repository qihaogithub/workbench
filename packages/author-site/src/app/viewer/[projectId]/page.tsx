"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PreviewPanel, ConfigForm, PreviewGrid, ConfigScopeWrapper } from "../../../../components/demo";
import type { PreviewMode, PreviewSize } from "../../../../components/demo";
import { mergeConfigToProps } from "@/lib/runtime-props";
import { getDefaultValues, getPreviewSize } from "../../../../lib/validator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  LayoutGrid,
  Settings,
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
}

interface ViewerData {
  project: { id: string; name: string; description?: string } | null;
  demoPages: ViewerDemoPage[];
  projectConfigSchema?: string;
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
  const columnsParam = searchParams.get("columns");
  const configParam = searchParams.get("config");
  const configWidthParam = searchParams.get("configWidth");
  const pagesParam = searchParams.get("pages");
  const toolbarParam = searchParams.get("toolbar");
  const modeSwitchParam = searchParams.get("modeSwitch");
  const pageParam = searchParams.get("page");
  const themeParam = searchParams.get("theme");
  const backgroundParam = searchParams.get("background");
  const configDataParam = searchParams.get("configData");

  const showConfig = configParam !== "false";
  const configWidth = configWidthParam ? parseInt(configWidthParam, 10) : 320;
  const showPages = pagesParam !== "false";
  const showToolbar = toolbarParam !== "false";
  const showModeSwitch = modeSwitchParam !== "false";
  const previewBackground = backgroundParam || "#fff";

  const [data, setData] = useState<ViewerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeDemoId, setActiveDemoId] = useState<string>("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>(
    modeParam === "grid" ? "grid" : "single"
  );
  const [gridColumns, setGridColumns] = useState<2 | 3 | 4>(
    columnsParam === "3" ? 3 : columnsParam === "4" ? 4 : 2
  );
  const [configVisible, setConfigVisible] = useState(showConfig);
  const [configData, setConfigData] = useState<Record<string, unknown>>({});
  const [previewSize, setPreviewSize] = useState<PreviewSize | undefined>();

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
        if (pages.length > 0) {
          const initialPageId = pageParam && pages.find((p: ViewerDemoPage) => p.id === pageParam)
            ? pageParam
            : pages[0].id;
          setActiveDemoId(initialPageId);

          const activePage = pages.find((p: ViewerDemoPage) => p.id === initialPageId);
          if (activePage?.schema) {
            const defaults = getSafeMergedDefaults(
              result.data.projectConfigSchema,
              activePage.schema
            );
            const urlConfig = urlConfigDataRef.current;
            const merged = urlConfig ? { ...defaults, ...urlConfig } : defaults;
            setConfigData(merged);
            setPreviewSize(getPreviewSize(activePage.schema));
          } else if (urlConfigDataRef.current) {
            setConfigData(urlConfigDataRef.current);
          }
        }
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
          }
          break;
        case "VIEWER_SET_MODE":
          if (msg.mode === "single" || msg.mode === "grid") {
            setPreviewMode(msg.mode);
          }
          break;
        case "VIEWER_SET_PAGE":
          if (typeof msg.pageId === "string") {
            setActiveDemoId(msg.pageId);
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
  }, []);

  const handlePageChange = useCallback(
    (pageId: string) => {
      if (!data) return;
      setActiveDemoId(pageId);
      postOutgoing({ type: "VIEWER_PAGE_CHANGE", pageId });
      const page = data.demoPages.find((p) => p.id === pageId);
      if (page?.schema) {
        const defaults = getSafeMergedDefaults(data.projectConfigSchema, page.schema);
        setConfigData(defaults);
        setPreviewSize(getPreviewSize(page.schema));
      }
    },
    [data, getSafeMergedDefaults]
  );

  const handleGridCardClick = useCallback(
    (pageId: string) => {
      handlePageChange(pageId);
      setPreviewMode("single");
    },
    [handlePageChange]
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

  const gridPages = data.demoPages.map((p) => ({
    id: p.id,
    name: p.name,
    order: p.order,
    previewSize: p.previewSize,
    code: p.code,
  }));

  return (
    <div className="flex flex-col h-screen bg-background">
      {showToolbar && (
        <header className="flex h-12 items-center border-b px-4 shrink-0 gap-3">
          <h1 className="text-sm font-semibold">{data.project?.name || projectId}</h1>

          {showModeSwitch && (
            <>
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
            </>
          )}

          {previewMode === "single" && showPages && hasMultiplePages && (
            <Select value={activeDemoId} onValueChange={handlePageChange}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue placeholder="选择页面" />
              </SelectTrigger>
              <SelectContent>
                {data.demoPages.map((page) => (
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

          {showConfig && (
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
          )}
        </header>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden" style={{ backgroundColor: previewBackground }}>
          {previewMode === "single" ? (
            <div
              className="p-4 h-full overflow-y-auto preview-single-scroll"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <style>{`
                .preview-single-scroll::-webkit-scrollbar {
                  display: none;
                }
              `}</style>
              {activePage && (
                <PreviewPanel
                  code={activePage.code}
                  demoId={activePage.id}
                  configData={configData}
                  previewSize={previewSize}
                />
              )}
            </div>
          ) : (
            <PreviewGrid
              demoPages={gridPages}
              activePageId={activeDemoId}
              gridColumns={gridColumns}
              onGridColumnsChange={setGridColumns}
              onCardClick={handleGridCardClick}
              configData={configData}
              previewSize={previewSize}
            />
          )}
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
              <div className="p-4 flex flex-col gap-5">
                {data.projectConfigSchema && (
                  <ConfigScopeWrapper scope="project">
                    <ConfigForm
                      key={`project-${data.projectConfigSchema}`}
                      schema={data.projectConfigSchema}
                      onChange={handleConfigChange}
                      initialData={configData}
                      readonly
                    />
                  </ConfigScopeWrapper>
                )}

                {activePageSchema && (
                  <ConfigScopeWrapper scope="page" pageName={activePage?.name}>
                    <ConfigForm
                      key={`page-${activeDemoId}`}
                      schema={activePageSchema}
                      onChange={handleConfigChange}
                      initialData={configData}
                      readonly
                    />
                  </ConfigScopeWrapper>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
