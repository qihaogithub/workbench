import path from "path";
import fs from "fs";
import { DATA_DIR } from "./paths";

/**
 * 聊天文件（.ai-attachments）读取工具。
 * 附件持久化在 data/projects/{projectId}/.ai-attachments/{attachmentId}/，
 * 每个附件目录包含 manifest.json + text.txt + 原始文件。
 * 本模块仅用于 author-site 侧读取/删除，上传与写入仍由 agent-service 负责。
 */

export interface ChatAttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textExtracted: boolean;
  textPreview?: string;
  lineCount?: number;
  truncated?: boolean;
  originalFilename?: string;
  storedFilename?: string;
  sha256?: string;
  createdAt?: string;
}

const ATTACHMENTS_DIR_NAME = ".ai-attachments";

function resolveAttachmentsDir(projectId: string): string {
  return path.join(DATA_DIR, "projects", projectId, ATTACHMENTS_DIR_NAME);
}

function resolveAttachmentDir(projectId: string, attachmentId: string): string {
  const base = resolveAttachmentsDir(projectId);
  const dir = path.resolve(base, attachmentId);
  if (!dir.startsWith(base + path.sep)) {
    throw new Error("attachment path escaped project directory");
  }
  return dir;
}

function readManifest(
  projectId: string,
  attachmentId: string,
): ChatAttachmentMeta | null {
  const manifestPath = path.join(
    resolveAttachmentDir(projectId, attachmentId),
    "manifest.json",
  );
  try {
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ChatAttachmentMeta;
  } catch {
    return null;
  }
}

export function listChatAttachments(
  projectId: string,
): ChatAttachmentMeta[] {
  const dir = resolveAttachmentsDir(projectId);
  if (!fs.existsSync(dir)) return [];

  const attachments: ChatAttachmentMeta[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readManifest(projectId, entry.name);
    if (meta && meta.id === entry.name) {
      attachments.push(meta);
    }
  }
  attachments.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return attachments;
}

export function readChatAttachment(
  projectId: string,
  attachmentId: string,
): { metadata: ChatAttachmentMeta; text: string } | null {
  const metadata = readManifest(projectId, attachmentId);
  if (!metadata) return null;
  const textPath = path.join(
    resolveAttachmentDir(projectId, attachmentId),
    "text.txt",
  );
  let text = "";
  try {
    if (fs.existsSync(textPath)) {
      text = fs.readFileSync(textPath, "utf-8");
    }
  } catch {
    text = "";
  }
  return { metadata, text };
}

export function deleteChatAttachment(
  projectId: string,
  attachmentId: string,
): boolean {
  const dir = resolveAttachmentDir(projectId, attachmentId);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function deleteChatAttachments(
  projectId: string,
  attachmentIds: string[],
): number {
  let deleted = 0;
  for (const id of attachmentIds) {
    if (deleteChatAttachment(projectId, id)) deleted++;
  }
  return deleted;
}

/** 读取附件原始文件（图片等二进制），返回 buffer 与元数据 */
export function readChatAttachmentFile(
  projectId: string,
  attachmentId: string,
): { metadata: ChatAttachmentMeta; buffer: Buffer; mimeType: string } | null {
  const metadata = readManifest(projectId, attachmentId);
  if (!metadata) return null;
  const storedFilename = metadata.storedFilename || metadata.name;
  const filePath = path.join(
    resolveAttachmentDir(projectId, attachmentId),
    storedFilename,
  );
  if (!fs.existsSync(filePath)) return null;
  return {
    metadata,
    buffer: fs.readFileSync(filePath),
    mimeType: metadata.mimeType || "application/octet-stream",
  };
}