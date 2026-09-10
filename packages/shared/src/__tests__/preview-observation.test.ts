import { describe, expect, it } from "vitest";

import {
  PREVIEW_OBSERVATION_LIMITS,
  evaluatePreviewAssertions,
  createPreviewObservationResult,
  isPreviewObservationFacts,
  isPreviewObservationInput,
  isPreviewObservationPayloadWithinLimit,
  isPreviewObservationResult,
  isPreviewRenderIdentity,
  sanitizePreviewUrl,
  summarizePreviewAssertionStatus,
  type PreviewObservationFacts,
} from "../demo/preview-observation";

const identity = {
  schemaVersion: 1 as const,
  projectId: "project-1",
  workspaceId: "workspace-1",
  pageId: "page-1",
  runtimeType: "prototype-html-css" as const,
  surface: "active-single-page" as const,
  previewInstanceId: "preview-1",
  renderGeneration: 2,
  revision: 7,
};

const facts: PreviewObservationFacts = {
  identity,
  capabilities: [
    "page-summary",
    "target-node",
    "layout",
    "runtime",
    "media-probe",
    "painted-bounds",
    "assertions",
  ],
  viewport: {
    width: 1000,
    height: 800,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 0,
  },
  document: {
    clientWidth: 1000,
    clientHeight: 800,
    scrollWidth: 1000,
    scrollHeight: 800,
    horizontalOverflow: false,
    verticalOverflow: false,
  },
  runtime: {
    readyState: "complete",
    runtimeErrorCount: 0,
    consoleErrorCount: 0,
  },
  targetResolution: "resolved",
  target: {
    nodeId: "hero",
    nodeIdStability: "stable",
    rect: { x: 400, y: 300, width: 200, height: 200 },
    parentRect: { x: 0, y: 0, width: 1000, height: 800 },
    style: { display: "block", visibility: "visible", opacity: 1 },
    text: "Hello world",
  },
  probe: {
    kind: "spine",
    ready: true,
    animationName: "idle",
    animationPlaying: true,
    loopEnabled: true,
    trackTime: 0.25,
    duration: 1,
    skeletonBounds: { x: 0, y: 0, width: 100, height: 100 },
    paintedBounds: { x: 400, y: 300, width: 200, height: 200 },
    camera: {
      x: 50,
      y: 50,
      zoom: 1,
      viewportWidth: 100,
      viewportHeight: 100,
    },
    canvas: {
      cssWidth: 200,
      cssHeight: 200,
      backingWidth: 400,
      backingHeight: 400,
    },
    sampledAt: 123,
    precision: "painted-bounds",
  },
};

describe("preview observation contract", () => {
  it("rejects malformed identity and non-finite rectangles", () => {
    expect(isPreviewRenderIdentity(identity)).toBe(true);
    expect(isPreviewRenderIdentity({ ...identity, revision: Number.NaN })).toBe(
      false,
    );
    expect(isPreviewRenderIdentity({ ...identity, surface: "canvas" })).toBe(
      false,
    );
    expect(isPreviewRenderIdentity({ ...identity, pageId: ".." })).toBe(false);
    expect(
      isPreviewRenderIdentity({ ...identity, pageId: "broken\ud800" }),
    ).toBe(false);
  });

  it("accepts only one bounded declarative target", () => {
    expect(isPreviewObservationInput({ target: { nodeId: "hero" } })).toBe(
      true,
    );
    expect(
      isPreviewObservationInput({ target: { nodeId: "hero", selector: ".x" } }),
    ).toBe(false);
    expect(
      isPreviewObservationInput({
        target: { nodeId: "hero", selectedElement: true },
      }),
    ).toBe(false);
    expect(
      isPreviewObservationInput({
        assertions: [
          { type: "centered", tolerancePx: Number.POSITIVE_INFINITY },
        ],
      }),
    ).toBe(false);
    expect(
      isPreviewObservationInput({
        target: { sourceFile: "demos\\home\\index.tsx" },
      }),
    ).toBe(false);
    expect(isPreviewObservationInput({ pageId: ".." })).toBe(false);
    expect(
      isPreviewObservationInput({
        target: { sourceFile: "demos/./home/index.tsx" },
      }),
    ).toBe(false);
    expect(
      isPreviewObservationInput({
        assertions: [{ type: "text-contains", value: "line\nfeed" }],
      }),
    ).toBe(false);
    expect(
      isPreviewObservationInput({
        assertions: [{ type: "exists", selector: ".x" }],
      }),
    ).toBe(false);
    expect(
      isPreviewObservationInput({
        timeoutMs: PREVIEW_OBSERVATION_LIMITS.maxTimeoutMs + 1,
      }),
    ).toBe(false);
  });

  it("sanitizes URLs to origin/path and an opaque query hash", () => {
    const result = sanitizePreviewUrl("https://example.com/a?token=secret");
    expect(result).toMatchObject({ origin: "https://example.com", path: "/a" });
    expect(result?.queryHash).toBeDefined();
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(sanitizePreviewUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("evaluates layout/runtime assertions without executing page code", () => {
    const results = evaluatePreviewAssertions(facts, [
      { id: "center", type: "centered", tolerancePx: 0 },
      { id: "text", type: "text-contains", value: "world" },
      { id: "ready", type: "runtime-ready" },
      { id: "errors", type: "no-runtime-errors" },
      { id: "overflow", type: "no-horizontal-overflow" },
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(summarizePreviewAssertionStatus(results)).toBe("passed");
  });

  it("evaluates Spine media and painted-bounds assertions with explicit precision", () => {
    const results = evaluatePreviewAssertions(facts, [
      { type: "animation-playing" },
      { type: "animation-name", value: "idle" },
      { type: "loop-enabled" },
      { type: "painted-bounds-centered", tolerancePx: 0 },
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(results[3]?.evidence).toMatchObject({
      precision: "painted-bounds",
      capability: "painted-bounds",
      containerRect: {
        x: 0,
        y: 0,
        width: facts.viewport.width,
        height: facts.viewport.height,
      },
      paintedBounds: facts.probe?.paintedBounds,
      skeletonBounds: facts.probe?.skeletonBounds,
    });
    expect(
      evaluatePreviewAssertions({ ...facts, probe: undefined }, [
        { type: "animation-playing" },
        { type: "painted-bounds-centered" },
      ]).map((result) => result.status),
    ).toEqual(["unsupported", "unsupported"]);
    expect(
      evaluatePreviewAssertions(
        {
          ...facts,
          capabilities: facts.capabilities.filter(
            (capability) => capability !== "painted-bounds",
          ),
        },
        [{ type: "painted-bounds-centered" }],
      )[0]?.status,
    ).toBe("unsupported");
    expect(
      evaluatePreviewAssertions(
        {
          ...facts,
          probe: { ...facts.probe!, precision: "runtime-self-reported" },
        },
        [{ type: "painted-bounds-centered" }],
      )[0]?.status,
    ).toBe("unsupported");
  });

  it("builds an E1 result with explicit readiness and assertion status", () => {
    const result = createPreviewObservationResult(facts, [{ type: "exists" }]);
    expect(result).toMatchObject({
      availability: "observed",
      readiness: "ready",
      assertionStatus: "passed",
      evidence: { kind: "runtime-structure", precision: "layout" },
    });
    expect(result.observedAt).toEqual(expect.any(Number));
    expect(isPreviewObservationResult(result)).toBe(true);
    expect(
      isPreviewObservationResult({
        ...result,
        assertions: [],
        assertionStatus: "passed",
      }),
    ).toBe(false);
    expect(
      isPreviewObservationResult({
        ...result,
        availability: "observed",
        identity: undefined,
      }),
    ).toBe(false);
  });

  it("rejects unsafe source candidates in facts returned by a runtime", () => {
    expect(
      isPreviewObservationFacts({
        ...facts,
        target: {
          ...facts.target!,
          sourceCandidates: [{ file: "demos/../secret.tsx", line: 1 }],
        },
      }),
    ).toBe(false);
  });

  it("keeps missing targets uncertain and failed assertions distinct", () => {
    const noTarget = evaluatePreviewAssertions(
      { ...facts, target: undefined },
      [{ type: "visible" }],
    );
    expect(noTarget[0]?.status).toBe("uncertain");
    const missing = evaluatePreviewAssertions(
      { ...facts, target: undefined, targetResolution: "not-found" },
      [{ type: "exists" }],
    );
    expect(missing[0]?.status).toBe("failed");
    const failed = evaluatePreviewAssertions(
      { ...facts, document: { ...facts.document, horizontalOverflow: true } },
      [{ type: "no-horizontal-overflow" }],
    );
    expect(failed[0]?.status).toBe("failed");
    expect(summarizePreviewAssertionStatus(failed)).toBe("failed");
    const unsupported = evaluatePreviewAssertions(
      { ...facts, target: undefined, targetResolution: "unsupported" },
      [{ type: "exists" }],
    );
    expect(unsupported[0]?.status).toBe("unsupported");
  });

  it("covers browser layout edge facts without treating CSS transforms as text", () => {
    const transformed = {
      ...facts,
      viewport: { ...facts.viewport, scrollX: 120, scrollY: 240 },
      target: {
        ...facts.target!,
        rect: { x: 120, y: 240, width: 200, height: 200 },
        style: {
          ...facts.target!.style,
          transform: "matrix(1, 0, 0, 1, 120, 240)",
        },
      },
    };
    expect(
      evaluatePreviewAssertions(transformed, [
        { type: "centered", tolerancePx: 500 },
      ])[0]?.status,
    ).toBe("passed");

    const zeroSized = evaluatePreviewAssertions(
      {
        ...facts,
        target: {
          ...facts.target!,
          rect: { ...facts.target!.rect, width: 0, height: 0 },
        },
      },
      [{ type: "visible" }],
    );
    expect(zeroSized[0]?.status).toBe("failed");

    for (const style of [
      { display: "none" },
      { visibility: "hidden" },
      { opacity: 0 },
    ]) {
      expect(
        evaluatePreviewAssertions(
          { ...facts, target: { ...facts.target!, style } },
          [{ type: "visible" }],
        )[0]?.status,
      ).toBe("failed");
    }

    const imageFacts = {
      ...facts,
      target: {
        ...facts.target!,
        image: {
          complete: true,
          naturalWidth: 0,
          naturalHeight: 0,
          failed: true,
        },
      },
    };
    expect(
      evaluatePreviewAssertions(imageFacts, [{ type: "image-loaded" }])[0]
        ?.status,
    ).toBe("failed");
  });

  it("enforces serialized payload bounds", () => {
    expect(isPreviewObservationPayloadWithinLimit({ ok: true }, 64)).toBe(true);
    expect(
      isPreviewObservationPayloadWithinLimit({ value: "x".repeat(65) }, 64),
    ).toBe(false);
    expect(isPreviewObservationPayloadWithinLimit({ value: "界" }, 12)).toBe(
      false,
    );
  });

  it("fails closed for oversized text and non-finite node facts", () => {
    expect(isPreviewObservationFacts(facts)).toBe(true);
    expect(
      isPreviewObservationFacts({
        ...facts,
        target: {
          ...facts.target,
          text: "x".repeat(PREVIEW_OBSERVATION_LIMITS.maxTextLength + 1),
        },
      }),
    ).toBe(false);
    expect(
      isPreviewObservationFacts({
        ...facts,
        target: {
          ...facts.target,
          rect: { ...facts.target!.rect, width: Number.POSITIVE_INFINITY },
        },
      }),
    ).toBe(false);
    expect(
      isPreviewObservationFacts({
        ...facts,
        target: { ...facts.target, text: "line\u0000break" },
      }),
    ).toBe(false);
  });
});
