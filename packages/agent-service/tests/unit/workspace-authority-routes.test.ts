import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import websocket from "@fastify/websocket";
import Fastify from "fastify";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceAuthorityStreamEvent } from "@workbench/shared/contracts";
import { WorkspaceFilePersistence } from "../../src/collab/workspace-file-persistence";
import { registerWorkspaceAuthorityRoutes } from "../../src/routes/workspace-authority";

const temporaryRoots: string[] = [];
const hash = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

function createFixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-authority-routes-"));
  temporaryRoots.push(dataDir);
  const workspacePath = path.join(dataDir, "workspaces", "projects", "project-1", "workspace-1");
  const sessionPath = path.join(dataDir, "sessions", "user-1", "project-1", "session-1");
  fs.mkdirSync(path.join(workspacePath, "demos", "home"), { recursive: true });
  fs.mkdirSync(sessionPath, { recursive: true });
  fs.writeFileSync(path.join(workspacePath, ".workspace.json"), JSON.stringify({
    workspaceId: "workspace-1", projectId: "project-1", scope: "live", status: "active",
  }));
  fs.writeFileSync(path.join(workspacePath, "demos", "home", "index.tsx"), "before");
  fs.writeFileSync(path.join(sessionPath, ".session.json"), JSON.stringify({
    sessionId: "session-1", demoId: "project-1", workspaceId: "workspace-1", userId: "user-1", expiresAt: Date.now() + 60_000,
  }));
  return { dataDir, persistence: new WorkspaceFilePersistence(dataDir) };
}

async function createServer(persistence: WorkspaceFilePersistence) {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  await registerWorkspaceAuthorityRoutes(app, persistence);
  return app;
}

function waitForStreamTypes(socket: WebSocket, expectedTypes: string[]): Promise<WorkspaceAuthorityStreamEvent[]> {
  return new Promise((resolve, reject) => {
    const events: WorkspaceAuthorityStreamEvent[] = [];
    const timeout = setTimeout(() => reject(new Error(`stream timeout: ${expectedTypes.join(",")}`)), 3_000);
    socket.on("message", (data) => {
      const event = JSON.parse(data.toString()) as WorkspaceAuthorityStreamEvent;
      events.push(event);
      if (expectedTypes.every((type) => events.some((entry) => entry.type === type))) {
        clearTimeout(timeout);
        resolve(events);
      }
    });
    socket.on("error", (error) => { clearTimeout(timeout); reject(error); });
  });
}

afterEach(() => {
  while (temporaryRoots.length) fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe("Workspace Authority routes", () => {
  it("鉴权后提供 state、resource、mutation catch-up 和 projection ack 查询", async () => {
    const { persistence } = createFixture();
    const app = await createServer(persistence);
    try {
      const state = await app.inject({
        method: "GET",
        url: "/api/workspace-authority/projects/project-1/workspaces/workspace-1/state?sessionId=session-1",
      });
      expect(state.statusCode).toBe(200);
      expect(state.json().data.revision).toBe(1);

      const resource = await app.inject({
        method: "GET",
        url: "/api/workspace-authority/projects/project-1/workspaces/workspace-1/resources/demos/home/index.tsx?sessionId=session-1",
      });
      expect(resource.json().data).toMatchObject({ content: "before", hash: hash("before"), revision: 1 });

      const mutation = await app.inject({
        method: "POST",
        url: "/api/workspace-authority/projects/project-1/workspaces/workspace-1/mutate",
        payload: {
          mutationId: "route-mutation", projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", baseRevision: 1,
          actor: "author-site", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }],
        },
      });
      expect(mutation.statusCode).toBe(200);
      expect(mutation.json().data.revision).toBe(2);

      const events = await app.inject({
        method: "GET",
        url: "/api/workspace-authority/projects/project-1/workspaces/workspace-1/events?sessionId=session-1&afterRevision=1",
      });
      expect(events.json().data).toEqual([expect.objectContaining({
        type: "workspace_mutation_committed",
        receipt: expect.objectContaining({ mutationId: "route-mutation", revision: 2 }),
      })]);

      const projection = await app.inject({
        method: "POST",
        url: "/api/workspace-authority/projects/project-1/workspaces/workspace-1/projection-ack",
        payload: {
          projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", revision: 2,
          mutationId: "route-mutation", clientId: "preview-1", surface: "active-preview", status: "applied", acknowledgedAt: Date.now(),
        },
      });
      expect(projection.statusCode).toBe(200);
      const projectionAcks = await app.inject({
        method: "GET",
        url: "/api/workspace-authority/projects/project-1/workspaces/workspace-1/projection-acks?sessionId=session-1&afterRevision=1",
      });
      expect(projectionAcks.json().data).toEqual([expect.objectContaining({ clientId: "preview-1", revision: 2 })]);

      const invalid = await app.inject({
        method: "GET",
        url: "/api/workspace-authority/projects/project-1/workspaces/workspace-1/events?sessionId=session-1&afterRevision=bad",
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error.code).toBe("INVALID_REQUEST");
    } finally {
      await app.close();
    }
  });

  it("WebSocket 重连先 catch-up，再推送 committed 与 projection 事件", async () => {
    const { persistence } = createFixture();
    await persistence.commitMutation({
      mutationId: "before-connect", projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", baseRevision: 1,
      actor: "author-site", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "second", expectedHash: hash("before") }],
    });
    const app = await createServer(persistence);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("missing test address");
    const socket = new WebSocket(
      `ws://127.0.0.1:${address.port}/api/workspace-authority/projects/project-1/workspaces/workspace-1/stream?sessionId=session-1&afterRevision=1`,
    );
    try {
      const initial = await waitForStreamTypes(socket, ["workspace_authority_ready", "workspace_mutation_committed"]);
      expect(initial.find((event) => event.type === "workspace_mutation_committed"))
        .toMatchObject({ receipt: { mutationId: "before-connect", revision: 2 } });

      const liveEventsPromise = waitForStreamTypes(socket, ["workspace_mutation_committed", "workspace_projection_acknowledged"]);
      const receipt = await persistence.commitMutation({
        mutationId: "after-connect", projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", baseRevision: 2,
        actor: "author-site", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "third", expectedHash: hash("second") }],
      });
      await persistence.recordProjectionAck({
        projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", revision: receipt.revision,
        mutationId: receipt.mutationId, clientId: "preview-live", surface: "active-preview", status: "applied", acknowledgedAt: Date.now(),
      });
      const liveEvents = await liveEventsPromise;
      expect(liveEvents.find((event) => event.type === "workspace_mutation_committed"))
        .toMatchObject({ receipt: { mutationId: "after-connect", revision: 3 } });
      expect(liveEvents.find((event) => event.type === "workspace_projection_acknowledged"))
        .toMatchObject({ ack: { mutationId: "after-connect", clientId: "preview-live" } });

      const gapSocket = new WebSocket(
        `ws://127.0.0.1:${address.port}/api/workspace-authority/projects/project-1/workspaces/workspace-1/stream?sessionId=session-1&afterRevision=0`,
      );
      const gapEvents = await waitForStreamTypes(gapSocket, ["workspace_authority_ready", "workspace_revision_gap"]);
      expect(gapEvents.find((event) => event.type === "workspace_revision_gap"))
        .toMatchObject({ expectedRevision: 1, currentRevision: 3 });
      gapSocket.close();
    } finally {
      socket.close();
      await app.close();
    }
  });
});
