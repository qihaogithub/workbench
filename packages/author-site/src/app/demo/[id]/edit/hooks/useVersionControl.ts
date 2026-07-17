"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { flushWorkspaceCollab } from "@/lib/client-workspace-flush";
import { projectApiClient, ProjectApiError } from "@/lib/project-api";
import type {
  DemoFiles,
  DemoPageMeta,
  DemoFolderMeta,
  PageVersionHistoryResponse,
  PageVersionInfo,
  VersionHistoryResponse,
  VersionInfo,
} from "@workbench/shared";
import type { SketchPatchVersionSummary } from "@workbench/project-core";
import type { ValidationResult } from "../../../../../../lib/validator";

const IDLE_AUTO_CHECKPOINT_MS = 5 * 60 * 1000;
const CONTINUOUS_AUTO_CHECKPOINT_MS = 30 * 60 * 1000;

export type PublishStatus =
  | "never_published"
  | "published"
  | "unpublished_changes"
  | null;

export interface PreviewVersionState {
  scope: "page";
  version: PageVersionInfo;
  files: DemoFiles;
}

export interface UseVersionControlParams {
  demoId: string;
  sessionId: string;
  workspaceId: string;
  activeDemoId: string;
  activeDemoIdRef: MutableRefObject<string>;
  currentUsername: string;
  code: string;
  schema: string;
  validationResult: ValidationResult;
  demoPages: DemoPageMeta[];
  hasUnsavedChanges: boolean;
  hasUnsavedCanvasChanges: boolean;
  isSaving: boolean;
  applyDemoSnapshot: (params: {
    code?: string;
    schema?: string;
    source: "ai-realtime" | "ai-finish" | "manual-load" | "page-switch" | "collab";
  }) => void;
  flushCanvasState: () => Promise<void>;
  markCanvasChangesSaved: () => void;
  setActiveDemoId: React.Dispatch<React.SetStateAction<string>>;
  setDemoPages: React.Dispatch<React.SetStateAction<DemoPageMeta[]>>;
  setDemoFolders: React.Dispatch<React.SetStateAction<DemoFolderMeta[]>>;
  setProjectConfigSchema: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;
  setPageCodes: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  beforePublish?: () => Promise<void>;
  getSketchPatchSummary?: (
    pageId: string,
  ) => SketchPatchVersionSummary | undefined;
}

export function useVersionControl(params: UseVersionControlParams) {
  const {
    demoId,
    sessionId,
    workspaceId,
    activeDemoId,
    activeDemoIdRef,
    currentUsername,
    code,
    schema,
    validationResult,
    demoPages,
    hasUnsavedChanges,
    hasUnsavedCanvasChanges,
    isSaving: externalIsSaving,
    applyDemoSnapshot,
    flushCanvasState,
    markCanvasChangesSaved,
    setActiveDemoId,
    setDemoPages,
    setDemoFolders,
    setProjectConfigSchema,
    setPageCodes,
    setHasUnsavedChanges,
    setIsSaving,
    beforePublish,
    getSketchPatchSummary,
  } = params;
  const { toast } = useToast();

  const [publishStatus, setPublishStatus] = useState<PublishStatus>(null);
  const [publishing, setPublishing] = useState(false);
  const [versionHistory, setVersionHistory] =
    useState<VersionHistoryResponse | null>(null);
  const [pageVersionHistories, setPageVersionHistories] = useState<
    Record<string, PageVersionHistoryResponse>
  >({});
  const [restoring, setRestoring] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<PreviewVersionState | null>(
    null,
  );
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null);
  const autoCheckpointInFlightRef = useRef(false);
  const autoCheckpointBatchStartedAtRef = useRef<number | null>(null);
  const lastAutoCheckpointSignatureRef = useRef("");
  const latestSnapshotRef = useRef({
    activeDemoId,
    code,
    schema,
    hasUnsavedChanges,
    hasUnsavedCanvasChanges,
  });
  const pageVersionHistoryPageIds = useMemo(
    () => demoPages.map((page) => page.id),
    [demoPages],
  );
  const pageVersionHistoryPageKey = useMemo(
    () => pageVersionHistoryPageIds.join("\0"),
    [pageVersionHistoryPageIds],
  );

  const autoCheckpointSignature = useMemo(() => {
    return JSON.stringify({
      activeDemoId,
      code,
      schema,
      pageCount: demoPages.length,
      canvasDirty: hasUnsavedCanvasChanges,
    });
  }, [activeDemoId, code, demoPages.length, hasUnsavedCanvasChanges, schema]);

  useEffect(() => {
    latestSnapshotRef.current = {
      activeDemoId,
      code,
      schema,
      hasUnsavedChanges,
      hasUnsavedCanvasChanges,
    };
  }, [
    activeDemoId,
    code,
    hasUnsavedCanvasChanges,
    hasUnsavedChanges,
    schema,
  ]);

  const loadVersionHistory = useCallback(async () => {
    try {
      const data = await projectApiClient.getVersionHistory(demoId);
      setVersionHistory(data);
    } catch {
      setVersionHistory(null);
    }
  }, [demoId]);

  const loadPageVersionHistories = useCallback(async () => {
    const pageIds = pageVersionHistoryPageKey
      ? pageVersionHistoryPageKey.split("\0")
      : [];
    if (pageIds.length === 0) {
      setPageVersionHistories({});
      return;
    }

    const entries = await Promise.all(
      pageIds.map(async (pageId) => {
        try {
          const history = await projectApiClient.getPageVersionHistory(
            demoId,
            pageId,
          );
          return [pageId, history] as const;
        } catch {
          return null;
        }
      }),
    );

    setPageVersionHistories(
      Object.fromEntries(
        entries.filter(
          (entry): entry is NonNullable<typeof entry> => !!entry,
        ),
      ),
    );
  }, [demoId, pageVersionHistoryPageKey]);

  useEffect(() => {
    loadVersionHistory();
  }, [loadVersionHistory]);

  useEffect(() => {
    loadPageVersionHistories();
  }, [loadPageVersionHistories]);

  useEffect(() => {
    projectApiClient
      .getPublishStatus(demoId)
      .then((result) => {
        setPublishStatus(result.status);
        setPublishedVersion(result.publishedVersion);
      })
      .catch(() => {
        setPublishStatus(null);
      });
  }, [demoId]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await beforePublish?.();
      const publishResult = await projectApiClient.publishProject(demoId, {
        sessionId,
        workspaceId,
      });
      setPublishStatus("published");
      setPublishedVersion(publishResult.publishedVersion);
      toast({
        title: "发布成功",
        description: `版本 ${publishResult.publishedVersion} 已发布到预览端，共 ${publishResult.demoCount} 个页面`,
      });
    } catch (publishErr) {
      toast({
        title: "发布失败",
        description:
          publishErr instanceof Error ? publishErr.message : "发布失败",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  const handlePreviewPageVersion = async (version: PageVersionInfo) => {
    try {
      const files = await projectApiClient.getPageVersionFiles(
        demoId,
        version.demoId,
        version.versionId,
      );
      setPreviewVersion({ scope: "page", version, files });
    } catch (err) {
      toast({
        title: "预览失败",
        description: err instanceof Error ? err.message : "读取页面版本失败",
        variant: "destructive",
      });
    }
  };

  const handleRestorePageVersion = async (version: PageVersionInfo) => {
    const pageName =
      version.demoName ||
      demoPages.find((page) => page.id === version.demoId)?.name ||
      version.demoId;
    if (
      !confirm(`确定要将页面「${pageName}」恢复到 ${version.versionId} 吗？`)
    ) {
      return;
    }

    setRestoring(version.versionId);
    try {
      const result = await projectApiClient.restorePageVersion(
        demoId,
        version.demoId,
        version.versionId,
        { sessionId, workspaceId },
      );

      if (activeDemoId !== version.demoId) {
        setActiveDemoId(version.demoId);
        activeDemoIdRef.current = version.demoId;
      }
      applyDemoSnapshot({
        code: result.files.code,
        schema: result.files.schema,
        source: "manual-load",
      });
      setPageCodes((prev) => ({
        ...prev,
        [version.demoId]: result.files.code,
      }));
      setHasUnsavedChanges(false);
      setPublishStatus("unpublished_changes");
      setPreviewVersion(null);

      toast({
        title: "页面恢复成功",
        description: `已生成项目版本 ${result.newVersionId}`,
      });
      await Promise.all([loadVersionHistory(), loadPageVersionHistories()]);
    } catch (err) {
      toast({
        title: "页面恢复失败",
        description: err instanceof Error ? err.message : "恢复页面版本失败",
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
    }
  };

  const handleCreateVersion = async (): Promise<boolean> => {
    if (!sessionId) {
      console.error("[handleCreateVersion] sessionId 为空!");
      toast({
        title: "命名版本失败",
        description: "Session 未创建，请刷新页面重试",
        variant: "destructive",
      });
      return false;
    }

    if (!activeDemoId) {
      console.error("[handleCreateVersion] activeDemoId 为空!");
      toast({
        title: "命名版本失败",
        description: "未选中页面，请先选择要命名的页面",
        variant: "destructive",
      });
      return false;
    }

    if (!validationResult.isValid) {
      const errors = validationResult.errors.filter(
        (e) => e.severity === "error",
      );
      const warnings = validationResult.errors.filter(
        (e) => e.severity === "warning",
      );

      if (errors.length > 0) {
        toast({
          title: "命名版本失败：存在语法错误",
          description: `发现 ${errors.length} 个错误，需要先修复后才能命名版本`,
          variant: "destructive",
        });
      } else if (warnings.length > 0) {
        toast({
          title: "存在配置不一致",
          description: `发现 ${warnings.length} 个警告，版本预览可能异常`,
        });
      }
    }

    try {
      setIsSaving(true);
      await flushWorkspaceCollab(demoId, workspaceId, sessionId);
      await flushCanvasState();

      const saveRes = await fetch(
        `/api/sessions/${sessionId}/files/${activeDemoId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, schema }),
        },
      );

      if (!saveRes.ok) {
        throw new Error("保存文件失败");
      }

      const activePage = demoPages.find((page) => page.id === activeDemoId);
      await projectApiClient.createPageVersion(demoId, activeDemoId, {
        sessionId,
        note: activePage ? `修改了${activePage.name}` : "修改了页面",
        sketchPatchSummary: getSketchPatchSummary?.(activeDemoId),
      });

      const saveRes2 = await fetch(`/api/sessions/${sessionId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!saveRes2.ok) {
        throw new Error("合并到 Demo 失败");
      }

      toast({
        title: "已命名此版本",
        description: "当前内容已记录到历史记录",
      });

      setHasUnsavedChanges(false);
      markCanvasChangesSaved();
      setPublishStatus("unpublished_changes");

      loadVersionHistory();
      loadPageVersionHistories();
      return true;
    } catch (error) {
      let errorMessage =
        error instanceof Error ? error.message : "未知错误";
      if (error instanceof ProjectApiError && error.details) {
        const details = error.details as { validation?: { issues?: Array<{ message: string; severity?: string; code?: string }> } };
        const validationIssues = details.validation?.issues;
        if (validationIssues && validationIssues.length > 0) {
          const blockingIssues = validationIssues.filter(
            (issue) => issue.severity === "blocking",
          );
          const issuesToShow = blockingIssues.length > 0
            ? blockingIssues
            : validationIssues;
          errorMessage = issuesToShow
            .map((issue) => issue.message)
            .join("；");
        }
      }
      toast({
        title: "命名版本失败",
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const createAutoCheckpoint = useCallback(
    async (reason: "idle" | "continuous") => {
      if (!sessionId || !workspaceId || !demoId) return false;
      if (autoCheckpointInFlightRef.current) return false;
      if (!latestSnapshotRef.current.hasUnsavedChanges && !latestSnapshotRef.current.hasUnsavedCanvasChanges) {
        return false;
      }
      if (lastAutoCheckpointSignatureRef.current === autoCheckpointSignature) {
        return false;
      }

      autoCheckpointInFlightRef.current = true;
      try {
        await flushWorkspaceCollab(demoId, workspaceId, sessionId);
        await flushCanvasState();

        if (latestSnapshotRef.current.activeDemoId) {
          const checkpointPage = demoPages.find(
            (page) => page.id === latestSnapshotRef.current.activeDemoId,
          );
          const checkpointNote =
            reason === "idle"
              ? checkpointPage
                ? `停止编辑后自动记录${checkpointPage.name}`
                : "停止编辑后自动记录页面"
              : checkpointPage
                ? `持续编辑自动记录${checkpointPage.name}`
                : "持续编辑自动记录页面";
          const saveRes = await fetch(
            `/api/sessions/${sessionId}/files/${latestSnapshotRef.current.activeDemoId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: latestSnapshotRef.current.code,
                schema: latestSnapshotRef.current.schema,
              }),
            },
          );

          if (!saveRes.ok) {
            throw new Error("自动保存页面文件失败");
          }

          // 版本创建失败不阻断后续 checkpoint 记录和 UI 状态收尾。
          // 场景：Schema 校验失败时页面文件已写入成功，仅版本快照缺失，
          // 不应导致 UI 卡在"连接中"状态。
          try {
            await projectApiClient.createPageVersion(
              demoId,
              latestSnapshotRef.current.activeDemoId,
              {
                sessionId,
                note: checkpointNote,
                sketchPatchSummary: getSketchPatchSummary?.(
                  latestSnapshotRef.current.activeDemoId,
                ),
              },
            );
          } catch (versionError) {
            // 增强日志：展开 details 以获取具体 Schema 校验失败信息
            const errDetails = (versionError as { details?: unknown }).details;
            console.warn("[auto-checkpoint] createPageVersion failed:", {
              name: versionError instanceof Error ? versionError.name : "Unknown",
              message: versionError instanceof Error ? versionError.message : String(versionError),
              details: errDetails,
            });
          }
        }

        const checkpointRes = await fetch(`/api/sessions/${sessionId}/checkpoint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: reason === "idle"
              ? "停止编辑后自动保存记录"
              : "持续编辑自动保存记录",
          }),
        });

        if (!checkpointRes.ok) {
          throw new Error("创建自动保存记录失败");
        }

        lastAutoCheckpointSignatureRef.current = autoCheckpointSignature;
        autoCheckpointBatchStartedAtRef.current = null;
        setHasUnsavedChanges(false);
        markCanvasChangesSaved();
        setPublishStatus("unpublished_changes");
        await Promise.all([loadVersionHistory(), loadPageVersionHistories()]);
        return true;
      } catch (error) {
        // 增强日志：展开 details 以获取具体校验失败信息
        const errDetails = (error as { details?: unknown }).details;
        console.warn("[auto-checkpoint] failed:", {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error),
          details: errDetails,
        });
        return false;
      } finally {
        autoCheckpointInFlightRef.current = false;
      }
    },
    [
      autoCheckpointSignature,
      demoId,
      flushCanvasState,
      getSketchPatchSummary,
      demoPages,
      loadVersionHistory,
      loadPageVersionHistories,
      markCanvasChangesSaved,
      sessionId,
      setHasUnsavedChanges,
      workspaceId,
    ],
  );

  useEffect(() => {
    const hasPendingChanges = hasUnsavedChanges || hasUnsavedCanvasChanges;
    if (!hasPendingChanges || !sessionId || !workspaceId) {
      autoCheckpointBatchStartedAtRef.current = null;
      return;
    }

    if (autoCheckpointBatchStartedAtRef.current === null) {
      autoCheckpointBatchStartedAtRef.current = Date.now();
    }

    const idleTimer = window.setTimeout(() => {
      void createAutoCheckpoint("idle");
    }, IDLE_AUTO_CHECKPOINT_MS);

    const continuousDelay = Math.max(
      CONTINUOUS_AUTO_CHECKPOINT_MS -
        (Date.now() - autoCheckpointBatchStartedAtRef.current),
      0,
    );
    const continuousTimer = window.setTimeout(() => {
      void createAutoCheckpoint("continuous");
    }, continuousDelay);

    return () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(continuousTimer);
    };
  }, [
    autoCheckpointSignature,
    createAutoCheckpoint,
    hasUnsavedCanvasChanges,
    hasUnsavedChanges,
    sessionId,
    workspaceId,
  ]);

  const hasPendingChanges = hasUnsavedChanges || hasUnsavedCanvasChanges;
  const hasPublishableChanges =
    publishStatus === "never_published" ||
    publishStatus === "unpublished_changes";
  const publishButtonDisabled =
    externalIsSaving ||
    publishing ||
    publishStatus === null ||
    (!hasPendingChanges && !hasPublishableChanges);
  const publishButtonText = hasPendingChanges ? "同步并发布" : "发布";
  const publishingButtonText = hasPendingChanges ? "同步并发布中..." : "发布中...";

  return {
    // State
    publishStatus,
    setPublishStatus,
    publishing,
    versionHistory,
    pageVersionHistories,
    restoring,
    previewVersion,
    setPreviewVersion,
    publishedVersion,
    // Computed
    hasPendingChanges,
    hasPublishableChanges,
    shouldCreateVersionBeforePublish: false,
    publishButtonDisabled,
    publishButtonText,
    publishingButtonText,
    // Handlers
    loadVersionHistory,
    loadPageVersionHistories,
    handlePublish,
    handlePreviewPageVersion,
    handleRestorePageVersion,
    handleCreateVersion,
  };
}
