import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildProjectManifest,
  createProjectArchive,
  importProjectArchive,
} from "../../project-core/src/project-transfer.js";

import { syncDiff, syncPull, syncPush } from "./sync-commands.js";

const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-sync-local-"));
const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-sync-remote-"));
const projectId = "project-sync";
const originalFetch = globalThis.fetch;

function writeProject(dataDir: string, marker: string): void {
  const projectDir = path.join(dataDir, "projects", projectId);
  fs.mkdirSync(path.join(projectDir, "workspace"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "project.json"),
    JSON.stringify({ id: projectId, name: "同步测试", marker }),
  );
  fs.writeFileSync(path.join(projectDir, "workspace", "marker.txt"), marker);
}

function successJson(data: unknown): Response {
  return Response.json({ success: true, data });
}

try {
  writeProject(localDir, "local-v1");
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input.toString());
    assert.equal(
      new Headers(init?.headers).get("cookie"),
      "auth_token=test-token",
    );
    if (url.pathname.endsWith("/import") && init?.method === "POST") {
      const archive = Buffer.from(await new Response(init.body).arrayBuffer());
      const imported = await importProjectArchive(remoteDir, projectId, archive);
      return successJson(imported);
    }
    if (url.pathname.endsWith("/export") && url.searchParams.get("manifest") === "1") {
      return successJson(buildProjectManifest(remoteDir, projectId));
    }
    if (url.pathname.endsWith("/export")) {
      const archive = await createProjectArchive(remoteDir, projectId);
      return new Response(Uint8Array.from(archive).buffer, {
        headers: { "Content-Type": "application/gzip" },
      });
    }
    return Response.json(
      { success: false, error: { code: "NOT_FOUND", message: "not found" } },
      { status: 404 },
    );
  }) as typeof fetch;

  const target = {
    projectId,
    authorSiteUrl: "https://author.test",
    authToken: "test-token",
  };

  const pushed = await syncPush({ ...target, dataDir: localDir });
  assert.equal(pushed.ok, true);
  assert.equal(pushed.data.direction, "push");
  assert.equal(
    fs.readFileSync(
      path.join(remoteDir, "projects", projectId, "workspace", "marker.txt"),
      "utf-8",
    ),
    "local-v1",
  );

  const identical = await syncDiff({ ...target, dataDir: localDir });
  assert.equal(identical.data.diff.identical, false);
  assert.deepEqual(identical.data.diff.changed, ["project.json"]);

  writeProject(remoteDir, "remote-v2");
  const changed = await syncDiff({ ...target, dataDir: localDir });
  assert.equal(changed.data.diff.identical, false);
  assert.deepEqual(changed.data.diff.changed.sort(), [
    "project.json",
    "workspace/marker.txt",
  ]);

  const pulled = await syncPull({ ...target, dataDir: localDir });
  assert.equal(pulled.ok, true);
  assert.equal(pulled.data.direction, "pull");
  assert.equal(
    fs.readFileSync(
      path.join(localDir, "projects", projectId, "workspace", "marker.txt"),
      "utf-8",
    ),
    "remote-v2",
  );

  console.log("sync-commands.test.ts 通过");
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(localDir, { recursive: true, force: true });
  fs.rmSync(remoteDir, { recursive: true, force: true });
}
