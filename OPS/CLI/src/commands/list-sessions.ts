import chalk from "chalk";
import { request, createSpinner, showSuccess, showError, outputJson } from "../utils.js";
import type { AgentInfo } from "../types.js";

interface ListSessionsOptions {
  limit?: number;
  offset?: number;
  status?: string;
}

export async function listSessions(
  baseUrl: string,
  options: ListSessionsOptions,
  jsonMode: boolean,
): Promise<void> {
  const { limit = 50, offset = 0, status } = options;
  const spinner = createSpinner("正在查询会话列表...", jsonMode);

  try {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    const url = `/api/sessions?${params.toString()}`;
    const response = await request<{
      sessions: AgentInfo[];
      total: number;
      limit: number;
      offset: number;
    }>(baseUrl, url);

    spinner.stop();

    if (!response.success) {
      if (jsonMode) {
        outputJson({ success: false, error: response.error });
        return;
      }
      showError("查询失败", response.error);
      process.exit(1);
    }

    const { sessions, total } = response.data;

    if (jsonMode) {
      outputJson({ success: true, total, sessions });
      return;
    }

    console.log(chalk.cyan("\n=== 会话列表 ===\n"));

    if (status) {
      console.log(chalk.gray(`过滤状态: ${status}`));
    }
    console.log(chalk.gray(`限制: ${limit}, 偏移: ${offset}\n`));

    if (sessions.length === 0) {
      showInfo("没有找到任何会话");
      console.log("");
      return;
    }

    showSuccess(`找到 ${total} 个会话 (显示 ${sessions.length} 个)`);
    console.log("");

    console.log(chalk.gray("序号  | 会话 ID                                    | 状态        | 后端     | 消息数 | 最后活动"));
    console.log(chalk.gray("------+--------------------------------------------+-------------+----------+--------+-------------------"));

    sessions.forEach((session: AgentInfo, index: number) => {
      const idx = String(offset + index + 1).padEnd(4);
      const id = session.sessionId.substring(0, 42).padEnd(42);
      const s = getStatusColor(session.status)(session.status.padEnd(11));
      const backend = session.backend.padEnd(8);
      const msgCount = String(session.messageCount).padEnd(6);
      const lastActivity = new Date(session.lastActivityAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      console.log(`${idx} | ${id} | ${s} | ${backend} | ${msgCount} | ${lastActivity}`);
    });

    console.log("");
    console.log(chalk.gray(`提示: 使用 'ops-cli session <sessionId>' 查看详细信息`));
    console.log(chalk.gray(`      使用 'ops-cli destroy <sessionId>' 销毁会话`));
    console.log("");
  } catch (error) {
    spinner.stop();
    if (jsonMode) {
      outputJson({ success: false, error: error instanceof Error ? error.message : "未知错误" });
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

function showInfo(message: string) {
  console.log(chalk.blue(`ℹ ${message}`));
}
