import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AttachmentUploadError,
  saveUploadedFileAttachment,
} from "../../src/utils/save-uploaded-file-attachment";
import { readUploadedFileAttachment } from "../../src/utils/uploaded-file-attachments";

describe("AI 附件上传", () => {
  let dataDir: string;
  const previousDataDir = process.env.DATA_DIR;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneflow-ai-attachment-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
  });

  it("按 Agent 会话保存文本附件并可由只读工具链读取", async () => {
    const saved = await saveUploadedFileAttachment({
      sessionId: "viewer-project-1",
      filename: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("第一行\n第二行"),
    });

    const loaded = await readUploadedFileAttachment(
      "viewer-project-1",
      saved.id,
    );
    expect(saved).toMatchObject({
      name: "notes.md",
      textExtracted: true,
      lineCount: 2,
    });
    expect(loaded.text).toBe("第一行\n第二行");
  });

  it("拒绝不支持的格式和非法会话 ID", async () => {
    await expect(
      saveUploadedFileAttachment({
        sessionId: "viewer-project-1",
        filename: "video.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("video"),
      }),
    ).rejects.toMatchObject<Partial<AttachmentUploadError>>({
      code: "INVALID_FILE_TYPE",
      status: 400,
    });
    await expect(
      saveUploadedFileAttachment({
        sessionId: "../escape",
        filename: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("unsafe"),
      }),
    ).rejects.toMatchObject<Partial<AttachmentUploadError>>({
      code: "INVALID_SESSION_ID",
      status: 400,
    });
  });
});
