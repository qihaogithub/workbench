import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SqliteKnowledgeCatalog,
  reconcileTemplateProjects,
} from "../sqlite-catalog.js";

let tempDir: string;
let catalog: SqliteKnowledgeCatalog;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-sqlite-"));
  catalog = new SqliteKnowledgeCatalog({ dataDir: tempDir });
});

afterEach(() => {
  catalog.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("SQLite 模板知识目录", () => {
  it("索引模板项目并支持中文全文查询和原文读取", () => {
    writeProject("proj-template", "template", "退款规则：超过七天不可退款");

    const result = reconcileTemplateProjects(catalog, tempDir);
    expect(result.indexedProjects).toBe(1);

    const hits = catalog.search({
      query: "七天退款",
      currentProjectId: "proj-current",
    });
    expect(hits[0]).toMatchObject({
      projectId: "proj-template",
      projectName: "售后模板",
      path: "knowledge/售后规则.md",
      kind: "knowledge-document",
    });

    const source = catalog.read(hits[0].sourceRef);
    expect(source?.content).toContain("超过七天不可退款");
    expect(source?.revision).toBe(3);

    const configHits = catalog.search({ query: "售后热线" });
    expect(configHits[0]).toMatchObject({
      path: "project.config.values.json",
      kind: "project-config",
    });
  });

  it("模板修订变化后重建索引，转普通项目后立即下线", () => {
    writeProject("proj-template", "template", "legacyonly 旧活动口径");
    reconcileTemplateProjects(catalog, tempDir);
    expect(catalog.search({ query: "legacyonly" })).toHaveLength(1);

    writeProject("proj-template", "template", "新活动口径", 4, "root-4");
    reconcileTemplateProjects(catalog, tempDir);
    expect(catalog.search({ query: "legacyonly" })).toHaveLength(0);
    expect(catalog.search({ query: "新活动" })).toHaveLength(1);

    writeProject("proj-template", "standard", "新活动口径", 5, "root-5");
    const result = reconcileTemplateProjects(catalog, tempDir);
    expect(result.deactivatedProjects).toBe(1);
    expect(catalog.search({ query: "新活动" })).toHaveLength(0);
  });

  it("查询时排除当前模板项目，避免与当前工作区知识重复", () => {
    writeProject("proj-template", "template", "当前模板专用规则");
    reconcileTemplateProjects(catalog, tempDir);

    expect(
      catalog.search({
        query: "当前模板",
        currentProjectId: "proj-template",
      }),
    ).toEqual([]);
  });
});

function writeProject(
  projectId: string,
  projectType: "standard" | "template",
  knowledge: string,
  revision = 3,
  rootHash = "root-3",
): void {
  const projectDir = path.join(tempDir, "projects", projectId);
  const workspaceDir = path.join(projectDir, "workspace");
  const knowledgeDir = path.join(workspaceDir, "knowledge");
  fs.mkdirSync(knowledgeDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "project.json"),
    JSON.stringify({
      id: projectId,
      name: "售后模板",
      projectType,
      templateSettings: {
        description: "客服与售后规则",
        scope: "team",
        official: false,
      },
      canonicalSyncedRevision: revision,
      canonicalSyncedRootHash: rootHash,
      updatedAt: revision,
    }),
  );
  fs.writeFileSync(
    path.join(workspaceDir, "workspace-tree.json"),
    JSON.stringify({ folders: [], pages: [] }),
  );
  fs.writeFileSync(
    path.join(knowledgeDir, "manifest.json"),
    JSON.stringify({
      items: [
        {
          id: "after-sales",
          title: "售后规则",
          path: "售后规则.md",
          description: "售后规则说明",
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(knowledgeDir, "售后规则.md"),
    `# 售后规则\n\n${knowledge}`,
  );
  fs.writeFileSync(
    path.join(workspaceDir, "project.config.values.json"),
    JSON.stringify({ serviceHotline: "售后热线 400-000-0000" }),
  );
}
