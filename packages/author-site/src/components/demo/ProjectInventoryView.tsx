"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FileText,
  FolderTree,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  resolveInventorySemantic,
  type InventoryHumanOverlay,
  type InventoryQueryEntry,
  type InventoryResolvedSemantic,
} from "@workbench/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";
import {
  DocumentSaveCoordinator,
  DocumentSaveError,
  getDocumentSaveStatusLabel,
  type DocumentSaveSnapshot,
} from "@/lib/document-save-coordinator";

export type ProjectInventoryUserRole = "admin" | "editor" | "creator" | "readonly" | "";

export interface ProjectInventoryViewProps {
  projectId: string;
  sessionId?: string;
  userRole?: ProjectInventoryUserRole;
  onDirtyChange?: (dirty: boolean) => void;
}

type InventoryTypeFilter = "all" | "project" | "page" | "config" | "document";
type InventoryStatusFilter = "all" | "attention" | "ready" | "unavailable" | "referenced";
type EditableOverlayField = "summary";

const editableOverlayFields: EditableOverlayField[] = ["summary"];

const typeLabels: Record<InventoryQueryEntry["resourceType"], string> = {
  project: "项目",
  page: "页面",
  config: "配置项",
  document: "文档",
};

const statusLabels: Record<InventoryStatusFilter, string> = {
  all: "全部状态",
  attention: "待处理",
  ready: "已有语义",
  unavailable: "来源异常",
  referenced: "外部引用",
};

interface InventoryStatus {
  label: string;
  tone: "default" | "success" | "warning" | "destructive";
  attention: boolean;
}

interface InventoryPageGroup {
  entry: InventoryQueryEntry;
  configs: InventoryQueryEntry[];
}

interface InventoryGroups {
  project: InventoryQueryEntry | null;
  pages: InventoryPageGroup[];
  documents: InventoryQueryEntry[];
  governance: InventoryQueryEntry[];
  referenced: InventoryQueryEntry[];
  inactive: InventoryQueryEntry[];
}

interface InventoryPayload {
  entries: InventoryQueryEntry[];
  overrides: Record<string, InventoryHumanOverlay>;
  expectedHash: string | null;
  orphanCount: number;
  projectionSource: "derived" | "workspace";
  projectionState: "ready" | "stale" | "unavailable";
  generationActivity: "active" | "idle" | "failed" | "unavailable";
  reconcileRequired: boolean;
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneOverlayMap(value: Record<string, InventoryHumanOverlay>): Record<string, InventoryHumanOverlay> {
  return Object.fromEntries(
    Object.entries(value).map(([uri, overlay]) => [uri, { ...overlay }]),
  );
}

function overlayFingerprint(value: Record<string, InventoryHumanOverlay>): string {
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .map((uri) => {
        const overlay = value[uri] ?? {};
        return [
          uri,
          editableOverlayFields
            .filter((field) => hasOwn(overlay, field))
            .sort()
            .map((field) => [field, overlay[field]]),
          overlay.confirmedGeneratedHash ?? null,
          overlay.updatedAt ?? null,
        ];
      }),
  );
}

function fieldValue(overlay: InventoryHumanOverlay | undefined, field: EditableOverlayField): unknown {
  if (!overlay || !hasOwn(overlay, field)) return undefined;
  return overlay[field];
}

function fieldChanged(
  local: InventoryHumanOverlay | undefined,
  base: InventoryHumanOverlay | undefined,
  field: EditableOverlayField,
): boolean {
  const localHas = Boolean(local && hasOwn(local, field));
  const baseHas = Boolean(base && hasOwn(base, field));
  if (localHas !== baseHas) return true;
  return JSON.stringify(fieldValue(local, field)) !== JSON.stringify(fieldValue(base, field));
}

function mergeLocalOverlayChanges(
  base: Record<string, InventoryHumanOverlay>,
  local: Record<string, InventoryHumanOverlay>,
  latest: Record<string, InventoryHumanOverlay>,
): Record<string, InventoryHumanOverlay> {
  const merged = cloneOverlayMap(latest);
  const uris = new Set([...Object.keys(base), ...Object.keys(local)]);

  for (const uri of uris) {
    const baseOverlay = base[uri];
    const localOverlay = local[uri];
    const nextOverlay = { ...(merged[uri] ?? {}) };
    for (const field of editableOverlayFields) {
      if (!fieldChanged(localOverlay, baseOverlay, field)) continue;
      if (localOverlay && hasOwn(localOverlay, field)) {
        (nextOverlay as Record<string, unknown>)[field] = localOverlay[field];
      } else {
        delete (nextOverlay as Record<string, unknown>)[field];
      }
    }
    if (localOverlay?.confirmedGeneratedHash !== baseOverlay?.confirmedGeneratedHash) {
      if (localOverlay && hasOwn(localOverlay, "confirmedGeneratedHash")) {
        nextOverlay.confirmedGeneratedHash = localOverlay.confirmedGeneratedHash;
      } else {
        delete nextOverlay.confirmedGeneratedHash;
      }
    }
    if (localOverlay?.updatedAt !== baseOverlay?.updatedAt) {
      if (localOverlay && hasOwn(localOverlay, "updatedAt")) {
        nextOverlay.updatedAt = localOverlay.updatedAt;
      } else {
        delete nextOverlay.updatedAt;
      }
    }
    if (Object.keys(nextOverlay).length > 0) merged[uri] = nextOverlay;
    else delete merged[uri];
  }
  return merged;
}

function findOverlayConflicts(
  base: Record<string, InventoryHumanOverlay>,
  local: Record<string, InventoryHumanOverlay>,
  latest: Record<string, InventoryHumanOverlay>,
): string[] {
  const conflicts: string[] = [];
  const uris = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(latest)]);
  for (const uri of uris) {
    for (const field of editableOverlayFields) {
      if (!fieldChanged(local[uri], base[uri], field)) continue;
      if (!fieldChanged(latest[uri], base[uri], field)) continue;
      if (JSON.stringify(fieldValue(local[uri], field)) !== JSON.stringify(fieldValue(latest[uri], field))) {
        conflicts.push(`${uri}:${field}`);
      }
    }
  }
  return conflicts;
}

function resolveDraftSemantic(
  entry: InventoryQueryEntry,
  overlay: InventoryHumanOverlay | undefined,
): InventoryResolvedSemantic {
  return resolveInventorySemantic({
    native: entry.native,
    generated: entry.generated,
    human: { ...entry.human, ...(overlay ?? {}) },
  });
}

function entryStatus(
  entry: InventoryQueryEntry,
  projectionState: InventoryPayload["projectionState"] = "ready",
  generationActivity: InventoryPayload["generationActivity"] = "idle",
): InventoryStatus {
  if (entry.sourceState !== "active") {
    return { label: "来源异常", tone: "destructive", attention: true };
  }
  if (entry.generationState === "failed") {
    return { label: "生成失败", tone: "destructive", attention: true };
  }
  if (entry.generationState === "pending") {
    if (projectionState === "unavailable" || generationActivity === "unavailable") {
      return { label: "索引服务不可用", tone: "destructive", attention: true };
    }
    if (generationActivity === "failed") {
      return { label: "生成失败", tone: "destructive", attention: true };
    }
    if (projectionState === "ready" && generationActivity === "active") {
      return { label: "生成中", tone: "warning", attention: true };
    }
    return { label: "待生成", tone: "warning", attention: true };
  }
  if (entry.reviewState === "review_recommended") {
    return { label: "建议复核", tone: "warning", attention: true };
  }
  if (entry.generated && entry.reviewState === "unreviewed") {
    return { label: "待确认", tone: "warning", attention: true };
  }
  if (entry.reviewState === "confirmed") {
    return { label: "已确认", tone: "success", attention: false };
  }
  if (entry.generationState === "ready") {
    return { label: "已生成", tone: "success", attention: false };
  }
  return { label: "原生信息", tone: "default", attention: false };
}

function statusMatches(
  entry: InventoryQueryEntry,
  filter: InventoryStatusFilter,
  projectionState: InventoryPayload["projectionState"] = "ready",
  generationActivity: InventoryPayload["generationActivity"] = "idle",
): boolean {
  if (filter === "all") return true;
  if (filter === "referenced") return entry.scope === "referenced";
  if (filter === "unavailable") return entry.sourceState !== "active";
  if (filter === "attention") return entryStatus(entry, projectionState, generationActivity).attention;
  return !entryStatus(entry, projectionState, generationActivity).attention && entry.sourceState === "active";
}

function typeMatches(entry: InventoryQueryEntry, filter: InventoryTypeFilter): boolean {
  return filter === "all" || entry.resourceType === filter;
}

function entrySearchText(entry: InventoryQueryEntry): string {
  return [
    entry.canonicalUri,
    entry.native.name,
    ...entry.native.aliases,
    ...entry.resolved.aliases,
    entry.resolved.name,
    entry.resolved.summary,
  ].join(" ").toLocaleLowerCase();
}

function entryMatches(entry: InventoryQueryEntry, filter: string): boolean {
  return !filter || entrySearchText(entry).includes(filter.trim().toLocaleLowerCase());
}

function groupEntries(entries: InventoryQueryEntry[]): InventoryGroups {
  const localActive = entries.filter((entry) => entry.scope === "local" && entry.sourceState === "active");
  const project = localActive.find((entry) => entry.resourceType === "project") ?? null;
  const pages = localActive
    .filter((entry) => entry.resourceType === "page")
    .map((entry) => ({
      entry,
      configs: localActive.filter((candidate) => candidate.resourceType === "config" && candidate.parentUri === entry.canonicalUri),
    }));
  return {
    project,
    pages,
    documents: localActive.filter((entry) => entry.resourceType === "document" && typeof entry.native.metadata.documentKind !== "string"),
    governance: localActive.filter((entry) => entry.resourceType === "document" && typeof entry.native.metadata.documentKind === "string"),
    referenced: entries.filter((entry) => entry.scope === "referenced" && entry.sourceState === "active"),
    inactive: entries.filter((entry) => entry.sourceState !== "active"),
  };
}

function typeLabel(entry: InventoryQueryEntry): string {
  return typeLabels[entry.resourceType];
}

function overlayHasValue(overlay: InventoryHumanOverlay | undefined, field: EditableOverlayField): boolean {
  if (!overlay || !hasOwn(overlay, field)) return false;
  const value = overlay[field];
  return value !== null && value !== undefined;
}

interface InventoryStatusBadgeProps {
  entry: InventoryQueryEntry;
  compact?: boolean;
  projectionState?: InventoryPayload["projectionState"];
  generationActivity?: InventoryPayload["generationActivity"];
}

function InventoryStatusBadge({ entry, compact = false, projectionState, generationActivity }: InventoryStatusBadgeProps) {
  const status = entryStatus(entry, projectionState, generationActivity);
  if (entry.generationState === "not_required" && entry.sourceState === "active" && !compact) return null;
  const icon = status.tone === "success"
    ? <CircleCheck className="h-3 w-3" />
    : status.tone === "destructive"
      ? <AlertTriangle className="h-3 w-3" />
      : status.tone === "warning"
        ? <Info className="h-3 w-3" />
        : null;
  return (
    <Badge
      variant={status.tone === "destructive" ? "destructive" : status.tone === "default" ? "outline" : "secondary"}
      className={cn(
        "gap-1 text-[10px] font-normal",
        status.tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        status.tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-200",
      )}
    >
      {icon}
      {status.label}
    </Badge>
  );
}

interface InventoryInlineEditorProps {
  entry: InventoryQueryEntry;
  overlay: InventoryHumanOverlay;
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<InventoryHumanOverlay>) => void;
  onRestoreField: (field: EditableOverlayField) => void;
  onRestoreAll: () => void;
  onConfirmGenerated: () => void;
}

function InventoryInlineEditor({
  entry,
  overlay,
  canEdit,
  onClose,
  onUpdate,
  onRestoreField,
  onRestoreAll,
  onConfirmGenerated,
}: InventoryInlineEditorProps) {
  const aiSummary = entry.generated?.summary.trim() ?? "";
  const originalSummary = entry.human.summary?.trim() || entry.native.description?.trim() || "";
  const hasOriginalSummary = originalSummary.length > 0;
  const defaultSummary = originalSummary || aiSummary;
  const initialSummary = hasOwn(overlay, "summary")
    ? overlay.summary ?? ""
    : hasOriginalSummary ? "" : aiSummary;
  const [draftSummary, setDraftSummary] = useState(initialSummary);
  const confirmedGeneratedHash = hasOwn(overlay, "confirmedGeneratedHash")
    ? overlay.confirmedGeneratedHash
    : entry.human.confirmedGeneratedHash;
  const updateSummary = (value: string) => {
    setDraftSummary(value);
    onUpdate({ summary: value || null });
  };

  return (
    <div data-testid="inventory-editor-panel" className="border-t bg-muted/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <InventoryEditorField
            id={`inventory-summary-${entry.canonicalUri}`}
            label="简介"
            visuallyHideLabel
            value={draftSummary}
            placeholder="用一两句话说明这个资源做什么"
            hint={aiSummary && !hasOriginalSummary ? "AI 生成内容已填入，可直接修改" : "留空使用当前默认简介"}
            disabled={!canEdit}
            hasOverride={overlayHasValue(overlay, "summary")}
            onChange={updateSummary}
            onRestore={() => {
              setDraftSummary(defaultSummary);
              onRestoreField("summary");
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {entry.generated && confirmedGeneratedHash !== entry.generated.contentHash ? (
            <Button variant="ghost" size="sm" disabled={!canEdit} onClick={onConfirmGenerated}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              确认 AI 版本
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭简介编辑" title="关闭编辑" className="h-7 w-7">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {aiSummary && hasOriginalSummary ? (
        <details className="mt-3 rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">查看 AI 生成简介</summary>
          <p className="mt-2 leading-5 text-muted-foreground">{aiSummary}</p>
        </details>
      ) : null}

      <details className="mt-3 rounded-md border px-3 py-2 text-xs">
        <summary className="flex cursor-pointer items-center justify-between gap-2 text-muted-foreground">
          <span>来源与状态</span>
          <InventoryStatusBadge entry={entry} compact />
        </summary>
        <div className="mt-2 space-y-1 break-all font-mono text-[10px] leading-5 text-muted-foreground">
          <div>URI：{entry.canonicalUri}</div>
          <div>来源：{entry.scope} · {entry.sourceState}</div>
          <div>生成：{entry.generationState} · 复核：{entry.reviewState}</div>
          {entry.generated?.evidenceRefs.map((ref) => (
            <div key={`${ref.sourceUri}:${ref.selector}`}>证据：{ref.sourceKind}:{ref.selector}</div>
          ))}
        </div>
      </details>

      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" disabled={!canEdit} onClick={onRestoreAll}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          恢复默认简介
        </Button>
      </div>
    </div>
  );
}

interface InventoryEditorFieldProps {
  id: string;
  label: ReactNode;
  value: string;
  placeholder: string;
  hint: string;
  disabled: boolean;
  visuallyHideLabel?: boolean;
  hasOverride: boolean;
  onChange: (value: string) => void;
  onRestore: () => void;
}

function InventoryEditorField({
  id,
  label,
  value,
  placeholder,
  hint,
  disabled,
  visuallyHideLabel = false,
  hasOverride,
  onChange,
  onRestore,
}: InventoryEditorFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={cn("text-xs font-medium text-foreground", visuallyHideLabel && "sr-only")}>{label}</label>
        {hasOverride ? (
          <button
            type="button"
            className="cursor-pointer text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onRestore}
            disabled={disabled}
          >
            恢复默认
          </button>
        ) : null}
      </div>
      <Textarea
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="min-h-[144px] resize-y bg-background text-sm"
      />
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

interface InventoryRowActionsProps {
  entry: InventoryQueryEntry;
  canEdit: boolean;
  onEdit: () => void;
  projectionState: InventoryPayload["projectionState"];
  generationActivity: InventoryPayload["generationActivity"];
}

function InventoryRowActions({ entry, canEdit, onEdit, projectionState, generationActivity }: InventoryRowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <InventoryStatusBadge entry={entry} projectionState={projectionState} generationActivity={generationActivity} />
      {canEdit ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          aria-label={`编辑简介：${entry.resolved.name || "未命名资源"}`}
          title="编辑简介"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function ProjectInventoryView({
  projectId,
  sessionId,
  userRole = "",
  onDirtyChange,
}: ProjectInventoryViewProps) {
  const { toast } = useToast();
  const canEdit = userRole === "admin" || userRole === "editor";
  const [entries, setEntries] = useState<InventoryQueryEntry[]>([]);
  const [overrides, setOverrides] = useState<Record<string, InventoryHumanOverlay>>({});
  const [savedOverrides, setSavedOverrides] = useState<Record<string, InventoryHumanOverlay>>({});
  const [expectedHash, setExpectedHash] = useState<string | null>(null);
  const [orphanCount, setOrphanCount] = useState(0);
  const [projectionSource, setProjectionSource] = useState<InventoryPayload["projectionSource"]>("workspace");
  const [projectionState, setProjectionState] = useState<InventoryPayload["projectionState"]>("unavailable");
  const [generationActivity, setGenerationActivity] = useState<InventoryPayload["generationActivity"]>("unavailable");
  const [reconcileRequired, setReconcileRequired] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSnapshot, setSaveSnapshot] = useState<DocumentSaveSnapshot>({
    status: "clean",
    error: null,
    localRevision: 0,
    committedRevision: 0,
    hasLocalDraft: false,
  });
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<InventoryTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>("all");
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [editingUri, setEditingUri] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const mountedRef = useRef(true);
  const overridesRef = useRef(overrides);
  const savedOverridesRef = useRef(savedOverrides);
  const expectedHashRef = useRef(expectedHash);
  const lastCommittedServerRef = useRef<Record<string, InventoryHumanOverlay> | null>(null);
  const inventoryRequestTokenRef = useRef(0);
  const pollDelayRef = useRef(2_000);
  overridesRef.current = overrides;
  savedOverridesRef.current = savedOverrides;
  expectedHashRef.current = expectedHash;

  const dirty = useMemo(
    () => overlayFingerprint(overrides) !== overlayFingerprint(savedOverrides),
    [overrides, savedOverrides],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inventoryRequestTokenRef.current += 1;
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  const readInventory = useCallback(async (signal?: AbortSignal): Promise<InventoryPayload> => {
    if (!sessionId) throw new Error("当前编辑会话尚未建立");
    const query = `?sessionId=${encodeURIComponent(sessionId)}`;
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/inventory/overrides${query}`,
      { cache: "no-store", signal },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
      throw new Error(body?.error?.message || "读取资源清单失败");
    }
    return {
      entries: Array.isArray(body.data?.entries) ? body.data.entries : [],
      overrides: body.data?.overrides?.entries ?? {},
      expectedHash: typeof body.data?.hash === "string" ? body.data.hash : null,
      orphanCount: Array.isArray(body.data?.orphanEntries) ? body.data.orphanEntries.length : 0,
      projectionSource: body.data?.projectionSource === "derived" ? "derived" : "workspace",
      projectionState: body.data?.projectionState === "ready" || body.data?.projectionState === "stale" ? body.data.projectionState : "unavailable",
      generationActivity: body.data?.generationActivity === "active" || body.data?.generationActivity === "idle" || body.data?.generationActivity === "failed" ? body.data.generationActivity : "unavailable",
      reconcileRequired: body.data?.reconcileRequired !== false,
    };
  }, [projectId, sessionId]);

  const applyInventory = useCallback((payload: InventoryPayload, nextOverrides = payload.overrides) => {
    setEntries(payload.entries);
    setOverrides(cloneOverlayMap(nextOverrides));
    setSavedOverrides(cloneOverlayMap(payload.overrides));
    lastCommittedServerRef.current = cloneOverlayMap(payload.overrides);
    setExpectedHash(payload.expectedHash);
    setOrphanCount(payload.orphanCount);
    setProjectionSource(payload.projectionSource);
    setProjectionState(payload.projectionState);
    setGenerationActivity(payload.generationActivity);
    setReconcileRequired(payload.reconcileRequired);
    setConflictNotice(null);
  }, []);

  const applyRemoteInventory = useCallback((payload: InventoryPayload, preserveLocal = true) => {
    setEntries(payload.entries);
    if (!preserveLocal) {
      setOverrides(cloneOverlayMap(payload.overrides));
      setSavedOverrides(cloneOverlayMap(payload.overrides));
      lastCommittedServerRef.current = cloneOverlayMap(payload.overrides);
      setExpectedHash(payload.expectedHash);
    }
    setOrphanCount(payload.orphanCount);
    setProjectionSource(payload.projectionSource);
    setProjectionState(payload.projectionState);
    setGenerationActivity(payload.generationActivity);
    setReconcileRequired(payload.reconcileRequired);
  }, []);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const requestToken = ++inventoryRequestTokenRef.current;
    setLoading(true);
    try {
      const payload = await readInventory();
      if (!mountedRef.current || requestToken !== inventoryRequestTokenRef.current) return;
      applyInventory(payload);
    } catch (error) {
      if (!mountedRef.current || requestToken !== inventoryRequestTokenRef.current) return;
      toast({
        title: "资源清单不可用",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current && requestToken === inventoryRequestTokenRef.current) setLoading(false);
    }
  }, [applyInventory, readInventory, sessionId, toast]);

  useEffect(() => {
    if (sessionId) {
      void load();
    } else {
      setEntries([]);
      setOverrides({});
      setSavedOverrides({});
      setExpectedHash(null);
      setOrphanCount(0);
      setProjectionSource("workspace");
      setProjectionState("unavailable");
      setGenerationActivity("unavailable");
      setReconcileRequired(true);
    }
  }, [load, sessionId]);

  useEffect(() => {
    if (!sessionId || projectionState !== "ready" || generationActivity !== "active" || !entries.some((entry) => entry.generationState === "pending")) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const requestToken = ++inventoryRequestTokenRef.current;
      try {
        const payload = await readInventory(controller.signal);
        if (cancelled || !mountedRef.current || requestToken !== inventoryRequestTokenRef.current) return;
        pollDelayRef.current = 2_000;
        const preserveLocal = overlayFingerprint(overridesRef.current) !== overlayFingerprint(savedOverridesRef.current);
        applyRemoteInventory(payload, preserveLocal);
      } catch {
        if (!controller.signal.aborted) pollDelayRef.current = Math.min(30_000, pollDelayRef.current * 2);
      } finally {
        if (!cancelled && mountedRef.current && !controller.signal.aborted) setPollTick((value) => value + 1);
      }
    }, pollDelayRef.current);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [applyRemoteInventory, entries, generationActivity, pollTick, projectionState, readInventory, sessionId]);

  useEffect(() => {
    const wakePolling = () => {
      if (document.visibilityState === "visible") setPollTick((value) => value + 1);
    };
    document.addEventListener("visibilitychange", wakePolling);
    return () => document.removeEventListener("visibilitychange", wakePolling);
  }, []);

  const coordinatorRef = useRef<DocumentSaveCoordinator<Record<string, InventoryHumanOverlay>> | null>(null);
  const coordinator = useMemo(() => {
    if (!sessionId || !canEdit) return null;
    let instance: DocumentSaveCoordinator<Record<string, InventoryHumanOverlay>>;
    instance = new DocumentSaveCoordinator({
      debounceMs: 800,
      maxWaitMs: 3_000,
      save: async (value) => {
        const endpoint = `/api/projects/${encodeURIComponent(projectId)}/inventory/overrides?sessionId=${encodeURIComponent(sessionId)}`;
        const put = async (entries: Record<string, InventoryHumanOverlay>, hash: string | null) => {
          const response = await fetch(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries, expectedHash: hash }),
          });
          const body = await response.json().catch(() => null) as { success?: boolean; error?: { code?: unknown; message?: unknown } } | null;
          return { response, body };
        };

        let submitted = cloneOverlayMap(value);
        let expected = expectedHashRef.current;
        let result = await put(submitted, expected);
        if (result.response.status === 409) {
          const latest = await readInventory();
          const merged = mergeLocalOverlayChanges(savedOverridesRef.current, value, latest.overrides);
          const conflicts = findOverlayConflicts(savedOverridesRef.current, value, latest.overrides);
          if (mountedRef.current && coordinatorRef.current === instance) {
            applyRemoteInventory(latest, false);
            setOverrides(cloneOverlayMap(merged));
            setConflictNotice(conflicts.length > 0
              ? `检测到 ${conflicts.length} 个字段同时被修改，请确认本地内容后重试保存。`
              : "清单已被其他会话更新，已保留本地修改。请确认后重试保存。");
          }
          if (conflicts.length > 0) {
            coordinatorRef.current?.markDirty(merged);
            throw new DocumentSaveError("清单存在同字段冲突，当前修改已保留。", {
              code: "RESOURCE_CONFLICT",
              details: { conflicts },
            });
          }
          submitted = merged;
          expected = latest.expectedHash;
          result = await put(submitted, expected);
          if (result.response.status === 409) {
            throw new DocumentSaveError("清单在合并后再次发生冲突，请重试保存。", { code: "RESOURCE_CONFLICT" });
          }
        }
        if (!result.response.ok || !result.body?.success) {
          throw new DocumentSaveError(
            typeof result.body?.error?.message === "string" ? result.body.error.message : "保存清单覆盖失败",
            {
              code: result.body?.error?.code === "FORBIDDEN" ? "PERMISSION_DENIED" : "UNKNOWN",
              status: result.response.status,
            },
          );
        }
        const persisted = await readInventory();
        if (mountedRef.current && coordinatorRef.current === instance) {
          lastCommittedServerRef.current = cloneOverlayMap(persisted.overrides);
          setEntries(persisted.entries);
          setExpectedHash(persisted.expectedHash);
          setOrphanCount(persisted.orphanCount);
        }
        return { rootHash: persisted.expectedHash ?? undefined };
      },
      onStateChange: (snapshot) => {
        if (mountedRef.current && coordinatorRef.current === instance) {
          setSaveSnapshot(snapshot);
          setSaving(snapshot.status === "saving");
        }
      },
      onCommitted: ({ value, latest }) => {
        if (!mountedRef.current || coordinatorRef.current !== instance) return;
        const committed = lastCommittedServerRef.current ?? value;
        setSavedOverrides(cloneOverlayMap(committed));
        if (latest) setOverrides(cloneOverlayMap(committed));
        if (latest) setConflictNotice(null);
      },
      onError: (error) => {
        if (!mountedRef.current || coordinatorRef.current !== instance) return;
        toast({ title: error.message, variant: "destructive" });
      },
    });
    return instance;
  }, [applyRemoteInventory, canEdit, projectId, readInventory, sessionId, toast]);
  coordinatorRef.current = coordinator;

  useEffect(() => {
    setSaveSnapshot(coordinator?.getSnapshot() ?? {
      status: "clean",
      error: null,
      localRevision: 0,
      committedRevision: 0,
      hasLocalDraft: false,
    });
    setSaving(false);
    const current = coordinator;
    return () => {
      if (!current) return;
      // React Strict Mode replays effect cleanup/setup without unmounting the
      // component. Defer disposal until the replay has had a chance to mount
      // the same coordinator again; real unmounts keep mountedRef=false.
      queueMicrotask(() => {
        if (!mountedRef.current || coordinatorRef.current !== current) {
          void current.dispose();
        }
      });
    };
  }, [coordinator]);

  const update = useCallback((uri: string, patch: Partial<InventoryHumanOverlay>) => {
    if (!canEdit) return;
    setOverrides((previous) => {
      const next = {
        ...previous,
        [uri]: { ...(previous[uri] ?? {}), ...patch },
      };
      coordinatorRef.current?.markDirty(next);
      return next;
    });
  }, [canEdit]);

  const restoreField = useCallback((uri: string, field: EditableOverlayField) => {
    if (!canEdit) return;
    setOverrides((previous) => {
      const current = previous[uri];
      if (!current) return previous;
      const nextOverlay = { ...current };
      delete nextOverlay[field];
      const next = { ...previous };
      if (Object.keys(nextOverlay).length > 0) next[uri] = nextOverlay;
      else delete next[uri];
      coordinatorRef.current?.markDirty(next);
      return next;
    });
  }, [canEdit]);

  const restoreAll = useCallback((uri: string) => {
    if (!canEdit) return;
    setOverrides((previous) => {
      if (!hasOwn(previous, uri)) return previous;
      const next = { ...previous };
      delete next[uri];
      coordinatorRef.current?.markDirty(next);
      return next;
    });
  }, [canEdit]);

  const refresh = useCallback(async () => {
    if (!canEdit || !sessionId) return;
    const flushed = await coordinatorRef.current?.flush() ?? true;
    if (!flushed) {
      toast({ title: "当前修改尚未保存", description: "请等待自动保存完成或处理冲突后，再刷新索引。", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/inventory/reconcile?sessionId=${encodeURIComponent(sessionId)}`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        throw new Error(body?.error?.message || "刷新索引失败");
      }
      toast({ title: "资源索引已刷新" });
      await load();
    } catch (error) {
      toast({
        title: "刷新资源索引失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [canEdit, load, projectId, sessionId, toast]);

  const retrySave = useCallback(() => {
    void coordinatorRef.current?.retry();
  }, []);

  const discardChanges = useCallback(() => {
    if (!canEdit || !dirty) return;
    setOverrides(cloneOverlayMap(savedOverrides));
    void coordinatorRef.current?.discardDraft();
    setConflictNotice(null);
    setEditingUri(null);
  }, [canEdit, dirty, savedOverrides]);

  const draftEntries = useMemo(
    () => entries.map((entry) => ({
      ...entry,
      resolved: resolveDraftSemantic(entry, overrides[entry.canonicalUri]),
    })),
    [entries, overrides],
  );
  const groups = useMemo(() => groupEntries(draftEntries), [draftEntries]);
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const matches = useCallback((entry: InventoryQueryEntry) => (
    entryMatches(entry, normalizedFilter)
      && typeMatches(entry, typeFilter)
      && statusMatches(entry, statusFilter, projectionState, generationActivity)
  ), [generationActivity, normalizedFilter, projectionState, statusFilter, typeFilter]);

  const visiblePages = useMemo(() => groups.pages
    .map((page) => {
      const configs = typeFilter === "page" || typeFilter === "project" || typeFilter === "document"
        ? []
        : page.configs.filter(matches);
      const pageMatches = matches(page.entry);
      const visible = pageMatches || configs.length > 0 || (!normalizedFilter && typeFilter === "all" && statusFilter === "all");
      return visible ? { ...page, configs: pageMatches && configs.length === 0 && typeFilter === "all" && statusFilter === "all" ? page.configs : configs } : null;
    })
    .filter((page): page is InventoryPageGroup => Boolean(page)), [groups.pages, matches, normalizedFilter, statusFilter, typeFilter]);
  const visibleDocuments = useMemo(() => groups.documents.filter(matches), [groups.documents, matches]);
  const visibleGovernance = useMemo(() => groups.governance.filter(matches), [groups.governance, matches]);
  const visibleReferenced = useMemo(() => groups.referenced.filter(matches), [groups.referenced, matches]);
  const visibleInactive = useMemo(() => groups.inactive.filter(matches), [groups.inactive, matches]);
  const autoExpandPages = Boolean(normalizedFilter) || typeFilter === "config" || statusFilter !== "all";
  const projectVisible = groups.project && (
    matches(groups.project)
      || visiblePages.length > 0
      || visibleDocuments.length > 0
      || visibleGovernance.length > 0
      || (!normalizedFilter && typeFilter === "all" && statusFilter === "all")
  ) ? groups.project : null;
  const visibleCount = (projectVisible ? 1 : 0) + visiblePages.length + visiblePages.reduce((count, page) => count + page.configs.length, 0) + visibleDocuments.length + visibleGovernance.length + visibleReferenced.length + visibleInactive.length;
  const editingEntry = editingUri ? draftEntries.find((entry) => entry.canonicalUri === editingUri) ?? null : null;
  const controlsDisabled = !canEdit || loading || saving;
  const saveStatusVisible = dirty || saveSnapshot.status !== "clean";

  const togglePage = useCallback((uri: string) => {
    setExpandedPages((previous) => {
      const next = new Set(previous);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!autoExpandPages) return;
    const matchingPages = visiblePages
      .filter((page) => page.configs.length > 0 || entryMatches(page.entry, normalizedFilter))
      .map((page) => page.entry.canonicalUri);
    if (matchingPages.length === 0) return;
    setExpandedPages((previous) => {
      const next = new Set(previous);
      matchingPages.forEach((uri) => next.add(uri));
      return next;
    });
  }, [autoExpandPages, normalizedFilter, visiblePages]);

  const renderInlineEditor = (entry: InventoryQueryEntry) => {
    if (editingEntry?.canonicalUri !== entry.canonicalUri) return null;
    return (
      <InventoryInlineEditor
        key={entry.canonicalUri}
        entry={entry}
        overlay={overrides[entry.canonicalUri] ?? {}}
        canEdit={canEdit}
        onClose={() => setEditingUri(null)}
        onUpdate={(patch) => update(entry.canonicalUri, patch)}
        onRestoreField={(field) => restoreField(entry.canonicalUri, field)}
        onRestoreAll={() => restoreAll(entry.canonicalUri)}
        onConfirmGenerated={() => update(entry.canonicalUri, { confirmedGeneratedHash: entry.generated?.contentHash ?? null })}
      />
    );
  };

  const renderProject = () => {
    if (!projectVisible) return null;
    const entry = projectVisible;
    return (
      <div className="rounded-lg border bg-card">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-300"><FolderTree className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{entry.resolved.name || "未命名项目"}</h3><Badge variant="outline" className="text-[10px] font-normal">项目</Badge></div>
            {entry.resolved.summary ? <p className="mt-1 text-sm text-muted-foreground">{entry.resolved.summary}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">{groups.pages.length} 个页面 · {groups.documents.length} 篇项目文档</p>
          </div>
          <InventoryRowActions entry={entry} canEdit={canEdit} onEdit={() => setEditingUri(entry.canonicalUri)} projectionState={projectionState} generationActivity={generationActivity} />
        </div>
        {renderInlineEditor(entry)}
      </div>
    );
  };

  const renderPage = (page: InventoryPageGroup) => {
    const expanded = expandedPages.has(page.entry.canonicalUri) || autoExpandPages;
    const entry = page.entry;
    return (
      <div key={entry.canonicalUri} className="overflow-hidden rounded-lg border bg-card">
        <div className={cn("flex items-start gap-3 px-4 py-3.5", expanded && "bg-muted/10")}>
          <button
            type="button"
            className="mt-0.5 flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => togglePage(entry.canonicalUri)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "收起" : "展开"}页面：${entry.resolved.name || "未命名页面"}`}
          >
            {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300"><FileText className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{entry.resolved.name || "未命名页面"}</h3></div>
              {entry.resolved.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.resolved.summary}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{page.configs.length} 个配置项{entry.native.metadata.routeKey ? ` · routeKey: ${String(entry.native.metadata.routeKey)}` : ""}</p>
            </div>
          </button>
          <InventoryRowActions entry={entry} canEdit={canEdit} onEdit={() => setEditingUri(entry.canonicalUri)} projectionState={projectionState} generationActivity={generationActivity} />
        </div>
        {renderInlineEditor(entry)}
        {expanded && page.configs.length > 0 ? (
          <div className="mx-5 mb-3 border-l pl-4">
            {page.configs.map((config) => (
              <div key={config.canonicalUri} className="border-b last:border-b-0">
                <div className="flex items-center gap-3 py-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground/70" />
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-xs font-medium">{config.resolved.name || "未命名配置项"}</span>
                  </div>
                  <InventoryRowActions entry={config} canEdit={canEdit} onEdit={() => setEditingUri(config.canonicalUri)} projectionState={projectionState} generationActivity={generationActivity} />
                </div>
                {renderInlineEditor(config)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderDocument = (entry: InventoryQueryEntry) => (
    <div key={entry.canonicalUri} className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-500/30 bg-slate-500/10 text-slate-300"><FileText className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{entry.resolved.name || `未命名${typeLabel(entry)}`}</h3><Badge variant="outline" className="text-[10px] font-normal">{typeLabel(entry)}</Badge></div>
          {entry.resolved.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.resolved.summary}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">{entry.scope === "referenced" ? "外部引用" : entry.sourceState !== "active" ? `来源状态：${entry.sourceState}` : `简介：${entry.resolved.summary || "暂无简介"}`}</p>
        </div>
        <InventoryRowActions entry={entry} canEdit={canEdit} onEdit={() => setEditingUri(entry.canonicalUri)} projectionState={projectionState} generationActivity={generationActivity} />
      </div>
      {renderInlineEditor(entry)}
    </div>
  );

  if (!sessionId) {
    return (
      <div data-testid="project-inventory-view" className="min-h-0 flex-1 overflow-y-auto">
        <section className="mx-auto w-full max-w-4xl space-y-4 p-5" aria-labelledby="project-inventory-title">
          <h1 id="project-inventory-title" className="text-lg font-semibold">项目清单</h1>
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">当前编辑会话尚未建立，清单暂不可用。</p>
        </section>
      </div>
    );
  }

  return (
    <div data-testid="project-inventory-view" className="min-h-0 flex-1 overflow-y-auto">
      <section className="mx-auto w-full max-w-4xl space-y-4 p-5" aria-labelledby="project-inventory-title">
        <header className="sticky top-0 z-10 -mx-5 space-y-3 border-b bg-background/95 px-5 pb-4 pt-1 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><h1 id="project-inventory-title" className="text-lg font-semibold">项目清单</h1><p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">为 Agent 提供项目资源的目录和简短简介；这里只维护简介，不修改页面内容、配置值或文档正文。</p></div>
            <div className="flex shrink-0 items-center gap-2">
              {dirty ? <Button variant="ghost" size="sm" onClick={discardChanges} disabled={saving}>放弃修改</Button> : null}
              {saveSnapshot.status === "conflict" ? <Button variant="ghost" size="sm" onClick={retrySave} disabled={saving}>重试保存</Button> : null}
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={controlsDisabled || !sessionId} aria-label="刷新项目清单"><RefreshCw className={loading ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} />刷新索引</Button>
              {saveStatusVisible ? <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{getDocumentSaveStatusLabel(saveSnapshot.status)}</span> : null}
              {!canEdit ? <span className="text-xs text-muted-foreground">只读视图</span> : null}
            </div>
          </div>

          {conflictNotice ? <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="flex-1">{conflictNotice}</span><button type="button" className="cursor-pointer text-amber-200 hover:text-white" aria-label="关闭冲突提示" onClick={() => setConflictNotice(null)}><X className="h-3.5 w-3.5" /></button></div> : null}
          {projectionState === "unavailable" ? <div role="alert" className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>索引服务不可用，当前展示工作空间实时目录；不会自动轮询。</span></div> : projectionState === "stale" || reconcileRequired ? <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>派生清单与当前工作空间不一致，当前展示实时目录。请刷新索引。</span></div> : projectionSource === "derived" && generationActivity === "active" ? <div className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>语义生成任务正在运行。</span></div> : null}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
            <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索资源名称、别名或简介" aria-label="筛选项目清单" className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring" /></div>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as InventoryTypeFilter)} aria-label="按资源类型筛选" className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="all">全部类型</option><option value="project">项目</option><option value="page">页面</option><option value="config">配置项</option><option value="document">文档</option></select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as InventoryStatusFilter)} aria-label="按状态筛选" className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            {filter || typeFilter !== "all" || statusFilter !== "all" ? <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setFilter(""); setTypeFilter("all"); setStatusFilter("all"); }}>清除筛选</Button> : null}
          </div>
        </header>

        {loading && entries.length === 0 ? <div className="flex items-center justify-center rounded-lg border p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div> : visibleCount === 0 ? <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">没有符合当前筛选条件的资源</div> : <div className="space-y-5">
          {renderProject() ? <section className="space-y-2" aria-labelledby="inventory-project-section"><div className="flex items-center justify-between px-1"><h2 id="inventory-project-section" className="text-xs font-medium text-muted-foreground">项目</h2><span className="text-[10px] text-muted-foreground">项目级语义</span></div>{renderProject()}</section> : null}
          {visiblePages.length > 0 ? <section className="space-y-2" aria-labelledby="inventory-page-section"><div className="flex items-center justify-between px-1"><h2 id="inventory-page-section" className="text-xs font-medium text-muted-foreground">页面</h2><span className="text-[10px] text-muted-foreground">展开查看配置项归属</span></div>{visiblePages.map(renderPage)}</section> : null}
          {visibleDocuments.length > 0 ? <section className="space-y-2" aria-labelledby="inventory-document-section"><div className="flex items-center justify-between px-1"><h2 id="inventory-document-section" className="text-xs font-medium text-muted-foreground">项目文档</h2><span className="text-[10px] text-muted-foreground">原生元数据 · 默认只读</span></div>{visibleDocuments.map(renderDocument)}</section> : null}
          {visibleGovernance.length > 0 ? <section className="space-y-2" aria-labelledby="inventory-governance-section"><div className="flex items-center justify-between px-1"><h2 id="inventory-governance-section" className="text-xs font-medium text-muted-foreground">治理文档</h2><span className="text-[10px] text-muted-foreground">AI 记忆、公约与设计规范</span></div>{visibleGovernance.map(renderDocument)}</section> : null}
          {visibleReferenced.length > 0 ? <section className="space-y-2" aria-labelledby="inventory-referenced-section"><div className="flex items-center justify-between px-1"><h2 id="inventory-referenced-section" className="text-xs font-medium text-muted-foreground">外部引用</h2><span className="text-[10px] text-muted-foreground">按当前权限显示</span></div>{visibleReferenced.map(renderDocument)}</section> : null}
          {visibleInactive.length > 0 ? <section className="space-y-2" aria-labelledby="inventory-inactive-section"><div className="flex items-center justify-between px-1"><h2 id="inventory-inactive-section" className="text-xs font-medium text-muted-foreground">来源异常</h2><span className="text-[10px] text-muted-foreground">仅用于诊断</span></div>{visibleInactive.map(renderDocument)}</section> : null}
        </div>}

        {orphanCount > 0 ? <p className="text-[11px] text-muted-foreground">另有 {orphanCount} 条已删除资源的覆盖记录未进入正常清单。</p> : null}
        <p className="pb-2 text-[11px] text-muted-foreground">清单帮助 Agent 找到资源和理解简介；项目公约仍负责规则，原始页面、配置和文档仍负责事实。</p>
      </section>

    </div>
  );
}
