import chalk from "chalk";
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
  request,
  createSpinner,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  outputJson,
} from "../utils.js";
import type { AgentInfo, LogsOptions, LogsResult } from "../types.js";

const PROJECT_ROOT = join(import.meta.dirname, "../../../../");
const LOG_SEARCH_PATHS = [
  join(PROJECT_ROOT, "packages/agent-service/logs"),
  join(PROJECT_ROOT, "logs"),
  join(PROJECT_ROOT, "packages/agent-service/agent-service.log"),
];

export async function collectLogs(
  baseUrl: string,
  options: LogsOptions,
  jsonMode: boolean,
): Promise<void> {
  const { level, pattern, lines = 100, sessionId } = options;
  const spinner = createSpinner("正在采集日志信息...", jsonMode);

  const logFile = findLogFile();
  let result: LogsResult;

  if (logFile) {
    result = readLogFile(logFile, { level, pattern, lines, sessionId });
  } else {
    spinner.stop();
    if (jsonMode) {
      result = await collectSessionDiagnostics(baseUrl, { level, pattern, lines, sessionId });
      outputJson(result);
      return;
    }

    showWarning("未找到日志文件 (agent-service 日志仅输出到 stdout)");
    console.log(chalk.gray("\n替代方案: 通过 API 获取会话诊断信息\n"));

    result = await collectSessionDiagnostics(baseUrl, { level, pattern, lines, sessionId });
    displayLogsResult(result, { level, pattern, sessionId });
    return;
  }

  spinner.stop();

  if (jsonMode) {
    outputJson(result);
    return;
  }

  displayLogsResult(result, { level, pattern, sessionId });
}

function findLogFile(): string | null {
  for (const path of LOG_SEARCH_PATHS) {
    if (existsSync(path)) {
      const stat = statSync(path);
      if (stat.isFile()) return path;
      const logFile = join(path, "agent-service.log");
      if (existsSync(logFile)) return logFile;
      const latestLog = join(path, "latest.log");
      if (existsSync(latestLog)) return latestLog;
    }
  }
  return null;
}

function readLogFile(
  filePath: string,
  options: LogsOptions,
): LogsResult {
  const { level, pattern, lines = 100, sessionId } = options;
  const content = readFileSync(filePath, "utf-8");
  const allLines = content.trim().split("\n");
  const recentLines = allLines.slice(-lines * 5);

  const logs: LogsResult["logs"] = [];

  for (const line of recentLines) {
    if (!line.trim()) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = { level: 30, time: new Date().toISOString(), msg: line };
    }

    if (level) {
      const levelNum = getLevelNum(level);
      if (typeof parsed.level === "number" && parsed.level < levelNum) continue;
      if (typeof parsed.level === "string" && parsed.level !== level) continue;
    }

    if (pattern) {
      const msg = String(parsed.msg || "");
      const fullLine = JSON.stringify(parsed);
      if (!msg.includes(pattern) && !fullLine.includes(pattern)) continue;
    }

    if (sessionId) {
      const fullLine = JSON.stringify(parsed);
      if (!fullLine.includes(sessionId)) continue;
    }

    logs.push({
      level: getLevelName(parsed.level),
      time: typeof parsed.time === "number"
        ? new Date(parsed.time).toISOString()
        : String(parsed.time || ""),
      msg: String(parsed.msg || ""),
      ...parsed,
    });
  }

  return {
    source: filePath,
    totalLines: allLines.length,
    filteredLines: logs.length,
    logs: logs.slice(-lines),
  };
}

async function collectSessionDiagnostics(
  baseUrl: string,
  options: LogsOptions,
): Promise<LogsResult> {
  const { sessionId } = options;
  const logs: LogsResult["logs"] = [];

  try {
    const healthResp = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`);
    if (healthResp.ok) {
      const healthData = await healthResp.json();
      logs.push({
        level: "info",
        time: new Date().toISOString(),
        msg: `Agent Service 健康: status=${healthData.status}, uptime=${healthData.uptime}s, agents=${healthData.agents}`,
      });
    } else {
      logs.push({
        level: "error",
        time: new Date().toISOString(),
        msg: `Agent Service 健康检查失败: HTTP ${healthResp.status}`,
      });
    }
  } catch (e) {
    logs.push({
      level: "error",
      time: new Date().toISOString(),
      msg: `Agent Service 不可达: ${e instanceof Error ? e.message : "未知错误"}`,
    });
  }

  if (sessionId) {
    try {
      const sessionResp = await request<AgentInfo>(
        baseUrl,
        `/api/agent/${sessionId}`,
      );
      if (sessionResp.success) {
        const info = sessionResp.data;
        logs.push({
          level: info.status === "error" ? "error" : "info",
          time: new Date().toISOString(),
          msg: `会话 ${sessionId}: status=${info.status}, backend=${info.backend}, messages=${info.messageCount}, workingDir=${info.workingDir || "未设置"}`,
        });
      } else {
        logs.push({
          level: "warn",
          time: new Date().toISOString(),
          msg: `会话 ${sessionId} 不存在或查询失败: ${sessionResp.error?.message || "未知"}`,
        });
      }
    } catch (e) {
      logs.push({
        level: "error",
        time: new Date().toISOString(),
        msg: `查询会话 ${sessionId} 异常: ${e instanceof Error ? e.message : "未知"}`,
      });
    }
  } else {
    try {
      const sessionsResp = await request<{
        sessions: AgentInfo[];
        total: number;
      }>(baseUrl, "/api/sessions?limit=20");
      if (sessionsResp.success) {
        const { sessions, total } = sessionsResp.data;
        logs.push({
          level: "info",
          time: new Date().toISOString(),
          msg: `活跃会话: ${total} 个`,
        });
        for (const s of sessions) {
          if (s.status === "error") {
            logs.push({
              level: "error",
              time: new Date().toISOString(),
              msg: `会话 ${s.sessionId}: status=error, backend=${s.backend}, messages=${s.messageCount}`,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    source: "api-diagnostics",
    totalLines: logs.length,
    filteredLines: logs.length,
    logs,
  };
}

function displayLogsResult(
  result: LogsResult,
  filters: { level?: string; pattern?: string; sessionId?: string },
): void {
  console.log(chalk.cyan("\n=== 日志信息 ===\n"));
  console.log(chalk.gray(`来源: ${result.source}`));
  console.log(chalk.gray(`总行数: ${result.totalLines}, 筛选后: ${result.filteredLines}`));

  if (filters.level) console.log(chalk.gray(`过滤级别: ${filters.level}`));
  if (filters.pattern) console.log(chalk.gray(`搜索模式: ${filters.pattern}`));
  if (filters.sessionId) console.log(chalk.gray(`会话 ID: ${filters.sessionId}`));
  console.log("");

  if (result.logs.length === 0) {
    showInfo("没有匹配的日志条目");
    console.log("");
    return;
  }

  for (const log of result.logs) {
    const levelColor = getLevelColor(log.level);
    const timeStr = log.time ? chalk.gray(`[${log.time}]`) : "";
    const levelStr = levelColor(log.level.toUpperCase().padEnd(5));
    console.log(`${timeStr} ${levelStr} ${log.msg}`);
  }
  console.log("");
}

function getLevelNum(level: string): number {
  switch (level.toLowerCase()) {
    case "trace": return 10;
    case "debug": return 20;
    case "info": return 30;
    case "warn": return 40;
    case "error": return 50;
    case "fatal": return 60;
    default: return 30;
  }
}

function getLevelName(level: unknown): string {
  if (typeof level === "string") return level;
  if (typeof level === "number") {
    if (level <= 10) return "trace";
    if (level <= 20) return "debug";
    if (level <= 30) return "info";
    if (level <= 40) return "warn";
    if (level <= 50) return "error";
    return "fatal";
  }
  return "info";
}

function getLevelColor(level: string): (text: string) => string {
  switch (level.toLowerCase()) {
    case "error":
    case "fatal":
      return chalk.red;
    case "warn":
      return chalk.yellow;
    case "info":
      return chalk.green;
    case "debug":
    case "trace":
      return chalk.gray;
    default:
      return chalk.white;
  }
}
