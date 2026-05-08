import chalk from "chalk";
import ora from "ora";
import type { ApiResponse } from "./types.js";

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

export function createSpinner(text: string, jsonMode?: boolean) {
  if (jsonMode) return { stop: () => {}, succeed: (_: string) => {}, fail: (_: string) => {} };
  return ora({ text, color: "cyan" }).start();
}

export function outputJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

export function showSuccess(
  message: string,
  details?: Record<string, unknown>,
) {
  console.log(chalk.green(`✓ ${message}`));
  if (details) {
    console.log(chalk.gray(formatDetails(details)));
  }
}

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

export function showWarning(message: string) {
  console.log(chalk.yellow(`⚠ ${message}`));
}

export function showInfo(message: string) {
  console.log(chalk.blue(`ℹ ${message}`));
}

export function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
    .join("\n");
}

export function truncate(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export async function runCommand(cmd: string, args: string[] = []): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const { execFile } = await import("child_process");
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000 }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout: stdout?.trim() || "",
        stderr: stderr?.trim() || "",
      });
    });
  });
}

export async function checkPortInUse(port: number): Promise<boolean> {
  const { execFile } = await import("child_process");
  const isWin = process.platform === "win32";
  return new Promise((resolve) => {
    if (isWin) {
      execFile("netstat", ["-ano"], { timeout: 10000 }, (error, stdout) => {
        if (!stdout) return resolve(false);
        const lines = stdout.split("\n");
        resolve(lines.some((line) => {
          const cols = line.trim().split(/\s+/);
          return cols[0] === "TCP" && cols[1]?.endsWith(`:${port}`) && cols[3] === "LISTENING";
        }));
      });
    } else {
      execFile("lsof", ["-i", `:${port}`, "-P", "-n"], (error, stdout) => {
        resolve(!!stdout && stdout.includes(String(port)));
      });
    }
  });
}

export async function getProcessOnPort(port: number): Promise<{ pid: string; command: string } | null> {
  const { execFile } = await import("child_process");
  const isWin = process.platform === "win32";
  return new Promise((resolve) => {
    if (isWin) {
      execFile("netstat", ["-ano"], { timeout: 10000 }, (error, stdout) => {
        if (!stdout) return resolve(null);
        const lines = stdout.split("\n");
        for (const line of lines) {
          const cols = line.trim().split(/\s+/);
          if (cols[0] === "TCP" && cols[1]?.endsWith(`:${port}`) && cols[3] === "LISTENING") {
            const pid = cols[4];
            if (!pid) continue;
            execFile("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { timeout: 10000 }, (_, taskOut) => {
              if (!taskOut) return resolve(pid ? { pid, command: "unknown" } : null);
              const match = taskOut.match(/"([^"]+)"/);
              const command = match ? match[1] : "unknown";
              resolve({ pid, command });
            });
            return;
          }
        }
        resolve(null);
      });
    } else {
      execFile("lsof", ["-i", `:${port}`, "-P", "-n", "-F", "pc"], (error, stdout) => {
        if (!stdout) return resolve(null);
        const lines = stdout.trim().split("\n");
        let pid = "";
        let command = "";
        for (const line of lines) {
          if (line.startsWith("p")) pid = line.slice(1);
          if (line.startsWith("c")) command = line.slice(1);
        }
        resolve(pid ? { pid, command } : null);
      });
    }
  });
}
