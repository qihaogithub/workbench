import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const outputFile = path.join(packageRoot, "dist", "index.mjs");

const sourceRoots = [
  path.join(packageRoot, "src"),
  path.join(repoRoot, "packages", "project-core", "src"),
  path.join(repoRoot, "packages", "project-scaffold", "src"),
  path.join(repoRoot, "packages", "preview-contract", "src"),
  path.join(repoRoot, "packages", "shared", "src"),
  path.join(repoRoot, "packages", "knowledge-core", "src"),
  path.join(repoRoot, "packages", "knowledge-service", "src"),
];

function latestMtimeMs(entryPath) {
  if (!fs.existsSync(entryPath)) return 0;
  const stats = fs.statSync(entryPath);
  if (!stats.isDirectory()) return stats.mtimeMs;

  let latest = stats.mtimeMs;
  for (const entry of fs.readdirSync(entryPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    latest = Math.max(latest, latestMtimeMs(path.join(entryPath, entry.name)));
  }
  return latest;
}

export function needsBuild() {
  if (!fs.existsSync(outputFile)) return true;
  const outputMtime = fs.statSync(outputFile).mtimeMs;
  return sourceRoots.some((sourceRoot) => latestMtimeMs(sourceRoot) > outputMtime);
}

export async function buildProjectCli({ force = false } = {}) {
  if (!force && !needsBuild()) {
    return { outputFile, rebuilt: false };
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const { build } = await import("esbuild");
  await build({
    entryPoints: [path.join(packageRoot, "src", "index.ts")],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    external: ["typescript"],
    sourcemap: false,
    logLevel: "silent",
  });
  return { outputFile, rebuilt: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildProjectCli({ force: process.argv.includes("--force") }).then((result) => {
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ ok: true, data: result }, null, 2)}\n`);
    } else {
      process.stdout.write(`${result.rebuilt ? "built" : "up-to-date"} ${path.relative(packageRoot, result.outputFile)}\n`);
    }
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
