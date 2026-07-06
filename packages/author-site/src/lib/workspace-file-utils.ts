/**
 * 工作空间文件工具函数
 * 提供文件编辑权限判定、语言类型推断等公共逻辑
 */

import type { DemoPageRuntimeType } from "@workbench/shared";

/** 编辑器类型 */
export type FileEditorType = "code" | "markdown";

/** 可编辑文件的正则白名单 */
const EDITABLE_PATTERNS: RegExp[] = [
  /^demos\/[^/]+\/index\.tsx$/,
  /^demos\/[^/]+\/config\.schema\.json$/,
  /^demos\/[^/]+\/prototype\.html$/,
  /^demos\/[^/]+\/prototype\.css$/,
  /^demos\/[^/]+\/sketch\.scene\.json$/,
  /^demos\/[^/]+\/sketch\.meta\.json$/,
  /^project\.config\.schema\.json$/,
  /^memory\.md$/,
];

/**
 * 判断文件是否可编辑
 * 只有白名单内的文件允许通过 API 修改
 */
export function isFileEditable(filePath: string): boolean {
  const normalized = filePath.replace(/^\/+/, "");
  return EDITABLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * 根据文件扩展名返回编辑器类型
 * 只需在此函数添加新类型，WorkspaceCodeDialog 无需改动
 */
export function getFileEditorType(filePath: string): FileEditorType {
  if (filePath.endsWith(".md")) return "markdown";
  return "code";
}

/** 隐藏文件/目录列表（文件树中不显示） */
const HIDDEN_ENTRIES = new Set([
  "node_modules",
  ".git",
  ".workspace.json",
  ".folders.json",
]);

/** 在文档视图模式下额外隐藏的目录（由 KnowledgePanel 管理） */
const DOC_VIEW_HIDDEN_ENTRIES = new Set([
  "knowledge",
]);

/**
 * 判断文件/目录是否应在文件树中隐藏
 * @param name 文件/目录名
 * @param showKnowledge 是否显示 knowledge 目录（代码视图模式下为 true）
 */
export function isHiddenEntry(name: string, showKnowledge = false): boolean {
  if (HIDDEN_ENTRIES.has(name)) return true;
  if (!showKnowledge && DOC_VIEW_HIDDEN_ENTRIES.has(name)) return true;
  return false;
}

export function resolvePageRuntimeType(
  runtimeType?: DemoPageRuntimeType | null,
): DemoPageRuntimeType {
  if (runtimeType === "prototype-html-css") return "prototype-html-css";
  if (runtimeType === "sketch-scene") return "sketch-scene";
  return "high-fidelity-react";
}

export function isEmptyConfigSchemaContent(content?: string | null): boolean {
  if (!content || !content.trim()) return true;
  try {
    const parsed = JSON.parse(content) as { properties?: unknown };
    return (
      parsed.properties !== undefined &&
      typeof parsed.properties === "object" &&
      parsed.properties !== null &&
      !Array.isArray(parsed.properties) &&
      Object.keys(parsed.properties).length === 0
    );
  } catch {
    return false;
  }
}

export function isVisiblePageRuntimeFile(input: {
  fileName: string;
  runtimeType?: DemoPageRuntimeType | null;
  schemaContent?: string | null;
}): boolean {
  const runtimeType = resolvePageRuntimeType(input.runtimeType);

  if (input.fileName === "prototype.meta.json") return false;
  if (input.fileName === "sketch.meta.json") return false;
  if (input.fileName === "config.schema.json") {
    return !isEmptyConfigSchemaContent(input.schemaContent);
  }
  if (runtimeType === "prototype-html-css") {
    return (
      input.fileName === "prototype.html" ||
      input.fileName === "prototype.css"
    );
  }
  if (
    input.fileName === "prototype.html" ||
    input.fileName === "prototype.css"
  ) {
    return false;
  }
  if (runtimeType === "sketch-scene") {
    return input.fileName === "sketch.scene.json";
  }
  if (input.fileName === "sketch.scene.json") {
    return false;
  }
  return true;
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
