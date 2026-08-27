"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  Upload,
  X,
} from "lucide-react";
import { SandboxedHtmlFrame } from "@workbench/demo-ui";
import {
  createPagePresentationProfile,
  isValidPagePresentationViewport,
  PAGE_PRESENTATION_LIMITS,
  PAGE_PRESENTATION_PRESETS,
  type DemoPageMeta,
  type PagePresentationProfile,
} from "@workbench/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { projectApiClient } from "@/lib/project-api";

export type HtmlImportPreset = "desktop" | "tablet" | "mobile" | "custom";
export type HtmlImportConfidence = "high" | "medium" | "low";
export type HtmlImportPresentation = PagePresentationProfile;
export interface HtmlImportDraft {
  id: string;
  filename: string;
  html: string;
  confidence: HtmlImportConfidence;
  requiresConfirmation: boolean;
  runtimeType?: "prototype-html-css" | "sandboxed-html";
  detectedViewport?: { width: number; height: number };
  recommendedPresentation: HtmlImportPresentation;
  sandboxExecutionUrl?: string;
  sandboxChannelId?: string;
  warnings?: string[];
  resourceFindings?: Array<{
    classification: string;
    impact: "preserved" | "blocked";
    remediation: string;
    tagName: string;
    attributeName: string;
    path: string;
  }>;
}
export interface HtmlImportCommitInput {
  draft: HtmlImportDraft;
  name: string;
  presentation: HtmlImportPresentation;
}
export interface HtmlImportWorkbenchProps {
  prepareImport?: (input: {
    filename: string;
    html: string;
  }) => Promise<HtmlImportDraft>;
  commitImport?: (
    input: HtmlImportCommitInput,
  ) => Promise<{ page: DemoPageMeta; warnings?: string[] }>;
  initialFiles?: File[];
  onInitialFilesConsumed?: () => void;
}
interface FileEntry {
  file: File;
  id: string;
  name: string;
  html?: string;
  draft?: HtmlImportDraft;
  presentation: HtmlImportPresentation;
  status: "idle" | "preparing" | "importing" | "success" | "error";
  preparationStatus: "queued" | "preparing" | "prepared" | "rejected" | "cancelled";
  confirmationStatus: "not-required" | "required" | "confirmed";
  previewStatus: "unavailable" | "loading" | "ready" | "incomplete" | "runtime-error" | "timeout" | "left-document";
  commitStatus: "not-started" | "committing" | "succeeded" | "retryable-failure";
  confirmationAccepted?: boolean;
  errorMessage?: string;
}

const PRESETS = {
  desktop: { label: "电脑", width: 1440, height: 900, icon: Monitor },
  tablet: { label: "平板", width: 768, height: 1024, icon: Tablet },
  mobile: { label: "手机", width: 390, height: 844, icon: Smartphone },
} as const;
function pageName(filename: string) {
  return filename.replace(/\.html?$/i, "").trim() || "导入的 HTML 页面";
}
function size(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}
const DEFAULT_PRESENTATION = createPagePresentationProfile({
  mode: "responsive-page",
  viewport: PAGE_PRESENTATION_PRESETS.desktop,
  heightBehavior: "content",
  source: "recommended",
});

export function ImportFromFigmaDialog({
  open,
  onOpenChange,
  projectId,
  sessionId,
  onPageCreated,
  onPreviewStatus,
  prepareImport,
  commitImport,
  initialFiles,
  onInitialFilesConsumed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sessionId: string | null;
  onPageCreated: (page: DemoPageMeta) => void;
  onPreviewStatus?: (status: FileEntry["previewStatus"]) => void;
} & HtmlImportWorkbenchProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const consumedInitialFiles = useRef<File[] | undefined>(undefined);
  const { toast } = useToast();
  const active = files.find((item) => item.id === activeId) ?? files[0];
  const reset = useCallback(() => {
    setFiles([]);
    setActiveId(undefined);
    setImporting(false);
    setDragging(false);
  }, []);
  const closeWorkbench = useCallback(() => {
    if (sessionId) {
      void Promise.allSettled(
        files
          .filter((entry) => entry.status !== "success" && entry.draft)
          .map((entry) =>
            projectApiClient.cancelHtmlImport(
              projectId,
              sessionId,
              entry.draft!.id,
            ),
          ),
      );
    }
    reset();
    onOpenChange(false);
  }, [files, onOpenChange, projectId, reset, sessionId]);
  const removeEntry = useCallback(
    (entry: FileEntry) => {
      if (sessionId && entry.draft) {
        void projectApiClient.cancelHtmlImport(
          projectId,
          sessionId,
          entry.draft.id,
        );
      }
      setFiles((current) => current.filter((item) => item.id !== entry.id));
      setActiveId((current) => (current === entry.id ? undefined : current));
    },
    [projectId, sessionId],
  );
  const addFiles = useCallback(
    (incoming: File[]) => {
      const valid = incoming.filter(
        (file) => /\.html?$/i.test(file.name) || file.type === "text/html",
      );
      if (valid.length !== incoming.length)
        toast({
          title: "跳过不支持的文件",
          description: "仅支持 .html、.htm 文件。",
          variant: "destructive",
        });
      const next = valid
        .filter(
          (file) =>
            !files.some(
              (item) =>
                item.file.name === file.name && item.file.size === file.size,
            ),
        )
        .map((file) => ({
          file,
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: pageName(file.name),
          status: "idle" as const,
          preparationStatus: "queued" as const,
          confirmationStatus: "not-required" as const,
          previewStatus: "unavailable" as const,
          commitStatus: "not-started" as const,
          presentation: DEFAULT_PRESENTATION,
        }));
      if (next.length) {
        setFiles((current) => [...current, ...next]);
        setActiveId((current) => current ?? next[0].id);
      }
    },
    [files, toast],
  );
  useEffect(() => {
    if (!initialFiles?.length) return;
    if (consumedInitialFiles.current === initialFiles) return;
    consumedInitialFiles.current = initialFiles;
    addFiles(initialFiles);
    onInitialFilesConsumed?.();
  }, [
    initialFiles,
    addFiles,
    onInitialFilesConsumed,
  ]);
  const prepare = useCallback(
    async (entry: FileEntry) => {
      const html = entry.html ?? (await entry.file.text());
      if (!html.trim()) throw new Error("文件为空");
      const draft = prepareImport
        ? await prepareImport({ filename: entry.file.name, html })
        : await projectApiClient
            .prepareHtmlImport(
              projectId,
              sessionId!,
              entry.file.name,
              html,
              entry.name,
            )
            .then((value) => ({
              id: value.draftId,
              filename: value.filename,
              html,
              confidence: value.analysis.presentation.confidence,
              requiresConfirmation: value.confirmationRequired,
              runtimeType:
                value.analysis.outcome.status === "accepted"
                  ? value.analysis.outcome.runtimeType
                  : undefined,
              detectedViewport: value.analysis.detectedViewport,
              recommendedPresentation: value.recommendation,
              sandboxExecutionUrl: value.execution?.executionUrl,
              sandboxChannelId: value.execution?.channelId,
              warnings: Array.from(
                new Set([
                  ...value.analysis.unsupportedCapabilities.map(
                    (item) => item.code,
                  ),
                  ...value.analysis.warnings.map((item) => item.code),
                ]),
              ),
              resourceFindings: (value.analysis.resourceReferences ?? [])
                .filter((item) => item.classification !== "data" && item.classification !== "fragment")
                .map(({ value: _value, ...item }) => item),
            }));
      return {
        ...entry,
        html,
        draft,
        presentation: draft.recommendedPresentation,
        confirmationAccepted: !draft.requiresConfirmation,
      };
    },
    [prepareImport, projectId, sessionId],
  );
  const ensurePrepared = useCallback(
    async (entry: FileEntry) => {
      if (entry.html && entry.draft) return entry;
      setFiles((current) =>
        current.map((item) =>
          item.id === entry.id ? { ...item, status: "preparing", preparationStatus: "preparing" } : item,
        ),
      );
      try {
        const value = await prepare(entry);
        setFiles((current) =>
          current.map((item) =>
            item.id === entry.id
              ? { ...value, status: "idle", preparationStatus: "prepared", confirmationStatus: value.draft?.requiresConfirmation ? "required" : "not-required", previewStatus: value.draft?.sandboxExecutionUrl ? "loading" : "unavailable" }
              : item,
          ),
        );
        return value;
      } catch (error) {
        setFiles((current) =>
          current.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  status: "error",
                  preparationStatus: "rejected",
                  errorMessage:
                    error instanceof Error ? error.message : "预览准备失败",
                }
              : item,
          ),
        );
        return undefined;
      }
    },
    [prepare],
  );
  useEffect(() => {
    if (!open || !active || active.status !== "idle" || active.draft) return;
    void ensurePrepared(active);
  }, [active, ensurePrepared, open]);
  const preset = (value: HtmlImportPreset) => {
    if (!active) return;
    const viewport =
      value === "custom"
        ? active.presentation.viewport
        : PRESETS[value].width
          ? { width: PRESETS[value].width, height: PRESETS[value].height }
          : active.presentation.viewport;
    setFiles((current) =>
      current.map((item) =>
        item.id === active.id
          ? {
              ...item,
              presentation: {
                ...item.presentation,
                preset: value,
                viewport,
                source: "user",
              },
            }
          : item,
      ),
    );
  };
  const applyAll = () => {
    if (!active) return;
    setFiles((current) =>
      current.map((item) => ({
        ...item,
        presentation: {
          ...item.presentation,
          preset: active.presentation.preset,
          viewport: active.presentation.viewport,
          source: "user",
        },
      })),
    );
  };
  const importAll = useCallback(async () => {
    if (!files.length || !sessionId) {
      if (!sessionId)
        toast({
          title: "未创建 Session",
          description: "请先进入编辑模式",
          variant: "destructive",
        });
      return;
    }
    setImporting(true);
    let success = 0;
    let failed = 0;
    for (const original of files) {
      if (original.status === "success") continue;
      setFiles((current) =>
        current.map((item) =>
          item.id === original.id ? { ...item, status: "importing", commitStatus: "committing" } : item,
        ),
      );
      try {
        const entry = await ensurePrepared(original);
        if (!entry) throw new Error("预览准备失败");
        const name = entry.name;
        let page: DemoPageMeta;
        if (commitImport && entry.draft)
          page = (
            await commitImport({
              draft: entry.draft,
              name,
              presentation: entry.presentation,
            })
          ).page;
        else if (entry.draft)
          page = (
            await projectApiClient.commitHtmlImport(
              projectId,
              sessionId,
              entry.draft.id,
              entry.presentation,
              name,
              entry.confirmationAccepted === true,
            )
          ).page;
        else throw new Error("HTML 导入草稿不存在，请重新准备预览");
        setFiles((current) =>
          current.map((item) =>
            item.id === entry.id ? { ...item, status: "success", commitStatus: "succeeded" } : item,
          ),
        );
        onPageCreated(page);
        success++;
      } catch (error) {
        failed++;
        setFiles((current) =>
          current.map((item) =>
            item.id === original.id
              ? {
                  ...item,
                  status: "error",
                  commitStatus: "retryable-failure",
                  errorMessage:
                    error instanceof Error ? error.message : "导入失败",
                }
              : item,
          ),
        );
      }
    }
    setImporting(false);
    if (success)
      toast({
        title: "批量导入完成",
        description: `成功导入 ${success} 个页面${failed ? `，${failed} 个失败` : ""}`,
      });
    if (failed)
      toast({
        title: "HTML 导入失败",
        description: "失败文件已保留，请查看原因并修正后重试。",
        variant: "destructive",
      });
    if (!failed) {
      reset();
      onOpenChange(false);
    }
  }, [
    commitImport,
    ensurePrepared,
    files,
    onOpenChange,
    onPageCreated,
    projectId,
    reset,
    sessionId,
    toast,
  ]);
  const confidence =
    active?.draft?.confidence ??
    (active?.presentation.source === "figma" ? "high" : "low");
  const securePreview = Boolean(
    active?.draft?.sandboxExecutionUrl && active.draft.sandboxChannelId,
  );
  const invalidViewport = active
    ? !isValidPagePresentationViewport(active.presentation.viewport)
    : false;
  const canImport =
    files.length > 0 &&
    files.some((entry) => entry.status !== "success") &&
    files.every(
      (entry) =>
        entry.status === "success" ||
        (entry.name.trim().length > 0 &&
          (!entry.draft?.requiresConfirmation || entry.confirmationAccepted === true) &&
          isValidPagePresentationViewport(entry.presentation.viewport)),
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) closeWorkbench();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            导入 HTML 工作台
          </DialogTitle>
          <DialogDescription>
            尺寸仅决定默认展示视口，不会修改 HTML 源码。普通 HTML
            建议确认后再导入。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:min-h-[520px] md:grid-cols-[220px_minmax(0,1fr)_260px]">
          <aside
            className="border-b p-4 md:border-b-0 md:border-r"
            aria-label="HTML 文件列表"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">
                文件 ({files.length})
              </span>
              <button
                type="button"
                aria-label="添加 HTML 文件"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".html,.htm,text/html"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files)
                  addFiles(Array.from(event.target.files));
                event.target.value = "";
              }}
            />
            {!files.length ? (
              <button
                type="button"
                className={`flex min-h-36 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center text-xs text-muted-foreground ${dragging ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                拖拽 HTML 文件到此处
                <br />
                或点击上传
              </button>
            ) : (
              <div className="space-y-1">
                {files.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex w-full items-start gap-2 rounded-md p-2 text-left text-sm ${entry.id === active?.id ? "bg-accent" : "hover:bg-muted"}`}
                  >
                    <button
                      type="button"
                      aria-label={`选择 ${entry.file.name}`}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        setActiveId(entry.id);
                        void ensurePrepared(entry);
                      }}
                    >
                      <span className="mt-0.5 shrink-0">
                        {entry.status === "preparing" ||
                        entry.status === "importing" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : entry.status === "success" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : entry.status === "error" ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">
                          {entry.status === "success"
                            ? "已导入"
                            : entry.status === "error"
                              ? "失败"
                              : entry.status === "preparing"
                                ? "分析中"
                                : entry.status === "importing"
                                  ? "导入中"
                                  : "待确认"}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {entry.file.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {entry.errorMessage || size(entry.file.size)}
                        </span>
                      </span>
                    </button>
                    {entry.status === "idle" && (
                      <button
                        type="button"
                        aria-label={`移除 ${entry.file.name}`}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeEntry(entry);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
          <section
            className="flex min-h-[320px] flex-col bg-muted/30 p-4"
            aria-label="HTML 预览"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">实时预览</p>
                <p className="text-xs text-muted-foreground">独立安全沙箱</p>
              </div>
              {active && (
                <span
                  className={`rounded-full px-2 py-1 text-xs ${confidence === "high" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                >
                  {confidence === "high" ? "已识别固定画板" : "需要确认尺寸"}
                </span>
              )}
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border bg-background shadow-inner">
              {securePreview ? (
                <SandboxedHtmlFrame
                  executionUrl={active!.draft!.sandboxExecutionUrl!}
                  channelId={active!.draft!.sandboxChannelId!}
                  title={active!.file.name}
                  previewSize={{
                    width: active!.presentation.viewport.width,
                    height: active!.presentation.viewport.height,
                  }}
                  fillContainer
                  onStatusChange={(status) => {
                    const previewStatus = status === "loaded" || status === "loading"
                      ? "loading"
                      : status === "empty-first-frame" || status === "error"
                        ? "incomplete"
                        : status;
                    onPreviewStatus?.(previewStatus);
                    setFiles((current) => current.map((item) =>
                      item.id === active!.id ? { ...item, previewStatus } : item,
                    ));
                  }}
                />
              ) : (
                <div className="max-w-xs px-6 text-center text-sm text-muted-foreground">
                  {active
                    ? "选择文件后将由服务端准备安全预览。未接入 prepare 接口时，导入仍会按现有流程完成。"
                    : "添加 HTML 文件后在此确认页面尺寸"}
                </div>
              )}
            </div>
          </section>
          <aside
            className="space-y-5 border-t p-4 md:border-l md:border-t-0"
            aria-label="导入设置"
          >
            <div>
              <label
                htmlFor="html-import-name"
                className="mb-1.5 block text-sm font-medium"
              >
                页面名称
              </label>
              <Input
                id="html-import-name"
                value={active?.name ?? ""}
                disabled={!active}
                onChange={(event) =>
                  setFiles((current) =>
                    current.map((item) =>
                      item.id === active?.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="导入的 HTML 页面"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">默认展示尺寸</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={applyAll}
                  disabled={!active}
                >
                  应用到全部
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map(
                  (key) => {
                    const item = PRESETS[key];
                    const Icon = item.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs ${active?.presentation.preset === key ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted"}`}
                        onClick={() => preset(key)}
                        disabled={!active}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                        <span className="text-[10px] text-muted-foreground">
                          {item.width}×{item.height}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
              <button
                type="button"
                className={`mt-2 w-full rounded-md border px-3 py-2 text-left text-xs ${active?.presentation.preset === "custom" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                onClick={() => preset("custom")}
                disabled={!active}
              >
                自定义：{active?.presentation.viewport.width} ×{" "}
                {active?.presentation.viewport.height}
              </button>
              {active?.presentation.preset === "custom" ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={PAGE_PRESENTATION_LIMITS.minWidth}
                    max={PAGE_PRESENTATION_LIMITS.maxWidth}
                    aria-label="自定义视口宽度"
                    value={active.presentation.viewport.width}
                    onChange={(event) => {
                      const width = Number(event.target.value);
                      setFiles((current) =>
                        current.map((item) =>
                          item.id === active.id
                            ? {
                                ...item,
                                presentation: {
                                  ...item.presentation,
                                  viewport: {
                                    ...item.presentation.viewport,
                                    width,
                                  },
                                  source: "user",
                                },
                              }
                            : item,
                        ),
                      );
                    }}
                  />
                  <Input
                    type="number"
                    min={PAGE_PRESENTATION_LIMITS.minHeight}
                    max={PAGE_PRESENTATION_LIMITS.maxHeight}
                    aria-label="自定义视口高度"
                    value={active.presentation.viewport.height}
                    onChange={(event) => {
                      const height = Number(event.target.value);
                      setFiles((current) =>
                        current.map((item) =>
                          item.id === active.id
                            ? {
                                ...item,
                                presentation: {
                                  ...item.presentation,
                                  viewport: {
                                    ...item.presentation.viewport,
                                    height,
                                  },
                                  source: "user",
                                },
                              }
                            : item,
                        ),
                      );
                    }}
                  />
                </div>
              ) : null}
              {invalidViewport ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  宽度需为 {PAGE_PRESENTATION_LIMITS.minWidth}–
                  {PAGE_PRESENTATION_LIMITS.maxWidth}，高度需为{" "}
                  {PAGE_PRESENTATION_LIMITS.minHeight}–
                  {PAGE_PRESENTATION_LIMITS.maxHeight} 的整数。
                </p>
              ) : null}
            </div>
            {active && (
              <p className="text-xs text-muted-foreground">
                {active.draft?.detectedViewport
                  ? `检测到尺寸 ${active.draft.detectedViewport.width}×${active.draft.detectedViewport.height}`
                  : "未检测到可靠尺寸，已推荐电脑视口 1440×900"}
              </p>
            )}
            {active?.draft?.warnings?.length ? (
              <details className="rounded-md border p-2 text-xs">
                <summary className="flex cursor-pointer list-none items-center gap-1 font-medium">
                  <ChevronDown className="h-3.5 w-3.5" />
                  兼容性提示 ({active.draft.warnings.length})
                </summary>
                <ul className="mt-2 space-y-1 pl-4 text-muted-foreground">
                  {active.draft.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {active?.draft?.resourceFindings?.length ? (
              <details className="rounded-md border p-2 text-xs">
                <summary className="flex cursor-pointer list-none items-center gap-1 font-medium">
                  <ChevronDown className="h-3.5 w-3.5" />
                  受限资源 ({active.draft.resourceFindings.length})
                </summary>
                <p className="mt-2 text-muted-foreground">单文件导入不会读取相对、远程或 blob 资源；请将资源内联为 data URL，或在后续资源导入流程中显式处理。</p>
                <ul className="mt-2 space-y-1 break-all pl-4 text-muted-foreground">
                  {active.draft.resourceFindings.map((finding) => (
                    <li key={`${finding.path}:${finding.attributeName}`}>
                      {finding.impact === "blocked" ? "将被阻断" : "可保留"} · {finding.classification} · {finding.tagName}[{finding.attributeName}] · {finding.path}；建议：{
                        finding.remediation === "embed-as-data-url"
                          ? "内联为 data URL"
                          : finding.remediation === "include-in-bundle"
                            ? "在后续文件夹导入中一并提供"
                            : finding.remediation === "replace-with-safe-link"
                              ? "替换为安全链接"
                              : "替换资源或在后续流程中显式本地化"}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {active?.draft?.requiresConfirmation ? (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
                <input
                  type="checkbox"
                  checked={active.confirmationAccepted === true}
                  onChange={(event) =>
                    setFiles((current) =>
                      current.map((item) =>
                        item.id === active.id
                          ? { ...item, confirmationAccepted: event.target.checked, confirmationStatus: event.target.checked ? "confirmed" : "required" }
                          : item,
                      ),
                    )
                  }
                />
                <span>我知道以上兼容性限制或推荐尺寸将按当前设置导入。</span>
              </label>
            ) : null}
          </aside>
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => {
              closeWorkbench();
            }}
            disabled={importing}
          >
            取消
          </Button>
          <Button
            onClick={() => void importAll()}
            disabled={!canImport || importing}
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                导入中...
              </>
            ) : (
              `导入并创建页面 (${files.filter((item) => item.status !== "success").length})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
