import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteMarkdownReferenceIndex } from "./sqlite-index.js";
import { MARKDOWN_REFERENCE_INDEX_VERSION } from "@workbench/shared/markdown-reference";

it("requires a full rebuild of old parser generations before incremental updates", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-version-"));
  const index = new SqliteMarkdownReferenceIndex({ dataDir });
  try {
    const input = {
      projectId: "p",
      workspaceId: "w",
      directory: { project: { id: "p", name: "P" } },
      documents: [],
      authorityRevision: 1,
    };
    index.rebuild({ ...input, parserVersion: "markdown-reference-v1" });
    expect(index.status({ projectId: "p", workspaceId: "w" }).status).toBe(
      "stale",
    );
    expect(() => index.updateSources(input)).toThrow(
      "MARKDOWN_REFERENCE_REBUILD_REQUIRED",
    );
    index.rebuild(input);
    expect(index.status({ projectId: "p", workspaceId: "w" }).status).toBe(
      "ready",
    );
    expect(index.snapshot()?.parserVersion).toBe(
      MARKDOWN_REFERENCE_INDEX_VERSION,
    );
  } finally {
    index.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
