import { describe, expect, it } from "vitest";

import {
  createPreviewObservationResult,
  isPreviewObservationFacts,
  isPreviewObservationResult,
  type PreviewAssertion,
  type PreviewObservationFacts,
  type PreviewObservationResult,
} from "../demo/preview-observation";
import centeredFixture from "./fixtures/preview-observation/centered.json";
import imageFailureFixture from "./fixtures/preview-observation/image-failure.json";
import oldRevisionFixture from "./fixtures/preview-observation/old-revision.json";
import overflowFixture from "./fixtures/preview-observation/overflow.json";
import spineFixture from "./fixtures/preview-observation/spine.json";

type ReplayFixture = {
  facts: PreviewObservationFacts;
  assertions: PreviewAssertion[];
  expectedStatuses: Array<"passed" | "failed" | "uncertain" | "unsupported">;
  expectedAssertionStatus:
    | "not-requested"
    | "passed"
    | "failed"
    | "uncertain"
    | "unsupported";
  currentRevision?: number;
};

const fixtures: Record<string, ReplayFixture> = {
  centered: centeredFixture as ReplayFixture,
  overflow: overflowFixture as ReplayFixture,
  imageFailure: imageFailureFixture as ReplayFixture,
  spine: spineFixture as ReplayFixture,
  oldRevision: oldRevisionFixture as ReplayFixture,
};

function replayFixture(fixture: ReplayFixture): {
  result: PreviewObservationResult;
  freshness: "current" | "stale";
} {
  const result = createPreviewObservationResult(fixture.facts, fixture.assertions);
  const freshness =
    fixture.currentRevision === undefined ||
    fixture.currentRevision === fixture.facts.identity.revision
      ? "current"
      : "stale";
  return { result, freshness };
}

describe("preview observation persistent facts replay", () => {
  it.each(Object.entries(fixtures))(
    "replays the %s fixture through the shared evaluator",
    (_name, fixture) => {
      expect(isPreviewObservationFacts(fixture.facts)).toBe(true);

      const { result } = replayFixture(fixture);
      expect(isPreviewObservationResult(result)).toBe(true);
      expect(result.assertions.map((assertion) => assertion.status)).toEqual(
        fixture.expectedStatuses,
      );
      expect(result.assertionStatus).toBe(fixture.expectedAssertionStatus);
    },
  );

  it("keeps an old revision's facts explicitly stale during replay", () => {
    const { result, freshness } = replayFixture(fixtures.oldRevision);

    expect(freshness).toBe("stale");
    expect(result.identity?.revision).toBe(41);
    expect(fixtures.oldRevision.currentRevision).toBe(42);
    expect(result.assertionStatus).toBe("passed");
  });

  it("does not persist user-authored text or credential-like fields in fixtures", () => {
    const serialized = JSON.stringify(fixtures);
    expect(serialized).not.toMatch(/password|token|secret|contenteditable/i);
    expect(Object.values(fixtures).every((fixture) => fixture.facts.target?.text === undefined)).toBe(
      true,
    );
  });
});
