import { describe, expect, it } from "vitest";

import { formatUploadedFilesForPrompt } from "../../src/backends/pi-agent";
import type { FileAttachment } from "../../src/core/types";

function makeFile(
  partial: Partial<FileAttachment> & { sha256?: string },
): FileAttachment & { sha256?: string } {
  return {
    id: partial.id || "id",
    name: partial.name || "file",
    mimeType: partial.mimeType || "text/plain",
    size: partial.size ?? 10,
    textExtracted: partial.textExtracted ?? true,
    ...partial,
  };
}

describe("上传附件 prompt 格式化", () => {
  it("无文件时返回空", () => {
    expect(formatUploadedFilesForPrompt(undefined)).toBe("");
    expect(formatUploadedFilesForPrompt([])).toBe("");
  });

  it("本轮上传与历史附件分组展示", () => {
    const current = makeFile({ id: "cur-1", name: "本轮.md" });
    const history = makeFile({ id: "hist-1", name: "历史.md" });
    const prompt = formatUploadedFilesForPrompt(
      [current, history],
      new Set(["cur-1"]),
    );

    expect(prompt).toContain("【本轮上传】");
    expect(prompt).toContain("本轮.md");
    expect(prompt).toContain("【历史附件】");
    expect(prompt).toContain("历史.md");
  });

  it("历史附件按内容去重，不重复列副本", () => {
    const dupHistory = [
      makeFile({ id: "h1", name: "方案.md", sha256: "sha-A" }),
      makeFile({ id: "h2", name: "方案.md", sha256: "sha-A" }),
      makeFile({ id: "h3", name: "方案.md", sha256: "sha-A" }),
    ];
    const prompt = formatUploadedFilesForPrompt(dupHistory, new Set());

    const occurrences = prompt.split("attachmentId: ").length - 1;
    expect(occurrences).toBe(1);
    expect(prompt.split("方案.md").length - 1).toBe(1);
  });

  it("多个不同历史附件去重后保留条目", () => {
    const history = [
      makeFile({ id: "h1", name: "a.md", sha256: "sha-A" }),
      makeFile({ id: "h2", name: "b.md", sha256: "sha-B" }),
      makeFile({ id: "h3", name: "a.md", sha256: "sha-A" }),
    ];
    const prompt = formatUploadedFilesForPrompt(history, new Set());
    expect(prompt.split("attachmentId: ").length - 1).toBe(2);
  });

  it("历史附件数量超上限时裁剪并提示", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      makeFile({ id: `h${i}`, name: `f${i}.md`, sha256: `sha-${i}` }),
    );
    const prompt = formatUploadedFilesForPrompt(many, new Set());
    expect(prompt.split("attachmentId: ").length - 1).toBe(20);
    expect(prompt).toContain("另有 5 个历史附件未展示");
  });

  it("添加「以本轮为准作答」指令", () => {
    const current = makeFile({ id: "cur-1", name: "本轮.md" });
    const prompt = formatUploadedFilesForPrompt([current], new Set(["cur-1"]));
    expect(prompt).toContain("以【本轮上传】为准作答");
  });
});