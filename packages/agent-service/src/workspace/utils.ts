import * as path from 'path';
import * as os from 'os';

const TEMP_WORKSPACE_PREFIX = '-temp-';

export function isTemporaryWorkspace(workspacePath: string, tempBaseDir?: string): boolean {
  const baseDir = tempBaseDir || getSystemTempDir();
  const normalizedPath = path.normalize(workspacePath);
  const normalizedBase = path.normalize(baseDir);
  
  return normalizedPath.startsWith(normalizedBase);
}

export function getWorkspaceDisplayName(workspacePath: string): string {
  const normalizedPath = path.normalize(workspacePath);
  const parts = normalizedPath.split(path.sep);
  
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && part !== '.' && part !== '..') {
      if (part.includes(TEMP_WORKSPACE_PREFIX)) {
        const idx = part.indexOf(TEMP_WORKSPACE_PREFIX);
        return part.substring(0, idx) || part;
      }
      return part;
    }
  }
  
  return workspacePath;
}

export function getLastDirectoryName(dirPath: string): string {
  const normalizedPath = path.normalize(dirPath);
  const parts = normalizedPath.split(path.sep);
  
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && part !== '.' && part !== '..') {
      return part;
    }
  }
  
  return dirPath;
}

export function normalizeWorkspacePath(workspacePath: string): string {
  return path.resolve(workspacePath);
}

export function getSystemTempDir(): string {
  return path.join(os.tmpdir(), 'opencode-workspaces');
}

export function generateTempWorkspaceName(backend: string): string {
  const timestamp = Date.now();
  return `${backend}${TEMP_WORKSPACE_PREFIX}${timestamp}`;
}

export function isPathInsideWorkspace(targetPath: string, workspacePath: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedWorkspace = path.resolve(workspacePath);
  
  const relativePath = path.relative(normalizedWorkspace, normalizedTarget);
  
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

export function resolveWorkspacePath(basePath: string, relativePath: string): string {
  const resolved = path.resolve(basePath, relativePath);
  
  if (!isPathInsideWorkspace(resolved, basePath)) {
    throw new Error(`路径遍历攻击检测: ${relativePath} 尝试访问工作空间外目录`);
  }
  
  return resolved;
}
