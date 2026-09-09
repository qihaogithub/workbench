import { describe, expect, it } from "vitest";

import { formatAuthorityCommitSummary } from "../../src/backends/pi-tools/authority-result-summary";

describe("formatAuthorityCommitSummary", () => {
  it("只为 committed receipt 生成简短的模型可见提交状态", () => {
    expect(
      formatAuthorityCommitSummary({ committed: true, revision: 12, rootHash: "root" }, { ok: true }),
    ).toBe(
      "\nAuthority committed: revision=12; runtimeValidation=ok; previewProjection=not_verified.",
    );
  });

  it("区分验证失败和不适用，并拒绝伪造或缺失回执", () => {
    expect(
      formatAuthorityCommitSummary({ committed: true, revision: 13, rootHash: "root" }, { ok: false }),
    ).toContain("runtimeValidation=failed");
    expect(formatAuthorityCommitSummary({ committed: true, revision: 14, rootHash: "root" })).toContain(
      "runtimeValidation=not_applicable",
    );
    expect(formatAuthorityCommitSummary(null)).toBe("");
    expect(formatAuthorityCommitSummary({ committed: false, revision: 15 })).toBe("");
    expect(formatAuthorityCommitSummary({ committed: true, revision: "15" })).toBe("");
    expect(formatAuthorityCommitSummary({ committed: true, revision: 15, rootHash: "" })).toBe("");
  });
});
