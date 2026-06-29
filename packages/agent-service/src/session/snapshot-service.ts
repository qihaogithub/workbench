import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { SnapshotInfo, CompareResult, FileChangeInfo } from '@opencode-workbench/shared/contracts';
import { logger } from '../utils/logger';

const SNAPSHOT_DIR = '.opencode-snapshot';

interface SnapshotData {
  files: Map<string, { content: string; mtime: number }>;
  createdAt: number;
}

export class SnapshotService {
  private snapshots: Map<string, SnapshotData> = new Map();

  async init(workingDir: string): Promise<SnapshotInfo> {
    const isGitRepo = this.isGitRepository(workingDir);

    if (isGitRepo) {
      const branch = this.getCurrentBranch(workingDir);
      const info: SnapshotInfo = {
        mode: 'git-repo',
        branch,
      };
      logger.info({ workingDir, mode: 'git-repo', branch }, 'Snapshot initialized for git repo');
      return info;
    }

    await this.createFileSnapshot(workingDir);
    const info: SnapshotInfo = {
      mode: 'snapshot',
      branch: null,
    };
    logger.info({ workingDir, mode: 'snapshot' }, 'Snapshot initialized for non-git directory');
    return info;
  }

  private isGitRepository(workingDir: string): boolean {
    try {
      execSync('git rev-parse --git-dir', { cwd: workingDir, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private getCurrentBranch(workingDir: string): string | null {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: workingDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return branch || null;
    } catch {
      return null;
    }
  }

  private async createFileSnapshot(workingDir: string): Promise<void> {
    const files = new Map<string, { content: string; mtime: number }>();

    await this.scanDirectory(workingDir, workingDir, files);

    this.snapshots.set(workingDir, {
      files,
      createdAt: Date.now(),
    });
  }

  private async scanDirectory(
    baseDir: string,
    currentDir: string,
    files: Map<string, { content: string; mtime: number }>
  ): Promise<void> {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.session.json') {
        continue;
      }

      if (entry.name === 'node_modules' || entry.name === 'opencode.json') {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(baseDir, fullPath, files);
      } else if (entry.isFile()) {
        const relativePath = path.relative(baseDir, fullPath);
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const stat = await fs.promises.stat(fullPath);
          files.set(relativePath, {
            content,
            mtime: stat.mtimeMs,
          });
        } catch {
          logger.debug({ fullPath }, 'Failed to read file for snapshot');
        }
      }
    }
  }

  async compare(workingDir: string): Promise<CompareResult> {
    const snapshot = this.snapshots.get(workingDir);
    const isGitRepo = this.isGitRepository(workingDir);

    if (isGitRepo) {
      return this.compareWithGit(workingDir);
    }

    if (!snapshot) {
      await this.createFileSnapshot(workingDir);
      return { staged: [], unstaged: [] };
    }

    return this.compareWithSnapshot(workingDir, snapshot);
  }

  private async compareWithGit(workingDir: string): Promise<CompareResult> {
    const staged: FileChangeInfo[] = [];
    const unstaged: FileChangeInfo[] = [];

    try {
      const statusOutput = execSync('git status --porcelain', {
        cwd: workingDir,
        encoding: 'utf-8',
      });

      const lines = statusOutput.split('\n').filter(Boolean);

      for (const line of lines) {
        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const filePath = line.substring(3);

        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged.push({
            path: filePath,
            operation: this.gitStatusToOperation(indexStatus),
            status: 'staged',
          });
        }

        if (workTreeStatus !== ' ' || indexStatus === '?') {
          unstaged.push({
            path: filePath,
            operation: this.gitStatusToOperation(workTreeStatus === ' ' ? indexStatus : workTreeStatus),
            status: 'unstaged',
          });
        }
      }
    } catch (error) {
      logger.error({ error, workingDir }, 'Failed to compare with git');
    }

    return { staged, unstaged };
  }

  private gitStatusToOperation(status: string): 'create' | 'modify' | 'delete' {
    switch (status) {
      case 'A':
      case '?':
        return 'create';
      case 'D':
        return 'delete';
      default:
        return 'modify';
    }
  }

  private async compareWithSnapshot(
    workingDir: string,
    snapshot: SnapshotData
  ): Promise<CompareResult> {
    const unstaged: FileChangeInfo[] = [];
    const currentFiles = new Set<string>();

    const entries = await fs.promises.readdir(workingDir, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.') && entry.name !== '.session.json') continue;
      if (entry.name === 'opencode.json') continue;

      const fullPath = path.join(entry.parentPath || entry.path, entry.name);
      const relativePath = path.relative(workingDir, fullPath);
      currentFiles.add(relativePath);

      const snapshotFile = snapshot.files.get(relativePath);

      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const stat = await fs.promises.stat(fullPath);

        if (!snapshotFile) {
          unstaged.push({
            path: relativePath,
            operation: 'create',
            status: 'unstaged',
          });
        } else if (snapshotFile.content !== content || snapshotFile.mtime !== stat.mtimeMs) {
          unstaged.push({
            path: relativePath,
            operation: 'modify',
            status: 'unstaged',
          });
        }
      } catch {
        logger.debug({ fullPath }, 'Failed to read file for comparison');
      }
    }

    for (const [relativePath] of snapshot.files) {
      if (!currentFiles.has(relativePath)) {
        unstaged.push({
          path: relativePath,
          operation: 'delete',
          status: 'unstaged',
        });
      }
    }

    return { staged: [], unstaged };
  }

  async getBaselineContent(workingDir: string, filePath: string): Promise<string | null> {
    const isGitRepo = this.isGitRepository(workingDir);

    if (isGitRepo) {
      try {
        const content = execSync(`git show HEAD:"${filePath}"`, {
          cwd: workingDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return content;
      } catch {
        return null;
      }
    }

    const snapshot = this.snapshots.get(workingDir);
    if (!snapshot) {
      return null;
    }

    const file = snapshot.files.get(filePath);
    return file?.content || null;
  }

  async stageFile(workingDir: string, filePath: string): Promise<void> {
    const isGitRepo = this.isGitRepository(workingDir);

    if (isGitRepo) {
      try {
        execSync(`git add "${filePath}"`, { cwd: workingDir });
        logger.debug({ workingDir, filePath }, 'File staged with git');
      } catch (error) {
        logger.error({ error, workingDir, filePath }, 'Failed to stage file with git');
        throw error;
      }
    }
  }

  async stageAll(workingDir: string): Promise<void> {
    const isGitRepo = this.isGitRepository(workingDir);

    if (isGitRepo) {
      try {
        execSync('git add -A', { cwd: workingDir });
        logger.debug({ workingDir }, 'All files staged with git');
      } catch (error) {
        logger.error({ error, workingDir }, 'Failed to stage all files with git');
        throw error;
      }
    }
  }

  async unstageFile(workingDir: string, filePath: string): Promise<void> {
    const isGitRepo = this.isGitRepository(workingDir);

    if (isGitRepo) {
      try {
        execSync(`git reset HEAD "${filePath}"`, { cwd: workingDir });
        logger.debug({ workingDir, filePath }, 'File unstaged with git');
      } catch (error) {
        logger.error({ error, workingDir, filePath }, 'Failed to unstage file with git');
        throw error;
      }
    }
  }

  async discardFile(workingDir: string, filePath: string, operation: 'create' | 'modify' | 'delete'): Promise<void> {
    const isGitRepo = this.isGitRepository(workingDir);
    const fullPath = path.join(workingDir, filePath);

    if (isGitRepo) {
      try {
        if (operation === 'create') {
          await fs.promises.rm(fullPath, { force: true });
        } else {
          execSync(`git checkout HEAD -- "${filePath}"`, { cwd: workingDir });
        }
        logger.debug({ workingDir, filePath, operation }, 'File discarded with git');
      } catch (error) {
        logger.error({ error, workingDir, filePath, operation }, 'Failed to discard file with git');
        throw error;
      }
    } else {
      const snapshot = this.snapshots.get(workingDir);
      if (snapshot) {
        if (operation === 'delete' || operation === 'modify') {
          const baseline = snapshot.files.get(filePath);
          if (baseline) {
            await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.promises.writeFile(fullPath, baseline.content, 'utf-8');
          }
        } else if (operation === 'create') {
          await fs.promises.rm(fullPath, { force: true });
        }
        logger.debug({ workingDir, filePath, operation }, 'File discarded from snapshot');
      }
    }
  }

  async resetFile(workingDir: string, filePath: string, operation: 'create' | 'modify' | 'delete'): Promise<void> {
    return this.discardFile(workingDir, filePath, operation);
  }

  clearSnapshot(workingDir: string): void {
    this.snapshots.delete(workingDir);
    logger.debug({ workingDir }, 'Snapshot cleared');
  }
}

export const snapshotService = new SnapshotService();
