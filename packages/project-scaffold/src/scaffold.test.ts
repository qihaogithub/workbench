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
const repoRoot = path.resolve(packageRoot, "../..");
const actor: ProjectAdminActor = {
  id: "test-agent",
  name: "Test Agent",
  role: "admin",
  source: "project-scaffold-test",
};

function runPnpm(args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli) {
    return spawnSync(process.execPath, [pnpmCli, ...args], {
      encoding: "utf-8",
      env: options.env,
    });
  }
  return spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
    encoding: "utf-8",
    env: options.env,
  });
}

function runLocalNode(projectDir: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(process.execPath, args, {
    cwd: projectDir,
    encoding: "utf-8",
    env: options.env,
  });
}

try {
  const packageSchema = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "src/project-package.schema.json"), "utf-8"),
  ) as { title?: string };
  assert.equal(packageSchema.title, "Workbench Project Package");

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
  const prototypePage = service.createPage({
    editId,
    name: "原型活动页",
    runtimeType: "prototype-html-css",
    prototypeHtml: "<main><h1>本地真实预览</h1><p>prototype-html-css</p></main>",
    prototypeCss: "main { width: 375px; height: 812px; margin: 0; background: #ffffff; } h1 { color: #0f172a; }",
  }, actor);
  assert.equal(prototypePage.ok, true);
  const prototypePageId = (prototypePage.data as PageDetail).meta.id;

  const committed = service.commitEdit(editId, "初始化项目", actor);
  assert.equal(committed.ok, true);
  assert.equal(committed.data?.version.versionId, "v1");

  const projectDir = path.join(tempDir, "local-project");
  const pulled = pullProjectScaffold(service, actor, { projectId, targetDir: projectDir });
  assert.equal(pulled.ok, true);
  assert.equal(fs.existsSync(path.join(projectDir, "workbench.project.json")), true);
  assert.equal(fs.existsSync(path.join(projectDir, "scripts/dev-server.mjs")), true);
  assert.equal(fs.existsSync(path.join(projectDir, "src/app.graph.json")), true);

  const install = runPnpm(["--dir", projectDir, "install", "--lockfile-only"]);
  assert.equal(install.status, 0, install.stderr || install.stdout);
  const localBuild = runPnpm(["--dir", projectDir, "run", "build"]);
  assert.equal(localBuild.status, 0, localBuild.stderr || localBuild.stdout);
  const localDev = runPnpm(["--dir", projectDir, "run", "dev"], {
    env: {
      ...process.env,
      OW_DEV_ONCE: "1",
      OW_DEV_PORT: "0",
    },
  });
  assert.equal(localDev.status, 0, localDev.stderr || localDev.stdout);
  assert.match(localDev.stdout, /workbench local preview/);
  const localPreviewScreenshot = runLocalNode(projectDir, ["scripts/dev-server.mjs", "--screenshot"], {
    env: {
      ...process.env,
      OW_PLAYWRIGHT_IMPORT_PATH: path.join(repoRoot, "node_modules/playwright/index.mjs"),
    },
  });
  assert.equal(localPreviewScreenshot.status, 0, localPreviewScreenshot.stderr || localPreviewScreenshot.stdout);
  const previewReport = JSON.parse(localPreviewScreenshot.stdout) as {
    ok: boolean;
    summary: { screenshots: number; degraded: number };
    pages: Array<{ pageId: string; runtimeType: string; screenshotPath: string; degraded: boolean }>;
  };
  assert.equal(previewReport.ok, true);
  assert.equal(previewReport.summary.screenshots, 2);
  assert.equal(previewReport.summary.degraded, 1);
  const prototypePreview = previewReport.pages.find((item) => item.pageId === prototypePageId);
  assert.equal(prototypePreview?.runtimeType, "prototype-html-css");
  assert.equal(prototypePreview?.degraded, false);
  assert.equal(fs.existsSync(prototypePreview?.screenshotPath ?? ""), true);
  assert.equal(path.extname(prototypePreview?.screenshotPath ?? ""), ".png");

  const validation = validateProjectScaffold(projectDir);
  assert.equal(validation.ok, true);
  assert.equal(validation.validation?.ok, true);

  const cleanDiff = diffProjectScaffold(projectDir);
  assert.equal(cleanDiff.ok, true);
  assert.deepEqual(cleanDiff.diffSummary?.updated, []);

  const initialManifestPath = path.join(projectDir, "workbench.project.json");
  const initialManifest = JSON.parse(fs.readFileSync(initialManifestPath, "utf-8")) as { scaffoldVersion: string };
  initialManifest.scaffoldVersion = "0.0.1";
  fs.writeFileSync(initialManifestPath, `${JSON.stringify(initialManifest, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(projectDir, "scripts/dev-server.mjs"), "console.log('old scaffold');\n", "utf-8");
  const initialSyncPath = path.join(projectDir, ".workbench/sync-state.json");
  const initialSync = JSON.parse(fs.readFileSync(initialSyncPath, "utf-8")) as { scaffoldVersion: string };
  initialSync.scaffoldVersion = "0.0.1";
  fs.writeFileSync(initialSyncPath, `${JSON.stringify(initialSync, null, 2)}\n`, "utf-8");

  const upgradePreview = upgradeProjectScaffold(projectDir, { dryRun: true });
  assert.equal(upgradePreview.ok, true);
  assert.equal(upgradePreview.data?.dryRun, true);
  assert.equal(upgradePreview.data?.changedFiles.includes("workbench.project.json"), true);
  assert.equal(upgradePreview.data?.changedFiles.includes("scripts/dev-server.mjs"), true);

  const upgraded = upgradeProjectScaffold(projectDir);
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.data?.dryRun, false);
  const upgradedManifest = JSON.parse(fs.readFileSync(initialManifestPath, "utf-8")) as { scaffoldVersion: string };
  assert.equal(upgradedManifest.scaffoldVersion, "0.1.0");
  const upgradedDiff = diffProjectScaffold(projectDir);
  assert.equal(upgradedDiff.ok, true);
  assert.deepEqual(upgradedDiff.diffSummary?.updated, []);

  const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, "workbench.project.json"), "utf-8")) as {
    appGraph: string | null;
    knowledgeDir?: string | null;
    pages: Array<{ id: string; routeKey?: string; runtimeType?: string; entry: string; prototypeHtml?: string; prototypeCss?: string }>;
  };
  assert.equal(manifest.pages[0]?.id, pageId);
  assert.equal(manifest.pages[0]?.routeKey, "page");
  assert.equal(manifest.pages.some((item) => item.id === prototypePageId && item.runtimeType === "prototype-html-css"), true);
  const pulledPrototype = manifest.pages.find((item) => item.id === prototypePageId);
  assert.equal(fs.existsSync(path.join(projectDir, pulledPrototype?.prototypeHtml ?? "")), true);
  assert.equal(fs.existsSync(path.join(projectDir, pulledPrototype?.prototypeCss ?? "")), true);
  assert.equal(manifest.appGraph, "src/app.graph.json");
  assert.equal(manifest.knowledgeDir, "src/knowledge");
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

  const nextManifestPath = path.join(projectDir, "workbench.project.json");
  const nextManifest = JSON.parse(fs.readFileSync(nextManifestPath, "utf-8")) as {
    baseVersion: string;
    appGraph: string | null;
    knowledgeDir?: string | null;
    pages: Array<{ id: string; name: string; routeKey?: string; entry: string; schema: string; parentId: string | null; order: number }>;
    folders: Array<{ id: string; name: string; parentId: string | null; order: number }>;
  };
  const removedPage = nextManifest.pages[0];
  assert.ok(removedPage);
  fs.rmSync(path.dirname(path.join(projectDir, removedPage.entry)), { recursive: true, force: true });
  nextManifest.folders = [{ id: "local_folder", name: "本地文件夹", parentId: null, order: 0 }];
  nextManifest.pages = [{
    id: "local_page",
    name: "本地新增页",
    routeKey: "local-page",
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
  fs.mkdirSync(path.join(projectDir, "src/knowledge"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "src/knowledge", "活动规则.md"),
    "# 活动规则\n\n当前模板要求 rewardPolicy 与页面文案保持一致。",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectDir, "src/knowledge", "manifest.json"),
    JSON.stringify({
      items: [
        {
          id: "activity-rule",
          title: "活动规则",
          fileName: "活动规则.md",
          description: "解释模板活动规则与 rewardPolicy 的关系。",
        },
      ],
    }, null, 2),
    "utf-8",
  );

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
  assert.equal(exported.data?.knowledgeFiles.some((item) => item.path === "knowledge/活动规则.md"), true);
  assert.equal(exported.data?.knowledgeFiles.some((item) => item.path === "knowledge/manifest.json"), true);

  const exportedEntries = exportProjectScaffoldEntries(service, actor, { projectId });
  assert.equal(exportedEntries.ok, true);
  assert.equal(exportedEntries.data?.entries.some((entry) => entry.path === "workbench.project.json"), true);
  assert.equal(exportedEntries.data?.entries.some((entry) => entry.path === "src/app.graph.json"), true);
  assert.equal(exportedEntries.data?.entries.some((entry) => entry.path === "src/pages/local_page/index.tsx"), true);
  assert.equal(exportedEntries.data?.entries.some((entry) => entry.path === "src/assets/images/logo.png"), true);
  assert.equal(exportedEntries.data?.entries.some((entry) => entry.path === "src/knowledge/活动规则.md"), true);
  const zip = buildProjectScaffoldZip(exportedEntries.data?.entries ?? []);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from("workbench.project.json", "utf-8")), true);
  assert.equal(zip.includes(Buffer.from("src/app.graph.json", "utf-8")), true);
  assert.equal(zip.includes(Buffer.from("src/pages/local_page/index.tsx", "utf-8")), true);
  assert.equal(zip.includes(Buffer.from("src/knowledge/活动规则.md", "utf-8")), true);

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
  const templateReadingMap = JSON.parse(
    fs.readFileSync(path.join(tempDir, "knowledge", "templates", templateId, "reading-map.json"), "utf-8"),
  ) as { overview: { knowledgeCount: number }; structure: { knowledgeDocuments: Array<{ title: string; path: string }> } };
  assert.equal(templateReadingMap.overview.knowledgeCount, 1);
  assert.equal(templateReadingMap.structure.knowledgeDocuments[0]?.title, "活动规则");
  assert.equal(templateReadingMap.structure.knowledgeDocuments[0]?.path, "knowledge/活动规则.md");

  const templateDir = path.join(tempDir, "template-local-project");
  const initializedTemplate = initTemplateScaffold(service, actor, {
    templateId,
    targetDir: templateDir,
    name: "模板本地项目",
  });
  assert.equal(initializedTemplate.ok, true);
  assert.equal(fs.existsSync(path.join(templateDir, "workbench.project.json")), true);
  assert.equal(fs.existsSync(path.join(templateDir, "src/knowledge/活动规则.md")), true);

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
