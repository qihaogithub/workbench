import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { analyzeHtmlImportSpike } from "../html-import-analysis-spike";
import {
  HTML_IMPORT_ANALYSIS_VERSION,
  HTML_IMPORT_SANDBOX_POLICY_VERSION,
  hashHtmlImportSource,
} from "../html-import-contract";

interface Fixture {
  id: string;
  source: string;
  status: "accepted" | "rejected";
  runtimeType?: "prototype-html-css" | "sandboxed-html";
  signals: string[];
  unsupported: string[];
}

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/html-import-analysis.json", import.meta.url), "utf8")) as Fixture[];

describe("Phase 0 HTML import contract spike", () => {
  it("freezes analysis and sandbox policy versions", () => {
    expect(HTML_IMPORT_ANALYSIS_VERSION).toBe(1);
    expect(HTML_IMPORT_SANDBOX_POLICY_VERSION).toBe(1);
  });

  it("hashes exact UTF-8 analyzer input without implicit normalization", () => {
    expect(hashHtmlImportSource("a\r\n")).toBe("8e4621379786ef42a4fec155cd525c291dd7db3c1fde3478522f4f61c03fd1bd");
    expect(hashHtmlImportSource("a\r\n")).not.toBe(hashHtmlImportSource("a\n"));
  });

  for (const fixture of fixtures) {
    it(`classifies ${fixture.id}`, () => {
      const first = analyzeHtmlImportSpike(fixture.source);
      const second = analyzeHtmlImportSpike(fixture.source);
      expect(first).toEqual(second);
      expect(first.analysis.outcome.status).toBe(fixture.status);
      if (first.analysis.outcome.status === "accepted") {
        expect(first.analysis.outcome.runtimeType).toBe(fixture.runtimeType);
      }
      expect(first.analysis.signals.map((item) => item.code)).toEqual(fixture.signals.slice().sort());
      expect(first.analysis.unsupportedCapabilities.map((item) => item.code)).toEqual(fixture.unsupported.slice().sort());
      expect(first.analysis.sourceHash).toMatch(/^[a-f\d]{64}$/);
      expect(first.normalizedHash).toMatch(/^[a-f\d]{64}$/);
    });
  }

  it("normalizes attribute order without changing structural classification", () => {
    const first = analyzeHtmlImportSpike("<button id='x' onclick='go()' class='a'>Go</button>").analysis;
    const second = analyzeHtmlImportSpike("<button class='a' ONCLICK='go()' id='x'>Go</button>").analysis;
    expect(first.outcome).toEqual(second.outcome);
    expect(first.signals.map(({ code }) => code)).toEqual(second.signals.map(({ code }) => code));
  });
});
