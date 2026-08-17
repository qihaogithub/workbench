import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/PageRequirements.tsx", "utf8");
const styles = readFileSync("src/page-requirements.css", "utf8");

describe("PageRequirements reading layout", () => {
  it("uses the shared desktop Markdown reading scale instead of compact UI text", () => {
    expect(component).not.toContain("page-requirements-content text-xs");
    expect(styles).toMatch(
      /\.page-requirements-content\s*\{[^}]*font-size:\s*15px;[^}]*line-height:\s*1\.75;/s,
    );
  });

  it("constrains standalone Markdown to a comfortable reading column", () => {
    expect(styles).toMatch(
      /\.page-requirements-content\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*760px;[^}]*margin-inline:\s*auto;/s,
    );
  });
});
