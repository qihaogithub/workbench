// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  PreviewObservationRegistry,
  collectPreviewObservation,
} from "./preview-observation-registry";
import type { PreviewRenderIdentity } from "@workbench/shared/demo/preview-observation";

const identity: PreviewRenderIdentity = {
  schemaVersion: 1,
  projectId: "project-1",
  workspaceId: "workspace-1",
  pageId: "page-1",
  runtimeType: "prototype-html-css",
  surface: "active-single-page",
  previewInstanceId: "instance-1",
  renderGeneration: 1,
  revision: 3,
};

function setupRoot() {
  const root = document.createElement("main");
  const hero = document.createElement("section");
  hero.dataset.owId = "hero";
  hero.textContent = "Hello";
  root.append(hero);
  document.body.append(root);
  return { root, hero };
}

describe("PreviewObservationRegistry", () => {
  it("observes only the registered active page and stable node ids", () => {
    const { root, hero } = setupRoot();
    const rect = { x: 400, y: 300, width: 200, height: 100 };
    hero.getBoundingClientRect = () => rect as DOMRect;
    const observed = collectPreviewObservation(
      { identity, root },
      {
        target: { nodeId: "hero" },
        assertions: [
          { type: "exists" },
          { type: "text-equals", value: "Hello" },
        ],
      },
    );
    expect(observed.availability).toBe("observed");
    expect(observed.target?.nodeId).toBe("hero");
    expect(observed.assertionStatus).toBe("passed");
    expect(
      collectPreviewObservation({ identity, root }, { pageId: "other-page" })
        .availability,
    ).toBe("unavailable");
    root.remove();
  });

  it("invalidates stale instances and never falls back to another registration", () => {
    const { root } = setupRoot();
    const registry = new PreviewObservationRegistry();
    const unregister = registry.register({ identity, root });
    expect(registry.identity?.previewInstanceId).toBe("instance-1");
    registry.invalidate("different-instance");
    expect(registry.identity?.previewInstanceId).toBe("instance-1");
    registry.invalidate("instance-1");
    expect(registry.observe().availability).toBe("unavailable");
    unregister();
    root.remove();
  });

  it("does not let an older generation cleanup remove a newer registration", () => {
    const first = setupRoot();
    const second = setupRoot();
    const registry = new PreviewObservationRegistry();
    const unregisterFirst = registry.register({ identity, root: first.root });
    const nextIdentity = {
      ...identity,
      renderGeneration: identity.renderGeneration + 1,
    };
    registry.register({ identity: nextIdentity, root: second.root });

    unregisterFirst();

    expect(registry.identity).toMatchObject(nextIdentity);
    expect(registry.observe().availability).toBe("observed");
    first.root.remove();
    second.root.remove();
  });

  it("keeps runtime errors in the observed facts without exposing page source", () => {
    const { root } = setupRoot();
    const registry = new PreviewObservationRegistry();
    registry.register({ identity, root });
    registry.recordRuntimeError(identity.previewInstanceId, "runtime");
    registry.recordRuntimeError(identity.previewInstanceId, "console");

    expect(
      registry.observe({
        detail: "runtime",
        assertions: [{ id: "runtime-clean", type: "no-runtime-errors" }],
      }),
    ).toMatchObject({
      readiness: "runtime-error",
      assertionStatus: "failed",
      runtime: { runtimeErrorCount: 1, consoleErrorCount: 1 },
      assertions: [
        expect.objectContaining({
          id: "runtime-clean",
          type: "no-runtime-errors",
          status: "failed",
        }),
      ],
    });
    root.remove();
  });

  it("fails closed while a retained preview runtime is sleeping", () => {
    const { root } = setupRoot();
    const registry = new PreviewObservationRegistry();
    registry.register({ identity, root, activityState: "active" });

    expect(registry.observe().availability).toBe("observed");
    registry.updateActivityState(identity.previewInstanceId, "sleeping");
    expect(registry.observe()).toMatchObject({
      availability: "unavailable",
      reasons: ["preview-sleeping"],
    });

    registry.updateActivityState(identity.previewInstanceId, "active");
    expect(registry.observe().availability).toBe("observed");
    root.remove();
  });

  it("fails closed for runtimes without a DOM observation adapter", () => {
    const { root } = setupRoot();
    const registry = new PreviewObservationRegistry();
    registry.register({
      identity: { ...identity, runtimeType: "sandboxed-html" },
      root,
    });
    expect(registry.observe().availability).toBe("unsupported");
    expect(registry.observe().capabilities).toEqual(["limited-host-facts"]);

    registry.register({
      identity: { ...identity, runtimeType: "sketch-scene" },
      root,
    });
    expect(registry.observe().availability).toBe("unsupported");
    root.remove();
  });

  it("returns bounded source-location candidates instead of guessing", () => {
    const { root } = setupRoot();
    const first = root.querySelector("section")!;
    first.removeAttribute("data-ow-id");
    first.setAttribute("data-source-file", "demos/home/index.tsx");
    first.setAttribute("data-source-line", "12");
    const second = document.createElement("section");
    second.setAttribute("data-source-file", "demos/home/index.tsx");
    second.setAttribute("data-source-line", "12");
    root.append(second);

    const ambiguous = collectPreviewObservation(
      { identity, root },
      { target: { sourceFile: "demos/home/index.tsx", sourceLine: 12 } },
    );
    expect(ambiguous.targetResolution).toBe("ambiguous");
    expect(ambiguous.target).toBeUndefined();
    expect(ambiguous.targetCandidates).toHaveLength(2);
    expect(ambiguous.targetCandidates?.[0]?.nodeIdStability).toBe("unstable");
    expect(ambiguous.targetCandidates?.[0]?.domPath).toContain("preview-root");

    const resolved = collectPreviewObservation(
      { identity, root },
      { target: { sourceFile: "demos/home/index.tsx", sourceLine: 99 } },
    );
    expect(resolved.targetResolution).toBe("not-found");
    root.remove();
  });

  it("does not emit unsafe source-path candidates from DOM metadata", () => {
    const { root, hero } = setupRoot();
    hero.setAttribute("data-source-file", "./demos/home/index.tsx");
    hero.setAttribute("data-source-line", "12");

    const result = collectPreviewObservation(
      { identity, root },
      { target: { nodeId: "hero" } },
    );

    expect(result.target?.sourceCandidates).toEqual([]);
    root.remove();
  });

  it("does not observe a selected element outside the registered root", () => {
    const { root } = setupRoot();
    const outside = document.createElement("div");
    document.body.append(outside);
    const observed = collectPreviewObservation(
      { identity, root, selectedElement: outside },
      { target: { selectedElement: true } },
    );
    expect(observed.targetResolution).toBe("not-found");
    expect(observed.target).toBeUndefined();
    outside.remove();
    root.remove();
  });

  it("fails closed when the registered preview root has been unmounted", () => {
    const { root } = setupRoot();
    const registry = new PreviewObservationRegistry();
    registry.register({ identity, root });
    root.remove();

    expect(registry.observe()).toMatchObject({
      availability: "unavailable",
      reasons: ["preview-unmounted"],
    });
  });

  it("does not install malformed render identities", () => {
    const { root } = setupRoot();
    const registry = new PreviewObservationRegistry();
    registry.register({
      identity: { ...identity, revision: Number.NaN },
      root,
    });
    expect(registry.observe().availability).toBe("unavailable");
    root.remove();
  });

  it("omits form values and editable drafts from node facts", () => {
    const root = document.createElement("main");
    const input = document.createElement("input");
    input.dataset.owId = "secret-input";
    input.value = "do-not-export";
    const editable = document.createElement("div");
    editable.dataset.owId = "draft";
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "draft text";
    root.append(input, editable);
    document.body.append(root);

    const result = collectPreviewObservation(
      { identity, root },
      { target: { nodeId: "secret-input" } },
    );
    expect(result.target?.text).toBeUndefined();
    const editableResult = collectPreviewObservation(
      { identity, root },
      { target: { nodeId: "draft" } },
    );
    expect(editableResult.target?.text).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("do-not-export");
    root.remove();
  });

  it("reads a bounded canonical player probe only when media evidence is requested", () => {
    const { root, hero } = setupRoot();
    const probe = {
      kind: "spine" as const,
      ready: true,
      animationName: "idle",
      animationPlaying: true,
      loopEnabled: true,
      skeletonBounds: { x: 0, y: 0, width: 100, height: 100 },
      paintedBounds: { x: 400, y: 300, width: 200, height: 200 },
      sampledAt: 1,
      precision: "painted-bounds" as const,
    };
    Object.defineProperty(hero, "__workbenchPreviewProbe__", {
      configurable: true,
      value: { inspect: () => probe },
    });

    const summary = collectPreviewObservation({ identity, root });
    expect(summary.probe).toBeUndefined();
    const observed = collectPreviewObservation(
      { identity, root },
      {
        detail: "media",
        assertions: [
          { type: "animation-playing" },
          { type: "animation-name", value: "idle" },
          { type: "loop-enabled" },
        ],
      },
    );
    expect(observed.probe).toEqual(probe);
    expect(observed.capabilities).toEqual(
      expect.arrayContaining(["media-probe", "painted-bounds"]),
    );
    expect(observed.assertionStatus).toBe("passed");
    root.remove();
  });
});
