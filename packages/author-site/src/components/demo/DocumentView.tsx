"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  History,
  Loader2,
  MoreVertical,
  Plus,
  Pencil,
  ScrollText,
  Trash2,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DocumentEditor,
  type MarkdownReferenceClickHandler,
  type MarkdownReferenceContext,
  type MarkdownReferenceProvider,
} from "@workbench/demo-ui/DocumentEditor";
import {
  serializeMarkdownReference,
  type MarkdownReferenceSource,
  type MarkdownReferenceTarget,
} from "@workbench/shared/markdown-reference";
import type { KnowledgeItem } from "./KnowledgeDocDialog";
import type { CommentTarget, DocumentCommentAnchor } from "@workbench/shared";
import { DesignSpecEditor } from "./DesignSpecEditor";
import {
  MarkdownReferenceLinksPanel,
  type MarkdownReferenceMention,
} from "./MarkdownReferenceLinksPanel";
import { createAuthorReferenceProvider, navigateToMarkdownMention, type AuthorDocumentReference } from "./markdown-reference-navigation";
import { DocumentProposalReviewDialog } from "./DocumentProposalReviewDialog";
import type { DesignSpecMeta, DesignSpecRef } from "@/lib/design-specs";
import type { UserRole } from "@/lib/user";
import { cn } from "@/lib/utils";
import {
  getKnowledgeUploadTitle,
  isSupportedKnowledgeUpload,
} from "./document-view-knowledge";
import { toKnowledgeItem, toKnowledgeItems } from "./document-api-adapter";
import { localizeRemoteImageForSession } from "@workbench/demo-ui/markdown/remote-image-localizer";
import {
  DocumentSaveCoordinator,
  DocumentSaveError,
  type DocumentSaveSnapshot,
  toDocumentSaveError,
} from "@/lib/document-save-coordinator";
import {
  createOfflineDraftStore,
  type OfflineDraftStore,
} from "@/lib/workspace-offline-drafts";
import { DocumentSaveStatusBar } from "./DocumentSaveStatusBar";

export interface PageItem {
  id: string;
  name: string;
}

const EMPTY_PAGE_ITEMS: PageItem[] = [];

function isWithinDropdownMenu(target: EventTarget | null): target is Element {
  return target instanceof Element && Boolean(target.closest('[role="menu"]'));
}

/** 右侧编辑区当前打开的目标：知识库文档 / AI 记忆 / 项目公约 / 页面公约 / 设计规范 */
type ActiveTarget =
  | { kind: "knowledge"; item: KnowledgeItem }
  | { kind: "memory" }
  | { kind: "convention" }
  | { kind: "pageConvention"; page: PageItem }
  | { kind: "designSpec"; doc: DesignSpecMeta };

/** 解析 workspace files 接口中的路径（memory/convention/pageConvention） */
function resolveWorkspaceFilePath(target: ActiveTarget): string | null {
  if (target.kind === "memory") return "memory.md";
  if (target.kind === "convention") return "convention.md";
  if (target.kind === "pageConvention") return `demos/${target.page.id}/convention.md`;
  return null;
}

function buildInitialConventionContent(target: ActiveTarget): string {
  if (target.kind === "convention") {
    return `# 项目公约

> 项目级的创作约定，AI 必须严格遵守。由用户维护。

## 通用约定

- （在此记录项目级的通用约定）
`;
  }

  return `# 页面公约

> 仅适用于当前页面的创作约定，AI 必须严格遵守。由用户维护。

## 页面约定

- （在此记录当前页面的约定）
`;
}

function getContentCacheKey(target: ActiveTarget): string {
  if (target.kind === "knowledge") return `knowledge:${target.item.id}`;
  if (target.kind === "memory") return "workspace:memory.md";
  if (target.kind === "convention") return "workspace:convention.md";
  if (target.kind === "pageConvention") {
    return `workspace:demos/${target.page.id}/convention.md`;
  }
  return `design-spec:${target.doc.id}`;
}

export interface DocumentViewProps {
  referenceFocus?: AuthorDocumentReference | null;
  onReferenceFocusConsumed?: () => void;
  workingDir?: string;
  projectId?: string;
  documentApiMode?: "legacy" | "project";
  workspaceId?: string;
  sessionId?: string;
  pages?: PageItem[];
  onItemsChange?: (items: KnowledgeItem[]) => void;
  onItemsLoaded?: (items: KnowledgeItem[]) => void;
  onDocHistory?: (item: KnowledgeItem) => void;
  onDocDeleted?: (item: KnowledgeItem) => void;
  designSpecFocus?: { docId: string; entryId: string } | null;
  onEditConfigDefinition?: (target: DesignSpecRef) => void;
  onCommentTargetChange?: (target: CommentTarget | null) => void;
  onDocumentCommentSelection?: (anchor: DocumentCommentAnchor) => void;
  userRole?: UserRole | "";
  onReferenceClick?: MarkdownReferenceClickHandler;
}

export function DocumentView({
  referenceFocus,
  onReferenceFocusConsumed,
  workingDir,
  projectId,
  documentApiMode = "legacy",
  workspaceId,
  sessionId,
  pages = EMPTY_PAGE_ITEMS,
  onItemsChange,
  onItemsLoaded,
  onDocHistory,
  onDocDeleted,
  designSpecFocus,
  onEditConfigDefinition,
  onCommentTargetChange,
  onDocumentCommentSelection,
  userRole = "",
  onReferenceClick,
}: DocumentViewProps) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const canManageGovernance = userRole === "admin";
  const [loading, setLoading] = useState(false);
  const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null);
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentReloadRevision, setContentReloadRevision] = useState(0);
  const [workspaceSaveBlocked, setWorkspaceSaveBlocked] = useState(false);
  const [saveSnapshot, setSaveSnapshot] = useState<DocumentSaveSnapshot>({
    status: "clean",
    error: null,
    localRevision: 0,
    committedRevision: 0,
    hasLocalDraft: false,
  });
  const activeTargetRef = useRef<ActiveTarget | null>(null);
  activeTargetRef.current = activeTarget;
  const activeDocumentReadOnly = Boolean(
    activeTarget &&
      (activeTarget.kind === "convention" || activeTarget.kind === "pageConvention") &&
      !canManageGovernance,
  );
  const draftStoreRef = useRef<OfflineDraftStore | null>(null);
  if (!draftStoreRef.current) draftStoreRef.current = createOfflineDraftStore();
  const [userExpanded, setUserExpanded] = useState(true);
  const [conventionExpanded, setConventionExpanded] = useState(true);
  const [existingConventionPaths, setExistingConventionPaths] = useState<Set<string>>(
    new Set(),
  );
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [designSpecs, setDesignSpecs] = useState<DesignSpecMeta[]>([]);
  const [designSpecsLoading, setDesignSpecsLoading] = useState(false);
  const [designSpecExpanded, setDesignSpecExpanded] = useState(true);
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [knowledgeMenuOpen, setKnowledgeMenuOpen] = useState(false);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [proposalReviewOpen, setProposalReviewOpen] = useState(false);
  const [renamingKnowledgeId, setRenamingKnowledgeId] = useState<string | null>(null);
  const [renamingKnowledgeTitle, setRenamingKnowledgeTitle] = useState("");
  const [renamingDesignSpecId, setRenamingDesignSpecId] = useState<string | null>(null);
  const [renamingDesignSpecTitle, setRenamingDesignSpecTitle] = useState("");
  const knowledgeMutationVersionRef = useRef(0);
  const designSpecMutationVersionRef = useRef(0);
  const knowledgeUploadInputRef = useRef<HTMLInputElement>(null);
  const designSpecRenameBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designSpecRenameInputRef = useRef<HTMLInputElement>(null);
  // 同一视图内切换文档时复用已读取的正文；资源列表刷新时会清空该缓存。
  const contentCacheRef = useRef(new Map<string, string>());
  const referenceEditorContainerRef = useRef<HTMLDivElement>(null);
  const referenceDirectoryRef = useRef<HTMLDivElement>(null);
  const consumedReferenceFocusRef = useRef<AuthorDocumentReference | null>(null);

  useEffect(() => {
    if (!referenceFocus || referenceFocus.projectId !== projectId || consumedReferenceFocusRef.current === referenceFocus) return;
    let next: ActiveTarget | undefined;
    switch (referenceFocus.documentKind ?? "knowledge") {
      case "knowledge": {
        const item = items.find((entry) => entry.id === referenceFocus.docId);
        if (item) next = { kind: "knowledge", item };
        break;
      }
      case "memory": next = { kind: "memory" }; break;
      case "project-convention": next = { kind: "convention" }; break;
      case "page-convention": {
        const page = pages.find((entry) => entry.id === referenceFocus.docId);
        if (page) next = { kind: "pageConvention", page };
        break;
      }
      case "design-spec": {
        const doc = designSpecs.find((entry) => entry.id === referenceFocus.docId);
        if (doc) next = { kind: "designSpec", doc };
        break;
      }
    }
    if (!next) return;
    consumedReferenceFocusRef.current = referenceFocus;
    setActiveTarget(next);
    setUserExpanded(true);
    setConventionExpanded(true);
    setDesignSpecExpanded(true);
    onReferenceFocusConsumed?.();
  }, [referenceFocus, projectId, items, pages, designSpecs, onReferenceFocusConsumed]);

  const referenceProvider = useMemo<MarkdownReferenceProvider | undefined>(
    () => projectId ? createAuthorReferenceProvider(projectId, sessionId) : undefined,
    [projectId, sessionId],
  );

  const activeReferenceContext = useMemo<MarkdownReferenceContext | undefined>(() => {
    if (!projectId || !workspaceId || !activeTarget) return undefined;
    let source: MarkdownReferenceContext["source"];
    if (activeTarget.kind === "knowledge") {
      if (activeTarget.item.source !== "user") return undefined;
      source = {
        kind: "knowledge-document",
        projectId,
        workspaceId,
        docId: activeTarget.item.id,
      };
    } else if (activeTarget.kind === "memory") {
      source = { kind: "workspace-memory", projectId, workspaceId };
    } else if (activeTarget.kind === "convention") {
      source = { kind: "project-convention", projectId, workspaceId };
    } else if (activeTarget.kind === "pageConvention") {
      source = { kind: "page-convention", projectId, workspaceId, pageId: activeTarget.page.id };
    } else {
      return undefined;
    }
    return {
      source,
      policy: {
        allowedTargetKinds: ["project", "page", "config", "document"],
        sameProjectOnly: false,
        allowUnresolved: false,
      },
    };
  }, [activeTarget, projectId, workspaceId]);

  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;
  const onItemsLoadedRef = useRef(onItemsLoaded);
  onItemsLoadedRef.current = onItemsLoaded;

  useEffect(() => {
    contentCacheRef.current.clear();
  }, [documentApiMode, projectId, workingDir, sessionId]);

  const localizeRemoteImage = useMemo(
    () =>
      sessionId
        ? (url: string) => localizeRemoteImageForSession(sessionId, url)
        : undefined,
    [sessionId],
  );

  const userItems = useMemo(
    () => items.filter((item) => item.source !== "system"),
    [items],
  );

  const fetchItems = useCallback(async () => {
    if (!workingDir && !(documentApiMode === "project" && projectId)) return;
    const requestMutationVersion = knowledgeMutationVersionRef.current;
    setLoading(true);
    try {
      const params = workingDir ? new URLSearchParams({ workingDir }) : new URLSearchParams();
      if (projectId && documentApiMode === "legacy") params.set("projectId", projectId);
      if (sessionId && documentApiMode === "legacy") params.set("sessionId", sessionId);
      const res = await fetch(
        documentApiMode === "project" && projectId
          ? `/api/projects/${encodeURIComponent(projectId)}/documents${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
          : `/api/knowledge?${params.toString()}`,
      );
      const data = await res.json();
      if (data.success) {
        if (knowledgeMutationVersionRef.current !== requestMutationVersion) return;
        const nextItems = documentApiMode === "project"
          ? toKnowledgeItems(data.data)
          : data.data;
        setItems(nextItems);
        onItemsChangeRef.current?.(nextItems);
        onItemsLoadedRef.current?.(nextItems);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [documentApiMode, workingDir, projectId, sessionId]);

  const fetchDesignSpecs = useCallback(async () => {
    if (!workingDir) return;
    const requestMutationVersion = designSpecMutationVersionRef.current;
    setDesignSpecsLoading(true);
    try {
      const params = new URLSearchParams({ workingDir });
      if (sessionId) params.set("sessionId", sessionId);
      if (projectId) params.set("projectId", projectId);
      const res = await fetch(`/api/design-specs?${params.toString()}`);
      const data = await res.json();
      if (data.success && designSpecMutationVersionRef.current === requestMutationVersion) {
        setDesignSpecs(data.data || []);
      }
    } catch {
      // 静默失败
    } finally {
      setDesignSpecsLoading(false);
    }
  }, [workingDir, sessionId, projectId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetchDesignSpecs();
  }, [fetchDesignSpecs]);

  useEffect(() => {
    if (!designSpecFocus) return;
    const doc = designSpecs.find((item) => item.id === designSpecFocus.docId);
    if (!doc) return;
    setDesignSpecExpanded(true);
    setActiveTarget({ kind: "designSpec", doc });
    setFocusedEntryId(designSpecFocus.entryId);
  }, [designSpecFocus, designSpecs]);

  const fetchExistingConventions = useCallback(async () => {
    if (!sessionId) {
      setExistingConventionPaths(new Set());
      return;
    }
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/workspace/files?include=conventions`,
      );
      const data = await res.json();
      setExistingConventionPaths(new Set(data.success ? data.data.paths || [] : []));
    } catch {
      setExistingConventionPaths(new Set());
    }
  }, [sessionId]);

  useEffect(() => {
    fetchExistingConventions();
  }, [fetchExistingConventions]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail && typeof detail === "object") {
        const update = detail as Record<string, unknown>;
        if (
          typeof update.docId === "string" &&
          typeof update.title === "string" &&
          update.title.trim()
        ) {
          const title = update.title.trim();
          if (event.type === "knowledge-updated") {
            setItems((current) =>
              current.map((item) =>
                item.id === update.docId ? { ...item, title } : item,
              ),
            );
            setActiveTarget((current) =>
              current?.kind === "knowledge" && current.item.id === update.docId
                ? { kind: "knowledge", item: { ...current.item, title } }
                : current,
            );
            return;
          }
          if (event.type === "design-spec-updated") {
            setDesignSpecs((current) =>
              current.map((doc) =>
                doc.id === update.docId ? { ...doc, title } : doc,
              ),
            );
            setActiveTarget((current) =>
              current?.kind === "designSpec" && current.doc.id === update.docId
                ? { kind: "designSpec", doc: { ...current.doc, title } }
                : current,
            );
            return;
          }
        }
      }
      contentCacheRef.current.clear();
      fetchItems();
      fetchDesignSpecs();
    };
    window.addEventListener("knowledge-updated", handler);
    window.addEventListener("design-spec-updated", handler);
    return () => {
      window.removeEventListener("knowledge-updated", handler);
      window.removeEventListener("design-spec-updated", handler);
    };
  }, [fetchItems, fetchDesignSpecs]);

  useEffect(() => {
    const handler = (event: Event) => {
      const id = (event as CustomEvent<{ proposalId?: unknown }>).detail?.proposalId;
      if (typeof id === "string") { setProposalId(id); setProposalReviewOpen(true); }
    };
    window.addEventListener("document-proposal-created", handler);
    return () => window.removeEventListener("document-proposal-created", handler);
  }, []);

  // 默认选中第一个用户文档
  useEffect(() => {
    if (!referenceFocus && !activeTarget && userItems.length > 0 && !loading) {
      setActiveTarget({ kind: "knowledge", item: userItems[0] });
    }
  }, [activeTarget, userItems, loading, referenceFocus]);

  /** 把指定目标的 markdown 内容写回服务端 */
  const saveTarget = useCallback(
    async (target: ActiveTarget, markdown: string) => {
      if ((target.kind === "convention" || target.kind === "pageConvention") && !canManageGovernance) {
        throw new DocumentSaveError("当前没有保存此公约的权限。", {
          code: "PERMISSION_DENIED",
        });
      }
      if (target.kind === "knowledge") {
        if (!workingDir && !(documentApiMode === "project" && projectId)) {
          throw new DocumentSaveError("工作空间尚未准备好保存。", {
            code: "UNKNOWN",
          });
        }
        const params = workingDir ? new URLSearchParams({ workingDir }) : new URLSearchParams();
        if (projectId && documentApiMode === "legacy") params.set("projectId", projectId);
        if (sessionId && documentApiMode === "legacy") params.set("sessionId", sessionId);
        const res = await fetch(
          documentApiMode === "project" && projectId
            ? `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(target.item.id)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
            : `/api/knowledge/${target.item.id}?${params.toString()}`,
          {
            method: documentApiMode === "project" ? "PATCH" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: markdown }),
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw toDocumentSaveError(
            data ? { ...data, status: res.status } : { status: res.status },
            "保存失败",
          );
        }
        const updated = documentApiMode === "project"
          ? toKnowledgeItem(data.data.snapshot)
          : data.data as KnowledgeItem;
        const currentItems = itemsRef.current;
        const nextItems = currentItems.some((item) => item.id === updated.id)
          ? currentItems.map((item) => (item.id === updated.id ? updated : item))
          : [...currentItems, updated];
        setItems(nextItems);
        onItemsChangeRef.current?.(nextItems);
        window.dispatchEvent(new Event("knowledge-updated"));
        return;
      }

      if (!sessionId) {
        throw new DocumentSaveError("当前会话尚未准备好保存。", {
          code: "UNKNOWN",
        });
      }
      const filePath = resolveWorkspaceFilePath(target);
      if (!filePath) {
        throw new DocumentSaveError("当前文档没有可保存的路径。", {
          code: "VALIDATION_FAILED",
        });
      }
      const res = await fetch(
        `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: markdown }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw toDocumentSaveError(
          data ? { ...data, status: res.status } : { status: res.status },
          "保存失败",
        );
      }
    },
    [documentApiMode, workingDir, projectId, sessionId, canManageGovernance],
  );

  const openOrCreateConvention = useCallback(
    async (target: Extract<ActiveTarget, { kind: "convention" | "pageConvention" }>) => {
      if (!canManageGovernance) return;
      const filePath = resolveWorkspaceFilePath(target);
      if (!filePath) return;
      if (existingConventionPaths.has(filePath)) {
        setActiveTarget(target);
        setConventionExpanded(true);
        return;
      }
      const initialContent = buildInitialConventionContent(target);
      try {
        await saveTarget(target, initialContent);
      } catch (error) {
        toast({
          title: "创建公约失败",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
        return;
      }
      setExistingConventionPaths((current) => new Set(current).add(filePath));
      contentCacheRef.current.set(getContentCacheKey(target), initialContent);
      setContent(initialContent);
      setActiveTarget(target);
      setConventionExpanded(true);
    },
    [existingConventionPaths, saveTarget, canManageGovernance, toast],
  );

  const deleteConvention = useCallback(
    async (target: Extract<ActiveTarget, { kind: "convention" | "pageConvention" }>) => {
      if (!canManageGovernance) return;
      const filePath = resolveWorkspaceFilePath(target);
      if (!filePath || !sessionId) return;
      const label = target.kind === "convention" ? "项目公约" : `${target.page.name}的页面公约`;
      if (!window.confirm(`确定删除「${label}」吗？删除后无法恢复。`)) return;
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message || "删除失败");
        setExistingConventionPaths((current) => {
          const next = new Set(current);
          next.delete(filePath);
          return next;
        });
        setActiveTarget((current) =>
          current && resolveWorkspaceFilePath(current) === filePath ? null : current,
        );
        toast({ title: "公约已删除" });
      } catch (error) {
        toast({
          title: "删除公约失败",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      }
    },
    [sessionId, toast, canManageGovernance],
  );

  // ── 文档保存协调器：编辑、切换目标和卸载共用同一条提交链路 ──────────
  // 目标对象可能因为重命名而重新创建，所以保存回调始终从 ref 读取最新目标；
  // 协调器本身只按稳定 cache key 重建，避免重命名或列表刷新丢失未提交内容。
  const activeTargetKey = activeTarget ? getContentCacheKey(activeTarget) : null;
  const coordinatorRef = useRef<DocumentSaveCoordinator<string> | null>(null);

  const coordinator = useMemo<DocumentSaveCoordinator<string> | null>(() => {
    if (!activeTargetKey) return null;
    const targetAtCreation = activeTarget;
    const saveTargetAtCreation = saveTarget;
    const currentStore = draftStoreRef.current;
    let instance: DocumentSaveCoordinator<string>;
    instance = new DocumentSaveCoordinator<string>({
      save: async (markdown) => {
        if (!targetAtCreation || getContentCacheKey(targetAtCreation) !== activeTargetKey) {
          throw new DocumentSaveError("当前文档已切换，保存目标已失效。", {
            code: "RESOURCE_CONFLICT",
          });
        }
        await saveTargetAtCreation(targetAtCreation, markdown);
      },
      draft:
        projectId && workspaceId && currentStore
          ? {
              store: currentStore,
              workspaceId,
              projectId,
              path: activeTargetKey,
              serialize: (value) => value,
              deserialize: (value) => value,
            }
          : undefined,
      onStateChange: (snapshot) => {
        if (coordinatorRef.current !== instance) return;
        setSaveSnapshot(snapshot);
        setWorkspaceSaveBlocked(snapshot.status === "authority-degraded");
      },
      onCommitted: ({ value, latest }) => {
        if (coordinatorRef.current !== instance || !latest) return;
        contentCacheRef.current.set(activeTargetKey, value);
        if (activeTargetRef.current && getContentCacheKey(activeTargetRef.current) === activeTargetKey) {
          setContent(value);
        }
      },
      onError: (error) => {
        if (coordinatorRef.current !== instance) return;
        if (error.code === "AUTHORITY_BACKUP_MISSING") {
          toastRef.current({
            title: "保存失败：工作区备份不完整",
            description: error.message,
            variant: "destructive",
          });
          return;
        }
        toastRef.current({ title: error.message, variant: "destructive" });
      },
    });
    return instance;
  }, [activeTarget, activeTargetKey, projectId, saveTarget, workspaceId]);
  coordinatorRef.current = coordinator;

  useEffect(() => {
    setSaveSnapshot(
      coordinator?.getSnapshot() ?? {
        status: "clean",
        error: null,
        localRevision: 0,
        committedRevision: 0,
        hasLocalDraft: false,
      },
    );
    setWorkspaceSaveBlocked(false);
    const current = coordinator;
    return () => {
      if (current) void current.dispose();
    };
  }, [coordinator]);

  const flushSave = useCallback(
    () => coordinatorRef.current?.flush() ?? Promise.resolve(true),
    [],
  );

  const scheduleSave = useCallback((target: ActiveTarget, markdown: string) => {
    if ((target.kind === "convention" || target.kind === "pageConvention") && !canManageGovernance) {
      return;
    }
    if (!activeTargetKey || getContentCacheKey(target) !== activeTargetKey) return;
    coordinatorRef.current?.markDirty(markdown);
  }, [activeTargetKey, canManageGovernance]);

  const restoreLocalDraft = useCallback(async () => {
    const value = await coordinatorRef.current?.restoreDraft();
    if (value === undefined || value === null || !activeTargetKey) return;
    contentCacheRef.current.set(activeTargetKey, value);
    setContent(value);
  }, [activeTargetKey]);

  const discardLocalDraft = useCallback(async () => {
    await coordinatorRef.current?.discardDraft();
    if (!activeTargetKey) return;
    contentCacheRef.current.delete(activeTargetKey);
    setContentReloadRevision((current) => current + 1);
  }, [activeTargetKey]);

  // 加载当前目标内容
  useEffect(() => {
    if (!activeTarget) {
      setContent("");
      return;
    }

    // 切换文档前先冲刷上一目标的未落盘编辑
    void flushSave();

    const cacheKey = getContentCacheKey(activeTarget);
    const cached = contentCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      setContent(cached);
      setContentLoading(false);
      return;
    }

    let cancelled = false;
    setContentLoading(true);

    const load = async () => {
      try {
        let text = "";
        let loaded = false;
        if (activeTarget.kind === "knowledge") {
          if (!workingDir && !(documentApiMode === "project" && projectId)) return;
          const res = await fetch(
            documentApiMode === "project" && projectId
              ? `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(activeTarget.item.id)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
              : `/api/knowledge/content?workingDir=${encodeURIComponent(workingDir || "")}&fileName=${encodeURIComponent(activeTarget.item.fileName || "")}`,
          );
          const data = await res.json();
          if (data.success) {
            text = data.data.content || "";
            loaded = true;
          }
        } else {
          if (!sessionId) return;
          const filePath = resolveWorkspaceFilePath(activeTarget);
          if (!filePath) return;
          const res = await fetch(
            `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(filePath)}`,
          );
          const data = await res.json();
          if (data.success) {
            text = data.data.content || "";
            loaded = true;
          }
        }
        if (!cancelled) {
          let nextContent = text;
          if (loaded) {
            coordinator?.setBase(text);
            const draft = coordinator
              ? await coordinator.readDraft(text)
              : { status: "none" as const };
            if (cancelled) return;
            if (draft.status === "match") {
              nextContent = draft.value;
              if (!activeDocumentReadOnly) coordinator?.markDirty(nextContent);
            }
            contentCacheRef.current.set(cacheKey, nextContent);
          }
          setContent(nextContent);
        }
      } catch {
        if (!cancelled) setContent("");
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    activeTarget,
    activeDocumentReadOnly,
    coordinator,
    documentApiMode,
    projectId,
    workingDir,
    sessionId,
    flushSave,
    contentReloadRevision,
  ]);

  const createKnowledgeDocument = useCallback(
    async (title: string, markdown: string): Promise<KnowledgeItem | null> => {
      if (!workingDir && !(documentApiMode === "project" && projectId)) {
        toast({ title: "工作空间未初始化", variant: "destructive" });
        return null;
      }
      try {
        const params = workingDir ? new URLSearchParams({ workingDir }) : new URLSearchParams();
        if (projectId && documentApiMode === "legacy") params.set("projectId", projectId);
        if (sessionId && documentApiMode === "legacy") params.set("sessionId", sessionId);
        const res = await fetch(documentApiMode === "project" && projectId
          ? `/api/projects/${encodeURIComponent(projectId)}/documents${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
          : `/api/knowledge?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description: title, content: markdown }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || "创建失败");
        }
        const item = documentApiMode === "project"
          ? toKnowledgeItem(data.data.snapshot)
          : data.data as KnowledgeItem;
        knowledgeMutationVersionRef.current += 1;
        setItems((current) => [...current.filter((entry) => entry.id !== item.id), item]);
        setUserExpanded(true);
        contentCacheRef.current.set(`knowledge:${item.id}`, markdown);
        setActiveTarget({ kind: "knowledge", item });
        setContent(markdown);
        const nextItems = [
          ...itemsRef.current.filter((entry) => entry.id !== item.id),
          item,
        ];
        onItemsChangeRef.current?.(nextItems);
        return item;
      } catch (error) {
        toast({
          title: "创建知识文档失败",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
        return null;
      }
    },
    [documentApiMode, projectId, sessionId, toast, workingDir],
  );

  const handleCreate = useCallback(async () => {
    setKnowledgeMenuOpen(false);
    const item = await createKnowledgeDocument("未命名文档", "");
    if (!item) return;
    setRenamingKnowledgeId(item.id);
    setRenamingKnowledgeTitle(item.title);
  }, [createKnowledgeDocument]);

  const handleKnowledgeUpload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!isSupportedKnowledgeUpload(file)) {
        toast({ title: "仅支持 Markdown / TXT 文件", variant: "destructive" });
        return;
      }
      try {
        const markdown = await file.text();
        await createKnowledgeDocument(getKnowledgeUploadTitle(file.name), markdown);
      } catch (error) {
        toast({
          title: "读取文件失败",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      }
    },
    [createKnowledgeDocument, toast],
  );

  const commitKnowledgeRename = useCallback(
    async (item: KnowledgeItem) => {
      const title = renamingKnowledgeTitle.trim();
      setRenamingKnowledgeId(null);
      if (!title || title === item.title || (!workingDir && !(documentApiMode === "project" && projectId))) return;
      try {
        const params = workingDir ? new URLSearchParams({ workingDir }) : new URLSearchParams();
        if (projectId && documentApiMode === "legacy") params.set("projectId", projectId);
        if (sessionId && documentApiMode === "legacy") params.set("sessionId", sessionId);
        const res = await fetch(documentApiMode === "project" && projectId
          ? `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(item.id)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
          : `/api/knowledge/${item.id}?${params.toString()}`, {
          method: documentApiMode === "project" ? "PATCH" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || "重命名失败");
        }
        const updated = documentApiMode === "project"
          ? toKnowledgeItem(data.data.snapshot)
          : data.data as KnowledgeItem;
        knowledgeMutationVersionRef.current += 1;
        const currentItems = itemsRef.current;
        const nextItems = currentItems.some((entry) => entry.id === updated.id)
          ? currentItems.map((entry) =>
              entry.id === updated.id ? updated : entry,
            )
          : [...currentItems, updated];
        setItems(nextItems);
        onItemsChangeRef.current?.(nextItems);
        setActiveTarget((current) =>
          current?.kind === "knowledge" && current.item.id === updated.id
            ? { kind: "knowledge", item: updated }
            : current,
        );
        window.dispatchEvent(
          new CustomEvent("knowledge-updated", {
            detail: { docId: updated.id, title: updated.title },
          }),
        );
      } catch (error) {
        toast({
          title: "重命名失败",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      }
    },
    [documentApiMode, projectId, renamingKnowledgeTitle, sessionId, toast, workingDir],
  );

  const commitDesignSpecRename = useCallback(
    async (doc: DesignSpecMeta) => {
      if (designSpecRenameBlurTimerRef.current) {
        clearTimeout(designSpecRenameBlurTimerRef.current);
        designSpecRenameBlurTimerRef.current = null;
      }
      const title = renamingDesignSpecTitle.trim();
      setRenamingDesignSpecId(null);
      if (!title || title === doc.title || !workingDir) return;
      try {
        const params = new URLSearchParams({ workingDir });
        if (sessionId) params.set("sessionId", sessionId);
        if (projectId) params.set("projectId", projectId);
        const res = await fetch(
          `/api/design-specs/${encodeURIComponent(doc.id)}?${params.toString()}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          },
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || "重命名失败");
        }
        const updated = data.data as DesignSpecMeta;
        designSpecMutationVersionRef.current += 1;
        setDesignSpecs((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        setActiveTarget((current) =>
          current?.kind === "designSpec" && current.doc.id === updated.id
            ? { kind: "designSpec", doc: updated }
            : current,
        );
        window.dispatchEvent(
          new CustomEvent("design-spec-updated", {
            detail: { docId: updated.id, title: updated.title },
          }),
        );
      } catch (error) {
        toast({
          title: "重命名失败",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      }
    },
    [projectId, renamingDesignSpecTitle, sessionId, toast, workingDir],
  );

  const handleCreateDesignSpec = useCallback(async () => {
    if (!workingDir) return;
    const title = window.prompt("设计规范文档名称", `设计规范 ${designSpecs.length + 1}`);
    if (!title) return;
    try {
      const params = new URLSearchParams({ workingDir });
      if (sessionId) params.set("sessionId", sessionId);
      if (projectId) params.set("projectId", projectId);
      const res = await fetch(`/api/design-specs?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (data.success) {
        designSpecMutationVersionRef.current += 1;
        toast({ title: "已创建设计规范" });
        setDesignSpecExpanded(true);
        setActiveTarget({ kind: "designSpec", doc: data.data });
        fetchDesignSpecs();
        window.dispatchEvent(new Event("design-spec-updated"));
      } else {
        toast({ title: "创建失败", description: data.error?.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "创建失败", variant: "destructive" });
    }
  }, [workingDir, sessionId, projectId, designSpecs.length, toast, fetchDesignSpecs]);

  const handleDeleteDesignSpec = useCallback(
    async (doc: DesignSpecMeta) => {
      if (!workingDir) return;
      if (!window.confirm(`确定要删除「${doc.title}」吗？`)) return;
      try {
        const params = new URLSearchParams({ workingDir });
        if (sessionId) params.set("sessionId", sessionId);
        if (projectId) params.set("projectId", projectId);
        const res = await fetch(`/api/design-specs/${doc.id}?${params.toString()}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          designSpecMutationVersionRef.current += 1;
          knowledgeMutationVersionRef.current += 1;
          toast({ title: "删除成功" });
          if (activeTarget?.kind === "designSpec" && activeTarget.doc.id === doc.id) {
            setActiveTarget(null);
          }
          fetchDesignSpecs();
          window.dispatchEvent(new Event("design-spec-updated"));
        } else {
          toast({ title: "删除失败", description: data.error?.message, variant: "destructive" });
        }
      } catch {
        toast({ title: "删除失败", variant: "destructive" });
      }
    },
    [workingDir, sessionId, projectId, activeTarget, toast, fetchDesignSpecs],
  );

  const handleDelete = useCallback(
    async (item: KnowledgeItem) => {
      if (!workingDir && !(documentApiMode === "project" && projectId)) return;
      if (!confirm(`确定要删除「${item.title}」吗？`)) return;
      try {
        const params = workingDir ? new URLSearchParams({ workingDir }) : new URLSearchParams();
        if (projectId && documentApiMode === "legacy") params.set("projectId", projectId);
        if (sessionId && documentApiMode === "legacy") params.set("sessionId", sessionId);
        const res = await fetch(
          documentApiMode === "project" && projectId
            ? `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(item.id)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
            : `/api/knowledge/${item.id}?${params.toString()}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (data.success) {
          toast({ title: "删除成功" });
          if (
            activeTarget?.kind === "knowledge" &&
            activeTarget.item.id === item.id
          ) {
            setActiveTarget(null);
          }
          onDocDeleted?.(item);
          fetchItems();
          window.dispatchEvent(new Event("knowledge-updated"));
        } else {
          toast({
            title: "删除失败",
            description: data.error?.message,
            variant: "destructive",
          });
        }
      } catch {
        toast({ title: "删除失败", variant: "destructive" });
      }
    },
    [documentApiMode, workingDir, projectId, sessionId, activeTarget, toast, onDocDeleted, fetchItems],
  );

  const isActive = (target: ActiveTarget) =>
    activeTarget?.kind === target.kind &&
    (target.kind !== "knowledge" ||
      (activeTarget.kind === "knowledge" &&
        activeTarget.item.id === target.item.id)) &&
    (target.kind !== "pageConvention" ||
      (activeTarget.kind === "pageConvention" &&
        activeTarget.page.id === target.page.id)) &&
    (target.kind !== "designSpec" ||
      (activeTarget.kind === "designSpec" &&
        activeTarget.doc.id === target.doc.id));

  useEffect(() => {
    if (!activeTarget || activeTarget.kind === "designSpec") {
      onCommentTargetChange?.(null);
      return;
    }
    const resourceId = activeTarget.kind === "knowledge"
      ? (documentApiMode === "project"
        ? `knowledge-document/${activeTarget.item.id}`
        : activeTarget.item.fileName
          ? `knowledge/${activeTarget.item.fileName}`
          : `knowledge-document/${activeTarget.item.id}`)
      : resolveWorkspaceFilePath(activeTarget);
    if (!resourceId) return onCommentTargetChange?.(null);
    const resourceLabel = activeTarget.kind === "knowledge"
      ? activeTarget.item.title
      : activeTarget.kind === "memory" ? "AI 记忆" : activeTarget.kind === "convention" ? "项目公约" : `${activeTarget.page.name} 页面公约`;
    onCommentTargetChange?.({ kind: "document", resourceId, resourceLabel });
  }, [activeTarget, documentApiMode, onCommentTargetChange]);

  const activeDocumentTarget = useMemo<MarkdownReferenceTarget | undefined>(() => {
    if (!activeTarget || !projectId) return undefined;
    switch (activeTarget.kind) {
      case "knowledge": return { kind: "document", projectId, docId: activeTarget.item.id };
      case "memory": return { kind: "document", projectId, documentKind: "memory", docId: "memory" };
      case "convention": return { kind: "document", projectId, documentKind: "project-convention", docId: "convention" };
      case "pageConvention": return { kind: "document", projectId, documentKind: "page-convention", docId: activeTarget.page.id };
      case "designSpec": return { kind: "document", projectId, documentKind: "design-spec", docId: activeTarget.doc.id };
    }
  }, [activeTarget, projectId]);
  const handleReferenceSourceClick = useCallback((source: MarkdownReferenceSource) => {
    if (source.kind !== "knowledge-document") return;
    const item = items.find((candidate) => candidate.id === source.docId);
    if (item) setActiveTarget({ kind: "knowledge", item });
  }, [items]);
  const handleUnlinkedMentionClick = useCallback((mention: { target: import("@workbench/shared/markdown-reference").MarkdownReferenceTarget; label: string; start: number; end: number }) => {
    if (!activeTarget || activeTarget.kind === "designSpec") return;
    if (!window.confirm(`将「${mention.label}」转换为项目引用？`)) return;
    if (content.slice(mention.start, mention.end) !== mention.label) return;
    const next = `${content.slice(0, mention.start)}${serializeMarkdownReference(mention.target, mention.label)}${content.slice(mention.end)}`;
    setContent(next);
    contentCacheRef.current.set(getContentCacheKey(activeTarget), next);
    scheduleSave(activeTarget, next);
  }, [activeTarget, content, scheduleSave]);
  const handleUnlinkedMentionNavigate = useCallback((mention: MarkdownReferenceMention) => {
    navigateToMarkdownMention(referenceEditorContainerRef.current, content, mention);
  }, [content]);
  useEffect(() => {
    if (!activeTarget) return;
    // Every directory category uses the same active-row highlight.
    referenceDirectoryRef.current?.querySelector<HTMLElement>(".bg-accent.text-accent-foreground")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeTarget, existingConventionPaths, designSpecExpanded, conventionExpanded, userExpanded]);

  return (
    <div className="flex h-full min-h-0">
      {/* 目录区 */}
      <div ref={referenceDirectoryRef} className="flex w-1/4 shrink-0 flex-col overflow-hidden border-r bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
            目录
          </h2>
          <span className="text-[10px] text-muted-foreground">文档</span>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-1.5">
            {/* AI 记忆 */}
            <div
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                isActive({ kind: "memory" })
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
              onClick={() => setActiveTarget({ kind: "memory" })}
            >
              <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">AI 记忆</span>
            </div>

            {/* 项目公约（文件夹：项目公约 + 各页面公约） */}
            <div className="mt-1">
              <div
                className="group flex cursor-pointer items-center gap-1.5 rounded-sm py-1.5 px-2 text-sm transition-colors hover:bg-accent/50"
                onClick={() => setConventionExpanded(!conventionExpanded)}
              >
                {conventionExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="flex-1 font-medium text-foreground">
                  项目公约
                </span>
                {canManageGovernance && <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="新建/添加公约"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="bottom" className="w-40 p-1">
                    <div
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        void openOrCreateConvention({ kind: "convention" });
                      }}
                    >
                      <ScrollText className="h-3.5 w-3.5" />
                      项目公约
                    </div>
                    <div
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setPagePickerOpen(true);
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      页面公约
                    </div>
                  </PopoverContent>
                </Popover>}
              </div>
              {conventionExpanded && (
                <div className="space-y-0">
                  {/* 已创建的项目公约（根） */}
                  {existingConventionPaths.has("convention.md") && <div
                    className={cn(
                      "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-sm transition-colors hover:bg-accent/50",
                      isActive({ kind: "convention" })
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground",
                    )}
                    style={{ paddingLeft: 24 + 8 }}
                    onClick={() => setActiveTarget({ kind: "convention" })}
                  >
                    <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">项目公约</span>
                    {canManageGovernance && <DocumentMoreMenu
                      label="项目公约"
                      onDelete={() => void deleteConvention({ kind: "convention" })}
                    />}
                  </div>}
                  {/* 已创建的页面公约 */}
                  {pages.filter((page) => existingConventionPaths.has(`demos/${page.id}/convention.md`)).map((page) => (
                    <div
                      key={page.id}
                      className={cn(
                        "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-sm transition-colors hover:bg-accent/50",
                        activeTarget?.kind === "pageConvention" &&
                          activeTarget.page.id === page.id
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground",
                      )}
                      style={{ paddingLeft: 24 + 8 }}
                      onClick={() =>
                        setActiveTarget({ kind: "pageConvention", page })
                      }
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {page.name}
                      </span>
                      {canManageGovernance && <DocumentMoreMenu
                        label={`${page.name}页面公约`}
                        onDelete={() =>
                          void deleteConvention({ kind: "pageConvention", page })
                        }
                      />}
                    </div>
                  ))}
                  {existingConventionPaths.size === 0 && (
                    <div
                      className="px-3 py-2 text-xs text-muted-foreground"
                      style={{ paddingLeft: 24 + 12 }}
                    >
                      {canManageGovernance ? "暂无公约，可通过右上角 + 新建" : "暂无公约"}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 项目知识库 */}
            <div className="mt-1">
              <div
                className="group flex cursor-pointer items-center gap-1.5 rounded-sm py-1.5 px-2 text-sm transition-colors hover:bg-accent/50"
                onClick={() => setUserExpanded(!userExpanded)}
              >
                {userExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="flex-1 font-medium text-foreground">
                  项目知识库
                </span>
                <Popover open={knowledgeMenuOpen} onOpenChange={setKnowledgeMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="新建或上传文档"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="bottom" className="w-32 p-1">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                      onClick={handleCreate}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      新建
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                      onClick={() => {
                        setKnowledgeMenuOpen(false);
                        knowledgeUploadInputRef.current?.click();
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      上传
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
              {userExpanded && (
                <div className="space-y-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : userItems.length === 0 ? (
                    <div
                      className="px-3 py-2 text-xs text-muted-foreground"
                      style={{ paddingLeft: 24 + 12 }}
                    >
                      暂无文档，点击 + 添加
                    </div>
                  ) : (
                    userItems.map((item) => (
                      <KnowledgeFileItem
                        key={item.id}
                        item={item}
                        active={
                          activeTarget?.kind === "knowledge" &&
                          activeTarget.item.id === item.id
                        }
                        onSelect={() =>
                          setActiveTarget({ kind: "knowledge", item })
                        }
                        onDelete={() => handleDelete(item)}
                        onRename={() => {
                          setRenamingKnowledgeId(item.id);
                          setRenamingKnowledgeTitle(item.title);
                        }}
                        renaming={renamingKnowledgeId === item.id}
                        renameValue={renamingKnowledgeTitle}
                        onRenameValueChange={setRenamingKnowledgeTitle}
                        onRenameCommit={() => commitKnowledgeRename(item)}
                        onRenameCancel={() => setRenamingKnowledgeId(null)}
                        onHistory={
                          onDocHistory
                            ? () => onDocHistory(item)
                            : undefined
                        }
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 设计规范 */}
            <div className="mt-1">
              <div
                className="group flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors hover:bg-accent/50"
                onClick={() => setDesignSpecExpanded(!designSpecExpanded)}
              >
                {designSpecExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <FolderOpen className="h-4 w-4 shrink-0 text-cyan-500" />
                <span className="flex-1 font-medium text-foreground">
                  设计规范
                </span>
                {canManageGovernance && <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                  title="新建设计规范文档"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateDesignSpec();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>}
              </div>
              {designSpecExpanded && (
                <div className="space-y-0">
                  {designSpecsLoading ? (
                    <div
                      className="px-3 py-2 text-xs text-muted-foreground"
                      style={{ paddingLeft: 24 + 12 }}
                    >
                      加载中...
                    </div>
                  ) : designSpecs.length === 0 ? (
                    <div
                      className="px-3 py-2 text-xs text-muted-foreground"
                      style={{ paddingLeft: 24 + 12 }}
                    >
                      {canManageGovernance ? "暂无文档，点击 + 添加" : "暂无文档"}
                    </div>
                  ) : (
                    designSpecs.map((doc) => (
                      <div
                        key={doc.id}
                        className={cn(
                          "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-sm transition-colors hover:bg-accent/50",
                          activeTarget?.kind === "designSpec" &&
                            activeTarget.doc.id === doc.id
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground",
                        )}
                        style={{ paddingLeft: 24 + 8 }}
                        onClick={() => setActiveTarget({ kind: "designSpec", doc })}
                      >
                        <FileText className="h-4 w-4 shrink-0 text-cyan-500" />
                        {renamingDesignSpecId === doc.id ? (
                          <input
                            ref={designSpecRenameInputRef}
                            autoFocus
                            className="h-6 min-w-0 flex-1 rounded border bg-background px-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                            value={renamingDesignSpecTitle}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setRenamingDesignSpecTitle(event.target.value)}
                            onBlur={(event) => {
                              if (isWithinDropdownMenu(event.relatedTarget)) {
                                window.setTimeout(() => designSpecRenameInputRef.current?.focus(), 0);
                                return;
                              }
                              designSpecRenameBlurTimerRef.current = setTimeout(() => {
                                designSpecRenameBlurTimerRef.current = null;
                                void commitDesignSpecRename(doc);
                              }, 0);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (designSpecRenameBlurTimerRef.current) {
                                  clearTimeout(designSpecRenameBlurTimerRef.current);
                                  designSpecRenameBlurTimerRef.current = null;
                                }
                                void commitDesignSpecRename(doc);
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                if (designSpecRenameBlurTimerRef.current) {
                                  clearTimeout(designSpecRenameBlurTimerRef.current);
                                  designSpecRenameBlurTimerRef.current = null;
                                }
                                setRenamingDesignSpecId(null);
                              }
                            }}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                        )}
                        {canManageGovernance && <DocumentMoreMenu
                          label={doc.title}
                          onRename={() => {
                            setRenamingDesignSpecId(doc.id);
                            setRenamingDesignSpecTitle(doc.title);
                          }}
                          onDelete={() => handleDeleteDesignSpec(doc)}
                        />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <input
        ref={knowledgeUploadInputRef}
        data-testid="knowledge-upload-input"
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="hidden"
        onChange={(event) => {
          void handleKnowledgeUpload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {/* 文档编辑区 */}
      <div ref={referenceEditorContainerRef} className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <DocumentSaveStatusBar
          snapshot={saveSnapshot}
          testId={workspaceSaveBlocked ? "workspace-save-blocked" : undefined}
          onRetry={() => {
            void coordinatorRef.current?.retry();
          }}
          onRestoreDraft={activeDocumentReadOnly ? undefined : () => {
            void restoreLocalDraft();
          }}
          onDiscardDraft={() => {
            void discardLocalDraft();
          }}
        />
        {proposalId && !proposalReviewOpen && (
          <div className="flex items-center justify-between border-b bg-violet-500/5 px-3 py-2 text-xs">
            <span className="text-muted-foreground">有一项 AI 文档修改待审核</span>
            <Button variant="outline" size="sm" className="h-7" onClick={() => setProposalReviewOpen(true)}>
              查看 Diff
            </Button>
          </div>
        )}
        {activeTarget?.kind === "designSpec" ? (
          <DesignSpecEditor
            docId={activeTarget.doc.id}
            focusEntryId={focusedEntryId ?? undefined}
            readOnly={!canManageGovernance}
            workspaceId={workspaceId}
            referenceProvider={referenceProvider}
            onReferenceClick={onReferenceClick}
            onEditConfigDefinition={onEditConfigDefinition}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1">
              {contentLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : activeTarget ? (
                <DocumentEditor
                  documentKey={getContentCacheKey(activeTarget)}
                  value={content}
                  onChange={(next) => {
                    contentCacheRef.current.set(getContentCacheKey(activeTarget), next);
                    setContent(next);
                    scheduleSave(activeTarget, next);
                  }}
                  localizeRemoteImage={activeDocumentReadOnly ? undefined : localizeRemoteImage}
                  readOnly={activeDocumentReadOnly}
                  onCommentSelection={(selection) => onDocumentCommentSelection?.({ kind: "selection", ...selection, status: "active" })}
                  referenceContext={activeReferenceContext}
                  referenceProvider={activeReferenceContext ? referenceProvider : undefined}
                  onReferenceClick={onReferenceClick}
                  className="h-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  请从左侧目录选择文档开始编辑
                </div>
              )}
            </div>
          </>
        )}
        {projectId && (
          <MarkdownReferenceLinksPanel
            projectId={projectId}
            sessionId={sessionId}
            source={activeReferenceContext?.source}
            target={activeDocumentTarget}
            onTargetClick={(target, labelSnapshot) => onReferenceClick?.({ target, labelSnapshot })}
            onSourceClick={handleReferenceSourceClick}
            onMentionNavigate={handleUnlinkedMentionNavigate}
            onMentionClick={handleUnlinkedMentionClick}
          />
        )}
      </div>

      {/* 选择页面（用于新建页面公约） */}
      <Dialog open={pagePickerOpen} onOpenChange={setPagePickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>选择页面</DialogTitle>
          </DialogHeader>
          <div className="py-1">
            {pages.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                暂无页面
              </div>
            ) : (
              pages.map((page) => (
                <div
                  key={page.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    void openOrCreateConvention({ kind: "pageConvention", page });
                    setPagePickerOpen(false);
                  }}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{page.name}</span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <DocumentProposalReviewDialog
        projectId={projectId}
        sessionId={sessionId}
        proposalId={proposalId}
        open={proposalReviewOpen}
        onOpenChange={setProposalReviewOpen}
        beforeApprove={async () => {
          if (!(await flushSave())) throw new Error("本地文档保存失败，请修复后再审核");
        }}
        onApplied={() => {
          void coordinatorRef.current?.discardDraft();
          contentCacheRef.current.clear();
          setContentReloadRevision((current) => current + 1);
          void fetchItems();
          window.dispatchEvent(new Event("knowledge-updated"));
        }}
      />
    </div>
  );
}

/** 项目知识库单个文件项 */
function KnowledgeFileItem({
  item,
  active,
  onSelect,
  onHistory,
  onDelete,
  onRename,
  renaming,
  renameValue,
  onRenameValueChange,
  onRenameCommit,
  onRenameCancel,
}: {
  item: KnowledgeItem;
  active: boolean;
  onSelect: () => void;
  onHistory?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  renaming?: boolean;
  renameValue?: string;
  onRenameValueChange?: (value: string) => void;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
}) {
  const renameBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-1.5 rounded-sm py-1 pr-2 text-sm transition-colors hover:bg-accent/50",
        active ? "bg-accent text-accent-foreground" : "text-foreground",
      )}
      style={{ paddingLeft: 24 + 8 }}
      onClick={onSelect}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      {renaming ? (
        <input
          ref={renameInputRef}
          autoFocus
          className="h-6 min-w-0 flex-1 rounded border bg-background px-1 text-sm outline-none focus:ring-1 focus:ring-ring"
          value={renameValue}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onRenameValueChange?.(event.target.value)}
          onBlur={(event) => {
            if (isWithinDropdownMenu(event.relatedTarget)) {
              window.setTimeout(() => renameInputRef.current?.focus(), 0);
              return;
            }
            renameBlurTimerRef.current = setTimeout(() => {
              renameBlurTimerRef.current = null;
              onRenameCommit?.();
            }, 0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (renameBlurTimerRef.current) {
                clearTimeout(renameBlurTimerRef.current);
                renameBlurTimerRef.current = null;
              }
              onRenameCommit?.();
            } else if (event.key === "Escape") {
              event.preventDefault();
              if (renameBlurTimerRef.current) {
                clearTimeout(renameBlurTimerRef.current);
                renameBlurTimerRef.current = null;
              }
              onRenameCancel?.();
            }
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
      )}
      <DocumentMoreMenu
        label={item.title}
        onHistory={onHistory}
        onRename={onRename}
        onDelete={onDelete}
      />
    </div>
  );
}

/** 文档目录的统一更多菜单。仅具备资源历史的知识库文档展示“历史”。 */
function DocumentMoreMenu({
  label,
  onHistory,
  onRename,
  onDelete,
}: {
  label: string;
  onHistory?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const renameRequestedRef = useRef(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100"
          title={`打开${label}的更多操作`}
          aria-label={`打开${label}的更多操作`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!renameRequestedRef.current) return;
          event.preventDefault();
          renameRequestedRef.current = false;
        }}
      >
        {onRename && (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              renameRequestedRef.current = true;
              onRename();
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            重命名
          </DropdownMenuItem>
        )}
        {onHistory && (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onHistory();
            }}
          >
            <History className="mr-2 h-3.5 w-3.5" />
            历史
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem
            className="text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            删除
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
