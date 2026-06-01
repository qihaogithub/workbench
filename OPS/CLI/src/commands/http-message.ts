import chalk from "chalk";
import {
  request,
  createSpinner,
  showSuccess,
  showError,
  showWarning,
  outputJson,
  formatDuration,
} from "../utils.js";
import type { HttpMessageOptions, AgentResult } from "../types.js";

export async function testHttpMessage(
  baseUrl: string,
  options: HttpMessageOptions,
  jsonMode: boolean = false,
): Promise<void> {
  const { sessionId, message, demoId, workingDir, backend, model, timeout } =
    options;

  if (!jsonMode) {
    console.log(chalk.cyan("\n=== HTTP 消息测试 ===\n"));
    console.log(chalk.gray(`会话 ID: ${sessionId}`));
    console.log(
      chalk.gray(
        `消息内容: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`,
      ),
    );
    if (workingDir) console.log(chalk.gray(`工作目录: ${workingDir}`));
    if (demoId) console.log(chalk.gray(`Demo ID: ${demoId}`));
    console.log(chalk.gray(`后端类型: ${backend || "pi-agent"}`));
    if (model) console.log(chalk.gray(`模型: ${model}`));
    console.log(chalk.gray(`超时时间: ${timeout || 120000}ms`));
    console.log("");
  }

  const spinner = createSpinner("正在发送消息...", jsonMode);
  const startTime = Date.now();

  try {
    const response = await request<AgentResult>(
      baseUrl,
      `/api/agent/${sessionId}/message`,
      {
        method: "POST",
        body: {
          content: message,
          demoId,
          backend,
          model,
          workingDir,
          options: {
            timeout,
            stream: false,
          },
        },
      },
    );

    const duration = Date.now() - startTime;
    spinner.stop();

    if (!response.success) {
      if (jsonMode) {
        outputJson({
          success: false,
          sessionId,
          duration,
          error: response.error,
        });
        process.exit(1);
        return;
      }

      showError("消息发送失败", response.error);
      console.log(chalk.gray(`\n耗时: ${duration}ms`));

      console.log(chalk.yellow("\n可能的原因:"));
      if (response.error?.code === "MESSAGE_SEND_ERROR") {
        if (response.error.message?.includes("No active session")) {
          console.log(chalk.yellow("  - Session 未正确初始化"));
          console.log(chalk.yellow("  - 尝试使用新的 sessionId 重试"));
          console.log(
            chalk.yellow(
              `  - 命令: ops-cli stream "${sessionId}-new" "测试消息"`,
            ),
          );
        } else if (
          response.error.message?.includes("ECONNREFUSED") ||
          response.error.message?.includes("fetch failed")
        ) {
          console.log(chalk.yellow("  - Agent Service 无法连接"));
          console.log(chalk.yellow("  - 检查 agent-service 是否已启动"));
          console.log(chalk.yellow("  - 命令: pnpm dev:agent"));
        } else {
          console.log(chalk.yellow(`  - 错误信息: ${response.error.message}`));
        }
      } else if (response.error?.code === "SESSION_NOT_FOUND") {
        console.log(chalk.yellow("  - 会话不存在"));
        console.log(
          chalk.yellow("  - 使用相同的 sessionId 再次发送消息可自动创建会话"),
        );
      } else {
        console.log(chalk.yellow(`  - 错误代码: ${response.error?.code}`));
        console.log(chalk.yellow(`  - 错误信息: ${response.error?.message}`));
      }

      process.exit(1);
    }

    if (jsonMode) {
      outputJson({ success: true, sessionId, duration, data: response.data });
      return;
    }

    showSuccess("消息发送成功");
    console.log(chalk.gray(`\n耗时: ${formatDuration(duration)}`));
    console.log(chalk.gray(`会话 ID: ${sessionId}`));

    if (response.data.content) {
      console.log(chalk.green("\n=== AI 回复 ===\n"));
      console.log(chalk.white(response.data.content));
    }

    if (response.data.files && response.data.files.length > 0) {
      console.log(chalk.cyan("\n=== 文件变更 ===\n"));
      response.data.files.forEach((file: { action: string; path: string }) => {
        console.log(chalk.gray(`  ${file.action}: ${file.path}`));
      });
    }

    if (response.data.metadata) {
      console.log(chalk.gray("\n=== 元数据 ===\n"));
      console.log(chalk.gray(JSON.stringify(response.data.metadata, null, 2)));
    }

    console.log("");
  } catch (error) {
    spinner.stop();
    const duration = Date.now() - startTime;

    if (jsonMode) {
      outputJson({
        success: false,
        sessionId,
        duration,
        error: error instanceof Error ? error.message : "未知错误",
      });
      process.exit(1);
      return;
    }

    showError("请求失败");
    console.error(
      chalk.red(
        `\n错误详情: ${error instanceof Error ? error.message : "未知错误"}`,
      ),
    );
    console.log(chalk.gray(`\n耗时: ${duration}ms`));
    process.exit(1);
  }
}
