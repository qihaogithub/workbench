import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const scriptPath = fileURLToPath(
  new URL("./migrate-legacy-template-projects.mjs", import.meta.url),
);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
}

function runMigration(dataDir, ...args) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [scriptPath, "--data-dir", dataDir, ...args],
      { encoding: "utf8" },
    ),
  );
}

test("旧模板迁移默认只预览，应用后复用来源项目并清理旧目录", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-template-source-"));
  try {
    const projectDir = path.join(dataDir, "projects", "project-1");
    writeJson(path.join(projectDir, "project.json"), {
      id: "project-1",
      name: "原项目",
      workspacePath: path.join(projectDir, "workspace"),
      versions: [],
      demoPages: [],
      demoFolders: [],
      createdAt: 1,
      updatedAt: 1,
    });
    writeJson(path.join(dataDir, "templates", "template-1", "template.json"), {
      id: "template-1",
      sourceProjectId: "project-1",
      name: "模板项目",
      category: "活动",
      description: "可跨项目检索",
    });

    const preview = runMigration(dataDir);
    assert.equal(preview.applied, false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"))
        .projectType,
      undefined,
    );

    const result = runMigration(dataDir, "--apply", "--remove-legacy");
    assert.equal(result.migrated[0].action, "mark-source-project");
    const project = JSON.parse(
      fs.readFileSync(path.join(projectDir, "project.json"), "utf8"),
    );
    assert.equal(project.id, "project-1");
    assert.equal(project.projectType, "template");
    assert.equal(project.templateSettings.description, "可跨项目检索");
    assert.equal(
      fs.existsSync(path.join(dataDir, "templates", "template-1")),
      false,
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("来源项目不存在时从旧快照建立模板项目", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-template-copy-"));
  try {
    const legacyDir = path.join(dataDir, "templates", "template-2");
    writeJson(path.join(legacyDir, "template.json"), {
      id: "template-2",
      name: "孤立模板",
      category: "组件",
      description: "保留内容",
      demoPages: [],
      createdAt: 2,
    });
    fs.mkdirSync(path.join(legacyDir, "workspace"), { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, "workspace", "workspace-tree.json"),
      JSON.stringify({ pages: [] }),
    );

    const result = runMigration(dataDir, "--apply");
    const projectId = "proj_migrated_template-2";
    assert.equal(result.migrated[0].projectId, projectId);
    const project = JSON.parse(
      fs.readFileSync(
        path.join(dataDir, "projects", projectId, "project.json"),
        "utf8",
      ),
    );
    assert.equal(project.projectType, "template");
    assert.equal(
      fs.existsSync(
        path.join(
          dataDir,
          "projects",
          projectId,
          "workspace",
          "workspace-tree.json",
        ),
      ),
      true,
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
