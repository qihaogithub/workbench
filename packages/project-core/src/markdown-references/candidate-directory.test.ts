import { describe, it, expect } from "vitest";
import { buildCandidateDirectoryEntries } from "./candidate-directory.js";
import { ResourceDirectory } from "./resource-directory.js";
import { EntityResolver } from "./entity-resolver.js";
import { InMemoryMarkdownReferenceIndex } from "./link-index.js";
import { encodeMarkdownReferenceUri as uri } from "@workbench/shared/markdown-reference";

describe("complete same-project directory", () => {
  const entries = buildCandidateDirectoryEntries({
    projectId: "p",
    folders: [{ id: "folder", name: "Folder" }],
    pages: [
      {
        id: "home",
        name: "Home",
        parentId: "folder",
        schema: JSON.stringify({
          properties: {
            list: {
              type: "array",
              title: "List",
              items: {
                properties: {
                  nested: {
                    type: "object",
                    properties: { title: { type: "string" } },
                  },
                },
              },
            },
            choice: {
              type: "array",
              items: {
                oneOf: [
                  {
                    properties: {
                      kind: { const: "a" },
                      value: { type: "string" },
                    },
                  },
                ],
              },
            },
          },
        }),
      },
    ],
  });
  it("uses schema identities and selectable ancestor URI ids", () => {
    const child = entries.find(
      (entry) =>
        entry.target.kind === "config" &&
        entry.target.fieldPath === "list[].nested.title",
    )!;
    expect(child.hierarchy?.map((node) => node.kind)).toEqual([
      "folder",
      "page",
      "config",
      "config",
    ]);
    for (const node of child.hierarchy!.filter(
      (node) => node.kind === "page" || node.kind === "config",
    ))
      expect(entries.some((entry) => uri(entry.target) === node.id)).toBe(true);
    expect(
      entries.some(
        (entry) =>
          entry.target.kind === "config" &&
          entry.target.fieldPath === "choice[kind=a].value",
      ),
    ).toBe(true);
    expect(child.hierarchy?.some((node) => node.id === uri(child.target))).toBe(
      false,
    );
  });
  it("keeps all entries, rejects cross-project and preserves missing/deleted state", () => {
    const directory = new ResourceDirectory({
      project: { id: "p", name: "P" },
      entries,
    });
    for (let i = 0; i < 150; i++)
      directory.add({
        target: { kind: "page", projectId: "p", pageId: String(i) },
        label: String(i),
        displayPath: String(i),
      });
    directory.add({
      target: { kind: "page", projectId: "other", pageId: "secret" },
      label: "Secret",
      displayPath: "Secret",
    });
    expect(directory.list().length).toBeGreaterThan(150);
    expect(
      directory.list().some((entry) => entry.target.projectId === "other"),
    ).toBe(false);
    const target = {
      kind: "config" as const,
      projectId: "p",
      pageId: "home",
      fieldPath: "removed",
    };
    const resolver = new EntityResolver(directory, "p");
    expect(resolver.resolve(target, "Old label")).toMatchObject({
      targetState: "missing",
      labelSnapshot: "Old label",
      clientState: "unavailable",
    });
    directory.add({
      target,
      label: "Old",
      displayPath: "Old",
      state: "deleted",
    });
    expect(resolver.resolve(target).targetState).toBe("deleted");
    expect(
      resolver.resolve({ ...target, projectId: "other" }).targetState,
    ).toBe("forbidden");
  });
  it("indexes new targets and normalizes explicit knowledge identity", () => {
    const index = new InMemoryMarkdownReferenceIndex();
    index.rebuild({
      directory: { project: { id: "p", name: "P" }, entries },
      projectId: "p",
      workspaceId: "w",
      documents: [
        {
          source: {
            kind: "workspace-memory",
            projectId: "p",
            workspaceId: "w",
          },
          markdown:
            "[field](wb://config/p/home/list) [doc](wb://document/p/x) [memory](wb://document/p/memory/memory)",
        },
      ],
    });
    expect(index.snapshot()?.records).toHaveLength(3);
    expect(
      index.backlinks({
        kind: "document",
        projectId: "p",
        docId: "x",
        documentKind: "knowledge",
      }),
    ).toHaveLength(1);
    expect(
      index.backlinks({
        kind: "document",
        projectId: "p",
        docId: "memory",
        documentKind: "memory",
      }),
    ).toHaveLength(1);
  });
});
