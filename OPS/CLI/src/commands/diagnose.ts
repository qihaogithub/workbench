/**
 * 错误诊断命令
 */

import chalk from "chalk";
import {
  request,
  createSpinner,
  showSuccess,
  showError,
  showWarning,
  showInfo,
} from "../utils.js";
import type { AgentInfo, AgentResult, DiagnoseOptions } from "../types.js";

export async function diagnoseError(
  baseUrl: string,
  options: DiagnoseOptions,
): Promise<void> {
  const { sessionId, testMessage } = options;

  console.log(chalk.cyan("\n=== 错误诊断 ===\n"));

  if (sessionId) {
    console.log(chalk.gray(`目标会话: ${sessionId}`));
  } else {
    console.log(chalk.gray("目标会话: 未指定 (将创建临时会话)"));
  }

  if (testMessage) {
    console.log(chalk.gray(`测试消息: ${testMessage.substring(0, 50)}`));
  }
  console.log("");

  // 第一步: 检查服务健康状态
  console.log(chalk.yellow("步骤 1/4: 检查服务健康状态"));
  const spinner = createSpinner("正在检查...");

  try {
    const healthUrl = `${baseUrl.replace(/\/+$/, "")}/health`;
    const healthResponse = await fetch(healthUrl);

    if (!healthResponse.ok) {
      spinner.stop();
      showError("Agent Service 不可用");
      console.log(chalk.yellow("\n建议:"));
      console.log(chalk.yellow("  - 确保 agent-service 已启动"));
      console.log(chalk.yellow("  - 运行命令: pnpm dev:agent"));
      process.exit(1);
    }

    const healthData = await healthResponse.json();
    spinner.stop();

    showSuccess("Agent Service 运行正常");
    console.log(chalk.gray(`  状态: ${healthData.status}`));
    console.log(chalk.gray(`  活跃 Agent: ${healthData.agents}`));
    console.log("");
  } catch (error) {
    spinner.stop();
    showError("无法连接到 Agent Service");
    console.error(
      chalk.red(`  ${error instanceof Error ? error.message : "未知错误"}`),
    );
    process.exit(1);
  }

  // 第二步: 检查会话状态 (如果指定了 sessionId)
  if (sessionId) {
    console.log(chalk.yellow("步骤 2/4: 检查会话状态"));
    const sessionSpinner = createSpinner("正在查询...");

    try {
      const sessionResponse = await request<AgentInfo>(
        baseUrl,
        `/api/agent/${sessionId}`,
      );
      sessionSpinner.stop();

      if (!sessionResponse.success) {
        showWarning("会话不存在");
        console.log(chalk.gray("  这将是一个全新的会话"));
      } else {
        showSuccess("会话存在");
        const info = sessionResponse.data;
        console.log(chalk.gray(`  状态: ${info.status}`));
        console.log(chalk.gray(`  后端: ${info.backend}`));
        console.log(chalk.gray(`  消息数: ${info.messageCount}`));
        console.log(chalk.gray(`  工作目录: ${info.workingDir || "未设置"}`));
      }
      console.log("");
    } catch (error) {
      sessionSpinner.stop();
      showWarning("查询会话信息失败");
      console.log(chalk.gray("  继续诊断..."));
      console.log("");
    }
  } else {
    console.log(chalk.yellow("步骤 2/4: 跳过 (未指定会话 ID)"));
    console.log("");
  }

  // 第三步: 发送测试消息
  if (testMessage) {
    console.log(chalk.yellow("步骤 3/4: 发送测试消息"));
    const testSessionId = sessionId || `diagnose-${Date.now()}`;
    const testSpinner = createSpinner("正在发送测试消息...");
    const startTime = Date.now();

    try {
      const messageResponse = await request<AgentResult>(
        baseUrl,
        `/api/agent/${testSessionId}/message`,
        {
          method: "POST",
          body: {
            content: testMessage,
            options: {
              timeout: 30000,
              stream: false,
            },
          },
        },
      );

      const duration = Date.now() - startTime;
      testSpinner.stop();

      if (!messageResponse.success) {
        showError("测试消息失败");
        console.log(chalk.red(`  错误代码: ${messageResponse.error?.code}`));
        console.log(chalk.red(`  错误信息: ${messageResponse.error?.message}`));
        console.log(chalk.gray(`  耗时: ${duration}ms`));
        console.log("");

        // 分析错误原因
        console.log(chalk.yellow("步骤 4/4: 错误分析"));
        analyzeError(messageResponse.error);
      } else {
        showSuccess("测试消息成功");
        console.log(chalk.gray(`  耗时: ${duration}ms`));
        if (messageResponse.data.content) {
          console.log(
            chalk.gray(
              `  回复长度: ${messageResponse.data.content.length} 字符`,
            ),
          );
        }
        console.log("");

        console.log(chalk.yellow("步骤 4/4: 无错误"));
        showSuccess("诊断完成 - 服务运行正常");
      }
    } catch (error) {
      testSpinner.stop();
      showError("测试消息异常");
      console.error(
        chalk.red(`  ${error instanceof Error ? error.message : "未知错误"}`),
      );
      console.log("");

      console.log(chalk.yellow("步骤 4/4: 异常分析"));
      console.log(chalk.yellow("  可能是网络连接问题或服务器异常"));
    }
  } else {
    console.log(chalk.yellow("步骤 3/4: 跳过 (未提供测试消息)"));
    console.log(chalk.yellow("步骤 4/4: 跳过"));
    console.log("");
    showInfo("使用 --message 参数发送测试消息进行更深入的诊断");
  }

  console.log("");
}

/**
 * 分析错误并提供建议
 */
function analyzeError(
  error: { code?: string; message?: string } | undefined,
): void {
  if (!error) {
    console.log(chalk.gray("  无具体错误信息"));
    return;
  }

  const { code, message } = error;

  console.log(chalk.gray("\n错误分析:"));

  if (message?.includes("No active session")) {
    console.log(chalk.yellow("\n  [问题] Session 未正确初始化"));
    console.log(chalk.yellow("  [可能原因]"));
    console.log(chalk.yellow("    - ACP 连接建立但 createSession 失败"));
    console.log(chalk.yellow("    - Session 超时或失效"));
    console.log(chalk.yellow("    - opencode CLI 未正确响应"));
    console.log(chalk.yellow("  [解决方案]"));
    console.log(chalk.yellow("    1. 使用新的 sessionId 重试"));
    console.log(chalk.yellow("    2. 检查 opencode CLI 是否可用"));
    console.log(chalk.yellow("    3. 查看 agent-service 日志"));
    console.log(
      chalk.yellow('    4. 运行: ops-cli stream "new-session" "测试"'),
    );
  } else if (message?.includes("INTERNAL_ERROR")) {
    console.log(chalk.yellow("\n  [问题] 服务器内部错误"));
    console.log(chalk.yellow("  [可能原因]"));
    console.log(chalk.yellow("    - Agent 处理消息时抛出异常"));
    console.log(chalk.yellow("    - 子进程崩溃"));
    console.log(chalk.yellow("    - 资源不足 (内存/磁盘)"));
    console.log(chalk.yellow("  [解决方案]"));
    console.log(chalk.yellow("    1. 查看 agent-service 详细日志"));
    console.log(chalk.yellow("    2. 重启 agent-service"));
    console.log(chalk.yellow("    3. 检查系统资源使用情况"));
    console.log(chalk.yellow("    4. 尝试简化测试消息"));
  } else if (message?.includes("ECONNREFUSED")) {
    console.log(chalk.yellow("\n  [问题] 连接被拒绝"));
    console.log(chalk.yellow("  [可能原因]"));
    console.log(chalk.yellow("    - CLI 子进程未启动"));
    console.log(chalk.yellow("    - 端口被占用"));
    console.log(chalk.yellow("    - 防火墙阻止"));
    console.log(chalk.yellow("  [解决方案]"));
    console.log(chalk.yellow("    1. 确认相关 CLI 已安装"));
    console.log(chalk.yellow("    2. 检查端口占用情况"));
    console.log(chalk.yellow("    3. 检查防火墙设置"));
  } else if (code === "SESSION_NOT_FOUND") {
    console.log(chalk.yellow("\n  [问题] 会话不存在"));
    console.log(chalk.yellow("  [可能原因]"));
    console.log(chalk.yellow("    - 会话已被清理或销毁"));
    console.log(chalk.yellow("    - 会话 ID 错误"));
    console.log(chalk.yellow("  [解决方案]"));
    console.log(chalk.yellow("    1. 使用新的 sessionId"));
    console.log(chalk.yellow("    2. 列出所有会话: ops-cli sessions"));
  } else {
    console.log(chalk.yellow("\n  [问题] 未知错误"));
    console.log(chalk.yellow("  [错误代码]"), code || "N/A");
    console.log(chalk.yellow("  [错误信息]"), message || "N/A");
    console.log(chalk.yellow("  [解决方案]"));
    console.log(chalk.yellow("    1. 查看详细日志"));
    console.log(chalk.yellow("    2. 尝试重新操作"));
    console.log(chalk.yellow("    3. 联系技术支持"));
  }

  console.log("");
}
