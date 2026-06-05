/** iframe → 父窗口消息类型 */
export type IframeOutMessageType =
  | 'READY'
  | 'LOADED'
  | 'COMPONENT_READY'
  | 'RUNTIME_ERROR'
  | 'RESIZE'
  | 'THUMBNAIL_LAYOUT_RESULT'
  | 'THUMBNAIL_LAYOUT_ERROR'
  | 'CONSOLE_LOG';

/** 父窗口 → iframe 消息类型 */
export type IframeInMessageType =
  | 'UPDATE_CODE'
  | 'UPDATE_CONFIG'
  | 'COLLECT_THUMBNAIL_LAYOUT';

/** 控制台日志条目（iframe postMessage payload） */
export interface ConsoleLogPayload {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: string;
  timestamp: number;
}
