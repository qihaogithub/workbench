#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WRITER_SERVICES = ["knowledge-service", "agent-service", "author-site", "screenshot-service"];

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isManagedWorkspaceResource(resourcePath) {
  return (
    /^demos\/[^/]+\/(index\.tsx|prototype\.(html|css|meta\.json)|config\.schema\.json|sketch\.(scene|meta)\.json)$/.test(resourcePath) ||
    resourcePath === "project.config.schema.json" ||
    resourcePath === "project.config.values.json" ||
    resourcePath === "workspace-tree.json" ||
    resourcePath === ".canvas-layout.json" ||
    resourcePath === "knowledge/manifest.json" ||
    /^knowledge\/[^/]+\.(md|markdown|mdown)$/i.test(resourcePath) ||
    /^assets\/.+/.test(resourcePath)
  );
}

function walkFiles(directory, visit) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, visit);
    else if (entry.isFile()) visit(fullPath);
  }
}

function readManagedHashes(workspacePath) {
  const hashes = {};
  walkFiles(workspacePath, (fullPath) => {
    const relative = path.relative(workspacePath, fullPath).split(path.sep).join("/");
    if (isManagedWorkspaceResource(relative)) hashes[relative] = hashContent(fs.readFileSync(fullPath));
  });
  return hashes;
}

function rootHash(hashes) {
  return hashContent(
    Object.entries(hashes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([resourcePath, hash]) => `${resourcePath}:${hash}`)
      .join("\n"),
  );
}

function countJsonFiles(directory) {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .length;
}

function findLiveWorkspaces(dataDir) {
  const workspaces = [];
  walkFiles(path.join(dataDir, "workspaces"), (fullPath) => {
    if (path.basename(fullPath) !== ".workspace.json") return;
    try {
      const metadata = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      if (metadata.scope !== "live") return;
      workspaces.push({
        workspacePath: path.dirname(fullPath),
        workspaceId: metadata.workspaceId,
        projectId: metadata.projectId ?? metadata.demoId,
      });
    } catch {
      workspaces.push({ workspacePath: path.dirname(fullPath), workspaceId: null, projectId: null, invalidMarker: true });
    }
  });
  return workspaces;
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

export function scanWorkspaceAuthorityData(dataDir) {
  const resolvedDataDir = path.resolve(dataDir);
  if (!fs.existsSync(resolvedDataDir) || !fs.statSync(resolvedDataDir).isDirectory()) {
    return {
      passed: false,
      dataDir: resolvedDataDir,
      checkedAt: Date.now(),
      summary: { liveWorkspaceCount: 0, passedWorkspaceCount: 0, issueCount: 1 },
      workspaces: [],
      issues: [issue("DATA_DIR_MISSING", "shared DATA_DIR does not exist", { dataDir: resolvedDataDir })],
    };
  }
  const issues = [];
  const results = [];
  const liveWorkspaces = findLiveWorkspaces(resolvedDataDir);
  const registered = new Set();

  for (const workspace of liveWorkspaces) {
    if (workspace.invalidMarker || !workspace.workspaceId || !workspace.projectId) {
      issues.push(issue("LIVE_WORKSPACE_MARKER_INVALID", "live Workspace marker is invalid", { workspacePath: workspace.workspacePath }));
      continue;
    }
    registered.add(workspace.workspaceId);
    const authorityDir = path.join(resolvedDataDir, "workspace-authority", workspace.workspaceId);
    const statePath = path.join(authorityDir, "state.json");
    const workspaceIssues = [];
    let state = null;
    if (!fs.existsSync(statePath)) {
      workspaceIssues.push(issue("LIVE_WORKSPACE_UNREGISTERED", "live Workspace has no Authority state"));
    } else {
      try {
        state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      } catch {
        workspaceIssues.push(issue("AUTHORITY_STATE_INVALID", "Authority state is not valid JSON"));
      }
    }

    if (state && (state.workspaceId !== workspace.workspaceId || state.projectId !== workspace.projectId)) {
      workspaceIssues.push(issue("AUTHORITY_STATE_MISMATCH", "Authority state does not match live Workspace marker"));
    }

    const leasePath = path.join(resolvedDataDir, "workspace-authority", "leases", `${workspace.workspaceId}.lock`);
    if (fs.existsSync(leasePath)) workspaceIssues.push(issue("ACTIVE_WRITE_LEASE", "active or stale write lease exists"));
    const preparedCount =
      countJsonFiles(path.join(authorityDir, "prepared")) +
      countJsonFiles(path.join(authorityDir, "reconcile-prepared"));
    if (preparedCount > 0) workspaceIssues.push(issue("PREPARED_TRANSACTION", "prepared transactions need recovery", { preparedCount }));

    const actualHashes = readManagedHashes(workspace.workspacePath);
    const actualRootHash = rootHash(actualHashes);
    if (state && actualRootHash !== state.rootHash) {
      workspaceIssues.push(issue("WORKSPACE_EXTERNAL_DRIFT", "managed Workspace content differs from committed rootHash", {
        expectedRootHash: state.rootHash,
        actualRootHash,
      }));
    }

    if (state && state.resourceHashes && typeof state.resourceHashes === "object") {
      const missing = [];
      for (const [resourcePath, expectedHash] of Object.entries(state.resourceHashes)) {
        const backupPath = path.join(authorityDir, "backups", `${expectedHash}.bin`);
        if (!fs.existsSync(backupPath) || hashContent(fs.readFileSync(backupPath)) !== expectedHash) missing.push(resourcePath);
      }
      if (missing.length > 0) {
        workspaceIssues.push(issue("COMMITTED_BACKUP_MISSING", "committed backups are incomplete", { missingResources: missing }));
      }
    }

    const result = {
      projectId: workspace.projectId,
      workspaceId: workspace.workspaceId,
      workspacePath: workspace.workspacePath,
      revision: state?.revision,
      rootHash: state?.rootHash,
      actualRootHash,
      passed: workspaceIssues.length === 0,
      issues: workspaceIssues,
    };
    results.push(result);
    issues.push(...workspaceIssues.map((entry) => ({ ...entry, projectId: workspace.projectId, workspaceId: workspace.workspaceId })));
  }

  const authorityRoot = path.join(resolvedDataDir, "workspace-authority");
  if (fs.existsSync(authorityRoot)) {
    for (const entry of fs.readdirSync(authorityRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "leases" || registered.has(entry.name)) continue;
      if (fs.existsSync(path.join(authorityRoot, entry.name, "state.json"))) {
        issues.push(issue("ORPHAN_AUTHORITY_STATE", "Authority state has no matching live Workspace", { workspaceId: entry.name }));
      }
    }
  }

  return {
    passed: issues.length === 0,
    dataDir: resolvedDataDir,
    checkedAt: Date.now(),
    summary: {
      liveWorkspaceCount: liveWorkspaces.length,
      passedWorkspaceCount: results.filter((entry) => entry.passed).length,
      issueCount: issues.length,
    },
    workspaces: results,
    issues,
  };
}

function serviceBlock(composeSource, serviceName) {
  const escaped = serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = composeSource.match(new RegExp(`^  ${escaped}:\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:|(?![\\s\\S]))`, "m"));
  return match?.[1] ?? "";
}

export function checkComposeDataDir(composePath) {
  const composeSource = fs.readFileSync(composePath, "utf-8");
  const issues = [];
  for (const serviceName of WRITER_SERVICES) {
    const block = serviceBlock(composeSource, serviceName);
    if (!block) {
      issues.push(issue("COMPOSE_SERVICE_MISSING", "required service is missing from compose", { serviceName }));
      continue;
    }
    if (!block.includes("DATA_DIR=/app/data")) {
      issues.push(issue("COMPOSE_DATA_DIR_MISMATCH", "service DATA_DIR must be /app/data", { serviceName }));
    }
    if (!/\$\{APP_DATA_DIR(?::-[^}]*)?\}:\/app\/data(?:\s|$)/m.test(block)) {
      issues.push(issue("COMPOSE_DATA_VOLUME_MISMATCH", "service must mount shared APP_DATA_DIR at /app/data", { serviceName }));
    }
    if (serviceName === "knowledge-service") {
      if (!block.includes("expose:") || /^\s+ports:\s*$/m.test(block)) {
        issues.push(issue(
          "KNOWLEDGE_SERVICE_EXPOSURE_INVALID",
          "knowledge-service must remain an internal-only compose service",
          { serviceName },
        ));
      }
      const replicaMatch = block.match(/^\s+replicas:\s*([0-9]+)\s*$/m);
      if (replicaMatch && Number(replicaMatch[1]) !== 1) {
        issues.push(issue(
          "KNOWLEDGE_SERVICE_MULTI_INSTANCE_UNSUPPORTED",
          "knowledge-service replicas must remain 1 while SQLite is the catalog store",
          { serviceName, replicas: Number(replicaMatch[1]) },
        ));
      }
    }
    if (serviceName === "agent-service") {
      if (!block.includes("WORKSPACE_AUTHORITY_INSTANCE_MODE=single") || !block.includes("WORKSPACE_AUTHORITY_REPLICA_COUNT=1")) {
        issues.push(issue(
          "WORKSPACE_AUTHORITY_INSTANCE_POLICY_MISSING",
          "agent-service must explicitly declare single-instance Workspace Authority mode",
          { serviceName },
        ));
      }
      const replicaMatch = block.match(/^\s+replicas:\s*([0-9]+)\s*$/m);
      if (replicaMatch && Number(replicaMatch[1]) !== 1) {
        issues.push(issue(
          "WORKSPACE_AUTHORITY_MULTI_INSTANCE_UNSUPPORTED",
          "agent-service replicas must remain 1 until a durable fencing-token lease exists",
          { serviceName, replicas: Number(replicaMatch[1]) },
        ));
      }
    }
  }
  for (const serviceName of ["agent-service", "author-site"]) {
    const block = serviceBlock(composeSource, serviceName);
    if (block && !block.includes("KNOWLEDGE_SERVICE_URL=http://knowledge-service:3203")) {
      issues.push(issue(
        "KNOWLEDGE_SERVICE_URL_MISSING",
        "service must use the internal knowledge-service endpoint",
        { serviceName },
      ));
    }
  }
  return { passed: issues.length === 0, composePath: path.resolve(composePath), issues };
}

function parseArgs(argv) {
  const options = { dataDir: process.env.DATA_DIR || "data", composePath: null, skipAuthority: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--data-dir") options.dataDir = argv[++index];
    else if (value === "--compose") options.composePath = argv[++index];
    else if (value === "--skip-authority") options.skipAuthority = true;
    else if (value === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

export function runWorkspaceDeployPreflight(options) {
  const authority = options.skipAuthority ? null : scanWorkspaceAuthorityData(options.dataDir);
  const compose = options.composePath ? checkComposeDataDir(options.composePath) : null;
  const issues = [...(authority?.issues ?? []), ...(compose?.issues ?? [])];
  return { passed: issues.length === 0, authority, compose, issues };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = runWorkspaceDeployPreflight(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else if (result.passed) console.log(`Workspace deploy preflight passed (${result.authority?.summary.liveWorkspaceCount ?? 0} live Workspace).`);
    else {
      console.error(`Workspace deploy preflight failed with ${result.issues.length} issue(s).`);
      for (const entry of result.issues) console.error(`- ${entry.code}: ${entry.message}`);
    }
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] === "-" || path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
