<script setup lang="ts">
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onErrorCaptured,
  onMounted,
  ref,
  shallowRef,
} from "vue";
import { parseSVGPath } from "@open-pencil/core";
import { EDITOR_TOOLS, createEditor } from "@open-pencil/core/editor";
import type { Fill, NodeType, SceneNode, Stroke, StyleRun } from "@open-pencil/core/scene-graph";
import {
  CanvasRoot,
  provideEditor,
  useCanvas,
  useCanvasContext,
  useCanvasDrop,
  useCanvasInput,
  useTextEdit,
} from "@open-pencil/vue";
import {
  OPENPENCIL_HOST_MESSAGE_TYPES,
  applySketchScenePatchOperations,
  createOpenPencilDirtyStateMessage,
  createOpenPencilDocumentLoadedMessage,
  createOpenPencilErrorMessage,
  createOpenPencilReadyMessage,
  createOpenPencilUiStateMessage,
  isOpenPencilEditCommand,
  isOpenPencilHostMessage,
  isOpenPencilUpdateNodeCommand,
} from "./adapter";
import type {
  OpenPencilCommandAvailability,
  OpenPencilEditCommand,
  OpenPencilEditorError,
  OpenPencilEditorMessage,
  OpenPencilInspectorNode,
  OpenPencilLayerItem,
  OpenPencilLoadDocumentMessage,
  OpenPencilTextSelectionRange,
  OpenPencilUpdateNodeCommand,
  SketchScenePatchOperation,
} from "./adapter";
import type {
  SketchSceneAsset,
  SketchSceneDocument,
  SketchSceneNode,
  SketchSceneNodeBindings,
  SketchSceneStyle,
  SketchSceneTextStyleOverride,
  SketchSceneTextStyleRun,
} from "@workbench/shared/demo/sketch-scene";

type OpenPencilColor = Fill["color"];

type OpenPencilDebugNode = {
  id: string;
  name: string;
  type: SceneNode["type"];
  parentId: string;
  hasVectorNetwork: boolean;
  hasImageFill: boolean;
  imageFillHash?: string;
  imageBytesAvailable: boolean;
  childCount: number;
};

type OpenPencilDebugState = {
  pageId?: string;
  layerCount: number;
  selectedNames: string[];
  selectedTextSelectionRange?: OpenPencilTextSelectionRange | null;
  commands: OpenPencilCommandAvailability;
  openPencilNodes: OpenPencilDebugNode[];
  exportedScene?: SketchSceneDocument | null;
  dirtyNotifyCount: number;
  dirtyPostCount: number;
  lastDirtyNodeCount: number | null;
  lastPatchOperationCount: number | null;
  lastPatchStatus: string | null;
  lastHostPostType: string | null;
  lastHostPostError: string | null;
  viewport: {
    width: number;
    height: number;
    panX: number;
    panY: number;
    zoom: number;
    pageFrame: {
      x: number;
      y: number;
      width: number;
      height: number;
      screenLeft: number;
      screenTop: number;
      screenRight: number;
      screenBottom: number;
    } | null;
  };
};

const PAGE_OFFSET = 80;
const DEFAULT_FILL = "#ffffff";
const DEFAULT_TEXT_COLOR = "#111827";
const DEFAULT_STROKE = "#d1d5db";
const SKETCH_PLUGIN_ID = "workbench-openpencil-spike";
const SKETCH_PLUGIN_KEYS = {
  role: "role",
  sketchNodeId: "sketchNodeId",
  sketchNodeType: "sketchNodeType",
  sketchText: "sketchText",
  sketchImageSrc: "sketchImageSrc",
  sketchImageAlt: "sketchImageAlt",
  sketchPath: "sketchPath",
  sketchPoints: "sketchPoints",
  sketchBindings: "sketchBindings",
  sketchMetadata: "sketchMetadata",
  sketchTextStyleRuns: "sketchTextStyleRuns",
} as const;
const CONTAINER_NODE_TYPES = new Set<NodeType>([
  "GROUP",
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "SECTION",
]);
const EXPORTABLE_DRAWN_NODE_TYPES = new Set<NodeType>([
  "RECTANGLE",
  "ROUNDED_RECTANGLE",
  "ELLIPSE",
  "LINE",
  "TEXT",
  "VECTOR",
]);

function normalizeSize(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/px$/, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

const hostDocument = ref<OpenPencilLoadDocumentMessage | null>(null);
const bridgeStatus = ref<"waiting" | "loaded" | "error">("waiting");
const editorError = ref<OpenPencilEditorError | null>(null);
const stateVersion = ref(0);
let statePollInterval: number | null = null;
let dirtyExportTimeout: number | null = null;
let suppressDirtyEvents = false;
let unsubscribeGraphEvents: (() => void) | null = null;
let pendingDirtyScene: SketchSceneDocument | null = null;
let dirtyNotifyCount = 0;
let dirtyPostCount = 0;
let lastDirtyNodeCount: number | null = null;
let lastPatchOperationCount: number | null = null;
let lastPatchStatus: string | null = null;
let lastHostPostType: string | null = null;
let lastHostPostError: string | null = null;
const editorWidth = computed(() =>
  normalizeSize(hostDocument.value?.previewSize?.width, 1440),
);
const editorHeight = computed(() =>
  normalizeSize(hostDocument.value?.previewSize?.height, 900),
);
let loadedDocumentKey = "";
const editor = shallowRef(
  createEditor({
    getViewportSize: () => ({
      width: editorWidth.value,
      height: editorHeight.value,
    }),
  }),
);

provideEditor(editor.value);

const WorkbenchCanvasSurface = defineComponent({
  name: "WorkbenchCanvasSurface",
  inheritAttrs: false,
  setup(_props, { attrs }) {
    const { canvasRef } = useCanvasContext();
    const localCanvasRef = ref<HTMLCanvasElement | null>(null);
    const canvas = useCanvas(localCanvasRef, editor.value);
    const input = useCanvasInput(
      localCanvasRef,
      editor.value,
      canvas.hitTestSectionTitle,
      canvas.hitTestComponentLabel,
      canvas.hitTestFrameTitle,
    );
    useTextEdit(localCanvasRef, editor.value);
    const drop = useCanvasDrop(localCanvasRef, editor.value);
    onMounted(() => {
      canvasRef.value = localCanvasRef.value;
    });
    onBeforeUnmount(() => {
      if (canvasRef.value === localCanvasRef.value) {
        canvasRef.value = null;
      }
    });
    return () =>
      h("canvas", {
        ...attrs,
        ref: localCanvasRef,
        "data-dragging": Boolean(input.drag.value || drop.isDraggingOver.value),
      });
  },
});

const tools = EDITOR_TOOLS;
const activeTool = computed(() => {
  stateVersion.value;
  return editor.value.state.activeTool;
});
const importedLayerCount = computed(() => {
  stateVersion.value;
  const page = editor.value.getPages()[0];
  if (!page) return 0;
  return countDescendants(page.id);
});

const editMenu = [
  { id: "undo", label: "Undo", command: "undo" },
  { id: "redo", label: "Redo", command: "redo" },
  { id: "duplicate", label: "Duplicate", command: "duplicate-selection" },
  { id: "group", label: "Group", command: "group-selection" },
  { id: "ungroup", label: "Ungroup", command: "ungroup-selection" },
  { id: "delete", label: "Delete", command: "delete-selection" },
  { id: "zoom-to-selection", label: "Zoom Sel", command: "zoom-to-selection" },
] satisfies Array<{ id: string; label: string; command: OpenPencilEditCommand["type"] }>;

function postToHost(rawMessage: OpenPencilEditorMessage) {
  const message = cloneForPostMessage({
    pageId: hostDocument.value?.pageId,
    ...rawMessage,
  });
  if (!message) return;
  try {
    window.parent?.postMessage(message, "*");
    lastHostPostType = message.type;
    lastHostPostError = null;
  } catch (error) {
    lastHostPostType = message.type;
    lastHostPostError = error instanceof Error ? error.message : String(error);
  }
}

function reportOpenPencilError(error: OpenPencilEditorError) {
  editorError.value = error;
  bridgeStatus.value = "error";
  stateVersion.value += 1;
  postToHost(createOpenPencilErrorMessage({ error }));
  postUiState();
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function getErrorDetail(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === "string") return error;
  return undefined;
}

function handleRuntimeError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);
  const lowerMessage = message.toLowerCase();
  const resourceFailure =
    lowerMessage.includes("canvaskit") ||
    lowerMessage.includes("wasm") ||
    lowerMessage.includes("font");
  reportOpenPencilError({
    code: resourceFailure ? "resource-load-failed" : "runtime-error",
    message,
    detail: getErrorDetail(error),
    recoverable: resourceFailure,
  });
}

function cloneForPostMessage<T>(value: T): T | null {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    lastHostPostError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

function pluginData(key: string, value: string): SceneNode["pluginData"][number] {
  return {
    pluginId: SKETCH_PLUGIN_ID,
    key,
    value,
  };
}

function optionalPluginData(key: string, value: string | undefined): SceneNode["pluginData"] {
  return value ? [pluginData(key, value)] : [];
}

function optionalJsonPluginData(key: string, value: unknown): SceneNode["pluginData"] {
  if (value === undefined) return [];
  try {
    return [pluginData(key, JSON.stringify(value))];
  } catch {
    return [];
  }
}

function getPluginDataValue(node: SceneNode, key: string): string | undefined {
  return node.pluginData.find((entry) => entry.pluginId === SKETCH_PLUGIN_ID && entry.key === key)?.value;
}

function withPluginDataValue(
  node: SceneNode,
  key: string,
  value: string | undefined,
): SceneNode["pluginData"] {
  return withPluginDataEntry(node.pluginData, key, value);
}

function withPluginDataEntry(
  entries: SceneNode["pluginData"],
  key: string,
  value: string | undefined,
): SceneNode["pluginData"] {
  const retained = entries.filter(
    (entry) => !(entry.pluginId === SKETCH_PLUGIN_ID && entry.key === key),
  );
  return value === undefined ? retained : [...retained, pluginData(key, value)];
}

function getDebugScope() {
  return globalThis as typeof globalThis & {
    __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    __OPENPENCIL_SPIKE_DEBUG_SELECT_TEXT_WORD__?: (
      nodeNameOrId: string,
      characterIndex: number,
    ) => boolean;
    __OPENPENCIL_SPIKE_DEBUG_OVERRIDE_TEXT_SELECTION_RANGE__?: (
      range: unknown,
    ) => boolean;
  };
}

function countDescendants(parentId: string): number {
  let count = 0;
  for (const child of editor.value.getChildren(parentId)) {
    count += 1 + countDescendants(child.id);
  }
  return count;
}

function collectDebugNodes(parentId: string): OpenPencilDebugNode[] {
  return editor.value.getChildren(parentId).flatMap((node) => {
    const childCount = editor.value.getChildren(node.id).length;
    const imageFill = node.fills.find((fill) => fill.type === "IMAGE" && fill.imageHash);
    return [
      {
        id: node.id,
        name: node.name,
        type: node.type,
        parentId,
        hasVectorNetwork: Boolean(node.vectorNetwork),
        hasImageFill: Boolean(imageFill),
        imageFillHash: imageFill?.imageHash,
        imageBytesAvailable: Boolean(imageFill?.imageHash && editor.value.getImage(imageFill.imageHash)),
        childCount,
      },
      ...collectDebugNodes(node.id),
    ];
  });
}

function buildDebugViewport(): OpenPencilDebugState["viewport"] {
  const page = editor.value.getPages()[0];
  const frame = page ? getSketchPageFrame(page.id) : undefined;
  const { panX, panY, zoom } = editor.value.state;
  return {
    width: editorWidth.value,
    height: editorHeight.value,
    panX,
    panY,
    zoom,
    pageFrame: frame
      ? {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          screenLeft: frame.x * zoom + panX,
          screenTop: frame.y * zoom + panY,
          screenRight: (frame.x + frame.width) * zoom + panX,
          screenBottom: (frame.y + frame.height) * zoom + panY,
        }
      : null,
  };
}

function findOpenPencilNodeByNameOrId(nodeNameOrId: string): SceneNode | undefined {
  const stack = editor.value.getPages();
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) continue;
    if (node.id === nodeNameOrId || node.name === nodeNameOrId) return node;
    stack.push(...editor.value.getChildren(node.id));
  }
  return undefined;
}

function selectDebugTextWord(nodeNameOrId: string, characterIndex: number): boolean {
  const node = findOpenPencilNodeByNameOrId(nodeNameOrId);
  if (!node || node.type !== "TEXT" || !node.text) return false;
  editor.value.select([node.id]);
  editor.value.startTextEditing(node.id);
  const textEditor = editor.value.textEditor;
  if (!textEditor) return false;
  const index = Math.max(0, Math.min(node.text.length - 1, Math.floor(characterIndex)));
  textEditor.selectWord(index);
  editor.value.requestRender();
  stateVersion.value += 1;
  postUiState();
  return Boolean(readActiveTextEditorSelectionRange(node));
}

function collectUiLayers(parentId: string, level = 0): OpenPencilLayerItem[] {
  const selectedIds = new Set(editor.value.state.selectedIds);
  return editor.value.getChildren(parentId).flatMap((node) => {
    const children = editor.value.getChildren(node.id);
    return [
      {
        id: node.id,
        name: node.name || node.type || node.id,
        type: node.type,
        level,
        selected: selectedIds.has(node.id),
        childCount: children.length,
      },
      ...collectUiLayers(node.id, level + 1),
    ];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function normalizeTextRange(start: unknown, end: unknown): { start: number; end: number } | null {
  if (typeof start !== "number" || typeof end !== "number") return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.floor(Math.min(start, end)),
    end: Math.floor(Math.max(start, end)),
  };
}

function readNumericTextRange(value: unknown): { start: number; end: number } | null {
  if (Array.isArray(value)) {
    return normalizeTextRange(value[0], value[1]);
  }
  const record = asRecord(value);
  if (!record) return null;
  const start =
    record.start ??
    record.selectionStart ??
    record.from ??
    record.anchor ??
    record.cursor;
  const end =
    record.end ??
    record.selectionEnd ??
    record.to ??
    record.focus ??
    record.selectionAnchor;
  return normalizeTextRange(start, end);
}

function readActiveTextEditorSelectionRange(node: SceneNode): { start: number; end: number } | null {
  const textEditor = editor.value.textEditor as unknown;
  const textEditorRecord = asRecord(textEditor);
  if (!textEditorRecord || textEditorRecord.nodeId !== node.id) return null;
  const getSelectionRange = textEditorRecord.getSelectionRange;
  if (typeof getSelectionRange !== "function") return null;
  try {
    return readNumericTextRange(getSelectionRange.call(textEditor));
  } catch {
    return null;
  }
}

function overrideDebugTextSelectionRange(range: unknown): boolean {
  const selected = editor.value.getSelectedNodes()[0];
  if (!selected || selected.type !== "TEXT") return false;
  editor.value.startTextEditing(selected.id);
  const textEditor = asRecord(editor.value.textEditor);
  if (!textEditor || textEditor.nodeId !== selected.id) return false;
  textEditor.getSelectionRange = () => range;
  editor.value.requestRender();
  stateVersion.value += 1;
  postUiState();
  return true;
}

function readCanvasTextSelectionRange(
  node: SceneNode,
): OpenPencilTextSelectionRange | undefined {
  if (node.type !== "TEXT" || !node.text) return undefined;
  const editorState = asRecord(editor.value.state);
  const candidateRange =
    readActiveTextEditorSelectionRange(node) ??
    readNumericTextRange(editorState?.textSelectionRange) ??
    readNumericTextRange(editorState?.textSelection) ??
    readNumericTextRange(editorState?.selectedTextRange) ??
    readNumericTextRange(asRecord(editorState?.textEditor)?.selection);
  if (!candidateRange) return undefined;
  const length = node.text.length;
  const start = Math.max(0, Math.min(length, candidateRange.start));
  const end = Math.max(0, Math.min(length, candidateRange.end));
  if (end <= start) return undefined;
  return { start, end, source: "canvas" };
}

function buildInspectorNode(node: SceneNode | undefined, frame: SceneNode | undefined): OpenPencilInspectorNode | null {
  if (!node) return null;
  const firstFill = node.fills.find((fill) => fill.visible);
  const firstStroke = node.strokes.find((stroke) => stroke.visible);
  const role = getPluginDataValue(node, SKETCH_PLUGIN_KEYS.role);
  const sketchType = normalizeExportedSketchType(node);
  const textStyleRuns =
    node.type === "TEXT"
      ? toSketchTextStyleRuns(node.styleRuns)
      : sketchType && isSketchTextContainerType(sketchType)
        ? parseJsonPluginData<SketchSceneTextStyleRun[]>(
            getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchTextStyleRuns),
            isSketchSceneTextStyleRuns,
          ) ?? []
        : [];
  const supportsGeometry =
    Boolean(frame) &&
    node.id !== frame?.id &&
    role !== "label";
  const bindings =
    parseJsonPluginData<SketchSceneNodeBindings>(
      getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchBindings),
      isSketchSceneNodeBindings,
    ) ?? {};
  return {
    id: node.id,
    name: node.name || node.type || node.id,
    type: node.type,
    fill: firstFill ? colorToCss(firstFill.color) : undefined,
    stroke: firstStroke ? colorToCss(firstStroke.color) : undefined,
    strokeWidth: firstStroke ? roundNumber(firstStroke.weight) : undefined,
    opacity: roundNumber(node.opacity),
    text: node.type === "TEXT" ? node.text || "" : undefined,
    textStyleRuns: textStyleRuns.length > 0 ? textStyleRuns : undefined,
    textSelectionRange: readCanvasTextSelectionRange(node),
    supportsText: node.type === "TEXT",
    x: frame ? clampRounded(node.x - frame.x) : undefined,
    y: frame ? clampRounded(node.y - frame.y) : undefined,
    width: Math.max(1, roundNumber(node.width)),
    height: Math.max(1, roundNumber(node.height)),
    rotation: roundNumber(node.rotation || 0),
    supportsGeometry,
    imageSrc: getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchImageSrc) ?? "",
    imageAlt: getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchImageAlt) ?? "",
    supportsImageResource: sketchType === "image",
    bindings,
    supportsBindings: role !== "label",
  };
}

function buildCommandAvailability(selected: SceneNode[]): OpenPencilCommandAvailability {
  const hasSelection = selected.length > 0;
  return {
    duplicateSelection: hasSelection,
    deleteSelection: hasSelection,
    groupSelection: selected.length > 1,
    ungroupSelection: selected.length === 1 && selected[0]?.type === "GROUP",
    zoomToSelection: hasSelection,
    undo: editor.value.undo.canUndo,
    redo: editor.value.undo.canRedo,
  };
}

function commandAvailable(command: OpenPencilEditCommand, availability: OpenPencilCommandAvailability): boolean {
  if (command.type === "duplicate-selection") return availability.duplicateSelection;
  if (command.type === "delete-selection") return availability.deleteSelection;
  if (command.type === "undo") return availability.undo;
  if (command.type === "redo") return availability.redo;
  if (command.type === "group-selection") return availability.groupSelection;
  if (command.type === "ungroup-selection") return availability.ungroupSelection;
  if (command.type === "zoom-to-selection") return availability.zoomToSelection;
  return false;
}

function isEditCommandTypeAvailable(type: OpenPencilEditCommand["type"]): boolean {
  stateVersion.value;
  return commandAvailable({ type }, buildCommandAvailability(editor.value.getSelectedNodes()));
}

function buildUiState() {
  const page = editor.value.getPages()[0];
  const selected = editor.value.getSelectedNodes();
  const current = selected[0];
  const frame = page ? getSketchPageFrame(page.id) : undefined;
  const layers = page ? collectUiLayers(page.id) : [];
  const commands = buildCommandAvailability(selected);
  return {
    pageId: hostDocument.value?.pageId,
    pageName: hostDocument.value?.pageName,
    bridgeStatus: bridgeStatus.value,
    error: editorError.value,
    configKeyCount: Object.keys(hostDocument.value?.configData || {}).length,
    layerCount: importedLayerCount.value,
    layers,
    selection: {
      count: selected.length,
      type: current?.type || "-",
      current: current?.name || "-",
    },
    inspector: {
      selectedNode: buildInspectorNode(current, frame),
    },
    commands,
  };
}

function postUiState() {
  postToHost(createOpenPencilUiStateMessage({
    state: buildUiState(),
  }));
}

function selectOpenPencilNode(nodeId: string) {
  selectOpenPencilNodes([nodeId]);
}

function selectOpenPencilNodes(nodeIds: string[]) {
  const existingNodeIds = nodeIds.filter((nodeId) => editor.value.getNode(nodeId));
  if (existingNodeIds.length === 0) return;
  editor.value.select(existingNodeIds);
  editor.value.requestRender();
  stateVersion.value += 1;
  postUiState();
}

function applyUpdateNodeCommand(command: OpenPencilUpdateNodeCommand) {
  const node = editor.value.getNode(command.nodeId);
  if (!node) return;

  const changes: Partial<SceneNode> = {};
  const page = editor.value.getPages()[0];
  const frame = page ? getSketchPageFrame(page.id) : undefined;
  if (typeof command.changes.name === "string") {
    const nextName = command.changes.name.trim();
    if (nextName) changes.name = nextName;
  }
  if (frame && typeof command.changes.x === "number" && Number.isFinite(command.changes.x)) {
    changes.x = frame.x + Math.max(0, command.changes.x);
  }
  if (frame && typeof command.changes.y === "number" && Number.isFinite(command.changes.y)) {
    changes.y = frame.y + Math.max(0, command.changes.y);
  }
  if (typeof command.changes.width === "number" && Number.isFinite(command.changes.width) && command.changes.width > 0) {
    changes.width = Math.max(1, command.changes.width);
  }
  if (typeof command.changes.height === "number" && Number.isFinite(command.changes.height) && command.changes.height > 0) {
    changes.height = Math.max(1, command.changes.height);
  }
  if (typeof command.changes.rotation === "number" && Number.isFinite(command.changes.rotation)) {
    changes.rotation = command.changes.rotation;
  }
  if (typeof command.changes.opacity === "number" && Number.isFinite(command.changes.opacity)) {
    changes.opacity = normalizeOpacity(command.changes.opacity);
  }
  if (typeof command.changes.fill === "string" && command.changes.fill.trim()) {
    changes.fills = [solidFill(command.changes.fill)];
  }
  if (
    typeof command.changes.stroke === "string" ||
    typeof command.changes.strokeWidth === "number"
  ) {
    const firstStroke = node.strokes.find((stroke) => stroke.visible);
    const strokeColor =
      typeof command.changes.stroke === "string" && command.changes.stroke.trim()
        ? command.changes.stroke
        : firstStroke
          ? colorToCss(firstStroke.color)
          : DEFAULT_STROKE;
    const strokeWidth =
      typeof command.changes.strokeWidth === "number" && Number.isFinite(command.changes.strokeWidth)
        ? command.changes.strokeWidth
        : firstStroke?.weight ?? 1;
    changes.strokes = [solidStroke(strokeColor, normalizePositiveNumber(strokeWidth, 1))];
  }
  if (node.type === "TEXT" && typeof command.changes.text === "string") {
    changes.text = command.changes.text;
  }
  const sketchType = normalizeExportedSketchType(node);
  let nextPluginData: SceneNode["pluginData"] | undefined;
  const setPluginData = (key: string, value: string | undefined) => {
    nextPluginData = withPluginDataEntry(nextPluginData ?? node.pluginData, key, value);
    changes.pluginData = nextPluginData;
  };
  if (command.changes.textStyleRuns !== undefined) {
    const textStyleRuns = command.changes.textStyleRuns.filter(isSketchSceneTextStyleRun);
    if (node.type === "TEXT") {
      changes.styleRuns = toOpenPencilTextStyleRuns(textStyleRuns);
    } else if (sketchType && isSketchTextContainerType(sketchType)) {
      setPluginData(
        SKETCH_PLUGIN_KEYS.sketchTextStyleRuns,
        textStyleRuns.length > 0 ? JSON.stringify(textStyleRuns) : undefined,
      );
    }
  }
  if (sketchType === "image" && typeof command.changes.src === "string") {
    const nextSrc = command.changes.src.trim();
    setPluginData(SKETCH_PLUGIN_KEYS.sketchImageSrc, nextSrc || undefined);
    changes.fills = [solidFill("#eef2ff")];
    void hydrateImageFill(nextSrc || undefined, node.id, null);
  }
  if (sketchType === "image" && typeof command.changes.alt === "string") {
    const nextAlt = command.changes.alt.trim();
    setPluginData(SKETCH_PLUGIN_KEYS.sketchImageAlt, nextAlt || undefined);
  }
  if (command.changes.bindings !== undefined) {
    const bindings = normalizeBindings(command.changes.bindings);
    const nextBindings = Object.keys(bindings).length > 0 ? JSON.stringify(bindings) : undefined;
    setPluginData(SKETCH_PLUGIN_KEYS.sketchBindings, nextBindings);
  }

  if (Object.keys(changes).length === 0) return;
  editor.value.updateNode(node.id, changes);
  editor.value.requestRender();
  stateVersion.value += 1;
  postUiState();
  notifyDirtyState();
}

function getSketchPageFrame(pageId: string): SceneNode | undefined {
  const pageChildren = editor.value.getChildren(pageId);
  return (
    pageChildren.find((node) => node.type === "FRAME" && getPluginDataValue(node, SKETCH_PLUGIN_KEYS.role) === "page-frame") ??
    pageChildren.find((node) => node.type === "FRAME")
  );
}

function applyEditCommand(command: OpenPencilEditCommand) {
  const availability = buildCommandAvailability(editor.value.getSelectedNodes());
  if (!commandAvailable(command, availability)) {
    postUiState();
    return;
  }

  if (command.type === "duplicate-selection") {
    editor.value.duplicateSelected();
  } else if (command.type === "delete-selection") {
    editor.value.deleteSelected();
  } else if (command.type === "undo") {
    editor.value.undoAction();
  } else if (command.type === "redo") {
    editor.value.redoAction();
  } else if (command.type === "group-selection") {
    editor.value.groupSelected();
  } else if (command.type === "ungroup-selection") {
    editor.value.ungroupSelected();
  } else if (command.type === "zoom-to-selection") {
    editor.value.zoomToSelection();
  }

  editor.value.requestRender();
  stateVersion.value += 1;
  postUiState();
  if (command.type !== "zoom-to-selection") {
    notifyDirtyState();
  }
}

function handleHostMessage(event: MessageEvent<unknown>) {
  if (!isOpenPencilHostMessage(event.data)) return;
  const message = event.data;
  if (message.type === OPENPENCIL_HOST_MESSAGE_TYPES.SELECT_NODE) {
    if (message.pageId && hostDocument.value?.pageId && message.pageId !== hostDocument.value.pageId) return;
    selectOpenPencilNode(message.nodeId);
    return;
  }
  if (message.type === OPENPENCIL_HOST_MESSAGE_TYPES.COMMAND) {
    if (message.pageId && hostDocument.value?.pageId && message.pageId !== hostDocument.value.pageId) return;
    if (message.command?.type === "select-node") {
      selectOpenPencilNode(message.command.nodeId);
    } else if (message.command?.type === "select-nodes") {
      selectOpenPencilNodes(message.command.nodeIds);
    } else if (isOpenPencilUpdateNodeCommand(message.command)) {
      applyUpdateNodeCommand(message.command);
    } else if (isOpenPencilEditCommand(message.command)) {
      applyEditCommand(message.command);
    }
    return;
  }
  if (message.type !== OPENPENCIL_HOST_MESSAGE_TYPES.LOAD_DOCUMENT) return;
  hostDocument.value = message;
  editorError.value = null;
  bridgeStatus.value = "loaded";
  let loadedDocument = false;
  try {
    loadedDocument = loadCurrentPage(message);
  } catch (error) {
    reportOpenPencilError({
      code: "document-load-failed",
      message: getErrorMessage(error, "OpenPencil 无法加载当前手绘页面"),
      detail: getErrorDetail(error),
      recoverable: true,
    });
    return;
  }
  if (!loadedDocument) {
    if (pendingDirtyScene) postDirtyState(pendingDirtyScene);
    return;
  }
  pendingDirtyScene = null;
  postToHost(createOpenPencilDocumentLoadedMessage({
    pageName: message.pageName,
    width: editorWidth.value,
    height: editorHeight.value,
  }));
  postUiState();
}

function notifyDirtyState() {
  dirtyNotifyCount += 1;
  if (dirtyExportTimeout !== null) {
    window.clearTimeout(dirtyExportTimeout);
  }
  dirtyExportTimeout = window.setTimeout(() => {
    dirtyExportTimeout = null;
    const exportedScene = exportCurrentSketchScene();
    pendingDirtyScene = exportedScene;
    stateVersion.value += 1;
    postDirtyState(exportedScene);
  }, 350);
}

function loadCurrentPage(message: OpenPencilLoadDocumentMessage): boolean {
  const documentKey = createDocumentKey(message);
  if (documentKey === loadedDocumentKey) return false;
  loadedDocumentKey = documentKey;

  const page = editor.value.getPages()[0];
  if (!page) return false;

  suppressDirtyEvents = true;
  try {
    clearPage(page.id);
    const sketchScene = parseSketchScene(message.scene);
    if (sketchScene && sketchScene.nodes.length > 0) {
      importSketchScene(message, sketchScene, page.id);
    } else {
      seedFallbackPage(message, page.id);
    }
  } finally {
    suppressDirtyEvents = false;
  }

  editor.value.zoomToFit();
  editor.value.requestRender();
  stateVersion.value += 1;
  return true;
}

function createDocumentKey(message: OpenPencilLoadDocumentMessage): string {
  return `${message.pageId}:${stableStringify(message.scene)}`;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(sortJsonValue(value)) ?? "";
  } catch {
    return "";
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isRecord(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((output, key) => {
      output[key] = sortJsonValue(value[key]);
      return output;
    }, {});
}

const PATCHABLE_SKETCH_NODE_KEYS = [
  "type",
  "name",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "zIndex",
  "locked",
  "visible",
  "style",
  "text",
  "src",
  "alt",
  "path",
  "points",
  "children",
  "bindings",
  "metadata",
] as const satisfies ReadonlyArray<Exclude<keyof SketchSceneNode, "id">>;

function createVerifiedSketchScenePatch(
  baseScene: SketchSceneDocument | null,
  nextScene: SketchSceneDocument | null,
): SketchScenePatchOperation[] | null {
  if (!baseScene || !nextScene) {
    lastPatchStatus = "missing-base-or-next-scene";
    return null;
  }
  if (!canRepresentDocumentLevelAsPatch(baseScene, nextScene)) {
    lastPatchStatus = "document-level-change-not-representable";
    return null;
  }

  const operations = createSketchScenePatchOperations(baseScene, nextScene);
  const serializableOperations = cloneForPostMessage(operations);
  if (!serializableOperations) {
    lastPatchStatus = "patch-operations-not-serializable";
    return null;
  }

  const patchedScene = applySketchScenePatchOperations(baseScene, serializableOperations);
  if (!sketchScenesMatchAfterPatch(patchedScene, nextScene)) {
    lastPatchStatus = `patch-replay-mismatch:${describePatchMismatch(patchedScene, nextScene)}`;
    return null;
  }
  lastPatchStatus = "patch-ready";
  return serializableOperations;
}

function canRepresentDocumentLevelAsPatch(
  baseScene: SketchSceneDocument,
  nextScene: SketchSceneDocument,
): boolean {
  return (
    baseScene.version === nextScene.version &&
    stableStringify(baseScene.pageSize) === stableStringify(nextScene.pageSize) &&
    stableStringify(baseScene.assets) === stableStringify(nextScene.assets) &&
    stableStringify(baseScene.bindings) === stableStringify(nextScene.bindings) &&
    stableStringify(stripPatchUpdatedAt(baseScene.metadata)) ===
      stableStringify(stripPatchUpdatedAt(nextScene.metadata))
  );
}

function createSketchScenePatchOperations(
  baseScene: SketchSceneDocument,
  nextScene: SketchSceneDocument,
): SketchScenePatchOperation[] {
  const baseNodesById = new Map(baseScene.nodes.map((node) => [node.id, node]));
  const nextNodesById = new Map(nextScene.nodes.map((node) => [node.id, node]));
  const operations: SketchScenePatchOperation[] = [];

  for (const node of baseScene.nodes) {
    if (!nextNodesById.has(node.id)) {
      operations.push({ op: "delete", nodeId: node.id });
    }
  }

  for (const node of orderNodesForPatchAdd(nextScene.nodes, baseNodesById)) {
    operations.push({ op: "add", node });
  }

  for (const nextNode of nextScene.nodes) {
    const baseNode = baseNodesById.get(nextNode.id);
    if (!baseNode) continue;
    const patch = createSketchNodePatch(baseNode, nextNode, { includeZIndex: false });
    if (Object.keys(patch).length > 0) {
      operations.push({ op: "update", nodeId: nextNode.id, patch });
    }
  }

  if (nextScene.nodes.length > 0) {
    operations.push({ op: "reorder", nodeIds: nextScene.nodes.map((node) => node.id) });
  }

  nextScene.nodes.forEach((node, index) => {
    if ((node.zIndex ?? 0) !== index) {
      operations.push({ op: "update", nodeId: node.id, patch: { zIndex: node.zIndex } });
    }
  });

  return operations;
}

function orderNodesForPatchAdd(
  nodes: SketchSceneNode[],
  baseNodesById: Map<string, SketchSceneNode>,
): SketchSceneNode[] {
  const nextNodesById = new Map(nodes.map((node) => [node.id, node]));
  const ordered: SketchSceneNode[] = [];
  const visited = new Set<string>();

  const visit = (node: SketchSceneNode) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (node.type === "group") {
      for (const childId of node.children ?? []) {
        const child = nextNodesById.get(childId);
        if (child && !baseNodesById.has(child.id)) visit(child);
      }
    }
    if (!baseNodesById.has(node.id)) ordered.push(node);
  };

  for (const node of nodes) visit(node);
  return ordered;
}

function createSketchNodePatch(
  baseNode: SketchSceneNode,
  nextNode: SketchSceneNode,
  options: { includeZIndex: boolean },
): Partial<SketchSceneNode> {
  const patch: Partial<SketchSceneNode> = {};
  for (const key of PATCHABLE_SKETCH_NODE_KEYS) {
    if (!options.includeZIndex && key === "zIndex") continue;
    if (stableStringify(baseNode[key]) !== stableStringify(nextNode[key])) {
      patch[key] = nextNode[key] as never;
    }
  }
  return patch;
}

function sketchScenesMatchAfterPatch(
  patchedScene: SketchSceneDocument,
  nextScene: SketchSceneDocument,
): boolean {
  return stableStringify(normalizeSceneForPatchCompare(patchedScene)) ===
    stableStringify(normalizeSceneForPatchCompare(nextScene));
}

function describePatchMismatch(
  patchedScene: SketchSceneDocument,
  nextScene: SketchSceneDocument,
): string {
  const patched = normalizeSceneForPatchCompare(patchedScene);
  const next = normalizeSceneForPatchCompare(nextScene);
  if (patched.nodes.length !== next.nodes.length) {
    return `node-count:${patched.nodes.length}->${next.nodes.length}`;
  }
  for (let index = 0; index < next.nodes.length; index += 1) {
    const patchedNode = patched.nodes[index];
    const nextNode = next.nodes[index];
    if (stableStringify(patchedNode) === stableStringify(nextNode)) continue;
    return `node:${index}:${patchedNode?.id ?? "-"}:${describeNodeMismatch(patchedNode, nextNode)}`;
  }
  return "document-fields";
}

function describeNodeMismatch(
  patchedNode: SketchSceneNode | undefined,
  nextNode: SketchSceneNode | undefined,
): string {
  if (!patchedNode || !nextNode) return "missing-node";
  const keys = new Set([...Object.keys(patchedNode), ...Object.keys(nextNode)]);
  for (const key of keys) {
    const nodeKey = key as keyof SketchSceneNode;
    if (stableStringify(patchedNode[nodeKey]) !== stableStringify(nextNode[nodeKey])) {
      return key;
    }
  }
  return "unknown-field";
}

function normalizeSceneForPatchCompare(scene: SketchSceneDocument): SketchSceneDocument {
  const metadata = stripPatchUpdatedAt(scene.metadata);
  return {
    ...scene,
    ...(metadata === undefined ? { metadata: undefined } : { metadata }),
  };
}

function stripPatchUpdatedAt(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const next = { ...metadata };
  delete next.updatedAt;
  return Object.keys(next).length > 0 ? next : undefined;
}

function clearPage(pageId: string) {
  const childIds = editor.value.getChildren(pageId).map((child) => child.id);
  for (const childId of childIds) {
    editor.value.graph.deleteNode(childId);
  }
  editor.value.select([]);
}

function parseSketchScene(scene: unknown): SketchSceneDocument | null {
  if (!scene || typeof scene !== "object") return null;
  const candidate = scene as Partial<SketchSceneDocument>;
  if (!candidate.pageSize || !Array.isArray(candidate.nodes)) return null;
  const { width, height } = candidate.pageSize;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const parsedScene: SketchSceneDocument = {
    version: typeof candidate.version === "number" ? candidate.version : 1,
    pageSize: { width, height },
    nodes: candidate.nodes.filter(isSketchNode),
  };
  if (Array.isArray(candidate.assets)) {
    parsedScene.assets = candidate.assets.filter(isSketchAsset);
  }
  if (isRecord(candidate.bindings)) parsedScene.bindings = candidate.bindings;
  if (isRecord(candidate.metadata)) parsedScene.metadata = candidate.metadata;
  return parsedScene;
}

function isSketchNode(node: unknown): node is SketchSceneNode {
  if (!node || typeof node !== "object") return false;
  const candidate = node as Partial<SketchSceneNode>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Number.isFinite(candidate.width) &&
    Number.isFinite(candidate.height)
  );
}

function isSketchAsset(asset: unknown): asset is SketchSceneAsset {
  if (!asset || typeof asset !== "object") return false;
  const candidate = asset as Partial<SketchSceneAsset>;
  return (
    typeof candidate.id === "string" &&
    candidate.type === "image" &&
    typeof candidate.src === "string" &&
    (candidate.width === undefined || Number.isFinite(candidate.width)) &&
    (candidate.height === undefined || Number.isFinite(candidate.height)) &&
    (candidate.alt === undefined || typeof candidate.alt === "string")
  );
}

function importSketchScene(
  message: OpenPencilLoadDocumentMessage,
  scene: SketchSceneDocument,
  pageId: string,
) {
  const frameId = editor.value.createShape(
    "FRAME",
    PAGE_OFFSET,
    PAGE_OFFSET,
    scene.pageSize.width,
    scene.pageSize.height,
    pageId,
  );
  editor.value.updateNode(frameId, {
    name: message.pageName ? `${message.pageName} / 手绘页面` : "手绘页面",
    fills: [solidFill(DEFAULT_FILL)],
    strokes: [solidStroke("#cbd5e1", 1)],
    cornerRadius: 0,
    clipsContent: true,
    pluginData: [pluginData(SKETCH_PLUGIN_KEYS.role, "page-frame")],
  });

  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const childNodeIds = new Set(
    scene.nodes
      .filter((node) => node.type === "group")
      .flatMap((node) => node.children ?? []),
  );
  const nodes = [...scene.nodes]
    .filter((node) => !childNodeIds.has(node.id))
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  const importedIds: string[] = [];
  for (const node of nodes) {
    const imported = createOpenPencilNode(node, frameId, nodesById);
    if (imported) importedIds.push(imported);
  }

  editor.value.select(importedIds.length > 0 ? [importedIds[0]] : [frameId]);
}

function createOpenPencilNode(
  node: SketchSceneNode,
  parentId: string,
  nodesById: Map<string, SketchSceneNode>,
): string | null {
  const style = node.style ?? {};
  const geometry = normalizeGeometry(node);
  const baseChanges: Partial<SceneNode> = {
    name: node.name || `${node.type}:${node.id}`,
    rotation: node.rotation ?? 0,
    visible: node.visible ?? true,
    locked: node.locked ?? false,
    opacity: normalizeOpacity(style.opacity),
    pluginData: [
      pluginData(SKETCH_PLUGIN_KEYS.sketchNodeId, node.id),
      pluginData(SKETCH_PLUGIN_KEYS.sketchNodeType, node.type),
      ...optionalJsonPluginData(SKETCH_PLUGIN_KEYS.sketchBindings, node.bindings),
      ...optionalJsonPluginData(SKETCH_PLUGIN_KEYS.sketchMetadata, node.metadata),
      ...optionalJsonPluginData(SKETCH_PLUGIN_KEYS.sketchTextStyleRuns, node.textStyleRuns),
    ],
  };

  if (node.type === "group") {
    const groupId = editor.value.createShape(
      "GROUP",
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
      parentId,
    );
    editor.value.updateNode(groupId, {
      ...baseChanges,
      fills: [],
      strokes: [],
      visible: false,
    });

    const children = (node.children ?? [])
      .map((childId) => nodesById.get(childId))
      .filter((child): child is SketchSceneNode => Boolean(child))
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    for (const child of children) {
      createOpenPencilNode(child, groupId, nodesById);
    }
    return groupId;
  }

  if (node.type === "text") {
    const textId = editor.value.createShape(
      "TEXT",
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
      parentId,
    );
    editor.value.updateNode(textId, {
      ...baseChanges,
      text: node.text || node.name || "Text",
      fontSize: normalizePositiveNumber(style.fontSize, 16),
      fontWeight: normalizeFontWeight(style.fontWeight),
      fills: [solidFill(style.color || DEFAULT_TEXT_COLOR)],
      textAlignHorizontal: normalizeTextAlign(style.textAlign),
      textAutoResize: "HEIGHT",
      styleRuns: toOpenPencilTextStyleRuns(node.textStyleRuns),
    });
    return textId;
  }

  if (node.type === "line" || node.type === "arrow") {
    const lineId = editor.value.createShape(
      "LINE",
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
      parentId,
    );
    editor.value.updateNode(lineId, {
      ...baseChanges,
      strokes: [
        solidStroke(style.stroke || DEFAULT_STROKE, normalizePositiveNumber(style.strokeWidth, 2), {
          cap: node.type === "arrow" ? "ARROW_EQUILATERAL" : "NONE",
          dashPattern: style.lineDash,
        }),
      ],
    });
    return lineId;
  }

  if (node.type === "button" || node.type === "input" || node.type === "card" || node.type === "sticky") {
    const containerId = createShapeWithStyle(
      "ROUNDED_RECTANGLE",
      node,
      parentId,
      defaultFillForNode(node),
      defaultRadiusForNode(node),
      undefined,
      optionalPluginData(SKETCH_PLUGIN_KEYS.sketchText, node.text),
    );
    if (node.text) {
      const textId = editor.value.createShape(
        "TEXT",
        geometry.x + 12,
        geometry.y + Math.max(8, Math.min(18, geometry.height / 4)),
        Math.max(24, geometry.width - 24),
        Math.max(20, geometry.height - 16),
        parentId,
      );
      editor.value.updateNode(textId, {
        name: `${node.name || node.type} label`,
        text: node.text,
        fontSize: normalizePositiveNumber(style.fontSize, 15),
        fontWeight: node.type === "button" ? 700 : normalizeFontWeight(style.fontWeight),
        fills: [solidFill(style.color || (node.type === "button" ? "#ffffff" : DEFAULT_TEXT_COLOR))],
        textAlignHorizontal: normalizeTextAlign(style.textAlign),
        textAutoResize: "HEIGHT",
        styleRuns: toOpenPencilTextStyleRuns(node.textStyleRuns),
        pluginData: [
          pluginData(SKETCH_PLUGIN_KEYS.role, "label"),
          pluginData(SKETCH_PLUGIN_KEYS.sketchNodeId, node.id),
          pluginData(SKETCH_PLUGIN_KEYS.sketchNodeType, `${node.type}-label`),
        ],
      });
    }
    return containerId;
  }

  if (node.type === "ellipse") {
    return createShapeWithStyle("ELLIPSE", node, parentId, DEFAULT_FILL, 0);
  }

  if (node.type === "image") {
    const imageId = createShapeWithStyle("RECTANGLE", node, parentId, "#eef2ff", 0, undefined, [
      ...optionalPluginData(SKETCH_PLUGIN_KEYS.sketchImageSrc, node.src),
      ...optionalPluginData(SKETCH_PLUGIN_KEYS.sketchImageAlt, node.alt),
    ]);
    let labelId: string | null = null;
    if (node.alt || node.src) {
      labelId = editor.value.createShape(
        "TEXT",
        geometry.x + 8,
        geometry.y + 8,
        Math.max(24, geometry.width - 16),
        32,
        parentId,
      );
      editor.value.updateNode(labelId, {
        name: `${node.name || "Image"} source`,
        text: node.alt || node.src || "Image",
        fontSize: 12,
        fills: [solidFill("#4338ca")],
        textAutoResize: "HEIGHT",
        pluginData: [
          pluginData(SKETCH_PLUGIN_KEYS.role, "label"),
          pluginData(SKETCH_PLUGIN_KEYS.sketchNodeId, node.id),
          pluginData(SKETCH_PLUGIN_KEYS.sketchNodeType, "image-label"),
        ],
      });
    }
    void hydrateImageFill(node.src, imageId, labelId);
    return imageId;
  }

  if (node.type === "path") {
    const pathId = createShapeWithStyle("VECTOR", node, parentId, "transparent", 0, undefined, [
      ...optionalPluginData(SKETCH_PLUGIN_KEYS.sketchPath, node.path),
      ...optionalPluginData(
        SKETCH_PLUGIN_KEYS.sketchPoints,
        node.points?.length ? JSON.stringify(node.points) : undefined,
      ),
    ]);
    editor.value.updateNode(pathId, {
      vectorNetwork: parsePathVectorNetwork(node.path),
      fills: node.style?.fill ? [solidFill(node.style.fill)] : [],
      strokes: [
        solidStroke(
          node.style?.stroke || DEFAULT_TEXT_COLOR,
          normalizePositiveNumber(node.style?.strokeWidth, 1),
          { dashPattern: node.style?.lineDash },
        ),
      ],
    });
    return pathId;
  }

  return createShapeWithStyle("ROUNDED_RECTANGLE", node, parentId, DEFAULT_FILL, 0);
}

function createShapeWithStyle(
  type: NodeType,
  node: SketchSceneNode,
  parentId: string,
  fallbackFill: string,
  fallbackRadius: number,
  fallbackName?: string,
  extraPluginData: SceneNode["pluginData"] = [],
): string {
  const style = node.style ?? {};
  const geometry = normalizeGeometry(node);
  const id = editor.value.createShape(
    type,
    geometry.x,
    geometry.y,
    geometry.width,
    geometry.height,
    parentId,
  );
  editor.value.updateNode(id, {
    name: node.name || fallbackName || `${node.type}:${node.id}`,
    rotation: node.rotation ?? 0,
    visible: node.visible ?? true,
    locked: node.locked ?? false,
    opacity: normalizeOpacity(style.opacity),
    cornerRadius: normalizePositiveNumber(style.radius, fallbackRadius),
    fills: [solidFill(style.fill || fallbackFill)],
    strokes: style.stroke
      ? [solidStroke(style.stroke, normalizePositiveNumber(style.strokeWidth, 1))]
      : [],
    pluginData: [
      pluginData(SKETCH_PLUGIN_KEYS.sketchNodeId, node.id),
      pluginData(SKETCH_PLUGIN_KEYS.sketchNodeType, node.type),
      ...optionalJsonPluginData(SKETCH_PLUGIN_KEYS.sketchBindings, node.bindings),
      ...optionalJsonPluginData(SKETCH_PLUGIN_KEYS.sketchMetadata, node.metadata),
      ...extraPluginData,
    ],
  });
  return id;
}

function normalizeGeometry(node: SketchSceneNode) {
  const endX = node.x + node.width;
  const endY = node.y + node.height;
  return {
    x: PAGE_OFFSET + Math.min(node.x, endX),
    y: PAGE_OFFSET + Math.min(node.y, endY),
    width: Math.max(1, Math.abs(node.width)),
    height: Math.max(1, Math.abs(node.height)),
  };
}

function defaultFillForNode(node: SketchSceneNode): string {
  if (node.type === "button") return "#2563eb";
  if (node.type === "input") return "#ffffff";
  if (node.type === "sticky") return "#fde68a";
  if (node.type === "card") return "#f8fafc";
  return DEFAULT_FILL;
}

function defaultRadiusForNode(node: SketchSceneNode): number {
  if (node.type === "button" || node.type === "input") return 8;
  if (node.type === "card" || node.type === "sticky") return 12;
  return 0;
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeOpacity(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function normalizeFontWeight(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
    if (value === "bold") return 700;
  }
  return 400;
}

function normalizeTextAlign(value: SketchSceneStyle["textAlign"]): SceneNode["textAlignHorizontal"] {
  if (value === "center") return "CENTER";
  if (value === "right") return "RIGHT";
  return "LEFT";
}

function toOpenPencilTextDecoration(
  value: SketchSceneTextStyleOverride["textDecoration"],
): SceneNode["textDecoration"] | undefined {
  if (value === "underline") return "UNDERLINE";
  if (value === "line-through") return "STRIKETHROUGH";
  if (value === "none") return "NONE";
  return undefined;
}

function toSketchTextDecoration(
  value: SceneNode["textDecoration"] | undefined,
): SketchSceneTextStyleOverride["textDecoration"] | undefined {
  if (value === "UNDERLINE") return "underline";
  if (value === "STRIKETHROUGH") return "line-through";
  if (value === "NONE") return "none";
  return undefined;
}

function toOpenPencilTextStyleRuns(runs: SketchSceneTextStyleRun[] | undefined): StyleRun[] {
  if (!runs?.length) return [];
  return runs.map((run) => {
    const style: StyleRun["style"] = {};
    if (typeof run.style.fontWeight !== "undefined") {
      style.fontWeight = normalizeFontWeight(run.style.fontWeight);
    }
    if (typeof run.style.italic === "boolean") style.italic = run.style.italic;
    const textDecoration = toOpenPencilTextDecoration(run.style.textDecoration);
    if (textDecoration) style.textDecoration = textDecoration;
    if (typeof run.style.fontSize === "number") style.fontSize = run.style.fontSize;
    if (typeof run.style.fontFamily === "string") style.fontFamily = run.style.fontFamily;
    if (typeof run.style.letterSpacing === "number") style.letterSpacing = run.style.letterSpacing;
    if (run.style.lineHeight !== undefined) style.lineHeight = run.style.lineHeight;
    if (typeof run.style.color === "string") style.fills = [solidFill(run.style.color)];
    return {
      start: Math.max(0, Math.round(run.start)),
      length: Math.max(1, Math.round(run.length)),
      style,
    };
  });
}

function toSketchTextStyleRuns(runs: StyleRun[] | undefined): SketchSceneTextStyleRun[] {
  if (!runs?.length) return [];
  return runs
    .map((run) => {
      const firstFill = run.style.fills?.find((fill) => fill.visible);
      const style: SketchSceneTextStyleOverride = {};
      if (firstFill) style.color = colorToCss(firstFill.color);
      if (typeof run.style.fontSize === "number") style.fontSize = roundNumber(run.style.fontSize);
      if (typeof run.style.fontWeight === "number") style.fontWeight = run.style.fontWeight;
      if (typeof run.style.fontFamily === "string") style.fontFamily = run.style.fontFamily;
      if (typeof run.style.italic === "boolean") style.italic = run.style.italic;
      const textDecoration = toSketchTextDecoration(run.style.textDecoration);
      if (textDecoration) style.textDecoration = textDecoration;
      if (run.style.lineHeight !== undefined) {
        style.lineHeight = run.style.lineHeight === null ? null : roundNumber(run.style.lineHeight);
      }
      if (typeof run.style.letterSpacing === "number") style.letterSpacing = roundNumber(run.style.letterSpacing);
      return {
        start: Math.max(0, Math.round(run.start)),
        length: Math.max(1, Math.round(run.length)),
        style,
      };
    })
    .filter((run) => Object.keys(run.style).length > 0);
}

function solidFill(colorValue: string): Fill {
  return {
    type: "SOLID",
    color: parseColor(colorValue, { r: 1, g: 1, b: 1, a: 1 }),
    opacity: 1,
    visible: true,
  };
}

function solidStroke(
  colorValue: string,
  weight: number,
  options: Partial<Pick<Stroke, "cap" | "dashPattern">> = {},
): Stroke {
  return {
    color: parseColor(colorValue, { r: 0.82, g: 0.85, b: 0.9, a: 1 }),
    weight,
    opacity: 1,
    visible: true,
    align: "CENTER",
    ...options,
  };
}

function imageFill(imageHash: string): Fill {
  return {
    type: "IMAGE",
    color: toColor(0, 0, 0),
    opacity: 1,
    visible: true,
    imageHash,
    imageScaleMode: "FILL",
  };
}

async function hydrateImageFill(
  src: string | undefined,
  imageId: string,
  labelId: string | null,
) {
  const bytes = await fetchImageBytes(src);
  if (!bytes) return;
  const imageHash = editor.value.storeImage(bytes);

  suppressDirtyEvents = true;
  try {
    if (!editor.value.getNode(imageId)) return;
    editor.value.updateNode(imageId, {
      fills: [imageFill(imageHash)],
    });
    if (labelId && editor.value.getNode(labelId)) {
      editor.value.graph.deleteNode(labelId);
    }
    editor.value.requestRender();
    stateVersion.value += 1;
    postUiState();
  } finally {
    suppressDirtyEvents = false;
  }
}

async function fetchImageBytes(src: string | undefined): Promise<Uint8Array | null> {
  if (!src?.trim()) return null;
  for (const fetchUrl of resolveImageFetchUrls(src)) {
    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) continue;
      const blob = await response.blob();
      if (blob.size <= 0) continue;
      return new Uint8Array(await blob.arrayBuffer());
    } catch {
      continue;
    }
  }
  return null;
}

function resolveImageFetchUrls(src: string): string[] {
  const directUrl = src.trim();
  const proxyUrl = resolveImageProxyUrl(directUrl);
  if (!proxyUrl || proxyUrl === directUrl) return [directUrl];
  return [proxyUrl, directUrl];
}

function resolveImageProxyUrl(src: string): string | null {
  if (!shouldProxyImageUrl(src)) return null;
  const proxyUrl = hostDocument.value?.imageProxyUrl?.trim();
  if (!proxyUrl) return null;
  try {
    const url = new URL(proxyUrl, window.location.href);
    url.searchParams.set("url", src);
    return url.toString();
  } catch {
    return null;
  }
}

function shouldProxyImageUrl(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseColor(value: string | undefined, fallback: OpenPencilColor): OpenPencilColor {
  if (!value) return fallback;
  const normalized = value.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : "";
  if (hex.length === 3) {
    const [r, g, b] = hex.split("").map((channel) => Number.parseInt(`${channel}${channel}`, 16));
    if ([r, g, b].every(Number.isFinite)) return toColor(r, g, b);
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b, a].every(Number.isFinite)) return toColor(r, g, b, a);
  }
  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return toColor(parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1);
    }
  }
  return fallback;
}

function toColor(r: number, g: number, b: number, a = 1): OpenPencilColor {
  return {
    r: Math.max(0, Math.min(1, r / 255)),
    g: Math.max(0, Math.min(1, g / 255)),
    b: Math.max(0, Math.min(1, b / 255)),
    a: Math.max(0, Math.min(1, a)),
  };
}

function exportCurrentSketchScene(): SketchSceneDocument | null {
  const message = hostDocument.value;
  if (!message) return null;
  const importedScene = parseSketchScene(message.scene);
  const page = editor.value.getPages()[0];
  if (!page) return null;
  const frame = getSketchPageFrame(page.id);
  if (!frame) return null;

  const usedNodeIds = new Set<string>();
  const nodes: SketchSceneNode[] = [];
  editor.value
    .getChildren(frame.id)
    .filter(isExportableOpenPencilNode)
    .forEach((node, index) => {
      exportSketchNodeTree(node, frame, index, usedNodeIds, nodes);
    });

  const exportedScene: SketchSceneDocument = {
    version: importedScene?.version ?? 1,
    pageSize: importedScene?.pageSize ?? {
      width: Math.max(1, Math.round(frame.width)),
      height: Math.max(1, Math.round(frame.height)),
    },
    nodes,
  };
  if (importedScene?.assets !== undefined) exportedScene.assets = importedScene.assets;
  if (importedScene?.bindings !== undefined) exportedScene.bindings = importedScene.bindings;
  if (importedScene?.metadata !== undefined) exportedScene.metadata = importedScene.metadata;
  return exportedScene;
}

function exportSketchNodeTree(
  node: SceneNode,
  frame: SceneNode,
  index: number,
  usedNodeIds: Set<string>,
  output: SketchSceneNode[],
): SketchSceneNode | null {
  const exported = exportSketchNode(node, frame, index, usedNodeIds);
  if (!exported) return null;

  if (exported.type === "group" || CONTAINER_NODE_TYPES.has(node.type)) {
    const childIds: string[] = [];
    editor.value
      .getChildren(node.id)
      .filter(isExportableOpenPencilNode)
      .forEach((child, childIndex) => {
        const childNode = exportSketchNodeTree(
          child,
          frame,
          childIndex,
          usedNodeIds,
          output,
        );
        if (childNode) childIds.push(childNode.id);
      });
    if (exported.type === "group") exported.children = childIds;
  }

  output.push(exported);
  return exported;
}

function exportSketchNode(
  node: SceneNode,
  frame: SceneNode,
  index: number,
  usedNodeIds: Set<string>,
): SketchSceneNode | null {
  const sketchType = normalizeExportedSketchType(node);
  if (!sketchType) return null;

  const style = exportSketchStyle(node, sketchType);
  const baseId = getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchNodeId) || node.id;
  const id = createUniqueSketchNodeId(baseId, usedNodeIds);
  const exported: SketchSceneNode = {
    id,
    type: sketchType,
    name: node.name,
    x: clampRounded(node.x - frame.x),
    y: clampRounded(node.y - frame.y),
    width: Math.max(1, roundNumber(node.width)),
    height: Math.max(1, roundNumber(node.height)),
    rotation: roundNumber(node.rotation || 0),
    zIndex: index,
    locked: node.locked,
    visible: node.visible,
  };

  if (Object.keys(style).length > 0) exported.style = style;
  const bindings = parseJsonPluginData<SketchSceneNodeBindings>(
    getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchBindings),
    isSketchSceneNodeBindings,
  );
  if (bindings) exported.bindings = bindings;
  const metadata = parseJsonPluginData<Record<string, unknown>>(
    getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchMetadata),
    isRecord,
  );
  if (metadata) exported.metadata = metadata;
  if (node.type === "TEXT") {
    exported.text = node.text || node.name || "";
    const textStyleRuns = toSketchTextStyleRuns(node.styleRuns);
    if (textStyleRuns.length > 0) exported.textStyleRuns = textStyleRuns;
  }
  if (isSketchTextContainerType(sketchType)) {
    const text = getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchText);
    if (text !== undefined) exported.text = text;
    const textStyleRuns = parseJsonPluginData<SketchSceneTextStyleRun[]>(
      getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchTextStyleRuns),
      isSketchSceneTextStyleRuns,
    );
    if (textStyleRuns?.length) exported.textStyleRuns = textStyleRuns;
  }
  if (sketchType === "path") {
    exported.path = getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchPath) || "M0 0H1";
    const points = parseSketchPoints(getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchPoints));
    if (points) exported.points = points;
  }
  if (sketchType === "image") {
    const src = getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchImageSrc);
    const alt = getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchImageAlt);
    if (src) exported.src = src;
    exported.alt = alt || node.name;
  }
  return exported;
}

function isExportableOpenPencilNode(node: SceneNode): boolean {
  return getPluginDataValue(node, SKETCH_PLUGIN_KEYS.role) !== "label";
}

function parseSketchPoints(value: string | undefined): SketchSceneNode["points"] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const points = parsed.filter(
      (point): point is { x: number; y: number } =>
        Boolean(point) &&
        typeof point === "object" &&
        Number.isFinite((point as { x?: unknown }).x) &&
        Number.isFinite((point as { y?: unknown }).y),
    );
    return points.length > 0 ? points : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonPluginData<T>(
  value: string | undefined,
  guard: (candidate: unknown) => candidate is T,
): T | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return guard(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
}

function isSketchSceneNodeBindings(candidate: unknown): candidate is SketchSceneNodeBindings {
  if (!isRecord(candidate)) return false;
  return Object.values(candidate).every((value) => typeof value === "string");
}

function isSketchTextDecoration(value: unknown): value is SketchSceneTextStyleOverride["textDecoration"] {
  return value === "none" || value === "underline" || value === "line-through";
}

function isSketchTextStyleOverride(candidate: unknown): candidate is SketchSceneTextStyleOverride {
  if (!isRecord(candidate)) return false;
  return (
    (candidate.color === undefined || typeof candidate.color === "string") &&
    (candidate.fontSize === undefined || (typeof candidate.fontSize === "number" && Number.isFinite(candidate.fontSize) && candidate.fontSize > 0)) &&
    (
      candidate.fontWeight === undefined ||
      typeof candidate.fontWeight === "string" ||
      (typeof candidate.fontWeight === "number" && Number.isFinite(candidate.fontWeight) && candidate.fontWeight >= 0)
    ) &&
    (candidate.fontFamily === undefined || typeof candidate.fontFamily === "string") &&
    (candidate.italic === undefined || typeof candidate.italic === "boolean") &&
    (candidate.textDecoration === undefined || isSketchTextDecoration(candidate.textDecoration)) &&
    (
      candidate.lineHeight === undefined ||
      candidate.lineHeight === null ||
      (typeof candidate.lineHeight === "number" && Number.isFinite(candidate.lineHeight) && candidate.lineHeight > 0)
    ) &&
    (candidate.letterSpacing === undefined || (typeof candidate.letterSpacing === "number" && Number.isFinite(candidate.letterSpacing)))
  );
}

function isSketchSceneTextStyleRun(candidate: unknown): candidate is SketchSceneTextStyleRun {
  if (!isRecord(candidate)) return false;
  return (
    typeof candidate.start === "number" &&
    Number.isFinite(candidate.start) &&
    candidate.start >= 0 &&
    typeof candidate.length === "number" &&
    Number.isFinite(candidate.length) &&
    candidate.length > 0 &&
    isSketchTextStyleOverride(candidate.style)
  );
}

function isSketchSceneTextStyleRuns(candidate: unknown): candidate is SketchSceneTextStyleRun[] {
  return Array.isArray(candidate) && candidate.every(isSketchSceneTextStyleRun);
}

function normalizeBindings(bindings: SketchSceneNodeBindings): SketchSceneNodeBindings {
  return Object.fromEntries(
    Object.entries(bindings)
      .filter((entry): entry is [keyof SketchSceneNodeBindings, string] => typeof entry[1] === "string")
      .map(([key, value]) => [key, value.trim()])
      .filter((entry): entry is [keyof SketchSceneNodeBindings, string] => entry[1].length > 0),
  ) as SketchSceneNodeBindings;
}

function parsePathVectorNetwork(path: string | undefined): SceneNode["vectorNetwork"] {
  if (!path?.trim()) return null;
  try {
    return parseSVGPath(path);
  } catch {
    return null;
  }
}

function createUniqueSketchNodeId(baseId: string, usedNodeIds: Set<string>): string {
  const normalizedBaseId = baseId.trim() || "openpencil-node";
  if (!usedNodeIds.has(normalizedBaseId)) {
    usedNodeIds.add(normalizedBaseId);
    return normalizedBaseId;
  }

  let copyIndex = 1;
  let candidate = `${normalizedBaseId}-copy-${copyIndex}`;
  while (usedNodeIds.has(candidate)) {
    copyIndex += 1;
    candidate = `${normalizedBaseId}-copy-${copyIndex}`;
  }
  usedNodeIds.add(candidate);
  return candidate;
}

function normalizeExportedSketchType(node: SceneNode): SketchSceneNode["type"] | null {
  const storedType = getPluginDataValue(node, SKETCH_PLUGIN_KEYS.sketchNodeType);
  if (isSketchSceneNodeType(storedType)) return storedType;
  if (node.type === "TEXT") return "text";
  if (node.type === "ELLIPSE") return "ellipse";
  if (node.type === "LINE") return node.strokes.some((stroke) => stroke.cap === "ARROW_EQUILATERAL") ? "arrow" : "line";
  if (node.type === "GROUP") return "group";
  if (node.type === "RECTANGLE" || node.type === "ROUNDED_RECTANGLE" || node.type === "FRAME") return "rect";
  return null;
}

function isSketchSceneNodeType(value: string | undefined): value is SketchSceneNode["type"] {
  return (
    value === "rect" ||
    value === "ellipse" ||
    value === "line" ||
    value === "arrow" ||
    value === "path" ||
    value === "text" ||
    value === "image" ||
    value === "sticky" ||
    value === "button" ||
    value === "input" ||
    value === "card" ||
    value === "group"
  );
}

function isSketchTextContainerType(
  value: SketchSceneNode["type"],
): value is "sticky" | "button" | "input" | "card" {
  return value === "sticky" || value === "button" || value === "input" || value === "card";
}

function exportSketchStyle(node: SceneNode, sketchType: SketchSceneNode["type"]): SketchSceneStyle {
  const firstFill = node.fills.find((fill) => fill.visible);
  const firstStroke = node.strokes.find((stroke) => stroke.visible);
  const style: SketchSceneStyle = {};
  if (sketchType === "text") {
    if (firstFill) style.color = colorToCss(firstFill.color);
    style.fontSize = roundNumber(node.fontSize);
    style.fontWeight = node.fontWeight;
    style.textAlign = exportTextAlign(node.textAlignHorizontal);
  } else if (sketchType !== "image" && firstFill) {
    style.fill = colorToCss(firstFill.color);
  }
  if (firstStroke) {
    style.stroke = colorToCss(firstStroke.color);
    style.strokeWidth = roundNumber(firstStroke.weight);
    if (firstStroke.dashPattern?.length) style.lineDash = firstStroke.dashPattern;
  }
  if (node.opacity !== 1) style.opacity = roundNumber(node.opacity);
  if (node.cornerRadius > 0) style.radius = roundNumber(node.cornerRadius);
  return style;
}

function exportTextAlign(value: SceneNode["textAlignHorizontal"]): SketchSceneStyle["textAlign"] {
  if (value === "CENTER") return "center";
  if (value === "RIGHT") return "right";
  return "left";
}

function colorToCss(color: OpenPencilColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Number.isFinite(color.a) ? color.a : 1;
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${roundNumber(a)})`;
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

function toHexChannel(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampRounded(value: number): number {
  return Math.max(0, roundNumber(value));
}

function seedFallbackPage(message: OpenPencilLoadDocumentMessage, pageId: string) {
  const frameWidth = Math.max(320, Math.min(editorWidth.value - 160, 720));
  const frameHeight = Math.max(260, Math.min(editorHeight.value - 160, 520));
  const frameId = editor.value.createShape("FRAME", 80, 80, frameWidth, frameHeight, pageId);
  editor.value.updateNode(frameId, {
    name: message.pageName ? `${message.pageName} OpenPencil Spike` : "OpenPencil Spike Page",
    cornerRadius: 20,
    pluginData: [pluginData(SKETCH_PLUGIN_KEYS.role, "page-frame")],
    fills: [
      {
        type: "SOLID",
        color: { r: 0.96, g: 0.97, b: 0.98, a: 1 },
        opacity: 1,
        visible: true,
      },
    ],
  });

  const titleId = editor.value.createShape("TEXT", 120, 126, frameWidth - 80, 42, frameId);
  editor.value.updateNode(titleId, {
    name: "Spike title",
    text: "OpenPencil 单页面编辑 Spike",
    fontSize: 28,
    fontWeight: 700,
    fills: [
      {
        type: "SOLID",
        color: { r: 0.07, g: 0.09, b: 0.13, a: 1 },
        opacity: 1,
        visible: true,
      },
    ],
  });

  const cardId = editor.value.createShape("ROUNDED_RECTANGLE", 120, 210, 300, 160, frameId);
  editor.value.updateNode(cardId, {
    name: "Editable card",
    cornerRadius: 16,
    fills: [
      {
        type: "SOLID",
        color: { r: 0.17, g: 0.36, b: 0.9, a: 1 },
        opacity: 1,
        visible: true,
      },
    ],
  });

  const noteId = editor.value.createShape("TEXT", 145, 250, 250, 64, frameId);
  editor.value.updateNode(noteId, {
    name: "Editable note",
    text: "这里验证 OpenPencil 的选择、绘制、拖拽、缩放和属性编辑体验。",
    fontSize: 16,
    fills: [
      {
        type: "SOLID",
        color: { r: 1, g: 1, b: 1, a: 1 },
        opacity: 1,
        visible: true,
      },
    ],
  });

  editor.value.select([frameId]);
}

function isSelected(selectedIds: Set<string>, id: string): boolean {
  return selectedIds.has(id);
}

function handleGraphNodeCreated(node: SceneNode) {
  placeUserCreatedNodeInsideSketchFrame(node);
  scheduleDirtyState();
}

function placeUserCreatedNodeInsideSketchFrame(node: SceneNode) {
  if (suppressDirtyEvents || bridgeStatus.value !== "loaded") return;
  if (!EXPORTABLE_DRAWN_NODE_TYPES.has(node.type)) return;
  const page = editor.value.getPages()[0];
  if (!page || node.parentId !== page.id) return;
  const frame = getSketchPageFrame(page.id);
  if (!frame || node.id === frame.id) return;
  if (getPluginDataValue(node, SKETCH_PLUGIN_KEYS.role) === "page-frame") return;
  const centerX = node.x + Math.max(0, node.width) / 2;
  const centerY = node.y + Math.max(0, node.height) / 2;
  if (
    centerX < frame.x ||
    centerY < frame.y ||
    centerX > frame.x + frame.width ||
    centerY > frame.y + frame.height
  ) {
    return;
  }
  editor.value.graph.reparentNode(node.id, frame.id);
}

function scheduleDirtyState() {
  if (suppressDirtyEvents || bridgeStatus.value !== "loaded") return;
  if (dirtyExportTimeout !== null) {
    window.clearTimeout(dirtyExportTimeout);
  }
  dirtyExportTimeout = window.setTimeout(() => {
    dirtyExportTimeout = null;
    const exportedScene = exportCurrentSketchScene();
    pendingDirtyScene = exportedScene;
    stateVersion.value += 1;
    postUiState();
    postDirtyState(exportedScene);
  }, 150);
}

function postDirtyState(scene: SketchSceneDocument | null) {
  dirtyPostCount += 1;
  lastDirtyNodeCount = scene?.nodes.length ?? 0;
  const baseScene = parseSketchScene(hostDocument.value?.scene);
  const patchOperations = createVerifiedSketchScenePatch(baseScene, scene);
  lastPatchOperationCount = patchOperations?.length ?? null;
  postToHost(createOpenPencilDirtyStateMessage({
    dirty: true,
    nodeCount: lastDirtyNodeCount,
    scene,
    patchBaseSceneKey: baseScene ? stableStringify(baseScene) : undefined,
    patchOperations: patchOperations ?? undefined,
  }));
}

function handleWindowError(event: ErrorEvent) {
  handleRuntimeError(event.error ?? event.message, "手绘编辑器运行时错误");
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  handleRuntimeError(event.reason, "手绘编辑器资源加载失败");
}

onErrorCaptured((error) => {
  reportOpenPencilError({
    code: "editor-initialization-failed",
    message: getErrorMessage(error, "手绘编辑器初始化失败"),
    detail: getErrorDetail(error),
    recoverable: true,
  });
  return false;
});

onMounted(() => {
  window.addEventListener("message", handleHostMessage);
  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  unsubscribeGraphEvents = editor.value.graph.onNodeEvents({
    created: handleGraphNodeCreated,
    updated: scheduleDirtyState,
    deleted: scheduleDirtyState,
    reparented: scheduleDirtyState,
    reordered: scheduleDirtyState,
  });
  getDebugScope().__OPENPENCIL_SPIKE_DEBUG__ = () => ({
    pageId: hostDocument.value?.pageId,
    layerCount: importedLayerCount.value,
    selectedNames: editor.value.getSelectedNodes().map((node) => node.name),
    selectedTextSelectionRange: buildUiState().inspector.selectedNode?.textSelectionRange ?? null,
    commands: buildCommandAvailability(editor.value.getSelectedNodes()),
    openPencilNodes: editor.value
      .getPages()
      .flatMap((page) => collectDebugNodes(page.id)),
    exportedScene: exportCurrentSketchScene(),
    dirtyNotifyCount,
    dirtyPostCount,
    lastDirtyNodeCount,
    lastPatchOperationCount,
    lastPatchStatus,
    lastHostPostType,
    lastHostPostError,
    viewport: buildDebugViewport(),
  });
  getDebugScope().__OPENPENCIL_SPIKE_DEBUG_SELECT_TEXT_WORD__ = selectDebugTextWord;
  getDebugScope().__OPENPENCIL_SPIKE_DEBUG_OVERRIDE_TEXT_SELECTION_RANGE__ =
    overrideDebugTextSelectionRange;
  postToHost(createOpenPencilReadyMessage());
  statePollInterval = window.setInterval(() => {
    stateVersion.value += 1;
    if (bridgeStatus.value === "loaded") postUiState();
  }, 500);
});

onBeforeUnmount(() => {
  window.removeEventListener("message", handleHostMessage);
  window.removeEventListener("error", handleWindowError);
  window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  delete getDebugScope().__OPENPENCIL_SPIKE_DEBUG__;
  delete getDebugScope().__OPENPENCIL_SPIKE_DEBUG_SELECT_TEXT_WORD__;
  delete getDebugScope().__OPENPENCIL_SPIKE_DEBUG_OVERRIDE_TEXT_SELECTION_RANGE__;
  unsubscribeGraphEvents?.();
  unsubscribeGraphEvents = null;
  if (dirtyExportTimeout !== null) {
    window.clearTimeout(dirtyExportTimeout);
    dirtyExportTimeout = null;
  }
  if (statePollInterval !== null) {
    window.clearInterval(statePollInterval);
    statePollInterval = null;
  }
});
</script>

<template>
  <div class="spike-shell">
    <header class="topbar">
      <div class="page-meta">
        <span
          class="status-dot"
          :data-loaded="bridgeStatus === 'loaded'"
          :data-error="bridgeStatus === 'error'"
        />
        <span class="page-title">{{ hostDocument?.pageName || "单页面 OpenPencil 编辑 Spike" }}</span>
        <span class="page-size">{{ Math.round(editorWidth) }} x {{ Math.round(editorHeight) }}</span>
      </div>
      <div class="tools">
        <button
          v-for="tool in tools"
          :key="tool.key"
          type="button"
          class="tool-button"
          :data-active="activeTool === tool.key"
          :title="tool.label"
          @click="editor.setTool(tool.key)"
        >
          {{ tool.label }}
        </button>
      </div>
      <div class="commands">
        <button
          v-for="item in editMenu"
          :key="item.id"
          type="button"
          class="command-button"
          :disabled="!isEditCommandTypeAvailable(item.command)"
          @click="applyEditCommand({ type: item.command })"
        >
          {{ item.label }}
        </button>
      </div>
    </header>

    <main class="canvas-region">
      <div v-if="editorError" class="editor-error" role="alert">
        <div class="editor-error-title">手绘编辑器加载失败</div>
        <div class="editor-error-message">{{ editorError.message }}</div>
        <div class="editor-error-hint">
          请检查 CanvasKit wasm、编辑器字体文件、图片资源地址或跨域配置后重新进入手绘编辑。
        </div>
      </div>
      <CanvasRoot v-else>
        <WorkbenchCanvasSurface class="canvas-surface" />
      </CanvasRoot>
    </main>
  </div>
</template>

<style scoped>
.spike-shell {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-rows: 48px minmax(0, 1fr);
  background: #0b0f17;
  color: #d9dee8;
}

.topbar {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(220px, 340px) minmax(0, 1fr) minmax(260px, auto);
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #232b3a;
  background: #101620;
  padding: 0 12px;
}

.page-meta,
.tools,
.commands {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.tools {
  overflow-x: auto;
}

.commands {
  justify-content: flex-end;
}

.status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #7c8798;
}

.status-dot[data-loaded="true"] {
  background: #2dd4bf;
}

.status-dot[data-error="true"] {
  background: #f97316;
}

.page-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.page-size {
  color: #8d98aa;
  font-size: 12px;
}

.tool-button,
.command-button,
.panel-action,
.panel-row {
  border: 1px solid #2a3445;
  background: #151d2a;
  color: #d9dee8;
}

.tool-button,
.command-button,
.panel-action {
  height: 28px;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 12px;
}

.tool-button[data-active="true"],
.panel-row[data-active="true"] {
  border-color: #3b82f6;
  background: #123166;
}

.command-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.canvas-region {
  position: relative;
  min-width: 0;
  min-height: 0;
  background: #0a0d13;
}

.canvas-surface {
  display: block;
  width: 100%;
  height: 100%;
}

.editor-error {
  position: absolute;
  left: 50%;
  top: 50%;
  display: grid;
  width: min(520px, calc(100% - 48px));
  transform: translate(-50%, -50%);
  gap: 10px;
  border: 1px solid rgba(249, 115, 22, 0.45);
  border-radius: 8px;
  background: rgba(20, 14, 10, 0.94);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
  padding: 18px;
}

.editor-error-title {
  color: #fed7aa;
  font-size: 15px;
  font-weight: 700;
}

.editor-error-message,
.editor-error-hint {
  color: #d9dee8;
  font-size: 13px;
  line-height: 1.55;
}

.editor-error-hint {
  color: #9da8ba;
}

</style>
