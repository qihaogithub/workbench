import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("html sandbox execution", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalNodeEnv = process.env.NODE_ENV;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "html-sandbox-execution-"));
    process.env.DATA_DIR = tempDir;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it("issues opaque, expiring tickets without exposing HTML in the URL", async () => {
    const execution = await import("./html-sandbox-execution");
    const ticketRef = execution.createHtmlSandboxExecution("<button onclick=\"x()\">go</button>", 1_000);

    expect(ticketRef.executionId).toMatch(/^[a-f0-9]{32}$/);
    expect(ticketRef.channelId).toMatch(/^[a-f0-9]{32}$/);
    expect(ticketRef.expiresAt).toBe(1_000 + execution.HTML_SANDBOX_EXECUTION_TTL_MS);
    expect(ticketRef.executionId).not.toContain("button");
    const stored = execution.readHtmlSandboxExecution(ticketRef.executionId, 1_001)!;
    expect(stored.artifactRef).toMatch(/^[a-f0-9]{64}$/);
    const ticketPath = path.join(tempDir, "html-sandbox-executions", `${ticketRef.executionId}.json`);
    expect(fs.readFileSync(ticketPath, "utf8")).not.toContain("onclick");
    expect(execution.readHtmlSandboxExecution(ticketRef.executionId, ticketRef.expiresAt)).toBeNull();
  });

  it("rejects malformed, tampered, and expired persisted tickets", async () => {
    const execution = await import("./html-sandbox-execution");
    const reference = execution.createHtmlSandboxExecution("<p>safe</p>", 1_000);
    const filePath = path.join(tempDir, "html-sandbox-executions", `${reference.executionId}.json`);

    fs.writeFileSync(filePath, "not-json", "utf8");
    expect(execution.readHtmlSandboxExecution(reference.executionId, 1_001)).toBeNull();
    expect(fs.existsSync(filePath)).toBe(false);

    const invalidId = "../escape";
    expect(execution.readHtmlSandboxExecution(invalidId, 1_001)).toBeNull();

    const second = execution.createHtmlSandboxExecution("<p>safe</p>", 2_000);
    const secondPath = path.join(tempDir, "html-sandbox-executions", `${second.executionId}.json`);
    const persisted = JSON.parse(fs.readFileSync(secondPath, "utf8")) as Record<string, unknown>;
    persisted.sandboxPolicyVersion = 999;
    fs.writeFileSync(secondPath, JSON.stringify(persisted), "utf8");
    expect(execution.readHtmlSandboxExecution(second.executionId, 2_001)).toBeNull();
    expect(fs.existsSync(secondPath)).toBe(false);
  });

  it("emits only hashed execution diagnostics when a contextual ticket expires or is revoked", async () => {
    const appendServerEditorDiagnosticEvent = jest.fn();
    jest.doMock("./editor-diagnostics/store", () => ({ appendServerEditorDiagnosticEvent }));
    const execution = await import("./html-sandbox-execution");
    const context = { projectId: "project-1", sessionId: "session-1", workspaceId: "workspace-1", pageId: "page-1" };
    const revoked = execution.createHtmlSandboxExecution("<p>safe</p>", 1_000, context);
    execution.deleteHtmlSandboxExecution(revoked.executionId);
    const expired = execution.createHtmlSandboxExecution("<p>safe</p>", 2_000, context);
    expect(execution.readHtmlSandboxExecution(expired.executionId, expired.expiresAt)).toBeNull();

    expect(appendServerEditorDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "sandbox.execution.revoked",
      projectId: "project-1",
      payload: expect.objectContaining({ executionIdHash: expect.any(String) }),
    }));
    expect(appendServerEditorDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "sandbox.execution.expired",
      projectId: "project-1",
      payload: expect.objectContaining({ executionIdHash: expect.any(String) }),
    }));
    const payloads = appendServerEditorDiagnosticEvent.mock.calls.map(([event]) => JSON.stringify(event));
    expect(payloads.join(" ")).not.toContain(revoked.executionId);
    expect(payloads.join(" ")).not.toContain(expired.executionId);
  });

  it("injects only the telemetry bridge and removes input policy overrides", async () => {
    const execution = await import("./html-sandbox-execution");
    const reference = execution.createHtmlSandboxExecution(
      '<!doctype html><html><head><base href="https://evil.invalid"><meta http-equiv="refresh" content="0;url=https://evil.invalid"><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body><canvas></canvas></body></html>',
      1_000,
    );
    const ticket = execution.readHtmlSandboxExecution(reference.executionId, 1_001)!;
    const document = execution.buildHtmlSandboxExecutionDocument(ticket);

    expect(document).not.toMatch(/<base\b/i);
    expect(document).not.toMatch(/http-equiv=["']?refresh/i);
    expect(document).not.toMatch(/http-equiv=["']?content-security-policy/i);
    expect(document).toContain("workbench-sandboxed-html-v1");
    expect(document).toContain(reference.channelId);
    expect(document).toContain("workbenchGeneration");
    expect(document).not.toContain("APP_ACTION");
  });

  it("returns a deny-by-default browser policy", async () => {
    const execution = await import("./html-sandbox-execution");
    const headers = execution.getHtmlSandboxResponseHeaders(["https://author.example"]);
    expect(headers["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("connect-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("frame-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("form-action 'none'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors https://author.example");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
  });

  it("fails closed in production without an explicitly configured origin", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.HTML_SANDBOX_PUBLIC_ORIGIN;
    delete process.env.HTML_SANDBOX_FRAME_ANCESTORS;
    const execution = await import("./html-sandbox-execution");
    expect(execution.resolveHtmlSandboxPublicOrigin("https://author.example")).toBeNull();
    expect(execution.resolveHtmlSandboxFrameAncestors()).toEqual([]);
  });

  it("normalizes configured origins and frame ancestors", async () => {
    process.env.HTML_SANDBOX_PUBLIC_ORIGIN = "https://sandbox.example/path";
    process.env.HTML_SANDBOX_FRAME_ANCESTORS = "https://author.example https://preview.example";
    const execution = await import("./html-sandbox-execution");
    expect(execution.resolveHtmlSandboxPublicOrigin("https://author.example")).toBe("https://sandbox.example");
    expect(execution.resolveHtmlSandboxFrameAncestors()).toEqual([
      "https://author.example",
      "https://preview.example",
    ]);
  });
});
