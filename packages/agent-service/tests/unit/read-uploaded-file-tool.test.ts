import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createReadUploadedFileTool } from "../../src/backends/pi-tools/read-uploaded-file-tool";

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
