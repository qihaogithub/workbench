"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, FileText, FolderOpen, Loader2 } from "lucide-react";
import type { KnowledgeIndexItem } from "@workbench/shared";
import type { MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";
import { DocumentEditor, PageRequirements } from "@workbench/demo-ui";
import { enumerateSchemaFields, type SchemaCatalogField } from "@workbench/shared/demo/config-schema-fields";
import { cn } from "@/lib/utils";
import {
  DATA_BASE,
  getDesignSpecDoc,
  getDataUrl,
  getKnowledgeDocContent,
  normalizePublishedDesignSpecDoc,
  type PublishedDesignSpecDoc,
  type PublishedDesignSpecMeta,
  type PublishedMarkdownReferenceSnapshot,
} from "../lib/api";

interface ViewerDocumentViewProps {
  projectId: string;
  items: KnowledgeIndexItem[];
  designSpecs: PublishedDesignSpecMeta[];
  projectConfigSchema?: string;
  pages: Array<{ id: string; name: string; schema?: string }>;
  references?: PublishedMarkdownReferenceSnapshot;
  onReferenceNavigate?: (target: MarkdownReferenceTarget) => void;
}

type ConfigPoolItemKind = "color" | "text" | "image" | "number" | "motion";

type ConfigPoolItem = {
  id: string;
  scope: "project" | "page";
  pageId?: string;
  pageName?: string;
  key: string;
  title: string;
  kind: ConfigPoolItemKind;
  value?: unknown;
  format?: string;
  breadcrumbs?: string[];
  isConst?: boolean;
  isBranch?: boolean;
  pageIds?: string[];
};

/**
 * 文档视图只显示使用者可阅读的项目知识库或设计规范；系统知识不构成入口内容。
 */
export function hasViewerDocumentContent(
  items: KnowledgeIndexItem[],
  designSpecs: PublishedDesignSpecMeta[],
) {
  return items.some((item) => item.source !== "system") || designSpecs.length > 0;
}

function buildConfigPool(projectSchema: string | undefined, pages: ViewerDocumentViewProps["pages"]): ConfigPoolItem[] {
  const readFields = (schema?: string) => schema ? enumerateSchemaFields(schema) : [];
  const pageIds = Array.from(new Set(pages.map((item) => item.id).filter(Boolean)));
  const kindOf = (field: SchemaCatalogField): ConfigPoolItemKind => {
    if (field.isBranch) return "text";
    const type = field.type.toLowerCase();
    const format = (field.format || "").toLowerCase();
    const widget = (field.uiWidget || "").toLowerCase();
    // oneOf discriminator markers are part of the stable path, but they are
    // not the field name used for kind inference.
    const key = field.key.split(".").pop()?.toLowerCase() || field.key.toLowerCase();
    if (format === "color" || format === "color-opacity") return "color";
    if (format === "opacity") return "number";
    if (format === "image" || type === "image" || type === "imagelist" || widget === "image" || widget === "imagelist" || (typeof field.default === "string" && /\.(svg|png|jpe?g|gif|webp|bmp|avif)$/i.test(field.default)) || /(image|img|logo|banner|pic|thumb|background)/.test(key)) return "image";
    if (type === "number" || type === "integer") return "number";
    if (widget === "motion" || type === "motion" || /(motion|animation|transition)/.test(key)) return "motion";
    return "text";
  };
  const toItem = (field: SchemaCatalogField, scope: ConfigPoolItem["scope"], page?: ViewerDocumentViewProps["pages"][number]): ConfigPoolItem => {
    const kind = kindOf(field);
    return {
      id: scope === "project" ? `project:${field.key}` : `page:${page!.id}:${field.key}`,
      scope,
      pageId: page?.id,
      pageName: page?.name,
      key: field.key,
      title: field.title,
      breadcrumbs: field.breadcrumbs,
      isConst: field.isConst,
      isBranch: field.isBranch,
      pageIds: scope === "project" ? pageIds : undefined,
      kind,
      value: field.default,
      format: kind === "image" && typeof field.default === "string" ? field.default.split(".").pop()?.toUpperCase() : field.format?.toUpperCase(),
    };
  };
  return [
    ...readFields(projectSchema).map((field) => toItem(field, "project")),
    ...pages.flatMap((page) => readFields(page.schema).map((field) => toItem(field, "page", page))),
  ];
}

function refToPoolId(ref: { scope: "project" | "page"; pageId?: string; fieldKey: string }) {
  return ref.scope === "project" ? `project:${ref.fieldKey}` : `page:${ref.pageId || ""}:${ref.fieldKey}`;
}

function referenceTargetKey(target: MarkdownReferenceTarget): string {
  if (target.kind === "project") return `project:${target.projectId}`;
  if (target.kind === "page") return `page:${target.projectId}:${target.pageId}`;
  // These live-only targets are not in the published directory; never resolve
  // them by accidentally treating their IDs as published knowledge documents.
  if (target.kind === "config") return `unpublished-config:${target.projectId}:${target.pageId}:${target.fieldPath}`;
  if (target.documentKind && target.documentKind !== "knowledge") return `unpublished-document:${target.projectId}:${target.documentKind}:${target.docId}`;
  return `document:${target.projectId}:${target.docId}`;
}

function kindText(kind: ConfigPoolItemKind) {
  return kind === "color" ? "●" : kind === "image" ? "🖼" : kind === "motion" ? "▶" : kind === "number" ? "#" : "Aa";
}

function ReadonlyDesignSpec({
  doc,
  pool,
  onReferenceClick,
}: {
  doc: PublishedDesignSpecDoc;
  pool: ConfigPoolItem[];
  onReferenceClick?: (input: { target: MarkdownReferenceTarget; labelSnapshot: string }) => void;
}) {
  const [openIds, setOpenIds] = useState(() => new Set(doc.entries.map((entry) => entry.id)));
  const poolById = useMemo(() => new Map(pool.map((item) => [item.id, item])), [pool]);
  return (
    <div className="h-full overflow-y-auto p-4">
      {doc.entries.length === 0 ? (
        <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground">暂无规范条目</div>
      ) : <div className="flex flex-col gap-3">
        {doc.entries.map((entry) => {
          const configRefs = entry.target.type === "config" ? entry.target.refs : [];
          const refs = configRefs.map((ref) => poolById.get(refToPoolId(ref))).filter((item): item is ConfigPoolItem => Boolean(item));
          const staleCount = configRefs.length - refs.length;
          const pageCount = entry.target.type === "page" ? entry.target.pageIds.length : 0;
          const open = openIds.has(entry.id);
          return <section key={entry.id} className="overflow-hidden rounded-lg border bg-card">
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50" onClick={() => setOpenIds((current) => {
              const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next;
            })}>
              {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 px-1 py-0.5 text-sm font-semibold">{entry.title || "未命名条目"}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{entry.target.type === "config" ? `${configRefs.length} 项配置` : `页面规范 · ${pageCount} 个页面`}</span>
            </button>
            {open && <div className="border-t px-3 py-3">
              <div className="mx-auto w-full max-w-[760px]">
                {entry.target.type === "config" && configRefs.length > 0 && <table className="w-full border-collapse text-xs"><thead><tr className="text-left text-muted-foreground"><th className="w-[52px] py-1 pr-2 font-medium" /><th className="py-1 pr-2 font-medium">配置项</th><th className="py-1 pr-2 font-medium">格式</th><th className="py-1 font-medium">尺寸</th></tr></thead><tbody>
                  {refs.map((item) => <tr key={item.id} className="hover:bg-accent/40"><td className="py-1 pr-2"><ConfigThumbnail item={item} /></td><td className="font-medium"><div>{item.title}</div>{item.breadcrumbs && item.breadcrumbs.length > 1 && <div className="text-[11px] font-normal text-muted-foreground">{item.breadcrumbs.join(" / ")}</div>}</td><td className="text-muted-foreground">{item.format || "—"}</td><td className="text-muted-foreground">—</td></tr>)}
                  {Array.from({ length: staleCount }).map((_, index) => <tr key={`stale-${index}`} className="text-muted-foreground"><td className="py-1 pr-2"><span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-md border bg-secondary">?</span></td><td className="italic">已失效引用</td><td>—</td><td>—</td></tr>)}
                </tbody></table>}
                <div className={cn(entry.target.type === "config" && configRefs.length > 0 && "mt-3")}><div className="mb-1 text-[11px] font-medium text-muted-foreground">说明</div><PageRequirements markdown={entry.markdown} allowExternalMedia mediaBaseUrl={DATA_BASE} onReferenceClick={onReferenceClick} /></div>
              </div>
            </div>}
          </section>;
        })}
      </div>}
    </div>
  );
}

function ConfigThumbnail({ item }: { item: ConfigPoolItem }) {
  if (item.kind === "color") return <div className="h-[52px] w-[52px] rounded-md border" style={{ background: typeof item.value === "string" ? item.value : "hsl(var(--secondary))" }} />;
  if (item.kind === "image") return <img src={typeof item.value === "string" ? getDataUrl(item.value) : ""} alt={item.title} className="h-[52px] w-[52px] rounded-md border object-cover" />;
  return <div className="flex h-[52px] w-[52px] items-center justify-center rounded-md border text-lg text-muted-foreground">{kindText(item.kind)}</div>;
}

/**
 * 浏览端只读文档视图：仅展示项目知识库和设计规范。
 */
export function ViewerDocumentView({
  projectId,
  items,
  designSpecs,
  projectConfigSchema,
  pages,
  references,
  onReferenceNavigate,
}: ViewerDocumentViewProps) {
  const configPool = useMemo(() => buildConfigPool(projectConfigSchema, pages), [pages, projectConfigSchema]);
  const userItems = useMemo(
    () =>
      items.filter((item) => item.source !== "system").sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", "zh-Hans-CN"),
      ),
    [items],
  );
  const [active, setActive] = useState<
    | { kind: "knowledge"; item: KnowledgeIndexItem }
    | { kind: "designSpec"; item: PublishedDesignSpecMeta }
    | null
  >(null);
  const [content, setContent] = useState("");
  const [designSpec, setDesignSpec] = useState<PublishedDesignSpecDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [referenceNotice, setReferenceNotice] = useState<string | null>(null);

  const referenceTargets = useMemo(
    () => new Map((references?.targets ?? []).map((entry) => [referenceTargetKey(entry.target), entry])),
    [references],
  );

  useEffect(() => {
    if (!active && userItems.length > 0) {
      setActive({ kind: "knowledge", item: userItems[0] });
    } else if (!active && designSpecs.length > 0) {
      setActive({ kind: "designSpec", item: designSpecs[0] });
    }
  }, [active, designSpecs, userItems]);

  useEffect(() => {
    if (!active || active.kind !== "knowledge") {
      setContent("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    getKnowledgeDocContent(projectId, active.item.fileName)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, projectId]);

  useEffect(() => {
    if (!active || active.kind !== "designSpec") {
      setDesignSpec(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDesignSpecDoc(projectId, active.item.id)
      .then((doc) => {
        if (!cancelled) setDesignSpec(normalizePublishedDesignSpecDoc(doc));
      })
      .catch(() => {
        if (!cancelled) setDesignSpec(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, projectId]);

  const handleKnowledgeSelect = useCallback((item: KnowledgeIndexItem) => {
    setActive({ kind: "knowledge", item });
  }, []);
  const handleDesignSpecSelect = useCallback((item: PublishedDesignSpecMeta) => {
    setActive({ kind: "designSpec", item });
  }, []);

  const handleReferenceClick = useCallback(
    ({ target }: { target: MarkdownReferenceTarget; labelSnapshot: string }) => {
      const entry = referenceTargets.get(referenceTargetKey(target));
      if (!entry) {
        setReferenceNotice("该引用在当前发布版本中不可用");
        return;
      }
      setReferenceNotice(null);
      if (target.kind === "document") {
        const item = userItems.find((candidate) => candidate.id === target.docId);
        if (item) {
          setActive({ kind: "knowledge", item });
          return;
        }
        setReferenceNotice("该文档在当前发布版本中不可用");
        return;
      }
      onReferenceNavigate?.(target);
    },
    [onReferenceNavigate, referenceTargets, userItems],
  );

  return (
    <div className="flex h-full min-h-0">
      {/* 目录区 */}
      <div className="flex w-1/4 shrink-0 flex-col overflow-hidden border-r bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
            项目知识库
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-1.5">
            {userItems.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                暂无文档
              </div>
            ) : (
              userItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1.5 pr-2 text-sm transition-colors hover:bg-accent/50",
                    active?.kind === "knowledge" && active.item.id === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground",
                  )}
                  style={{ paddingLeft: 12 }}
                  onClick={() => handleKnowledgeSelect(item)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </div>
              ))
            )}
          </div>
          <div className="border-t p-1.5">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
              设计规范
            </div>
            {designSpecs.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">暂无设计规范</div>
            ) : (
              designSpecs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-sm py-1.5 pr-2 text-left text-sm transition-colors hover:bg-accent/50",
                    active?.kind === "designSpec" && active.item.id === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground",
                  )}
                  style={{ paddingLeft: 12 }}
                  onClick={() => handleDesignSpecSelect(item)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 文档展示区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {active ? active.item.title : "未选择文档"}
            </div>
            {active && (
              <div className="text-[11px] text-muted-foreground">
                {active.item.updatedAt
                  ? `更新于 ${new Date(active.item.updatedAt).toLocaleString()}`
                  : "Markdown 文档"}
              </div>
            )}
          </div>
        </div>
        {referenceNotice && (
          <div role="status" className="border-b bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
            {referenceNotice}
          </div>
        )}
        {!referenceNotice && (references?.unresolvedCount ?? 0) > 0 && (
          <div role="status" className="border-b bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
            当前发布版本中有 {references?.unresolvedCount} 个引用不可用
          </div>
        )}
        <div className="min-h-0 flex-1 p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : active?.kind === "knowledge" ? (
            <DocumentEditor
              value={content}
              onChange={() => {}}
              readOnly
              className="h-full"
              onReferenceClick={handleReferenceClick}
            />
          ) : active?.kind === "designSpec" && designSpec ? (
            <ReadonlyDesignSpec doc={designSpec} pool={configPool} onReferenceClick={handleReferenceClick} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <BookOpen className="mr-2 h-4 w-4" />
              从左侧目录选择文档开始浏览
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
