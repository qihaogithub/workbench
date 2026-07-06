import * as fs from 'fs';
import * as path from 'path';
import type { WorkspaceInfo, CreateWorkspaceOptions } from '@workbench/shared/contracts';
import {
  getSystemTempDir,
  generateTempWorkspaceName,
  normalizeWorkspacePath,
  isTemporaryWorkspace,
  getWorkspaceDisplayName,
} from './utils';
import { logger } from '../utils/logger';

export class WorkspaceManager {
  private static instance: WorkspaceManager;
  private tempBaseDir: string;

  private constructor() {
    this.tempBaseDir = getSystemTempDir();
  }

  static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }

  async create(options: CreateWorkspaceOptions): Promise<WorkspaceInfo> {
    const { workspace, customWorkspace: providedCustomWorkspace } = options;

    const customWorkspace = providedCustomWorkspace !== undefined
      ? providedCustomWorkspace
      : !!workspace;

    let workspacePath: string;

    if (!workspace) {
      workspacePath = await this.createTempWorkspace();
    } else {
      workspacePath = await this.createOrValidateUserWorkspace(workspace);
    }

    const info: WorkspaceInfo = {
      path: workspacePath,
      customWorkspace,
      type: customWorkspace ? 'user' : 'temp',
      createdAt: Date.now(),
    };

    logger.info({ workspacePath, customWorkspace }, 'Workspace created');
    return info;
  }

  private async createTempWorkspace(): Promise<string> {
    const tempDir = this.tempBaseDir;

    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir, { recursive: true });
    }

    const workspaceName = generateTempWorkspaceName();
    const workspacePath = path.join(tempDir, workspaceName);

    await fs.promises.mkdir(workspacePath, { recursive: true });

    logger.debug({ workspacePath }, 'Temporary workspace created');
    return workspacePath;
  }

  private async createOrValidateUserWorkspace(workspace: string): Promise<string> {
    const normalizedPath = normalizeWorkspacePath(workspace);

    if (!fs.existsSync(normalizedPath)) {
      // 不再创建空目录：如果路径不存在，说明 author-site 尚未创建工作空间
      // 或者路径有误。创建空目录会导致 scanWorkspaceContext 返回"暂无页面"
      logger.warn(
        { workspacePath: normalizedPath },
        'User workspace path does not exist, skipping directory creation to avoid empty workspace',
      );
    } else {
      logger.debug({ workspacePath: normalizedPath }, 'Using existing user workspace');
    }

    return normalizedPath;
  }

  async cleanup(workspacePath: string): Promise<void> {
    if (!isTemporaryWorkspace(workspacePath, this.tempBaseDir)) {
      logger.debug({ workspacePath }, 'Skipping cleanup of user workspace');
      return;
    }

    try {
      if (fs.existsSync(workspacePath)) {
        await fs.promises.rm(workspacePath, { recursive: true, force: true });
        logger.info({ workspacePath }, 'Temporary workspace cleaned up');
      }
    } catch (error) {
      logger.error({ error, workspacePath }, 'Failed to cleanup temporary workspace');
    }
  }

  getTempDir(): string {
    return this.tempBaseDir;
  }

  isTemporary(workspacePath: string): boolean {
    return isTemporaryWorkspace(workspacePath, this.tempBaseDir);
  }

  getDisplayName(workspacePath: string): string {
    return getWorkspaceDisplayName(workspacePath);
  }

  normalize(workspacePath: string): string {
    return normalizeWorkspacePath(workspacePath);
  }

  async cleanupAllTempWorkspaces(): Promise<void> {
    const tempDir = this.tempBaseDir;

    if (!fs.existsSync(tempDir)) {
      return;
    }

    try {
      const entries = await fs.promises.readdir(tempDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(tempDir, entry.name);
          await fs.promises.rm(dirPath, { recursive: true, force: true });
        }
      }

      logger.info({ tempDir }, 'All temporary workspaces cleaned up');
    } catch (error) {
      logger.error({ error, tempDir }, 'Failed to cleanup all temporary workspaces');
    }
  }
}

export const workspaceManager = WorkspaceManager.getInstance();
