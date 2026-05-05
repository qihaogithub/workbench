import chalk from "chalk";
import {
  request,
  createSpinner,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  outputJson,
} from "../utils.js";
import type { AgentInfo, AgentResult, DiagnoseOptions } from "../types.js";

interface DiagnoseResult {
  timestamp: string;
  serviceUrl: string;
  health: {
    checked: boolean;
    healthy: boolean;
    status?: string;
    activeAgents?: number;
  };
  session: {
    checked: boolean;
    exists: boolean;
    status?: string;
    backend?: string;
    messageCount?: number;
    workingDir?: string;
  };
  testMessage: {
    sent: boolean;
    success: boolean;
    duration?: number;
    error?: { code?: string; message?: string };
    replyLength?: number;
  };
  analysis: {
    problem: string;
    possibleCauses: string[];
    solutions: string[];
  } | null;
}

export async function diagnoseError(
  baseUrl: string,
  options: DiagnoseOptions,
  jsonMode: boolean,
): Promise<void> {
  const { sessionId, testMessage } = options;

  const result: DiagnoseResult = {
    timestamp: new Date().toISOString(),
    serviceUrl: baseUrl,
    health: { checked: false, healthy: false },
    session: { checked: false, exists: false },
    testMessage: { sent: false, success: false },
    analysis: null,
  };

  if (!jsonMode) {
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
  }

  const spinner = createSpinner("正在检查...", jsonMode);

  try {
    const healthUrl = `${baseUrl.replace(/\/+$/, "")}/health`;
    const healthResponse = await fetch(healthUrl);

    if (!healthResponse.ok) {
      spinner.stop();
      result.health = { checked: true, healthy: false };

      if (jsonMode) {
        outputJson(result);
        return;
      }

      showError("Agent Service 不可用");
      console.log(chalk.yellow("\n建议:"));
      console.log(chalk.yellow("  - 确保 agent-service 已启动"));
      console.log(chalk.yellow("  - 运行命令: pnpm dev:agent"));
      process.exit(1);
    }

    const healthData = await healthResponse.json();
    spinner.stop();
    result.health = {
      checked: true,
      healthy: true,
      status: healthData.status,
      activeAgents: healthData.agents,
    };

    if (!jsonMode) {
      showSuccess("Agent Service 运行正常");
      console.log(chalk.gray(`  状态: ${healthData.status}`));
      console.log(chalk.gray(`  活跃 Agent: ${healthData.agents}`));
      console.log("");
    }
  } catch (error) {
    spinner.stop();
    result.health = { checked: true, healthy: false };

    if (jsonMode) {
      outputJson(result);
      return;
    }

    showError("无法连接到 Agent Service");
    console.error(chalk.red(`  ${error instanceof Error ? error.message : "未知错误"}`));
    process.exit(1);
  }

  if (sessionId) {
    const sessionSpinner = createSpinner("正在查询会话...", jsonMode);

    try {
      const sessionResponse = await request<AgentInfo>(
        baseUrl,
        `/api/agent/${sessionId}`,
      );
      sessionSpinner.stop();

      if (!sessionResponse.success) {
        result.session = { checked: true, exists: false };

        if (!jsonMode) {
          showWarning("会话不存在");
          console.log(chalk.gray("  这将是一个全新的会话"));
        }
      } else {
        const info = sessionResponse.data;
        result.session = {
          checked: true,
          exists: true,
          status: info.status,
          backend: info.backend,
          messageCount: info.messageCount,
          workingDir: info.workingDir,
        };

        if (!jsonMode) {
          showSuccess("会话存在");
          console.log(chalk.gray(`  状态: ${info.status}`));
          console.log(chalk.gray(`  后端: ${info.backend}`));
          console.log(chalk.gray(`  消息数: ${info.messageCount}`));
          console.log(chalk.gray(`  工作目录: ${info.workingDir || "未设置"}`));
        }
      }
      if (!jsonMode) console.log("");
    } catch {
      sessionSpinner.stop();
      result.session = { checked: true, exists: false };
      if (!jsonMode) {
        showWarning("查询会话信息失败");
        console.log("");
      }
    }
  } else {
    result.session = { checked: false, exists: false };
    if (!jsonMode) {
      console.log(chalk.yellow("步骤 2/4: 跳过 (未指定会话 ID)"));
      console.log("");
    }
  }

  if (testMessage) {
    const testSessionId = sessionId || `diagnose-${Date.now()}`;
    const testSpinner = createSpinner("正在发送测试消息...", jsonMode);
    const startTime = Date.now();

    try {
      const messageResponse = await request<AgentResult>(
        baseUrl,
        `/api/agent/${testSessionId}/message`,
        {
          method: "POST",
          body: {
            content: testMessage,
            options: { timeout: 30000, stream: false },
          },
        },
      );

      const duration = Date.now() - startTime;
      testSpinner.stop();

      if (!messageResponse.success) {
        result.testMessage = {
          sent: true,
          success: false,
          duration,
          error: {
            code: messageResponse.error?.code,
            message: messageResponse.error?.message,
          },
        };

        const analysis = analyzeError(messageResponse.error);
        result.analysis = analysis;

        if (jsonMode) {
          outputJson(result);
          return;
        }

        showError("测试消息失败");
        console.log(chalk.red(`  错误代码: ${messageResponse.error?.code}`));
        console.log(chalk.red(`  错误信息: ${messageResponse.error?.message}`));
        console.log(chalk.gray(`  耗时: ${duration}ms`));
        console.log("");
        displayAnalysis(analysis!);
      } else {
        result.testMessage = {
          sent: true,
          success: true,
          duration,
          replyLength: messageResponse.data.content?.length,
        };

        if (jsonMode) {
          outputJson(result);
          return;
        }

        showSuccess("测试消息成功");
        console.log(chalk.gray(`  耗时: ${duration}ms`));
        if (messageResponse.data.content) {
          console.log(chalk.gray(`  回复长度: ${messageResponse.data.content.length} 字符`));
        }
        console.log("");
        showSuccess("诊断完成 - 服务运行正常");
      }
    } catch (error) {
      testSpinner.stop();
      result.testMessage = {
        sent: true,
        success: false,
        error: { message: error instanceof Error ? error.message : "未知错误" },
      };

      if (jsonMode) {
        outputJson(result);
        return;
      }

      showError("测试消息异常");
      console.error(chalk.red(`  ${error instanceof Error ? error.message : "未知错误"}`));
      console.log("");
      console.log(chalk.yellow("  可能是网络连接问题或服务器异常"));
    }
  } else {
    if (jsonMode) {
      outputJson(result);
      return;
    }

    console.log(chalk.yellow("步骤 3/4: 跳过 (未提供测试消息)"));
    console.log(chalk.yellow("步骤 4/4: 跳过"));
    console.log("");
    showInfo("使用 --message 参数发送测试消息进行更深入的诊断");
  }

  console.log("");
}

function analyzeError(
  error: { code?: string; message?: string } | undefined,
): DiagnoseResult["analysis"] {
  if (!error) {
    return { problem: "未知错误", possibleCauses: ["无具体错误信息"], solutions: ["查看详细日志"] };
  }

  const { code, message } = error;

  if (message?.includes("No active session")) {
    return {
      problem: "Session 未正确初始化",
      possibleCauses: [
        "ACP 连接建立但 createSession 失败",
        "Session 超时或失效",
        "opencode CLI 未正确响应",
      ],
      solutions: [
        "使用新的 sessionId 重试",
        "检查 opencode CLI 是否可用",
        "查看 agent-service 日志",
        '运行: ops-cli stream "new-session" "测试"',
      ],
    };
  }

  if (message?.includes("INTERNAL_ERROR")) {
    return {
      problem: "服务器内部错误",
      possibleCauses: [
        "Agent 处理消息时抛出异常",
        "子进程崩溃",
        "资源不足 (内存/磁盘)",
      ],
      solutions: [
        "查看 agent-service 详细日志",
        "重启 agent-service",
        "检查系统资源使用情况",
        "尝试简化测试消息",
      ],
    };
  }

  if (message?.includes("ECONNREFUSED")) {
    return {
      problem: "连接被拒绝",
      possibleCauses: [
        "CLI 子进程未启动",
        "端口被占用",
        "防火墙阻止",
      ],
      solutions: [
        "确认相关 CLI 已安装",
        "检查端口占用情况",
        "检查防火墙设置",
      ],
    };
  }

  if (code === "SESSION_NOT_FOUND") {
    return {
      problem: "会话不存在",
      possibleCauses: [
        "会话已被清理或销毁",
        "会话 ID 错误",
      ],
      solutions: [
        "使用新的 sessionId",
        "列出所有会话: ops-cli sessions",
      ],
    };
  }

  return {
    problem: "未知错误",
    possibleCauses: [`错误代码: ${code || "N/A"}`, `错误信息: ${message || "N/A"}`],
    solutions: ["查看详细日志", "尝试重新操作", "运行 ops-cli system 检查环境"],
  };
}

function displayAnalysis(analysis: NonNullable<DiagnoseResult["analysis"]>): void {
  console.log(chalk.yellow("错误分析:"));
  console.log(chalk.yellow(`\n  [问题] ${analysis.problem}`));
  console.log(chalk.yellow("  [可能原因]"));
  for (const cause of analysis.possibleCauses) {
    console.log(chalk.yellow(`    - ${cause}`));
  }
  console.log(chalk.yellow("  [解决方案]"));
  analysis.solutions.forEach((s, i) => {
    console.log(chalk.yellow(`    ${i + 1}. ${s}`));
  });
}
