import fs from "fs";
import path from "path";

import type { FileAttachment } from "../core/types";

export interface StoredUploadedFileAttachment extends FileAttachment {
  originalFilename?: string;
  storedFilename?: string;
  sha256?: string;
  createdAt?: string;
}

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
}

function sanitizePathSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`${label} contains invalid characters`);
  }
  return value;
}

function resolveSessionAttachmentsDir(sessionId: string): string {
  const safeSessionId = sanitizePathSegment(sessionId, "sessionId");
  return path.resolve(getDataDir(), "ai-attachments", safeSessionId);
}

function resolveAttachmentDir(sessionId: string, attachmentId: string): string {
  const safeAttachmentId = sanitizePathSegment(attachmentId, "attachmentId");
  const sessionDir = resolveSessionAttachmentsDir(sessionId);
  const attachmentDir = path.resolve(sessionDir, safeAttachmentId);
  if (!attachmentDir.startsWith(sessionDir + path.sep)) {
    throw new Error("attachment path escaped session directory");
  }
  return attachmentDir;
}

export async function listUploadedFileAttachments(
  sessionId: string,
): Promise<StoredUploadedFileAttachment[]> {
  const sessionDir = resolveSessionAttachmentsDir(sessionId);
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(sessionDir, { withFileTypes: true });
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
        const attachmentDir = resolveAttachmentDir(sessionId, entry.name);
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
  sessionId: string,
  attachmentId: string,
): Promise<{
  metadata: StoredUploadedFileAttachment;
  text: string;
}> {
  const attachmentDir = resolveAttachmentDir(sessionId, attachmentId);
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
