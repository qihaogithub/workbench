"use client";

import { useState, useCallback, useMemo, type MutableRefObject, type RefObject } from "react";
import { useToast } from "@/components/ui/toast-provider";
import type {
  VisualAnnotation,
  VisualEditPatch,
  VisualInlineEditPayload,
  VisualNodeInfo,
  VisualStyleChange,
} from "../../../../../../components/demo";
import {
  buildVisualConfigCandidates,
  suggestVisualConfigFieldKey,
  type VisualConfigCandidate,
  type VisualConfigureResult,
} from "@/lib/visual-configurator";
import { invalidateCompileCache } from "../../../../../../components/demo";

function createVisualId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function replaceUniqueText(
  source: string,
  before: string,
  after: string,
): { code?: string; error?: string } {
  const first = source.indexOf(before);
  if (first === -1) {
    return { error: "当前代码中找不到原始文本，可能来自动态数据或已被修改" };
  }
  const second = source.indexOf(before, first + before.length);
  if (second !== -1) {
    return { error: "原始文本在代码中出现多次，请跳转代码后手动确认修改位置" };
  }
  return {
    code: `${source.slice(0, first)}${after}${source.slice(first + before.length)}`,
  };
}

function getSchemaPropertyKeys(
  ...schemas: Array<string | undefined | null>
): string[] {
  const keys = new Set<string>();
  for (const schema of schemas) {
    if (!schema) continue;
    try {
      const parsed = JSON.parse(schema) as { properties?: Record<string, unknown> };
      for (const key of Object.keys(parsed.properties || {})) {
        keys.add(key);
      }
    } catch {
      // 忽略坏 schema，保存入口仍会做完整校验。
    }
  }
  return Array.from(keys);
}

export interface ApplyDemoSnapshotFn {
  (params: {
    code?: string;
    schema?: string;
    source: "ai-realtime" | "ai-finish" | "manual-load" | "page-switch" | "collab";
  }): void;
}

export interface UseVisualEditStateParams {
  codeRef: RefObject<string>;
  schemaRef: RefObject<string>;
  projectConfigSchema: string | undefined;
  activeDemoIdRef: MutableRefObject<string>;
  sessionId: string;
  activeDemoId: string;
  applyDemoSnapshot: ApplyDemoSnapshotFn;
  markWorkspaceChanged: () => void;
  setConfigDataMap: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, unknown>>>
  >;
  setTabValue: React.Dispatch<React.SetStateAction<string>>;
  setTriggerAutoSend: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useVisualEditState(params: UseVisualEditStateParams) {
  const {
    codeRef,
    schemaRef,
    projectConfigSchema,
    activeDemoIdRef,
    sessionId,
    activeDemoId,
    applyDemoSnapshot,
    markWorkspaceChanged,
    setConfigDataMap,
    setTabValue,
    setTriggerAutoSend,
  } = params;
  const { toast } = useToast();

  const [visualEditMode, setVisualEditMode] = useState(false);
  const [visualAnnotationMode, setVisualAnnotationMode] = useState(false);
  const [hoveredVisualNode, setHoveredVisualNode] =
    useState<VisualNodeInfo | null>(null);
  const [selectedVisualNode, setSelectedVisualNode] =
    useState<VisualNodeInfo | null>(null);
  const [visualAnnotations, setVisualAnnotations] = useState<
    VisualAnnotation[]
  >([]);
  const [visualPatches, setVisualPatches] = useState<VisualEditPatch[]>([]);
  const [visualConfigMode, setVisualConfigMode] = useState(false);
  const [visualConfigNode, setVisualConfigNode] =
    useState<VisualNodeInfo | null>(null);
  const [visualConfigCandidateId, setVisualConfigCandidateId] = useState("");
  const [visualConfigTitle, setVisualConfigTitle] = useState("");
  const [visualConfigFieldKey, setVisualConfigFieldKey] = useState("");
  const [visualConfigDefaultValue, setVisualConfigDefaultValue] = useState("");
  const [visualConfigError, setVisualConfigError] = useState<string | null>(
    null,
  );
  const [visualConfigApplying, setVisualConfigApplying] = useState(false);

  const visualConfigCandidates = useMemo(
    () => buildVisualConfigCandidates(visualConfigNode),
    [visualConfigNode],
  );
  const selectedVisualConfigCandidate = useMemo(
    () =>
      visualConfigCandidates.find(
        (candidate) => candidate.id === visualConfigCandidateId,
      ) ?? visualConfigCandidates[0],
    [visualConfigCandidateId, visualConfigCandidates],
  );
  const visualConfigDialogOpen = !!visualConfigNode;

  const initializeVisualConfigDialog = useCallback(
    (node: VisualNodeInfo, preferredCandidate?: VisualConfigCandidate) => {
      const candidates = buildVisualConfigCandidates(node);
      const candidate = preferredCandidate ?? candidates[0];
      if (!candidate) {
        toast({
          title: "这个元素暂时不能自动配置化",
          description: "请选择文本、图片或带颜色样式的元素。",
          variant: "destructive",
        });
        return;
      }

      const usedKeys = getSchemaPropertyKeys(schemaRef.current, projectConfigSchema);
      setVisualConfigNode(node);
      setVisualConfigCandidateId(candidate.id);
      setVisualConfigTitle(candidate.fieldTitle);
      setVisualConfigFieldKey(
        suggestVisualConfigFieldKey(candidate.fieldTitle, usedKeys),
      );
      setVisualConfigDefaultValue(candidate.defaultValue);
      setVisualConfigError(null);
    },
    [projectConfigSchema, schemaRef, toast],
  );

  const handleVisualConfigCandidateChange = useCallback(
    (candidateId: string) => {
      const candidate = visualConfigCandidates.find(
        (item) => item.id === candidateId,
      );
      if (!candidate) return;
      const usedKeys = getSchemaPropertyKeys(schemaRef.current, projectConfigSchema);
      setVisualConfigCandidateId(candidate.id);
      setVisualConfigTitle(candidate.fieldTitle);
      setVisualConfigFieldKey(
        suggestVisualConfigFieldKey(candidate.fieldTitle, usedKeys),
      );
      setVisualConfigDefaultValue(candidate.defaultValue);
      setVisualConfigError(null);
    },
    [projectConfigSchema, schemaRef, visualConfigCandidates],
  );

  const handleVisualSelect = useCallback(
    (node: VisualNodeInfo | null) => {
      setSelectedVisualNode(node);
      if (!node) return;

      if (visualConfigMode) {
        initializeVisualConfigDialog(node);
      }
    },
    [initializeVisualConfigDialog, visualConfigMode],
  );

  const handleStartVisualConfig = useCallback(() => {
    if (visualConfigMode) {
      setVisualConfigMode(false);
      setVisualEditMode(false);
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
      setHoveredVisualNode(null);
      return;
    }

    setVisualConfigMode(true);
    setVisualAnnotationMode(false);
    setVisualEditMode(true);
    setSelectedVisualNode(null);
    setHoveredVisualNode(null);
    setVisualConfigError(null);
  }, [visualConfigMode]);

  const handleApplyVisualConfig = useCallback(async () => {
    if (!visualConfigNode || !selectedVisualConfigCandidate) return;

    setVisualConfigApplying(true);
    setVisualConfigError(null);
    try {
      const response = await fetch("/api/visual-configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeRef.current,
          schema: schemaRef.current,
          projectConfigSchema,
          demoId: activeDemoIdRef.current,
          node: visualConfigNode,
          target: {
            kind: selectedVisualConfigCandidate.kind,
            fieldKey: visualConfigFieldKey.trim(),
            title: visualConfigTitle.trim(),
            defaultValue: visualConfigDefaultValue,
            colorProperty: selectedVisualConfigCandidate.colorProperty,
          },
        }),
      });
      const data = (await response.json()) as
        | {
            success: true;
            data: Extract<VisualConfigureResult, { ok: true }>;
          }
        | { success: false; error?: { message?: string } };

      if (!response.ok || !data.success) {
        throw new Error(
          data.success ? "添加配置项失败" : data.error?.message || "添加配置项失败",
        );
      }

      applyDemoSnapshot({
        code: data.data.code,
        schema: data.data.schema,
        source: "manual-load",
      });
      setConfigDataMap((prev) => {
        const pageId = activeDemoIdRef.current;
        return {
          ...prev,
          [pageId]: {
            ...(prev[pageId] ?? {}),
            ...data.data.configPatch,
          },
        };
      });
      markWorkspaceChanged();
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
      toast({ title: "配置项已添加" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "添加配置项失败";
      setVisualConfigError(message);
      toast({
        title: "无法添加配置项",
        description: message,
        variant: "destructive",
      });
    } finally {
      setVisualConfigApplying(false);
    }
  }, [
    applyDemoSnapshot,
    codeRef,
    schemaRef,
    markWorkspaceChanged,
    projectConfigSchema,
    selectedVisualConfigCandidate,
    toast,
    visualConfigDefaultValue,
    visualConfigFieldKey,
    visualConfigNode,
    visualConfigTitle,
    activeDemoIdRef,
    setConfigDataMap,
  ]);

  const handleCloseVisualConfigDialog = useCallback(() => {
    setVisualConfigNode(null);
    setVisualConfigError(null);
  }, []);

  const handleVisualConfigTitleChange = useCallback(
    (value: string) => {
      setVisualConfigTitle(value);
      const usedKeys = getSchemaPropertyKeys(schemaRef.current, projectConfigSchema);
      setVisualConfigFieldKey(suggestVisualConfigFieldKey(value, usedKeys));
    },
    [projectConfigSchema, schemaRef],
  );

  const handleStartVisualAnnotation = useCallback(() => {
    if (visualAnnotationMode) {
      const pendingCount = visualAnnotations.filter((item) => !item.resolved).length;
      if (
        pendingCount > 0 &&
        !window.confirm(`当前有 ${pendingCount} 条未发送批注，确定取消并丢弃吗？`)
      ) {
        return;
      }
      setVisualAnnotationMode(false);
      setVisualEditMode(false);
      setVisualConfigMode(false);
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
      setHoveredVisualNode(null);
      setVisualAnnotations((prev) => prev.filter((item) => item.resolved));
      return;
    }

    const next = !visualAnnotationMode;
    setVisualAnnotationMode(next);
    setVisualConfigMode(false);
    setVisualConfigNode(null);
    setVisualEditMode(next);
    setSelectedVisualNode(null);
    setHoveredVisualNode(null);
  }, [visualAnnotationMode, visualAnnotations]);

  const handleSendVisualAnnotationsToAI = useCallback(() => {
    const activeAnnotations = visualAnnotations.filter((item) => !item.resolved);
    if (activeAnnotations.length === 0) {
      return;
    }

    const summary = `请根据 ${activeAnnotations.length} 条页面批注修改当前页面。`;
    const context = activeAnnotations
      .map((annotation, index) => {
        const styleLines =
          annotation.styleChanges && annotation.styleChanges.length > 0
            ? [
                "- 样式修改：",
                ...annotation.styleChanges.map(
                  (change) =>
                    `  - ${change.label}（${change.property}）：${change.previousValue ?? "未设置"} -> ${change.value}`,
                ),
              ]
            : [];
        return [
          `批注 ${index + 1}`,
          `- 评论：${annotation.text}`,
          ...styleLines,
          `- DOM 路径：${annotation.domPath}`,
          `- 节点 ID：${annotation.nodeId}`,
        ].join("\n");
      })
      .join("\n\n");

    const prompt = `${summary}

请优先读取并修改 demos/${activeDemoIdRef.current}/index.tsx。只处理这些批注指向的问题；如果必须修改其他文件，请先说明原因。

<!-- VISUAL_ANNOTATION_CONTEXT
${context}
-->`;

    setTabValue("ai");
    setTriggerAutoSend(prompt);
    setVisualAnnotationMode(false);
    setVisualEditMode(false);
    setSelectedVisualNode(null);
    setVisualAnnotations((prev) =>
      prev.map((item) =>
        item.resolved ? item : { ...item, resolved: true },
      ),
    );
  }, [visualAnnotations, activeDemoIdRef, setTabValue, setTriggerAutoSend]);

  const handleVisualInlineEdit = useCallback(
    (payload: VisualInlineEditPayload) => {
      const patch: VisualEditPatch = {
        id: createVisualId("patch"),
        title: `修改 <${payload.node.tagName}> 文本`,
        file: `demos/${activeDemoIdRef.current}/index.tsx`,
        before: payload.before,
        after: payload.after,
        kind: "text",
        status: "previewed",
        node: payload.node,
      };
      setSelectedVisualNode(payload.node);
      setVisualPatches((prev) => [patch, ...prev]);
      setTabValue("ai");
      toast({
        title: "已生成文本修改建议",
        description: "请在批注面板中接受或拒绝该修改。",
      });
    },
    [activeDemoIdRef, setTabValue, toast],
  );

  const handleCreateVisualAnnotation = useCallback(
    (
      text?: string,
      targetNode?: VisualNodeInfo,
      styleChanges?: VisualStyleChange[],
    ) => {
      const node = targetNode ?? selectedVisualNode;
      if (!node) {
        return;
      }
      const annotationText =
        text?.trim() ||
        (styleChanges && styleChanges.length > 0 ? "样式修改" : "待处理的页面批注");
      const annotation: VisualAnnotation = {
        id: createVisualId("note"),
        nodeId: node.nodeId,
        domPath: node.domPath,
        text: annotationText,
        styleChanges,
        createdAt: Date.now(),
      };
      setVisualAnnotations((prev) => [annotation, ...prev]);
    },
    [selectedVisualNode],
  );

  const handleAcceptVisualPatch = useCallback(
    (patch: VisualEditPatch) => {
      if (patch.status === "accepted") return;
      if (patch.kind !== "text") {
        setVisualPatches((prev) =>
          prev.map((item) =>
            item.id === patch.id
              ? { ...item, error: "该类型的写回尚未实现" }
              : item,
          ),
        );
        return;
      }

      const result = replaceUniqueText(
        codeRef.current ?? "",
        patch.before ?? "",
        patch.after ?? "",
      );
      if (result.error || !result.code) {
        setVisualPatches((prev) =>
          prev.map((item) =>
            item.id === patch.id
              ? { ...item, status: "draft", error: result.error }
              : item,
          ),
        );
        toast({
          title: "无法安全写回",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      applyDemoSnapshot({ code: result.code, source: "ai-finish" });
      setVisualPatches((prev) =>
        prev.map((item) =>
          item.id === patch.id
            ? { ...item, status: "accepted", error: undefined }
            : item,
        ),
      );
      toast({ title: "修改已写回代码" });
    },
    [applyDemoSnapshot, codeRef, toast],
  );

  const handleRejectVisualPatch = useCallback(
    (patchId: string) => {
      setVisualPatches((prev) =>
        prev.map((item) =>
          item.id === patchId ? { ...item, status: "rejected" } : item,
        ),
      );
      if (sessionId && activeDemoId) {
        invalidateCompileCache(sessionId, activeDemoId);
      }
      toast({ title: "已拒绝该修改" });
    },
    [activeDemoId, sessionId, toast],
  );

  const handleSendSelectionToAI = useCallback(() => {
    if (!selectedVisualNode) {
      toast({ title: "请先在预览区选择一个元素" });
      return;
    }
    const prompt = `请只针对当前可视化选区提出修改建议，不要静默扩大范围。

【当前选区】
- 元素：<${selectedVisualNode.tagName}>
- DOM 路径：${selectedVisualNode.domPath}
- className：${selectedVisualNode.className || "无"}
- 文本：${selectedVisualNode.textContent || "无"}
- 页面文件：demos/${activeDemoIdRef.current}/index.tsx

请给出可审阅的局部修改建议；如果必须修改选区外代码，请明确说明影响范围。`;
    setTabValue("ai");
    setTriggerAutoSend(prompt);
  }, [selectedVisualNode, activeDemoIdRef, setTabValue, setTriggerAutoSend, toast]);

  return {
    // State
    visualEditMode,
    setVisualEditMode,
    visualAnnotationMode,
    setVisualAnnotationMode,
    hoveredVisualNode,
    setHoveredVisualNode,
    selectedVisualNode,
    setSelectedVisualNode,
    visualAnnotations,
    setVisualAnnotations,
    visualPatches,
    setVisualPatches,
    visualConfigMode,
    setVisualConfigMode,
    visualConfigNode,
    setVisualConfigNode,
    visualConfigCandidateId,
    setVisualConfigCandidateId,
    visualConfigTitle,
    setVisualConfigTitle,
    visualConfigFieldKey,
    setVisualConfigFieldKey,
    visualConfigDefaultValue,
    setVisualConfigDefaultValue,
    visualConfigError,
    setVisualConfigError,
    visualConfigApplying,
    setVisualConfigApplying,
    // Computed
    visualConfigCandidates,
    selectedVisualConfigCandidate,
    visualConfigDialogOpen,
    // Handlers
    initializeVisualConfigDialog,
    handleVisualConfigCandidateChange,
    handleVisualSelect,
    handleStartVisualConfig,
    handleApplyVisualConfig,
    handleCloseVisualConfigDialog,
    handleVisualConfigTitleChange,
    handleStartVisualAnnotation,
    handleSendVisualAnnotationsToAI,
    handleVisualInlineEdit,
    handleCreateVisualAnnotation,
    handleAcceptVisualPatch,
    handleRejectVisualPatch,
    handleSendSelectionToAI,
  };
}
