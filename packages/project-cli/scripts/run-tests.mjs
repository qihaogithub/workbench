import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { buildProjectCli } from "./build.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testOutputDir = path.join(packageRoot, "dist", "tests");
const tests = [
  "cli.test.ts",
  "cli-all-commands.test.ts",
  "workspace-authority-client.test.ts",
  "remote-auth.test.ts",
  "sync-commands.test.ts",
  "remote-doctor.test.ts",
];

await buildProjectCli({ force: true });
fs.mkdirSync(testOutputDir, { recursive: true });

for (const test of tests) {
  const outputFile = path.join(testOutputDir, test.replace(/\.ts$/, ".mjs"));
  await build({
    entryPoints: [path.join(packageRoot, "src", test)],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    external: ["typescript"],
    sourcemap: false,
    logLevel: "silent",
  });

  const result = spawnSync(process.execPath, [outputFile], {
    cwd: packageRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PROJECT_CLI_PACKAGE_ROOT: packageRoot,
      PROJECT_CLI_DISABLE_AUTO_RUN: "1",
    },
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
