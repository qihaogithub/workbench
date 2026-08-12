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
} from "@/lib/design-specs";
import {
  HoverPop,
  pageLabel,
  refToPoolId,
  type HoverPopState,
  ZoomOverlay,
} from "./DesignSpecVisuals";

interface DesignSpecWorkspaceValue {
  projectId?: string;
  activeDocId: string | null;
  setActiveDocId: (id: string | null) => void;
  doc: DesignSpecDoc | null;
  pool: ConfigPoolItem[];
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  save: () => void;
  addEntry: (title?: string) => void;
  addEntryWithItem: (itemId: string) => void;
  deleteEntry: (entryId: string) => void;
  toggleEntry: (entryId: string) => void;
  openEntry: (entryId: string) => void;
  renameEntry: (entryId: string, title: string) => void;
  setMarkdown: (entryId: string, md: string) => void;
  bindRef: (itemId: string, entryId: string) => void;
  unbindRef: (itemId: string, entryId: string) => void;
  reorderEntry: (sourceId: string, targetId: string) => void;
  openIds: Set<string>;
  boundIds: Set<string>;
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
  children,
}: {
  workingDir?: string;
  sessionId?: string;
  projectId?: string;
  children: ReactNode;
}) {
  const [activeDocId, setActiveDocIdState] = useState<string | null>(null);
  const [doc, setDoc] = useState<DesignSpecDoc | null>(null);
  const [pool, setPool] = useState<ConfigPoolItem[]>([]);
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
        if (poolData.success) setPool(poolData.data);
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

  const save = useCallback(async () => {
    if (!doc) return;
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
  }, [doc, qs]);

  const updateDoc = useCallback(
    (updater: (d: DesignSpecDoc) => DesignSpecDoc) => {
      setDoc((prev) => {
        if (!prev) return prev;
        return updater(prev);
      });
      setDirty(true);
    },
    [],
  );

  // 自动保存：脏数据出现后防抖 800ms 落盘
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || !doc) return;
    const t = window.setTimeout(() => {
      void saveRef.current();
    }, 800);
    return () => window.clearTimeout(t);
  }, [dirty, doc]);

  const addEntry = useCallback(
    (title?: string) => {
      const finalTitle =
        title ??
        window.prompt("规范条目名称", `新规范 ${(doc?.entries.length || 0) + 1}`);
      if (!finalTitle) return;
      updateDoc((d) => ({
        ...d,
        entries: [
          ...d.entries,
          {
            id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            title: finalTitle,
            markdown: "",
            refs: [],
          },
        ],
      }));
    },
    [doc, updateDoc],
  );

  /** 中栏空白区拖入配置项 → 新建条目并绑定 */
  const addEntryWithItem = useCallback(
    (itemId: string) => {
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
            refs: [
              { scope: item.scope, pageId: item.pageId, fieldKey: item.key },
            ],
          },
        ],
      }));
    },
    [pool, updateDoc],
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

  const bindRef = useCallback(
    (itemId: string, entryId: string) => {
      const item = pool.find((p) => p.id === itemId);
      if (!item) return;
      const ref: DesignSpecRef = {
        scope: item.scope,
        pageId: item.pageId,
        fieldKey: item.key,
      };
      updateDoc((d) => ({
        ...d,
        entries: d.entries.map((e) => {
          if (e.id !== entryId) return e;
          if (e.refs.some((r) => refToPoolId(r) === itemId)) return e;
          return { ...e, refs: [...e.refs, ref] };
        }),
      }));
    },
    [pool, updateDoc],
  );

  const unbindRef = useCallback(
    (itemId: string, entryId: string) => {
      updateDoc((d) => ({
        ...d,
        entries: d.entries.map((e) =>
          e.id === entryId
            ? { ...e, refs: e.refs.filter((r) => refToPoolId(r) !== itemId) }
            : e,
        ),
      }));
    },
    [updateDoc],
  );

  const reorderEntry = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      updateDoc((d) => {
        const from = d.entries.findIndex((e) => e.id === sourceId);
        const to = d.entries.findIndex((e) => e.id === targetId);
        if (from === -1 || to === -1) return d;
        const entries = [...d.entries];
        const [moved] = entries.splice(from, 1);
        entries.splice(to + 1, 0, moved);
        return { ...d, entries };
      });
    },
    [updateDoc],
  );

  const boundIds = useMemo(() => {
    const set = new Set<string>();
    doc?.entries.forEach((e) => e.refs.forEach((r) => set.add(refToPoolId(r))));
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
  }, [filteredPool]);

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
      activeDocId,
      setActiveDocId,
      doc,
      pool,
      loading,
      saving,
      dirty,
      save,
      addEntry,
      addEntryWithItem,
      deleteEntry,
      toggleEntry,
      openEntry,
      renameEntry,
      setMarkdown,
      bindRef,
      unbindRef,
      reorderEntry,
      openIds,
      boundIds,
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
      loading,
      saving,
      dirty,
      save,
      addEntry,
      addEntryWithItem,
      deleteEntry,
      toggleEntry,
      openEntry,
      renameEntry,
      setMarkdown,
      bindRef,
      unbindRef,
      reorderEntry,
      openIds,
      boundIds,
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
