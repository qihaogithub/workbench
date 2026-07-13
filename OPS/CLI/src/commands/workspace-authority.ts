import chalk from "chalk";

import type { WorkspaceAuthorityHealthStatus } from "../types.js";
import {
  createSpinner,
  outputJson,
  request,
  showError,
  showSuccess,
  showWarning,
} from "../utils.js";

export interface WorkspaceAuthorityStatusOptions {
  projectId: string;
  workspaceId: string;
  sessionId: string;
}

export interface WorkspaceAuthorityWriteOptions extends WorkspaceAuthorityStatusOptions {
  apply: boolean;
}

export interface WorkspaceAuthorityPreflightOptions extends WorkspaceAuthorityStatusOptions {
  failOnQueue: boolean;
  failOnStaging: boolean;
}

interface WorkspaceAuthorityState {
  workspaceId: string;
  projectId: string;
  revision: number;
  rootHash: string;
  resourceHashes: Record<string, string>;
  updatedAt: number;
}

function healthWarnings(data: WorkspaceAuthorityHealthStatus): string[] {
  const warnings: string[] = [];
  if (!data.workspaceExists) warnings.push("workspace missing");
  if (!data.stateExists) warnings.push("authority state missing");
  if (data.externalDrift) warnings.push("external drift detected");
  if (data.activeLease) warnings.push("active or stale write lease exists");
  if (data.preparedCount > 0) warnings.push("prepared transactions need recovery");
  if (data.missingBackupCount > 0) warnings.push("committed backups are incomplete");
  if (data.queueDepth > 0) warnings.push("workspace mutation queue is not empty");
  return warnings;
}

function preflightIssues(
  data: WorkspaceAuthorityHealthStatus,
  options: Pick<WorkspaceAuthorityPreflightOptions, "failOnQueue" | "failOnStaging">,
): string[] {
  const issues: string[] = [];
  if (!data.workspaceExists) issues.push("workspace missing");
  if (!data.stateExists) issues.push("authority state missing");
  if (data.externalDrift) issues.push("external drift detected");
  if (data.activeLease) issues.push("active or stale write lease exists");
  if (data.preparedCount > 0) issues.push("prepared transactions need recovery");
  if (data.missingBackupCount > 0) issues.push("committed backups are incomplete");
  if (options.failOnQueue && data.queueDepth > 0) {
    issues.push("workspace mutation queue is not empty");
  }
  if (options.failOnStaging && data.stagingCount > 0) {
    issues.push("staging files exist");
  }
  return issues;
}

function healthPath(options: WorkspaceAuthorityStatusOptions): string {
  return (
    `/api/workspace-authority/projects/${encodeURIComponent(options.projectId)}` +
    `/workspaces/${encodeURIComponent(options.workspaceId)}` +
    `/health?sessionId=${encodeURIComponent(options.sessionId)}`
  );
}

function statePath(options: WorkspaceAuthorityStatusOptions): string {
  return (
    `/api/workspace-authority/projects/${encodeURIComponent(options.projectId)}` +
    `/workspaces/${encodeURIComponent(options.workspaceId)}` +
    `/state?sessionId=${encodeURIComponent(options.sessionId)}`
  );
}

function reconcileAdoptPath(options: WorkspaceAuthorityStatusOptions): string {
  return (
    `/api/workspace-authority/projects/${encodeURIComponent(options.projectId)}` +
    `/workspaces/${encodeURIComponent(options.workspaceId)}` +
    `/reconcile/adopt?sessionId=${encodeURIComponent(options.sessionId)}`
  );
}

function reconcileRestorePath(options: WorkspaceAuthorityStatusOptions): string {
  return (
    `/api/workspace-authority/projects/${encodeURIComponent(options.projectId)}` +
    `/workspaces/${encodeURIComponent(options.workspaceId)}` +
    `/reconcile/restore?sessionId=${encodeURIComponent(options.sessionId)}`
  );
}

async function fetchHealth(
  baseUrl: string,
  options: WorkspaceAuthorityStatusOptions,
) {
  return request<WorkspaceAuthorityHealthStatus>(baseUrl, healthPath(options));
}

export async function workspaceAuthorityStatus(
  baseUrl: string,
  options: WorkspaceAuthorityStatusOptions,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在查询 Workspace Authority 状态...", jsonMode);

  try {
    const response = await fetchHealth(baseUrl, options);
    spinner.stop();

    if (!response.success) {
      if (jsonMode) {
        outputJson({
          success: false,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          error: response.error,
        });
        return;
      }
      showError("Workspace Authority 状态查询失败", response.error);
      process.exit(1);
    }

    const warnings = healthWarnings(response.data);
    if (jsonMode) {
      outputJson({
        success: true,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        status: response.data,
        warnings,
      });
      return;
    }

    if (response.data.ready) {
      showSuccess("Workspace Authority ready");
    } else {
      showWarning("Workspace Authority 未就绪或需要处理");
    }
    console.log(chalk.gray("\n详细信息:"));
    console.log(chalk.gray(`  projectId: ${response.data.projectId ?? options.projectId}`));
    console.log(chalk.gray(`  workspaceId: ${response.data.workspaceId}`));
    console.log(chalk.gray(`  revision: ${response.data.revision ?? "n/a"}`));
    console.log(chalk.gray(`  rootHash: ${response.data.rootHash ?? "n/a"}`));
    console.log(chalk.gray(`  actualRootHash: ${response.data.actualRootHash ?? "n/a"}`));
    console.log(chalk.gray(`  queueDepth: ${response.data.queueDepth}`));
    console.log(chalk.gray(`  activeLease: ${response.data.activeLease}`));
    console.log(chalk.gray(`  preparedCount: ${response.data.preparedCount}`));
    console.log(chalk.gray(`  recoveryState: ${response.data.recoveryState}`));
    console.log(chalk.gray(`  recoveryPendingCount: ${response.data.recoveryPendingCount}`));
    console.log(chalk.gray(`  conflictCount: ${response.data.conflictCount}`));
    console.log(chalk.gray(`  eventSubscriberCount: ${response.data.eventSubscriberCount}`));
    console.log(chalk.gray(`  stagingCount: ${response.data.stagingCount}`));
    console.log(chalk.gray(`  backupCount: ${response.data.backupCount}`));
    console.log(chalk.gray(`  missingBackupCount: ${response.data.missingBackupCount}`));
    console.log(chalk.gray(`  receiptCount: ${response.data.receiptCount}`));
    console.log(chalk.gray(`  journalEntries: ${response.data.journalEntries}`));
    console.log(chalk.gray(`  projectionAckEntries: ${response.data.projectionAckEntries}`));
    console.log(chalk.gray(`  checkedAt: ${new Date(response.data.checkedAt).toISOString()}`));
    if (warnings.length) {
      console.log(chalk.yellow("\n风险:"));
      for (const warning of warnings) console.log(chalk.yellow(`  - ${warning}`));
    }
    console.log(chalk.gray(`\n服务地址: ${baseUrl}`));
  } catch (error) {
    spinner.stop();

    if (jsonMode) {
      outputJson({
        success: false,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        error: {
          code: "WORKSPACE_AUTHORITY_STATUS_FAILED",
          message: error instanceof Error ? error.message : "未知错误",
        },
      });
      return;
    }

    showError("无法查询 Workspace Authority 状态", {
      code: "WORKSPACE_AUTHORITY_STATUS_FAILED",
      message: error instanceof Error ? error.message : "未知错误",
    });
    process.exit(1);
  }
}

export async function workspaceAuthorityPreflight(
  baseUrl: string,
  options: WorkspaceAuthorityPreflightOptions,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在执行 Workspace Authority preflight...", jsonMode);

  try {
    const response = await fetchHealth(baseUrl, options);
    spinner.stop();

    if (!response.success) {
      if (jsonMode) {
        outputJson({
          success: false,
          passed: false,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          error: response.error,
        });
        return;
      }
      showError("Workspace Authority preflight 查询失败", response.error);
      process.exit(1);
    }

    const issues = preflightIssues(response.data, options);
    const passed = issues.length === 0;
    if (jsonMode) {
      outputJson({
        success: true,
        passed,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        status: response.data,
        issues,
        warnings: healthWarnings(response.data),
      });
      return;
    }

    if (passed) {
      showSuccess("Workspace Authority preflight 通过");
    } else {
      showError("Workspace Authority preflight 未通过", {
        code: "WORKSPACE_AUTHORITY_PREFLIGHT_FAILED",
        message: issues.join("; "),
      });
    }
    console.log(chalk.gray(`  ready: ${response.data.ready}`));
    console.log(chalk.gray(`  revision: ${response.data.revision ?? "n/a"}`));
    console.log(chalk.gray(`  rootHash: ${response.data.rootHash ?? "n/a"}`));
    console.log(chalk.gray(`  actualRootHash: ${response.data.actualRootHash ?? "n/a"}`));
    if (issues.length) {
      console.log(chalk.yellow("\n阻断项:"));
      for (const issue of issues) console.log(chalk.yellow(`  - ${issue}`));
      process.exit(1);
    }
  } catch (error) {
    spinner.stop();

    if (jsonMode) {
      outputJson({
        success: false,
        passed: false,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        error: {
          code: "WORKSPACE_AUTHORITY_PREFLIGHT_FAILED",
          message: error instanceof Error ? error.message : "未知错误",
        },
      });
      return;
    }

    showError("无法执行 Workspace Authority preflight", {
      code: "WORKSPACE_AUTHORITY_PREFLIGHT_FAILED",
      message: error instanceof Error ? error.message : "未知错误",
    });
    process.exit(1);
  }
}

export async function workspaceAuthorityBootstrap(
  baseUrl: string,
  options: WorkspaceAuthorityWriteOptions,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在检查 Workspace Authority bootstrap 状态...", jsonMode);

  try {
    const health = await fetchHealth(baseUrl, options);
    if (!health.success) {
      spinner.stop();
      if (jsonMode) {
        outputJson({
          success: false,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          error: health.error,
        });
        return;
      }
      showError("Workspace Authority bootstrap 检查失败", health.error);
      process.exit(1);
    }

    if (health.data.stateExists || !options.apply) {
      spinner.stop();
      const action = health.data.stateExists ? "already_bootstrapped" : "would_bootstrap";
      if (jsonMode) {
        outputJson({
          success: true,
          action,
          applied: false,
          dryRun: !health.data.stateExists,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          status: health.data,
          warnings: healthWarnings(health.data),
        });
        return;
      }
      if (health.data.stateExists) showSuccess("Workspace Authority 已 bootstrap");
      else showWarning("dry-run: 将创建 Authority state；加 --apply 才会执行");
      return;
    }

    const bootstrapped = await request<WorkspaceAuthorityState>(
      baseUrl,
      statePath(options),
    );
    spinner.stop();

    if (!bootstrapped.success) {
      if (jsonMode) {
        outputJson({
          success: false,
          action: "bootstrap",
          applied: false,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          error: bootstrapped.error,
        });
        return;
      }
      showError("Workspace Authority bootstrap 失败", bootstrapped.error);
      process.exit(1);
    }

    if (jsonMode) {
      outputJson({
        success: true,
        action: "bootstrap",
        applied: true,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        state: bootstrapped.data,
      });
      return;
    }
    showSuccess("Workspace Authority bootstrap 已执行");
    console.log(chalk.gray(`  revision: ${bootstrapped.data.revision}`));
    console.log(chalk.gray(`  rootHash: ${bootstrapped.data.rootHash}`));
  } catch (error) {
    spinner.stop();
    if (jsonMode) {
      outputJson({
        success: false,
        action: "bootstrap",
        applied: false,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        error: {
          code: "WORKSPACE_AUTHORITY_BOOTSTRAP_FAILED",
          message: error instanceof Error ? error.message : "未知错误",
        },
      });
      return;
    }
    showError("Workspace Authority bootstrap 请求失败", {
      code: "WORKSPACE_AUTHORITY_BOOTSTRAP_FAILED",
      message: error instanceof Error ? error.message : "未知错误",
    });
    process.exit(1);
  }
}

export async function workspaceAuthorityReconcileAdopt(
  baseUrl: string,
  options: WorkspaceAuthorityWriteOptions,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在检查 Workspace Authority reconcile adopt 状态...", jsonMode);

  try {
    const health = await fetchHealth(baseUrl, options);
    if (!health.success) {
      spinner.stop();
      if (jsonMode) {
        outputJson({
          success: false,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          error: health.error,
        });
        return;
      }
      showError("Workspace Authority reconcile 检查失败", health.error);
      process.exit(1);
    }

    if (!health.data.externalDrift || !options.apply) {
      spinner.stop();
      const action = health.data.externalDrift ? "would_adopt" : "noop";
      if (jsonMode) {
        outputJson({
          success: true,
          action,
          applied: false,
          dryRun: health.data.externalDrift,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          status: health.data,
          warnings: healthWarnings(health.data),
        });
        return;
      }
      if (health.data.externalDrift) showWarning("dry-run: 将 adopt 当前磁盘内容为新 revision；加 --apply 才会执行");
      else showSuccess("Workspace Authority 无 external drift，无需 adopt");
      return;
    }

    const adopted = await request<WorkspaceAuthorityState>(
      baseUrl,
      reconcileAdoptPath(options),
      { method: "POST" },
    );
    spinner.stop();

    if (!adopted.success) {
      if (jsonMode) {
        outputJson({
          success: false,
          action: "reconcile_adopt",
          applied: false,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          error: adopted.error,
        });
        return;
      }
      showError("Workspace Authority reconcile adopt 失败", adopted.error);
      process.exit(1);
    }

    if (jsonMode) {
      outputJson({
        success: true,
        action: "reconcile_adopt",
        applied: true,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        state: adopted.data,
      });
      return;
    }
    showSuccess("Workspace Authority reconcile adopt 已执行");
    console.log(chalk.gray(`  revision: ${adopted.data.revision}`));
    console.log(chalk.gray(`  rootHash: ${adopted.data.rootHash}`));
  } catch (error) {
    spinner.stop();
    if (jsonMode) {
      outputJson({
        success: false,
        action: "reconcile_adopt",
        applied: false,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        error: {
          code: "WORKSPACE_AUTHORITY_RECONCILE_ADOPT_FAILED",
          message: error instanceof Error ? error.message : "未知错误",
        },
      });
      return;
    }
    showError("Workspace Authority reconcile adopt 请求失败", {
      code: "WORKSPACE_AUTHORITY_RECONCILE_ADOPT_FAILED",
      message: error instanceof Error ? error.message : "未知错误",
    });
    process.exit(1);
  }
}

export async function workspaceAuthorityReconcileRestore(
  baseUrl: string,
  options: WorkspaceAuthorityWriteOptions,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在检查 Workspace Authority reconcile restore 状态...", jsonMode);

  try {
    const health = await fetchHealth(baseUrl, options);
    if (!health.success) {
      spinner.stop();
      if (jsonMode) {
        outputJson({
          success: false,
          action: "reconcile_restore",
          applied: false,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          error: health.error,
        });
        return;
      }
      showError("Workspace Authority reconcile restore 检查失败", health.error);
      process.exit(1);
    }

    const issues: string[] = [];
    if (!health.data.stateExists) issues.push("authority state missing");
    if (health.data.activeLease) issues.push("active or stale write lease exists");
    if (health.data.preparedCount > 0) issues.push("prepared transactions need recovery");
    if (health.data.missingBackupCount > 0) issues.push("committed backups are incomplete");

    if (!health.data.externalDrift || !options.apply || issues.length > 0) {
      spinner.stop();
      const action = !health.data.externalDrift
        ? "noop"
        : issues.length > 0
          ? "restore_blocked"
          : "would_restore";
      if (jsonMode) {
        outputJson({
          success: issues.length === 0,
          action,
          applied: false,
          dryRun: action === "would_restore",
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          status: health.data,
          issues,
          warnings: healthWarnings(health.data),
        });
        return;
      }
      if (!health.data.externalDrift) {
        showSuccess("Workspace Authority 无 external drift，无需 restore");
      } else if (issues.length > 0) {
        showError("Workspace Authority reconcile restore 被阻断", {
          code: "WORKSPACE_AUTHORITY_RESTORE_BLOCKED",
          message: issues.join("; "),
        });
        process.exit(1);
      } else {
        showWarning("dry-run: 将恢复最后 committed 内容并丢弃外部漂移；加 --apply 才会执行");
      }
      return;
    }

    const restored = await request<WorkspaceAuthorityState>(
      baseUrl,
      reconcileRestorePath(options),
      { method: "POST" },
    );
    spinner.stop();

    if (!restored.success) {
      if (jsonMode) {
        outputJson({
          success: false,
          action: "reconcile_restore",
          applied: false,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
          error: restored.error,
        });
        return;
      }
      showError("Workspace Authority reconcile restore 失败", restored.error);
      process.exit(1);
    }

    if (jsonMode) {
      outputJson({
        success: true,
        action: "reconcile_restore",
        applied: true,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        state: restored.data,
      });
      return;
    }
    showSuccess("Workspace Authority reconcile restore 已执行");
    console.log(chalk.gray(`  revision: ${restored.data.revision}`));
    console.log(chalk.gray(`  rootHash: ${restored.data.rootHash}`));
  } catch (error) {
    spinner.stop();
    if (jsonMode) {
      outputJson({
        success: false,
        action: "reconcile_restore",
        applied: false,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        error: {
          code: "WORKSPACE_AUTHORITY_RECONCILE_RESTORE_FAILED",
          message: error instanceof Error ? error.message : "未知错误",
        },
      });
      return;
    }
    showError("Workspace Authority reconcile restore 请求失败", {
      code: "WORKSPACE_AUTHORITY_RECONCILE_RESTORE_FAILED",
      message: error instanceof Error ? error.message : "未知错误",
    });
    process.exit(1);
  }
}
