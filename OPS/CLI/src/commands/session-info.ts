import chalk from "chalk";
import { request, createSpinner, showSuccess, showError, outputJson, formatDuration } from "../utils.js";
import type { AgentInfo } from "../types.js";

export async function getSessionInfo(baseUrl: string, sessionId: string, jsonMode: boolean): Promise<void> {
  const spinner = createSpinner("正在查询会话信息...", jsonMode);

  try {
    const response = await request<AgentInfo>(baseUrl, `/api/agent/${sessionId}`);
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
      outputJson({ success: true, session: info });
      return;
    }

    console.log(chalk.cyan("\n=== 会话信息 ===\n"));
    console.log(chalk.gray(`会话 ID: ${sessionId}\n`));
    showSuccess("会话信息");

    console.log(chalk.gray("\n详细信息:"));
    console.log(chalk.gray(`  会话 ID: ${info.sessionId}`));
    console.log(chalk.gray(`  状态: ${getStatusColor(info.status)(info.status)}`));
    console.log(chalk.gray(`  后端: ${info.backend}`));
    console.log(chalk.gray(`  消息数量: ${info.messageCount}`));
    console.log(chalk.gray(`  创建时间: ${new Date(info.createdAt).toLocaleString("zh-CN")}`));
    console.log(chalk.gray(`  最后活动: ${new Date(info.lastActivityAt).toLocaleString("zh-CN")}`));

    if (info.workingDir) {
      console.log(chalk.gray(`  工作目录: ${info.workingDir}`));
    }

    const createdAt = new Date(info.createdAt).getTime();
    const lastActivityAt = new Date(info.lastActivityAt).getTime();
    const age = lastActivityAt - createdAt;

    console.log(chalk.gray(`  会话存活时间: ${formatDuration(age)}`));
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

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case "ready":
      return chalk.green;
    case "processing":
      return chalk.yellow;
    case "error":
      return chalk.red;
    case "initializing":
      return chalk.blue;
    case "destroyed":
      return chalk.gray;
    default:
      return chalk.white;
  }
}
