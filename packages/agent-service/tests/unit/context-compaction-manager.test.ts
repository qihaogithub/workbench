import { describe, expect, it } from "vitest";
import {
  decideContextCompaction,
  estimatePendingPromptTokens,
} from "../../src/backends/managers/context-compaction-manager";

describe("context compaction decision", () => {
  it("uses response, summary, and safety budgets before the provider limit", () => {
    const decision = decideContextCompaction(103_423, {
      contextWindow: 128_000,
      maxTokens: 4_096,
    });

    expect(decision.thresholdTokens).toBe(103_424);
    expect(decision.shouldCompact).toBe(false);
    expect(
      decideContextCompaction(103_424, {
        contextWindow: 128_000,
        maxTokens: 4_096,
      }).shouldCompact,
    ).toBe(true);
  });

  it("honors a smaller configured model context window", () => {
    const decision = decideContextCompaction(45_000, {
      contextWindow: 64_000,
      maxTokens: 8_192,
    });

    expect(decision.thresholdTokens).toBe(35_328);
    expect(decision.shouldCompact).toBe(true);
  });

  it("uses compatible defaults for missing or invalid capacity metadata", () => {
    const decision = decideContextCompaction(1, {
      contextWindow: 0,
      maxTokens: -1,
    });

    expect(decision.contextWindow).toBe(128_000);
    expect(decision.maxTokens).toBe(4_096);
  });

  it("estimates pending text and image inputs conservatively", () => {
    expect(estimatePendingPromptTokens("12345", 2)).toBe(2_402);
  });
});
