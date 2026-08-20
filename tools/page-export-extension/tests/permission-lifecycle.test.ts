import { describe, expect, it } from "vitest";
import { permissionForUrl, permissionRequestForUrl } from "../src/shared/permissions.js";
import { isApprovedDownloadRequest, shouldCloseOffscreen } from "../src/shared/lifecycle.js";

describe("site permission derivation", () => {
  it("scopes permission to the exact scheme and host while retaining the port only for reporting", () => {
    expect(permissionForUrl("https://example.test:8443/app/view?x=1")).toEqual({
      origin: "https://example.test:8443",
      pattern: "https://example.test/*",
    });
  });

  it("rejects non-web pages and malformed URLs", () => {
    expect(permissionRequestForUrl("chrome://settings")).toBeUndefined();
    expect(permissionRequestForUrl("not a url")).toBeUndefined();
  });
});

describe("offscreen lifecycle", () => {
  it("closes only after a terminal task has no active capture port", () => {
    expect(shouldCloseOffscreen({ hasDocument: true, capturePortActive: false, phase: "ready" })).toBe(true);
    expect(shouldCloseOffscreen({ hasDocument: true, capturePortActive: true, phase: "failed" })).toBe(false);
    expect(shouldCloseOffscreen({ hasDocument: true, capturePortActive: false, phase: "capturing" })).toBe(false);
    expect(shouldCloseOffscreen({ hasDocument: false, capturePortActive: false, phase: "cancelled" })).toBe(false);
  });
});

describe("review download gate", () => {
  const state = {
    phase: "review_required" as const,
    progress: 96,
    message: "review",
    captureId: "capture-1",
    filename: "snapshot.zip",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };

  it("accepts only the reviewed capture filename and extension-owned Blob URL", () => {
    expect(isApprovedDownloadRequest({
      state,
      captureId: "capture-1",
      filename: "snapshot.zip",
      objectUrl: "blob:chrome-extension://abc/uuid",
      extensionRoot: "chrome-extension://abc/",
    })).toBe(true);
  });

  it("rejects phase, capture, filename and Blob-origin bypasses", () => {
    expect(isApprovedDownloadRequest({ state: { ...state, phase: "ready" }, captureId: "capture-1", filename: "snapshot.zip", objectUrl: "blob:chrome-extension://abc/uuid", extensionRoot: "chrome-extension://abc/" })).toBe(false);
    expect(isApprovedDownloadRequest({ state, captureId: "other", filename: "snapshot.zip", objectUrl: "blob:chrome-extension://abc/uuid", extensionRoot: "chrome-extension://abc/" })).toBe(false);
    expect(isApprovedDownloadRequest({ state, captureId: "capture-1", filename: "other.zip", objectUrl: "blob:chrome-extension://abc/uuid", extensionRoot: "chrome-extension://abc/" })).toBe(false);
    expect(isApprovedDownloadRequest({ state, captureId: "capture-1", filename: "snapshot.zip", objectUrl: "blob:https://attacker.test/uuid", extensionRoot: "chrome-extension://abc/" })).toBe(false);
  });
});
