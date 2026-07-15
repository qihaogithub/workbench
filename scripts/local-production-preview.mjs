import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUTHOR_PORT = 3200;
const AGENT_PORT = 3201;
const SCREENSHOT_PORT = 3202;
const SHUTDOWN_WAIT_MS = 1500;
const SERVICE_READY_TIMEOUT_MS = 45_000;
const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const allowedArgs = new Set([
  "--build-only",
  "--dry-run",
  "--help",
  "--no-agent",
  "--no-screenshot",
]);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

function readEnvFile(path) {
  if (!existsSync(path)) return {};

  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function printUsage() {
  console.log(`用法:
  corepack pnpm preview:local
  corepack pnpm preview:local -- --build-only
  corepack pnpm preview:local -- --dry-run
  corepack pnpm preview:local -- --no-agent --no-screenshot

行为:
  1. 停止本项目的本地 Docker author-site，释放 3200 端口。
  2. 保留 .next 构建缓存，使用当前工作区源码执行 author-site production build。
  3. 检测 agent-service (3201) 和 screenshot-service (3202)，未运行时自动以 dev 模式启动。
  4. 只有构建成功才启动 http://localhost:3200。

选项:
  --build-only       仅构建当前源码，不启动任何服务
  --no-agent         不自动启动 agent-service（不可用时仅警告）
  --no-screenshot    不自动启动 screenshot-service（不可用时仅警告）
  --dry-run          仅打印执行计划
  --help             显示帮助`);
}

if (unknownArgs.length > 0) {
  console.error(`[本地准生产预览] 不支持的选项: ${unknownArgs.join(", ")}`);
  printUsage();
  process.exit(1);
}

if (args.has("--help")) {
  printUsage();
  process.exit(0);
}

const configuredEnv = {
  ...readEnvFile(resolve(PROJECT_DIR, ".env")),
  ...readEnvFile(resolve(PROJECT_DIR, "packages/author-site/.env.local")),
  ...process.env,
};

const localEnv = {
  ...configuredEnv,
  DATA_DIR: configuredEnv.DATA_DIR || resolve(PROJECT_DIR, "data"),
  AGENT_SERVICE_URL: configuredEnv.AGENT_SERVICE_URL || "http://localhost:3201",
  SCREENSHOT_SERVICE_URL:
    configuredEnv.SCREENSHOT_SERVICE_URL || "http://localhost:3202",
  NEXT_PUBLIC_AGENT_SERVICE_URL:
    configuredEnv.NEXT_PUBLIC_AGENT_SERVICE_URL || "http://localhost:3201",
  NEXT_PUBLIC_SCREENSHOT_SERVICE_URL:
    configuredEnv.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL || "http://localhost:3202",
  NEXT_PUBLIC_WEB_URL:
    configuredEnv.NEXT_PUBLIC_WEB_URL || "http://localhost:3200",
  CORS_ORIGINS:
    configuredEnv.CORS_ORIGINS ||
    "http://localhost:3200,http://127.0.0.1:3200,http://localhost:3300,http://127.0.0.1:3300",
  HOSTNAME: configuredEnv.HOSTNAME || "0.0.0.0",
};
// 移除 PORT，避免父进程 PORT 泄漏到 agent-service / screenshot-service 子进程。
// author-site 通过 authorEnv 单独设置 PORT。
delete localEnv.PORT;

/** author-site 专用环境变量，不传递给其他子服务 */
const authorEnv = {
  ...localEnv,
  PORT: "3200",
};

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: PROJECT_DIR,
    env: localEnv,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} 执行失败`);
  }
}

function findListeningPids(port) {
  const result = spawnSync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("未找到 lsof，无法安全释放 3200 端口");
    }
    throw result.error;
  }

  return result.stdout
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isInteger);
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

const sleep = (ms) =>
  new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });

/**
 * 向指定端口的 LISTEN 进程发送 SIGTERM，等待后对残留进程发送 SIGKILL。
 * 端口空闲时直接返回。返回值为是否进行了 kill 操作。
 */
async function terminateByPort(port, label = `${port}`) {
  const pids = findListeningPids(port);
  if (pids.length === 0) return false;

  console.log(
    `[本地准生产预览] 停止 ${label} 端口现有进程: ${pids.join(", ")}`,
  );
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }

  await sleep(SHUTDOWN_WAIT_MS);
  for (const pid of pids.filter(isRunning)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  return true;
}

/**
 * 释放指定端口：先终止残留进程，再轮询等待端口真正空闲。
 * 超时则抛出错误，避免后续 EADDRINUSE 启动失败。
 */
async function freePort(port, label = `${port}`, timeoutMs = 10_000) {
  await terminateByPort(port, label);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (findListeningPids(port).length === 0) return;
    await sleep(500);
  }
  const remaining = findListeningPids(port);
  if (remaining.length > 0) {
    throw new Error(
      `${label} 端口在 ${timeoutMs / 1000}s 内未释放，残留 PID(s): ${remaining.join(", ")}`,
    );
  }
}

async function stopLocalAuthorProcesses() {
  const composePs = spawnSync(
    "docker",
    ["compose", "ps", "-q", "author-site"],
    { cwd: PROJECT_DIR, encoding: "utf8" },
  );

  if (composePs.status === 0 && composePs.stdout.trim()) {
    console.log(
      "[本地准生产预览] 停止本项目 Docker author-site，保留其他服务和 data。",
    );
    run("docker", ["compose", "stop", "author-site"]);
    // docker compose stop 是同步阻塞的，但容器退出到端口释放可能仍有延迟，
    // 后续由 freePort 统一兜底。
  }

  if (findListeningPids(AUTHOR_PORT).length === 0) {
    console.log("[本地准生产预览] 3200 端口已空闲。");
    return;
  }

  await freePort(AUTHOR_PORT, "3200");
  console.log("[本地准生产预览] 3200 端口已空闲。");
}

async function isServiceHealthy(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForService(name, url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServiceHealthy(url)) return true;
    await sleep(1000);
  }
  return false;
}

/**
 * 检测服务是否可用；不可用时按策略自动以 dev 模式启动。
 *
 * @param {object} options
 * @param {string} options.name 服务名称（日志显示）
 * @param {string} options.url 健康检查 URL
 * @param {string} options.filter pnpm --filter 包名
 * @param {boolean} options.autoStart 是否自动启动
 * @param {string[]} options.ports 启动前需要释放的端口
 * @param {ChildProcess[]} spawnedChildren 已启动的子进程列表（信号传播用）
 */
async function ensureService(
  { name, url, filter, autoStart, ports },
  spawnedChildren,
) {
  if (!autoStart) {
    if (await isServiceHealthy(url)) {
      console.log(`[本地准生产预览] ${name} 已运行: ${url}`);
    } else {
      console.warn(
        `[本地准生产预览] 警告: ${name} 不可用 (${url})，相关功能可能不完整。`,
      );
    }
    return;
  }

  // 无论服务是否健康，都先关闭再重启，确保使用最新代码。
  const wasHealthy = await isServiceHealthy(url);
  if (wasHealthy) {
    console.log(`[本地准生产预览] ${name} 运行中，关闭以重启…`);
  } else {
    console.log(`[本地准生产预览] ${name} 未运行，准备启动 (${filter})…`);
  }
  for (const port of ports) {
    await freePort(port, `${port} (${name})`);
  }

  const child = spawn("corepack", ["pnpm", "--filter", filter, "dev"], {
    cwd: PROJECT_DIR,
    env: localEnv,
    stdio: "inherit",
  });
  spawnedChildren.push(child);
  child.once("exit", () => {
    const idx = spawnedChildren.indexOf(child);
    if (idx >= 0) spawnedChildren.splice(idx, 1);
  });

  const ready = await waitForService(name, url, SERVICE_READY_TIMEOUT_MS);
  if (!ready) {
    console.warn(
      `[本地准生产预览] 警告: ${name} 在 ${SERVICE_READY_TIMEOUT_MS / 1000}s 内未就绪 (${url})，编辑页可能显示"协同异常"，请检查服务日志。`,
    );
  } else {
    console.log(`[本地准生产预览] ${name} 已就绪: ${url}`);
  }
}

function prepareStandaloneRuntime() {
  const authorDir = resolve(PROJECT_DIR, "packages/author-site");
  const standaloneAuthorDir = resolve(
    authorDir,
    ".next/standalone/packages/author-site",
  );
  const serverPath = resolve(standaloneAuthorDir, "server.js");

  if (!existsSync(serverPath)) {
    throw new Error(`standalone server 不存在: ${serverPath}`);
  }

  const copies = [
    [
      resolve(authorDir, ".next/static"),
      resolve(standaloneAuthorDir, ".next/static"),
    ],
    [resolve(authorDir, "public"), resolve(standaloneAuthorDir, "public")],
  ];

  for (const [source, target] of copies) {
    if (!existsSync(source)) continue;
    rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }

  return serverPath;
}

if (args.has("--dry-run")) {
  console.log("[本地准生产预览] 计划:");
  console.log("- 停止本项目 Docker author-site 和 3200 端口现有进程");
  if (!args.has("--no-agent")) {
    console.log("- 检测 agent-service (3201)，未运行时自动以 dev 模式启动");
  }
  if (!args.has("--no-screenshot")) {
    console.log(
      "- 检测 screenshot-service (3202)，未运行时自动以 dev 模式启动",
    );
  }
  console.log("- 保留 packages/author-site/.next 缓存");
  console.log("- 使用当前工作区执行 author-site production build");
  if (!args.has("--build-only")) {
    console.log("- 构建成功后启动 http://localhost:3200");
  }
  process.exit(0);
}

try {
  await stopLocalAuthorProcesses();

  const spawnedChildren = [];
  await Promise.all([
    ensureService(
      {
        name: "agent-service",
        url: `http://localhost:${AGENT_PORT}/health`,
        filter: "@workbench/agent-service",
        autoStart: !args.has("--no-agent"),
        ports: [AGENT_PORT],
      },
      spawnedChildren,
    ),
    ensureService(
      {
        name: "screenshot-service",
        url: `http://localhost:${SCREENSHOT_PORT}/health`,
        filter: "@workbench/screenshot-service",
        autoStart: !args.has("--no-screenshot"),
        ports: [SCREENSHOT_PORT],
      },
      spawnedChildren,
    ),
  ]);

  console.log("[本地准生产预览] 开始用当前工作区源码执行 production build…");
  run("corepack", ["pnpm", "--filter", "@workbench/author-site", "build"]);
  const standaloneServerPath = prepareStandaloneRuntime();
  console.log("[本地准生产预览] 当前源码构建成功。");

  if (args.has("--build-only")) {
    for (const child of spawnedChildren) {
      if (child.exitCode === null) child.kill("SIGTERM");
    }
    process.exit(0);
  }

  // 启动 author-site 前再次释放 3200，防止构建期间端口被重新占用。
  await freePort(AUTHOR_PORT, "3200");

  console.log("[本地准生产预览] 启动 http://localhost:3200");
  const authorChild = spawn(process.execPath, [standaloneServerPath], {
    cwd: PROJECT_DIR,
    env: authorEnv,
    stdio: "inherit",
  });
  spawnedChildren.push(authorChild);

  const forwardSignal = (signal) => {
    for (const child of spawnedChildren) {
      if (child.exitCode === null) {
        try {
          child.kill(signal);
        } catch {
          // 忽略已退出进程的 kill 失败。
        }
      }
    }
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));
  authorChild.once("exit", (code, signal) => {
    // author-site 退出时，一并关停自动启动的 agent/screenshot。
    forwardSignal("SIGTERM");
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(
    `[本地准生产预览] ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error("[本地准生产预览] 构建或启动失败，未回退启动旧产物。");
  process.exit(1);
}
