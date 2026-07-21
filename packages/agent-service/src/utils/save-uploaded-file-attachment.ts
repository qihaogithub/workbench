import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { FileAttachment } from "../core/types";

export const AI_ATTACHMENT_MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 300_000;
const TEXT_PREVIEW_CHARS = 500;

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".json", ".csv", ".ts", ".tsx", ".js",
  ".jsx", ".mjs", ".cjs", ".css", ".scss", ".sass", ".less", ".html",
  ".htm", ".xml", ".yaml", ".yml", ".py", ".java", ".go", ".rs",
  ".php", ".rb", ".swift", ".kt", ".kts", ".sql", ".sh", ".toml",
  ".ini", ".log",
]);
const ALLOWED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ".pdf", ".docx"]);

export class AttachmentUploadError extends Error {
  constructor(
    public readonly code: "INVALID_FILE_TYPE" | "FILE_TOO_LARGE" | "INVALID_SESSION_ID",
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function findProjectRoot(startDir: string): string {
  let directory = startDir;
  while (directory !== path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, "pnpm-workspace.yaml"))) return directory;
    directory = path.dirname(directory);
  }
  return startDir;
}

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "attachment";
}

function validateSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId)) {
    throw new AttachmentUploadError("INVALID_SESSION_ID", "会话 ID 不合法", 400);
  }
  return sessionId;
}

async function extractText(buffer: Buffer, extension: string): Promise<string> {
  if (extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text || "";
    } finally {
      await parser.destroy();
    }
  }
  if (extension === ".docx") {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer })).value || "";
  }
  return TEXT_EXTENSIONS.has(extension) ? buffer.toString("utf-8") : "";
}

export async function saveUploadedFileAttachment(input: {
  sessionId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<FileAttachment> {
  const sessionId = validateSessionId(input.sessionId);
  const extension = path.extname(input.filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new AttachmentUploadError(
      "INVALID_FILE_TYPE",
      `不支持的文件类型: ${extension || input.mimeType || "unknown"}`,
      400,
    );
  }
  if (input.buffer.byteLength > AI_ATTACHMENT_MAX_FILE_SIZE) {
    throw new AttachmentUploadError(
      "FILE_TOO_LARGE",
      "文件大小超过 20MB 限制",
      413,
    );
  }

  const rawText = (await extractText(input.buffer, extension))
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  const text = rawText.slice(0, MAX_EXTRACTED_TEXT_CHARS);
  const attachmentId = crypto.randomUUID();
  const safeFilename = sanitizeFilename(input.filename);
  const attachmentDir = path.join(
    getDataDir(),
    "ai-attachments",
    sessionId,
    attachmentId,
  );
  await fs.promises.mkdir(attachmentDir, { recursive: true });
  await Promise.all([
    fs.promises.writeFile(path.join(attachmentDir, safeFilename), input.buffer),
    fs.promises.writeFile(path.join(attachmentDir, "text.txt"), text, "utf-8"),
  ]);

  const metadata: FileAttachment = {
    id: attachmentId,
    name: input.filename,
    mimeType: input.mimeType || "application/octet-stream",
    size: input.buffer.byteLength,
    textExtracted: text.length > 0,
    textPreview: text.slice(0, TEXT_PREVIEW_CHARS) || undefined,
    lineCount: text.length > 0 ? text.split("\n").length : 0,
    truncated: rawText.length > MAX_EXTRACTED_TEXT_CHARS,
  };
  await fs.promises.writeFile(
    path.join(attachmentDir, "manifest.json"),
    JSON.stringify(
      {
        ...metadata,
        originalFilename: input.filename,
        storedFilename: safeFilename,
        sha256: crypto.createHash("sha256").update(input.buffer).digest("hex"),
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
  return metadata;
}
