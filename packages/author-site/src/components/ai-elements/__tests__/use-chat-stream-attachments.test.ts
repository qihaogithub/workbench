import {
  buildAttachmentParts,
  buildLedgerAttachmentParts,
} from "@workbench/ai-chat-shared/chat/hooks/use-chat-stream";

describe("用户消息附件展示数据", () => {
  it("图片已有预览时，不重复生成图片文件卡片", () => {
    const parts = buildAttachmentParts(
      [{ data: "image-data", mimeType: "image/png", name: "banner.png" }],
      [
        {
          id: "image-file",
          name: "banner.png",
          size: 1024,
          mimeType: "image/png",
          textExtracted: false,
        },
        {
          id: "pdf-file",
          name: "requirements.pdf",
          size: 2048,
          mimeType: "application/pdf",
          textExtracted: true,
        },
      ],
    );

    expect(parts).toEqual([
      {
        type: "image",
        url: "data:image/png;base64,image-data",
      },
      {
        type: "file",
        name: "requirements.pdf",
        url: "",
        size: 2048,
        attachmentId: "pdf-file",
        mimeType: "application/pdf",
        textExtracted: true,
      },
    ]);
  });
});

describe("buildLedgerAttachmentParts", () => {
  it("stores only attachment metadata and never image data URLs", () => {
    const parts = buildLedgerAttachmentParts([
      {
        id: "image-attachment",
        name: "image.png",
        mimeType: "image/png",
        size: 128,
        textExtracted: false,
      },
      {
        id: "text-attachment",
        name: "notes.md",
        mimeType: "text/markdown",
        size: 64,
        textExtracted: true,
      },
    ]);

    expect(parts).toEqual([
      expect.objectContaining({
        type: "file",
        attachmentId: "image-attachment",
        mimeType: "image/png",
      }),
      expect.objectContaining({
        type: "file",
        attachmentId: "text-attachment",
        mimeType: "text/markdown",
      }),
    ]);
    expect(JSON.stringify(parts)).not.toContain("data:");
  });
});
