"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Code2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createDefaultSketchScene,
  type SketchSceneDocument,
} from "@workbench/sketch-core";
import {
  SketchEditorSurface,
} from "@workbench/sketch-react";
import {
  asWhiteboardDocumentV3,
  asWhiteboardDocumentV2,
  getWhiteboardDocumentRevision,
  type WhiteboardDocument,
  type WhiteboardDocumentV3,
} from "@workbench/shared";
import {
  parseWhiteboardCode,
  serializeWhiteboardCode,
} from "@workbench/whiteboard-core";

export interface WhiteboardCommitTarget {
  scope: "page" | "project";
  pageId?: string;
  fieldPath: string;
  listItem?: { index: number; url: string };
  currentValue?: string;
  onCommit?: (url: string) => void;
}

export interface WhiteboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sessionId: string;
  target: WhiteboardCommitTarget;
  /** Lets a host avoid a second read when it already owns the bound document. */
  initialDocument?: WhiteboardDocument | null;
  /** Called only after WhiteboardCommit has atomically updated the configuration. */
  onCommitted: (
    target: WhiteboardCommitTarget,
    values: Record<string, unknown>,
  ) => void;
  /** Optional host diagnostics sink used for whiteboard quality metrics. */
  onDiagnosticEvent?: (event: {
    category: "ui" | "project" | "ai";
    name: string;
    level?: "info" | "warn" | "error";
    details?: Record<string, unknown>;
  }) => void;
}

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string };
};
type ReadResult = {
  document?: WhiteboardDocument | null;
  binding?: unknown | null;
  documentRevision?: number;
};
type CommitResult = {
  values: Record<string, unknown>;
  document?: WhiteboardDocument;
  binding?: unknown;
};

function localBackgroundSource(target: WhiteboardCommitTarget): string | null {
  const source = target.listItem?.url ?? target.currentValue;
  return typeof source === "string" && source.trim() ? source.trim() : null;
}

function managedAssetIdFromSource(source: string | null): string | null {
  const match = source?.match(/^\/api\/images\/([A-Za-z0-9_-]{1,128})$/);
  return match?.[1] ?? null;
}

function resolveWorkspaceImagePreviewSource(source: string, sessionId?: string): string {
  if (!sessionId) return source;
  if (source.startsWith("assets/")) return `/api/sessions/${encodeURIComponent(sessionId)}/workspace/${source}`;
  if (source.startsWith("/assets/")) return `/api/sessions/${encodeURIComponent(sessionId)}/workspace/${source.slice(1)}`;
  return source;
}

function addLegacySourceBackground(
  value: WhiteboardDocument,
  target: WhiteboardCommitTarget | undefined,
  sessionId?: string,
): WhiteboardDocumentV3 {
  const next = asWhiteboardDocumentV3(value);
  // V3 records an intentional background deletion in the scene itself. Only
  // migrate older envelopes, whose format had no reliable deletion marker.
  if (value.version === 3 || !target || next.scene.nodes.some((node) => node.id === "source-background")) {
    return next;
  }
  const source = localBackgroundSource(target);
  if (!source) return next;
  const backgroundSource = resolveWorkspaceImagePreviewSource(source, sessionId);
  const backgroundNode = {
    id: "source-background",
    type: "image" as const,
    x: 0,
    y: 0,
    width: next.scene.pageSize.width,
    height: next.scene.pageSize.height,
    src: backgroundSource,
    alt: "原图片背景",
    style: { imageFit: "cover" as const },
  };
  const assetRef = managedAssetIdFromSource(backgroundSource);
  return {
    ...next,
    scene: {
      ...next.scene,
      nodes: [backgroundNode, ...next.scene.nodes],
    },
    nodeSemantics: assetRef
      ? {
          ...next.nodeSemantics,
          "source-background": { role: "background", assetRef },
        }
      : next.nodeSemantics,
  };
}

function newDocument(target?: WhiteboardCommitTarget, sessionId?: string): WhiteboardDocumentV3 {
  // The full whiteboard scene, rather than the code bridge projection, is the
  // durable editing truth. The host owns the initial content policy: keep the
  // confirmed title, but do not expose the factory's instructional sticky note
  // in a newly opened creation-side whiteboard.
  const baseScene = createDefaultSketchScene();
  const scene = {
    ...baseScene,
    nodes: baseScene.nodes.filter((node) => node.id !== "note"),
  };
  const background = target
    ? localBackgroundSource(target)
      ? resolveWorkspaceImagePreviewSource(localBackgroundSource(target)!, sessionId)
      : null
    : null;
  if (background) {
    scene.nodes.unshift({
      id: "source-background",
      type: "image",
      x: 0,
      y: 0,
      width: scene.pageSize.width,
      height: scene.pageSize.height,
      src: background,
      alt: "原图片背景",
    });
  }
  return {
    id: `wb_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replaceAll("-", "") : Date.now().toString(36)}`,
    version: 3,
    sceneFormat: "sketch-scene-v1",
    documentRevision: 0,
    scene,
    nodeSemantics:
      background && managedAssetIdFromSource(background)
        ? {
            "source-background": {
              role: "background",
              assetRef: managedAssetIdFromSource(background)!,
            },
          }
        : {},
    editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
    updatedAt: Date.now(),
  };
}

function draftFingerprint(value: WhiteboardDocument): string {
  return JSON.stringify({ ...asWhiteboardDocumentV3(value), updatedAt: 0 });
}

function normalizeManagedAssetSemantics(
  value: WhiteboardDocument,
  sessionId?: string,
  target?: WhiteboardCommitTarget,
): WhiteboardDocumentV3 {
  const next = JSON.parse(
    JSON.stringify(addLegacySourceBackground(value, target, sessionId)),
  ) as WhiteboardDocumentV3;
  for (const node of next.scene.nodes) {
    if (node.type !== "image" || typeof node.src !== "string") continue;
    node.src = resolveWorkspaceImagePreviewSource(node.src, sessionId);
    const assetRef = managedAssetIdFromSource(node.src);
    if (assetRef)
      next.nodeSemantics[node.id] = {
        ...next.nodeSemantics[node.id],
        assetRef,
      };
  }
  return next;
}

function codeForDocument(value: WhiteboardDocument): {
  html: string;
  css: string;
} {
  const result = serializeWhiteboardCode(asWhiteboardDocumentV2(value));
  return result.value ?? { html: "", css: "" };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

const WHITEBOARD_IMAGE_CAPTURE_TIMEOUT_MS = 2_000;

async function captureStaticImageFrame(source: string): Promise<{ mimeType: string; dataBase64: string } | null> {
  if (typeof Image === "undefined" || typeof document === "undefined") return null;
  // jsdom cannot decode image resources and does not reliably dispatch the
  // browser image lifecycle events. The server-side asset pipeline remains
  // the authoritative fallback for this environment.
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return null;
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        callback();
      };
      const timeoutId = setTimeout(
        () => finish(() => reject(new Error("IMAGE_LOAD_TIMEOUT"))),
        WHITEBOARD_IMAGE_CAPTURE_TIMEOUT_MS,
      );
      image.onload = () => finish(resolve);
      image.onerror = () => finish(() => reject(new Error("IMAGE_LOAD_FAILED")));
      image.src = source;
      // `complete` can be true for a newly assigned data URL while decoding
      // is still pending. Only resolve the fast path when dimensions are
      // already available; otherwise let onload/onerror (or the bounded
      // timeout) decide. This is important for capturing an animated image's
      // current browser frame instead of falling back to its first frame.
      if (image.complete && (image.naturalWidth || image.width)) finish(resolve);
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    return { mimeType: "image/png", dataBase64: await blobToBase64(blob) };
  } catch {
    // The server still receives the original managed/data/remote source and
    // can decode it through its controlled asset pipeline.
    return null;
  }
}

/** Normalize every image node to a managed static PNG before commit. */
async function prepareDocumentAssets(
  document: WhiteboardDocumentV3,
  projectId: string,
  sessionId: string,
): Promise<WhiteboardDocumentV3> {
  const next = JSON.parse(JSON.stringify(document)) as WhiteboardDocumentV3;
  const prepared = new Map<string, { assetRef: string; url: string; width?: number; height?: number }>();
  const prepareSource = async (source: string, nodeId: string) => {
    let asset = prepared.get(source);
    if (!asset) {
      const browserBlob = await captureStaticImageFrame(source);
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/whiteboards/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          draftId: document.id,
          nodeId,
          source: { src: source },
          ...(browserBlob ? { browserBlob } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<{
        assetRef?: string;
        imageId?: string;
        url?: string;
        width?: number;
        height?: number;
      }>;
      if (!response.ok || !payload.success || !(payload.data?.assetRef || payload.data?.imageId) || !payload.data.url) {
        throw new Error(readError(payload, `图片节点“${nodeId}”无法处理，请重新上传图片。`));
      }
      asset = {
        assetRef: payload.data.assetRef || payload.data.imageId!,
        url: payload.data.url,
        width: payload.data.width,
        height: payload.data.height,
      };
      prepared.set(source, asset);
    }
    return asset;
  };
  for (const libraryAsset of next.scene.assets ?? []) {
    if (libraryAsset.type !== "image" || typeof libraryAsset.src !== "string" || !libraryAsset.src) continue;
    const asset = await prepareSource(libraryAsset.src, libraryAsset.id);
    libraryAsset.src = asset.url;
    if (asset.width !== undefined) libraryAsset.width = asset.width;
    if (asset.height !== undefined) libraryAsset.height = asset.height;
  }
  for (const node of next.scene.nodes) {
    if (node.type !== "image" || typeof node.src !== "string" || !node.src) continue;
    const asset = await prepareSource(node.src, node.id);
    node.src = asset.url;
    if (asset.width !== undefined && asset.height !== undefined) {
      node.intrinsicWidth = asset.width;
      node.intrinsicHeight = asset.height;
    }
    next.nodeSemantics[node.id] = {
      ...next.nodeSemantics[node.id],
      assetRef: asset.assetRef,
    };
  }
  return next;
}

function readError(response: ApiEnvelope<unknown>, fallback: string): string {
  return response.error?.message || fallback;
}

function whiteboardUserError(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message.trim() : "";
  return message && /[\u3400-\u9fff]/u.test(message) ? message : fallback;
}

/**
 * A private, controlled whiteboard draft.  The host owns whether it is open and
 * applies returned config values only after the server has issued a commit.
 */
export function WhiteboardDialog({
  open,
  onOpenChange,
  projectId,
  sessionId,
  target,
  initialDocument,
  onCommitted,
  onDiagnosticEvent,
}: WhiteboardDialogProps) {
  const initialDraftRef = useRef<WhiteboardDocumentV3 | null>(null);
  if (!initialDraftRef.current)
    initialDraftRef.current = initialDocument
      ? normalizeManagedAssetSemantics(initialDocument, sessionId, target)
      : newDocument(target, sessionId);
  const initialDraft = initialDraftRef.current;
  const [document, setDocument] = useState<WhiteboardDocumentV3>(
    () => initialDraft!,
  );
  const [baseline, setBaseline] = useState(() =>
    draftFingerprint(initialDraft!),
  );
  const [baselineRevision, setBaselineRevision] = useState(() =>
    getWhiteboardDocumentRevision(initialDraft),
  );
  const [baseRevisionToken, setBaseRevisionToken] = useState<number | null>(
    () =>
      initialDocument ? getWhiteboardDocumentRevision(initialDocument) : null,
  );
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState(() =>
    codeForDocument(initialDraft!),
  );
  const [codeError, setCodeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [loadBlocked, setLoadBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const lastLoadKey = useRef<string | null>(null);

  const dirty = useMemo(
    () => draftFingerprint(document) !== baseline,
    [baseline, document],
  );
  const loadKey = `${projectId}:${sessionId}:${target.scope}:${target.pageId ?? ""}:${target.fieldPath}:${target.listItem?.index ?? ""}:${target.listItem?.url ?? ""}:${reloadNonce}`;

  const adopt = useCallback(
    (
      next: WhiteboardDocument,
      revisionToken: number | null = getWhiteboardDocumentRevision(next),
    ) => {
      const normalized = normalizeManagedAssetSemantics(next, sessionId, target);
      setDocument(normalized);
      setBaseline(draftFingerprint(normalized));
      setBaselineRevision(normalized.documentRevision);
      setBaseRevisionToken(revisionToken);
      setCodeDraft(codeForDocument(normalized));
      setCodeError(null);
      setError(null);
    },
    [sessionId, target],
  );

  useEffect(() => {
    if (!open || lastLoadKey.current === loadKey) return;
    lastLoadKey.current = loadKey;
    if (initialDocument) {
      adopt(initialDocument, getWhiteboardDocumentRevision(initialDocument));
      setLoadNotice(null);
      setLoadBlocked(false);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({
      sessionId,
      scope: target.scope,
      fieldPath: target.fieldPath,
    });
    if (target.pageId) query.set("pageId", target.pageId);
    if (target.listItem) query.set("itemUrl", target.listItem.url);
    setLoading(true);
    setLoadNotice(null);
    setLoadBlocked(false);
    void fetch(
      `/api/projects/${encodeURIComponent(projectId)}/whiteboards?${query}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response
          .json()
          .catch(() => ({}))) as ApiEnvelope<ReadResult>;
        if (!response.ok || !payload.success)
          throw new Error(readError(payload, "无法读取已有白板"));
        const remoteDocument = payload.data?.document ?? newDocument(target, sessionId);
        adopt(
          remoteDocument,
          payload.data?.binding
            ? getWhiteboardDocumentRevision(remoteDocument)
            : null,
        );
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        // A damaged or unavailable bound document must never be replaced by a
        // fresh draft: doing so could overwrite the only recoverable source on
        // the next commit. Keep the current draft visible, but block writes
        // until the user explicitly retries and the read succeeds.
        setLoadBlocked(true);
        const message = whiteboardUserError(cause, "无法读取已有白板")
          .replace(/[。！？.!?]+$/u, "");
        setLoadNotice(`${message}。请刷新远端版本后继续。`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      // React Strict Mode immediately cleans up and restarts effects in
      // development. Release this attempt's dedupe key so the restart can
      // issue the replacement request instead of leaving loading unresolved.
      if (lastLoadKey.current === loadKey) lastLoadKey.current = null;
    };
  }, [adopt, initialDocument, loadKey, open, projectId, sessionId, target]);

  useEffect(() => {
    if (!open) lastLoadKey.current = null;
  }, [open]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }, [dirty, onOpenChange, saving]);

  const handleSceneChange = useCallback((scene: SketchSceneDocument) => {
    setDocument((current) => {
      const nodeIds = new Set(scene.nodes.map((node) => node.id));
      const nodeSemantics: WhiteboardDocumentV3["nodeSemantics"] = Object.fromEntries(
        Object.entries(current.nodeSemantics).filter(([nodeId]) =>
          nodeIds.has(nodeId),
        ),
      );
      return { ...current, scene, nodeSemantics, updatedAt: Date.now() };
    });
  }, []);

  const exportCode = useCallback(() => {
    const result = serializeWhiteboardCode(asWhiteboardDocumentV2(document));
    if (!result.value) {
      setCodeError(
        result.diagnostics.map((item) => item.message).join("；") ||
          "当前白板包含代码模式不支持的节点",
      );
      setCodeOpen(true);
      return;
    }
    setCodeDraft(result.value);
    setCodeError(null);
    setCodeOpen(true);
  }, [document]);

  const importCode = useCallback(() => {
    const startedAt = Date.now();
    const result = parseWhiteboardCode(codeDraft.html, codeDraft.css, {
      id: asWhiteboardDocumentV2(document).id,
    });
    if (!result.value) {
      setCodeError(
        result.diagnostics
          .map((item) => item.message)
          .join("\n") || "代码导入失败",
      );
      onDiagnosticEvent?.({
        category: "ui",
        name: "whiteboard.code_import.failed",
        level: "warn",
        details: {
          diagnosticCodes: result.diagnostics
            .map((item) => item.code)
            .slice(0, 20),
          durationMs: Math.max(0, Date.now() - startedAt),
        },
      });
      return;
    }
    const current = asWhiteboardDocumentV2(document);
    setDocument({
      ...normalizeManagedAssetSemantics(result.value),
      version: 3,
      sceneFormat: "sketch-scene-v1",
      editorView: current.editorView,
      ...(current.safeArea ? { safeArea: current.safeArea } : {}),
      documentRevision: current.documentRevision,
      updatedAt: Date.now(),
    });
    setCodeError(null);
    onDiagnosticEvent?.({
      category: "ui",
      name: "whiteboard.code_import.completed",
      details: {
        durationMs: Math.max(0, Date.now() - startedAt),
        nodeCount: result.value.scene.nodes.length,
        success: true,
      },
    });
  }, [codeDraft, document, onDiagnosticEvent]);

  const copyCode = useCallback(async () => {
    const result = serializeWhiteboardCode(asWhiteboardDocumentV2(document));
    if (!result.value) {
      setCodeError(
        result.diagnostics.map((item) => item.message).join("；") ||
          "当前白板无法序列化",
      );
      setCodeOpen(true);
      return;
    }
    setCodeDraft(result.value);
    setCodeError(null);
    try {
      await navigator.clipboard?.writeText(
        `${result.value.html}\n\n<style>\n${result.value.css}\n</style>`,
      );
    } catch {
      setCodeOpen(true);
    }
  }, [document]);

  const refreshRemote = useCallback(() => {
    if (saving) return;
    setError(null);
    setLoadBlocked(false);
    lastLoadKey.current = null;
    setReloadNonce((value) => value + 1);
  }, [saving]);

  const commit = useCallback(async () => {
    if (loadBlocked) {
      setError("已有白板版本未成功载入，请先刷新远端版本。");
      return;
    }
    const startedAt = Date.now();
    setSaving(true);
    setError(null);
    try {
      const assetStartedAt = Date.now();
      let normalized: WhiteboardDocumentV3;
      try {
        normalized = await prepareDocumentAssets(asWhiteboardDocumentV3(document), projectId, sessionId);
      } catch (cause) {
        onDiagnosticEvent?.({
          category: "project",
          name: "whiteboard.asset_localization.failed",
          level: "error",
          details: {
            durationMs: Math.max(0, Date.now() - assetStartedAt),
            assetCount: Object.values(
              asWhiteboardDocumentV2(document).nodeSemantics,
            ).filter((value) => Boolean(value.assetRef)).length,
            errorCode:
              cause instanceof Error
                ? cause.name
                : "WHITEBOARD_ASSET_LOCALIZATION_FAILED",
          },
        });
        throw cause;
      }
      const attachedAssetCount = Object.values(normalized.nodeSemantics).filter(
        (value) => Boolean(value.assetRef),
      ).length;
      const assetLatencyMs = Math.max(0, Date.now() - assetStartedAt);
      onDiagnosticEvent?.({
        category: "project",
        name: "whiteboard.asset_localization.completed",
        details: {
          durationMs: assetLatencyMs,
          ...(attachedAssetCount > 0
            ? { firstUsableImageLatencyMs: assetLatencyMs }
            : {}),
          assetCount: attachedAssetCount,
          success: true,
        },
      });
      const commitDocument: WhiteboardDocumentV3 = {
        ...normalized,
        documentRevision: baselineRevision,
        updatedAt: Date.now(),
      };
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/whiteboards/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            baseDocumentRevision: baseRevisionToken,
            target,
            document: commitDocument,
          }),
        },
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as ApiEnvelope<CommitResult>;
      if (!response.ok || !payload.success || !payload.data?.values)
        throw new Error(readError(payload, "白板回填失败，请重试。"));
      const committedDocument = payload.data.document
        ? asWhiteboardDocumentV3(payload.data.document)
        : { ...commitDocument, documentRevision: baselineRevision + 1 };
      setDocument(committedDocument);
      setBaseline(draftFingerprint(committedDocument));
      setBaselineRevision(committedDocument.documentRevision);
      setBaseRevisionToken(committedDocument.documentRevision);
      onCommitted(target, payload.data.values);
      const committed = target.listItem
        ? (
            payload.data.values[target.fieldPath] as
              | Array<{ url?: string } | string>
              | undefined
          )?.[target.listItem.index]
        : payload.data.values[target.fieldPath];
      const committedUrl =
        typeof committed === "string"
          ? committed
          : committed &&
              typeof committed === "object" &&
              "url" in committed &&
              typeof committed.url === "string"
            ? committed.url
            : undefined;
      if (committedUrl) target.onCommit?.(committedUrl);
      onDiagnosticEvent?.({
        category: "project",
        name: "whiteboard.commit.completed",
        details: {
          commitLatencyMs: Math.max(0, Date.now() - startedAt),
          documentRevision: committedDocument.documentRevision,
          success: true,
        },
      });
      onOpenChange(false);
    } catch (cause) {
      setError(whiteboardUserError(cause, "白板回填失败，请重试。"));
      onDiagnosticEvent?.({
        category: "project",
        name: "whiteboard.commit.failed",
        level: "error",
        details: {
          commitLatencyMs: Math.max(0, Date.now() - startedAt),
          success: false,
          errorCode:
            cause instanceof Error ? cause.name : "WHITEBOARD_COMMIT_FAILED",
        },
      });
    } finally {
      setSaving(false);
    }
  }, [
    baseRevisionToken,
    baselineRevision,
    document,
    loadBlocked,
    onCommitted,
    onDiagnosticEvent,
    onOpenChange,
    projectId,
    sessionId,
    target,
  ]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
      >
        <DialogContent
          className="flex h-[min(92vh,900px)] max-w-[min(96vw,1440px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1440px)]"
          onEscapeKeyDown={(event) => {
            if (event.target instanceof Element && event.target.closest('[data-sketch-escape-scope="local"]')) {
              event.preventDefault();
              return;
            }
            if (dirty || saving) {
              event.preventDefault();
              requestClose();
            }
          }}
          onPointerDownOutside={(event) => {
            if (dirty || saving) {
              event.preventDefault();
              requestClose();
            }
          }}
          onInteractOutside={(event) => {
            if (dirty || saving) event.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>配置图片白板</DialogTitle>
            <DialogDescription>
              仅在“回填图片”成功后更新当前配置。
            </DialogDescription>
          </DialogHeader>
          {loadNotice ? (
            <p
              role="status"
              className="shrink-0 border-b bg-amber-50 px-6 py-2 text-sm text-amber-900"
            >
              {loadNotice}
            </p>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="flex shrink-0 items-center justify-between gap-3 border-b bg-destructive/10 px-6 py-2 text-sm text-destructive"
            >
              <span>{error}</span>
              {error.includes("刷新") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={refreshRemote}
                >
                  刷新远端版本
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在载入白板…
              </div>
            ) : (
              <SketchEditorSurface
                scene={document.scene}
                profile="whiteboard"
                fillContainer
                onSceneChange={handleSceneChange}
              />
            )}
          </div>
          {codeOpen ? (
            <div className="grid max-h-[min(42vh,360px)] shrink-0 grid-cols-2 gap-3 border-t bg-slate-50 p-3">
              <label className="flex min-h-0 flex-col gap-1 text-xs font-medium text-slate-700">
                HTML
                <textarea
                  aria-label="白板 HTML 代码"
                  className="min-h-28 flex-1 resize-none rounded border bg-white p-2 font-mono text-xs"
                  value={codeDraft.html}
                  onChange={(event) =>
                    setCodeDraft((current) => ({
                      ...current,
                      html: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="flex min-h-0 flex-col gap-1 text-xs font-medium text-slate-700">
                CSS
                <textarea
                  aria-label="白板 CSS 代码"
                  className="min-h-28 flex-1 resize-none rounded border bg-white p-2 font-mono text-xs"
                  value={codeDraft.css}
                  onChange={(event) =>
                    setCodeDraft((current) => ({
                      ...current,
                      css: event.target.value,
                    }))
                  }
                />
              </label>
              {codeError ? (
                <pre
                  role="alert"
                  className="col-span-2 max-h-20 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700"
                >
                  {codeError}
                </pre>
              ) : null}
              <div className="col-span-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyCode()}
                >
                  <Clipboard className="mr-1 h-4 w-4" />
                  复制代码
                </Button>
                <Button type="button" onClick={importCode}>
                  导入到白板
                </Button>
              </div>
            </div>
          ) : null}
          <DialogFooter className="shrink-0 items-center justify-between gap-2 border-t px-6 py-4 sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {dirty ? "有未回填的本地修改" : "尚未修改"}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (codeOpen) setCodeOpen(false);
                  else exportCode();
                }}
              >
                <Code2 className="mr-1 h-4 w-4" />
                {codeOpen ? "关闭代码" : "代码导入/导出"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={loading || saving || loadBlocked}
                onClick={() => void commit()}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在回填…
                  </>
                ) : (
                  "回填图片"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>放弃未回填的修改？</DialogTitle>
            <DialogDescription>
              关闭后本次白板草稿将被放弃，当前配置图片不会改变。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDiscard(false)}
            >
              继续编辑
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              放弃并关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
