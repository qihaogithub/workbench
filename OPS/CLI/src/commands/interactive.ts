/**
 * 交互式测试模式命令
 */

import chalk from 'chalk';
import WebSocket from 'ws';
import { createSpinner, showSuccess, showError, showInfo } from '../utils.js';
import type { InteractiveModeOptions, StreamEvent } from '../types.js';
import * as readline from 'readline';

export async function interactiveMode(
  baseUrl: string,
  options: InteractiveModeOptions
): Promise<void> {
  const { sessionId, workingDir, useWebSocket = false } = options;

  console.log(chalk.cyan('\n=== 交互式测试模式 ===\n'));
  console.log(chalk.gray(`会话 ID: ${sessionId}`));
  console.log(chalk.gray(`模式: ${useWebSocket ? 'WebSocket' : 'HTTP'}`));
  if (workingDir) console.log(chalk.gray(`工作目录: ${workingDir}`));
  console.log(chalk.gray('\n输入消息后按 Enter 发送,输入 ' + chalk.yellow('quit') + ' 或 ' + chalk.yellow('exit') + ' 退出'));
  console.log(chalk.gray('输入 ' + chalk.yellow('clear') + ' 清屏,输入 ' + chalk.yellow('status') + ' 查看会话状态'));
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let ws: WebSocket | null = null;
  let isStreaming = false;

  // 显示提示符
  function showPrompt() {
    if (!isStreaming) {
      rl.question(chalk.green('\n你: '), handleInput);
    }
  }

  // 处理输入
  async function handleInput(input: string) {
    const trimmed = input.trim();

    if (!trimmed) {
      showPrompt();
      return;
    }

    // 特殊命令
    if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
      console.log(chalk.yellow('\n退出交互式测试模式'));
      if (ws) {
        ws.close();
      }
      rl.close();
      process.exit(0);
      return;
    }

    if (trimmed.toLowerCase() === 'clear') {
      console.clear();
      console.log(chalk.cyan('\n=== 交互式测试模式 ===\n'));
      showPrompt();
      return;
    }

    if (trimmed.toLowerCase() === 'status') {
      await checkStatus();
      showPrompt();
      return;
    }

    // 发送消息
    if (useWebSocket) {
      await sendWebSocketMessage(trimmed);
    } else {
      await sendHTTPMessage(trimmed);
    }
  }

  // HTTP 模式发送消息
  async function sendHTTPMessage(message: string) {
    const spinner = createSpinner('正在发送...');
    const startTime = Date.now();

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/agent/${sessionId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: message,
          workingDir,
          options: {
            timeout: 120000,
            stream: false,
          },
        }),
      });

      const data = await response.json();
      spinner.stop();

      if (!data.success) {
        showError('发送失败', data.error);
      } else {
        const duration = Date.now() - startTime;
        console.log(chalk.cyan('\nAI:'));
        console.log(chalk.white(data.data.content || '(无内容)'));
        console.log(chalk.gray(`\n耗时: ${duration}ms`));

        if (data.data.files && data.data.files.length > 0) {
          console.log(chalk.cyan('\n文件变更:'));
          data.data.files.forEach((file: any) => {
            console.log(chalk.gray(`  ${file.action}: ${file.path}`));
          });
        }
      }
    } catch (error) {
      spinner.stop();
      showError('请求异常');
      console.error(chalk.red(`  ${error instanceof Error ? error.message : '未知错误'}`));
    }

    showPrompt();
  }

  // WebSocket 模式发送消息
  async function sendWebSocketMessage(message: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // 创建 WebSocket 连接
      const wsUrl = baseUrl.replace(/^http/, 'ws');
      const url = `${wsUrl.replace(/\/+$/, '')}/api/agent/${sessionId}/stream`;

      const spinner = createSpinner('正在连接 WebSocket...');

      ws = new WebSocket(url);
      let accumulatedContent = '';

      ws.on('open', () => {
        spinner.stop();
        showSuccess('WebSocket 连接成功');

        // 发送消息
        const messageData = {
          type: 'message',
          id: `cli-interactive-${Date.now()}`,
          content: message,
          workingDir,
          options: {
            timeout: 120000,
            stream: true,
          },
        };

        ws!.send(JSON.stringify(messageData));
        isStreaming = true;
        console.log(chalk.cyan('\nAI (流式):'));
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const event: StreamEvent = JSON.parse(data.toString());

          switch (event.type) {
            case 'stream':
              if (event.content) {
                process.stdout.write(chalk.white(event.content));
                accumulatedContent += event.content;
              }
              break;

            case 'finish':
              isStreaming = false;
              console.log(chalk.gray('\n\n✓ 响应完成'));

              if (event.files && event.files.length > 0) {
                console.log(chalk.cyan('\n文件变更:'));
                event.files.forEach((file) => {
                  console.log(chalk.gray(`  ${file.action}: ${file.path}`));
                });
              }
              console.log('');

              ws!.close();
              ws = null;
              showPrompt();
              break;

            case 'error':
              isStreaming = false;
              console.log(chalk.red('\n✗ 错误:'), event.error?.message);
              console.log('');

              ws!.close();
              ws = null;
              showPrompt();
              break;

            case 'status':
              console.log(chalk.gray(`\n[状态] ${event.status}`));
              break;
          }
        } catch (error) {
          console.error(chalk.red('\n解析消息失败:'), error);
        }
      });

      ws.on('error', (error) => {
        spinner.stop();
        showError('WebSocket 错误');
        console.error(chalk.red(`  ${error.message}`));
        isStreaming = false;
        ws = null;
        showPrompt();
      });

      ws.on('close', () => {
        isStreaming = false;
        ws = null;
      });
    } else {
      // 已有连接,直接发送
      isStreaming = true;
      console.log(chalk.cyan('\nAI (流式):'));

      const messageData = {
        type: 'message',
        id: `cli-interactive-${Date.now()}`,
        content: message,
        workingDir,
        options: {
          timeout: 120000,
          stream: true,
        },
      };

      ws.send(JSON.stringify(messageData));
    }
  }

  // 检查会话状态
  async function checkStatus() {
    const spinner = createSpinner('正在查询...');

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/agent/${sessionId}`);
      const data = await response.json();
      spinner.stop();

      if (!data.success) {
        showInfo('会话不存在');
      } else {
        const info = data.data;
        console.log(chalk.cyan('\n会话状态:'));
        console.log(chalk.gray(`  状态: ${info.status}`));
        console.log(chalk.gray(`  后端: ${info.backend}`));
        console.log(chalk.gray(`  消息数: ${info.messageCount}`));
        console.log(chalk.gray(`  工作目录: ${info.workingDir || '未设置'}`));
        console.log('');
      }
    } catch (error) {
      spinner.stop();
      showInfo('查询失败');
    }
  }

  // 启动
  showPrompt();
}
