import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { FileAttachment } from "@workbench/agent-client";

const MAX_EXTRACTED_TEXT_CHARS = 300_000;
const TEXT_PREVIEW_CHARS = 500;

export const AI_ATTACHMENT_MAX_FILE_SIZE = 20 * 1024 * 1024;
export const AI_ATTACHMENT_MAX_FILES_PER_MESSAGE = 5;
export const AI_ATTACHMENT_MAX_TOTAL_SIZE = 50 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".php",
  ".rb",
  ".swift",
  ".kt",
  ".kts",
  ".sql",
  ".sh",
  ".toml",
  ".ini",
  ".log",
]);

const DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx"]);

export const AI_ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
]);

interface StoredAiAttachmentManifest extends FileAttachment {
  originalFilename: string;
  storedFilename: string;
  sha256: string;
  createdAt: string;
}

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
}

function getAiAttachmentsDir(): string {
  return path.join(getDataDir(), "ai-attachments");
}

function sanitizePathSegment(value: string, fallback: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
  return sanitized || fallback;
}

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return filename.slice(dotIndex).toLowerCase();
}

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function summarizeExtractedText(rawText: string): {
  text: string;
  textPreview: string;
  lineCount: number;
  truncated: boolean;
} {
  const normalized = normalizeText(rawText).trim();
  const truncated = normalized.length > MAX_EXTRACTED_TEXT_CHARS;
  const text = truncated
    ? normalized.slice(0, MAX_EXTRACTED_TEXT_CHARS)
    : normalized;
  return {
    text,
    textPreview: text.slice(0, TEXT_PREVIEW_CHARS),
    lineCount: text.length > 0 ? text.split("\n").length : 0,
    truncated,
  };
}

export function validateAiAttachmentFile(file: File): {
  ok: true;
  extension: string;
} | {
  ok: false;
  code: "INVALID_FILE_TYPE" | "FILE_TOO_LARGE";
  message: string;
} {
  const extension = getFileExtension(file.name);
  if (!AI_ATTACHMENT_ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      code: "INVALID_FILE_TYPE",
      message: `不支持的文件类型: ${extension || file.type || "unknown"}`,
    };
  }
  if (file.size > AI_ATTACHMENT_MAX_FILE_SIZE) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `文件大小超过 ${AI_ATTACHMENT_MAX_FILE_SIZE / 1024 / 1024}MB 限制`,
    };
  }
  return { ok: true, extension };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || "";
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

export async function extractAiAttachmentText(
  buffer: Buffer,
  extension: string,
): Promise<{
  textExtracted: boolean;
  text: string;
  textPreview?: string;
  lineCount?: number;
  truncated?: boolean;
}> {
  let rawText = "";
  if (extension === ".pdf") {
    rawText = await extractPdfText(buffer);
  } else if (extension === ".docx") {
    rawText = await extractDocxText(buffer);
  } else if (TEXT_EXTENSIONS.has(extension)) {
    rawText = buffer.toString("utf-8");
  }

  const summary = summarizeExtractedText(rawText);
  return {
    textExtracted: summary.text.length > 0,
    text: summary.text,
    textPreview: summary.textPreview || undefined,
    lineCount: summary.lineCount,
    truncated: summary.truncated,
  };
}

export async function saveAiAttachment(
  sessionId: string,
  file: File,
): Promise<FileAttachment> {
  const validation = validateAiAttachmentFile(file);
  if (!validation.ok) {
    throw Object.assign(new Error(validation.message), {
      code: validation.code,
      status: validation.code === "FILE_TOO_LARGE" ? 413 : 400,
    });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const attachmentId = crypto.randomUUID();
  const safeSessionId = sanitizePathSegment(sessionId, "session");
  const safeFilename = sanitizePathSegment(file.name, "attachment");
  const attachmentDir = path.join(getAiAttachmentsDir(), safeSessionId, attachmentId);
  await fs.promises.mkdir(attachmentDir, { recursive: true });

  const extracted = await extractAiAttachmentText(buffer, validation.extension);
  await fs.promises.writeFile(path.join(attachmentDir, safeFilename), buffer);
  await fs.promises.writeFile(path.join(attachmentDir, "text.txt"), extracted.text, "utf-8");

  const metadata: FileAttachment = {
    id: attachmentId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    textExtracted: extracted.textExtracted,
    textPreview: extracted.textPreview,
    lineCount: extracted.lineCount,
    truncated: extracted.truncated,
  };

  const manifest: StoredAiAttachmentManifest = {
    ...metadata,
    originalFilename: file.name,
    storedFilename: safeFilename,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    createdAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(
    path.join(attachmentDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  return metadata;
}
