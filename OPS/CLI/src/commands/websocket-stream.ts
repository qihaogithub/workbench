/**
 * WebSocket 流式测试命令
 */

import chalk from "chalk";
import WebSocket from "ws";
import {
  createSpinner,
  showSuccess,
  showError,
  formatDuration,
} from "../utils.js";
import type { WebSocketStreamOptions, StreamEvent } from "../types.js";

export async function testWebSocketStream(
  baseUrl: string,
  options: WebSocketStreamOptions,
): Promise<void> {
  const { sessionId, message, workingDir, timeout, wait = true } = options;

  console.log(chalk.cyan("\n=== WebSocket 流式测试 ===\n"));
  console.log(chalk.gray(`会话 ID: ${sessionId}`));
  console.log(
    chalk.gray(
      `消息内容: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`,
    ),
  );
  if (workingDir) console.log(chalk.gray(`工作目录: ${workingDir}`));
  console.log(chalk.gray(`超时时间: ${timeout || 120000}ms`));
  console.log(chalk.gray(`等待完成: ${wait}`));
  console.log("");

  const wsUrl = baseUrl.replace(/^http/, "ws");
  const url = `${wsUrl.replace(/\/+$/, "")}/api/agent/${sessionId}/stream`;

  console.log(chalk.gray(`WebSocket 地址: ${url}\n`));

  return new Promise<void>((resolve, reject) => {
    const spinner = createSpinner("正在连接 WebSocket...");
    const startTime = Date.now();
    let accumulatedContent = "";
    let connectionEstablished = false;
    let isComplete = false;

    const ws = new WebSocket(url);

    // 连接成功
    ws.on("open", () => {
      spinner.stop();
      showSuccess("WebSocket 连接成功");
      console.log("");
      connectionEstablished = true;

      // 发送消息
      console.log(chalk.cyan(">>> 发送消息:"));
      console.log(chalk.white(message));
      console.log("");

      const messageData = {
        type: "message",
        id: `cli-msg-${Date.now()}`,
        content: message,
        workingDir,
        options: {
          timeout,
          stream: true,
        },
      };

      ws.send(JSON.stringify(messageData));
      console.log(chalk.cyan("=== AI 回复 (流式) ===\n"));
    });

    // 接收消息
    ws.on("message", (data: WebSocket.Data) => {
      try {
        const event: StreamEvent = JSON.parse(data.toString());

        switch (event.type) {
          case "stream":
            if (event.content) {
              process.stdout.write(chalk.white(event.content));
              accumulatedContent += event.content;
            }
            break;

          case "status":
            console.log(chalk.gray(`\n[状态] ${event.status}`));
            break;

          case "thought":
            if (event.content) {
              console.log(chalk.dim(`\n[思考] ${event.content}`));
            }
            break;

          case "tool_call":
            const toolKind = event.kind ? `(${event.kind})` : "";
            const toolTitle = event.title || event.toolCallId || "未知工具";
            console.log(chalk.cyan(`\n┌─ [工具调用] ${toolTitle} ${toolKind}`));
            console.log(chalk.cyan(`│  ID: ${event.toolCallId}`));
            console.log(chalk.cyan(`└─ 状态: 运行中`));
            break;

          case "tool_call_update":
            const statusText =
              event.toolCallStatus === "completed"
                ? "✓ 完成"
                : event.toolCallStatus === "failed"
                  ? "✗ 失败"
                  : event.toolCallStatus || "未知";
            const statusColor =
              event.toolCallStatus === "completed"
                ? chalk.green
                : event.toolCallStatus === "failed"
                  ? chalk.red
                  : chalk.yellow;
            console.log(
              statusColor(
                `\n[工具状态更新] ${event.toolCallId}: ${statusText}`,
              ),
            );
            break;

          case "permission_request":
            console.log(chalk.yellow("\n┌─ ⚠️  权限请求"));
            if (event.permissionRequest) {
              console.log(
                chalk.yellow(`│  会话: ${event.permissionRequest.sessionId}`),
              );
              console.log(
                chalk.yellow(
                  `│  工具: ${event.permissionRequest.toolCall?.title || event.permissionRequest.toolCall?.toolCallId || "未知"}`,
                ),
              );
              console.log(chalk.yellow(`│  选项:`));
              event.permissionRequest.options?.forEach((opt) => {
                console.log(
                  chalk.yellow(`│    - ${opt.optionId}: ${opt.name}`),
                );
              });
              console.log(chalk.yellow(`└─ 等待用户响应...`));
            }
            break;

          case "file_operation":
            if (event.fileOperation) {
              console.log(
                chalk.blue(`\n[文件操作] ${event.fileOperation.method}`),
              );
              console.log(chalk.blue(`  路径: ${event.fileOperation.path}`));
            }
            break;

          case "finish":
            isComplete = true;
            const duration = Date.now() - startTime;
            console.log(chalk.green("\n\n✓ 流式响应完成"));
            console.log(chalk.gray(`耗时: ${formatDuration(duration)}`));
            console.log(
              chalk.gray(`内容长度: ${accumulatedContent.length} 字符`),
            );

            if (event.files && event.files.length > 0) {
              console.log(chalk.cyan("\n=== 文件变更 ===\n"));
              event.files.forEach((file) => {
                console.log(chalk.gray(`  ${file.action}: ${file.path}`));
              });
            }

            console.log("");
            ws.close();
            if (wait) {
              resolve();
            }
            break;

          case "error":
            isComplete = true;
            const errorDuration = Date.now() - startTime;
            spinner.stop();
            showError("收到错误响应", event.error);
            console.log(chalk.gray(`\n耗时: ${formatDuration(errorDuration)}`));

            console.log(chalk.yellow("\n可能的原因:"));
            if (event.error?.message?.includes("No active session")) {
              console.log(chalk.yellow("  - Session 未正确初始化"));
              console.log(chalk.yellow("  - ACP 连接可能已断开"));
              console.log(chalk.yellow("  - 尝试使用新的 sessionId 重试"));
            } else if (event.error?.message?.includes("INTERNAL_ERROR")) {
              console.log(chalk.yellow("  - 服务器内部错误"));
              console.log(
                chalk.yellow("  - 检查 agent-service 日志获取详细信息"),
              );
              console.log(
                chalk.yellow(
                  "  - 查看日志: 在 agent-service 目录运行 pnpm dev:agent",
                ),
              );
            } else {
              console.log(
                chalk.yellow(`  - 错误信息: ${event.error?.message}`),
              );
            }

            console.log("");
            ws.close();
            reject(new Error(event.error?.message || "Unknown error"));
            break;

          default:
            console.log(chalk.gray(`\n[未知事件] ${event.type}`));
            console.log(chalk.gray(JSON.stringify(event, null, 2)));
        }
      } catch (error) {
        console.error(chalk.red("\n解析消息失败:"), error);
      }
    });

    // 连接关闭
    ws.on("close", (code) => {
      if (!isComplete) {
        const duration = Date.now() - startTime;
        showError("WebSocket 连接意外关闭");
        console.log(chalk.gray(`\n耗时: ${formatDuration(duration)}`));
        console.log(
          chalk.gray(`已接收内容: ${accumulatedContent.length} 字符`),
        );

        if (accumulatedContent.length > 0) {
          console.log(chalk.yellow("\n=== 已接收的内容 ===\n"));
          console.log(chalk.white(accumulatedContent));
        }

        console.log("");
      }

      if (!wait || isComplete) {
        resolve();
      }
    });

    // 连接错误
    ws.on("error", (error) => {
      spinner.stop();
      showError("WebSocket 连接失败");
      console.error(chalk.red(`\n错误详情: ${error.message}`));

      console.log(chalk.yellow("\n可能的原因:"));
      console.log(chalk.yellow("  1. Agent Service 未启动"));
      console.log(chalk.yellow("  2. WebSocket 路由配置问题"));
      console.log(chalk.yellow("  3. 会话 ID 无效"));
      console.log(chalk.gray("\n建议:"));
      console.log(chalk.gray("  - 检查服务状态: ops-cli health"));
      console.log(
        chalk.gray(
          `  - 使用新会话重试: ops-cli stream "test-${Date.now()}" "测试消息"`,
        ),
      );
      console.log("");

      reject(error);
    });

    // 超时处理
    const timeoutMs = timeout || 120000;
    setTimeout(() => {
      if (!isComplete) {
        showError(`超时 (${timeoutMs}ms)`);
        console.log(
          chalk.gray(`\n已接收内容: ${accumulatedContent.length} 字符`),
        );

        if (accumulatedContent.length > 0) {
          console.log(chalk.yellow("\n=== 已接收的部分内容 ===\n"));
          console.log(chalk.white(accumulatedContent));
        }

        console.log("");
        ws.close();
        reject(new Error("Request timeout"));
      }
    }, timeoutMs);
  });
}
