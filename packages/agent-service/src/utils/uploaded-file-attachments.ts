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
const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif",
]);
const ALLOWED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ".pdf",
  ".docx",
]);

export interface StoredUploadedFileAttachment extends FileAttachment {
  originalFilename?: string;
  storedFilename?: string;
  sha256?: string;
  createdAt?: string;
}

export class AttachmentUploadError extends Error {
  constructor(
    public readonly code: "INVALID_FILE_TYPE" | "FILE_TOO_LARGE" | "INVALID_PROJECT_ID",
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

function validateProjectId(projectId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(projectId)) {
    throw new AttachmentUploadError("INVALID_PROJECT_ID", "项目 ID 不合法", 400);
  }
  return projectId;
}

function sanitizePathSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`${label} contains invalid characters`);
  }
  return value;
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

function resolveProjectAttachmentsDir(projectId: string): string {
  const safeProjectId = sanitizePathSegment(projectId, "projectId");
  return path.resolve(getDataDir(), "projects", safeProjectId, ".ai-attachments");
}

function resolveAttachmentDir(projectId: string, attachmentId: string): string {
  const safeAttachmentId = sanitizePathSegment(attachmentId, "attachmentId");
  const projectDir = resolveProjectAttachmentsDir(projectId);
  const attachmentDir = path.resolve(projectDir, safeAttachmentId);
  if (!attachmentDir.startsWith(projectDir + path.sep)) {
    throw new Error("attachment path escaped project directory");
  }
  return attachmentDir;
}

export async function saveUploadedFileAttachment(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<FileAttachment> {
  const projectId = validateProjectId(input.projectId);
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
  const sha256 = crypto.createHash("sha256").update(input.buffer).digest("hex");

  // 按内容去重：同一项目内已存在相同内容附件时，复用既有 attachmentId，不新建副本
  const existing = await findAttachmentBySha256(projectId, sha256);
  if (existing) {
    return existing;
  }

  const attachmentId = crypto.randomUUID();
  const safeFilename = sanitizeFilename(input.filename);
  const attachmentDir = resolveAttachmentDir(projectId, attachmentId);
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
        sha256,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );
  return metadata;
}

async function findAttachmentBySha256(
  projectId: string,
  sha256: string,
): Promise<StoredUploadedFileAttachment | null> {
  const projectDir = resolveProjectAttachmentsDir(projectId);
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(projectDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(
      resolveAttachmentDir(projectId, entry.name),
      "manifest.json",
    );
    try {
      const manifestRaw = await fs.promises.readFile(manifestPath, "utf-8");
      const metadata = JSON.parse(manifestRaw) as StoredUploadedFileAttachment;
      if (metadata.sha256 === sha256) return metadata;
    } catch {
      continue;
    }
  }
  return null;
}

export async function listUploadedFileAttachments(
  projectId: string,
): Promise<StoredUploadedFileAttachment[]> {
  const projectDir = resolveProjectAttachmentsDir(projectId);
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(projectDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const attachments = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<StoredUploadedFileAttachment | null> => {
        const attachmentDir = resolveAttachmentDir(projectId, entry.name);
        try {
          const manifestRaw = await fs.promises.readFile(
            path.join(attachmentDir, "manifest.json"),
            "utf-8",
          );
          const metadata = JSON.parse(manifestRaw) as StoredUploadedFileAttachment;
          return metadata.id === entry.name ? metadata : null;
        } catch {
          return null;
        }
      }),
  );

  return attachments
    .filter((attachment): attachment is StoredUploadedFileAttachment => Boolean(attachment))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

export async function readUploadedFileAttachment(
  projectId: string,
  attachmentId: string,
): Promise<{
  metadata: StoredUploadedFileAttachment;
  text: string;
}> {
  const attachmentDir = resolveAttachmentDir(projectId, attachmentId);
  const manifestPath = path.join(attachmentDir, "manifest.json");
  const textPath = path.join(attachmentDir, "text.txt");

  const [manifestRaw, text] = await Promise.all([
    fs.promises.readFile(manifestPath, "utf-8"),
    fs.promises.readFile(textPath, "utf-8"),
  ]);
  const metadata = JSON.parse(manifestRaw) as StoredUploadedFileAttachment;
  if (metadata.id !== attachmentId) {
    throw new Error("attachment metadata does not match requested id");
  }
  return { metadata, text };
}

export async function deleteUploadedFileAttachment(
  projectId: string,
  attachmentId: string,
): Promise<void> {
  const attachmentDir = resolveAttachmentDir(projectId, attachmentId);
  await fs.promises.rm(attachmentDir, { recursive: true, force: true });
}
