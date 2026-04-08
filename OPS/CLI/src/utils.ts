/**
 * CLI 测试工具 - 辅助函数
 */

import chalk from "chalk";
import ora from "ora";
import type { ApiResponse } from "../types.js";

/**
 * 发送 HTTP 请求
 */
export async function request<T>(
  baseUrl: string,
  path: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<ApiResponse<T>> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;

  const fetchOptions: RequestInit = {
    method: options?.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  const data = await response.json();

  // 调试:打印响应数据
  // console.log('[DEBUG] Response:', JSON.stringify(data, null, 2));

  if (!response.ok) {
    return {
      success: false,
      error: data.error || {
        code: "HTTP_ERROR",
        message: `HTTP ${response.status}: ${response.statusText}`,
      },
    } as ApiResponse<T>;
  }

  return data as ApiResponse<T>;
}

/**
 * 创建加载动画
 */
export function createSpinner(text: string) {
  return ora({
    text,
    color: "cyan",
  }).start();
}

/**
 * 显示成功消息
 */
export function showSuccess(
  message: string,
  details?: Record<string, unknown>,
) {
  console.log(chalk.green(`✓ ${message}`));
  if (details) {
    console.log(chalk.gray(formatDetails(details)));
  }
}

/**
 * 显示错误消息
 */
export function showError(
  message: string,
  error?: { code?: string; message?: string },
) {
  console.error(chalk.red(`✗ ${message}`));
  if (error) {
    console.error(chalk.red(`  错误代码: ${error.code || "UNKNOWN"}`));
    console.error(chalk.red(`  错误信息: ${error.message || "未知错误"}`));
  }
}

/**
 * 显示警告消息
 */
export function showWarning(message: string) {
  console.log(chalk.yellow(`⚠ ${message}`));
}

/**
 * 显示信息消息
 */
export function showInfo(message: string) {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * 格式化详细信息
 */
export function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
    .join("\n");
}

/**
 * 截断长文本
 */
export function truncate(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
