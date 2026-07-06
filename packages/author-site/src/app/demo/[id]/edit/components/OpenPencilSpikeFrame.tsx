"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Group,
  Italic,
  Redo2,
  RefreshCw,
  Strikethrough,
  Trash2,
  Undo2,
  Ungroup,
  Underline,
  ZoomIn,
} from "lucide-react";

import type { PreviewSize } from "@workbench/demo-ui";
import type {
  OpenPencilCommandAvailability,
  OpenPencilEditCommand,
  OpenPencilEditorError,
  OpenPencilHostCommand,
  OpenPencilNodeUpdateChanges,
  OpenPencilSelectCommand,
  OpenPencilTextSelectionRange,
  OpenPencilUiState,
  SketchSceneDocument,
  SketchSceneNodeBindings,
  SketchScenePatchOperation,
  SketchSceneTextStyleOverride,
  SketchSceneTextStyleRun,
} from "@workbench/shared";
import {
  OPENPENCIL_EDITOR_MESSAGE_TYPES,
  createOpenPencilCommandMessage,
  createOpenPencilLoadDocumentMessage,
  createOpenPencilSelectNodeMessage,
  isOpenPencilEditorMessage,
} from "@workbench/shared";
import {
  getOpenPencilMergeFieldConflictKey,
  getOpenPencilMergeConflictSummary,
  type OpenPencilMergeConflictResolutionMode,
  type OpenPencilMergeConflictSummary,
} from "../lib/openpencil-merge-conflict";
import { isOpenPencilSaveFailureError } from "../lib/openpencil-save-error";

export type {
  OpenPencilHostCommand,
  OpenPencilSelectCommand,
  OpenPencilUiState,
} from "@workbench/shared";

type BridgeState = "initializing" | "ready" | "loaded" | "dirty" | "error";

type OpenPencilSpikeFrameProps = {
  editorUrl: string;
  pageId: string;
  pageName?: string;
  scene: SketchSceneDocument;
  configData: Record<string, unknown>;
  previewSize?: PreviewSize;
  onSceneCommit?: (
    scene: SketchSceneDocument,
    draft?: {
      patchBaseSceneKey?: string;
      patchOperations?: SketchScenePatchOperation[];
    },
  ) => Promise<void> | void;
  onUiStateChange?: (state: OpenPencilUiState) => void;
  selectCommand?: OpenPencilSelectCommand | null;
  command?: OpenPencilHostCommand | null;
  imageProxyDiagnosticContext?: OpenPencilImageProxyDiagnosticContext;
  onReloadLatestScene?: () => Promise<void> | void;
  onMergeLatestSceneWithDraft?: (draft: {
    patchBaseSceneKey?: string;
    patchOperations?: SketchScenePatchOperation[];
  }, options?: {
    conflictResolution?: OpenPencilMergeConflictResolutionMode;
    skipOperationIndices?: number[];
    overrideFieldConflictKeys?: string[];
  }) => Promise<SketchSceneDocument | void> | SketchSceneDocument | void;
};

export type OpenPencilImageProxyDiagnosticContext = {
  editorSessionId: string;
  projectId: string;
  sessionId?: string;
  workspaceId?: string;
  traceId?: string;
};

function resolveTargetOrigin(editorUrl: string): string {
  try {
    return new URL(editorUrl).origin;
  } catch {
    return "*";
  }
}

function formatConflictNodeIds(nodeIds: string[]): string {
  if (nodeIds.length === 0) return "无";
  const visibleNodeIds = nodeIds.slice(0, 4);
  const suffix = nodeIds.length > visibleNodeIds.length
    ? ` 等 ${nodeIds.length} 个`
    : "";
  return `${visibleNodeIds.join(", ")}${suffix}`;
}

function formatConflictFieldDiffs(
  fieldConflicts: OpenPencilMergeConflictSummary["fieldConflicts"],
): string {
  if (fieldConflicts.length === 0) return "无";
  const fieldPaths = fieldConflicts.flatMap((conflict) =>
    conflict.fields.map((field) => `${conflict.nodeId}.${field}`),
  );
  const visibleFieldPaths = fieldPaths.slice(0, 4);
  const suffix = fieldPaths.length > visibleFieldPaths.length
    ? ` 等 ${fieldPaths.length} 项`
    : "";
  return `${visibleFieldPaths.join(", ")}${suffix}`;
}

function getVisibleConflictFieldDetails(
  fieldConflicts: OpenPencilMergeConflictSummary["fieldConflicts"],
): Array<{
  nodeId: string;
  field: string;
  baseValue: string;
  latestValue: string;
  draftValue?: string;
}> {
  return fieldConflicts
    .flatMap((conflict) =>
      conflict.details.map((detail) => ({
        nodeId: conflict.nodeId,
        ...detail,
      })),
    )
    .slice(0, 3);
}

function formatOperationConflictReason(reason: string): string {
  if (reason === "missing-node") return "目标图层不存在";
  if (reason === "duplicate-node") return "目标 ID 冲突";
  if (reason === "same-field-change") return "同一字段已变更";
  if (reason === "empty-node-list") return "操作目标为空";
  return reason;
}

function getVisibleOperationConflicts(
  operationConflicts: OpenPencilMergeConflictSummary["operationConflicts"],
) {
  return operationConflicts;
}

export function buildOpenPencilImageProxyUrl(
  origin: string,
  pageId: string,
  context?: OpenPencilImageProxyDiagnosticContext,
): string {
  const url = new URL("/api/openpencil/image-proxy", origin);
  if (!context) return url.toString();
  url.searchParams.set("editorSessionId", context.editorSessionId);
  url.searchParams.set("projectId", context.projectId);
  url.searchParams.set("pageId", pageId);
  if (context.sessionId) url.searchParams.set("sessionId", context.sessionId);
  if (context.workspaceId) url.searchParams.set("workspaceId", context.workspaceId);
  if (context.traceId) url.searchParams.set("traceId", context.traceId);
  return url.toString();
}

function toColorInputValue(value: string | undefined, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value ?? fallback : fallback;
}

function firstTextStyleRun(
  text: string | undefined,
  runs: SketchSceneTextStyleRun[] | undefined,
): SketchSceneTextStyleRun | undefined {
  if (!text || !runs?.length) return undefined;
  return runs.find((run) => run.start === 0 && run.length >= text.length) ?? runs[0];
}

type TextStyleSelectionRange = {
  start: number;
  end: number;
  source?: OpenPencilTextSelectionRange["source"];
};

function normalizeTextStyleSelectionRange(
  text: string | undefined,
  range: TextStyleSelectionRange | null,
): TextStyleSelectionRange | null {
  const length = (text ?? "").length;
  if (length <= 0 || !range) return null;
  const start = Math.max(0, Math.min(length, Math.floor(range.start)));
  const end = Math.max(0, Math.min(length, Math.floor(range.end)));
  if (end <= start) return null;
  return { start, end };
}

function getTextStyleRunForOffset(
  runs: SketchSceneTextStyleRun[] | undefined,
  offset: number,
): SketchSceneTextStyleRun | undefined {
  return runs?.find((run) => offset >= run.start && offset < run.start + run.length);
}

function textStyleEquals(
  left: SketchSceneTextStyleOverride,
  right: SketchSceneTextStyleOverride,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeAdjacentTextStyleRuns(
  runs: SketchSceneTextStyleRun[],
): SketchSceneTextStyleRun[] {
  const merged: SketchSceneTextStyleRun[] = [];
  for (const run of runs) {
    if (Object.keys(run.style).length === 0) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.start + previous.length === run.start && textStyleEquals(previous.style, run.style)) {
      previous.length += run.length;
    } else {
      merged.push({ ...run, style: { ...run.style } });
    }
  }
  return merged;
}

function buildRangeTextStyleRuns(
  text: string | undefined,
  currentRuns: SketchSceneTextStyleRun[] | undefined,
  range: TextStyleSelectionRange | null,
  patch: Partial<SketchSceneTextStyleOverride>,
): SketchSceneTextStyleRun[] {
  const length = Math.max(1, (text ?? "").length);
  const normalizedRange = normalizeTextStyleSelectionRange(text, range) ?? {
    start: 0,
    end: length,
  };
  const clippedRuns = (currentRuns ?? [])
    .map((run) => ({
      start: Math.max(0, Math.min(length, Math.round(run.start))),
      length: Math.max(0, Math.min(length - Math.max(0, Math.round(run.start)), Math.round(run.length))),
      style: run.style,
    }))
    .filter((run) => run.length > 0);
  const boundaries = new Set<number>([0, length, normalizedRange.start, normalizedRange.end]);
  clippedRuns.forEach((run) => {
    boundaries.add(run.start);
    boundaries.add(Math.min(length, run.start + run.length));
  });
  const sorted = [...boundaries].sort((a, b) => a - b);
  const nextRuns: SketchSceneTextStyleRun[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end <= start) continue;
    const baseStyle = getTextStyleRunForOffset(clippedRuns, start)?.style ?? {};
    const inRange = start >= normalizedRange.start && end <= normalizedRange.end;
    const style = inRange ? { ...baseStyle, ...patch } : { ...baseStyle };
    if (Object.keys(style).length === 0) continue;
    nextRuns.push({ start, length: end - start, style });
  }
  return mergeAdjacentTextStyleRuns(nextRuns);
}

const DEFAULT_OPENPENCIL_COMMANDS: OpenPencilCommandAvailability = {
  duplicateSelection: false,
  deleteSelection: false,
  groupSelection: false,
  ungroupSelection: false,
  zoomToSelection: false,
  undo: false,
  redo: false,
};

const OPENPENCIL_BINDING_FIELDS: Array<{
  key: keyof SketchSceneNodeBindings;
  label: string;
}> = [
  { key: "text", label: "文本" },
  { key: "src", label: "图片" },
  { key: "fill", label: "填充" },
  { key: "stroke", label: "描边" },
  { key: "color", label: "文字色" },
  { key: "visible", label: "显隐" },
  { key: "variant", label: "变体" },
];

export function OpenPencilSpikeFrame({
  editorUrl,
  pageId,
  pageName,
  scene,
  configData,
  previewSize,
  onSceneCommit,
  onUiStateChange,
  selectCommand,
  command,
  imageProxyDiagnosticContext,
  onReloadLatestScene,
  onMergeLatestSceneWithDraft,
}: OpenPencilSpikeFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameReadyRef = useRef(false);
  const lastCommittedSceneKeyRef = useRef<string | null>(null);
  const [bridgeState, setBridgeState] = useState<BridgeState>("initializing");
  const [draftNodeCount, setDraftNodeCount] = useState<number | null>(null);
  const [draftScene, setDraftScene] = useState<SketchSceneDocument | null>(null);
  const [draftPatch, setDraftPatch] = useState<{
    patchBaseSceneKey?: string;
    patchOperations?: SketchScenePatchOperation[];
  } | null>(null);
  const [editorError, setEditorError] = useState<OpenPencilEditorError | null>(null);
  const [frameReloadKey, setFrameReloadKey] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [mergeConflictSummary, setMergeConflictSummary] =
    useState<OpenPencilMergeConflictSummary | null>(null);
  const [manualConflictReferenceSummary, setManualConflictReferenceSummary] =
    useState<OpenPencilMergeConflictSummary | null>(null);
  const [selectedConflictSkipOperationIndices, setSelectedConflictSkipOperationIndices] =
    useState<number[]>([]);
  const [selectedOverrideFieldConflictKeys, setSelectedOverrideFieldConflictKeys] =
    useState<string[]>([]);
  const [saveConflictRecoverable, setSaveConflictRecoverable] = useState(false);
  const [reloadLatestState, setReloadLatestState] =
    useState<"idle" | "loading">("idle");
  const [mergeLatestState, setMergeLatestState] =
    useState<"idle" | "loading">("idle");
  const targetOrigin = useMemo(() => resolveTargetOrigin(editorUrl), [editorUrl]);
  const sceneKey = useMemo(() => JSON.stringify(scene), [scene]);
  const imageProxyUrl = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return buildOpenPencilImageProxyUrl(
      window.location.origin,
      pageId,
      imageProxyDiagnosticContext,
    );
  }, [imageProxyDiagnosticContext, pageId]);

  const postDocument = useCallback(() => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage(
      createOpenPencilLoadDocumentMessage({
        pageId,
        pageName,
        scene,
        configData,
        previewSize,
        imageProxyUrl,
      }),
      targetOrigin,
    );
  }, [configData, imageProxyUrl, pageId, pageName, previewSize, scene, targetOrigin]);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      if (targetOrigin !== "*" && event.origin !== targetOrigin) return;
      const message = event.data;
      if (!isOpenPencilEditorMessage(message)) return;
      if (message.pageId && message.pageId !== pageId) return;

      if (message.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.READY) {
        frameReadyRef.current = true;
        setEditorError(null);
        setBridgeState("ready");
        postDocument();
      } else if (message.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.DOCUMENT_LOADED) {
        setEditorError(null);
        setDraftNodeCount(null);
        setDraftScene(null);
        setDraftPatch(null);
        setSaveErrorMessage(null);
        setMergeConflictSummary(null);
        setSelectedConflictSkipOperationIndices([]);
        setSelectedOverrideFieldConflictKeys([]);
        setSaveConflictRecoverable(false);
        setReloadLatestState("idle");
        setMergeLatestState("idle");
        const justReloadedCommittedScene = lastCommittedSceneKeyRef.current === sceneKey;
        if (justReloadedCommittedScene) {
          lastCommittedSceneKeyRef.current = null;
        }
        setSaveState(justReloadedCommittedScene ? "saved" : "idle");
        setBridgeState("loaded");
      } else if (message.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.DIRTY_STATE && message.dirty) {
        setDraftScene(message.scene ?? null);
        setDraftPatch(
          message.patchOperations?.length
            ? {
                patchBaseSceneKey: message.patchBaseSceneKey,
                patchOperations: message.patchOperations,
              }
            : null,
        );
        setSaveErrorMessage(null);
        setMergeConflictSummary(null);
        setSelectedConflictSkipOperationIndices([]);
        setSelectedOverrideFieldConflictKeys([]);
        setSaveConflictRecoverable(false);
        setReloadLatestState("idle");
        setMergeLatestState("idle");
        setSaveState("idle");
        setDraftNodeCount(
          typeof message.nodeCount === "number"
            ? message.nodeCount
            : Array.isArray(message.scene?.nodes)
              ? message.scene.nodes.length
              : null,
        );
        setBridgeState("dirty");
      } else if (message.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.UI_STATE && message.state) {
        if (message.state.error) {
          setEditorError(message.state.error);
          setBridgeState("error");
        }
        onUiStateChange?.(message.state);
      } else if (message.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.ERROR) {
        setEditorError(message.error);
        setBridgeState("error");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onUiStateChange, pageId, postDocument, sceneKey, targetOrigin]);

  const commitDraftScene = useCallback(async () => {
    if (!draftScene || !onSceneCommit || saveState === "saving") return;
    setSaveState("saving");
    setSaveErrorMessage(null);
    setMergeConflictSummary(null);
    setManualConflictReferenceSummary(null);
    setSaveConflictRecoverable(false);
    setMergeLatestState("idle");
    lastCommittedSceneKeyRef.current = JSON.stringify(draftScene);
    try {
      await onSceneCommit(draftScene, draftPatch ?? undefined);
      setSaveState("saved");
      setBridgeState("loaded");
      setDraftScene(null);
      setDraftPatch(null);
      setDraftNodeCount(null);
      setManualConflictReferenceSummary(null);
    } catch (error) {
      lastCommittedSceneKeyRef.current = null;
      setSaveErrorMessage(error instanceof Error ? error.message : "保存手绘草稿失败");
      setSaveConflictRecoverable(
        isOpenPencilSaveFailureError(error) && error.recoverableByReload,
      );
      console.error("[OpenPencilSpikeFrame] failed to commit draft scene", error);
      setSaveState("error");
    }
  }, [draftPatch, draftScene, onSceneCommit, saveState]);

  const mergeLatestSceneWithDraft = useCallback(async (
    conflictResolution: OpenPencilMergeConflictResolutionMode = "strict",
    options?: {
      skipOperationIndices?: number[];
      overrideFieldConflictKeys?: string[];
    },
  ) => {
    if (
      !draftPatch?.patchOperations?.length ||
      !onMergeLatestSceneWithDraft ||
      mergeLatestState === "loading"
    ) {
      return;
    }
    setMergeLatestState("loading");
    setSaveErrorMessage(null);
    setMergeConflictSummary(null);
    try {
      const mergeOptions = options
        ? { conflictResolution, ...options }
        : { conflictResolution };
      const mergedScene = await onMergeLatestSceneWithDraft(draftPatch, mergeOptions);
      if (mergedScene) {
        lastCommittedSceneKeyRef.current = JSON.stringify(mergedScene);
      }
      setSaveConflictRecoverable(false);
      setSaveState("saved");
      setBridgeState("loaded");
      setDraftScene(null);
      setDraftPatch(null);
      setDraftNodeCount(null);
      setManualConflictReferenceSummary(null);
    } catch (error) {
      lastCommittedSceneKeyRef.current = null;
      setSaveErrorMessage(
        error instanceof Error ? error.message : "合并本次手绘改动失败",
      );
      const nextMergeConflictSummary = getOpenPencilMergeConflictSummary(error);
      setMergeConflictSummary(nextMergeConflictSummary);
      setSelectedConflictSkipOperationIndices(
        nextMergeConflictSummary?.operationConflicts.map(
          (conflict) => conflict.operationIndex,
        ) ?? [],
      );
      setSelectedOverrideFieldConflictKeys([]);
      setSaveConflictRecoverable(true);
      setSaveState("error");
    } finally {
      setMergeLatestState("idle");
    }
  }, [draftPatch, mergeLatestState, onMergeLatestSceneWithDraft]);

  const reloadLatestScene = useCallback(async (options?: {
    preserveConflictReference?: boolean;
  }) => {
    if (!onReloadLatestScene || reloadLatestState === "loading") return;
    const conflictReferenceSummary =
      options?.preserveConflictReference ? mergeConflictSummary : null;
    setReloadLatestState("loading");
    try {
      await onReloadLatestScene();
      setSaveErrorMessage(null);
      setMergeConflictSummary(null);
      setSelectedConflictSkipOperationIndices([]);
      setSelectedOverrideFieldConflictKeys([]);
      setManualConflictReferenceSummary(conflictReferenceSummary);
      setSaveConflictRecoverable(false);
      setSaveState("idle");
      setDraftScene(null);
      setDraftPatch(null);
      setDraftNodeCount(null);
      setBridgeState("loaded");
    } catch (error) {
      setSaveErrorMessage(
        error instanceof Error ? error.message : "加载最新手绘内容失败",
      );
      setSaveConflictRecoverable(true);
    } finally {
      setReloadLatestState("idle");
    }
  }, [mergeConflictSummary, onReloadLatestScene, reloadLatestState]);

  useEffect(() => {
    frameReadyRef.current = false;
    setEditorError(null);
    setSaveErrorMessage(null);
    setMergeConflictSummary(null);
    setManualConflictReferenceSummary(null);
    setSelectedConflictSkipOperationIndices([]);
    setSaveConflictRecoverable(false);
    setReloadLatestState("idle");
    setMergeLatestState("idle");
    setBridgeState("initializing");
  }, [editorUrl]);

  useEffect(() => {
    if (bridgeState !== "initializing" && bridgeState !== "ready") return;
    const timeout = window.setTimeout(() => {
      if (bridgeState !== "initializing" && bridgeState !== "ready") return;
      setEditorError({
        code: "editor-initialization-failed",
        message: "手绘编辑器加载超时",
        detail: `未能从 ${editorUrl} 收到 document-loaded 消息`,
        recoverable: true,
      });
      setBridgeState("error");
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [bridgeState, editorUrl]);

  useEffect(() => {
    if (frameReadyRef.current) {
      postDocument();
    }
  }, [postDocument]);

  useEffect(() => {
    if (!selectCommand || !frameReadyRef.current) return;
    iframeRef.current?.contentWindow?.postMessage(
      createOpenPencilSelectNodeMessage({
        pageId,
        nodeId: selectCommand.nodeId,
      }),
      targetOrigin,
    );
  }, [pageId, selectCommand, targetOrigin]);

  useEffect(() => {
    if (!command || !frameReadyRef.current) return;
    iframeRef.current?.contentWindow?.postMessage(
      createOpenPencilCommandMessage({
        pageId,
        command: command.type ? command : { ...command, type: "select-node" },
      }),
      targetOrigin,
    );
  }, [command, pageId, targetOrigin]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#0b0f17]">
      <iframe
        key={`${editorUrl}:${frameReloadKey}`}
        ref={iframeRef}
        title="手绘编辑器"
        src={editorUrl}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        onLoad={() => {
          frameReadyRef.current = true;
          setBridgeState("ready");
          postDocument();
        }}
        onError={() => {
          setEditorError({
            code: "resource-load-failed",
            message: "无法加载手绘编辑器页面",
            detail: editorUrl,
            recoverable: true,
          });
          setBridgeState("error");
        }}
      />
      {editorError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0f17]/88 px-6">
          <div className="max-w-lg rounded-md border border-orange-400/40 bg-[#15110d] p-5 text-white shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />
              <div className="min-w-0">
                <div className="text-sm font-semibold">手绘编辑器加载失败</div>
                <p className="mt-2 text-sm leading-6 text-white/82">
                  {editorError.message}
                </p>
                <p className="mt-2 text-xs leading-5 text-white/58">
                  请检查编辑器 wasm、字体、图片资源地址或跨域配置。修复后可重新加载编辑器。
                </p>
                {editorError.detail ? (
                  <p className="mt-2 max-h-16 overflow-hidden break-words text-[11px] leading-5 text-white/42">
                    {editorError.detail}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 text-xs font-medium text-white transition-colors hover:bg-white/18"
                  onClick={() => {
                    setEditorError(null);
                    setBridgeState("initializing");
                    frameReadyRef.current = false;
                    setFrameReloadKey((current) => current + 1);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新加载
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[11px] text-white/80 shadow-lg">
        <span>
          手绘编辑器: {bridgeState}
          {draftNodeCount !== null ? ` · draft ${draftNodeCount}` : ""}
          {draftPatch?.patchOperations?.length
            ? ` · patch ${draftPatch.patchOperations.length}`
            : draftScene
              ? " · 临时全量草稿"
              : ""}
          {saveState === "saved" ? " · saved" : ""}
          {saveState === "error" ? " · 保存失败" : ""}
        </span>
        {draftScene && onSceneCommit ? (
          <button
            type="button"
            className="pointer-events-auto ml-2 rounded-sm border border-white/15 bg-white/10 px-1.5 py-0.5 text-[11px] text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saveState === "saving"}
            onClick={commitDraftScene}
          >
            {saveState === "saving" ? "保存中" : "保存手绘"}
          </button>
        ) : null}
      </div>
      {saveErrorMessage ? (
        <div className="absolute right-3 top-12 z-10 max-w-sm rounded-md border border-destructive/35 bg-background/96 p-3 text-sm text-foreground shadow-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <div className="font-medium">手绘保存失败</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {saveErrorMessage}
              </p>
              {mergeConflictSummary ? (
                <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs leading-5">
                  <div className="font-medium text-foreground">自动合并摘要</div>
                  <div className="mt-1 text-muted-foreground">
                    {mergeConflictSummary.operationCount} 个操作，
                    {mergeConflictSummary.incompatibleOperationCount} 个无法自动重放
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    受影响图层：{formatConflictNodeIds(mergeConflictSummary.affectedNodeIds)}
                  </div>
                  {mergeConflictSummary.operationConflicts.length > 0 ? (
                    <div className="mt-1 text-muted-foreground">
                      冲突操作：
                      <div className="mt-1 max-h-44 space-y-1 overflow-auto pr-1">
                        {getVisibleOperationConflicts(
                          mergeConflictSummary.operationConflicts,
                        ).map((conflict) => (
                          <div
                            key={`${conflict.operationIndex}:${conflict.operationType}`}
                            className="rounded-sm bg-background/70 px-1.5 py-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-foreground">
                                #{conflict.operationIndex + 1} {conflict.operationType}
                              </div>
                              <label className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3"
                                  checked={selectedConflictSkipOperationIndices.includes(
                                    conflict.operationIndex,
                                  )}
                                  onChange={(event) => {
                                    setSelectedConflictSkipOperationIndices((current) => {
                                      const next = new Set(current);
                                      if (event.target.checked) {
                                        next.add(conflict.operationIndex);
                                      } else {
                                        next.delete(conflict.operationIndex);
                                      }
                                      return Array.from(next).sort((left, right) => left - right);
                                    });
                                  }}
                                />
                                跳过
                              </label>
                            </div>
                            <div>
                              原因：{conflict.reasons.map(formatOperationConflictReason).join("、")}
                            </div>
                            <div>
                              图层：{formatConflictNodeIds(conflict.affectedNodeIds)}
                            </div>
                            {conflict.fields.length > 0 ? (
                              <div>字段：{conflict.fields.join(", ")}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        已选择跳过 {selectedConflictSkipOperationIndices.length} 个冲突操作
                      </div>
                    </div>
                  ) : null}
                  {mergeConflictSummary.missingNodeIds.length > 0 ? (
                    <div className="mt-1 text-muted-foreground">
                      已不存在：{formatConflictNodeIds(mergeConflictSummary.missingNodeIds)}
                    </div>
                  ) : null}
                  {mergeConflictSummary.duplicateNodeIds.length > 0 ? (
                    <div className="mt-1 text-muted-foreground">
                      ID 已被占用：{formatConflictNodeIds(mergeConflictSummary.duplicateNodeIds)}
                    </div>
                  ) : null}
                  {mergeConflictSummary.fieldConflicts.length > 0 ? (
                    <div className="mt-1 text-muted-foreground">
                      字段冲突：{formatConflictFieldDiffs(mergeConflictSummary.fieldConflicts)}
                      <div className="mt-1 space-y-1">
                        {getVisibleConflictFieldDetails(
                          mergeConflictSummary.fieldConflicts,
                        ).map((detail) => {
                          const fieldConflictKey = getOpenPencilMergeFieldConflictKey(
                            detail.nodeId,
                            detail.field,
                          );
                          return (
                            <div
                              key={fieldConflictKey}
                              className="rounded-sm bg-background/70 px-1.5 py-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium text-foreground">
                                  {fieldConflictKey}
                                </div>
                                {detail.draftValue ? (
                                  <label className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      className="h-3 w-3"
                                      checked={selectedOverrideFieldConflictKeys.includes(
                                        fieldConflictKey,
                                      )}
                                      onChange={(event) => {
                                        setSelectedOverrideFieldConflictKeys((current) => {
                                          const next = new Set(current);
                                          if (event.target.checked) {
                                            next.add(fieldConflictKey);
                                          } else {
                                            next.delete(fieldConflictKey);
                                          }
                                          return Array.from(next).sort((left, right) =>
                                            left.localeCompare(right),
                                          );
                                        });
                                      }}
                                    />
                                    覆盖为本次
                                  </label>
                                ) : null}
                              </div>
                              <div>基线：{detail.baseValue}</div>
                              <div>最新：{detail.latestValue}</div>
                              {detail.draftValue ? (
                                <div>本次：{detail.draftValue}</div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        已选择覆盖 {selectedOverrideFieldConflictKeys.length} 个字段冲突
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {draftScene && onSceneCommit ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {saveConflictRecoverable && onReloadLatestScene ? (
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={reloadLatestState === "loading" || mergeLatestState === "loading"}
                      onClick={() => reloadLatestScene()}
                    >
                      {reloadLatestState === "loading"
                        ? "加载中"
                        : "加载最新手绘内容"}
                    </button>
                  ) : null}
                  {saveConflictRecoverable &&
                  mergeConflictSummary &&
                  onReloadLatestScene ? (
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={reloadLatestState === "loading" || mergeLatestState === "loading"}
                      onClick={() =>
                        reloadLatestScene({ preserveConflictReference: true })
                      }
                    >
                      {reloadLatestState === "loading"
                        ? "加载中"
                        : "加载最新并手工处理"}
                    </button>
                  ) : null}
                  {saveConflictRecoverable &&
                  draftPatch?.patchOperations?.length &&
                  onMergeLatestSceneWithDraft ? (
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={reloadLatestState === "loading" || mergeLatestState === "loading"}
                      onClick={() => mergeLatestSceneWithDraft()}
                    >
                      {mergeLatestState === "loading"
                        ? "合并中"
                        : "合并本次手绘改动"}
                    </button>
                  ) : null}
                  {saveConflictRecoverable &&
                  mergeConflictSummary?.operationConflicts.length &&
                  draftPatch?.patchOperations?.length &&
                  onMergeLatestSceneWithDraft ? (
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={
                        reloadLatestState === "loading" ||
                        mergeLatestState === "loading" ||
                        selectedConflictSkipOperationIndices.length === 0
                      }
                      onClick={() =>
                        mergeLatestSceneWithDraft(
                          "skip-selected-operations",
                          {
                            skipOperationIndices:
                              selectedConflictSkipOperationIndices,
                          },
                        )
                      }
                    >
                      {mergeLatestState === "loading"
                        ? "合并中"
                        : "按选择跳过并合并其余"}
                    </button>
                  ) : null}
                  {saveConflictRecoverable &&
                  mergeConflictSummary?.fieldConflicts.length &&
                  draftPatch?.patchOperations?.length &&
                  onMergeLatestSceneWithDraft ? (
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={
                        reloadLatestState === "loading" ||
                        mergeLatestState === "loading" ||
                        selectedOverrideFieldConflictKeys.length === 0
                      }
                      onClick={() =>
                        mergeLatestSceneWithDraft(
                          "override-selected-field-conflicts",
                          {
                            overrideFieldConflictKeys:
                              selectedOverrideFieldConflictKeys,
                          },
                        )
                      }
                    >
                      {mergeLatestState === "loading"
                        ? "合并中"
                        : "按选择覆盖字段并合并"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      saveState === "saving" ||
                      reloadLatestState === "loading" ||
                      mergeLatestState === "loading"
                    }
                    onClick={commitDraftScene}
                  >
                    {saveState === "saving" ? "保存中" : "重试保存"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {manualConflictReferenceSummary && !saveErrorMessage ? (
        <div className="absolute right-3 top-12 z-10 max-w-sm rounded-md border border-amber-400/35 bg-background/96 p-3 text-sm text-foreground shadow-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <div className="font-medium">手工处理参考</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                已加载最新手绘内容。请按下列冲突参考在画布中手工重做需要保留的改动。
              </p>
              <div className="mt-2 rounded-md border border-amber-400/20 bg-amber-400/5 p-2 text-xs leading-5">
                <div className="text-muted-foreground">
                  冲突操作：{manualConflictReferenceSummary.operationConflicts.length} 个
                </div>
                <div className="mt-1 max-h-40 space-y-1 overflow-auto pr-1 text-muted-foreground">
                  {getVisibleOperationConflicts(
                    manualConflictReferenceSummary.operationConflicts,
                  ).map((conflict) => (
                    <div
                      key={`${conflict.operationIndex}:${conflict.operationType}`}
                      className="rounded-sm bg-background/70 px-1.5 py-1"
                    >
                      <div className="font-medium text-foreground">
                        #{conflict.operationIndex + 1} {conflict.operationType}
                      </div>
                      <div>
                        原因：{conflict.reasons.map(formatOperationConflictReason).join("、")}
                      </div>
                      <div>
                        图层：{formatConflictNodeIds(conflict.affectedNodeIds)}
                      </div>
                      {conflict.fields.length > 0 ? (
                        <div>字段：{conflict.fields.join(", ")}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
                {manualConflictReferenceSummary.fieldConflicts.length > 0 ? (
                  <div className="mt-1 text-muted-foreground">
                    字段冲突：{formatConflictFieldDiffs(
                      manualConflictReferenceSummary.fieldConflicts,
                    )}
                    <div className="mt-1 space-y-1">
                      {getVisibleConflictFieldDetails(
                        manualConflictReferenceSummary.fieldConflicts,
                      ).map((detail) => (
                        <div
                          key={`${detail.nodeId}:${detail.field}`}
                          className="rounded-sm bg-background/70 px-1.5 py-1"
                        >
                          <div className="font-medium text-foreground">
                            {detail.nodeId}.{detail.field}
                          </div>
                          <div>基线：{detail.baseValue}</div>
                          <div>最新：{detail.latestValue}</div>
                          {detail.draftValue ? (
                            <div>本次：{detail.draftValue}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="mt-2 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted"
                onClick={() => setManualConflictReferenceSummary(null)}
              >
                关闭参考
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OpenPencilLayerDrawer({
  state,
  onSelectLayer,
}: {
  state: OpenPencilUiState | null;
  onSelectLayer?: (nodeId: string) => void;
}) {
  const layers = state?.layers ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {state?.pageName || "手绘页面"}
            </div>
            <div className="text-xs text-muted-foreground">
              {state ? `${state.layerCount} 个图层` : "等待编辑器加载"}
            </div>
          </div>
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            {state?.bridgeStatus === "loaded" ? "已连接" : "连接中"}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {layers.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            暂无手绘图层
          </div>
        ) : (
          <div className="space-y-1">
            {layers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  layer.selected
                    ? "bg-primary/15 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
                style={{ paddingLeft: 8 + layer.level * 14 }}
                onClick={() => onSelectLayer?.(layer.id)}
              >
                <span className="min-w-0 truncate">{layer.name}</span>
                <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                  {layer.type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OpenPencilInspectorPanel({
  state,
  onUpdateNode,
  onCommand,
  showDebugInfo = false,
}: {
  state: OpenPencilUiState | null;
  onUpdateNode?: (
    nodeId: string,
    changes: OpenPencilNodeUpdateChanges,
  ) => void;
  onCommand?: (type: OpenPencilEditCommand["type"]) => void;
  showDebugInfo?: boolean;
}) {
  const selection = state?.selection;
  const selectedNode = state?.inspector.selectedNode ?? null;
  const editable = Boolean(selectedNode && onUpdateNode);
  const commands = state?.commands ?? DEFAULT_OPENPENCIL_COMMANDS;
  const [textSelectionRange, setTextSelectionRange] =
    useState<TextStyleSelectionRange | null>(null);
  const activeTextSelectionRange =
    textSelectionRange ?? selectedNode?.textSelectionRange ?? null;
  const textSelectionSource = textSelectionRange
    ? "host"
    : selectedNode?.textSelectionRange?.source;
  const normalizedTextSelectionRange = normalizeTextStyleSelectionRange(
    selectedNode?.text,
    activeTextSelectionRange,
  );
  const textStyleRun =
    normalizedTextSelectionRange && selectedNode?.textStyleRuns
      ? getTextStyleRunForOffset(
          selectedNode.textStyleRuns,
          normalizedTextSelectionRange.start,
        ) ?? firstTextStyleRun(selectedNode?.text, selectedNode?.textStyleRuns)
      : firstTextStyleRun(selectedNode?.text, selectedNode?.textStyleRuns);
  const textStyleScopeLabel = normalizedTextSelectionRange
    ? `${textSelectionSource === "canvas" ? "画布选区样式" : "选区样式"} ${normalizedTextSelectionRange.start}-${normalizedTextSelectionRange.end}`
    : "全段样式";
  useEffect(() => {
    setTextSelectionRange(null);
  }, [selectedNode?.id, selectedNode?.text]);
  const updateSelectedNode = (
    changes: OpenPencilNodeUpdateChanges,
  ) => {
    if (!selectedNode) return;
    onUpdateNode?.(selectedNode.id, changes);
  };
  const captureTextSelection = (
    element: HTMLTextAreaElement | HTMLInputElement,
  ) => {
    setTextSelectionRange({
      start: element.selectionStart ?? 0,
      end: element.selectionEnd ?? 0,
      source: "host",
    });
  };
  const updateTextStyleRun = (
    patch: Partial<SketchSceneTextStyleOverride>,
  ) => {
    if (!selectedNode) return;
    updateSelectedNode({
      textStyleRuns: buildRangeTextStyleRuns(
        selectedNode.text,
        selectedNode.textStyleRuns,
        normalizedTextSelectionRange,
        patch,
      ),
    });
  };
  const updateSelectedBinding = (key: keyof SketchSceneNodeBindings, value: string) => {
    if (!selectedNode) return;
    const nextBindings = { ...selectedNode.bindings };
    const trimmed = value.trim();
    if (trimmed) {
      nextBindings[key] = trimmed;
    } else {
      delete nextBindings[key];
    }
    updateSelectedNode({ bindings: nextBindings });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold">手绘属性</div>
        <div className="mt-1 text-xs text-muted-foreground">当前手绘选区</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Content
          </div>
          {selectedNode ? (
            <div className="space-y-3">
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">名称</span>
                <input
                  type="text"
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={selectedNode.name}
                  disabled={!editable}
                  onChange={(event) => updateSelectedNode({ name: event.target.value })}
                />
              </label>
              {selectedNode.supportsText ? (
                <div className="space-y-3">
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">文本</span>
                    <textarea
                      className="min-h-20 resize-y rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={selectedNode.text ?? ""}
                      disabled={!editable}
                      onSelect={(event) => captureTextSelection(event.currentTarget)}
                      onKeyUp={(event) => captureTextSelection(event.currentTarget)}
                      onMouseUp={(event) => captureTextSelection(event.currentTarget)}
                      onChange={(event) => {
                        setTextSelectionRange(null);
                        updateSelectedNode({ text: event.target.value });
                      }}
                    />
                  </label>
                  <div className="space-y-2 rounded-md border p-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {textStyleScopeLabel}
                    </div>
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 text-sm">
                      <span className="text-muted-foreground">颜色</span>
                      <input
                        type="color"
                        aria-label="文本颜色"
                        className="h-8 w-full rounded-md border bg-background px-1"
                        value={toColorInputValue(textStyleRun?.style.color, "#111827")}
                        disabled={!editable}
                        onChange={(event) => updateTextStyleRun({ color: event.target.value })}
                      />
                      <span className="text-muted-foreground">字号</span>
                      <input
                        type="number"
                        aria-label="文本字号"
                        min={1}
                        step={1}
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={textStyleRun?.style.fontSize ?? 16}
                        disabled={!editable}
                        onChange={(event) => updateTextStyleRun({ fontSize: event.currentTarget.valueAsNumber })}
                      />
                      <span className="text-muted-foreground">字重</span>
                      <select
                        aria-label="文本字重"
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={String(textStyleRun?.style.fontWeight ?? 400)}
                        disabled={!editable}
                        onChange={(event) => updateTextStyleRun({ fontWeight: Number(event.target.value) })}
                      >
                        <option value="400">Regular</option>
                        <option value="500">Medium</option>
                        <option value="600">Semibold</option>
                        <option value="700">Bold</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        title="斜体"
                        aria-label="斜体"
                        className={`flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${textStyleRun?.style.italic ? "bg-muted text-foreground" : ""}`}
                        disabled={!editable}
                        onClick={() => updateTextStyleRun({ italic: !textStyleRun?.style.italic })}
                      >
                        <Italic className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="下划线"
                        aria-label="下划线"
                        className={`flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${textStyleRun?.style.textDecoration === "underline" ? "bg-muted text-foreground" : ""}`}
                        disabled={!editable}
                        onClick={() =>
                          updateTextStyleRun({
                            textDecoration:
                              textStyleRun?.style.textDecoration === "underline"
                                ? "none"
                                : "underline",
                          })
                        }
                      >
                        <Underline className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="删除线"
                        aria-label="删除线"
                        className={`flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${textStyleRun?.style.textDecoration === "line-through" ? "bg-muted text-foreground" : ""}`}
                        disabled={!editable}
                        onClick={() =>
                          updateTextStyleRun({
                            textDecoration:
                              textStyleRun?.style.textDecoration === "line-through"
                                ? "none"
                                : "line-through",
                          })
                        }
                      >
                        <Strikethrough className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {selectedNode.supportsImageResource ? (
                <div className="space-y-3">
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">图片地址</span>
                    <input
                      type="text"
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                      value={selectedNode.imageSrc ?? ""}
                      disabled={!editable}
                      onChange={(event) => updateSelectedNode({ src: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">替代文本</span>
                    <input
                      type="text"
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                      value={selectedNode.imageAlt ?? ""}
                      disabled={!editable}
                      onChange={(event) => updateSelectedNode({ alt: event.target.value })}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              请选择一个手绘图层
            </div>
          )}
        </section>
        {selectedNode ? (
          <section className="mt-6 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Style
            </div>
            <div className="space-y-3">
              <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 text-sm">
                <span className="text-muted-foreground">填充</span>
                <input
                  type="color"
                  className="h-8 w-full rounded-md border bg-background px-1"
                  value={toColorInputValue(selectedNode.fill, "#ffffff")}
                  disabled={!editable}
                  onChange={(event) => updateSelectedNode({ fill: event.target.value })}
                />
              </label>
              <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 text-sm">
                <span className="text-muted-foreground">描边</span>
                <input
                  type="color"
                  className="h-8 w-full rounded-md border bg-background px-1"
                  value={toColorInputValue(selectedNode.stroke, "#d1d5db")}
                  disabled={!editable}
                  onChange={(event) => updateSelectedNode({ stroke: event.target.value })}
                />
              </label>
              <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 text-sm">
                <span className="text-muted-foreground">线宽</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={selectedNode.strokeWidth ?? 0}
                  disabled={!editable}
                  onChange={(event) =>
                    updateSelectedNode({ strokeWidth: event.currentTarget.valueAsNumber })
                  }
                />
              </label>
              <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 text-sm">
                <span className="text-muted-foreground">透明度</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={selectedNode.opacity ?? 1}
                  disabled={!editable}
                  onChange={(event) =>
                    updateSelectedNode({ opacity: event.currentTarget.valueAsNumber })
                  }
                />
              </label>
            </div>
          </section>
        ) : null}
        {selectedNode?.supportsGeometry ? (
          <section className="mt-6 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Position
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">X</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={selectedNode.x ?? 0}
                  disabled={!editable}
                  onChange={(event) =>
                    updateSelectedNode({ x: event.currentTarget.valueAsNumber })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">Y</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={selectedNode.y ?? 0}
                  disabled={!editable}
                  onChange={(event) =>
                    updateSelectedNode({ y: event.currentTarget.valueAsNumber })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">宽</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={selectedNode.width ?? 1}
                  disabled={!editable}
                  onChange={(event) =>
                    updateSelectedNode({ width: event.currentTarget.valueAsNumber })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">高</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={selectedNode.height ?? 1}
                  disabled={!editable}
                  onChange={(event) =>
                    updateSelectedNode({ height: event.currentTarget.valueAsNumber })
                  }
                />
              </label>
              <label className="col-span-2 grid gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">旋转</span>
                <input
                  type="number"
                  step={1}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={selectedNode.rotation ?? 0}
                  disabled={!editable}
                  onChange={(event) =>
                    updateSelectedNode({ rotation: event.currentTarget.valueAsNumber })
                  }
                />
              </label>
            </div>
          </section>
        ) : null}
        {selectedNode?.supportsBindings ? (
          <section className="mt-6 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              Bindings
            </div>
            <div className="space-y-2">
              {OPENPENCIL_BINDING_FIELDS.map((field) => (
                <label
                  key={field.key}
                  className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 text-sm"
                >
                  <span className="text-muted-foreground">{field.label}</span>
                  <input
                    type="text"
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                    value={selectedNode.bindings[field.key] ?? ""}
                    disabled={!editable}
                    onChange={(event) => updateSelectedBinding(field.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>
        ) : null}
        <section className="mt-6 space-y-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Selection
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <span className="text-muted-foreground">数量</span>
            <span>{selection?.count ?? 0}</span>
            <span className="text-muted-foreground">类型</span>
            <span className="truncate">{selection?.type ?? "-"}</span>
            <span className="text-muted-foreground">当前</span>
            <span className="break-words">{selection?.current ?? "-"}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              title="复制选区"
              aria-label="复制选区"
              className="flex h-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!commands.duplicateSelection || !onCommand}
              onClick={() => onCommand?.("duplicate-selection")}
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="删除选区"
              aria-label="删除选区"
              className="flex h-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!commands.deleteSelection || !onCommand}
              onClick={() => onCommand?.("delete-selection")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="选区成组"
              aria-label="选区成组"
              className="flex h-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!commands.groupSelection || !onCommand}
              onClick={() => onCommand?.("group-selection")}
            >
              <Group className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="选区解组"
              aria-label="选区解组"
              className="flex h-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!commands.ungroupSelection || !onCommand}
              onClick={() => onCommand?.("ungroup-selection")}
            >
              <Ungroup className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="撤回"
              aria-label="撤回"
              className="flex h-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!commands.undo || !onCommand}
              onClick={() => onCommand?.("undo")}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="重做"
              aria-label="重做"
              className="flex h-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!commands.redo || !onCommand}
              onClick={() => onCommand?.("redo")}
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="定位选区"
              aria-label="定位选区"
              className="flex h-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!commands.zoomToSelection || !onCommand}
              onClick={() => onCommand?.("zoom-to-selection")}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </section>
        {showDebugInfo ? (
          <details className="mt-6 rounded-md border p-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground">
              Host Bridge
            </summary>
            <div className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2">
              <span className="text-muted-foreground">状态</span>
              <span>{state?.bridgeStatus ?? "waiting"}</span>
              <span className="text-muted-foreground">页面</span>
              <span className="break-words">{state?.pageId ?? "-"}</span>
              <span className="text-muted-foreground">配置字段</span>
              <span>{state?.configKeyCount ?? 0}</span>
              <span className="text-muted-foreground">图层</span>
              <span>{state?.layerCount ?? 0}</span>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
