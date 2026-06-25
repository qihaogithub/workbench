import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(packageRoot, "src", "index.ts");

function runCli(args: string[], dataDir: string) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", cliPath, ...args, "--json", "--data-dir", dataDir],
    {
      cwd: packageRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        PROJECT_ADMIN_ROLE: "admin",
      },
    },
  );
  const stdout = result.stdout.trim();
  const payload = stdout ? JSON.parse(stdout) as Record<string, unknown> : {};
  return { result, payload };
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-cli-"));

try {
  const doctor = runCli(["doctor"], tempDir);
  assert.equal(doctor.result.status, 0);
  assert.equal(doctor.payload.ok, true);

  const created = runCli(["project", "create", "--name", "CLI 项目"], tempDir);
  assert.equal(created.result.status, 0);
  assert.equal(created.payload.ok, true);
  const createdData = created.payload.data as { id: string };
  assert.match(createdData.id, /^proj_/);

  const edit = runCli(["edit", "begin", createdData.id], tempDir);
  assert.equal(edit.result.status, 0);
  const editData = edit.payload.data as { editId: string; workspaceId: string };
  assert.match(editData.workspaceId, /^cli_edit_/);

  const page = runCli(["page", "create", "--edit-id", editData.editId, "--name", "首页"], tempDir);
  assert.equal(page.result.status, 0);
  assert.equal(page.payload.ok, true);

  const validation = runCli(["edit_validate", editData.editId], tempDir);
  assert.equal(validation.result.status, 0);
  assert.equal(validation.payload.ok, true);

  const committed = runCli(["edit", "commit", editData.editId, "--note", "CLI 提交"], tempDir);
  assert.equal(committed.result.status, 0);
  assert.equal(committed.payload.ok, true);

  const listed = runCli(["project_list"], tempDir);
  assert.equal(listed.result.status, 0);
  const projects = listed.payload.data as Array<{ id: string }>;
  assert.equal(projects.some((project) => project.id === createdData.id), true);

  const localDir = path.join(tempDir, "local-project");
  const pulled = runCli(["project", "pull", createdData.id, localDir], tempDir);
  assert.equal(pulled.result.status, 0);
  assert.equal(pulled.payload.ok, true);
  assert.equal(fs.existsSync(path.join(localDir, "opencode.project.json")), true);

  const localValidation = runCli(["validate", localDir], tempDir);
  assert.equal(localValidation.result.status, 0);
  assert.equal(localValidation.payload.ok, true);
  const localValidationResult = localValidation.payload.validation as { ok: boolean };
  assert.equal(localValidationResult.ok, true);

  const cleanDiff = runCli(["diff", localDir], tempDir);
  assert.equal(cleanDiff.result.status, 0);
  const cleanSummary = cleanDiff.payload.diffSummary as { updated: string[] };
  assert.deepEqual(cleanSummary.updated, []);

  const manifestPath = path.join(localDir, "opencode.project.json");
  const staleManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as { scaffoldVersion: string };
  staleManifest.scaffoldVersion = "0.0.1";
  fs.writeFileSync(manifestPath, `${JSON.stringify(staleManifest, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(localDir, "scripts/dev-server.mjs"), "console.log('old scaffold');\n", "utf-8");
  const upgraded = runCli(["upgrade", localDir], tempDir);
  assert.equal(upgraded.result.status, 0);
  assert.equal(upgraded.payload.ok, true);
  const upgradedData = upgraded.payload.data as { currentVersion: string; changedFiles: string[] };
  assert.equal(upgradedData.currentVersion, "0.1.0");
  assert.equal(upgradedData.changedFiles.includes("scripts/dev-server.mjs"), true);

  const cleanDiffAfterUpgrade = runCli(["diff", localDir], tempDir);
  assert.equal(cleanDiffAfterUpgrade.result.status, 0);
  const cleanSummaryAfterUpgrade = cleanDiffAfterUpgrade.payload.diffSummary as { updated: string[] };
  assert.deepEqual(cleanSummaryAfterUpgrade.updated, []);

  const manifest = JSON.parse(fs.readFileSync(path.join(localDir, "opencode.project.json"), "utf-8")) as {
    pages: Array<{ entry: string }>;
  };
  fs.appendFileSync(path.join(localDir, manifest.pages[0]?.entry ?? ""), "\n// local edit\n", "utf-8");
  const changedDiff = runCli(["diff", localDir], tempDir);
  assert.equal(changedDiff.result.status, 0);
  const changedSummary = changedDiff.payload.diffSummary as { updated: string[] };
  assert.equal(changedSummary.updated.some((file) => file.endsWith("index.tsx")), true);

  const submitted = runCli(["submit", localDir, "--note", "本地项目包提交"], tempDir);
  assert.equal(submitted.result.status, 0);
  assert.equal(submitted.payload.ok, true);

  const submittedDiff = runCli(["diff", localDir], tempDir);
  assert.equal(submittedDiff.result.status, 0);
  const submittedSummary = submittedDiff.payload.diffSummary as { updated: string[] };
  assert.deepEqual(submittedSummary.updated, []);

  const published = runCli(["publish", createdData.id], tempDir);
  assert.equal(published.result.status, 0);
  assert.equal(published.payload.ok, true);
  const publishData = published.payload.data as {
    artifactSummary?: { demoCount: number; entryPaths: string[] };
    accessUrls?: { viewerUrl?: string; embedUrls?: Array<{ pageId: string; url: string }> };
  };
  assert.equal(publishData.artifactSummary?.demoCount, 1);
  assert.equal(publishData.artifactSummary?.entryPaths.includes("project-admin-status.json"), true);
  assert.equal(publishData.accessUrls?.viewerUrl, `/projects/${createdData.id}`);
  assert.equal(publishData.accessUrls?.embedUrls?.length, 1);

  const { runCli: runCliInProcess } = await import("./index.js");
  let publishRequestUrl = "";
  let publishCookie = "";
  let cloudPublishOutput = "";
  const originalFetch = globalThis.fetch;
  const originalStdoutWrite = process.stdout.write;
  const originalAuthorSiteUrl = process.env.AUTHOR_SITE_URL;
  const originalAuthorSiteAuthToken = process.env.AUTHOR_SITE_AUTH_TOKEN;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    publishRequestUrl = input.toString();
    const headers = new Headers(init?.headers);
    publishCookie = headers.get("cookie") ?? "";
    return Response.json({
      success: true,
      data: {
        projectId: createdData.id,
        publishedVersion: "v-author",
        publishedAt: 123,
        demoCount: 1,
        duration: 7,
      },
    });
  }) as typeof fetch;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    cloudPublishOutput += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    process.env.AUTHOR_SITE_URL = "https://author-site.test";
    process.env.AUTHOR_SITE_AUTH_TOKEN = "test-token";
    const cloudPublishStatus = await runCliInProcess(["publish", createdData.id, "--json", "--data-dir", tempDir]);
    assert.equal(cloudPublishStatus, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.stdout.write = originalStdoutWrite;
    if (originalAuthorSiteUrl === undefined) delete process.env.AUTHOR_SITE_URL;
    else process.env.AUTHOR_SITE_URL = originalAuthorSiteUrl;
    if (originalAuthorSiteAuthToken === undefined) delete process.env.AUTHOR_SITE_AUTH_TOKEN;
    else process.env.AUTHOR_SITE_AUTH_TOKEN = originalAuthorSiteAuthToken;
  }
  const cloudPublished = JSON.parse(cloudPublishOutput.trim()) as Record<string, unknown>;
  assert.equal(cloudPublished.ok, true);
  assert.equal(publishRequestUrl, `https://author-site.test/api/projects/${createdData.id}/publish`);
  assert.equal(publishCookie.includes("auth_token=test-token"), true);
  const cloudPublishData = cloudPublished.data as {
    artifactSummary?: { demoCount: number; projectJsonPath?: string };
    accessUrls?: { viewerUrl?: string; dataUrl?: string };
  };
  assert.equal(cloudPublishData.artifactSummary?.demoCount, 1);
  assert.equal(cloudPublishData.artifactSummary?.projectJsonPath, "project.json");
  assert.equal(cloudPublishData.accessUrls?.viewerUrl, `/projects/${createdData.id}`);
  assert.equal(cloudPublishData.accessUrls?.dataUrl, `/data/${createdData.id}/project.json`);

  const missingProject = runCli(["project", "get", "proj_missing"], tempDir);
  assert.equal(missingProject.result.status, 1);
  assert.equal(missingProject.payload.ok, false);
  assert.deepEqual(missingProject.payload.nextActions, ["ow commands --json", "ow doctor --json"]);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
