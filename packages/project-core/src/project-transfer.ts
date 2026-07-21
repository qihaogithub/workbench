import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { create as tarCreate, extract as tarExtract } from "tar";

/**
 * 项目原始数据同步（data/projects/<id>/ 目录级 push/pull/diff）领域逻辑。
 * 供 author-site import/export API 与 project-cli sync 命令复用。
 */

export class ProjectTransferError extends Error {
  constructor(
    public readonly code:
      | "PROJECT_NOT_FOUND"
      | "ARCHIVE_INVALID"
      | "IMPORT_PROJECT_MISMATCH"
      | "IMPORT_WRITE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ProjectTransferError";
  }
}

export interface ProjectManifestEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface ProjectManifest {
  projectId: string;
  fileCount: number;
  totalSize: number;
  files: ProjectManifestEntry[];
  generatedAt: number;
}

export interface ProjectImportResult {
  projectId: string;
  fileCount: number;
  backupPath?: string;
  clearedFields: string[];
}

export interface ProjectManifestDiff {
  added: string[];
  removed: string[];
  changed: string[];
  identical: boolean;
}

function projectDir(dataDir: string, projectId: string): string {
  const safeId = path.basename(projectId);
  if (safeId !== projectId || !projectId) {
    throw new ProjectTransferError(
      "PROJECT_NOT_FOUND",
      `非法项目 ID: ${projectId}`,
    );
  }
  return path.join(dataDir, "projects", safeId);
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  return files.sort();
}

export function buildProjectManifest(
  dataDir: string,
  projectId: string,
): ProjectManifest {
  const dir = projectDir(dataDir, projectId);
  if (!fs.existsSync(path.join(dir, "project.json"))) {
    throw new ProjectTransferError(
      "PROJECT_NOT_FOUND",
      `项目不存在: ${projectId}`,
    );
  }
  const files = walkFiles(dir).map((file) => {
    const buffer = fs.readFileSync(file);
    return {
      path: path.relative(dir, file).split(path.sep).join("/"),
      size: buffer.length,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    };
  });
  return {
    projectId,
    fileCount: files.length,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    files,
    generatedAt: Date.now(),
  };
}

export function diffProjectManifests(
  local: ProjectManifest,
  remote: ProjectManifest,
): ProjectManifestDiff {
  const localMap = new Map(local.files.map((file) => [file.path, file.sha256]));
  const remoteMap = new Map(
    remote.files.map((file) => [file.path, file.sha256]),
  );
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [filePath, sha] of localMap) {
    const remoteSha = remoteMap.get(filePath);
    if (remoteSha === undefined) {
      added.push(filePath);
    } else if (remoteSha !== sha) {
      changed.push(filePath);
    }
  }
  for (const filePath of remoteMap.keys()) {
    if (!localMap.has(filePath)) removed.push(filePath);
  }
  return {
    added,
    removed,
    changed,
    identical: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

/** 将 data/projects/<id>/ 全量打为 tar.gz（包内路径以 <id>/ 开头） */
export async function createProjectArchive(
  dataDir: string,
  projectId: string,
): Promise<Buffer> {
  const dir = projectDir(dataDir, projectId);
  if (!fs.existsSync(path.join(dir, "project.json"))) {
    throw new ProjectTransferError(
      "PROJECT_NOT_FOUND",
      `项目不存在: ${projectId}`,
    );
  }
  const stream = tarCreate(
    {
      gzip: true,
      cwd: path.join(dataDir, "projects"),
      portable: true,
    },
    [projectId],
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function isSafeEntryPath(entryPath: string): boolean {
  if (path.isAbsolute(entryPath)) return false;
  const segments = entryPath.split("/");
  return !segments.includes("..") && !segments.includes("");
}

async function extractArchiveTo(buffer: Buffer, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  try {
    await pipeline(
      Readable.from([buffer]),
      tarExtract({
        cwd: destDir,
        preservePaths: false,
        filter: (entryPath, entry) => {
          const normalized = entryPath.replace(/\/+$/, "");
          if (!isSafeEntryPath(normalized)) return false;
          return (
            "type" in entry &&
            (entry.type === "File" || entry.type === "Directory")
          );
        },
      }),
    );
  } catch (error) {
    throw new ProjectTransferError(
      "ARCHIVE_INVALID",
      `解包失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** import 后需要清空的 project.json 字段：workspace 引用与快照/发布状态在目标环境必然悬空 */
const IMPORT_CLEARED_FIELDS = [
  "activeWorkspaceId",
  "activeWorkspaceUpdatedAt",
  "canonicalSyncedWorkspaceId",
  "canonicalSyncedRevision",
  "canonicalSyncedRootHash",
  "publishedVersion",
  "publishedAt",
] as const;

function normalizeImportedProjectMeta(projectJsonPath: string): string[] {
  const raw = fs.readFileSync(projectJsonPath, "utf-8");
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ProjectTransferError(
      "ARCHIVE_INVALID",
      "包内 project.json 不是合法 JSON",
    );
  }
  const cleared: string[] = [];
  for (const field of IMPORT_CLEARED_FIELDS) {
    if (meta[field] !== undefined) {
      delete meta[field];
      cleared.push(field);
    }
  }
  // 版本快照存于 data/snapshots/，不随包传输，保留引用必然悬空
  if (Array.isArray(meta.versions) && meta.versions.length > 0) {
    meta.versions = [];
    cleared.push("versions");
  }
  meta.canonicalSyncedAt = Date.now();
  meta.updatedAt = Date.now();
  fs.writeFileSync(projectJsonPath, JSON.stringify(meta, null, 2));
  return cleared;
}

export interface ProjectImportOptions {
  /** 覆盖前是否备份现有项目目录（默认 true） */
  backup?: boolean;
}

/**
 * 导入项目归档：解包到临时目录校验后原子替换正式目录。
 * 现有目录先备份到 data/snapshots/<id>/pre-import-<ts>/。
 */
export async function importProjectArchive(
  dataDir: string,
  projectId: string,
  archive: Buffer,
  options: ProjectImportOptions = {},
): Promise<ProjectImportResult> {
  const targetDir = projectDir(dataDir, projectId);
  const tmpRoot = path.join(dataDir, "projects", ".tmp-import");
  const tmpDir = path.join(tmpRoot, `${projectId}-${Date.now()}`);

  try {
    await extractArchiveTo(archive, tmpDir);

    const extractedProjectDir = path.join(tmpDir, projectId);
    const projectJsonPath = path.join(extractedProjectDir, "project.json");
    if (!fs.existsSync(projectJsonPath)) {
      throw new ProjectTransferError(
        "ARCHIVE_INVALID",
        `包内缺少 ${projectId}/project.json`,
      );
    }
    const meta = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8")) as {
      id?: unknown;
    };
    if (meta.id !== projectId) {
      throw new ProjectTransferError(
        "IMPORT_PROJECT_MISMATCH",
        `包内项目 ID (${String(meta.id)}) 与目标项目 (${projectId}) 不一致`,
      );
    }

    const clearedFields = normalizeImportedProjectMeta(projectJsonPath);
    const fileCount = walkFiles(extractedProjectDir).length;

    let backupPath: string | undefined;
    if (fs.existsSync(targetDir)) {
      if (options.backup !== false) {
        const backupDir = path.join(
          dataDir,
          "snapshots",
          projectId,
          `pre-import-${Date.now()}`,
        );
        fs.mkdirSync(path.dirname(backupDir), { recursive: true });
        fs.renameSync(targetDir, backupDir);
        backupPath = backupDir;
      } else {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
    }

    try {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.renameSync(extractedProjectDir, targetDir);
    } catch (error) {
      // 替换失败时尽力恢复备份，避免项目目录丢失
      if (backupPath && !fs.existsSync(targetDir)) {
        fs.renameSync(backupPath, targetDir);
        backupPath = undefined;
      }
      throw new ProjectTransferError(
        "IMPORT_WRITE_FAILED",
        `写入项目目录失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { projectId, fileCount, backupPath, clearedFields };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
