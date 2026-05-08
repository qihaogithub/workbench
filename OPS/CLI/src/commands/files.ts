import chalk from "chalk";
import { request, createSpinner, showSuccess, showError, outputJson } from "../utils.js";

interface FileEntry {
  path: string;
  action: string;
  content?: string;
}

interface FilesData {
  sessionId: string;
  files: FileEntry[];
  staged: FileEntry[];
  unstaged: FileEntry[];
}

export async function listFiles(
  baseUrl: string,
  sessionId: string,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在获取变更文件列表...", jsonMode);

  try {
    const response = await request<FilesData>(
      baseUrl,
      `/api/agent/${sessionId}/files`,
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

    const data = response.data;

    if (jsonMode) {
      outputJson({ success: true, ...data });
      return;
    }

    console.log(chalk.cyan("\n=== 变更文件列表 ===\n"));
    console.log(chalk.gray(`会话 ID: ${sessionId}`));
    console.log(chalk.gray(`总变更文件: ${data.files.length}`));
    console.log(chalk.gray(`已暂存: ${data.staged.length}`));
    console.log(chalk.gray(`未暂存: ${data.unstaged.length}`));
    console.log("");

    if (data.staged.length > 0) {
      console.log(chalk.green("已暂存:"));
      for (const file of data.staged) {
        const actionColor = getActionColor(file.action);
        console.log(chalk.gray(`  ${actionColor(file.action.padEnd(8))} ${file.path}`));
      }
      console.log("");
    }

    if (data.unstaged.length > 0) {
      console.log(chalk.yellow("未暂存:"));
      for (const file of data.unstaged) {
        const actionColor = getActionColor(file.action);
        console.log(chalk.gray(`  ${actionColor(file.action.padEnd(8))} ${file.path}`));
      }
      console.log("");
    }

    if (data.files.length === 0) {
      console.log(chalk.gray("没有变更文件"));
      console.log("");
    }
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

function getActionColor(action: string): (text: string) => string {
  switch (action) {
    case "created":
      return chalk.green;
    case "modified":
      return chalk.yellow;
    case "deleted":
      return chalk.red;
    default:
      return chalk.white;
  }
}
