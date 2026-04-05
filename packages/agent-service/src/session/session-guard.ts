import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_FILES = ['index.tsx', 'config.schema.json', 'AGENTS.md', '.session.json'];

export interface FileValidationResult {
  valid: boolean;
  violations: string[];
}

export function validateFileAccess(
  workingDir: string,
  filePath: string
): FileValidationResult {
  const relativePath = path.relative(workingDir, filePath);
  const violations: string[] = [];

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
