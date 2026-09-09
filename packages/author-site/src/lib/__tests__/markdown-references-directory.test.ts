/** @jest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

jest.mock("@/lib/fs-utils", () => ({
  readProjectMeta: () => ({ name: "Project" }),
  listDemoPages: () => [{ id: "home", name: "Home", parentId: "folder" }],
  readWorkspaceTree: () => ({ folders: [{ id: "folder", name: "Folder" }] }),
}));
jest.mock("@workbench/project-core/markdown-references", () =>
  require("../../../../project-core/src/markdown-references/candidate-directory"),
);
jest.mock("@workbench/project-core", () => ({
  ...require("../../../../project-core/src/markdown-references/resource-directory"),
  ...require("../../../../project-core/src/markdown-references/entity-resolver"),
  ...require("../../../../project-core/src/markdown-references/link-index"),
  hashWorkspaceContent: () => "hash",
}));

import {
  buildMarkdownReferenceIndex,
  toCandidateList,
  parseTarget,
  isCurrentSnapshot,
} from "../markdown-references";
import { createResourceDirectory } from "@workbench/project-core";
import { MARKDOWN_REFERENCE_INDEX_VERSION } from "@workbench/shared/markdown-reference";

describe("authorized workspace metadata directory", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-directory-"));
    write(
      "workspace-tree.json",
      JSON.stringify({
        pages: [{ id: "home", name: "Home", parentId: "folder" }],
        folders: [{ id: "folder", name: "Folder" }],
      }),
    );
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });
  function write(relative: string, content: string) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content);
  }
  it("rejects oversized catalog resources before reading their contents", () => {
    write("demos/home/config.schema.json", JSON.stringify({ title: "x".repeat(2048) }));
    const read = jest.spyOn(fs, "readFileSync");
    expect(() => buildMarkdownReferenceIndex(
      { projectId: "p", workspaceId: "w", workspacePath: root },
      { readMarkdown: false, maxResourceBytes: 1024 },
    )).toThrow();
    expect(read.mock.calls.some(([file]) => String(file).endsWith("config.schema.json"))).toBe(false);
  });
  it("collects all metadata without reading bodies, retains missing, and excludes arbitrary paths", () => {
    write("memory.md", "");
    write("convention.md", "");
    write("demos/home/convention.md", "");
    write(
      "demos/home/config.schema.json",
      JSON.stringify({
        properties: Object.fromEntries(
          Array.from({ length: 130 }, (_, i) => [
            `field${i}`,
            { type: "string" },
          ]),
        ),
      }),
    );
    write(
      "design-spec/manifest.json",
      JSON.stringify({
        items: [
          { id: "spec", title: "Spec" },
          { id: "../secret", title: "Secret" },
        ],
      }),
    );
    write("design-spec/spec-spec.json", "{}");
    write(
      "knowledge/manifest.json",
      JSON.stringify({
        items: [
          { id: "gone", title: "Gone", fileName: "gone.md" },
          { id: "escape", title: "Escape", fileName: "../memory.md" },
        ],
      }),
    );
    const result = buildMarkdownReferenceIndex(
      { projectId: "p", workspaceId: "w", workspacePath: root },
      { readMarkdown: false, rebuild: false },
    );
    const candidates = toCandidateList(result, "");
    expect(
      candidates.filter((candidate) => candidate.target.kind === "config"),
    ).toHaveLength(130);
    expect(
      candidates
        .filter((candidate) => candidate.target.kind === "document")
        .map((candidate) => candidate.documentGroup),
    ).toEqual(expect.arrayContaining(["AI 记忆", "公约", "设计规范"]));
    expect(
      candidates.some((candidate) => candidate.target.kind === "project"),
    ).toBe(true);
    expect(
      candidates.some(
        (candidate) =>
          candidate.label === "Escape" || candidate.label === "Gone",
      ),
    ).toBe(false);
    expect(
      candidates.find((candidate) => candidate.target.kind === "config")
        ?.hierarchy?.[0].label,
    ).toBe("Folder");
    expect(
      result.directory.resolve({
        kind: "document",
        projectId: "p",
        docId: "gone",
      }).state,
    ).toBe("missing");
    const reconstructed = createResourceDirectory(result.snapshot);
    expect(reconstructed.values()).toEqual(result.directory.values());
    expect(
      reconstructed.resolve({ kind: "document", projectId: "p", docId: "gone" })
        .state,
    ).toBe("missing");
  });
  it.each([
    "workspace-tree.json",
    "knowledge/manifest.json",
    "design-spec/manifest.json",
    "demos/home/config.schema.json",
  ])(
    "rejects corrupt %s instead of returning a partial directory",
    (relative) => {
      write(relative, "{");
      expect(() =>
        buildMarkdownReferenceIndex(
          { projectId: "p", workspaceId: "w", workspacePath: root },
          { readMarkdown: false, rebuild: false },
        ),
      ).toThrow();
    },
  );
  it("propagates unexpected IO errors", () => {
    const original = fs.readFileSync;
    jest.spyOn(fs, "readFileSync").mockImplementation(((
      file: fs.PathOrFileDescriptor,
      ...args: unknown[]
    ) => {
      if (String(file).endsWith("workspace-tree.json"))
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      return (original as Function)(file, ...args);
    }) as typeof fs.readFileSync);
    expect(() =>
      buildMarkdownReferenceIndex(
        { projectId: "p", workspaceId: "w", workspacePath: root },
        { readMarkdown: false, rebuild: false },
      ),
    ).toThrow("denied");
  });
  it("marks old parser generations stale even at the same revision", () => {
    const context = {
      projectId: "p",
      workspaceId: "w",
      workspacePath: root,
      observedRevision: 1,
    };
    expect(
      isCurrentSnapshot(
        { parserVersion: "markdown-reference-v1", authorityRevision: 1 },
        context,
      ),
    ).toBe(false);
    expect(
      isCurrentSnapshot(
        {
          parserVersion: MARKDOWN_REFERENCE_INDEX_VERSION,
          authorityRevision: 1,
        },
        context,
      ),
    ).toBe(true);
  });
  it("accepts canonical target URIs but rejects cross-project lookup", () => {
    expect(parseTarget("config", "wb://config/p/home/field", "p")).toEqual({
      kind: "config",
      projectId: "p",
      pageId: "home",
      fieldPath: "field",
    });
    expect(
      parseTarget("document", "wb://document/other/memory/memory", "p"),
    ).toBeNull();
  });
});
