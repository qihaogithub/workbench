import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  WorkspaceRootNotFoundError,
  findWorkspaceRoot,
  resolveDataDir,
} from "../src/paths.js";

describe("workspace paths", () => {
  it("finds the root by walking to pnpm-workspace.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "runtime-config-paths-"));
    const nested = join(root, "packages", "demo");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");

    try {
      expect(findWorkspaceRoot(nested)).toBe(root);
      expect(resolveDataDir({ cwd: nested, env: {} })).toBe(join(root, "data"));
      expect(resolveDataDir({ cwd: nested, env: { DATA_DIR: "var/data" } })).toBe(
        join(root, "var/data"),
      );
      expect(resolveDataDir({ cwd: nested, dataDir: "/tmp/workbench-data" })).toBe(
        "/tmp/workbench-data",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports when no workspace root exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "runtime-config-no-root-"));
    try {
      expect(() => findWorkspaceRoot(directory)).toThrow(WorkspaceRootNotFoundError);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts an absolute DATA_DIR in a bundled runtime without a workspace manifest", () => {
    const directory = mkdtempSync(join(tmpdir(), "runtime-config-absolute-"));
    try {
      expect(
        resolveDataDir({ cwd: directory, env: { DATA_DIR: "/tmp/workbench-data" } }),
      ).toBe("/tmp/workbench-data");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
