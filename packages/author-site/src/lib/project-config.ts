import path from "path";
import fs from "fs";
import { findWorkspacePath } from "./fs-utils";

// ============================================================
// 项目级共享配置（workspace/project.config.schema.json）
// 是否存在由文件存在性实时判定，不在 project.json 中持久化任何标记字段。
// ============================================================

const PROJECT_CONFIG_FILENAME = "project.config.schema.json";
const PROJECT_CONFIG_VALUES_FILENAME = "project.config.values.json";

export function getProjectConfigPath(workspacePath: string): string {
  return path.join(workspacePath, PROJECT_CONFIG_FILENAME);
}

export function getProjectConfigValuesPath(workspacePath: string): string {
  return path.join(workspacePath, PROJECT_CONFIG_VALUES_FILENAME);
}

/**
 * 读取项目级配置 Schema 内容（不存在时返回 undefined）
 */
export function getProjectConfigSchema(
  workspacePath: string,
): string | undefined {
  const filePath = getProjectConfigPath(workspacePath);
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * 写入项目级配置 Schema（创建或覆盖）
 */
export function saveProjectConfigSchema(
  workspacePath: string,
  schema: string,
): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  fs.writeFileSync(getProjectConfigPath(workspacePath), schema, "utf-8");
}

function isPlainConfigObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getProjectConfigValues(
  workspacePath: string,
): Record<string, unknown> | undefined {
  const filePath = getProjectConfigValuesPath(workspacePath);
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return isPlainConfigObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function saveProjectConfigValues(
  workspacePath: string,
  values: Record<string, unknown>,
): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  fs.writeFileSync(
    getProjectConfigValuesPath(workspacePath),
    JSON.stringify(values, null, 2),
    "utf-8",
  );
}

/**
 * 删除项目级配置 Schema 文件（无项目级配置）
 */
export function deleteProjectConfigSchema(workspacePath: string): boolean {
  const filePath = getProjectConfigPath(workspacePath);
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

/**
 * 通过 workspaceId 读取项目级配置 Schema
 */
export function getWorkspaceProjectConfigSchema(
  workspaceId: string,
): string | undefined {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return undefined;
  return getProjectConfigSchema(wsPath);
}

/**
 * 通过 workspaceId 写入项目级配置 Schema
 */
export function saveWorkspaceProjectConfigSchema(
  workspaceId: string,
  schema: string,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;
  saveProjectConfigSchema(wsPath, schema);
  return true;
}

/**
 * 通过 workspaceId 删除项目级配置 Schema
 */
export function deleteWorkspaceProjectConfigSchema(
  workspaceId: string,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;
  return deleteProjectConfigSchema(wsPath);
}
