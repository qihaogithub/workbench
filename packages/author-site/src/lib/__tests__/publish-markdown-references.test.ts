import fs from "fs";
import os from "os";
import path from "path";

describe("published markdown reference snapshot", () => {
  let tempDir: string;
  let buildSnapshot: typeof import("../publish-markdown-references").buildPublishedMarkdownReferenceSnapshot;
  let sanitize: typeof import("../publish-markdown-references").sanitizePublishedMarkdown;
  let sanitizeDesignSpecs: typeof import("../publish-markdown-references").sanitizePublishedDesignSpecFiles;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "published-reference-test-"));
    process.env.DATA_DIR = tempDir;
    jest.resetModules();
    buildSnapshot = require("../publish-markdown-references").buildPublishedMarkdownReferenceSnapshot;
    sanitize = require("../publish-markdown-references").sanitizePublishedMarkdown;
    sanitizeDesignSpecs = require("../publish-markdown-references").sanitizePublishedDesignSpecFiles;
  });

  it("publishes only snapshot targets and projects unresolved links as unavailable", () => {
    const publishedDir = path.join(tempDir, "published", "project-1");
    fs.mkdirSync(path.join(publishedDir, "knowledge"), { recursive: true });
    fs.writeFileSync(
      path.join(publishedDir, "knowledge", "guide.md"),
      "参见 [首页](wb://page/project-1/home) 和 [未发布文档](wb://document/project-1/secret).",
    );

    const snapshot = buildSnapshot({
      projectId: "project-1",
      projectName: "演示项目",
      publishedVersion: "v3",
      canonicalSnapshot: {
        versionId: "v3",
        workspaceId: "ws-1",
        workspaceRevision: 9,
        workspaceRootHash: "root-hash",
      },
      publishedProjectDir: publishedDir,
      pages: [{
        id: "home",
        name: "首页",
        order: 0,
        parentId: null,
        requirements: "[指南](wb://document/project-1/doc-1) [外部](wb://project/project-other)" ,
      }],
      knowledge: [
        { id: "doc-1", title: "指南", fileName: "guide.md", source: "user" } as never,
        { id: "system-1", title: "系统", fileName: "system.md", source: "system" } as never,
      ],
    });

    expect(snapshot.canonicalSnapshot).toMatchObject({ versionId: "v3", workspaceId: "ws-1" });
    expect(snapshot.targets.map((entry) => entry.target)).toEqual([
      { kind: "project", projectId: "project-1" },
      { kind: "page", projectId: "project-1", pageId: "home" },
      { kind: "document", projectId: "project-1", docId: "doc-1" },
    ]);
    expect(snapshot.targets.find((entry) => entry.target.kind === "document")?.publishedPath).toBe("knowledge/guide.md");
    expect(snapshot.documentPaths).toEqual({ "doc-1": "knowledge/guide.md" });
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: { kind: "page-requirements", pageId: "home" }, targetState: "resolved", target: { kind: "document", projectId: "project-1", docId: "doc-1" } }),
      expect.objectContaining({ source: { kind: "page-requirements", pageId: "home" }, targetState: "publish-unavailable" }),
      expect.objectContaining({ source: { kind: "knowledge-document", docId: "doc-1" }, targetState: "resolved", target: { kind: "page", projectId: "project-1", pageId: "home" } }),
    ]));
    expect(snapshot.edges.find((edge) => edge.targetState === "publish-unavailable")?.target).toBeUndefined();
    expect(snapshot.unresolvedCount).toBe(2);
    expect(sanitize("保留 [首页](wb://page/project-1/home)，隐藏 [外部](wb://project/project-other)。", snapshot)).toBe("保留 [首页](wb://page/project-1/home)，隐藏 外部。");
  });

  it("sanitizes unavailable links embedded in published DesignSpec JSON", () => {
    const publishedDir = path.join(tempDir, "published", "project-design-spec");
    fs.mkdirSync(path.join(publishedDir, "design-spec"), { recursive: true });
    fs.writeFileSync(path.join(publishedDir, "design-spec", "spec-brand.json"), JSON.stringify({
      id: "brand",
      entries: [{ id: "entry-1", markdown: "[未发布](wb://document/project-design/missing)" }],
    }));
    const snapshot = buildSnapshot({
      projectId: "project-design-spec",
      projectName: "设计项目",
      publishedVersion: "v1",
      canonicalSnapshot: { versionId: "v1" },
      publishedProjectDir: publishedDir,
      pages: [],
      designSpecs: [{ id: "brand" }],
    });
    expect(snapshot.edges).toEqual([
      expect.objectContaining({ source: { kind: "design-spec-entry", specId: "brand", entryId: "entry-1" }, targetState: "publish-unavailable" }),
    ]);
    sanitizeDesignSpecs(publishedDir, snapshot);
    expect(JSON.parse(fs.readFileSync(path.join(publishedDir, "design-spec", "spec-brand.json"), "utf8")).entries[0].markdown)
      .toBe("未发布");
  });
});
