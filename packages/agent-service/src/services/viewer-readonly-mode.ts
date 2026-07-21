import type { Project } from "@workbench/shared/contracts";
import { getViewerReadonlyToolCapabilities } from "../backends/pi-tools";
import type { AgentConfig } from "../core/types";
import { projectWorkspaceManager } from "../workspace/project-workspace-manager";
import {
  buildViewerAiPromptContext,
  buildViewerAiSystemPrompt,
} from "./viewer-ai-context";

export type AgentMode = "workbench" | "viewer-readonly";

/** viewer-readonly 模式下客户端随消息上报的浏览端上下文 */
export interface ViewerContextPayload {
  activePageId?: string;
  activeConfig?: Record<string, unknown>;
}

/** 解析客户端声明的 mode，非法值一律回退 workbench */
export function normalizeAgentMode(value: unknown): AgentMode {
  return value === "viewer-readonly" ? "viewer-readonly" : "workbench";
}

/** 浏览端只读权限：白名单文件 + 全量禁止命令，服务端强制，不信任客户端 */
export const VIEWER_READONLY_PERMISSIONS: AgentConfig["permissions"] = {
  allowedPaths: [
    "workspace-tree.json",
    "project.config.schema.json",
    "memory.md",
    "demos",
    "demos/**",
    "knowledge",
    "knowledge/**",
  ],
  deniedPatterns: [
    "**/*.env",
    "**/*.env.*",
    "**/.git",
    "**/.git/**",
    "**/node_modules",
    "**/node_modules/**",
    "**/.session.json",
    "**/.workspace.json",
  ],
  allowedCommands: [],
  deniedCommands: ["*"],
};

export interface ViewerReadonlySession {
  project: Project;
  /** 合入 AgentConfig 的只读约束，覆盖客户端传入的同名字段 */
  configPatch: Pick<
    AgentConfig,
    "workingDir" | "demoId" | "toolMode" | "toolVersion" | "permissions"
  >;
}

/**
 * 按 projectId 解析浏览端只读会话配置。
 * workingDir 由服务端从项目元数据解析，忽略客户端传入值。
 * 项目不存在时抛出 PROJECT_NOT_FOUND。
 */
export async function resolveViewerReadonlySession(
  projectId: string,
  viewerContext?: ViewerContextPayload,
): Promise<ViewerReadonlySession> {
  await projectWorkspaceManager.init();
  const { project } = await projectWorkspaceManager.getProject(projectId);

  return {
    project,
    configPatch: {
      workingDir: project.workspacePath,
      demoId: viewerContext?.activePageId,
      toolMode: "viewer-readonly",
      toolVersion: getViewerReadonlyToolCapabilities().toolVersion,
      permissions: VIEWER_READONLY_PERMISSIONS,
    },
  };
}

/**
 * 服务端拼接只读问答上下文（页面清单、当前配置、记忆、知识库索引）。
 * WS 会话存续期间 Agent 自身保留对话历史，无需客户端回传 history。
 */
export function buildViewerReadonlyContent(
  project: Project,
  viewerContext: ViewerContextPayload | undefined,
  userContent: string,
): string {
  const context = buildViewerAiPromptContext({
    project,
    activePageId: viewerContext?.activePageId,
    activeConfig: viewerContext?.activeConfig,
  });
  return `${context}\n\n## 当前使用者问题\n${userContent}`;
}

export { buildViewerAiSystemPrompt };
