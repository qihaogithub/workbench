#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryDir = path.join(root, "OPS", "automations", "registry");
const registryFiles = ["tools.json", "tests.json", "scripts.json"];
const staleIssueDays = 30;

function normalizeSlash(value) {
  return value.replace(/\\/g, "/");
}

function relative(filePath) {
  return normalizeSlash(path.relative(root, filePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walkFiles(dir, predicate = () => true, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, files);
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readPackageScripts() {
  const packageJson = readJson("package.json");
  return packageJson.scripts ?? {};
}

function loadRegistries() {
  return registryFiles.map((fileName) => {
    const relativePath = normalizeSlash(path.join("OPS", "automations", "registry", fileName));
    const data = readJson(relativePath);
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      fileName,
      relativePath,
      data,
      items: items.map((item) => ({ ...item, registry: fileName })),
    };
  });
}

function allItems() {
  return loadRegistries().flatMap((registry) => registry.items);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    command: args.find((arg) => !arg.startsWith("-")) ?? "help",
    json: args.includes("--json"),
  };
}

function commandTokens(command) {
  return command.trim().split(/\s+/).filter(Boolean);
}

function parsePnpmCommand(command) {
  const tokens = commandTokens(command);
  if (tokens[0] !== "corepack" || tokens[1] !== "pnpm") {
    return null;
  }

  let index = 2;
  let filter = null;
  while (tokens[index]?.startsWith("-")) {
    const option = tokens[index];
    if (option === "--filter") {
      filter = tokens[index + 1] ?? null;
      index += 2;
      continue;
    }
    index += 1;
  }

  return {
    filter,
    scriptName: tokens[index] ?? null,
  };
}

function addIssue(issues, level, item, message) {
  issues.push({
    level,
    id: item?.id ?? null,
    registry: item?.registry ?? null,
    message,
  });
}

function validateItemShape(issues, item) {
  for (const field of ["id", "kind", "title", "path", "command", "ownerArea", "status", "automationLevel"]) {
    if (typeof item[field] !== "string" || item[field].trim() === "") {
      addIssue(issues, "error", item, `missing required string field: ${field}`);
    }
  }
  for (const field of ["requiresServices", "writes", "docs"]) {
    if (!Array.isArray(item[field])) {
      addIssue(issues, "error", item, `missing required array field: ${field}`);
    }
  }
}

function validateCommand(issues, item, packageScripts) {
  const parsed = parsePnpmCommand(item.command ?? "");
  if (!parsed?.scriptName) {
    addIssue(issues, "warning", item, `command is not a root corepack pnpm script: ${item.command}`);
    return;
  }

  if (parsed.filter) {
    if (!item.packagePath) {
      addIssue(issues, "warning", item, "filtered pnpm command has no packagePath to validate package scripts");
      return;
    }
    if (!exists(item.packagePath)) {
      return;
    }
    const packageJson = readJson(item.packagePath);
    const scripts = packageJson.scripts ?? {};
    if (!Object.prototype.hasOwnProperty.call(scripts, parsed.scriptName)) {
      addIssue(issues, "error", item, `command references missing package script: ${item.packagePath}#${parsed.scriptName}`);
    }
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(packageScripts, parsed.scriptName)) {
    addIssue(issues, "error", item, `command references missing root script: ${parsed.scriptName}`);
  }
}

function validateRegistry() {
  const issues = [];
  const registries = loadRegistries();
  const packageScripts = readPackageScripts();
  const seenIds = new Map();

  for (const fileName of registryFiles) {
    if (!fs.existsSync(path.join(registryDir, fileName))) {
      issues.push({ level: "error", id: null, registry: fileName, message: `missing registry file: ${fileName}` });
    }
  }

  for (const registry of registries) {
    if (registry.data.version !== 1) {
      issues.push({
        level: "error",
        id: null,
        registry: registry.fileName,
        message: "registry version must be 1",
      });
    }
    if (!Array.isArray(registry.data.items)) {
      issues.push({
        level: "error",
        id: null,
        registry: registry.fileName,
        message: "registry items must be an array",
      });
      continue;
    }

    for (const item of registry.items) {
      validateItemShape(issues, item);

      if (seenIds.has(item.id)) {
        addIssue(issues, "error", item, `duplicate id also found in ${seenIds.get(item.id)}`);
      } else {
        seenIds.set(item.id, registry.fileName);
      }

      if (item.path && !exists(item.path)) {
        addIssue(issues, "error", item, `path does not exist: ${item.path}`);
      }

      if (item.packagePath && !exists(item.packagePath)) {
        addIssue(issues, "error", item, `packagePath does not exist: ${item.packagePath}`);
      }

      for (const docPath of item.docs ?? []) {
        if (!exists(docPath)) {
          addIssue(issues, "error", item, `doc path does not exist: ${docPath}`);
        }
      }

      validateCommand(issues, item, packageScripts);
    }
  }

  return issues;
}

function validateAutomationMarkdown(issues) {
  const markdownFiles = walkFiles(path.join(root, "OPS", "automations"), (file) => file.endsWith(".md"));
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const file of markdownFiles) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = linkPattern.exec(content))) {
      const target = match[1]?.trim();
      if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("#")) {
        continue;
      }
      if (/^[a-z]+:/i.test(target)) continue;
      const cleanTarget = decodeURIComponent(target.split("#")[0] ?? "").replace(/^<|>$/g, "");
      if (!cleanTarget) continue;
      const resolved = path.resolve(path.dirname(file), cleanTarget);
      if (!resolved.startsWith(root)) {
        issues.push({
          level: "warning",
          id: null,
          registry: "markdown",
          message: `link points outside repository: ${relative(file)} -> ${target}`,
        });
        continue;
      }
      if (!fs.existsSync(resolved)) {
        issues.push({
          level: "error",
          id: null,
          registry: "markdown",
          message: `missing link target: ${relative(file)} -> ${target}`,
        });
      }
    }
  }
}

function firstHeading(content, fallback) {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? fallback;
}

function planStatus(content) {
  const match = content.match(/>\s*状态[：:]\s*(.+)/);
  if (match?.[1]) return match[1].trim();
  const inline = content.match(/状态[：:]\s*`?([^`\n]+)`?/);
  return inline?.[1]?.trim() ?? "未标注";
}

function normalizeTitle(value) {
  return value
    .replace(/^\d{4}[-_年]\d{1,2}[-_月]\d{1,2}日?[-_]?/, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/[【】\[\]（）()_\-\s]/g, "")
    .toLowerCase();
}

function markdownMissingLinks(file, content) {
  const missing = [];
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(content))) {
    const target = match[1]?.trim();
    if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("#")) {
      continue;
    }
    if (/^[a-z]+:/i.test(target)) continue;
    const cleanTarget = decodeURIComponent(target.split("#")[0] ?? "").replace(/^<|>$/g, "");
    if (!cleanTarget) continue;
    const resolved = path.resolve(path.dirname(file), cleanTarget);
    if (resolved.startsWith(root) && !fs.existsSync(resolved)) {
      missing.push(target);
    }
  }
  return missing;
}

function collectStaleIssues() {
  const plansDir = path.join(root, "docs", "plans", "进行中");
  const files = walkFiles(plansDir, (file) => file.endsWith(".md"));
  const now = Date.now();
  const titleMap = new Map();
  const items = [];

  for (const file of files) {
    const content = readText(file);
    const title = firstHeading(content, path.basename(file, ".md"));
    const status = planStatus(content);
    const stats = fs.statSync(file);
    const daysSinceModified = Math.floor((now - stats.mtimeMs) / (1000 * 60 * 60 * 24));
    const missingLinks = markdownMissingLinks(file, content);
    const normalizedTitle = normalizeTitle(title);
    const item = {
      file: relative(file),
      title,
      status,
      daysSinceModified,
      missingLinks,
      signals: [],
    };

    if (/已完成|完成|closed|done/i.test(status)) {
      item.signals.push("completed-in-progress");
    }
    if (daysSinceModified >= staleIssueDays) {
      item.signals.push("stale-by-mtime");
    }
    if (missingLinks.length > 0) {
      item.signals.push("missing-links");
    }

    if (normalizedTitle) {
      const existing = titleMap.get(normalizedTitle) ?? [];
      existing.push(item.file);
      titleMap.set(normalizedTitle, existing);
    }

    items.push(item);
  }

  const duplicateGroups = [...titleMap.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, filesInGroup]) => ({ key, files: filesInGroup }));
  const duplicateFiles = new Set(duplicateGroups.flatMap((group) => group.files));

  for (const item of items) {
    if (duplicateFiles.has(item.file)) {
      item.signals.push("possible-duplicate-title");
    }
  }

  const flagged = items.filter((item) => item.signals.length > 0);
  return {
    scanned: items.length,
    flagged: flagged.length,
    staleDays: staleIssueDays,
    duplicateGroups,
    items: flagged,
  };
}

function printList(json) {
  const items = allItems();
  if (json) {
    console.log(JSON.stringify({ count: items.length, items }, null, 2));
    return;
  }
  for (const item of items) {
    console.log(`${item.id}\t${item.kind}\t${item.status}\t${item.command}`);
  }
}

function printReport(json) {
  const items = allItems();
  const byRegistry = {};
  const byStatus = {};
  const byAutomationLevel = {};
  for (const item of items) {
    byRegistry[item.registry] = (byRegistry[item.registry] ?? 0) + 1;
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    byAutomationLevel[item.automationLevel] = (byAutomationLevel[item.automationLevel] ?? 0) + 1;
  }
  const report = {
    count: items.length,
    byRegistry,
    byStatus,
    byAutomationLevel,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`automation registry entries: ${items.length}`);
  console.log(`by registry: ${JSON.stringify(byRegistry)}`);
  console.log(`by status: ${JSON.stringify(byStatus)}`);
  console.log(`by automation level: ${JSON.stringify(byAutomationLevel)}`);
}

function printCheck(json) {
  const issues = validateRegistry();
  validateAutomationMarkdown(issues);
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");

  if (json) {
    console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings }, null, 2));
  } else {
    for (const warning of warnings) {
      console.warn(`[warn] ${warning.registry ?? "-"} ${warning.id ?? "-"}: ${warning.message}`);
    }
    for (const error of errors) {
      console.error(`[error] ${error.registry ?? "-"} ${error.id ?? "-"}: ${error.message}`);
    }
    console.log(`check:automation ${errors.length === 0 ? "passed" : "failed"} with ${errors.length} error(s), ${warnings.length} warning(s).`);
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

function printStaleIssues(json) {
  const report = collectStaleIssues();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`stale-issues scanned ${report.scanned} in-progress plan file(s), flagged ${report.flagged}.`);
  console.log(`stale threshold: ${report.staleDays} day(s) by filesystem mtime.`);
  for (const item of report.items) {
    console.log(`- ${item.file}`);
    console.log(`  title: ${item.title}`);
    console.log(`  status: ${item.status}`);
    console.log(`  modified: ${item.daysSinceModified} day(s) ago`);
    console.log(`  signals: ${item.signals.join(", ")}`);
    if (item.missingLinks.length > 0) {
      console.log(`  missing links: ${item.missingLinks.join(", ")}`);
    }
  }
  if (report.duplicateGroups.length > 0) {
    console.log("possible duplicate title groups:");
    for (const group of report.duplicateGroups) {
      console.log(`- ${group.files.join(" | ")}`);
    }
  }
}

function printHelp() {
  console.log(`Usage: node OPS/automations/bin/automation.mjs <command> [--json]

Commands:
  list-tools      List all registered tools, tests and scripts
  check-tools     Validate registry paths, docs and root script references
  report          Print registry summary
  stale-issues    Scan docs/plans/进行中 for stale, completed, duplicate or broken-link records
  help            Show this help
`);
}

const { command, json } = parseArgs(process.argv);

try {
  if (command === "list-tools") {
    printList(json);
  } else if (command === "check-tools") {
    printCheck(json);
  } else if (command === "report") {
    printReport(json);
  } else if (command === "stale-issues") {
    printStaleIssues(json);
  } else {
    printHelp();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
