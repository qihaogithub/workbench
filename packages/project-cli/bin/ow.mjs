#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildProjectCli } from "../scripts/build.mjs";

try {
  const { outputFile } = await buildProjectCli();
  const cliModule = await import(`${pathToFileURL(outputFile).href}?t=${Date.now()}`);
  if (typeof cliModule.runCli !== "function") {
    throw new Error(`Invalid CLI bundle: ${path.relative(process.cwd(), outputFile)} does not export runCli`);
  }
  process.exitCode = await cliModule.runCli(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
