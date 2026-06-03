import * as fs from 'fs';
import * as path from 'path';
import { isPathInsideWorkspace, resolveWorkspacePath } from '../workspace/utils';

const ALLOWED_FILES = ['index.tsx', 'config.schema.json', 'project.config.schema.json', 'workspace-tree.json', 'AGENTS.md', '.session.json'];

export interface FileValidationResult {
  valid: boolean;
  violations: string[];
}

export function validateFileAccess(
  workingDir: string,
  filePath: string
): FileValidationResult {
  const violations: string[] = [];

  const pathValidation = validatePath(workingDir, filePath);
  if (!pathValidation.valid) {
    violations.push(...pathValidation.violations);
  }

  const relativePath = path.relative(workingDir, filePath);
  const isAllowed = ALLOWED_FILES.some(
    (allowed) => relativePath === allowed || relativePath.endsWith('/' + allowed)
  );

  if (!isAllowed) {
    violations.push(`非法访问：${relativePath}`);
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function validateFileChanges(
  workingDir: string,
  changes: string[]
): FileValidationResult {
  const violations: string[] = [];

  for (const change of changes) {
    const result = validateFileAccess(workingDir, change);
    if (!result.valid) {
      violations.push(...result.violations);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function getChangedFiles(workingDir: string): string[] {
  const changed: string[] = [];

  try {
    const entries = fs.readdirSync(workingDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.session.json') continue;
      if (entry.name === 'opencode.json') continue;
      if (entry.isFile()) {
        changed.push(entry.name);
      }
    }
  } catch {
    return [];
  }

  return changed;
}

export function validatePath(workingDir: string, targetPath: string): FileValidationResult {
  const violations: string[] = [];

  try {
    const resolvedPath = resolveWorkspacePath(workingDir, targetPath);
    
    if (!isPathInsideWorkspace(resolvedPath, workingDir)) {
      violations.push(`路径遍历攻击检测: ${targetPath} 尝试访问工作空间外目录`);
    }

    const realWorkingDir = fs.realpathSync(workingDir);
    let realTargetPath: string;
    
    try {
      realTargetPath = fs.realpathSync(resolvedPath);
    } catch {
      const relativePath = path.relative(workingDir, resolvedPath);
      realTargetPath = path.resolve(realWorkingDir, relativePath);
    }

    if (!isPathInsideWorkspace(realTargetPath, realWorkingDir)) {
      violations.push(`符号链接攻击检测: ${targetPath} 指向工作空间外目录`);
    }
  } catch (error) {
    violations.push(`路径校验失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function validatePaths(workingDir: string, paths: string[]): FileValidationResult {
  const violations: string[] = [];

  for (const targetPath of paths) {
    const result = validatePath(workingDir, targetPath);
    if (!result.valid) {
      violations.push(...result.violations);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function safeResolvePath(workingDir: string, relativePath: string): string {
  const validation = validatePath(workingDir, relativePath);
  
  if (!validation.valid) {
    throw new Error(validation.violations.join('; '));
  }

  return resolveWorkspacePath(workingDir, relativePath);
}
