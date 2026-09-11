import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

describe("Figma OAuth cross-environment handoff", () => {
  let dataDir: string;
  const envKeys = [
    "DATA_DIR",
    "JWT_SECRET",
    "EXTERNAL_AUTH_ENCRYPTION_KEY",
    "FIGMA_OAUTH_REDIRECT_URI",
    "FIGMA_OAUTH_TARGET_ID",
    "FIGMA_OAUTH_HANDOFF_SECRET",
    "FIGMA_OAUTH_TARGETS_JSON",
  ];
  const previousValues = new Map<string, string | undefined>();

  beforeEach(() => {
    jest.resetModules();
    for (const key of envKeys) previousValues.set(key, process.env[key]);
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-figma-handoff-"));
    process.env.DATA_DIR = dataDir;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.EXTERNAL_AUTH_ENCRYPTION_KEY = "test-external-auth-secret";
    process.env.FIGMA_OAUTH_REDIRECT_URI =
      "http://10.131.75.39:3200/api/user/external-auth/figma/callback";
    process.env.FIGMA_OAUTH_TARGET_ID = "dev";
    process.env.FIGMA_OAUTH_HANDOFF_SECRET =
      "test-figma-handoff-secret-with-at-least-32-bytes";
    process.env.FIGMA_OAUTH_TARGETS_JSON = JSON.stringify({
      dev: "http://10.131.75.39:3200",
      test: "http://10.0.0.12:3200",
    });
  });

  afterEach(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    for (const key of envKeys) {
      const value = previousValues.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("signs state, encrypts the credential, and redeems it once", async () => {
    const {
      createFigmaOAuthHandoff,
      createFigmaOAuthState,
      redeemFigmaOAuthHandoff,
      verifyFigmaOAuthState,
    } = await import("@/lib/figma-oauth-handoff");
    const { getDb } = await import("@/lib/db");
    const expiresAt = Date.now() + 3_600_000;

    const state = await createFigmaOAuthState({
      userId: "user-1",
      sessionId: "session-1",
    });
    expect(await verifyFigmaOAuthState(state.state)).toEqual({
      targetId: "dev",
      userId: "user-1",
      sessionId: "session-1",
      nonce: state.nonce,
    });

    const ticket = createFigmaOAuthHandoff({
      ...((await verifyFigmaOAuthState(state.state))),
      credential: {
        accessToken: "figma-access-token",
        refreshToken: "figma-refresh-token",
        expiresAt,
      },
      accountLabel: "Designer",
    });
    const raw = getDb()
      .prepare("SELECT * FROM figma_oauth_handoffs WHERE ticket_hash = ?")
      .get(
        crypto.createHash("sha256").update(ticket).digest("hex"),
      ) as { credential_encrypted: string };
    expect(raw.credential_encrypted).not.toContain("figma-access-token");
    expect(raw.credential_encrypted).not.toContain("figma-refresh-token");

    const redeemed = redeemFigmaOAuthHandoff({
      ticket,
      targetId: "dev",
      nonce: state.nonce,
    });
    expect(redeemed).toEqual({
      targetId: "dev",
      userId: "user-1",
      sessionId: "session-1",
      accountLabel: "Designer",
      expiresAt,
      credential: {
        accessToken: "figma-access-token",
        refreshToken: "figma-refresh-token",
        expiresAt,
      },
    });
    expect(() =>
      redeemFigmaOAuthHandoff({
        ticket,
        targetId: "dev",
        nonce: state.nonce,
      }),
    ).toThrow("already used");
  });

  it("binds the ticket to its target and rejects unsafe origins", async () => {
    const {
      createFigmaOAuthHandoff,
      createFigmaOAuthState,
      redeemFigmaOAuthHandoff,
      resolveFigmaOAuthTargetOrigin,
      verifyFigmaOAuthState,
    } = await import("@/lib/figma-oauth-handoff");
    const state = await createFigmaOAuthState({ userId: "user-1" });
    const claims = await verifyFigmaOAuthState(state.state);
    const ticket = createFigmaOAuthHandoff({
      ...claims,
      credential: { accessToken: "token" },
    });

    expect(() =>
      redeemFigmaOAuthHandoff({
        ticket,
        targetId: "test",
        nonce: state.nonce,
      }),
    ).toThrow();
    expect(resolveFigmaOAuthTargetOrigin("dev")).toBe(
      "http://10.131.75.39:3200",
    );

    process.env.FIGMA_OAUTH_TARGETS_JSON = JSON.stringify({
      dev: "javascript:alert(1)",
    });
    expect(() => resolveFigmaOAuthTargetOrigin("dev")).toThrow(
      "http or https origin",
    );

    process.env.FIGMA_OAUTH_TARGETS_JSON = JSON.stringify({
      dev: "http://0.0.0.0:3200",
    });
    expect(() => resolveFigmaOAuthTargetOrigin("dev")).toThrow(
      "browser-reachable",
    );
  });
});
