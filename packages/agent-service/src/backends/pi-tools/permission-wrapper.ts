import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import {
  isPathAllowed,
  DEFAULT_WORKSPACE_PERMISSIONS,
  type PermissionConfig,
} from "./permissions";

export interface PathPermissionDeniedResult {
  content: Array<{ type: "text"; text: string }>;
  details: { path: string; error: string };
  isError: true;
}

export interface PathPermissionCheckResult {
  allowed: boolean;
  denied?: PathPermissionDeniedResult;
}

export function checkPathPermission(
  targetPath: string,
  workingDir: string,
  permissions: PermissionConfig,
  toolName: string,
): PathPermissionCheckResult {
  if (isPathAllowed(targetPath, workingDir, permissions)) {
    return { allowed: true };
  }
  logger.warn({ path: targetPath }, `${toolName} denied by permissions`);
  return {
    allowed: false,
    denied: {
      content: [
        {
          type: "text",
          text: `Error: path "${targetPath}" is not allowed by workspace permissions`,
        },
      ],
      details: { path: targetPath, error: "permission denied" },
      isError: true,
    },
  };
}

export function withPathPermissionCheck<TArgs, TResult>(
  config: AgentConfig,
  toolName: string,
  pathExtractor: (args: TArgs) => string,
  executeFn: (
    toolCallId: string,
    args: TArgs,
    signal: AbortSignal | undefined,
    onUpdate: ((partialResult: any) => void) | undefined,
  ) => Promise<TResult>,
) {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  const workingDir = config.workingDir || "";

  return async (
    toolCallId: string,
    args: TArgs,
    signal?: AbortSignal,
    onUpdate?: (partialResult: any) => void,
  ): Promise<TResult> => {
    const targetPath = pathExtractor(args);
    const check = checkPathPermission(
      targetPath,
      workingDir,
      permissions,
      toolName,
    );
    if (!check.allowed) {
      return check.denied as TResult;
    }
    return executeFn(toolCallId, args, signal, onUpdate);
  };
}
