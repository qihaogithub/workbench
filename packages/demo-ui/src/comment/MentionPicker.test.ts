import { describe, expect, it } from "vitest";
import { detectActiveMention, filterMentionCandidates } from "./MentionPicker";

const candidates = [
  { id: "agent", name: "AI 助手", type: "agent" as const },
  { id: "u_1", name: "林外", type: "user" as const },
];

describe("comment mention detection", () => {
  it("allows @ immediately after normal text", () => {
    expect(detectActiveMention("换个颜色@AI", "换个颜色@AI".length)).toEqual({
      start: 4,
      query: "AI",
    });
  });

  it("stops mention detection at whitespace", () => {
    expect(detectActiveMention("换个颜色 @AI 后续", "换个颜色 @AI 后续".length)).toBeNull();
  });

  it("filters candidates case-insensitively and keeps the source order", () => {
    expect(filterMentionCandidates(candidates, "ai")).toEqual([candidates[0]]);
    expect(filterMentionCandidates(candidates, "")).toEqual(candidates);
  });
});
