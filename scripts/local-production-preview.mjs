import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUTHOR_PORT = 3200;
const SHUTDOWN_WAIT_MS = 1500;
const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const allowedArgs = new Set(["--build-only", "--dry-run", "--help"]);
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

行为:
  1. 停止本项目的本地 Docker author-site，释放 3200 端口。
  2. 保留 .next 构建缓存，使用当前工作区源码执行 author-site production build。
  3. 只有构建成功才启动 http://localhost:3200。

选项:
  --build-only  仅构建当前源码，不启动服务
  --dry-run     仅打印执行计划
  --help        显示帮助`);
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
  AGENT_SERVICE_URL:
    configuredEnv.AGENT_SERVICE_URL || "http://localhost:3201",
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
  const result = spawnSync("lsof", [
    `-tiTCP:${port}`,
    "-sTCP:LISTEN",
  ], { encoding: "utf8" });

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

const sleep = (ms) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, ms);
});

async function stopLocalAuthorProcesses() {
  const composePs = spawnSync(
    "docker",
    ["compose", "ps", "-q", "author-site"],
    { cwd: PROJECT_DIR, encoding: "utf8" },
  );

  if (composePs.status === 0 && composePs.stdout.trim()) {
    console.log("[本地准生产预览] 停止本项目 Docker author-site，保留其他服务和 data。");
    run("docker", ["compose", "stop", "author-site"]);
  }

  const pids = findListeningPids(AUTHOR_PORT);
  if (pids.length === 0) {
    console.log("[本地准生产预览] 3200 端口已空闲。");
    return;
  }

  console.log(`[本地准生产预览] 停止 3200 端口现有进程: ${pids.join(", ")}`);
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
}

async function checkOptionalService(name, url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      console.log(`[本地准生产预览] ${name} 可用: ${url}`);
      return;
    }
  } catch {
    // 下方统一输出不阻断警告。
  }

  console.warn(`[本地准生产预览] 警告: ${name} 不可用 (${url})，相关功能可能不完整。`);
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
    [resolve(authorDir, ".next/static"), resolve(standaloneAuthorDir, ".next/static")],
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
  console.log("- 保留 packages/author-site/.next 缓存");
  console.log("- 使用当前工作区执行 author-site production build");
  if (!args.has("--build-only")) {
    console.log("- 构建成功后启动 http://localhost:3200");
  }
  process.exit(0);
}

try {
  await stopLocalAuthorProcesses();
  await Promise.all([
    checkOptionalService("agent-service", "http://localhost:3201/health"),
    checkOptionalService("screenshot-service", "http://localhost:3202/health"),
  ]);

  console.log("[本地准生产预览] 开始用当前工作区源码执行 production build…");
  run("corepack", ["pnpm", "--filter", "@workbench/author-site", "build"]);
  const standaloneServerPath = prepareStandaloneRuntime();
  console.log("[本地准生产预览] 当前源码构建成功。");

  if (args.has("--build-only")) {
    process.exit(0);
  }

  console.log("[本地准生产预览] 启动 http://localhost:3200");
  const child = spawn(
    process.execPath,
    [standaloneServerPath],
    {
      cwd: PROJECT_DIR,
      env: localEnv,
      stdio: "inherit",
    },
  );

  const forwardSignal = (signal) => {
    if (child.exitCode === null) child.kill(signal);
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));
  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(`[本地准生产预览] ${error instanceof Error ? error.message : String(error)}`);
  console.error("[本地准生产预览] 构建或启动失败，未回退启动旧产物。");
  process.exit(1);
}
