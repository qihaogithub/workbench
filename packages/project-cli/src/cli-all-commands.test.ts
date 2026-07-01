import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCli } from "./index.js";

type JsonObject = Record<string, unknown>;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-cli-all-"));
const executed = new Set<string>();
let inputIndex = 0;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeInput(value: unknown): string {
  inputIndex += 1;
  const filePath = path.join(tempDir, "inputs", `input-${inputIndex}.json`);
  writeJson(filePath, value);
  return `@${filePath}`;
}

async function runCommand(
  commandName: string,
  args: string[],
  options: { expectedStatus?: number; expectOk?: boolean } = {},
): Promise<JsonObject> {
  const expectedStatus = options.expectedStatus ?? 0;
  const expectOk = options.expectOk ?? true;
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    const status = await runCli([...args, "--json", "--data-dir", tempDir]);
    assert.equal(status, expectedStatus, `${commandName} status\n${output}`);
  } finally {
    process.stdout.write = originalWrite;
  }
  const payload = output.trim() ? JSON.parse(output.trim()) as JsonObject : {};
  assert.equal(payload.ok, expectOk, `${commandName} ok\n${output}`);
  if (expectOk) {
    assert.ok("data" in payload || "validation" in payload || commandName === "commands", `${commandName} should return data`);
  } else {
    assert.ok(payload.error, `${commandName} should return an error`);
    assert.ok(Array.isArray(payload.nextActions), `${commandName} should return nextActions`);
  }
  executed.add(commandName);
  return payload;
}

function dataOf<T>(payload: JsonObject): T {
  return payload.data as T;
}

function planOf(payload: JsonObject): { planId: string; confirmToken: string } {
  return dataOf<{ planId: string; confirmToken: string }>(payload);
}

function createSessionFixture(projectId: string): string {
  const sessionId = "session_cli_all";
  writeJson(path.join(tempDir, "sessions", projectId, sessionId, ".session.json"), {
    sessionId,
    demoId: projectId,
    status: "editing",
    createdAt: Date.now(),
  });
  return sessionId;
}

const originalRole = process.env.PROJECT_ADMIN_ROLE;
process.env.PROJECT_ADMIN_ROLE = "admin";

try {
  await runCommand("doctor", ["doctor"]);
  await runCommand("admin capabilities", ["admin", "capabilities"]);
  const commandsPayload = await runCommand("commands", ["commands"]);
  const registeredCommands = dataOf<Array<{ name: string }>>(commandsPayload).map((command) => command.name);

  const created = await runCommand("project create", ["project", "create", "--name", "CLI 全功能项目", "--description", "全命令测试"]);
  const projectId = dataOf<{ id: string }>(created).id;
  assert.match(projectId, /^proj_/);

  await runCommand("project list", ["project", "list"]);
  await runCommand("project get", ["project", "get", projectId]);
  await runCommand("project update", ["project", "update", projectId, "--name", "CLI 全功能项目更新", "--description", "更新描述"]);
  await runCommand("project set-cover", ["project", "set-cover", projectId, "/covers/demo.png"]);
  await runCommand("project delete-cover", ["project", "delete-cover", projectId]);

  const edit = await runCommand("edit begin", ["edit", "begin", projectId]);
  const editId = dataOf<{ editId: string }>(edit).editId;
  await runCommand("edit status", ["edit", "status", editId]);
  await runCommand("edit extend", ["edit", "extend", editId]);

  const folder = await runCommand("folder create", ["folder", "create", editId, "首页分组"]);
  const folderId = dataOf<{ id: string }>(folder).id;
  const pageSchema = JSON.stringify({ type: "object", properties: { title: { type: "string", default: "首页" } } });
  const page = await runCommand("page create", [
    "page",
    "create",
    "--edit-id",
    editId,
    "--name",
    "首页",
    "--parent-id",
    folderId,
    "--code",
    "export default function Demo(props){ return <div>{props.title}</div>; }",
    "--schema",
    pageSchema,
  ]);
  const pageId = dataOf<{ meta: { id: string } }>(page).meta.id;
  await runCommand("page list", ["page", "list", editId]);
  await runCommand("page get", ["page", "get", editId, pageId]);
  await runCommand("page validate-runtime", ["page", "validate-runtime", editId, pageId]);

  const duplicatedPage = await runCommand("page duplicate", ["page", "duplicate", editId, pageId, "首页副本"]);
  const duplicatedPageId = dataOf<{ meta: { id: string } }>(duplicatedPage).meta.id;
  await runCommand("page update-code", [
    "page",
    "update-code",
    editId,
    pageId,
    "export default function Demo(props){ return <main>{props.title}</main>; }",
  ]);
  await runCommand("page update-schema", [
    "page",
    "update-schema",
    editId,
    pageId,
    JSON.stringify({ type: "object", properties: { title: { type: "string", default: "更新首页" } } }),
  ]);
  await runCommand("page update-meta", [
    "page",
    "update-meta",
    editId,
    pageId,
    "--input-json",
    writeInput({ name: "更新首页", parentId: "", order: 1 }),
  ]);
  await runCommand("folder update", ["folder", "update", editId, folderId, "--name", "更新分组", "--order", "2"]);
  await runCommand("page reorder", [
    "page",
    "reorder",
    "--input-json",
    writeInput({
      editId,
      pages: [
        { id: pageId, order: 0, parentId: null },
        { id: duplicatedPageId, order: 1, parentId: null },
      ],
      folders: [{ id: folderId, order: 2, parentId: null }],
    }),
  ]);

  await runCommand("config get-project-schema", ["config", "get-project-schema", editId]);
  await runCommand("config set-project-schema", [
    "config",
    "set-project-schema",
    editId,
    JSON.stringify({ type: "object", properties: { globalTitle: { type: "string", default: "全局" } } }),
  ]);
  await runCommand("config validate-page-schema", ["config", "validate-page-schema", editId, pageId]);
  await runCommand("config validate-merged-schema", ["config", "validate-merged-schema", editId]);
  await runCommand("config generate-from-code", ["config", "generate-from-code", editId, pageId]);
  await runCommand("config apply-visual-patch", [
    "config",
    "apply-visual-patch",
    editId,
    pageId,
    "--input-json",
    writeInput({ patch: { title: "视觉补丁候选" } }),
  ]);

  const assetFile = path.join(tempDir, "asset.png");
  const replacementFile = path.join(tempDir, "asset-replacement.png");
  fs.writeFileSync(assetFile, Buffer.from("asset-one"));
  fs.writeFileSync(replacementFile, Buffer.from("asset-two"));
  const uploadedAsset = await runCommand("asset upload", ["asset", "upload", editId, "--file", assetFile]);
  const uploadedAssetPath = dataOf<{ path: string }>(uploadedAsset).path;
  await runCommand("asset list", ["asset", "list", editId]);
  const replacedAsset = await runCommand("asset replace", ["asset", "replace", editId, uploadedAssetPath, "--file", replacementFile]);
  assert.ok(dataOf<{ newAsset: { path: string } }>(replacedAsset).newAsset.path);
  const assetDeletePlan = await runCommand("asset delete-preview", ["asset", "delete-preview", editId, uploadedAssetPath]);
  await runCommand("asset delete-execute", ["asset", "delete-execute", planOf(assetDeletePlan).planId, planOf(assetDeletePlan).confirmToken]);

  await runCommand("preview compile", ["preview", "compile", editId, pageId]);
  await runCommand("preview render", ["preview", "render", editId, pageId]);
  await runCommand("preview console-logs", ["preview", "console-logs"]);
  await runCommand("preview runtime-errors", ["preview", "runtime-errors"]);
  await runCommand("preview healthcheck", ["preview", "healthcheck"]);
  await runCommand("preview screenshot", ["preview", "screenshot"]);

  const pageDeletePlan = await runCommand("page delete-preview", ["page", "delete-preview", editId, duplicatedPageId]);
  await runCommand("page delete-execute", ["page", "delete-execute", planOf(pageDeletePlan).planId, planOf(pageDeletePlan).confirmToken]);
  const folderDeletePlan = await runCommand("folder delete-preview", ["folder", "delete-preview", editId, folderId]);
  await runCommand("folder delete-execute", [
    "folder",
    "delete-execute",
    planOf(folderDeletePlan).planId,
    planOf(folderDeletePlan).confirmToken,
    "--strategy",
    "move_to_root",
  ]);
  await runCommand("config delete-project-schema", ["config", "delete-project-schema", editId]);
  await runCommand("edit diff", ["edit", "diff", editId]);
  await runCommand("edit validate", ["edit", "validate", editId]);
  await runCommand("edit commit", ["edit", "commit", editId, "CLI 全功能提交"]);

  const createdPageVersion = await runCommand("page version-create", [
    "page",
    "version-create",
    projectId,
    pageId,
    "--note",
    "CLI 全功能页面版本",
  ]);
  const pageVersionId = dataOf<{ versionId: string }>(createdPageVersion).versionId;
  await runCommand("page version-list", ["page", "version-list", projectId, pageId]);
  await runCommand("page version-get", ["page", "version-get", projectId, pageId, pageVersionId]);
  await runCommand("project validate-runtime", ["project", "validate-runtime", projectId]);

  const discardEdit = await runCommand("edit begin", ["edit", "begin", projectId]);
  await runCommand("edit discard", ["edit", "discard", dataOf<{ editId: string }>(discardEdit).editId]);

  await runCommand("page restore-version", ["page", "restore-version", projectId, pageId, pageVersionId]);

  await runCommand("publish check", ["publish", "check", projectId]);
  await runCommand("publish project", ["publish", "project", projectId]);
  await runCommand("publish status", ["publish", "status", projectId]);
  await runCommand("publish artifacts", ["publish", "artifacts", projectId]);
  await runCommand("publish rollback", ["publish", "rollback", projectId]);

  const localDir = path.join(tempDir, "local-project");
  await runCommand("project pull", ["project", "pull", projectId, localDir]);
  await runCommand("validate", ["validate", localDir]);
  await runCommand("diff", ["diff", localDir]);
  const localManifestPath = path.join(localDir, "opencode.project.json");
  const localManifest = JSON.parse(fs.readFileSync(localManifestPath, "utf-8")) as { scaffoldVersion: string; pages: Array<{ entry: string }> };
  localManifest.scaffoldVersion = "0.0.1";
  writeJson(localManifestPath, localManifest);
  await runCommand("upgrade", ["upgrade", localDir]);
  fs.appendFileSync(path.join(localDir, localManifest.pages[0]?.entry ?? ""), "\n// all commands local edit\n", "utf-8");
  await runCommand("submit", ["submit", localDir, "--note", "CLI 全功能本地提交"]);

  const template = await runCommand("template create-from-project", [
    "template",
    "create-from-project",
    projectId,
    "--category",
    "测试模板",
    "--name",
    "CLI 全功能模板",
    "--description",
    "用于 CLI 全功能测试",
    "--scope",
    "team",
  ]);
  const templateId = dataOf<{ id: string }>(template).id;
  await runCommand("template list", ["template", "list"]);
  await runCommand("template get", ["template", "get", templateId]);
  await runCommand("template update-meta", [
    "template",
    "update-meta",
    templateId,
    "--name",
    "CLI 全功能模板更新",
    "--official",
    "true",
    "--scope",
    "official",
  ]);
  await runCommand("template health-check", ["template", "health-check", templateId]);
  await runCommand("template recommend", ["template", "recommend", "需要一个活动首页模板"]);
  await runCommand("template instantiate", ["template", "instantiate", templateId, "从模板实例化项目"]);
  const templateLocalDir = path.join(tempDir, "template-local");
  await runCommand("template init", ["template", "init", templateId, templateLocalDir, "--name", "模板本地项目"]);
  await runCommand("template submit", [
    "template",
    "submit",
    templateLocalDir,
    "--category",
    "测试模板",
    "--name",
    "CLI 全功能提交模板",
    "--description",
    "从本地项目包提交",
  ]);
  const deleteTemplate = await runCommand("template create-from-project", [
    "template",
    "create-from-project",
    projectId,
    "--category",
    "测试模板",
    "--name",
    "待删除模板",
    "--description",
    "用于删除测试",
  ]);
  const deleteTemplateId = dataOf<{ id: string }>(deleteTemplate).id;
  const templateDeletePlan = await runCommand("template delete-preview", ["template", "delete-preview", deleteTemplateId]);
  await runCommand("template delete-execute", [
    "template",
    "delete-execute",
    planOf(templateDeletePlan).planId,
    planOf(templateDeletePlan).confirmToken,
  ]);

  const duplicatedProject = await runCommand("project duplicate", ["project", "duplicate", projectId, "待删除项目"]);
  const duplicatedProjectId = dataOf<{ id: string }>(duplicatedProject).id;
  const projectDeletePlan = await runCommand("project delete-preview", ["project", "delete-preview", duplicatedProjectId]);
  await runCommand("project delete-execute", [
    "project",
    "delete-execute",
    planOf(projectDeletePlan).planId,
    planOf(projectDeletePlan).confirmToken,
  ]);

  const sessionId = createSessionFixture(projectId);
  await runCommand("ai session-list", ["ai", "session-list", projectId]);
  await runCommand("ai session-get", ["ai", "session-get", sessionId]);
  await runCommand("ai run-logs", ["ai", "run-logs", sessionId]);
  await runCommand("ai workspace-context", ["ai", "workspace-context", sessionId]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({
    success: true,
    data: {
      sessionId,
      content: "收到",
      files: [],
      metadata: { ok: true },
    },
  })) as typeof fetch;
  const originalAgentServiceUrl = process.env.AGENT_SERVICE_URL;
  try {
    process.env.AGENT_SERVICE_URL = "http://agent-service.test";
    await runCommand("ai send-message", ["ai", "send-message", sessionId, "请检查项目"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAgentServiceUrl === undefined) delete process.env.AGENT_SERVICE_URL;
    else process.env.AGENT_SERVICE_URL = originalAgentServiceUrl;
  }

  await runCommand("audit list", ["audit", "list", projectId]);
  const allAudits = await runCommand("audit list", ["audit", "list"]);
  const auditId = dataOf<Array<{ auditId: string }>>(allAudits)[0]?.auditId;
  assert.ok(auditId, "audit list should contain events");
  await runCommand("audit get", ["audit", "get", auditId]);

  await runCommand("admin lock-project", ["admin", "lock-project", projectId]);
  await runCommand("admin unlock-project", ["admin", "unlock-project", projectId]);

  const missing = registeredCommands.filter((command) => !executed.has(command));
  assert.deepEqual(missing, [], `Untested CLI commands: ${missing.join(", ")}`);
} finally {
  if (originalRole === undefined) delete process.env.PROJECT_ADMIN_ROLE;
  else process.env.PROJECT_ADMIN_ROLE = originalRole;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
