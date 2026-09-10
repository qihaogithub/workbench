import { describe, expect, it } from "vitest";
import { ToolHookManager } from "../../src/backends/managers/tool-hook-manager";

const identity = {
  schemaVersion: 1 as const,
  projectId: "project-1",
  workspaceId: "workspace-1",
  pageId: "page-1",
  runtimeType: "high-fidelity-react" as const,
  surface: "active-single-page" as const,
  previewInstanceId: "preview-1",
  renderGeneration: 3,
  revision: 7,
};

describe("ToolHookManager preview observation summaries", () => {
  it("retains bounded evidence without DOM/text/URL payloads", () => {
    const manager = new ToolHookManager({ sessionId: "session-1" });
    manager.handleToolResult(
      "observePreview",
      {
        target: { nodeId: "button-1" },
        assertions: [{ type: "text-equals", value: "secret user input" }],
      },
      false,
      {
        details: {
          availability: "observed",
          readiness: "ready",
          identity,
          observedAt: 100,
          capabilities: ["target-node", "assertions"],
          target: {
            nodeId: "button-1",
            rect: { x: 0, y: 0, width: 20, height: 20 },
            text: "secret user input",
            url: { origin: "https://example.test", path: "/private" },
          },
          assertions: [
            {
              id: "center",
              type: "centered",
              status: "passed",
              evidence: { precision: "layout", capability: "layout" },
            },
          ],
          assertionStatus: "passed",
          evidence: { kind: "runtime-structure", precision: "layout" },
          _observationMetrics: { latencyMs: 18.9, payloadBytes: 512.4 },
        },
      },
      "session-1",
    );

    const [summary] = manager.getPreviewObservations();
    expect(summary).toMatchObject({
      availability: "observed",
      readiness: "ready",
      identity,
      assertionStatus: "passed",
      assertionTypes: [{ type: "centered", status: "passed" }],
      evidence: { kind: "runtime-structure", precision: "layout" },
      observedAt: 100,
      latencyMs: 18,
      payloadBytes: 512,
    });
    expect(summary).not.toHaveProperty("target");
  });

  it("records unavailable observations and clears them for a new run", () => {
    const manager = new ToolHookManager({ sessionId: "session-1" });
    manager.handleToolResult(
      "observePreview",
      {},
      false,
      {
        details: {
          availability: "unavailable",
          readiness: "partial",
          capabilities: [],
          assertions: [],
          assertionStatus: "not-requested",
          evidence: { kind: "runtime-structure", precision: "layout" },
          reasons: ["no-active-preview"],
        },
      },
      "session-1",
    );

    expect(manager.getPreviewObservations()[0]).toMatchObject({
      availability: "unavailable",
      reasons: ["no-active-preview"],
    });
    manager.resetForNewMessage();
    expect(manager.getPreviewObservations()).toEqual([]);
  });

  it("records failed observation tool events as a redacted unavailable outcome", () => {
    const manager = new ToolHookManager({ sessionId: "session-1" });
    manager.handleToolResult(
      "observePreview",
      { assertions: [{ type: "runtime-ready" }] },
      true,
      {
        durationMs: 47.9,
        error: {
          code: "OBSERVATION_TIMEOUT",
          message: "page-authored text that must not be persisted",
        },
      },
      "session-1",
    );

    expect(manager.getPreviewObservations()[0]).toMatchObject({
      availability: "unavailable",
      readiness: "partial",
      assertionStatus: "not-requested",
      assertionTypes: [],
      evidence: { kind: "runtime-structure", precision: "layout" },
      latencyMs: 47,
      reasons: ["observation-tool-error"],
    });
    expect(JSON.stringify(manager.getPreviewObservations())).not.toContain(
      "page-authored",
    );
  });
});
