import path from 'path';
import fs from 'fs';
import { getDemoPath, getSessionPath, sessionExists } from './fs-utils';

const ALLOWED_FILES = new Set(['index.tsx', 'config.schema.json', 'AGENTS.md']);

export interface FileViolation {
  file: string;
  type: 'illegal_new' | 'illegal_modify' | 'illegal_delete';
}

export function validateFileChanges(sessionId: string, changedFiles: string[]): FileViolation[] {
  if (!sessionExists(sessionId)) {
    return [];
  }

  const violations: FileViolation[] = [];

  for (const filePath of changedFiles) {
    const fileName = path.basename(filePath);

    if (!ALLOWED_FILES.has(fileName)) {
      const sessionPath = getSessionPath(sessionId);
      const fullPath = path.join(sessionPath, filePath);

      if (!fs.existsSync(fullPath)) {
        violations.push({ file: filePath, type: 'illegal_delete' });
      } else {
        violations.push({ file: filePath, type: 'illegal_new' });
      }
    }
  }

  return violations;
}

export function rollbackIllegalChanges(sessionId: string, violations: FileViolation[]): boolean {
  if (violations.length === 0) return true;

  const sessionPath = getSessionPath(sessionId);
  const sessionMetaPath = path.join(sessionPath, '.session.json');
  if (!fs.existsSync(sessionMetaPath)) return false;

  const meta = JSON.parse(fs.readFileSync(sessionMetaPath, 'utf-8'));
  const demoPath = getDemoPath(meta.demoId);

  for (const violation of violations) {
    const fullPath = path.join(sessionPath, violation.file);

    switch (violation.type) {
      case 'illegal_new':
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { force: true });
        }
        break;
      case 'illegal_modify':
      case 'illegal_delete': {
        const sourcePath = path.join(demoPath, violation.file);
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, fullPath);
        }
        break;
      }
    }
  }

  return true;
}

export function getChangedFiles(sessionId: string): string[] {
  if (!sessionExists(sessionId)) return [];

  const sessionPath = getSessionPath(sessionId);
  const sessionMetaPath = path.join(sessionPath, '.session.json');
  if (!fs.existsSync(sessionMetaPath)) return [];

  const meta = JSON.parse(fs.readFileSync(sessionMetaPath, 'utf-8'));
  const demoPath = getDemoPath(meta.demoId);

  const changed: string[] = [];
  const sessionFiles = new Set<string>();
  const demoFiles = new Set<string>();

  try {
    const sessionEntries = fs.readdirSync(sessionPath, { withFileTypes: true });
    for (const entry of sessionEntries) {
      if (entry.name.startsWith('.') || entry.name === 'opencode.json') continue;
      if (entry.isFile()) sessionFiles.add(entry.name);
    }

    const demoEntries = fs.readdirSync(demoPath, { withFileTypes: true });
    for (const entry of demoEntries) {
      if (entry.isFile()) demoFiles.add(entry.name);
    }
  } catch {
    return [];
  }

  for (const file of sessionFiles) {
    const sessionFilePath = path.join(sessionPath, file);
    const demoFilePath = path.join(demoPath, file);

    if (!demoFiles.has(file)) {
      changed.push(file);
    } else {
      try {
        const sessionContent = fs.readFileSync(sessionFilePath, 'utf-8');
        const demoContent = fs.readFileSync(demoFilePath, 'utf-8');
        if (sessionContent !== demoContent) {
          changed.push(file);
        }
      } catch {
        changed.push(file);
      }
    }
  }

  for (const file of demoFiles) {
    if (!sessionFiles.has(file)) {
      changed.push(file);
    }
  }

  return changed;
}
