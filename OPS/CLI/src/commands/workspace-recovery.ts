import chalk from "chalk";

import { createSpinner, outputJson, request, showError, showSuccess, showWarning } from "../utils.js";

export interface WorkspaceRecoveryRebuildOptions {
  projectId: string;
  failedWorkspaceId: string;
  sourceVersionId: string;
  sessionId: string;
  idempotencyKey: string;
  apply: boolean;
}

interface WorkspaceRecoveryResult {
  applied: boolean;
  recoveryId: string;
  projectId: string;
  sourceVersionId: string;
  failedWorkspaceId: string;
  newWorkspaceId?: string;
  recoveryBundlePath?: string;
  sourceRootHash: string;
  sourceResourceCount: number;
  diffSummary: {
    currentResourceCount: number;
    sourceResourceCount: number;
    added: string[];
    removed: string[];
    changed: string[];
  };
  archivedSessionCount: number;
  authority?: {
    revision: number;
    rootHash: string;
    ready: boolean;
    missingBackupCount: number;
    stagingCount: number;
  };
  finalHealth?: {
    ready: boolean;
    condition: string;
    recommendedAction: string;
    missingBackupHashCount: number;
    externalDrift: boolean;
  };
}

export async function workspaceRecoveryRebuild(
  baseUrl: string,
  options: WorkspaceRecoveryRebuildOptions,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner(options.apply ? "正在重建 Workspace..." : "正在检查 Workspace 重建方案...", jsonMode);
  try {
    const response = await request<WorkspaceRecoveryResult>(
      baseUrl,
      `/api/workspace-recovery/projects/${encodeURIComponent(options.projectId)}` +
        `/workspaces/${encodeURIComponent(options.failedWorkspaceId)}/rebuild`,
      {
        method: "POST",
        body: {
          sessionId: options.sessionId,
          sourceVersionId: options.sourceVersionId,
          idempotencyKey: options.idempotencyKey,
          apply: options.apply,
        },
      },
    );
    spinner.stop();
    if (!response.success || !response.data) {
      if (jsonMode) {
        outputJson({ success: false, applied: false, error: response.error });
        return;
      }
      showError("Workspace 重建失败", response.error);
      process.exitCode = 1;
      return;
    }
    if (jsonMode) {
      outputJson({ success: true, ...response.data });
      return;
    }
    if (response.data.applied) showSuccess("Workspace 重建完成");
    else showWarning("Dry-run 完成；未修改任何数据，确认后加 --apply");
    console.log(chalk.gray(`  recoveryId: ${response.data.recoveryId}`));
    console.log(chalk.gray(`  sourceVersion: ${response.data.sourceVersionId}`));
    console.log(chalk.gray(`  sourceRootHash: ${response.data.sourceRootHash}`));
    console.log(chalk.gray(`  changed: ${response.data.diffSummary.changed.length}`));
    console.log(chalk.gray(`  added: ${response.data.diffSummary.added.length}`));
    console.log(chalk.gray(`  removed: ${response.data.diffSummary.removed.length}`));
    if (response.data.newWorkspaceId) console.log(chalk.gray(`  newWorkspaceId: ${response.data.newWorkspaceId}`));
    if (response.data.authority) {
      console.log(chalk.gray(`  authority: revision=${response.data.authority.revision}, ready=${response.data.authority.ready}`));
    }
    if (response.data.finalHealth) {
      console.log(chalk.gray(`  finalHealth: condition=${response.data.finalHealth.condition}, recommendedAction=${response.data.finalHealth.recommendedAction}`));
    }
  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : "未知错误";
    if (jsonMode) outputJson({ success: false, applied: false, error: { code: "WORKSPACE_RECOVERY_FAILED", message } });
    else {
      showError("无法执行 Workspace 重建", { code: "WORKSPACE_RECOVERY_FAILED", message });
      process.exitCode = 1;
    }
  }
}
