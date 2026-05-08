import chalk from "chalk";
import { existsSync } from "fs";
import { join } from "path";
import {
  runCommand,
  checkPortInUse,
  getProcessOnPort,
  request,
  createSpinner,
  showSuccess,
  showError,
  showWarning,
  outputJson,
  formatDuration,
} from "../utils.js";
import type { SystemCheckResult, HealthStatus } from "../types.js";

const BACKENDS = [
  "opencode", "claude", "codex", "gemini", "qwen", "goose",
  "auggie", "kimi", "copilot", "qoder", "vibe",
];
const PROJECT_ROOT = join(import.meta.dirname, "../../../../");
const CHECK_PORTS = [3101, 3000];

export async function systemCheck(
  baseUrl: string,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在收集系统环境信息...", jsonMode);

  const result: SystemCheckResult = {
    timestamp: new Date().toISOString(),
    runtime: {
      node: { version: "", available: false },
      pnpm: { version: "", available: false },
      typescript: { version: "", available: false },
    },
    agentService: {
      running: false,
      port: 3101,
      pid: null,
      processCommand: null,
      healthOk: null,
      uptime: null,
      activeAgents: null,
      backends: null,
    },
    cliBackends: {},
    project: {
      rootDir: PROJECT_ROOT,
      packageJsonExists: false,
      envFileExists: false,
      agentServiceDir: false,
      webDir: false,
      sharedDir: false,
    },
    ports: {},
  };

  result.runtime.node = await checkRuntime("node", "--version");
  result.runtime.pnpm = await checkRuntime("pnpm", "--version");
  result.runtime.typescript = await checkRuntime("npx", ["tsc", "--version"]);

  for (const backend of BACKENDS) {
    const check = await checkRuntime(backend, ["--version"]);
    result.cliBackends[backend] = {
      available: check.available,
      path: check.available ? check.version : null,
    };
  }

  const port3101 = await checkPortInUse(3101);
  const process3101 = port3101 ? await getProcessOnPort(3101) : null;
  result.agentService.running = port3101;
  result.agentService.pid = process3101?.pid || null;
  result.agentService.processCommand = process3101?.command || null;

  if (port3101) {
    try {
      const healthResp = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`);
      if (healthResp.ok) {
        const healthData = (await healthResp.json()) as HealthStatus;
        result.agentService.healthOk = true;
        result.agentService.uptime = healthData.uptime;
        result.agentService.activeAgents = healthData.agents;
      } else {
        result.agentService.healthOk = false;
      }
    } catch {
      result.agentService.healthOk = false;
    }

    try {
      const backendsResp = await request<string[]>(
        baseUrl,
        "/backends",
      );
      if (backendsResp.success) {
        result.agentService.backends = backendsResp.data;
      }
    } catch {
      // ignore
    }
  }

  for (const port of CHECK_PORTS) {
    const inUse = await checkPortInUse(port);
    const proc = inUse ? await getProcessOnPort(port) : null;
    result.ports[port] = {
      inUse,
      process: proc?.command || null,
    };
  }

  result.project.packageJsonExists = existsSync(join(PROJECT_ROOT, "package.json"));
  result.project.envFileExists = existsSync(join(PROJECT_ROOT, ".env")) || existsSync(join(PROJECT_ROOT, ".env.local"));
  result.project.agentServiceDir = existsSync(join(PROJECT_ROOT, "packages/agent-service"));
  result.project.webDir = existsSync(join(PROJECT_ROOT, "packages/web"));
  result.project.sharedDir = existsSync(join(PROJECT_ROOT, "packages/shared"));

  spinner.stop();

  if (jsonMode) {
    outputJson(result);
    return;
  }

  console.log(chalk.cyan("\n=== 系统环境诊断 ===\n"));

  console.log(chalk.yellow("运行时环境:"));
  console.log(chalk.gray(`  Node.js: ${result.runtime.node.available ? chalk.green(result.runtime.node.version) : chalk.red("未安装")}`));
  console.log(chalk.gray(`  pnpm:    ${result.runtime.pnpm.available ? chalk.green(result.runtime.pnpm.version) : chalk.red("未安装")}`));
  console.log(chalk.gray(`  TypeScript: ${result.runtime.typescript.available ? chalk.green(result.runtime.typescript.version) : chalk.red("未安装")}`));
  console.log("");

  console.log(chalk.yellow("Agent Service:"));
  if (result.agentService.running) {
    showSuccess("服务运行中");
    console.log(chalk.gray(`  端口: ${result.agentService.port}`));
    console.log(chalk.gray(`  PID: ${result.agentService.pid || "未知"}`));
    console.log(chalk.gray(`  进程: ${result.agentService.processCommand || "未知"}`));
    if (result.agentService.healthOk) {
      console.log(chalk.gray(`  健康状态: ${chalk.green("正常")}`));
      console.log(chalk.gray(`  运行时间: ${formatDuration((result.agentService.uptime || 0) * 1000)}`));
      console.log(chalk.gray(`  活跃 Agent: ${result.agentService.activeAgents}`));
    } else {
      console.log(chalk.gray(`  健康状态: ${chalk.red("异常")}`));
    }
    if (result.agentService.backends) {
      console.log(chalk.gray(`  已注册后端: ${result.agentService.backends.join(", ")}`));
    }
  } else {
    showError("服务未运行");
    console.log(chalk.gray(`  端口 ${result.agentService.port} 未被监听`));
    console.log(chalk.yellow("  启动命令: pnpm dev:agent"));
  }
  console.log("");

  console.log(chalk.yellow("CLI 后端可用性:"));
  for (const [name, info] of Object.entries(result.cliBackends)) {
    const status = info.available ? chalk.green("✓ 可用") : chalk.gray("✗ 未安装");
    console.log(chalk.gray(`  ${name.padEnd(10)} ${status}`));
  }
  console.log("");

  console.log(chalk.yellow("端口状态:"));
  for (const [port, info] of Object.entries(result.ports)) {
    const status = info.inUse ? chalk.green("监听中") : chalk.gray("空闲");
    const proc = info.process ? chalk.gray(` (${info.process})`) : "";
    console.log(chalk.gray(`  :${port}  ${status}${proc}`));
  }
  console.log("");

  console.log(chalk.yellow("项目结构:"));
  console.log(chalk.gray(`  根目录: ${result.project.rootDir}`));
  console.log(chalk.gray(`  package.json: ${result.project.packageJsonExists ? chalk.green("存在") : chalk.red("缺失")}`));
  console.log(chalk.gray(`  .env 文件: ${result.project.envFileExists ? chalk.green("存在") : chalk.yellow("缺失")}`));
  console.log(chalk.gray(`  agent-service: ${result.project.agentServiceDir ? chalk.green("存在") : chalk.red("缺失")}`));
  console.log(chalk.gray(`  web: ${result.project.webDir ? chalk.green("存在") : chalk.red("缺失")}`));
  console.log(chalk.gray(`  shared: ${result.project.sharedDir ? chalk.green("存在") : chalk.red("缺失")}`));
  console.log("");

  const issues = detectIssues(result);
  if (issues.length > 0) {
    console.log(chalk.yellow("⚠ 发现的问题:"));
    for (const issue of issues) {
      console.log(chalk.yellow(`  • ${issue}`));
    }
    console.log("");
  } else {
    showSuccess("未发现明显问题");
    console.log("");
  }
}

async function checkRuntime(cmd: string, args: string | string[]): Promise<{ version: string; available: boolean }> {
  const argArray = Array.isArray(args) ? args : [args];
  const result = await runCommand(cmd, argArray);
  if (result.success && result.stdout) {
    return { version: result.stdout.replace(/^v/, "").split("\n")[0], available: true };
  }
  return { version: "", available: false };
}

function detectIssues(result: SystemCheckResult): string[] {
  const issues: string[] = [];

  if (!result.runtime.node.available) issues.push("Node.js 未安装或不在 PATH 中");
  if (!result.runtime.pnpm.available) issues.push("pnpm 未安装或不在 PATH 中");
  if (!result.agentService.running) issues.push("Agent Service 未运行 (端口 3101 未监听)");
  if (result.agentService.running && !result.agentService.healthOk) issues.push("Agent Service 运行中但健康检查失败");
  if (!result.project.packageJsonExists) issues.push("项目根目录缺少 package.json");
  if (!result.project.agentServiceDir) issues.push("缺少 agent-service 包目录");

  return issues;
}
