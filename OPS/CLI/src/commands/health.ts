/**
 * 健康检查命令
 */

import chalk from "chalk";
import {
  request,
  createSpinner,
  showSuccess,
  showError,
  showInfo,
  formatDuration,
} from "../utils.js";
import type { HealthStatus } from "../types.js";

export async function healthCheck(baseUrl: string): Promise<void> {
  const spinner = createSpinner("正在检查 Agent Service 健康状态...");

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/health`;
    const response = await fetch(url);

    if (!response.ok) {
      spinner.stop();
      showError("Agent Service 不可用");
      console.log(chalk.yellow(`\nHTTP 状态: ${response.status}`));
      console.log(chalk.yellow(`服务地址: ${baseUrl}`));
      console.log(chalk.yellow("请确保服务已启动并运行正常"));
      process.exit(1);
    }

    const data = await response.json();
    spinner.stop();

    showSuccess("Agent Service 运行正常");
    console.log(chalk.gray("\n详细信息:"));
    console.log(chalk.gray(`  状态: ${data.status}`));
    console.log(
      chalk.gray(`  运行时间: ${formatDuration(data.uptime * 1000)}`),
    );
    console.log(chalk.gray(`  活跃 Agent 数量: ${data.agents}`));
    console.log(chalk.gray(`  时间戳: ${data.timestamp}`));
    if (data.backends) {
      console.log(
        chalk.gray(`  支持后端: ${(data.backends as string[]).join(", ")}`),
      );
    }
    console.log(chalk.gray(`\n服务地址: ${baseUrl}`));
  } catch (error) {
    spinner.stop();
    showError("无法连接到 Agent Service");
    console.error(
      chalk.red(
        `\n错误详情: ${error instanceof Error ? error.message : "未知错误"}`,
      ),
    );
    console.log(chalk.yellow("\n可能的原因:"));
    console.log(chalk.yellow("  1. Agent Service 未启动"));
    console.log(chalk.yellow("  2. 服务地址不正确"));
    console.log(chalk.yellow("  3. 防火墙阻止了连接"));
    console.log(chalk.gray(`\n服务地址: ${baseUrl}`));
    console.log(chalk.gray("\n启动服务命令:"));
    console.log(chalk.gray("  pnpm dev:agent"));
    process.exit(1);
  }
}
