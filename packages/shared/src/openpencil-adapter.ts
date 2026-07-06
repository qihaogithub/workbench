import type {
  SketchSceneDocument,
  SketchSceneNodeBindings,
  SketchScenePatchOperation,
  SketchSceneTextStyleRun,
} from "./demo/sketch-scene";

export const OPENPENCIL_ADAPTER_SOURCE = "openpencil-spike" as const;

export const OPENPENCIL_HOST_MESSAGE_TYPES = {
  LOAD_DOCUMENT: "openpencil-spike/load-document",
  SELECT_NODE: "openpencil-spike/select-node",
  COMMAND: "openpencil-spike/command",
} as const;

export const OPENPENCIL_EDITOR_MESSAGE_TYPES = {
  READY: "openpencil-spike/ready",
  DOCUMENT_LOADED: "openpencil-spike/document-loaded",
  DIRTY_STATE: "openpencil-spike/dirty-state",
  UI_STATE: "openpencil-spike/ui-state",
  ERROR: "openpencil-spike/error",
} as const;

export type OpenPencilPreviewSize = {
  width?: number | string;
  height?: number | string;
};

export type OpenPencilLoadDocumentMessage = {
  type: typeof OPENPENCIL_HOST_MESSAGE_TYPES.LOAD_DOCUMENT;
  pageId: string;
  pageName?: string;
  scene?: unknown;
  configData?: Record<string, unknown>;
  previewSize?: OpenPencilPreviewSize;
  imageProxyUrl?: string;
};

export type OpenPencilSelectNodeMessage = {
  type: typeof OPENPENCIL_HOST_MESSAGE_TYPES.SELECT_NODE;
  pageId?: string;
  nodeId: string;
};

export type OpenPencilNodeUpdateChanges = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  src?: string;
  alt?: string;
  bindings?: SketchSceneNodeBindings;
  textStyleRuns?: SketchSceneTextStyleRun[];
};

export type OpenPencilSelectCommand = {
  type?: "select-node";
  nodeId: string;
  requestId?: number;
};

export type OpenPencilSelectNodesCommand = {
  type: "select-nodes";
  nodeIds: string[];
  requestId?: number;
};

export type OpenPencilUpdateNodeCommand = {
  type: "update-node" | "update-node-style";
  nodeId: string;
  requestId?: number;
  changes: OpenPencilNodeUpdateChanges;
};

export type OpenPencilEditCommand = {
  type:
    | "duplicate-selection"
    | "delete-selection"
    | "undo"
    | "redo"
    | "group-selection"
    | "ungroup-selection"
    | "zoom-to-selection";
  requestId?: number;
};

export type OpenPencilHostCommand =
  | OpenPencilSelectCommand
  | OpenPencilSelectNodesCommand
  | OpenPencilUpdateNodeCommand
  | OpenPencilEditCommand;

export type OpenPencilCommandMessage = {
  type: typeof OPENPENCIL_HOST_MESSAGE_TYPES.COMMAND;
  pageId?: string;
  command?: OpenPencilHostCommand;
};

export type OpenPencilHostMessage =
  | OpenPencilLoadDocumentMessage
  | OpenPencilSelectNodeMessage
  | OpenPencilCommandMessage;

export type OpenPencilCommandAvailability = {
  duplicateSelection: boolean;
  deleteSelection: boolean;
  groupSelection: boolean;
  ungroupSelection: boolean;
  zoomToSelection: boolean;
  undo: boolean;
  redo: boolean;
};

export type OpenPencilErrorCode =
  | "resource-load-failed"
  | "editor-initialization-failed"
  | "document-load-failed"
  | "runtime-error";

export type OpenPencilEditorError = {
  code: OpenPencilErrorCode;
  message: string;
  detail?: string;
  recoverable?: boolean;
};

export type OpenPencilLayerItem = {
  id: string;
  name: string;
  type: string;
  level: number;
  selected: boolean;
  childCount: number;
};

export type OpenPencilSelectionInfo = {
  count: number;
  type: string;
  current: string;
};

export type OpenPencilTextSelectionRange = {
  start: number;
  end: number;
  source?: "canvas" | "host";
};

export type OpenPencilInspectorNode = {
  id: string;
  name: string;
  type: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  textStyleRuns?: SketchSceneTextStyleRun[];
  textSelectionRange?: OpenPencilTextSelectionRange;
  supportsText: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  supportsGeometry: boolean;
  imageSrc?: string;
  imageAlt?: string;
  supportsImageResource: boolean;
  bindings: SketchSceneNodeBindings;
  supportsBindings: boolean;
};

export type OpenPencilUiState = {
  pageId?: string;
  pageName?: string;
  bridgeStatus: "waiting" | "loaded" | "error";
  error?: OpenPencilEditorError | null;
  configKeyCount: number;
  layerCount: number;
  layers: OpenPencilLayerItem[];
  selection: OpenPencilSelectionInfo;
  inspector: {
    selectedNode: OpenPencilInspectorNode | null;
  };
  commands: OpenPencilCommandAvailability;
};

type OpenPencilEditorMessageBase = {
  source?: typeof OPENPENCIL_ADAPTER_SOURCE;
  pageId?: string;
};

export type OpenPencilReadyMessage = OpenPencilEditorMessageBase & {
  type: typeof OPENPENCIL_EDITOR_MESSAGE_TYPES.READY;
};

export type OpenPencilDocumentLoadedMessage = OpenPencilEditorMessageBase & {
  type: typeof OPENPENCIL_EDITOR_MESSAGE_TYPES.DOCUMENT_LOADED;
  pageName?: string;
  width?: number;
  height?: number;
};

export type OpenPencilDirtyStateMessage = OpenPencilEditorMessageBase & {
  type: typeof OPENPENCIL_EDITOR_MESSAGE_TYPES.DIRTY_STATE;
  dirty?: boolean;
  nodeCount?: number;
  scene?: SketchSceneDocument | null;
  patchBaseSceneKey?: string;
  patchOperations?: SketchScenePatchOperation[];
};

export type OpenPencilUiStateMessage = OpenPencilEditorMessageBase & {
  type: typeof OPENPENCIL_EDITOR_MESSAGE_TYPES.UI_STATE;
  state?: OpenPencilUiState;
};

export type OpenPencilErrorMessage = OpenPencilEditorMessageBase & {
  type: typeof OPENPENCIL_EDITOR_MESSAGE_TYPES.ERROR;
  error: OpenPencilEditorError;
};

export type OpenPencilEditorMessage =
  | OpenPencilReadyMessage
  | OpenPencilDocumentLoadedMessage
  | OpenPencilDirtyStateMessage
  | OpenPencilUiStateMessage
  | OpenPencilErrorMessage;

export function isOpenPencilUpdateNodeCommand(
  command: OpenPencilHostCommand | undefined,
): command is OpenPencilUpdateNodeCommand {
  return command?.type === "update-node" || command?.type === "update-node-style";
}

export function isOpenPencilEditCommand(
  command: OpenPencilHostCommand | undefined,
): command is OpenPencilEditCommand {
  return (
    command?.type === "duplicate-selection" ||
    command?.type === "delete-selection" ||
    command?.type === "undo" ||
    command?.type === "redo" ||
    command?.type === "group-selection" ||
    command?.type === "ungroup-selection" ||
    command?.type === "zoom-to-selection"
  );
}

export function createOpenPencilLoadDocumentMessage(
  input: Omit<OpenPencilLoadDocumentMessage, "type">,
): OpenPencilLoadDocumentMessage {
  return {
    type: OPENPENCIL_HOST_MESSAGE_TYPES.LOAD_DOCUMENT,
    ...input,
  };
}

export function createOpenPencilSelectNodeMessage(
  input: Omit<OpenPencilSelectNodeMessage, "type">,
): OpenPencilSelectNodeMessage {
  return {
    type: OPENPENCIL_HOST_MESSAGE_TYPES.SELECT_NODE,
    ...input,
  };
}

export function createOpenPencilCommandMessage(
  input: Omit<OpenPencilCommandMessage, "type">,
): OpenPencilCommandMessage {
  return {
    type: OPENPENCIL_HOST_MESSAGE_TYPES.COMMAND,
    ...input,
  };
}

export function createOpenPencilReadyMessage(
  input: Omit<OpenPencilReadyMessage, "type" | "source"> = {},
): OpenPencilReadyMessage {
  return {
    type: OPENPENCIL_EDITOR_MESSAGE_TYPES.READY,
    source: OPENPENCIL_ADAPTER_SOURCE,
    ...input,
  };
}

export function createOpenPencilDocumentLoadedMessage(
  input: Omit<OpenPencilDocumentLoadedMessage, "type" | "source"> = {},
): OpenPencilDocumentLoadedMessage {
  return {
    type: OPENPENCIL_EDITOR_MESSAGE_TYPES.DOCUMENT_LOADED,
    source: OPENPENCIL_ADAPTER_SOURCE,
    ...input,
  };
}

export function createOpenPencilDirtyStateMessage(
  input: Omit<OpenPencilDirtyStateMessage, "type" | "source"> = {},
): OpenPencilDirtyStateMessage {
  return {
    type: OPENPENCIL_EDITOR_MESSAGE_TYPES.DIRTY_STATE,
    source: OPENPENCIL_ADAPTER_SOURCE,
    ...input,
  };
}

export function createOpenPencilUiStateMessage(
  input: Omit<OpenPencilUiStateMessage, "type" | "source"> = {},
): OpenPencilUiStateMessage {
  return {
    type: OPENPENCIL_EDITOR_MESSAGE_TYPES.UI_STATE,
    source: OPENPENCIL_ADAPTER_SOURCE,
    ...input,
  };
}

export function createOpenPencilErrorMessage(
  input: Omit<OpenPencilErrorMessage, "type" | "source">,
): OpenPencilErrorMessage {
  return {
    type: OPENPENCIL_EDITOR_MESSAGE_TYPES.ERROR,
    source: OPENPENCIL_ADAPTER_SOURCE,
    ...input,
  };
}

export function isOpenPencilEditorMessage(value: unknown): value is OpenPencilEditorMessage {
  if (!isRecord(value) || value.source !== OPENPENCIL_ADAPTER_SOURCE) return false;
  if (typeof value.pageId !== "undefined" && typeof value.pageId !== "string") return false;
  if (value.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.ERROR) {
    return isRecord(value.error) && typeof value.error.message === "string";
  }
  return (
    value.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.READY ||
    value.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.DOCUMENT_LOADED ||
    value.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.DIRTY_STATE ||
    value.type === OPENPENCIL_EDITOR_MESSAGE_TYPES.UI_STATE
  );
}

export function isOpenPencilHostMessage(value: unknown): value is OpenPencilHostMessage {
  if (!isRecord(value)) return false;
  if (value.type === OPENPENCIL_HOST_MESSAGE_TYPES.LOAD_DOCUMENT) {
    return (
      typeof value.pageId === "string" &&
      (typeof value.imageProxyUrl === "undefined" || typeof value.imageProxyUrl === "string")
    );
  }
  if (value.type === OPENPENCIL_HOST_MESSAGE_TYPES.SELECT_NODE) {
    return (
      typeof value.nodeId === "string" &&
      (typeof value.pageId === "undefined" || typeof value.pageId === "string")
    );
  }
  if (value.type === OPENPENCIL_HOST_MESSAGE_TYPES.COMMAND) {
    return (
      (typeof value.pageId === "undefined" || typeof value.pageId === "string") &&
      (typeof value.command === "undefined" || isOpenPencilHostCommand(value.command))
    );
  }
  return false;
}

function isOpenPencilHostCommand(value: unknown): value is OpenPencilHostCommand {
  if (!isRecord(value)) return false;
  if (typeof value.requestId !== "undefined" && typeof value.requestId !== "number") {
    return false;
  }
  if (
    (value.type === "select-node" || typeof value.type === "undefined") &&
    typeof value.nodeId === "string"
  ) {
    return true;
  }
  if (value.type === "select-nodes") {
    return Array.isArray(value.nodeIds) && value.nodeIds.every((nodeId) => typeof nodeId === "string");
  }
  if (
    (value.type === "update-node" || value.type === "update-node-style") &&
    typeof value.nodeId === "string"
  ) {
    return isRecord(value.changes);
  }
  return isOpenPencilEditCommand(value as OpenPencilHostCommand);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
