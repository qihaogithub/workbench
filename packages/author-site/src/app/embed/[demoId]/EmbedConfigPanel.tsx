"use client";

import { useRef, useState, useCallback } from "react";
import { ConfigForm, ConfigScopeWrapper } from "../../../../components/demo";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmbedPageInfo {
  id: string;
  name: string;
  schema: string;
  iframeUrl: string;
  initialConfigData: Record<string, unknown>;
}

interface EmbedPageContentProps {
  embedCode: string;
  iframeUrl: string;
  schema: string;
  projectConfigSchema?: string;
  initialConfigData: Record<string, unknown>;
  projectConfigData?: Record<string, unknown>;
  pages?: EmbedPageInfo[];
}

export function EmbedPageContent({
  embedCode,
  iframeUrl,
  schema,
  projectConfigSchema,
  initialConfigData,
  projectConfigData,
  pages,
}: EmbedPageContentProps) {
  const isGridMode = pages && pages.length > 1;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-2">嵌入 Demo</h1>
        <p className="text-muted-foreground mb-8">
          将以下 iframe 代码复制到你的页面中即可嵌入此 Demo。
        </p>

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-medium mb-2">嵌入代码</h2>
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto font-mono">
                {embedCode}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => navigator.clipboard.writeText(embedCode)}
              >
                <Copy className="h-3 w-3 mr-1" />
                复制
              </Button>
            </div>
          </div>

          {isGridMode ? (
            <EmbedGridMode
              pages={pages!}
              projectConfigSchema={projectConfigSchema}
              projectConfigData={projectConfigData ?? {}}
            />
          ) : (
            <EmbedSingleMode
              iframeUrl={iframeUrl}
              schema={schema}
              projectConfigSchema={projectConfigSchema}
              initialConfigData={initialConfigData}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmbedSingleMode({
  iframeUrl,
  schema,
  projectConfigSchema,
  initialConfigData,
}: {
  iframeUrl: string;
  schema: string;
  projectConfigSchema?: string;
  initialConfigData: Record<string, unknown>;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [configData, setConfigData] = useState(initialConfigData);

  const sendConfig = useCallback(
    (data: Record<string, unknown>) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      iframe.contentWindow.postMessage(
        { type: "UPDATE_CONFIG", configData: data },
        "*"
      );
    },
    []
  );

  const handleConfigChange = useCallback(
    (data: Record<string, unknown>) => {
      setConfigData(data);
      sendConfig(data);
    },
    [sendConfig]
  );

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-medium mb-2">预览</h2>
        <div className="border rounded-lg overflow-hidden">
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            sandbox="allow-scripts allow-same-origin"
            className="w-full"
            style={{ minHeight: "400px" }}
          />
        </div>
      </div>
      <ConfigPanel
        schema={schema}
        projectConfigSchema={projectConfigSchema}
        configData={configData}
        onChange={handleConfigChange}
      />
    </div>
  );
}

function EmbedGridMode({
  pages,
  projectConfigSchema,
  projectConfigData,
}: {
  pages: EmbedPageInfo[];
  projectConfigSchema?: string;
  projectConfigData: Record<string, unknown>;
}) {
  const iframeRefsRef = useRef<Map<string, HTMLIFrameElement>>(new Map());

  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? "");

  const [pageConfigs, setPageConfigs] = useState<
    Map<string, Record<string, unknown>>
  >(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const page of pages) {
      map.set(page.id, { ...page.initialConfigData });
    }
    return map;
  });

  const setPageConfig = useCallback(
    (pageId: string, data: Record<string, unknown>) => {
      setPageConfigs((prev) => {
        const next = new Map(prev);
        next.set(pageId, data);
        return next;
      });
    },
    []
  );

  const registerIframe = useCallback(
    (pageId: string) => (el: HTMLIFrameElement | null) => {
      if (el) {
        iframeRefsRef.current.set(pageId, el);
      } else {
        iframeRefsRef.current.delete(pageId);
      }
    },
    []
  );

  const sendConfigToPage = useCallback(
    (pageId: string, data: Record<string, unknown>) => {
      const iframe = iframeRefsRef.current.get(pageId);
      if (!iframe?.contentWindow) return;
      iframe.contentWindow.postMessage(
        { type: "UPDATE_CONFIG", configData: data },
        "*"
      );
    },
    []
  );

  const broadcastProjectConfig = useCallback(
    (data: Record<string, unknown>) => {
      iframeRefsRef.current.forEach((iframe) => {
        iframe.contentWindow?.postMessage(
          { type: "UPDATE_CONFIG", configData: data },
          "*"
        );
      });
    },
    []
  );

  const handlePageConfigChange = useCallback(
    (data: Record<string, unknown>) => {
      setPageConfig(activePageId, data);
      sendConfigToPage(activePageId, data);
    },
    [activePageId, setPageConfig, sendConfigToPage]
  );

  const handleProjectConfigChange = useCallback(
    (data: Record<string, unknown>) => {
      broadcastProjectConfig(data);
    },
    [broadcastProjectConfig]
  );

  const activePage = pages.find((p) => p.id === activePageId);
  const activeConfig = activePageId
    ? pageConfigs.get(activePageId) ?? {}
    : {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium mb-2">页面 ({pages.length})</h2>
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          }}
        >
          {pages.map((page) => {
            const isActive = page.id === activePageId;
            return (
              <div
                key={page.id}
                className={cn(
                  "border rounded-lg overflow-hidden cursor-pointer transition-colors",
                  isActive
                    ? "border-primary ring-1 ring-primary"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => setActivePageId(page.id)}
              >
                <div className="px-3 py-2 border-b bg-muted/50">
                  <span className="text-xs font-medium truncate block">
                    {page.name}
                  </span>
                </div>
                <div className="aspect-video bg-background">
                  <iframe
                    ref={registerIframe(page.id)}
                    src={page.iframeUrl}
                    sandbox="allow-scripts allow-same-origin"
                    className="w-full h-full"
                    style={{ pointerEvents: "none" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {activePage && (
        <div>
          <h2 className="text-sm font-medium mb-2">
            配置面板 — {activePage.name}
          </h2>
          <ConfigPanel
            schema={activePage.schema}
            projectConfigSchema={projectConfigSchema}
            configData={activeConfig}
            onChange={handlePageConfigChange}
            onProjectConfigChange={handleProjectConfigChange}
          />
        </div>
      )}
    </div>
  );
}

function ConfigPanel({
  schema,
  projectConfigSchema,
  configData,
  onChange,
  onProjectConfigChange,
}: {
  schema: string;
  projectConfigSchema?: string;
  configData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  onProjectConfigChange?: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="w-72 shrink-0">
      <div className="flex flex-col">
        {projectConfigSchema && (
          <ConfigScopeWrapper scope="project">
            <ConfigForm
              key={`project-${projectConfigSchema}`}
              schema={projectConfigSchema}
              onChange={onProjectConfigChange ?? onChange}
              initialData={configData}
            />
          </ConfigScopeWrapper>
        )}

        {projectConfigSchema && (
          <div className="h-[2px] bg-border my-3" />
        )}

        <ConfigScopeWrapper scope="page">
          <ConfigForm
            key={schema}
            schema={schema}
            onChange={onChange}
            initialData={configData}
          />
        </ConfigScopeWrapper>
      </div>
    </div>
  );
}