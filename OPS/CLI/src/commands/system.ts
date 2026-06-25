import chalk from "chalk";
import { existsSync } from "fs";
import { join } from "path";
import {
  runCommand,
  checkPortInUse,
  getProcessOnPort,
  createSpinner,
  showSuccess,
  showError,
  outputJson,
  formatDuration,
} from "../utils.js";
import type { SystemCheckResult, HealthStatus } from "../types.js";

const BACKENDS: string[] = []; // Pi Agent 已内置，无需检查外部 CLI
const PROJECT_ROOT = join(import.meta.dirname, "../../../../");
const AGENT_SERVICE_PORT = 3201;
const AUTHOR_SITE_PORT = 3200;
const CHECK_PORTS = [AGENT_SERVICE_PORT, AUTHOR_SITE_PORT];

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
      port: AGENT_SERVICE_PORT,
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

  // Pi Agent 已内置于 agent-service，无需检查外部 CLI

  const agentServiceInUse = await checkPortInUse(AGENT_SERVICE_PORT);
  const agentServiceProcess = agentServiceInUse
    ? await getProcessOnPort(AGENT_SERVICE_PORT)
    : null;
  result.agentService.running = agentServiceInUse;
  result.agentService.pid = agentServiceProcess?.pid || null;
  result.agentService.processCommand = agentServiceProcess?.command || null;

  if (agentServiceInUse) {
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

    // Pi Agent 单后端架构，不再检查多后端状态
  }

  for (const port of CHECK_PORTS) {
    const inUse = await checkPortInUse(port);
    const proc = inUse ? await getProcessOnPort(port) : null;
    result.ports[port] = {
      inUse,
      process: proc?.command || null,
    };
  }

  result.project.packageJsonExists = existsSync(
    join(PROJECT_ROOT, "package.json"),
  );
  result.project.envFileExists =
    existsSync(join(PROJECT_ROOT, ".env")) ||
    existsSync(join(PROJECT_ROOT, ".env.local"));
  result.project.agentServiceDir = existsSync(
    join(PROJECT_ROOT, "packages/agent-service"),
  );
  result.project.webDir = existsSync(
    join(PROJECT_ROOT, "packages/author-site"),
  );
  result.project.sharedDir = existsSync(join(PROJECT_ROOT, "packages/shared"));

  spinner.stop();

  if (jsonMode) {
    outputJson(result);
    return;
  }

  console.log(chalk.cyan("\n=== 系统环境诊断 ===\n"));

  console.log(chalk.yellow("运行时环境:"));
  console.log(
    chalk.gray(
      `  Node.js: ${result.runtime.node.available ? chalk.green(result.runtime.node.version) : chalk.red("未安装")}`,
    ),
  );
  console.log(
    chalk.gray(
      `  pnpm:    ${result.runtime.pnpm.available ? chalk.green(result.runtime.pnpm.version) : chalk.red("未安装")}`,
    ),
  );
  console.log(
    chalk.gray(
      `  TypeScript: ${result.runtime.typescript.available ? chalk.green(result.runtime.typescript.version) : chalk.red("未安装")}`,
    ),
  );
  console.log("");

  console.log(chalk.yellow("Agent Service:"));
  if (result.agentService.running) {
    showSuccess("服务运行中");
    console.log(chalk.gray(`  端口: ${result.agentService.port}`));
    console.log(chalk.gray(`  PID: ${result.agentService.pid || "未知"}`));
    console.log(
      chalk.gray(`  进程: ${result.agentService.processCommand || "未知"}`),
    );
    if (result.agentService.healthOk) {
      console.log(chalk.gray(`  健康状态: ${chalk.green("正常")}`));
      console.log(
        chalk.gray(
          `  运行时间: ${formatDuration((result.agentService.uptime || 0) * 1000)}`,
        ),
      );
      console.log(
        chalk.gray(`  活跃 Agent: ${result.agentService.activeAgents}`),
      );
    } else {
      console.log(chalk.gray(`  健康状态: ${chalk.red("异常")}`));
    }
  } else {
    showError("服务未运行");
    console.log(chalk.gray(`  端口 ${result.agentService.port} 未被监听`));
    console.log(chalk.yellow("  启动命令: pnpm dev:agent"));
  }
  console.log("");

  // CLI 后端检查已移除（Pi Agent 内置）

  console.log(chalk.yellow("端口状态:"));
  for (const [port, info] of Object.entries(result.ports)) {
    const status = info.inUse ? chalk.green("监听中") : chalk.gray("空闲");
    const proc = info.process ? chalk.gray(` (${info.process})`) : "";
    console.log(chalk.gray(`  :${port}  ${status}${proc}`));
  }
  console.log("");

  console.log(chalk.yellow("项目结构:"));
  console.log(chalk.gray(`  根目录: ${result.project.rootDir}`));
  console.log(
    chalk.gray(
      `  package.json: ${result.project.packageJsonExists ? chalk.green("存在") : chalk.red("缺失")}`,
    ),
  );
  console.log(
    chalk.gray(
      `  .env 文件: ${result.project.envFileExists ? chalk.green("存在") : chalk.yellow("缺失")}`,
    ),
  );
  console.log(
    chalk.gray(
      `  agent-service: ${result.project.agentServiceDir ? chalk.green("存在") : chalk.red("缺失")}`,
    ),
  );
  console.log(
    chalk.gray(
      `  web: ${result.project.webDir ? chalk.green("存在") : chalk.red("缺失")}`,
    ),
  );
  console.log(
    chalk.gray(
      `  shared: ${result.project.sharedDir ? chalk.green("存在") : chalk.red("缺失")}`,
    ),
  );
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

async function checkRuntime(
  cmd: string,
  args: string | string[],
): Promise<{ version: string; available: boolean }> {
  const argArray = Array.isArray(args) ? args : [args];
  const result = await runCommand(cmd, argArray);
  if (result.success && result.stdout) {
    return {
      version: result.stdout.replace(/^v/, "").split("\n")[0],
      available: true,
    };
  }
  return { version: "", available: false };
}

function detectIssues(result: SystemCheckResult): string[] {
  const issues: string[] = [];

  if (!result.runtime.node.available)
    issues.push("Node.js 未安装或不在 PATH 中");
  if (!result.runtime.pnpm.available) issues.push("pnpm 未安装或不在 PATH 中");
  if (!result.agentService.running)
    issues.push(`Agent Service 未运行 (端口 ${AGENT_SERVICE_PORT} 未监听)`);
  if (result.agentService.running && !result.agentService.healthOk)
    issues.push("Agent Service 运行中但健康检查失败");
  if (!result.project.packageJsonExists)
    issues.push("项目根目录缺少 package.json");
  if (!result.project.agentServiceDir) issues.push("缺少 agent-service 包目录");

  return issues;
}
