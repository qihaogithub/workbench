/**
 * 工作空间文件工具函数
 * 提供文件编辑权限判定、语言类型推断等公共逻辑
 */

/** 可编辑文件的正则白名单 */
const EDITABLE_PATTERNS: RegExp[] = [
  /^demos\/[^/]+\/index\.tsx$/,
  /^demos\/[^/]+\/config\.schema\.json$/,
  /^project\.config\.schema\.json$/,
];

/**
 * 判断文件是否可编辑
 * 只有白名单内的文件允许通过 API 修改
 */
export function isFileEditable(filePath: string): boolean {
  const normalized = filePath.replace(/^\/+/, "");
  return EDITABLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** 隐藏文件/目录列表（文件树中不显示） */
const HIDDEN_ENTRIES = new Set([
  ".opencode",
  "node_modules",
  ".git",
  ".workspace.json",
  ".folders.json",
]);

/**
 * 判断文件/目录是否应在文件树中隐藏
 */
export function isHiddenEntry(name: string): boolean {
  return HIDDEN_ENTRIES.has(name);
}

/**
 * 根据文件扩展名推断 CodeMirror 语言类型
 */
export function getFileLanguage(
  filePath: string,
): "typescript" | "json" | "text" {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".ts"))
    return "typescript";
  if (filePath.endsWith(".json")) return "json";
  return "text";
}

/**
 * 根据文件名返回图标名称（lucide-react 组件名提示）
 */
export function getFileIcon(name: string): "tsx" | "json" | "folder" | "file" {
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return "tsx";
  if (name.endsWith(".json")) return "json";
  return "file";
}

/** 工作空间文件树节点类型 */
export interface WorkspaceFileNode {
  path: string;
  type: "file" | "directory";
  name: string;
  size?: number;
  children?: WorkspaceFileNode[];
}
