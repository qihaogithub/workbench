import fs from "fs";
import os from "os";
import path from "path";

import { ProjectAdminService } from "@opencode-workbench/project-core";
import type { EditTransaction, PageDetail } from "@opencode-workbench/project-core";

function makeTempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "owb-resource-history-"));
}

describe("资源级历史", () => {
  let dataDir: string;
  let service: ProjectAdminService;

  beforeEach(() => {
    dataDir = makeTempDataDir();
    service = new ProjectAdminService({ dataDir });
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("页面资源版本只通过内容图读写，不写旧 pageVersions", () => {
    const created = service.createProject({ name: "资源历史项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = (edit.data as EditTransaction).editId;
    const page = service.createPage({
      editId,
      name: "首页",
      code: "export default function Demo(){ return <div>v1</div>; }",
    });
    const pageId = (page.data as PageDetail).meta.id;
    expect(service.commitEdit(editId, "初始版本").ok).toBe(true);

    const pageVersion = service.createPageVersion({
      projectId,
      pageId,
      note: "页面资源版本",
    });
    expect(pageVersion.ok).toBe(true);
    expect(pageVersion.data?.versionId).toMatch(/^prv_/);

    const projectJson = JSON.parse(
      fs.readFileSync(path.join(dataDir, "projects", projectId, "project.json"), "utf-8"),
    );
    expect(projectJson.pageVersions).toBeUndefined();

    const resourceHistory = service.resourceVersionList({
      projectId,
      kind: "page",
      resourceId: pageId,
    });
    expect(resourceHistory.data?.versions[0]?.id).toBe(pageVersion.data?.versionId);

    const loaded = service.resourceVersionGet({
      projectId,
      kind: "page",
      resourceId: pageId,
      versionId: pageVersion.data?.versionId ?? "",
    });
    expect(loaded.ok).toBe(true);
    expect(JSON.stringify(loaded.data?.content)).toContain("v1");
  });

  it("恢复页面资源版本只替换目标页面", () => {
    const created = service.createProject({ name: "资源恢复项目" });
    const projectId = created.data?.id ?? "";
    const edit = service.beginEdit(projectId);
    const editId = (edit.data as EditTransaction).editId;
    const first = service.createPage({
      editId,
      name: "首页",
      code: "export default function Demo(){ return <div>home v1</div>; }",
    });
    const second = service.createPage({
      editId,
      name: "关于",
      code: "export default function Demo(){ return <div>about current</div>; }",
    });
    const pageId = (first.data as PageDetail).meta.id;
    const otherPageId = (second.data as PageDetail).meta.id;
    expect(service.commitEdit(editId, "初始版本").ok).toBe(true);

    const version = service.createPageVersion({ projectId, pageId });
    const nextEdit = service.beginEdit(projectId);
    const nextEditId = (nextEdit.data as EditTransaction).editId;
    expect(service.updatePage({
      editId: nextEditId,
      pageId,
      code: "export default function Demo(){ return <div>home v2</div>; }",
    }).ok).toBe(true);
    expect(service.commitEdit(nextEditId, "更新首页").ok).toBe(true);

    const restored = service.restorePageVersion(projectId, pageId, version.data?.versionId ?? "");
    expect(restored.ok).toBe(true);
    expect(restored.data?.files.code).toContain("home v1");

    const workspacePath = path.join(dataDir, "projects", projectId, "workspace");
    expect(fs.readFileSync(path.join(workspacePath, "demos", pageId, "index.tsx"), "utf-8"))
      .toContain("home v1");
    expect(fs.readFileSync(path.join(workspacePath, "demos", otherPageId, "index.tsx"), "utf-8"))
      .toContain("about current");
  });
});
