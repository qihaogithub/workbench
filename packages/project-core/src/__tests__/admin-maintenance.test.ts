import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectAdminService } from "../service.js";
import type { EditTransaction } from "../types.js";

let tempDir: string;
let service: ProjectAdminService;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-admin-maintenance-"));
  service = new ProjectAdminService({ dataDir: tempDir });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("workspace maintenance", () => {
  it("列出并清理未引用 branch workspace，默认只预览", () => {
    const project = service.createProject({ name: "工作区维护" }).data!;
    const edit = service.beginEdit(project.id).data as EditTransaction;

    const listed = service.workspaceList(project.id);
    expect(listed.data?.some((item) => item.scope === "canonical")).toBe(true);
    expect(
      listed.data?.some((item) => item.workspaceId === edit.workspaceId),
    ).toBe(true);

    const preview = service.workspaceClean(project.id);
    expect(preview.data?.dryRun).toBe(true);
    expect(
      preview.data?.candidates.some(
        (candidate) => candidate.workspaceId === edit.workspaceId,
      ),
    ).toBe(true);
    expect(fs.existsSync(edit.workspacePath)).toBe(true);

    const applied = service.workspaceClean(project.id, { force: true });
    expect(applied.data?.removed.map((item) => item.workspaceId)).toContain(
      edit.workspaceId,
    );
    expect(fs.existsSync(edit.workspacePath)).toBe(false);
  });

  it("只修复悬空 activeWorkspaceId，不伪造 canonical 同步证明", () => {
    const project = service.createProject({ name: "悬空工作区" }).data!;
    const projectPath = path.join(
      tempDir,
      "projects",
      project.id,
      "project.json",
    );
    const meta = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    fs.writeFileSync(
      projectPath,
      JSON.stringify({
        ...meta,
        activeWorkspaceId: "missing-live",
        activeWorkspaceUpdatedAt: 1,
        canonicalSyncedWorkspaceId: "other-live",
        canonicalSyncedRevision: 9,
        canonicalSyncedRootHash: "proof",
      }),
    );

    const preview = service.workspaceFix(project.id);
    expect(preview.data?.issues.map((issue) => issue.code)).toContain(
      "ACTIVE_WORKSPACE_MISSING",
    );
    expect(
      JSON.parse(fs.readFileSync(projectPath, "utf-8")).activeWorkspaceId,
    ).toBe("missing-live");

    const applied = service.workspaceFix(project.id, { force: true });
    expect(applied.data?.fixed).toContain("activeWorkspaceId");
    const updated = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(updated.activeWorkspaceId).toBeUndefined();
    expect(updated.canonicalSyncedWorkspaceId).toBe("other-live");
    expect(updated.canonicalSyncedRevision).toBe(9);
  });
});

describe("content graph maintenance", () => {
  it("默认预览，强制执行时备份并从 canonical workspace 重建", () => {
    const project = service.createProject({ name: "内容图维护" }).data!;
    const edit = service.beginEdit(project.id).data as EditTransaction;
    const page = service.createPage({
      editId: edit.editId,
      name: "首页",
      code: "export default function Page(){ return <main>ok</main> }",
    });
    expect(service.commitEdit(edit.editId, "初始页面").ok).toBe(true);
    const pageId = page.data?.meta.id ?? "";
    expect(
      service.resourceVersionCreate({
        projectId: project.id,
        kind: "page",
        resourceId: pageId,
        note: "建立旧内容图",
      }).ok,
    ).toBe(true);
    const before = service.contentGraphStatus(project.id).data!;
    expect(before.commitCount).toBeGreaterThan(0);

    const preview = service.contentGraphReset(project.id);
    expect(preview.data?.dryRun).toBe(true);
    expect(preview.data?.resourceCount).toBe(1);

    const applied = service.contentGraphReset(project.id, { force: true });
    expect(applied.ok).toBe(true);
    expect(applied.data?.dryRun).toBe(false);
    expect(applied.data?.backupPath).toBeDefined();
    expect(fs.existsSync(applied.data?.backupPath ?? "")).toBe(true);
    const after = service.contentGraphStatus(project.id).data!;
    expect(after.commitCount).toBe(1);
    expect(after.materializationStatus).toBe("ready");
    expect(after.materializedCommitId).toBe(after.headCommitId);
  });
});
