import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const effectivePackageRoot = process.env.PROJECT_CLI_PACKAGE_ROOT
  ? path.resolve(process.env.PROJECT_CLI_PACKAGE_ROOT)
  : packageRoot;
const cliPath = path.join(effectivePackageRoot, "bin", "ow.mjs");

function runCli(args: string[], dataDir: string) {
  const result = spawnSync(
    process.execPath,
    [cliPath, ...args, "--json", "--data-dir", dataDir],
    {
      cwd: effectivePackageRoot,
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

  const created = runCli(["project", "create", "--name", "CLI 项目", "--category", "CLI 分类"], tempDir);
  assert.equal(created.result.status, 0);
  assert.equal(created.payload.ok, true);
  const createdData = created.payload.data as { id: string; category?: string };
  assert.match(createdData.id, /^proj_/);
  assert.equal(createdData.category, "CLI 分类");

  const updatedProject = runCli(
    [
      "project",
      "update",
      createdData.id,
      "--category",
      "CLI 分类更新",
      "--input-json",
      JSON.stringify({ authoringPreferences: { sketchEditorEngine: "native" } }),
    ],
    tempDir,
  );
  assert.equal(updatedProject.result.status, 0);
  assert.equal(updatedProject.payload.ok, true);
  const updatedProjectData = updatedProject.payload.data as {
    category?: string;
    authoringPreferences?: { sketchEditorEngine?: string };
  };
  assert.equal(updatedProjectData.category, "CLI 分类更新");
  assert.equal(updatedProjectData.authoringPreferences?.sketchEditorEngine, "native");

  const clearedPreferences = runCli(
    ["project", "update", createdData.id, "--clear-authoring-preferences"],
    tempDir,
  );
  assert.equal(clearedPreferences.result.status, 0);
  assert.equal(clearedPreferences.payload.ok, true);
  const clearedProject = runCli(["project", "get", createdData.id], tempDir);
  assert.equal(clearedProject.result.status, 0);
  const clearedProjectData = clearedProject.payload.data as {
    project: {
      category?: string;
      authoringPreferences?: { sketchEditorEngine?: string };
    };
  };
  assert.equal(clearedProjectData.project.category, "CLI 分类更新");
  assert.equal(clearedProjectData.project.authoringPreferences?.sketchEditorEngine, undefined);

  const edit = runCli(["edit", "begin", createdData.id], tempDir);
  assert.equal(edit.result.status, 0);
  const editData = edit.payload.data as { editId: string; workspaceId: string };
  assert.match(editData.workspaceId, /^cli_edit_/);

  const page = runCli(["page", "create", "--edit-id", editData.editId, "--name", "首页"], tempDir);
  assert.equal(page.result.status, 0);
  assert.equal(page.payload.ok, true);
  const pageData = page.payload.data as { meta: { id: string } };

  const pageRuntimeValidation = runCli(
    ["page", "validate-runtime", editData.editId, pageData.meta.id],
    tempDir,
  );
  assert.equal(pageRuntimeValidation.result.status, 0);
  assert.equal(pageRuntimeValidation.payload.ok, true);
  const pageRuntimeValidationData = pageRuntimeValidation.payload.data as { ok: boolean; issues: unknown[] };
  assert.equal(pageRuntimeValidationData.ok, true);
  assert.deepEqual(pageRuntimeValidationData.issues, []);

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
  assert.equal(fs.existsSync(path.join(localDir, "workbench.project.json")), true);

  const localValidation = runCli(["validate", localDir], tempDir);
  assert.equal(localValidation.result.status, 0);
  assert.equal(localValidation.payload.ok, true);
  const localValidationResult = localValidation.payload.validation as { ok: boolean };
  assert.equal(localValidationResult.ok, true);

  const cleanDiff = runCli(["diff", localDir], tempDir);
  assert.equal(cleanDiff.result.status, 0);
  const cleanSummary = cleanDiff.payload.diffSummary as { updated: string[] };
  assert.deepEqual(cleanSummary.updated, []);

  const manifestPath = path.join(localDir, "workbench.project.json");
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

  const manifest = JSON.parse(fs.readFileSync(path.join(localDir, "workbench.project.json"), "utf-8")) as {
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

  const invalidEdit = runCli(["edit", "begin", createdData.id], tempDir);
  assert.equal(invalidEdit.result.status, 0);
  const invalidEditData = invalidEdit.payload.data as { editId: string };
  const invalidCode = "import { jsx } from 'react/jsx-runtime';\nexport default function Demo(){ return jsx('div', {}); }";
  const invalidUpdate = runCli(
    ["page", "update-code", invalidEditData.editId, pageData.meta.id, invalidCode],
    tempDir,
  );
  assert.equal(invalidUpdate.result.status, 0);
  assert.equal(invalidUpdate.payload.ok, true);
  const invalidUpdateRuntime = invalidUpdate.payload.runtimeValidation as {
    ok: boolean;
    issues: Array<{ code: string }>;
  };
  assert.equal(invalidUpdateRuntime.ok, false);
  assert.equal(invalidUpdateRuntime.issues[0]?.code, "AUTHORING_RUNTIME_IMPORT_UNSUPPORTED");
  const invalidPageRuntimeValidation = runCli(
    ["page", "validate-runtime", invalidEditData.editId, pageData.meta.id],
    tempDir,
  );
  assert.equal(invalidPageRuntimeValidation.result.status, 0);
  const invalidPageRuntimeData = invalidPageRuntimeValidation.payload.data as {
    ok: boolean;
    issues: Array<{ pageId: string; severity: string; code: string }>;
  };
  assert.equal(invalidPageRuntimeData.ok, false);
  assert.deepEqual(invalidPageRuntimeData.issues[0], {
    pageId: pageData.meta.id,
    severity: "error",
    stage: "source_contract",
    code: "AUTHORING_RUNTIME_IMPORT_UNSUPPORTED",
    message: "页面源码不应直接导入 react/jsx-runtime",
    instruction: "请保留原始 JSX 交给创作端预览编译器转换，不要提交已经预编译的 JSX runtime 代码。",
    moduleName: "react/jsx-runtime",
  });
  const invalidEditValidation = runCli(["edit_validate", invalidEditData.editId], tempDir);
  assert.equal(invalidEditValidation.result.status, 0);
  const invalidEditValidationData = invalidEditValidation.payload.data as {
    ok: boolean;
    issues: Array<{ pageId?: string; severity: string; code: string }>;
  };
  assert.equal(invalidEditValidationData.ok, false);
  assert.equal(
    invalidEditValidationData.issues.some((issue) =>
      issue.pageId === pageData.meta.id &&
      issue.severity === "blocking" &&
      issue.code === "AUTHORING_RUNTIME_IMPORT_UNSUPPORTED"
    ),
    true,
  );

  const duplicateEdit = runCli(["edit", "begin", createdData.id], tempDir);
  assert.equal(duplicateEdit.result.status, 0);
  const duplicateEditData = duplicateEdit.payload.data as { editId: string };
  const duplicateCode = [
    "const accentMap = { primary: 'red' };",
    "export default function Demo(){ return <div />; }",
    "const accentMap = { primary: 'blue' };",
  ].join("\n");
  const duplicateUpdate = runCli(
    ["page", "update-code", duplicateEditData.editId, pageData.meta.id, duplicateCode],
    tempDir,
  );
  assert.equal(duplicateUpdate.result.status, 0);
  assert.equal(duplicateUpdate.payload.ok, true);
  const duplicateRuntime = duplicateUpdate.payload.runtimeValidation as {
    ok: boolean;
    issues: Array<{ stage: string; code: string; message: string }>;
  };
  assert.equal(duplicateRuntime.ok, false);
  assert.equal(duplicateRuntime.issues[0]?.stage, "module_parse");
  assert.equal(duplicateRuntime.issues[0]?.code, "DUPLICATE_TOP_LEVEL_DECLARATION");
  assert.equal(duplicateRuntime.issues[0]?.message.includes("accentMap"), true);
  const duplicateCommit = runCli(["edit", "commit", duplicateEditData.editId, "--note", "重复拼接"], tempDir);
  assert.equal(duplicateCommit.result.status, 1);
  assert.equal(duplicateCommit.payload.ok, false);

  const multiPageEdit = runCli(["edit", "begin", createdData.id], tempDir);
  assert.equal(multiPageEdit.result.status, 0);
  const multiPageEditData = multiPageEdit.payload.data as { editId: string };
  const pageVariableCode = "const page = { title: '首页' };\nexport default function Demo(){ return <div>{page.title}</div>; }";
  const secondPageVariableCode = "const page = { title: '详情' };\nexport default function Demo(){ return <section>{page.title}</section>; }";
  const firstPageUpdate = runCli(
    ["page", "update-code", multiPageEditData.editId, pageData.meta.id, pageVariableCode],
    tempDir,
  );
  assert.equal(firstPageUpdate.result.status, 0);
  assert.equal(firstPageUpdate.payload.ok, true);
  const secondPage = runCli(
    ["page", "create", "--edit-id", multiPageEditData.editId, "--name", "详情", "--code", secondPageVariableCode],
    tempDir,
  );
  assert.equal(secondPage.result.status, 0);
  assert.equal(secondPage.payload.ok, true);
  const multiPageValidation = runCli(["edit_validate", multiPageEditData.editId], tempDir);
  assert.equal(multiPageValidation.result.status, 0);
  const multiPageValidationData = multiPageValidation.payload.data as {
    ok: boolean;
    issues: Array<{ code: string }>;
  };
  assert.equal(multiPageValidationData.ok, true);
  assert.equal(
    multiPageValidationData.issues.some((issue) => issue.code === "DUPLICATE_TOP_LEVEL_DECLARATION"),
    false,
  );

  const missingProject = runCli(["project", "get", "proj_missing"], tempDir);
  assert.equal(missingProject.result.status, 1);
  assert.equal(missingProject.payload.ok, false);
  assert.deepEqual(missingProject.payload.nextActions, ["ow commands --json", "ow doctor --json"]);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
