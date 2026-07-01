import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const PORTS = [3200, 3201, 3202, 3300];
const SHUTDOWN_WAIT_MS = 1500;
const NEXT_CACHE_DIRS = [
  resolve("packages/author-site/.next"),
  resolve("packages/viewer-site/.next"),
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const unique = (values) => [...new Set(values)];

function findListeningPids(port) {
  const result = spawnSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("lsof is required to clean occupied dev ports.");
    }
    throw result.error;
  }

  if (result.status !== 0 && result.stdout.trim() === "") {
    return [];
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

async function terminatePids(pids) {
  if (pids.length === 0) {
    console.log("[dev-restart] Dev ports are free.");
    return;
  }

  console.log(`[dev-restart] Releasing occupied dev ports, PIDs: ${pids.join(", ")}`);

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") {
        console.warn(`[dev-restart] Failed to SIGTERM ${pid}: ${error.message}`);
      }
    }
  }

  await sleep(SHUTDOWN_WAIT_MS);

  const remaining = pids.filter(isRunning);
  for (const pid of remaining) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") {
        console.warn(`[dev-restart] Failed to SIGKILL ${pid}: ${error.message}`);
      }
    }
  }
}

async function cleanPorts() {
  const pidsByPort = new Map();

  for (const port of PORTS) {
    const pids = findListeningPids(port);
    pidsByPort.set(port, pids);
  }

  for (const [port, pids] of pidsByPort) {
    if (pids.length > 0) {
      console.log(`[dev-restart] Port ${port} is occupied by PID(s): ${pids.join(", ")}`);
    }
  }

  const pids = unique([...pidsByPort.values()].flat());
  await terminatePids(pids);
}

function cleanNextCaches() {
  for (const dir of NEXT_CACHE_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("[dev-restart] Cleared Next.js dev caches.");
}

function startDevServices() {
  const child = spawn("corepack", ["pnpm", "run", "dev:services"], {
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (child.exitCode === null) {
      child.kill(signal);
    }
  };

  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

try {
  await cleanPorts();
  cleanNextCaches();
  startDevServices();
} catch (error) {
  console.error(`[dev-restart] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
