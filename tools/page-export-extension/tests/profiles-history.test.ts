import { describe, expect, it } from "vitest";
import { appendHistory, removeHistoryEntry, sanitizeHistoryEntry } from "../src/shared/history.js";
import { CAPTURE_PROFILES, DEFAULT_CAPTURE_PROFILE_ID, exactOrigin, getCaptureProfile, removeSiteRule, upsertSiteRule } from "../src/shared/profiles.js";

describe("capture profiles", () => {
  it("provides a faithful default and compact review profile with SingleFile camelCase options", () => {
    expect(DEFAULT_CAPTURE_PROFILE_ID).toBe("editable-fidelity");
    expect(CAPTURE_PROFILES.map((profile) => profile.id)).toEqual(["editable-fidelity", "compact-review"]);
    expect(getCaptureProfile(undefined).options.removeHiddenElements).toBe(false);
    expect(getCaptureProfile("compact-review").options.removeUnusedStyles).toBe(true);
  });

  it("normalizes exact-origin site rules and keeps invalid rules out", () => {
    expect(exactOrigin("https://example.test/path?q=1")).toBe("https://example.test");
    expect(exactOrigin("chrome://settings")).toBeUndefined();
    const first = upsertSiteRule([], { origin: "https://example.test/path", profileId: "compact-review", updatedAt: "1" });
    expect(first).toEqual([{ origin: "https://example.test", profileId: "compact-review", updatedAt: "1" }]);
    expect(upsertSiteRule(first, { origin: "https://example.test/other", profileId: "editable-fidelity", updatedAt: "2" })[0]?.profileId).toBe("editable-fidelity");
    expect(removeSiteRule(first, "https://example.test/page")).toEqual([]);
  });
});

describe("capture history", () => {
  const entry = { captureId: "c1", url: "https://example.test", routeKey: "/", time: "2026-08-20T00:00:00.000Z", filename: "a.zip", status: "ready" as const };

  it("stores only review metadata and deduplicates newest entries", () => {
    const sanitized = sanitizeHistoryEntry({ ...entry, cookie: "secret", html: "secret" } as unknown as typeof entry);
    expect(sanitized).toEqual(entry);
    expect(appendHistory([entry], { ...entry, filename: "b.zip" })).toEqual([{ ...entry, filename: "b.zip" }]);
  });

  it("removes one entry and caps list size", () => {
    const entries = Array.from({ length: 3 }, (_, index) => ({ ...entry, captureId: `c${index}` }));
    expect(removeHistoryEntry(entries, "c1").map((item) => item.captureId)).toEqual(["c0", "c2"]);
    expect(appendHistory(entries, { ...entry, captureId: "new" }, 2)).toHaveLength(2);
  });
});
