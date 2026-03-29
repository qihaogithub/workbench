import path from 'path';
import fs from 'fs';
import {
  DemoMeta,
  DemoFiles,
  SessionMeta,
  ErrorCodeType,
  ERROR_MESSAGES,
} from '@opencode-workbench/shared';

const DEMOS_DIR = process.env.DEMOS_DIR || path.join(process.cwd(), '../../demos');
const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(process.cwd(), '../../sessions');
const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;

export function getDemosDir(): string {
  return DEMOS_DIR;
}

export function getSessionsDir(): string {
  return SESSIONS_DIR;
}

export function ensureDirsExist(): void {
  if (!fs.existsSync(DEMOS_DIR)) {
    fs.mkdirSync(DEMOS_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export function getDemoPath(demoId: string): string {
  return path.join(DEMOS_DIR, demoId);
}

export function getSessionPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId);
}

export function demoExists(demoId: string): boolean {
  const demoPath = getDemoPath(demoId);
  return fs.existsSync(demoPath) && fs.statSync(demoPath).isDirectory();
}

export function sessionExists(sessionId: string): boolean {
  const sessionPath = getSessionPath(sessionId);
  return fs.existsSync(sessionPath) && fs.statSync(sessionPath).isDirectory();
}

export function listDemos(): DemoMeta[] {
  ensureDirsExist();
  
  const demos: DemoMeta[] = [];
  const entries = fs.readdirSync(DEMOS_DIR, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const demoPath = path.join(DEMOS_DIR, entry.name);
    const stats = fs.statSync(demoPath);
    
    demos.push({
      id: entry.name,
      name: entry.name,
      createdAt: stats.birthtimeMs,
      updatedAt: stats.mtimeMs,
    });
  }
  
  return demos.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createDemo(name: string): DemoMeta {
  ensureDirsExist();
  
  const demoId = `demo-${Date.now()}`;
  const demoPath = getDemoPath(demoId);
  
  fs.mkdirSync(demoPath, { recursive: true });
  
  const defaultCode = `import React from 'react';

interface DemoProps {
  title: string;
  description: string;
}

export default function Demo({ title, description }: DemoProps) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
`;
  
  const defaultSchema = JSON.stringify({
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Demo 配置",
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "title": "标题",
        "default": "Hello World"
      },
      "description": {
        "type": "string",
        "title": "描述",
        "default": "This is a demo"
      }
    },
    "required": ["title"]
  }, null, 2);
  
  fs.writeFileSync(path.join(demoPath, 'index.tsx'), defaultCode, 'utf-8');
  fs.writeFileSync(path.join(demoPath, 'config.schema.json'), defaultSchema, 'utf-8');
  
  const stats = fs.statSync(demoPath);
  
  return {
    id: demoId,
    name: name || demoId,
    createdAt: stats.birthtimeMs,
    updatedAt: stats.mtimeMs,
  };
}

export function deleteDemo(demoId: string): boolean {
  if (!demoExists(demoId)) {
    return false;
  }
  
  const demoPath = getDemoPath(demoId);
  fs.rmSync(demoPath, { recursive: true, force: true });
  
  return true;
}

export function createSession(demoId: string): SessionMeta {
  ensureDirsExist();
  
  if (!demoExists(demoId)) {
    throw new Error(ERROR_MESSAGES.DEMO_NOT_FOUND);
  }
  
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const sessionPath = getSessionPath(sessionId);
  const demoPath = getDemoPath(demoId);
  
  fs.cpSync(demoPath, sessionPath, { recursive: true });
  
  const now = Date.now();
  const sessionMeta: SessionMeta = {
    sessionId,
    demoId,
    createdAt: now,
    expiresAt: now + SESSION_EXPIRY_MS,
  };
  
  fs.writeFileSync(
    path.join(sessionPath, '.session.json'),
    JSON.stringify(sessionMeta, null, 2),
    'utf-8'
  );
  
  return sessionMeta;
}

export function getSessionMeta(sessionId: string): SessionMeta | null {
  if (!sessionExists(sessionId)) {
    return null;
  }
  
  const metaPath = path.join(getSessionPath(sessionId), '.session.json');
  
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  
  const content = fs.readFileSync(metaPath, 'utf-8');
  return JSON.parse(content) as SessionMeta;
}

export function getSessionFiles(sessionId: string): DemoFiles | null {
  if (!sessionExists(sessionId)) {
    return null;
  }
  
  const sessionPath = getSessionPath(sessionId);
  const codePath = path.join(sessionPath, 'index.tsx');
  const schemaPath = path.join(sessionPath, 'config.schema.json');
  
  if (!fs.existsSync(codePath) || !fs.existsSync(schemaPath)) {
    return null;
  }
  
  return {
    code: fs.readFileSync(codePath, 'utf-8'),
    schema: fs.readFileSync(schemaPath, 'utf-8'),
  };
}

export function updateSessionFiles(sessionId: string, files: DemoFiles): boolean {
  if (!sessionExists(sessionId)) {
    return false;
  }
  
  const sessionPath = getSessionPath(sessionId);
  
  fs.writeFileSync(path.join(sessionPath, 'index.tsx'), files.code, 'utf-8');
  fs.writeFileSync(path.join(sessionPath, 'config.schema.json'), files.schema, 'utf-8');
  
  return true;
}

export function mergeSession(sessionId: string): boolean {
  const sessionMeta = getSessionMeta(sessionId);
  
  if (!sessionMeta) {
    return false;
  }
  
  const { demoId } = sessionMeta;
  
  if (!demoExists(demoId)) {
    return false;
  }
  
  const sessionPath = getSessionPath(sessionId);
  const demoPath = getDemoPath(demoId);
  
  fs.rmSync(demoPath, { recursive: true, force: true });
  fs.cpSync(sessionPath, demoPath, { recursive: true });
  fs.rmSync(path.join(demoPath, '.session.json'), { force: true });
  fs.rmSync(sessionPath, { recursive: true, force: true });
  
  return true;
}

export function deleteSession(sessionId: string): boolean {
  if (!sessionExists(sessionId)) {
    return false;
  }
  
  const sessionPath = getSessionPath(sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });
  
  return true;
}

export function isSessionExpired(sessionMeta: SessionMeta): boolean {
  return Date.now() > sessionMeta.expiresAt;
}

export function createApiError(code: ErrorCodeType, message?: string, details?: unknown) {
  return {
    success: false as const,
    error: {
      code,
      message: message || ERROR_MESSAGES[code],
      details,
    },
  };
}

export function createApiSuccess<T>(data: T) {
  return {
    success: true as const,
    data,
  };
}
