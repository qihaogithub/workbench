import fs from "fs";
import os from "os";
import path from "path";

import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSessionAuthorizations } from "../../src/config/session-authorizations";
import { registerAttachmentRoutes } from "../../src/routes/attachments";
import { saveUploadedFileAttachment } from "../../src/utils/uploaded-file-attachments";

describe("attachment routes ownership", () => {
  let dataDir: string;
  const previousDataDir = process.env.DATA_DIR;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "attachment-routes-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    getSessionAuthorizations().delete("conversation-1");
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
  });

  async function createApp() {
    const app = Fastify();
    await app.register(multipart);
    await registerAttachmentRoutes(app);
    return app;
  }

  function authorize() {
    getSessionAuthorizations().set("conversation-1", {
      userId: "user-1",
      role: "editor",
      projectId: "project-1",
      expiresAt: Date.now() + 60_000,
      source: "author-session",
    });
  }

  it("rejects upload before reading multipart when session authorization is absent", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/conversation-1/attachments?projectId=project-1",
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("does not delete an attachment owned by another conversation", async () => {
    authorize();
    const attachment = await saveUploadedFileAttachment({
      projectId: "project-1",
      ownerUserId: "user-1",
      conversationId: "conversation-2",
      filename: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("private"),
    });
    const app = await createApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/agent/conversation-1/attachments/${attachment.id}?projectId=project-1`,
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("deletes an attachment only through its owning conversation", async () => {
    authorize();
    const attachment = await saveUploadedFileAttachment({
      projectId: "project-1",
      ownerUserId: "user-1",
      conversationId: "conversation-1",
      filename: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("private"),
    });
    const app = await createApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/agent/conversation-1/attachments/${attachment.id}?projectId=project-1`,
    });
    expect(response.statusCode).toBe(200);
    expect(fs.existsSync(path.join(
      dataDir,
      "projects",
      "project-1",
      ".ai-attachments",
      attachment.id,
    ))).toBe(false);
    await app.close();
  });
});
