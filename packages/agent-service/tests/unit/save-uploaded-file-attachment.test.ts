import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AttachmentUploadError,
  saveUploadedFileAttachment,
  readUploadedFileAttachment,
} from "../../src/utils/uploaded-file-attachments";

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

  it("按项目 ID 保存文本附件并可由只读工具链读取", async () => {
    const saved = await saveUploadedFileAttachment({
      projectId: "proj-test-1",
      filename: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("第一行\n第二行"),
    });

    const loaded = await readUploadedFileAttachment(
      "proj-test-1",
      saved.id,
    );
    expect(saved).toMatchObject({
      name: "notes.md",
      textExtracted: true,
      lineCount: 2,
    });
    expect(loaded.text).toBe("第一行\n第二行");

    const dirPath = path.join(
      dataDir,
      "projects",
      "proj-test-1",
      ".ai-attachments",
      saved.id,
    );
    expect(fs.existsSync(dirPath)).toBe(true);
  });

  it("拒绝不支持的格式和非法项目 ID", async () => {
    await expect(
      saveUploadedFileAttachment({
        projectId: "proj-test-1",
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
        projectId: "../escape",
        filename: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("unsafe"),
      }),
    ).rejects.toMatchObject<Partial<AttachmentUploadError>>({
      code: "INVALID_PROJECT_ID",
      status: 400,
    });
  });

  it("支持保存图片附件（无文本提取，保留原始文件）", async () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const saved = await saveUploadedFileAttachment({
      projectId: "proj-test-1",
      filename: "photo.png",
      mimeType: "image/png",
      buffer,
    });
    expect(saved).toMatchObject({
      name: "photo.png",
      mimeType: "image/png",
      textExtracted: false,
    });
    const loaded = await readUploadedFileAttachment("proj-test-1", saved.id);
    expect(loaded.text).toBe("");
  });

  it("相同内容重复上传时复用既有 attachmentId，不新建副本", async () => {
    const buffer = Buffer.from("重复内容\n第二行");
    const first = await saveUploadedFileAttachment({
      projectId: "proj-test-1",
      filename: "a.md",
      mimeType: "text/markdown",
      buffer,
    });
    const second = await saveUploadedFileAttachment({
      projectId: "proj-test-1",
      filename: "b.md",
      mimeType: "text/markdown",
      buffer,
    });

    expect(second.id).toBe(first.id);

    const attachmentsDir = path.join(
      dataDir,
      "projects",
      "proj-test-1",
      ".ai-attachments",
    );
    const dirs = fs.readdirSync(attachmentsDir).filter((name) =>
      fs.statSync(path.join(attachmentsDir, name)).isDirectory(),
    );
    expect(dirs).toEqual([first.id]);
  });

  it("不同内容上传生成不同 attachmentId", async () => {
    const a = await saveUploadedFileAttachment({
      projectId: "proj-test-1",
      filename: "a.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("内容 A"),
    });
    const b = await saveUploadedFileAttachment({
      projectId: "proj-test-1",
      filename: "b.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("内容 B"),
    });
    expect(b.id).not.toBe(a.id);
  });
});
