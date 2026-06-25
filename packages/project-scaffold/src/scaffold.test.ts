import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ProjectAdminService } from "../../project-core/src/service.js";
import type { EditTransaction, PageDetail, ProjectAdminActor } from "../../project-core/src/types.js";
import {
  buildProjectScaffoldZip,
  diffProjectScaffold,
  exportProjectScaffoldEntries,
  initTemplateScaffold,
  pullProjectScaffold,
  submitProjectScaffold,
  submitTemplateScaffold,
  upgradeProjectScaffold,
  validateProjectScaffold,
} from "./index.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-scaffold-"));
const service = new ProjectAdminService({ dataDir: tempDir });
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const actor: ProjectAdminActor = {
  id: "test-agent",
  name: "Test Agent",
  role: "admin",
  source: "project-scaffold-test",
};

try {
  const packageSchema = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "src/project-package.schema.json"), "utf-8"),
  ) as { title?: string };
  assert.equal(packageSchema.title, "OpenCode Workbench Project Package");

  const created = service.createProject({ name: "脚手架项目" }, actor);
  assert.equal(created.ok, true);
  const projectId = created.data?.id ?? "";

  const edit = service.beginEdit(projectId, actor);
  assert.equal(edit.ok, true);
  const editId = (edit.data as EditTransaction).editId;

  const page = service.createPage({
    editId,
    name: "首页",
    code: "export default function Demo(){ return <div>remote</div>; }",
  }, actor);
  assert.equal(page.ok, true);
  const pageId = (page.data as PageDetail).meta.id;

  const committed = service.commitEdit(editId, "初始化项目", actor);
  assert.equal(committed.ok, true);
  assert.equal(committed.data?.version.versionId, "v1");

  const projectDir = path.join(tempDir, "local-project");
  const pulled = pullProjectScaffold(service, actor, { projectId, targetDir: projectDir });
  assert.equal(pulled.ok, true);
  assert.equal(fs.existsSync(path.join(projectDir, "opencode.project.json")), true);
  assert.equal(fs.existsSync(path.join(projectDir, "scripts/dev-server.mjs")), true);

  const install = spawnSync("pnpm", ["--dir", projectDir, "install", "--lockfile-only"], {
    encoding: "utf-8",
  });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  const localBuild = spawnSync("pnpm", ["--dir", projectDir, "run", "build"], {
    encoding: "utf-8",
  });
  assert.equal(localBuild.status, 0, localBuild.stderr || localBuild.stdout);
  const localDev = spawnSync("pnpm", ["--dir", projectDir, "run", "dev"], {
    encoding: "utf-8",
    env: {
      ...process.env,
      OW_DEV_ONCE: "1",
      OW_DEV_PORT: "0",
    },
  });
  assert.equal(localDev.status, 0, localDev.stderr || localDev.stdout);
  assert.match(localDev.stdout, /OpenCode local preview/);

  const validation = validateProjectScaffold(projectDir);
  assert.equal(validation.ok, true);
  assert.equal(validation.validation?.ok, true);

  const cleanDiff = diffProjectScaffold(projectDir);
  assert.equal(cleanDiff.ok, true);
  assert.deepEqual(cleanDiff.diffSummary?.updated, []);

  const initialManifestPath = path.join(projectDir, "opencode.project.json");
  const initialManifest = JSON.parse(fs.readFileSync(initialManifestPath, "utf-8")) as { scaffoldVersion: string };
  initialManifest.scaffoldVersion = "0.0.1";
  fs.writeFileSync(initialManifestPath, `${JSON.stringify(initialManifest, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(projectDir, "scripts/dev-server.mjs"), "console.log('old scaffold');\n", "utf-8");
  const initialSyncPath = path.join(projectDir, ".opencode/sync-state.json");
  const initialSync = JSON.parse(fs.readFileSync(initialSyncPath, "utf-8")) as { scaffoldVersion: string };
  initialSync.scaffoldVersion = "0.0.1";
  fs.writeFileSync(initialSyncPath, `${JSON.stringify(initialSync, null, 2)}\n`, "utf-8");

  const upgradePreview = upgradeProjectScaffold(projectDir, { dryRun: true });
  assert.equal(upgradePreview.ok, true);
  assert.equal(upgradePreview.data?.dryRun, true);
  assert.equal(upgradePreview.data?.changedFiles.includes("opencode.project.json"), true);
  assert.equal(upgradePreview.data?.changedFiles.includes("scripts/dev-server.mjs"), true);

  const upgraded = upgradeProjectScaffold(projectDir);
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.data?.dryRun, false);
  const upgradedManifest = JSON.parse(fs.readFileSync(initialManifestPath, "utf-8")) as { scaffoldVersion: string };
  assert.equal(upgradedManifest.scaffoldVersion, "0.1.0");
  const upgradedDiff = diffProjectScaffold(projectDir);
  assert.equal(upgradedDiff.ok, true);
  assert.deepEqual(upgradedDiff.diffSummary?.updated, []);

  const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, "opencode.project.json"), "utf-8")) as {
    pages: Array<{ id: string; entry: string }>;
  };
  assert.equal(manifest.pages[0]?.id, pageId);
  fs.appendFileSync(path.join(projectDir, manifest.pages[0]?.entry ?? ""), "\n// local update\n", "utf-8");

  const changedDiff = diffProjectScaffold(projectDir);
  assert.equal(changedDiff.ok, true);
  assert.equal((changedDiff.diffSummary?.updated ?? []).some((file) => file.endsWith("index.tsx")), true);

  const submitted = submitProjectScaffold(service, actor, {
    projectDir,
    note: "提交本地项目包",
  });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.data?.versionId, "v2");

  const submittedDiff = diffProjectScaffold(projectDir);
  assert.equal(submittedDiff.ok, true);
  assert.deepEqual(submittedDiff.diffSummary?.updated, []);

  const nextManifestPath = path.join(projectDir, "opencode.project.json");
  const nextManifest = JSON.parse(fs.readFileSync(nextManifestPath, "utf-8")) as {
    baseVersion: string;
    pages: Array<{ id: string; name: string; entry: string; schema: string; parentId: string | null; order: number }>;
    folders: Array<{ id: string; name: string; parentId: string | null; order: number }>;
  };
  const removedPage = nextManifest.pages[0];
  assert.ok(removedPage);
  fs.rmSync(path.dirname(path.join(projectDir, removedPage.entry)), { recursive: true, force: true });
  nextManifest.folders = [{ id: "local_folder", name: "本地文件夹", parentId: null, order: 0 }];
  nextManifest.pages = [{
    id: "local_page",
    name: "本地新增页",
    parentId: "local_folder",
    order: 0,
    entry: "src/pages/local_page/index.tsx",
    schema: "src/pages/local_page/config.schema.json",
  }];
  fs.writeFileSync(nextManifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf-8");
  fs.mkdirSync(path.join(projectDir, "src/pages/local_page"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "src/pages/local_page/index.tsx"),
    "export default function Demo(){ return <img src=\"assets/images/logo.png\" />; }",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, "src/pages/local_page/config.schema.json"),
    JSON.stringify({ type: "object", properties: {} }, null, 2),
    "utf-8",
  );
  fs.mkdirSync(path.join(projectDir, "src/assets/images"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "src/assets/images/logo.png"), Buffer.from("fake-image"));

  const structuralSubmit = submitProjectScaffold(service, actor, {
    projectDir,
    note: "提交本地结构变更",
  });
  assert.equal(structuralSubmit.ok, true);
  assert.equal(structuralSubmit.data?.versionId, "v3");

  const exported = service.exportProjectPackage(projectId, actor);
  assert.equal(exported.ok, true);
  assert.equal(exported.data?.pages.some((item) => item.meta.id === "local_page"), true);
  assert.equal(exported.data?.pages.some((item) => item.meta.id === pageId), false);
  assert.equal(exported.data?.folders.some((item) => item.id === "local_folder"), true);
  assert.equal(exported.data?.assets.some((item) => item.path === "assets/images/logo.png"), true);

  const exportedEntries = exportProjectScaffoldEntries(service, actor, { projectId });
  assert.equal(exportedEntries.ok, true);
  assert.equal(exportedEntries.data?.entries.some((entry) => entry.path === "opencode.project.json"), true);
  assert.equal(exportedEntries.data?.entries.some((entry) => entry.path === "src/pages/local_page/index.tsx"), true);
  assert.equal(exportedEntries.data?.entries.some((entry) => entry.path === "src/assets/images/logo.png"), true);
  const zip = buildProjectScaffoldZip(exportedEntries.data?.entries ?? []);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from("opencode.project.json", "utf-8")), true);
  assert.equal(zip.includes(Buffer.from("src/pages/local_page/index.tsx", "utf-8")), true);

  const structuralDiff = diffProjectScaffold(projectDir);
  assert.equal(structuralDiff.ok, true);
  assert.deepEqual(structuralDiff.diffSummary?.updated, []);
  assert.deepEqual(structuralDiff.diffSummary?.created, []);
  assert.deepEqual(structuralDiff.diffSummary?.deleted, []);

  const template = service.createTemplateFromProject(projectId, {
    category: "测试模板",
    name: "结构模板",
    description: "用于测试本地模板初始化",
  }, actor);
  assert.equal(template.ok, true);
  const templateId = template.data?.id ?? "";
  assert.ok(templateId);

  const templateDir = path.join(tempDir, "template-local-project");
  const initializedTemplate = initTemplateScaffold(service, actor, {
    templateId,
    targetDir: templateDir,
    name: "模板本地项目",
  });
  assert.equal(initializedTemplate.ok, true);
  assert.equal(fs.existsSync(path.join(templateDir, "opencode.project.json")), true);

  const submittedTemplate = submitTemplateScaffold(service, actor, {
    projectDir: templateDir,
    meta: {
      category: "测试模板",
      name: "本地提交模板",
      description: "从本地项目包提交的新模板",
    },
  });
  assert.equal(submittedTemplate.ok, true);
  assert.ok(submittedTemplate.data?.templateId);

  const templateHealth = service.checkTemplateHealth(submittedTemplate.data?.templateId);
  assert.equal(templateHealth.ok, true);
  assert.equal(templateHealth.validation?.ok, true);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
