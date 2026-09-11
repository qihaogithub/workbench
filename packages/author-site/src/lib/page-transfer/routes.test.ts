import { NextRequest } from "next/server";

const authorizeInternal = jest.fn();
const authorizeBrowser = jest.fn();
const preparePageTransfer = jest.fn();
const executePageTransfer = jest.fn();

jest.mock("./authorization", () => ({
  authorizeInternal: (...args: unknown[]) => authorizeInternal(...args),
  authorizeBrowser: (...args: unknown[]) => authorizeBrowser(...args),
}));

jest.mock("./index", () => ({
  preparePageTransfer: (...args: unknown[]) => preparePageTransfer(...args),
  executePageTransfer: (...args: unknown[]) => executePageTransfer(...args),
  getPageTransfer: jest.fn(),
  revokePageReference: jest.fn(),
}));

import { executeRoute, prepareRoute } from "./routes";

const actor = { id: "user-1", name: "User", role: "creator" as const };

function request(body: Record<string, unknown>, sessionId = "agent-session") {
  return new NextRequest(
    "http://author.test/api/internal/page-transfers/target/prepare",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-session-id": sessionId,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("page transfer routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authorizeInternal.mockResolvedValue({ actor, userId: actor.id });
    authorizeBrowser.mockResolvedValue({ actor, userId: actor.id });
    preparePageTransfer.mockResolvedValue({ id: "job-1" });
    executePageTransfer.mockResolvedValue({ id: "job-1", status: "completed" });
  });

  it("passes the trusted Agent session header to prepare", async () => {
    await prepareRoute(
      request({
        sourceProjectId: "source",
        sourcePageIds: ["page-1"],
        mode: "reference",
        idempotencyKey: "stable-key",
        sessionId: "model-supplied-session",
      }),
      "target",
      true,
    );

    expect(preparePageTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ sessionId: "agent-session" }),
      }),
    );
  });

  it("uses the trusted Agent session header for execute too", async () => {
    await executeRoute(
      request({ sessionId: "model-supplied-session" }),
      "target",
      true,
      "job-1",
    );

    expect(executePageTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "agent-session" }),
    );
  });

  it("keeps the browser request session contract unchanged", async () => {
    await prepareRoute(
      request({
        sourceProjectId: "source",
        sourcePageIds: ["page-1"],
        mode: "copy",
        idempotencyKey: "browser-key",
        sessionId: "browser-session",
      }),
      "target",
      false,
    );

    expect(preparePageTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          mode: "copy",
          sessionId: "browser-session",
        }),
      }),
    );
  });
});
