import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EntityResolver,
  findUnlinkedMentions,
  InMemoryMarkdownReferenceIndex,
  ResourceDirectory,
  SqliteMarkdownReferenceIndex,
  MarkdownReferenceProjector,
} from "../markdown-references/index.js";

const directory = new ResourceDirectory({
  project: { id: "p1", name: "营销站" },
  pages: [{ id: "page-1", name: "首页", routeKey: "home", order: 0, parentId: null, runtimeType: "prototype-html-css" }],
  documents: [{ id: "doc-1", title: "品牌规范", source: "user", description: "", fileName: "brand.md", addedAt: "2026-01-01", updatedAt: "2026-01-01", readonly: true }],
});

describe("markdown reference directory and resolver", () => {
  it("resolves stable IDs and ranks candidates without exposing paths", () => {
    const resolver = new EntityResolver(directory, "p1");
    expect(resolver.resolve({ kind: "page", projectId: "p1", pageId: "page-1" }, "旧首页")).toMatchObject({
      currentLabel: "首页", targetState: "active", clientState: "resolved",
    });
    expect(resolver.candidates(undefined, "home")[0]).toMatchObject({ label: "首页", displayPath: "营销站 / 首页" });
    expect(resolver.candidates(undefined, "brand")[0].target).toEqual({ kind: "document", projectId: "p1", docId: "doc-1" });
  });

  it("projects cross-project and unknown targets to unavailable", () => {
    const resolver = new EntityResolver(directory, "p1");
    expect(resolver.resolve({ kind: "project", projectId: "p2" })).toMatchObject({ targetState: "forbidden", clientState: "unavailable" });
    expect(resolver.resolve({ kind: "document", projectId: "p1", docId: "missing" })).toMatchObject({ targetState: "missing", clientState: "unavailable" });
  });
});

describe("in-memory markdown reference index", () => {
  it("finds unlinked mentions outside code and existing links", () => {
    const mentions = findUnlinkedMentions("首页与营销站；`首页` [首页](wb://page/p1/page-1)", directory);
    expect(mentions.map((mention) => mention.label)).toEqual(["首页", "营销站"]);
    expect(mentions[1]).toMatchObject({ target: { kind: "project", projectId: "p1" } });
  });

  it("can exclude the current document or page target from unlinked mentions", () => {
    const pageMentions = findUnlinkedMentions("首页与品牌规范", directory, 200, {
      kind: "page",
      projectId: "p1",
      pageId: "page-1",
    });
    expect(pageMentions.map((mention) => mention.label)).toEqual(["品牌规范"]);

    const documentMentions = findUnlinkedMentions("首页与品牌规范", directory, 200, {
      kind: "document",
      projectId: "p1",
      docId: "doc-1",
    });
    expect(documentMentions.map((mention) => mention.label)).toEqual(["首页"]);
  });

  it("rebuilds outgoing links and backlinks from canonical markdown", () => {
    const index = new InMemoryMarkdownReferenceIndex();
    const snapshot = index.rebuild({
      directory,
      workspaceId: "w1",
      authorityRevision: 4,
      documents: [{
        source: { kind: "knowledge-document", projectId: "p1", workspaceId: "w1", docId: "doc-1" },
        markdown: "参见 [首页](wb://page/p1/page-1)。",
        contentHash: "hash",
      }],
    });
    expect(snapshot.records[0]).toMatchObject({ line: 1, column: 4, targetState: "active" });
    expect(index.outgoing({ kind: "knowledge-document", projectId: "p1", workspaceId: "w1", docId: "doc-1" })).toHaveLength(1);
    expect(index.backlinks({ kind: "page", projectId: "p1", pageId: "page-1" })).toHaveLength(1);
  });
});

describe("sqlite markdown reference index", () => {
  let dataDir: string | undefined;
  afterEach(() => {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  it("atomically switches generations and isolates project/workspace queries", () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-links-"));
    const index = new SqliteMarkdownReferenceIndex({ dataDir, now: () => 100 });
    const source = { kind: "knowledge-document" as const, projectId: "p1", workspaceId: "w1", docId: "doc-1" };
    const snapshot = index.rebuild({
      projectId: "p1",
      directory,
      workspaceId: "w1",
      authorityMutationId: "mutation-1",
      authorityRevision: 3,
      authorityRootHash: "root-3",
      documents: [{ source, markdown: "参见 [首页](wb://page/p1/page-1)。" }],
    });
    expect(snapshot).toMatchObject({ projectId: "p1", workspaceId: "w1", authorityRevision: 3, authorityRootHash: "root-3" });
    expect(index.outgoing(source)).toHaveLength(1);
    expect(index.backlinks({ kind: "page", projectId: "p1", pageId: "page-1" }, { projectId: "p1", workspaceId: "w1" })).toHaveLength(1);
    expect(index.snapshot({ projectId: "p1", workspaceId: "other" })).toBeNull();
    index.close();

    const reopened = new SqliteMarkdownReferenceIndex({ dataDir, now: () => 101 });
    expect(reopened.snapshot({ projectId: "p1", workspaceId: "w1" })).toMatchObject({ authorityMutationId: "mutation-1", records: [{ labelSnapshot: "首页" }] });
    reopened.close();
  });

  it("rejects an older receipt and replaces only changed sources incrementally", () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-links-"));
    const index = new SqliteMarkdownReferenceIndex({ dataDir, now: () => 200 });
    const first = { kind: "knowledge-document" as const, projectId: "p1", workspaceId: "w1", docId: "doc-1" };
    const second = { kind: "knowledge-document" as const, projectId: "p1", workspaceId: "w1", docId: "doc-2" };
    index.rebuild({ projectId: "p1", directory, workspaceId: "w1", authorityRevision: 5, authorityRootHash: "r5", documents: [
      { source: first, markdown: "[首页](wb://page/p1/page-1)" },
      { source: second, markdown: "[品牌](wb://document/p1/doc-1)" },
    ] });
    const stale = index.rebuild({ projectId: "p1", directory, workspaceId: "w1", authorityRevision: 4, authorityRootHash: "r4", documents: [{ source: first, markdown: "旧内容" }] });
    expect(stale.authorityRevision).toBe(5);
    const updated = index.updateSources({ projectId: "p1", directory, workspaceId: "w1", authorityRevision: 6, authorityRootHash: "r6", documents: [{ source: first, markdown: "[品牌](wb://document/p1/doc-1)" }] });
    expect(updated.records).toHaveLength(2);
    expect(updated.records.filter((record) => record.source.kind === "knowledge-document" && record.source.docId === "doc-1")).toHaveLength(1);
    index.close();
  });

  it("rotates a malformed derived database without touching source data", () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-links-"));
    const dbPath = path.join(dataDir, "derived", "markdown-links.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, "not sqlite");
    const index = new SqliteMarkdownReferenceIndex({ dataDir });
    expect(fs.readdirSync(path.dirname(dbPath)).some((name) => name.includes(".corrupt-"))).toBe(true);
    expect(index.status({ projectId: "p1", workspaceId: "w1" }).status).toBe("stale");
    index.close();
  });
});

describe("committed markdown reference projector", () => {
  it("serializes receipt projections and skips unrelated mutations", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-projector-"));
    const index = new SqliteMarkdownReferenceIndex({ dataDir });
    const projector = new MarkdownReferenceProjector(index);
    let listener: ((event: { type: "workspace_mutation_committed"; receipt: { workspaceId: string; mutationId: string; revision: number; rootHash: string; projectId: string } }) => void) | undefined;
    const source = { onCommitted(callback: typeof listener) { listener = callback; return () => { listener = undefined; }; } };
    const loaded: number[] = [];
    const detach = projector.attach(source, async (receipt) => {
      loaded.push(receipt.revision);
      if (receipt.revision === 1) return null;
      return {
        projectId: "p1",
        receipt,
        directory,
        documents: [],
      };
    });
    listener?.({ type: "workspace_mutation_committed", receipt: { projectId: "p1", workspaceId: "w1", mutationId: "m1", revision: 1, rootHash: "r1" } });
    listener?.({ type: "workspace_mutation_committed", receipt: { projectId: "p1", workspaceId: "w1", mutationId: "m2", revision: 2, rootHash: "r2" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loaded).toEqual([1, 2]);
    expect(index.snapshot({ projectId: "p1", workspaceId: "w1" })).toMatchObject({ authorityRevision: 2 });
    detach();
    index.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
