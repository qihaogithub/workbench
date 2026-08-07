import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  buildReferenceSourceRef,
  isReferenceSourceRef,
  parseReferenceSourceRef,
  readReferencedProjectFile,
  resolveReferencedProject,
} from "../../src/backends/pi-tools/reference-resolver";

function makeProject(dataDir: string, projectId: string, projectType: string) {
  const projectDir = path.join(dataDir, "projects", projectId);
  const workspacePath = path.join(projectDir, "workspace");
  fs.mkdirSync(path.join(workspacePath, "demos", "page-1"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "project.json"),
    JSON.stringify({ id: projectId, projectType }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "workspace-tree.json"),
    JSON.stringify({
      pages: [{ id: "page-1", name: "页面一", runtimeType: "prototype-html-css" }],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "demos", "page-1", "index.tsx"),
    "export default function Page() { return <div>页面一</div> }",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "demos", "page-1", "config.schema.json"),
    '{"type":"object","properties":{"title":{"type":"string"}}}',
    "utf-8",
  );
  return projectId;
}

describe("reference-resolver", () => {
  it("解析普通项目引用：生成阅读地图条目", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ref-resolver-"));
    try {
      makeProject(dataDir, "proj_1", "standard");
      const resolved = resolveReferencedProject(dataDir, {
        projectId: "proj_1",
        label: "学习页头图",
      });
      expect(resolved.kind).toBe("project");
      expect(resolved.workspacePath).toBeTruthy();
      expect(resolved.entries.length).toBeGreaterThanOrEqual(2);
      const page = resolved.entries.find((e) => e.kind === "page");
      expect(page).toBeTruthy();
      expect(page?.sourceRef).toBe("ref://project/proj_1/demos/page-1/index.tsx");
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("sourceRef 编解码往返一致", () => {
    const ref = buildReferenceSourceRef("proj_1", "demos/page-1/index.tsx");
    expect(isReferenceSourceRef(ref)).toBe(true);
    expect(parseReferenceSourceRef(ref)).toEqual({
      projectId: "proj_1",
      relativePath: "demos/page-1/index.tsx",
    });
    expect(isReferenceSourceRef("knowledge://chunk_xxx")).toBe(false);
  });

  it("受控读取：仅允许工作区内文件，越界返回 null", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ref-read-"));
    try {
      makeProject(dataDir, "proj_2", "standard");
      const ok = readReferencedProjectFile(
        dataDir,
        "proj_2",
        "demos/page-1/index.tsx",
      );
      expect(ok).toContain("页面一");
      const outside = readReferencedProjectFile(
        dataDir,
        "proj_2",
        "../../../etc/passwd",
      );
      expect(outside).toBeNull();
      const missing = readReferencedProjectFile(
        dataDir,
        "proj_2",
        "demos/nope/index.tsx",
      );
      expect(missing).toBeNull();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("模板项目引用同样从工作区解析（kind=template）", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ref-template-"));
    try {
      makeProject(dataDir, "proj_tpl_1", "template");
      const resolved = resolveReferencedProject(dataDir, {
        projectId: "proj_tpl_1",
      });
      expect(resolved.kind).toBe("template");
      expect(resolved.entries.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});