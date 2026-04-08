#!/usr/bin/env node

/**
 * CLI 测试工具 - 主入口
 * 用于脱离 Web 端独立测试 AI 相关功能
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { testHttpMessage } from './commands/http-message.js';
import { testWebSocketStream } from './commands/websocket-stream.js';
import { getSessionInfo } from './commands/session-info.js';
import { listSessions } from './commands/list-sessions.js';
import { destroySession } from './commands/destroy-session.js';
import { healthCheck } from './commands/health.js';
import { diagnoseError } from './commands/diagnose.js';

const program = new Command();

program
  .name('ops-cli')
  .description('CLI 测试工具 - 测试 AI Agent 服务功能')
  .version('1.0.0')
  .option('-u, --url <url>', 'Agent Service 地址', 'http://localhost:3101');

// ============================================================
// 健康检查
// ============================================================
program
  .command('health')
  .description('检查 Agent Service 健康状态')
  .action(async (options) => {
    await healthCheck(program.opts().url);
  });

// ============================================================
// HTTP 消息测试
// ============================================================
program
  .command('send <sessionId> <message>')
  .description('通过 HTTP API 发送消息(非流式)')
  .option('-d, --demo-id <demoId>', 'Demo ID')
  .option('-w, --working-dir <dir>', '工作目录路径')
  .option('-b, --backend <backend>', 'Agent 后端类型', 'opencode')
  .option('-t, --timeout <ms>', '超时时间(毫秒)', '120000')
  .action(async (sessionId, message, options) => {
    await testHttpMessage(program.opts().url, {
      sessionId,
      message,
      demoId: options.demoId,
      workingDir: options.workingDir,
      backend: options.backend,
      timeout: parseInt(options.timeout),
    });
  });

// ============================================================
// WebSocket 流式测试
// ============================================================
program
  .command('stream <sessionId> [message]')
  .description('通过 WebSocket 测试流式响应')
  .option('-w, --working-dir <dir>', '工作目录路径')
  .option('-t, --timeout <ms>', '超时时间(毫秒)', '120000')
  .option('--no-wait', '发送消息后立即退出,不等待响应完成')
  .action(async (sessionId, message, options) => {
    await testWebSocketStream(program.opts().url, {
      sessionId,
      message: message || '你好',
      workingDir: options.workingDir,
      timeout: parseInt(options.timeout),
      wait: options.wait,
    });
  });

// ============================================================
// 会话信息查询
// ============================================================
program
  .command('session <sessionId>')
  .description('获取会话详细信息')
  .action(async (sessionId, options) => {
    await getSessionInfo(program.opts().url, sessionId);
  });

// ============================================================
// 列出所有会话
// ============================================================
program
  .command('sessions')
  .description('列出所有活跃的会话')
  .option('-l, --limit <n>', '限制返回数量', '50')
  .option('-o, --offset <n>', '偏移量', '0')
  .option('-s, --status <status>', '按状态过滤')
  .action(async (options) => {
    await listSessions(program.opts().url, {
      limit: parseInt(options.limit),
      offset: parseInt(options.offset),
      status: options.status,
    });
  });

// ============================================================
// 销毁会话
// ============================================================
program
  .command('destroy <sessionId>')
  .description('销毁指定会话,释放资源')
  .action(async (sessionId, options) => {
    await destroySession(program.opts().url, sessionId);
  });

// ============================================================
// 错误诊断
// ============================================================
program
  .command('diagnose [sessionId]')
  .description('诊断会话错误,分析可能的失败原因')
  .option('-m, --message <message>', '发送测试消息进行诊断')
  .action(async (sessionId, options) => {
    await diagnoseError(program.opts().url, {
      sessionId,
      testMessage: options.message,
    });
  });

// ============================================================
// 交互式测试模式
// ============================================================
program
  .command('interactive [sessionId]')
  .description('进入交互式测试模式,可以连续发送消息')
  .option('-w, --working-dir <dir>', '工作目录路径')
  .option('--ws', '使用 WebSocket 模式(默认 HTTP)', false)
  .action(async (sessionId, options) => {
    const { interactiveMode } = await import('./commands/interactive.js');
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

// 如果没有提供任何命令,显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
