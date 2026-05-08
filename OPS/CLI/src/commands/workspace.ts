import chalk from "chalk";
import { request, createSpinner, showSuccess, showError, outputJson } from "../utils.js";

interface WorkspaceInfo {
  sessionId: string;
  workingDir: string;
  displayName: string;
  customWorkspace: boolean;
  workspaceType: string;
  snapshotMode: string;
  snapshotBranch: string;
}

export async function getWorkspace(
  baseUrl: string,
  sessionId: string,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在查询工作空间信息...", jsonMode);

  try {
    const response = await request<WorkspaceInfo>(
      baseUrl,
      `/api/agent/${sessionId}/workspace`,
    );
    spinner.stop();

    if (!response.success) {
      if (jsonMode) {
        outputJson({ success: false, sessionId, error: response.error });
        return;
      }
      showError("查询失败", response.error);
      process.exit(1);
    }

    const info = response.data;

    if (jsonMode) {
      outputJson({ success: true, workspace: info });
      return;
    }

    console.log(chalk.cyan("\n=== 工作空间信息 ===\n"));
    console.log(chalk.gray(`会话 ID: ${sessionId}`));
    console.log(chalk.gray(`工作目录: ${info.workingDir}`));
    console.log(chalk.gray(`显示名称: ${info.displayName}`));
    console.log(chalk.gray(`自定义工作空间: ${info.customWorkspace ? "是" : "否"}`));
    console.log(chalk.gray(`工作空间类型: ${info.workspaceType}`));
    console.log(chalk.gray(`快照模式: ${info.snapshotMode}`));
    console.log(chalk.gray(`快照分支: ${info.snapshotBranch}`));
    console.log("");
  } catch (error) {
    spinner.stop();
    if (jsonMode) {
      outputJson({ success: false, sessionId, error: error instanceof Error ? error.message : "未知错误" });
      return;
    }
    showError("请求失败");
    console.error(chalk.red(`\n错误详情: ${error instanceof Error ? error.message : "未知错误"}`));
    process.exit(1);
  }
}

export async function updateWorkspace(
  baseUrl: string,
  sessionId: string,
  workingDir: string,
  customWorkspace?: boolean,
  jsonMode?: boolean,
): Promise<void> {
  const spinner = createSpinner("正在更新工作空间...", jsonMode);

  try {
    const body: Record<string, unknown> = { workingDir };
    if (customWorkspace !== undefined) {
      body.customWorkspace = customWorkspace;
    }

    const response = await request<WorkspaceInfo>(
      baseUrl,
      `/api/agent/${sessionId}/workspace`,
      {
        method: "PUT",
        body,
      },
    );
    spinner.stop();

    if (!response.success) {
      if (jsonMode) {
        outputJson({ success: false, sessionId, error: response.error });
        return;
      }
      showError("更新失败", response.error);
      process.exit(1);
    }

    const info = response.data;

    if (jsonMode) {
      outputJson({ success: true, workspace: info });
      return;
    }

    showSuccess("工作空间已更新");
    console.log(chalk.gray(`\n会话 ID: ${sessionId}`));
    console.log(chalk.gray(`工作目录: ${info.workingDir}`));
    console.log(chalk.gray(`显示名称: ${info.displayName}`));
    console.log(chalk.gray(`自定义工作空间: ${info.customWorkspace ? "是" : "否"}`));
    console.log(chalk.gray(`工作空间类型: ${info.workspaceType}`));
    console.log("");
  } catch (error) {
    spinner.stop();
    if (jsonMode) {
      outputJson({ success: false, sessionId, error: error instanceof Error ? error.message : "未知错误" });
      return;
    }
    showError("请求失败");
    console.error(chalk.red(`\n错误详情: ${error instanceof Error ? error.message : "未知错误"}`));
    process.exit(1);
  }
}
