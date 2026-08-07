import fs from "fs";
import os from "os";
import path from "path";

import { beforeEach, afterEach, describe, expect, it } from "@jest/globals";

type AttachmentModule = typeof import("../ai-attachments");

describe("聊天附件读取（.ai-attachments）", () => {
  let dataDir: string;
  let mod: AttachmentModule;
  const previousDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "author-attachment-"));
    process.env.DATA_DIR = dataDir;
    mod = await import("../ai-attachments");
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
  });

  function writeAttachment(
    projectId: string,
    attachmentId: string,
    meta: Record<string, unknown>,
    text: string,
  ): void {
    const dir = path.join(
      dataDir,
      "projects",
      projectId,
      ".ai-attachments",
      attachmentId,
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ id: attachmentId, ...meta }),
      "utf-8",
    );
    fs.writeFileSync(path.join(dir, "text.txt"), text, "utf-8");
    if (meta.storedFilename) {
      fs.writeFileSync(path.join(dir, meta.storedFilename as string), text, "utf-8");
    }
  }

  it("列出并读取项目聊天附件", () => {
    writeAttachment(
      "proj-1",
      "att-1",
      { name: "方案.md", size: 6, mimeType: "text/markdown" },
      "方案正文",
    );

    const list = mod.listChatAttachments("proj-1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "att-1", name: "方案.md" });

    const content = mod.readChatAttachment("proj-1", "att-1");
    expect(content?.text).toBe("方案正文");
    expect(content?.metadata.name).toBe("方案.md");
  });

  it("附件目录不存在时返回空列表", () => {
    expect(mod.listChatAttachments("no-such-project")).toEqual([]);
    expect(mod.readChatAttachment("no-such-project", "att-x")).toBeNull();
  });

  it("删除聊天附件后会移除目录", () => {
    writeAttachment("proj-1", "att-1", { name: "a.md" }, "text");
    expect(mod.deleteChatAttachment("proj-1", "att-1")).toBe(true);
    expect(mod.listChatAttachments("proj-1")).toEqual([]);
    expect(mod.deleteChatAttachment("proj-1", "att-1")).toBe(false);
  });

  it("批量删除聊天附件", () => {
    writeAttachment("proj-1", "att-1", { name: "a.md" }, "text");
    writeAttachment("proj-1", "att-2", { name: "b.md" }, "text");
    writeAttachment("proj-1", "att-3", { name: "c.md" }, "text");
    const deleted = mod.deleteChatAttachments("proj-1", ["att-1", "att-3"]);
    expect(deleted).toBe(2);
    expect(mod.listChatAttachments("proj-1").map((a) => a.id)).toEqual([
      "att-2",
    ]);
  });

  it("读取图片附件原始文件", () => {
    writeAttachment(
      "proj-1",
      "img-1",
      {
        name: "photo.png",
        storedFilename: "photo.png",
        mimeType: "image/png",
        size: 4,
      },
      "PNG",
    );
    const file = mod.readChatAttachmentFile("proj-1", "img-1");
    expect(file).not.toBeNull();
    expect(file?.buffer.toString("utf-8")).toBe("PNG");
    expect(file?.mimeType).toBe("image/png");
    expect(mod.readChatAttachmentFile("proj-1", "missing")).toBeNull();
  });
});