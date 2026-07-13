#!/usr/bin/env node

import path from "node:path";

import { migrateWorkspaceAuthorities } from "../workspace/workspace-authority-migration";

function parseArgs(argv: string[]) {
  const options: {
    dataDir: string;
    projectId?: string;
    workspaceId?: string;
    all?: boolean;
    apply: boolean;
    json: boolean;
  } = {
    dataDir: process.env.DATA_DIR || path.join(process.env.INIT_CWD || process.cwd(), "data"),
    apply: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;
    if (value === "--data-dir") options.dataDir = argv[++index] ?? "";
    else if (value === "--project") options.projectId = argv[++index];
    else if (value === "--workspace") options.workspaceId = argv[++index];
    else if (value === "--all") options.all = true;
    else if (value === "--apply") options.apply = true;
    else if (value === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await migrateWorkspaceAuthorities(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Workspace Authority migration: matched=${result.summary.matched} changed=${result.summary.changed} blocked=${result.summary.blocked}`);
      for (const item of result.items) console.log(`- ${item.projectId}/${item.workspaceId}: ${item.action}`);
    }
    if (!result.success) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
