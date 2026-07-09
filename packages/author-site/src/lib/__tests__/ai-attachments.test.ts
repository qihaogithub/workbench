import fs from "fs";
import os from "os";
import path from "path";

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({ text: "PDF attachment content" }),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("mammoth", () => ({
  extractRawText: jest.fn().mockResolvedValue({
    value: "Docx attachment content",
  }),
}));

describe("ai attachments", () => {
  let dataDir: string;

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-ai-attachments-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  function createMockFile(
    name: string,
    type: string,
    buffer: Buffer,
  ): File {
    return {
      name,
      type,
      size: buffer.length,
      arrayBuffer: async () =>
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
    } as File;
  }

  function readExtractedText(sessionId: string, attachmentId: string): string {
    return fs.readFileSync(
      path.join(
        dataDir,
        "ai-attachments",
        sessionId,
        attachmentId,
        "text.txt",
      ),
      "utf-8",
    );
  }

  const textCases = [
    ["brief.txt", "text/plain", "Plain text attachment"],
    ["brief.md", "text/markdown", "# Brief\nMarkdown attachment"],
    ["data.json", "application/json", "{\"title\":\"JSON attachment\"}"],
    ["table.csv", "text/csv", "name,value\nCSV attachment,1"],
    ["page.HTML", "text/html", "<main>HTML attachment</main>"],
    ["component.tsx", "text/typescript", "export const label = 'Code attachment';"],
  ];

  it.each(textCases)(
    "保存并提取文本类附件 %s",
    async (filename, mimeType, content) => {
      const { saveAiAttachment } = await import("@/lib/ai-attachments");
      const buffer = Buffer.from(content, "utf-8");
      const file = createMockFile(filename, mimeType, buffer);

      const attachment = await saveAiAttachment("agent-session-1", file);

      expect(attachment).toMatchObject({
        name: filename,
        mimeType,
        size: file.size,
        textExtracted: true,
      });
      expect(attachment.textPreview).toContain(content.split("\n")[0].slice(0, 20));
      expect(readExtractedText("agent-session-1", attachment.id)).toContain(
        content.split("\n")[0],
      );
    },
  );

  it("保存 Markdown 附件并返回行数", async () => {
    const { saveAiAttachment } = await import("@/lib/ai-attachments");
    const buffer = Buffer.from("# Brief\nHello attachment", "utf-8");
    const file = createMockFile("brief.md", "text/markdown", buffer);

    const attachment = await saveAiAttachment("agent-session-1", file);

    expect(attachment).toMatchObject({
      name: "brief.md",
      mimeType: "text/markdown",
      size: file.size,
      textExtracted: true,
      lineCount: 2,
    });
    expect(attachment.textPreview).toContain("Hello attachment");
    expect(readExtractedText("agent-session-1", attachment.id)).toContain(
      "Hello attachment",
    );
  });

  it("提取 PDF 文本", async () => {
    const { saveAiAttachment } = await import("@/lib/ai-attachments");
    const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 57 >>
stream
BT /F1 24 Tf 72 720 Td (PDF attachment content) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
418
%%EOF`;
    const file = createMockFile(
      "brief.pdf",
      "application/pdf",
      Buffer.from(pdf, "utf-8"),
    );

    const attachment = await saveAiAttachment("agent-session-1", file);

    expect(attachment.textExtracted).toBe(true);
    expect(attachment.textPreview).toContain("PDF attachment content");
    expect(readExtractedText("agent-session-1", attachment.id)).toContain(
      "PDF attachment content",
    );
  });

  it("提取 DOCX 文本", async () => {
    const { saveAiAttachment } = await import("@/lib/ai-attachments");
    const docxBase64 =
      "UEsDBAoAAAAIAM1E6Vx5bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMECgAAAAAAzUTpXAAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAgAzUTpXJv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBAoAAAAAAM1E6VwAAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMECgAAAAgAzUTpXCzEwlOjAAAA4AAAABEAAAB3b3JkL2RvY3VtZW50LnhtbEWOQQ6CMBBFr9J0L0UXxhAKG+MJ9AC1rUBCZ5rOKHB7W1y4eT+Tn7w/bb+GWXx8oglBy2NVS+HBoptg0PJxvx0uUhAbcGZG8FpunmTftUvj0L6DBxZZANQsWo7MsVGK7OiDoQqjh9y9MAXD+UyDWjC5mNB6ouwPszrV9VkFM4Esyie6rWQsSAXcXdGuwjAbO+5rFoFztqqUhWln3PkTqP9z3RdQSwECFAAKAAAACADNROlceW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAAoAAAAAAM1E6VwAAAAAAAAAAAAAAAAGAAAAAAAAAAAAEAAAABkBAABfcmVscy9QSwECFAAKAAAACADNROlcm/036q0AAAApAQAACwAAAAAAAAAAAAAAAAA9AQAAX3JlbHMvLnJlbHNQSwECFAAKAAAAAADNROlcAAAAAAAAAAAAAAAABQAAAAAAAAAAABAAAAATAgAAd29yZC9QSwECFAAKAAAACADNROlcLMTCU6MAAADgAAAAEQAAAAAAAAAAAAAAAAA2AgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAUABQAgAQAACAMAAAAA";
    const file = createMockFile(
      "brief.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      Buffer.from(docxBase64, "base64"),
    );

    const attachment = await saveAiAttachment("agent-session-1", file);

    expect(attachment.textExtracted).toBe(true);
    expect(attachment.textPreview).toContain("Docx attachment content");
    expect(readExtractedText("agent-session-1", attachment.id)).toContain(
      "Docx attachment content",
    );
  });

  it("拒绝不支持的二进制扩展名", async () => {
    const { validateAiAttachmentFile } = await import("@/lib/ai-attachments");
    const file = new File(["binary"], "archive.zip", {
      type: "application/zip",
    });

    expect(validateAiAttachmentFile(file)).toMatchObject({
      ok: false,
      code: "INVALID_FILE_TYPE",
    });
  });
});
