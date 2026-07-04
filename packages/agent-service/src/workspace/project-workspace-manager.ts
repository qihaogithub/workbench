import * as fs from 'fs';
import * as path from 'path';
import type {
  Project,
  EditSession,
  VersionInfo,
  CreateProjectRequest,
  OpenProjectEditResponse,
  SaveProjectChangesResponse,
  RestoreVersionResponse,
  VersionHistoryResponse,
  ProjectListResponse,
  ProjectDetailResponse,
} from '@opencode-workbench/shared/contracts';
import { MAX_VERSIONS_KEEP } from '@opencode-workbench/shared/contracts';
import { logger } from '../utils/logger';

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

const BASE_DIR = path.resolve(
  process.env.DATA_DIR ||
  process.env.PROJECTS_BASE_DIR ||
  path.join(findProjectRoot(process.cwd()), 'data')
);
if (process.env.PROJECTS_BASE_DIR && !process.env.DATA_DIR) {
  logger.warn('PROJECTS_BASE_DIR 已废弃，请使用 DATA_DIR 代替');
}
const PROJECTS_DIR = path.join(BASE_DIR, 'projects');
const SESSIONS_DIR = path.join(BASE_DIR, 'sessions');
const SNAPSHOTS_DIR = path.join(BASE_DIR, 'snapshots');

function generateVersionId(project: Project): string {
  const maxVersion = project.versions.reduce(
    (max, version) => {
      const match = /^v(\d+)$/.exec(version.versionId);
      return match ? Math.max(max, Number(match[1])) : max;
    },
    0
  );
  return `v${maxVersion + 1}`;
}

/**
 * 确保基础目录存在
 */
async function ensureBaseDirs(): Promise<void> {
  await fs.promises.mkdir(PROJECTS_DIR, { recursive: true });
  await fs.promises.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.promises.mkdir(SNAPSHOTS_DIR, { recursive: true });
}

/**
 * 生成项目 ID
 */
function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 生成会话 ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}`;
}

/**
 * 递归复制目录
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 递归统计文件数量
 */
async function countFiles(dir: string): Promise<number> {
  let count = 0;

  if (!fs.existsSync(dir)) {
    return 0;
  }

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }

  return count;
}

/**
 * 读取项目元数据
 */
async function readProjectMeta(projectId: string): Promise<Project> {
  const metaPath = path.join(PROJECTS_DIR, projectId, 'project.json');

  if (!fs.existsSync(metaPath)) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  const content = await fs.promises.readFile(metaPath, 'utf-8');
  return JSON.parse(content) as Project;
}

/**
 * 写入项目元数据
 */
async function writeProjectMeta(projectId: string, project: Project): Promise<void> {
  const metaPath = path.join(PROJECTS_DIR, projectId, 'project.json');
  await fs.promises.writeFile(metaPath, JSON.stringify(project, null, 2), 'utf-8');
}

/**
 * 读取会话元数据
 */
async function readSessionMeta(sessionId: string, projectId: string): Promise<EditSession> {
  const metaPath = path.join(SESSIONS_DIR, projectId, `${sessionId}.json`);

  if (!fs.existsSync(metaPath)) {
    throw new Error('SESSION_NOT_FOUND');
  }

  const content = await fs.promises.readFile(metaPath, 'utf-8');
  return JSON.parse(content) as EditSession;
}

/**
 * 写入会话元数据
 */
async function writeSessionMeta(sessionId: string, projectId: string, session: EditSession): Promise<void> {
  const sessionDir = path.join(SESSIONS_DIR, projectId);
  await fs.promises.mkdir(sessionDir, { recursive: true });

  const metaPath = path.join(sessionDir, `${sessionId}.json`);
  await fs.promises.writeFile(metaPath, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * 项目工作空间管理器
 */
export class ProjectWorkspaceManager {
  private static instance: ProjectWorkspaceManager;

  private constructor() {}

  static getInstance(): ProjectWorkspaceManager {
    if (!ProjectWorkspaceManager.instance) {
      ProjectWorkspaceManager.instance = new ProjectWorkspaceManager();
    }
    return ProjectWorkspaceManager.instance;
  }

  /**
   * 初始化：确保基础目录存在
   */
  async init(): Promise<void> {
    await ensureBaseDirs();
    logger.info({ baseDir: BASE_DIR }, '项目工作空间管理器已初始化');
  }

  /**
   * 创建新项目
   */
  async createProject(request: CreateProjectRequest): Promise<Project> {
    const projectId = generateProjectId();
    const now = Date.now();

    // 创建工作空间目录
    const workspacePath = path.join(PROJECTS_DIR, projectId, 'workspace');
    await fs.promises.mkdir(workspacePath, { recursive: true });

    // 如果提供了初始工作空间路径，复制文件
    if (request.workspacePath && fs.existsSync(request.workspacePath)) {
      await copyDirectory(request.workspacePath, workspacePath);
    }

    const project: Project = {
      id: projectId,
      name: request.name,
      description: request.description,
      workspacePath,
      demoPages: [],
      demoFolders: [],
      versions: [],
      createdAt: now,
      updatedAt: now,
    };

    await writeProjectMeta(projectId, project);

    logger.info({ projectId, name: request.name }, '项目已创建');
    return project;
  }

  /**
   * 获取项目列表
   */
  async getProjects(): Promise<ProjectListResponse> {
    const entries = await fs.promises.readdir(PROJECTS_DIR, { withFileTypes: true });
    const projects: ProjectListResponse['projects'] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const project = await readProjectMeta(entry.name);
          const lastVersion = project.versions[project.versions.length - 1];
          const fileCount = await countFiles(project.workspacePath);

          projects.push({
            id: project.id,
            name: project.name,
            description: project.description,
            thumbnail: project.thumbnail,
            currentVersion: lastVersion?.versionId || 'v0',
            lastSavedAt: lastVersion?.savedAt || project.createdAt,
            lastSavedBy: lastVersion?.savedBy || '系统',
            fileCount,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          });
        } catch (error) {
          logger.warn({ projectId: entry.name, error }, '读取项目信息失败');
        }
      }
    }

    // 按更新时间倒序排列
    projects.sort((a, b) => b.updatedAt - a.updatedAt);

    return {
      projects,
      total: projects.length,
    };
  }

  /**
   * 获取项目详情
   */
  async getProject(projectId: string): Promise<ProjectDetailResponse> {
    const project = await readProjectMeta(projectId);
    const lastVersion = project.versions[project.versions.length - 1];
    const fileCount = await countFiles(project.workspacePath);

    return {
      project,
      currentVersion: lastVersion?.versionId || 'v0',
      fileCount,
    };
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<void> {
    const projectDir = path.join(PROJECTS_DIR, projectId);
    const snapshotsDir = path.join(SNAPSHOTS_DIR, projectId);
    const sessionsDir = path.join(SESSIONS_DIR, projectId);

    // 删除项目目录
    if (fs.existsSync(projectDir)) {
      await fs.promises.rm(projectDir, { recursive: true, force: true });
    }

    // 删除快照
    if (fs.existsSync(snapshotsDir)) {
      await fs.promises.rm(snapshotsDir, { recursive: true, force: true });
    }

    // 删除会话
    if (fs.existsSync(sessionsDir)) {
      await fs.promises.rm(sessionsDir, { recursive: true, force: true });
    }

    logger.info({ projectId }, '项目已删除');
  }

  /**
   * 打开项目编辑（创建临时工作空间）
   */
  async openProjectForEdit(projectId: string, username: string): Promise<OpenProjectEditResponse> {
    const project = await readProjectMeta(projectId);
    const sessionId = generateSessionId();
    const tempWorkspace = path.join(SESSIONS_DIR, projectId, sessionId);

    // 获取当前最新版本
    const currentVersion = project.versions[project.versions.length - 1]?.versionId || 'v0';

    // 复制项目文件到临时空间
    await copyDirectory(project.workspacePath, tempWorkspace);

    // 创建编辑会话
    const session: EditSession = {
      sessionId,
      projectId,
      username,
      tempWorkspace,
      basedOnVersion: currentVersion,
      status: 'editing',
      createdAt: Date.now(),
    };

    await writeSessionMeta(sessionId, projectId, session);

    logger.info({ sessionId, projectId, username }, '项目编辑会话已创建');

    return {
      sessionId,
      workspaceId: sessionId,
      workspaceScope: "legacy",
      workspacePath: tempWorkspace,
      isSharedWorkspace: false,
      tempWorkspace,
      basedOnVersion: currentVersion,
      warning: "legacy_temp_workspace",
    };
  }

  /**
   * 保存项目变更
   */
  async saveProjectChanges(
    sessionId: string,
    projectId: string,
    options?: { note?: string }
  ): Promise<SaveProjectChangesResponse> {
    // 读取会话信息
    const session = await readSessionMeta(sessionId, projectId);

    if (session.status !== 'editing') {
      throw new Error('SESSION_NOT_EDITING');
    }

    // 读取项目信息
    const project = await readProjectMeta(projectId);

    // 生成新版本号
    const versionId = generateVersionId(project);
    const snapshotPath = path.join(SNAPSHOTS_DIR, projectId, versionId);

    // 步骤 1: 备份当前正式空间
    await copyDirectory(project.workspacePath, snapshotPath);

    // 步骤 2: 临时空间覆盖正式空间
    await copyDirectory(session.tempWorkspace, project.workspacePath);

    // 步骤 3: 统计文件数量
    const fileCount = await countFiles(session.tempWorkspace);

    // 步骤 4: 记录版本信息
    const versionInfo: VersionInfo = {
      versionId,
      type: 'named_version',
      savedAt: Date.now(),
      savedBy: session.username,
      sessionId,
      snapshotPath,
      fileCount,
      note: options?.note,
    };

    project.versions.push(versionInfo);
    project.updatedAt = Date.now();

    // 步骤 5: 清理旧版本（保留最近 50 个）
    if (project.versions.length > MAX_VERSIONS_KEEP) {
      const toRemove = project.versions.slice(0, project.versions.length - MAX_VERSIONS_KEEP);

      for (const version of toRemove) {
        if (fs.existsSync(version.snapshotPath)) {
          await fs.promises.rm(version.snapshotPath, { recursive: true, force: true });
        }
      }

      project.versions = project.versions.slice(-MAX_VERSIONS_KEEP);
    }

    await writeProjectMeta(projectId, project);

    // 步骤 6: 标记会话为已保存
    session.status = 'saved';
    await writeSessionMeta(sessionId, projectId, session);

    // 步骤 7: 删除临时空间（立即清理）
    if (fs.existsSync(session.tempWorkspace)) {
      await fs.promises.rm(session.tempWorkspace, { recursive: true, force: true });
    }

    logger.info({ sessionId, projectId, versionId }, '项目变更已保存');

    return {
      success: true,
      version: versionId,
      savedAt: versionInfo.savedAt,
    };
  }

  /**
   * 放弃编辑
   */
  async discardProjectChanges(sessionId: string, projectId: string): Promise<void> {
    // 读取会话信息
    const session = await readSessionMeta(sessionId, projectId);

    if (session.status !== 'editing') {
      throw new Error('SESSION_NOT_EDITING');
    }

    // 删除临时空间
    if (fs.existsSync(session.tempWorkspace)) {
      await fs.promises.rm(session.tempWorkspace, { recursive: true, force: true });
    }

    // 标记会话为已放弃
    session.status = 'discarded';
    await writeSessionMeta(sessionId, projectId, session);

    logger.info({ sessionId, projectId }, '项目编辑已放弃');
  }

  /**
   * 获取版本历史
   */
  async getVersionHistory(projectId: string): Promise<VersionHistoryResponse> {
    const project = await readProjectMeta(projectId);
    const currentVersion = project.versions[project.versions.length - 1]?.versionId || 'v0';

    // 倒序返回版本列表
    const versions = [...project.versions].reverse();

    return {
      projectId,
      currentVersion,
      versions,
      totalVersions: project.versions.length,
    };
  }

  /**
   * 恢复指定版本
   */
  async restoreVersion(projectId: string, versionId: string, username: string): Promise<RestoreVersionResponse> {
    const project = await readProjectMeta(projectId);

    // 查找指定版本
    const version = project.versions.find(v => v.versionId === versionId);

    if (!version) {
      throw new Error('VERSION_NOT_FOUND');
    }

    // 生成新版本号
    const newVersionId = generateVersionId(project);

    // 备份当前状态
    const backupPath = path.join(SNAPSHOTS_DIR, projectId, `${newVersionId}_backup`);
    await copyDirectory(project.workspacePath, backupPath);

    // 从快照恢复
    await copyDirectory(version.snapshotPath, project.workspacePath);

    // 创建恢复后状态的新快照
    const restoreSnapshotPath = path.join(SNAPSHOTS_DIR, projectId, newVersionId);
    await copyDirectory(project.workspacePath, restoreSnapshotPath);

    // 统计文件数量
    const fileCount = await countFiles(project.workspacePath);

    // 记录版本信息
    const newVersion: VersionInfo = {
      versionId: newVersionId,
      type: 'restore_snapshot',
      savedAt: Date.now(),
      savedBy: username,
      sessionId: 'restore',
      snapshotPath: restoreSnapshotPath,
      fileCount,
      note: `从 ${versionId} 恢复`,
    };

    project.versions.push(newVersion);
    project.updatedAt = Date.now();

    // 清理旧版本
    if (project.versions.length > MAX_VERSIONS_KEEP) {
      const toRemove = project.versions.slice(0, project.versions.length - MAX_VERSIONS_KEEP);

      for (const ver of toRemove) {
        if (fs.existsSync(ver.snapshotPath)) {
          await fs.promises.rm(ver.snapshotPath, { recursive: true, force: true });
        }
      }

      project.versions = project.versions.slice(-MAX_VERSIONS_KEEP);
    }

    await writeProjectMeta(projectId, project);

    logger.info({ projectId, versionId, newVersionId, username }, '版本已恢复');

    return {
      success: true,
      newVersionId,
      restoredAt: newVersion.savedAt,
    };
  }

  /**
   * 获取会话信息
   */
  async getSession(sessionId: string, projectId: string): Promise<EditSession> {
    return await readSessionMeta(sessionId, projectId);
  }
}

export const projectWorkspaceManager = ProjectWorkspaceManager.getInstance();
