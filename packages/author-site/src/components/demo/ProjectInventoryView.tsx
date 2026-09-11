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
  RefreshCw,
  RotateCcw,
  Save,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

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
  referenced: InventoryQueryEntry[];
  inactive: InventoryQueryEntry[];
}

interface InventoryPayload {
  entries: InventoryQueryEntry[];
  overrides: Record<string, InventoryHumanOverlay>;
  expectedHash: string | null;
  freshness: string;
  orphanCount: number;
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

function entryStatus(entry: InventoryQueryEntry): InventoryStatus {
  if (entry.sourceState !== "active") {
    return { label: "来源异常", tone: "destructive", attention: true };
  }
  if (entry.generationState === "failed") {
    return { label: "生成失败", tone: "destructive", attention: true };
  }
  if (entry.generationState === "pending") {
    return { label: "生成中", tone: "warning", attention: true };
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

function statusMatches(entry: InventoryQueryEntry, filter: InventoryStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "referenced") return entry.scope === "referenced";
  if (filter === "unavailable") return entry.sourceState !== "active";
  if (filter === "attention") return entryStatus(entry).attention;
  return !entryStatus(entry).attention && entry.sourceState === "active";
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
    documents: localActive.filter((entry) => entry.resourceType === "document"),
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
}

function InventoryStatusBadge({ entry, compact = false }: InventoryStatusBadgeProps) {
  const status = entryStatus(entry);
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

interface InventoryEditorPanelProps {
  entry: InventoryQueryEntry;
  overlay: InventoryHumanOverlay;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (patch: Partial<InventoryHumanOverlay>) => void;
  onRestoreField: (field: EditableOverlayField) => void;
  onRestoreAll: () => void;
  onConfirmGenerated: () => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}

function InventoryEditorPanel({
  entry,
  overlay,
  canEdit,
  onOpenChange,
  onUpdate,
  onRestoreField,
  onRestoreAll,
  onConfirmGenerated,
  onSave,
  saving,
  dirty,
}: InventoryEditorPanelProps) {
  const resolved = resolveDraftSemantic(entry, overlay);
  const confirmedGeneratedHash = hasOwn(overlay, "confirmedGeneratedHash")
    ? overlay.confirmedGeneratedHash
    : entry.human.confirmedGeneratedHash;
  const currentHint = (value: string | null | undefined) => `当前：${value || "未声明"}`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="inventory-editor-panel"
        className="left-auto right-0 top-0 h-full max-h-screen w-full max-w-[460px] translate-x-0 translate-y-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0 sm:max-w-[460px]"
      >
        <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{typeLabel(entry)}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate">{entry.resolved.name || "未命名资源"}</span>
          </div>
          <DialogTitle className="flex items-center gap-2 text-lg">
            编辑简介
            <Badge variant="outline" className="text-[10px] font-normal">{typeLabel(entry)}</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            只修改 Agent 使用的语义覆盖，不会修改页面内容、配置值或文档正文。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{resolved.summary || "暂无简介，补充后可帮助 Agent 更准确地理解这个资源。"}</span>
            </div>
          </div>

          <section className="space-y-3" aria-labelledby="inventory-semantic-fields-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="inventory-semantic-fields-title" className="text-sm font-medium">简介</h3>
              <span className="text-[11px] text-muted-foreground">留空使用当前默认简介</span>
            </div>

            <div className="grid gap-4">
              <InventoryEditorField
                id="inventory-summary"
                label="简介"
                value={overlay.summary ?? ""}
                placeholder="用一两句话说明这个资源做什么"
                hint={currentHint(resolved.summary)}
                disabled={!canEdit}
                hasOverride={overlayHasValue(overlay, "summary")}
                onChange={(value) => onUpdate({ summary: value || null })}
                onRestore={() => onRestoreField("summary")}
              />
            </div>
          </section>

          <section className="space-y-3 border-t pt-4" aria-labelledby="inventory-source-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="inventory-source-title" className="text-sm font-medium">来源</h3>
              <InventoryStatusBadge entry={entry} compact />
            </div>
            <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {entry.generated ? "简介来自 AI 生成基线，可在确认后作为当前项目资料使用。" : "简介来自项目原生信息，清单不会重复读取文档或配置内容。"}
            </div>
            <details className="rounded-md border px-3 py-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">查看 URI、证据与索引状态</summary>
              <div className="mt-2 space-y-1 break-all font-mono text-[10px] leading-5 text-muted-foreground">
                <div>URI：{entry.canonicalUri}</div>
                <div>来源：{entry.scope} · {entry.sourceState}</div>
                <div>生成：{entry.generationState} · 复核：{entry.reviewState}</div>
                {entry.generated?.evidenceRefs.map((ref) => (
                  <div key={`${ref.sourceUri}:${ref.selector}`}>证据：{ref.sourceKind}:{ref.selector}</div>
                ))}
              </div>
            </details>
          </section>
        </div>

        <DialogFooter className="sticky bottom-0 mt-auto flex-row items-center justify-between gap-2 border-t bg-background px-5 py-3">
          <div className="flex items-center gap-1">
            {entry.generated && confirmedGeneratedHash !== entry.generated.contentHash ? (
              <Button variant="ghost" size="sm" disabled={!canEdit} onClick={onConfirmGenerated}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                确认 AI 版本
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" disabled={!canEdit} onClick={onRestoreAll}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              恢复默认简介
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            关闭
          </Button>
          <Button size="sm" onClick={onSave} disabled={!canEdit || !dirty || saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            保存覆盖
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface InventoryEditorFieldProps {
  id: string;
  label: ReactNode;
  value: string;
  placeholder: string;
  hint: string;
  disabled: boolean;
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
  hasOverride,
  onChange,
  onRestore,
}: InventoryEditorFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-foreground">{label}</label>
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
}

function InventoryRowActions({ entry, canEdit, onEdit }: InventoryRowActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <InventoryStatusBadge entry={entry} />
      {canEdit ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          aria-label={`编辑简介：${entry.resolved.name || "未命名资源"}`}
        >
          编辑简介
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
  const [freshness, setFreshness] = useState("unavailable");
  const [orphanCount, setOrphanCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<InventoryTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>("all");
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [editingUri, setEditingUri] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const dirty = useMemo(
    () => overlayFingerprint(overrides) !== overlayFingerprint(savedOverrides),
    [overrides, savedOverrides],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => {
    mountedRef.current = false;
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  const readInventory = useCallback(async (): Promise<InventoryPayload> => {
    if (!sessionId) throw new Error("当前编辑会话尚未建立");
    const query = `?sessionId=${encodeURIComponent(sessionId)}`;
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/inventory/overrides${query}`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
      throw new Error(body?.error?.message || "读取资源清单失败");
    }
    return {
      entries: Array.isArray(body.data?.entries) ? body.data.entries : [],
      overrides: body.data?.overrides?.entries ?? {},
      expectedHash: typeof body.data?.hash === "string" ? body.data.hash : null,
      freshness: typeof body.data?.freshness === "string" ? body.data.freshness : "unavailable",
      orphanCount: Array.isArray(body.data?.orphanEntries) ? body.data.orphanEntries.length : 0,
    };
  }, [projectId, sessionId]);

  const applyInventory = useCallback((payload: InventoryPayload, nextOverrides = payload.overrides) => {
    setEntries(payload.entries);
    setOverrides(cloneOverlayMap(nextOverrides));
    setSavedOverrides(cloneOverlayMap(payload.overrides));
    setExpectedHash(payload.expectedHash);
    setFreshness(payload.freshness);
    setOrphanCount(payload.orphanCount);
    setConflictNotice(null);
  }, []);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      applyInventory(await readInventory());
    } catch (error) {
      toast({
        title: "资源清单不可用",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) setLoading(false);
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
      setFreshness("unavailable");
      setOrphanCount(0);
    }
  }, [load, sessionId]);

  const update = useCallback((uri: string, patch: Partial<InventoryHumanOverlay>) => {
    if (!canEdit) return;
    setOverrides((previous) => ({
      ...previous,
      [uri]: { ...(previous[uri] ?? {}), ...patch },
    }));
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
      return next;
    });
  }, [canEdit]);

  const restoreAll = useCallback((uri: string) => {
    if (!canEdit) return;
    setOverrides((previous) => {
      if (!hasOwn(previous, uri)) return previous;
      const next = { ...previous };
      delete next[uri];
      return next;
    });
  }, [canEdit]);

  const save = useCallback(async () => {
    if (!canEdit || !sessionId || !dirty) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/inventory/overrides?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: overrides, expectedHash }),
        },
      );
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        const latest = await readInventory();
        const rebased = mergeLocalOverlayChanges(savedOverrides, overrides, latest.overrides);
        setEntries(latest.entries);
        setSavedOverrides(cloneOverlayMap(latest.overrides));
        setOverrides(rebased);
        setExpectedHash(latest.expectedHash);
        setFreshness(latest.freshness);
        setOrphanCount(latest.orphanCount);
        setConflictNotice("清单已被其他会话更新，已保留本地修改。请检查后再次保存。");
        toast({ title: "已保留本地修改", description: "清单已重新载入，请确认后再次保存。", variant: "destructive" });
        return;
      }
      if (!response.ok || !body?.success) {
        throw new Error(body?.error?.message || "保存失败");
      }
      toast({ title: "资源清单覆盖已保存" });
      await load();
    } catch (error) {
      toast({
        title: "保存资源清单失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [canEdit, dirty, expectedHash, load, overrides, projectId, readInventory, savedOverrides, sessionId, toast]);

  const refresh = useCallback(async () => {
    if (!canEdit || !sessionId) return;
    if (dirty) {
      toast({ title: "请先处理未保存修改", description: "保存或放弃当前修改后，再刷新索引。", variant: "destructive" });
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
  }, [canEdit, dirty, load, projectId, sessionId, toast]);

  const discardChanges = useCallback(() => {
    if (!canEdit || !dirty) return;
    setOverrides(cloneOverlayMap(savedOverrides));
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
      && statusMatches(entry, statusFilter)
  ), [normalizedFilter, statusFilter, typeFilter]);

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
  const visibleReferenced = useMemo(() => groups.referenced.filter(matches), [groups.referenced, matches]);
  const visibleInactive = useMemo(() => groups.inactive.filter(matches), [groups.inactive, matches]);
  const autoExpandPages = Boolean(normalizedFilter) || typeFilter === "config" || statusFilter !== "all";
  const projectVisible = groups.project && (
    matches(groups.project)
      || visiblePages.length > 0
      || visibleDocuments.length > 0
      || (!normalizedFilter && typeFilter === "all" && statusFilter === "all")
  ) ? groups.project : null;
  const visibleCount = (projectVisible ? 1 : 0) + visiblePages.length + visiblePages.reduce((count, page) => count + page.configs.length, 0) + visibleDocuments.length + visibleReferenced.length + visibleInactive.length;
  const attentionCount = draftEntries.filter((entry) => entry.scope === "local" && entry.sourceState === "active" && entryStatus(entry).attention).length;
  const editingEntry = editingUri ? draftEntries.find((entry) => entry.canonicalUri === editingUri) ?? null : null;
  const controlsDisabled = !canEdit || loading || saving;

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
          <InventoryRowActions entry={entry} canEdit={canEdit} onEdit={() => setEditingUri(entry.canonicalUri)} />
        </div>
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
              <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{entry.resolved.name || "未命名页面"}</h3><Badge variant="outline" className="text-[10px] font-normal">页面</Badge></div>
              {entry.resolved.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.resolved.summary}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{page.configs.length} 个配置项{entry.native.metadata.routeKey ? ` · routeKey: ${String(entry.native.metadata.routeKey)}` : ""}</p>
            </div>
          </button>
          <InventoryRowActions entry={entry} canEdit={canEdit} onEdit={() => setEditingUri(entry.canonicalUri)} />
        </div>
        {expanded && page.configs.length > 0 ? (
          <div className="mx-5 mb-3 border-l pl-4">
            {page.configs.map((config) => (
              <div key={config.canonicalUri} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground/70" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-medium">{config.resolved.name || "未命名配置项"}</span><Badge variant="outline" className="shrink-0 text-[10px] font-normal">配置项</Badge></div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{typeof config.native.metadata.displayPath === "string" ? config.native.metadata.displayPath : config.native.aliases[0] || "字段定义"}</p>
                </div>
                <InventoryRowActions entry={config} canEdit={canEdit} onEdit={() => setEditingUri(config.canonicalUri)} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderDocument = (entry: InventoryQueryEntry) => (
    <div key={entry.canonicalUri} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-500/30 bg-slate-500/10 text-slate-300"><FileText className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{entry.resolved.name || `未命名${typeLabel(entry)}`}</h3><Badge variant="outline" className="text-[10px] font-normal">{typeLabel(entry)}</Badge></div>
        {entry.resolved.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.resolved.summary}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">{entry.scope === "referenced" ? "外部引用" : entry.sourceState !== "active" ? `来源状态：${entry.sourceState}` : `简介：${entry.resolved.summary || "暂无简介"}`}</p>
      </div>
      <InventoryRowActions entry={entry} canEdit={canEdit} onEdit={() => setEditingUri(entry.canonicalUri)} />
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
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={controlsDisabled || !sessionId} aria-label="刷新项目清单"><RefreshCw className={loading ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"} />刷新索引</Button>
              <Button size="sm" onClick={() => void save()} disabled={controlsDisabled || !sessionId || !dirty}>{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}{dirty ? "保存覆盖" : "已保存"}</Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border px-2 py-1"><strong className="text-foreground">{groups.pages.length}</strong> 个页面</span>
            <span className="rounded-full border px-2 py-1"><strong className="text-foreground">{groups.pages.reduce((count, page) => count + page.configs.length, 0)}</strong> 个配置项</span>
            <span className="rounded-full border px-2 py-1"><strong className="text-foreground">{groups.documents.length}</strong> 篇项目文档</span>
            <span className={cn("rounded-full border px-2 py-1", freshness === "fresh" ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-200")}>索引 {freshness}</span>
            {!canEdit ? <span className="rounded-full border px-2 py-1">当前为只读视图</span> : null}
          </div>

          {conflictNotice ? <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="flex-1">{conflictNotice}</span><button type="button" className="cursor-pointer text-amber-200 hover:text-white" aria-label="关闭冲突提示" onClick={() => setConflictNotice(null)}><X className="h-3.5 w-3.5" /></button></div> : null}
          {attentionCount > 0 ? <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"><Info className="h-3.5 w-3.5 shrink-0" /><strong>{attentionCount} 条语义待处理</strong><span className="text-amber-100/70">只提示需要人工判断的项目或页面</span><button type="button" className="ml-auto cursor-pointer text-amber-200 hover:text-white" onClick={() => setStatusFilter("attention")}>查看待处理项 →</button></div> : null}

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
          {visibleReferenced.length > 0 ? <section className="space-y-2" aria-labelledby="inventory-referenced-section"><div className="flex items-center justify-between px-1"><h2 id="inventory-referenced-section" className="text-xs font-medium text-muted-foreground">外部引用</h2><span className="text-[10px] text-muted-foreground">按当前权限显示</span></div>{visibleReferenced.map(renderDocument)}</section> : null}
          {visibleInactive.length > 0 ? <section className="space-y-2" aria-labelledby="inventory-inactive-section"><div className="flex items-center justify-between px-1"><h2 id="inventory-inactive-section" className="text-xs font-medium text-muted-foreground">来源异常</h2><span className="text-[10px] text-muted-foreground">仅用于诊断</span></div>{visibleInactive.map(renderDocument)}</section> : null}
        </div>}

        {orphanCount > 0 ? <p className="text-[11px] text-muted-foreground">另有 {orphanCount} 条已删除资源的覆盖记录未进入正常清单。</p> : null}
        <p className="pb-2 text-[11px] text-muted-foreground">清单帮助 Agent 找到资源和理解简介；项目公约仍负责规则，原始页面、配置和文档仍负责事实。</p>
      </section>

      {editingEntry ? <InventoryEditorPanel entry={editingEntry} overlay={overrides[editingEntry.canonicalUri] ?? {}} canEdit={canEdit} onOpenChange={(open) => { if (!open) setEditingUri(null); }} onUpdate={(patch) => update(editingEntry.canonicalUri, patch)} onRestoreField={(field) => restoreField(editingEntry.canonicalUri, field)} onRestoreAll={() => restoreAll(editingEntry.canonicalUri)} onConfirmGenerated={() => update(editingEntry.canonicalUri, { confirmedGeneratedHash: editingEntry.generated?.contentHash ?? null })} onSave={() => void save()} saving={saving} dirty={dirty} /> : null}
    </div>
  );
}
