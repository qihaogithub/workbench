import assert from "node:assert/strict";

import { ProjectWorkspaceAuthorityClient, ProjectWorkspaceAuthorityClientError } from "./workspace-authority-client.js";

const calls: Array<{ url: string; init?: RequestInit }> = [];
const client = new ProjectWorkspaceAuthorityClient({
  baseUrl: "http://agent.test",
  sessionId: "session-1",
  fetcher: async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, data: { revision: 3, workspaceId: "live-1", projectId: "project-1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});

const state = await client.getState("project-1", "live-1");
assert.equal(state.revision, 3);
assert.equal(calls[0]?.url, "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/state?sessionId=session-1");

const resource = await client.readResource("project-1", "live-1", "demos/home/index.tsx");
assert.equal(resource.revision, 3);
assert.match(calls[1]?.url ?? "", /resources\/demos\/home\/index\.tsx\?sessionId=session-1$/);

assert.throws(() => client.mutate({
  mutationId: "bad-session", projectId: "project-1", workspaceId: "live-1", sessionId: "other", baseRevision: 3,
  actor: "project-cli", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "x", expectedHash: "hash" }],
}), (error: unknown) => error instanceof ProjectWorkspaceAuthorityClientError && error.code === "INVALID_REQUEST");

const failingClient = new ProjectWorkspaceAuthorityClient({
  baseUrl: "http://agent.test",
  sessionId: "session-1",
  fetcher: async () => new Response(JSON.stringify({ success: false, error: { code: "WORKSPACE_RESOURCE_CONFLICT", message: "conflict" } }), { status: 409 }),
});
await assert.rejects(
  failingClient.getEvents("project-1", "live-1", 1),
  (error: unknown) => error instanceof ProjectWorkspaceAuthorityClientError && error.code === "WORKSPACE_RESOURCE_CONFLICT" && error.status === 409,
);
