import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { checkComposeDataDir, scanWorkspaceAuthorityData } from "./check-workspace-deploy-preflight.mjs";

const hash = (content) => crypto.createHash("sha256").update(content).digest("hex");

function createFixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-preflight-"));
  const projectId = "project-1";
  const workspaceId = "live-1";
  const workspacePath = path.join(dataDir, "workspaces", "projects", projectId, workspaceId);
  const resourcePath = "demos/home/index.tsx";
  const content = "committed";
  fs.mkdirSync(path.join(workspacePath, "demos", "home"), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, ".workspace.json"), JSON.stringify({ scope: "live", projectId, workspaceId }));
  fs.writeFileSync(path.join(workspacePath, resourcePath), content);
  return { dataDir, projectId, workspaceId, workspacePath, resourcePath, content };
}

function registerFixture(fixture) {
  const resourceHash = hash(fixture.content);
  const rootHash = hash(`${fixture.resourcePath}:${resourceHash}`);
  const authorityDir = path.join(fixture.dataDir, "workspace-authority", fixture.workspaceId);
  fs.mkdirSync(path.join(authorityDir, "backups"), { recursive: true });
  fs.writeFileSync(path.join(authorityDir, "state.json"), JSON.stringify({
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    revision: 1,
    rootHash,
    resourceHashes: { [fixture.resourcePath]: resourceHash },
    mutationPayloads: {},
    updatedAt: Date.now(),
  }));
  fs.writeFileSync(path.join(authorityDir, "backups", `${resourceHash}.bin`), fixture.content);
}

test("deploy preflight blocks unregistered live Workspace", () => {
  const fixture = createFixture();
  try {
    const result = scanWorkspaceAuthorityData(fixture.dataDir);
    assert.equal(result.passed, false);
    assert.equal(result.issues[0].code, "LIVE_WORKSPACE_UNREGISTERED");
  } finally {
    fs.rmSync(fixture.dataDir, { recursive: true, force: true });
  }
});

test("deploy preflight passes registered clean Workspace and detects drift", () => {
  const fixture = createFixture();
  try {
    registerFixture(fixture);
    assert.equal(scanWorkspaceAuthorityData(fixture.dataDir).passed, true);
    fs.writeFileSync(path.join(fixture.workspacePath, fixture.resourcePath), "external");
    const drifted = scanWorkspaceAuthorityData(fixture.dataDir);
    assert.equal(drifted.passed, false);
    assert.equal(drifted.issues.some((entry) => entry.code === "WORKSPACE_EXTERNAL_DRIFT"), true);
  } finally {
    fs.rmSync(fixture.dataDir, { recursive: true, force: true });
  }
});

test("compose preflight requires shared DATA_DIR and explicit single-instance Authority", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-compose-preflight-"));
  const composePath = path.join(root, "docker-compose.yml");
  try {
    fs.writeFileSync(composePath, `services:\n${["agent-service", "author-site", "screenshot-service"].map((service) => `  ${service}:\n    environment:\n      - DATA_DIR=/app/data\n${service === "agent-service" ? "      - WORKSPACE_AUTHORITY_INSTANCE_MODE=single\n      - WORKSPACE_AUTHORITY_REPLICA_COUNT=1\n" : ""}    volumes:\n      - \${APP_DATA_DIR:-/opt/workbench/data}:/app/data\n`).join("")}`);
    assert.equal(checkComposeDataDir(composePath).passed, true);
    fs.appendFileSync(composePath, "  unrelated:\n    image: noop\n");
    const source = fs.readFileSync(composePath, "utf-8").replace("DATA_DIR=/app/data", "DATA_DIR=/tmp/other");
    fs.writeFileSync(composePath, source);
    assert.equal(checkComposeDataDir(composePath).passed, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("compose preflight rejects missing policy and agent-service replicas greater than one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-compose-replicas-"));
  const composePath = path.join(root, "docker-compose.yml");
  try {
    const service = (name, extra = "") => `  ${name}:\n    environment:\n      - DATA_DIR=/app/data\n${extra}    volumes:\n      - \${APP_DATA_DIR:-/opt/workbench/data}:/app/data\n`;
    fs.writeFileSync(composePath, `services:\n${service("agent-service", "    deploy:\n      replicas: 2\n")}${service("author-site")}${service("screenshot-service")}`);
    const result = checkComposeDataDir(composePath);
    assert.equal(result.passed, false);
    assert.equal(result.issues.some((entry) => entry.code === "WORKSPACE_AUTHORITY_INSTANCE_POLICY_MISSING"), true);
    assert.equal(result.issues.some((entry) => entry.code === "WORKSPACE_AUTHORITY_MULTI_INSTANCE_UNSUPPORTED"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
