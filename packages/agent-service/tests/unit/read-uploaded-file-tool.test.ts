import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createReadUploadedFileTool } from "../../src/backends/pi-tools/read-uploaded-file-tool";
import { listUploadedFileAttachments } from "../../src/utils/uploaded-file-attachments";

describe("readUploadedFile tool", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-agent-uploaded-file-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  function writeAttachment(
    sessionId: string,
    attachmentId: string,
    options: {
      textExtracted?: boolean;
      text?: string;
      name?: string;
      mimeType?: string;
    } = {},
  ): void {
    const text = options.text ?? "one\ntwo\nthree";
    const dir = path.join(dataDir, "ai-attachments", sessionId, attachmentId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        id: attachmentId,
        name: options.name ?? "brief.md",
        mimeType: options.mimeType ?? "text/markdown",
        size: 32,
        textExtracted: options.textExtracted ?? true,
        lineCount: text.length > 0 ? text.split("\n").length : 0,
      }),
      "utf-8",
    );
    fs.writeFileSync(path.join(dir, "text.txt"), text, "utf-8");
  }

  it("按 attachmentId 读取当前会话上传文件文本", async () => {
    writeAttachment("session-a", "att-1");
    const tool = createReadUploadedFileTool({ sessionId: "session-a" });

    const result = await tool.execute("tool-1", {
      attachmentId: "att-1",
      startLine: 2,
      endLine: 3,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("Uploaded file: brief.md");
    expect(result.content[0].text).toContain("2->two");
    expect(result.content[0].text).toContain("3->three");
  });

  it("列出当前会话已上传文件 manifest", async () => {
    writeAttachment("session-a", "att-1", { name: "first.md" });
    writeAttachment("session-a", "att-2", { name: "second.csv" });

    const attachments = await listUploadedFileAttachments("session-a");

    expect(attachments.map((attachment) => attachment.id)).toEqual([
      "att-1",
      "att-2",
    ]);
    expect(attachments[0].name).toBe("first.md");
    expect(attachments[1].name).toBe("second.csv");
  });

  it("未设置 DATA_DIR 时从 package 子目录定位到 monorepo 根数据目录", async () => {
    delete process.env.DATA_DIR;
    const originalCwd = process.cwd();
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-agent-monorepo-"));
    const packageDir = path.join(repoDir, "packages", "agent-service");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    fs.writeFileSync(path.join(packageDir, "package.json"), "{}\n");
    const attachmentDir = path.join(
      repoDir,
      "data",
      "ai-attachments",
      "session-a",
      "att-1",
    );
    fs.mkdirSync(attachmentDir, { recursive: true });
    fs.writeFileSync(
      path.join(attachmentDir, "manifest.json"),
      JSON.stringify({
        id: "att-1",
        name: "brief.md",
        mimeType: "text/markdown",
        size: 32,
        textExtracted: true,
        lineCount: 1,
      }),
      "utf-8",
    );
    fs.writeFileSync(path.join(attachmentDir, "text.txt"), "root data", "utf-8");

    try {
      process.chdir(packageDir);
      const tool = createReadUploadedFileTool({ sessionId: "session-a" });

      const result = await tool.execute("tool-1", {
        attachmentId: "att-1",
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain("root data");
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("返回无可提取文本的附件错误", async () => {
    writeAttachment("session-a", "att-1", {
      name: "scan.pdf",
      mimeType: "application/pdf",
      textExtracted: false,
      text: "",
    });
    const tool = createReadUploadedFileTool({ sessionId: "session-a" });

    const result = await tool.execute("tool-1", {
      attachmentId: "att-1",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("does not have extractable text");
  });

  it("拒绝非法 attachmentId 路径", async () => {
    const tool = createReadUploadedFileTool({ sessionId: "session-a" });

    const result = await tool.execute("tool-1", {
      attachmentId: "../att-1",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error reading uploaded file");
  });
});
