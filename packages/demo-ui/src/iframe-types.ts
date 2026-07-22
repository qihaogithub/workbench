/** iframe → 父窗口消息类型 */
export type IframeOutMessageType =
  | 'READY'
  | 'LOADED'
  | 'COMPONENT_READY'
  | 'RUNTIME_ERROR'
  | 'RESIZE'
  | 'THUMBNAIL_LAYOUT_RESULT'
  | 'THUMBNAIL_LAYOUT_ERROR'
  | 'POSITIONABLE_SIZES_RESULT'
  | 'CONSOLE_LOG'
  | 'APP_ACTION'
  | 'VISUAL_SELECT'
  | 'VISUAL_INLINE_EDIT'
  | 'VISUAL_ANNOTATION_CREATE'
  | 'VISUAL_NODE_TREE_RESULT';

/** 父窗口 → iframe 消息类型 */
export type IframeInMessageType =
  | 'UPDATE_CODE'
  | 'UPDATE_CONFIG'
  | 'SLEEP'
  | 'WAKE'
  | 'COLLECT_THUMBNAIL_LAYOUT'
  | 'COLLECT_POSITIONABLE_SIZES'
  | 'UPDATE_VISUAL_EDIT_STATE'
  | 'COLLECT_VISUAL_NODE_TREE';

/** positionable 元素尺寸数据 */
export interface PositionableSizeItem {
  width: number;
  height: number;
}

/** 控制台日志条目（iframe postMessage payload） */
export interface ConsoleLogPayload {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: string;
  timestamp: number;
}

export interface AppActionPayload {
  event: string;
  payload?: Record<string, unknown>;
}

export interface VisualNodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualNodeInfo {
  nodeId: string;
  tagName: string;
  componentName?: string;
  className?: string;
  textContent?: string;
  domPath: string;
  parentPath?: string;
  rect: VisualNodeRect;
  attrs?: {
    src?: string;
    currentSrc?: string;
    alt?: string;
    href?: string;
    role?: string;
    ariaLabel?: string;
  };
  computedStyle?: {
    color?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    borderColor?: string;
    borderWidth?: string;
    borderStyle?: string;
    borderRadius?: string;
    borderTopLeftRadius?: string;
    borderTopRightRadius?: string;
    borderBottomRightRadius?: string;
    borderBottomLeftRadius?: string;
    boxShadow?: string;
    boxSizing?: string;
    filter?: string;
    overflow?: string;
    opacity?: string;
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    lineHeight?: string;
    letterSpacing?: string;
    textAlign?: string;
    width?: string;
    height?: string;
    padding?: string;
    paddingTop?: string;
    paddingRight?: string;
    paddingBottom?: string;
    paddingLeft?: string;
    margin?: string;
    marginTop?: string;
    marginRight?: string;
    marginBottom?: string;
    marginLeft?: string;
    display?: string;
    flexDirection?: string;
    justifyContent?: string;
    alignItems?: string;
    gap?: string;
  };
  sourceFile?: string;
  sourceStart?: number;
  sourceEnd?: number;
  sourceLine?: number;
  sourceColumn?: number;
  editCapabilities: Array<'annotate' | 'text' | 'image' | 'link' | 'style' | 'className' | 'structure'>;
}

export interface VisualNodeTreeItem extends VisualNodeInfo {
  children: VisualNodeTreeItem[];
}

export type VisualPropertyChangeKind = 'text' | 'style' | 'attribute';

export interface VisualPropertyChange {
  id: string;
  nodeId: string;
  domPath: string;
  kind: VisualPropertyChangeKind;
  property: string;
  label: string;
  value: string;
  previousValue?: string;
  resource?: {
    fileName?: string;
    mimeType?: string;
    size?: number;
    url?: string;
    temporary?: boolean;
  };
}

export interface VisualStyleChange {
  property: string;
  label: string;
  value: string;
  previousValue?: string;
}

export interface VisualAnnotation {
  id: string;
  nodeId: string;
  domPath: string;
  text: string;
  createdAt: number;
  styleChanges?: VisualStyleChange[];
  resolved?: boolean;
  patchId?: string;
}

export interface VisualInlineEditPayload {
  node: VisualNodeInfo;
  before: string;
  after: string;
}

export interface VisualEditPatch {
  id: string;
  title: string;
  file: string;
  range?: {
    startOffset: number;
    endOffset: number;
    startLine?: number;
    endLine?: number;
  };
  before: string;
  after: string;
  kind: 'text' | 'className' | 'structure' | 'listItem' | 'aiSuggestion';
  status: 'draft' | 'previewed' | 'accepted' | 'rejected' | 'reverted';
  node?: VisualNodeInfo;
  annotationId?: string;
  error?: string;
}
