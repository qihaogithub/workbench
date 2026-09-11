#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPECTED_VERSIONS = Object.freeze({
  packageManager: "pnpm@8.15.0",
  node: ">=24.0.0 <25",
  typescript: "5.9.3",
  playwright: "1.59.1",
  vitest: "2.1.9",
});

const SERVICES = Object.freeze([
  "author",
  "agent",
  "screenshot",
  "knowledge",
  "viewer",
  "sketch",
]);

const SERVICE_ALIASES = Object.freeze({
  author: ["author-site", "author_site", "author", "创作端"],
  agent: ["agent-service", "agent_service", "agent"],
  screenshot: ["screenshot-service", "screenshot_service", "screenshot"],
  knowledge: ["knowledge-service", "knowledge_service", "knowledge"],
  viewer: ["viewer-site", "viewer_site", "viewer"],
  sketch: ["sketch-playground", "sketch_playground", "sketch"],
});

const EXPECTED_TOPOLOGY = Object.freeze({
  local: Object.freeze({
    author: 4200,
    agent: 4201,
    screenshot: 4202,
    knowledge: 4203,
    viewer: 4300,
    sketch: 3400,
  }),
  docker: Object.freeze({
    author: 3200,
    agent: 3201,
    screenshot: 3202,
    knowledge: 3203,
    viewer: 3300,
  }),
});

const LEGACY_MODEL_FIELDS = [
  "allowedPrefixes",
  "defaultModelIds",
  "nameFilters",
  "blacklist",
  "NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES",
  "NEXT_PUBLIC_MODEL_NAME_FILTERS",
  "NEXT_PUBLIC_DEFAULT_MODEL_IDS",
  "NEXT_PUBLIC_MODEL_BLACKLIST",
  "imageDescription",
];

const CONFIG_KINDS = Object.freeze({
  tsconfig: (name) => /^tsconfig(?:\.[^.]+)?\.json$/.test(name),
  vitest: (name) => /^vitest\.config\.[cm]?[jt]s$/.test(name),
  tailwind: (name) => /^tailwind\.config\.[cm]?[jt]s$/.test(name),
  eslint: (name) =>
    /^\.eslintrc(?:\.[^.]+)?$/.test(name) || /^eslint\.config\.[cm]?[jt]s$/.test(name),
});

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "data",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
  "out",
  "tmp",
]);

const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);

function relativeFile(root, absoluteFile) {
  return path.relative(root, absoluteFile) || path.basename(absoluteFile);
}

function lineNumber(source, index) {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}

function issue(root, file, line, message) {
  return { file: relativeFile(root, file), line, message };
}

function walkFiles(root) {
  const result = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else result.push(absolute);
    }
  };
  visit(root);
  return result;
}

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function isTestFile(relative) {
  return /(?:^|\/)(?:tests?|__tests__|fixtures?)(?:\/|$)|(?:\.test|\.spec)\./.test(
    relative,
  );
}

function loadAllowlist(root, allowlistPath) {
  const file = allowlistPath ?? path.join(root, "scripts/config-drift-allowlist.json");
  if (!existsSync(file)) return { value: {}, issues: [] };
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        value: {},
        issues: [issue(root, file, 1, "allowlist must contain a JSON object")],
      };
    }
    return { value, issues: [] };
  } catch (error) {
    const line = error?.lineNumber ?? 1;
    return { value: {}, issues: [issue(root, file, line, "allowlist is not valid JSON")] };
  }
}

function allowlistFiles(allowlist, section, key) {
  const entries = allowlist?.[section]?.[key];
  if (!Array.isArray(entries)) return new Set();
  return new Set(
    entries
      .map((entry) => (typeof entry === "string" ? entry : entry?.file))
      .filter((entry) => typeof entry === "string"),
  );
}

function checkWorkspaceAndVersions(root, files) {
  const issues = [];
  const workspace = path.join(root, "pnpm-workspace.yaml");
  const workspaceSource = readText(workspace);
  if (workspaceSource === undefined) {
    issues.push(issue(root, workspace, 1, "pnpm-workspace.yaml is required"));
  }
  if (workspaceSource !== undefined) {
    for (const match of workspaceSource.matchAll(/^\s*overrides\s*:/gim)) {
      issues.push(issue(root, workspace, lineNumber(workspaceSource, match.index), "pnpm overrides must be declared only in the root package.json"));
    }
  }

  const manifests = files.filter((file) => path.basename(file) === "package.json");
  const rootManifest = path.join(root, "package.json");
  if (!manifests.includes(rootManifest)) {
    issues.push(issue(root, rootManifest, 1, "root package.json is required"));
  }
  for (const manifest of manifests) {
    const source = readText(manifest);
    if (!source) continue;
    let value;
    try {
      value = JSON.parse(source);
    } catch {
      continue;
    }
    if (manifest !== rootManifest && value?.pnpm?.overrides) {
      issues.push(issue(root, manifest, lineNumber(source, source.indexOf('"overrides"')), "pnpm overrides must be declared only in the root package.json"));
    }

    if (typeof value.packageManager === "string" && value.packageManager !== EXPECTED_VERSIONS.packageManager) {
      issues.push(issue(root, manifest, lineNumber(source, source.indexOf('"packageManager"')), `packageManager must be ${EXPECTED_VERSIONS.packageManager}`));
    }
    if (typeof value?.engines?.node === "string" && value.engines.node !== EXPECTED_VERSIONS.node) {
      issues.push(issue(root, manifest, lineNumber(source, source.indexOf('"node"')), `engines.node must be ${EXPECTED_VERSIONS.node}`));
    }

    const dependencySections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
    for (const section of dependencySections) {
      const dependencies = value?.[section];
      if (!dependencies || typeof dependencies !== "object") continue;
      for (const [name, expected] of [
        ["typescript", EXPECTED_VERSIONS.typescript],
        ["playwright", EXPECTED_VERSIONS.playwright],
        ["@playwright/test", EXPECTED_VERSIONS.playwright],
        ["vitest", EXPECTED_VERSIONS.vitest],
      ]) {
        if (typeof dependencies[name] !== "string") continue;
        if (dependencies[name] !== expected) {
          const token = `"${name}"`;
          issues.push(issue(root, manifest, lineNumber(source, source.indexOf(token)), `${section}.${name} must be exactly ${expected}`));
        }
      }
    }
  }
  return issues;
}

function parseCanonicalTopology(root) {
  const file = path.join(root, "packages/runtime-config/src/topology.ts");
  const source = readText(file);
  const issues = [];
  if (source === undefined) {
    return { topology: undefined, issues: [issue(root, file, 1, "canonical runtime topology file is missing")] };
  }
  const topology = {};
  for (const profile of ["local", "docker"]) {
    const profileMatch = source.match(new RegExp(`^\\s*${profile}:\\s*\\{([\\s\\S]*?)^\\s*\\},?`, "m"));
    if (!profileMatch) {
      issues.push(issue(root, file, 1, `canonical topology is missing ${profile} profile`));
      continue;
    }
    topology[profile] = {};
    for (const service of SERVICES) {
      if (EXPECTED_TOPOLOGY[profile][service] === undefined) continue;
      const serviceMatch = profileMatch[1].match(new RegExp(`^\\s*${service}:\\s*(\\d+)`, "m"));
      if (!serviceMatch) {
        issues.push(issue(root, file, lineNumber(source, source.indexOf(`${profile}:`)), `canonical topology is missing ${profile}.${service}`));
        continue;
      }
      topology[profile][service] = Number(serviceMatch[1]);
      if (topology[profile][service] !== EXPECTED_TOPOLOGY[profile][service]) {
        issues.push(issue(root, file, lineNumber(source, source.indexOf(serviceMatch[0])), `canonical ${profile}.${service} must use port ${EXPECTED_TOPOLOGY[profile][service]}`));
      }
    }
  }
  return { topology, issues };
}

function inferService(text) {
  const lower = text.toLowerCase();
  return SERVICES.find((service) => SERVICE_ALIASES[service].some((alias) => lower.includes(alias))) ?? undefined;
}

function checkTopologyReferences(root, files, topology) {
  const issues = [];
  if (!topology) return issues;
  const candidates = files.filter((file) => {
    const relative = relativeFile(root, file);
    const base = path.basename(file);
    return base === "docker-compose.yml" || base.startsWith(".env") || /(?:^|\/)\.env\.example$/.test(relative) || /(?:^|\/).+\.env\.example$/.test(relative);
  });
  for (const file of candidates) {
    const source = readText(file);
    if (!source) continue;
    const relative = relativeFile(root, file);
    const dockerProfile = relative === "docker-compose.yml" || /\.docker(?:\.example)?$/.test(path.basename(file));
    let currentComposeService;
    for (const [index, line] of source.split("\n").entries()) {
      const composeService = line.match(/^  ([a-z0-9][a-z0-9-]*):\s*$/);
      if (relative === "docker-compose.yml" && composeService) currentComposeService = composeService[1];
      const service = inferService(line) ?? inferService(currentComposeService ?? "");
      if (!service) continue;
      const profile = dockerProfile ? "docker" : "local";
      const urlMatches = line.matchAll(/https?:\/\/[^\s"'`]+:(\d+)/g);
      for (const match of urlMatches) {
        const port = Number(match[1]);
        const expected = topology[profile]?.[service];
        if (expected !== undefined && port !== expected) {
          issues.push(issue(root, file, index + 1, `${profile} ${service} URL must use port ${expected}`));
        }
      }
      if (/\b(?:port|ports|expose|url)\b/i.test(line)) {
        const expected = topology[profile]?.[service];
        const numericPorts = [...line.matchAll(/(?:^|[^\d])(\d{4,5})(?!\d)/g)].map((match) => Number(match[1]));
        for (const port of numericPorts) {
          if (
            expected !== undefined &&
            port !== expected &&
            (Object.values(EXPECTED_TOPOLOGY.local).includes(port) ||
              Object.values(EXPECTED_TOPOLOGY.docker).includes(port))
          ) {
            issues.push(issue(root, file, index + 1, `${profile} ${service} port must use ${expected}`));
          }
        }
      }
    }
  }
  return issues;
}

function checkE2E(root, files) {
  const issues = [];
  const e2eRoot = path.join(root, "test/创作端E2E回归测试");
  const config = path.join(e2eRoot, "support/e2e-config.ts");
  if (!existsSync(config)) issues.push(issue(root, config, 1, "E2E configuration entry support/e2e-config.ts is required"));
  for (const file of files.filter((candidate) => candidate.startsWith(`${e2eRoot}${path.sep}`))) {
    const relative = relativeFile(root, file);
    if (relative === "test/创作端E2E回归测试/support/e2e-config.ts") continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(file))) continue;
    const source = readText(file);
    if (!source) continue;
    for (const [index, line] of source.split("\n").entries()) {
      if (/https?:\/\/(?:localhost|127\.0\.0\.1):(?:3200|4200)\b/.test(line)) {
        issues.push(issue(root, file, index + 1, "E2E target URL must come from support/e2e-config.ts"));
      }
      if (/\b(?:password|passwd)\s*[:=]\s*["'`]/i.test(line) || /\b(?:username|userName)\s*[:=]\s*["'`]/.test(line) || /E2E_PASSWORD/.test(line) || /\b(?:password|passwd)\b[^\n]{0,80}\b123456\b/i.test(line)) {
        issues.push(issue(root, file, index + 1, "E2E credentials must come from support/e2e-config.ts; password is never hardcoded"));
      }
    }
  }
  return issues;
}

function checkLegacyModels(root, files) {
  const issues = [];
  const excluded = new Set([
    path.join(root, "scripts/check-config-drift.mjs"),
    path.join(root, "scripts/check-config-drift.test.mjs"),
    path.join(root, "scripts/config-drift-allowlist.json"),
  ]);
  for (const file of files) {
    if (excluded.has(file) || !SOURCE_EXTENSIONS.has(path.extname(file))) continue;
    const relative = relativeFile(root, file);
    if (isTestFile(relative)) continue;
    if (relative.startsWith("public/") || relative.includes("/public/preview-runtime/")) continue;
    const source = readText(file);
    if (!source) continue;
    for (const token of LEGACY_MODEL_FIELDS) {
      const index = source.indexOf(token);
      if (index !== -1) issues.push(issue(root, file, lineNumber(source, index), `legacy model configuration token ${token} must be removed`));
    }
  }
  return issues;
}

function checkEnvTemplate(root, files, options) {
  const issues = [];
  const template = path.join(root, ".env.docker.example");
  const source = readText(template);
  if (source === undefined) {
    issues.push(issue(root, template, 1, ".env.docker.example is required"));
  } else {
    for (const [index, line] of source.split("\n").entries()) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!match || !/(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|CLIENT_SECRET|ENCRYPTION_KEY)/i.test(match[1])) continue;
      const value = match[2].trim().replace(/^['"]|['"]$/g, "");
      if (value && !/^\$\{[^}]+\}$/.test(value) && !/^<[^>]+>$/.test(value) && !/^(?:change|replace|your|example|dummy|test|generate|set[-_ ]?me|local[-_ ]?dev)/i.test(value)) {
        issues.push(issue(root, template, index + 1, `template secret ${match[1]} must be blank or an obvious placeholder`));
      }
    }
  }
  const tracked = options.gitTrackedPaths ? new Set(options.gitTrackedPaths).has(".env.docker") : (() => {
    const result = spawnSync("git", ["ls-files", "--cached", "--error-unmatch", "--", ".env.docker"], { cwd: root, stdio: "ignore" });
    return result.status === 0;
  })();
  if (tracked) issues.push(issue(root, path.join(root, ".env.docker"), 1, ".env.docker must not be tracked by git"));
  return issues;
}

function directUsageAllowlisted(root, allowlist, kind, file) {
  return allowlistFiles(allowlist, "directUsage", kind).has(relativeFile(root, file));
}

function checkDirectUsage(root, files, allowlist) {
  const issues = [];
  for (const file of files) {
    const relative = relativeFile(root, file);
    if (!SOURCE_EXTENSIONS.has(path.extname(file)) || isTestFile(relative) || relative.startsWith("packages/runtime-config/")) continue;
    const source = readText(file);
    if (!source) continue;
    const checks = [
      ["DATA_DIR", /process\.env\.(?:DATA_DIR|APP_DATA_DIR)/],
      ["dotenv", /(?:from\s+["']dotenv["']|require\(["']dotenv["']\)|dotenv\.config\s*\()/],
      ["CDN", /process\.env\.CDN_BASE_URL|https:\/\/esm\.sh/],
    ];
    for (const [kind, pattern] of checks) {
      if (directUsageAllowlisted(root, allowlist, kind, file)) continue;
      const match = source.match(pattern);
      if (match) issues.push(issue(root, file, lineNumber(source, match.index), `${kind} is read directly; use @workbench/runtime-config or register a confirmed exception`));
    }
  }
  return issues;
}

function checkConfigFiles(root, files, allowlist) {
  const issues = [];
  const groups = new Map();
  for (const file of files) {
    const base = path.basename(file);
    for (const [kind, predicate] of Object.entries(CONFIG_KINDS)) {
      if (!predicate(base)) continue;
      const values = groups.get(kind) ?? [];
      values.push(file);
      groups.set(kind, values);
    }
  }
  const postcssByDirectory = new Map();
  for (const file of files.filter((candidate) => /^postcss\.config\./.test(path.basename(candidate)))) {
    const directory = path.dirname(file);
    const values = postcssByDirectory.get(directory) ?? [];
    values.push(file);
    postcssByDirectory.set(directory, values);
  }
  for (const values of postcssByDirectory.values()) {
    if (values.length < 2) continue;
    for (const file of values) issues.push(issue(root, file, 1, "duplicate PostCSS configs exist in the same package directory"));
  }
  for (const [kind, values] of groups) {
    if (values.length < 2) continue;
    const allowed = allowlistFiles(allowlist, "configFiles", kind);
    for (const file of values) {
      const relative = relativeFile(root, file);
      if (!allowed.has(relative)) issues.push(issue(root, file, 1, `${kind} config is an unregistered duplicate; add this exact file to configFiles.${kind} only when intentional`));
    }
  }
  return issues;
}

export function checkConfigDrift(root = path.resolve(path.dirname(fileURLToPath(import.meta.url), ".."), ".."), options = {}) {
  const absoluteRoot = path.resolve(root);
  const files = walkFiles(absoluteRoot);
  const { value: allowlist, issues: allowlistIssues } = loadAllowlist(absoluteRoot, options.allowlistPath);
  const { topology, issues: topologyIssues } = parseCanonicalTopology(absoluteRoot);
  return [
    ...allowlistIssues,
    ...checkWorkspaceAndVersions(absoluteRoot, files),
    ...topologyIssues,
    ...checkTopologyReferences(absoluteRoot, files, topology),
    ...checkE2E(absoluteRoot, files),
    ...checkLegacyModels(absoluteRoot, files),
    ...checkEnvTemplate(absoluteRoot, files, options),
    ...checkDirectUsage(absoluteRoot, files, allowlist),
    ...checkConfigFiles(absoluteRoot, files, allowlist),
  ];
}

export function main(argv = process.argv.slice(2)) {
  let root = process.cwd();
  let allowlistPath;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root") root = argv[++index];
    else if (argv[index] === "--allowlist") allowlistPath = path.resolve(process.cwd(), argv[++index]);
    else if (argv[index] === "--help" || argv[index] === "-h") {
      console.log("Usage: node scripts/check-config-drift.mjs [--root <repo-root>] [--allowlist <file>]");
      return 0;
    } else {
      console.error(`Unknown option: ${argv[index]}`);
      return 1;
    }
  }
  const issues = checkConfigDrift(root, { allowlistPath });
  if (issues.length === 0) {
    console.log("config drift check passed");
    return 0;
  }
  console.error(`config drift check failed (${issues.length} issue(s))`);
  for (const item of issues) console.error(`${item.file}:${item.line}: ${item.message}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
