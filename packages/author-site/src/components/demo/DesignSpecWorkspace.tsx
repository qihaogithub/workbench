"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ConfigPoolItem,
  ConfigPoolItemKind,
  DesignSpecDoc,
  DesignSpecEntry,
  DesignSpecRef,
  DesignSpecTarget,
} from "@/lib/design-specs";
import { buildConfigPool } from "@/lib/design-specs/config-pool";
import {
  HoverPop,
  pageLabel,
  refToPoolId,
  type HoverPopState,
  ZoomOverlay,
} from "./DesignSpecVisuals";
import {
  reorderDesignSpecEntries,
  type DesignSpecDropPosition,
} from "./design-spec-order";

interface DesignSpecWorkspaceValue {
  projectId?: string;
  sessionId?: string;
  activeDocId: string | null;
  setActiveDocId: (id: string | null) => void;
  doc: DesignSpecDoc | null;
  pool: ConfigPoolItem[];
  pages: Array<{ id: string; name: string }>;
  loading: boolean;
  saving: boolean;
  readOnly: boolean;
  dirty: boolean;
  save: () => void;
  addEntry: (title?: string, markdown?: string) => void;
  addEntryWithPage: (pageId: string) => void;
  addEntryWithItem: (itemId: string) => void;
  deleteEntry: (entryId: string) => void;
  toggleEntry: (entryId: string) => void;
  openEntry: (entryId: string) => void;
  renameEntry: (entryId: string, title: string) => void;
  setMarkdown: (entryId: string, md: string) => void;
  /** 绑定页面；若条目已有配置项绑定，确认后替换。 */
  bindPage: (entryId: string, pageId: string) => void;
  /** 从页面规范中解绑一个页面，保留规范条目本身。 */
  unbindPage: (pageId: string, entryId: string) => void;
  bindRef: (itemId: string, entryId: string) => void;
  unbindRef: (itemId: string, entryId: string) => void;
  reorderEntry: (
    sourceId: string,
    targetId: string,
    position: DesignSpecDropPosition,
  ) => void;
  openIds: Set<string>;
  boundIds: Set<string>;
  boundPageIds: Set<string>;
  search: string;
  setSearch: (v: string) => void;
  categoryFilter: ConfigPoolItemKind | "all";
  setCategoryFilter: (v: ConfigPoolItemKind | "all") => void;
  bindFilter: "all" | "bound" | "unbound";
  setBindFilter: (v: "all" | "bound" | "unbound") => void;
  collapsedGroups: Set<string>;
  toggleGroup: (name: string) => void;
  filteredPool: ConfigPoolItem[];
  poolGroups: [string, ConfigPoolItem[]][];
  hoverPop: HoverPopState | null;
  setHoverPop: (v: HoverPopState | null) => void;
  zoomed: ConfigPoolItem | null;
  setZoomed: (v: ConfigPoolItem | null) => void;
}

const DesignSpecWorkspaceContext = createContext<DesignSpecWorkspaceValue | null>(
  null,
);

type ConfigSchemaUpdate = {
  scope: "project" | "page";
  schema: string;
  pageId?: string;
  committed: true;
};

function readConfigSchemaUpdate(event: Event): ConfigSchemaUpdate | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object") return null;
  const candidate = detail as Record<string, unknown>;
  if (
    (candidate.scope !== "project" && candidate.scope !== "page") ||
    typeof candidate.schema !== "string" ||
    candidate.committed !== true ||
    (candidate.scope === "page" && typeof candidate.pageId !== "string")
  ) {
    return null;
  }
  return {
    scope: candidate.scope,
    schema: candidate.schema,
    pageId: typeof candidate.pageId === "string" ? candidate.pageId : undefined,
    committed: true,
  };
}

/**
 * 已持久化的 Schema 事件可立即投影当前表格；后续服务端刷新始终覆盖该投影。
 */
function applyConfigSchemaUpdates(
  source: ConfigPoolItem[],
  pages: Array<{ id: string; name: string }>,
  updates: { project?: string; pages: Record<string, string> },
): ConfigPoolItem[] {
  let next = source;
  if (updates.project !== undefined) {
    const projectItems = buildConfigPool(
      updates.project,
      pages.map((page) => ({ ...page, schema: "{}" })),
    );
    next = [...projectItems, ...next.filter((item) => item.scope !== "project")];
  }

  for (const [pageId, schema] of Object.entries(updates.pages)) {
    const existingIndex = next.findIndex(
      (item) => item.scope === "page" && item.pageId === pageId,
    );
    const existingPageItem =
      existingIndex >= 0 ? next[existingIndex] : undefined;
    const page = pages.find((item) => item.id === pageId);
    const pageItems = buildConfigPool(undefined, [
      {
        id: pageId,
        name: page?.name ?? existingPageItem?.pageName ?? pageId,
        schema,
      },
    ]);
    const withoutPageItems = next.filter(
      (item) => item.scope !== "page" || item.pageId !== pageId,
    );
    if (existingIndex < 0) {
      next = [...withoutPageItems, ...pageItems];
      continue;
    }
    next = [
      ...withoutPageItems.slice(0, existingIndex),
      ...pageItems,
      ...withoutPageItems.slice(existingIndex),
    ];
  }
  return next;
}

export function useDesignSpecWorkspace(): DesignSpecWorkspaceValue {
  const ctx = useContext(DesignSpecWorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useDesignSpecWorkspace must be used within DesignSpecWorkspaceProvider",
    );
  }
  return ctx;
}

export function DesignSpecWorkspaceProvider({
  workingDir,
  sessionId,
  projectId,
  readOnly = false,
  children,
}: {
  workingDir?: string;
  sessionId?: string;
  projectId?: string;
  readOnly?: boolean;
  children: ReactNode;
}) {
  const [activeDocId, setActiveDocIdState] = useState<string | null>(null);
  const [doc, setDoc] = useState<DesignSpecDoc | null>(null);
  const [pool, setPool] = useState<ConfigPoolItem[]>([]);
  const [pages, setPages] = useState<Array<{ id: string; name: string }>>([]);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    ConfigPoolItemKind | "all"
  >("all");
  const [bindFilter, setBindFilter] = useState<"all" | "bound" | "unbound">(
    "unbound",
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [hoverPop, setHoverPop] = useState<HoverPopState | null>(null);
  const [zoomed, setZoomed] = useState<ConfigPoolItem | null>(null);

  const params = new URLSearchParams();
  if (workingDir) params.set("workingDir", workingDir);
  if (sessionId) params.set("sessionId", sessionId);
  if (projectId) params.set("projectId", projectId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const setActiveDocId = useCallback((id: string | null) => {
    setActiveDocIdState(id);
  }, []);

  // 加载文档 + 素材池（仅在选中设计规范时加载）
  useEffect(() => {
    if (!activeDocId) {
      setDoc(null);
      setPool([]);
      setPages([]);
      setDirty(false);
      setOpenIds(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    const loadBoth = async () => {
      try {
        const [docRes, poolRes] = await Promise.all([
          fetch(`/api/design-specs/${activeDocId}${qs}`),
          fetch(`/api/design-specs/config-pool${qs}`),
        ]);
        const docData = await docRes.json();
        const poolData = await poolRes.json();
        if (cancelled) return;
        if (docData.success) {
          setDoc(docData.data);
          setDirty(false);
          setOpenIds(new Set());
        }
        if (poolData.success) {
          const nextPages = Array.isArray(poolData.data?.pages) ? poolData.data.pages : [];
          pagesRef.current = nextPages;
          setPages(nextPages);
          const nextPool = Array.isArray(poolData.data) ? poolData.data : poolData.data?.pool ?? [];
          setPool(nextPool);
        }
      } catch {
        // 静默失败
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadBoth();
    return () => {
      cancelled = true;
    };
  }, [activeDocId, qs]);

  // 配置定义编辑器保存 Schema 后，素材池中的标题、类型和尺寸也必须
  // 重新投影；否则设计规范卡片会继续展示首次打开时的旧字段信息。
  useEffect(() => {
    if (!activeDocId) return;
    let cancelled = false;
    let timers: number[] = [];
    const refreshPool = async () => {
      try {
        const response = await fetch(`/api/design-specs/config-pool${qs}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (cancelled || !payload.success) return;
        const nextPages = Array.isArray(payload.data?.pages) ? payload.data.pages : [];
        pagesRef.current = nextPages;
        setPages(nextPages);
        const nextPool = Array.isArray(payload.data) ? payload.data : payload.data?.pool ?? [];
        setPool(nextPool);
      } catch {
        // 保存同步存在短暂延迟时保持当前素材池，后续事件或重新打开会重试。
      }
    };
    const handleConfigSchemaUpdated = (event: Event) => {
      const update = readConfigSchemaUpdate(event);
      if (update) {
        setPool((current) =>
          applyConfigSchemaUpdates(
            current,
            pagesRef.current,
            update.scope === "project"
              ? { project: update.schema, pages: {} }
              : { pages: { [update.pageId!]: update.schema } },
          ),
        );
      }
      timers.forEach((timer) => window.clearTimeout(timer));
      // 事件只在提交后触发；服务端结果是唯一长期来源。
      timers = [200, 1000].map((delay) =>
        window.setTimeout(() => {
          void refreshPool();
        }, delay),
      );
    };
    window.addEventListener("config-schema-updated", handleConfigSchemaUpdated);
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("config-schema-updated", handleConfigSchemaUpdated);
    };
  }, [activeDocId, qs]);

  const save = useCallback(async () => {
    if (!doc || readOnly) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/design-specs/${doc.id}${qs}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
      });
      const data = await res.json();
      if (data.success) {
        setDirty(false);
        setDoc(data.data);
        window.dispatchEvent(new Event("design-spec-updated"));
      }
    } catch {
      // 静默失败
    } finally {
      setSaving(false);
    }
  }, [doc, qs, readOnly]);

  const updateDoc = useCallback(
    (updater: (d: DesignSpecDoc) => DesignSpecDoc) => {
      if (readOnly) return;
      setDoc((prev) => {
        if (!prev) return prev;
        return updater(prev);
      });
      setDirty(true);
    },
    [readOnly],
  );

  // 自动保存：脏数据出现后防抖 800ms 落盘
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || !doc || readOnly) return;
    const t = window.setTimeout(() => {
      void saveRef.current();
    }, 800);
    return () => window.clearTimeout(t);
  }, [dirty, doc, readOnly]);

  const addEntry = useCallback(
    (title?: string, markdown = "") => {
      if (readOnly) return;
      const finalTitle =
        title ??
        window.prompt("页面规范名称", `新页面规范 ${(doc?.entries.length || 0) + 1}`);
      if (!finalTitle) return;
      updateDoc((d) => ({
        ...d,
        entries: [
          ...d.entries,
          {
            id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            title: finalTitle,
            markdown,
            target: { type: "page", pageIds: [] },
          },
        ],
      }));
    },
    [doc, updateDoc, readOnly],
  );

  /** 中栏空白区拖入配置项 → 新建条目并绑定 */
  const addEntryWithItem = useCallback(
    (itemId: string) => {
      if (readOnly) return;
      const item = pool.find((p) => p.id === itemId);
      if (!item) return;
      updateDoc((d) => ({
        ...d,
        entries: [
          ...d.entries,
          {
            id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            title: item.title,
            markdown: "",
            target: {
              type: "config",
              refs: [{ scope: item.scope, pageId: item.pageId, fieldKey: item.key }],
            },
          },
        ],
      }));
    },
    [pool, updateDoc, readOnly],
  );

  /** 右侧页面拖入空白区 → 新建并绑定页面规范。 */
  const addEntryWithPage = useCallback(
    (pageId: string) => {
      if (readOnly) return;
      const page = pages.find((candidate) => candidate.id === pageId);
      if (!page) return;
      updateDoc((d) => ({
        ...d,
        entries: [
          ...d.entries,
          {
            id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            title: page.name,
            markdown: "",
            target: { type: "page", pageIds: [page.id] },
          },
        ],
      }));
    },
    [pages, updateDoc, readOnly],
  );

  const deleteEntry = useCallback(
    (entryId: string) => {
      if (!window.confirm("确定删除该规范条目吗？")) return;
      updateDoc((d) => ({
        ...d,
        entries: d.entries.filter((e) => e.id !== entryId),
      }));
    },
    [updateDoc],
  );

  const toggleEntry = useCallback((entryId: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }, []);

  const openEntry = useCallback((entryId: string) => {
    setOpenIds((prev) => (prev.has(entryId) ? prev : new Set([...prev, entryId])));
  }, []);

  const renameEntry = useCallback(
    (entryId: string, title: string) => {
      updateDoc((d) => ({
        ...d,
        entries: d.entries.map((e) => (e.id === entryId ? { ...e, title } : e)),
      }));
    },
    [updateDoc],
  );

  const setMarkdown = useCallback(
    (entryId: string, markdown: string) => {
      updateDoc((d) => ({
        ...d,
        entries: d.entries.map((e) =>
          e.id === entryId ? { ...e, markdown } : e,
        ),
      }));
    },
    [updateDoc],
  );

  const confirmTargetReplacement = useCallback(
    (entryId: string, nextType: DesignSpecTarget["type"]): boolean => {
      const entry = doc?.entries.find((candidate) => candidate.id === entryId);
      if (!entry || entry.target.type === nextType) return true;
      const hasExistingBinding = entry.target.type === "page"
        ? entry.target.pageIds.length > 0
        : entry.target.refs.length > 0;
      if (!hasExistingBinding) return true;
      return window.confirm(
        "该规范已绑定另一类对象，切换后会清除原有绑定。确定继续吗？",
      );
    },
    [doc],
  );

  const bindPage = useCallback(
    (entryId: string, pageId: string) => {
      if (readOnly || !pages.some((page) => page.id === pageId)) return;
      if (!confirmTargetReplacement(entryId, "page")) return;
      updateDoc((d) => ({
        ...d,
        entries: d.entries.map((entry) => {
          if (entry.id !== entryId) return entry;
          const pageIds = entry.target.type === "page"
            ? Array.from(new Set([...entry.target.pageIds, pageId]))
            : [pageId];
          return { ...entry, target: { type: "page", pageIds } };
        }),
      }));
    },
    [confirmTargetReplacement, pages, readOnly, updateDoc],
  );

  const bindRef = useCallback(
    (itemId: string, entryId: string) => {
      const item = pool.find((p) => p.id === itemId);
      if (!item) return;
      if (readOnly || !confirmTargetReplacement(entryId, "config")) return;
      const ref: DesignSpecRef = {
        scope: item.scope,
        pageId: item.pageId,
        fieldKey: item.key,
      };
      updateDoc((d) => ({
        ...d,
        entries: d.entries.map((e) => {
          if (e.id !== entryId) return e;
          if (e.target.type === "config") {
            if (e.target.refs.some((r) => refToPoolId(r) === itemId)) return e;
            return { ...e, target: { type: "config", refs: [...e.target.refs, ref] } };
          }
          return { ...e, target: { type: "config", refs: [ref] } };
        }),
      }));
    },
    [confirmTargetReplacement, pool, readOnly, updateDoc],
  );

  const unbindPage = useCallback(
    (pageId: string, entryId: string) => {
      updateDoc((d) => ({
        ...d,
        entries: d.entries.map((entry) =>
          entry.id === entryId && entry.target.type === "page"
            ? {
                ...entry,
                target: {
                  type: "page",
                  pageIds: entry.target.pageIds.filter((id) => id !== pageId),
                },
              }
            : entry,
        ),
      }));
    },
    [updateDoc],
  );

  const unbindRef = useCallback(
    (itemId: string, entryId: string) => {
      updateDoc((d) => ({
        ...d,
        entries: d.entries.map((e) =>
          e.id === entryId && e.target.type === "config"
            ? { ...e, target: { type: "config", refs: e.target.refs.filter((r) => refToPoolId(r) !== itemId) } }
            : e,
        ),
      }));
    },
    [updateDoc],
  );

  const reorderEntry = useCallback(
    (sourceId: string, targetId: string, position: DesignSpecDropPosition) => {
      if (sourceId === targetId) return;
      updateDoc((d) => {
        const entries = reorderDesignSpecEntries(d.entries, sourceId, targetId, position);
        return entries === d.entries ? d : { ...d, entries };
      });
    },
    [updateDoc],
  );

  const boundIds = useMemo(() => {
    const set = new Set<string>();
    doc?.entries.forEach((entry) => {
      if (entry.target.type === "config") {
        entry.target.refs.forEach((ref) => set.add(refToPoolId(ref)));
      }
    });
    return set;
  }, [doc]);

  const boundPageIds = useMemo(() => {
    const set = new Set<string>();
    doc?.entries.forEach((entry) => {
      if (entry.target.type === "page") {
        entry.target.pageIds.forEach((pageId) => set.add(pageId));
      }
    });
    return set;
  }, [doc]);

  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((it) => {
      if (categoryFilter !== "all" && it.kind !== categoryFilter) return false;
      if (bindFilter === "bound" && !boundIds.has(it.id)) return false;
      if (bindFilter === "unbound" && boundIds.has(it.id)) return false;
      if (
        q &&
        !(it.title + it.key + pageLabel(it) + (it.category || ""))
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [pool, search, categoryFilter, bindFilter, boundIds]);

  /** 按受影响页面分组：项目级配置拆分到各页面，无独立"项目级"分组 */
  const poolGroups = useMemo(() => {
    const groups = new Map<string, ConfigPoolItem[]>();
    const query = search.trim().toLowerCase();
    // 页面节点本身也是可绑定的规范项，即使页面暂时没有配置字段也要保留。
    for (const page of pages) {
      if (!query || page.name.toLowerCase().includes(query)) {
        groups.set(page.name, []);
      }
    }
    for (const it of filteredPool) {
      const pages =
        it.scope === "project" && it.pages?.length ? it.pages : [pageLabel(it)];
      for (const p of pages) {
        const arr = groups.get(p) || [];
        arr.push(it);
        groups.set(p, arr);
      }
    }
    return Array.from(groups.entries());
  }, [filteredPool, pages, search]);

  const toggleGroup = useCallback((name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // 全局鼠标事件用于悬停气泡
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (hoverPop)
        setHoverPop((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h));
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [hoverPop]);

  const value = useMemo<DesignSpecWorkspaceValue>(
    () => ({
      projectId,
      sessionId,
      activeDocId,
      setActiveDocId,
      doc,
      pool,
      pages,
      loading,
      saving,
      readOnly,
      dirty,
      save,
      addEntry,
      addEntryWithPage,
      addEntryWithItem,
      deleteEntry,
      toggleEntry,
      openEntry,
      renameEntry,
      setMarkdown,
      bindPage,
      unbindPage,
      bindRef,
      unbindRef,
      reorderEntry,
      openIds,
      boundIds,
      boundPageIds,
      search,
      setSearch,
      categoryFilter,
      setCategoryFilter,
      bindFilter,
      setBindFilter,
      collapsedGroups,
      toggleGroup,
      filteredPool,
      poolGroups,
      hoverPop,
      setHoverPop,
      zoomed,
      setZoomed,
    }),
    [
      activeDocId,
      projectId,
      setActiveDocId,
      doc,
      pool,
      pages,
      loading,
      saving,
      readOnly,
      dirty,
      save,
      addEntry,
      addEntryWithPage,
      addEntryWithItem,
      deleteEntry,
      toggleEntry,
      openEntry,
      renameEntry,
      setMarkdown,
      bindPage,
      unbindPage,
      bindRef,
      unbindRef,
      reorderEntry,
      openIds,
      boundIds,
      boundPageIds,
      search,
      categoryFilter,
      bindFilter,
      collapsedGroups,
      toggleGroup,
      filteredPool,
      poolGroups,
      hoverPop,
      zoomed,
    ],
  );

  return (
    <DesignSpecWorkspaceContext.Provider value={value}>
      {children}
      <HoverPop pop={hoverPop} projectId={projectId} />
      {zoomed && <ZoomOverlay item={zoomed} projectId={projectId} onClose={() => setZoomed(null)} />}
    </DesignSpecWorkspaceContext.Provider>
  );
}
