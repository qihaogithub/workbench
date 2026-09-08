"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { encodeMarkdownReferenceUri, type MarkdownReferenceSource, type MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";

interface LinkRecord {
  source: MarkdownReferenceSource;
  sourceLabel?: string;
  target?: MarkdownReferenceTarget | null;
  labelSnapshot: string;
  line?: number;
  column?: number;
  targetState?: "resolved" | "unavailable";
  excerpt?: string;
}

export interface MarkdownReferenceMention {
  target: MarkdownReferenceTarget;
  label: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

type ReferenceTab = "outgoing" | "backlinks" | "mentions";

interface TabDefinition {
  value: ReferenceTab;
  label: string;
  shortLabel: string;
  count: number;
}

export interface MarkdownReferenceLinksPanelProps {
  projectId: string;
  sessionId?: string;
  source?: MarkdownReferenceSource;
  target?: MarkdownReferenceTarget;
  onTargetClick?: (target: MarkdownReferenceTarget, labelSnapshot: string) => void;
  onSourceClick?: (source: MarkdownReferenceSource) => void;
  onMentionNavigate?: (mention: MarkdownReferenceMention) => void;
  onMentionClick?: (mention: MarkdownReferenceMention) => void;
  className?: string;
}

/**
 * Shared outgoing/backlinks/mention tray for author document panes.
 * The tray is intentionally absolute-positioned by its parent so it never
 * changes the editor's layout height when the result list grows.
 */
export function MarkdownReferenceLinksPanel({
  projectId,
  sessionId,
  source,
  target,
  onTargetClick,
  onSourceClick,
  onMentionNavigate,
  onMentionClick,
  className,
}: MarkdownReferenceLinksPanelProps) {
  const [outgoing, setOutgoing] = useState<LinkRecord[]>([]);
  const [backlinks, setBacklinks] = useState<LinkRecord[]>([]);
  const [mentions, setMentions] = useState<MarkdownReferenceMention[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ReferenceTab>(source ? "outgoing" : "backlinks");
  const instanceId = useId();
  const sourceKey = source ? JSON.stringify(source) : "";
  const targetKey = target ? JSON.stringify(target) : "";
  const hasSource = Boolean(source);
  const hasTarget = Boolean(target);
  const visibleMentions = useMemo(
    () => mentions.filter((mention) => !isSelfMention(source, mention.target)),
    [mentions, source],
  );

  const tabDefinitions = useMemo<TabDefinition[]>(() => {
    const definitions: TabDefinition[] = [];
    if (hasSource) {
      definitions.push({ value: "outgoing", label: "此文档链接到", shortLabel: "出链", count: outgoing.length });
    }
    if (hasTarget) {
      definitions.push({ value: "backlinks", label: "链接到此文档", shortLabel: "反向", count: backlinks.length });
    }
    if (hasSource) {
      definitions.push({ value: "mentions", label: "提及但未链接", shortLabel: "提及", count: visibleMentions.length });
    }
    return definitions;
  }, [backlinks.length, hasSource, hasTarget, outgoing.length, visibleMentions.length]);

  useEffect(() => {
    const fallbackTab = hasSource ? "outgoing" : hasTarget ? "backlinks" : "mentions";
    setExpanded(false);
    setActiveTab(fallbackTab);
  }, [hasSource, hasTarget, projectId, sessionId, sourceKey, targetKey]);

  useEffect(() => {
    if (tabDefinitions.length > 0 && !tabDefinitions.some((tab) => tab.value === activeTab)) {
      setActiveTab(tabDefinitions[0].value);
    }
  }, [activeTab, tabDefinitions]);

  useEffect(() => {
    if (!source && !target) {
      setOutgoing([]);
      setBacklinks([]);
      setMentions([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    const query = new URLSearchParams();
    if (sessionId) query.set("sessionId", sessionId);
    const requests: Promise<Response>[] = [];
    if (source) {
      query.set("sourceKind", source.kind);
      if (source.kind === "knowledge-document") query.set("sourceId", source.docId);
      else if (source.kind === "page-requirements" || source.kind === "page-convention") query.set("sourceId", source.pageId);
      else if (source.kind === "design-spec-entry") {
        query.set("sourceId", source.entryId);
        query.set("entryId", source.entryId);
        query.set("specId", source.specId);
      } else if (source.kind === "config-note" || source.kind === "richtext-field") {
        query.set("sourceId", source.fieldKey);
        query.set("fieldKey", source.fieldKey);
        query.set("scope", source.scope);
        if (source.pageId) query.set("pageId", source.pageId);
        if (source.kind === "richtext-field") query.set("jsonPointer", source.jsonPointer);
      } else query.set("sourceId", source.kind);
      requests.push(fetch(`/api/projects/${encodeURIComponent(projectId)}/markdown-references/outgoing?${query.toString()}`, { signal: controller.signal }));

      const mentionQuery = new URLSearchParams({ sourceKind: source.kind });
      if (sessionId) mentionQuery.set("sessionId", sessionId);
      if (source.kind === "knowledge-document") mentionQuery.set("sourceId", source.docId);
      else if (source.kind === "page-requirements" || source.kind === "page-convention") mentionQuery.set("sourceId", source.pageId);
      else if (source.kind === "design-spec-entry") {
        mentionQuery.set("sourceId", source.entryId);
        mentionQuery.set("specId", source.specId);
      } else if (source.kind === "config-note" || source.kind === "richtext-field") {
        mentionQuery.set("sourceId", source.fieldKey);
        mentionQuery.set("fieldKey", source.fieldKey);
        mentionQuery.set("scope", source.scope);
        if (source.pageId) mentionQuery.set("pageId", source.pageId);
        if (source.kind === "richtext-field") mentionQuery.set("jsonPointer", source.jsonPointer);
      }
      requests.push(fetch(`/api/projects/${encodeURIComponent(projectId)}/markdown-references/mentions?${mentionQuery.toString()}`, { signal: controller.signal }));
    }
    if (target) {
      const backlinkQuery = new URLSearchParams({
        targetKind: target.kind,
        targetId: target.kind === "config" || (target.kind === "document" && target.documentKind && target.documentKind !== "knowledge") ? encodeMarkdownReferenceUri(target) : target.kind === "project" ? target.projectId : target.kind === "page" ? target.pageId : target.docId,
      });
      if (sessionId) backlinkQuery.set("sessionId", sessionId);
      requests.push(fetch(`/api/projects/${encodeURIComponent(projectId)}/markdown-references/backlinks?${backlinkQuery.toString()}`, { signal: controller.signal }));
    }

    Promise.all(requests)
      .then(async (responses) => {
        const payloads = await Promise.all(responses.map((response) => response.ok ? response.json() : null));
        let index = 0;
        if (source) {
          const payload = payloads[index++];
          setOutgoing(Array.isArray(payload?.data?.records) ? payload.data.records : []);
          const mentionPayload = payloads[index++];
          setMentions(Array.isArray(mentionPayload?.data?.mentions) ? mentionPayload.data.mentions : []);
        }
        if (target) {
          const payload = payloads[index++];
          setBacklinks(Array.isArray(payload?.data?.records) ? payload.data.records : []);
        }
        setStatus("ready");
      })
      .catch((error) => {
        if ((error as Error)?.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [projectId, sessionId, source, sourceKey, target, targetKey]);

  if (!source && !target) return null;

  const trayId = `markdown-reference-links-content-${instanceId.replace(/:/g, "")}`;
  return (
    <aside
      className={cn(
        "absolute inset-x-0 bottom-0 z-30 overflow-hidden border-t border-border/80 bg-background/95 text-xs shadow-[0_-12px_28px_-20px_rgba(0,0,0,0.75)] backdrop-blur-sm",
        className,
      )}
      data-testid="markdown-reference-links"
      aria-busy={status === "loading"}
    >
      <div className="flex min-h-9 items-center gap-2 px-3">
        <button
          type="button"
          className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-expanded={expanded}
          aria-controls={trayId}
          data-testid="markdown-reference-tray-toggle"
          aria-label={expanded ? "收起链接摘要" : "展开链接摘要"}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground" aria-label="链接摘要">
            {tabDefinitions.map((tab, index) => (
              <span key={tab.value}>
                {index > 0 ? " • " : ""}
                {tab.shortLabel} {tab.count}
              </span>
            ))}
          </span>
          {expanded ? <ChevronUp className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        </button>
      </div>

      {expanded && (
        <div id={trayId} data-testid="markdown-reference-tray-content" className="border-t border-border/60">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ReferenceTab)}
            className="flex min-h-0 flex-col"
          >
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent px-2 py-1">
              {tabDefinitions.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  data-testid={`markdown-reference-tab-${tab.value}`}
                  className="h-7 shrink-0 gap-1.5 rounded-sm px-2 text-[11px] data-[state=active]:bg-muted data-[state=active]:shadow-none"
                >
                  {tab.label}
                  <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold leading-4 text-muted-foreground" aria-label={`${tab.count} 条`}>
                    {tab.count > 99 ? "99+" : tab.count}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="max-h-[min(40vh,240px)] overflow-y-auto px-3 py-2">
              {source && (
                <TabsContent value="outgoing" className="m-0">
                  <LinkGroup records={outgoing} empty="暂无链接" onTargetClick={onTargetClick} />
                </TabsContent>
              )}
              {target && (
                <TabsContent value="backlinks" className="m-0">
                  <LinkGroup records={backlinks} empty="暂无反向链接" onTargetClick={onTargetClick} onSourceClick={onSourceClick} />
                </TabsContent>
              )}
              {source && (
                <TabsContent value="mentions" className="m-0">
                  <p className="mb-1.5 text-[11px] text-muted-foreground">正文中出现了已知文档名称，但尚未建立链接。</p>
                  {visibleMentions.length === 0 ? <p className="py-1 text-muted-foreground/70">暂无可转换提及</p> : (
                    <ul className="space-y-0.5">
                      {visibleMentions.slice(0, 8).map((mention) => (
                        <li key={`${mention.start}:${mention.end}`} className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-foreground">{mention.label}</span>
                          <button
                            type="button"
                            className="shrink-0 cursor-pointer text-[11px] text-muted-foreground underline-offset-2 transition-colors duration-200 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            title={`跳转到正文中的「${mention.label}」`}
                            onClick={() => onMentionNavigate?.(mention)}
                          >
                            跳转
                          </button>
                          <button
                            type="button"
                            className="shrink-0 cursor-pointer text-[11px] text-muted-foreground underline-offset-2 transition-colors duration-200 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            title={`将「${mention.label}」转为链接`}
                            onClick={() => onMentionClick?.(mention)}
                          >
                            转为链接
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              )}
            </div>
          </Tabs>
        </div>
      )}
    </aside>
  );
}

function isSelfMention(
  source: MarkdownReferenceSource | undefined,
  target: MarkdownReferenceTarget,
): boolean {
  if (!source) return false;
  if (source.kind === "knowledge-document") {
    return target.kind === "document" && target.projectId === source.projectId && target.docId === source.docId;
  }
  if (source.kind === "page-requirements" || source.kind === "page-convention") {
    return target.kind === "page" && target.projectId === source.projectId && target.pageId === source.pageId;
  }
  return false;
}

function LinkGroup({
  records,
  empty,
  onTargetClick,
  onSourceClick,
}: {
  records: LinkRecord[];
  empty: string;
  onTargetClick?: MarkdownReferenceLinksPanelProps["onTargetClick"];
  onSourceClick?: MarkdownReferenceLinksPanelProps["onSourceClick"];
}) {
  if (records.length === 0) return <p className="py-1 text-muted-foreground/70">{empty}</p>;

  return (
    <ul className="space-y-0.5">
      {records.slice(0, 8).map((record, index) => (
        <li key={`${record.source.kind}:${index}`} className="flex min-w-0 items-center gap-1.5 truncate">
          {onSourceClick ? (
            <button type="button" className="min-w-0 flex-1 cursor-pointer truncate text-left text-foreground underline-offset-2 transition-colors duration-200 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" onClick={() => onSourceClick(record.source)}>
              {record.sourceLabel || record.labelSnapshot}
            </button>
          ) : record.target ? (
            <button type="button" className="min-w-0 flex-1 cursor-pointer truncate text-left text-foreground underline-offset-2 transition-colors duration-200 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" onClick={() => onTargetClick?.(record.target!, record.labelSnapshot)}>
              {record.labelSnapshot || record.target.kind}
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{record.labelSnapshot || "引用不可用"}</span>
          )}
          {record.line ? <span className="shrink-0 text-[10px] text-muted-foreground">第 {record.line} 行</span> : null}
        </li>
      ))}
    </ul>
  );
}
