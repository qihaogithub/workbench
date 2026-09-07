import type {
  SketchSceneBounds,
  SketchSceneDocument,
  SketchSceneNode,
  SketchScenePatchOperation,
} from "@workbench/sketch-core";

export type PreviewSize = {
  width?: number | string;
  height?: number | string;
};

export type SketchTool =
  | "select"
  | "hand"
  | "rect"
  | "diamond"
  | "ellipse"
  | "line"
  | "arrow"
  | "pencil"
  | "text"
  | "image"
  | "sticky"
  | "eraser";

export type SketchEditorMode = "edit" | "preview";

export type SketchBrushToolbarMode = "individual" | "grouped";

/** Viewport in the fixed page coordinate system used by the shared canvas. */
export interface SketchEditorViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export type SketchViewportChangeReason = "fit" | "interaction";

export type SketchEditorProfileName = "whiteboard";

export interface SketchEditorProfileConfig {
  /** Tools represented by the host's editor toolbar, including grouped entries. */
  visibleTools: readonly SketchTool[];
  /** Tools that may be activated for creation or direct tool interactions. */
  creationTools: readonly SketchTool[];
  brushToolbarMode: SketchBrushToolbarMode;
}

export const WHITEBOARD_EDITOR_TOOLS = [
  "select",
  "hand",
  "rect",
  "ellipse",
  "pencil",
  "eraser",
  "text",
  "image",
] as const satisfies readonly SketchTool[];

export const WHITEBOARD_EDITOR_PROFILE = {
  visibleTools: WHITEBOARD_EDITOR_TOOLS,
  creationTools: WHITEBOARD_EDITOR_TOOLS,
  brushToolbarMode: "grouped",
} as const satisfies SketchEditorProfileConfig;

export const SKETCH_EDITOR_PROFILES = {
  whiteboard: WHITEBOARD_EDITOR_PROFILE,
} as const satisfies Record<SketchEditorProfileName, SketchEditorProfileConfig>;

export function resolveSketchEditorProfile(
  profile?: SketchEditorProfileName,
): SketchEditorProfileConfig | undefined {
  return profile ? SKETCH_EDITOR_PROFILES[profile] : undefined;
}

export interface SketchBrushSettings {
  color: string;
  strokeWidth: number;
}

export interface SketchEditorSelection {
  nodeIds: string[];
  bounds: SketchSceneBounds | null;
}

export interface SketchPagePreviewProps {
  scene?: string | SketchSceneDocument | null;
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  fillContainer?: boolean;
  className?: string;
  selectedNodeId?: string | null;
  selectedNodeIds?: string[];
  /** Render one cropped image's full source while its crop frame is being edited. */
  imageCropEditingNodeId?: string | null;
  onNodeSelect?: (node: SketchSceneNode | null) => void;
  onSelectionChange?: (selection: SketchEditorSelection) => void;
}

export interface SketchPageEditorProps extends SketchPagePreviewProps {
  mode?: SketchEditorMode;
  onSceneChange?: (scene: SketchSceneDocument) => void;
}

/**
 * The shared editable workspace used by hosts that need the standard whiteboard
 * interaction model without the page editor's persistent inspector layout.
 */
export interface SketchEditorSurfaceProps {
  scene: SketchSceneDocument;
  configData?: Record<string, unknown>;
  /** Shared host profile; its tool and brush settings take precedence below. */
  profile?: SketchEditorProfileName;
  /** Optional capability gate used by whiteboard bridge profiles. */
  allowedTools?: readonly SketchTool[];
  /** Controls whether pencil and eraser are presented as one grouped toolbar entry. */
  brushToolbarMode?: SketchBrushToolbarMode;
  /** Optional initial viewport; omitted when the canvas should use its default view. */
  initialViewport?: SketchEditorViewport;
  /** Fits the page or visible scene content after the first measurable layout. */
  autoFitToContent?: boolean;
  fillContainer?: boolean;
  className?: string;
  onSceneChange?: (scene: SketchSceneDocument) => void;
  onSelectionChange?: (selection: SketchEditorSelection) => void;
  onViewportChange?: (
    viewport: SketchEditorViewport,
    reason: SketchViewportChangeReason,
  ) => void;
}

export interface InlineTextSelectionState {
  nodeId: string;
  start: number;
  end: number;
}

export interface SketchEditorController {
  keyboardScopeId: string;
  tool: SketchTool;
  setTool: (tool: SketchTool) => void;
  allowedTools?: readonly SketchTool[];
  brushSettings: SketchBrushSettings;
  setBrushSettings: (patch: Partial<SketchBrushSettings>) => void;
  selection: SketchEditorSelection;
  inlineTextSelection: InlineTextSelectionState | null;
  setInlineTextSelection: (selection: InlineTextSelectionState | null) => void;
  setNodeIds: (nextIds: string[]) => void;
  clearSelection: () => void;
  applyOperations: (operations: SketchScenePatchOperation[], recordHistory?: boolean) => void;
  commitScene: (scene: SketchSceneDocument, recordHistory?: boolean) => void;
  recordHistoryCheckpoint: (scene: SketchSceneDocument) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export interface SketchEditorPartProps {
  scene: SketchSceneDocument;
  controller: SketchEditorController;
  className?: string;
}

export interface SketchEditorCanvasProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  initialViewport?: SketchEditorViewport;
  autoFitToContent?: boolean;
  fillContainer?: boolean;
  mode?: SketchEditorMode;
  onViewportChange?: (
    viewport: SketchEditorViewport,
    reason: SketchViewportChangeReason,
  ) => void;
}

export interface SketchEditorCanvasHandle {
  openImageFilePicker: () => void;
}

export interface SketchPropertyPanelProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
}

export interface SketchEditorToolbarProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
  allowedTools?: readonly SketchTool[];
  brushToolbarMode?: SketchBrushToolbarMode;
  /** Opens the canvas-owned image picker and inserts the selected file. */
  onImageUpload: () => void;
}

export interface SketchLayerPanelProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
}
