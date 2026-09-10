import { describe, expect, it, vi } from "vitest";
import { PreviewObservationBroker } from "../src/session/preview-observation-broker";

const identity = {
  schemaVersion: 1 as const,
  projectId: "project",
  workspaceId: "workspace",
  pageId: "home",
  runtimeType: "high-fidelity-react" as const,
  surface: "active-single-page" as const,
  previewInstanceId: "preview-1",
  renderGeneration: 3,
  revision: 7,
};

const result = {
  availability: "observed" as const,
  readiness: "ready" as const,
  identity,
  observedAt: Date.now(),
  capabilities: ["page-summary"],
  assertions: [],
  assertionStatus: "not-requested" as const,
  evidence: {
    kind: "runtime-structure" as const,
    precision: "layout" as const,
  },
};

describe("PreviewObservationBroker", () => {
  it("keeps requests bound to their originating connection", async () => {
    const broker = new PreviewObservationBroker();
    const send = vi.fn();
    broker.registerConnection("connection-a", "session", send);
    const pending = broker.observe("connection-a", { pageId: "home" }, 1000);
    const requestId = send.mock.calls[0]?.[0]?.previewRequestId;
    expect(requestId).toBeTruthy();
    expect(broker.resolve("connection-b", requestId, result)).toBe(false);
    expect(broker.resolve("connection-a", requestId, result)).toBe(true);
    await expect(pending).resolves.toMatchObject({ availability: "observed" });
  });

  it("does not route same-session observations across two browser connections", async () => {
    const broker = new PreviewObservationBroker();
    const sendA = vi.fn();
    const sendB = vi.fn();
    broker.registerConnection("connection-a", "same-session", sendA);
    broker.registerConnection("connection-b", "same-session", sendB);
    const identityA = { ...identity, previewInstanceId: "preview-a" };
    const identityB = { ...identity, previewInstanceId: "preview-b" };
    broker.registerPreview("connection-a", { identity: identityA });
    broker.registerPreview("connection-b", { identity: identityB });

    const pendingA = broker.observe("connection-a", {}, 1000);
    const pendingB = broker.observe("connection-b", {}, 1000);
    const requestA = sendA.mock.calls[0]?.[0]?.previewRequestId;
    const requestB = sendB.mock.calls[0]?.[0]?.previewRequestId;
    expect(requestA).toBeTruthy();
    expect(requestB).toBeTruthy();

    expect(broker.resolve("connection-a", requestB, result)).toBe(false);
    expect(broker.resolve("connection-b", requestA, result)).toBe(false);
    expect(
      broker.resolve("connection-a", requestA, {
        ...result,
        identity: identityA,
      }),
    ).toBe(true);
    expect(
      broker.resolve("connection-b", requestB, {
        ...result,
        identity: identityB,
      }),
    ).toBe(true);
    await expect(pendingA).resolves.toMatchObject({
      availability: "observed",
      identity: identityA,
    });
    await expect(pendingB).resolves.toMatchObject({
      availability: "observed",
      identity: identityB,
    });
  });

  it("cleans pending requests on disconnect", async () => {
    const broker = new PreviewObservationBroker();
    broker.registerConnection("connection-a", "session", vi.fn());
    const pending = broker.observe("connection-a", {}, 1000);
    expect(broker.pendingCount).toBe(1);
    broker.unregisterConnection("connection-a");
    await expect(pending).resolves.toMatchObject({
      availability: "unavailable",
      reasons: ["connection-closed"],
    });
    expect(broker.pendingCount).toBe(0);
  });

  it("settles old pending requests when a connection id is reused", async () => {
    const broker = new PreviewObservationBroker();
    const firstSend = vi.fn();
    broker.registerConnection("connection-a", "session", firstSend);
    const pending = broker.observe("connection-a", {}, 1000);
    expect(broker.pendingCount).toBe(1);

    broker.registerConnection("connection-a", "session", vi.fn());

    await expect(pending).resolves.toMatchObject({
      availability: "unavailable",
      reasons: ["connection-closed"],
    });
    expect(broker.pendingCount).toBe(0);
  });

  it("returns a bounded timeout result", async () => {
    const broker = new PreviewObservationBroker();
    broker.registerConnection("connection-a", "session", vi.fn());
    await expect(broker.observe("connection-a", {}, 1)).resolves.toMatchObject({
      availability: "unavailable",
      reasons: ["observation-timeout"],
    });
  });

  it("rejects a response from an older registered render identity", async () => {
    const broker = new PreviewObservationBroker();
    const send = vi.fn();
    broker.registerConnection("connection-a", "session", send);
    broker.registerPreview("connection-a", { identity });
    const pending = broker.observe("connection-a", {}, 1000);
    const requestId = send.mock.calls[0]?.[0]?.previewRequestId;
    const staleResult = {
      ...result,
      identity: {
        ...identity,
        renderGeneration: identity.renderGeneration - 1,
      },
    };

    expect(broker.resolve("connection-a", requestId, staleResult)).toBe(true);
    await expect(pending).resolves.toMatchObject({
      availability: "stale",
      reasons: ["stale-preview-identity"],
    });
    expect(broker.pendingCount).toBe(0);
  });

  it("cancels pending observations when the registered preview is unmounted", async () => {
    const broker = new PreviewObservationBroker();
    const send = vi.fn();
    broker.registerConnection("connection-a", "session", send);
    broker.registerPreview("connection-a", { identity });
    const pending = broker.observe("connection-a", {}, 1000);

    broker.unregisterPreview("connection-a", identity.previewInstanceId);

    await expect(pending).resolves.toMatchObject({
      availability: "unavailable",
      reasons: ["preview-unregistered"],
    });
    expect(broker.pendingCount).toBe(0);
  });

  it("preserves an unavailable result that has no identity", async () => {
    const broker = new PreviewObservationBroker();
    const send = vi.fn();
    broker.registerConnection("connection-a", "session", send);
    broker.registerPreview("connection-a", { identity });
    const pending = broker.observe("connection-a", {}, 1000);
    const requestId = send.mock.calls[0]?.[0]?.previewRequestId;

    expect(
      broker.resolve("connection-a", requestId, {
        availability: "unavailable",
        readiness: "partial",
        capabilities: [],
        assertions: [],
        assertionStatus: "not-requested",
        evidence: { kind: "runtime-structure", precision: "layout" },
        reasons: ["no-active-preview"],
      }),
    ).toBe(true);
    await expect(pending).resolves.toMatchObject({
      availability: "unavailable",
      reasons: ["no-active-preview"],
    });
  });

  it("rejects registrations with unknown capabilities", () => {
    const broker = new PreviewObservationBroker();
    broker.registerConnection("connection-a", "session", vi.fn());
    expect(
      broker.registerPreview("connection-a", {
        identity,
        capabilities: ["arbitrary-script" as never],
      }),
    ).toBe(false);
  });

  it("accepts canonical media probe capabilities", () => {
    const broker = new PreviewObservationBroker();
    broker.registerConnection("connection-a", "session", vi.fn());
    expect(
      broker.registerPreview("connection-a", {
        identity,
        capabilities: ["media-probe", "painted-bounds"],
      }),
    ).toBe(true);
  });

  it("cancels a pending request through AbortSignal", async () => {
    const broker = new PreviewObservationBroker();
    const send = vi.fn();
    broker.registerConnection("connection-a", "session", send);
    const controller = new AbortController();
    const pending = broker.observe("connection-a", {}, 1000, controller.signal);
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      availability: "unavailable",
      reasons: ["observation-cancelled"],
    });
    expect(broker.pendingCount).toBe(0);
  });

  it("settles malformed responses without leaking pending state", async () => {
    const broker = new PreviewObservationBroker();
    const send = vi.fn();
    broker.registerConnection("connection-a", "session", send);
    const pending = broker.observe("connection-a", {}, 1000);
    const requestId = send.mock.calls[0]?.[0]?.previewRequestId;

    expect(broker.resolve("connection-a", requestId, { nope: true })).toBe(
      true,
    );
    await expect(pending).resolves.toMatchObject({
      availability: "unavailable",
      reasons: ["invalid-response"],
    });
    expect(broker.pendingCount).toBe(0);
  });
});
