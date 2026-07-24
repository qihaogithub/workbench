"use client";

import { useState, useCallback, useMemo, type MutableRefObject, type RefObject } from "react";
import { useToast } from "@/components/ui/toast-provider";
import type { AutoRepairTrigger, VisualPropertyAutoSend } from "@/components/ai-elements";
import type {
  VisualAnnotation,
  VisualEditPatch,
  VisualInlineEditPayload,
  VisualNodeInfo,
  VisualPropertyChange,
  VisualPropertyChangeKind,
  VisualStyleChange,
} from "../../../../../../components/demo";
import {
  buildVisualConfigCandidates,
  suggestVisualConfigFieldKey,
  type VisualConfigCandidate,
  type VisualConfigureResult,
} from "@/lib/visual-configurator";
import type {
  PrototypeVisualConfigTarget,
  PrototypeVisualConfigResult,
} from "@/lib/prototype-visual-editor";
import { invalidateCompileCache } from "../../../../../../components/demo";
import {
  getSelectedImageSource,
  isProjectLocalImageReference,
  localizeSelectedImageAsset,
  type LocalizedImageAsset,
  type SelectedImageSource,
} from "../image-localization";

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

export interface VisualConfigMark {
  id: string;
  changeId: string;
  nodeId: string;
  domPath: string;
  kind: VisualPropertyChangeKind;
  property: string;
  label: string;
  fieldTitle: string;
  fieldKey: string;
  defaultValue: string;
  category?: string;
  scope: "page" | "project";
}

export type VisualPropertySubmissionStatus =
  | "idle"
  | "queued"
  | "sending"
  | "sent"
  | "failed";

export interface VisualPropertySubmission {
  status: VisualPropertySubmissionStatus;
  submittedAt: number | null;
  changes: VisualPropertyChange[];
  configMarks: VisualConfigMark[];
  instruction: string;
  prompt: string;
  error: string | null;
}

interface PrototypePropertyApplyStatus {
  ok: boolean;
  error?: string;
}

export interface VisualDraftActionState {
  count: number;
  kind: "save" | "send";
  label: "保存" | "发送给AI";
}

const EMPTY_VISUAL_PROPERTY_SUBMISSION: VisualPropertySubmission = {
  status: "idle",
  submittedAt: null,
  changes: [],
  configMarks: [],
  instruction: "",
  prompt: "",
  error: null,
};

function getChangeId(
  node: VisualNodeInfo,
  property: string,
  kind: VisualPropertyChangeKind,
): string {
  return `${node.domPath || node.nodeId}:${kind}:${property}`;
}

function getNodeSummary(node: VisualNodeInfo): string {
  const text = node.textContent ? ` 文本：${node.textContent}` : "";
  const cls = node.className ? ` class：${node.className}` : "";
  return `<${node.tagName}> ${node.domPath}${text}${cls}`;
}

function formatChangeValue(change: VisualPropertyChange): string {
  if (change.resource) {
    const parts = [
      change.resource.fileName ? `文件：${change.resource.fileName}` : null,
      change.resource.url ? `资源地址：${change.resource.url}` : null,
      change.resource.mimeType ? `类型：${change.resource.mimeType}` : null,
      typeof change.resource.size === "number" ? `大小：${change.resource.size} bytes` : null,
      change.resource.temporary ? "临时 data URL 预览，正式落地时请保存到项目资源目录" : null,
    ].filter(Boolean);
    return parts.join("；") || change.value;
  }
  if (change.value.startsWith("data:")) {
    return "临时 data URL 预览，正式落地时请保存到项目资源目录";
  }
  return change.value;
}

const LOCALIZE_IMAGE_INSTRUCTION_PATTERN =
  /(本地化|本地图片|下载到本地|保存到本地|改为本地|转成本地|不要用远程|不用远程|不要远程|远程\s*URL|remote\s*url|local\s+image)/i;

function shouldLocalizeSelectedImageForInstruction(instruction: string): boolean {
  return LOCALIZE_IMAGE_INSTRUCTION_PATTERN.test(instruction);
}

function createLocalizedImageChange(
  node: VisualNodeInfo,
  source: SelectedImageSource,
  asset: LocalizedImageAsset,
): VisualPropertyChange {
  return {
    id: getChangeId(node, "src", "attribute"),
    nodeId: node.nodeId,
    domPath: node.domPath,
    kind: "attribute",
    property: "src",
    label: "替换图片",
    value: asset.relativePathFromPage,
    previousValue: source.src || source.currentSrc || source.url,
    resource: {
      fileName: asset.workspacePath.split("/").pop(),
      mimeType: asset.mimeType,
      size: asset.size,
      url: asset.editPreviewUrl,
    },
  };
}

function upsertVisualPropertyChange(
  changes: VisualPropertyChange[],
  change: VisualPropertyChange,
): VisualPropertyChange[] {
  const index = changes.findIndex((item) => item.id === change.id);
  if (index === -1) return [...changes, change];
  const next = [...changes];
  next[index] = change;
  return next;
}

function formatLocalizedImagePromptContext(
  source: SelectedImageSource,
  asset: LocalizedImageAsset,
): string {
  return [
    "【已本地化资源】",
    "选中图片已在当前编辑会话中保存为项目本地资源：",
    `- 原始地址：${asset.originalUrl || source.url}`,
    `- 工作区路径：${asset.workspacePath}`,
    `- 页面引用路径：${asset.relativePathFromPage}`,
    `- 预览地址：${asset.editPreviewUrl}`,
    "请直接把最终选中元素的 src 改为上述页面引用路径；不要再调用 saveImage 下载这个远程 URL。",
  ].join("\n");
}

function formatVisualConfigMarkForPrompt(
  mark: VisualConfigMark,
  index: number,
  fallbackReason?: string,
): string {
  const reason = fallbackReason ? `，直接写回结果：${fallbackReason}` : "";
  return `${index + 1}. ${mark.label} -> ${mark.scope === "project" ? "项目级" : "页面级"}配置项，名称：${mark.fieldTitle}，key：${mark.fieldKey}，默认值：${mark.defaultValue}，分类：${mark.category?.trim() || "未设置"}${reason}`;
}

function canDirectApplyPrototypeConfigMark(
  mark: VisualConfigMark,
  applyPrototypeVisualConfig: UseVisualEditStateParams["applyPrototypeVisualConfig"],
): boolean {
  return mark.scope === "page" && !!createPrototypeConfigTargetFromMark(mark) && !!applyPrototypeVisualConfig;
}

function resolveVisualDraftActionState(params: {
  isPrototypePage: boolean;
  pendingPropertyChanges: VisualPropertyChange[];
  pendingConfigMarks: VisualConfigMark[];
  hasPendingInstruction: boolean;
  canRetrySubmission: boolean;
  prototypePropertyApplyStatus: Record<string, PrototypePropertyApplyStatus>;
  applyPrototypeVisualConfig: UseVisualEditStateParams["applyPrototypeVisualConfig"];
}): VisualDraftActionState | null {
  const count =
    params.pendingPropertyChanges.length +
    params.pendingConfigMarks.length +
    (params.hasPendingInstruction ? 1 : 0);
  if (count === 0 && !params.canRetrySubmission) return null;

  const needsAi =
    params.canRetrySubmission ||
    params.hasPendingInstruction ||
    !params.isPrototypePage ||
    params.pendingPropertyChanges.some(
      (change) => params.prototypePropertyApplyStatus[change.id]?.ok !== true,
    ) ||
    params.pendingConfigMarks.some(
      (mark) => !canDirectApplyPrototypeConfigMark(mark, params.applyPrototypeVisualConfig),
    );

  return {
    count: params.canRetrySubmission && count === 0 ? 1 : count,
    kind: needsAi ? "send" : "save",
    label: needsAi ? "发送给AI" : "保存",
  };
}

export function buildVisualSelectionPrompt(
  node: VisualNodeInfo,
  projectId: string,
): string {
  return `请只针对当前可视化选区提出修改建议，不要静默扩大范围。

【当前选区】
- 元素：<${node.tagName}>
- DOM 路径：${node.domPath}
- className：${node.className || "无"}
- 文本：${node.textContent || "无"}
- 页面文件：demos/${projectId}/index.tsx

请给出可审阅的局部修改建议；如果必须修改选区外代码，请明确说明影响范围。`;
}

function getChangeSignature(change: VisualPropertyChange): string {
  return JSON.stringify({
    id: change.id,
    nodeId: change.nodeId,
    domPath: change.domPath,
    kind: change.kind,
    property: change.property,
    label: change.label,
    value: change.value,
    previousValue: change.previousValue ?? null,
    resource: change.resource ?? null,
  });
}

function getConfigMarkSignature(mark: VisualConfigMark): string {
  return JSON.stringify({
    changeId: mark.changeId,
    nodeId: mark.nodeId,
    domPath: mark.domPath,
    property: mark.property,
    kind: mark.kind,
    label: mark.label,
    fieldTitle: mark.fieldTitle,
    fieldKey: mark.fieldKey,
    defaultValue: mark.defaultValue,
    category: mark.category ?? "",
    scope: mark.scope,
  });
}

function getPendingVisualPropertyChanges(
  changes: VisualPropertyChange[],
  submission: VisualPropertySubmission,
): VisualPropertyChange[] {
  if (submission.status === "idle") return changes;
  const submittedById = new Map(
    submission.changes.map((change) => [change.id, getChangeSignature(change)]),
  );
  return changes.filter(
    (change) => submittedById.get(change.id) !== getChangeSignature(change),
  );
}

function getPendingVisualConfigMarks(
  marks: VisualConfigMark[],
  submission: VisualPropertySubmission,
): VisualConfigMark[] {
  if (submission.status === "idle") return marks;
  const submittedByChangeId = new Map(
    submission.configMarks.map((mark) => [
      mark.changeId,
      getConfigMarkSignature(mark),
    ]),
  );
  return marks.filter(
    (mark) =>
      submittedByChangeId.get(mark.changeId) !== getConfigMarkSignature(mark),
  );
}

function mergeSubmittedChanges(
  previous: VisualPropertyChange[],
  changes: VisualPropertyChange[],
): VisualPropertyChange[] {
  const next = new Map(previous.map((change) => [change.id, change]));
  for (const change of changes) {
    next.set(change.id, change);
  }
  return Array.from(next.values());
}

function mergeSubmittedConfigMarks(
  previous: VisualConfigMark[],
  marks: VisualConfigMark[],
): VisualConfigMark[] {
  const next = new Map(previous.map((mark) => [mark.changeId, mark]));
  for (const mark of marks) {
    next.set(mark.changeId, mark);
  }
  return Array.from(next.values());
}

function createPrototypeConfigTargetFromMark(
  mark: VisualConfigMark,
): PrototypeVisualConfigTarget | null {
  if (mark.kind === "text" || mark.property === "textContent") {
    return {
      kind: "text",
      fieldKey: mark.fieldKey.trim(),
      title: mark.fieldTitle.trim(),
      defaultValue: mark.defaultValue,
      category: mark.category?.trim(),
    };
  }
  if (mark.kind === "attribute" && mark.property === "src") {
    return {
      kind: "image",
      fieldKey: mark.fieldKey.trim(),
      title: mark.fieldTitle.trim(),
      defaultValue: mark.defaultValue,
      category: mark.category?.trim(),
    };
  }
  if (
    mark.kind === "style" &&
    (mark.property === "color" ||
      mark.property === "backgroundColor" ||
      mark.property === "borderColor")
  ) {
    return {
      kind: "color",
      fieldKey: mark.fieldKey.trim(),
      title: mark.fieldTitle.trim(),
      defaultValue: mark.defaultValue,
      category: mark.category?.trim(),
      colorProperty: mark.property,
    };
  }
  return null;
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
  runtimeType?: string;
  applyDemoSnapshot: ApplyDemoSnapshotFn;
  markWorkspaceChanged: () => void;
  setConfigDataMap: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, unknown>>>
  >;
  setTabValue: React.Dispatch<React.SetStateAction<string>>;
  setTriggerAutoSend: React.Dispatch<React.SetStateAction<string | AutoRepairTrigger | VisualPropertyAutoSend | null>>;
  isPrototypeVisualPage?: () => boolean;
  applyPrototypeVisualPropertyChange?: (
    node: VisualNodeInfo,
    property: string,
    value: string,
    kind: VisualPropertyChangeKind,
  ) => boolean;
  applyPrototypeVisualConfig?: (params: {
    node: VisualNodeInfo;
    target: PrototypeVisualConfigTarget;
  }) => PrototypeVisualConfigResult;
}

export function useVisualEditState(params: UseVisualEditStateParams) {
  const {
    codeRef,
    schemaRef,
    projectConfigSchema,
    activeDemoIdRef,
    sessionId,
    activeDemoId,
    runtimeType,
    applyDemoSnapshot,
    markWorkspaceChanged,
    setConfigDataMap,
    setTabValue,
    setTriggerAutoSend,
    isPrototypeVisualPage,
    applyPrototypeVisualPropertyChange,
    applyPrototypeVisualConfig,
  } = params;
  const { toast } = useToast();

  const [visualAnnotationMode, setVisualAnnotationMode] = useState(false);
  const [selectedVisualNode, setSelectedVisualNode] =
    useState<VisualNodeInfo | null>(null);
  const [visualNodeStack, setVisualNodeStack] = useState<VisualNodeInfo[]>([]);
  const [visualPanelHoverNodeId, setVisualPanelHoverNodeId] = useState<string | null>(null);
  const [visualPropertyChanges, setVisualPropertyChanges] = useState<
    VisualPropertyChange[]
  >([]);
  const [visualConfigMarks, setVisualConfigMarks] = useState<VisualConfigMark[]>([]);
  const [
    prototypePropertyApplyStatus,
    setPrototypePropertyApplyStatus,
  ] = useState<Record<string, PrototypePropertyApplyStatus>>({});
  const [visualAiInstruction, setVisualAiInstruction] = useState("");
  const [visualPropertySubmission, setVisualPropertySubmission] =
    useState<VisualPropertySubmission>(EMPTY_VISUAL_PROPERTY_SUBMISSION);
  const [visualPropertySending, setVisualPropertySending] = useState(false);
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
  const [visualConfigCategory, setVisualConfigCategory] = useState("");
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
  const visualPendingPropertyChanges = useMemo(
    () =>
      getPendingVisualPropertyChanges(
        visualPropertyChanges,
        visualPropertySubmission,
      ),
    [visualPropertyChanges, visualPropertySubmission],
  );
  const visualPendingConfigMarks = useMemo(
    () => getPendingVisualConfigMarks(visualConfigMarks, visualPropertySubmission),
    [visualConfigMarks, visualPropertySubmission],
  );
  const hasPendingVisualAiInstruction = visualAiInstruction.trim().length > 0;
  const canRetryVisualPropertySubmission =
    visualPropertySubmission.status === "failed" &&
    visualPropertySubmission.prompt.trim().length > 0;
  const visualDraftAction = useMemo(
    () =>
      resolveVisualDraftActionState({
        isPrototypePage: isPrototypeVisualPage?.() ?? false,
        pendingPropertyChanges: visualPendingPropertyChanges,
        pendingConfigMarks: visualPendingConfigMarks,
        hasPendingInstruction: hasPendingVisualAiInstruction,
        canRetrySubmission: canRetryVisualPropertySubmission,
        prototypePropertyApplyStatus,
        applyPrototypeVisualConfig,
      }),
    [
      applyPrototypeVisualConfig,
      canRetryVisualPropertySubmission,
      hasPendingVisualAiInstruction,
      isPrototypeVisualPage,
      prototypePropertyApplyStatus,
      visualPendingConfigMarks,
      visualPendingPropertyChanges,
    ],
  );

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
      setVisualConfigCategory("");
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
    (node: VisualNodeInfo | null, nodeStack?: VisualNodeInfo[]) => {
      const nextStack = nodeStack ?? (node ? [node] : []);
      setSelectedVisualNode(node);
      setVisualNodeStack(nextStack);
      setVisualPanelHoverNodeId((current) => (current === null ? current : null));
      if (!node) return;

      if (visualConfigMode) {
        initializeVisualConfigDialog(node);
      }
    },
    [initializeVisualConfigDialog, visualConfigMode],
  );

  const handleVisualStackSelect = useCallback((node: VisualNodeInfo) => {
    setSelectedVisualNode(node);
    setVisualPanelHoverNodeId((current) => (current === null ? current : null));
  }, []);

  const handleVisualPropertyChange = useCallback(
    (
      node: VisualNodeInfo,
      property: string,
      label: string,
      value: string,
      kind: VisualPropertyChangeKind = "style",
      previousValue?: string,
      resource?: VisualPropertyChange["resource"],
    ) => {
      const id = getChangeId(node, property, kind);
      const change: VisualPropertyChange = {
        id,
        nodeId: node.nodeId,
        domPath: node.domPath,
        kind,
        property,
        label,
        value,
        previousValue,
        resource,
      };
      setVisualPropertyChanges((prev) => {
        const index = prev.findIndex((item) => item.id === id);
        if (index === -1) return [...prev, change];
        const next = [...prev];
        next[index] = change;
        return next;
      });
      if (isPrototypeVisualPage?.()) {
        const applied = applyPrototypeVisualPropertyChange?.(node, property, value, kind) ?? false;
        setPrototypePropertyApplyStatus((prev) => ({
          ...prev,
          [id]: applied
            ? { ok: true }
            : { ok: false, error: "原型页属性无法直接写回，已准备交给 AI 处理" },
        }));
      } else {
        setPrototypePropertyApplyStatus((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [applyPrototypeVisualPropertyChange, isPrototypeVisualPage],
  );

  const handleRestoreVisualProperty = useCallback((changeId: string) => {
    setVisualPropertyChanges((prev) => prev.filter((item) => item.id !== changeId));
    setVisualConfigMarks((prev) => prev.filter((item) => item.changeId !== changeId));
    setPrototypePropertyApplyStatus((prev) => {
      if (!(changeId in prev)) return prev;
      const next = { ...prev };
      delete next[changeId];
      return next;
    });
  }, []);

  const handleClearVisualProperties = useCallback(() => {
    if (
      visualPropertySubmission.status === "queued" ||
      visualPropertySubmission.status === "sending" ||
      visualPropertySubmission.status === "sent"
    ) {
      setVisualPropertyChanges(visualPropertySubmission.changes);
      setVisualConfigMarks(visualPropertySubmission.configMarks);
      setVisualAiInstruction("");
      return;
    }

    setVisualPropertyChanges([]);
    setVisualConfigMarks([]);
    setPrototypePropertyApplyStatus({});
    setVisualAiInstruction("");
    setVisualPropertySubmission(EMPTY_VISUAL_PROPERTY_SUBMISSION);
  }, [visualPropertySubmission]);

  const handleClearSelectedVisualProperties = useCallback(() => {
    if (!selectedVisualNode) return;
    const selectedDomPath = selectedVisualNode.domPath;
    const selectedNodeId = selectedVisualNode.nodeId;
    const isSelectedNodeChange = (item: { domPath: string; nodeId: string }) =>
      item.domPath === selectedDomPath || item.nodeId === selectedNodeId;

    setVisualPropertyChanges((prev) =>
      prev.filter((item) => !isSelectedNodeChange(item)),
    );
    setVisualConfigMarks((prev) =>
      prev.filter((item) => !isSelectedNodeChange(item)),
    );
  }, [selectedVisualNode]);

  const handleMarkVisualConfig = useCallback(
    (
      node: VisualNodeInfo,
      property: string,
      label: string,
      value: string,
      kind: VisualPropertyChangeKind = "style",
    ) => {
      const changeId = getChangeId(node, property, kind);
      const usedKeys = getSchemaPropertyKeys(schemaRef.current, projectConfigSchema);
      const fieldTitle = label;
      const mark: VisualConfigMark = {
        id: createVisualId("config-mark"),
        changeId,
        nodeId: node.nodeId,
        domPath: node.domPath,
        kind,
        property,
        label,
        fieldTitle,
        fieldKey: suggestVisualConfigFieldKey(fieldTitle, usedKeys),
        defaultValue: value,
        category: "",
        scope: "page",
      };
      setVisualConfigMarks((prev) => {
        const index = prev.findIndex((item) => item.changeId === changeId);
        if (index === -1) return [...prev, mark];
        const next = [...prev];
        next[index] = { ...prev[index], ...mark, id: prev[index].id };
        return next;
      });
    },
    [projectConfigSchema, schemaRef],
  );

  const handleUpdateVisualConfigMark = useCallback(
    (markId: string, patch: Partial<Pick<VisualConfigMark, "fieldTitle" | "fieldKey" | "defaultValue" | "category" | "scope">>) => {
      setVisualConfigMarks((prev) =>
        prev.map((item) => (item.id === markId ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const handleRemoveVisualConfigMark = useCallback((markId: string) => {
    setVisualConfigMarks((prev) => prev.filter((item) => item.id !== markId));
  }, []);

  const handleSendVisualPropertiesToAI = useCallback(
    async (singleChange?: VisualPropertyChange) => {
      const retryingFailedSubmission =
        !singleChange &&
        visualPropertySubmission.status === "failed" &&
        visualPendingPropertyChanges.length === 0 &&
        visualPendingConfigMarks.length === 0 &&
        !visualAiInstruction.trim();
      const changes = singleChange
        ? [singleChange]
        : retryingFailedSubmission
          ? visualPropertySubmission.changes
          : visualPendingPropertyChanges;
      const configMarks = retryingFailedSubmission
        ? visualPropertySubmission.configMarks
        : visualPendingConfigMarks;
      const instruction = visualAiInstruction.trim();
      const instructionForPrompt = retryingFailedSubmission
        ? visualPropertySubmission.instruction
        : instruction;
      if (!selectedVisualNode && changes.length === 0 && !instructionForPrompt) {
        toast({ title: "请先在预览区选择一个元素" });
        return;
      }
      if (changes.length === 0 && configMarks.length === 0 && !instructionForPrompt) {
        toast({ title: "请先修改属性或填写补充说明" });
        return;
      }

      const isPrototypePage = isPrototypeVisualPage?.() ?? false;
      let effectiveInstructionForPrompt = instructionForPrompt;
      let changesForSubmission = changes;
      let localizedImagePromptContext = "";
      const wantsImageLocalization =
        !retryingFailedSubmission &&
        !singleChange &&
        shouldLocalizeSelectedImageForInstruction(instructionForPrompt);

      if (wantsImageLocalization) {
        const imageSource = getSelectedImageSource(selectedVisualNode);
        if (!selectedVisualNode || !imageSource) {
          toast({
            title: "当前选中元素没有图片地址",
            description: "请先选中预览区中的图片元素，再发送本地化指令。",
            variant: "destructive",
          });
          return;
        }

        if (isProjectLocalImageReference(imageSource.url)) {
          localizedImagePromptContext = [
            "【已本地化资源】",
            `当前选中图片已经引用本地资源：${imageSource.url}`,
            "请不要再下载远程 URL；如果源码仍有远程地址，只把选中元素的 src 改为这个本地路径。",
          ].join("\n");
          effectiveInstructionForPrompt = "";
          if (changes.length === 0 && configMarks.length === 0) {
            setVisualPropertySubmission({
              status: "sent",
              submittedAt: Date.now(),
              changes: visualPropertyChanges,
              configMarks: visualConfigMarks,
              instruction: "",
              prompt: "",
              error: null,
            });
            setVisualAiInstruction("");
            toast({ title: "当前图片已经是本地资源" });
            return;
          }
        } else {
          setVisualPropertySending(true);
          try {
            const localized = await localizeSelectedImageAsset({
              sessionId,
              selectedNode: selectedVisualNode,
              pageId: activeDemoIdRef.current,
              runtimeType,
            });
            const localizedChange = createLocalizedImageChange(
              selectedVisualNode,
              imageSource,
              localized,
            );
            localizedImagePromptContext = formatLocalizedImagePromptContext(
              imageSource,
              localized,
            );

            if (
              isPrototypePage &&
              applyPrototypeVisualPropertyChange?.(
                selectedVisualNode,
                "src",
                localized.relativePathFromPage,
                "attribute",
              )
            ) {
              changesForSubmission = upsertVisualPropertyChange(
                changesForSubmission,
                localizedChange,
              );
              setPrototypePropertyApplyStatus((prev) => ({
                ...prev,
                [localizedChange.id]: { ok: true },
              }));
              setVisualPropertyChanges((prev) =>
                upsertVisualPropertyChange(prev, localizedChange),
              );
              effectiveInstructionForPrompt = "";
              setVisualPropertySending(false);
              toast({ title: "图片已保存为本地资源" });
            } else {
              changesForSubmission = upsertVisualPropertyChange(
                changesForSubmission,
                localizedChange,
              );
              effectiveInstructionForPrompt =
                "把选中图片 src 改为已本地化资源的页面引用路径。";
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "无法本地化当前图片，需要上传原图";
            setVisualPropertySubmission({
              status: "failed",
              submittedAt: Date.now(),
              changes: visualPropertyChanges,
              configMarks: visualConfigMarks,
              instruction: instructionForPrompt,
              prompt: "",
              error: message,
            });
            setVisualPropertySending(false);
            toast({
              title: "图片本地化失败",
              description: message,
              variant: "destructive",
            });
            return;
          }
        }
      }

      const fallbackReasonsByChangeId = new Map<string, string>();
      const fallbackReasonsByMarkId = new Map<string, string>();
      let changesForAi = changesForSubmission;
      let configMarksForAi = configMarks;
      const directAppliedChangeLines: string[] = [];
      const directAppliedConfigLines: string[] = [];
      const directConfigPatch: Record<string, unknown> = {};

      if (isPrototypePage) {
        changesForAi = changesForSubmission.filter((change) => {
          const status = prototypePropertyApplyStatus[change.id];
          if (status?.ok) {
            directAppliedChangeLines.push(
              `${directAppliedChangeLines.length + 1}. ${change.label}（${change.kind}:${change.property}）已直接写回原型 HTML，值：${formatChangeValue(change)}`,
            );
            return false;
          }
          fallbackReasonsByChangeId.set(
            change.id,
            status?.error || "原型页属性没有可确认的直接写回结果",
          );
          return true;
        });

        const fallbackMarks: VisualConfigMark[] = [];
        for (const mark of configMarks) {
          const target = createPrototypeConfigTargetFromMark(mark);
          let fallbackReason: string | null = null;
          if (mark.scope !== "page") {
            fallbackReason = "原型页直接写回暂不支持项目级配置项";
          } else if (!target) {
            fallbackReason = "原型页直接写回只支持文本、图片和颜色配置项";
          } else if (!applyPrototypeVisualConfig) {
            fallbackReason = "原型页配置写回入口不可用";
          } else {
            const result = applyPrototypeVisualConfig({
              node: {
                nodeId: mark.nodeId,
                domPath: mark.domPath,
                tagName: "div",
                rect: { x: 0, y: 0, width: 0, height: 0 },
                editCapabilities: [],
              },
              target,
            });
            if (result.ok) {
              Object.assign(directConfigPatch, result.configPatch);
              directAppliedConfigLines.push(
                `${directAppliedConfigLines.length + 1}. ${mark.label} -> 页面级配置项 ${mark.fieldKey} 已直接写入 prototype.html 与 config.schema.json`,
              );
              continue;
            }
            fallbackReason = result.error;
          }

          fallbackMarks.push(mark);
          fallbackReasonsByMarkId.set(mark.id, fallbackReason);
        }
        configMarksForAi = fallbackMarks;

        if (Object.keys(directConfigPatch).length > 0) {
          setConfigDataMap((prev) => {
            const pageId = activeDemoIdRef.current;
            return {
              ...prev,
              [pageId]: {
                ...(prev[pageId] ?? {}),
                ...directConfigPatch,
              },
            };
          });
        }

        if (
          changesForAi.length === 0 &&
          configMarksForAi.length === 0 &&
          !effectiveInstructionForPrompt
        ) {
          setVisualPropertySubmission({
            status: "sent",
            submittedAt: Date.now(),
            changes: singleChange
              ? mergeSubmittedChanges(visualPropertySubmission.changes, changesForSubmission)
              : changesForSubmission,
            configMarks: visualConfigMarks,
            instruction: "",
            prompt: "",
            error: null,
          });
          setVisualAiInstruction("");
          return;
        }
      }

      setVisualPropertySending(true);
      const stackContext = visualNodeStack.length
        ? visualNodeStack.map((node, index) => `${index + 1}. ${getNodeSummary(node)}`).join("\n")
        : selectedVisualNode
          ? getNodeSummary(selectedVisualNode)
          : "无";
      const changeContext =
        changesForAi.length > 0
          ? changesForAi
              .map(
                (change, index) =>
                  `${index + 1}. ${change.label}（${change.kind}:${change.property}）：${change.previousValue ?? "未设置"} -> ${formatChangeValue(change)}${fallbackReasonsByChangeId.has(change.id) ? `；直接写回结果：${fallbackReasonsByChangeId.get(change.id)}` : ""}`,
              )
              .join("\n")
        : "无明确属性变更";
      const configContext =
        configMarksForAi.length > 0
          ? configMarksForAi
              .map((mark, index) =>
                formatVisualConfigMarkForPrompt(
                  mark,
                  index,
                  fallbackReasonsByMarkId.get(mark.id),
                ),
              )
              .join("\n")
          : "无";
      const directApplyContext =
        isPrototypePage &&
        (directAppliedChangeLines.length > 0 || directAppliedConfigLines.length > 0)
          ? [
              "【已直接写回的原型页变更】",
              directAppliedChangeLines.length > 0
                ? ["属性变更：", ...directAppliedChangeLines].join("\n")
                : "",
              directAppliedConfigLines.length > 0
                ? ["配置项：", ...directAppliedConfigLines].join("\n")
                : "",
              "请不要重复改写上述已落盘内容，只处理下面仍需 AI 处理的部分。",
            ]
              .filter(Boolean)
              .join("\n\n")
          : "";
      const pageFileHint = isPrototypePage
        ? `页面运行时：HTML/CSS 原型页
主要文件：demos/${activeDemoIdRef.current}/prototype.html、prototype.css、config.schema.json`
        : `页面文件：demos/${activeDemoIdRef.current}/index.tsx`;
      const prompt = `请根据右侧属性面板中的结构化变更修改当前页面。

${pageFileHint}

${directApplyContext}

${localizedImagePromptContext}

【点击位置图层】
${stackContext}

【最终选中元素】
${selectedVisualNode ? getNodeSummary(selectedVisualNode) : "无"}

【属性变更】
${changeContext}

【需要设为配置项的属性】
${configContext}

【补充说明】
${effectiveInstructionForPrompt || "无"}

请优先只修改当前页面相关代码。临时预览已经在 iframe 中验证，但不要把它视为已写回源码；如果新增配置项，请同步处理页面 Schema、默认值和预览数据。`;

      setTabValue("ai");
      const pendingCount = changesForAi.length + configMarksForAi.length;
      const selectedNodeLabel = selectedVisualNode
        ? `<${selectedVisualNode.tagName}> ${selectedVisualNode.textContent || selectedVisualNode.domPath}`
        : "当前页面";
      setTriggerAutoSend({
        kind: "visual_property",
        visibleTitle: "可视化修改已发送给 AI",
        visibleSummary: `${selectedNodeLabel} · ${pendingCount > 0 ? `${pendingCount} 项结构化变更` : "补充修改说明"}`,
        hiddenPrompt: prompt,
      });
      setVisualPropertySubmission((previous) => ({
        status: "queued",
        submittedAt: Date.now(),
        changes: retryingFailedSubmission
          ? previous.changes
          : singleChange
            ? mergeSubmittedChanges(previous.changes, changesForSubmission)
            : changesForSubmission,
        configMarks: retryingFailedSubmission
          ? previous.configMarks
          : singleChange
            ? mergeSubmittedConfigMarks(previous.configMarks, configMarks)
            : visualConfigMarks,
        instruction: effectiveInstructionForPrompt,
        prompt,
        error: null,
      }));
      setVisualAiInstruction("");
      setVisualPropertySending(false);
    },
    [
      activeDemoIdRef,
      applyPrototypeVisualConfig,
      applyPrototypeVisualPropertyChange,
      isPrototypeVisualPage,
      prototypePropertyApplyStatus,
      runtimeType,
      selectedVisualNode,
      sessionId,
      setConfigDataMap,
      setTabValue,
      setTriggerAutoSend,
      toast,
      visualAiInstruction,
      visualConfigMarks,
      visualNodeStack,
      visualPropertyChanges,
      visualPendingConfigMarks,
      visualPendingPropertyChanges,
      visualPropertySubmission,
    ],
  );

  const confirmDiscardVisualPropertyWork = useCallback(() => {
    const hasPending =
      visualPendingPropertyChanges.length > 0 ||
      visualPendingConfigMarks.length > 0 ||
      hasPendingVisualAiInstruction;
    if (!hasPending) return true;
    return window.confirm("当前有未发送的属性修改，确定丢弃并继续吗？");
  }, [
    hasPendingVisualAiInstruction,
    visualPendingConfigMarks.length,
    visualPendingPropertyChanges.length,
  ]);

  const handleVisualPropertyAutoSendHandled = useCallback(() => {
    setVisualPropertySubmission((previous) => {
      if (previous.status !== "queued") return previous;
      return { ...previous, error: null };
    });
  }, []);

  const handleVisualPropertySubmissionStreamingChange = useCallback(
    (isStreaming: boolean) => {
      setVisualPropertySubmission((previous) => {
        if (isStreaming) {
          if (previous.status === "queued") {
            return { ...previous, status: "sending", error: null };
          }
          return previous;
        }
        if (previous.status === "sending") {
          return { ...previous, status: "sent", error: null };
        }
        return previous;
      });
    },
    [],
  );

  const handleVisualPropertySubmissionFailed = useCallback((message: string) => {
    setVisualPropertySubmission((previous) => {
      if (previous.status === "idle") return previous;
      return { ...previous, status: "failed", error: message };
    });
  }, []);

  const handleStartVisualConfig = useCallback(() => {
    if (visualConfigMode) {
      setVisualConfigMode(false);
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
      return;
    }

    setVisualConfigMode(true);
    setVisualAnnotationMode(false);
    setSelectedVisualNode(null);
    setVisualConfigError(null);
  }, [visualConfigMode]);

  const handleApplyVisualConfig = useCallback(async () => {
    if (!visualConfigNode || !selectedVisualConfigCandidate) return;

    setVisualConfigApplying(true);
    setVisualConfigError(null);
    const target = {
      kind: selectedVisualConfigCandidate.kind,
      fieldKey: visualConfigFieldKey.trim(),
      title: visualConfigTitle.trim(),
      defaultValue: visualConfigDefaultValue,
      category: visualConfigCategory.trim(),
      colorProperty: selectedVisualConfigCandidate.colorProperty,
    };
    try {
      if (isPrototypeVisualPage?.() && applyPrototypeVisualConfig) {
        const data = applyPrototypeVisualConfig({
          node: visualConfigNode,
          target,
        });
        if (!data.ok) {
          throw new Error(data.error);
        }
        setConfigDataMap((prev) => {
          const pageId = activeDemoIdRef.current;
          return {
            ...prev,
            [pageId]: {
              ...(prev[pageId] ?? {}),
              ...data.configPatch,
            },
          };
        });
        markWorkspaceChanged();
        setVisualConfigNode(null);
        setSelectedVisualNode(null);
        toast({ title: "配置项已添加" });
        return;
      }

      const response = await fetch("/api/visual-configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeRef.current,
          schema: schemaRef.current,
          projectConfigSchema,
          demoId: activeDemoIdRef.current,
          node: visualConfigNode,
          target,
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
      const runtimeHint = isPrototypeVisualPage?.()
        ? `页面运行时：HTML/CSS 原型页
主要文件：demos/${activeDemoIdRef.current}/prototype.html、prototype.css、config.schema.json`
        : `页面文件：demos/${activeDemoIdRef.current}/index.tsx`;
      const prompt = `请为当前选中元素添加配置项。直接写回已尝试但未成功，请根据失败原因改写当前页面。

${runtimeHint}

【选中元素】
${getNodeSummary(visualConfigNode)}

【配置项】
- 类型：${target.kind}
- 字段标题：${target.title}
- 字段 key：${target.fieldKey}
- 默认值：${target.defaultValue}
- 分类：${target.category || "未设置"}
${target.colorProperty ? `- 颜色属性：${target.colorProperty}` : ""}

【直接写回失败原因】
${message}

请同步处理页面源码、页面 Schema 和默认配置数据；如果字段应改为项目级共享配置，请明确维护项目级 Schema 与当前页面消费方式。`;
      setTabValue("ai");
      setTriggerAutoSend(prompt);
      setVisualConfigError(`已交给 AI 处理：${message}`);
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
    } finally {
      setVisualConfigApplying(false);
    }
  }, [
    applyDemoSnapshot,
    applyPrototypeVisualConfig,
    codeRef,
    schemaRef,
    isPrototypeVisualPage,
    markWorkspaceChanged,
    projectConfigSchema,
    selectedVisualConfigCandidate,
    setTabValue,
    setTriggerAutoSend,
    toast,
    visualConfigCategory,
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
      setVisualConfigMode(false);
      setVisualConfigNode(null);
      setSelectedVisualNode(null);
      setVisualAnnotations((prev) => prev.filter((item) => item.resolved));
      return;
    }

    const next = !visualAnnotationMode;
    setVisualAnnotationMode(next);
    setVisualConfigMode(false);
    setVisualConfigNode(null);
    setSelectedVisualNode(null);
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
    const prompt = buildVisualSelectionPrompt(
      selectedVisualNode,
      activeDemoIdRef.current,
    );
    setTabValue("ai");
    setTriggerAutoSend(prompt);
  }, [selectedVisualNode, activeDemoIdRef, setTabValue, setTriggerAutoSend, toast]);

  return {
    // State
    visualAnnotationMode,
    setVisualAnnotationMode,
    selectedVisualNode,
    setSelectedVisualNode,
    visualNodeStack,
    setVisualNodeStack,
    visualPanelHoverNodeId,
    setVisualPanelHoverNodeId,
    visualPropertyChanges,
    setVisualPropertyChanges,
    visualConfigMarks,
    setVisualConfigMarks,
    visualAiInstruction,
    setVisualAiInstruction,
    visualPropertySubmission,
    setVisualPropertySubmission,
    visualPendingPropertyChanges,
    visualPendingConfigMarks,
    hasPendingVisualAiInstruction,
    canRetryVisualPropertySubmission,
    visualDraftAction,
    visualPropertySending,
    setVisualPropertySending,
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
    visualConfigCategory,
    setVisualConfigCategory,
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
    handleVisualStackSelect,
    handleVisualPropertyChange,
    handleRestoreVisualProperty,
    handleClearVisualProperties,
    handleClearSelectedVisualProperties,
    handleMarkVisualConfig,
    handleUpdateVisualConfigMark,
    handleRemoveVisualConfigMark,
    handleSendVisualPropertiesToAI,
    confirmDiscardVisualPropertyWork,
    handleVisualPropertyAutoSendHandled,
    handleVisualPropertySubmissionStreamingChange,
    handleVisualPropertySubmissionFailed,
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
