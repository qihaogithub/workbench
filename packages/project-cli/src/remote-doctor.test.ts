import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { diagnoseRemote } from "./auth-commands.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-cli-doctor-"));
const originalConfig = process.env.WORKBENCH_CLI_CONFIG;
const originalAuthorSiteUrl = process.env.AUTHOR_SITE_URL;
const originalAuthToken = process.env.AUTHOR_SITE_AUTH_TOKEN;
const originalFetch = globalThis.fetch;

try {
  process.env.WORKBENCH_CLI_CONFIG = path.join(tempDir, "config.json");
  delete process.env.AUTHOR_SITE_URL;
  delete process.env.AUTHOR_SITE_AUTH_TOKEN;
  const localOnly = await diagnoseRemote({});
  assert.equal(localOnly.ok, true);
  assert.deepEqual(localOnly.data, { configured: false });

  const requests: Array<{ url: string; cookie: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: input.toString(),
      cookie: headers.get("cookie") ?? "",
    });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const remote = await diagnoseRemote({
    authorSiteUrl: "https://author.test",
    authToken: "doctor-token",
  });
  assert.equal(remote.ok, true);
  const data = remote.data as {
    configured: boolean;
    connectivity: { ok: boolean };
    credentials: { valid?: boolean };
  };
  assert.equal(data.configured, true);
  assert.equal(data.connectivity.ok, true);
  assert.equal(data.credentials.valid, true);
  assert.deepEqual(requests, [
    { url: "https://author.test/", cookie: "" },
    {
      url: "https://author.test/api/sessions",
      cookie: "auth_token=doctor-token",
    },
  ]);

  console.log("remote-doctor.test.ts 通过");
} finally {
  globalThis.fetch = originalFetch;
  if (originalConfig === undefined) delete process.env.WORKBENCH_CLI_CONFIG;
  else process.env.WORKBENCH_CLI_CONFIG = originalConfig;
  if (originalAuthorSiteUrl === undefined) delete process.env.AUTHOR_SITE_URL;
  else process.env.AUTHOR_SITE_URL = originalAuthorSiteUrl;
  if (originalAuthToken === undefined) delete process.env.AUTHOR_SITE_AUTH_TOKEN;
  else process.env.AUTHOR_SITE_AUTH_TOKEN = originalAuthToken;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
