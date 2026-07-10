import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const root = process.cwd();
const errors = [];
const warnings = [];

const requiredGitignoreEntries = [
  "node_modules",
  "dist",
  "coverage",
  ".next",
  "*.log",
  ".env",
  "/data/agent-run-logs/",
  "/data/screenshots/",
  "/data/workspaces/",
  "/data/sessions/",
  "/data/snapshots/",
];

const rootClutterPatterns = [
  /^tmp[-_].*\.(png|jpg|jpeg|webp|yaml|yml|json)$/i,
  /^\.tmp[-_].*\.(yaml|yml|json)$/i,
  /^dev.*\.log$/i,
  /^.*verification.*\.png$/i,
  /^position.*\.ya?ml$/i,
];

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walkFiles(dir, predicate = () => true, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "dist", "coverage", ".git"].includes(entry.name)) {
        continue;
      }
      walkFiles(fullPath, predicate, files);
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeSlash(value) {
  return value.replace(/\\/g, "/");
}

function collectWorkspacePackageDirectories() {
  const packageJsonFiles = [
    ...walkFiles(path.join(root, "packages"), (file) => path.basename(file) === "package.json"),
    ...walkFiles(path.join(root, "OPS"), (file) => path.basename(file) === "package.json"),
  ];
  const directories = new Map();

  for (const packageJsonFile of packageJsonFiles) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, "utf8"));
      if (typeof packageJson.name === "string" && packageJson.name) {
        directories.set(packageJson.name, path.dirname(packageJsonFile));
      }
    } catch {
      // Invalid package manifests are reported by their package-level checks.
    }
  }

  return directories;
}

function resolveScriptWorkingDirectory(script, commandIndex, workspacePackageDirectories) {
  const commandPrefix = script.slice(0, commandIndex);
  const filterExecMatch = commandPrefix.match(
    /(?:corepack\s+)?pnpm\s+--filter(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"'&|]+))\s+exec\s*$/,
  );
  const packageSelector = filterExecMatch?.[1] ?? filterExecMatch?.[2] ?? filterExecMatch?.[3];
  return (packageSelector && workspacePackageDirectories.get(packageSelector)) || root;
}

function checkRequiredFiles() {
  for (const file of [
    "AGENTS.md",
    "package.json",
    "docs/项目文档/INDEX.md",
    "docs/plans/已完成/README.md",
    "data/README.md",
  ]) {
    if (!exists(file)) {
      addError(`缺少必要文件: ${file}`);
    }
  }
}

function checkGitignore() {
  if (!exists(".gitignore")) {
    addError("缺少 .gitignore");
    return;
  }
  const gitignore = readText(".gitignore");
  for (const entry of requiredGitignoreEntries) {
    if (!gitignore.includes(entry)) {
      addWarning(`.gitignore 未包含建议项: ${entry}`);
    }
  }
}

function checkRootClutter() {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (rootClutterPatterns.some((pattern) => pattern.test(entry.name))) {
      addWarning(`根目录存在临时/诊断产物，建议归档或清理: ${entry.name}`);
    }
  }
}

function checkUtf8Markdown() {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const markdownFiles = [
    ...walkFiles(path.join(root, "docs", "项目文档"), (file) => file.endsWith(".md")),
    path.join(root, "docs", "plans", "已完成", "README.md"),
    path.join(root, "docs", "plans", "进行中", "P0P1维护性治理实施记录.md"),
  ].filter((file) => fs.existsSync(file));
  if (exists("data/README.md")) {
    markdownFiles.push(path.join(root, "data", "README.md"));
  }
  for (const file of markdownFiles) {
    try {
      decoder.decode(fs.readFileSync(file));
    } catch {
      addError(`Markdown 不是合法 UTF-8: ${normalizeSlash(path.relative(root, file))}`);
    }
  }
}

function checkMarkdownLinks() {
  const strictFiles = [
    ...walkFiles(path.join(root, "docs", "项目文档"), (file) => file.endsWith(".md")),
    path.join(root, "docs", "plans", "已完成", "README.md"),
    path.join(root, "docs", "plans", "进行中", "P0P1维护性治理实施记录.md"),
  ].filter((file) => fs.existsSync(file));
  const legacyFiles = walkFiles(path.join(root, "docs", "plans"), (file) => file.endsWith(".md"))
    .filter((file) => !strictFiles.includes(file));
  const markdownFiles = [
    ...strictFiles.map((file) => ({ file, strict: true })),
    ...legacyFiles.map((file) => ({ file, strict: false })),
  ];
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const { file, strict } of markdownFiles) {
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
        addWarning(`Markdown 链接指向仓库外: ${normalizeSlash(path.relative(root, file))} -> ${target}`);
        continue;
      }
      if (!fs.existsSync(resolved)) {
        const message = `Markdown 链接不存在: ${normalizeSlash(path.relative(root, file))} -> ${target}`;
        if (strict) addError(message);
        else addWarning(message);
      }
    }
  }
}

function checkScriptPaths() {
  const packageJson = JSON.parse(readText("package.json"));
  const scripts = packageJson.scripts ?? {};
  const workspacePackageDirectories = collectWorkspacePackageDirectories();
  const pathPattern = /(?:node|tsx|playwright\s+test)\s+(?:--config\s+)?("[^"]+"|'[^']+'|[^\s&|]+)/g;
  for (const [name, script] of Object.entries(scripts)) {
    let match;
    while ((match = pathPattern.exec(script))) {
      let candidate = match[1]?.replace(/^['"]|['"]$/g, "");
      if (!candidate || candidate.startsWith("--")) continue;
      if (!/\.(mjs|js|ts|tsx)$/.test(candidate)) continue;
      const workingDirectory = resolveScriptWorkingDirectory(
        script,
        match.index,
        workspacePackageDirectories,
      );
      if (!fs.existsSync(path.resolve(workingDirectory, candidate))) {
        addError(`package.json 脚本 ${name} 指向不存在的路径: ${candidate}`);
      }
    }
  }
}

checkRequiredFiles();
checkGitignore();
checkRootClutter();
checkUtf8Markdown();
checkMarkdownLinks();
checkScriptPaths();

const warningPrintLimit = 30;
for (const warning of warnings.slice(0, warningPrintLimit)) {
  console.warn(`[warn] ${warning}`);
}
if (warnings.length > warningPrintLimit) {
  console.warn(`[warn] 还有 ${warnings.length - warningPrintLimit} 条 warning 未展开。`);
}
for (const error of errors) {
  console.error(`[error] ${error}`);
}

if (errors.length > 0) {
  console.error(`check:repo failed with ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(1);
}

console.log(`check:repo passed with ${warnings.length} warning(s).`);
