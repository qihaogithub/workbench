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
  onNodeSelect?: (node: SketchSceneNode | null) => void;
  onSelectionChange?: (selection: SketchEditorSelection) => void;
}

export interface SketchPageEditorProps extends SketchPagePreviewProps {
  mode?: SketchEditorMode;
  onSceneChange?: (scene: SketchSceneDocument) => void;
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
  fillContainer?: boolean;
  mode?: SketchEditorMode;
}

export interface SketchPropertyPanelProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
}

export interface SketchEditorToolbarProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
}

export interface SketchLayerPanelProps extends SketchEditorPartProps {
  configData?: Record<string, unknown>;
}
