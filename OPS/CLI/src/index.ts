#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { testHttpMessage } from "./commands/http-message.js";
import { testWebSocketStream } from "./commands/websocket-stream.js";
import { getSessionInfo } from "./commands/session-info.js";
import { listSessions } from "./commands/list-sessions.js";
import { destroySession } from "./commands/destroy-session.js";
import { healthCheck } from "./commands/health.js";
import { diagnoseError } from "./commands/diagnose.js";
import { systemCheck } from "./commands/system.js";
import { collectLogs } from "./commands/logs.js";
import { listModels } from "./commands/models.js";
import { getWorkspace, updateWorkspace } from "./commands/workspace.js";
import { listFiles } from "./commands/files.js";

const program = new Command();

program
  .name("ops-cli")
  .description("CLI 诊断工具 - 测试与诊断 AI Agent 服务")
  .version("2.1.0")
  .option("-u, --url <url>", "Agent Service 地址", "http://localhost:3101")
  .option("--json", "以 JSON 格式输出（供 Agent 程序化解析）");

function getJsonMode(): boolean {
  return program.opts().json === true;
}

// ============================================================
// 系统环境诊断
// ============================================================
program
  .command("system")
  .description("一键系统环境诊断: 运行时版本、服务状态、端口、后端可用性")
  .action(async () => {
    await systemCheck(program.opts().url, getJsonMode());
  });

// ============================================================
// 健康检查
// ============================================================
program
  .command("health")
  .description("检查 Agent Service 健康状态")
  .action(async () => {
    await healthCheck(program.opts().url, getJsonMode());
  });

// ============================================================
// HTTP 消息测试
// ============================================================
program
  .command("send <sessionId> <message>")
  .description("通过 HTTP API 发送消息(非流式)")
  .option("-d, --demo-id <demoId>", "Demo ID")
  .option("-w, --working-dir <dir>", "工作目录路径")
  .option("-b, --backend <backend>", "Agent 后端类型", "opencode-http")
  .option("-m, --model <modelId>", "模型 ID")
  .option("-t, --timeout <ms>", "超时时间(毫秒)", "120000")
  .action(async (sessionId, message, options) => {
    await testHttpMessage(program.opts().url, {
      sessionId,
      message,
      demoId: options.demoId,
      workingDir: options.workingDir,
      backend: options.backend,
      model: options.model,
      timeout: parseInt(options.timeout),
    }, getJsonMode());
  });

// ============================================================
// WebSocket 流式测试
// ============================================================
program
  .command("stream <sessionId> [message]")
  .description("通过 WebSocket 测试流式响应")
  .option("-w, --working-dir <dir>", "工作目录路径")
  .option("-b, --backend <backend>", "Agent 后端类型", "opencode-http")
  .option("-m, --model <modelId>", "模型 ID")
  .option("-t, --timeout <ms>", "超时时间(毫秒)", "120000")
  .option("--no-wait", "发送消息后立即退出,不等待响应完成")
  .action(async (sessionId, message, options) => {
    await testWebSocketStream(program.opts().url, {
      sessionId,
      message: message || "你好",
      workingDir: options.workingDir,
      backend: options.backend,
      model: options.model,
      timeout: parseInt(options.timeout),
      wait: options.wait,
    });
  });

// ============================================================
// 会话信息查询
// ============================================================
program
  .command("session <sessionId>")
  .description("获取会话详细信息")
  .action(async (sessionId) => {
    await getSessionInfo(program.opts().url, sessionId, getJsonMode());
  });

// ============================================================
// 列出所有会话
// ============================================================
program
  .command("sessions")
  .description("列出所有活跃的会话")
  .option("-l, --limit <n>", "限制返回数量", "50")
  .option("-o, --offset <n>", "偏移量", "0")
  .option("-s, --status <status>", "按状态过滤")
  .action(async (options) => {
    await listSessions(
      program.opts().url,
      {
        limit: parseInt(options.limit),
        offset: parseInt(options.offset),
        status: options.status,
      },
      getJsonMode(),
    );
  });

// ============================================================
// 销毁会话
// ============================================================
program
  .command("destroy <sessionId>")
  .description("销毁指定会话,释放资源")
  .action(async (sessionId) => {
    await destroySession(program.opts().url, sessionId);
  });

// ============================================================
// 错误诊断
// ============================================================
program
  .command("diagnose [sessionId]")
  .description("诊断会话错误,分析可能的失败原因")
  .option("-m, --message <message>", "发送测试消息进行诊断")
  .action(async (sessionId, options) => {
    await diagnoseError(
      program.opts().url,
      {
        sessionId,
        testMessage: options.message,
      },
      getJsonMode(),
    );
  });

// ============================================================
// 日志采集
// ============================================================
program
  .command("logs [sessionId]")
  .description("采集日志信息,支持过滤与搜索")
  .option("-l, --level <level>", "过滤日志级别 (debug/info/warn/error)")
  .option("-p, --pattern <pattern>", "搜索关键字")
  .option("-n, --lines <n>", "显示行数", "100")
  .action(async (sessionId, options) => {
    await collectLogs(
      program.opts().url,
      {
        sessionId,
        level: options.level,
        pattern: options.pattern,
        lines: parseInt(options.lines),
      },
      getJsonMode(),
    );
  });

// ============================================================
// 模型列表
// ============================================================
program
  .command("models")
  .description("获取可用模型列表")
  .action(async () => {
    await listModels(program.opts().url, getJsonMode());
  });

// ============================================================
// 工作空间管理
// ============================================================
program
  .command("workspace <sessionId>")
  .description("查看会话工作空间信息")
  .action(async (sessionId) => {
    await getWorkspace(program.opts().url, sessionId, getJsonMode());
  });

program
  .command("workspace-set <sessionId> <workingDir>")
  .description("更新会话工作空间目录")
  .option("--custom", "标记为自定义工作空间")
  .action(async (sessionId, workingDir, options) => {
    await updateWorkspace(
      program.opts().url,
      sessionId,
      workingDir,
      options.custom,
      getJsonMode(),
    );
  });

// ============================================================
// 变更文件列表
// ============================================================
program
  .command("files <sessionId>")
  .description("查看会话变更文件列表")
  .action(async (sessionId) => {
    await listFiles(program.opts().url, sessionId, getJsonMode());
  });

// ============================================================
// 交互式测试模式
// ============================================================
program
  .command("interactive [sessionId]")
  .description("进入交互式测试模式,可以连续发送消息")
  .option("-w, --working-dir <dir>", "工作目录路径")
  .option("--ws", "使用 WebSocket 模式(默认 HTTP)", false)
  .action(async (sessionId, options) => {
    const { interactiveMode } = await import("./commands/interactive.js");
    await interactiveMode(program.opts().url, {
      sessionId: sessionId || `cli-test-${Date.now()}`,
      workingDir: options.workingDir,
      useWebSocket: options.ws,
    });
  });

// ============================================================
// 解析命令行参数
// ============================================================
program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
